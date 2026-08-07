import os
import json
import tempfile
import subprocess
import sys

# Paths to runner scripts
current_dir = os.path.dirname(os.path.abspath(__file__))
services_dir = os.path.join(current_dir, "backend", "app", "services")
if not os.path.exists(services_dir):
    # fallback to local folder
    services_dir = os.path.join(current_dir, "app", "services")

py_runner_path = os.path.join(services_dir, "py_runner.py")
js_runner_path = os.path.join(services_dir, "js_runner.js")

def run_test_payload(runner_path, language, code, test_cases, timeout=4.0):
    temp_json = tempfile.NamedTemporaryFile(mode="w+", delete=False, suffix=".json", encoding="utf-8")
    try:
        json.dump({
            "code": code,
            "testCases": test_cases
        }, temp_json)
        temp_json.close()
        
        if language == "python":
            cmd = [sys.executable, runner_path, temp_json.name]
        else:
            cmd = ["node", runner_path, temp_json.name]

        try:
            proc = subprocess.run(cmd, capture_output=True, text=True, timeout=timeout)
            if proc.returncode != 0:
                return {"success": False, "error": proc.stderr or f"Exited with code {proc.returncode}"}
            return {"success": True, "results": json.loads(proc.stdout.strip())}
        except subprocess.TimeoutExpired:
            return {"success": False, "timeout": True}
        except Exception as e:
            return {"success": False, "error": str(e)}
    finally:
        if os.path.exists(temp_json.name):
            os.remove(temp_json.name)

def main():
    print("=" * 60)
    print("ElevateIQ Sandbox Runner Verification Suite")
    print("=" * 60)
    
    # ----------------------------------------------------
    # PYTHON TESTS
    # ----------------------------------------------------
    print("\n--- Running Python Sandbox Tests ---")
    
    # Test Case 1: Valid Python code
    py_code_valid = """
def twoSum(nums, target):
    seen = {}
    for i, num in enumerate(nums):
        diff = target - num
        if diff in seen:
            return [seen[diff], i]
        seen[num] = i
    return []
"""
    py_test_cases = [
        {"id": "t1", "input": "nums = [2, 7, 11, 15], target = 9", "expectedOutput": "[0, 1]"},
        {"id": "t2", "input": "nums = [3, 2, 4], target = 6", "expectedOutput": "[1, 2]"}
    ]
    res1 = run_test_payload(py_runner_path, "python", py_code_valid, py_test_cases)
    print(f"Test 1 (Valid Python): {res1}")

    # Test Case 2: Malicious Python code (os module import)
    py_code_malicious = """
def twoSum(nums, target):
    import os
    os.system("echo 'hack'")
    return []
"""
    res2 = run_test_payload(py_runner_path, "python", py_code_malicious, py_test_cases)
    print(f"Test 2 (Security Blocked Import): {res2}")

    # Test Case 3: Python Infinite Loop (timeout check)
    py_code_infinite = """
def twoSum(nums, target):
    while True:
        pass
    return []
"""
    res3 = run_test_payload(py_runner_path, "python", py_code_infinite, py_test_cases, timeout=2.0)
    print(f"Test 3 (Python Timeout 2.0s): {res3}")

    # ----------------------------------------------------
    # JAVASCRIPT TESTS
    # ----------------------------------------------------
    print("\n--- Running JavaScript Sandbox Tests ---")
    
    # Test Case 4: Valid JavaScript code
    js_code_valid = """
function twoSum(nums, target) {
    const seen = new Map();
    for (let i = 0; i < nums.length; i++) {
        const diff = target - nums[i];
        if (seen.has(diff)) {
            return [seen.get(diff), i];
        }
        seen.set(nums[i], i);
    }
    return [];
}
"""
    js_test_cases = [
        {"id": "t1", "input": "nums = [2, 7, 11, 15], target = 9", "expectedOutput": "[0, 1]"},
        {"id": "t2", "input": "nums = [3, 2, 4], target = 6", "expectedOutput": "[1, 2]"}
    ]
    res4 = run_test_payload(js_runner_path, "javascript", js_code_valid, js_test_cases)
    print(f"Test 4 (Valid JavaScript): {res4}")

    # Test Case 5: Malicious JavaScript code (require filesystem access)
    js_code_malicious = """
function twoSum(nums, target) {
    const fs = require('fs');
    fs.writeFileSync('malicious.txt', 'hack');
    return [];
}
"""
    res5 = run_test_payload(js_runner_path, "javascript", js_code_malicious, js_test_cases)
    print(f"Test 5 (Security Blocked Require): {res5}")

    # Test Case 6: JavaScript Infinite Loop (timeout check)
    js_code_infinite = """
function twoSum(nums, target) {
    while (true) {}
    return [];
}
"""
    res6 = run_test_payload(js_runner_path, "javascript", js_code_infinite, js_test_cases, timeout=2.0)
    print(f"Test 6 (JavaScript Timeout 2.0s): {res6}")

if __name__ == "__main__":
    main()
