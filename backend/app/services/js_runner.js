const fs = require('fs');
const vm = require('vm');
const { performance } = require('perf_hooks');

function getParamNames(func) {
  const str = func.toString();
  const openParen = str.indexOf('(');
  const closeParen = str.indexOf(')');
  if (openParen === -1 || closeParen === -1) return [];
  const paramsStr = str.slice(openParen + 1, closeParen);
  return paramsStr.split(',').map(p => p.trim()).filter(Boolean);
}

function normalizeCompare(actual, expected) {
  try {
    const actStr = JSON.stringify(actual).replace(/\s+/g, '');
    // expected might be raw output or stringified JSON
    let expStr = String(expected).trim().replace(/\s+/g, '');
    
    // Normalize boolean outputs
    if (actStr === 'true' && expStr.toLowerCase() === 'true') return true;
    if (actStr === 'false' && expStr.toLowerCase() === 'false') return true;
    
    return actStr === expStr;
  } catch (e) {
    return String(actual).trim() === String(expected).trim();
  }
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

  const { code, testCases } = payload;
  const results = [];

  for (const tc of testCases) {
    const sandbox = {};
    const context = vm.createContext(sandbox);
    
    let error = null;
    let actual = null;
    let passed = false;
    let runtime = 0;

    const start = performance.now();
    try {
      // 1. Run candidate's code to load their function definition
      vm.runInContext(code, context);

      // 2. Find the target function (any function declared in context)
      let funcName = null;
      for (const key of Object.keys(sandbox)) {
        if (typeof sandbox[key] === 'function') {
          funcName = key;
          break;
        }
      }

      if (!funcName) {
        throw new Error("No function solution found in submitted code.");
      }

      // 3. Run testcase input to define the arguments
      vm.runInContext(tc.input, context);

      // 4. Map argument names to their values and run
      const targetFunc = sandbox[funcName];
      const paramNames = getParamNames(targetFunc);
      const args = paramNames.map(name => sandbox[name]);

      const rawActual = targetFunc(...args);
      runtime = Math.round(performance.now() - start);

      actual = JSON.stringify(rawActual);
      passed = normalizeCompare(rawActual, tc.expectedOutput);
    } catch (err) {
      runtime = Math.round(performance.now() - start);
      error = err.message || String(err);
      passed = false;
    }

    results.push({
      testCaseId: tc.id,
      passed,
      expected: tc.expectedOutput,
      actual: actual !== null ? actual : "No output",
      error: error,
      runtime
    });
  }

  console.log(JSON.stringify(results));
}

run();
