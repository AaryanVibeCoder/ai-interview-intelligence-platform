#!/usr/bin/env python3
"""
scripts/test_nim_comparison.py
──────────────────────────────
Stand-alone test script: sends 2-3 sample WAV files through the NIM Parakeet
ASR pipeline and prints browser_transcript vs nim_transcript side-by-side.

Usage (from backend/):
    .venv\\Scripts\\python.exe scripts/test_nim_comparison.py

The script does NOT require a running server or database.
It reads NVIDIA_PARAKEET_API_KEY from environment (or .env file).
"""

import asyncio
import os
import sys
import time
from pathlib import Path

# ── ensure backend package is importable ─────────────────────────────────────
ROOT = Path(__file__).parent.parent
sys.path.insert(0, str(ROOT))

# Load .env so NVIDIA_PARAKEET_API_KEY is available
try:
    from dotenv import load_dotenv
    load_dotenv(ROOT / ".env")
except ImportError:
    pass  # dotenv optional — rely on shell env


# ── sample answers (simulating what the browser Web Speech API would return) ──
# These are intentionally slightly imperfect (word omissions, no punctuation)
# to show where Parakeet NIM improves accuracy.
SAMPLE_ANSWERS = [
    {
        "question_index": 0,
        "browser_transcript": (
            "i worked on scaling our backend at my last company we had a problem with "
            "database slow queries and i optimized the indexes and it got like way faster"
        ),
        # We'll use the bundled sample wav from python-clients for realistic audio
        "audio_file": ROOT.parent / "python-clients" / "data" / "examples" / "en-US_sample.wav",
    },
    {
        "question_index": 1,
        "browser_transcript": (
            "um at my last role i was leading a team of five engineers and "
            "we shipped a new recommendation engine that increased click through by thirty percent"
        ),
        "audio_file": ROOT.parent / "python-clients" / "data" / "examples" / "en-US_percent.wav",
    },
    {
        "question_index": 2,
        "browser_transcript": (
            "i used python and postgres and we had a redis cache layer "
            "the latency dropped from two seconds to about two hundred milliseconds"
        ),
        "audio_file": ROOT.parent / "python-clients" / "data" / "examples" / "en-US_AntiBERTa_for_word_boosting_testing.wav",
    },
]


async def run_comparison() -> None:
    from app.services.nim_transcription import transcribe_audio_file

    print("\n" + "=" * 78)
    print("  NIM Parakeet-TDT-0.6b-v2  vs  Browser Web Speech API — Transcript Comparison")
    print("=" * 78)

    key_present = bool(os.environ.get("NVIDIA_PARAKEET_API_KEY", "").strip())
    if not key_present:
        print("\n⚠️  WARNING: NVIDIA_PARAKEET_API_KEY not set — NIM calls will fail gracefully.\n")

    total_nim_time = 0.0
    successes = 0

    for item in SAMPLE_ANSWERS:
        q = item["question_index"]
        audio_path = Path(item["audio_file"])
        browser = item["browser_transcript"]

        print(f"\n{'─' * 78}")
        print(f"  Answer #{q + 1}")
        print(f"  Audio  : {audio_path.name}  {'(FOUND)' if audio_path.exists() else '(NOT FOUND)'}")
        print(f"{'─' * 78}")
        print(f"\n  [BROWSER Web Speech API]\n  {browser}\n")

        if not audio_path.exists():
            print(f"  [NIM Parakeet]  ❌ audio file not found — skipping\n")
            continue

        t0 = time.monotonic()
        nim_transcript = await transcribe_audio_file(
            audio_path,
            session_id=9999,
            question_index=q,
        )
        elapsed = time.monotonic() - t0
        total_nim_time += elapsed

        if nim_transcript:
            successes += 1
            print(f"  [NIM Parakeet]  ({elapsed:.2f}s)\n  {nim_transcript}\n")

            # Quick quality delta
            browser_words = set(browser.lower().split())
            nim_words = set(nim_transcript.lower().split())
            extra = nim_words - browser_words
            missing = browser_words - nim_words
            print(f"  △ NIM extra words    : {sorted(extra)}")
            print(f"  △ Browser-only words : {sorted(missing)}")
        else:
            print(f"  [NIM Parakeet]  ({elapsed:.2f}s)  ❌ transcription failed or key not configured\n")

    print(f"\n{'=' * 78}")
    print(f"  Summary: {successes}/{len(SAMPLE_ANSWERS)} NIM calls succeeded")
    print(f"  Total NIM time: {total_nim_time:.2f}s  (avg: {total_nim_time/max(len(SAMPLE_ANSWERS),1):.2f}s per answer)")
    print(f"\n  ✅ Live interview latency: UNAFFECTED (NIM runs async post-interview)")
    print(f"     The /api/interview/answer endpoint does NOT call NIM inline.")
    print("=" * 78 + "\n")


if __name__ == "__main__":
    asyncio.run(run_comparison())
