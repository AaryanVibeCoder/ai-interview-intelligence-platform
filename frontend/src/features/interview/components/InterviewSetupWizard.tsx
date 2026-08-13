"use client";

import React, { useEffect, useState, useMemo, useRef, useCallback } from "react";
import { useAuth } from "@clerk/nextjs";
import { useResumeUpload } from "@/features/resume/hooks/use-resume-upload";
import { apiClient } from "@/services/api/client";
import { ApiError } from "@/services/api/errors";
import { useInterviewStore } from "@/store/interview-store";
import {
  Play,
  RefreshCw,
  Sparkles,
  X,
  ChevronRight,
  ChevronLeft,
  Upload,
  Briefcase,
  Layers,
  CheckCircle2,
  AlertCircle
} from "lucide-react";
import companiesData from "./companies.json";

interface InterviewProfile {
  id: number;
  resume_id: number;
  target_company: string;
  interview_type: string;
  experience_level: string;
  role?: string;
  job_type?: string;
}

interface Company {
  name: string;
  industry: string;
  hiring_intensity: string;
  interview_style: string;
  avg_questions: number;
}

const formatRoleName = (role: string, type: "intern" | "full time job"): string => {
  if (type !== "intern") return role;
  const lower = role.toLowerCase();
  if (lower.includes("intern") || lower.includes("junior")) return role;
  if (
    lower.includes("manager") ||
    lower.includes("lead") ||
    lower.includes("director") ||
    lower.includes("principal") ||
    lower.includes("head")
  ) {
    return `Junior ${role}`;
  }
  return `${role} Intern`;
};

interface InterviewSetupWizardProps {
  isOpen: boolean;
  onClose: () => void;
}

export function InterviewSetupWizard({ isOpen, onClose }: InterviewSetupWizardProps) {
  const { getToken } = useAuth();
  const {
    resumes,
    isLoadingResumes,
    refresh: refreshResumes,
    startUpload,
    isUploading,
    successMessage: uploadSuccessMessage,
    error: uploadErrorMessage
  } = useResumeUpload();

  const {
    setInterviewType,
    setResumeData,
    setTargetCompany,
    setExperienceLevel,
    setActiveSessionId,
    setRole,
    setJobType,
    setCurrentQuestion,
    setQuestionSource,
    resetSession
  } = useInterviewStore();

  // Wizard Step States
  const [currentStep, setCurrentStep] = useState<number>(1);
  const [selectedResumeId, setSelectedResumeId] = useState<number | null>(null);
  const [selectedInterviewType, setSelectedInterviewType] = useState<"coding" | "system_design" | "behavioral">("coding");
  const [selectedCompany, setSelectedCompany] = useState<Company | null>(null);

  const [targetRole, setTargetRole] = useState("");
  const [localJobType, setLocalJobType] = useState<"intern" | "full time job">("full time job");
  const [isValidatingRole, setIsValidatingRole] = useState(false);
  const [roleValidationError, setRoleValidationError] = useState<string | null>(null);

  const [roleSearchQuery, setRoleSearchQuery] = useState("");
  const [roleDebouncedQuery, setRoleDebouncedQuery] = useState("");
  const [apiRoles, setApiRoles] = useState<string[]>([]);
  const [isSearchingRoles, setIsSearchingRoles] = useState(false);
  const [isRoleDropdownOpen, setIsRoleDropdownOpen] = useState(false);
  const [roleHighlightedIndex, setRoleHighlightedIndex] = useState(-1);
  const roleDropdownRef = useRef<HTMLDivElement>(null);
  const lastFetchedCompanyQueryRef = useRef("");
  const lastFetchedRoleQueryRef = useRef("");

  const [companyRoles, setCompanyRoles] = useState<string[]>([]);
  const [recommendedRoles, setRecommendedRoles] = useState<string[]>([]);
  const [isLoadingRoles, setIsLoadingRoles] = useState(false);

  const targetRoleRef = useRef(targetRole);
  targetRoleRef.current = targetRole;
  const localJobTypeRef = useRef(localJobType);
  localJobTypeRef.current = localJobType;

  useEffect(() => {
    if (!selectedCompany) {
      setCompanyRoles([]);
      setRecommendedRoles([]);
      return;
    }

    let active = true;
    const fetchCompanyRoles = async () => {
      setIsLoadingRoles(true);
      try {
        const token = await getToken();
        if (!active) return;
        const headers = token ? { Authorization: `Bearer ${token}` } : {};
        const useMock = process.env.NEXT_PUBLIC_USE_MOCK === "true";
        const API_BASE = useMock ? "/api/interview/mock" : "/api/interview";

        const res = await apiClient.post<{ roles: string[]; recommended: string[] }>(
          `${API_BASE}/company-roles`,
          {
            company: selectedCompany.name,
            resume_id: selectedResumeId
          },
          { headers } as never
        );

        if (!active) return;

        const fetchedRoles = res.roles || [];
        setCompanyRoles(fetchedRoles);
        setRecommendedRoles(res.recommended || []);
      } catch (err) {
        if (!active) return;
        console.warn("Failed to fetch company roles", err);
        const fallback = [
          "Software Engineer",
          "Frontend Engineer",
          "Backend Engineer",
          "Full Stack Engineer",
          "Product Manager",
          "Product Designer",
          "DevOps Engineer",
          "Data Scientist",
          "QA Engineer"
        ];
        setCompanyRoles(fallback);
      } finally {
        if (active) {
          setIsLoadingRoles(false);
        }
      }
    };

    fetchCompanyRoles();
    return () => {
      active = false;
    };
  }, [selectedCompany, selectedResumeId]); // eslint-disable-line react-hooks/exhaustive-deps

  // Search & Recommendations States
  const [searchQuery, setSearchQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [apiCompanies, setApiCompanies] = useState<Company[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [recommendedCompanies, setRecommendedCompanies] = useState<Company[]>([]);
  const [isLoadingRecommendations, setIsLoadingRecommendations] = useState(false);
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const [highlightedIndex, setHighlightedIndex] = useState(-1);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Submit States
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Double-submit guard: a ref (set synchronously) blocks a rapid second click
  // even before `isSubmitting` state has flushed through a re-render.
  const submitInFlightRef = useRef(false);

  // Sync / refresh resumes when wizard opens
  useEffect(() => {
    if (isOpen) {
      refreshResumes();
      // Reset Wizard parameters on open
      setCurrentStep(1);
      setSelectedResumeId(null);
      setSelectedInterviewType("coding");
      setSelectedCompany(null);
      setSearchQuery("");
      setRoleSearchQuery("");
      setTargetRole("");
      setCompanyRoles([]);
      setRecommendedRoles([]);
      setError(null);
    }
  }, [isOpen, refreshResumes]);

  // Click outside listener for company dropdown
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsDropdownOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // Click outside listener for role dropdown
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (roleDropdownRef.current && !roleDropdownRef.current.contains(event.target as Node)) {
        setIsRoleDropdownOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // Synchronization of role name when job type toggles (Internship vs Full-Time)
  useEffect(() => {
    if (targetRole && selectedCompany) {
      const baseRole = companyRoles.find((r) => {
        const formattedIntern = formatRoleName(r, "intern");
        const formattedFT = formatRoleName(r, "full time job");
        return targetRole === formattedIntern || targetRole === formattedFT;
      });
      if (baseRole) {
        const newFormatted = formatRoleName(baseRole, localJobType);
        setTargetRole(newFormatted);
        setRoleSearchQuery(newFormatted);
      }
    }
  }, [localJobType, companyRoles]);

  // Filter completed resumes
  const analyzedResumes = useMemo(() => {
    return resumes.filter((r) => r.analysis_status === "completed");
  }, [resumes]);

  const filteredRoles = useMemo(() => {
    let baseList = apiRoles.length > 0 ? apiRoles : companyRoles;
    if (apiRoles.length === 0 && roleSearchQuery.trim()) {
      baseList = companyRoles.filter((r) => {
        const formatted = formatRoleName(r, localJobType).toLowerCase();
        const raw = r.toLowerCase();
        const query = roleSearchQuery.toLowerCase();
        return raw.includes(query) || formatted.includes(query);
      });
    }
    
    // Deduplicate the list at the component data layer
    const deduped: string[] = [];
    const seen = new Set<string>();
    for (const r of baseList) {
      const normalized = r.trim().toLowerCase();
      if (!seen.has(normalized)) {
        seen.add(normalized);
        deduped.push(r);
      }
    }
    return deduped;
  }, [companyRoles, roleSearchQuery, localJobType, apiRoles]);

  // Auto-select the first completed resume if available
  useEffect(() => {
    if (analyzedResumes.length > 0 && selectedResumeId === null) {
      setSelectedResumeId(analyzedResumes[0].id);
    }
  }, [analyzedResumes, selectedResumeId]);

  // Get currently selected resume details
  const selectedResume = useMemo(() => {
    return resumes.find((r) => r.id === selectedResumeId) || null;
  }, [resumes, selectedResumeId]);

  // Debounce search queries (Part A)
  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedQuery(searchQuery);
    }, 300);
    return () => clearTimeout(handler);
  }, [searchQuery]);

  useEffect(() => {
    const handler = setTimeout(() => {
      setRoleDebouncedQuery(roleSearchQuery);
    }, 300);
    return () => clearTimeout(handler);
  }, [roleSearchQuery]);

  // Fetch companies matching query (Part A - Cache-first, hybrid lookup)
  useEffect(() => {
    if (!debouncedQuery.trim()) {
      setApiCompanies([]);
      lastFetchedCompanyQueryRef.current = "";
      return;
    }
    if (debouncedQuery === lastFetchedCompanyQueryRef.current) {
      return;
    }
    let active = true;
    const fetchCompanies = async () => {
      setIsSearching(true);
      lastFetchedCompanyQueryRef.current = debouncedQuery;
      try {
        const useMock = process.env.NEXT_PUBLIC_USE_MOCK === "true";
        const API_BASE = useMock ? "/api/interview/mock" : "/api/interview";
        const token = await getToken();
        if (!active) return;
        const headers = token ? { Authorization: `Bearer ${token}` } : {};

        // Cache-first lookup (cache_only=true)
        const cacheResults = await apiClient.get<Company[]>(
          `${API_BASE}/companies/search?q=${encodeURIComponent(debouncedQuery)}&cache_only=true`,
          { headers } as never
        );
        
        if (!active) return;

        if (cacheResults.length > 0) {
          setApiCompanies(cacheResults);
          setIsSearching(false);
        } else {
          // Cache miss: Show searching spinner and query LLM resolution pipeline
          const resolveResults = await apiClient.get<Company[]>(
            `${API_BASE}/companies/search?q=${encodeURIComponent(debouncedQuery)}&cache_only=false`,
            { headers } as never
          );
          if (active) {
            setApiCompanies(resolveResults);
            setIsSearching(false);
          }
        }
      } catch (err: any) {
        if (err?.name === "AbortError" || err?.name === "TimeoutError") {
          return;
        }
        if (active) {
          console.error("Failed to fetch companies from API", err);
          setIsSearching(false);
        }
      }
    };

    fetchCompanies();
    return () => {
      active = false;
    };
  }, [debouncedQuery]); // eslint-disable-line react-hooks/exhaustive-deps

  // Fetch roles matching query (Part A - Cache-first, hybrid lookup)
  useEffect(() => {
    if (!roleDebouncedQuery.trim()) {
      setApiRoles([]);
      lastFetchedRoleQueryRef.current = "";
      return;
    }
    if (roleDebouncedQuery === lastFetchedRoleQueryRef.current) {
      return;
    }
    let active = true;
    const fetchRoles = async () => {
      setIsSearchingRoles(true);
      lastFetchedRoleQueryRef.current = roleDebouncedQuery;
      try {
        const useMock = process.env.NEXT_PUBLIC_USE_MOCK === "true";
        const API_BASE = useMock ? "/api/interview/mock" : "/api/interview";
        const token = await getToken();
        if (!active) return;
        const headers = token ? { Authorization: `Bearer ${token}` } : {};

        console.log(`[RoleSearch] Firing API search for: "${roleDebouncedQuery}"`);
        // Cache-first lookup (cache_only=true)
        const cacheResults = await apiClient.get<any[]>(
          `${API_BASE}/roles/search?q=${encodeURIComponent(roleDebouncedQuery)}&cache_only=true`,
          { headers } as never
        );
        
        if (!active) return;

        const roleNames = cacheResults.map(r => r.name);
        console.log(`[RoleSearch] Cache results for "${roleDebouncedQuery}":`, roleNames);
        if (roleNames.length > 0) {
          setApiRoles(roleNames);
          setIsSearchingRoles(false);
        } else {
          console.log(`[RoleSearch] Cache miss. Firing LLM query for: "${roleDebouncedQuery}"`);
          // Cache miss: Show searching spinner and query LLM resolution pipeline
          const resolveResults = await apiClient.get<any[]>(
            `${API_BASE}/roles/search?q=${encodeURIComponent(roleDebouncedQuery)}&cache_only=false`,
            { headers } as never
          );
          if (active) {
            const resolvedNames = resolveResults.map(r => r.name);
            console.log(`[RoleSearch] LLM resolved names for "${roleDebouncedQuery}":`, resolvedNames);
            setApiRoles(resolvedNames);
            setIsSearchingRoles(false);
          }
        }
      } catch (err: any) {
        if (active) {
          console.error("Failed to fetch roles from API", err);
          setIsSearchingRoles(false);
        }
      }
    };

    fetchRoles();
    return () => {
      active = false;
    };
  }, [roleDebouncedQuery]); // eslint-disable-line react-hooks/exhaustive-deps

  // Fetch recommended companies when resume selection changes
  useEffect(() => {
    if (!selectedResumeId) {
      setRecommendedCompanies([]);
      return;
    }
    let active = true;
    const fetchRecommendations = async () => {
      setIsLoadingRecommendations(true);
      try {
        const useMock = process.env.NEXT_PUBLIC_USE_MOCK === "true";
        const API_BASE = useMock ? "/api/interview/mock" : "/api/interview";
        const token = await getToken();
        const headers = token ? { Authorization: `Bearer ${token}` } : {};

        const data = await apiClient.get<Company[]>(
          `${API_BASE}/companies/recommend?resume_id=${selectedResumeId}`,
          { headers } as never
        );
        if (active) {
          setRecommendedCompanies(data);
        }
      } catch (err: any) {
        if (err?.name === "AbortError" || err?.name === "TimeoutError") {
          console.warn("Recommended companies fetch was aborted or timed out:", err.message);
          return;
        }
        console.error("Failed to fetch recommended companies from API", err);
      } finally {
        if (active) {
          setIsLoadingRecommendations(false);
        }
      }
    };

    fetchRecommendations();
    return () => {
      active = false;
    };
  }, [selectedResumeId]); // eslint-disable-line react-hooks/exhaustive-deps

  // Compute filtered companies list for dropdown display
  const filteredCompanies = useMemo(() => {
    if (!searchQuery.trim()) {
      return companiesData.slice(0, 15);
    }
    if (apiCompanies.length > 0) {
      return apiCompanies.map(c => ({
        ...c,
        name: c.name && typeof c.name === "string" ? c.name.trim() : c.name
      }));
    }
    const query = searchQuery.toLowerCase();
    return companiesData
      .map(c => ({ ...c, name: c.name.trim() }))
      .filter((c) => c.name.toLowerCase().includes(query) || c.industry.toLowerCase().includes(query))
      .slice(0, 15);
  }, [searchQuery, apiCompanies]);

  const handleFileChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      if (!e.target.files || e.target.files.length === 0) return;
      const files = Array.from(e.target.files);
      startUpload(files);
    },
    [startUpload]
  );

  const handleStartInterview = async () => {
    // Guard: prevent duplicate submissions
    if (submitInFlightRef.current) return;
    if (!selectedResumeId) {
      setError("Please select a resume before starting.");
      return;
    }

    submitInFlightRef.current = true;
    setIsSubmitting(true);
    setError(null);

    // Reset previous interview state
    resetSession();

    // Safety timeout release: clear submission lock after 15s in case of unexpected network hang
    const safetyTimeout = setTimeout(() => {
      if (submitInFlightRef.current) {
        console.warn("Safety timeout release triggered for start interview submission");
        submitInFlightRef.current = false;
        setIsSubmitting(false);
      }
    }, 15000);

    try {
      const token = await getToken();
      if (!token) throw new Error("Not authenticated");

      const experienceLevel = selectedResume?.experience_level || "Mid-level";
      const targetCompanyName = selectedCompany?.name || "Google"; // fallback default

      const useMock = process.env.NEXT_PUBLIC_USE_MOCK === "true";
      const API_BASE = useMock ? "/api/interview/mock" : "/api/interview";

      // 1. Create Setup Profile on backend
      const profileData = await apiClient.post<InterviewProfile>(
        "/api/interview/setup",
        {
          resume_id: selectedResumeId,
          target_company: targetCompanyName,
          interview_type: selectedInterviewType === "system_design" ? "system design" : selectedInterviewType,
          experience_level: experienceLevel,
          role: targetRole,
          job_type: localJobType,
        },
        {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        } as never
      );

      // 2. Start practice session on backend
      const startData = await apiClient.post<{
        session_id: number;
        question: string;
        question_source: string;
      }>(
        `${API_BASE}/start`,
        {
          interview_profile_id: profileData.id,
          target_company: profileData.target_company,
          interview_type: profileData.interview_type,
        },
        {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        } as never
      );

      // 3. Populate global Interview Store variables
      const resolvedStoreType = selectedInterviewType === "coding" ? "coding" : "behavioral";
      setInterviewType(resolvedStoreType);
      setTargetCompany(profileData.target_company);
      setExperienceLevel(profileData.experience_level);
      setRole(profileData.role || targetRole),
      setJobType(profileData.job_type || "full time job");
      setCurrentQuestion(startData.question);
      setQuestionSource(startData.question_source || "fallback");
      if (selectedResume) {
        setResumeData(selectedResume, selectedResume.ats_score || 75);
      }
      setActiveSessionId(startData.session_id);

      // Close Wizard
      onClose();

      // Redirect user directly to coding page if coding interview, otherwise preflight
      if (selectedInterviewType === "coding") {
        window.location.href = "/interview/coding";
      } else {
        window.location.href = "/interview/preflight";
      }
    } catch (err: unknown) {
      if (err instanceof ApiError) {
        // Structured error from backend
        const detail =
          err.body && typeof err.body === "object" && "detail" in err.body
            ? String((err.body as { detail: unknown }).detail)
            : null;
        setError(detail || `Server error (${err.status}): ${err.statusText}`);
      } else if (err instanceof Error) {
        setError(err.message);
      } else {
        setError("Failed to establish mock interview loop.");
      }
    } finally {
      clearTimeout(safetyTimeout);
      setIsSubmitting(false);
      submitInFlightRef.current = false;
    }
  };

  if (!isOpen) return null;

  const steps = [
    { num: 1, label: "Resume" },
    { num: 2, label: "Practicing" },
    { num: 3, label: "Company" },
    { num: 4, label: "Ready" }
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-xl transition-all duration-300">
      <div className="bg-card/80 w-full max-w-xl rounded-3xl border border-border backdrop-blur-2xl relative flex flex-col p-6 animate-in zoom-in-95 duration-200">

        {/* Close Button */}
        <button
          onClick={onClose}
          className="absolute right-4 top-4 p-1.5 rounded-xl text-muted-foreground hover:text-foreground hover:bg-muted/80 transition-colors cursor-pointer"
        >
          <X className="h-5 w-5" />
        </button>

        {/* Wizard Header Progress Indicator */}
        <div className="flex justify-between items-center mb-6 border-b border-border/60 pb-4 pr-6">
          {steps.map((s) => (
            <div key={s.num} className="flex items-center gap-2">
              <div className={`h-6 w-6 rounded-full flex items-center justify-center text-xs font-bold transition-all ${currentStep === s.num
                ? "bg-primary text-primary-foreground ring-1 ring-primary/10"
                : currentStep > s.num
                  ? "bg-primary/20 text-primary"
                  : "bg-muted text-muted-foreground"
                }`}>
                {s.num}
              </div>
              <span className={`text-xs font-semibold ${currentStep === s.num ? "text-foreground font-bold" : "text-muted-foreground"
                }`}>
                {s.label}
              </span>
              {s.num < 4 && <div className="h-px w-4 bg-border/60" />}
            </div>
          ))}
        </div>

        {/* Step Content Render Area */}
        <div className="flex-1 min-h-[300px] flex flex-col justify-between">

          {/* STEP 1: RESUME SELECTION */}
          {currentStep === 1 && (
            <div className="space-y-5">
              <div>
                <h2 className="text-xl font-bold text-foreground">Choose Your Resume</h2>
                <p className="text-xs text-muted-foreground mt-1">
                  Select a parsed resume to construct questions focused on your background and projects.
                </p>
              </div>

              <div className="flex flex-col sm:flex-row gap-3 items-stretch sm:items-center">
                <select
                  value={selectedResumeId ?? ""}
                  onChange={(e) => {
                    const val = e.target.value ? Number(e.target.value) : null;
                    setSelectedResumeId(val);
                  }}
                  className="flex-1 text-sm rounded-xl border border-border p-3 bg-muted/10 text-foreground outline-none focus:ring-1 focus:ring-primary focus:border-primary"
                >
                  <option value="">Select an analyzed resume...</option>
                  {analyzedResumes.map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.file_name} (ATS Score: {r.ats_score || "N/A"})
                    </option>
                  ))}
                </select>

                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={isUploading}
                  className="cursor-pointer bg-primary text-primary-foreground hover:bg-primary/95 disabled:opacity-50 text-xs font-semibold py-3 px-4 rounded-xl transition-all whitespace-nowrap flex items-center justify-center gap-1.5"
                >
                  {isUploading ? (
                    <>
                      <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                      Uploading...
                    </>
                  ) : (
                    <>
                      <Upload className="h-3.5 w-3.5" />
                      Upload New
                    </>
                  )}
                </button>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
                  className="hidden"
                  onChange={handleFileChange}
                  disabled={isUploading}
                />
              </div>

              {uploadErrorMessage && (
                <div className="p-3 bg-destructive/10 border border-destructive/20 text-destructive text-xs rounded-xl flex items-center gap-1.5 font-medium">
                  <AlertCircle className="h-4 w-4 shrink-0" />
                  {uploadErrorMessage}
                </div>
              )}

              {uploadSuccessMessage && (
                <div className="p-3 bg-emerald-500/10 border border-emerald-500/20 text-emerald-600 text-xs rounded-xl flex items-center gap-1.5 font-medium">
                  <CheckCircle2 className="h-4 w-4 shrink-0" />
                  {uploadSuccessMessage}
                </div>
              )}

              {/* Parsed resume metadata details */}
              {selectedResume ? (
                <div className="p-4 bg-muted/20 rounded-2xl border border-border space-y-4 animate-in fade-in duration-200">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-primary">
                      Extracted Resume Analysis
                    </span>
                    <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-primary/10 text-primary border border-primary/20 capitalize">
                      {selectedResume.experience_level || "Mid-level"} Experience
                    </span>
                  </div>

                  <div className="space-y-1.5">
                    <span className="text-xs font-semibold text-muted-foreground block">Extracted Technical Skills:</span>
                    <div className="flex flex-wrap gap-1.5">
                      {selectedResume.technical_skills && selectedResume.technical_skills.length > 0 ? (
                        selectedResume.technical_skills.slice(0, 12).map((skill) => (
                          <span
                            key={skill}
                            className="px-2 py-0.5 bg-background border border-border text-foreground rounded text-[10px] font-medium"
                          >
                            {skill}
                          </span>
                        ))
                      ) : (
                        <span className="text-xs text-muted-foreground italic">No skills parsed from document.</span>
                      )}
                      {selectedResume.technical_skills && selectedResume.technical_skills.length > 12 && (
                        <span className="text-[10px] text-muted-foreground italic font-medium self-center">
                          +{selectedResume.technical_skills.length - 12} more
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              ) : (
                <div className="p-8 border border-dashed border-border rounded-2xl flex flex-col items-center justify-center text-center">
                  <Upload className="h-8 w-8 text-muted-foreground mb-2" />
                  <span className="text-xs text-muted-foreground">Select or upload a resume to unlock the next steps.</span>
                </div>
              )}

              {/* Navigation */}
              <div className="flex justify-end pt-4 border-t border-border mt-auto">
                <button
                  type="button"
                  disabled={!selectedResumeId}
                  onClick={() => setCurrentStep(2)}
                  className="cursor-pointer bg-primary text-primary-foreground hover:bg-primary/95 disabled:opacity-50 font-semibold text-sm py-2.5 px-6 rounded-xl transition-all flex items-center gap-1.5"
                >
                  Next Step
                  <ChevronRight className="h-4 w-4" />
                </button>
              </div>
            </div>
          )}

          {/* STEP 2: INTERVIEW TYPE */}
          {currentStep === 2 && (
            <div className="space-y-5">
              <div>
                <h2 className="text-xl font-bold text-foreground">What are you practicing?</h2>
                <p className="text-xs text-muted-foreground mt-1">
                  Choose a practice format matching your target evaluation style.
                </p>
              </div>

              <div className="space-y-3">
                {[
                  {
                    id: "coding",
                    title: "Coding & Algorithms",
                    desc: "Solve algorithmic programming exercises, write visual functions, and debug compilations in a code editor."
                  },
                  {
                    id: "system_design",
                    title: "System Design",
                    desc: "Voice-driven dialogue designing distributed architectures, replication patterns, microservices, and databases."
                  },
                  {
                    id: "behavioral",
                    title: "Behavioral & Leadership",
                    desc: "Conversational simulation measuring leadership principles, STAR formatting, project delivery, and conflict resolution."
                  }
                ].map((opt) => (
                  <label
                    key={opt.id}
                    className={`block p-4 rounded-xl border cursor-pointer transition-all ${selectedInterviewType === opt.id
                      ? "bg-primary/10 border-primary shadow-sm"
                      : "bg-background border-border hover:border-primary/50"
                      }`}
                  >
                    <div className="flex items-start gap-3">
                      <input
                        type="radio"
                        name="interviewType"
                        value={opt.id}
                        checked={selectedInterviewType === opt.id}
                        onChange={() => setSelectedInterviewType(opt.id as any)}
                        className="mt-1 accent-primary cursor-pointer"
                      />
                      <div className="space-y-0.5">
                        <span className="text-sm font-bold text-foreground block">{opt.title}</span>
                        <span className="text-xs text-muted-foreground block leading-relaxed">{opt.desc}</span>
                      </div>
                    </div>
                  </label>
                ))}
              </div>

              {/* Navigation */}
              <div className="flex justify-between pt-4 border-t border-border mt-auto">
                <button
                  type="button"
                  onClick={() => setCurrentStep(1)}
                  className="cursor-pointer bg-muted hover:bg-muted/80 text-foreground border border-border font-semibold text-sm py-2.5 px-5 rounded-xl transition-all flex items-center gap-1.5"
                >
                  <ChevronLeft className="h-4 w-4" />
                  Back
                </button>
                <button
                  type="button"
                  onClick={() => setCurrentStep(3)}
                  className="cursor-pointer bg-primary text-primary-foreground hover:bg-primary/95 font-semibold text-sm py-2.5 px-6 rounded-lg shadow-sm transition-all flex items-center gap-1.5"
                >
                  Next Step
                  <ChevronRight className="h-4 w-4" />
                </button>
              </div>
            </div>
          )}

          {/* STEP 3: TARGET COMPANY */}
          {currentStep === 3 && (
            <div className="space-y-5" ref={dropdownRef}>
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-xl font-bold text-foreground">Target Company</h2>
                  <p className="text-xs text-muted-foreground mt-1">
                    Select a target workspace to adapt interview questions to that specific company's standard loop.
                  </p>
                </div>
                {isSearching && (
                  <span className="text-[10px] text-primary animate-pulse flex items-center gap-1 font-medium bg-primary/10 px-2 py-0.5 rounded-full border border-primary/20">
                    <RefreshCw className="h-2.5 w-2.5 animate-spin" />
                    Searching...
                  </span>
                )}
              </div>

              <div className="relative">
                <input
                  type="text"
                  placeholder="Search 500+ tech companies (e.g. Stripe, OpenAI)..."
                  value={searchQuery}
                  onFocus={() => setIsDropdownOpen(true)}
                  onChange={(e) => {
                    setSearchQuery(e.target.value);
                    setIsDropdownOpen(true);
                    setHighlightedIndex(-1);
                  }}
                  onKeyDown={(e) => {
                    if (e.key === "ArrowDown") {
                      e.preventDefault();
                      setIsDropdownOpen(true);
                      setHighlightedIndex((prev) => Math.min(filteredCompanies.length - 1, prev + 1));
                    } else if (e.key === "ArrowUp") {
                      e.preventDefault();
                      setHighlightedIndex((prev) => Math.max(0, prev - 1));
                    } else if (e.key === "Enter") {
                      if (isDropdownOpen && highlightedIndex >= 0 && highlightedIndex < filteredCompanies.length) {
                        e.preventDefault();
                        const selected = filteredCompanies[highlightedIndex];
                        setSelectedCompany(selected);
                        setSearchQuery(selected.name);
                        setIsDropdownOpen(false);
                      }
                    } else if (e.key === "Escape") {
                      setIsDropdownOpen(false);
                    }
                  }}
                  className="w-full text-sm rounded-xl border border-border p-3 bg-muted/10 text-foreground outline-none focus:ring-1 focus:ring-primary focus:border-primary"
                />

                {searchQuery && (
                  <button
                    type="button"
                    onClick={() => {
                      setSearchQuery("");
                      setSelectedCompany(null);
                    }}
                    className="absolute right-3 top-3.5 text-xs text-muted-foreground hover:text-foreground cursor-pointer font-bold"
                  >
                    Clear
                  </button>
                )}

                {isDropdownOpen && filteredCompanies.length > 0 && (
                  <div className="absolute z-50 w-full mt-1.5 max-h-60 overflow-y-auto bg-card/90 border border-border rounded-xl shadow-md backdrop-blur-xl scrollbar-thin">
                    {filteredCompanies.map((company, index) => (
                      <div
                        key={company.name}
                        onClick={() => {
                          setSelectedCompany(company);
                          setSearchQuery(company.name);
                          setIsDropdownOpen(false);
                        }}
                        onMouseEnter={() => setHighlightedIndex(index)}
                        className={`p-3 text-sm cursor-pointer transition-all flex items-center justify-between border-b border-border/50 last:border-0 ${highlightedIndex === index
                          ? "bg-primary/10 text-foreground font-semibold"
                          : "text-muted-foreground"
                          }`}
                      >
                        <div className="flex flex-col">
                          <span className="font-semibold text-foreground text-xs">{company.name}</span>
                          <span className="text-[10px] text-muted-foreground mt-0.5">{company.industry} • {company.interview_style}</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="text-[10px] text-muted-foreground italic font-medium">{company.avg_questions} Questions</span>
                          <span className={`px-2 py-0.5 rounded text-[9px] font-bold ${company.hiring_intensity === "High"
                            ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20"
                            : company.hiring_intensity === "Medium"
                              ? "bg-amber-500/10 text-amber-400 border border-amber-500/20"
                              : "bg-blue-500/10 text-blue-400 border border-blue-500/20"
                            }`}>
                            {company.hiring_intensity}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* AI Recommendations Tags */}
              {selectedResumeId && (isLoadingRecommendations || recommendedCompanies.length > 0) && (
                <div className="py-1 animate-fade-in space-y-1.5">
                  <div className="flex items-center gap-1">
                    <span className="text-[10px] font-bold text-primary uppercase tracking-wider block">
                      AI Suggestions based on Resume
                    </span>
                    <Sparkles className="h-3 w-3 text-amber-500 animate-pulse" />
                  </div>
                  {isLoadingRecommendations ? (
                    <div className="flex items-center gap-1.5 text-xs text-muted-foreground italic">
                      <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                      Loading AI matching candidates...
                    </div>
                  ) : (
                    <div className="flex flex-wrap gap-1.5">
                      {recommendedCompanies.map((c) => (
                        <button
                          key={c.name}
                          type="button"
                          onClick={() => {
                            setSelectedCompany(c);
                            setSearchQuery(c.name);
                            setIsDropdownOpen(false);
                          }}
                          className="px-2.5 py-1 bg-primary/10 border border-primary/20 text-primary hover:bg-primary hover:text-primary-foreground rounded-xl text-xs font-semibold transition-all cursor-pointer flex items-center gap-1"
                        >
                          {c.name}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* Selected company match profile */}
              {selectedCompany && (
                <div className="p-4 bg-primary/5 border border-primary/20 rounded-2xl space-y-3 animate-in fade-in duration-200">
                  <div className="flex items-center gap-1.5">
                    <Briefcase className="h-4 w-4 text-primary" />
                    <span className="text-xs font-bold text-foreground uppercase tracking-wider block">
                      Target Workspace Profile
                    </span>
                  </div>
                  <div className="grid grid-cols-2 gap-4 text-xs">
                    <div>
                      <span className="text-muted-foreground block text-[10px]">Industry Vertical</span>
                      <span className="font-bold text-foreground text-xs">{selectedCompany.industry}</span>
                    </div>
                    <div>
                      <span className="text-muted-foreground block text-[10px]">Hiring intensity</span>
                      <span className="font-bold text-foreground text-xs">{selectedCompany.hiring_intensity}</span>
                    </div>
                    <div>
                      <span className="text-muted-foreground block text-[10px]">Interview style</span>
                      <span className="font-bold text-foreground text-xs">{selectedCompany.interview_style}</span>
                    </div>
                    <div>
                      <span className="text-muted-foreground block text-[10px]">Average Questions</span>
                      <span className="font-bold text-foreground text-xs">{selectedCompany.avg_questions} questions</span>
                    </div>
                  </div>
                </div>
              )}

              {/* Role selection & Job Type fields */}
              {selectedCompany && (
                <div className="space-y-4 animate-in fade-in duration-200">
                  <div className="space-y-1.5" ref={roleDropdownRef}>
                    <div className="flex items-center justify-between">
                      <label className="text-xs font-bold text-foreground block">
                        Search Your Target Role
                      </label>
                      {isSearchingRoles && (
                        <span className="text-[10px] text-primary animate-pulse flex items-center gap-1 font-medium bg-primary/10 px-2 py-0.5 rounded-full border border-primary/20">
                          <RefreshCw className="h-2.5 w-2.5 animate-spin" />
                          Searching...
                        </span>
                      )}
                    </div>

                    <div className="relative">
                      <input
                        type="text"
                        placeholder={`Search roles at ${selectedCompany.name} (e.g. Software Engineer)...`}
                        value={roleSearchQuery}
                        onFocus={() => setIsRoleDropdownOpen(true)}
                        onChange={(e) => {
                          setRoleSearchQuery(e.target.value);
                          setTargetRole(e.target.value);
                          setIsRoleDropdownOpen(true);
                          setRoleHighlightedIndex(-1);
                        }}
onKeyDown={(e) => {
                            if (e.key === "ArrowDown") {
                              e.preventDefault();
                              setIsRoleDropdownOpen(true);
                              setRoleHighlightedIndex((prev) => Math.min(filteredRoles.length - 1, prev + 1));
                            } else if (e.key === "ArrowUp") {
                              e.preventDefault();
                              setRoleHighlightedIndex((prev) => Math.max(0, prev - 1));
                            } else if (e.key === "Enter") {
                              if (isRoleDropdownOpen && roleHighlightedIndex >= 0 && roleHighlightedIndex < filteredRoles.length) {
                                e.preventDefault();
                                const selectedBase = filteredRoles[roleHighlightedIndex];
                                const formatted = formatRoleName(selectedBase, localJobType);
                                setTargetRole(formatted);
                                setRoleSearchQuery(formatted);
                                setIsRoleDropdownOpen(false);
                              } else {
                                // Accept free-text entry on Enter when no dropdown selection
                                const formatted = formatRoleName(roleSearchQuery, localJobType);
                                setTargetRole(formatted);
                                setIsRoleDropdownOpen(false);
                              }
                            } else if (e.key === "Escape") {
                              setIsRoleDropdownOpen(false);
                            }
                          }}
                          onBlur={() => {
                            // Accept free-text entry when user leaves the field
                            if (roleSearchQuery && !isRoleDropdownOpen) {
                              const formatted = formatRoleName(roleSearchQuery, localJobType);
                              setTargetRole(formatted);
                            }
                          }}
                        className="w-full text-sm rounded-xl border border-border p-3 bg-muted/10 text-foreground outline-none focus:ring-1 focus:ring-primary focus:border-primary"
                      />

                      {roleSearchQuery && (
                        <button
                          type="button"
                          onClick={() => {
                            setRoleSearchQuery("");
                            setTargetRole("");
                            setApiRoles([]);
                          }}
                          className="absolute right-3 top-3.5 text-xs text-muted-foreground hover:text-foreground cursor-pointer font-bold"
                        >
                          Clear
                        </button>
                      )}

                      {isRoleDropdownOpen && filteredRoles.length > 0 && (
                        <div className="absolute z-50 w-full mt-1.5 max-h-48 overflow-y-auto bg-card/90 border border-border rounded-xl shadow-md backdrop-blur-xl scrollbar-thin">
                          {filteredRoles.map((roleName, index) => {
                            const formattedName = formatRoleName(roleName, localJobType);
                            const isRecommended = recommendedRoles.includes(roleName);
                            const isSelected = targetRole === formattedName;
                            return (
                              <div
                                key={roleName}
                                onClick={() => {
                                  setTargetRole(formattedName);
                                  setRoleSearchQuery(formattedName);
                                  setIsRoleDropdownOpen(false);
                                }}
                                onMouseEnter={() => setRoleHighlightedIndex(index)}
                                className={`p-3 text-sm cursor-pointer transition-all flex items-center justify-between border-b border-border/50 last:border-0 ${roleHighlightedIndex === index || isSelected
                                  ? "bg-primary/10 text-foreground font-semibold"
                                  : "text-muted-foreground"
                                  }`}
                              >
                                <span className="font-semibold text-xs">{formattedName}</span>
                                {isRecommended && (
                                  <span className="shrink-0 flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[8px] font-extrabold bg-amber-500/10 text-amber-500 border border-amber-500/20 uppercase tracking-wider animate-pulse">
                                    <Sparkles className="h-2 w-2" />
                                    AI Rec
                                  </span>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-xs font-bold text-foreground block">Job Type</label>
                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={() => setLocalJobType("full time job")}
                        className={`flex-grow py-2 text-xs font-semibold rounded-xl border transition-all cursor-pointer ${localJobType === "full time job"
                          ? "bg-primary text-primary-foreground border-primary"
                          : "bg-background text-muted-foreground border-border hover:border-primary/50"
                          }`}
                      >
                        Full-Time
                      </button>
                      <button
                        type="button"
                        onClick={() => setLocalJobType("intern")}
                        className={`flex-grow py-2 text-xs font-semibold rounded-xl border transition-all cursor-pointer ${localJobType === "intern"
                          ? "bg-primary text-primary-foreground border-primary"
                          : "bg-background text-muted-foreground border-border hover:border-primary/50"
                          }`}
                      >
                        Internship
                      </button>
                    </div>
                  </div>

                  {roleValidationError && (
                    <div className="p-3 bg-destructive/10 border border-destructive/20 text-destructive text-xs rounded-xl flex items-center gap-1.5 font-medium animate-in slide-in-from-top-2">
                      <AlertCircle className="h-4 w-4 shrink-0" />
                      {roleValidationError}
                    </div>
                  )}
                </div>
              )}

              {/* Navigation */}
              <div className="flex justify-between pt-4 border-t border-border mt-auto">
                <button
                  type="button"
                  disabled={isSubmitting}
                  onClick={() => setCurrentStep(2)}
                  className="cursor-pointer bg-muted hover:bg-muted/80 text-foreground border border-border font-semibold text-sm py-2.5 px-5 rounded-xl transition-all flex items-center gap-1.5 disabled:opacity-50"
                >
                  <ChevronLeft className="h-4 w-4" />
                  Back
                </button>
                <div className="flex gap-2">
                  <button
                    type="button"
                    disabled={isSubmitting}
                    onClick={() => {
                      setSelectedCompany(null);
                      setSearchQuery("");
                      setRoleValidationError(null);
                      if (selectedInterviewType === "coding") {
                        handleStartInterview();
                      } else {
                        setCurrentStep(4);
                      }
                    }}
                    className="cursor-pointer bg-muted hover:bg-muted/80 text-foreground border border-border font-semibold text-sm py-2.5 px-5 rounded-xl transition-all disabled:opacity-50"
                  >
                    Skip this
                  </button>
                  <button
                    type="button"
                    disabled={isLoadingRoles || isSubmitting}
                    onClick={() => {
                      if (selectedCompany && !targetRole) {
                        setRoleValidationError("Please enter a target role to proceed.");
                        return;
                      }
                      if (selectedInterviewType === "coding") {
                        handleStartInterview();
                      } else {
                        setCurrentStep(4);
                      }
                    }}
                    className="cursor-pointer bg-primary text-primary-foreground hover:bg-primary/95 disabled:opacity-50 font-semibold text-sm py-2.5 px-6 rounded-xl transition-all flex items-center gap-1.5 justify-center min-w-[140px]"
                  >
                    {selectedInterviewType === "coding" ? (
                      isSubmitting ? (
                        <>
                          <RefreshCw className="h-4 w-4 animate-spin" />
                          Initializing...
                        </>
                      ) : (
                        <>
                          <Play className="h-4 w-4 fill-current" />
                          Start Interview
                        </>
                      )
                    ) : (
                      <>
                        Next Step
                        <ChevronRight className="h-4 w-4" />
                      </>
                    )}
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* STEP 4: CONFIRMATION */}
          {currentStep === 4 && (
            <div className="space-y-5">
              <div>
                <h2 className="text-xl font-bold text-foreground">Ready to practice?</h2>
                <p className="text-xs text-muted-foreground mt-1">
                  Verify your settings below. Your session will initialize instantly.
                </p>
              </div>

              <div className="p-5 bg-muted/20 border border-border rounded-2xl space-y-4">
                <div className="flex items-center gap-1.5 border-b border-border/50 pb-2">
                  <Layers className="h-4 w-4 text-primary" />
                  <span className="text-xs font-bold text-primary uppercase tracking-wider block">
                    Session Blueprint
                  </span>
                </div>

                <div className="space-y-3">
                  <div className="flex justify-between border-b border-border/30 pb-2 text-xs">
                    <span className="font-semibold text-muted-foreground">Active Resume</span>
                    <span className="font-bold text-foreground truncate max-w-[240px]">
                      {selectedResume?.file_name || "Linked Resume"}
                    </span>
                  </div>
                  <div className="flex justify-between border-b border-border/30 pb-2 text-xs">
                    <span className="font-semibold text-muted-foreground">Practicing Loop</span>
                    <span className="font-bold text-foreground capitalize">
                      {selectedInterviewType === "coding" ? "Coding & Algorithms" :
                        selectedInterviewType === "system_design" ? "System Design" : "Behavioral"}
                    </span>
                  </div>
                  <div className="flex justify-between border-b border-border/30 pb-2 text-xs">
                    <span className="font-semibold text-muted-foreground">Target Workspace</span>
                    <span className="font-bold text-foreground">
                      {selectedCompany?.name || "Random / Default"}
                    </span>
                  </div>
                  {selectedCompany && (
                    <>
                      <div className="flex justify-between border-b border-border/30 pb-2 text-xs">
                        <span className="font-semibold text-muted-foreground">Target Role</span>
                        <span className="font-bold text-foreground capitalize">
                          {targetRole}
                        </span>
                      </div>
                      <div className="flex justify-between text-xs">
                        <span className="font-semibold text-muted-foreground">Job Type</span>
                        <span className="font-bold text-foreground capitalize">
                          {localJobType === "intern" ? "Internship" : "Full-Time"}
                        </span>
                      </div>
                    </>
                  )}
                </div>
              </div>

              {error && (
                <div className="p-3.5 bg-destructive/10 border border-destructive/20 text-destructive text-xs font-medium rounded-xl flex items-center gap-1.5">
                  <AlertCircle className="h-4 w-4 shrink-0" />
                  {error}
                </div>
              )}

              {/* Navigation */}
              <div className="flex justify-between pt-4 border-t border-border mt-auto">
                <button
                  type="button"
                  disabled={isSubmitting}
                  onClick={() => setCurrentStep(3)}
                  className="cursor-pointer bg-muted hover:bg-muted/80 text-foreground border border-border font-semibold text-sm py-2.5 px-5 rounded-xl transition-all flex items-center gap-1.5"
                >
                  <ChevronLeft className="h-4 w-4" />
                  Back
                </button>
                <button
                  type="button"
                  onClick={handleStartInterview}
                  disabled={isSubmitting}
                  className="cursor-pointer bg-primary hover:bg-primary/95 text-primary-foreground font-bold text-sm py-3 px-8 rounded-xl transition-all flex items-center justify-center gap-2"
                >
                  {isSubmitting ? (
                    <>
                      <RefreshCw className="h-4 w-4 animate-spin" />
                      Initializing...
                    </>
                  ) : (
                    <>
                      <Play className="h-4 w-4 fill-current" />
                      Start Interview
                    </>
                  )}
                </button>
              </div>
            </div>
          )}

        </div>

      </div>
    </div>
  );
}
