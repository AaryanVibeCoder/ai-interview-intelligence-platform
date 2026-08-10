import os
import sys
import json
import re
import tempfile
import subprocess
import random

def parse_constraint_bound(val_str):
    val_str = val_str.replace("^", "**").strip()
    try:
        if not re.match(r'^[0-9\s\+\-\*\/\(\)]+$', val_str):
            return None
        # Safe evaluation of simple math
        return eval(val_str, {"__builtins__": None})
    except Exception:
        return None

def check_task_constraints(args, constraints, arg_defs):
    # args is a list of actual arguments
    # arg_defs is a list of dicts: [{"name": "nums", "type": "integer_array"}, ...]
    args_map = {}
    for idx, arg_def in enumerate(arg_defs):
        if idx < len(args):
            args_map[arg_def["name"]] = args[idx]

    for c in constraints:
        c = c.strip()
        m = re.match(r'^([^<=]+)\s*<=\s*([a-zA-Z0-9_\[\]\.]+)\s*<=\s*([^<=]+)$', c)
        if m:
            min_str, var_expr, max_str = m.groups()
            min_val = parse_constraint_bound(min_str)
            max_val = parse_constraint_bound(max_str)
            if min_val is None or max_val is None:
                continue

            var_name = var_expr
            is_length = False
            is_element = False

            if var_expr.endswith(".length") or var_expr.endswith(".length()"):
                var_name = var_expr.split(".")[0]
                is_length = True
            elif var_expr.endswith("[i]"):
                var_name = var_expr.split("[")[0]
                is_element = True

            if var_name not in args_map:
                continue

            val = args_map[var_name]

            if is_length:
                if not isinstance(val, (list, str)):
                    raise ValueError(f"Constraint failed: {var_expr} requires a list or string, but got {type(val).__name__}")
                actual_len = len(val)
                if not (min_val <= actual_len <= max_val):
                    raise ValueError(f"Constraint violated: {c}. Length of {var_name} is {actual_len}, not in [{min_val}, {max_val}].")
            elif is_element:
                if not isinstance(val, list):
                    raise ValueError(f"Constraint failed: {var_expr} requires a list, but got {type(val).__name__}")
                for i, x in enumerate(val):
                    if not isinstance(x, (int, float)) or isinstance(x, bool):
                        raise ValueError(f"Constraint failed: {var_expr} expects numeric elements, but index {i} has {type(x).__name__}")
                    if not (min_val <= x <= max_val):
                        raise ValueError(f"Constraint violated: {c}. Element {x} at index {i} is not in [{min_val}, {max_val}].")
            else:
                if not isinstance(val, (int, float)) or isinstance(val, bool):
                    raise ValueError(f"Constraint failed: {var_expr} expects numeric value, but got {type(val).__name__}")
                if not (min_val <= val <= max_val):
                    raise ValueError(f"Constraint violated: {c}. Value {val} is not in [{min_val}, {max_val}].")

def execute_runner(lang, code, test_cases, return_type, comparison_type):
    services_dir = os.path.dirname(os.path.abspath(__file__))
    runner_script = "js_runner.js" if lang == "javascript" else "py_runner.py"
    runner_path = os.path.join(services_dir, runner_script)

    temp_json = tempfile.NamedTemporaryFile(mode="w+", delete=False, suffix=".json", encoding="utf-8")
    try:
        json.dump({
            "code": code,
            "testCases": test_cases,
            "returnType": return_type,
            "comparisonType": comparison_type,
            "limits": {"timeMs": 2000}
        }, temp_json)
        temp_json.close()

        if lang == "javascript":
            cmd = ["node", runner_path, temp_json.name]
        else:
            cmd = [sys.executable, runner_path, temp_json.name]

        proc = subprocess.run(cmd, capture_output=True, text=True, timeout=5.0)
        if proc.returncode != 0:
            return {"error": proc.stderr.strip() or f"Runner exited with code {proc.returncode}"}

        return json.loads(proc.stdout.strip())
    except Exception as e:
        return {"error": str(e)}
    finally:
        if os.path.exists(temp_json.name):
            try:
                os.remove(temp_json.name)
            except Exception:
                pass

def generate_random_arg(arg_type):
    # Generates small inputs for brute force
    if arg_type == 'integer':
        return random.randint(-50, 50)
    elif arg_type == 'float':
        return round(random.uniform(-50.0, 50.0), 4)
    elif arg_type == 'boolean':
        return random.choice([True, False])
    elif arg_type == 'string':
        chars = 'abcdefghijklmnopqrstuvwxyz'
        return "".join(random.choice(chars) for _ in range(random.randint(1, 8)))
    elif arg_type.endswith('_array') or arg_type == 'array':
        elem_type = arg_type.replace('_array', '') if arg_type != 'array' else 'integer'
        length = random.randint(1, 8)
        return [generate_random_arg(elem_type) for _ in range(length)]
    return None

def validate_task(task_data: dict) -> dict:
    """
    Validate a task specification before publication.
    Performs schema validation, constraint checks, reference solution differential testing,
    and random brute-force testing (if applicable).
    """
    report = {"valid": False, "errors": [], "logs": []}

    # 1. Schema Validation
    required_keys = ["id", "title", "description", "difficulty", "function", "starterCode", "testCases", "constraints"]
    for key in required_keys:
        if key not in task_data:
            report["errors"].append(f"Missing required key: {key}")
    
    if report["errors"]:
        return report

    func_meta = task_data["function"]
    if func_meta.get("name") != "solve":
        report["errors"].append(f"Function name contract violation: expected 'solve', got '{func_meta.get('name')}'")
    
    if "arguments" not in func_meta or not isinstance(func_meta["arguments"], list):
        report["errors"].append("Missing or invalid 'function.arguments' specification")
    
    if "returnType" not in func_meta:
        report["errors"].append("Missing 'function.returnType'")

    ref_impls = task_data.get("referenceImplementations")
    if not ref_impls:
        report["errors"].append("Missing 'referenceImplementations'")
    else:
        if "javascript" not in ref_impls:
            report["errors"].append("Missing 'referenceImplementations.javascript'")
        if "python" not in ref_impls:
            report["errors"].append("Missing 'referenceImplementations.python'")

    test_cases = task_data.get("testCases", [])
    if not test_cases:
        report["errors"].append("No test cases defined")

    if report["errors"]:
        return report

    # 2. Check test cases structure & constraints
    arg_defs = func_meta["arguments"]
    for idx, tc in enumerate(test_cases):
        tc_id = tc.get("id", f"index_{idx}")
        if "args" not in tc:
            report["errors"].append(f"Test case {tc_id} is missing 'args' list")
            continue
        if len(tc["args"]) != len(arg_defs):
            report["errors"].append(f"Test case {tc_id} argument count mismatch: expected {len(arg_defs)}, got {len(tc['args'])}")
            continue
        
        # Check constraints
        try:
            check_task_constraints(tc["args"], task_data.get("constraints", []), arg_defs)
        except ValueError as ve:
            report["errors"].append(f"Test case {tc_id} constraint violation: {str(ve)}")

    if report["errors"]:
        return report

    # 3. Reference Solution Execution & Differential verification
    js_ref = ref_impls["javascript"]
    py_ref = ref_impls["python"]
    return_type = func_meta["returnType"]
    comparison_type = task_data.get("comparison", {}).get("type", "exact")

    # Run JS Reference
    js_results = execute_runner("javascript", js_ref, test_cases, return_type, comparison_type)
    if isinstance(js_results, dict) and "error" in js_results:
        report["errors"].append(f"JavaScript reference solution compilation/execution failure: {js_results['error']}")
        return report

    # Run Python Reference
    py_results = execute_runner("python", py_ref, test_cases, return_type, comparison_type)
    if isinstance(py_results, dict) and "error" in py_results:
        report["errors"].append(f"Python reference solution compilation/execution failure: {py_results['error']}")
        return report

    # Compare results of reference solutions against each other and declared expectedOutput
    for i, tc in enumerate(test_cases):
        tc_id = tc["id"]
        js_res = js_results[i]
        py_res = py_results[i]

        if not js_res.get("passed"):
            report["errors"].append(f"JS Reference Solution fails test case {tc_id}: expected {tc['expectedOutput']}, got {js_res.get('actual')}. Error: {js_res.get('error')}")
        
        if not py_res.get("passed"):
            report["errors"].append(f"Python Reference Solution fails test case {tc_id}: expected {tc['expectedOutput']}, got {py_res.get('actual')}. Error: {py_res.get('error')}")

        # Check JS actual matches Python actual
        if js_res.get("actual") != py_res.get("actual") and js_res.get("passed") and py_res.get("passed"):
            report["errors"].append(f"Differential inconsistency on test case {tc_id}: JS output {js_res.get('actual')} does not match Python output {py_res.get('actual')}")

    if report["errors"]:
        return report

    # 4. Brute Force Verification (if brute force implementations exist)
    brute_impls = task_data.get("bruteForceImplementations")
    if brute_impls and ("python" in brute_impls or "javascript" in brute_impls):
        report["logs"].append("Running brute-force differential testing against optimized reference solution...")
        
        # Generate 50 small random inputs
        rand_test_cases = []
        for i in range(50):
            args = []
            for arg_def in arg_defs:
                args.append(generate_random_arg(arg_def["type"]))
            rand_test_cases.append({
                "id": f"rand_{i}",
                "args": args,
                "expectedOutput": None, # Will be set by running optimized solution
                "isHidden": True
            })

        # Run optimized solution to establish frozen expected outputs
        opt_results = execute_runner("python", py_ref, rand_test_cases, return_type, comparison_type)
        if isinstance(opt_results, dict) and "error" in opt_results:
            report["errors"].append(f"Failed running optimized reference on generated random inputs: {opt_results['error']}")
            return report

        for i, res in enumerate(opt_results):
            if res.get("status") == "PASSED" or res.get("actual") != "No output":
                # actual is a JSON string of output, we need to load it back
                try:
                    rand_test_cases[i]["expectedOutput"] = json.loads(res.get("actual"))
                except Exception:
                    rand_test_cases[i]["expectedOutput"] = res.get("actual")
            else:
                # If optimized fails/runtime error on random test, it's a bug in optimized reference!
                report["errors"].append(f"Optimized reference solution crashed on random test case {i}: {res.get('error')}")
                return report

        # Now run brute force implementation
        brute_lang = "python" if "python" in brute_impls else "javascript"
        brute_code = brute_impls[brute_lang]
        
        brute_results = execute_runner(brute_lang, brute_code, rand_test_cases, return_type, comparison_type)
        if isinstance(brute_results, dict) and "error" in brute_results:
            report["errors"].append(f"Brute-force solution crashed during execution: {brute_results['error']}")
            return report

        for i, res in enumerate(brute_results):
            if not res.get("passed"):
                report["errors"].append(
                    f"Differential failure between optimized and brute force solutions on random input.\n"
                    f"Input args: {rand_test_cases[i]['args']}\n"
                    f"Optimized reference output: {rand_test_cases[i]['expectedOutput']}\n"
                    f"Brute force output: {res.get('actual')}\n"
                    f"Brute error: {res.get('error')}"
                )
                break

    if not report["errors"]:
        report["valid"] = True

    return report
