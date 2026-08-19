"use client";

import React, { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { CheckCircle2, XCircle, ChevronDown, Eye, X, BookOpen, FileText, ArrowRight } from "lucide-react";

interface Step {
  num: string;
  title: string;
  emoji: string;
  dos: string[];
  donts: string[];
}

const containerVariants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: {
      staggerChildren: 0.1
    }
  }
};

const itemVariants = {
  hidden: { scale: 0.5, opacity: 0, y: 40 },
  visible: {
    scale: 1,
    opacity: 1,
    y: 0,
    transition: {
      type: "spring" as const,
      stiffness: 260,
      damping: 14
    }
  }
};

const guideSteps: Step[] = [
  {
    num: "STEP 0",
    title: "JOB ALIGNMENT - DO THIS FIRST",
    emoji: "🎯",
    dos: [
      "🔍 Go to LinkedIn and search 1 job role you want to apply for. Ex: Data Analyst Intern, Software Developer, Marketing Intern",
      "📖 Read the Job Description carefully",
      "📝 Note 5-6 keywords, skills, and responsibilities from the JD",
      "🔗 Use those same keywords in your Career Objective, Skills, and Projects"
    ],
    donts: [
      "🚫 Don’t make a generic resume for “any job”",
      "⚠️ Don’t skip this step. Your resume must match 1 specific job role"
    ]
  },
  {
    num: "STEP 1",
    title: "HEADER / CONTACT INFORMATION",
    emoji: "📞",
    dos: [
      "👤 Full name, target role, phone, professional email, LinkedIn, GitHub/Portfolio",
      "📷 Plain, formal, square photo if you are adding one"
    ],
    donts: [
      "🚫 No casual emails, nicknames, or address",
      "🎨 No colored text or multiple fonts"
    ]
  },
  {
    num: "STEP 2",
    title: "CAREER OBJECTIVE",
    emoji: "🚀",
    dos: [
      "✍️ 3-4 lines: Who you are + Key 2-3 skills + Target Role + How your skills align with the JD you picked",
      "🔑 Mention 1-2 keywords from the LinkedIn JD here"
    ],
    donts: [
      "📋 No copy-paste generic objectives",
      "🥱 No “seeking challenging role in reputed company”"
    ]
  },
  {
    num: "STEP 3",
    title: "EDUCATION",
    emoji: "🎓",
    dos: [
      "⏳ Reverse chronological: Current Degree → 12th → 10th",
      "🏛️ Degree, Branch, Institute, City, Year, CGPA/%"
    ],
    donts: [
      "⚠️ Don’t forget to write \"Present\" for ongoing degree"
    ]
  },
  {
    num: "STEP 4",
    title: "PROJECTS / INTERNSHIPS / TRAININGS",
    emoji: "💼",
    dos: [
      "📅 Reverse chronological order",
      "🎛️ Format: Project/Role Name | Tools/Tech Used | Duration",
      "📊 2-3 bullets per project: Action Verb + Task + Tool + Quantified Result %",
      "🎯 Align 1-2 projects with the job role you picked from LinkedIn"
    ],
    donts: [
      "🚫 No paragraphs. Only bullets",
      "❌ No projects without tools or impact"
    ]
  },
  {
    num: "STEP 5",
    title: "TECHNICAL SKILLS",
    emoji: "💻",
    dos: [
      "🔝 List skills mentioned in the LinkedIn JD first",
      "🗂️ Group them: Programming | Tools | Software | Databases",
      "📌 Use bullets"
    ],
    donts: [
      "🤥 Don’t add skills you don’t know",
      "📝 Don’t write in sentences"
    ]
  },
  {
    num: "STEP 6",
    title: "INTERPERSONAL / SOFT SKILLS",
    emoji: "🤝",
    dos: [
      "🗣️ 4-6 skills: Communication, Teamwork, Leadership, Problem Solving etc",
      "🎖️ Add \"Leadership & Coordination\" if you held any position of responsibility"
    ],
    donts: [
      "🔄 Don’t repeat technical skills here"
    ]
  },
  {
    num: "STEP 7",
    title: "CERTIFICATIONS",
    emoji: "📜",
    dos: [
      "🏅 Bullets: Certification Name - Platform - Year",
      "🎯 Prioritize certifications related to the job role you picked"
    ],
    donts: [
      "🏫 Don’t add irrelevant school certificates"
    ]
  },
  {
    num: "STEP 8",
    title: "ACHIEVEMENTS / HOBBIES",
    emoji: "🏆",
    dos: [
      "📌 Bullets only",
      "🎯 Keep achievements and extra curricular relevant to job/leadership",
      "🎮 Hobbies: Prefer tech or skill-based hobbies"
    ],
    donts: [
      "📈 Don’t add more than 4-5 points per section"
    ]
  },
  {
    num: "STEP 9",
    title: "LANGUAGES",
    emoji: "🗣️",
    dos: [
      "🗣️ Language + Proficiency"
    ],
    donts: [
      "🔇 Don’t skip if job requires communication"
    ]
  },
  {
    num: "STEP 10",
    title: "FINAL FORMATTING & SUBMISSION",
    emoji: "📄",
    dos: [
      "🔤 Font: Calibri / Arial / Times New Roman, Size 11",
      "🔠 Bold only for Headings and Section Titles",
      "✨ Clean and professional",
      "📏 1 page",
      "💾 Save as: FirstName_LastName_UID _Resume.pdf"
    ],
    donts: [
      "🚫 No colors except blue black, tables, text boxes, or photos with background",
      "✍️ No spelling/grammar errors"
    ]
  }
];

const sampleResumes = [
  {
    name: "Akshita Gupta",
    role: "Software Engineer",
    img: "/resumes/akshita.png",
    type: "Classic Text-Based"
  },
  {
    name: "Shiv Sharma",
    role: "Data Analyst",
    img: "/resumes/shiv.png",
    type: "Modern Split-Sidebar"
  },
  {
    name: "Harshleen Kaur",
    role: "Software Developer",
    img: "/resumes/harshleen.png",
    type: "Clean Header-Profile"
  },
  {
    name: "Atharv Sharma",
    role: "Data Analyst Intern",
    img: "/resumes/atharv.png",
    type: "Balanced Two-Column"
  }
];

export function ResumeExamplesSection() {
  const [activeStep, setActiveStep] = useState<number | null>(0);
  const [selectedResume, setSelectedResume] = useState<string | null>(null);
  const [selectedResumeName, setSelectedResumeName] = useState<string>("");

  return (
    <div className="space-y-12 relative min-h-screen">
      {/* Background blobs for subtle floating animation */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none -z-10 opacity-30">
        <div className="absolute top-[10%] left-[10%] w-[350px] h-[350px] rounded-full bg-primary/8 blur-[90px] animate-float-1" />
        <div className="absolute top-[50%] right-[5%] w-[450px] h-[450px] rounded-full bg-accent/8 blur-[110px] animate-float-2" />
        <div className="absolute bottom-[5%] left-[25%] w-[400px] h-[400px] rounded-full bg-primary/4 blur-[100px] animate-float-1" />
      </div>

      <style dangerouslySetInnerHTML={{ __html: `
        @keyframes float-slow {
          0%, 100% { transform: translate(0, 0) scale(1); }
          50% { transform: translate(45px, -45px) scale(1.12); }
        }
        @keyframes float-medium {
          0%, 100% { transform: translate(0, 0) scale(1); }
          50% { transform: translate(-35px, 35px) scale(0.9); }
        }
        .animate-float-1 { animation: float-slow 22s infinite ease-in-out; }
        .animate-float-2 { animation: float-medium 28s infinite ease-in-out; }
      `}} />

      {/* Top section: Resume Previews */}
      <div className="space-y-5">
        <div className="flex items-center gap-2 select-none">
          <FileText className="h-5 w-5 text-primary animate-pulse" />
          <h3 className="font-semibold text-lg text-foreground">Sample Resume Blueprints</h3>
        </div>

        <motion.div
          variants={containerVariants}
          initial="hidden"
          animate="visible"
          className="grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-4"
        >
          {sampleResumes.map((resume) => (
            <motion.div
              key={resume.name}
              variants={itemVariants}
              onClick={() => {
                setSelectedResume(resume.img);
                setSelectedResumeName(resume.name);
              }}
              whileHover={{ y: -4, scale: 1.02 }}
              className="group relative cursor-pointer overflow-hidden rounded-xl border border-border bg-card/40 p-4 transition-all duration-200 hover:border-primary/30 hover:bg-card/70 flex flex-col justify-between select-none shadow-md backdrop-blur-md"
            >
              <div className="space-y-4">
                {/* Thumbnail Preview container */}
                <div className="relative h-44 w-full overflow-hidden rounded-lg border border-border/80 bg-muted/30 shadow-sm transition-transform duration-300 group-hover:scale-[1.02]">
                  <img
                    src={resume.img}
                    alt={`${resume.name} preview`}
                    className="h-full w-full object-cover object-top pointer-events-none filter brightness-[0.85] contrast-[1.1]"
                  />
                  <div className="absolute inset-0 bg-black/20 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity duration-200">
                    <span className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-black/75 text-xs text-white font-medium border border-white/10 shadow-lg">
                      <Eye className="h-3.5 w-3.5" />
                      View Sample
                    </span>
                  </div>
                </div>

                <div className="flex flex-col min-w-0">
                  <span className="text-[10px] font-bold tracking-wider uppercase text-primary">{resume.type}</span>
                  <h4 className="font-semibold text-foreground truncate mt-1">{resume.name}</h4>
                  <p className="text-xs text-muted-foreground truncate mt-0.5">{resume.role}</p>
                </div>
              </div>

              {/* Animated Arrow navigating to see the image */}
              <div className="flex items-center justify-end mt-4 pt-3 border-t border-border/40">
                <span className="text-[11px] font-medium text-muted-foreground group-hover:text-primary transition-colors flex items-center gap-1">
                  Open Resume
                  <motion.div
                    animate={{ x: [0, 4, 0] }}
                    transition={{ repeat: Infinity, duration: 1.4, ease: "easeInOut" }}
                  >
                    <ArrowRight className="h-3.5 w-3.5" />
                  </motion.div>
                </span>
              </div>
            </motion.div>
          ))}
        </motion.div>
      </div>

      {/* Bottom section: Step-by-Step Guide Accordion */}
      <div className="space-y-5">
        <div className="flex items-center gap-2 select-none">
          <BookOpen className="h-5 w-5 text-primary" />
          <h3 className="font-semibold text-lg text-foreground">Step-Wise Resume Blueprint</h3>
        </div>

        <div className="space-y-3">
          {guideSteps.map((step, idx) => {
            const isOpen = activeStep === idx;
            return (
              <div
                key={step.num}
                className="overflow-hidden rounded-xl border border-border bg-card/30 backdrop-blur-md"
              >
                <button
                  onClick={() => setActiveStep(isOpen ? null : idx)}
                  className="flex w-full items-center justify-between px-5 py-4.5 text-left font-medium text-foreground hover:bg-card/60 transition-colors select-none cursor-pointer"
                >
                  <div className="flex items-center gap-3">
                    <span className="text-xs font-bold text-primary px-2.5 py-1 rounded bg-primary/10 border border-primary/20 shrink-0">
                      {step.num}
                    </span>
                    <span className="text-sm font-bold text-foreground tracking-tight flex items-center gap-2">
                      <span>{step.emoji}</span>
                      {step.title}
                    </span>
                  </div>
                  <motion.div
                    animate={{ rotate: isOpen ? 180 : 0 }}
                    transition={{ duration: 0.2 }}
                    className="text-muted-foreground shrink-0 ml-4"
                  >
                    <ChevronDown className="h-4 w-4" />
                  </motion.div>
                </button>

                <AnimatePresence initial={false}>
                  {isOpen && (
                    <motion.div
                      initial={{ height: 0 }}
                      animate={{ height: "auto" }}
                      exit={{ height: 0 }}
                      transition={{ duration: 0.24, ease: "easeInOut" }}
                      className="overflow-hidden"
                    >
                      <div className="border-t border-border/50 bg-card/10 px-5 py-5 space-y-5 text-sm text-foreground select-none">
                        {/* Do Section */}
                        <div className="space-y-2.5">
                          <span className="text-xs font-bold text-success flex items-center gap-1.5 uppercase tracking-wider">
                            <CheckCircle2 className="h-4 w-4" />
                            What to Do:
                          </span>
                          <ul className="pl-1 space-y-2 text-xs text-muted-foreground leading-relaxed">
                            {step.dos.map((doItem, doIdx) => (
                              <li key={doIdx} className="flex gap-2.5 items-start">
                                <span className="text-success select-none mt-0.5">✓</span>
                                <span>{doItem}</span>
                              </li>
                            ))}
                          </ul>
                        </div>

                        {/* Don't Section */}
                        <div className="space-y-2.5">
                          <span className="text-xs font-bold text-destructive flex items-center gap-1.5 uppercase tracking-wider">
                            <XCircle className="h-4 w-4" />
                            What to Avoid:
                          </span>
                          <ul className="pl-1 space-y-2 text-xs text-muted-foreground leading-relaxed">
                            {step.donts.map((dontItem, dontIdx) => (
                              <li key={dontIdx} className="flex gap-2.5 items-start">
                                <span className="text-destructive select-none mt-0.5">✗</span>
                                <span>{dontItem}</span>
                              </li>
                            ))}
                          </ul>
                        </div>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            );
          })}
        </div>
      </div>

      {/* Modal View for Sample Resume Image */}
      <AnimatePresence>
        {selectedResume && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            {/* Separate background blur overlay to prevent child blur inheritance */}
            <div
              className="absolute inset-0 bg-black/60 backdrop-blur-md cursor-pointer"
              onClick={() => setSelectedResume(null)}
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
              className="bg-card w-full max-w-4xl rounded-2xl border border-border shadow-2xl relative flex flex-col p-6 max-h-[92vh] z-10"
            >
              {/* Close button */}
              <button
                onClick={() => setSelectedResume(null)}
                className="absolute right-4 top-4 p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted/80 transition-colors cursor-pointer z-10"
              >
                <X className="h-5 w-5" />
              </button>

              <div className="mb-4 pr-10">
                <h3 className="text-lg font-bold text-foreground">{selectedResumeName} &mdash; Sample Resume</h3>
                <p className="text-xs text-muted-foreground">Follow this layout structure for ATS calibration.</p>
              </div>

              {/* Scrollable image container */}
              <div className="flex-1 overflow-y-auto rounded-lg border border-border bg-muted/20 p-4 flex justify-center">
                <img
                  src={selectedResume}
                  alt={selectedResumeName}
                  className="max-w-full h-auto object-contain rounded shadow-md filter brightness-[0.98] contrast-[1.02]"
                  style={{ imageRendering: "auto" }}
                />
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
