"use client";

import React, { useState } from "react";
import { BookOpen, X, CheckCircle2, ArrowRight, HelpCircle } from "lucide-react";

export function DocumentationCard() {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <>
      <div
        onClick={() => setIsOpen(true)}
        className="rounded-2xl border border-border bg-card/70 p-6 backdrop-blur-xl flex flex-col justify-between h-full hover:bg-card/90 hover:border-primary/40 select-none transition-all duration-200"
      >
        <div>
          <h3 className="font-semibold text-lg text-foreground flex items-center gap-2">
            Documentation & Guide
            <BookOpen className="h-4 w-4 text-primary" />
          </h3>
          <p className="mt-2 text-sm text-muted-foreground leading-relaxed">
            Learn how to use ElevateIQ to its full potential with our step-by-step guide.
          </p>
        </div>
        <div className="mt-6 flex justify-end">
          <span className="text-xs font-semibold text-primary flex items-center gap-1 interactive-target">
            Open Guide
            <ArrowRight className="h-3 w-3" />
          </span>
        </div>
      </div>

      {isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-xl transition-all duration-300">
          <div className="bg-card/80 w-full max-w-2xl rounded-3xl border border-border shadow-2xl relative flex flex-col p-6 max-h-[90vh] overflow-y-auto animate-in zoom-in-95 duration-200">
            {/* Close button */}
            <button
              onClick={() => setIsOpen(false)}
              className="absolute right-4 top-4 p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted/80 transition-colors cursor-pointer"
            >
              <X className="h-5 w-5" />
            </button>

            {/* Header */}
            <div className="space-y-2 mb-6 pr-6">
              <h2 className="text-xl font-bold text-foreground flex items-center gap-2 select-none">
                <HelpCircle className="h-5 w-5 text-primary" />
                ElevateIQ Step-by-Step Guide
              </h2>
              <p className="text-xs text-muted-foreground leading-relaxed select-none">
                Follow this end-to-end workflow to get the maximum benefit from your AI-calibrated preparation.
              </p>
            </div>

            {/* Steps timeline */}
            <div className="space-y-6 flex-1 text-sm select-none">
              {/* Step 1 */}
              <div className="flex gap-4">
                <div className="flex flex-col items-center">
                  <div className="h-6 w-6 rounded-full bg-primary/8 text-primary border border-primary/20 flex items-center justify-center font-bold text-xs">
                    1
                  </div>
                  <div className="w-0.5 flex-1 bg-border/30 min-h-[40px]"></div>
                </div>
                <div className="space-y-1.5 pt-0.5">
                  <h4 className="font-semibold text-foreground">Upload Your Resume</h4>
                  <p className="text-xs text-muted-foreground leading-relaxed">
                    Upload your PDF or DOCX resume in the dashboard upload zone. Our engine will parse your skills, years of experience, and ATS keyword relevance.
                  </p>
                </div>
              </div>

              {/* Step 2 */}
              <div className="flex gap-4">
                <div className="flex flex-col items-center">
                  <div className="h-6 w-6 rounded-full bg-primary/8 text-primary border border-primary/20 flex items-center justify-center font-bold text-xs">
                    2
                  </div>
                  <div className="w-0.5 flex-1 bg-border/30 min-h-[40px]"></div>
                </div>
                <div className="space-y-1.5 pt-0.5">
                  <h4 className="font-semibold text-foreground">Select Company & Role</h4>
                  <p className="text-xs text-muted-foreground leading-relaxed">
                    Configure your target company, role title, and experience level. ElevateIQ matches your profile and provides smart matching suggestions based on parsed skills.
                  </p>
                </div>
              </div>

              {/* Step 3 */}
              <div className="flex gap-4">
                <div className="flex flex-col items-center">
                  <div className="h-6 w-6 rounded-full bg-primary/8 text-primary border border-primary/20 flex items-center justify-center font-bold text-xs">
                    3
                  </div>
                  <div className="w-0.5 flex-1 bg-border/30 min-h-[40px]"></div>
                </div>
                <div className="space-y-1.5 pt-0.5">
                  <h4 className="font-semibold text-foreground">Run Pre-Flight Calibration Checks</h4>
                  <p className="text-xs text-muted-foreground leading-relaxed">
                    Test your environment noise, microphone inputs, speaker playback volume, and API ping latency before entering the session to guarantee a smooth interface loop.
                  </p>
                </div>
              </div>

              {/* Step 4 */}
              <div className="flex gap-4">
                <div className="flex flex-col items-center">
                  <div className="h-6 w-6 rounded-full bg-primary/8 text-primary border border-primary/20 flex items-center justify-center font-bold text-xs">
                    4
                  </div>
                  <div className="w-0.5 flex-1 bg-border/30 min-h-[40px]"></div>
                </div>
                <div className="space-y-1.5 pt-0.5">
                  <h4 className="font-semibold text-foreground">Launch Practice Session (Behavioral or Coding)</h4>
                  <p className="text-xs text-muted-foreground leading-relaxed">
                    Participate in conversational voice behavioral loops with smart automatic submit-on-silence, or execute Python/JS code directly in our sandboxed compiler editor.
                  </p>
                </div>
              </div>

              {/* Step 5 */}
              <div className="flex gap-4">
                <div className="flex flex-col items-center">
                  <div className="h-6 w-6 rounded-full bg-primary/8 text-primary border border-primary/20 flex items-center justify-center font-bold text-xs">
                    5
                  </div>
                  <div className="w-0.5 flex-1 bg-border/30 min-h-[40px]"></div>
                </div>
                <div className="space-y-1.5 pt-0.5">
                  <h4 className="font-semibold text-foreground">Review Rubric Metrics & Insights</h4>
                  <p className="text-xs text-muted-foreground leading-relaxed">
                    Analyze the granular response scoring breakdown. Read detailed code quality suggestions, strengths, improvements, and suggested external documentation links.
                  </p>
                </div>
              </div>

              {/* Step 6 */}
              <div className="flex gap-4">
                <div className="flex flex-col items-center">
                  <div className="h-6 w-6 rounded-full bg-primary/8 text-primary border border-primary/20 flex items-center justify-center font-bold text-xs">
                    6
                  </div>
                </div>
                <div className="space-y-1.5 pt-0.5">
                  <h4 className="font-semibold text-foreground">Iterate & Align</h4>
                  <p className="text-xs text-muted-foreground leading-relaxed">
                    Address your strengths and weak areas. Update your code templates, refine your narrative structure, and re-run sessions to track your progression.
                  </p>
                </div>
              </div>
            </div>

            {/* Footer button */}
            <div className="mt-8 pt-4 border-t border-border flex justify-end">
              <button
                onClick={() => setIsOpen(false)}
                className="cursor-pointer bg-primary text-primary-foreground hover:bg-primary/95 text-xs font-bold py-2.5 px-6 rounded-lg transition-all"
              >
                Close Guide
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
