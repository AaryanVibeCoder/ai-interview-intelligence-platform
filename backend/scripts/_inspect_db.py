"""Ad-hoc DB inspector for debugging Start Interview failure."""
import sys
from pathlib import Path

BACKEND_ROOT = Path(__file__).resolve().parents[1]
if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))

from sqlalchemy import text
from app.core.database import engine


def main() -> None:
    with engine.connect() as c:
        print("=== interview_sessions columns ===")
        rows = c.execute(
            text(
                "SELECT column_name, is_nullable, data_type "
                "FROM information_schema.columns "
                "WHERE table_name='interview_sessions' ORDER BY ordinal_position"
            )
        ).fetchall()
        for r in rows:
            print(r)

        print("\n=== interview_profiles columns ===")
        rows = c.execute(
            text(
                "SELECT column_name, is_nullable, data_type "
                "FROM information_schema.columns "
                "WHERE table_name='interview_profiles' ORDER BY ordinal_position"
            )
        ).fetchall()
        for r in rows:
            print(r)

        print("\n=== users columns ===")
        rows = c.execute(
            text(
                "SELECT column_name, is_nullable, data_type "
                "FROM information_schema.columns "
                "WHERE table_name='users' ORDER BY ordinal_position"
            )
        ).fetchall()
        for r in rows:
            print(r)

        print("\n=== alembic_version ===")
        try:
            v = c.execute(text("SELECT * FROM alembic_version")).fetchall()
            for r in v:
                print(r)
        except Exception as e:  # noqa: BLE001
            print("alembic_version table error:", e)

        print("\n=== count rows ===")
        for tbl in ("users", "resumes", "interview_profiles", "interview_sessions"):
            try:
                n = c.execute(text(f"SELECT count(*) FROM {tbl}")).scalar()
                print(f"{tbl}: {n}")
            except Exception as e:  # noqa: BLE001
                print(f"{tbl}: error {e}")

        print("\n=== sample interview_profiles (id, resume_id, target_company, role, job_type) ===")
        try:
            rows = c.execute(
                text(
                    "SELECT id, user_id, resume_id, target_company, role, job_type "
                    "FROM interview_profiles LIMIT 10"
                )
            ).fetchall()
            for r in rows:
                print(r)
        except Exception as e:  # noqa: BLE001
            print("error:", e)


if __name__ == "__main__":
    main()

