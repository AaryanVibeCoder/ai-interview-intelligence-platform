"""
app/services/nim_scoring.py
────────────────────────────
Production-grade async scoring service for ElevateIQ interview answers.

Contract:
    result = await score_response(question, answer, session_id="s123", round_number=1)
    # result.status is "ok" or "scoring_unavailable"
    # result.score  is an int 0-10, or None when unavailable
    # never raises

The system prompt mirrors the production rubric in interview.py so eval
results are directly comparable to live-session scores.
"""

import asyncio
import json
import logging
import time
from dataclasses import dataclass, field
from typing import Optional

from openai import AsyncOpenAI, APITimeoutError, RateLimitError, APIStatusError

from app.core.config import get_settings

log = logging.getLogger(__name__)


# ── Return type ────────────────────────────────────────────────────────────────

@dataclass
class ScoringResult:
    score: Optional[int]          # None → unavailable
    question_type: str            # "technical" | "behavioral" | "unknown"
    strengths: list[str]
    gaps: list[str]
    example_rewrites: list[str]
    status: str                   # "ok" | "scoring_unavailable"
    raw_response: Optional[str] = field(default=None, repr=False)

    @property
    def available(self) -> bool:
        return self.status == "ok" and self.score is not None


# Singleton fallback; callers should never mutate this.
_UNAVAILABLE = ScoringResult(
    score=None,
    question_type="unknown",
    strengths=[],
    gaps=[],
    example_rewrites=[],
    status="scoring_unavailable",
)


_TECHNICAL_PROMPT = """You are a JSON-only evaluation API.
You MUST respond with ONLY a single JSON object. DO NOT include any preamble, introduction, markdown code block backticks (like ```json), or thinking. Start directly with '{' and end with '}'.

TECHNICAL ACCURACY RUBRIC:
- 0-1: Blank, gibberish, or offensive.
- 1-2: One-word or no technical content.
- 2-3: Core concept incorrect or fundamentally misunderstood.
- 3-4: Partially correct, notable gaps.
- 4-5: Correct core, shallow — missing edge cases or reasoning.
- 5-6: Correct, reasonably complete, some reasoning.
- 7-8: Correct, well-reasoned, covers trade-offs and edge cases.
- 8-9: Correct, thorough, demonstrates deeper system-level understanding.
- 9-10: Flawless — correct, thorough, anticipates follow-up considerations.

SCORING INTEGRITY:
- Score ONLY technical/conceptual substance.
- Ignore grammar, spelling, fluency, or non-native English awkwardness entirely.

JSON Schema:
{
  "feedback": {
    "score": <integer 0-10>,
    "question_type": "technical",
    "strengths": ["list of strengths"],
    "gaps": ["list of gaps"],
    "example_rewrites": ["example rewrite"]
  }
}"""

_BEHAVIORAL_PROMPT = """You are a JSON-only evaluation API.
You MUST respond with ONLY a single JSON object. DO NOT include any preamble, introduction, markdown code block backticks (like ```json), or thinking. Start directly with '{' and end with '}'.

STAR + METRICS RUBRIC:
- 0-1: Blank, gibberish, or offensive.
- 1-2: One-word answer with no substance. (1-2 word answers must score 1-2, never above 3).
- 2-3: Vague, no specific examples, no metrics.
- 3-4: Basic, minimal detail.
- 4-5: Some structure, lacks depth.
- 5-6: Example + context but no metrics.
- 7-8: STAR structure + concrete metrics.
- 8-9: STAR + metrics + technical depth + quantified impact.
- 9-10: All above + system thinking + business acumen.

SCORING INTEGRITY:
- Score ONLY substance and correctness.
- Ignore grammar, spelling, fluency, or non-native English patterns entirely.

JSON Schema:
{
  "feedback": {
    "score": <integer 0-10>,
    "question_type": "behavioral",
    "strengths": ["list of strengths"],
    "gaps": ["list of gaps"],
    "example_rewrites": ["example rewrite"]
  }
}"""


# ── Internal helpers ───────────────────────────────────────────────────────────

def _build_client(settings) -> tuple[AsyncOpenAI, str]:
    """
    Return (AsyncOpenAI client, clean model id).

    OpenRouter keys carry :free for free-tier routing; NVIDIA NIM keys must not.
    settings.NVIDIA_MODEL_NAME may contain :free — strip it for NVIDIA endpoints.
    """
    api_key = settings.LLM_API_KEY
    if api_key.startswith("sk-or-"):
        base_url = "https://openrouter.ai/api/v1"
        model = settings.NVIDIA_MODEL_NAME          # OpenRouter uses :free suffix
    else:
        base_url = "https://integrate.api.nvidia.com/v1"
        model = settings.NVIDIA_MODEL_NAME.removesuffix(":free")
    return AsyncOpenAI(base_url=base_url, api_key=api_key), model


def _parse(raw: str, *, session_id: str, round_number: int) -> Optional[ScoringResult]:
    """
    Parse and validate the JSON response from the LLM.

    If json.loads fails (e.g. due to token truncation or leading explanation),
    it runs regex extractors to rescue the score and other fields, preventing unnecessary fallbacks.
    """
    import re
    content = raw.strip()
    if content.startswith("```"):
        lines = content.splitlines()
        lines = lines[1:] if lines[0].startswith("```") else lines
        lines = lines[:-1] if lines and lines[-1].strip() == "```" else lines
        content = "\n".join(lines).strip()

    # Try standard JSON parsing
    try:
        obj = json.loads(content)
        fb = obj.get("feedback", {})
        score_val = fb.get("score")
        q_type = fb.get("question_type", "unknown")
        strengths = list(fb.get("strengths", []))
        gaps = list(fb.get("gaps", []))
        example_rewrites = list(fb.get("example_rewrites", []))
        
        score = int(score_val)
        if 0 <= score <= 10:
            return ScoringResult(
                score=score,
                question_type=q_type,
                strengths=strengths,
                gaps=gaps,
                example_rewrites=example_rewrites,
                status="ok",
                raw_response=raw,
            )
    except Exception:
        # JSON parse failed or invalid schema — fall back to regex rescue
        pass

    # Regex rescue for score (crucial!)
    score_match = re.search(r'"score":\s*(\d+)', content, re.IGNORECASE)
    if not score_match:
        score_match = re.search(r'score:\s*(\d+)', content, re.IGNORECASE)
    
    if not score_match:
        # No score could be found anywhere in the text
        log.error(
            "nim_scoring.parse_error session=%s round=%d raw=%r",
            session_id, round_number,
            raw[:400].encode("ascii", "replace").decode("ascii"),
        )
        return None

    try:
        score = int(score_match.group(1))
        if not (0 <= score <= 10):
            raise ValueError()
    except (ValueError, TypeError):
        log.error("nim_scoring.invalid_score_regex session=%s score=%r", session_id, score_match.group(1))
        return None

    # Regex rescue for other fields to prevent blank screens
    q_type_match = re.search(r'"question_type":\s*"([^"]+)"', content, re.IGNORECASE)
    question_type = q_type_match.group(1) if q_type_match else "unknown"

    # Extract strengths list via regex if available
    strengths = []
    strengths_match = re.search(r'"strengths":\s*\[(.*?)\]', content, re.DOTALL | re.IGNORECASE)
    if strengths_match:
        strengths = [s.strip().strip('"').strip("'") for s in strengths_match.group(1).split(",") if s.strip()]

    # Extract gaps list via regex if available
    gaps = []
    gaps_match = re.search(r'"gaps":\s*\[(.*?)\]', content, re.DOTALL | re.IGNORECASE)
    if gaps_match:
        gaps = [g.strip().strip('"').strip("'") for g in gaps_match.group(1).split(",") if g.strip()]

    # Extract example rewrites via regex if available
    example_rewrites = []
    rewrites_match = re.search(r'"example_rewrites":\s*\[(.*?)\]', content, re.DOTALL | re.IGNORECASE)
    if rewrites_match:
        example_rewrites = [r.strip().strip('"').strip("'") for r in rewrites_match.group(1).split(",") if r.strip()]

    log.info(
        "nim_scoring.regex_rescue_success session=%s round=%d score=%d q_type=%s",
        session_id, round_number, score, question_type,
    )

    return ScoringResult(
        score=score,
        question_type=question_type,
        strengths=strengths,
        gaps=gaps,
        example_rewrites=example_rewrites,
        status="ok",
        raw_response=raw,
    )



# ── Public API ─────────────────────────────────────────────────────────────────

async def score_response(
    question: str,
    answer: str,
    *,
    question_type: Optional[str] = None,
    session_id: str = "-",
    round_number: int = 0,
) -> ScoringResult:
    """
    Score a candidate answer using NVIDIA NIM Nemotron.

    Safety contract:
    - Never raises an exception.
    - Retries once after a 2-second backoff on:
      - RateLimitError (HTTP 429)
      - APIStatusError with status_code >= 500 (transient server issues)
    - Returns ScoringResult(status="scoring_unavailable") after exhausting retries
      or on non-retriable errors (timeouts, 4xx other than 429).
    """
    settings = get_settings()
    if not settings.LLM_API_KEY:
        log.warning("nim_scoring.no_api_key session=%s — returning unavailable", session_id)
        return _UNAVAILABLE

    client, model = _build_client(settings)
    user_msg = f"Question: {question}\nCandidate Answer: {answer}"

    # Select prompt based on question type
    if question_type in ("behavioral", "experience"):
        system_prompt = _BEHAVIORAL_PROMPT
    else:
        system_prompt = _TECHNICAL_PROMPT

    for attempt in range(2):
        if attempt:
            log.warning(
                "nim_scoring.retry session=%s round=%d attempt=%d",
                session_id, round_number, attempt + 1,
            )
            await asyncio.sleep(2)

        t0 = time.monotonic()
        log.info(
            "nim_scoring.request model=%s session=%s round=%d attempt=%d",
            model, session_id, round_number, attempt + 1,
        )

        try:
            resp = await client.chat.completions.create(
                model=model,
                messages=[
                    {"role": "system", "content": system_prompt},
                    {"role": "user", "content": f"{user_msg}\n\nRespond with ONLY JSON:"},
                ],
                max_tokens=100,   # Tight limit, cuts generation time/latency significantly
                temperature=0.0,
                timeout=45,
            )
            raw = resp.choices[0].message.content.strip()
            latency_ms = int((time.monotonic() - t0) * 1000)
            log.info(
                "nim_scoring.response latency_ms=%d session=%s round=%d",
                latency_ms, session_id, round_number,
            )

        except APITimeoutError:
            latency_ms = int((time.monotonic() - t0) * 1000)
            log.error(
                "nim_scoring.timeout latency_ms=%dms session=%s round=%d attempt=%d (no retry)",
                latency_ms, session_id, round_number, attempt + 1,
            )
            return _UNAVAILABLE  # Do not retry on timeouts per user request (actual 429/5xx only)

        except RateLimitError:
            latency_ms = int((time.monotonic() - t0) * 1000)
            log.error(
                "nim_scoring.rate_limited (429) latency_ms=%dms session=%s round=%d attempt=%d",
                latency_ms, session_id, round_number, attempt + 1,
            )
            continue  # retry on 429

        except APIStatusError as exc:
            latency_ms = int((time.monotonic() - t0) * 1000)
            if exc.status_code >= 500:
                log.error(
                    "nim_scoring.api_error status=%d latency_ms=%dms session=%s round=%d attempt=%d",
                    exc.status_code, latency_ms, session_id, round_number, attempt + 1,
                )
                continue  # retry on 5xx
            else:
                log.error(
                    "nim_scoring.api_error status=%d latency_ms=%dms session=%s round=%d (no retry)",
                    exc.status_code, latency_ms, session_id, round_number,
                )
                return _UNAVAILABLE  # non-retriable (4xx other than 429)

        except Exception as exc:  # noqa: BLE001 — safety net
            latency_ms = int((time.monotonic() - t0) * 1000)
            log.error(
                "nim_scoring.unexpected_error error=%r latency_ms=%dms session=%s round=%d",
                exc, latency_ms, session_id, round_number,
            )
            return _UNAVAILABLE

        result = _parse(raw, session_id=session_id, round_number=round_number)
        if result is not None:
            return result

        # Parse failed — no retry value in retrying a bad parse
        return _UNAVAILABLE

    return _UNAVAILABLE  # retries exhausted

