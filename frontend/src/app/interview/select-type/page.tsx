"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@clerk/nextjs";
import { apiClient } from "@/services/api/client";
import { useInterviewStore } from "@/store/interview-store";
import { 
  Briefcase, 
  Code2, 
  Volume2, 
  Sparkles, 
  ArrowRight, 
  Award, 
  CheckCircle2, 
  AlertCircle
} from "lucide-react";

interface InterviewSetupProfile {
  id: number;
  resume_id: number;
  target_company: string;
  interview_type: string;
  experience_level: string;
}

interface ResumeDetails {
  id: number;
  file_name: string;
  ats_score: number | null;
  technical_skills?: string[];
  experience_level?: string;
  analysis_status: string;
}

export default function SelectInterviewType() {
  const router = useRouter();
  const { getToken } = useAuth();
  const { 
    setInterviewType, 
    setResumeData, 
    setTargetCompany, 
    setExperienceLevel, 
    setRole,
    setJobType,
    targetCompany, 
    experienceLevel,
    atsScore,
    resumeData
  } = useInterviewStore();

  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [profile, setProfile] = useState<InterviewSetupProfile | null>(null);
  const [resume, setResume] = useState<ResumeDetails | null>(null);

  useEffect(() => {
    async function loadConfigData() {
      try {
        const token = await getToken();
        if (!token) {
          setError("Session authorization token missing. Please sign in again.");
          setIsLoading(false);
          return;
        }

        const headers = { Authorization: `Bearer ${token}` };

        // 1. Fetch setup profile
        let setupProfile: InterviewSetupProfile | null = null;
        try {
          setupProfile = await apiClient.get<InterviewSetupProfile>("/api/interview/setup", { headers } as never);
          setProfile(setupProfile);
          setTargetCompany(setupProfile.target_company);
          setExperienceLevel(setupProfile.experience_level);
          if (setupProfile.role) setRole(setupProfile.role);
          if (setupProfile.job_type) setJobType(setupProfile.job_type);
        } catch (err) {
          console.log("No existing setup profile found. Loading default fallback config.", err);
        }

        // 2. Fetch resumes to retrieve skills & ATS scores
        try {
          const resList = await apiClient.get<{ resumes: ResumeDetails[] }>("/resumes/", { headers } as never);
          const completedResume = resList.resumes.find((r) => r.analysis_status === "completed") || resList.resumes[0];
          
          if (completedResume) {
            setResume(completedResume);
            setResumeData(completedResume, completedResume.ats_score || 75);
          }
        } catch (err) {
          console.warn("Failed to load resume details.", err);
        }

      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load profile configuration.");
      } finally {
        setIsLoading(false);
      }
    }

    loadConfigData();
  }, [getToken, setResumeData, setTargetCompany, setExperienceLevel]);

  const handleSelectRoute = (type: "behavioral" | "coding") => {
    setInterviewType(type);
    if (type === "behavioral") {
      router.push("/interview/behavioral");
    } else {
      router.push("/interview/coding");
    }
  };

  if (isLoading) {
    return (
      <div className="max-w-4xl mx-auto py-24 px-6 flex flex-col items-center justify-center space-y-4">
        <div className="w-10 h-10 border-4 border-primary border-t-transparent rounded-full animate-spin"></div>
        <p className="text-sm font-semibold text-muted-foreground">Loading your interview dashboard profile...</p>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto py-12 px-6 space-y-8">
      
      {/* Title */}
      <div className="text-center space-y-2">
        <h1 className="text-4xl font-extrabold tracking-tight bg-gradient-to-r from-foreground via-foreground to-primary bg-clip-text text-transparent">
          Select Your Interview Loop
        </h1>
        <p className="text-muted-foreground text-sm max-w-xl mx-auto">
          Choose between a real-time behavioral discussion or a secure programming environment.
        </p>
      </div>

      {/* Target details badge panel */}
      <div className="bg-card border border-border p-6 rounded-2xl flex flex-wrap gap-6 items-center justify-between shadow-sm">
        <div className="flex flex-col gap-1.5">
          <span className="text-[10px] uppercase tracking-wider text-muted-foreground font-bold">Target Workspace</span>
          <h3 className="text-lg font-bold text-foreground flex items-center gap-1.5">
            <Briefcase className="w-4 h-4 text-primary" />
            {targetCompany || "ElevateIQ Client"}
          </h3>
        </div>

        <div className="flex flex-col gap-1.5">
          <span className="text-[10px] uppercase tracking-wider text-muted-foreground font-bold">Seniority Level</span>
          <span className="text-xs font-semibold px-3 py-1 bg-muted border border-border rounded-full text-foreground capitalize">
            {experienceLevel || "Mid-level Engineer"}
          </span>
        </div>

        <div className="flex flex-col gap-1.5">
          <span className="text-[10px] uppercase tracking-wider text-muted-foreground font-bold">Resume ATS Analysis</span>
          <span className="text-xs font-semibold text-success flex items-center gap-1">
            <Award className="w-4 h-4 text-success" />
            Score: {atsScore || 75}/100 ({resume?.file_name ? "Linked" : "Simulated Profile"})
          </span>
        </div>
      </div>

      {error && (
        <div className="p-4 bg-destructive/10 border border-destructive/20 rounded-xl flex gap-3 text-destructive animate-in slide-in-from-top-2">
          <AlertCircle className="w-5 h-5 flex-shrink-0" />
          <span className="text-xs leading-relaxed">{error}</span>
        </div>
      )}

      {/* Route Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        
        {/* Card 1: Behavioral voice loop */}
        <div 
          onClick={() => handleSelectRoute("behavioral")}
          className="group relative bg-card border border-border hover:border-primary/40 rounded-2xl p-8 cursor-pointer shadow-sm hover:shadow-elevate-sm hover:-translate-y-1 transition-all duration-300 flex flex-col justify-between"
        >
          <div className="space-y-4">
            <div className="w-12 h-12 rounded-xl bg-primary/10 text-primary flex items-center justify-center transition-all group-hover:bg-primary group-hover:text-primary-foreground">
              <Volume2 className="w-6 h-6" />
            </div>
            <div className="space-y-2">
              <h2 className="text-xl font-bold group-hover:text-primary transition-colors flex items-center gap-2">
                Behavioral Interview
                <Sparkles className="w-4 h-4 text-amber-500 animate-pulse" />
              </h2>
              <p className="text-xs text-muted-foreground leading-relaxed">
                Experience a mock voice session with Eleanor, our AI interviewer. Get tested on scenario handling, team dynamics, conflict resolution, and the STAR format.
              </p>
            </div>
          </div>
          
          <div className="mt-8 flex items-center gap-2 text-xs font-bold text-primary group-hover:underline">
            Start Conversational Loop <ArrowRight className="w-4 h-4 transition-transform group-hover:translate-x-1" />
          </div>
        </div>

        {/* Card 2: Coding editor loop */}
        <div 
          onClick={() => handleSelectRoute("coding")}
          className="group relative bg-card border border-border hover:border-accent/40 rounded-2xl p-8 cursor-pointer shadow-sm hover:shadow-elevate-sm hover:-translate-y-1 transition-all duration-300 flex flex-col justify-between"
        >
          <div className="space-y-4">
            <div className="w-12 h-12 rounded-xl bg-accent/10 text-accent flex items-center justify-center transition-all group-hover:bg-accent group-hover:text-accent-foreground">
              <Code2 className="w-6 h-6" />
            </div>
            <div className="space-y-2">
              <h2 className="text-xl font-bold group-hover:text-accent transition-colors">
                Coding Challenge
              </h2>
              <p className="text-xs text-muted-foreground leading-relaxed">
                Access a professional visual workspace supporting test-case execution, timing counters, language settings, and live keyword resume tracking.
              </p>
            </div>
          </div>

          <div className="mt-8 flex items-center gap-2 text-xs font-bold text-accent group-hover:underline">
            Start Programming Loop <ArrowRight className="w-4 h-4 transition-transform group-hover:translate-x-1" />
          </div>
        </div>

      </div>

    </div>
  );
}
