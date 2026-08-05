from enum import Enum
from pydantic import BaseModel
from typing import Optional
from datetime import datetime


class AnalysisStatus(str, Enum):
    PENDING = "pending"
    COMPLETED = "completed"
    FAILED = "failed"


class ResumeCreate(BaseModel):
    file_name: str
    file_url: str
    file_size: int


class ResumeResponse(BaseModel):
    id: int
    user_id: str
    file_name: str
    file_url: str
    file_size: int
    status: str
    created_at: datetime
    updated_at: datetime

    technical_skills: Optional[list[str]] = []
    soft_skills: Optional[list[str]] = []
    strengths: Optional[list[str]] = []
    weaknesses: Optional[list[str]] = []
    ats_score: Optional[int] = None
    analysis_status: AnalysisStatus = AnalysisStatus.PENDING
    experience_level: Optional[str] = None

    class Config:
        from_attributes = True


class ResumeListResponse(BaseModel):
    resumes: list[ResumeResponse]


class ResumeDeleteResponse(BaseModel):
    id: int
    success: bool
