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

function toJsLiteral(input) {
  // Convert Python True/False/None to JS true/false/null outside string literals
  let out = '';
  let i = 0;
  let inString = null;
  while (i < input.length) {
    const c = input[i];
    if (inString) {
      out += c;
      if (c === '\\' && i + 1 < input.length) {
        out += input[i + 1];
        i += 2;
        continue;
      }
      if (c === inString) inString = null;
      i++;
      continue;
    }
    if (c === '"' || c === "'") {
      inString = c;
      out += c;
      i++;
      continue;
    }
    if (/[A-Za-z_]/.test(c)) {
      let j = i;
      while (j < input.length && /[A-Za-z0-9_]/.test(input[j])) j++;
      const word = input.slice(i, j);
      if (word === 'True') out += 'true';
      else if (word === 'False') out += 'false';
      else if (word === 'None') out += 'null';
      else out += word;
      i = j;
      continue;
    }
    out += c;
    i++;
  }
  return out;
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

      // 3. Normalize test input: convert Python True/False/None to JS true/false/null
      const normalizedInput = toJsLiteral(tc.input);
      vm.runInContext(normalizedInput, context);

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
