"use client";

import React from "react";
import { Rocket, ArrowRight } from "lucide-react";
import { motion } from "framer-motion";

const RocketIllustration = () => {
  return (
    <div className="relative w-20 h-20 flex items-center justify-center shrink-0 select-none ml-2">
      <motion.svg
        width="64"
        height="64"
        viewBox="0 0 64 64"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        animate={{ y: [0, -6, 0] }}
        transition={{ repeat: Infinity, duration: 3, ease: "easeInOut" }}
      >
        <defs>
          <linearGradient id="rocketGrad" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#3b82f6" />
            <stop offset="100%" stopColor="#1d4ed8" />
          </linearGradient>
          <linearGradient id="wingGrad" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#ef4444" />
            <stop offset="100%" stopColor="#b91c1c" />
          </linearGradient>
        </defs>

        {/* Floating Stars */}
        <motion.circle cx="10" cy="15" r="1.5" fill="#fff" animate={{ opacity: [0.2, 1, 0.2] }} transition={{ repeat: Infinity, duration: 1.5 }} />
        <motion.circle cx="54" cy="20" r="1" fill="#fff" animate={{ opacity: [0.1, 0.8, 0.1] }} transition={{ repeat: Infinity, duration: 2, delay: 0.5 }} />
        <motion.circle cx="48" cy="50" r="1.5" fill="#fff" animate={{ opacity: [0.3, 1, 0.3] }} transition={{ repeat: Infinity, duration: 1.8, delay: 0.2 }} />

        {/* Fins/Wings */}
        <path d="M 22 38 L 12 48 L 22 45 Z" fill="url(#wingGrad)" />
        <path d="M 42 38 L 52 48 L 42 45 Z" fill="url(#wingGrad)" />

        {/* Rocket Body */}
        <path d="M 32 8 C 24 20 24 35 24 45 L 40 45 C 40 35 40 20 32 8 Z" fill="url(#rocketGrad)" />
        {/* Rocket Tip */}
        <path d="M 32 8 C 28 14 26 18 26 22 L 38 22 C 38 18 36 14 32 8 Z" fill="url(#wingGrad)" />

        {/* Port window */}
        <circle cx="32" cy="30" r="5" fill="#1e293b" stroke="#94a3b8" strokeWidth="1.5" />
        <circle cx="31" cy="29" r="1.5" fill="#fff" opacity="0.8" />

        {/* Thruster Base */}
        <rect x="28" y="45" width="8" height="3" fill="#64748b" />

        {/* Flickering Exhaust Flame */}
        <motion.path
          d="M 28 48 Q 32 64 36 48 Z"
          fill="rgba(239, 68, 68, 0.8)"
          animate={{ scaleY: [1, 1.35, 1], scaleX: [1, 0.9, 1] }}
          transition={{ repeat: Infinity, duration: 0.15, ease: "easeInOut" }}
          style={{ transformOrigin: "32px 48px" }}
        />
        <motion.path
          d="M 30 48 Q 32 58 34 48 Z"
          fill="rgba(245, 158, 11, 0.9)"
          animate={{ scaleY: [1, 1.2, 1] }}
          transition={{ repeat: Infinity, duration: 0.12, ease: "easeInOut", delay: 0.05 }}
          style={{ transformOrigin: "32px 48px" }}
        />
      </motion.svg>
    </div>
  );
};

export function GettingStartedCard() {
  const handleClick = () => {
    // Smooth scroll to the resume upload section
    const element = document.getElementById("resume-upload-section");
    if (element) {
      element.scrollIntoView({ behavior: "smooth" });
    }
  };

  return (
    <motion.div
      onClick={handleClick}
      whileHover={{ y: -4, scale: 1.01 }}
      transition={{ duration: 0.2, ease: "easeOut" }}
      className="group rounded-2xl border border-border bg-card/70 p-6 backdrop-blur-xl flex flex-col justify-between h-full hover:bg-card/90 hover:border-primary/40 hover:shadow-[0_0_24px_rgba(59,130,246,0.12)] transition-colors duration-200 cursor-pointer select-none"
    >
      <div className="flex gap-4 items-start">
        {/* Left Side: Icon, Title & Description */}
        <div className="flex-1 min-w-0">
          <div className="relative mb-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br from-primary/20 to-primary/5 border border-primary/30 text-primary shadow-[0_0_15px_rgba(59,130,246,0.1)] overflow-hidden">
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,rgba(59,130,246,0.2)_0%,transparent_70%)]" />
            <Rocket className="h-5 w-5 relative z-10 transition-transform duration-300 group-hover:scale-110 group-hover:-translate-y-0.5" />
          </div>

          <h3 className="font-semibold text-lg text-foreground flex items-center gap-2">
            Getting Started
          </h3>
          <p className="mt-2 text-sm text-muted-foreground leading-relaxed">
            You&apos;re one of the first to try ElevateIQ. Upload your resume below, then launch a mock interview &mdash; voice or coding &mdash; matched to the company and role you&apos;re preparing for.
          </p>
        </div>

        {/* Right Side: Dynamically moving SVG illustration */}
        <RocketIllustration />
      </div>

      <div className="mt-6 flex justify-end">
        <span className="text-xs font-semibold text-primary flex items-center gap-1 group-hover:translate-x-1 transition-transform duration-200">
          Upload Resume
          <ArrowRight className="h-3 w-3" />
        </span>
      </div>
    </motion.div>
  );
}
