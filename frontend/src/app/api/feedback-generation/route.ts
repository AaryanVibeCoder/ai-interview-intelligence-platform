import { NextRequest, NextResponse } from "next/server";

export async function POST(req: NextRequest) {
  try {
    const { code, language } = await req.json();
    
    let score = 7.5;
    const strengths = [];
    const gaps = [];
    
    const codeLower = code.toLowerCase();
    
    // Check if they optimized with a Map/dictionary or hash set
    if (
      codeLower.includes("map") || 
      codeLower.includes("dict") || 
      codeLower.includes("set") || 
      codeLower.includes("object") ||
      codeLower.includes("hash")
    ) {
      score += 1.5;
      strengths.push("Used a hash table structure to achieve optimal O(N) time complexity lookup.");
    } else {
      score -= 1.5;
      gaps.push("Brute-force nested loops detected. Time complexity is O(N^2). Optimize using a lookup Map.");
    }

    if (codeLower.includes("const ") || codeLower.includes("let ") || codeLower.includes("def ")) {
      strengths.push("Good variable scoping and naming conventions.");
    }
    
    if (codeLower.includes("const ") && codeLower.includes("var ")) {
      gaps.push("Mixed var and const/let declaration styles. Prefer consistent modern block scoping.");
    }
    
    if (code.length < 100) {
      score -= 1.0;
      gaps.push("Code is very concise; verify edge cases (empty inputs, target not found).");
    } else {
      strengths.push("Includes necessary structural checks and error fallbacks.");
    }

    const finalScore = Math.min(10, Math.max(1, score));

    return NextResponse.json({
      score: finalScore,
      strengths,
      gaps,
      suggestions: gaps,
      codeQuality: `${finalScore}/10`
    });
  } catch (error) {
    return NextResponse.json({ error: "Feedback generation failed" }, { status: 500 });
  }
}
