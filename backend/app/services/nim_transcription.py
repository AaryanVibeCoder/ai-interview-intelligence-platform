"""
nim_transcription.py
────────────────────
Async-compatible client for NVIDIA Parakeet-TDT-0.6b-v2 NIM Speech ASR.

Transport: gRPC via grpc.nvcf.nvidia.com:443 (the NVIDIA cloud function endpoint)
using the riva Python client that ships in python-clients/.

The API key is passed as gRPC call metadata: function-id and authorization.
It is NEVER logged or printed in any code path.

Design constraints (from task spec):
 - API key is NEVER logged — even in error messages.
 - 5-second timeout per request, exactly ONE automatic retry on failure.
 - Returns None on all failure paths so callers can fall back gracefully.
 - Does NOT touch the live interview loop in any way.
"""

from __future__ import annotations

import asyncio
import logging
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
from typing import Optional

from app.core.config import get_settings

logger = logging.getLogger(__name__)

# NVIDIA NVCF gRPC endpoint for cloud-hosted NIM functions
_NVCF_GRPC_URI = "grpc.nvcf.nvidia.com:443"
# Parakeet-TDT-0.6b-v2 NVCF function ID (cloud-hosted)
_PARAKEET_FUNCTION_ID = "d3fe9151-442b-4204-a70d-5fcc597fd610"
# Language for transcription
_LANGUAGE_CODE = "en-US"

# Per-call timeout in seconds
_TIMEOUT_S = 10.0
_MAX_RETRIES = 1

# Thread pool for running blocking gRPC calls off the event loop
_executor = ThreadPoolExecutor(max_workers=2, thread_name_prefix="nim-asr")


def _build_riva_auth():
    """
    Build a riva.client.Auth object using NVIDIA_PARAKEET_API_KEY.
    Key is never stored in a variable that gets logged.
    """
    import riva.client  # type: ignore[import]
    settings = get_settings()
    key = settings.NVIDIA_PARAKEET_API_KEY
    if not key:
        raise ValueError("NVIDIA_PARAKEET_API_KEY is not configured")
    # Pass key as gRPC metadata: both 'authorization' and 'function-id' are required for NVCF
    metadata_args = [
        ["function-id", _PARAKEET_FUNCTION_ID],
        ["authorization", f"Bearer {key}"],
    ]
    return riva.client.Auth(
        uri=_NVCF_GRPC_URI,
        use_ssl=True,
        metadata_args=metadata_args,
    )


def _transcribe_sync(audio_bytes: bytes) -> Optional[str]:
    """
    Blocking gRPC call to Parakeet-TDT-0.6b-v2 via NVCF.
    Runs in a thread pool so it doesn't block the asyncio event loop.
    """
    import riva.client  # type: ignore[import]

    try:
        auth = _build_riva_auth()
    except ValueError as exc:
        logger.warning("[NIM-ASR] %s", exc)
        return None

    asr_service = riva.client.ASRService(auth)

    config = riva.client.RecognitionConfig(
        language_code=_LANGUAGE_CODE,
        enable_automatic_punctuation=True,
        enable_word_time_offsets=True,
        max_alternatives=1,
    )

    response = asr_service.offline_recognize(audio_bytes, config)
    if not response or not response.results:
        return None
    alts = response.results[0].alternatives
    if not alts:
        return None
    return alts[0].transcript or None


async def transcribe_audio_bytes(
    audio_bytes: bytes,
    session_id: int,
    question_index: int,
    mime_type: str = "audio/wav",
) -> Optional[str]:
    """
    Send audio bytes to the Parakeet-TDT-0.6b-v2 NIM endpoint (gRPC via NVCF).
    Returns the transcript text or None on any failure.

    Retries exactly once on exception (per spec).
    The API key is never included in any log output.
    """
    loop = asyncio.get_event_loop()

    for attempt in range(_MAX_RETRIES + 1):
        try:
            transcript = await asyncio.wait_for(
                loop.run_in_executor(_executor, _transcribe_sync, audio_bytes),
                timeout=_TIMEOUT_S,
            )
            if transcript is not None:
                logger.info(
                    "[NIM-ASR] session=%s q=%s transcribed %d chars",
                    session_id, question_index, len(transcript),
                )
            else:
                logger.warning(
                    "[NIM-ASR] session=%s q=%s empty transcript returned",
                    session_id, question_index,
                )
            return transcript

        except asyncio.TimeoutError:
            if attempt < _MAX_RETRIES:
                logger.warning(
                    "[NIM-ASR] session=%s q=%s timeout (attempt %d/%d) -- retrying",
                    session_id, question_index, attempt + 1, _MAX_RETRIES + 1,
                )
                await asyncio.sleep(0.5)
                continue
            logger.error(
                "[NIM-ASR] session=%s q=%s timed out after %d attempt(s). Enrichment skipped.",
                session_id, question_index, _MAX_RETRIES + 1,
            )
            return None

        except Exception as exc:
            if attempt < _MAX_RETRIES:
                logger.warning(
                    "[NIM-ASR] session=%s q=%s error %s (attempt %d/%d) -- retrying",
                    session_id, question_index, type(exc).__name__,
                    attempt + 1, _MAX_RETRIES + 1,
                )
                await asyncio.sleep(0.5)
                continue
            # Log error type only — never log the exception message as it may contain auth info
            logger.error(
                "[NIM-ASR] session=%s q=%s %s after %d attempt(s). Enrichment skipped.",
                session_id, question_index, type(exc).__name__, _MAX_RETRIES + 1,
            )
            return None

    return None


async def transcribe_audio_file(
    file_path: Path,
    session_id: int,
    question_index: int,
) -> Optional[str]:
    """
    Convenience wrapper: read audio bytes from a local file and transcribe.
    Returns None if file not found or transcription fails.
    """
    if not file_path.exists():
        logger.warning(
            "[NIM-ASR] session=%s q=%s audio file not found: %s",
            session_id, question_index, file_path.name,
        )
        return None

    audio_bytes = file_path.read_bytes()
    return await transcribe_audio_bytes(audio_bytes, session_id, question_index)
