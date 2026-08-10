const fs = require('fs');
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

function run() {
  if (process.argv.length < 3) {
    console.error("Missing input JSON file path argument.");
    process.exit(1);
  }

  const inputFilePath = process.argv[2];
  let payload;
  try {
    const fileContent = fs.readFileSync(inputFilePath, 'utf8');
    payload = JSON.parse(fileContent);
  } catch (err) {
    console.error("Failed to read/parse input JSON file:", err.message);
    process.exit(1);
  }

  const { code, testCases, returnType, comparisonType, limits } = payload;
  const timeLimitMs = (limits && limits.timeMs) || 2000;
  const outputLimit = 10000; // 10KB
  
  const results = [];

  for (const tc of testCases) {
    let outputBuffer = "";
    const sandbox = {};
    
    // Setup Console inside the sandbox to limit logging
    sandbox.console = {
      log: (...args) => {
        const str = args.map(a => typeof a === 'object' ? JSON.stringify(a) : String(a)).join(' ') + '\n';
        if (outputBuffer.length + str.length > outputLimit) {
          outputBuffer += str.substring(0, outputLimit - outputBuffer.length);
          throw new Error("Output Limit Exceeded");
        }
        outputBuffer += str;
      },
      error: (...args) => {
        const str = args.map(a => typeof a === 'object' ? JSON.stringify(a) : String(a)).join(' ') + '\n';
        if (outputBuffer.length + str.length > outputLimit) {
          outputBuffer += str.substring(0, outputLimit - outputBuffer.length);
          throw new Error("Output Limit Exceeded");
        }
        outputBuffer += str;
      },
      warn: (...args) => {
        const str = args.map(a => typeof a === 'object' ? JSON.stringify(a) : String(a)).join(' ') + '\n';
        if (outputBuffer.length + str.length > outputLimit) {
          outputBuffer += str.substring(0, outputLimit - outputBuffer.length);
          throw new Error("Output Limit Exceeded");
        }
        outputBuffer += str;
      },
      info: (...args) => {
        const str = args.map(a => typeof a === 'object' ? JSON.stringify(a) : String(a)).join(' ') + '\n';
        if (outputBuffer.length + str.length > outputLimit) {
          outputBuffer += str.substring(0, outputLimit - outputBuffer.length);
          throw new Error("Output Limit Exceeded");
        }
        outputBuffer += str;
      }
    };

    const context = vm.createContext(sandbox);
    
    let error = null;
    let actual = null;
    let passed = false;
    let runtime = 0;
    let status = "PASSED";

    const start = performance.now();
    try {
      // 1. Load candidate's code inside the fresh context
      vm.runInContext(code, context, { timeout: timeLimitMs });
      
      if (typeof sandbox.solve !== 'function') {
        status = "INVALID_SUBMISSION";
        throw new Error("Submission must define function solve(...)");
      }

      // 2. Deep copy arguments to ensure absolute isolation
      const cleanArgs = JSON.parse(JSON.stringify(tc.args || []));
      sandbox.__args = cleanArgs;

      // 3. Invoke solve
      const rawActual = vm.runInContext("solve(...__args)", context, { timeout: timeLimitMs });
      runtime = Math.round(performance.now() - start);

      // Validate return type
      validateReturnType(rawActual, returnType);

      // Check correctness
      passed = compareOutputs(rawActual, tc.expectedOutput, returnType, comparisonType || "exact");
      actual = typeof rawActual === 'object' ? JSON.stringify(rawActual) : String(rawActual);
      
      if (!passed) {
        status = "WRONG_ANSWER";
      }
    } catch (err) {
      runtime = Math.round(performance.now() - start);
      error = err.message || String(err);
      passed = false;
      
      if (err.code === 'ERR_SCRIPT_EXECUTION_TIMEOUT' || error.includes('script execution timed out')) {
        status = "TIME_LIMIT_EXCEEDED";
        error = `Execution timed out after {timeLimitMs}ms.`;
      } else if (error.includes("Output Limit Exceeded")) {
        status = "OUTPUT_LIMIT_EXCEEDED";
      } else if (error.includes("Expected return type")) {
        status = "INVALID_RETURN_TYPE";
      } else if (status === "PASSED") {
        if (err.name === 'SyntaxError' || err instanceof SyntaxError) {
          status = "COMPILE_ERROR";
        } else {
          status = "RUNTIME_ERROR";
        }
      }
    }

    results.push({
      testCaseId: tc.id,
      status,
      passed,
      expected: typeof tc.expectedOutput === 'object' ? JSON.stringify(tc.expectedOutput) : String(tc.expectedOutput),
      actual: actual !== null ? actual : "No output",
      error: error,
      runtime
    });
  }

  console.log(JSON.stringify(results));
}

run();
