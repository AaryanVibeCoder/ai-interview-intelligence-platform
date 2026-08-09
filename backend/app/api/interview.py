import asyncio

import json

import logging

import time

import random

import random

import random

from fastapi import APIRouter, Depends, HTTPException, Request, status

from app.core.rate_limit import limiter

from openai import AsyncOpenAI, APITimeoutError, RateLimitError, APIStatusError

from sqlalchemy.orm import Session

from app.core.clerk_auth import get_current_user

from app.core.database import get_db, SessionLocal

from app.core.config import get_settings

from app.models.interview_profile import InterviewProfile

from app.models.interview_session import InterviewSession

from app.schemas.interview_profile import InterviewProfileCreate, InterviewProfileResponse

from app.schemas.interview_session import (

    InterviewStartRequest,

    InterviewStartResponse,

    InterviewAnswerRequest,

    InterviewAnswerResponse,

    InterviewSessionStatusResponse,

)

logger = logging.getLogger(__name__)

router = APIRouter(tags=["Interviews"])

settings = get_settings()

# ── NVIDIA / OpenRouter async client ──────────────────────────────────────────

# AsyncOpenAI is required because all endpoints are async def; using the sync

# client would block the event loop on every LLM call.

_api_key = settings.LLM_API_KEY or settings.NVIDIA_API_KEY or "placeholder_key"

_base_url = "https://integrate.api.nvidia.com/v1"

if _api_key.startswith("sk-or-"):

    _base_url = "https://openrouter.ai/api/v1"

client = AsyncOpenAI(

    base_url=_base_url,

    api_key=_api_key,

    # Never let an LLM call block the event loop indefinitely. The 550B NVIDIA

    # NIM model can take a very long time to emit a large response without this

    # bound; a hard timeout keeps the FastAPI worker responsive and prevents the

    # "server went away / Failed to fetch" crash loop on the frontend.

    timeout=60.0,

    max_retries=1,

)

# Clean model name: NVIDIA NIM rejects the :free suffix; keep it for OpenRouter.

_model = (

    settings.NVIDIA_MODEL_NAME

    if _api_key.startswith("sk-or-")

    else settings.NVIDIA_MODEL_NAME.removesuffix(":free")

)

# ── Groq async client ────────────────────────────────────────────────────────
# Dedicated client and model for conversational scoring & follow-ups.
groq_client = AsyncOpenAI(
    base_url="https://api.groq.com/openai/v1",
    api_key=settings.GROQ_API_KEY or "placeholder_key",
    timeout=45.0,
    max_retries=1,
)
_GROQ_MODEL = "openai/gpt-oss-20b"


# ── 3-tier LLM helper: Groq → OpenRouter → raise (caller uses static fallback) ─
async def _tiered_chat(
    *,
    messages,
    max_tokens,
    temperature=0.7,
    timeout_s=45.0,
    call_site="unknown",
):
    """
    Try Groq first. On 429 (rate limit), timeout, or 400 (json_validate_failed),
    retry once against OpenRouter. All other errors re-raise immediately so the
    caller's existing try/except catches them with static fallbacks.

    Returns (response, tier) where tier is "groq" or "openrouter".
    """
    import time as _time

    # ── Tier 1: Groq ──────────────────────────────────────────────────────────
    _t0 = _time.monotonic()
    try:
        resp = await groq_client.chat.completions.create(
            model=_GROQ_MODEL,
            messages=messages,
            max_tokens=max_tokens,
            temperature=temperature,
            timeout=timeout_s,
        )
        content = resp.choices[0].message.content
        if content and content.strip():
            _lat = int((_time.monotonic() - _t0) * 1000)
            logger.info(
                "[Tiered-LLM] call_site=%s tier=groq latency_ms=%d", call_site, _lat,
            )
            return resp, "groq"
        else:
            logger.warning(
                "[Tiered-LLM] call_site=%s tier=groq returned empty content. Falling back to OpenRouter.",
                call_site,
            )
            # fall through to Tier 2
    except (RateLimitError, APITimeoutError, APIStatusError) as exc:
        _lat = int((_time.monotonic() - _t0) * 1000)
        logger.warning(
            "[Tiered-LLM] call_site=%s tier=groq FALLBACK reason=%s latency_ms=%d",
            call_site, type(exc).__name__, _lat,
        )
        # fall through to Tier 2

    # ── Tier 2: OpenRouter ────────────────────────────────────────────────────
    _t0 = _time.monotonic()
    try:
        resp = await client.chat.completions.create(
            model=_model,
            messages=messages,
            max_tokens=max_tokens,
            temperature=temperature,
            timeout=timeout_s,
        )
        _lat = int((_time.monotonic() - _t0) * 1000)
        logger.info(
            "[Tiered-LLM] call_site=%s tier=openrouter latency_ms=%d", call_site, _lat,
        )
        return resp, "openrouter"
    except Exception:
        _lat = int((_time.monotonic() - _t0) * 1000)
        logger.error(
            "[Tiered-LLM] call_site=%s tier=openrouter FAILED latency_ms=%d",
            call_site, _lat,
        )
        raise  # caller's static fallback catches this

# Fallback feedback returned when the scoring LLM is unavailable.

# Never raises — candidate's session continues uninterrupted.

_SCORING_UNAVAILABLE_FEEDBACK = {

    "strengths": [],

    "gaps": [],

    "score": None,

    "status": "scoring_unavailable",

    "message": "Scoring is temporarily unavailable. Your answer has been recorded.",

    "example_rewrites": [],

    "potential_score": None,

    "growth_path": None,

    "streak_message": None,

    "scores": [],

}

FALLBACK_QUESTIONS_SETS = [
    [
        "Thanks for sharing. Could you expand on the main bottleneck or technical challenge you faced in this project, and how you resolved it?",
        "Understood. What specific metrics, user feedback, or business impact did you measure to verify the success of your solution?",
        "Got it. If you had to start this project again from scratch, what architectural choices or design trade-offs would you make differently?",
        "Thank you. Let's wrap up this conversational round: what key engineering lessons or leadership takeaways did you learn from this experience?"
    ],
    [
        "Interesting. Let's drill into the architecture: how did you handle data consistency, caching, or state management under high load in this system?",
        "I see. How did you design for reliability, fault tolerance, or disaster recovery when components failed?",
        "Makes sense. How did you monitor, log, or profile latency issues when debugging performance bottlenecks in production?",
        "Excellent. To conclude: how did you coordinate this project with other engineering teams or balance feature shipping speed against technical debt?"
    ],
    [
        "Thanks. Could you walk me through the specific tools, libraries, or programming paradigms you chose for this, and why they were the best fit?",
        "Clear. How did you verify correctness and test this system for scale? Walk me through your integration or load testing strategy.",
        "Got it. How did you optimize resource usage, memory footprint, or CPU compute bounds to keep operational costs low?",
        "Great. For our final question: how did you handle team alignment, code reviews, or knowledge sharing to maintain high code quality?"
    ],
    [
        "Thank you. Can you tell me how you prioritised features, handled changing requirements, or managed tight deadlines?",
        "Understood. How did you resolve technical disagreements within the team when choosing between competing architectural approaches?",
        "Makes sense. How did you ensure security, access controls, or data privacy compliance in this deployment?",
        "Excellent. Finally: what was the most rewarding technical accomplishment of this work, and how did it influence your career growth?"
    ]
]

_SCORING_UNAVAILABLE_NEXT_QUESTION = (

    "Thank you for your answer. Let's continue — "

    "could you walk me through another relevant experience or technical area you'd like to highlight?"

)

# Static opening questions shown IMMEDIATELY when a session is created, so the

# start endpoint never blocks on LLM inference. A background task then tries to

# swap in a personalized opener; on any failure these remain (session still works).

FALLBACK_OPENERS = {

    "coding": (

        "Hi, I'm Eleanor, your interviewer today. Let's start with a short coding "

        "warm-up: could you walk me through how you'd design a rate limiter for a "

        "public API? Consider the trade-offs between token bucket and leaky bucket."

    ),

    "system design": (

        "Hi, I'm Eleanor, your interviewer today. Let's begin with system design: "

        "how would you architect a real-time chat application that scales to "

        "millions of concurrent users? Walk me through the components, data model, "

        "and your reliability trade-offs."

    ),

    "behavioral": (

        "Hi, I'm Eleanor, your interviewer today. To start us off, tell me about a "

        "time you delivered a challenging project. Walk me through the situation, "

        "the actions you took, and the measurable impact it had."

    ),

    "default": (

        "Hi, I'm Eleanor, your interviewer today. Let's get started — could you "

        "introduce yourself and tell me about the most interesting technical "

        "problem you've worked on recently?"

    ),

}

# Fast model used ONLY for the background opening-question enrichment. The 550B

# configured model is far too slow for the start path; the fast model typically

# answers in <8s, so the personalized opener arrives shortly after the session

# returns. All subsequent rounds/scoring keep the configured model.

_FAST_MODEL = "inclusionai/ling-3.0-flash:free" if _api_key.startswith("sk-or-") else _model

def _pick_fallback_opener(interview_type: str | None) -> str:

    """Choose the most relevant static opener for an interview type."""

    if not interview_type:

        return FALLBACK_OPENERS["default"]

    itype = interview_type.lower().strip()

    for key in ("coding", "system design", "behavioral"):

        if key in itype:

            return FALLBACK_OPENERS[key]

    return FALLBACK_OPENERS["default"]

@router.get("/interviews/setup", response_model=InterviewProfileResponse)

@router.get("/api/interview/setup", response_model=InterviewProfileResponse)

async def get_interview_setup(

    db: Session = Depends(get_db),

    current_user=Depends(get_current_user),

):

    profile = (

        db.query(InterviewProfile)

        .filter(InterviewProfile.user_id == current_user.clerk_user_id)

        .first()

    )

    if not profile:

        raise HTTPException(

            status_code=status.HTTP_404_NOT_FOUND,

            detail="Interview profile not set up yet",

        )

    return profile

@router.post("/interviews/setup", response_model=InterviewProfileResponse)

@router.post("/api/interview/setup", response_model=InterviewProfileResponse)

async def upsert_interview_setup(

    payload: InterviewProfileCreate,

    db: Session = Depends(get_db),

    current_user=Depends(get_current_user),

):

    profile = (

        db.query(InterviewProfile)

        .filter(InterviewProfile.user_id == current_user.clerk_user_id)

        .first()

    )

    if profile:

        profile.resume_id = payload.resume_id

        profile.target_company = payload.target_company

        profile.interview_type = payload.interview_type

        profile.experience_level = payload.experience_level

        profile.role = payload.role

        profile.job_type = payload.job_type

    else:

        profile = InterviewProfile(

            user_id=current_user.clerk_user_id,

            resume_id=payload.resume_id,

            target_company=payload.target_company,

            interview_type=payload.interview_type,

            experience_level=payload.experience_level,

            role=payload.role,

            job_type=payload.job_type,

        )

        db.add(profile)

    db.commit()

    db.refresh(profile)

    return profile

async def _generate_opener_in_background(

    session_id: int,

    *,

    target_company: str,

    interview_type: str,

    experience_level: str,

    role: str | None,

    job_type: str | None,

) -> None:

    """

    Bounded background task: generate a personalized opening question and swap

    it into the session row. NEVER raises out of this function — any failure

    (timeout, rate limit, missing key, DB error) keeps the static fallback

    opener so the candidate can begin immediately.

    Uses a fast 70B model with a short timeout instead of the slow configured

    model so the swap typically happens within a few seconds of session start.

    """

    session_db = SessionLocal()

    try:

        # Skip if the fast model isn't usable (e.g. no API key configured).

        if not settings.GROQ_API_KEY:

            logger.info(

                "[START-BG] session=%s no Groq API key — keeping fallback opener",

                session_id,

            )

            return

        system_prompt = f"""You are an elite technical interviewer at {target_company} conducting a {experience_level} {interview_type} interview for a {job_type or "full time job"} {role or "Software Engineer"} position.

Your job is to conduct a realistic, high-quality interview by asking exactly one question at a time.

Do not ask multiple questions at once. Keep the tone professional, encouraging yet rigorous.

Begin the interview by introducing yourself briefly as the {target_company} interviewer and asking the first question appropriate for a {experience_level} candidate applying for a {job_type or "full time job"} {role or "Software Engineer"} position in a {interview_type} loop."""

        # Hard bounded wait. The per-request SDK `timeout` is only a safety

        # ceiling; `asyncio.wait_for(..., timeout=8.0)` is the real guarantee

        # that this background task NEVER hangs the event loop beyond 8s,

        # regardless of what the SDK / HTTP layer does with timeouts.

        response, tier = await asyncio.wait_for(

            _tiered_chat(

                messages=[

                    {"role": "system", "content": system_prompt},

                    {"role": "user", "content": "Begin the interview."},

                ],

                max_tokens=150,

                temperature=0.7,

                timeout_s=8.0,

                call_site="opener",

            ),

            timeout=8.0,

        )

        opener = (response.choices[0].message.content or "").strip()

        if not opener:

            logger.warning("[START-BG] session=%s empty opener from fast model", session_id)

            return

        session_obj = (

            session_db.query(InterviewSession)

            .filter(InterviewSession.id == session_id)

            .first()

        )

        if not session_obj:

            logger.warning("[START-BG] session=%s not found, cannot swap opener", session_id)

            return

        # Only swap if there are no user answers yet (candidate hasn't started).

        history = list(session_obj.conversation_history or [])

        has_user_answers = any(m.get("role") == "user" for m in history)

        if has_user_answers:

            logger.info(

                "[START-BG] session=%s candidate already answered — keeping opener",

                session_id,

            )

            return

        history = [

            {"role": "assistant", "content": opener}

            if m.get("role") == "assistant" and i == 0

            else m

            for i, m in enumerate(history)

        ]

        session_obj.conversation_history = history

        session_obj.question_source = tier  # "groq" or "openrouter"

        session_db.commit()

        logger.info("[START-BG] session=%s opener swapped (question_source=%s)", session_id, tier)

    except Exception as exc:  # noqa: BLE001 — background task must never crash

        logger.warning(

            "[START-BG] session=%s could not personalize opener: %s: %s",

            session_id,

            type(exc).__name__,

            exc,

        )

    finally:

        session_db.close()

@router.post("/interviews/start", response_model=InterviewStartResponse)

@router.post("/api/interview/start", response_model=InterviewStartResponse)

async def start_interview(

    payload: InterviewStartRequest,

    db: Session = Depends(get_db),

    current_user=Depends(get_current_user),

):

    try:

        # 1) Resolve profile, preferring the caller's profile id but falling back

        #    to inline config (or the user's most recent profile for direct starts

        #    such as the behavioral page).

        profile = None

        if payload.interview_profile_id is not None:

            profile = (

                db.query(InterviewProfile)

                .filter(

                    InterviewProfile.id == payload.interview_profile_id,

                    InterviewProfile.user_id == current_user.clerk_user_id,

                )

                .first()

            )

            if not profile:

                raise HTTPException(

                    status_code=status.HTTP_404_NOT_FOUND,

                    detail="Interview profile not found for this account",

                )

        if profile is None:

            # No explicit profile — fall back to the user's most recent profile.

            profile = (

                db.query(InterviewProfile)

                .filter(InterviewProfile.user_id == current_user.clerk_user_id)

                .order_by(InterviewProfile.id.desc())

                .first()

            )

        # Inline config (from the request or resolved profile).

        target_company = payload.target_company or (

            profile.target_company if profile else "Google"

        )

        interview_type = payload.interview_type or (

            profile.interview_type if profile else "behavioral"

        )

        experience_level = payload.experience_level or (

            profile.experience_level if profile else "Mid-level"

        )

        role = payload.role or (profile.role if profile else "Software Engineer")

        job_type = payload.job_type or (profile.job_type if profile else "full time job")

        # 2) CREATE the session row FIRST — a fast DB-only write. No LLM here.

        fallback_opener = _pick_fallback_opener(interview_type)

        session = InterviewSession(

            user_id=current_user.clerk_user_id,

            interview_profile_id=profile.id if profile else None,

            conversation_history=[

                {"role": "assistant", "content": fallback_opener}

            ],

            status="in_progress",

            question_source="fallback",

            feedback={"fallback_set_index": random.randint(0, 3)},

        )

        db.add(session)

        db.commit()

        db.refresh(session)

        # If it is a coding interview, set up fallback challenges instantly and generate custom ones in background
        if "coding" in interview_type.lower().strip():
            from sqlalchemy.orm.attributes import flag_modified
            from app.api.coding import FALLBACK_CODING_CHALLENGES, _generate_coding_challenges_in_background
            session.feedback = {
                "coding_challenges": FALLBACK_CODING_CHALLENGES,
                "current_challenge_index": 0,
                "question_source": "fallback"
            }
            session.question_source = "fallback"
            flag_modified(session, "feedback")
            db.commit()
            
            # Spawn background task for generating customized coding challenges
            asyncio.create_task(
                _generate_coding_challenges_in_background(
                    session.id,
                    target_company,
                    role,
                    experience_level
                )
            )

        # 3) Fire-and-forget personalized opener generation. Bounded and isolated:

        #    failures never crash the request or the process.

        if "coding" not in interview_type.lower().strip():

            asyncio.create_task(

                _generate_opener_in_background(

                    session.id,

                    target_company=target_company,

                    interview_type=interview_type,

                    experience_level=experience_level,

                    role=role,

                    job_type=job_type,

                )

            )

        # 4) Return immediately — the session is usable with the fallback opener.

        return InterviewStartResponse(

            session_id=session.id,

            question=fallback_opener,

            question_source="fallback",

            interview_config={

                "target_company": target_company,

                "interview_type": interview_type,

                "experience_level": experience_level,

                "role": role,

                "job_type": job_type,

            },

        )

    except HTTPException:

        raise

    except Exception as exc:  # noqa: BLE001 — structured 500, never a crash dump

        logger.exception("[START] unexpected failure creating session")

        raise HTTPException(

            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,

            detail=f"Failed to create interview session: {type(exc).__name__}: {exc}",

        )

@router.get("/interviews/session/{session_id}", response_model=InterviewSessionStatusResponse)

@router.get("/api/interview/session/{session_id}", response_model=InterviewSessionStatusResponse)

async def get_session_status(

    session_id: int,

    db: Session = Depends(get_db),

    current_user=Depends(get_current_user),

):

    """

    Lightweight status poll for a session. Used by the frontend to detect when

    the background task swapped the fallback opener for a personalized one

    (question_source "fallback" -> "llm").

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

        raise HTTPException(

            status_code=status.HTTP_404_NOT_FOUND,

            detail="Interview session not found",

        )

    history = list(session.conversation_history or [])

    first_question = ""

    for m in history:

        if m.get("role") == "assistant":

            first_question = m.get("content") or ""

            break

    profile = None

    if session.interview_profile_id is not None:

        profile = (

            db.query(InterviewProfile)

            .filter(InterviewProfile.id == session.interview_profile_id)

            .first()

        )

    return InterviewSessionStatusResponse(

        session_id=session.id,

        status=session.status or "in_progress",

        question_source=session.question_source or "fallback",

        question=first_question,

        interview_config={

            "target_company": profile.target_company if profile else "Google",

            "interview_type": profile.interview_type if profile else "behavioral",

            "experience_level": profile.experience_level if profile else "Mid-level",

            "role": profile.role if profile else "Software Engineer",

            "job_type": profile.job_type if profile else "full time job",

        },

    )

@router.post("/interviews/answer", response_model=InterviewAnswerResponse)

@router.post("/api/interview/answer", response_model=InterviewAnswerResponse)

async def answer_question(

    payload: InterviewAnswerRequest,

    db: Session = Depends(get_db),

    current_user=Depends(get_current_user),

):

    session = (

        db.query(InterviewSession)

        .filter(

            InterviewSession.id == payload.session_id,

            InterviewSession.user_id == current_user.clerk_user_id

        )

        .first()

    )

    if not session:

        raise HTTPException(

            status_code=status.HTTP_404_NOT_FOUND,

            detail="Interview session not found",

        )

    # Get profile details

    profile = db.query(InterviewProfile).filter(InterviewProfile.id == session.interview_profile_id).first()

    if not profile:

        raise HTTPException(

            status_code=status.HTTP_404_NOT_FOUND,

            detail="Associated interview profile not found",

        )

    # Append user's browser transcript to conversation history (source of truth - never overwritten)

    history = list(session.conversation_history)

    history.append({"role": "user", "content": payload.user_transcript})

    # --- NIM transcript fallback for scoring ---

    # Determine the 0-based index of this answer in the session.

    _answer_index = sum(1 for m in history if m["role"] == "user") - 1

    _nim_transcripts = dict(session.nim_transcripts or {})

    _nim_text = _nim_transcripts.get(str(_answer_index))

    # Use NIM transcript for scoring if present and non-empty.

    # If NIM has not finished or failed, fall back to browser_transcript immediately.

    # This fallback is non-blocking - no waiting for NIM ever happens here.

    effective_transcript = (

        _nim_text.strip()

        if (_nim_text and _nim_text.strip())

        else payload.user_transcript

    )

    if _nim_text:

        logger.info(

            "[NIM-Scoring] session=%s q=%s using NIM transcript (%d chars)",

            payload.session_id, _answer_index, len(_nim_text),

        )

    # --- end NIM fallback ---

    # Prepend dummy user message if history starts with assistant (required by Claude API messages)

    claude_messages = []

    if history and history[0]["role"] == "assistant":

        claude_messages.append({"role": "user", "content": "I am ready to start the interview."})

    claude_messages.extend(history)

    # If NIM has an enriched transcript for this answer, substitute it into the last user

    # message in claude_messages so the scoring LLM uses higher-accuracy text.

    # conversation_history (browser_transcript) is never modified here.

    if _nim_text and _nim_text.strip():

        for _ci in range(len(claude_messages) - 1, -1, -1):

            if claude_messages[_ci]["role"] == "user":

                claude_messages[_ci] = {"role": "user", "content": effective_transcript}

                break

    # Check round count (maximum 5 user responses before completing)

    user_message_count = sum(1 for m in history if m["role"] == "user")

    is_last_round = user_message_count >= 5

    # System evaluation prompt

    system_prompt = f"""You are an elite technical interviewer at {profile.target_company} conducting a {profile.experience_level} {profile.interview_type} interview for a {profile.job_type or "full time job"} {profile.role or "Software Engineer"} position.

You are evaluating the candidate's responses and generating the next question.

CRITICAL REQUIREMENT FOR 'next_question':

- You MUST generate a conversational and direct follow-up question based on the candidate's latest response.

- Do NOT jump to an unrelated topic or ask a generic question.

- Dig deeper into their previous answer: ask them to elaborate on specific technologies they mentioned, architectural details, trade-offs, how they handled a specific bottleneck or conflict, or the metrics/outcomes of their actions.

- The interview should feel like an active, organic dialogue where each question builds on their previous response, mimicking a real-life technical or behavioral loop.

SCORING INTEGRITY — READ BEFORE SCORING:

- Score ONLY the technical/conceptual substance and correctness of the answer.

- You MUST ignore grammar, spelling, sentence fluency, phrasing awkwardness, or non-native English patterns entirely. A technically correct answer written with imperfect grammar must score identically to the same content written with perfect grammar. Do not let phrasing quality lower a score under any circumstance.

- Do NOT infer "vagueness" or "lack of depth" from awkward wording alone — evaluate the underlying facts/concepts stated, not how smoothly they're expressed.

QUESTION TYPE — determine this first, before scoring:

- BEHAVIORAL/EXPERIENCE question (e.g. "tell me about a time...", "describe a project where...", "how did you handle a conflict..."): use the STAR + Metrics Rubric below.

- TECHNICAL/CONCEPTUAL question (e.g. "explain how X works", "what's the difference between A and B", "how would you design/solve Y"): use the Technical Accuracy Rubric below. Do NOT require storytelling, personal impact metrics, or STAR structure for these — a direct, accurate, well-reasoned explanation is a complete and excellent answer on its own.

STAR + METRICS RUBRIC (for behavioral/experience questions only):

- 0-1: Completely blank, gibberish, or offensive.

- 1-2: One-word answers ("yes", "no", "cool", "lets go") with no substance. (PRO RULE: 1-2 word answers must score 1-2, never above 3).

- 2-3: Vague answer, no specific examples, no metrics ("I worked on stuff").

- 3-4: Basic answer with minimal detail ("I used Python and fixed a bug").

- 4-5: Decent answer with some structure but lacks depth ("I used Python to fix a bug in the login system").

- 5-6: Good answer with example + context but missing metrics ("I used Python to optimize our database query which improved performance").

- 7-8: Strong answer with STAR structure + metrics ("I led Python refactor reducing query time from 2s to 200ms, impacting 50k users daily").

- 8-9: Excellent - STAR + metrics + technical depth + impact ("Led async Python refactor... reduced latency 90%, improved user retention 3%").

- 9-10: Elite - All of above + shows system thinking + business acumen + clear communication.

TECHNICAL ACCURACY RUBRIC (for technical/conceptual questions only):

- 0-1: Completely blank, gibberish, or offensive.

- 1-2: One-word or non-answer with no technical content.

- 2-3: Attempts an answer but the core concept is incorrect or fundamentally misunderstood.

- 3-4: Partially correct — gets the basic idea but with notable gaps or inaccuracies.

- 4-5: Correct core concept, but shallow — lacks reasoning for why, or misses relevant edge cases.

- 5-6: Correct and reasonably complete explanation, some reasoning shown.

- 7-8: Correct, well-reasoned, covers relevant trade-offs or edge cases without prompting.

- 8-9: Correct, thorough, demonstrates deeper system-level or first-principles understanding.

- 9-10: Elite — correct, thorough, anticipates follow-up considerations, and communicates it with precision.

For the first 5 responses of the interview, make sure to anchor expectations high and enforce whichever rubric applies strictly.

You MUST respond with exactly a JSON object matching this schema:

{{

  "feedback": {{

    "question_type": "behavioral" or "technical", // which rubric you applied

    "strengths": ["list of strengths in their response"],

    "gaps": ["list of gaps or areas of improvement in their response"],

    "score": 6, // integer raw score 0-10 based strictly on the applicable rubric above

    "example_rewrites": ["1-2 examples of how the candidate could rewrite their response to reach a higher score"]

  }},

  "next_question": "the next interview question to ask"

}}

Return ONLY the JSON object. Do not include any explanation or backticks.

Ensure the JSON is valid."""

    if is_last_round:

        system_prompt += "\n\nThis is the final round. Do NOT ask any more questions. Set 'next_question' to a summary feedback closing statement thanking the candidate."

        session.status = "completed"

    # ── LLM scoring call — retry once on timeout/429, never break session ────

    chat_messages = [{"role": "system", "content": system_prompt}] + claude_messages

    feedback = _SCORING_UNAVAILABLE_FEEDBACK.copy()

    # Pre-calculate sequential fallback question from session fallback set
    fb_dict = dict(session.feedback or {})
    fb_idx = fb_dict.get("fallback_set_index")
    if fb_idx is None:
        fb_idx = random.randint(0, 3)
        fb_dict["fallback_set_index"] = fb_idx
        session.feedback = fb_dict
        from sqlalchemy.orm.attributes import flag_modified
        flag_modified(session, "feedback")
        db.commit()
        db.refresh(session)
    
    set_questions = FALLBACK_QUESTIONS_SETS[fb_idx % len(FALLBACK_QUESTIONS_SETS)]
    if _answer_index < len(set_questions):
        next_question = set_questions[_answer_index]
    else:
        next_question = "Thank you for completing this behavioral round. We will now direct you to the evaluation summary." 

    fallback_next_question = next_question

    # Extract all previous assistant questions to prevent duplicates
    previous_questions = [
        m["content"] for m in history
        if m["role"] == "assistant"
    ]

    import difflib

    def is_similar_question(q1: str, q2: str) -> bool:
        def clean(q):
            q = q.lower().strip()
            # Remove common conversational greetings and punctuation
            for prefix in [
                "hi, i'm eleanor, your interviewer today.",
                "hi, i'm eleanor,",
                "hi,",
                "eleanor,",
                "thanks for sharing.",
                "thank you for sharing.",
                "understood.",
                "got it.",
                "thank you.",
                "makes sense.",
                "excellent.",
                "interesting."
            ]:
                if q.startswith(prefix):
                    q = q[len(prefix):].strip()
            return "".join(c for c in q if c.isalnum() or c.isspace())

        c1 = clean(q1)
        c2 = clean(q2)
        if not c1 or not c2:
            return False
        # Direct containment
        if c1 in c2 or c2 in c1:
            return True
        # Sequence similarity ratio
        return difflib.SequenceMatcher(None, c1, c2).ratio() > 0.75

    for _attempt in range(2):

        if _attempt:

            logger.warning(

                "[NIM-Score] retry session=%s round=%d attempt=%d",

                payload.session_id, user_message_count, _attempt + 1,

            )

            await asyncio.sleep(2)

        _t0 = time.monotonic()

        logger.info(

            "[NIM-Score] request session=%s round=%d attempt=%d",

            payload.session_id, user_message_count, _attempt + 1,

        )

        try:

            response, tier = await _tiered_chat(

                messages=chat_messages,

                max_tokens=1000,

                timeout_s=45.0,

                call_site="scoring",

            )

            _latency_ms = int((time.monotonic() - _t0) * 1000)

            logger.info(

                "[NIM-Score] response tier=%s latency_ms=%d session=%s round=%d",

                tier, _latency_ms, payload.session_id, user_message_count,

            )

        except APIStatusError as exc:

            _latency_ms = int((time.monotonic() - _t0) * 1000)

            logger.error(

                "[NIM-Score] api_error status=%d latency_ms=%d session=%s round=%d",

                exc.status_code, _latency_ms, payload.session_id, user_message_count,

            )

            break  # non-retriable

        except Exception as exc:  # noqa: BLE001 — safety net, session must continue

            _latency_ms = int((time.monotonic() - _t0) * 1000)

            logger.error(

                "[NIM-Score] unexpected_error error=%r latency_ms=%d session=%s round=%d",

                exc, _latency_ms, payload.session_id, user_message_count,

            )

            break

        # ── Parse response ─────────────────────────────────────────────────────

        raw_content = response.choices[0].message.content.strip()

        cleaned_content = raw_content

        if cleaned_content.startswith("```"):

            _lines = cleaned_content.splitlines()

            _lines = _lines[1:] if _lines[0].startswith("```") else _lines

            _lines = _lines[:-1] if _lines and _lines[-1].strip() == "```" else _lines

            cleaned_content = "\n".join(_lines).strip()

        try:

            result = json.loads(cleaned_content)

            feedback_raw = result["feedback"]

            next_question = result["next_question"]

            # Deduplication check
            duplicate_found = False
            for prev_q in previous_questions:
                if is_similar_question(next_question, prev_q):
                    duplicate_found = True
                    break

            if duplicate_found:
                if _attempt == 0:
                    logger.warning(
                        "[NIM-Score] duplicate question detected: %r. Retrying LLM with instruction to avoid duplicates...",
                        next_question
                    )
                    # Inject a system instruction instructing LLM to avoid this question
                    chat_messages = [
                        {"role": "system", "content": system_prompt + f"\n\nIMPORTANT: Do NOT ask the following question as it has already been asked in this session: '{next_question}'. Please generate a different, conversational follow-up question."}
                    ] + claude_messages
                    continue
                else:
                    logger.warning(
                        "[NIM-Score] duplicate question detected again on retry: %r. Falling back to static question.",
                        next_question
                    )
                    next_question = fallback_next_question

        except (json.JSONDecodeError, KeyError) as exc:

            logger.error(

                "[NIM-Score] parse_error reason=%s session=%s raw=%r",

                exc, payload.session_id,

                raw_content[:300].encode("ascii", "replace").decode("ascii"),

            )

            break  # use unavailable fallback

        # ── Validate + assemble feedback ────────────────────────────────────────

        raw_score = feedback_raw.get("score")

        try:

            raw_score = int(raw_score)

            assert 0 <= raw_score <= 10

        except (TypeError, ValueError, AssertionError):

            logger.error(

                "[NIM-Score] invalid_score score=%r session=%s",

                raw_score, payload.session_id,

            )

            break  # use unavailable fallback

        # Keep running scores list in DB

        scores_history = []

        if session.feedback and isinstance(session.feedback, dict) and "scores" in session.feedback:

            scores_history = list(session.feedback["scores"])

        # Calibration phase (rounds 1-3) vs adaptive strictness (rounds 4+)

        round_number = user_message_count

        final_score = raw_score if round_number <= 3 else max(1, round(raw_score * 0.8))

        scores_history.append(final_score)

        # Streak detection

        streak_message = None

        if len(scores_history) >= 3:

            last_three = scores_history[-3:]

            if all(s >= 6 for s in last_three):

                streak_message = "🔥 Strong 3-answer streak - you're finding your rhythm!"

            elif all(s <= 4 for s in last_three):

                streak_message = (

                    "💡 3 weak answers in a row - let's reset. "

                    "Focus on the STAR method: Situation, Task, Action, Result. "

                    "Add specific metrics or technical details."

                )

        potential_score = min(10, final_score + 2)

        # Keep existing feedback keys (like fallback_set_index)
        existing_fb = dict(session.feedback or {})
        feedback = {

            "strengths": feedback_raw.get("strengths", []),

            "gaps": feedback_raw.get("gaps", []),

            "score": final_score,

            "potential_score": potential_score,

            "growth_path": f"{final_score}/10 → {potential_score}/10 potential with improvements",

            "streak_message": streak_message,

            "example_rewrites": feedback_raw.get("example_rewrites", [

                "Good: 'I optimized database query latency.'\n"

                "→ Elite (10/10): 'I analyzed query logs, identified unindexed foreign keys, "

                "and added composite indexes — reducing latency 75% (800ms→200ms) for 15k users.'"

            ]),

            "scores": scores_history,

        }
        existing_fb.update(feedback)
        feedback = existing_fb

        break  # success — exit retry loop

    # Append assistant's next question/closing statement to history and save feedback

    history.append({"role": "assistant", "content": next_question})

    session.conversation_history = history

    session.feedback = feedback

    db.commit()

    db.refresh(session)

    return InterviewAnswerResponse(

        feedback=feedback,

        next_question=next_question,

    )

# --- Intelligent Company Selection & Recommendations ---

import json

import difflib

from pathlib import Path

from typing import List, Dict, Any, Optional

from fastapi import Query

from app.services.resume_service import get_user_resume_by_id

# In-memory caches for low-latency retrieval

_companies_cache: Optional[List[Dict[str, Any]]] = None

_llm_search_cache: Dict[str, List[Dict[str, Any]]] = {}

_recommendations_cache: Dict[int, List[Dict[str, Any]]] = {}

def get_companies() -> List[Dict[str, Any]]:

    global _companies_cache

    if _companies_cache is not None:

        return _companies_cache

        

    json_path = Path(__file__).parent / "companies.json"

    if not json_path.exists():

        # Fallback to frontend path if needed

        json_path = Path(__file__).parent / "../../../frontend/src/features/interview/components/companies.json"

        

    if json_path.exists():

        try:

            with open(json_path, "r", encoding="utf-8") as f:

                data = json.load(f)

                # Clean name whitespace

                for item in data:

                    if "name" in item and isinstance(item["name"], str):

                        item["name"] = item["name"].strip()

                _companies_cache = data

        except Exception as e:

            logger.error(f"Failed to parse companies.json: {e}")

            _companies_cache = []

    else:

        logger.warning(f"companies.json not found at {json_path}")

        _companies_cache = []

        

    return _companies_cache

def search_local_companies(query: str, limit: int = 15) -> List[Dict[str, Any]]:

    query_clean = query.strip().lower()

    companies = get_companies()

    if not query_clean:

        return companies[:limit]

        

    exact_matches = []

    substring_matches = []

    

    for c in companies:

        name_lower = c.get("name", "").lower()

        industry_lower = c.get("industry", "").lower()

        if name_lower == query_clean:

            exact_matches.append(c)

        elif name_lower.startswith(query_clean):

            substring_matches.append(c)

        elif query_clean in name_lower or query_clean in industry_lower:

            substring_matches.append(c)

            

    results = exact_matches + [c for c in substring_matches if c not in exact_matches]

    if len(results) >= limit:

        return results[:limit]

        

    # Fuzzy match

    names = [c["name"] for c in companies]

    close_names = difflib.get_close_matches(query, names, n=limit, cutoff=0.5)

    

    fuzzy_matches = []

    for name in close_names:

        for c in companies:

            if c.get("name") == name and c not in results:

                fuzzy_matches.append(c)

                break

                

    results = results + fuzzy_matches

    return results[:limit]

async def search_companies_llm(query: str) -> List[Dict[str, Any]]:

    query_clean = query.strip()

    if not query_clean:

        return []

    if query_clean in _llm_search_cache:

        return _llm_search_cache[query_clean]

        

    companies = get_companies()

    company_names = [c["name"] for c in companies]

    

    prompt = f"""You are a company search matching service. A user is looking for a target tech company.

User Search Query: "{query_clean}"

Identify and select up to 5 most relevant company names from the list of available companies below that best match the query. Handle typos, synonyms, colloquial names, or industry associations (e.g. "social giant" matches Meta/Facebook, "chatgpt" matches OpenAI).

Available Companies List:

{json.dumps(company_names)}

Return ONLY a JSON list of strings representing the matching company names in order of relevance. Example: ["Google", "Stripe"]"""

    try:

        # Request completion from NVIDIA NIM/OpenRouter

        response = await client.chat.completions.create(

            model=_model,

            messages=[

                {"role": "system", "content": "You are a precise search matching assistant that responds strictly in JSON format (a list of strings)."},

                {"role": "user", "content": prompt}

            ],

            max_tokens=150,

            temperature=0.0,

        )

        content = response.choices[0].message.content.strip()

        

        # Clean up Markdown code blocks if LLM output contains them

        if content.startswith("```"):

            lines = content.splitlines()

            if lines[0].startswith("```"):

                lines = lines[1:]

            if lines and lines[-1].strip() == "```":

                lines = lines[:-1]

            content = "\n".join(lines).strip()

            

        matched_names = json.loads(content)

        if isinstance(matched_names, dict):

            # Fallback if LLM nested list under a key

            for val in matched_names.values():

                if isinstance(val, list):

                    matched_names = val

                    break

        if not isinstance(matched_names, list):

            matched_names = []

            

        matched_companies = []

        for name in matched_names:

            for c in companies:

                if c.get("name", "").lower() == str(name).strip().lower():

                    if c not in matched_companies:

                        matched_companies.append(c)

                    break

                    

        _llm_search_cache[query_clean] = matched_companies

        return matched_companies

    except Exception as e:

        logger.error(f"LLM company search failed: {e}")

        return []

async def resolve_and_cache_new_company(query: str) -> Optional[Dict[str, Any]]:

    """

    LLM-fallback pipeline (Part A) to resolve a new company not present in the seed data.

    Queries the LLM to normalized name, industry, hiring intensity, and interview style.

    Includes a validation step with reasoning citation, and caches the result on disk/memory.

    """

    query_clean = query.strip()

    if not query_clean or len(query_clean) < 2:

        return None

        

    # Check if it already exists to prevent duplicate writes

    companies = get_companies()

    for c in companies:

        name = c.get("name", "").strip()

        aliases = [a.lower() for a in c.get("aliases", [])]

        if name.lower() == query_clean.lower() or query_clean.lower() in aliases:

            return c

            

    # LLM Prompt for resolution, including validation sanity checks and reasoning citation

    prompt = f"""You are a company profile extraction and normalization engine.

A user has requested an interview profile for the target company: "{query_clean}"

This company is not in our database.

Perform the following tasks:

1. Identify if this is a real tech company, startup, or generic term.

2. Determine the canonical name of the company.

3. Classify its industry, hiring intensity (High, Medium, Low), and interview style (e.g. Algorithmic & Behavioral, Coding & System Design, Domain Specific, Practical & Algorithmic, etc.).

4. Provide a 1-sentence reasoning citation/justification for these classifications.

You MUST respond strictly in the following JSON format:

{{

  "name": "Canonical Company Name",

  "canonical_name": "Canonical Company Name",

  "aliases": ["alias1", "alias2"],

  "industry": "Standard Industry Category (e.g., DevOps & Developer Tools, Cybersecurity, Software & SaaS, Fintech, E-commerce, Cloud Infrastructure, Artificial Intelligence, Logistics & Delivery, Data & Analytics, Web3 & Blockchain, Social Media & Comm, Hardware & Semiconductors)",

  "hiring_intensity": "High or Medium or Low",

  "interview_style": "Interview Style Description",

  "avg_questions": 5,

  "reasoning_citation": "Brief sentence explaining the tags based on public knowledge of the company's product/engineering culture",

  "needs_review": false

}}

If you cannot identify the company or believe it is fake/made-up, set "needs_review": true, but still try to classify it based on the name context.

"""

    try:

        response = await client.chat.completions.create(

            model=_model,

            messages=[

                {"role": "system", "content": "You are a precise database normalization assistant. Respond ONLY in valid JSON format matching the schema."},

                {"role": "user", "content": prompt}

            ],

            max_tokens=250,

            temperature=0.1,

        )

        content = response.choices[0].message.content.strip()

        

        # Clean markdown code blocks

        if content.startswith("```"):

            lines = content.splitlines()

            if lines[0].startswith("```"):

                lines = lines[1:]

            if lines and lines[-1].strip() == "```":

                lines = lines[:-1]

            content = "\n".join(lines).strip()

            

        resolved = json.loads(content)

        

        # Lightweight sanity checks (Validation Step)

        required_fields = ["name", "industry", "hiring_intensity", "interview_style"]

        for f in required_fields:

            if not resolved.get(f):

                raise ValueError(f"Missing required field: {f}")

                

        # Normalize fields

        resolved["name"] = resolved["name"].strip()

        resolved["canonical_name"] = resolved.get("canonical_name", resolved["name"]).strip()

        resolved["aliases"] = [a.strip() for a in resolved.get("aliases", []) if a.strip()]

        if resolved["name"] not in resolved["aliases"]:

            resolved["aliases"].append(resolved["name"])

        resolved["avg_questions"] = int(resolved.get("avg_questions", 5))

        resolved["needs_review"] = bool(resolved.get("needs_review", False))

        

        # Write/Cache to companies.json

        json_path = Path(__file__).parent / "companies.json"

        if not json_path.exists():

            json_path = Path(__file__).parent / "../../../frontend/src/features/interview/components/companies.json"

            

        if json_path.exists():

            # Read existing

            with open(json_path, "r", encoding="utf-8") as f:

                current_data = json.load(f)

            # Append new resolved company

            current_data.append(resolved)

            # Write back

            with open(json_path, "w", encoding="utf-8") as f:

                json.dump(current_data, f, indent=2, ensure_ascii=False)

            

            # Sync frontend copy too if we are in backend

            frontend_path = Path(__file__).parent / "../../../frontend/src/features/interview/components/companies.json"

            if frontend_path.exists() and json_path != frontend_path:

                with open(frontend_path, "w", encoding="utf-8") as f:

                    json.dump(current_data, f, indent=2, ensure_ascii=False)

                    

            logger.info(f"[Company-Resolve] Resolved and cached new company: {resolved['name']} (Reasoning: {resolved.get('reasoning_citation')})")

            

            # Reset the memory cache so it gets reloaded

            global _companies_cache

            _companies_cache = current_data

            

        return resolved

    except Exception as e:

        logger.error(f"[Company-Resolve] Failed to resolve and cache company {query}: {e}")

        return None

@router.get("/api/interview/companies/search", response_model=List[Dict[str, Any]])

@router.get("/interviews/companies/search", response_model=List[Dict[str, Any]])

async def search_companies(

    q: str = Query("", description="Search query"),

    cache_only: bool = Query(False, description="Whether to search local cache only (no LLM)"),

    db: Session = Depends(get_db),

    current_user = Depends(get_current_user),

):

    # 1. Local substring and fuzzy matching (instant)

    local_results = search_local_companies(q)

    

    if cache_only:

        return local_results[:15]

        

    # 2. If results are empty or query is complex, run LLM-based lookup

    if len(q.strip()) >= 3 and len(local_results) < 3:

        llm_results = await search_companies_llm(q)

        # Merge results, keeping local results first

        existing_names = {c["name"].lower() for c in local_results}

        for c in llm_results:

            if c["name"].lower() not in existing_names:

                local_results.append(c)

                existing_names.add(c["name"].lower())

                

    # 3. If STILL empty or very few matches, run our resolve_and_cache_new_company pipeline (Part A)

    if len(q.strip()) >= 2 and len(local_results) == 0:

        resolved = await resolve_and_cache_new_company(q)

        if resolved:

            local_results.append(resolved)

                

    return local_results[:15]

@router.get("/api/interview/companies/recommend", response_model=List[Dict[str, Any]])

@router.get("/interviews/companies/recommend", response_model=List[Dict[str, Any]])

async def recommend_companies(

    resume_id: int = Query(..., description="ID of the resume to base recommendations on"),

    db: Session = Depends(get_db),

    current_user = Depends(get_current_user),

):

    user_id = current_user.clerk_user_id

    

    # Check cache first

    if resume_id in _recommendations_cache:

        return _recommendations_cache[resume_id]

        

    resume = get_user_resume_by_id(db, user_id, resume_id)

    if not resume:

        raise HTTPException(

            status_code=status.HTTP_404_NOT_FOUND,

            detail="Resume not found",

        )

        

    skills = resume.technical_skills or []

    exp_level = resume.experience_level or "Not Specified"

    

    companies = get_companies()

    company_names = [c["name"] for c in companies]

    

    prompt = f"""You are an elite career matching service. Recommend the top 3 best matching target companies from the list of available companies that align with the candidate's skills and experience.

Candidate Technical Skills: {", ".join(skills)}

Candidate Experience Level: {exp_level}

Available Companies List:

{json.dumps(company_names)}

Return ONLY a JSON list of exactly 3 company names. Example: ["Google", "Stripe", "Netflix"]"""

    try:

        response = await client.chat.completions.create(

            model=_model,

            messages=[

                {"role": "system", "content": "You are a precise matching assistant that responds strictly in JSON format (a list of strings)."},

                {"role": "user", "content": prompt}

            ],

            max_tokens=100,

            temperature=0.2,

        )

        content = response.choices[0].message.content.strip()

        

        if content.startswith("```"):

            lines = content.splitlines()

            if lines[0].startswith("```"):

                lines = lines[1:]

            if lines and lines[-1].strip() == "```":

                lines = lines[:-1]

            content = "\n".join(lines).strip()

            

        matched_names = json.loads(content)

        if isinstance(matched_names, dict):

            for val in matched_names.values():

                if isinstance(val, list):

                    matched_names = val

                    break

        if not isinstance(matched_names, list):

            matched_names = []

            

        matched_companies = []

        for name in matched_names:

            for c in companies:

                if c.get("name", "").lower() == str(name).strip().lower():

                    if c not in matched_companies:

                        matched_companies.append(c)

                    break

                    

        # Fallback to defaults if matching failed

        if not matched_companies:

            matched_companies = companies[:3]

            

        _recommendations_cache[resume_id] = matched_companies

        return matched_companies

    except Exception as e:

        logger.error(f"Failed to recommend companies: {e}")

        # Fallback

        fallback = companies[:3]

        _recommendations_cache[resume_id] = fallback

        return fallback

# --- Interactive Hint API ---

from pydantic import BaseModel

class HintRequest(BaseModel):

    session_id: int

    question: str

    user_transcript: str

@router.post("/api/interview/hint")

@router.post("/interviews/hint")

async def generate_hint(

    payload: HintRequest,

    db: Session = Depends(get_db),

    current_user = Depends(get_current_user)

):

    session = (

        db.query(InterviewSession)

        .filter(

            InterviewSession.id == payload.session_id,

            InterviewSession.user_id == current_user.clerk_user_id

        )

        .first()

    )

    if not session:

        raise HTTPException(

            status_code=status.HTTP_404_NOT_FOUND,

            detail="Interview session not found",

        )

    profile = db.query(InterviewProfile).filter(InterviewProfile.id == session.interview_profile_id).first()

    target_company = profile.target_company if profile else "Google"

    interview_type = profile.interview_type if profile else "system design"

    prompt = f"""You are an elite technical interviewer at {target_company} conducting a {interview_type} interview.

The candidate is currently answering this question: "{payload.question}"

Their current draft answer is: "{payload.user_transcript}"

Provide a concise, highly practical, event-driven hint (1-2 sentences max) to guide the candidate. 

Do not give away the direct answer. Suggest what area they should elaborate on (e.g. STAR structure, metrics, caching tradeoffs, database choices, or key components).

Keep the tone encouraging, collaborative, and professional."""

    try:

        response = await client.chat.completions.create(

            model=_model,

            messages=[

                {"role": "system", "content": "You are a helpful interviewer providing short hints."},

                {"role": "user", "content": prompt}

            ],

            max_tokens=150,

            temperature=0.7

        )

        hint_text = response.choices[0].message.content.strip()

        return {"hint": hint_text}

    except Exception as e:

        logger.error(f"Failed to generate hint: {e}")

        return {"hint": "Think about outlining the architectural components and key tradeoffs involved."}

# --- Company Role Validation API ---

class RoleValidationRequest(BaseModel):

    company: str

    role: str

@router.post("/api/interview/validate-role")

@router.post("/interviews/validate-role")

async def validate_role(

    payload: RoleValidationRequest,

    current_user = Depends(get_current_user),

):

    company = payload.company.strip()

    role = payload.role.strip()

    

    if not company or not role:

        raise HTTPException(

            status_code=status.HTTP_400_BAD_REQUEST,

            detail="Company and role are required fields",

        )

        

    prompt = f"""You are a tech company job role verification engine. 

Verify if the job role '{role}' is a valid job position that exists, is hired for, or is relevant at '{company}'. 

Keep in mind:

- Standard tech roles (e.g. Software Engineer, Frontend Developer, Backend Developer, Full Stack Engineer, Product Manager, Product Designer, QA Engineer, DevOps Engineer, Site Reliability Engineer, Data Scientist, Data Engineer, Engineering Manager, HR Specialist, recruiter, marketing lead, sales executive, legal counsel, intern variants like Software Engineer Intern) are valid at ALMOST ALL tech companies.

- Highly specialized or contextually mismatched roles (e.g., 'Automotive Engine Tuner' at Netflix, 'Quantum Computing Researcher' at Slack, or non-existent/fictional roles like 'Director of Space Time Travel' at Stripe) should be marked invalid.

- Be reasonably permissive for general roles, but strict for completely unrelated, gibberish, or impossible roles.

You MUST respond with exactly a JSON object matching this schema:

{{

  "valid": true or false,

  "reason": "a very brief, 1-sentence explanation of why the role is valid or invalid for this company"

}}

Return ONLY the JSON object. Do not include any markdown backticks or explanation."""

    try:

        response = await client.chat.completions.create(

            model=_model,

            messages=[

                {"role": "system", "content": "You are a precise job role verification assistant that responds strictly in JSON format."},

                {"role": "user", "content": prompt}

            ],

            max_tokens=150,

            temperature=0.0,

        )

        content = response.choices[0].message.content.strip()

        

        import re

        match = re.search(r'\{.*\}', content, re.DOTALL)

        if match:

            content = match.group(0)

            

        result = json.loads(content)

        return {

            "valid": bool(result.get("valid", True)),

            "reason": str(result.get("reason", "Role validated successfully."))

        }

    except Exception as e:

        logger.error(f"Role validation failed: {e}")

        return {

            "valid": True,

            "reason": "Validation bypass due to service timeout."

        }

# --- Company Roles List & Recommendation API ---

class CompanyRolesRequest(BaseModel):

    company: str

    resume_id: Optional[int] = None

@router.post("/api/interview/company-roles")

@router.post("/interviews/company-roles")

async def get_company_roles(

    payload: CompanyRolesRequest,

    db: Session = Depends(get_db),

    current_user = Depends(get_current_user)

):

    company = payload.company.strip()

    if not company:

        raise HTTPException(status_code=400, detail="Company name is required")

        

    resume_text = ""

    if payload.resume_id:

        from app.models.resume import Resume

        resume = db.query(Resume).filter(

            Resume.id == payload.resume_id,

            Resume.user_id == current_user.clerk_user_id

        ).first()

        if resume:

            resume_text = f"Candidate Skills: {', '.join(resume.technical_skills or [])}\nExperience Level: {resume.experience_level or 'Mid-level'}"

            

    prompt = f"""Generate a list of exactly 10 real-world job roles/positions that '{company}' hires for (both vacant and non-vacant positions).

Focus on technology, product, design, and engineering roles relevant to this specific company. Make sure the roles are realistic and actually exist/existed at '{company}'.

If the following candidate resume profile is provided, analyze their profile and select exactly 2 or 3 roles from the 10 generated roles that best match the candidate's skills and experience. Mark these as 'recommended' in the JSON output. Otherwise, mark 2 or 3 general standard roles (e.g. Software Engineer or Product Manager) as 'recommended'.

Candidate Profile:

{resume_text if resume_text else "None provided"}

Return a JSON object with this exact structure:

{{

  "roles": ["Software Engineer", "Backend Engineer", "Product Manager", "Data Scientist", "DevOps Engineer", "Frontend Engineer", "QA Engineer", "Product Designer", "Security Engineer", "Mobile Engineer"],

  "recommended": ["Software Engineer", "Backend Engineer"]

}}"""

    try:

        response = await client.chat.completions.create(

            model=_model,

            messages=[

                {"role": "system", "content": "You are a precise job roles recommender assistant. You MUST respond with a single valid JSON object and nothing else."},

                {"role": "user", "content": prompt}

            ],

            response_format={"type": "json_object"},

            max_tokens=250,

            temperature=0.2,

        )

        raw_content = response.choices[0].message.content

        content = raw_content.strip() if raw_content else ""

        

        import re

        match = re.search(r'\{.*\}', content, re.DOTALL)

        if match:

            content = match.group(0)

            

        result = json.loads(content)

        roles = result.get("roles", [])

        recommended = result.get("recommended", [])

        

        if not roles:

            raise ValueError("No roles returned from LLM")

        return {

            "roles": roles[:10],

            "recommended": recommended

        }

    except Exception as e:

        logger.error(f"Failed to fetch company roles: {e}")

        fallback_roles = [

            "Software Engineer",

            "Frontend Engineer",

            "Backend Engineer",

            "Full Stack Engineer",

            "Mobile Engineer",

            "Product Manager",

            "Product Designer",

            "DevOps Engineer",

            "Data Scientist",

            "QA Engineer"

        ]

        return {

            "roles": fallback_roles,

            "recommended": [fallback_roles[0], fallback_roles[3]] if resume_text else []

        }

from pathlib import Path

_roles_cache: Optional[List[Dict[str, Any]]] = None

def get_roles() -> List[Dict[str, Any]]:

    global _roles_cache

    if _roles_cache is not None:

        return _roles_cache

        

    json_path = Path(__file__).parent / "roles.json"

    if not json_path.exists():

        json_path = Path(__file__).parent / "../../../frontend/src/features/interview/components/roles.json"

        

    if json_path.exists():

        try:

            with open(json_path, "r", encoding="utf-8") as f:

                data = json.load(f)

                _roles_cache = data

        except Exception as e:

            logger.error(f"Failed to parse roles.json: {e}")

            _roles_cache = []

    else:

        logger.warning(f"roles.json not found at {json_path}")

        _roles_cache = []

        

    return _roles_cache

async def resolve_and_cache_new_role(role_name: str) -> Optional[Dict[str, Any]]:

    """

    LLM-fallback pipeline to resolve and cache a custom job role typed in by the user.

    """

    query_clean = role_name.strip()

    if not query_clean or len(query_clean) < 2:

        return None

        

    roles = get_roles()

    for r in roles:

        if r.get("name", "").strip().lower() == query_clean.lower():

            return r

            

    # Resolve role via LLM

    prompt = f"""You are a tech industry job classification assistant.

A user has typed the following target job role: "{query_clean}"

Perform the following tasks:

1. Normalize this role name to a standard professional title (e.g. "Senior Backend Developer" -> "Backend Engineer", "pm" -> "Product Manager").

2. Categorize it into one of these standard job families: Engineering, Product, Design, Data, Management, Operations, Sales, Marketing, Other.

3. Provide a brief 1-sentence reasoning citation.

You MUST respond strictly in the following JSON format:

{{

  "name": "Normalized Standard Role Title",

  "category": "Job Family Category",

  "needs_review": false,

  "reasoning_citation": "Brief sentence explaining the mapping."

}}

If the input is gibberish, fake, or not a real job role, set "needs_review": true.

"""

    try:

        response = await client.chat.completions.create(

            model=_model,

            messages=[

                {"role": "system", "content": "You are a precise job roles normalization engine. Respond ONLY in valid JSON format."},

                {"role": "user", "content": prompt}

            ],

            max_tokens=200,

            temperature=0.1,

        )

        content = response.choices[0].message.content.strip()

        if content.startswith("```"):

            lines = content.splitlines()

            if lines[0].startswith("```"):

                lines = lines[1:]

            if lines and lines[-1].strip() == "```":

                lines = lines[:-1]

            content = "\n".join(lines).strip()

            

        resolved = json.loads(content)

        

        if not resolved.get("name") or not resolved.get("category"):

            raise ValueError("Missing name or category in resolved role")

            

        resolved["name"] = resolved["name"].strip()

        resolved["category"] = resolved["category"].strip()

        resolved["needs_review"] = bool(resolved.get("needs_review", False))

        

        json_path = Path(__file__).parent / "roles.json"

        if not json_path.exists():

            json_path = Path(__file__).parent / "../../../frontend/src/features/interview/components/roles.json"

            

        if json_path.exists():

            with open(json_path, "r", encoding="utf-8") as f:

                current_data = json.load(f)

            current_data.append(resolved)

            with open(json_path, "w", encoding="utf-8") as f:

                json.dump(current_data, f, indent=2, ensure_ascii=False)

                

            frontend_path = Path(__file__).parent / "../../../frontend/src/features/interview/components/roles.json"

            if frontend_path.exists() and json_path != frontend_path:

                with open(frontend_path, "w", encoding="utf-8") as f:

                    json.dump(current_data, f, indent=2, ensure_ascii=False)

                    

            logger.info(f"[Role-Resolve] Resolved and cached new role: {resolved['name']}")

            

            global _roles_cache

            _roles_cache = current_data

            

        return resolved

    except Exception as e:

        logger.error(f"[Role-Resolve] Failed to resolve role {role_name}: {e}")

        return None

class ResolveRequest(BaseModel):

    name: str

class RoleResolveRequest(BaseModel):

    name: str

@router.post("/api/interview/companies/resolve")

@router.post("/interviews/companies/resolve")

async def resolve_company(

    payload: ResolveRequest,

    current_user = Depends(get_current_user)

):

    name = payload.name.strip()

    resolved = await resolve_and_cache_new_company(name)

    if not resolved:

        raise HTTPException(status_code=404, detail="Failed to resolve company")

    return resolved

@router.post("/api/interview/roles/resolve")

@router.post("/interviews/roles/resolve")

async def resolve_role(

    payload: RoleResolveRequest,

    current_user = Depends(get_current_user)

):

    name = payload.name.strip()

    resolved = await resolve_and_cache_new_role(name)

    if not resolved:

        raise HTTPException(status_code=404, detail="Failed to resolve role")

    return resolved

@router.get("/api/interview/roles/search", response_model=List[Dict[str, Any]])

@router.get("/interviews/roles/search", response_model=List[Dict[str, Any]])

async def search_roles(

    q: str = Query("", description="Search query"),

    cache_only: bool = Query(False, description="Whether to search local cache only (no LLM)"),

    current_user = Depends(get_current_user),

):

    roles = get_roles()

    query_clean = q.strip().lower()

    

    if not query_clean:

        return roles[:15]

        

    local_results = []

    for r in roles:

        r_name = r.get("name", "").lower()

        if r_name == query_clean:

            local_results.insert(0, r)

        elif query_clean in r_name:

            local_results.append(r)

            

    if local_results or cache_only:

        return local_results[:15]

        

    resolved = await resolve_and_cache_new_role(q)

    if resolved:

        return [resolved]

        

    return []

def send_email_notification(subject: str, html_content: str):

    import smtplib

    from email.mime.multipart import MIMEMultipart

    from email.mime.text import MIMEText

    

    smtp_host = settings.SMTP_HOST

    smtp_port = settings.SMTP_PORT

    smtp_user = settings.SMTP_USER

    smtp_pass = settings.SMTP_PASSWORD

    

    # If no SMTP credentials, fallback to logging

    if not all([smtp_host, smtp_port, smtp_user, smtp_pass]):

        logger.warning("[Email] SMTP configuration missing. Fallback to file logging.")

        return False

        

    try:

        msg = MIMEMultipart("alternative")

        msg["Subject"] = subject

        msg["From"] = smtp_user

        msg["To"] = smtp_user

        

        part = MIMEText(html_content, "html")

        msg.attach(part)

        

        server = smtplib.SMTP(smtp_host, int(smtp_port))

        server.starttls()

        server.login(smtp_user, smtp_pass)

        server.sendmail(smtp_user, smtp_user, msg.as_string())

        server.quit()

        logger.info(f"[Email] Email sent successfully to {smtp_user}")

        return True

    except Exception as e:

        logger.error(f"[Email] Failed to send email via SMTP: {e}")

        return False

class SupportRequest(BaseModel):

    category: str

    message: str

@router.post("/api/interview/support", status_code=status.HTTP_200_OK)

@limiter.limit("5/minute")

async def receive_customer_support_issue(

    request: Request,

    payload: SupportRequest,

    current_user = Depends(get_current_user)

):

    try:

        import os

        from datetime import datetime

        log_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", "logs"))

        os.makedirs(log_dir, exist_ok=True)

        log_path = os.path.join(log_dir, "customer_support.log")

        timestamp = datetime.utcnow().isoformat()

        

        log_line = (

            f"[{timestamp}] FROM: {current_user.email} (Clerk ID: {current_user.clerk_user_id})\n"

            f"CATEGORY: {payload.category}\n"

            f"TO: {settings.SMTP_USER}\n"

            f"MESSAGE: {payload.message}\n"

            f"{'='*50}\n"

        )

        with open(log_path, "a", encoding="utf-8") as f:

            f.write(log_line)

            

        logger.info(f"[Support] Issue category={payload.category} logged successfully for {current_user.email}.")

        

        # Try sending email

        send_email_notification(

            subject=f"[ElevateIQ Support] {payload.category} from {current_user.email}",

            html_content=(

                f"<h2>ElevateIQ Support Ticket</h2>"

                f"<p><strong>From:</strong> {current_user.email} (Clerk ID: {current_user.clerk_user_id})</p>"

                f"<p><strong>Category:</strong> {payload.category}</p>"

                f"<p><strong>Message:</strong></p>"

                f"<p style='white-space: pre-wrap; background: #f3f4f6; padding: 10px; border-radius: 5px;'>{payload.message}</p>"

            )

        )

        

        return {"success": True, "message": "Support issue received"}

    except Exception as e:

        logger.exception("Failed to write support issue")

        raise HTTPException(

            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,

            detail="Failed to submit support issue"

        )

class FeedbackRequest(BaseModel):

    message: str

@router.post("/api/interview/feedback", status_code=status.HTTP_200_OK)

@limiter.limit("5/minute")

async def receive_user_feedback(

    request: Request,

    payload: FeedbackRequest,

    current_user = Depends(get_current_user)

):

    try:

        import os

        from datetime import datetime

        log_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", "logs"))

        os.makedirs(log_dir, exist_ok=True)

        log_path = os.path.join(log_dir, "user_feedback.log")

        timestamp = datetime.utcnow().isoformat()

        

        log_line = (

            f"[{timestamp}] FROM: {current_user.email} (Clerk ID: {current_user.clerk_user_id})\n"

            f"TO: {settings.SMTP_USER}\n"

            f"MESSAGE: {payload.message}\n"

            f"{'='*50}\n"

        )

        with open(log_path, "a", encoding="utf-8") as f:

            f.write(log_line)

            

        logger.info(f"[Feedback] Feedback from user {current_user.email} logged successfully.")

        

        # Try sending email

        send_email_notification(

            subject=f"[ElevateIQ Feedback] Feedback from {current_user.email}",

            html_content=(

                f"<h2>ElevateIQ Platform Feedback</h2>"

                f"<p><strong>From:</strong> {current_user.email} (Clerk ID: {current_user.clerk_user_id})</p>"

                f"<p><strong>Message:</strong></p>"

                f"<p style='white-space: pre-wrap; background: #f3f4f6; padding: 10px; border-radius: 5px;'>{payload.message}</p>"

            )

        )

        

        return {"success": True, "message": "Feedback received"}

    except Exception as e:

        logger.exception("Failed to write user feedback")

        raise HTTPException(

            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,

            detail="Failed to submit feedback"

        )

