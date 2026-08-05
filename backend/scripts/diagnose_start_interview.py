"""
Diagnostic script for "Start Interview" 500 Internal Server Error.

Reproduces the exact code path the /api/interview/start endpoint uses:
  1. Loads the AsyncOpenAI client + model exactly as interview.py does.
  2. Calls the LLM exactly like start_interview() does.
  3. (Optional) Tests a full DB-backed profile query + session insert.

Usage:
    .venv\Scripts\python.exe scripts\diagnose_start_interview.py
"""
import asyncio
import logging
import sys
import traceback
from pathlib import Path

# Ensure the backend root is importable regardless of CWD
BACKEND_ROOT = Path(__file__).resolve().parents[1]
if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))

logging.basicConfig(level=logging.INFO, format="%(asctime)s - %(name)s - %(levelname)s - %(message)s")


async def main() -> int:
    print("=" * 70)
    print("DIAGNOSTIC: reproduce /api/interview/start failure path")
    print("=" * 70)

    # 1) Import exactly what interview.py imports at module load time.
    from app.api.interview import client, _model, _base_url, _api_key
    from app.core.config import get_settings

    settings = get_settings()
    print(f"[config] NVIDIA_MODEL_NAME   = {settings.NVIDIA_MODEL_NAME!r}")
    print(f"[config] LLM_API_KEY set     = {bool(settings.LLM_API_KEY)}")
    print(f"[config] resolved _model     = {_model!r}")
    print(f"[config] resolved _base_url  = {_base_url!r}")
    print(f"[config] key prefix          = {_api_key[:8]!r} len={len(_api_key)}")

    # 2) Call the LLM exactly like start_interview() does.
    system_prompt = (
        "You are an elite technical interviewer at ACME conducting a Senior system design "
        "interview for a full time job Software Engineer position. "
        "Begin the interview by introducing yourself briefly and asking the first question."
    )
    print("\n[llm] calling client.chat.completions.create(model=%r, max_tokens=1000) ..." % _model)
    try:
        response = await client.chat.completions.create(
            model=_model,
            messages=[
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": "Begin the interview."},
            ],
            max_tokens=1000,
        )
        first_question = response.choices[0].message.content.strip()
        print(f"[llm] OK -> first question preview: {first_question[:120]!r}")
    except Exception as exc:
        print(f"[llm] FAILED: {type(exc).__name__}: {exc!r}")
        print("\n--- full traceback ---")
        traceback.print_exc()
        print("--- end traceback ---")
        return 1

    # 3) DB round-trip: verify we can read a profile and write a session.
    print("\n[db] testing profile query + session insert ...")
    try:
        from sqlalchemy.orm import Session
        from app.core.database import SessionLocal
        from app.models.interview_profile import InterviewProfile
        from app.models.interview_session import InterviewSession

        db: Session = SessionLocal()
        try:
            profile = db.query(InterviewProfile).first()
            if profile is None:
                print("[db] WARN: no InterviewProfile rows exist yet — insert test skipped.")
            else:
                print(f"[db] found profile id={profile.id} user={profile.user_id!r} company={profile.target_company!r}")
                s = InterviewSession(
                    user_id=profile.user_id,
                    interview_profile_id=profile.id,
                    conversation_history=[{"role": "assistant", "content": "test"}],
                    status="in_progress",
                )
                db.add(s)
                db.commit()
                print(f"[db] OK inserted test session id={s.id}")
                # clean up test row
                db.delete(s)
                db.commit()
                print("[db] OK removed test session")
        finally:
            db.close()
    except Exception as exc:
        print(f"[db] FAILED: {type(exc).__name__}: {exc!r}")
        traceback.print_exc()
        return 2

    print("\nRESULT: all checks passed — LLM and DB writes work in isolation.")
    return 0


if __name__ == "__main__":
    sys.exit(asyncio.run(main()))

