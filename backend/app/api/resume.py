import os
import uuid
from pathlib import Path

import logging

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile, status, Request
from fastapi.responses import FileResponse
from app.core.rate_limit import limiter
from app.core.clerk_auth import get_current_user

from sqlalchemy.orm import Session

from app.core.database import get_db
from app.schemas.resume import (
    ResumeDeleteResponse,
    ResumeListResponse,
    ResumeResponse,
)
from app.services.resume_service import (
    create_user_resume,
    delete_user_resume,
    get_user_resume_by_id,
    get_user_resumes,
)
from app.services.resume_parser import extract_text_from_file
from app.services.resume_analyzer import analyze_resume

logger = logging.getLogger(__name__)


router = APIRouter(prefix="/resumes", tags=["Resumes"])

UPLOAD_DIR = Path.home() / ".elevateiq" / "resumes"
ALLOWED_EXTENSIONS = {".pdf", ".docx"}
MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024  # 10MB


def _get_extension(filename: str) -> str:
    _, ext = os.path.splitext(filename or "")
    return ext.lower()


@router.post("", response_model=ResumeResponse, status_code=status.HTTP_201_CREATED)
@limiter.limit("10/minute")
async def upload_resume_file(
    request: Request,
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):

    user_id = current_user.clerk_user_id

    ext = _get_extension(file.filename)

    if ext not in ALLOWED_EXTENSIONS:
        raise HTTPException(
            status_code=status.HTTP_415_UNSUPPORTED_MEDIA_TYPE,
            detail="Only PDF and DOCX files are allowed",
        )

    UPLOAD_DIR.mkdir(parents=True, exist_ok=True)

    unique_filename = f"{uuid.uuid4().hex}{ext}"
    destination_path = UPLOAD_DIR / unique_filename

    total_bytes = 0
    try:
        with destination_path.open("wb") as out_file:
            while True:
                chunk = await file.read(1024 * 1024)  # 1MB chunks
                if not chunk:
                    break
                total_bytes += len(chunk)
                if total_bytes > MAX_FILE_SIZE_BYTES:
                    try:
                        destination_path.unlink(missing_ok=True)
                    except Exception:
                        pass
                    raise HTTPException(
                        status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
                        detail="File too large. Max size is 10MB.",
                    )
                out_file.write(chunk)

    finally:
        await file.close()

    # 1. Extract text from the saved file
    try:
        extracted_text = extract_text_from_file(str(destination_path))
    except Exception as e:
        logger.error(f"Failed to extract text from {destination_path}: {e}")
        # Clean up file on disk
        destination_path.unlink(missing_ok=True)
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Failed to extract text from file: {str(e)}",
        )

    file_url = f"/uploads/resumes/{unique_filename}"

    # 2. Initially save the resume record with analysis_status = "pending"
    db_resume = create_user_resume(
        db=db,
        user_id=user_id,
        file_name=unique_filename,
        file_url=file_url,
        file_size=total_bytes,
    )

    # 3. Call analyze_resume inside a try-except block
    try:
        analysis_data = analyze_resume(extracted_text)

        # 4. Map and save analysis fields
        db_resume.technical_skills = analysis_data.get("technical_skills", [])
        db_resume.soft_skills = analysis_data.get("soft_skills", [])
        db_resume.strengths = analysis_data.get("strengths", [])
        db_resume.weaknesses = analysis_data.get("weaknesses", [])
        db_resume.ats_score = analysis_data.get("ats_score")
        db_resume.experience_level = analysis_data.get("experience_level")
        db_resume.analysis_status = "completed"

        # Semantic file naming based on extraction
        import re
        from datetime import datetime
        upload_date = datetime.now().strftime("%Y-%m-%d")
        full_name = analysis_data.get("resumeData", {}).get("fullName", "").strip()
        
        is_valid_name = False
        if full_name and full_name.lower() not in ["candidate name", "resume", "cv", "curriculum vitae", "not extracted"]:
            is_valid_name = True
            
        if is_valid_name:
            clean_name = re.sub(r'[^a-zA-Z0-9\s]', '', full_name).strip()
            parts = clean_name.split()
            if len(parts) >= 2:
                first_name = parts[0]
                last_name = parts[-1]
                semantic_name = f"{first_name}_{last_name}_{upload_date}{ext}"
            elif len(parts) == 1:
                first_name = parts[0]
                semantic_name = f"{first_name}_{upload_date}{ext}"
            else:
                is_valid_name = False
                
        if not is_valid_name:
            semantic_name = f"Resume_{upload_date}{ext}"
            
        db_resume.file_name = semantic_name

        db.commit()
        db.refresh(db_resume)
    except Exception as e:
        logger.error(f"Analysis failed for resume ID {db_resume.id}: {e}")
        db_resume.analysis_status = "failed"
        db.commit()
        db.refresh(db_resume)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Resume analysis failed: {str(e)}",
        )

    return db_resume


@router.get("", response_model=ResumeListResponse)
async def list_my_resumes(
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    resumes = get_user_resumes(db=db, user_id=current_user.clerk_user_id)
    return ResumeListResponse(resumes=resumes)


@router.get("/{resume_id}", response_model=ResumeResponse)
async def get_my_resume(
    resume_id: int,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    resume = get_user_resume_by_id(
        db=db,
        user_id=current_user.clerk_user_id,
        resume_id=resume_id,
    )

    if resume is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Not found")

    return resume


@router.get("/{resume_id}/download")
async def download_my_resume(
    resume_id: int,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    resume = get_user_resume_by_id(
        db=db,
        user_id=current_user.clerk_user_id,
        resume_id=resume_id,
    )

    if resume is None:
        logger.warning(
            "Resume download not found or not owned by user: resume_id=%s user_id=%s",
            resume_id,
            current_user.clerk_user_id,
        )
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Resume not found",
        )

    stored_filename = Path(resume.file_url).name
    local_path = UPLOAD_DIR / stored_filename

    if not local_path.exists():
        logger.warning(
            "Resume file missing on disk: resume_id=%s user_id=%s path=%s",
            resume_id,
            current_user.clerk_user_id,
            str(local_path),
        )
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Resume file not found on server",
        )

    ext = Path(resume.file_name).suffix.lower()
    media_type = (
        "application/pdf"
        if ext == ".pdf"
        else "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
    )

    return FileResponse(
        path=str(local_path),
        media_type=media_type,
        filename=resume.file_name,
        content_disposition_type="inline",
    )


@router.delete("/{resume_id}", response_model=ResumeDeleteResponse)
async def delete_my_resume(
    resume_id: int,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):

    resume = get_user_resume_by_id(
        db=db,
        user_id=current_user.clerk_user_id,
        resume_id=resume_id,
    )

    if resume is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Not found")

    # Delete DB record first
    delete_user_resume(db=db, resume=resume)

    # Delete local file
    try:
        # file_url looks like: /uploads/resumes/<stored_filename>
        stored_filename = Path(resume.file_url).name
        local_path = UPLOAD_DIR / stored_filename
        local_path.unlink(missing_ok=True)
    except Exception:
        # Avoid failing the request if file deletion fails
        pass

    return ResumeDeleteResponse(id=resume_id, success=True)
