import os
import sys

# Add the current directory to sys.path to resolve imports correctly
sys.path.append(os.path.abspath(os.path.dirname(__file__)))

from app.core.database import SessionLocal
from app.models.interview_session import InterviewSession

def main():
    session = SessionLocal()
    try:
        # Query all sessions
        sessions = session.query(InterviewSession).all()
        total_sessions = len(sessions)
        
        if total_sessions == 0:
            print("No interview sessions found in the database.")
            return
            
        # Count by question_source
        source_counts = {}
        for s in sessions:
            src = s.question_source or "fallback"
            source_counts[src] = source_counts.get(src, 0) + 1
            
        print("=" * 45)
        print("ElevateIQ Opener Swap Success Rate Dashboard")
        print("=" * 45)
        print(f"Total Sessions Tracked: {total_sessions}")
        print("-" * 45)
        for source, count in source_counts.items():
            percentage = (count / total_sessions) * 100
            print(f"- {source:<12}: {count:>3} sessions ({percentage:.2f}%)")
        print("=" * 45)
        
    except Exception as e:
        print(f"Error querying database: {e}")
    finally:
        session.close()

if __name__ == "__main__":
    main()
