from typing import Optional
from pydantic import BaseModel


class InterviewProfileCreate(BaseModel):
    resume_id: int
    target_company: str
    interview_type: str
    experience_level: str
    role: Optional[str] = "Software Engineer"
    job_type: Optional[str] = "full time job"


class InterviewProfileResponse(BaseModel):
    id: int
    user_id: str
    resume_id: int
    target_company: str
    interview_type: str
    experience_level: str
    role: Optional[str] = "Software Engineer"
    job_type: Optional[str] = "full time job"

    class Config:
        from_attributes = True
