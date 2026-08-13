import random
from typing import Optional, List, Dict
import logging
import json
from pydantic import BaseModel
from fastapi import APIRouter, Depends, HTTPException, Request, status
from app.api.interview import settings, client, _model
from app.core.rate_limit import limiter

logger = logging.getLogger(__name__)

# We support routes under prefix "/api/interview" and "/interviews"
router = APIRouter(tags=["Mock Interviews"])

COMPANIES = [] # unused fallback

MOCK_QUESTIONS_BY_TYPE = {
    "coding": [
        "Design a highly concurrent key-value store with eviction policies.",
        "Implement a garbage collector algorithm or mark-and-sweep routine.",
        "Find the longest substring without repeating characters in O(N).",
        "Design an LRU (Least Recently Used) cache with O(1) operations.",
        "Implement a Trie (Prefix Tree) supporting insert, search, and startsWith.",
        "Find the shortest path in a dynamic grid with obstacles.",
        "Merge K sorted arrays or linked lists efficiently.",
        "Design a rate limiter algorithm (Token Bucket or Leaky Bucket).",
        "Serialize and deserialize a binary tree.",
        "Find the maximum sliding window sum."
    ],
    "system design": [
        "Design the architectural system layout for a real-time notification push service.",
        "Design Instagram feed showing photo uploads and follow relationships.",
        "Design a globally distributed video streaming platform like Netflix.",
        "Design a scalable real-time chat application with message history.",
        "Design an autocomplete system supporting millions of queries per second.",
        "Design a URL shortening service like Bitly with high redirect performance.",
        "Design a distributed rate limiter for microservices.",
        "Design a ride-sharing API backend like Uber.",
        "Design a web crawler that scales to billions of pages.",
        "Design an API gateway that handles authentication, rate limiting, and routing."
    ],
    "behavioral": [
        "Tell me about a time you failed. What was the impact and what did you learn?",
        "How do you handle disagreement with a product manager or technical lead?",
        "Describe a time you had to deal with ambiguous requirements. How did you align the team?",
        "Tell me about the most challenging engineering project you led and measured success.",
        "How do you handle technical debt while keeping engineering velocity high?",
        "Describe a situation where you proactively optimized a slow system or code block.",
        "Tell me about a time you mentored a junior engineer or resolved team conflicts.",
        "How do you prioritize deliverables when resources are constrained?"
    ]
}

REWRITE_EXAMPLES = {
    "coding": [
        "Good (Calibrated): 'I optimized the list search algorithm.'\n→ Elite Upgrade (10/10): 'I replaced the O(N^2) brute-force nested search with a hash-map lookup, reducing time complexity to O(N) and space complexity to O(N). This optimized query processing latency from 450ms to 8ms for deep search operations.'",
        "Good (Calibrated): 'I used sorting to find duplicates.'\n→ Elite Upgrade (10/10): 'I implemented a binary search tree pattern with memoization to find duplicate patterns in the stream, reducing memory footprint by 50% and improving runtime from O(N log N) to O(N).'",
        "Good (Calibrated): 'I optimized our loop iterations.'\n→ Elite Upgrade (10/10): 'I refactored the string prefix checking algorithm using a Trie data structure, improving search complexity from O(L * N) to O(L) where L is the search prefix length, resolving a key search latency bottleneck.'"
    ],
    "system design": [
        "Good (Calibrated): 'I optimized database query latency.'\n→ Elite Upgrade (10/10): 'I analyzed our query logs, identified unindexed foreign keys, and added composite indexes. This reduced search API latency by 75% (from 800ms to 200ms) for 15,000 active users.'",
        "Good (Calibrated): 'I used Redis to cache API results.'\n→ Elite Upgrade (10/10): 'I implemented a Redis caching layer for read-heavy endpoints. I configured a sliding window cache expiration and handled cache stampede using mutex locks. This offloaded database read traffic by 70% and improved p99 read latency from 350ms to 12ms.'",
        "Good (Calibrated): 'I set up a message queue for async tasks.'\n→ Elite Upgrade (10/10): 'I designed an event-driven task processing system using RabbitMQ and concurrent Go worker pools. By using backpressure controls and dead-letter exchanges, we handled peak write loads of 5,000 requests/sec with zero task dropouts.'"
    ],
    "behavioral": [
        "Good (Calibrated): 'I worked on database optimization when our app crashed.'\n→ Elite Upgrade (10/10): 'When our production database locked up due to connections scaling, I immediately coordinated a bridge with the DBA team. I set up read replicas and connection pooling, resolving the issue in 15 minutes and restoring service to 10k active users.'",
        "Good (Calibrated): 'I led a team to deliver the project on time.'\n→ Elite Upgrade (10/10): 'Faced with a 2-week deadline slip, I conducted a priority matrix analysis, negotiated scope reduction with the product team, and established daily syncs. We launched the MVP on time, onboarded 3 enterprise clients, and achieved 100% SLA compliance.'",
        "Good (Calibrated): 'I resolved a disagreement with a product manager.'\n→ Elite Upgrade (10/10): 'When the PM proposed a complex feature without metrics, I created a data-driven prototype showing the latency impact of the proposed design. I presented alternative scaling options, aligning the PM on a simplified phase-1 scope and saving 3 weeks of development.'"
    ]
}

from sqlalchemy.orm import Session
from app.core.database import get_db
from app.models.interview_profile import InterviewProfile

# In-memory mock sessions storage
MOCK_SESSIONS: Dict[int, dict] = {}
SESSION_COUNTER = 1000
TEMPLATE_CYCLE_INDEX = 0

# Schemas
class MockStartRequest(BaseModel):
    interview_profile_id: int
    target_company: Optional[str] = None
    interview_type: Optional[str] = None
    role: Optional[str] = "Software Engineer"
    job_type: Optional[str] = "full time job"

class MockStartResponse(BaseModel):
    session_id: int
    question: str
    config: dict
    interview_config: dict

class MockAnswerRequest(BaseModel):
    session_id: int
    user_transcript: Optional[str] = None
    transcript: Optional[str] = None

class MockAnswerFeedback(BaseModel):
    strengths: List[str]
    gaps: List[str]
    score: int
    potential_score: Optional[int] = None
    growth_path: Optional[str] = None
    streak_message: Optional[str] = None
    example_rewrites: Optional[List[str]] = None

class MockAnswerResponse(BaseModel):
    feedback: MockAnswerFeedback
    next_question: Optional[str]


async def create_mock_session_handler(payload: MockStartRequest) -> MockStartResponse:
    global SESSION_COUNTER
    
    company_name = payload.target_company or "Google"
    type_name = payload.interview_type or "coding"
    
    itype = type_name.lower()
    if "coding" in itype:
        type_key = "coding"
    elif "design" in itype:
        type_key = "system design"
    else:
        type_key = "behavioral"
        
    base_questions = MOCK_QUESTIONS_BY_TYPE.get(type_key, MOCK_QUESTIONS_BY_TYPE["coding"])
    selected_questions = list(base_questions)
    
    # Shuffle and select 4 questions to prevent repetition
    random.shuffle(selected_questions)
    selected_questions = selected_questions[:4]
    
    # Customize questions with target company if applicable
    custom_questions = []
    for q in selected_questions:
        if "instagram feed" in q.lower() and company_name.lower() != "meta":
            q = q.replace("Instagram feed", f"{company_name} activity feed")
        elif "netflix" in q.lower() and company_name.lower() != "netflix":
            q = q.replace("Netflix", f"{company_name} video platform")
        elif "uber" in q.lower() and company_name.lower() != "uber":
            q = q.replace("Uber", f"{company_name} transport dispatcher")
        custom_questions.append(q)

    session_id = SESSION_COUNTER
    SESSION_COUNTER += 1

    first_question = custom_questions[0]

    # Use LLM if API Key is configured
    if settings.LLM_API_KEY and settings.LLM_API_KEY != "placeholder_key":
        system_prompt = f"""You are Eleanor, an elite technical interviewer at {company_name} conducting a Senior {type_name} interview for a {payload.job_type or "full time job"} {payload.role or "Software Engineer"} position.
Your job is to conduct a realistic, high-quality interview by asking exactly one question at a time.
Do not ask multiple questions at once. Keep the tone professional, encouraging yet rigorous.
Your name is Eleanor, and you must introduce yourself as Eleanor. Do not invent or use any other name.
Begin the interview by introducing yourself briefly as Eleanor, the {company_name} interviewer, and asking the first question appropriate for a Senior candidate applying for a {payload.job_type or "full time job"} {payload.role or "Software Engineer"} position in a {type_name} loop."""
        try:
            response = await client.chat.completions.create(
                model=_model,
                messages=[
                    {"role": "system", "content": system_prompt},
                    {"role": "user", "content": "Begin the interview."}
                ],
                max_tokens=1000,
            )
            first_question = response.choices[0].message.content.strip()
        except Exception as e:
            logger.error(f"Failed to generate mock first question: {e}")

    # Store state using company name passed in payload
    MOCK_SESSIONS[session_id] = {
        "company": company_name,
        "type": type_name,
        "role": payload.role,
        "job_type": payload.job_type,
        "questions": custom_questions,
        "current_index": 0,
        "scores": [],
        "history": [{"role": "assistant", "content": first_question}]
    }

    config_data = {
        "company": company_name,
        "type": type_name
    }
    
    interview_config_data = {
        "target_company": company_name,
        "interview_type": type_name,
        "experience_level": "Senior",
        "role": payload.role,
        "job_type": payload.job_type,
    }

    return MockStartResponse(
        session_id=session_id,
        question=first_question,
        config=config_data,
        interview_config=interview_config_data
    )


async def answer_mock_session_handler(payload: MockAnswerRequest) -> MockAnswerResponse:
    session = MOCK_SESSIONS.get(payload.session_id)
    if not session:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Mock session {payload.session_id} not found."
        )

    transcript = (payload.user_transcript or payload.transcript or "").strip()

    # Use LLM if API Key is configured
    if settings.LLM_API_KEY and settings.LLM_API_KEY != "placeholder_key":
        history = session.setdefault("history", [])
        history.append({"role": "user", "content": transcript})
        
        # Check round count (maximum 5 user responses before completing)
        user_message_count = sum(1 for m in history if m["role"] == "user")
        is_last_round = user_message_count >= 5
        
        system_prompt = f"""You are Eleanor, an elite technical interviewer at {session['company']} conducting a Senior {session['type']} interview for a {session.get('job_type', 'full time job')} {session.get('role', 'Software Engineer')} position.
You are evaluating the candidate's responses and generating the next question. Your name is Eleanor. Do not invent or use any other name.

CRITICAL REQUIREMENT FOR 'next_question':
- You MUST generate a conversational and direct follow-up question based on the candidate's latest response.
- Do NOT jump to an unrelated topic or ask a generic question.
- Dig deeper into their previous answer: ask them to elaborate on specific technologies they mentioned, architectural details, trade-offs, how they handled a specific bottleneck or conflict, or the metrics/outcomes of their actions.
- The interview should feel like an active, organic dialogue where each question builds on their previous response, mimicking a real-life technical or behavioral loop.

Analyze the conversation history. Evaluate the candidate's latest response strictly using this 0-10 Response Quality Rubric:
- 0-1: Completely blank, gibberish, or offensive.
- 1-2: One-word answers ("yes", "no", "cool", "lets go") with no substance. (PRO RULE: 1-2 word answers must score 1-2, never above 3).
- 2-3: Vague answer, no specific examples, no metrics.
- 3-4: Basic answer with minimal detail.
- 4-5: Decent answer with some structure but lacks depth.
- 5-6: Good answer with example + context but missing metrics.
- 7-8: Strong answer with STAR structure + metrics.
- 8-9: Excellent - STAR + metrics + technical depth + impact.
- 9-10: Elite - All of above + shows system thinking + business acumen.

For the first 5 responses of the interview, make sure to anchor expectations high and enforce this rubric strictly.

You MUST respond with exactly a JSON object matching this schema:
{{
  "feedback": {{
    "strengths": ["list of strengths in their response"],
    "gaps": ["list of gaps or areas of improvement in their response"],
    "score": 6, // integer raw score 0-10 based strictly on the rubric above
    "example_rewrites": ["1-2 examples of how the candidate could rewrite their response to reach a higher score"]
  }},
  "next_question": "the next interview question to ask"
}}

Return ONLY the JSON object. Do not include any explanation or backticks.
Ensure the JSON is valid."""

        if is_last_round:
            system_prompt += "\n\nThis is the final round. Do NOT ask any more questions. Set 'next_question' to a summary feedback closing statement thanking the candidate."

        try:
            response = await client.chat.completions.create(
                model=_model,
                messages=[{"role": "system", "content": system_prompt}] + history,
                max_tokens=1000,
            )
            content = response.choices[0].message.content.strip()
            
            if content.startswith("```"):
                lines = content.splitlines()
                if lines[0].startswith("```"):
                    lines = lines[1:]
                if lines and lines[-1].strip() == "```":
                    lines = lines[:-1]
                content = "\n".join(lines).strip()
                
            res_json = json.loads(content)
            fb = res_json["feedback"]
            next_q = res_json["next_question"]
            
            history.append({"role": "assistant", "content": next_q})
            session.setdefault("scores", []).append(fb.get("score", 6))
            
            feedback_data = MockAnswerFeedback(
                strengths=fb.get("strengths", []),
                gaps=fb.get("gaps", []),
                score=fb.get("score", 6),
                potential_score=min(10, fb.get("score", 6) + 2),
                growth_path=f"{fb.get('score', 6)}/10 → {min(10, fb.get('score', 6) + 2)}/10 potential",
                streak_message=None,
                example_rewrites=fb.get("example_rewrites", [])
            )
            
            scores = session["scores"]
            if len(scores) >= 3:
                last_three = scores[-3:]
                if all(s >= 6 for s in last_three):
                    feedback_data.streak_message = "🔥 Strong 3-answer streak - you're finding your rhythm!"
                elif all(s <= 4 for s in last_three):
                    feedback_data.streak_message = "💡 3 weak answers in a row - let's reset. Focus on STAR method."

            return MockAnswerResponse(
                feedback=feedback_data,
                next_question=None if is_last_round else next_q
            )
        except Exception as e:
            logger.error(f"Failed to match mock answer via LLM fallback: {e}")

    # Static fallback logic
    words = transcript.split()
    word_count = len(words)

    # 1. Calibrated Rubric Scoring (0-10 scale)
    import re
    text_lower = transcript.lower()
    has_metrics = False
    has_star = False
    
    if not transcript:
        raw_score = 0
    elif word_count <= 2:
        # PRO RULE: "lets go" or any 1-2 word answer = 1-2 max, never above 3
        raw_score = min(2, max(1, word_count))
    elif word_count < 15:
        raw_score = 2
    elif word_count < 35:
        raw_score = 3
    elif word_count < 60:
        raw_score = 4
    elif word_count < 100:
        raw_score = 5
    else:
        # Detailed scoring for word_count >= 100
        raw_score = 6
        
        # Check metrics
        has_metrics = bool(re.search(r'\b\d+(?:\.\d+)?%', text_lower) or 
                           re.search(r'\b\d+(?:\.\d+)?\s*(?:ms|seconds|s|kb|mb|gb)\b', text_lower) or
                           re.search(r'\b\d+(?:,\d+)*\s*(?:users|requests|reqs|queries|qps|k|m|b)\b', text_lower))
        
        # Check STAR structure keywords
        has_star = any(kw in text_lower for kw in ["led", "refactored", "implemented", "optimized", "reduced", "increased", "solved", "designed", "impacted", "result"])
        
        # Check deep technical keywords
        tech_keywords = ["latency", "throughput", "concurrency", "thread", "async", "cache", "index", "database", "load balance", "reconcile", "reconciliation", "partition", "sharding", "scalability", "bottleneck", "profiling"]
        has_depth = sum(1 for kw in tech_keywords if kw in text_lower) >= 3
        
        if has_metrics and has_star:
            raw_score = 7
            if has_depth:
                raw_score = 8
                if word_count > 180 and ("business" in text_lower or "product" in text_lower or "strategic" in text_lower or "cost" in text_lower):
                    raw_score = 9
                    if word_count > 250 and ("tradeoff" in text_lower or "trade-off" in text_lower):
                        raw_score = 10
        elif has_metrics or has_star:
            raw_score = 6
        else:
            raw_score = 5

    # 2. Calibration & Adaptive Strictness
    # round_number is current_index + 1
    round_number = session["current_index"] + 1
    
    if round_number <= 3:
        # Calibration phase: score honestly
        final_score = raw_score
    else:
        # Adaptive strictness phase: increase rigor by 20-30% (scale by 0.8)
        final_score = max(1, round(raw_score * 0.8))

    # Append to scores history
    session.setdefault("scores", []).append(final_score)
    scores = session["scores"]

    # 3. Streak Detection
    streak_message = None
    if len(scores) >= 3:
        last_three = scores[-3:]
        if all(s >= 6 for s in last_three):
            streak_message = "🔥 Strong 3-answer streak - you're finding your rhythm!"
        elif all(s <= 4 for s in last_three):
            streak_message = "💡 3 weak answers in a row - let's reset. Focus on using the STAR method: Situation, Task, Action, Result. Try adding specific metrics or technical details."

    # 4. Psychological Anchoring
    potential_score = min(10, final_score + 2)
    growth_path = f"{final_score}/10 → {potential_score}/10 potential with: [specific feedback]"

    # 5. Example Rewrites & Feedback Logic
    strengths = []
    gaps = []
    example_rewrites = []

    # Map strengths based on keywords
    if any(kw in text_lower for kw in ["edge case", "edge-case", "boundary condition"]):
        strengths.append("Proactively identified critical edge cases and boundary conditions.")
    if any(kw in text_lower for kw in ["tradeoff", "trade-off", "alternative"]):
        strengths.append("Analyzed architectural tradeoffs and compared alternative solutions.")
    if has_metrics:
        strengths.append("Supported assertions with concrete, quantified metrics (latency, capacity).")
    
    strengths.append("Maintained a clear, professional technical communication tone.")
    
    # Map gaps
    if word_count < 50:
        gaps.append("Response too brief - failed to outline the context or architecture.")
    if word_count > 500:
        gaps.append("Response was slightly rambling - focus on structuring your key points concisely.")
    if not has_metrics:
        gaps.append("Lacks quantified impact metrics - add resource latency or scalability numbers.")
    if not has_star:
        gaps.append("Missing clear STAR structure - map out the Situation, Task, Action, and Result.")
        
    gaps.append("Did not explicitly discuss system scaling or caching tradeoffs.")

    # Select dynamic upgrades relevant to the interview loop type
    itype_key = session.get("type", "system design").lower()
    if "coding" in itype_key:
        type_key = "coding"
    elif "design" in itype_key:
        type_key = "system design"
    else:
        type_key = "behavioral"
        
    examples_list = REWRITE_EXAMPLES.get(type_key, REWRITE_EXAMPLES["system design"])
    example_rewrites = [random.choice(examples_list)]

    # Clean duplicates
    final_strengths = []
    for s in strengths:
        if s not in final_strengths:
            final_strengths.append(s)
    final_gaps = []
    for g in gaps:
        if g not in final_gaps:
            final_gaps.append(g)

    # 6. Transition to next question
    session["current_index"] += 1
    questions = session["questions"]
    curr_idx = session["current_index"]

    if curr_idx < len(questions):
        next_q = questions[curr_idx]
    else:
        next_q = None

    feedback_data = MockAnswerFeedback(
        strengths=final_strengths[:3],
        gaps=final_gaps[:3],
        score=final_score,
        potential_score=potential_score,
        growth_path=growth_path,
        streak_message=streak_message,
        example_rewrites=example_rewrites
    )

    return MockAnswerResponse(
        feedback=feedback_data,
        next_question=next_q
    )


# Define routes under both prefixes for max compatibility
@router.post("/api/interview/mock/start", response_model=MockStartResponse)
@limiter.limit("5/minute")
async def start_mock_api(request: Request, payload: MockStartRequest, db: Session = Depends(get_db)):
    company = payload.target_company
    itype = payload.interview_type
    if not company or not itype:
        profile = db.query(InterviewProfile).filter(InterviewProfile.id == payload.interview_profile_id).first()
        if profile:
            company = company or profile.target_company
            itype = itype or profile.interview_type
    
    payload.target_company = company or "Google"
    payload.interview_type = itype or "coding"
    return await create_mock_session_handler(payload)

@router.post("/interviews/mock/start", response_model=MockStartResponse)
@limiter.limit("5/minute")
async def start_mock_interviews(request: Request, payload: MockStartRequest, db: Session = Depends(get_db)):
    company = payload.target_company
    itype = payload.interview_type
    if not company or not itype:
        profile = db.query(InterviewProfile).filter(InterviewProfile.id == payload.interview_profile_id).first()
        if profile:
            company = company or profile.target_company
            itype = itype or profile.interview_type
    
    payload.target_company = company or "Google"
    payload.interview_type = itype or "coding"
    return await create_mock_session_handler(payload)

@router.post("/api/interview/mock/answer", response_model=MockAnswerResponse)
@limiter.limit("30/minute")
async def answer_mock_api(request: Request, payload: MockAnswerRequest):
    return await answer_mock_session_handler(payload)

@router.post("/interviews/mock/answer", response_model=MockAnswerResponse)
@limiter.limit("30/minute")
async def answer_mock_interviews(request: Request, payload: MockAnswerRequest):
    return await answer_mock_session_handler(payload)


# --- Mock Company Search and Recommendations ---

import json
from typing import Dict, Any, List
from fastapi import Query
from sqlalchemy.orm import Session
from app.core.database import get_db
from app.api.interview import (
    get_companies,
    search_local_companies,
    search_companies_llm,
    _recommendations_cache,
    get_roles,
    resolve_and_cache_new_role
)

@router.get("/api/interview/mock/companies/search", response_model=List[Dict[str, Any]])
@router.get("/interviews/mock/companies/search", response_model=List[Dict[str, Any]])
async def search_mock_companies(q: str = Query("", description="Search query")):
    local_results = search_local_companies(q)
    if len(q.strip()) >= 3 and len(local_results) < 3:
        llm_results = await search_companies_llm(q)
        existing_names = {c["name"].lower() for c in local_results}
        for c in llm_results:
            if c["name"].lower() not in existing_names:
                local_results.append(c)
                existing_names.add(c["name"].lower())
    return local_results[:15]

@router.get("/api/interview/mock/companies/recommend", response_model=List[Dict[str, Any]])
@router.get("/interviews/mock/companies/recommend", response_model=List[Dict[str, Any]])
async def recommend_mock_companies(
    resume_id: int = Query(..., description="ID of the resume to base recommendations on"),
    db: Session = Depends(get_db)
):
    if resume_id in _recommendations_cache:
        return _recommendations_cache[resume_id]
        
    from app.models.resume import Resume
    resume = db.query(Resume).filter(Resume.id == resume_id).first()
    if not resume:
        return get_companies()[:3]
        
    skills = resume.technical_skills or []
    exp_level = resume.experience_level or "Not Specified"
    
    companies = get_companies()
    
    from app.api.interview import settings, client, _model
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
                    
        if not matched_companies:
            matched_companies = companies[:3]
            
        _recommendations_cache[resume_id] = matched_companies
        return matched_companies
    except Exception as e:
        logger.error(f"Failed to recommend mock companies: {e}")
        return companies[:3]

# --- Mock Roles Search ---
@router.get("/api/interview/mock/roles/search", response_model=List[Dict[str, Any]])
@router.get("/interviews/mock/roles/search", response_model=List[Dict[str, Any]])
async def search_mock_roles(
    q: str = Query("", description="Search query"),
    cache_only: bool = Query(False, description="Whether to search local cache only (no LLM)"),
):
    roles = get_roles()
    query_clean = q.strip().lower()
    
    if not query_clean:
        return roles[:15]
        
    local_results = []
    query_words = [w for w in query_clean.split() if len(w) >= 2]
    seen_roles = set()
    
    # Tier 1: Exact Match
    for r in roles:
        r_name = r.get("name", "").lower()
        if r_name == query_clean:
            local_results.append(r)
            seen_roles.add(r_name)
            
    # Tier 2: Substring Match
    for r in roles:
        r_name = r.get("name", "").lower()
        if r_name not in seen_roles and query_clean in r_name:
            local_results.append(r)
            seen_roles.add(r_name)
            
    # Tier 3: All words matching
    if query_words:
        for r in roles:
            r_name = r.get("name", "").lower()
            if r_name not in seen_roles and all(w in r_name for w in query_words):
                local_results.append(r)
                seen_roles.add(r_name)

    if local_results or cache_only:
        return local_results[:15]
        
    resolved = await resolve_and_cache_new_role(q)
    if resolved:
        return [resolved]
        
    return []

# --- Mock Interactive Hint API ---
class MockHintRequest(BaseModel):
    session_id: int
    question: str
    user_transcript: str

@router.post("/api/interview/mock/hint")
@router.post("/interviews/mock/hint")
async def generate_mock_hint(payload: MockHintRequest):
    if settings.LLM_API_KEY and settings.LLM_API_KEY != "placeholder_key":
        prompt = f"""You are an elite technical interviewer conducting a mock interview.
The candidate is currently answering this question: "{payload.question}"
Their current draft answer is: "{payload.user_transcript}"

Provide a concise, highly practical, event-driven hint (1-2 sentences max) to guide the candidate. 
Do not give away the direct answer. Suggest what area they should elaborate on (e.g. STAR structure, metrics, caching tradeoffs, database choices, or key components).
Keep the tone encouraging, collaborative, and professional."""
        try:
            response = await client.chat.completions.create(
                model=_model,
                messages=[
                    {"role": "system", "content": "You are a helpful mock interviewer providing short hints."},
                    {"role": "user", "content": prompt}
                ],
                max_tokens=150,
                temperature=0.7
            )
            hint_text = response.choices[0].message.content.strip()
            return {"hint": hint_text}
        except Exception as e:
            logger.error(f"Failed to generate mock hint via LLM: {e}")
            
    return {"hint": "Consider structuring your response with clear context, action taken, and quantifiable results."}


# --- Mock Company Role Validation API ---
class MockRoleValidationRequest(BaseModel):
    company: str
    role: str

@router.post("/api/interview/mock/validate-role")
@router.post("/interviews/mock/validate-role")
async def validate_mock_role(payload: MockRoleValidationRequest):
    if settings.LLM_API_KEY and settings.LLM_API_KEY != "placeholder_key":
        prompt = f"""You are a tech company job role verification engine. 
Verify if the job role '{payload.role}' is a valid job position that exists, is hired for, or is relevant at '{payload.company}'. 

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
            logger.error(f"Mock role validation failed: {e}")
            
    # Mock fallback
    valid = payload.role.strip().lower() in ["software engineer", "frontend engineer", "backend engineer", "full stack engineer", "product manager", "intern", "data scientist", "devops engineer", "qa engineer"]
    return {
        "valid": valid or len(payload.role.strip()) > 3,
        "reason": "Role looks acceptable for a tech company." if (valid or len(payload.role.strip()) > 3) else "This role is not typically hired by this company."
    }


# --- Mock Company Roles API ---
class MockCompanyRolesRequest(BaseModel):
    company: str
    resume_id: Optional[int] = None

@router.post("/api/interview/mock/company-roles")
@router.post("/interviews/mock/company-roles")
async def get_mock_company_roles(payload: MockCompanyRolesRequest):
    if settings.LLM_API_KEY and settings.LLM_API_KEY != "placeholder_key":
        prompt = f"""Generate a list of exactly 10 real-world job roles/positions that '{payload.company}' hires for (both vacant and non-vacant positions).
Focus on technology, product, design, and engineering roles relevant to this specific company. Make sure the roles are realistic and actually exist/existed at '{payload.company}'.

Choose exactly 2 or 3 of these roles to mark as 'recommended' based on general suitability.

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
            if roles:
                return {
                    "roles": roles[:10],
                    "recommended": recommended
                }
        except Exception as e:
            logger.error(f"Mock company roles failed: {e}")
            
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
        "recommended": [fallback_roles[0], fallback_roles[3]]
    }


# --- Mock ASR Enrichment endpoints ---
from fastapi import File, Form, UploadFile

@router.post("/api/interview/mock/upload-answer-audio")
@router.post("/interviews/mock/upload-answer-audio")
async def mock_upload_answer_audio(
    session_id: int = Form(...),
    question_index: int = Form(...),
    audio: UploadFile = File(...),
):
    logger.info(f"[Mock-NIM-Audio] Uploaded audio for session {session_id}, question index {question_index}")
    return {"status": "saved", "question_index": question_index}

@router.post("/api/interview/mock/enrich")
@router.post("/interviews/mock/enrich")
async def mock_enrich_interview(
    payload: dict,
):
    session_id = payload.get("session_id")
    logger.info(f"[Mock-NIM-Enrich] Triggered ASR enrichment for session {session_id}")
    return {"status": "accepted", "session_id": session_id}



