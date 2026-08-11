"""
nim_enrich.py
─────────────
API endpoints for triggering post-interview NIM ASR enrichment.

POST /api/interview/enrich  — triggers a background enrichment job for a
completed interview session. Returns immediately (202 Accepted); NIM
transcription runs asynchronously and never blocks report generation.

POST /api/interview/upload-answer-audio — accepts a recorded audio blob for
one answer and persists it locally, tagged with session_id + question_index.

The NIM job is triggered when the frontend calls /enrich at end-of-interview
(after all answers are done). The scoring pipeline reads nim_transcripts at
report-generation time and falls back to browser_transcript if absent.
"""

from __future__ import annotations

import logging
import os
from datetime import datetime
from pathlib import Path
from typing import Optional

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile, status, Request
from app.core.rate_limit import limiter
from pydantic import BaseModel
from sqlalchemy.orm import Session
from sqlalchemy.orm.attributes import flag_modified

from app.core.clerk_auth import get_current_user
from app.core.database import get_db
from app.models.interview_session import InterviewSession
from app.services.nim_queue import NIMEnrichmentJob, AnswerAudioItem, enqueue_enrichment_job

logger = logging.getLogger(__name__)

router = APIRouter(tags=["NIM Transcription"])

# Local directory for persisting answer audio blobs (analogous to UPLOAD_DIR for resumes)
_AUDIO_STORE_DIR = Path.home() / ".elevateiq" / "interview_audio"


class EnrichRequest(BaseModel):
    session_id: int


# ---------------------------------------------------------------------------
# POST /api/interview/upload-answer-audio
# ---------------------------------------------------------------------------

@router.post("/api/interview/upload-answer-audio")
@router.post("/interviews/upload-answer-audio")
@limiter.limit("20/minute")
async def upload_answer_audio(
    request: Request,
    session_id: int = Form(...),
    question_index: int = Form(...),
    audio: UploadFile = File(...),
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    """
    Accept a recorded audio blob (WAV/WebM) for a single answer.
    Persists to local storage tagged with session_id + question_index + timestamp.
    Does NOT trigger NIM transcription — that happens via /enrich at end-of-interview.
    """
    session = (
        db.query(InterviewSession)
        .filter(
            InterviewSession.id == session_id,
            InterviewSession.user_id == current_user.clerk_user_id,
        )
        .first()
    )
    if not session:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Session not found")

    _AUDIO_STORE_DIR.mkdir(parents=True, exist_ok=True)

    ts = datetime.utcnow().strftime("%Y%m%dT%H%M%SZ")
    ext = Path(audio.filename or "audio.wav").suffix or ".wav"
    filename = f"session{session_id}_q{question_index}_{ts}{ext}"
    dest = _AUDIO_STORE_DIR / filename

    audio_bytes = await audio.read()
    dest.write_bytes(audio_bytes)

    # Record the file path in audio_store JSON column
    store: dict = dict(session.audio_store or {})
    store[str(question_index)] = str(dest)
    session.audio_store = store
    flag_modified(session, "audio_store")
    db.commit()

    logger.info(
        "[NIM-Audio] session=%s q=%s audio saved (%d bytes)",
        session_id, question_index, len(audio_bytes),
    )
    return {"status": "saved", "question_index": question_index}


# ---------------------------------------------------------------------------
# POST /api/interview/enrich
# ---------------------------------------------------------------------------

@router.post("/api/interview/enrich", status_code=status.HTTP_202_ACCEPTED)
@router.post("/interviews/enrich", status_code=status.HTTP_202_ACCEPTED)
@limiter.limit("20/minute")
async def enrich_interview(
    request: Request,
    payload: EnrichRequest,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    """
    Trigger post-interview NIM ASR enrichment for a completed session.
    Returns 202 Accepted immediately — enrichment runs asynchronously.
    Never blocks report generation or any user-facing action.
    """
    session = (
        db.query(InterviewSession)
        .filter(
            InterviewSession.id == payload.session_id,
            InterviewSession.user_id == current_user.clerk_user_id,
        )
        .first()
    )
    if not session:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Session not found")

    audio_store: dict = dict(session.audio_store or {})
    history: list = list(session.conversation_history or [])

    if not audio_store:
        logger.info(
            "[NIM-Enrich] session=%s no audio stored — NIM enrichment skipped",
            payload.session_id,
        )
        return {"status": "skipped", "reason": "no_audio_stored", "session_id": payload.session_id}

    # Fast-path check: fallback immediately if API key or library is missing
    from app.core.config import get_settings
    settings = get_settings()
    has_key = bool(settings.NVIDIA_PARAKEET_API_KEY)
    try:
        import riva.client # type: ignore[import]
        has_riva = True
    except ImportError:
        has_riva = False

    user_msgs = [m for m in history if m.get("role") == "user"]

    if not has_key or not has_riva:
        logger.warning(
            "[NIM-Enrich] session=%s Riva/Parakeet absent (key_configured=%s, library_installed=%s) "
            "-- falling back to browser transcripts directly",
            payload.session_id, has_key, has_riva,
        )
        nim_transcripts = {}
        for q_idx_str in audio_store.keys():
            q_idx = int(q_idx_str)
            browser_transcript = ""
            if q_idx < len(user_msgs):
                browser_transcript = user_msgs[q_idx].get("content", "")
            nim_transcripts[str(q_idx)] = browser_transcript
        
        session.nim_transcripts = nim_transcripts
        flag_modified(session, "nim_transcripts")
        db.commit()

        return {
            "status": "skipped",
            "reason": "riva_absent_fallback_to_browser",
            "session_id": payload.session_id,
        }


    # Build answer items from stored audio files + conversation history
    # conversation_history alternates assistant/user; user messages are the answers.
    user_msgs = [m for m in history if m.get("role") == "user"]
    answers: list[AnswerAudioItem] = []

    for q_idx_str, file_path_str in audio_store.items():
        q_idx = int(q_idx_str)
        file_path = Path(file_path_str)
        if not file_path.exists():
            logger.warning(
                "[NIM-Enrich] session=%s q=%s audio file missing: %s — skipping",
                payload.session_id, q_idx, file_path.name,
            )
            continue

        audio_bytes = file_path.read_bytes()
        browser_transcript = ""
        if q_idx < len(user_msgs):
            browser_transcript = user_msgs[q_idx].get("content", "")

        ext = file_path.suffix.lower()
        mime_map = {".wav": "audio/wav", ".webm": "audio/webm", ".ogg": "audio/ogg", ".mp3": "audio/mpeg"}
        mime_type = mime_map.get(ext, "audio/wav")

        answers.append(AnswerAudioItem(
            question_index=q_idx,
            audio_bytes=audio_bytes,
            browser_transcript=browser_transcript,
            mime_type=mime_type,
        ))

    if not answers:
        return {"status": "skipped", "reason": "audio_files_not_found", "session_id": payload.session_id}

    job = NIMEnrichmentJob(session_id=payload.session_id, answers=answers)
    await enqueue_enrichment_job(job)

    return {
        "status": "accepted",
        "session_id": payload.session_id,
        "answers_queued": len(answers),
    }


# ---------------------------------------------------------------------------
# GET /api/interview/nim-status/{session_id}
# ---------------------------------------------------------------------------

@router.get("/api/interview/nim-status/{session_id}")
@router.get("/interviews/nim-status/{session_id}")
async def get_nim_status(
    session_id: int,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    """
    Check the NIM enrichment status for a session.
    Returns nim_transcripts if available so the scoring pipeline can use them.
    """
    session = (
        db.query(InterviewSession)
        .filter(
            InterviewSession.id == session_id,
            InterviewSession.user_id == current_user.clerk_user_id,
        )
        .first()
    )
    if not session:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Session not found")

    nim_transcripts = session.nim_transcripts or {}
    return {
        "session_id": session_id,
        "nim_transcripts_available": bool(nim_transcripts),
        "nim_transcripts": nim_transcripts,
    }
