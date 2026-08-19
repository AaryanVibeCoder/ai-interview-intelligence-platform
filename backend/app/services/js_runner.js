const fs = require('fs');
const cp = require('child_process');
const path = require('path');
const vm = require('vm');
const { performance } = require('perf_hooks');

function validateReturnType(result, returnType) {
  if (result === undefined) {
    throw new Error("Solution must return a value; returned undefined");
  }
  if (returnType === 'integer') {
    if (typeof result !== 'number' || !Number.isInteger(result)) {
      throw new Error(`Expected return type 'integer', but got '${typeof result}'`);
    }
  } else if (returnType === 'float') {
    if (typeof result !== 'number') {
      throw new Error(`Expected return type 'float', but got '${typeof result}'`);
    }
  } else if (returnType === 'boolean') {
    if (typeof result !== 'boolean') {
      throw new Error(`Expected return type 'boolean', but got '${typeof result}'`);
    }
  } else if (returnType === 'string') {
    if (typeof result !== 'string') {
      throw new Error(`Expected return type 'string', but got '${typeof result}'`);
    }
  } else if (returnType && (returnType.endsWith('_array') || returnType === 'array')) {
    if (!Array.isArray(result)) {
      throw new Error(`Expected return type 'array', but got '${typeof result}'`);
    }
    if (returnType === 'integer_array') {
      if (!result.every(x => typeof x === 'number' && Number.isInteger(x))) {
        throw new Error("Expected return type 'integer_array', but array contains non-integer values");
      }
    } else if (returnType === 'float_array') {
      if (!result.every(x => typeof x === 'number')) {
        throw new Error("Expected return type 'float_array', but array contains non-numeric values");
      }
    } else if (returnType === 'string_array') {
      if (!result.every(x => typeof x === 'string')) {
        throw new Error("Expected return type 'string_array', but array contains non-string values");
      }
    } else if (returnType === 'boolean_array') {
      if (!result.every(x => typeof x === 'boolean')) {
        throw new Error("Expected return type 'boolean_array', but array contains non-boolean values");
      }
    }
  } else if (returnType === 'object') {
    if (result === null || typeof result !== 'object' || Array.isArray(result)) {
      throw new Error(`Expected return type 'object', but got '${result === null ? 'null' : Array.isArray(result) ? 'array' : typeof result}'`);
    }
  }
}

function compareOutputs(actual, expected, returnType, comparisonType = "exact") {
  if (typeof actual === 'number' && typeof expected === 'number') {
    if (actual === expected) {
      return true;
    }
    if (!Number.isFinite(actual) || !Number.isFinite(expected)) {
      return false;
    }
    if (!Number.isInteger(actual) || !Number.isInteger(expected)) {
      return Math.abs(actual - expected) <= 1e-9;
    }
    return actual === expected;
  }
  
  if (typeof actual === 'boolean' && typeof expected === 'boolean') {
    return actual === expected;
  }
  
  return deepEqual(actual, expected, comparisonType);
}

function deepEqual(a, b, comparisonType = "exact") {
  if (a === b) return true;
  
  if (Array.isArray(a) && Array.isArray(b)) {
    if (a.length !== b.length) return false;
    
    if (comparisonType === 'unordered_array') {
      const aSorted = [...a].sort(compareValues);
      const bSorted = [...b].sort(compareValues);
      return aSorted.every((val, i) => deepEqual(val, bSorted[i], "exact"));
    }
    
    return a.every((val, i) => deepEqual(val, b[i], comparisonType));
  }
  
  if (a && b && typeof a === 'object' && typeof b === 'object') {
    const keysA = Object.keys(a);
    const keysB = Object.keys(b);
    if (keysA.length !== keysB.length) return false;
    
    for (const key of keysA) {
      if (!Object.prototype.hasOwnProperty.call(b, key)) return false;
      if (!deepEqual(a[key], b[key], comparisonType)) return false;
    }
    return true;
  }
  
  return String(a) === String(b);
}

function compareValues(a, b) {
  const strA = typeof a === 'object' ? JSON.stringify(a) : String(a);
  const strB = typeof b === 'object' ? JSON.stringify(b) : String(b);
  return strA.localeCompare(strB);
}

function readStdin() {
  return new Promise((resolve, reject) => {
    let content = '';
    process.stdin.setEncoding('utf-8');
    process.stdin.on('data', chunk => {
      content += chunk;
    });
    process.stdin.on('end', () => {
      resolve(content);
    });
    process.stdin.on('error', err => {
      reject(err);
    });
  });
}

// ----------------------------------------------------
// WORKER MODE
// ----------------------------------------------------
function runWorker() {
  const payloadPath = process.argv[3];
  let payload;
  try {
    payload = JSON.parse(fs.readFileSync(payloadPath, 'utf8'));
  } catch (err) {
    console.error("Worker failed to read payload:", err.message);
    process.exit(1);
  }

  const { code, args, returnType } = payload;
  const outputLimit = 10000;
  let outputBuffer = "";

  // Evaluate candidate's code inside VM context for console redirection/solve checking.
  // The OS-level sandboxing (bubblewrap) provides the actual security boundary.
  const sandbox = {
    console: {
      log: (...a) => {
        const str = a.map(x => typeof x === 'object' ? JSON.stringify(x) : String(x)).join(' ') + '\n';
        if (outputBuffer.length + str.length > outputLimit) {
          throw new Error("Output Limit Exceeded");
        }
        outputBuffer += str;
      },
      error: (...a) => {
        const str = a.map(x => typeof x === 'object' ? JSON.stringify(x) : String(x)).join(' ') + '\n';
        if (outputBuffer.length + str.length > outputLimit) {
          throw new Error("Output Limit Exceeded");
        }
        outputBuffer += str;
      },
      warn: (...a) => {
        const str = a.map(x => typeof x === 'object' ? JSON.stringify(x) : String(x)).join(' ') + '\n';
        if (outputBuffer.length + str.length > outputLimit) {
          throw new Error("Output Limit Exceeded");
        }
        outputBuffer += str;
      },
      info: (...a) => {
        const str = a.map(x => typeof x === 'object' ? JSON.stringify(x) : String(x)).join(' ') + '\n';
        if (outputBuffer.length + str.length > outputLimit) {
          throw new Error("Output Limit Exceeded");
        }
        outputBuffer += str;
      }
    }
  };

  const context = vm.createContext(sandbox);

  try {
    vm.runInContext(code, context);
    if (typeof sandbox.solve !== 'function') {
      throw new Error("Submission must define function solve(...)");
    }
    sandbox.__args = args;
    const rawActual = vm.runInContext("solve(...__args)", context);
    validateReturnType(rawActual, returnType);
    
    console.log(JSON.stringify({
      status: "PASSED",
      passed: true,
      actual: rawActual,
      error: null
    }));
    process.exit(0);
  } catch (err) {
    let status = "RUNTIME_ERROR";
    let error = err.message || String(err);
    if (error.includes("Output Limit Exceeded")) {
      status = "OUTPUT_LIMIT_EXCEEDED";
    } else if (error.includes("Expected return type")) {
      status = "INVALID_RETURN_TYPE";
    } else if (err.name === 'SyntaxError' || err instanceof SyntaxError) {
      status = "COMPILE_ERROR";
    } else if (error.toLowerCase().includes("allocation failed") || error.toLowerCase().includes("out of memory")) {
      status = "MEMORY_LIMIT_EXCEEDED";
    }
    console.log(JSON.stringify({
      status: status,
      passed: false,
      actual: null,
      error: error
    }));
    process.exit(0);
  }
}

// ----------------------------------------------------
// PARENT RUNNER MODE
// ----------------------------------------------------
async function run() {
  if (process.argv[2] === '--worker') {
    runWorker();
    return;
  }

  let payload;
  if (process.argv.length < 3) {
    try {
      const stdinContent = await readStdin();
      payload = JSON.parse(stdinContent);
    } catch (err) {
      console.error("Failed to read/parse input JSON from stdin:", err.message);
      process.exit(1);
    }
  } else {
    const inputFilePath = process.argv[2];
    try {
      payload = JSON.parse(fs.readFileSync(inputFilePath, 'utf8'));
    } catch (err) {
      console.error("Failed to read/parse input JSON file:", err.message);
      process.exit(1);
    }
  }

  const { code, testCases, returnType, comparisonType, limits } = payload;
  const timeLimitMs = (limits && limits.timeMs) || 2000;

  const results = [];

  for (const tc of testCases) {
    const tempDir = path.dirname(process.argv[2] || '/tmp');
    const workerPayloadPath = path.join(tempDir, `js-worker-payload-${tc.id}.json`);
    
    let error = null;
    let actualVal = null;
    let passed = false;
    let runtime = 0;
    let status = "PASSED";

    try {
      const cleanArgs = JSON.parse(JSON.stringify(tc.args || []));
      fs.writeFileSync(workerPayloadPath, JSON.stringify({
        code,
        args: cleanArgs,
        returnType
      }));

      const start = performance.now();
      
      const res = cp.spawnSync(process.execPath, [__filename, '--worker', workerPayloadPath], {
        timeout: timeLimitMs,
        killSignal: 'SIGKILL',
        maxBuffer: 1024 * 1024,
        encoding: 'utf8'
      });

      runtime = Math.round(performance.now() - start);

      if (res.error) {
        if (res.error.code === 'ETIMEDOUT') {
          status = "TIME_LIMIT_EXCEEDED";
          error = `Execution timed out after ${timeLimitMs}ms.`;
        } else {
          status = "RUNTIME_ERROR";
          error = res.error.message || String(res.error);
        }
      } else if (res.status !== 0 || res.signal) {
        status = "RUNTIME_ERROR";
        const stderrStr = res.stderr || "";
        error = stderrStr.trim() || `Worker exited with status ${res.status} (signal: ${res.signal})`;
        if (res.status === 137 || res.signal === 'SIGKILL' || error.toLowerCase().includes("out of memory") || error.toLowerCase().includes("heap limit allocation failed") || error.toLowerCase().includes("allocation failed") || error.toLowerCase().includes("bad_alloc") || error.toLowerCase().includes("unhandled exception")) {
          status = "MEMORY_LIMIT_EXCEEDED";
          error = "Memory Limit Exceeded: Sandboxed process resources exhausted.";
        }
      } else {
        const stdoutStr = (res.stdout || "").trim();
        try {
          const workerRes = JSON.parse(stdoutStr);
          status = workerRes.status || "PASSED";
          passed = workerRes.passed || false;
          actualVal = workerRes.actual;
          error = workerRes.error;
          
          if (status === "PASSED") {
            passed = compareOutputs(actualVal, tc.expectedOutput, returnType, comparisonType || "exact");
            if (!passed) {
              status = "WRONG_ANSWER";
            }
          }
        } catch (parseErr) {
          status = "INTERNAL_RUNNER_ERROR";
          error = `Failed to parse worker output: ${parseErr.message}. Stdout: ${stdoutStr}. Stderr: ${res.stderr || ""}`;
        }
      }
    } catch (err) {
      status = "INTERNAL_RUNNER_ERROR";
      error = err.message || String(err);
    } finally {
      try {
        fs.unlinkSync(workerPayloadPath);
      } catch (_) {}
    }

    results.push({
      testCaseId: tc.id,
      status,
      passed,
      expected: typeof tc.expectedOutput === 'object' ? JSON.stringify(tc.expectedOutput) : String(tc.expectedOutput),
      actual: actualVal !== null && actualVal !== undefined ? (typeof actualVal === 'object' ? JSON.stringify(actualVal) : String(actualVal)) : "No output",
      error,
      runtime
    });
  }

  console.log(JSON.stringify(results));
  process.exit(0);
}

run();
