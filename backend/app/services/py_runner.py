import sys
import json
import time
import inspect
import tracemalloc
import builtins

def restricted_import(name, globals=None, locals=None, fromlist=(), level=0):
    blocked = {'os', 'sys', 'socket', 'subprocess', 'requests', 'builtins', 'ctypes', 'shutil', 'urllib', 'http', 'platform'}
    if name in blocked or any(b in name for b in blocked):
        raise ImportError(f"Import of module '{name}' is disallowed for security reasons.")
    return __original_import__(name, globals, locals, fromlist, level)

# Save original import
__original_import__ = builtins.__import__

def normalize_compare(actual, expected):
    try:
        # Standardize representation by serializing to JSON and stripping whitespace
        act_str = json.dumps(actual).replace(" ", "")
        exp_str = str(expected).strip().replace(" ", "")
        
        # Check booleans
        if act_str == "true" and exp_str.lower() == "true": return True
        if act_str == "false" and exp_str.lower() == "false": return True
        
        return act_str == exp_str
    except Exception:
        return str(actual).strip() == str(expected).strip()

def parse_input_to_python_statements(input_str):
    result = []
    current = []
    depth_bracket = 0
    depth_brace = 0
    depth_paren = 0
    in_string = False
    string_char = None
    
    i = 0
    while i < len(input_str):
        char = input_str[i]
        if in_string:
            if char == string_char and input_str[i-1] != '\\':
                in_string = False
        elif char in ('"', "'"):
            in_string = True
            string_char = char
        elif not in_string:
            if char == '[':
                depth_bracket += 1
            elif char == ']':
                depth_bracket -= 1
            elif char == '{':
                depth_brace += 1
            elif char == '}':
                depth_brace -= 1
            elif char == '(':
                depth_paren += 1
            elif char == ')':
                depth_paren -= 1
            elif char == ',' and depth_bracket == 0 and depth_brace == 0 and depth_paren == 0:
                result.append("".join(current).strip())
                current = []
                i += 1
                continue
        current.append(char)
        i += 1
        
    if current:
        result.append("".join(current).strip())
    return "\n".join(result)

def run():
    if len(sys.argv) < 2:
        print("Missing input JSON file path argument.", file=sys.stderr)
        sys.exit(1)

    input_file_path = sys.argv[1]
    try:
        with open(input_file_path, "r", encoding="utf-8") as f:
            payload = json.load(f)
    except Exception as e:
        print(f"Failed to read/parse input JSON file: {e}", file=sys.stderr)
        sys.exit(1)

    code = payload.get("code", "")
    test_cases = payload.get("testCases", [])
    results = []

    for tc in test_cases:
        # Create a fresh, restricted sandbox context for each test case
        sandbox_globals = {
            "__builtins__": builtins.__dict__.copy(),
            "restricted_import": restricted_import
        }
        sandbox_globals["__builtins__"]["__import__"] = restricted_import

        error = None
        actual = None
        passed = False
        runtime = 0
        memory_used = 0.0

        tracemalloc.start()
        start = time.perf_counter()
        try:
            # 1. Run candidate's code to load their function definition
            exec(code, sandbox_globals)

            # 2. Find the target function
            func = None
            for name, val in sandbox_globals.items():
                if callable(val) and not name.startswith("__") and name != "restricted_import":
                    if inspect.isfunction(val):
                        func = val
                        break

            if not func:
                raise ValueError("No function solution found in submitted code.")

            # 3. Run testcase input to define the arguments
            parsed_input = parse_input_to_python_statements(tc["input"])
            exec(parsed_input, sandbox_globals)

            # 4. Map argument names to their values and run
            sig = inspect.signature(func)
            args = [sandbox_globals.get(p_name) for p_name in sig.parameters.keys()]

            raw_actual = func(*args)
            runtime = int((time.perf_counter() - start) * 1000)

            # Measure peak memory
            current, peak = tracemalloc.get_traced_memory()
            memory_used = round(peak / (1024.0 * 1024.0), 3) # in MB

            actual = json.dumps(raw_actual)
            passed = normalize_compare(raw_actual, tc["expectedOutput"])
        except Exception as err:
            runtime = int((time.perf_counter() - start) * 1000)
            error = str(err)
            passed = False
        finally:
            tracemalloc.stop()

        results.append({
          "testCaseId": tc["id"],
          "passed": passed,
          "expected": tc["expectedOutput"],
          "actual": actual if actual is not None else "No output",
          "error": error,
          "runtime": runtime,
          "memory": memory_used
        })

    print(json.dumps(results))

if __name__ == "__main__":
    run()
