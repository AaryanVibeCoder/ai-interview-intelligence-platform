"use client";

import { useRouter } from "next/navigation";
import { useInterviewStore } from "@/store/interview-store";
import { 
  Award, 
  Cpu, 
  Volume2, 
  ShieldCheck, 
  RefreshCw, 
  LayoutDashboard,
  Brain,
  Code,
  ArrowRight
} from "lucide-react";

import { useState, useEffect } from "react";

export default function InterviewFeedbackPage() {
  const router = useRouter();
  
  const { 
    answers, 
    codingSubmissions, 
    atsScore, 
    targetCompany, 
    resetSession,
    interviewType,
    activeSessionId
  } = useInterviewStore();

  const [corrections, setCorrections] = useState<any[]>([]);

  useEffect(() => {
    let stored = null;
    if (activeSessionId) {
      stored = localStorage.getItem(`elevateiq-coding-corrections-${activeSessionId}`);
    }
    if (!stored) {
      // Fallback: search localStorage keys for a corrections item
      const keys = Object.keys(localStorage);
      const corrKeys = keys.filter(k => k.startsWith("elevateiq-coding-corrections-"));
      if (corrKeys.length > 0) {
        stored = localStorage.getItem(corrKeys[corrKeys.length - 1]);
      }
    }
    if (stored) {
      try {
        setCorrections(JSON.parse(stored));
      } catch (e) {
        console.error("Failed to parse corrections:", e);
      }
    }
  }, [activeSessionId]);

  const handleRestart = () => {
    resetSession();
    router.push("/interview/preflight");
  };

  const handleReturnToDashboard = () => {
    resetSession();
    router.push("/dashboard");
  };

  // Calculate final score summaries
  const behavioralAverage = answers.length > 0
    ? parseFloat((answers.reduce((acc, curr) => acc + curr.score, 0) / answers.length).toFixed(1))
    : 0;

  // For coding sessions, aggregate all submissions to get the total passed test rate
  const totalCodingSubmissions = codingSubmissions.length;
  const lastCodingSubmission = totalCodingSubmissions > 0 
    ? codingSubmissions[codingSubmissions.length - 1] 
    : null;

  // Calculate combined passed/total across all questions in the B2B coding session
  const totalPassed = codingSubmissions.reduce(
    (acc, curr) => acc + (curr.test_results?.filter((r: { passed: boolean }) => r.passed).length || 0),
    0
  );
  const totalTests = codingSubmissions.reduce(
    (acc, curr) => acc + (curr.test_results?.length || 0),
    0
  );
  const passRate = totalTests > 0 ? Math.round((totalPassed / totalTests) * 100) : 0;

  // Final aggregate index out of 100
  // Coding round: 70% Algorithmic Accuracy + 30% Resume ATS Score
  // Behavioral round: 40% Behavioral Avg * 10 + 40% Algorithmic + 20% ATS Score
  const finalAggregate = interviewType === "coding"
    ? Math.round((passRate * 0.7) + ((atsScore || 75) * 0.3))
    : Math.round(
        (behavioralAverage * 10 * 0.4) + 
        (passRate * 0.4) + 
        ((atsScore || 75) * 0.2)
      );

  const [selectedSubIdx, setSelectedSubIdx] = useState(0);

  return (
    <div className="max-w-5xl mx-auto py-12 px-6 space-y-8 animate-in fade-in duration-300">
      
      {/* Title */}
      <div className="text-center space-y-3">
        <div className="inline-flex p-3 bg-emerald-500/10 rounded-2xl text-emerald-400 mb-2 border border-emerald-500/20">
          <ShieldCheck className="w-10 h-10" />
        </div>
        <h1 className="text-4xl font-extrabold tracking-tight bg-gradient-to-r from-foreground via-foreground to-primary bg-clip-text text-transparent">
          Session Analytics Dashboard
        </h1>
        <p className="text-muted-foreground text-sm max-w-xl mx-auto font-medium">
          Congratulations on completing your ElevateIQ evaluation session. Review your algorithmic metrics.
        </p>
      </div>

      {/* Score Grid Cards */}
      <div className={`grid grid-cols-1 ${interviewType === "coding" ? "md:grid-cols-3" : "md:grid-cols-4"} gap-6`}>
        
        {/* Core Index Card */}
        <div className="bg-gradient-to-br from-primary/20 to-accent/20 border border-primary/20 p-6 rounded-2xl text-center space-y-2 flex flex-col justify-center items-center shadow-sm">
          <span className="text-[10px] uppercase font-bold text-muted-foreground tracking-wider block">ElevateIQ Index</span>
          <span className="text-5xl font-black text-foreground">{finalAggregate}</span>
          <span className="text-[10px] text-foreground font-bold px-2 py-0.5 bg-foreground/10 border border-foreground/10 rounded-full block">
            {finalAggregate >= 80 ? "Highly Recommended" : finalAggregate >= 60 ? "Strong Fit" : "Under Evaluation"}
          </span>
        </div>

        {/* Behavioral Metrics - Only display if not coding round */}
        {interviewType !== "coding" && (
          <div className="bg-card border border-border p-6 rounded-2xl space-y-3 shadow-sm">
            <span className="text-[10px] uppercase font-bold text-muted-foreground tracking-wider flex items-center gap-1.5">
              <Volume2 className="w-4 h-4 text-primary" /> Behavioral Score
            </span>
            <h3 className="text-3xl font-black text-foreground">{behavioralAverage} <span className="text-sm font-semibold text-muted-foreground">/ 10</span></h3>
            <p className="text-[10px] text-muted-foreground leading-relaxed">
              Evaluated across {answers.length} voice/text conversational rounds using strict STAR criteria metrics.
            </p>
          </div>
        )}

        {/* Coding Challenge Metrics */}
        <div className="bg-card border border-border p-6 rounded-2xl space-y-3 shadow-sm">
          <span className="text-[10px] uppercase font-bold text-muted-foreground tracking-wider flex items-center gap-1.5">
            <Cpu className="w-4 h-4 text-accent" /> Algorithmic Accuracy
          </span>
          <h3 className="text-3xl font-black text-foreground">{passRate}% <span className="text-xs font-semibold text-muted-foreground">({totalPassed}/{totalTests} tests)</span></h3>
          <p className="text-[10px] text-muted-foreground leading-relaxed">
            Successful process execution in {lastCodingSubmission?.language || "selected"} environment.
          </p>
        </div>

        {/* Resume ATS Alignment */}
        <div className="bg-card border border-border p-6 rounded-2xl space-y-3 shadow-sm">
          <span className="text-[10px] uppercase font-bold text-muted-foreground tracking-wider flex items-center gap-1.5">
            <Award className="w-4 h-4 text-amber-500" /> Resume ATS Score
          </span>
          <h3 className="text-3xl font-black text-foreground">{atsScore || 78} <span className="text-sm font-semibold text-muted-foreground">/ 100</span></h3>
          <p className="text-[10px] text-muted-foreground leading-relaxed">
            Algorithmic alignment with target seniority for {targetCompany || "partner clients"}.
          </p>
        </div>

      </div>

      {/* Detailed Report Tabs Section */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        
        {/* Left Split Pane: Behavioral evaluation OR Corrections and advancements */}
        {interviewType === "coding" ? (
          <div className="lg:col-span-2 space-y-6">
            <div className="bg-card border border-border rounded-2xl p-6 shadow-sm space-y-6">
              <h2 className="text-md font-bold text-foreground flex items-center gap-2 border-b border-border/40 pb-3">
                <Cpu className="w-5 h-5 text-primary" />
                Corrections and advancements
              </h2>

              {corrections.length === 0 ? (
                <div className="p-8 border border-dashed border-border rounded-xl flex items-center justify-center text-center">
                  <p className="text-xs text-muted-foreground">
                    No corrections feedback was generated. Complete all 3 coding questions to view the detailed code analysis.
                  </p>
                </div>
              ) : (
                <div className="space-y-6">
                  {corrections.map((corr, idx) => (
                    <div key={corr.challengeId || idx} className="p-5 bg-background border border-border rounded-xl space-y-4">
                      <h3 className="text-xs font-black text-foreground border-b border-border/30 pb-2 uppercase tracking-wide">
                        Challenge {idx + 1}: {corr.challengeTitle}
                      </h3>

                      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 text-[11px]">
                        {/* Corrections */}
                        <div className="p-4 bg-destructive/5 border border-destructive/10 rounded-xl space-y-2">
                          <h4 className="font-extrabold text-destructive uppercase tracking-wider text-[9px]">
                            Corrections and Optimizations
                          </h4>
                          <ul className="list-disc list-inside space-y-1.5 text-muted-foreground leading-relaxed">
                            {corr.corrections?.map((pt: string, i: number) => (
                              <li key={i}>{pt}</li>
                            ))}
                          </ul>
                        </div>

                        {/* Advancements */}
                        <div className="p-4 bg-success/5 border border-success/10 rounded-xl space-y-2">
                          <h4 className="font-extrabold text-success uppercase tracking-wider text-[9px]">
                            Code Quality Advancements
                          </h4>
                          <ul className="list-disc list-inside space-y-1.5 text-muted-foreground leading-relaxed">
                            {corr.advancements?.map((pt: string, i: number) => (
                              <li key={i}>{pt}</li>
                            ))}
                          </ul>
                        </div>
                      </div>

                      {/* Resources */}
                      {corr.resources && corr.resources.length > 0 && (
                        <div className="pt-2">
                          <span className="block text-[9px] font-extrabold text-muted-foreground uppercase tracking-wider mb-2">
                            Suggested Improvement Resources
                          </span>
                          <div className="flex flex-wrap gap-2">
                            {corr.resources.map((res: any, i: number) => (
                              <a
                                key={i}
                                href={res.link}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-muted/40 hover:bg-primary hover:text-primary-foreground text-foreground border border-border rounded-lg text-[10px] font-bold transition-all"
                              >
                                {res.name}
                                <ArrowRight className="w-3 h-3" />
                              </a>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        ) : (
          <div className="lg:col-span-2 space-y-6">
            <div className="bg-card border border-border rounded-2xl p-6 shadow-sm space-y-6">
              <h2 className="text-md font-bold text-foreground flex items-center gap-2 border-b border-border/40 pb-3">
                <Brain className="w-5 h-5 text-primary" />
                Behavioral Evaluation Timeline
              </h2>

              {answers.length === 0 ? (
                <p className="text-xs text-muted-foreground">No behavioral answers recorded.</p>
              ) : (
                <div className="space-y-6">
                  {answers.map((ans, idx) => (
                    <div key={idx} className="space-y-3 border-l-2 border-primary/20 pl-4 relative">
                      <span className="absolute -left-1.5 top-0 w-3 h-3 rounded-full bg-primary border-2 border-background"></span>
                      <div className="flex justify-between items-start">
                        <h4 className="text-xs font-bold text-foreground">Round {idx + 1}: Q&A Evaluation</h4>
                        <span className="text-[10px] font-extrabold uppercase bg-primary/10 border border-primary/20 text-primary py-0.5 px-2 rounded-full">
                          Score: {ans.score}/10
                        </span>
                      </div>

                      <div className="text-[11px] text-muted-foreground space-y-1.5">
                        <p><strong>Q:</strong> {ans.question}</p>
                        <p><strong>A:</strong> <span className="italic">&ldquo;{ans.answer}&rdquo;</span></p>
                      </div>

                      {ans.feedback && (
                        <div className="p-3 bg-muted/20 border border-border rounded-lg text-[10px] grid grid-cols-1 md:grid-cols-2 gap-4">
                          <div>
                            <span className="block font-bold text-success mb-1">Strengths</span>
                            <ul className="list-disc list-inside space-y-0.5 text-muted-foreground">
                              {ans.feedback.strengths?.slice(0, 2).map((s: string, i: number) => <li key={i}>{s}</li>) || <li>Good clarity and structured STAR context</li>}
                            </ul>
                          </div>
                          <div>
                            <span className="block font-bold text-amber-500 mb-1">Feedback Action</span>
                            <p className="text-muted-foreground leading-normal">{ans.feedback.growth_path || "Focus on metrics"}</p>
                          </div>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {/* Right Split Pane: Algorithmic Code details & submissions review */}
        <div className="space-y-6">
          
          {/* Coding Challenge Block */}
          <div className="bg-card border border-border rounded-2xl p-6 shadow-sm space-y-6">
            <h2 className="text-md font-bold text-foreground flex items-center gap-2 border-b border-border/40 pb-3">
              <Code className="w-5 h-5 text-accent" />
              Algorithmic Submissions
            </h2>

            {codingSubmissions.length === 0 ? (
              <p className="text-xs text-muted-foreground">No compiler submissions logged in database.</p>
            ) : (
              <div className="space-y-4">
                {/* Tabs to select which question to view */}
                <div className="flex gap-1.5 border-b border-border pb-2 overflow-x-auto">
                  {codingSubmissions.map((sub, idx) => (
                    <button
                      key={idx}
                      onClick={() => setSelectedSubIdx(idx)}
                      className={`px-3 py-1.5 rounded-lg text-[10px] font-bold transition-all border shrink-0 ${
                        selectedSubIdx === idx
                          ? "bg-primary text-primary-foreground border-primary"
                          : "bg-muted/10 hover:bg-muted/20 text-muted-foreground border-border"
                      }`}
                    >
                      Question {idx + 1}
                    </button>
                  ))}
                </div>

                {codingSubmissions[selectedSubIdx] && (
                  <div className="space-y-4 text-xs">
                    <div className="flex justify-between text-muted-foreground">
                      <span>Language selected:</span>
                      <span className="font-bold text-foreground uppercase">{codingSubmissions[selectedSubIdx].language}</span>
                    </div>
                    <div className="flex justify-between text-muted-foreground">
                      <span>Execution Runtime:</span>
                      <span className="font-bold text-foreground">{codingSubmissions[selectedSubIdx].execution_time} ms</span>
                    </div>
                    <div className="flex justify-between text-muted-foreground">
                      <span>Memory payload:</span>
                      <span className="font-bold text-foreground">{codingSubmissions[selectedSubIdx].memory_used} MB</span>
                    </div>

                    <div className="space-y-2 pt-2">
                      <span className="font-bold text-foreground block">Submitted Code snippet:</span>
                      <pre className="p-3 bg-background border border-border rounded-lg font-mono text-[10px] leading-normal text-amber-300 overflow-x-auto whitespace-pre">
                        {codingSubmissions[selectedSubIdx].code}
                      </pre>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Action buttons */}
          <div className="space-y-3">
            <button
              onClick={handleRestart}
              className="cursor-pointer font-bold bg-primary text-primary-foreground hover:bg-primary/90 w-full py-3 rounded-xl flex items-center justify-center gap-2 shadow-sm transition-all"
            >
              <RefreshCw className="w-4 h-4" />
              Start New Interview
            </button>

            <button
              onClick={handleReturnToDashboard}
              className="cursor-pointer font-bold bg-muted hover:bg-muted-foreground/10 text-foreground w-full py-3 rounded-xl flex items-center justify-center gap-2 border border-border transition-all"
            >
              <LayoutDashboard className="w-4 h-4" />
              Return to Dashboard
            </button>
          </div>

        </div>

      </div>

    </div>
  );
}
