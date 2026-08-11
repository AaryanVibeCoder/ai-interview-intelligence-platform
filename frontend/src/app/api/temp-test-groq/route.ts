import { NextResponse } from 'next/server';
import { execSync } from 'child_process';
import fs from 'fs';

export async function GET() {
  try {
    const gitDiff = execSync('git diff -- backend/app/core/clerk_auth.py backend/app/core/rate_limit.py backend/main.py', {
      cwd: 'c:\\Users\\ACER\\Desktop\\elevateiq'
    }).toString();

    const lines = gitDiff.split('\n');
    const matches: string[] = [];
    const searchTerms = [/while/i, /sleep/i, /for _/i, /retry/i, /thread/i, /backgroundtasks/i];

    lines.forEach((line, index) => {
      const lineNum = index + 1;
      const matched = searchTerms.some(regex => regex.test(line));
      if (matched) {
        matches.push(`${lineNum}:${line}`);
      }
    });

    const output = matches.join('\n');
    fs.writeFileSync('c:\\Users\\ACER\\Desktop\\elevateiq\\backend\\logs\\git_diff.txt', output);
    return NextResponse.json({ success: true, matches: matches });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message || String(err) });
  }
}
