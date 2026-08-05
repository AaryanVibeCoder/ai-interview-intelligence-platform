#!/usr/bin/env python3
"""
scripts/test_integration_flow.py
────────────────────────────────
Integration test to verify the complete NIM transcription enrichment flow:
1. Audio uploading
2. Enrichment queueing and execution
3. Scoring fallback prefering nim_transcript
"""

import asyncio
import os
import sys
import time
from pathlib import Path

# Ensure backend package is importable
ROOT = Path(__file__).parent.parent
sys.path.insert(0, str(ROOT))

from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from main import app
from app.core.clerk_auth import get_current_user
from app.core.database import SessionLocal
from app.models.user import User
from app.models.resume import Resume
from app.models.interview_profile import InterviewProfile
from app.models.interview_session import InterviewSession

# Load .env
try:
    from dotenv import load_dotenv
    load_dotenv(ROOT / ".env")
except ImportError:
    pass


def setup_mock_db_records(db: Session) -> tuple[User, InterviewProfile, InterviewSession]:
    """Ensure a mock user, profile, and active interview session exist in the DB."""
    mock_clerk_id = "clerk_mock_user_999"
    
    # 1. Find or create mock user
    user = db.query(User).filter(User.clerk_user_id == mock_clerk_id).first()
    if not user:
        user = User(
            clerk_user_id=mock_clerk_id,
            email="mock_user_999@example.com",
            first_name="Mock",
            last_name="User",
        )
        db.add(user)
        db.commit()
        db.refresh(user)

    # 2. Find or create mock resume
    resume = db.query(Resume).filter(Resume.user_id == mock_clerk_id).first()
    if not resume:
        resume = Resume(
            user_id=mock_clerk_id,
            file_name="mock_resume.pdf",
            file_url="/uploads/resumes/mock_resume.pdf",
            file_size=1024,
            status="processed",
            analysis_status="completed",
        )
        db.add(resume)
        db.commit()
        db.refresh(resume)

    # 3. Find or create mock profile
    profile = db.query(InterviewProfile).filter(InterviewProfile.user_id == mock_clerk_id).first()
    if not profile:
        profile = InterviewProfile(
            user_id=mock_clerk_id,
            resume_id=resume.id,
            target_company="Google",
            interview_type="system design",
            experience_level="Senior",
            role="Software Engineer",
            job_type="full time",
        )
        db.add(profile)
        db.commit()
        db.refresh(profile)

    # 4. Create new active interview session
    session = InterviewSession(
        user_id=mock_clerk_id,
        interview_profile_id=profile.id,
        conversation_history=[
            {"role": "assistant", "content": "What is natural language processing?"}
        ],
        status="in_progress",
    )
    db.add(session)
    db.commit()
    db.refresh(session)

    return user, profile, session


def main():
    print("=" * 80)
    print("  ElevateIQ NIM ASR Integration Flow Test")
    print("=" * 80)

    # Check key configuration
    key = os.environ.get("NVIDIA_PARAKEET_API_KEY", "")
    if not key:
        print("❌ Error: NVIDIA_PARAKEET_API_KEY environment variable is not set!")
        sys.exit(1)

    db = SessionLocal()
    try:
        user, profile, session = setup_mock_db_records(db)
        session_id = session.id
        print(f"Created/found Mock User: {user.email}")
        print(f"Created/found Mock Profile ID: {profile.id}")
        print(f"Created Mock Interview Session ID: {session_id}")

        # Override dependencies to bypass Clerk authentication in FastAPI TestClient
        app.dependency_overrides[get_current_user] = lambda: user

        # Use lifespan manager so FastAPI starts the background tasks and database init
        with TestClient(app) as client:
            # ── Step 1: Upload Audio Blob ──
            print("\nStep 1: Uploading audio for question index 0...")
            sample_wav = ROOT.parent / "python-clients" / "data" / "examples" / "en-US_sample.wav"
            if not sample_wav.exists():
                print(f"❌ Error: Sample audio file not found at {sample_wav}")
                sys.exit(1)

            with open(sample_wav, "rb") as f:
                files = {"audio": ("en-US_sample.wav", f, "audio/wav")}
                data = {"session_id": session_id, "question_index": 0}
                resp = client.post("/api/interview/upload-answer-audio", files=files, data=data)

            if resp.status_code != 200:
                print(f"❌ Error during upload: HTTP {resp.status_code} - {resp.text}")
                sys.exit(1)

            print(f"✅ Audio uploaded successfully: {resp.json()}")

            # Refresh session to check audio_store
            db.refresh(session)
            print(f"DB audio_store status: {session.audio_store}")

            # ── Step 2: Trigger Enrichment ──
            print("\nStep 2: Triggering ASR enrichment post-interview...")
            resp = client.post("/api/interview/enrich", json={"session_id": session_id})
            if resp.status_code != 202:
                print(f"❌ Error triggering enrichment: HTTP {resp.status_code} - {resp.text}")
                sys.exit(1)

            print(f"✅ Enrichment trigger accepted: {resp.json()}")

            # ── Step 3: Wait for Background Queue Worker ──
            print("\nStep 3: Waiting for async transcription to complete...")
            max_retries = 20
            completed = False
            for i in range(max_retries):
                db.refresh(session)
                transcripts = session.nim_transcripts or {}
                if "0" in transcripts:
                    if transcripts["0"] is not None:
                        print(f"✅ NIM transcription finished: '{transcripts['0']}'")
                        completed = True
                        break
                    else:
                        print("❌ NIM transcription failed (returned None). Check ASR gRPC errors.")
                        break
                print(f"Polling DB... ({i+1}/{max_retries})")
                time.sleep(1.0)

            if not completed:
                print("❌ Timeout: NIM transcription did not finish in time or failed.")
                sys.exit(1)

            # ── Step 4: Submit Answer and Check Scoring Fallback ──
            print("\nStep 4: Submitting answer to check scoring fallback...")
            # We submit the answer via /api/interview/answer. It should read `nim_transcripts["0"]`
            # and substitute it into the scoring logic.
            resp = client.post(
                "/api/interview/answer",
                json={
                    "session_id": session_id,
                    "user_transcript": "i scale backends and optimized indexing which made it faster"
                }
            )
            if resp.status_code != 200:
                print(f"❌ Error submitting answer: HTTP {resp.status_code} - {resp.text}")
                sys.exit(1)

            print(f"✅ Answer submitted successfully: {resp.json()}")
            
            # Verify DB updated session conversation history
            db.refresh(session)
            history = session.conversation_history
            print(f"DB conversation history updated length: {len(history)}")
            print(f"Feedback score: {session.feedback.get('score')}")

    finally:
        db.close()


if __name__ == "__main__":
    main()
