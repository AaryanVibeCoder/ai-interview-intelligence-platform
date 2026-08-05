import logging
from datetime import datetime, timedelta
from typing import List, Dict, Any, Optional
from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from sqlalchemy.orm import Session

from sqlalchemy.orm.attributes import flag_modified
from app.core.clerk_auth import get_current_user
from app.core.database import get_db
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
async def submit_coding_challenge(
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

    # Check if all completed (3 questions)
    if next_idx >= 3:
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
                        temperature=0.7,
                    )
                    content = response.choices[0].message.content.strip()
                    
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

    if current_idx >= 3:
        return {"completed": True, "sessionId": session.id}

    if current_idx < len(challenges):
        challenge_data = dict(challenges[current_idx])
        challenge_data["sessionId"] = session.id
        challenge_data["questionIndex"] = current_idx
        challenge_data["questionSource"] = session.question_source or "fallback"
        return challenge_data
        
    fallback_challenge = FALLBACK_CODING_CHALLENGES[current_idx % len(FALLBACK_CODING_CHALLENGES)]
    challenge_response = dict(fallback_challenge)
    challenge_response["sessionId"] = session.id
    challenge_response["questionIndex"] = current_idx
    challenge_response["questionSource"] = session.question_source or "fallback"
    return challenge_response


@router.post("/run", status_code=status.HTTP_200_OK)
async def run_coding_challenge(
    payload: CodeRunRequest,
    db: Session = Depends(get_db),
    current_user = Depends(get_current_user)
):
    """
    Evaluate the candidate's code against the challenge test cases using the LLM.
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

    # 3. Call LLM to evaluate the code
    prompt = f"""You are an elite code execution, compilation, and evaluation engine. 
Evaluate the candidate's code for the given challenge against each of the test cases.

Challenge Title: {challenge.get('title')}
Problem Description: {challenge.get('description')}
Constraints: {json.dumps(challenge.get('constraints', []))}

Candidate Language: {payload.language}
Candidate Code:
```
{payload.code}
```

Test Cases to run:
{json.dumps(test_cases, indent=2)}

For each test case, determine:
1. Does the candidate's code (when completed and run) correctly solve the test case and match the expected output? (boolean 'passed')
2. What is the actual output or error message returned by the execution? (string 'actual')
3. Any syntax errors, runtime exceptions, or infinite loops? (string 'error', null if none)
4. A realistic simulation of execution runtime in milliseconds (integer 'runtime', e.g., 5, 12, etc.)

You MUST respond with a single, valid JSON list of test case results conforming exactly to this structure:
[
  {{
    "testCaseId": "t1",
    "passed": true/false,
    "expected": "expected output",
    "actual": "actual output or error",
    "error": null or "error description",
    "runtime": 12 // integer ms
  }},
  ...
]

Evaluate strictly and accurately. Do not let incorrect code pass.
Return ONLY this JSON list. Do not wrap in markdown backticks or include any explanation."""

    try:
        response = await client.chat.completions.create(
            model=_model,
            messages=[
                {"role": "system", "content": "You are a precise code execution evaluator that outputs strictly valid JSON lists."},
                {"role": "user", "content": prompt}
            ],
            max_tokens=600,
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

        results_list = json.loads(content)
        return results_list
    except Exception as e:
        logger.error(f"Failed to evaluate code execution via LLM: {e}")
        # Fallback response in case LLM fails
        return [
            {
                "testCaseId": tc.get("id"),
                "passed": False,
                "expected": tc.get("expectedOutput"),
                "actual": "Evaluation pipeline timeout",
                "error": str(e),
                "runtime": 0
            } for tc in test_cases
        ]

