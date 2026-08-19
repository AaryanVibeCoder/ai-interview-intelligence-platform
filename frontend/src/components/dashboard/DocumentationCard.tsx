"use client";

import React, { useState } from "react";
import { BookOpen, X, HelpCircle, ArrowRight } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";

interface GuideStep {
  title: string;
  desc: string;
}

const guideSteps: GuideStep[] = [
  {
    title: "Upload Your Resume",
    desc: "Upload your PDF or DOCX resume in the dashboard upload zone. Our engine will parse your skills, years of experience, and ATS keyword relevance."
  },
  {
    title: "Select Company & Role",
    desc: "Configure your target company, role title, and experience level. ElevateIQ matches your profile and provides smart matching suggestions based on parsed skills."
  },
  {
    title: "Run Pre-Flight Calibration Checks",
    desc: "Test your environment noise, microphone inputs, speaker playback volume, and API ping latency before entering the session to guarantee a smooth interface loop."
  },
  {
    title: "Launch Practice Session (Behavioral or Coding)",
    desc: "Participate in conversational voice behavioral loops with smart automatic submit-on-silence, or execute Python/JS code directly in our sandboxed compiler editor."
  },
  {
    title: "Review Rubric Metrics & Insights",
    desc: "Analyze the granular response scoring breakdown. Read detailed code quality suggestions, strengths, improvements, and suggested external documentation links."
  },
  {
    title: "Iterate & Align",
    desc: "Address your strengths and weak areas. Update your code templates, refine your narrative structure, and re-run sessions to track your progression."
  }
];

// Mini IQ-Bot Illustration for Card Preface
const MiniBotIllustration = () => {
  return (
    <div className="relative w-20 h-20 flex items-center justify-center shrink-0 select-none ml-2">
      <motion.svg
        width="64"
        height="64"
        viewBox="0 0 64 64"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        animate={{ y: [0, -5, 0] }}
        transition={{ repeat: Infinity, duration: 2.8, ease: "easeInOut" }}
      >
        <defs>
          <linearGradient id="miniBotBody" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#475569" />
            <stop offset="100%" stopColor="#1e293b" />
          </linearGradient>
        </defs>

        {/* Antennas */}
        <line x1="32" y1="12" x2="32" y2="7" stroke="#38bdf8" strokeWidth="1.5" />
        <circle cx="32" cy="6" r="1.5" fill="#38bdf8" />

        {/* Head */}
        <rect x="20" y="12" width="24" height="18" rx="5" fill="url(#miniBotBody)" stroke="#64748b" strokeWidth="1" />
        {/* Face Screen */}
        <rect x="23" y="15" width="18" height="12" rx="3" fill="#0f172a" />
        {/* Glowing Eyes */}
        <circle cx="28" cy="21" r="1.5" fill="#38bdf8" />
        <circle cx="36" cy="21" r="1.5" fill="#38bdf8" />

        {/* Neck */}
        <rect x="29" y="30" width="6" height="3" fill="#334155" />

        {/* Torso */}
        <rect x="18" y="33" width="28" height="22" rx="6" fill="url(#miniBotBody)" stroke="#64748b" strokeWidth="1" />
        {/* Heart Light */}
        <motion.circle
          cx="32"
          cy="44"
          r="3"
          fill="#38bdf8"
          animate={{ opacity: [0.4, 1, 0.4] }}
          transition={{ repeat: Infinity, duration: 1.5 }}
        />

        {/* Waving Arm */}
        <motion.g
          animate={{ rotate: [0, 45, 10, 45, 0] }}
          transition={{ repeat: Infinity, duration: 2, ease: "easeInOut", repeatDelay: 1 }}
          style={{ transformOrigin: "16px 36px" }}
        >
          <rect x="10" y="35" width="6" height="14" rx="2" fill="#334155" />
        </motion.g>

        {/* Right Arm */}
        <rect x="48" y="35" width="6" height="14" rx="2" fill="#334155" />

        {/* Hover flame */}
        <motion.path
          d="M 28 56 Q 32 64 36 56 Z"
          fill="rgba(56, 189, 248, 0.75)"
          animate={{ scaleY: [1, 1.3, 1] }}
          transition={{ repeat: Infinity, duration: 0.12 }}
          style={{ transformOrigin: "32px 56px" }}
        />
      </motion.svg>
    </div>
  );
};

// Interactive vector-animated Robot Assistant with realistic gradients and glows
function RobotAssistant({ activeStep }: { activeStep: number }) {
  // Mechanical arm angle mappings corresponding to each of the 6 steps
  const angles = [-35, -15, 5, 25, 45, 65];
  const currentAngle = angles[activeStep] ?? 0;

  return (
    <div className="relative w-48 h-64 flex items-center justify-center shrink-0 select-none">
      <motion.svg
        width="180"
        height="240"
        viewBox="0 0 180 240"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        animate={{ y: [0, -8, 0] }}
        transition={{ repeat: Infinity, duration: 4, ease: "easeInOut" }}
        className="drop-shadow-[0_8px_24px_rgba(59,130,246,0.22)]"
      >
        <defs>
          <linearGradient id="botMetallic" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#475569" />
            <stop offset="50%" stopColor="#334155" />
            <stop offset="100%" stopColor="#1e293b" />
          </linearGradient>
          <linearGradient id="screenGlass" x1="0%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%" stopColor="#0f172a" />
            <stop offset="100%" stopColor="#020617" />
          </linearGradient>
          <linearGradient id="cyanGlow" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#38bdf8" />
            <stop offset="100%" stopColor="#2563eb" />
          </linearGradient>
          <filter id="neonLight">
            <feGaussianBlur stdDeviation="2.5" result="coloredBlur"/>
            <feMerge>
              <feMergeNode in="coloredBlur"/>
              <feMergeNode in="SourceGraphic"/>
            </feMerge>
          </filter>
        </defs>

        {/* Antennas */}
        <line x1="90" y1="40" x2="90" y2="20" stroke="#475569" strokeWidth="3" />
        <line x1="90" y1="20" x2="90" y2="15" stroke="#38bdf8" strokeWidth="2.5" />
        <motion.circle
          cx="90"
          cy="13"
          r="4.5"
          fill="url(#cyanGlow)"
          filter="url(#neonLight)"
          animate={{ scale: [1, 1.25, 1], opacity: [0.7, 1, 0.7] }}
          transition={{ repeat: Infinity, duration: 2, ease: "easeInOut" }}
        />

        {/* Head */}
        <motion.rect
          x="58"
          y="38"
          width="64"
          height="48"
          rx="14"
          fill="url(#botMetallic)"
          stroke="#64748b"
          strokeWidth="2"
          animate={{ rotate: [-2, 2, -2] }}
          transition={{ repeat: Infinity, duration: 5, ease: "easeInOut" }}
        />
        {/* Face Screen */}
        <rect x="66" y="46" width="48" height="32" rx="8" fill="url(#screenGlass)" stroke="#334155" strokeWidth="1" />
        {/* Eyes (Blinking Screen LEDs) */}
        <motion.circle
          cx="78"
          cy="60"
          r="3.5"
          fill="#38bdf8"
          filter="url(#neonLight)"
          animate={{ scaleY: [1, 0.1, 1] }}
          transition={{ repeat: Infinity, duration: 4, repeatDelay: 1.2 }}
          style={{ transformOrigin: "78px 60px" }}
        />
        <motion.circle
          cx="102"
          cy="60"
          r="3.5"
          fill="#38bdf8"
          filter="url(#neonLight)"
          animate={{ scaleY: [1, 0.1, 1] }}
          transition={{ repeat: Infinity, duration: 4, repeatDelay: 1.2 }}
          style={{ transformOrigin: "102px 60px" }}
        />
        {/* Mouth (Friendly LED Curve) */}
        <path d="M 82 69 Q 90 73 98 69" stroke="#38bdf8" strokeWidth="2" strokeLinecap="round" filter="url(#neonLight)" />

        {/* Ear speakers / Bolts */}
        <rect x="52" y="52" width="6" height="20" rx="2" fill="#475569" />
        <rect x="122" y="52" width="6" height="20" rx="2" fill="#475569" />

        {/* Neck */}
        <rect x="80" y="85" width="20" height="12" rx="3" fill="#334155" stroke="#475569" strokeWidth="1" />

        {/* Torso / Body */}
        <rect x="48" y="96" width="84" height="78" rx="18" fill="url(#botMetallic)" stroke="#64748b" strokeWidth="2" />
        
        {/* Core Heart / LED Panel Indicator */}
        <motion.circle
          cx="90"
          cy="135"
          r="11"
          fill="rgba(56,189,248,0.12)"
          stroke="url(#cyanGlow)"
          strokeWidth="2"
          filter="url(#neonLight)"
          animate={{ r: [9, 13, 9], opacity: [0.6, 1, 0.6] }}
          transition={{ repeat: Infinity, duration: 2.2, ease: "easeInOut" }}
        />
        
        {/* Detailed Chest Plate controls */}
        <rect x="62" y="110" width="14" height="5" rx="2" fill="#475569" />
        <rect x="104" y="110" width="14" height="5" rx="2" fill="#475569" />
        <circle cx="69" cy="120" r="2.5" fill="#ef4444" />
        <circle cx="111" cy="120" r="2.5" fill="#10b981" />

        {/* Left Arm (Dynamically Waving) */}
        <motion.g
          animate={{ 
            rotate: [0, 35, 10, 35, 10, 35, 0] 
          }}
          transition={{ 
            repeat: Infinity,
            duration: 2.6,
            ease: "easeInOut",
            repeatDelay: 1
          }}
          style={{ transformOrigin: "40px 108px" }}
        >
          {/* Shoulder pivot joint */}
          <circle cx="40" cy="108" r="5" fill="#64748b" />
          {/* Upper arm */}
          <rect x="28" y="108" width="12" height="34" rx="6" fill="#334155" stroke="#475569" strokeWidth="1" />
          {/* Waving hand */}
          <g transform="translate(28, 140)">
            <circle cx="6" cy="6" r="6" fill="url(#cyanGlow)" />
            {/* Waving fingers outline */}
            <path d="M 3 6 Q -4 10 3 15" stroke="#38bdf8" strokeWidth="2" strokeLinecap="round" />
          </g>
        </motion.g>

        {/* Right Explaining Arm (Dynamic pointing towards cards) */}
        <motion.g
          animate={{ rotate: currentAngle }}
          transition={{ type: "spring", stiffness: 180, damping: 14 }}
          style={{ transformOrigin: "140px 108px" }}
        >
          {/* Shoulder pivot joint */}
          <circle cx="140" cy="108" r="5" fill="#64748b" />
          {/* Explaining arm */}
          <rect x="140" y="108" width="12" height="38" rx="6" fill="#334155" stroke="#475569" strokeWidth="1" />
          {/* Explaining hand facing and pointing to the bullet points */}
          <g transform="translate(140, 144)">
            <circle cx="6" cy="6" r="7" fill="url(#cyanGlow)" />
            {/* Index finger pointing directly right to bullet points */}
            <line x1="6" y1="6" x2="26" y2="6" stroke="#38bdf8" strokeWidth="3.5" strokeLinecap="round" filter="url(#neonLight)" />
            {/* Hand details */}
            <path d="M 6 6 Q 12 14 6 17" stroke="#38bdf8" strokeWidth="2.5" />
          </g>
        </motion.g>

        {/* Hover Thruster Base */}
        <path d="M 74 174 L 106 174 L 98 188 L 82 188 Z" fill="#334155" stroke="#475569" strokeWidth="1" />
        {/* Animated Thruster Flame */}
        <motion.path
          d="M 78 189 Q 90 210 102 189 Z"
          fill="rgba(56,189,248,0.75)"
          filter="url(#neonLight)"
          animate={{ scaleY: [1, 1.45, 1], scaleX: [1, 0.9, 1] }}
          transition={{ repeat: Infinity, duration: 0.12, ease: "easeInOut" }}
          style={{ transformOrigin: "90px 189px" }}
        />
      </motion.svg>
    </div>
  );
}

export function DocumentationCard() {
  const [isOpen, setIsOpen] = useState(false);
  const [activeStep, setActiveStep] = useState(0);

  return (
    <>
      <motion.div
        onClick={() => setIsOpen(true)}
        whileHover={{ y: -4, scale: 1.01 }}
        transition={{ duration: 0.2, ease: "easeOut" }}
        className="group rounded-2xl border border-border bg-card/70 p-6 backdrop-blur-xl flex flex-col justify-between h-full hover:bg-card/90 hover:border-primary/40 hover:shadow-[0_0_24px_rgba(59,130,246,0.12)] transition-colors duration-200 cursor-pointer select-none"
      >
        <div className="flex gap-4 items-start">
          {/* Left Side: Icon, Title & Description */}
          <div className="flex-1 min-w-0">
            <div className="relative mb-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br from-accent/20 to-accent/5 border border-accent/30 text-accent shadow-[0_0_15px_rgba(59,130,246,0.1)] overflow-hidden">
              <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,rgba(59,130,246,0.2)_0%,transparent_70%)]" />
              <BookOpen className="h-5 w-5 relative z-10 transition-transform duration-300 group-hover:scale-110 group-hover:-translate-y-0.5" />
            </div>

            <h3 className="font-semibold text-lg text-foreground flex items-center gap-2">
              Documentation & Guide
            </h3>
            <p className="mt-2 text-sm text-muted-foreground leading-relaxed">
              Learn how to use ElevateIQ to its full potential with our step-by-step guide.
            </p>
          </div>

          {/* Right Side: Mini Bot Illustration */}
          <MiniBotIllustration />
        </div>

        <div className="mt-6 flex justify-end">
          <span className="text-xs font-semibold text-primary flex items-center gap-1 group-hover:translate-x-1 transition-transform duration-200">
            Open Guide
            <ArrowRight className="h-3 w-3" />
          </span>
        </div>
      </motion.div>

      <AnimatePresence>
        {isOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            {/* Sibling backdrop blur to prevent child inheritance */}
            <div
              className="absolute inset-0 bg-black/60 backdrop-blur-md cursor-pointer animate-fade-in"
              onClick={() => setIsOpen(false)}
            />

            <motion.div
              initial={{ scale: 0.85, opacity: 0, y: 30 }}
              animate={{ 
                scale: 1, 
                opacity: 1, 
                y: 0,
                transition: { type: "spring", stiffness: 350, damping: 24 }
              }}
              exit={{ 
                scale: 0.85, 
                opacity: 0, 
                y: 30,
                transition: { type: "tween", ease: "easeIn", duration: 0.15 } 
              }}
              className="bg-card w-full max-w-4xl rounded-3xl border border-border shadow-2xl relative flex flex-col p-6 max-h-[90vh] z-10"
            >
              {/* Close button */}
              <button
                onClick={() => setIsOpen(false)}
                className="absolute right-4 top-4 p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted/80 transition-colors cursor-pointer z-10"
              >
                <X className="h-5 w-5" />
              </button>

              {/* Header */}
              <div className="space-y-2 mb-6 pr-10">
                <h2 className="text-xl font-bold text-foreground flex items-center gap-2 select-none">
                  <HelpCircle className="h-5 w-5 text-primary animate-pulse" />
                  ElevateIQ Workflow Guide
                </h2>
                <p className="text-xs text-muted-foreground leading-relaxed select-none">
                  Interact with the step cards below. IQ-Bot will wave and guide you through each prep checkpoint.
                </p>
              </div>

              {/* Interactive side-by-side content */}
              <div className="flex flex-col lg:flex-row gap-6 items-stretch overflow-hidden flex-1 min-h-0">
                {/* Left side: Robot Column & Greet Speech Bubble */}
                <div className="hidden lg:flex flex-col items-center justify-center border-r border-border/40 pr-6 select-none shrink-0 w-56">
                  {/* Grammatically correct Greeting bubble from the bot */}
                  <motion.div
                    initial={{ opacity: 0, scale: 0.8, y: 15 }}
                    animate={{ opacity: 1, scale: 1, y: 0 }}
                    transition={{ delay: 0.25, type: "spring", stiffness: 220, damping: 15 }}
                    className="relative bg-primary/5 border border-primary/20 rounded-2xl p-4 shadow-sm text-center max-w-[210px] mb-2"
                  >
                    {/* Speech bubble tail pointer */}
                    <div className="absolute -bottom-1.5 left-1/2 -translate-x-1/2 w-3.5 h-3.5 bg-card border-r border-b border-primary/15 rotate-45" />
                    
                    <p className="text-[11px] text-foreground leading-relaxed font-semibold">
                      Hello! 🚀 I am <span className="text-primary font-bold">IQ-Bot</span>. Welcome to ElevateIQ! I am here to guide you. Hover over any card, and I will point out the workflow for you!
                    </p>
                  </motion.div>

                  <RobotAssistant activeStep={activeStep} />
                </div>

                {/* Right side: Step Cards list (flying points inside cards) */}
                <div className="flex-1 overflow-y-auto pr-2 space-y-3 pb-2">
                  {guideSteps.map((step, idx) => {
                    const isActive = activeStep === idx;
                    return (
                      <motion.div
                        key={idx}
                        onMouseEnter={() => setActiveStep(idx)}
                        whileHover={{ scale: 1.01, x: 2 }}
                        className={`p-4 rounded-xl border transition-all duration-200 cursor-pointer ${
                          isActive 
                            ? "bg-primary/5 border-primary/30 shadow-sm" 
                            : "bg-card/40 border-border hover:bg-card/70"
                        }`}
                      >
                        <div className="flex gap-3.5 items-start">
                          <span className={`text-[9px] font-bold px-2 py-0.5 rounded-md uppercase tracking-wider shrink-0 ${
                            isActive 
                              ? "bg-primary text-primary-foreground" 
                              : "bg-muted text-muted-foreground"
                          }`}>
                            Step {idx + 1}
                          </span>
                          <div className="space-y-1 min-w-0">
                            <h4 className="font-semibold text-foreground text-sm flex items-center gap-1.5">
                              {step.title}
                            </h4>
                            <p className="text-xs text-muted-foreground leading-relaxed">
                              {step.desc}
                            </p>
                          </div>
                        </div>
                      </motion.div>
                    );
                  })}
                </div>
              </div>

              {/* Footer */}
              <div className="mt-6 pt-4 border-t border-border/40 flex justify-end">
                <button
                  onClick={() => setIsOpen(false)}
                  className="cursor-pointer bg-primary text-primary-foreground hover:bg-primary/95 text-xs font-bold py-2.5 px-6 rounded-lg transition-all"
                >
                  Close Guide
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </>
  );
}
