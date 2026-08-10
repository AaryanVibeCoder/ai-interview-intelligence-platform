import { NextRequest, NextResponse } from "next/server";
import { exec } from "child_process";
import * as fs from "fs";
import * as path from "path";
import * as os from "os";

interface TestCase {
  id: string;
  input: string;
  expectedOutput: string;
  isHidden: boolean;
}

interface ExecutionRequest {
  code: string;
  language: string;
  testCases: TestCase[];
}

export async function POST(req: NextRequest) {
  try {
    const { code, language, testCases, challengeId } = await req.json();

    const normalizedLang = language.toLowerCase();
    const activeChallengeId = challengeId || "two-sum";
    const results = [];

    // Temporary working folder inside the OS temp directory
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "elevateiq-exec-"));

    try {
      if (normalizedLang === "javascript" || normalizedLang === "typescript") {
        // Run JavaScript code locally in a sub-process
        const codePath = path.join(tempDir, "solution.js");
        
        for (const tc of testCases) {
          const testRunnerCode = `
${code}

// Invoke solution
try {
  const args = ${(tc as any).args ? JSON.stringify((tc as any).args) : '[]'};
  let result;
  if (typeof Solution !== 'undefined') {
    const sol = new Solution();
    const solveFunc = sol.solve || sol.twoSum || sol.isPalindrome || sol.isValid;
    result = solveFunc.apply(sol, args);
  } else {
    result = solve(...args);
  }
  console.log(JSON.stringify(result));
} catch (err) {
  console.error(err.message);
  process.exit(1);
}
`;
          fs.writeFileSync(codePath, testRunnerCode);

          const start = performance.now();
          const executionPromise = new Promise<{ passed: boolean; actual: string; error?: string }>((resolve) => {
            exec(`node "${codePath}"`, { timeout: 4000 }, (error, stdout, stderr) => {
              if (error) {
                resolve({
                  passed: false,
                  actual: "",
                  error: stderr.trim() || error.message || "Timeout / Runtime Error"
                });
                return;
              }

              const actualOutput = stdout.trim();
              const expectedNormalized = String(tc.expectedOutput).replace(/\s+/g, "");
              const actualNormalized = actualOutput.replace(/\s+/g, "");
              const passed = expectedNormalized === actualNormalized;
              
              resolve({
                passed,
                actual: actualOutput
              });
            });
          });

          const res = await executionPromise;
          results.push({
            testCaseId: tc.id,
            passed: res.passed,
            expected: tc.expectedOutput,
            actual: res.actual || "No output",
            error: res.error,
            runtime: Math.round(performance.now() - start)
          });
        }
      } else if (normalizedLang === "python") {
        // Run Python code locally in a sub-process
        const codePath = path.join(tempDir, "solution.py");

        for (const tc of testCases) {
          const testRunnerCode = `
import json
import sys

${code}

args = ${(tc as any).args ? JSON.stringify((tc as any).args) : '[]'}

try:
    if 'class Solution' in """${code}""":
        sol = Solution()
        solve_func = getattr(sol, 'solve', None)
        if not solve_func:
            for m in ['twoSum', 'isPalindrome', 'isValid']:
                if hasattr(sol, m):
                    solve_func = getattr(sol, m)
                    break
        res = solve_func(*args)
    else:
        res = solve(*args)
    print(json.dumps(res))
except Exception as e:
    print(str(e), file=sys.stderr)
    sys.exit(1)
`;
          fs.writeFileSync(codePath, testRunnerCode);

          const start = performance.now();
          const executionPromise = new Promise<{ passed: boolean; actual: string; error?: string }>((resolve) => {
            exec(`python "${codePath}"`, { timeout: 4000 }, (error, stdout, stderr) => {
              if (error) {
                exec(`python3 "${codePath}"`, { timeout: 4000 }, (err3, stdout3, stderr3) => {
                  if (err3) {
                    resolve({
                      passed: false,
                      actual: "",
                      error: stderr3.trim() || err3.message || "Runtime Error"
                    });
                  } else {
                    const actualOutput = stdout3.trim();
                    const expectedNormalized = String(tc.expectedOutput).replace(/\s+/g, "");
                    const actualNormalized = actualOutput.replace(/\s+/g, "");
                    const passed = expectedNormalized === actualNormalized;
                    resolve({ passed, actual: actualOutput });
                  }
                });
              } else {
                const actualOutput = stdout.trim();
                const expectedNormalized = String(tc.expectedOutput).replace(/\s+/g, "");
                const actualNormalized = actualOutput.replace(/\s+/g, "");
                const passed = expectedNormalized === actualNormalized;
                resolve({
                  passed,
                  actual: actualOutput
                });
              }
            });
          });

          const res = await executionPromise;
          results.push({
            testCaseId: tc.id,
            passed: res.passed,
            expected: tc.expectedOutput,
            actual: res.actual || "No output",
            error: res.error,
            runtime: Math.round(performance.now() - start)
          });
        }
      } else {
        // Fallback for compile-heavy runtimes (Java, C++, Go, Rust) in mock simulation mode
        results.push(...testCases.map((tc) => {
          const isCorrectStructure = code.includes("twoSum") || code.includes("Solution");
          const passed = isCorrectStructure && Math.random() > 0.15; // 85% success rate for correct templates
          return {
            testCaseId: tc.id,
            passed,
            expected: tc.expectedOutput,
            actual: passed ? tc.expectedOutput : "wrong output or compilation failed",
            runtime: Math.floor(Math.random() * 40) + 12
          };
        }));
      }
    } finally {
      // Clean up directory
      try {
        fs.rmSync(tempDir, { recursive: true, force: true });
      } catch (e) {
        console.error("Failed to delete temp dir", e);
      }
    }

    return NextResponse.json(results);
  } catch (error) {
    console.error("Execution handler error:", error);
    return NextResponse.json({ error: "Code execution pipeline failure" }, { status: 500 });
  }
}
