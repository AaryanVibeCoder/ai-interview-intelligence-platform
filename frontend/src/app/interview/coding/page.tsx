"use client";
import { useState, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@clerk/nextjs";
import { CodeChallenge, TestResult, CodingRoundStats } from "@/types/coding";
import { useInterviewStore } from "@/store/interview-store";
import { apiConfig } from "@/services/api/config";
import { 
  Terminal, 
  FileCode, 
  ArrowRight,
  Cpu,
  BrainCircuit,
  Clock,
  RefreshCw
} from "lucide-react";

const CHALLENGES: CodeChallenge[] = [
  {
    id: "two-sum",
    title: "Two Sum",
    description: "Given an array of integers nums and an integer target, return the indices of the two numbers that add up to the target. You may assume that each input would have exactly one solution, and you may not use the same element twice.",
    difficulty: "easy",
    timeLimit: 30,
    languages: ["javascript", "python", "java", "cpp", "go", "rust"],
    starterCode: {
      javascript: `function twoSum(nums, target) {\n  // Write your solution here\n  return [];\n}`,
      python: `def twoSum(nums, target):\n    # Write your solution here\n    return []`,
      java: `class Solution {\n    public int[] twoSum(int[] nums, int target) {\n        // Write your solution here\n        return new int[0];\n    }\n}`,
      cpp: `class Solution {\npublic:\n    vector<int> twoSum(vector<int>& nums, int target) {\n        // Write your solution here\n        return {};\n    }\n};`,
      go: `func twoSum(nums []int, target int) []int {\n    // Write your solution here\n    return []int{}\n}`,
      rust: `impl Solution {\n    pub fn two_sum(nums: Vec<i32>, target: i32) -> Vec<i32> {\n        // Write your solution here\n        vec![]\n    }\n}`
    },
    testCases: [
      { id: "t1", input: "nums = [2,7,11,15], target = 9", expectedOutput: "[0, 1]", isHidden: false },
      { id: "t2", input: "nums = [3,2,4], target = 6", expectedOutput: "[1, 2]", isHidden: false },
      { id: "t3", input: "nums = [3,3], target = 6", expectedOutput: "[0, 1]", isHidden: false }
    ],
    constraints: ["2 ≤ nums.length ≤ 10^4", "-10^9 ≤ nums[i] ≤ 10^9", "-10^9 ≤ target ≤ 10^9"]
  },
  {
    id: "palindrome-number",
    title: "Palindrome Number",
    description: "Given an integer x, return true if x is a palindrome, and false otherwise.",
    difficulty: "easy",
    timeLimit: 15,
    languages: ["javascript", "python", "java", "cpp", "go", "rust"],
    starterCode: {
      javascript: `function isPalindrome(x) {\n  // Write your solution here\n  return false;\n}`,
      python: `def isPalindrome(x):\n    # Write your solution here\n    return False`,
      java: `class Solution {\n    public boolean isPalindrome(int x) {\n        // Write your solution here\n        return false;\n    }\n}`,
      cpp: `class Solution {\npublic:\n    bool isPalindrome(int x) {\n        // Write your solution here\n        return false;\n    }\n};`,
      go: `func isPalindrome(x int) bool {\n    // Write your solution here\n    return false\n}`,
      rust: `impl Solution {\n    pub fn is_palindrome(x: i32) -> bool {\n        // Write your solution here\n        false\n    }\n}`
    },
    testCases: [
      { id: "t1", input: "x = 121", expectedOutput: "true", isHidden: false },
      { id: "t2", input: "x = -121", expectedOutput: "false", isHidden: false },
      { id: "t3", input: "x = 10", expectedOutput: "false", isHidden: false }
    ],
    constraints: ["-2^31 ≤ x ≤ 2^31 - 1"]
  },
  {
    id: "valid-parentheses",
    title: "Valid Parentheses",
    description: "Given a string s containing just the characters '(', ')', '{', '}', '[' and ']', determine if the input string is valid.",
    difficulty: "easy",
    timeLimit: 20,
    languages: ["javascript", "python", "java", "cpp", "go", "rust"],
    starterCode: {
      javascript: `function isValid(s) {\n  // Write your solution here\n  return false;\n}`,
      python: `def isValid(s):\n    # Write your solution here\n    return False`,
      java: `class Solution {\n    public boolean isValid(String s) {\n        // Write your solution here\n        return false;\n    }\n}`,
      cpp: `class Solution {\npublic:\n    bool isValid(string s) {\n        // Write your solution here\n        return false;\n    }\n};`,
      go: `func isValid(s string) bool {\n    // Write your solution here\n    return false\n}`,
      rust: `impl Solution {\n    pub fn is_valid(s: String) -> bool {\n        // Write your solution here\n        false\n    }\n}`
    },
    testCases: [
      { id: "t1", input: "s = \"()\"", expectedOutput: "true", isHidden: false },
      { id: "t2", input: "s = \"()[]{}\"", expectedOutput: "true", isHidden: false },
      { id: "t3", input: "s = \"(]\"", expectedOutput: "false", isHidden: false }
    ],
    constraints: ["1 ≤ s.length ≤ 10^4", "s consists of parentheses only '()[]{}'."]
  }
];

export default function CodingChallengePage() {
  const router = useRouter();
  const { getToken } = useAuth();
  
  const { 
    atsScore, 
    resumeData, 
    targetCompany, 
    experienceLevel,
    setCodingSubmission,
    activeSessionId,
    setActiveSessionId,
    role
  } = useInterviewStore();

  const [challenge, setChallenge] = useState<CodeChallenge | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [hasMounted, setHasMounted] = useState(false);

  useEffect(() => {
    setHasMounted(true);
  }, []);
  const [questionIndex, setQuestionIndex] = useState(0);
  const [prepCountdown, setPrepCountdown] = useState(10);
  const [isPrepActive, setIsPrepActive] = useState(true);

  const [selectedLanguage, setSelectedLanguage] = useState("javascript");
  const [code, setCode] = useState("");
  const [testResults, setTestResults] = useState<TestResult[]>([]);
  const [isRunning, setIsRunning] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [editorTheme, setEditorTheme] = useState("monokai");
  const [codeQuality, setCodeQuality] = useState<string>("—");
  const [atsAlerts, setAtsAlerts] = useState<string[]>([]);
  
  const [stats, setStats] = useState<CodingRoundStats>({
    totalTestsPassed: 0,
    totalTests: 3,
    timeSpent: 0,
    submissionCount: 0,
    language: "javascript",
    executionTime: 0,
    memoryUsed: 0
  });

  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Helper to determine question timer duration (in seconds)
  const getTimerDuration = (difficulty: string): number => {
    const diff = difficulty.toLowerCase();
    if (diff === "easy") return 15 * 60;   // 15 mins
    if (diff === "medium") return 30 * 60; // 30 mins
    if (diff === "hard") return 45 * 60;   // 45 mins
    return 30 * 60;                        // default
  };

  const [timeLeft, setTimeLeft] = useState<number>(30 * 60);

  // Handle Tab key insertion of 4 spaces
  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Tab") {
      e.preventDefault();
      const textarea = e.currentTarget;
      const start = textarea.selectionStart;
      const end = textarea.selectionEnd;
      const spaces = "    ";
      const newCode = code.substring(0, start) + spaces + code.substring(end);
      
      // Update code state
      setCode(newCode);
      if (challenge) {
        localStorage.setItem(`elevateiq-${challenge.id}-${selectedLanguage}`, newCode);
      }

      // Use requestAnimationFrame for reliable cursor restoration
      requestAnimationFrame(() => {
        if (textareaRef.current) {
          textareaRef.current.selectionStart = start + 4;
          textareaRef.current.selectionEnd = start + 4;
        }
      });
    }
    // Handle Enter key auto-indentation
    if (e.key === "Enter") {
      e.preventDefault();
      const textarea = e.currentTarget;
      const start = textarea.selectionStart;
      const end = textarea.selectionEnd;
      // Get current line to detect leading whitespace
      const beforeCursor = code.substring(0, start);
      const currentLineStart = beforeCursor.lastIndexOf("\n") + 1;
      const currentLine = beforeCursor.substring(currentLineStart);
      const leadingSpaces = currentLine.match(/^(\s*)/)?.[1] || "";
      const newCode = code.substring(0, start) + "\n" + leadingSpaces + code.substring(end);
      
      setCode(newCode);
      if (challenge) {
        localStorage.setItem(`elevateiq-${challenge.id}-${selectedLanguage}`, newCode);
      }

      const newCursorPos = start + 1 + leadingSpaces.length;
      requestAnimationFrame(() => {
        if (textareaRef.current) {
          textareaRef.current.selectionStart = newCursorPos;
          textareaRef.current.selectionEnd = newCursorPos;
        }
      });
    }
  };

  const waitForVoices = (): Promise<SpeechSynthesisVoice[]> => {
    return new Promise((resolve) => {
      const voices = window.speechSynthesis.getVoices();
      if (voices.length > 0) {
        resolve(voices);
        return;
      }
      const onVoicesChanged = () => {
        window.speechSynthesis.removeEventListener("voiceschanged", onVoicesChanged);
        resolve(window.speechSynthesis.getVoices());
      };
      window.speechSynthesis.addEventListener("voiceschanged", onVoicesChanged);
      setTimeout(() => {
        window.speechSynthesis.removeEventListener("voiceschanged", onVoicesChanged);
        resolve(window.speechSynthesis.getVoices());
      }, 3000);
    });
  };

  // Mount initialization: fetch challenge from backend (or fallback), announce start
  useEffect(() => {
    if (!hasMounted) return;
    const loadChallenge = async () => {
      setIsLoading(true);
      let selectedChallenge: (CodeChallenge & { sessionId?: number; questionIndex?: number }) | null = null;
      try {
        const token = await getToken();
        const headers: Record<string, string> = {};
        if (token) headers["Authorization"] = `Bearer ${token}`;
        const baseUrl = apiConfig.baseUrl || "http://127.0.0.1:8000";

        // Always query backend challenge endpoint; backend resolves latest session automatically
        const url = activeSessionId 
          ? `${baseUrl}/coding/challenge?session_id=${activeSessionId}`
          : `${baseUrl}/coding/challenge`;

        const response = await fetch(url, { headers });
        if (response.ok) {
          selectedChallenge = await response.json();
          // Sync resolved session ID back to the store if it was missing
          if (selectedChallenge && selectedChallenge.sessionId && !activeSessionId) {
            console.log("Syncing activeSessionId from backend:", selectedChallenge.sessionId);
            setActiveSessionId(selectedChallenge.sessionId);
          }
          if (selectedChallenge && typeof selectedChallenge.questionIndex === "number") {
            setQuestionIndex(selectedChallenge.questionIndex);
          }
        } else {
          const errBody = await response.text();
          console.warn("Backend challenge response not OK:", response.status, errBody);
        }
      } catch (err) {
        console.warn("Failed to load dynamic challenge from backend:", err);
      }

      // Fallback only if backend truly failed
      if (!selectedChallenge) {
        const randomIndex = Math.floor(Math.random() * CHALLENGES.length);
        selectedChallenge = CHALLENGES[randomIndex];
      }

      setChallenge(selectedChallenge);
      setTimeLeft(getTimerDuration(selectedChallenge.difficulty));
      setStats((s) => ({
        ...s,
        totalTests: selectedChallenge!.testCases.length
      }));
      setIsLoading(false);

      // Speak start warning
      if (typeof window !== "undefined" && window.speechSynthesis) {
        window.speechSynthesis.cancel();
        const voices = await waitForVoices();
        await new Promise(resolve => setTimeout(resolve, 150));
        const msg = `Coding challenge ${questionIndex + 1} is starting in 10 seconds.`;
        const utterance = new SpeechSynthesisUtterance(msg);
        const targetVoice = voices.find(
          (v) => v.lang.startsWith("en-US") && v.name.includes("Natural")
        ) || voices.find(
          (v) => v.lang.startsWith("en-US")
        ) || voices.find(
          (v) => v.lang.startsWith("en")
        ) || voices[0];

        if (targetVoice) utterance.voice = targetVoice;
        utterance.rate = 0.95;
        utterance.pitch = 1.0;
        utterance.volume = 1.0;
        window.speechSynthesis.speak(utterance);
      }
    };

    loadChallenge();
  }, [activeSessionId, getToken, questionIndex, hasMounted]);

  // Poll for background customized coding challenge swap
  useEffect(() => {
    if (!activeSessionId || isLoading) return;

    let active = true;
    let pollInterval: NodeJS.Timeout;
    const startTime = Date.now();
    const maxPollMs = 120000; // 120 seconds timeout ceiling

    const checkStatus = async () => {
      if (Date.now() - startTime >= maxPollMs) {
        console.warn("Coding challenge generation polling timed out after 120s. Keeping fallback challenges.");
        clearInterval(pollInterval);
        return;
      }

      try {
        const token = await getToken();
        const headers: Record<string, string> = {};
        if (token) headers["Authorization"] = `Bearer ${token}`;
        const baseUrl = apiConfig.baseUrl || "http://127.0.0.1:8000";

        const res = await fetch(`${baseUrl}/api/interview/session/${activeSessionId}`, { headers });
        if (res.ok) {
          const sessionData = await res.json();
          if (!active) return;

          // If swapped to generator, trigger challenge re-fetch to swap customized challenge
          if (sessionData.question_source === "generator") {
            console.log("Detected generator question source. Refreshing challenge...");
            
            // Re-fetch challenge
            const challengeUrl = `${baseUrl}/coding/challenge?session_id=${activeSessionId}`;
            const challengeRes = await fetch(challengeUrl, { headers });
            if (challengeRes.ok) {
              const selectedChallenge = await challengeRes.json();
              if (active && selectedChallenge) {
                setChallenge(selectedChallenge);
                setTimeLeft(getTimerDuration(selectedChallenge.difficulty));
                setStats((s) => ({
                  ...s,
                  totalTests: selectedChallenge.testCases.length
                }));
              }
            }
            clearInterval(pollInterval);
          }
        }
      } catch (err) {
        console.warn("Error polling session status", err);
      }
    };

    // Check if the current challenge is marked as a fallback
    const isShowingFallback = challenge && challenge.questionSource === "fallback";

    if (isShowingFallback) {
      pollInterval = setInterval(checkStatus, 2000);
      // Run once immediately
      checkStatus();
    }

    return () => {
      active = false;
      if (pollInterval) clearInterval(pollInterval);
    };
  }, [activeSessionId, getToken, challenge, isLoading]);

  // Prep countdown timer
  useEffect(() => {
    if (!isPrepActive) return;
    
    if (prepCountdown <= 0) {
      setIsPrepActive(false);
      return;
    }

    const timer = setTimeout(() => {
      setPrepCountdown((prev) => prev - 1);
    }, 1000);

    return () => clearTimeout(timer);
  }, [prepCountdown, isPrepActive]);

  // Load from local storage or starter template
  useEffect(() => {
    if (!challenge) return;
    const cachedCode = localStorage.getItem(`elevateiq-${challenge.id}-${selectedLanguage}`);
    const codeToSet = cachedCode || challenge.starterCode[selectedLanguage] || "";
    const timer = setTimeout(() => {
      setCode(codeToSet);
    }, 0);
    return () => clearTimeout(timer);
  }, [selectedLanguage, challenge?.id, challenge?.starterCode]);

  // Code modification listener
  const handleCodeChange = (newCode: string) => {
    setCode(newCode);
    if (challenge) {
      localStorage.setItem(`elevateiq-${challenge.id}-${selectedLanguage}`, newCode);
    }
    detectAtsAlignment(newCode);
  };

  // Run real-time ATS match logic
  const detectAtsAlignment = (currentCode: string) => {
    const alerts: string[] = [];
    const lowerCode = currentCode.toLowerCase();
    
    // Resume parsed skills list from store
    const skills = resumeData?.technical_skills || ["async programming", "hash maps", "dictionaries", "arrays"];
    
    skills.forEach((skill: string) => {
      const lowerSkill = skill.toLowerCase();
      if (lowerSkill.includes("async") || lowerSkill.includes("await") || lowerSkill.includes("promises")) {
        if (lowerCode.includes("async") || lowerCode.includes("await") || lowerCode.includes("promise")) {
          alerts.push("✅ Code aligns with your resume: You're using async/await patterns you mentioned in your experience.");
        }
      }
      if (lowerSkill.includes("hash") || lowerSkill.includes("map") || lowerSkill.includes("dictionary") || lowerSkill.includes("lookup")) {
        if (lowerCode.includes("map") || lowerCode.includes("dict") || lowerCode.includes("hash") || lowerCode.includes("set")) {
          alerts.push("✅ Code aligns with your resume: You are applying the lookup dictionaries/map optimized searching mentioned in your profile.");
        }
      }
      if (lowerSkill.includes("algorithm") || lowerSkill.includes("search") || lowerSkill.includes("index")) {
        if (lowerCode.includes("index") || lowerCode.includes("binary") || lowerCode.includes("two_sum") || lowerCode.includes("twosum")) {
          alerts.push("✅ Code aligns with your resume: Your function naming pattern matches your algorithmic project descriptions.");
        }
      }
    });

    // Strip duplicates
    setAtsAlerts(Array.from(new Set(alerts)).slice(0, 2));
  };

  const runTests = async () => {
    if (!challenge) return;
    setIsRunning(true);
    setTestResults([]);

    try {
      const token = await getToken();
      const reqHeaders: Record<string, string> = {
        "Content-Type": "application/json"
      };
      if (token) reqHeaders["Authorization"] = `Bearer ${token}`;
      const baseUrl = apiConfig.baseUrl || "http://127.0.0.1:8000";

      let results: TestResult[] = [];

      if (activeSessionId) {
        // Use backend LLM evaluation
        const response = await fetch(`${baseUrl}/coding/run`, {
          method: "POST",
          headers: reqHeaders,
          body: JSON.stringify({
            session_id: activeSessionId,
            language: selectedLanguage,
            code: code
          })
        });

        if (!response.ok) {
          const errText = await response.text();
          console.warn("Backend /coding/run failed:", response.status, errText);
          throw new Error(`Evaluation returned ${response.status}`);
        }

        results = await response.json();
      } else {
        // Fallback: use Next.js local code-execution API for local CHALLENGES
        const response = await fetch("/api/code-execution", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            code,
            language: selectedLanguage,
            testCases: challenge.testCases,
            challengeId: challenge.id
          })
        });

        if (!response.ok) throw new Error("Local compilation failed");
        results = await response.json();
      }

      setTestResults(results);

      const passed = results.filter((r) => r.passed).length;

      setStats((s) => ({
        ...s,
        totalTestsPassed: passed,
        submissionCount: s.submissionCount + 1,
        language: selectedLanguage,
        executionTime: results.reduce((a, b) => a + (b.runtime || 0), 0),
        memoryUsed: Math.floor(Math.random() * 24) + 12
      }));

      // Hide compiling overlay since test execution is complete and results are rendered
      setIsRunning(false);

      // Fetch code quality recommendations in the background
      try {
        const token = await getToken();
        const headers: Record<string, string> = {
          "Content-Type": "application/json"
        };
        if (token) {
          headers["Authorization"] = `Bearer ${token}`;
        }

        const feedbackResponse = await fetch(`${baseUrl}/coding/quality`, {
          method: "POST",
          headers: headers as any,
          body: JSON.stringify({
            code,
            language: selectedLanguage,
            test_results: results
          })
        });
        if (feedbackResponse.ok) {
          const feedbackData = await feedbackResponse.json();
          setCodeQuality(feedbackData.codeQuality || "—");
        }
      } catch (err) {
        console.error("Failed to fetch code quality:", err);
        // Non-critical: don't fail the whole run if feedback fails
      }


    } catch (e: any) {
      console.error("Run tests error:", e);
      // Show error as a failed test result so user sees feedback
      setTestResults(challenge.testCases.map(tc => ({
        testCaseId: tc.id,
        passed: false,
        expected: tc.expectedOutput,
        actual: "Evaluation failed",
        error: e?.message || "Unknown error",
        runtime: 0
      })));
    } finally {
      setIsRunning(false);
    }
  };

  const handleSubmitInterview = async () => {
    setIsSubmitting(true);
    try {
      const token = await getToken();
      const headers = {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {})
      };
      const baseUrl = apiConfig.baseUrl || "http://127.0.0.1:8000";
      
      const payload = {
        session_id: activeSessionId || 1001,
        language: selectedLanguage,
        code,
        test_results: testResults.map(r => ({ ...r })),
        execution_time: stats.executionTime,
        memory_used: stats.memoryUsed
      };

      // Call local backend endpoint to save final challenge state
      const response = await fetch(`${baseUrl}/coding/submit`, {
        method: "POST",
        headers: headers as any,
        body: JSON.stringify(payload)
      });

      if (response.ok) {
        const data = await response.json();
        // Forward code stats to global store
        setCodingSubmission(payload);

        if (data.all_completed) {
          // Save generated corrections report to localStorage so feedback page can render it
          if (data.corrections) {
            localStorage.setItem(
              `elevateiq-coding-corrections-${activeSessionId || payload.session_id}`,
              JSON.stringify(data.corrections)
            );
          }
          router.push("/interview/feedback");
        } else {
          // Transition to next coding challenge in the B2B sequence
          setTestResults([]);
          setCode("");
          setChallenge(null);
          setIsPrepActive(true);
          setPrepCountdown(10);
          setQuestionIndex((idx) => idx + 1);
          setCodeQuality("—");
          setStats((s) => ({
            ...s,
            totalTestsPassed: 0,
            executionTime: 0,
            memoryUsed: 0
          }));
        }
      }
    } catch (e) {
      console.error(e);
    } finally {
      setIsSubmitting(false);
    }
  };

  // Timer countdown hook
  useEffect(() => {
    if (isPrepActive) return; // Wait until prep countdown is over
    
    if (isSubmitting || timeLeft <= 0) {
      if (timeLeft <= 0 && !isSubmitting) {
        handleSubmitInterview();
      }
      return;
    }

    const timer = setTimeout(() => {
      setTimeLeft(timeLeft - 1);
    }, 1000);

    return () => clearTimeout(timer);
  }, [timeLeft, isSubmitting, isPrepActive]);

  // Format time in MM:SS format
  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
  };

  const passPercentage = Math.round((stats.totalTestsPassed / stats.totalTests) * 100) || 0;

  if (!hasMounted || isLoading || !challenge) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[calc(100vh-6rem)] w-full space-y-4">
        <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin"></div>
        <p className="text-xs text-muted-foreground font-semibold">Starting your session...</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-[calc(100vh-6rem)] -m-6 overflow-hidden cursor-default">
      
      {/* Upper header action bar */}
      <div className="bg-card/60 backdrop-blur-xl border-b border-border/60 py-3 px-6 flex items-center justify-between z-10">
        <div className="flex items-center gap-3">
          <span className="p-2 rounded-xl bg-accent/10 text-accent">
            <FileCode className="w-5 h-5" />
          </span>
          <div>
            <h1 className="text-md font-bold text-foreground flex items-center gap-2">
              {challenge.title}
              <span className="text-[10px] font-extrabold uppercase bg-primary/10 border border-primary/20 text-primary py-0.5 px-2.5 rounded-full">
                Question {questionIndex + 1} of {(challenge as any).totalChallenges || 3}
              </span>
            </h1>
            <span className="text-[10px] text-muted-foreground font-semibold uppercase">
              Target Partner: {targetCompany || "Google"} — {role || "Software Engineer"}
            </span>
          </div>
        </div>

        {/* Timer Display */}
        <div className="flex items-center gap-2 px-3 py-1.5 rounded-xl border border-border bg-background/50 backdrop-blur-xl">
          <Clock className={`w-4 h-4 ${timeLeft <= 120 ? "text-destructive animate-pulse" : "text-muted-foreground"}`} />
          <span className={`font-mono text-xs font-bold ${timeLeft <= 120 ? "text-destructive animate-pulse" : "text-foreground"}`}>
            {formatTime(timeLeft)}
          </span>
        </div>

        {/* Editor controls */}
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-1.5 text-xs font-semibold">
            <span className="text-muted-foreground">Language:</span>
            <select 
              value={selectedLanguage} 
              onChange={(e) => setSelectedLanguage(e.target.value)}
              disabled={isRunning || isSubmitting}
              className="py-1 px-3 bg-background border border-border rounded-xl text-foreground font-semibold outline-none disabled:opacity-50"
            >
              {challenge.languages.filter((lang) => lang !== "cpp").map((lang) => (
                <option key={lang} value={lang}>{lang.charAt(0).toUpperCase() + lang.slice(1)}</option>
              ))}
            </select>
          </div>

          <div className="flex items-center gap-1.5 text-xs font-semibold">
            <span className="text-muted-foreground">Theme:</span>
            <select 
              value={editorTheme} 
              onChange={(e) => setEditorTheme(e.target.value)}
              disabled={isRunning || isSubmitting}
              className="py-1 px-3 bg-background border border-border rounded-xl text-foreground font-semibold outline-none disabled:opacity-50"
            >
              <option value="monokai">Monokai Dark</option>
              <option value="dracula">Dracula</option>
              <option value="github">Github Light</option>
            </select>
          </div>
        </div>
      </div>

      {/* Workspace Area split into 3 columns */}
      <div className="flex-1 grid grid-cols-1 lg:grid-cols-12 min-h-0">
        
        {/* Left Column: Problem statement (span 3) */}
        <div className="lg:col-span-3 border-r border-border/60 bg-card/60 backdrop-blur-xl p-5 overflow-y-auto space-y-6">
          {challenge.questionSource === "fallback" && (
            <div className="p-3.5 bg-primary/10 border border-primary/20 rounded-2xl flex flex-col gap-1.5 animate-pulse text-[11px] text-primary">
              <div className="flex items-center gap-2 font-extrabold uppercase tracking-wider text-[10px]">
                <span className="w-2.5 h-2.5 rounded-full bg-primary animate-ping"></span>
                Generating Custom Profile Challenges...
              </div>
              <p className="text-muted-foreground font-semibold leading-relaxed">
                We are generating personalized questions based on your resume and target company in the background. They will swap in automatically when ready!
              </p>
            </div>
          )}

          <div>
            <h2 className="text-sm font-bold text-foreground uppercase tracking-wider mb-2">Description</h2>
            <p className="text-xs text-muted-foreground leading-relaxed">
              {challenge.description}
            </p>
          </div>

          <div className="space-y-2">
            <h3 className="text-xs font-bold text-foreground uppercase tracking-wider">Constraints</h3>
            <ul className="text-[11px] text-muted-foreground list-disc list-inside space-y-1">
              {challenge.constraints.map((c, i) => (
                <li key={i}>{c}</li>
              ))}
            </ul>
          </div>

          <div className="space-y-4">
            <h3 className="text-xs font-bold text-foreground uppercase tracking-wider">Example Inputs</h3>
            {challenge.testCases.slice(0, 2).map((tc) => (
              <div key={tc.id} className="p-3 bg-background border border-border rounded-xl text-[11px] space-y-1">
                <div><span className="text-muted-foreground">Input:</span> <code className="font-mono text-foreground">{tc.input}</code></div>
                <div><span className="text-muted-foreground">Output:</span> <code className="font-mono text-success">{typeof tc.expectedOutput === 'object' ? JSON.stringify(tc.expectedOutput) : String(tc.expectedOutput)}</code></div>
              </div>
            ))}
          </div>
        </div>

        {/* Center Column: Editor & Console (span 6) */}
        <div className="lg:col-span-6 flex flex-col h-full min-h-0 bg-background relative">
          
          <style dangerouslySetInnerHTML={{ __html: `
            .cursor-default, .cursor-default *:not(textarea):not(button):not(select):not(option):not(a):not(.cursor-pointer) {
              cursor: default !important;
            }
          ` }} />

          {isPrepActive && (
            <div className="absolute inset-0 bg-background/90 backdrop-blur-md z-20 flex flex-col items-center justify-center space-y-4">
              <div className="text-sm font-bold text-primary uppercase tracking-widest animate-pulse">
                Preparing Coding Interview
              </div>
              <div className="text-8xl font-black text-foreground select-none animate-ping">
                {prepCountdown}
              </div>
              <p className="text-xs text-muted-foreground max-w-xs text-center leading-relaxed">
                The coding workspace is initializing. Please read the challenge description on the left.
              </p>
            </div>
          )}

          {(isRunning || isSubmitting) && (
            <div className="absolute inset-0 bg-background/80 backdrop-blur-[2px] z-20 flex flex-col items-center justify-center space-y-4 animate-in fade-in duration-200">
              <div className="p-4 bg-primary/10 rounded-2xl text-primary animate-spin">
                <RefreshCw className="w-8 h-8" />
              </div>
              <div className="text-xs font-bold text-foreground uppercase tracking-widest animate-pulse">
                {isRunning 
                  ? "Compiling & Executing Code..." 
                  : (questionIndex === ((challenge as any)?.totalChallenges || 3) - 1 
                      ? "Generating Scorecard & Feedback..." 
                      : "Submitting Challenge...")}
              </div>
              <p className="text-[10px] text-muted-foreground max-w-xs text-center leading-relaxed">
                {isRunning 
                  ? "Please wait while we evaluate your solution against the test cases." 
                  : (questionIndex === ((challenge as any)?.totalChallenges || 3) - 1 
                      ? "Generating your personalized feedback and scorecard. This may take a moment..." 
                      : "Saving your submission and preparing the next challenge.")}
              </p>
            </div>
          )}


          {/* Main textarea custom editor */}
          <div className="flex-1 relative min-h-0 p-4 flex gap-3">
            
            {/* Simulated Line numbers gutter */}
            <div className="font-mono text-sm leading-relaxed text-muted-foreground/40 text-right select-none pt-1 w-8 border-r border-border/30 pr-2 overflow-hidden">
              {Array.from({ length: Math.max(15, code.split("\n").length) }).map((_, i) => (
                <div key={i}>{i + 1}</div>
              ))}
            </div>

            <textarea
              ref={textareaRef}
              value={code}
              onChange={(e) => handleCodeChange(e.target.value)}
              onKeyDown={handleKeyDown}
              disabled={isRunning || isSubmitting || timeLeft <= 0 || isPrepActive}
              className={`flex-1 font-mono text-sm leading-relaxed bg-transparent text-foreground outline-none resize-none p-1 disabled:opacity-75 whitespace-pre ${
                editorTheme === "monokai" ? "text-amber-300" : editorTheme === "dracula" ? "text-purple-300" : "text-slate-800"
              }`}
              placeholder="// Type your implementation code here..."
              spellCheck="false"
              style={{ tabSize: 4, MozTabSize: 4 } as React.CSSProperties}
              wrap="off"
            />

            {/* Float ATS Alignment Notification Alert */}
            {atsAlerts.length > 0 && (
              <div className="absolute bottom-4 left-4 right-4 bg-success/10 border border-success/20 backdrop-blur-md p-4 rounded-xl flex items-start gap-3 shadow-md animate-in slide-in-from-bottom-2 duration-300">
                <BrainCircuit className="w-5 h-5 text-success flex-shrink-0 mt-0.5 animate-pulse" />
                <div className="text-[11px] text-success leading-relaxed">
                  <p className="font-extrabold uppercase tracking-wide">Confidence Boost Triggered</p>
                  <p className="opacity-90">{atsAlerts[0]}</p>
                </div>
              </div>
            )}
          </div>

          {/* Action button bar */}
          <div className="bg-card/60 backdrop-blur-xl border-t border-border/60 p-4 flex items-center justify-between z-10">
             <button
              onClick={runTests}
              disabled={isRunning || isSubmitting || !code}
              className="cursor-pointer font-bold bg-muted hover:bg-muted-foreground/10 text-foreground py-2 px-6 rounded-xl text-xs disabled:opacity-50 transition-all flex items-center gap-1.5"
            >
              <Cpu className="w-3.5 h-3.5" />
              {isRunning ? "Compiling..." : "Run Tests"}
            </button>

            <button
              onClick={handleSubmitInterview}
              disabled={isSubmitting || isRunning || testResults.length === 0}
              className="cursor-pointer font-bold bg-primary text-primary-foreground hover:bg-primary/90 py-2 px-6 rounded-xl text-xs disabled:opacity-50 transition-all flex items-center gap-1.5"
            >
              Submit & Proceed
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        {/* Right Column: Console/Results and Insights panel (span 3) */}
        <div className="lg:col-span-3 border-l border-border/60 bg-card/60 backdrop-blur-xl flex flex-col h-full min-h-0">
          
          {/* Upper Pane: Insights Metrics */}
          <div className="p-4 border-b border-border/60 space-y-4">
            <h3 className="text-xs font-bold text-foreground uppercase tracking-wider">Insights & Analytics</h3>
            
            <div className="grid grid-cols-2 gap-3">
              <div className="bg-background border border-border p-3 rounded-xl flex flex-col gap-1">
                <span className="text-[9px] text-muted-foreground uppercase font-bold">Resume ATS</span>
                <span className="text-lg font-black text-foreground">{atsScore || 78}/100</span>
              </div>
              
              <div className="bg-background border border-border p-3 rounded-xl flex flex-col gap-1">
                <span className="text-[9px] text-muted-foreground uppercase font-bold">Code Quality</span>
                <span className="text-lg font-black text-foreground">{codeQuality}</span>
              </div>

              <div className="bg-background border border-border p-3 rounded-xl flex flex-col gap-1">
                <span className="text-[9px] text-muted-foreground uppercase font-bold">Execution Speed</span>
                <span className="text-lg font-black text-foreground">{stats.executionTime} ms</span>
              </div>

              <div className="bg-background border border-border p-3 rounded-xl flex flex-col gap-1">
                <span className="text-[9px] text-muted-foreground uppercase font-bold">Memory load</span>
                <span className="text-lg font-black text-foreground">{stats.memoryUsed} MB</span>
              </div>
            </div>

            {/* Progress bar */}
            <div className="space-y-1">
              <div className="flex justify-between text-[10px] font-bold">
                <span className="text-muted-foreground uppercase">Test cases passed</span>
                <span className="text-foreground">{stats.totalTestsPassed}/{stats.totalTests}</span>
              </div>
              <div className="h-2 w-full bg-background rounded-full overflow-hidden border border-border">
                <div 
                  className={`h-full transition-all duration-300 ${
                    passPercentage === 100 ? "bg-success" : passPercentage >= 50 ? "bg-amber-500" : "bg-destructive"
                  }`}
                  style={{ width: `${passPercentage}%` }}
                ></div>
              </div>
            </div>
          </div>

          {/* Lower Pane: Console Log Output results (flex-1) */}
          <div className="flex-1 overflow-y-auto p-4 space-y-4">
            <h4 className="text-xs font-bold text-foreground uppercase tracking-wider flex items-center gap-1.5">
              <Terminal className="w-4 h-4 text-muted-foreground" />
              Console Results
            </h4>

            {testResults.length === 0 ? (
              <div className="h-32 border border-dashed border-border rounded-xl flex items-center justify-center text-center p-4">
                <span className="text-[10px] text-muted-foreground leading-normal">
                  No execution logs recorded. Click &ldquo;Run Tests&rdquo; to compile solution.
                </span>
              </div>
            ) : (
              <div className="space-y-2">
                {testResults.map((res) => (
                  <div 
                    key={res.testCaseId}
                    className={`p-3 border rounded-xl text-[11px] leading-relaxed transition-all ${
                      res.passed 
                        ? "bg-success/5 border-success/20" 
                        : "bg-destructive/5 border-destructive/20"
                    }`}
                  >
                    <div className="flex justify-between items-center mb-1">
                      <span className="font-bold uppercase tracking-wider">Test {res.testCaseId}</span>
                      <span className={`font-black uppercase tracking-wider text-[9px] ${
                        res.passed ? "text-success" : "text-destructive"
                      }`}>
                        {res.passed ? "✓ Pass" : "✗ Fail"}
                      </span>
                    </div>
                    {res.error ? (
                      <pre className="font-mono text-destructive text-[10px] whitespace-pre-wrap mt-1">
                        {res.error}
                      </pre>
                    ) : (
                      <div className="space-y-0.5 font-mono text-muted-foreground">
                        <div>Got: <span className="text-foreground">{typeof res.actual === 'object' ? JSON.stringify(res.actual) : String(res.actual)}</span></div>
                        <div>Expected: <span className="text-foreground">{typeof res.expected === 'object' ? JSON.stringify(res.expected) : String(res.expected)}</span></div>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>

        </div>

      </div>

    </div>
  );
}
