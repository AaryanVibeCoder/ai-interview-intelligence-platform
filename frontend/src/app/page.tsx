"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { useAuth } from "@clerk/nextjs";
import { motion } from "framer-motion";

export default function Home() {
  const router = useRouter();
  const { isLoaded, userId } = useAuth();
  const [animationCompleted, setAnimationCompleted] = useState(false);

  // Split strings into arrays of characters for character-by-character animation
  const nameLetters = Array.from("ElevateIQ");
  const taglineLetters = Array.from("PRACTICE TODAY. PLACED TOMORROW.");

  // Animation Timing:
  // - Typing starts at 0.5s.
  // - Logo stays for 3.5s additional to typing start -> stays until 4.0s.
  // - Redirection triggers at 4.0s once Clerk resolves auth state.
  useEffect(() => {
    const timer = setTimeout(() => {
      setAnimationCompleted(true);
    }, 4000);
    return () => clearTimeout(timer);
  }, []);

  // Redirect once animation completes and Clerk auth state is loaded
  useEffect(() => {
    if (animationCompleted && isLoaded) {
      if (userId) {
        router.replace("/dashboard");
      } else {
        router.replace("/sign-in");
      }
    }
  }, [animationCompleted, isLoaded, userId, router]);

  // Animation variants
  const containerVariants = {
    hidden: { opacity: 1 },
    visible: {
      opacity: 1,
      transition: {
        staggerChildren: 0.08,
        delayChildren: 0.5, // Start typing "ElevateIQ" at 0.5s
      },
    },
  };

  const taglineVariants = {
    hidden: { opacity: 1 },
    visible: {
      opacity: 1,
      transition: {
        staggerChildren: 0.04,
        delayChildren: 1.4, // Start typing tagline at 1.4s (after "ElevateIQ" finishes)
      },
    },
  };

  const letterVariants = {
    hidden: { opacity: 0 },
    visible: {
      opacity: 1,
      transition: { duration: 0.1, ease: "easeIn" },
    },
  };

  return (
    <div className="relative flex min-h-screen flex-col items-center justify-center bg-[#02040a] text-foreground overflow-hidden px-4 select-none">
      
      {/* --- Dynamic Background --- */}
      {/* Moving Ambient Light Halo 1 */}
      <motion.div
        animate={{
          x: [0, 30, -30, 0],
          y: [0, -40, 40, 0],
        }}
        transition={{
          duration: 12,
          repeat: Infinity,
          ease: "easeInOut",
        }}
        className="absolute top-1/4 left-1/4 w-[300px] h-[300px] rounded-full bg-blue-500/10 blur-[120px] pointer-events-none"
      />

      {/* Moving Ambient Light Halo 2 */}
      <motion.div
        animate={{
          x: [0, -30, 30, 0],
          y: [0, 40, -40, 0],
        }}
        transition={{
          duration: 15,
          repeat: Infinity,
          ease: "easeInOut",
        }}
        className="absolute bottom-1/4 right-1/4 w-[350px] h-[350px] rounded-full bg-purple-500/10 blur-[130px] pointer-events-none"
      />

      {/* Curved glowing neon bottom halo */}
      <div className="absolute bottom-0 left-0 right-0 h-[180px] bg-gradient-to-t from-blue-950/20 via-purple-950/10 to-transparent blur-[80px] pointer-events-none" />
      
      {/* Light streak arc at the bottom */}
      <div className="absolute bottom-0 left-[-10%] right-[-10%] h-[1px] bg-gradient-to-r from-transparent via-blue-500/30 via-purple-500/30 to-transparent shadow-[0_-4px_20px_2px_rgba(59,130,246,0.25)] pointer-events-none" />

      {/* --- Splash Content --- */}
      <div className="relative z-10 flex flex-col items-center justify-center space-y-8 text-center">
        
        {/* Logo: scales and fades in (0ms to 500ms) */}
        <motion.div
          initial={{ opacity: 0, scale: 0.8 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.5, ease: "easeOut" }}
          className="relative flex justify-center"
        >
          <Image
            src="/branding/icon-only.png"
            alt="ElevateIQ Icon"
            width={96}
            height={96}
            className="w-16 h-16 md:w-24 md:h-24 object-contain max-w-[350px] max-h-[350px] drop-shadow-[0_0_15px_rgba(59,130,246,0.2)]"
            priority
          />
        </motion.div>

        {/* Text Container */}
        <div className="flex flex-col items-center">
          {/* Watermark: "ElevateIQ" Typing Animation */}
          <motion.h1
            variants={containerVariants}
            initial="hidden"
            animate="visible"
            className="text-4xl md:text-5xl font-bold tracking-tight text-white flex items-center justify-center font-sans"
          >
            {nameLetters.map((char, index) => {
              // Highlight the last two characters "IQ" with gradient
              const isIQ = index >= 7;
              return (
                <motion.span
                  key={index}
                  variants={letterVariants}
                  className={
                    isIQ
                      ? "bg-gradient-to-r from-blue-400 via-indigo-400 to-purple-400 bg-clip-text text-transparent font-extrabold"
                      : "text-white"
                  }
                >
                  {char}
                </motion.span>
              );
            })}
            <motion.span
              initial={{ opacity: 0 }}
              animate={{ opacity: [0, 1, 0] }}
              transition={{ repeat: Infinity, duration: 0.8, ease: "easeInOut" }}
              className="text-purple-400 text-xs align-super ml-0.5"
            >
              ✦
            </motion.span>
          </motion.h1>

          {/* Tagline: "PRACTICE TODAY. PLACED TOMORROW." Typing Animation with side lines */}
          <div className="flex items-center justify-center space-x-3 mt-4">
            <motion.div
              initial={{ scaleX: 0, opacity: 0 }}
              animate={{ scaleX: 1, opacity: 0.3 }}
              transition={{ delay: 1.4, duration: 0.5 }}
              className="h-[1px] w-6 md:w-12 bg-gradient-to-r from-transparent to-blue-500 origin-right"
            />

            <motion.p
              variants={taglineVariants}
              initial="hidden"
              animate="visible"
              className="text-[9px] md:text-[11px] tracking-[0.2em] font-semibold text-slate-400 uppercase font-mono"
            >
              {taglineLetters.map((char, index) => (
                <motion.span key={index} variants={letterVariants}>
                  {char}
                </motion.span>
              ))}
            </motion.p>

            <motion.div
              initial={{ scaleX: 0, opacity: 0 }}
              animate={{ scaleX: 1, opacity: 0.3 }}
              transition={{ delay: 1.4, duration: 0.5 }}
              className="h-[1px] w-6 md:w-12 bg-gradient-to-r from-blue-500 to-transparent origin-left"
            />
          </div>
        </div>

      </div>
    </div>
  );
}
