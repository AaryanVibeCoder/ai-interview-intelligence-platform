"use client";

import React, { useState } from "react";
import { InterviewSetupWizard } from "./InterviewSetupWizard";
import { Sparkles, Play } from "lucide-react";

export function StartPracticeSection() {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <>
      <div 
        onClick={() => setIsOpen(true)}
        className="rounded-2xl border border-border bg-card/70 p-6 backdrop-blur-xl flex flex-col justify-between h-full hover:bg-card/90 hover:border-primary/40 cursor-pointer select-none transition-all duration-200"
      >
        <div>
          <h3 className="font-semibold text-lg text-foreground flex items-center gap-2">
            Interview Practice Center
            <Sparkles className="h-4 w-4 text-primary animate-pulse" />
          </h3>
          <p className="mt-2 text-sm text-muted-foreground leading-relaxed">
            Run a realistic AI voice or code practice interview loop calibrated directly against your resume qualifications.
          </p>
        </div>
        <div className="mt-6 flex justify-end">
          <button
            onClick={() => setIsOpen(true)}
            className="cursor-pointer bg-primary hover:bg-primary/95 text-primary-foreground font-semibold text-sm py-2.5 px-6 rounded-xl transition-all duration-200 flex items-center justify-center gap-2 group"
          >
            <Play className="h-3.5 w-3.5 fill-current group-hover:scale-110 transition-transform" />
            Start Practice Interview
          </button>
        </div>
      </div>

      <InterviewSetupWizard isOpen={isOpen} onClose={() => setIsOpen(false)} />
    </>
  );
}
