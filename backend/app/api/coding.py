import logging
from datetime import datetime, timedelta
from typing import List, Dict, Any, Optional
from fastapi import APIRouter, Depends, HTTPException, Request, status
from pydantic import BaseModel
from sqlalchemy.orm import Session

from sqlalchemy.orm.attributes import flag_modified
from app.core.clerk_auth import get_current_user
from app.core.database import get_db
from app.core.rate_limit import limiter
from app.models.interview_session import InterviewSession
from app.models.resume import Resume
from app.models.interview_profile import InterviewProfile
from app.api.interview import settings, client, _model, _FAST_MODEL
import asyncio
import json
import os
import re
import time

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/coding", tags=["Coding Challenges"])

NUM_CODING_CHALLENGES = 3

# Input schemas
class CodeSubmissionItem(BaseModel):
    testCaseId: str
    passed: bool = False
    expected: str
    actual: str
    error: Optional[str] = None
    runtime: int

class CodingSubmissionRequest(BaseModel):
    session_id: int
    language: str
    code: str
    test_results: List[Dict[str, Any]]
    execution_time: int
    memory_used: int

class CodeQualityRequest(BaseModel):
    session_id: Optional[int] = None
    code: str
    language: str
    test_results: List[Dict[str, Any]]

async def generate_corrections_report(company: str, role: str, challenges: List[Dict], submissions: List[Dict]) -> List[Dict]:
    formatted_data = []
    for idx, challenge in enumerate(challenges):
        sub = submissions[idx] if idx < len(submissions) else {}
        formatted_data.append({
            "challengeTitle": challenge.get("title"),
            "challengeId": challenge.get("id"),
            "description": challenge.get("description"),
            "candidateCode": sub.get("code", ""),
            "language": sub.get("language", ""),
            "testResults": sub.get("test_results", [])
        })

    prompt = f"""You are an elite code reviewer and technical mentor. Analyze the candidate's implementation of 3 coding challenges for a '{role}' interview at '{company}'.
For each challenge, provide clear, constructive feedback on how they can improve their code logic, complexity, and readability.

Input Submissions:
{json.dumps(formatted_data, indent=2)}

CRITICAL REQUIREMENTS:
- Provide feedback in a structured JSON list conforming exactly to this schema:
[
  {{
    "challengeId": "slug-id",
    "challengeTitle": "Title of Question",
    "corrections": [
      "Point 1: Describe logic bugs, edge cases, time/space complexity improvements (e.g. O(N^2) to O(N)), or specific syntax corrections."
    ],
    "advancements": [
      "Point 1: Suggest advanced patterns, cleaner code style, naming, modularization, or optimization tips."
    ],
    "resources": [
      {{
        "name": "GeeksforGeeks: [Topic Name]",
        "link": "https://www.geeksforgeeks.org/analysis-of-algorithms-set-1-asymptotic-analysis/"
      }},
      {{
        "name": "YouTube: [Topic Name] Tutorial",
        "link": "https://www.youtube.com/results?search_query=neetcode+dsa"
      }}
    ]
  }}
]

Make sure all GeeksforGeeks and YouTube links are valid, fully formed, and working.
Return ONLY this JSON list. Do not wrap in markdown code fences or include any explanation."""

    try:
        response = await client.chat.completions.create(
            model=_model,
            messages=[
                {"role": "system", "content": "You are a precise technical feedback generator that outputs strictly valid JSON lists."},
                {"role": "user", "content": prompt}
            ],
            max_tokens=2500,
            temperature=0.3,
        )
        content = response.choices[0].message.content.strip()
        if content.startswith("```"):
            lines = content.splitlines()
            if lines[0].startswith("```"):
                lines = lines[1:]
            if lines and lines[-1].strip() == "```":
                lines = lines[:-1]
            content = "\n".join(lines).strip()
        return json.loads(content)
    except Exception as e:
        logger.error(f"Failed to generate corrections report: {e}")
        # Return a fallback feedback structure
        return [
            {
                "challengeId": c.get("id"),
                "challengeTitle": c.get("title"),
                "corrections": [
                    "Review code complexity and ensure all edge cases are covered.",
                    "Optimize algorithms to target linear time complexity where possible."
                ],
                "advancements": [
                    "Follow clean coding principles, using descriptive variable names.",
                    "Leverage built-in language APIs for optimized standard operations."
                ],
                "resources": [
                    {
                        "name": "GeeksforGeeks: Analysis of Algorithms",
                        "link": "https://www.geeksforgeeks.org/analysis-of-algorithms-set-1-asymptotic-analysis/"
                    },
                    {
                        "name": "YouTube: NeetCode DSA Tutorials",
                        "link": "https://www.youtube.com/results?search_query=neetcode+dsa"
                    }
                ]
            } for c in challenges
        ]

@router.post("/submit", status_code=status.HTTP_200_OK)
@limiter.limit("15/minute")
async def submit_coding_challenge(
    request: Request,
    payload: CodingSubmissionRequest,
    db: Session = Depends(get_db),
    current_user = Depends(get_current_user)
):
    """
    Save coding challenge submission to the database under InterviewSession feedback JSON.
    Handles B2B question sequence of 3 coding questions.
    """
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
            detail=f"Interview session {payload.session_id} not found."
        )

    # Save the submission records inside the session feedback
    current_feedback = dict(session.feedback) if session.feedback else {}
    current_idx = current_feedback.get("current_challenge_index", 0)
    
    submissions = current_feedback.get("coding_submissions", [])
    new_submission = {
        "language": payload.language,
        "code": payload.code,
        "test_results": payload.test_results,
        "execution_time": payload.execution_time,
        "memory_used": payload.memory_used,
        "submitted_at": datetime.utcnow().isoformat(),
        "question_index": current_idx
    }
    submissions.append(new_submission)
    current_feedback["coding_submissions"] = submissions

    # Increment current index
    next_idx = current_idx + 1
    current_feedback["current_challenge_index"] = next_idx

    # Check if all completed (NUM_CODING_CHALLENGES questions)
    if next_idx >= NUM_CODING_CHALLENGES:
        session.status = "completed"
        current_feedback["status"] = "completed"
        
        # Fetch profile company and role
        profile = db.query(InterviewProfile).filter(InterviewProfile.id == session.interview_profile_id).first()
        company = profile.target_company if profile else "Google"
        role = profile.role if profile else "Software Engineer"
        
        # Generate final "Corrections and Advancements" report using LLM
        corrections_report = await generate_corrections_report(
            company=company,
            role=role,
            challenges=current_feedback.get("coding_challenges", []),
            submissions=submissions
        )
        current_feedback["coding_corrections"] = corrections_report
        
        # Calculate final combined coding stats
        total_passed = sum(
            sum(1 for t in sub.get("test_results", []) if t.get("passed", False))
            for sub in submissions
        )
        total_tests = sum(
            len(sub.get("test_results", []))
            for sub in submissions
        )
        current_feedback["coding_stats"] = {
            "total_tests_passed": total_passed,
            "total_tests": total_tests,
            "timestamp": datetime.utcnow().isoformat()
        }
        
        session.feedback = current_feedback
        flag_modified(session, "feedback")
        db.commit()
        db.refresh(session)
        
        return {
            "success": True,
            "all_completed": True,
            "session_id": session.id,
            "stats": current_feedback["coding_stats"],
            "corrections": corrections_report
        }
    else:
        # Save state and return next index
        session.feedback = current_feedback
        flag_modified(session, "feedback")
        db.commit()
        db.refresh(session)
        return {
            "success": True,
            "all_completed": False,
            "session_id": session.id,
            "next_question_index": next_idx
        }


class CodeRunRequest(BaseModel):
    session_id: int
    language: str
    code: str


FALLBACK_CODING_CHALLENGES = [
  {
    "id": "two-sum",
    "title": "Two Sum",
    "description": "Given an array of integers nums and an integer target, return the indices of the two numbers that add up to the target. You may assume that each input would have exactly one solution, and you may not use the same element twice.",
    "difficulty": "medium",
    "timeLimit": 30,
    "languages": ["javascript", "python", "cpp"],
    "starterCode": {
      "javascript": "function twoSum(nums, target) {\n  // Write your solution here\n  return [];\n}",
      "python": "def twoSum(nums, target):\n    # Write your solution here\n    return []",
      "cpp": "class Solution {\npublic:\n    vector<int> twoSum(vector<int>& nums, int target) {\n        // Write your solution here\n        return {};\n    }\n};"
    },
    "testCases": [
      { "id": "t1", "input": "nums = [2,7,11,15], target = 9", "expectedOutput": "[0, 1]", "isHidden": False },
      { "id": "t2", "input": "nums = [3,2,4], target = 6", "expectedOutput": "[1, 2]", "isHidden": False },
      { "id": "t3", "input": "nums = [3,3], target = 6", "expectedOutput": "[0, 1]", "isHidden": True }
    ],
    "constraints": ["2 <= nums.length <= 10^4", "-10^9 <= nums[i] <= 10^9", "-10^9 <= target <= 10^9"]
  },
  {
    "id": "palindrome-number",
    "title": "Palindrome Number",
    "description": "Given an integer x, return true if x is a palindrome, and false otherwise.",
    "difficulty": "medium",
    "timeLimit": 15,
    "languages": ["javascript", "python", "cpp"],
    "starterCode": {
      "javascript": "function isPalindrome(x) {\n  // Write your solution here\n  return false;\n}",
      "python": "def isPalindrome(x):\n    # Write your solution here\n    return False",
      "cpp": "class Solution {\npublic:\n    bool isPalindrome(int x) {\n        // Write your solution here\n        return false;\n    }\n};"
    },
    "testCases": [
      { "id": "t1", "input": "x = 121", "expectedOutput": "true", "isHidden": False },
      { "id": "t2", "input": "x = -121", "expectedOutput": "false", "isHidden": False },
      { "id": "t3", "input": "x = 10", "expectedOutput": "false", "isHidden": True }
    ],
    "constraints": ["-2^31 <= x <= 2^31 - 1"]
  },
  {
    "id": "valid-parentheses",
    "title": "Valid Parentheses",
    "description": "Given a string s containing just the characters '(', ')', '{', '}', '[' and ']', determine if the input string is valid.",
    "difficulty": "medium",
    "timeLimit": 20,
    "languages": ["javascript", "python", "cpp"],
    "starterCode": {
      "javascript": "function isValid(s) {\n  // Write your solution here\n  return false;\n}",
      "python": "def isValid(s):\n    # Write your solution here\n    return False",
      "cpp": "class Solution {\npublic:\n    bool isValid(string s) {\n        // Write your solution here\n        return false;\n    }\n};"
    },
    "testCases": [
      { "id": "t1", "input": "s = \"()\"", "expectedOutput": "true", "isHidden": False },
      { "id": "t2", "input": "s = \"()[]{}\"", "expectedOutput": "true", "isHidden": False },
      { "id": "t3", "input": "s = \"(]\"", "expectedOutput": "false", "isHidden": True }
    ],
    "constraints": ["1 <= s.length <= 10^4", "s consists of parentheses only '()[]{}'."]
  }
]

_coding_challenges_cache: Dict[tuple, Dict[str, Any]] = {}

def get_company_engineering_focus(company_name: str, industry: str = "", interview_style: str = "") -> str:
    name_lower = company_name.lower()
    ind_lower = industry.lower()
    style_lower = interview_style.lower()
    
    # Big tech / Tier 1
    if any(bt in name_lower for bt in ["google", "meta", "facebook", "microsoft", "netflix", "apple", "amazon", "databricks", "snowflake", "openai", "anthropic", "nvidia", "palantir"]):
        return "FAANG-algorithmic"
    # Fintech
    if "fintech" in ind_lower or "blockchain" in ind_lower or "web3" in ind_lower or any(ft in name_lower for ft in ["stripe", "affirm", "coinbase", "ramp", "revolut", "wise", "gusto", "robinhood", "brex", "sofi", "carta", "klarna", "marqeta"]):
        return "fintech-systems"
    # Infrastructure / Cloud / DevOps
    if "infrastructure" in ind_lower or "devops" in ind_lower or "developer tools" in ind_lower or any(inf in name_lower for inf in ["cloudflare", "akamai", "digitalocean", "fly.io", "railway", "render", "docker", "heroku", "pagerduty", "datadog", "sentry", "vercel", "supabase", "neon", "resend", "postman", "circleci", "harness", "git"]):
        return "infrastructure-scale"
    
    # Defaults
    if "algorithmic" in style_lower:
        return "FAANG-algorithmic"
    if "system" in style_lower or "scale" in style_lower or "architectural" in style_lower:
        return "infrastructure-scale"
        
    return "startup-practical"

def log_generation_attempt(session_id: int, attempt: int, outcome: str, duration: float):
    try:
        log_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", "logs"))
        os.makedirs(log_dir, exist_ok=True)
        log_path = os.path.join(log_dir, "coding_generation.log")
        timestamp = datetime.utcnow().isoformat()
        log_line = f"[{timestamp}] session={session_id} attempt={attempt} outcome={outcome} duration={duration:.2f}s\n"
        with open(log_path, "a", encoding="utf-8") as f:
            f.write(log_line)
    except Exception as le:
        logger.error(f"[Coding-BgGen] Failed to write to log file: {le}")

async def _generate_coding_challenges_in_background(
    session_id: int,
    company: str,
    role: str,
    experience_level: str
) -> None:
    """
    Background worker to resolve company focus, check question cache,
    generate 3 customized practice questions (Part B) and swap them into the session feedback.
    Never blocks session-start.
    """
    from app.core.database import SessionLocal
    db = SessionLocal()
    try:
        session = db.query(InterviewSession).filter(InterviewSession.id == session_id).first()
        if not session:
            logger.error(f"[Coding-BgGen] Session {session_id} not found.")
            return

        # 1. Determine company engineering focus
        from app.api.interview import get_companies
        companies = get_companies()
        company_record = None
        for c in companies:
            if c.get("name", "").strip().lower() == company.strip().lower():
                company_record = c
                break
                
        industry = company_record.get("industry", "") if company_record else ""
        style = company_record.get("interview_style", "") if company_record else ""
        focus = get_company_engineering_focus(company, industry, style)
        
        # 2. Map difficulty level
        diff = "medium"
        exp = experience_level.lower()
        if "senior" in exp or "lead" in exp or "staff" in exp or "principal" in exp:
            diff = "hard"
        elif "junior" in exp or "intern" in exp or "entry" in exp:
            diff = "medium"
            
        # 3. Check Cache
        cache_key = (company.strip().lower(), role.strip().lower(), diff)
        now = datetime.utcnow()
        cached = _coding_challenges_cache.get(cache_key)
        
        if cached and (now - cached["timestamp"]) < timedelta(hours=24):
            logger.info(f"[Coding-BgGen] Cache hit for key {cache_key}. Swapping questions.")
            challenges_list = cached["challenges"]
        else:
            logger.info(f"[Coding-BgGen] Cache miss for key {cache_key}. Generating via LLM.")
            prompt = f"""You are an elite technical interviewer. Generate exactly 3 personalized coding challenges/practice questions in the typical style of '{company}' for a candidate interviewing for the position of '{role}' (Experience Level: '{diff}').

Engineering Focus profile of '{company}': {focus}

CRITICAL REQUIREMENTS:
- The difficulty of the generated questions MUST be '{diff}'.
- Tailor the questions specifically to the company's focus/tier profile:
  - FAANG-algorithmic: High difficulty algorithmic, graph, dynamic programming, or advanced tree/array questions.
  - fintech-systems: Medium to Hard algorithmic or system-oriented coding questions (e.g. custom LRU cache, Rate Limiter, Trie search, concurrent schedulers).
  - infrastructure-scale: Scale-oriented utility coding, custom parsers, networking, concurrent/async queues, or stream processing.
  - startup-practical: Medium utility functions, practical algorithms, API clients, or structured text/data processing.
- Make sure each question has exactly 3 language starters: 'javascript', 'python', 'cpp'.
- Make sure starter code function signatures are synchronized and consistent across languages.
- You MUST respond with a single, valid JSON list containing exactly 3 objects matching the structure below.
- Do NOT wrap in markdown fences or include any explanation.

Example JSON output structure:
[
  {{
    "id": "a-unique-lowercase-slug-like-two-sum",
    "title": "Title of the Question",
    "description": "Complete problem statement. 2-3 sentences max.",
    "difficulty": "{diff}",
    "timeLimit": 30,
    "languages": ["javascript", "python", "cpp"],
    "starterCode": {{
      "javascript": "function myFunctionName(arg1, arg2) {{\\n  // Write solution\\n  return ...;\\n}}",
      "python": "def myFunctionName(arg1, arg2):\\n    # Write solution\\n    return ...",
      "cpp": "class Solution {{\\npublic:\\n    ... myFunctionName(... arg1, ... arg2) {{\\n        // Write solution\\n        return ...;\\n    }}\\n}};"
    }},
    "testCases": [
      {{
        "id": "t1",
        "input": "arg1 = ..., arg2 = ...",
        "expectedOutput": "expected return value as string",
        "isHidden": False
      }},
      {{
        "id": "t2",
        "input": "...",
        "expectedOutput": "...",
        "isHidden": False
      }},
      {{
        "id": "t3",
        "input": "...",
        "expectedOutput": "...",
        "isHidden": True
      }}
    ],
    "constraints": [
      "Constraint 1"
    ]
  }}
]
"""
            max_retries = 2
            challenges_list = None
            for attempt in range(max_retries + 1):
                start_time = time.time()
                try:
                    response = await client.chat.completions.create(
                        model=_FAST_MODEL,
                        messages=[
                            {"role": "system", "content": "You are a precise coding challenge generator that outputs strictly valid JSON lists."},
                            {"role": "user", "content": prompt}
                        ],
                        max_tokens=3000,
                        temperature=0.1,
                    )
                    content_raw = response.choices[0].message.content
                    if not content_raw:
                        raise ValueError("Model returned empty content (None)")
                    content = content_raw.strip()
                    
                    # Extract robust JSON list using regex
                    match = re.search(r'\[\s*\{.*\}\s*\]', content, re.DOTALL)
                    if not match:
                        match = re.search(r'\[.*\]', content, re.DOTALL)
                        
                    if match:
                        content_json = match.group(0)
                    else:
                        content_json = content
                        
                    challenges_list = json.loads(content_json)
                    duration = time.time() - start_time
                    log_generation_attempt(session_id, attempt + 1, "success", duration)
                    break
                except Exception as e:
                    duration = time.time() - start_time
                    outcome_str = type(e).__name__
                    if "timeout" in outcome_str.lower() or "timeout" in str(e).lower():
                        outcome_str = "timeout"
                    else:
                        outcome_str = f"{outcome_str}: {str(e)[:300]}"
                    log_generation_attempt(session_id, attempt + 1, outcome_str, duration)
                    
                    if attempt < max_retries:
                        backoff = 3 if attempt == 0 else 8
                        logger.warning(f"[Coding-BgGen] Generation attempt {attempt + 1} failed: {e}. Retrying in {backoff}s...")
                        await asyncio.sleep(backoff)
                    else:
                        logger.error(f"[Coding-BgGen] Coding challenge generation failed after all retries. Falling back to static challenges. Exception: {e}")
                        raise e
            
            _coding_challenges_cache[cache_key] = {
                "challenges": challenges_list,
                "timestamp": now
            }
            logger.info(f"[Coding-BgGen] Cached new questions for key {cache_key}.")

        current_feedback = dict(session.feedback) if session.feedback else {}
        current_feedback["coding_challenges"] = challenges_list
        current_feedback["question_source"] = "generator"
        session.feedback = current_feedback
        session.question_source = "generator"
        flag_modified(session, "feedback")
        db.commit()
        db.refresh(session)
        logger.info(f"[Coding-BgGen] Session {session_id} questions swapped successfully.")
        
    except Exception as e:
        logger.error(f"[Coding-BgGen] Failed to generate/swap coding questions: {e}")
    finally:
        db.close()

@router.get("/challenge", status_code=status.HTTP_200_OK)
async def get_coding_challenge(
    session_id: Optional[int] = None,
    db: Session = Depends(get_db),
    current_user = Depends(get_current_user)
):
    """
    Get a coding challenge for the session index. Read from pre-generated challenges in session.feedback.
    Falls back instantly to static challenges to prevent blocking.
    """
    if session_id is not None:
        session = (
            db.query(InterviewSession)
            .filter(
                InterviewSession.id == session_id,
                InterviewSession.user_id == current_user.clerk_user_id
            )
            .first()
        )
    else:
        session = (
            db.query(InterviewSession)
            .filter(InterviewSession.user_id == current_user.clerk_user_id)
            .order_by(InterviewSession.id.desc())
            .first()
        )

    if not session:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="No interview session found."
        )

    feedback = session.feedback or {}
    current_idx = feedback.get("current_challenge_index", 0)
    challenges = feedback.get("coding_challenges", [])

    if current_idx >= NUM_CODING_CHALLENGES:
        return {"completed": True, "sessionId": session.id}

    total_challenges = len(challenges) if challenges else NUM_CODING_CHALLENGES

    if current_idx < len(challenges):
        challenge_data = dict(challenges[current_idx])
        challenge_data["sessionId"] = session.id
        challenge_data["questionIndex"] = current_idx
        challenge_data["questionSource"] = session.question_source or "fallback"
        challenge_data["totalChallenges"] = total_challenges
        return challenge_data
        
    fallback_challenge = FALLBACK_CODING_CHALLENGES[current_idx % len(FALLBACK_CODING_CHALLENGES)]
    challenge_response = dict(fallback_challenge)
    challenge_response["sessionId"] = session.id
    challenge_response["questionIndex"] = current_idx
    challenge_response["questionSource"] = session.question_source or "fallback"
    challenge_response["totalChallenges"] = total_challenges
    return challenge_response


def _execute_code(lang: str, code: str, test_cases: List[Dict]) -> List[Dict]:
    """
    Execute candidate code against the challenge test cases in a real local
    sandboxed subprocess. Supports python, javascript, and cpp.
    Returns per-test results identical in shape to py_runner/js_runner output.
    Raises ValueError for unsupported languages.
    """
    import tempfile
    import os
    import sys
    import subprocess

    lang = lang.lower()

    if lang not in ["python", "javascript", "cpp"]:
        raise ValueError(f"Language {lang} is not supported for local sandboxed execution.")

    # Paths to runner scripts
    api_dir = os.path.dirname(os.path.abspath(__file__))
    services_dir = os.path.join(os.path.dirname(api_dir), "services")

    runner_script = {
        "python": "py_runner.py",
        "javascript": "js_runner.js",
        "cpp": "cpp_runner.py",
    }[lang]
    runner_path = os.path.join(services_dir, runner_script)

    # Create temporary JSON file for inputs
    temp_json = tempfile.NamedTemporaryFile(mode="w+", delete=False, suffix=".json", encoding="utf-8")
    try:
        json.dump({
            "code": code,
            "testCases": test_cases
        }, temp_json)
        temp_json.close()

        # Build command
        if lang == "javascript":
            cmd = ["node", runner_path, temp_json.name]
        else:
            cmd = [sys.executable, runner_path, temp_json.name]

        # C++ compilation happens inside cpp_runner.py; give it extra headroom.
        timeout_secs = 15.0 if lang == "cpp" else 4.0

        # Execute subprocess
        try:
            proc = subprocess.run(
                cmd,
                capture_output=True,
                text=True,
                timeout=timeout_secs
            )

            # Check stderr or crash
            if proc.returncode != 0:
                logger.error(f"Runner subprocess failed: stdout={proc.stdout}, stderr={proc.stderr}")
                return [
                    {
                        "testCaseId": tc.get("id"),
                        "passed": False,
                        "expected": tc.get("expectedOutput"),
                        "actual": "Execution crash or compile error",
                        "error": proc.stderr.strip() or f"Runner exited with code {proc.returncode}",
                        "runtime": 0
                    } for tc in test_cases
                ]

            # Parse stdout
            results_list = json.loads(proc.stdout.strip())
            return results_list

        except subprocess.TimeoutExpired:
            logger.warning(f"Code execution timed out for language {lang}")
            return [
                {
                    "testCaseId": tc.get("id"),
                    "passed": False,
                    "expected": tc.get("expectedOutput"),
                    "actual": "Time Limit Exceeded",
                    "error": "Execution timed out after 4 seconds (infinite loop protection).",
                    "runtime": 4000
                } for tc in test_cases
            ]
        except Exception as run_err:
            logger.error(f"Error running sandbox subprocess: {run_err}")
            return [
                {
                    "testCaseId": tc.get("id"),
                    "passed": False,
                    "expected": tc.get("expectedOutput"),
                    "actual": "Sandbox pipeline error",
                    "error": str(run_err),
                    "runtime": 0
                } for tc in test_cases
            ]

    finally:
        # Clean up temporary JSON file
        if os.path.exists(temp_json.name):
            try:
                os.remove(temp_json.name)
            except Exception as rm_err:
                logger.warning(f"Failed to remove temporary file {temp_json.name}: {rm_err}")


@router.post("/run", status_code=status.HTTP_200_OK)
@limiter.limit("20/minute")
async def run_coding_challenge(
    request: Request,
    payload: CodeRunRequest,
    db: Session = Depends(get_db),
    current_user = Depends(get_current_user)
):
    """
    Evaluate the candidate's code against the challenge test cases using real local sandboxed execution.
    """
    # 1. Fetch Session
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
            detail=f"Interview session {payload.session_id} not found."
        )

    # 2. Get Challenge details from session feedback list using current index
    feedback = session.feedback or {}
    current_idx = feedback.get("current_challenge_index", 0)
    challenges = feedback.get("coding_challenges", [])
    
    if not challenges or current_idx >= len(challenges):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="No active coding challenge has been initialized for this session."
        )
        
    challenge = challenges[current_idx]
    test_cases = challenge.get("testCases", [])

    lang = payload.language.lower()

    try:
        results_list = _execute_code(lang, payload.code, test_cases)
    except ValueError as ve:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(ve)
        )
    return results_list


@router.post("/quality", status_code=status.HTTP_200_OK)
@limiter.limit("20/minute")
async def evaluate_code_quality(
    request: Request,
    payload: CodeQualityRequest,
    current_user = Depends(get_current_user)
):
    """
    Evaluate the candidate's code quality, returning a score, strengths, gaps, and suggestions.
    Grounded in real test results.
    """
    code = payload.code.strip()
    
    # 1. Strip comments/whitespace to check for stub/empty code
    cleaned_code = re.sub(r'#.*', '', code)  # Python comments
    cleaned_code = re.sub(r'//.*', '', cleaned_code)  # JS single-line comments
    cleaned_code = re.sub(r'/\*[\s\S]*?\*/', '', cleaned_code)  # JS multi-line comments
    cleaned_code = "".join(cleaned_code.split())  # strip all whitespace
    
    is_stub = len(cleaned_code) < 50 or not cleaned_code
    
    if is_stub:
        score = 1.0 if len(code) > 0 else 0.0
        return {
            "score": score,
            "strengths": [],
            "gaps": ["No solution was written.", "Code only contains templates or is completely empty."],
            "suggestions": ["Write a complete implementation of the coding challenge solution function."],
            "codeQuality": f"{score}/10"
        }

    # 2. Determine pass rate from real execution results
    test_results = payload.test_results
    total_tests = len(test_results)
    passed_tests = sum(1 for r in test_results if r.get("passed", False))

    pass_rate = passed_tests / total_tests if total_tests > 0 else 0.0
    
    has_errors = any(r.get("error") is not None for r in test_results)
    
    # 3. Handle zero pass rate or compilation failure
    if pass_rate == 0.0:
        score = 2.0 if has_errors else 3.0
        return {
            "score": score,
            "strengths": ["Code structure set up."],
            "gaps": ["Compilation/runtime error encountered." if has_errors else "All test cases failed assertion."],
            "suggestions": ["Debug syntax/runtime errors.", "Correct the logical implementation to output expected return values."],
            "codeQuality": f"{score}/10"
        }

    # 4. Handle partial pass rate
    if pass_rate < 1.0:
        score = round(4.0 + (pass_rate * 2.0), 1)  # scaled between 4.0 and 6.0
        return {
            "score": score,
            "strengths": [f"Passed {passed_tests} out of {total_tests} test cases."],
            "gaps": ["Code failed on some test cases (e.g., edge cases or negative numbers)."],
            "suggestions": ["Verify code logical constraints.", "Add check conditions for empty/boundary inputs."],
            "codeQuality": f"{score}/10"
        }

    # 5. All tests passed (pass_rate == 1.0): Use LLM to evaluate efficiency and style
    # Score range: 7.0 - 10.0
    prompt = f"""You are an elite code quality assessor. Rate the candidate's code on a scale of 7.0 to 10.0 because it successfully passed all test cases.
Evaluate the code for time complexity (O(N) vs O(N^2)), space complexity, readability, and variable naming conventions.

Language: {payload.language}
Candidate Code:
```
{payload.code}
```

Format your response as a strictly valid JSON object conforming to this structure:
{{
  "score": 8.5, // float between 7.0 and 10.0
  "strengths": ["string"],
  "gaps": ["string"],
  "suggestions": ["string"]
}}

Return ONLY this JSON object. Do not wrap in markdown code fences, do not include any conversation or explanation."""

    try:
        response = await client.chat.completions.create(
            model=_model,
            messages=[
                {"role": "system", "content": "You are a precise code quality feedback generator that outputs strictly valid JSON objects."},
                {"role": "user", "content": prompt}
            ],
            max_tokens=800,
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
            
        data = json.loads(content)
        score = min(10.0, max(7.0, float(data.get("score", 8.0))))
        
        return {
            "score": score,
            "strengths": data.get("strengths", ["Optimal code solution."]),
            "gaps": data.get("gaps", []),
            "suggestions": data.get("suggestions", []),
            "codeQuality": f"{score}/10"
        }
    except Exception as e:
        logger.error(f"Failed to call LLM for code quality assessment: {e}")
        # Default fallback for passing code
        return {
            "score": 8.0,
            "strengths": ["Code passed all test cases.", "Good structure."],
            "gaps": ["Could not perform deep algorithmic analysis."],
            "suggestions": ["Ensure variable names follow language style guidelines."],
            "codeQuality": "8.0/10"
        }
