import os
import sys

# Ensure backend root is in python path
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from app.services.task_validator import validate_task
from app.api.coding import FALLBACK_CODING_CHALLENGES

def main():
    print("=" * 60)
    print("CODING CHALLENGE QA PIPELINE VALIDATOR")
    print("=" * 60)
    
    any_failed = False
    for chal in FALLBACK_CODING_CHALLENGES:
        print(f"\n[QA] Validating task: {chal['id']} ('{chal['title']}')")
        report = validate_task(chal)
        if report["valid"]:
            print("  --> PASS")
            for log in report["logs"]:
                print(f"      {log}")
        else:
            print("  --> FAIL")
            any_failed = True
            for err in report["errors"]:
                print(f"      - ERROR: {err}")
                
    print("\n" + "=" * 60)
    if any_failed:
        print("QA VALIDATION COMPLETED: FAIL")
        print("=" * 60)
        sys.exit(1)
    else:
        print("QA VALIDATION COMPLETED: ALL TASKS ARE VALID & STABLE!")
        print("=" * 60)
        sys.exit(0)

if __name__ == "__main__":
    main()
