import sys
import json
import time
import inspect
import tracemalloc
import builtins
import threading
import subprocess
import os
import copy
import tempfile

class CappedStream:
    def __init__(self, limit=10000):
        self.buffer = []
        self.length = 0
        self.limit = limit
        self.lock = threading.Lock()
        
    def write(self, data):
        with self.lock:
            if self.length + len(data) > self.limit:
                extra = self.limit - self.length
                if extra > 0:
                    self.buffer.append(data[:extra])
                    self.length += extra
                raise RuntimeError("Output Limit Exceeded")
            self.buffer.append(data)
            self.length += len(data)
            
    def flush(self):
        pass
        
    def getvalue(self):
        with self.lock:
            return "".join(self.buffer)

def restricted_import(name, globals=None, locals=None, fromlist=(), level=0):
    blocked = {'os', 'sys', 'socket', 'subprocess', 'requests', 'builtins', 'ctypes', 'shutil', 'urllib', 'http', 'platform', 'importlib', 'pickle', 'marshal'}
    if name in blocked or any(b in name for b in blocked):
        raise ImportError(f"Import of module '{name}' is disallowed for security reasons.")
    return __original_import__(name, globals, locals, fromlist, level)

# Save original import
__original_import__ = builtins.__import__

def validate_return_type(result, return_type):
    if result is None and return_type is not None:
        raise TypeError("Solution returned None, but a return value was expected.")
        
    if return_type == 'integer':
        if not isinstance(result, int) or isinstance(result, bool):
            raise TypeError(f"Expected return type 'integer', but got '{type(result).__name__}'")
    elif return_type == 'float':
        if not isinstance(result, (int, float)):
            raise TypeError(f"Expected return type 'float', but got '{type(result).__name__}'")
    elif return_type == 'boolean':
        if not isinstance(result, bool):
            raise TypeError(f"Expected return type 'boolean', but got '{type(result).__name__}'")
    elif return_type == 'string':
        if not isinstance(result, str):
            raise TypeError(f"Expected return type 'string', but got '{type(result).__name__}'")
    elif return_type and (return_type.endswith('_array') or return_type == 'array'):
        if not isinstance(result, list):
            raise TypeError(f"Expected return type 'array', but got '{type(result).__name__}'")
        if return_type == 'integer_array':
            if not all(isinstance(x, int) and not isinstance(x, bool) for x in result):
                raise TypeError("Expected return type 'integer_array', but array contains non-integer values")
        elif return_type == 'float_array':
            if not all(isinstance(x, (int, float)) for x in result):
                raise TypeError("Expected return type 'float_array', but array contains non-numeric values")
        elif return_type == 'string_array':
            if not all(isinstance(x, str) for x in result):
                raise TypeError("Expected return type 'string_array', but array contains non-string values")
        elif return_type == 'boolean_array':
            if not all(isinstance(x, bool) for x in result):
                raise TypeError("Expected return type 'boolean_array', but array contains non-boolean values")
    elif return_type == 'object':
        if not isinstance(result, dict):
            raise TypeError(f"Expected return type 'object', but got '{type(result).__name__}'")

def compare_outputs(actual, expected, return_type, comparison_type="exact"):
    if isinstance(actual, (int, float)) and isinstance(expected, (int, float)):
        if actual == expected:
            return True
        if isinstance(actual, float) or isinstance(expected, float):
            import math
            if math.isinf(actual) or math.isinf(expected):
                return False
            return abs(actual - expected) <= 1e-9
        return actual == expected
        
    if isinstance(actual, bool) and isinstance(expected, bool):
        return actual == expected
        
    return deep_equal(actual, expected, comparison_type)

def deep_equal(a, b, comparison_type="exact"):
    if a == b:
        return True
        
    if isinstance(a, list) and isinstance(b, list):
        if len(a) != len(b):
            return False
        if comparison_type == 'unordered_array':
            try:
                a_sorted = sorted(a, key=normalize_key)
                b_sorted = sorted(b, key=normalize_key)
                return all(deep_equal(x, y, "exact") for x, y in zip(a_sorted, b_sorted))
            except Exception:
                b_copy = list(b)
                for item in a:
                    matched = False
                    for other in b_copy:
                        if deep_equal(item, other, "exact"):
                            b_copy.remove(other)
                            matched = True
                            break
                    if not matched:
                        return False
                return len(b_copy) == 0
        return all(deep_equal(x, y, comparison_type) for x, y in zip(a, b))
        
    if isinstance(a, dict) and isinstance(b, dict):
        if len(a) != len(b):
            return False
        for k, v in a.items():
            if k not in b:
                return False
            if not deep_equal(v, b[k], comparison_type):
                return False
        return True
        
    return str(a) == str(b)

def normalize_key(val):
    if isinstance(val, (int, float, str, bool)):
        return (0, val)
    return (1, json.dumps(val, sort_keys=True))

def terminate_process_tree(proc):
    if sys.platform == "win32":
        try:
            # CREATE_NEW_PROCESS_GROUP + taskkill /F /T kills descendants securely on Windows
            subprocess.run(["taskkill", "/F", "/T", "/PID", str(proc.pid)], capture_output=True, check=False)
        except Exception:
            try:
                proc.terminate()
            except Exception:
                pass
    else:
        import signal
        try:
            pgid = os.getpgid(proc.pid)
            os.killpg(pgid, signal.SIGKILL)
        except Exception:
            try:
                proc.terminate()
            except Exception:
                pass

def run():
    # ----------------------------------------------------
    # WORKER MODE
    # ----------------------------------------------------
    if len(sys.argv) == 3 and sys.argv[1] == "--worker":
        worker_file = sys.argv[2]
        try:
            with open(worker_file, "r", encoding="utf-8") as f:
                w_payload = json.load(f)
        except Exception as e:
            sys.stdout = sys.__stdout__
            sys.stderr = sys.__stderr__
            print(json.dumps({"status": "INTERNAL_RUNNER_ERROR", "passed": False, "actual": None, "error": f"Worker payload read error: {e}"}))
            sys.exit(1)

        code = w_payload.get("code", "")
        args = w_payload.get("args", [])
        return_type = w_payload.get("returnType")

        sandbox_globals = {
            "__builtins__": builtins.__dict__.copy(),
            "restricted_import": restricted_import
        }
        sandbox_globals["__builtins__"]["__import__"] = restricted_import

        # Cap stdout/stderr during execution
        capped_out = CappedStream(limit=10000)
        sys.stdout = capped_out
        sys.stderr = capped_out

        tracemalloc.start()
        start = time.perf_counter()
        status = "PASSED"
        error = None
        passed = False
        actual = None
        memory_used = 0.0

        try:
            exec(code, sandbox_globals)
            func = sandbox_globals.get("solve")
            if not func or not callable(func):
                status = "INVALID_SUBMISSION"
                raise ValueError("Submission must define function solve(...)")
            
            # Execute candidate code
            raw_actual = func(*args)
            runtime = int((time.perf_counter() - start) * 1000)
            
            current, peak = tracemalloc.get_traced_memory()
            memory_used = round(peak / (1024.0 * 1024.0), 3)

            validate_return_type(raw_actual, return_type)
            actual = raw_actual
            passed = True
        except SyntaxError as se:
            runtime = int((time.perf_counter() - start) * 1000)
            status = "COMPILE_ERROR"
            error = f"SyntaxError: {se.msg} (line {se.lineno})"
        except TypeError as te:
            runtime = int((time.perf_counter() - start) * 1000)
            status = "INVALID_RETURN_TYPE"
            error = str(te)
        except RuntimeError as re:
            runtime = int((time.perf_counter() - start) * 1000)
            if "Output Limit Exceeded" in str(re):
                status = "OUTPUT_LIMIT_EXCEEDED"
                error = "Output Limit Exceeded: console logs exceeded 10KB."
            else:
                status = "RUNTIME_ERROR"
                error = str(re)
        except Exception as e:
            runtime = int((time.perf_counter() - start) * 1000)
            status = "RUNTIME_ERROR"
            error = str(e)
        finally:
            tracemalloc.stop()
            # Restore real streams to output final JSON payload
            sys.stdout = sys.__stdout__
            sys.stderr = sys.__stderr__

        print(json.dumps({
            "status": status,
            "passed": passed,
            "actual": actual,
            "error": error,
            "runtime": runtime,
            "memory": memory_used
        }))
        sys.stdout.flush()
        sys.exit(0)

    # ----------------------------------------------------
    # PARENT RUNNER MODE
    # ----------------------------------------------------
    payload = None
    if len(sys.argv) < 2:
        try:
            payload_str = sys.stdin.read()
            try:
                sys.stdin.close()
            except Exception:
                pass
            payload = json.loads(payload_str)
        except Exception as e:
            print(f"Failed to read/parse input JSON from stdin: {e}", file=sys.stderr)
            sys.exit(1)
    else:
        input_file_path = sys.argv[1]
        try:
            with open(input_file_path, "r", encoding="utf-8") as f:
                payload = json.load(f)
        except Exception as e:
            print(f"Failed to read/parse input JSON file: {e}", file=sys.stderr)
            sys.exit(1)

    code = payload.get("code", "")
    test_cases = payload.get("testCases", [])
    return_type = payload.get("returnType")
    comparison_type = payload.get("comparisonType", "exact")
    limits = payload.get("limits", {})
    time_limit_ms = limits.get("timeMs", 2000)
    timeout_secs = time_limit_ms / 1000.0

    results = []

    for tc in test_cases:
        error = None
        actual_val = None
        passed = False
        runtime = 0
        memory_used = 0.0
        status = "PASSED"

        # 1. Create a fresh unique temporary directory for this worker subprocess
        temp_tc_dir = tempfile.mkdtemp(prefix="py-worker-")
        temp_tc_file_path = os.path.join(temp_tc_dir, "payload.json")
        try:
            # 2. Deep copy arguments to isolate mutations
            clean_args = copy.deepcopy(tc.get("args", []))
            with open(temp_tc_file_path, "w", encoding="utf-8") as temp_tc_file:
                json.dump({
                    "code": code,
                    "args": clean_args,
                    "returnType": return_type
                }, temp_tc_file)

            # 3. Spawn fresh Python process inside the unique temp folder context
            cmd = [sys.executable, __file__, "--worker", temp_tc_file_path]
            
            creationflags = 0
            preexec_fn = None
            if sys.platform == "win32":
                creationflags = subprocess.CREATE_NEW_PROCESS_GROUP
            else:
                preexec_fn = os.setsid

            proc = subprocess.Popen(
                cmd,
                stdout=subprocess.PIPE,
                stderr=subprocess.PIPE,
                text=True,
                creationflags=creationflags,
                preexec_fn=preexec_fn
            )

            try:
                stdout_data, stderr_data = proc.communicate(timeout=timeout_secs)
                if proc.returncode != 0:
                    status = "RUNTIME_ERROR"
                    error = stderr_data.strip() or f"Worker process crashed with code {proc.returncode}."
                else:
                    try:
                        worker_res = json.loads(stdout_data.strip())
                        status = worker_res.get("status", "PASSED")
                        passed = worker_res.get("passed", False)
                        actual_val = worker_res.get("actual")
                        error = worker_res.get("error")
                        runtime = worker_res.get("runtime", 0)
                        memory_used = worker_res.get("memory", 0.0)

                        if status == "PASSED":
                            # Perform type-aware comparison in parent runner
                            passed = compare_outputs(actual_val, tc["expectedOutput"], return_type, comparison_type)
                            if not passed:
                                status = "WRONG_ANSWER"
                    except Exception as parse_err:
                        status = "INTERNAL_RUNNER_ERROR"
                        error = f"Failed to parse worker stdout: {parse_err}. Stdout: {stdout_data}. Stderr: {stderr_data}"
            except subprocess.TimeoutExpired:
                terminate_process_tree(proc)
                status = "TIME_LIMIT_EXCEEDED"
                error = f"Execution timed out after {timeout_secs}s."
                runtime = int(timeout_secs * 1000)

        finally:
            import shutil
            try:
                shutil.rmtree(temp_tc_dir, ignore_errors=True)
            except Exception:
                pass

        results.append({
            "testCaseId": tc["id"],
            "status": status,
            "passed": passed,
            "expected": json.dumps(tc["expectedOutput"]) if isinstance(tc["expectedOutput"], (list, dict)) else str(tc["expectedOutput"]),
            "actual": json.dumps(actual_val) if isinstance(actual_val, (list, dict)) else str(actual_val) if actual_val is not None else "No output",
            "error": error,
            "runtime": runtime,
            "memory": memory_used
        })

    print(json.dumps(results))
    sys.stdout.flush()

if __name__ == "__main__":
    run()
