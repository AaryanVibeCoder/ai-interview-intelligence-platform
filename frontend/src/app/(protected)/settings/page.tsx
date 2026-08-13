"use client";

import React, { useState, useEffect, useRef } from "react";
import { useAuth, useUser } from "@clerk/nextjs";
import { useTheme } from "next-themes";
import { 
  User, 
  Briefcase, 
  RefreshCw, 
  CheckCircle, 
  Sliders,
  Send,
  MessageSquare,
  Moon,
  Sun,
  Laptop,
  Bell,
  HelpCircle,
  Sparkles
} from "lucide-react";
import { useInterviewStore } from "@/store/interview-store";
import { apiConfig } from "@/services/api/config";

interface ResumeItem {
  id: number;
  file_name: string;
  ats_score: number | null;
}

export default function SettingsPage() {
  const { getToken } = useAuth();
  const { user } = useUser();
  const store = useInterviewStore();
  const { theme, setTheme } = useTheme();

  const baseUrl = apiConfig.baseUrl;

  // Mounted and theme calculation
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    setMounted(true);
  }, []);

  const isDark = mounted && (theme === "dark" || (theme === "system" && typeof window !== "undefined" && window.matchMedia("(prefers-color-scheme: dark)").matches));
  
  const optionStyle = {
    backgroundColor: isDark ? "#1e293b" : "#ffffff",
    color: isDark ? "#f8fafc" : "#0f172a",
  };

  // Form states
  const [targetCompany, setTargetCompany] = useState("");
  const [role, setRole] = useState("");
  const [experienceLevel, setExperienceLevel] = useState("Mid-level");
  const [jobType, setJobType] = useState("full time job");
  const [selectedResumeId, setSelectedResumeId] = useState<number | null>(null);

  // Dynamic Company Search
  const [companySearchQuery, setCompanySearchQuery] = useState("");
  const [apiCompanies, setApiCompanies] = useState<any[]>([]);
  const [isCompanySearching, setIsCompanySearching] = useState(false);
  const [isCompanyDropdownOpen, setIsCompanyDropdownOpen] = useState(false);
  const companyDropdownRef = useRef<HTMLDivElement>(null);

  // Dynamic Role Search
  const [roleSearchQuery, setRoleSearchQuery] = useState("");
  const [apiRoles, setApiRoles] = useState<string[]>([]);
  const [isRoleSearching, setIsRoleSearching] = useState(false);
  const [isRoleDropdownOpen, setIsRoleDropdownOpen] = useState(false);
  const roleDropdownRef = useRef<HTMLDivElement>(null);

  // Lists
  const [resumes, setResumes] = useState<ResumeItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saveStatus, setSaveStatus] = useState<"idle" | "success" | "error">("idle");

  // Preferences
  const [emailNotifications, setEmailNotifications] = useState(true);
  const [soundEffects, setSoundEffects] = useState(true);

  // Customer Support Form states
  const [supportCategory, setSupportCategory] = useState("Bug Report");
  const [supportMessage, setSupportMessage] = useState("");
  const [submittingSupport, setSubmittingSupport] = useState(false);
  const [supportStatus, setSupportStatus] = useState<"idle" | "success" | "error">("idle");

  // Handle focus scrolling on mount
  useEffect(() => {
    if (typeof window !== "undefined") {
      const params = new URLSearchParams(window.location.search);
      if (params.get("focus") === "support") {
        setTimeout(() => {
          const element = document.getElementById("support-section");
          if (element) {
            element.scrollIntoView({ behavior: "smooth" });
          }
        }, 300);
      }
    }
  }, []);

  // Close dropdowns on outside click
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (companyDropdownRef.current && !companyDropdownRef.current.contains(event.target as Node)) {
        setIsCompanyDropdownOpen(false);
      }
      if (roleDropdownRef.current && !roleDropdownRef.current.contains(event.target as Node)) {
        setIsRoleDropdownOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // Debounced Company Search API Call
  useEffect(() => {
    if (!companySearchQuery.trim() || companySearchQuery === targetCompany) {
      setApiCompanies([]);
      return;
    }
    const handler = setTimeout(async () => {
      setIsCompanySearching(true);
      try {
        const token = await getToken();
        const headers = token ? { Authorization: `Bearer ${token}` } : {};
        const res = await fetch(
          `${baseUrl}/api/interview/companies/search?q=${encodeURIComponent(companySearchQuery)}&cache_only=true`,
          { headers }
        );
        if (res.ok) {
          const data = await res.json();
          if (data.length > 0) {
            setApiCompanies(data);
          } else {
            const res2 = await fetch(
              `${baseUrl}/api/interview/companies/search?q=${encodeURIComponent(companySearchQuery)}&cache_only=false`,
              { headers }
            );
            if (res2.ok) {
              const data2 = await res2.json();
              setApiCompanies(data2);
            }
          }
        }
      } catch (err) {
        console.error("Failed to fetch companies:", err);
      } finally {
        setIsCompanySearching(false);
      }
    }, 300);

    return () => clearTimeout(handler);
  }, [companySearchQuery, targetCompany, getToken, baseUrl]);

  // Debounced Role Search API Call
  useEffect(() => {
    if (!roleSearchQuery.trim() || roleSearchQuery === role) {
      setApiRoles([]);
      return;
    }
    const handler = setTimeout(async () => {
      setIsRoleSearching(true);
      try {
        const token = await getToken();
        const headers = token ? { Authorization: `Bearer ${token}` } : {};
        const res = await fetch(
          `${baseUrl}/api/interview/roles/search?q=${encodeURIComponent(roleSearchQuery)}&cache_only=true`,
          { headers }
        );
        if (res.ok) {
          const data = await res.json();
          const names = data.map((r: any) => r.name);
          if (names.length > 0) {
            setApiRoles(names);
          } else {
            const res2 = await fetch(
              `${baseUrl}/api/interview/roles/search?q=${encodeURIComponent(roleSearchQuery)}&cache_only=false`,
              { headers }
            );
            if (res2.ok) {
              const data2 = await res2.json();
              setApiRoles(data2.map((r: any) => r.name));
            }
          }
        }
      } catch (err) {
        console.error("Failed to fetch roles:", err);
      } finally {
        setIsRoleSearching(false);
      }
    }, 300);

    return () => clearTimeout(handler);
  }, [roleSearchQuery, role, getToken, baseUrl]);

  // Load configuration on mount
  useEffect(() => {
    async function loadSettings() {
      try {
        const token = await getToken();
        const headers: Record<string, string> = {};
        if (token) {
          headers["Authorization"] = `Bearer ${token}`;
        }

        // 1. Fetch Resumes
        const resumeRes = await fetch(`${baseUrl}/resumes`, { headers });
        if (resumeRes.ok) {
          const data = await resumeRes.json();
          setResumes(data.resumes || []);
        }

        // 2. Fetch Interview Setup Profile
        const profileRes = await fetch(`${baseUrl}/api/interview/setup`, { headers });
        if (profileRes.ok) {
          const profile = await profileRes.json();
          setTargetCompany(profile.target_company || "");
          setCompanySearchQuery(profile.target_company || "");
          setRole(profile.role || "");
          setRoleSearchQuery(profile.role || "");
          setExperienceLevel(profile.experience_level || "Mid-level");
          setJobType(profile.job_type || "full time job");
          setSelectedResumeId(profile.resume_id || null);
        }

        // Load local preferences from localStorage
        const emailPref = localStorage.getItem("elevateiq-pref-email");
        if (emailPref !== null) setEmailNotifications(emailPref === "true");

        const soundPref = localStorage.getItem("elevateiq-pref-sound");
        if (soundPref !== null) setSoundEffects(soundPref === "true");

      } catch (err) {
        console.error("Failed to load settings:", err);
      } finally {
        setLoading(false);
      }
    }

    loadSettings();
  }, [getToken, baseUrl]);

  // Save profile settings
  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedResumeId) {
      alert("Please select a target resume first.");
      return;
    }

    setSaving(true);
    setSaveStatus("idle");

    try {
      const token = await getToken();
      const headers: Record<string, string> = {
        "Content-Type": "application/json",
      };
      if (token) {
        headers["Authorization"] = `Bearer ${token}`;
      }

      const response = await fetch(`${baseUrl}/api/interview/setup`, {
        method: "POST",
        headers,
        body: JSON.stringify({
          resume_id: selectedResumeId,
          target_company: targetCompany,
          interview_type: "behavioral",
          experience_level: experienceLevel,
          role,
          job_type: jobType,
        }),
      });

      if (response.ok) {
        // Sync local zustand store values
        store.setTargetCompany(targetCompany);
        store.setRole(role);
        store.setExperienceLevel(experienceLevel);
        store.setJobType(jobType);
        setSaveStatus("success");
      } else {
        setSaveStatus("error");
      }
    } catch (err) {
      console.error(err);
      setSaveStatus("error");
    } finally {
      setSaving(false);
    }
  };

  // Toggle Preferences
  const handleToggleEmail = (val: boolean) => {
    setEmailNotifications(val);
    localStorage.setItem("elevateiq-pref-email", String(val));
  };

  const handleToggleSound = (val: boolean) => {
    setSoundEffects(val);
    localStorage.setItem("elevateiq-pref-sound", String(val));
  };

  // Submit Support Ticket
  const handleSendSupport = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!supportMessage.trim()) return;

    setSubmittingSupport(true);
    setSupportStatus("idle");

    try {
      const token = await getToken();
      const headers: Record<string, string> = {
        "Content-Type": "application/json",
      };
      if (token) {
        headers["Authorization"] = `Bearer ${token}`;
      }

      const response = await fetch(`${baseUrl}/api/interview/support`, {
        method: "POST",
        headers,
        body: JSON.stringify({
          category: supportCategory,
          message: supportMessage,
        }),
      });

      if (response.ok) {
        setSupportStatus("success");
        setSupportMessage("");
      } else {
        setSupportStatus("error");
      }
    } catch (err) {
      console.error("Failed to submit support issue:", err);
      setSupportStatus("error");
    } finally {
      setSubmittingSupport(false);
    }
  };

  if (loading) {
    return (
      <div className="flex h-[400px] flex-col items-center justify-center gap-3">
        <RefreshCw className="h-8 w-8 text-primary animate-spin" />
        <p className="text-sm font-medium text-muted-foreground select-none">Loading settings...</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="select-none">
        <h1 className="text-2xl font-medium tracking-tight">Settings</h1>
        <p className="mt-2 text-muted-foreground text-sm">
          Customize your default target profiles, theme configurations, and account preferences.
        </p>
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        {/* Left Side: Target Workspace Profile Settings */}
        <form onSubmit={handleSaveProfile} className="space-y-6">
          <div className="rounded-2xl border border-border bg-card/70 p-6 backdrop-blur-xl space-y-4">
            <h2 className="text-md font-bold text-foreground flex items-center gap-2 select-none">
              <Briefcase className="h-4 w-4 text-primary" />
              Target Interview Profile
            </h2>
            <p className="text-xs text-muted-foreground leading-relaxed select-none">
              Configure the default target role and company parameters matched when initializing practice interviews.
            </p>

            <div className="space-y-4">
              {/* Target Resume Selection */}
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-foreground block select-none">Target Resume</label>
                <select
                  value={selectedResumeId ?? ""}
                  onChange={(e) => setSelectedResumeId(e.target.value ? Number(e.target.value) : null)}
                  className="w-full text-sm rounded-xl border border-border p-3 bg-muted/10 text-foreground outline-none focus:ring-1 focus:ring-primary focus:border-primary cursor-pointer select-none"
                  style={optionStyle}
                >
                  <option value="" style={optionStyle}>Select a default resume...</option>
                  {resumes.map((r) => (
                    <option key={r.id} value={r.id} style={optionStyle}>
                      {r.file_name} (ATS: {r.ats_score || "N/A"})
                    </option>
                  ))}
                </select>
              </div>

              {/* Dynamic Company Search Selection */}
              <div className="space-y-1.5" ref={companyDropdownRef}>
                <div className="flex justify-between items-center select-none">
                  <label className="text-xs font-bold text-foreground block">Target Company</label>
                  {isCompanySearching && (
                    <span className="text-[10px] text-primary animate-pulse flex items-center gap-1">
                      <RefreshCw className="h-2.5 w-2.5 animate-spin" /> Searching...
                    </span>
                  )}
                </div>
                <div className="relative">
                  <input
                    type="text"
                    placeholder="Search company (e.g. Google, Meta)..."
                    value={companySearchQuery}
                    onFocus={() => setIsCompanyDropdownOpen(true)}
                    onChange={(e) => {
                      setCompanySearchQuery(e.target.value);
                      setIsCompanyDropdownOpen(true);
                    }}
                    className="w-full text-sm rounded-xl border border-border p-3 bg-muted/10 text-foreground outline-none focus:ring-1 focus:ring-primary focus:border-primary"
                  />
                  {isCompanyDropdownOpen && apiCompanies.length > 0 && (
                    <div className="absolute z-50 w-full mt-1.5 max-h-48 overflow-y-auto bg-card/90 border border-border rounded-xl shadow-md backdrop-blur-xl scrollbar-thin">
                      {apiCompanies.map((c) => (
                        <div
                          key={c.name}
                          onClick={() => {
                            setTargetCompany(c.name);
                            setCompanySearchQuery(c.name);
                            setIsCompanyDropdownOpen(false);
                          }}
                          className="p-3 text-xs cursor-pointer text-muted-foreground hover:bg-primary/10 hover:text-foreground font-semibold border-b border-border/40 last:border-0"
                        >
                          <div className="flex flex-col">
                            <span className="text-foreground font-bold">{c.name}</span>
                            <span className="text-[9px] text-muted-foreground mt-0.5">{c.industry} • {c.interview_style}</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              {/* Dynamic Role Search Selection */}
              <div className="space-y-1.5" ref={roleDropdownRef}>
                <div className="flex justify-between items-center select-none">
                  <label className="text-xs font-bold text-foreground block">Target Role</label>
                  {isRoleSearching && (
                    <span className="text-[10px] text-primary animate-pulse flex items-center gap-1">
                      <RefreshCw className="h-2.5 w-2.5 animate-spin" /> Searching...
                    </span>
                  )}
                </div>
                <div className="relative">
                  <input
                    type="text"
                    placeholder="Search target role (e.g. Frontend Developer)..."
                    value={roleSearchQuery}
                    onFocus={() => setIsRoleDropdownOpen(true)}
                    onChange={(e) => {
                      setRoleSearchQuery(e.target.value);
                      setIsRoleDropdownOpen(true);
                    }}
                    className="w-full text-sm rounded-xl border border-border p-3 bg-muted/10 text-foreground outline-none focus:ring-1 focus:ring-primary focus:border-primary"
                  />
                  {isRoleDropdownOpen && apiRoles.length > 0 && (
                    <div className="absolute z-50 w-full mt-1.5 max-h-48 overflow-y-auto bg-card/90 border border-border rounded-xl shadow-md backdrop-blur-xl scrollbar-thin">
                      {apiRoles.map((rName) => (
                        <div
                          key={rName}
                          onClick={() => {
                            setRole(rName);
                            setRoleSearchQuery(rName);
                            setIsRoleDropdownOpen(false);
                          }}
                          className="p-3 text-xs cursor-pointer text-muted-foreground hover:bg-primary/10 hover:text-foreground font-semibold border-b border-border/40 last:border-0"
                        >
                          {rName}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                {/* Experience Level */}
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-foreground block select-none">Experience Level</label>
                  <select
                    value={experienceLevel}
                    onChange={(e) => setExperienceLevel(e.target.value)}
                    className="w-full text-sm rounded-xl border border-border p-3 bg-muted/10 text-foreground outline-none focus:ring-1 focus:ring-primary focus:border-primary cursor-pointer select-none"
                    style={optionStyle}
                  >
                    <option value="Junior" style={optionStyle}>Junior</option>
                    <option value="Mid-level" style={optionStyle}>Mid-level</option>
                    <option value="Senior" style={optionStyle}>Senior</option>
                    <option value="Lead" style={optionStyle}>Lead</option>
                  </select>
                </div>

                {/* Job Type */}
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-foreground block select-none">Job Type</label>
                  <select
                    value={jobType}
                    onChange={(e) => setJobType(e.target.value)}
                    className="w-full text-sm rounded-xl border border-border p-3 bg-muted/10 text-foreground outline-none focus:ring-1 focus:ring-primary focus:border-primary cursor-pointer select-none"
                    style={optionStyle}
                  >
                    <option value="full time job" style={optionStyle}>Full-Time</option>
                    <option value="intern" style={optionStyle}>Internship</option>
                  </select>
                </div>
              </div>
            </div>

            <div className="pt-4 border-t border-border/60 flex items-center justify-between">
              <div>
                {saveStatus === "success" && (
                  <span className="text-xs font-semibold text-emerald-500 flex items-center gap-1 animate-in fade-in select-none">
                    <CheckCircle className="h-4 w-4" />
                    Changes saved
                  </span>
                )}
                {saveStatus === "error" && (
                  <span className="text-xs font-semibold text-red-500 select-none">
                    Failed to save changes
                  </span>
                )}
              </div>
              <button
                type="submit"
                disabled={saving}
                className="cursor-pointer bg-primary text-primary-foreground hover:bg-primary/95 text-xs font-bold py-2.5 px-6 rounded-xl transition-all flex items-center justify-center gap-2"
              >
                {saving ? (
                  <>
                    <RefreshCw className="h-3 w-3 animate-spin" />
                    Saving...
                  </>
                ) : (
                  "Save Changes"
                )}
              </button>
            </div>
          </div>
        </form>

        {/* Right Side: Preferences (Theme/Notifications) & Customer Support */}
        <div className="space-y-6">
          {/* Preferences Card */}
          <div className="rounded-2xl border border-border bg-card/70 p-6 backdrop-blur-xl space-y-5">
            <h2 className="text-md font-bold text-foreground flex items-center gap-2 select-none">
              <Sliders className="h-4 w-4 text-primary" />
              Application Preferences
            </h2>

            {/* Theme Selector */}
            <div className="space-y-3">
              <label className="text-xs font-bold text-foreground block select-none">App Appearance</label>
              <div className="grid grid-cols-3 gap-2">
                {[
                  { value: "light", label: "Light", icon: Sun },
                  { value: "dark", label: "Dark", icon: Moon },
                  { value: "system", label: "System", icon: Laptop }
                ].map((t) => {
                  const Icon = t.icon;
                  const isActive = theme === t.value;
                  return (
                    <button
                      key={t.value}
                      type="button"
                      onClick={() => setTheme(t.value)}
                      className={`flex flex-col items-center justify-center p-3 rounded-2xl border text-xs font-semibold gap-1.5 transition-all cursor-pointer select-none ${
                        isActive
                          ? "bg-primary/8 border-primary text-primary font-bold"
                          : "bg-muted/10 border-border text-muted-foreground hover:text-foreground hover:border-primary/50"
                      }`}
                    >
                      <Icon className="h-4 w-4" />
                      {t.label}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Notification Toggles */}
            <div className="space-y-4 pt-2">
              <label className="text-xs font-bold text-foreground block select-none flex items-center gap-1.5">
                <Bell className="h-3.5 w-3.5 text-primary" /> Notifications & Sound
              </label>

              <div className="flex items-center justify-between border-b border-border/50 pb-3">
                <div className="select-none pr-4">
                  <span className="block text-xs font-semibold text-foreground">Email Summaries</span>
                  <span className="block text-[10px] text-muted-foreground mt-0.5">Send a performance metrics review to email after completing interview loops.</span>
                </div>
                <input
                  type="checkbox"
                  checked={emailNotifications}
                  onChange={(e) => handleToggleEmail(e.target.checked)}
                  className="h-4 w-4 cursor-pointer accent-primary shrink-0"
                />
              </div>

              <div className="flex items-center justify-between">
                <div className="select-none pr-4">
                  <span className="block text-xs font-semibold text-foreground">Subtle Sound Effects</span>
                  <span className="block text-[10px] text-muted-foreground mt-0.5">Play dynamic sound highlights during voice recording loops and compile successes.</span>
                </div>
                <input
                  type="checkbox"
                  checked={soundEffects}
                  onChange={(e) => handleToggleSound(e.target.checked)}
                  className="h-4 w-4 cursor-pointer accent-primary shrink-0"
                />
              </div>
            </div>
          </div>

          {/* Customer Support Card */}
          <div id="support-section" className="rounded-2xl border border-border bg-card/70 p-6 backdrop-blur-xl space-y-4 transition-all duration-300">
            <h2 className="text-md font-bold text-foreground flex items-center gap-2 select-none">
              <HelpCircle className="h-4 w-4 text-primary animate-pulse" />
              Customer Support Center
            </h2>
            <p className="text-xs text-muted-foreground leading-relaxed select-none">
              Submit your queries, issues, or platform bugs directly to our help desk. We are here to keep your practice running smoothly.
            </p>

            {supportStatus === "success" ? (
              <div className="p-4 bg-emerald-500/10 border border-emerald-500/20 rounded-2xl text-center space-y-2 animate-in zoom-in-95 duration-200">
                <CheckCircle className="h-8 w-8 text-emerald-500 mx-auto" />
                <p className="text-sm font-bold text-emerald-500 italic select-none">
                  Issue logged successfully. Our support team will address it within 24 hours. Sorry for the inconvenience.
                </p>
                <button
                  type="button"
                  onClick={() => setSupportStatus("idle")}
                  className="text-[10px] font-semibold text-muted-foreground hover:text-foreground cursor-pointer underline select-none block mx-auto pt-1"
                >
                  Submit another issue
                </button>
              </div>
            ) : (
              <form onSubmit={handleSendSupport} className="space-y-4">
                <div className="space-y-1">
                  <label className="text-xs font-bold text-foreground block select-none">Issue Category</label>
                  <select
                    value={supportCategory}
                    onChange={(e) => setSupportCategory(e.target.value)}
                    className="w-full text-xs rounded-xl border border-border p-3 bg-muted/10 text-foreground outline-none focus:ring-1 focus:ring-primary focus:border-primary cursor-pointer select-none"
                    style={optionStyle}
                  >
                    <option value="Bug Report" style={optionStyle}>Bug Report</option>
                    <option value="Billing/Credits" style={optionStyle}>Billing & Credits</option>
                    <option value="Feature Request" style={optionStyle}>Feature Request</option>
                    <option value="Account/Access" style={optionStyle}>Account & Access</option>
                    <option value="Other" style={optionStyle}>Other</option>
                  </select>
                </div>

                <div className="space-y-1">
                  <label className="text-xs font-bold text-foreground block select-none">Describe the Issue</label>
                  <textarea
                    placeholder="Provide details about what went wrong or what you need help with..."
                    value={supportMessage}
                    onChange={(e) => setSupportMessage(e.target.value)}
                    rows={3}
                    required
                    className="w-full text-xs rounded-xl border border-border p-3 bg-muted/10 text-foreground outline-none focus:ring-1 focus:ring-primary focus:border-primary resize-none"
                  />
                </div>
                
                <div className="flex justify-between items-center border-t border-border/60 pt-3">
                  <span className="text-[9px] text-muted-foreground font-semibold italic select-none">
                    Resolution timeline: &lt; 24 hours
                  </span>
                  <button
                    type="submit"
                    disabled={submittingSupport || !supportMessage.trim()}
                    className="cursor-pointer bg-primary text-primary-foreground hover:bg-primary/95 text-xs font-bold py-2 px-4 rounded-xl transition-all flex items-center gap-1.5 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {submittingSupport ? (
                      <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <Send className="h-3.5 w-3.5" />
                    )}
                    Submit Ticket
                  </button>
                </div>
                {supportStatus === "error" && (
                  <p className="text-[10px] text-red-500 font-medium select-none">
                    Failed to submit issue. Please try again later.
                  </p>
                )}
              </form>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
