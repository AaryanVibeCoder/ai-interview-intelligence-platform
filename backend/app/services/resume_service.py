from sqlalchemy.orm import Session

from app.models.resume import Resume


def create_user_resume(
    db: Session,
    user_id: str,
    file_name: str,
    file_url: str,
    file_size: int,
):
    db_resume = Resume(
        user_id=user_id,
        file_name=file_name,
        file_url=file_url,
        file_size=file_size,
        status="uploaded",
    )
    db.add(db_resume)
    db.commit()
    db.refresh(db_resume)
    return db_resume


def get_user_resumes(db: Session, user_id: str) -> list[Resume]:
    return (
        db.query(Resume)
        .filter(Resume.user_id == user_id)
        .order_by(Resume.created_at.desc())
        .all()
    )


def get_user_resume_by_id(db: Session, user_id: str, resume_id: int) -> Resume | None:
    return (
        db.query(Resume)
        .filter(Resume.user_id == user_id, Resume.id == resume_id)
        .one_or_none()
    )


def delete_user_resume(db: Session, resume: Resume) -> None:
    db.delete(resume)
    db.commit()
