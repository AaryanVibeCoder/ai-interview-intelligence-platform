import os
import sys

# Ensure backend path is in sys.path
sys.path.append(os.path.join(os.path.dirname(os.path.abspath(__file__)), "backend"))

from fastapi.testclient import TestClient
from main import app
from app.core.clerk_auth import get_current_user

# Mock authentication dependency
async def override_get_current_user():
    class MockUser:
        clerk_user_id = "clerk_mock_user_999"
    return MockUser()

app.dependency_overrides[get_current_user] = override_get_current_user

client = TestClient(app)

def test_quality(payload):
    response = client.post("/coding/quality", json=payload)
    if response.status_code != 200:
        return {"status": response.status_code, "error": response.text}
    return response.json()

def main():
    print("=" * 60)
    print("ElevateIQ Code Quality Evaluator Verification Suite")
    print("=" * 60)

    # 1. Case 1: Empty Code
    payload_empty = {
        "code": "",
        "language": "python",
        "test_results": []
    }
    res_empty = test_quality(payload_empty)
    print(f"\n[Case 1: Empty Code]")
    print(f"Quality Score: {res_empty.get('codeQuality')}")
    print(f"Gaps: {res_empty.get('gaps')}")
    print(f"Suggestions: {res_empty.get('suggestions')}")

    # 2. Case 2: Runs but Fails Tests
    payload_fails = {
        "code": "def twoSum(nums, target):\n    return []",
        "language": "python",
        "test_results": [
            {"testCaseId": "t1", "passed": False, "expected": "[0, 1]", "actual": "[]", "error": None, "runtime": 1}
        ]
    }
    res_fails = test_quality(payload_fails)
    print(f"\n[Case 2: Runs but Fails Tests]")
    print(f"Quality Score: {res_fails.get('codeQuality')}")
    print(f"Gaps: {res_fails.get('gaps')}")
    print(f"Suggestions: {res_fails.get('suggestions')}")

    # 3. Case 3: Correct but Inefficient (Brute Force O(N^2))
    code_brute = """
def twoSum(nums, target):
    # nested loop brute force
    for i in range(len(nums)):
        for j in range(i + 1, len(nums)):
            if nums[i] + nums[j] == target:
                return [i, j]
    return []
"""
    payload_brute = {
        "code": code_brute,
        "language": "python",
        "test_results": [
            {"testCaseId": "t1", "passed": True, "expected": "[0, 1]", "actual": "[0, 1]", "error": None, "runtime": 1}
        ]
    }
    res_brute = test_quality(payload_brute)
    print(f"\n[Case 3: Correct but Inefficient (O(N^2))]")
    print(f"Quality Score: {res_brute.get('codeQuality')}")
    print(f"Strengths: {res_brute.get('strengths')}")
    print(f"Gaps: {res_brute.get('gaps')}")
    print(f"Suggestions: {res_brute.get('suggestions')}")

    # 4. Case 4: Correct and Optimal (Map-based O(N))
    code_optimal = """
def twoSum(nums, target):
    # Optimal lookup set/dictionary O(N)
    seen = {}
    for i, num in enumerate(nums):
        diff = target - num
        if diff in seen:
            return [seen[diff], i]
        seen[num] = i
    return []
"""
    payload_optimal = {
        "code": code_optimal,
        "language": "python",
        "test_results": [
            {"testCaseId": "t1", "passed": True, "expected": "[0, 1]", "actual": "[0, 1]", "error": None, "runtime": 1}
        ]
    }
    res_optimal = test_quality(payload_optimal)
    print(f"\n[Case 4: Correct and Optimal (O(N))]")
    print(f"Quality Score: {res_optimal.get('codeQuality')}")
    print(f"Strengths: {res_optimal.get('strengths')}")
    print(f"Gaps: {res_optimal.get('gaps')}")
    print(f"Suggestions: {res_optimal.get('suggestions')}")

if __name__ == "__main__":
    main()
