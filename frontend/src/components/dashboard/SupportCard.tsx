"use client";

import React from "react";
import { HelpCircle, ArrowRight } from "lucide-react";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";

const SupportIllustration = () => {
  return (
    <div className="relative w-20 h-20 flex items-center justify-center shrink-0 select-none ml-2">
      <motion.svg
        width="64"
        height="64"
        viewBox="0 0 64 64"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        animate={{ y: [0, -4, 0] }}
        transition={{ repeat: Infinity, duration: 3.2, ease: "easeInOut" }}
      >
        <defs>
          <linearGradient id="supportBase" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#ec4899" />
            <stop offset="100%" stopColor="#a855f7" />
          </linearGradient>
        </defs>

        {/* Message bubble shadow/glow */}
        <circle cx="32" cy="32" r="24" fill="rgba(236, 72, 153, 0.05)" />

        {/* Outer Headset band */}
        <path d="M 16 36 A 16 16 0 0 1 48 36" stroke="#a855f7" strokeWidth="2.5" strokeLinecap="round" />

        {/* Main Message Card */}
        <rect x="18" y="20" width="28" height="20" rx="5" fill="#1e293b" stroke="#475569" strokeWidth="1" />
        
        {/* Dynamic Typing lines inside message */}
        <motion.rect
          x="23"
          y="26"
          width="18"
          height="2.5"
          rx="1"
          fill="#cbd5e1"
          animate={{ opacity: [0.3, 1, 0.3] }}
          transition={{ repeat: Infinity, duration: 1.5, ease: "easeInOut" }}
        />
        <motion.rect
          x="23"
          y="31"
          width="12"
          height="2.5"
          rx="1"
          fill="#cbd5e1"
          animate={{ opacity: [0.3, 1, 0.3] }}
          transition={{ repeat: Infinity, duration: 1.5, ease: "easeInOut", delay: 0.3 }}
        />

        {/* Headphone ear pads */}
        <rect x="12" y="32" width="6" height="10" rx="2" fill="url(#supportBase)" />
        <rect x="46" y="32" width="6" height="10" rx="2" fill="url(#supportBase)" />

        {/* Headset Mic */}
        <path d="M 18 38 Q 24 46 28 44" stroke="#a855f7" strokeWidth="2" strokeLinecap="round" />
        <circle cx="29" cy="43" r="2" fill="#ec4899" />

        {/* Floating Heartbeat pulse circles */}
        <motion.circle
          cx="32"
          cy="32"
          r="26"
          stroke="#ec4899"
          strokeWidth="1.5"
          initial={{ opacity: 0.6, scale: 0.8 }}
          animate={{ opacity: 0, scale: 1.2 }}
          transition={{ repeat: Infinity, duration: 2, ease: "easeOut" }}
          style={{ transformOrigin: "32px 32px" }}
        />
      </motion.svg>
    </div>
  );
};

export function SupportCard() {
  const router = useRouter();

  return (
    <motion.div
      onClick={() => router.push("/settings?focus=support")}
      whileHover={{ y: -4, scale: 1.01 }}
      transition={{ duration: 0.2, ease: "easeOut" }}
      className="group rounded-2xl border border-border bg-card/70 p-6 backdrop-blur-xl flex flex-col justify-between h-full hover:bg-card/90 hover:border-primary/40 hover:shadow-[0_0_24px_rgba(59,130,246,0.12)] transition-colors duration-200 cursor-pointer select-none"
    >
      <div className="flex gap-4 items-start">
        {/* Left Side: Icon, Title & Description */}
        <div className="flex-1 min-w-0">
          <div className="relative mb-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br from-primary/20 to-primary/5 border border-primary/30 text-primary shadow-[0_0_15px_rgba(59,130,246,0.1)] overflow-hidden">
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,rgba(59,130,246,0.2)_0%,transparent_70%)]" />
            <HelpCircle className="h-5 w-5 relative z-10 transition-transform duration-300 group-hover:scale-110 group-hover:-translate-y-0.5" />
          </div>

          <h3 className="font-semibold text-lg text-foreground flex items-center gap-2">
            Support Center
          </h3>
          <p className="mt-2 text-sm text-muted-foreground leading-relaxed">
            Need help? Submit issues directly to our customer support desk.
          </p>
        </div>

        {/* Right Side: Support dynamic illustration */}
        <SupportIllustration />
      </div>

      <div className="mt-6 flex justify-end">
        <span className="text-xs font-semibold text-primary flex items-center gap-1 group-hover:translate-x-1 transition-transform duration-200">
          Get Help
          <ArrowRight className="h-3 w-3" />
        </span>
      </div>
    </motion.div>
  );
}
