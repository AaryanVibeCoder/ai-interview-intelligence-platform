from pydantic import BaseModel
from typing import Optional


class InterviewStartRequest(BaseModel):
    """
    Payload to start (create) an interview session.

    `interview_profile_id` is preferred; when the caller has not persisted a
    profile yet, the endpoint can fall back on the inline `target_company`,
    `interview_type`, `experience_level`, `role`, and `job_type` fields.
    """

    interview_profile_id: Optional[int] = None
    target_company: Optional[str] = None
    interview_type: Optional[str] = None
    experience_level: Optional[str] = None
    role: Optional[str] = None
    job_type: Optional[str] = None


class InterviewStartResponse(BaseModel):
    session_id: int
    question: str
    # "fallback" = static opener returned immediately; the background task may
    # replace it with a personalized opener ("llm") shortly after start.
    question_source: str = "fallback"
    interview_config: dict


class InterviewSessionStatusResponse(BaseModel):
    session_id: int
    status: str
    question_source: str
    question: str
    interview_config: dict


class InterviewAnswerRequest(BaseModel):
    session_id: int
    user_transcript: str


class InterviewFeedback(BaseModel):
    strengths: list[str]
    gaps: list[str]
    score: int
    potential_score: Optional[int] = None
    growth_path: Optional[str] = None
    streak_message: Optional[str] = None
    example_rewrites: Optional[list[str]] = None


class InterviewAnswerResponse(BaseModel):
    feedback: InterviewFeedback
    next_question: str

