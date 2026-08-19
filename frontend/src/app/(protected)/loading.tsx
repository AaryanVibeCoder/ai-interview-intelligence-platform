"use client";

import React from "react";
import { motion } from "framer-motion";

export default function ProtectedLoading() {
  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] space-y-4 select-none">
      <div className="relative flex items-center justify-center">
        {/* Outer glowing pulsing ring */}
        <motion.div
          animate={{ scale: [1, 1.25, 1], opacity: [0.3, 0.6, 0.3] }}
          transition={{ repeat: Infinity, duration: 2, ease: "easeInOut" }}
          className="absolute w-16 h-16 rounded-full border border-primary/20 bg-primary/5 blur-sm"
        />
        {/* Main spinning ring */}
        <motion.div
          animate={{ rotate: 360 }}
          transition={{ repeat: Infinity, duration: 1, ease: "linear" }}
          className="w-12 h-12 rounded-full border-2 border-primary/20 border-t-primary"
        />
      </div>
      <div className="space-y-1.5 text-center">
        <span className="text-xs font-bold text-primary tracking-wider uppercase animate-pulse">
          Loading Page
        </span>
        <p className="text-[10px] text-muted-foreground">
          Calibrating environment...
        </p>
      </div>
    </div>
  );
}
