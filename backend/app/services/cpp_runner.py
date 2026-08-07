"""
Real C++ sandboxed execution for coding challenges.

Reads a JSON payload (candidate code + test cases) from a file, generates a
C++ harness that parses the solution class/method, compiles it once, then runs
the compiled binary once per test case with per-test timing and crash
isolation. Outputs a JSON array of per-test results identical in shape to
py_runner.py / js_runner.js.

If no C++ compiler is available, every test case reports an honest error
instead of a fabricated pass.
"""
import sys
import os
import re
import ast
import json
import time
import shutil
import subprocess
import tempfile

# ---------------------------------------------------------------------------
# Comparison helpers (mirror py_runner.py semantics)
# ---------------------------------------------------------------------------

def normalize_compare(actual, expected):
    try:
        act_str = json.dumps(actual).replace(" ", "")
        exp_str = str(expected).strip().replace(" ", "")

        if act_str == "true" and exp_str.lower() == "true":
            return True
        if act_str == "false" and exp_str.lower() == "false":
            return True

        return act_str == exp_str
    except Exception:
        return str(actual).strip() == str(expected).strip()


class RunnerError(Exception):
    pass


# ---------------------------------------------------------------------------
# Python-literal helpers (the challenge `input` field uses Python-like syntax)
# ---------------------------------------------------------------------------

def split_top_level(input_str):
    """Split a comma-separated list of `name = value` assignments at top level."""
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
            if char == string_char and input_str[i - 1] != "\\":
                in_string = False
        elif char in ('"', "'"):
            in_string = True
            string_char = char
        elif not in_string:
            if char == "[":
                depth_bracket += 1
            elif char == "]":
                depth_bracket -= 1
            elif char == "{":
                depth_brace += 1
            elif char == "}":
                depth_brace -= 1
            elif char == "(":
                depth_paren += 1
            elif char == ")":
                depth_paren -= 1
            elif char == "," and depth_bracket == 0 and depth_brace == 0 and depth_paren == 0:
                result.append("".join(current).strip())
                current = []
                i += 1
                continue
        current.append(char)
        i += 1

    if current:
        result.append("".join(current).strip())
    return [r for r in result if r]


def to_python_literal(raw):
    """Convert JSON-ish `true`/`false`/`null` to Python literals outside strings."""
    out = []
    i = 0
    n = len(raw)
    in_string = None
    while i < n:
        c = raw[i]
        if in_string:
            out.append(c)
            if c == "\\":
                if i + 1 < n:
                    out.append(raw[i + 1])
                    i += 2
                    continue
            elif c == in_string:
                in_string = None
            i += 1
            continue
        if c in ('"', "'"):
            in_string = c
            out.append(c)
            i += 1
            continue
        if c.isalpha():
            j = i
            while j < n and (raw[j].isalnum() or raw[j] == "_"):
                j += 1
            word = raw[i:j]
            if word == "true":
                out.append("True")
            elif word == "false":
                out.append("False")
            elif word in ("null", "None"):
                out.append("None")
            else:
                out.append(word)
            i = j
            continue
        out.append(c)
        i += 1
    return "".join(out)


def parse_test_input(input_str):
    """Return dict mapping argument names to Python values."""
    assigns = {}
    for stmt in split_top_level(input_str):
        m = re.match(r"^\s*([A-Za-z_]\w*)\s*=\s*(.+?)\s*$", stmt)
        if not m:
            continue
        name, raw_value = m.group(1), m.group(2)
        assigns[name] = ast.literal_eval(to_python_literal(raw_value))
    return assigns


# ---------------------------------------------------------------------------
# C++ code analysis (find `class Solution` and its method signature)
# ---------------------------------------------------------------------------

def normalize_type(t):
    t = t.replace("std::", "")
    t = re.sub(r"\b(const|volatile|struct|class)\b", "", t)
    t = t.replace("&", "").replace("*", "")
    t = re.sub(r"\s+", "", t)
    return t


def find_class_body(code):
    m = re.search(r"\bclass\s+Solution\b\s*\{", code)
    if not m:
        return None
    start = code.index("{", m.start())
    depth = 0
    for i in range(start, len(code)):
        if code[i] == "{":
            depth += 1
        elif code[i] == "}":
            depth -= 1
            if depth == 0:
                return code[start + 1:i]
    return None


def split_params(param_str):
    parts = []
    cur = []
    depth = 0
    i = 0
    n = len(param_str)
    while i < n:
        c = param_str[i]
        if c in "(<[":
            depth += 1
        elif c in ")>]":
            depth -= 1
        elif c == "," and depth == 0:
            parts.append("".join(cur).strip())
            cur = []
            i += 1
            continue
        cur.append(c)
        i += 1
    if cur:
        parts.append("".join(cur).strip())
    return [p for p in parts if p]


def parse_param(p):
    depth = 0
    eq_idx = None
    for i, c in enumerate(p):
        if c in "(<[":
            depth += 1
        elif c in ")>]":
            depth -= 1
        elif c == "=" and depth == 0:
            eq_idx = i
            break
    if eq_idx is not None:
        p = p[:eq_idx]
    p = p.strip()
    if not p:
        return None
    tokens = p.split()
    name = tokens[-1].lstrip("&*")
    if not name or not re.match(r"^[A-Za-z_]\w*$", name):
        return None
    type_str = " ".join(tokens[:-1]) if len(tokens) > 1 else tokens[0]
    return normalize_type(type_str), name


def parse_solution(code):
    body = find_class_body(code)
    if body is None:
        raise RunnerError("No `class Solution` found in submitted C++ code.")

    pub_idx = body.find("public")
    if pub_idx == -1:
        raise RunnerError("`class Solution` has no public method to test.")
    after_pub = body[pub_idx + len("public"):]

    m = re.search(
        r"([A-Za-z_][A-Za-z0-9_<>,:\s&*]*?)\s+([A-Za-z_]\w*)\s*\(([^)]*)\)\s*(?:const\s*)?\{",
        after_pub,
        re.DOTALL,
    )
    if not m:
        raise RunnerError("Could not find a callable method signature inside `class Solution`.")

    ret_type = normalize_type(m.group(1))
    method_name = m.group(2)
    params = []
    for raw in split_params(m.group(3)):
        parsed = parse_param(raw)
        if parsed:
            params.append(parsed)

    return {
        "method": method_name,
        "return_type": ret_type,
        "params": params,
    }


# ---------------------------------------------------------------------------
# Python literal -> C++ initializer
# ---------------------------------------------------------------------------

def cpp_escape(s):
    out = []
    for ch in s:
        o = ord(ch)
        if ch == '"':
            out.append('\\"')
        elif ch == "\\":
            out.append("\\\\")
        elif ch == "\n":
            out.append("\\n")
        elif ch == "\r":
            out.append("\\r")
        elif ch == "\t":
            out.append("\\t")
        elif o < 0x20:
            out.append("\\x%02x" % o)
        else:
            out.append(ch)
    return "".join(out)


INT_TYPES = {"int", "long", "long long", "short", "size_t"}
FLOAT_TYPES = {"double", "float"}
SCALAR_TYPES = INT_TYPES | FLOAT_TYPES | {"bool", "char", "string"}


def cpp_decl_type(t):
    t = normalize_type(t)
    if t == "string":
        return "std::string"
    if t.startswith("vector"):
        return "std::" + t
    return t


def cpp_expr_for(t, v, path):
    t = normalize_type(t)
    if t in INT_TYPES:
        if isinstance(v, bool) or not isinstance(v, (int, float)):
            raise RunnerError("%s: expected integer for C++ type %s, got %r" % (path, t, v))
        if isinstance(v, float) and not v.is_integer():
            raise RunnerError("%s: expected integer for C++ type %s, got %r" % (path, t, v))
        return repr(int(v))
    if t in FLOAT_TYPES:
        if isinstance(v, bool) or not isinstance(v, (int, float)):
            raise RunnerError("%s: expected number for C++ type %s, got %r" % (path, t, v))
        return repr(float(v))
    if t == "bool":
        return "true" if bool(v) else "false"
    if t == "char":
        if not isinstance(v, str) or len(v) != 1:
            raise RunnerError("%s: expected a single character for C++ type char, got %r" % (path, v))
        return "'" + cpp_escape(v) + "'"
    if t == "string":
        if not isinstance(v, str):
            raise RunnerError("%s: expected a string for C++ type std::string, got %r" % (path, v))
        return '"' + cpp_escape(v) + '"'

    m = re.fullmatch(r"vector<(.+)>", t)
    if m:
        inner = m.group(1)
        if not isinstance(v, (list, tuple)):
            raise RunnerError("%s: expected a list for C++ type %s, got %r" % (path, t, v))
        items = ", ".join(
            cpp_expr_for(inner, x, "%s[%d]" % (path, i)) for i, x in enumerate(v)
        )
        return "std::vector<%s>{%s}" % (inner, items)

    raise RunnerError("%s: unsupported C++ parameter/return type %r for the sandbox harness" % (path, t))


# ---------------------------------------------------------------------------
# Harness generation
# ---------------------------------------------------------------------------

HARNESS_INCLUDES = (
    "#include <algorithm>\n#include <array>\n#include <bitset>\n#include <cctype>\n"
    "#include <cmath>\n#include <cstdio>\n#include <cstdlib>\n#include <cstring>\n"
    "#include <cstdint>\n#include <deque>\n#include <functional>\n#include <iostream>\n"
    "#include <limits>\n#include <list>\n#include <map>\n#include <numeric>\n"
    "#include <queue>\n#include <set>\n#include <sstream>\n#include <stack>\n"
    "#include <string>\n#include <tuple>\n#include <unordered_map>\n"
    "#include <unordered_set>\n#include <utility>\n#include <vector>\n\n"
    "using namespace std;\n\n"
)

HARNESS_HELPERS = r'''
string cpp_js_escape(const string& s) {
  ostringstream out;
  for (unsigned char c : s) {
    switch (c) {
      case '"': out << "\\\""; break;
      case '\\': out << "\\\\"; break;
      case '\n': out << "\\n"; break;
      case '\r': out << "\\r"; break;
      case '\t': out << "\\t"; break;
      default:
        if (c < 0x20) {
          char buf[8];
          snprintf(buf, sizeof buf, "\\u%04x", (unsigned)c);
          out << buf;
        } else {
          out << (char)c;
        }
    }
  }
  return out.str();
}

static void cpp_emit(ostream& o, int v) { o << v; }
static void cpp_emit(ostream& o, long v) { o << v; }
static void cpp_emit(ostream& o, long long v) { o << v; }
static void cpp_emit(ostream& o, size_t v) { o << v; }
static void cpp_emit(ostream& o, double v) { o << v; }
static void cpp_emit(ostream& o, float v) { o << v; }
static void cpp_emit(ostream& o, char v) { o << '"' << cpp_js_escape(string(1, v)) << '"'; }
static void cpp_emit(ostream& o, bool v) { o << (v ? "true" : "false"); }
static void cpp_emit(ostream& o, const string& v) { o << '"' << cpp_js_escape(v) << '"'; }
static void cpp_emit(ostream& o, const char* v) { o << '"' << cpp_js_escape(string(v ? v : "")) << '"'; }

template <typename T>
static void cpp_emit(ostream& o, const vector<T>& v) {
  o << '[';
  for (size_t i = 0; i < v.size(); ++i) { if (i) o << ','; cpp_emit(o, v[i]); }
  o << ']';
}

template <typename T>
static string cpp_to_json(const T& v) {
  ostringstream oss;
  cpp_emit(oss, v);
  return oss.str();
}
'''


def build_harness(code, solution, test_cases):
    method = solution["method"]
    ret_type = solution["return_type"]
    params = solution["params"]

    cases = []
    for idx, tc in enumerate(test_cases):
        try:
            values = parse_test_input(tc.get("input", ""))
        except Exception as e:
            raise RunnerError("Failed to parse input for test case %s: %s" % (tc.get("id"), e))

        decls = []
        for ptype, pname in params:
            if pname not in values:
                raise RunnerError(
                    "Missing input value for parameter `%s` in test case %s"
                    % (pname, tc.get("id"))
                )
            expr = cpp_expr_for(ptype, values[pname], "input `%s` for `%s`" % (pname, tc.get("id")))
            decls.append("%s %s = %s;" % (cpp_decl_type(ptype), pname, expr))

        call_args = ", ".join(p[1] for p in params)
        if ret_type == "void":
            call = "sol.%s(%s); cout << \"null\" << endl;" % (method, call_args)
        else:
            call = "cout << cpp_to_json(sol.%s(%s)) << endl;" % (method, call_args)

        cases.append(
            "  case %d: {\n    Solution sol;\n    %s\n    %s\n    break;\n  }"
            % (idx, " ".join(decls), call)
        )

    main = (
        "int main(int argc, char** argv) {\n"
        "  int idx = argc > 1 ? atoi(argv[1]) : 0;\n"
        "  switch (idx) {\n"
        + "\n".join(cases)
        + "\n    default: return 1;\n  }\n  return 0;\n}\n"
    )

    return HARNESS_INCLUDES + code + "\n" + HARNESS_HELPERS + "\n" + main


# ---------------------------------------------------------------------------
# Compiler detection + compile/run
# ---------------------------------------------------------------------------

def find_compiler():
    env_cxx = os.environ.get("CXX")
    if env_cxx and shutil.which(env_cxx):
        return shutil.which(env_cxx), "gcc"
    for name in ("g++", "clang++"):
        path = shutil.which(name)
        if path:
            return path, "gcc"
    path = shutil.which("cl")
    if path:
        return path, "msvc"
    return None, None


def compile_source(cxx, kind, src_path, exe_path):
    if kind == "msvc":
        cmd = [cxx, "/nologo", "/EHsc", "/O2", "/Fe:" + exe_path, src_path]
    else:
        cmd = [cxx, "-std=c++17", "-O2", "-o", exe_path, src_path]
    proc = subprocess.run(cmd, capture_output=True, text=True, timeout=20.0)
    return proc.returncode, (proc.stderr or proc.stdout).strip()


def error_results(test_cases, message):
    return [
        {
            "testCaseId": tc.get("id"),
            "passed": False,
            "expected": tc.get("expectedOutput"),
            "actual": "Execution unavailable",
            "error": message,
            "runtime": 0,
        }
        for tc in test_cases
    ]


def run():
    if len(sys.argv) < 2:
        print("Missing input JSON file path argument.", file=sys.stderr)
        sys.exit(1)

    input_file_path = sys.argv[1]
    try:
        with open(input_file_path, "r", encoding="utf-8") as f:
            payload = json.load(f)
    except Exception as e:
        print("Failed to read/parse input JSON file: %s" % e, file=sys.stderr)
        sys.exit(1)

    code = payload.get("code", "")
    test_cases = payload.get("testCases", [])

    if not test_cases:
        print(json.dumps([]))
        return

    # Honest failure if no compiler exists on this machine.
    cxx, kind = find_compiler()
    if not cxx:
        print(json.dumps(error_results(
            test_cases,
            "No C++ compiler available on this server; C++ execution is disabled.",
        )))
        return

    tmpdir = tempfile.mkdtemp(prefix="cpp_runner_")
    try:
        src_path = os.path.join(tmpdir, "harness.cpp")
        exe_path = os.path.join(tmpdir, "harness.exe" if os.name == "nt" else "harness")

        try:
            solution = parse_solution(code)
        except RunnerError as e:
            print(json.dumps(error_results(test_cases, str(e))))
            return

        try:
            harness = build_harness(code, solution, test_cases)
        except RunnerError as e:
            print(json.dumps(error_results(test_cases, str(e))))
            return

        with open(src_path, "w", encoding="utf-8") as f:
            f.write(harness)

        try:
            retcode, err = compile_source(cxx, kind, src_path, exe_path)
        except subprocess.TimeoutExpired:
            print(json.dumps(error_results(
                test_cases, "Compilation timed out after 20 seconds.")))
            return
        except Exception as e:
            print(json.dumps(error_results(test_cases, "Compiler error: %s" % e)))
            return

        if retcode != 0:
            message = "Compilation failed: %s" % (err[:1000] if err else "unknown error")
            print(json.dumps(error_results(test_cases, message)))
            return

        results = []
        for idx, tc in enumerate(test_cases):
            start = time.perf_counter()
            try:
                proc = subprocess.run(
                    [exe_path, str(idx)],
                    capture_output=True,
                    text=True,
                    timeout=4.0,
                )
                runtime = int((time.perf_counter() - start) * 1000)
            except subprocess.TimeoutExpired:
                results.append({
                    "testCaseId": tc.get("id"),
                    "passed": False,
                    "expected": tc.get("expectedOutput"),
                    "actual": "Time Limit Exceeded",
                    "error": "Execution timed out after 4 seconds (infinite loop protection).",
                    "runtime": 4000,
                })
                continue
            except Exception as e:
                results.append({
                    "testCaseId": tc.get("id"),
                    "passed": False,
                    "expected": tc.get("expectedOutput"),
                    "actual": "Sandbox pipeline error",
                    "error": str(e),
                    "runtime": 0,
                })
                continue

            output = proc.stdout.strip()
            if proc.returncode != 0:
                results.append({
                    "testCaseId": tc.get("id"),
                    "passed": False,
                    "expected": tc.get("expectedOutput"),
                    "actual": "Runtime crash (exit code %d)" % proc.returncode,
                    "error": (proc.stderr or proc.stdout).strip()[:1000] or "Execution crashed.",
                    "runtime": runtime,
                })
                continue

            try:
                raw = json.loads(output)
            except Exception:
                results.append({
                    "testCaseId": tc.get("id"),
                    "passed": False,
                    "expected": tc.get("expectedOutput"),
                    "actual": output or "No output",
                    "error": "Runner produced malformed output.",
                    "runtime": runtime,
                })
                continue

            results.append({
                "testCaseId": tc.get("id"),
                "passed": normalize_compare(raw, tc.get("expectedOutput")),
                "expected": tc.get("expectedOutput"),
                "actual": json.dumps(raw),
                "error": None,
                "runtime": runtime,
            })

        print(json.dumps(results))
    finally:
        try:
            shutil.rmtree(tmpdir, ignore_errors=True)
        except Exception:
            pass


if __name__ == "__main__":
    run()
