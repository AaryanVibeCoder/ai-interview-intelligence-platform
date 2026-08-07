"""
nim_queue.py
────────────
Lightweight asyncio-based rate-limited queue for batching NIM ASR enrichment
jobs at end-of-interview.

Design:
 - Queue is global (module-level asyncio.Queue) — no external broker needed.
 - A single consumer worker runs in the background and processes jobs one-at-a-time
   (no concurrent NIM calls from the same process) to avoid free-tier rate limits.
 - Each job gets: session_id, list of (question_index, audio_bytes, browser_transcript).
 - After enrichment, nim_transcript columns are written back to the DB.
 - All failures are non-blocking: report generation never waits on this queue.
"""

from __future__ import annotations

import asyncio
import logging
from dataclasses import dataclass, field
from typing import List, Optional, Tuple

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Data structures
# ---------------------------------------------------------------------------

@dataclass
class AnswerAudioItem:
    """One answer's audio data, ready for NIM transcription."""
    question_index: int          # 0-based index of the answer in the session
    audio_bytes: bytes           # Raw WAV/WebM bytes
    browser_transcript: str      # Original Web Speech API transcript (never overwritten)
    mime_type: str = "audio/wav"


@dataclass
class NIMEnrichmentJob:
    """Batch enrichment job for one completed interview session."""
    session_id: int
    answers: List[AnswerAudioItem] = field(default_factory=list)


# ---------------------------------------------------------------------------
# Global queue (single producer, single consumer)
# ---------------------------------------------------------------------------

_job_queue: asyncio.Queue[NIMEnrichmentJob] = asyncio.Queue()

# Small inter-request delay to respect free-tier rate limits
_INTER_REQUEST_DELAY_S = 1.5


async def enqueue_enrichment_job(job: NIMEnrichmentJob) -> None:
    """
    Push a completed session's enrichment job onto the queue.
    Non-blocking: the caller is never delayed by this.
    """
    await _job_queue.put(job)
    logger.info(
        "[NIM-Queue] Enqueued enrichment job for session=%s (%d answers)",
        job.session_id, len(job.answers),
    )


async def _process_job(job: NIMEnrichmentJob) -> List[Tuple[int, Optional[str]]]:
    """
    Process one NIMEnrichmentJob sequentially (one answer at a time).
    Returns list of (question_index, nim_transcript_or_None).
    """
    from app.services.nim_transcription import transcribe_audio_bytes  # local import to avoid circular

    results: List[Tuple[int, Optional[str]]] = []
    riva_failed = False

    for item in job.answers:
        logger.info(
            "[NIM-Queue] session=%s processing answer q=%s (%d bytes)",
            job.session_id, item.question_index, len(item.audio_bytes),
        )
        if riva_failed:
            logger.info(
                "[NIM-Queue] session=%s skipping Riva gRPC call for q=%s due to previous failure — using browser transcript",
                job.session_id, item.question_index,
            )
            results.append((item.question_index, item.browser_transcript))
            continue

        try:
            transcript = await transcribe_audio_bytes(
                item.audio_bytes,
                session_id=job.session_id,
                question_index=item.question_index,
                mime_type=item.mime_type,
            )
        except Exception as exc:
            logger.error(
                "[NIM-Queue] session=%s unexpected error calling transcribe_audio_bytes for q=%s: %s",
                job.session_id, item.question_index, type(exc).__name__,
            )
            transcript = None

        if transcript is None:
            logger.warning(
                "[NIM-Queue] session=%s transcription failed for q=%s — falling back to browser transcript",
                job.session_id, item.question_index,
            )
            riva_failed = True
            results.append((item.question_index, item.browser_transcript))
        else:
            results.append((item.question_index, transcript))

        # Rate-limit: wait before next NIM call to avoid hitting free-tier limits
        if not riva_failed and item != job.answers[-1]:
            await asyncio.sleep(_INTER_REQUEST_DELAY_S)
    return results



async def _write_nim_transcripts_to_db(
    session_id: int,
    results: List[Tuple[int, Optional[str]]],
) -> None:
    """
    Persist nim_transcript results into the interview session's nim_transcripts
    JSON column. Uses a fresh sync DB session in a thread pool executor so we
    don't block the event loop.
    """
    import asyncio
    from functools import partial

    def _sync_write() -> None:
        from app.core.database import SessionLocal  # type: ignore[attr-defined]
        from app.models.interview_session import InterviewSession
        from sqlalchemy.orm.attributes import flag_modified

        db = SessionLocal()
        try:
            session_obj = db.query(InterviewSession).filter(InterviewSession.id == session_id).first()
            if not session_obj:
                logger.warning("[NIM-Queue] session=%s not found in DB, cannot write NIM transcripts", session_id)
                return

            existing: dict = dict(session_obj.nim_transcripts or {})
            for q_idx, transcript in results:
                existing[str(q_idx)] = transcript  # None means failed — still record it
            session_obj.nim_transcripts = existing
            flag_modified(session_obj, "nim_transcripts")
            db.commit()
            logger.info("[NIM-Queue] session=%s NIM transcripts saved to DB", session_id)
        except Exception as exc:
            logger.error("[NIM-Queue] session=%s DB write error: %s", session_id, type(exc).__name__)
            db.rollback()
        finally:
            db.close()

    loop = asyncio.get_event_loop()
    await loop.run_in_executor(None, _sync_write)


async def _queue_worker() -> None:
    """
    Long-running background coroutine that drains the job queue one job at a time.
    Should be started once at application startup via start_queue_worker().
    """
    logger.info("[NIM-Queue] Worker started")
    while True:
        job: NIMEnrichmentJob = await _job_queue.get()
        try:
            results = await _process_job(job)
            await _write_nim_transcripts_to_db(job.session_id, results)
        except Exception as exc:
            logger.error(
                "[NIM-Queue] Unhandled error processing session=%s: %s",
                job.session_id, type(exc).__name__,
            )
        finally:
            _job_queue.task_done()


_worker_task: Optional[asyncio.Task] = None  # type: ignore[type-arg]


def start_queue_worker() -> None:
    """
    Start the singleton background queue worker.
    Call this once from the application lifespan startup handler.
    Safe to call multiple times — only one worker is ever started.
    """
    global _worker_task
    if _worker_task is not None and not _worker_task.done():
        return  # Already running
    _worker_task = asyncio.create_task(_queue_worker())
    logger.info("[NIM-Queue] Background transcription worker created")
