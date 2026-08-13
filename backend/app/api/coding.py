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
from app.api.interview import settings, client, _model, _tiered_chat
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
        response, tier = await _tiered_chat(
            messages=[
                {"role": "system", "content": "You are a precise technical feedback generator that outputs strictly valid JSON lists."},
                {"role": "user", "content": prompt}
            ],
            max_tokens=2500,
            temperature=0.3,
            call_site="corrections",
        )
        logger.info("[Corrections] tier=%s", tier)
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
    
    challenges = current_feedback.get("coding_challenges", [])
    if current_idx < len(challenges):
        challenge = challenges[current_idx]
    else:
        challenge = FALLBACK_CODING_CHALLENGES[current_idx % len(FALLBACK_CODING_CHALLENGES)]
    test_cases = challenge.get("testCases", [])

    # Run the submitted code server-side using _execute_code
    try:
        real_results = _execute_code(payload.language.lower(), payload.code, test_cases, challenge)
    except ValueError as ve:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(ve)
        )
    except Exception as run_err:
        logger.error(f"Error running sandbox subprocess in submit: {run_err}")
        real_results = [
            {
                "testCaseId": tc.get("id"),
                "passed": False,
                "expected": tc.get("expectedOutput"),
                "actual": "Sandbox pipeline error",
                "error": str(run_err),
                "runtime": 0
            } for tc in test_cases
        ]

    real_execution_time = sum(t.get("runtime", 0) for t in real_results)

    submissions = current_feedback.get("coding_submissions", [])
    new_submission = {
        "language": payload.language,
        "code": payload.code,
        "test_results": real_results,
        "execution_time": real_execution_time,
        "memory_used": payload.memory_used,
        "submitted_at": datetime.utcnow().isoformat(),
        "question_index": current_idx,
        "server_verified": True
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
            "corrections": corrections_report,
            "test_results": real_results,
            "execution_time": real_execution_time
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
            "next_question_index": next_idx,
            "test_results": real_results,
            "execution_time": real_execution_time
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
    "languages": ["javascript", "python"],
    "starterCode": {
      "javascript": "function solve(nums, target) {\n  // Write your solution here\n  return [];\n}",
      "python": "def solve(nums, target):\n    # Write your solution here\n    return []"
    },
    "function": {
      "name": "solve",
      "arguments": [
        {"name": "nums", "type": "integer_array"},
        {"name": "target", "type": "integer"}
      ],
      "returnType": "integer_array"
    },
    "testCases": [
      { "id": "t1", "input": "nums = [2,7,11,15], target = 9", "args": [[2, 7, 11, 15], 9], "expectedOutput": [0, 1], "isHidden": False },
      { "id": "t2", "input": "nums = [3,2,4], target = 6", "args": [[3, 2, 4], 6], "expectedOutput": [1, 2], "isHidden": False },
      { "id": "t3", "input": "nums = [3,3], target = 6", "args": [[3, 3], 6], "expectedOutput": [0, 1], "isHidden": True }
    ],
    "constraints": ["2 <= nums.length <= 10^4", "-10^9 <= nums[i] <= 10^9", "-10^9 <= target <= 10^9"],
    "referenceImplementations": {
      "javascript": "function solve(nums, target) {\n  const map = new Map();\n  for (let i = 0; i < nums.length; i++) {\n    const complement = target - nums[i];\n    if (map.has(complement)) {\n      return [map.get(complement), i];\n    }\n    map.set(nums[i], i);\n  }\n  return [];\n}",
      "python": "def solve(nums, target):\n    mapping = {}\n    for i, num in enumerate(nums):\n        complement = target - num\n        if complement in mapping:\n            return [mapping[complement], i]\n        mapping[num] = i\n    return []"
    },
    "bruteForceImplementations": {
      "python": "def solve(nums, target):\n    for i in range(len(nums)):\n        for j in range(i + 1, len(nums)):\n            if nums[i] + nums[j] == target:\n                return [i, j]\n    return []"
    }
  },
  {
    "id": "palindrome-number",
    "title": "Palindrome Number",
    "description": "Given an integer x, return true if x is a palindrome, and false otherwise.",
    "difficulty": "medium",
    "timeLimit": 15,
    "languages": ["javascript", "python"],
    "starterCode": {
      "javascript": "function solve(x) {\n  // Write your solution here\n  return false;\n}",
      "python": "def solve(x):\n    # Write your solution here\n    return False"
    },
    "function": {
      "name": "solve",
      "arguments": [
        {"name": "x", "type": "integer"}
      ],
      "returnType": "boolean"
    },
    "testCases": [
      { "id": "t1", "input": "x = 121", "args": [121], "expectedOutput": True, "isHidden": False },
      { "id": "t2", "input": "x = -121", "args": [-121], "expectedOutput": False, "isHidden": False },
      { "id": "t3", "input": "x = 10", "args": [10], "expectedOutput": False, "isHidden": True }
    ],
    "constraints": ["-2^31 <= x <= 2^31 - 1"],
    "referenceImplementations": {
      "javascript": "function solve(x) {\n  if (x < 0) return false;\n  let rev = 0;\n  let temp = x;\n  while (temp > 0) {\n    rev = rev * 10 + (temp % 10);\n    temp = Math.floor(temp / 10);\n  }\n  return rev === x;\n}",
      "python": "def solve(x):\n    if x < 0: return False\n    return str(x) == str(x)[::-1]"
    }
  },
  {
    "id": "valid-parentheses",
    "title": "Valid Parentheses",
    "description": "Given a string s containing just the characters '(', ')', '{', '}', '[' and ']', determine if the input string is valid.",
    "difficulty": "medium",
    "timeLimit": 20,
    "languages": ["javascript", "python"],
    "starterCode": {
      "javascript": "function solve(s) {\n  // Write your solution here\n  return false;\n}",
      "python": "def solve(s):\n    # Write your solution here\n    return False"
    },
    "function": {
      "name": "solve",
      "arguments": [
        {"name": "s", "type": "string"}
      ],
      "returnType": "boolean"
    },
    "testCases": [
      { "id": "t1", "input": "s = \"()\"", "args": ["()"], "expectedOutput": True, "isHidden": False },
      { "id": "t2", "input": "s = \"()[]{}\"", "args": ["()[]{}"], "expectedOutput": True, "isHidden": False },
      { "id": "t3", "input": "s = \"(]\"", "args": ["(]"], "expectedOutput": False, "isHidden": True }
    ],
    "constraints": ["1 <= s.length <= 10^4", "s consists of parentheses only '()[]{}'."],
    "referenceImplementations": {
      "javascript": "function solve(s) {\n  const stack = [];\n  const map = { ')': '(', '}': '{', ']': '[' };\n  for (const char of s) {\n    if (char in map) {\n      if (stack.pop() !== map[char]) return false;\n    } else {\n      stack.push(char);\n    }\n  }\n  return stack.length === 0;\n}",
      "python": "def solve(s):\n    stack = []\n    mapping = {')': '(', '}': '{', ']': '['}\n    for char in s:\n        if char in mapping:\n            top_element = stack.pop() if stack else '#'\n            if mapping[char] != top_element:\n                return False\n        else:\n            stack.append(char)\n    return not stack"
    }
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

def clean_json_content(content: str) -> str:
    content = content.strip()
    
    # 1. Strip markdown code block fences if present
    if content.startswith("```"):
        lines = content.splitlines()
        if lines[0].startswith("```"):
            lines = lines[1:]
        if lines and lines[-1].strip() == "```":
            lines = lines[:-1]
        content = "\n".join(lines).strip()
        
    # 2. Fix unescaped newlines in JSON string literals
    in_string = False
    escaped = False
    cleaned = []
    for char in content:
        if char == '"' and not escaped:
            in_string = not in_string
            cleaned.append(char)
        elif char == '\\' and not escaped:
            escaped = True
            cleaned.append(char)
        elif char == '\n' and in_string:
            cleaned.append('\\n')
        else:
            escaped = char == '\\' and not escaped
            cleaned.append(char)
    content = "".join(cleaned)
    
    # 3. Clean up trailing commas in objects and arrays
    content = re.sub(r',\s*\}', '}', content)
    content = re.sub(r',\s*\]', ']', content)
    
    return content

async def generate_challenges_for_session(
    company: str,
    role: str,
    experience_level: str,
    session_id: Optional[int] = None
) -> List[Dict[str, Any]]:
    """
    Resolve Focus, Difficulty, check cache, and generate 3 custom challenges via LLM.
    Raises exception on failure.
    """
    # 1. Focus Focus Focus
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

    # 2. Difficulty
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
        logger.info(f"[Coding-Gen] Cache hit for key {cache_key}.")
        if session_id is not None:
            log_generation_attempt(session_id, 1, "success (cache hit)", 0.0)
        return cached["challenges"]

    logger.info(f"[Coding-Gen] Cache miss for key {cache_key}. Generating via LLM.")
    prompt = f"""You are an elite technical interviewer. Generate exactly 3 personalized coding challenges for '{company}', role '{role}', difficulty '{diff}'.

Engineering Focus: {focus}

RULES:
- Difficulty MUST be '{diff}'.
- Tailor to company focus: FAANG=algorithmic/graphs/DP, fintech=systems/caches/schedulers, infra=parsers/queues/streaming, startup=practical/APIs.
- Each challenge must define function contract: name MUST be 'solve', with arguments and returnType explicitly set.
- Provide starterCode stubs for 'javascript' and 'python'.
- Provide fully working, correct referenceImplementations for 'javascript' and 'python'.
- Provide a list of testCases. Each testCase must contain:
  - id (string, e.g. "t1")
  - input (string, for UI rendering, e.g. "nums = [2,7,11,15], target = 9")
  - args (JSON list of values corresponding to function arguments, in order, e.g. [[2,7,11,15], 9])
  - expectedOutput (the exact return value type/structure, e.g. [0, 1] or true/false)
  - isHidden (boolean)
- Ensure all test case 'args' conform to the constraints specified.
- Ensure the referenceImplementations return values that exactly match the declared expectedOutput for all test cases.
- Respond with ONLY a JSON object. No markdown fences, no explanation.

Output format:
{{
  "challenges": [
    {{
      "id": "unique-slug",
      "title": "Problem Title",
      "description": "2-3 sentence problem statement.",
      "difficulty": "{diff}",
      "timeLimit": 30,
      "languages": ["javascript", "python"],
      "starterCode": {{
        "javascript": "function solve(arg1, arg2) {{\\n  // solution\\n}}",
        "python": "def solve(arg1, arg2):\\n    # solution\\n    pass"
      }},
      "function": {{
        "name": "solve",
        "arguments": [
          {{"name": "arg1", "type": "integer_array"}},
          {{"name": "arg2", "type": "integer"}}
        ],
        "returnType": "integer"
      }},
      "constraints": [
        "1 <= arg1.length <= 1000",
        "1 <= arg2 <= 1000"
      ],
      "testCases": [
        {{ "id": "t1", "input": "arg1 = [4,5,0], arg2 = 3", "args": [[4,5,0], 3], "expectedOutput": 7, "isHidden": false }},
        {{ "id": "t2", "input": "...", "args": [...], "expectedOutput": ..., "isHidden": false }},
        {{ "id": "t3", "input": "...", "args": [...], "expectedOutput": ..., "isHidden": true }}
      ],
      "referenceImplementations": {{
        "javascript": "function solve(arg1, arg2) {{\\n  // complete working JS code\\n}}",
        "python": "def solve(arg1, arg2):\\n    # complete working Python code"
      }},
      "comparison": {{
        "type": "exact"
      }},
      "limits": {{
        "timeMs": 2000
      }}
    }}
  ]
}}

Generate exactly 3 challenge objects in the "challenges" array."""

    max_retries = 2
    challenges_list = None
    for attempt in range(max_retries + 1):
        start_time = time.time()
        try:
            response, tier = await _tiered_chat(
                messages=[
                    {"role": "system", "content": "You are a coding challenge generator. Output ONLY raw JSON. No markdown, no backticks, no explanation."},
                    {"role": "user", "content": prompt}
                ],
                max_tokens=3000,
                temperature=0.1,
                call_site="coding_gen",
            )
            content_raw = response.choices[0].message.content
            if not content_raw:
                raise ValueError("Model returned empty content (None)")
            content = clean_json_content(content_raw)

            # Robust JSON extraction: try direct parse first, then regex fallback
            challenges_list = None
            try:
                parsed = json.loads(content)
                if isinstance(parsed, dict) and "challenges" in parsed:
                    challenges_list = parsed["challenges"]
                elif isinstance(parsed, list):
                    challenges_list = parsed
            except json.JSONDecodeError:
                pass

            if challenges_list is None:
                # Regex fallback: extract JSON object or array from mixed output
                obj_match = re.search(r'\{[^{}]*"challenges"\s*:\s*\[.*\]\s*\}', content, re.DOTALL)
                if obj_match:
                    parsed = json.loads(obj_match.group(0))
                    challenges_list = parsed.get("challenges", [])
                else:
                    arr_match = re.search(r'\[\s*\{.*\}\s*\]', content, re.DOTALL)
                    if arr_match:
                        challenges_list = json.loads(arr_match.group(0))

            if not challenges_list:
                raise ValueError("Could not extract valid challenge JSON from model output")

            # Run task validator on the generated challenges to ensure correctness
            from app.services.task_validator import validate_task
            for idx, chal in enumerate(challenges_list):
                if "limits" not in chal:
                    chal["limits"] = {"timeMs": 2000}
                if "function" not in chal:
                    # Fallback in case LLM misses "function" object
                    chal["function"] = {
                        "name": "solve",
                        "arguments": [{"name": f"arg{i+1}", "type": "integer"} for i in range(len(chal.get("testCases", [{}])[0].get("args", [])))],
                        "returnType": "integer"
                    }
                report = validate_task(chal)
                if not report["valid"]:
                    raise ValueError(f"Challenge {idx} failed QA validation: {report['errors']}")

            duration = time.time() - start_time
            logger.info(f"[Coding-Gen] Success on attempt {attempt + 1} tier={tier} duration={duration:.2f}s")
            if session_id is not None:
                log_generation_attempt(session_id, attempt + 1, f"success (tier={tier})", duration)
            break
        except Exception as e:
            duration = time.time() - start_time
            outcome_str = type(e).__name__
            if "timeout" in outcome_str.lower() or "timeout" in str(e).lower():
                outcome_str = "timeout"
            else:
                outcome_str = f"{outcome_str}: {str(e)[:300]}"
            if session_id is not None:
                log_generation_attempt(session_id, attempt + 1, outcome_str, duration)
                
            logger.warning(f"[Coding-Gen] Attempt {attempt + 1} failed: {e} duration={duration:.2f}s")
            if attempt < max_retries:
                backoff = 2 if attempt == 0 else 5
                await asyncio.sleep(backoff)
            else:
                logger.error(f"[Coding-Gen] Coding challenge generation failed after all retries.")
                raise e

    _coding_challenges_cache[cache_key] = {
        "challenges": challenges_list,
        "timestamp": now
    }
    logger.info(f"[Coding-Gen] Cached new questions for key {cache_key}.")
    return challenges_list

async def _generate_coding_challenges_in_background(
    session_id: int,
    company: str,
    role: str,
    experience_level: str
) -> None:
    """
    Background worker keeping backward compatibility, calling generate_challenges_for_session.
    """
    from app.core.database import SessionLocal
    db = SessionLocal()
    try:
        session = db.query(InterviewSession).filter(InterviewSession.id == session_id).first()
        if not session:
            logger.error(f"[Coding-BgGen] Session {session_id} not found.")
            return

        # Log startup to file so user can immediately see it in coding_generation.log
        log_generation_attempt(session_id, 1, "generation_started (background)", 0.0)

        challenges_list = await generate_challenges_for_session(company, role, experience_level, session_id=session_id)

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


def _execute_code(lang: str, code: str, test_cases: List[Dict], challenge: Dict) -> List[Dict]:
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

    # Check if user did not write any code / submitted empty/starter code
    stripped_code = code.strip()
    is_empty = not stripped_code
    
    starter_code = challenge.get("starterCode", {}).get(lang, "")
    is_starter = False
    if starter_code:
        normalized_submitted = "".join(stripped_code.split())
        normalized_starter = "".join(starter_code.strip().split())
        if normalized_submitted == normalized_starter:
            is_starter = True
            
    if is_empty or is_starter:
        return [
            {
                "testCaseId": tc.get("id"),
                "status": "WRONG_ANSWER",
                "passed": False,
                "expected": tc.get("expectedOutput"),
                "actual": "No output",
                "error": "No code submitted or starter code not modified. Please write your solution.",
                "runtime": 0
            } for tc in test_cases
        ]

    # Paths to runner scripts
    api_dir = os.path.dirname(os.path.abspath(__file__))
    services_dir = os.path.join(os.path.dirname(api_dir), "services")

    runner_script = {
        "python": "py_runner.py",
        "javascript": "js_runner.js",
        "cpp": "cpp_runner.py",
    }[lang]
    runner_path = os.path.join(services_dir, runner_script)

    # Central sandbox configuration loaded from environment variables with safe production defaults
    SANDBOX_MODE = os.getenv("SANDBOX_MODE", "docker")
    ALLOW_UNSANDBOXED_EXECUTION = os.getenv("ALLOW_UNSANDBOXED_EXECUTION", "false").lower() == "true"
    EXECUTION_TIMEOUT_MS = int(os.getenv("EXECUTION_TIMEOUT_MS", "2000"))
    MEMORY_LIMIT_MB = int(os.getenv("MEMORY_LIMIT_MB", "256"))
    CPU_LIMIT = os.getenv("CPU_LIMIT", "1.0")
    PID_LIMIT = int(os.getenv("PID_LIMIT", "64"))
    OUTPUT_LIMIT_BYTES = int(os.getenv("OUTPUT_LIMIT_BYTES", "10000"))
    NETWORK_DISABLED = os.getenv("NETWORK_DISABLED", "true").lower() == "true"

    # Production safety override: disallow unsandboxed execution under any circumstance
    ENV = os.getenv("ENV", "production").lower()
    if ENV in ["production", "prod"]:
        ALLOW_UNSANDBOXED_EXECUTION = False
        SANDBOX_MODE = "docker"

    USE_DOCKER_SANDBOX = (SANDBOX_MODE == "docker")

    return_type = challenge.get("function", {}).get("returnType")
    comparison_type = challenge.get("comparison", {}).get("type", "exact")
    limits = {
        "timeMs": EXECUTION_TIMEOUT_MS,
        "memoryMb": MEMORY_LIMIT_MB,
        "outputBytes": OUTPUT_LIMIT_BYTES
    }
    payload_data = {
        "code": code,
        "testCases": test_cases,
        "returnType": return_type,
        "comparisonType": comparison_type,
        "limits": limits
    }
    payload_str = json.dumps(payload_data)

    import shutil
    # Create unique temporary directory for fallback runner execution (if fallback happens)
    temp_dir = tempfile.mkdtemp(prefix="elevateiq-worker-")
    temp_json_path = os.path.join(temp_dir, "payload.json")
    try:
        with open(temp_json_path, "w", encoding="utf-8") as temp_json:
            json.dump(payload_data, temp_json)

        # Check if Docker is available and daemon is running
        docker_available = False
        if USE_DOCKER_SANDBOX:
            try:
                res = subprocess.run(["docker", "info"], capture_output=True, text=True, timeout=2.0)
                if res.returncode == 0:
                    docker_available = True
            except Exception:
                pass

        if docker_available:
            host_services_dir = os.path.abspath(services_dir)
            if sys.platform == "win32":
                host_services_dir = host_services_dir.replace("\\", "/")

            cmd = [
                "docker", "run", "--rm", "-i",
                "-v", f"{host_services_dir}:/app/services:ro",
                "--network", "none",
                "--read-only",
                "--cap-drop", "ALL",
                "--security-opt", "no-new-privileges",
                "--memory", f"{MEMORY_LIMIT_MB}m",
                "--cpus", str(CPU_LIMIT),
                "--pids-limit", str(PID_LIMIT),
                "--user", "1000:1000",
                "--tmpfs", "/tmp:rw,noexec,nosuid,size=10m",
                "elevateiq-sandbox"
            ]
            if lang == "javascript":
                cmd.extend(["node", "/app/services/js_runner.js"])
            else:
                cmd.extend(["python", "/app/services/py_runner.py"])
        else:
            # Fallback is allowed ONLY in dev environment if ALLOW_UNSANDBOXED_EXECUTION is explicitly True
            if ALLOW_UNSANDBOXED_EXECUTION:
                if lang == "javascript":
                    cmd = ["node", runner_path, temp_json_path]
                else:
                    cmd = [sys.executable, runner_path, temp_json_path]
            else:
                logger.error("Docker is unavailable and unsandboxed execution is disallowed. Failing closed.")
                return [
                    {
                        "testCaseId": tc.get("id"),
                        "status": "SANDBOX_UNAVAILABLE",
                        "passed": False,
                        "expected": tc.get("expectedOutput"),
                        "actual": "Sandbox environment is offline",
                        "error": "Execution service is temporarily unavailable (Docker sandbox not running).",
                        "runtime": 0
                    } for tc in test_cases
                ]

        # C++ compilation happens inside cpp_runner.py; give it extra headroom.
        timeout_secs = 15.0 if lang == "cpp" else (EXECUTION_TIMEOUT_MS / 1000.0) + 2.0

        # Execute subprocess with Popen to guarantee clean timeout termination
        debug_log_path = os.path.join(os.path.dirname(os.path.dirname(api_dir)), "logs", "docker_debug.log")
        try:
            with open(debug_log_path, "a", encoding="utf-8") as df:
                df.write(f"\n--- [{datetime.now().isoformat()}] START EXECUTION ---\n")
                df.write(f"Lang: {lang}\n")
                df.write(f"Cmd: {cmd}\n")
                df.write(f"Code: {code}\n")
        except Exception:
            pass

        try:
            proc = subprocess.Popen(
                cmd,
                stdin=subprocess.PIPE,
                stdout=subprocess.PIPE,
                stderr=subprocess.PIPE,
                text=True
            )
            try:
                stdout, stderr = proc.communicate(input=payload_str, timeout=timeout_secs)
                try:
                    with open(debug_log_path, "a", encoding="utf-8") as df:
                        df.write(f"Proc completed. returncode={proc.returncode}\n")
                        df.write(f"Stdout:\n{stdout}\n")
                        df.write(f"Stderr:\n{stderr}\n")
                except Exception:
                    pass
            except subprocess.TimeoutExpired as te:
                proc.kill()
                stdout, stderr = proc.communicate()
                try:
                    with open(debug_log_path, "a", encoding="utf-8") as df:
                        df.write(f"Proc timed out after {timeout_secs}s.\n")
                        df.write(f"Stdout on timeout:\n{stdout}\n")
                        df.write(f"Stderr on timeout:\n{stderr}\n")
                except Exception:
                    pass
                raise subprocess.TimeoutExpired(cmd, timeout_secs, output=stdout, stderr=stderr)

            # Check stderr or crash
            if proc.returncode != 0:
                logger.error(f"Runner subprocess failed: stdout={stdout}, stderr={stderr}")
                if docker_available:
                    # Docker container itself failed or was OOM killed
                    if proc.returncode == 137 or "oom" in stderr.lower():
                        status = "MEMORY_LIMIT_EXCEEDED"
                        err_msg = "Memory Limit Exceeded: Container resource limits reached."
                    else:
                        status = "SANDBOX_UNAVAILABLE"
                        err_msg = f"Docker execution failed (exit code {proc.returncode}). Stderr: {stderr}"
                    
                    return [
                        {
                            "testCaseId": tc.get("id"),
                            "status": status,
                            "passed": False,
                            "expected": tc.get("expectedOutput"),
                            "actual": "Sandbox resource limit triggered" if status == "MEMORY_LIMIT_EXCEEDED" else "Sandbox environment offline",
                            "error": err_msg,
                            "runtime": 0
                        } for tc in test_cases
                    ]
                else:
                    status = "RUNTIME_ERROR"
                    if "SyntaxError" in stderr:
                        status = "COMPILE_ERROR"
                    elif "out of memory" in stderr.lower() or "heap limit allocation failed" in stderr.lower():
                        status = "MEMORY_LIMIT_EXCEEDED"
                    return [
                        {
                            "testCaseId": tc.get("id"),
                            "status": status,
                            "passed": False,
                            "expected": tc.get("expectedOutput"),
                            "actual": "Execution crash or compile error",
                            "error": stderr.strip() or f"Runner exited with code {proc.returncode}",
                            "runtime": 0
                        } for tc in test_cases
                    ]

            # Parse stdout
            results_list = json.loads(stdout.strip())
            return results_list

        except subprocess.TimeoutExpired:
            timeout_int = int(timeout_secs)
            logger.warning(f"Code execution timed out for language {lang}")
            return [
                {
                    "testCaseId": tc.get("id"),
                    "status": "TIME_LIMIT_EXCEEDED",
                    "passed": False,
                    "expected": tc.get("expectedOutput"),
                    "actual": "Time Limit Exceeded",
                    "error": f"Execution timed out after {timeout_int}s. Possible infinite loop.",
                    "runtime": timeout_int * 1000
                } for tc in test_cases
            ]
        except Exception as run_err:
            try:
                with open(debug_log_path, "a", encoding="utf-8") as df:
                    df.write(f"Exception: {run_err}\n")
            except Exception:
                pass
            logger.error(f"Error running sandbox subprocess: {run_err}")
            return [
                {
                    "testCaseId": tc.get("id"),
                    "status": "INTERNAL_RUNNER_ERROR",
                    "passed": False,
                    "expected": tc.get("expectedOutput"),
                    "actual": "Internal runner error",
                    "error": str(run_err),
                    "runtime": 0
                } for tc in test_cases
            ]

    finally:
        # Clean up unique temporary directory recursively
        try:
            shutil.rmtree(temp_dir, ignore_errors=True)
        except Exception as rm_err:
            logger.warning(f"Failed to remove temporary directory {temp_dir}: {rm_err}")


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
        results_list = _execute_code(lang, payload.code, test_cases, challenge)
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
