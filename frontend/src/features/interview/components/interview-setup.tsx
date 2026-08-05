"use client";

import React, { useEffect, useState, useMemo, useRef, useCallback } from "react";
import { useAuth } from "@clerk/nextjs";
import { useResumeUpload } from "@/features/resume/hooks/use-resume-upload";
import { apiClient } from "@/services/api/client";
import { apiConfig } from "@/services/api/config";
import { 
  Mic, 
  MicOff,
  Play, 
  RefreshCw, 
  Award, 
  CheckCircle, 
  AlertCircle, 
  ArrowRight, 
  LogOut, 
  Settings, 
  Sparkles,
  Volume2,
  VolumeX,
  Wifi,
  Check,
  X,
  User,
  Info,
  Terminal
} from "lucide-react";

interface InterviewProfile {
  id: number;
  resume_id: number;
  target_company: string;
  interview_type: string;
  experience_level: string;
}

interface ResponseMetrics {
  round: number;
  question: string;
  transcript: string;
  audioQuality: {
    peakAmplitude: number;
    noiseLevel: number;
    clarity: "clear" | "acceptable" | "poor";
  };
  score: number;
  duration: string;
  feedback: string;
  pacingAnalysis: {
    thinkingPause: string;
    speakingRate: string;
    pausesWithinAnswer: number;
    fillersDetected: string[];
    feedbackScore: string;
  };
  strengths: string[];
  gaps: string[];
  example_rewrites?: string[];
}

interface PacingAnalysis {
  thinkingPause: string;
  speakingRate: string;
  pausesWithinAnswer: number;
  fillersDetected: string[];
  feedbackScore: string;
}

interface SpeechRecognitionResult {
  isFinal: boolean;
  [index: number]: {
    transcript: string;
  };
}

interface SpeechRecognitionEvent {
  resultIndex: number;
  results: {
    length: number;
    [index: number]: SpeechRecognitionResult;
  };
}

interface SpeechRecognitionInstance {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  start: () => void;
  stop: () => void;
  onstart: () => void;
  onresult: (event: SpeechRecognitionEvent) => void;
  onerror: (event: { error: string }) => void;
  onend: () => void;
}

type SpeechRecognitionConstructor = new () => SpeechRecognitionInstance;

type WindowWithSpeech = typeof window & {
  SpeechRecognition?: unknown;
  webkitSpeechRecognition?: unknown;
  webkitAudioContext?: typeof AudioContext;
};

import companiesData from "./companies.json";

// --- IndexedDB for Audio Calibration Storage ---
const DB_NAME = "ElevateIQ_AudioDB";
const DB_VERSION = 1;
const STORE_NAME = "audioCalibrationStore";

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === "undefined") {
      reject(new Error("indexedDB not supported"));
      return;
    }
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME);
      }
    };
  });
}

function getCalibrationState(): Promise<any> {
  return new Promise(async (resolve) => {
    try {
      const db = await openDB();
      const transaction = db.transaction(STORE_NAME, "readonly");
      const store = transaction.objectStore(STORE_NAME);
      const request = store.get("audioCalibration");
      request.onerror = () => resolve(null);
      request.onsuccess = () => resolve(request.result);
    } catch (e) {
      console.error("IndexedDB read error:", e);
      resolve(null);
    }
  });
}

function saveCalibrationState(state: any): Promise<void> {
  return new Promise(async (resolve, reject) => {
    try {
      const db = await openDB();
      const transaction = db.transaction(STORE_NAME, "readwrite");
      const store = transaction.objectStore(STORE_NAME);
      const request = store.put(state, "audioCalibration");
      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve();
    } catch (e) {
      console.error("IndexedDB write error:", e);
      reject(e);
    }
  });
}


const INTERVIEW_TYPES = [
  { id: "coding", label: "Coding / Algorithms" },
  { id: "system design", label: "System Design" },
  { id: "behavioral", label: "Behavioral" }
];

const extractTopicKeyword = (text: string) => {
  const words = text.toLowerCase();
  const keywords = [
    "react", "next.js", "node", "python", "database", "scaling", "cache", "redis",
    "api", "latency", "system design", "load balancing", "docker", "kubernetes",
    "monitoring", "concurrency", "security", "git", "star", "sql"
  ];
  for (const kw of keywords) {
    if (words.includes(kw)) {
      return kw.charAt(0).toUpperCase() + kw.slice(1);
    }
  }
  return "that topic";
};

const calculatePacingAnalysis = (
  text: string,
  durationSec: number,
  thinkingPauseVal: string | null,
  pausesCount: number
) => {
  const words = text.split(/\s+/).filter(Boolean);
  const wordCount = words.length;
  const thinkingPause = thinkingPauseVal || "1.2s";
  const rateWpm = durationSec > 0 ? Math.round((wordCount / durationSec) * 60) : 130;
  const speakingRate = `${rateWpm} words/min`;
  const pausesWithinAnswer = pausesCount;

  const fillerList = ["um", "uh", "like", "basically", "you know", "er", "ah"];
  const detectedFillers: string[] = [];
  words.forEach((w) => {
    const cleanW = w.toLowerCase().replace(/[^a-z]/g, "");
    if (fillerList.includes(cleanW)) {
      detectedFillers.push(cleanW);
    }
  });

  let scoreFeedback = "Good pacing, excellent delivery.";
  if (rateWpm > 165) {
    scoreFeedback = "You are speaking a bit fast. Try to slow down for clarity.";
  } else if (rateWpm < 95) {
    scoreFeedback = "Pacing is slightly slow. Try to speak more fluently.";
  }
  if (detectedFillers.length >= 3) {
    scoreFeedback += " Try to reduce filler words like 'um' or 'like' to sound more polished.";
  }
  const thinkingSec = parseFloat(thinkingPause);
  if (thinkingSec < 0.5) {
    scoreFeedback += " Taking a 1-2 second pause before answering helps structure your thoughts.";
  }

  return {
    thinkingPause,
    speakingRate,
    pausesWithinAnswer,
    fillersDetected: detectedFillers,
    feedbackScore: scoreFeedback
  };
};

interface Company {
  name: string;
  industry: string;
  hiring_intensity: string;
  interview_style: string;
  avg_questions: number;
}

export function InterviewSetup() {
  const { getToken } = useAuth();
  const { resumes, isLoadingResumes, refresh: refreshResumes } = useResumeUpload();

  const [profile, setProfile] = useState<InterviewProfile | null>(null);
  const [selectedResumeId, setSelectedResumeId] = useState<number | null>(null);
  const [targetCompany, setTargetCompany] = useState<string>("");
  const [interviewType, setInterviewType] = useState<string>("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isLoadingProfile, setIsLoadingProfile] = useState(true);

  // Search & custom dropdown states for company selection
  const [searchQuery, setSearchQuery] = useState("");
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const [highlightedIndex, setHighlightedIndex] = useState(-1);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // API search & recommendation states
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [apiCompanies, setApiCompanies] = useState<Company[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [recommendedCompanies, setRecommendedCompanies] = useState<Company[]>([]);
  const [isLoadingRecommendations, setIsLoadingRecommendations] = useState(false);


  // Connectivity status monitoring
  const [online, setOnline] = useState(() => typeof window !== "undefined" ? navigator.onLine : true);

  // Pre-flight checks states
  const [showPreFlight, setShowPreFlight] = useState(false);
  const [micStream, setMicStream] = useState<MediaStream | null>(null);
  const [checks, setChecks] = useState({
    micAccess: "idle" as "idle" | "running" | "success" | "failed",
    internet: "idle" as "idle" | "running" | "success" | "failed",
    micQuality: "idle" as "idle" | "running" | "success" | "failed",
    speaker: "idle" as "idle" | "running" | "success" | "failed",
    latency: "idle" as "idle" | "running" | "success" | "failed",
  });

  // Pre-flight measured parameters
  const [speedMbps, setSpeedMbps] = useState<number | null>(null);
  const [latencyMs, setLatencyMs] = useState<number | null>(null);
  const [measuredPeak, setMeasuredPeak] = useState<number | null>(null);
  const [measuredNoise, setMeasuredNoise] = useState<number | null>(null);
  const [measuredSnr, setMeasuredSnr] = useState<number | null>(null);
  const [voiceFreqDetected, setVoiceFreqDetected] = useState<boolean | null>(null);
  const [voiceTestCountdown, setVoiceTestCountdown] = useState(0);

  // Pre-flight step state: 1 (Mic request), 2 (Speaker check), 3 (Calibrate / noise check), 4 (Network speed/latency), 5 (Lock & Anchor)
  const [preFlightStep, setPreFlightStep] = useState<number>(1);
  const [calibrationLivePeak, setCalibrationLivePeak] = useState<number>(-100);
  const [calibrationCountdown, setCalibrationCountdown] = useState<number>(0);
  const [calibrationRetries, setCalibrationRetries] = useState<number>(0);
  const [greetingRecognition, setGreetingRecognition] = useState<any>(null);

  // Audio hardware devices list & selected device states
  const [availableMics, setAvailableMics] = useState<MediaDeviceInfo[]>([]);
  const [selectedMicId, setSelectedMicId] = useState<string>("");
  const [availableSpeakers, setAvailableSpeakers] = useState<MediaDeviceInfo[]>([]);
  const [selectedSpeakerId, setSelectedSpeakerId] = useState<string>("");
  const [recognitionError, setRecognitionError] = useState<string | null>(null);



  // Practice session states
  const [activeSessionId, setActiveSessionId] = useState<number | null>(null);
  const [currentQuestion, setCurrentQuestion] = useState<string | null>(null);
  const [userAnswer, setUserAnswer] = useState<string>("");
  const [isRecording, setIsRecording] = useState(false);
  const [recognition, setRecognition] = useState<SpeechRecognitionInstance | null>(null);
  const [isSubmittingAnswer, setIsSubmittingAnswer] = useState(false);
  const [answerCount, setAnswerCount] = useState(0);
  const [feedback, setFeedback] = useState<{
    strengths: string[];
    gaps: string[];
    score: number;
    potential_score?: number;
    growth_path?: string;
    streak_message?: string | null;
    example_rewrites?: string[];
  } | null>(null);
  const [nextQuestion, setNextQuestion] = useState<string | null>(null);
  const [isInterviewFinished, setIsInterviewFinished] = useState(false);
  const [showSetupForm, setShowSetupForm] = useState(false);

  // Real-time voice parameters & styling
  const [eleanorSpeaking, setEleanorSpeaking] = useState(false);
  const [liveVolume, setLiveVolume] = useState(0);
  const [liveNoise, setLiveNoise] = useState(0);
  const [liveTranscript, setLiveTranscript] = useState("");
  const [pacingFeedback, setPacingFeedback] = useState<PacingAnalysis | null>(null);

  // Response session history for final dashboard report
  const [sessionHistory, setSessionHistory] = useState<ResponseMetrics[]>([]);
  const [viewingReport, setViewingReport] = useState(false);
  const [activeReportIndex, setActiveReportIndex] = useState(0);

  // References for live Audio Analysis during candidate answer
  const liveCtxRef = useRef<AudioContext | null>(null);
  const liveStreamRef = useRef<MediaStream | null>(null);
  const liveAnalyserRef = useRef<AnalyserNode | null>(null);
  const animationFrameIdRef = useRef<number | null>(null);

  // References for silence and pacing calculations
  const silenceTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const hasSpokenRef = useRef(false);
  const thinkingPauseStartRef = useRef<number>(0);
  const thinkingPauseValRef = useRef<string | null>(null);
  const pausesCountRef = useRef(0);
  const lastSpeechTimeRef = useRef<number | null>(null);
  const maxPeakRef = useRef<number>(-100);

  // References to bypass stale closures in Speech Recognition
  const handleSubmitAnswerRef = useRef<() => void>(() => {});
  // Chrome speechSynthesis keepalive timer ref
  const speechKeepAliveRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const ignoreSubmitOnEndRef = useRef(false);

  // Memoized values (like isBrowserCompatible, analyzedResumes, selectedResume, filteredCompanies)
  const isBrowserCompatible = useMemo(() => {
    if (typeof window === "undefined") return true;
    const win = window as WindowWithSpeech;
    const SpeechRecognition = win.SpeechRecognition || win.webkitSpeechRecognition;
    return !!SpeechRecognition && !!window.speechSynthesis;
  }, []);

  // Filter completed resumes
  const analyzedResumes = useMemo(() => {
    return resumes.filter((r) => r.analysis_status === "completed");
  }, [resumes]);

  // Find currently selected resume details
  const selectedResume = useMemo(() => {
    return resumes.find((r) => r.id === selectedResumeId) || null;
  }, [resumes, selectedResumeId]);

  // 1. Debounce searchQuery -> debouncedQuery
  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedQuery(searchQuery);
    }, 300);
    return () => clearTimeout(handler);
  }, [searchQuery]);

  // 2. Fetch companies from API when debouncedQuery changes
  useEffect(() => {
    if (!debouncedQuery.trim()) {
      setApiCompanies([]);
      return;
    }
    let active = true;
    const fetchCompanies = async () => {
      setIsSearching(true);
      try {
        const useMock = process.env.NEXT_PUBLIC_USE_MOCK === "true";
        const API_BASE = useMock ? "/api/interview/mock" : "/api/interview";
        const token = await getToken();
        const headers: Record<string, string> = {};
        if (token) {
          headers["Authorization"] = `Bearer ${token}`;
        }
        
        const data = await apiClient.get<Company[]>(
          `${API_BASE}/companies/search?q=${encodeURIComponent(debouncedQuery)}`,
          { headers } as never
        );
        if (active) {
          setApiCompanies(data);
        }
      } catch (err: any) {
        if (err?.name === "AbortError" || err?.name === "TimeoutError") {
          console.warn("Company search was aborted or timed out:", err.message);
          return;
        }
        console.error("Failed to fetch companies from API", err);
      } finally {
        if (active) {
          setIsSearching(false);
        }
      }
    };
    
    fetchCompanies();
    return () => {
      active = false;
    };
  }, [debouncedQuery, getToken]);

  // 3. Fetch recommended companies when selectedResumeId changes
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
        const headers: Record<string, string> = {};
        if (token) {
          headers["Authorization"] = `Bearer ${token}`;
        }
        
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
  }, [selectedResumeId, getToken]);

  // 4. Compute filteredCompanies with API fallback
  const filteredCompanies = useMemo(() => {
    if (!searchQuery.trim()) {
      return companiesData.slice(0, 15);
    }
    // If we have API results, use them!
    if (apiCompanies.length > 0) {
      return apiCompanies.map(c => ({
        ...c,
        name: c.name && typeof c.name === "string" ? c.name.trim() : c.name
      }));
    }
    // Fallback: Client-side search (typo/substring matching)
    const query = searchQuery.toLowerCase();
    return companiesData
      .map(c => ({ ...c, name: c.name.trim() })) // clean client data spaces
      .filter(
        (c) =>
          c.name.toLowerCase().includes(query) ||
          c.industry.toLowerCase().includes(query)
      )
      .slice(0, 15);
  }, [searchQuery, apiCompanies]);


  // Define Helper Functions Above Effects to Avoid Use-Before-Declaration Errors

  const warmUpAudioAndSpeech = async () => {
    // 1. Warm up speech synthesis and pre-load voices
    if (typeof window !== "undefined" && window.speechSynthesis) {
      window.speechSynthesis.cancel();
      // Trigger voice loading — Chrome loads voices lazily
      const voices = window.speechSynthesis.getVoices();
      if (voices.length === 0) {
        // Force Chrome to load voices by listening for the event
        await new Promise<void>((resolve) => {
          const handler = () => {
            window.speechSynthesis.removeEventListener("voiceschanged", handler);
            resolve();
          };
          window.speechSynthesis.addEventListener("voiceschanged", handler);
          setTimeout(() => {
            window.speechSynthesis.removeEventListener("voiceschanged", handler);
            resolve();
          }, 2000);
        });
      }
    }

    // 2. Initialize and resume persistent AudioContext
    try {
      const win = window as WindowWithSpeech;
      const AudioContextClass = win.AudioContext || win.webkitAudioContext;
      if (AudioContextClass) {
        if (!liveCtxRef.current || liveCtxRef.current.state === "closed") {
          liveCtxRef.current = new AudioContextClass();
        }
        if (liveCtxRef.current.state === "suspended") {
          await liveCtxRef.current.resume();
        }
        if (selectedSpeakerId && (liveCtxRef.current as any).setSinkId) {
          (liveCtxRef.current as any).setSinkId(selectedSpeakerId).catch((e: any) => {
            console.warn("Failed to set sink ID during warm up:", e);
          });
        }
        console.log("Speech & AudioContext successfully warmed up.");
      }
    } catch (e) {
      console.error("Failed to warm up AudioContext:", e);
    }
  };


  const loadAudioDevices = useCallback(async () => {
    try {
      const devices = await navigator.mediaDevices.enumerateDevices();
      const mics = devices.filter(d => d.kind === "audioinput");
      const speakers = devices.filter(d => d.kind === "audiooutput");
      setAvailableMics(mics);
      setAvailableSpeakers(speakers);

      // Select default microphone/speaker (preferring deviceId === "default")
      if (mics.length > 0 && !selectedMicId) {
        const defaultMic = mics.find(m => m.deviceId === "default") || mics[0];
        setSelectedMicId(defaultMic.deviceId);
      }
      if (speakers.length > 0 && !selectedSpeakerId) {
        const defaultSpeaker = speakers.find(s => s.deviceId === "default") || speakers[0];
        setSelectedSpeakerId(defaultSpeaker.deviceId);
      }
    } catch (e) {
      console.warn("Failed to enumerate audio devices:", e);
    }
  }, [selectedMicId, selectedSpeakerId]);

  const updateActiveMicrophoneStream = useCallback(async (deviceId: string) => {
    // No-op during idle setup to prevent locking Bluetooth microphone profiles.
    console.log("Selected mic changed to:", deviceId);
  }, []);

  const stopLiveAudioAnalysis = () => {
    if (animationFrameIdRef.current) cancelAnimationFrame(animationFrameIdRef.current);
    if (liveStreamRef.current) {
      liveStreamRef.current.getTracks().forEach((t) => t.stop());
      liveStreamRef.current = null;
    }
    if (liveCtxRef.current) {
      try {
        liveCtxRef.current.close().catch((e) => console.log("Context close error:", e));
      } catch (e) {}
      liveCtxRef.current = null;
    }
    setLiveVolume(0);
  };

  const cleanupStates = () => {
    // Stop speech synthesis & audio analysis
    clearSpeechKeepAlive();
    if (typeof window !== "undefined" && window.speechSynthesis) {
      window.speechSynthesis.cancel();
    }
    stopLiveAudioAnalysis();
    if (recognition) {
      try {
        recognition.stop();
      } catch (e) {
        console.error("Cleanup speech recognition stop error:", e);
      }
    }
    if (greetingRecognition) {
      try {
        greetingRecognition.stop();
      } catch (e) {
        console.error("Cleanup greeting recognition stop error:", e);
      }
    }

    setRecognitionError(null);
    setActiveSessionId(null);
    setCurrentQuestion(null);
    setUserAnswer("");
    setFeedback(null);
    setPacingFeedback(null);
    setNextQuestion(null);
    setIsInterviewFinished(false);
    setAnswerCount(0);
    setViewingReport(false);
  };

  // Real-time audio analyzer loop during active candidate speaking
  const startLiveAudioAnalysis = async () => {
    try {
      maxPeakRef.current = -100;
      const constraints = selectedMicId && selectedMicId !== "default"
        ? { audio: { deviceId: selectedMicId } }
        : { audio: true };
      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      liveStreamRef.current = stream;
      
      const win = window as WindowWithSpeech;
      const AudioContextClass = win.AudioContext || win.webkitAudioContext;
      if (!AudioContextClass) return;

      // Reuse persistent warmed-up context
      let ctx = liveCtxRef.current;
      if (!ctx || ctx.state === "closed") {
        ctx = new AudioContextClass();
        liveCtxRef.current = ctx;
      }

      // CRITICAL: Resume AudioContext — Chrome starts it in "suspended" state
      if (ctx.state === "suspended") {
        await ctx.resume();
      }

      if (selectedSpeakerId && selectedSpeakerId !== "default" && (ctx as any).setSinkId) {
        (ctx as any).setSinkId(selectedSpeakerId).catch((e: any) => {
          console.warn("Failed to set sink ID during live analysis:", e);
        });
      }

      const source = ctx.createMediaStreamSource(stream);

      const analyser = ctx.createAnalyser();
      analyser.fftSize = 512;
      liveAnalyserRef.current = analyser;
      source.connect(analyser);

      const freqData = new Uint8Array(analyser.frequencyBinCount);
      const timeData = new Uint8Array(analyser.fftSize);

      const updateLoop = () => {
        if (!liveCtxRef.current || liveCtxRef.current.state === "closed") return;

        // Peak Level Detection
        analyser.getByteTimeDomainData(timeData);
        let frameMax = 128;
        for (let i = 0; i < timeData.length; i++) {
          const val = Math.abs(timeData[i] - 128);
          if (val > frameMax - 128) {
            frameMax = val + 128;
          }
        }
        const normalizedVal = Math.abs(frameMax - 128) / 128;
        const peakDb = normalizedVal > 0 ? 20 * Math.log10(normalizedVal) : -100;
        if (peakDb > maxPeakRef.current) {
          maxPeakRef.current = peakDb;
        }

        // Live volume meter display (0-100)
        analyser.getByteFrequencyData(freqData);
        let sum = 0;
        for (let i = 0; i < freqData.length; i++) {
          sum += freqData[i];
        }
        const avg = sum / freqData.length;
        const volumePercent = Math.min(100, (avg / 128) * 100);
        setLiveVolume(volumePercent);

        // Track running noise level (minimums)
        setLiveNoise((prevNoise) => {
          if (volumePercent < prevNoise) {
            return volumePercent;
          }
          return prevNoise * 0.98 + volumePercent * 0.02;
        });

        animationFrameIdRef.current = requestAnimationFrame(updateLoop);
      };

      updateLoop();
    } catch (err) {
      console.error("Live audio context analysis failed to load:", err);
    }
  };

  /** Wait for browser to load TTS voices (Chrome loads them asynchronously) */
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

  // Clear Chrome speechSynthesis keepalive timer
  const clearSpeechKeepAlive = () => {
    if (speechKeepAliveRef.current) {
      clearInterval(speechKeepAliveRef.current);
      speechKeepAliveRef.current = null;
    }
  };

  const startRecordingSpeech = async () => {
    if (!recognition) return;
    ignoreSubmitOnEndRef.current = false;

    if (typeof window !== "undefined" && window.speechSynthesis) {
      window.speechSynthesis.cancel();
    }
    setEleanorSpeaking(false);
    setUserAnswer("");
    setLiveTranscript("");
    setIsRecording(true);

    hasSpokenRef.current = false;
    thinkingPauseStartRef.current = Date.now();
    thinkingPauseValRef.current = null;
    pausesCountRef.current = 0;
    lastSpeechTimeRef.current = null;
    maxPeakRef.current = -100;

    await startLiveAudioAnalysis();

    try {
      recognition.start();
      setRecognitionError(null);
    } catch (err) {
      console.warn("Speech recognition start warning:", err);
    }
  };

  // Synthesize Eleanor's voice speaking the question
  const speakQuestion = async (text: string) => {
    if (typeof window === "undefined" || !window.speechSynthesis) return;

    window.speechSynthesis.cancel();
    stopLiveAudioAnalysis(); // Release mic lock to let Bluetooth headphones play Eleanor's voice
    ignoreSubmitOnEndRef.current = true;
    if (recognition) {
      try {
        recognition.stop();
      } catch (e) {}
    }
    setIsRecording(false);
    setEleanorSpeaking(true);
    setRecognitionError(null);

    // Conversational transitions for rounds > 1
    let verbalText = text;
    if (answerCount > 0 && userAnswer) {
      const kw = extractTopicKeyword(userAnswer);
      const transitions = [
        `Interesting. Tell me more about ${kw}. `,
        `I see. How did you approach ${kw} in that case? `,
        `Good example. What would you do differently next time regarding ${kw}? `,
        `That's insightful. Let's dig deeper into the ${kw} aspect. `
      ];
      verbalText = transitions[Math.floor(Math.random() * transitions.length)] + text;
    }

    // CRITICAL: Wait for voices to be available (Chrome loads them async)
    const voices = await waitForVoices();

    // CRITICAL: Delay after cancel() — Chrome silently drops speak() calls
    // that happen immediately after cancel().
    await new Promise(resolve => setTimeout(resolve, 150));

    const utterance = new SpeechSynthesisUtterance(verbalText);
    const targetVoice = voices.find(
      (v) => v.lang.startsWith("en-US") && v.name.includes("Natural")
    ) || voices.find(
      (v) => v.lang.startsWith("en-US")
    ) || voices.find(
      (v) => v.lang.startsWith("en")
    ) || voices[0];

    if (targetVoice) utterance.voice = targetVoice;
    utterance.rate = 0.95;
    utterance.pitch = 1.05;
    utterance.volume = 1.0;

    utterance.onend = () => {
      setEleanorSpeaking(false);
      // Auto-start recording
      startRecordingSpeech();
    };

    utterance.onerror = (e) => {
      console.warn("SpeechSynthesis utterance error:", e);
      setEleanorSpeaking(false);
      setIsRecording(false);
    };

    // Prevent garbage collection of the utterance
    (window as any).activeUtterance = utterance;

    window.speechSynthesis.speak(utterance);
  };

  const handleToggleRecord = async () => {
    if (!recognition) {
      setRecognitionError("Voice transcription is not supported in this browser. Please type your answer below.");
      return;
    }

    if (isRecording) {
      ignoreSubmitOnEndRef.current = true;
      try {
        recognition.stop();
      } catch (e) {}
      setIsRecording(false);
      stopLiveAudioAnalysis();
    } else {
      await startRecordingSpeech();
    }
  };

  // Submit Answer Action called on SpeechRecognition finish
  const submitAnswerAction = useCallback(async (textToSubmit: string) => {
    if (!activeSessionId || !textToSubmit.trim() || isSubmittingAnswer) return;

    setIsSubmittingAnswer(true);
    setError(null);

    // Stop recording first
    if (isRecording) {
      if (recognition) {
        try {
          recognition.stop();
        } catch (e) {}
      }
      setIsRecording(false);
      stopLiveAudioAnalysis();
    }

    const durationSec = (Date.now() - thinkingPauseStartRef.current) / 1000;
    const pacing = calculatePacingAnalysis(textToSubmit, durationSec, thinkingPauseValRef.current, pausesCountRef.current);

    try {
      const token = await getToken();
      const headers: Record<string, string> = {};
      if (token) {
        headers["Authorization"] = `Bearer ${token}`;
      }

      const useMock = process.env.NEXT_PUBLIC_USE_MOCK === "true";
      const API_BASE = useMock ? "/api/interview/mock" : "/api/interview";

      const data = await apiClient.post<{
        feedback: { strengths: string[]; gaps: string[]; score: number; potential_score?: number; growth_path?: string; streak_message?: string | null; example_rewrites?: string[] };
        next_question: string | null;
      }>(
        `${API_BASE}/answer`,
        {
          session_id: activeSessionId,
          user_transcript: textToSubmit,
        },
        { headers } as never
      );

      // Save audio quality calculations
      const noiseVal = measuredNoise || 15.0; // fallback
      const peakVal = maxPeakRef.current;
      const isSoundDbOk = peakVal >= -20 && peakVal <= -10;
      const clarityStatus = (isSoundDbOk && noiseVal < 30) ? "clear" : (peakVal > -30 ? "acceptable" : "poor");

      const roundMetric: ResponseMetrics = {
        round: answerCount + 1,
        question: currentQuestion!,
        transcript: textToSubmit,
        audioQuality: {
          peakAmplitude: parseFloat(peakVal.toFixed(1)),
          noiseLevel: parseFloat(noiseVal.toFixed(1)),
          clarity: clarityStatus
        },
        score: data.feedback.score,
        duration: durationSec.toFixed(1),
        feedback: data.feedback.growth_path || "Growth Mindset active.",
        pacingAnalysis: pacing,
        strengths: data.feedback.strengths,
        gaps: data.feedback.gaps,
        example_rewrites: data.feedback.example_rewrites
      };

      setSessionHistory(prev => [...prev, roundMetric]);
      setFeedback(data.feedback);
      setPacingFeedback(pacing);
      setNextQuestion(data.next_question);
      setAnswerCount((prev) => prev + 1);

      if (!data.next_question) {
        setIsInterviewFinished(true);
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to submit answer.");
    } finally {
      setIsSubmittingAnswer(false);
    }
  }, [activeSessionId, isSubmittingAnswer, answerCount, currentQuestion, measuredNoise, getToken]);

  // Run Pre-flight Checks (Revised wizard flow: Step 1 Mic Access)
  const runPreFlightChecks = async () => {
    setError(null);
    setPreFlightStep(1);
    setCalibrationRetries(0);
    setChecks({
      micAccess: "running",
      internet: "idle",
      micQuality: "idle",
      speaker: "idle",
      latency: "idle",
    });

    try {
      const mediaStream = await navigator.mediaDevices.getUserMedia({ audio: true });
      // Stop tracks immediately to avoid keeping the mic open and locking Bluetooth headphones during speaker test
      mediaStream.getTracks().forEach(track => track.stop());
      setMicStream(null);
      setChecks(prev => ({ ...prev, micAccess: "success" }));
      
      // Enumerate available input/output audio devices
      await loadAudioDevices();

      // Move to step 2: speaker test
      setPreFlightStep(2);
    } catch (err) {
      setChecks(prev => ({ ...prev, micAccess: "failed" }));
      setError("❌ Microphone access denied. Please enable in browser settings.");
    }
  };


  // Play Natural Speech Greeting (Speaker Test)
  const playSpeechGreeting = async () => {
    if (typeof window === "undefined" || !window.speechSynthesis) return;

    window.speechSynthesis.cancel();
    setChecks(prev => ({ ...prev, speaker: "running" }));
    setError(null);

    // Wait for voices to be loaded (fixes silent greeting in Chrome/Edge)
    const voices = await waitForVoices();

    // CRITICAL: Delay after cancel() — Chrome silently drops speak() calls
    // that happen immediately after cancel().
    await new Promise(resolve => setTimeout(resolve, 150));

    const greeting = "Hi, can you hear me clearly? I'm your AI interviewer. Please say 'Yes, I can hear you' to begin.";
    const utterance = new SpeechSynthesisUtterance(greeting);

    // Production settings config
    utterance.rate = 0.95;
    utterance.pitch = 1.0;
    utterance.volume = 1.0;

    const preferredVoice = voices.find(
      (v) => v.name.includes("Google US English") || v.name.includes("Natural") || v.lang.startsWith("en-US")
    ) || voices[0];

    if (preferredVoice) {
      utterance.voice = preferredVoice;
    }

    utterance.onend = () => {
      // Start listening for candidate's voice response after the greeting finishes playing
      startSpeechRecognitionForGreeting();
    };

    utterance.onerror = (e) => {
      console.error("Speech Synthesis error:", e);
      setChecks(prev => ({ ...prev, speaker: "failed" }));
      setError("Failed to play AI greeting. Check system volume or audio output.");
    };

    window.speechSynthesis.speak(utterance);
  };

  // Play test tone through selected speaker ID via Web Audio API (direct routing fallback)
  const playTestTone = async () => {
    try {
      const win = window as WindowWithSpeech;
      const AudioContextClass = win.AudioContext || win.webkitAudioContext;
      if (!AudioContextClass) return;

      const ctx = new AudioContextClass();
      if (ctx.state === "suspended") {
        await ctx.resume();
      }
      
      // Route output to selected speaker
      if (selectedSpeakerId && selectedSpeakerId !== "default" && (ctx as any).setSinkId) {
        await (ctx as any).setSinkId(selectedSpeakerId);
      }

      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = "sine";
      osc.frequency.setValueAtTime(440, ctx.currentTime); // A4 note

      gain.gain.setValueAtTime(0.3, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.9);

      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.start();
      osc.stop(ctx.currentTime + 1.0);

      setTimeout(() => {
        ctx.close().catch(() => {});
      }, 1200);
    } catch (e) {
      console.warn("Failed to play test tone:", e);
    }
  };

  // Listen for "yes" response to speaker test
  const startSpeechRecognitionForGreeting = () => {
    if (typeof window === "undefined") return;
    const win = window as WindowWithSpeech;
    const SpeechRecognitionClass = (win.SpeechRecognition || win.webkitSpeechRecognition) as SpeechRecognitionConstructor;
    if (!SpeechRecognitionClass) {
      console.warn("SpeechRecognition not supported in this browser.");
      return;
    }

    try {
      if (greetingRecognition) {
        try {
          greetingRecognition.stop();
        } catch (e) {}
      }

      const rec = new SpeechRecognitionClass();
      rec.continuous = true;
      rec.interimResults = true;
      rec.lang = "en-US";

      rec.onresult = (event: SpeechRecognitionEvent) => {
        let transcript = "";
        for (let i = event.resultIndex; i < event.results.length; ++i) {
          transcript += event.results[i][0].transcript;
        }

        const text = transcript.toLowerCase();
        if (text.includes("yes") || text.includes("hear") || text.includes("clearly") || text.includes("begin") || text.includes("sure")) {
          rec.stop();
          setChecks(prev => ({ ...prev, speaker: "success" }));
          setTimeout(() => {
            setPreFlightStep(3); // Go to mic calibration
          }, 800);
        }
      };

      rec.onerror = (e) => {
        if (e.error === "no-speech") return;
        console.warn("Greeting speech recognition warning:", e.error);
      };


      rec.start();
      setGreetingRecognition(rec);
    } catch (err) {
      console.error("Greeting SpeechRecognition failed to initialize:", err);
    }
  };

  // Confirm speaker test manually (fail-safe)
  const confirmSpeakerTestManually = () => {
    if (greetingRecognition) {
      try {
        greetingRecognition.stop();
      } catch (e) {}
    }
    if (typeof window !== "undefined" && window.speechSynthesis) {
      window.speechSynthesis.cancel();
    }
    setChecks(prev => ({ ...prev, speaker: "success" }));
    setPreFlightStep(3);
  };

  // Calibration volume, noise floor and SNR (Step 3)
  const recordSoundQualitySample = async () => {
    setChecks(prev => ({ ...prev, micQuality: "running" }));
    setError(null);
    setCalibrationCountdown(5);

    const win = window as WindowWithSpeech;
    const AudioContextClass = win.AudioContext || win.webkitAudioContext;
    if (!AudioContextClass) {
      setError("❌ Web Audio API is not supported in this browser.");
      setChecks(prev => ({ ...prev, micQuality: "failed" }));
      setCalibrationCountdown(0);
      return;
    }

    let activeStream: MediaStream;
    try {
      const constraints = selectedMicId && selectedMicId !== "default"
        ? { audio: { deviceId: selectedMicId } }
        : { audio: true };
      activeStream = await navigator.mediaDevices.getUserMedia(constraints);
      setMicStream(activeStream);
    } catch (err) {
      console.error("Failed to acquire mic stream for calibration:", err);
      setError("❌ Failed to access the selected microphone. Check permissions and connection.");
      setChecks(prev => ({ ...prev, micQuality: "failed" }));
      setCalibrationCountdown(0);
      return;
    }

    const ctx = new AudioContextClass();
    if (ctx.state === "suspended") {
      await ctx.resume();
    }
    if (selectedSpeakerId && selectedSpeakerId !== "default" && (ctx as any).setSinkId) {
      (ctx as any).setSinkId(selectedSpeakerId).catch((e: any) => {
        console.warn("Failed to set sink ID during calibration:", e);
      });
    }
    const analyser = ctx.createAnalyser();
    analyser.fftSize = 2048;

    const source = ctx.createMediaStreamSource(activeStream);
    source.connect(analyser);

    const timeData = new Float32Array(analyser.fftSize);
    const freqData = new Uint8Array(analyser.frequencyBinCount);

    let peakDbList: number[] = [];
    let rmsDbList: number[] = [];
    let speechEnergyHits = 0;
    let totalFrames = 0;
    let animationFrameId: number;

    const updateMeter = () => {
      if (ctx.state === "closed") return;

      // Get Float Time Domain Data for precise time-domain peak and RMS
      analyser.getFloatTimeDomainData(timeData);

      let peakSample = 0;
      let sumSquares = 0;
      for (let i = 0; i < timeData.length; i++) {
        const val = Math.abs(timeData[i]);
        if (val > peakSample) {
          peakSample = val;
        }
        sumSquares += timeData[i] * timeData[i];
      }

      const framePeakDb = peakSample > 0 ? 20 * Math.log10(peakSample) : -100;
      peakDbList.push(framePeakDb);
      setCalibrationLivePeak(framePeakDb);

      const rms = Math.sqrt(sumSquares / timeData.length);
      const frameRmsDb = rms > 0 ? 20 * Math.log10(rms) : -100;
      rmsDbList.push(frameRmsDb);

      // Frequency domain for speech band matching
      analyser.getByteFrequencyData(freqData);
      const rate = ctx.sampleRate;
      const bin80 = Math.round((80 * analyser.fftSize) / rate);
      const bin3000 = Math.round((3000 * analyser.fftSize) / rate);

      let energy = 0;
      for (let i = bin80; i <= bin3000; i++) {
        energy += freqData[i];
      }
      const avgEnergy = energy / (bin3000 - bin80 + 1);
      if (avgEnergy > 45) speechEnergyHits++;
      totalFrames++;

      animationFrameId = requestAnimationFrame(updateMeter);
    };

    // Start meter update loop
    updateMeter();

    const countdownInterval = setInterval(() => {
      setCalibrationCountdown((prev) => {
        if (prev <= 1) {
          clearInterval(countdownInterval);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    setTimeout(() => {
      cancelAnimationFrame(animationFrameId);
      ctx.close().catch(() => {});

      // Release microphone immediately
      activeStream.getTracks().forEach((track) => track.stop());
      setMicStream(null);

      // Calculate final calibration parameters
      const peakDbVal = peakDbList.length > 0 ? Math.max(...peakDbList) : -100;
      const minRmsDb = rmsDbList.length > 0 ? Math.min(...rmsDbList) : -100;
      const noiseDbVal = Math.max(0, 85 + minRmsDb); // Convert to dB SPL scale
      const snrDbVal = peakDbVal - minRmsDb;
      const humanRangeOk = (speechEnergyHits / totalFrames) > 0.02;

      setMeasuredPeak(parseFloat(peakDbVal.toFixed(1)));
      setMeasuredNoise(parseFloat(noiseDbVal.toFixed(1)));
      setMeasuredSnr(parseFloat(snrDbVal.toFixed(1)));
      setVoiceFreqDetected(humanRangeOk);

      // Pass/Fail bounds based on production requirements
      const peakPassed = peakDbVal >= -35 && peakDbVal <= -2;
      const noisePassed = noiseDbVal <= 50;
      const snrPassed = snrDbVal >= 12;

      if (peakPassed && noisePassed && snrPassed) {
        setChecks(prev => ({ ...prev, micQuality: "success" }));
        // Move to step 4: Network speed / latency
        setPreFlightStep(4);
        runNetworkChecks();
      } else {
        setChecks(prev => ({ ...prev, micQuality: "failed" }));
        setCalibrationRetries(prev => prev + 1);

        if (peakDbVal < -35) {
          setError("❌ Too quiet. Speak louder or move mic 2-3 inches closer.");
        } else if (peakDbVal > -2) {
          setError("❌ Too loud, mic is clipping. Move it 6 inches away.");
        } else if (!noisePassed) {
          setError("❌ Too much background noise. Close windows, mute other apps, or move to quieter space.");
        } else if (!snrPassed) {
          setError("❌ Poor audio signal. SNR must be greater than 12dB. Move to a quieter space or speak more clearly.");
        } else if (!humanRangeOk) {
          setError("❌ No human voice frequencies detected in audio. Please speak clearly.");
        }
      }
    }, 5000);
  };

  // Run Network Checks (Step 4)
  const runNetworkChecks = async () => {
    setChecks(prev => ({ ...prev, internet: "running", latency: "running" }));
    setError(null);

    let speedPassed = false;
    let latencyPassed = false;

    // Check internet speed
    try {
      const healthCheck = await fetch(`${apiConfig.baseUrl}/health`, { cache: "no-store" });
      if (!healthCheck.ok) throw new Error("Health check failed");

      const testStart = Date.now();
      const speedCheck = await fetch(`${apiConfig.baseUrl}/health/test-1mb?t=${Date.now()}`, { cache: "no-store" });
      await speedCheck.json();
      const duration = (Date.now() - testStart) / 1000;
      const speed = 8.388608 / duration;
      setSpeedMbps(speed);

      if (speed >= 1.0) {
        speedPassed = true;
        setChecks(prev => ({ ...prev, internet: "success" }));
      } else {
        setChecks(prev => ({ ...prev, internet: "failed" }));
        setError("❌ Internet speed too slow. Requirement: Min 1Mbps for voice practice.");
      }
    } catch (err) {
      setChecks(prev => ({ ...prev, internet: "failed" }));
      setError("❌ No internet connection. Cannot start interview.");
    }

    // Check Latency if speed passed
    if (speedPassed) {
      const start = Date.now();
      try {
        await fetch(`${apiConfig.baseUrl}/health/live?t=${Date.now()}`, { cache: "no-store" });
        const rtt = Date.now() - start;
        setLatencyMs(rtt);
        latencyPassed = true;
        setChecks(prev => ({ ...prev, latency: "success" }));
      } catch (err) {
        setChecks(prev => ({ ...prev, latency: "failed" }));
        setError("❌ Connection latency check failed. Poor network ping.");
      }
    }

    if (speedPassed && latencyPassed) {
      // Both network checks passed, move to step 5 (Lock & Confidence Anchor)
      setPreFlightStep(5);
    }
  };

  // Lock calibration to IndexedDB and proceed (Step 5)
  const handleLockAndProceed = async () => {
    warmUpAudioAndSpeech();
    const timestamp = Date.now();
    const calibrationState = {
      calibratedAt: timestamp,
      peakAmplitude: measuredPeak || -12.0,
      noiseFloor: measuredNoise || 25.0,
      snr: measuredSnr || 45.0,
      locked: true,
      expiryTime: timestamp + (24 * 60 * 60 * 1000) // Valid for 24 hours
    };

    await saveCalibrationState(calibrationState);

    // Stop preflight mic streams
    if (micStream) {
      micStream.getTracks().forEach((track) => track.stop());
      setMicStream(null);
    }
    if (greetingRecognition) {
      try {
        greetingRecognition.stop();
      } catch (e) {}
    }
    setShowPreFlight(false);
    setSessionHistory([]);
    handleStartInterview();
  };


  // Setup form submit
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedResumeId || !targetCompany || !interviewType || !selectedResume) {
      setError("Please select a resume, target company, and interview type.");
      return;
    }

    setIsSubmitting(true);
    setError(null);
    setSuccess(false);

    try {
      const token = await getToken();
      if (!token) throw new Error("Not authenticated");

      const experienceLevel = selectedResume.experience_level || "Mid-level";

      const data = await apiClient.post<InterviewProfile>(
        "/api/interview/setup",
        {
          resume_id: selectedResumeId,
          target_company: targetCompany,
          interview_type: interviewType,
          experience_level: experienceLevel,
        },
        {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        } as never
      );

      setProfile(data);
      setSuccess(true);
      setShowSetupForm(false);
      window.setTimeout(() => setSuccess(false), 4000);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to save setup.");
    } finally {
      setIsSubmitting(false);
    }
  };

  // Call API to start practice session
  const handleStartInterview = async () => {
    if (!profile) return;
    setIsSubmitting(true);
    setError(null);
    try {
      const token = await getToken();
      const headers: Record<string, string> = {};
      if (token) {
        headers["Authorization"] = `Bearer ${token}`;
      }

      const useMock = process.env.NEXT_PUBLIC_USE_MOCK === "true";
      const API_BASE = useMock ? "/api/interview/mock" : "/api/interview";

      const data = await apiClient.post<{
        session_id: number;
        question: string;
      }>(
        `${API_BASE}/start`,
        { interview_profile_id: profile.id, target_company: profile.target_company, interview_type: profile.interview_type },
        { headers } as never
      );

      setActiveSessionId(data.session_id);
      setCurrentQuestion(data.question);
      setUserAnswer("");
      setFeedback(null);
      setNextQuestion(null);
      setIsInterviewFinished(false);
      setAnswerCount(0);
      setViewingReport(false);
      setSessionHistory([]);

      // Start Eleanor speaking first question
      speakQuestion(data.question);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to start interview.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleNextQuestion = () => {
    // NOTE: Do NOT call warmUpAudioAndSpeech() here — it speaks a silent
    // utterance which conflicts with speakQuestion's cancel()+speak() flow
    // and causes Chrome to silently drop the real utterance.
    if (nextQuestion) {
      setCurrentQuestion(nextQuestion);
      setUserAnswer("");
      setFeedback(null);
      setPacingFeedback(null);
      setNextQuestion(null);
      speakQuestion(nextQuestion);
    } else {
      setIsInterviewFinished(true);
    }
  };


  const handleExitInterview = () => {
    if (window.confirm("Are you sure you want to end this interview session? Your progress will be lost.")) {
      cleanupStates();
    }
  };

  // Effects Registered at Bottom to Ensure Helper Functions Are Already Declared

  // Fetch analyzed resumes on mount
  useEffect(() => {
    refreshResumes();
  }, [refreshResumes]);

  // Click outside listener for company dropdown
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsDropdownOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, []);

  // Sync references to avoid stale callbacks
  useEffect(() => {
    handleSubmitAnswerRef.current = () => {
      if (userAnswer.trim()) {
        submitAnswerAction(userAnswer);
      }
    };
  }, [userAnswer, submitAnswerAction]);

  // Default select the latest resume if no profile is loaded (asynchronous to avoid cascading renders)
  useEffect(() => {
    if (!selectedResumeId && analyzedResumes.length > 0) {
      const firstId = analyzedResumes[0].id;
      Promise.resolve().then(() => {
        setSelectedResumeId(firstId);
      });
    }
  }, [analyzedResumes, selectedResumeId]);

  // Online / Offline monitor
  useEffect(() => {
    const handleOnline = () => setOnline(true);
    const handleOffline = () => setOnline(false);
    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);
    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, []);

  // Listen for audio device changes (plugging in or unplugging headphones/mics)
  useEffect(() => {
    if (typeof window !== "undefined" && navigator.mediaDevices) {
      navigator.mediaDevices.addEventListener("devicechange", loadAudioDevices);
      return () => {
        navigator.mediaDevices.removeEventListener("devicechange", loadAudioDevices);
      };
    }
  }, [loadAudioDevices]);

  // Load existing profile if any
  useEffect(() => {
    async function loadProfile() {
      try {
        const token = await getToken();
        if (!token) return;

        const data = await apiClient.get<InterviewProfile>("/api/interview/setup", {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        } as never);

        if (data) {
          setProfile(data);
          setSelectedResumeId(data.resume_id);
          setTargetCompany(data.target_company);
          setSearchQuery(data.target_company);
          setInterviewType(data.interview_type);
        }
      } catch (err) {
        console.log("No interview profile found, rendering fresh setup form.", err);
      } finally {
        setIsLoadingProfile(false);
      }
    }

    loadProfile();
  }, [getToken]);

  // Listen for custom resume upload/delete events
  useEffect(() => {
    const handleResumeUploaded = (e: Event) => {
      const customEvent = e as CustomEvent<{ newResume: { id: number } }>;
      const newResume = customEvent.detail.newResume;
      refreshResumes();
      setSelectedResumeId(newResume.id);
      setTargetCompany("");
      setSearchQuery("");
      setInterviewType("");
    };

    const handleResumeDeleted = (e: Event) => {
      const customEvent = e as CustomEvent<{ deletedId: number }>;
      const deletedId = customEvent.detail.deletedId;
      refreshResumes();
      if (selectedResumeId === deletedId) {
        setSelectedResumeId(null);
      }
    };

    window.addEventListener("resume-uploaded", handleResumeUploaded);
    window.addEventListener("resume-deleted", handleResumeDeleted);
    return () => {
      window.removeEventListener("resume-uploaded", handleResumeUploaded);
      window.removeEventListener("resume-deleted", handleResumeDeleted);
    };
  }, [selectedResumeId, refreshResumes]);

  // Speech Recognition setup (Web Speech API)
  useEffect(() => {
    if (typeof window !== "undefined") {
      const win = window as WindowWithSpeech;
      const SpeechRecognitionClass = (win.SpeechRecognition || win.webkitSpeechRecognition) as SpeechRecognitionConstructor;
      if (SpeechRecognitionClass) {
        const rec = new SpeechRecognitionClass();
        rec.continuous = true;
        rec.interimResults = true;
        rec.lang = "en-US";

        rec.onstart = () => {
          console.log("Speech recognition active");
          setRecognitionError(null);
        };

        rec.onresult = (event: SpeechRecognitionEvent) => {
          let interimTranscript = "";
          let finalTranscript = "";

          for (let i = 0; i < event.results.length; ++i) {
            if (event.results[i].isFinal) {
              finalTranscript += event.results[i][0].transcript + " ";
            } else {
              interimTranscript += event.results[i][0].transcript;
            }
          }

          const currentText = (finalTranscript + interimTranscript).trim();
          if (currentText) {
            // First speech detected: Record thinking pause
            if (!hasSpokenRef.current) {
              hasSpokenRef.current = true;
              const now = Date.now();
              const pauseSeconds = (now - thinkingPauseStartRef.current) / 1000;
              thinkingPauseValRef.current = pauseSeconds.toFixed(1) + "s";
              lastSpeechTimeRef.current = now;
            } else {
              // Track speech pauses
              const now = Date.now();
              const gap = (now - lastSpeechTimeRef.current!) / 1000;
              if (gap >= 0.6 && gap < 1.2) {
                pausesCountRef.current += 1;
              }
              lastSpeechTimeRef.current = now;
            }

            setLiveTranscript(currentText);
            setUserAnswer(currentText);

            // Silence detection: Auto-stop after 1.2s quiet
            if (silenceTimeoutRef.current) {
              clearTimeout(silenceTimeoutRef.current);
            }
            silenceTimeoutRef.current = setTimeout(() => {
              console.log("Silence limit met (1.2s), auto-submitting...");
              rec.stop();
            }, 1200);
          }
        };

        rec.onerror = (event: { error: string }) => {
          if (event.error === "no-speech") {
            console.log("Speech recognition: no speech detected (silence).");
            ignoreSubmitOnEndRef.current = true;
            return;
          }
          console.warn("Speech recognition warning:", event.error);
          ignoreSubmitOnEndRef.current = true;
          if (event.error === "audio-capture") {
            setRecognitionError("❌ Microphone capture failed. Check if it is unplugged or in use by another app.");
          } else if (event.error === "not-allowed") {
            setRecognitionError("❌ Microphone permission denied.");
          } else if (event.error === "network") {
            // Network error: Chrome's speech service is unreachable.
            // Auto-retry up to 3 times with a short delay.
            setRecognitionError("⚠️ Speech recognition network error. Retrying... Use the text area below to type your answer if voice doesn't work.");
            setTimeout(() => {
              try {
                rec.stop();
              } catch (e) {}
              setTimeout(() => {
                try {
                  rec.start();
                  setRecognitionError(null);
                } catch (e) {
                  console.warn("Speech recognition retry failed:", e);
                  setRecognitionError("❌ Speech recognition unavailable. Please type your answer in the text area below.");
                }
              }, 500);
            }, 1000);
            return; // Don't stop the flow
          } else {
            setRecognitionError(`❌ Speech recognition error: ${event.error}`);
          }
        };

        rec.onend = () => {
          console.log("Speech recognition stopped");
          setIsRecording(false);
          stopLiveAudioAnalysis();
          if (silenceTimeoutRef.current) {
            clearTimeout(silenceTimeoutRef.current);
          }
          if (ignoreSubmitOnEndRef.current) {
            console.log("Bypassing auto-submit inside onend");
            ignoreSubmitOnEndRef.current = false;
            return;
          }
          // Submit response transcript if it exists
          handleSubmitAnswerRef.current();
        };

        setRecognition(rec);
      }
    }
  }, []);

  if (!isBrowserCompatible) {
    return (
      <div className="p-8 bg-card rounded-xl border border-destructive/20 shadow-md text-center max-w-lg mx-auto">
        <div className="w-12 h-12 bg-destructive/10 rounded-full flex items-center justify-center mx-auto text-destructive mb-4">
          <VolumeX className="w-6 h-6" />
        </div>
        <h3 className="text-lg font-bold text-foreground">Browser Compatibility Error</h3>
        <p className="text-sm text-muted-foreground leading-relaxed mt-2">
          Your browser does not support voice interviews. Please use Chrome, Edge, or Safari which provide native Web Speech APIs.
        </p>
      </div>
    );
  }

  if (isLoadingResumes || isLoadingProfile) {
    return (
      <div className="flex items-center justify-center p-8 bg-card rounded-xl border border-border shadow-sm">
        <div className="flex flex-col items-center gap-3">
          <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin"></div>
          <p className="text-sm font-medium text-muted-foreground">Loading interview configuration...</p>
        </div>
      </div>
    );
  }

  if (analyzedResumes.length === 0) {
    return (
      <div className="p-8 bg-card rounded-xl border border-border shadow-sm text-center">
        <div className="max-w-md mx-auto space-y-4">
          <div className="w-12 h-12 bg-amber-500/10 rounded-full flex items-center justify-center mx-auto text-amber-400 text-xl font-bold">
            !
          </div>
          <h3 className="text-lg font-semibold text-foreground">Resume Analysis Needed</h3>
          <p className="text-sm text-muted-foreground leading-relaxed">
            We couldn&apos;t find any fully analyzed resumes. Please upload and verify a resume in the panel below before configuring your interview profile.
          </p>
        </div>
      </div>
    );
  }

  const getVolumePercentage = (dbVal: number) => {
    if (dbVal <= -60) return 0;
    if (dbVal >= 0) return 100;
    const percent = ((dbVal + 60) / 60) * 100;
    return Math.max(0, Math.min(100, Math.round(percent)));
  };

  const renderPreFlightStepContent = () => {
    switch (preFlightStep) {
      case 1:
        return (
          <div className="space-y-4 animate-in fade-in duration-200">
            <div className="p-6 bg-muted/20 border border-border rounded-lg flex flex-col items-center text-center gap-3">
              <div className="p-3 rounded-full bg-primary/10 text-primary animate-pulse">
                <Mic className="w-8 h-8" />
              </div>
              <h3 className="text-base font-bold text-foreground">Microphone Access Required</h3>
              <p className="text-xs text-muted-foreground max-w-sm leading-relaxed">
                ElevateIQ needs access to your microphone to listen to your responses during the interview. Please click "Allow" when prompted by your browser.
              </p>
              {checks.micAccess === "failed" && (
                <button
                  type="button"
                  onClick={runPreFlightChecks}
                  className="mt-2 cursor-pointer text-xs font-bold bg-primary text-primary-foreground hover:bg-primary/90 py-2.5 px-5 rounded-lg shadow-sm transition-all"
                >
                  Grant Microphone Access
                </button>
              )}
            </div>
          </div>
        );
      case 2:
        return (
          <div className="space-y-4 animate-in fade-in duration-200">
            <div className="p-6 bg-muted/20 border border-border rounded-lg flex flex-col items-center text-center gap-3">
              <div className="p-3 rounded-full bg-primary/10 text-primary">
                <Volume2 className="w-8 h-8 animate-bounce" />
              </div>
              <h3 className="text-base font-bold text-foreground">Speaker & Audio Output Test</h3>
              <p className="text-xs text-muted-foreground max-w-sm leading-relaxed">
                We are playing a natural voice greeting to verify you can hear the interviewer clearly.
              </p>
              
              <div className="flex flex-col gap-3 items-center w-full mt-2">
                <button
                  type="button"
                  onClick={playSpeechGreeting}
                  className="cursor-pointer text-xs font-bold bg-primary text-primary-foreground hover:bg-primary/90 py-2.5 px-6 rounded-lg flex items-center gap-2 shadow-sm transition-all"
                >
                  <Play className="w-3.5 h-3.5 fill-current" />
                  {checks.speaker === "running" ? "Greeting Playing..." : "Play AI Greeting"}
                </button>

                <div className="bg-background/40 p-4 rounded-lg border border-border/50 max-w-md w-full flex flex-col items-center gap-3 mt-2">
                  <span className="text-xs font-semibold">Did you hear the greeting?</span>
                  <span className="text-[11px] text-muted-foreground italic leading-relaxed">
                    &ldquo;Hi, can you hear me clearly? I&apos;m your AI interviewer. Please say &apos;Yes, I can hear you&apos; to begin.&rdquo;
                  </span>
                  <div className="flex gap-3 mt-1">
                    <button
                      type="button"
                      onClick={confirmSpeakerTestManually}
                      className="cursor-pointer text-xs font-extrabold bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 border border-emerald-500/20 py-2 px-6 rounded"
                    >
                      Yes, I hear you
                    </button>
                    <button
                      type="button"
                      onClick={playSpeechGreeting}
                      className="cursor-pointer text-xs font-extrabold bg-destructive/10 hover:bg-destructive/20 text-destructive-foreground border border-destructive/20 py-2 px-6 rounded"
                    >
                      No, repeat greeting
                    </button>
                  </div>
                  <div className="flex flex-col items-center gap-1 mt-2">
                    <button
                      type="button"
                      onClick={playTestTone}
                      className="cursor-pointer text-[10px] font-semibold text-muted-foreground hover:text-foreground underline transition-all"
                    >
                      Still hear nothing? Play 1s test tone to headphones
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        );
      case 3:
        return (
          <div className="space-y-4 animate-in fade-in duration-200">
            <div className="p-6 bg-muted/20 border border-border rounded-lg flex flex-col gap-4">
              <div className="flex flex-col items-center text-center gap-1">
                <div className="p-3 rounded-full bg-primary/10 text-primary">
                  <Sparkles className="w-8 h-8" />
                </div>
                <h3 className="text-base font-bold text-foreground">Microphone Calibration & Ambient Noise</h3>
                <p className="text-xs text-muted-foreground max-w-md mt-1 leading-relaxed">
                  We will record a 5-second sample to verify volume levels and room quietness.
                </p>
                <span className="text-xs text-foreground font-semibold mt-3 max-w-md">
                  Read aloud: <strong className="text-primary font-black">&ldquo;Test, one, two, three. Practice makes perfect.&rdquo;</strong>
                </span>
              </div>

              {/* Live Volume Peak Meter */}
              {calibrationCountdown > 0 && (
                <div className="space-y-2.5 max-w-md mx-auto w-full bg-background/50 p-4 rounded-lg border border-border/80 shadow-sm animate-in zoom-in-95 duration-150">
                  <div className="flex items-center justify-between text-[11px] font-bold text-muted-foreground uppercase">
                    <span>Live Input Peak Level</span>
                    <span className="text-primary font-mono">{calibrationLivePeak.toFixed(1)} dB</span>
                  </div>
                  <div className="h-4 bg-muted rounded-full overflow-hidden border border-border flex p-[2px]">
                    <div
                      className={`h-full rounded-full transition-all duration-75 ${
                        calibrationLivePeak > -2 ? "bg-destructive animate-pulse" :
                        calibrationLivePeak >= -35 ? "bg-emerald-500" :
                        "bg-amber-500"
                      }`}
                      style={{ width: `${getVolumePercentage(calibrationLivePeak)}%` }}
                    ></div>
                  </div>
                  <div className="flex justify-between text-[9px] text-muted-foreground pt-0.5">
                    <span>Quiet (&lt;-35 dB)</span>
                    <span className="text-emerald-400 font-bold">Optimal (-35 to -2 dB)</span>
                    <span>Loud (&gt;-2 dB)</span>
                  </div>
                </div>
              )}

              <div className="flex flex-col items-center gap-2 mt-2">
                <button
                  type="button"
                  onClick={recordSoundQualitySample}
                  disabled={calibrationCountdown > 0}
                  className="cursor-pointer text-xs font-bold bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50 py-3 px-6 rounded-lg shadow-sm transition-all"
                >
                  {calibrationCountdown > 0 ? `Recording... ${calibrationCountdown}s` : "Record 5s Voice Sample"}
                </button>

                {calibrationCountdown === 0 && checks.micQuality === "failed" && error && (
                  <div className="p-3.5 bg-destructive/10 border border-destructive/20 text-destructive-foreground text-xs font-semibold rounded-lg text-center max-w-md w-full mt-2">
                    {error}
                  </div>
                )}

                {/* Bypass button for troubleshooting */}
                {calibrationRetries >= 3 && calibrationCountdown === 0 && (
                  <div className="mt-4 p-4 bg-amber-500/10 border border-amber-500/20 text-amber-400 rounded-lg text-center max-w-md w-full space-y-2">
                    <p className="text-[11px] leading-relaxed">
                      ⚠️ Having trouble calibrating? If you are confident your microphone works, you can bypass this step.
                    </p>
                    <button
                      type="button"
                      onClick={() => {
                        setChecks(prev => ({ ...prev, micQuality: "success" }));
                        setPreFlightStep(4);
                        runNetworkChecks();
                      }}
                      className="cursor-pointer text-xs font-bold bg-amber-500 text-black hover:bg-amber-400 py-1.5 px-4 rounded-lg shadow-sm"
                    >
                      Bypass & Proceed
                    </button>
                  </div>
                )}
              </div>
            </div>
          </div>
        );
      case 4:
        return (
          <div className="space-y-4 animate-in fade-in duration-200">
            <div className="p-6 bg-muted/20 border border-border rounded-lg flex flex-col items-center text-center gap-3">
              <div className="p-3 rounded-full bg-primary/10 text-primary">
                <Wifi className="w-8 h-8 animate-pulse" />
              </div>
              <h3 className="text-base font-bold text-foreground">Evaluating Network Quality</h3>
              <p className="text-xs text-muted-foreground max-w-sm leading-relaxed">
                Measuring download speed and server connection latency...
              </p>

              <div className="w-full max-w-md space-y-3 mt-2 text-left">
                <div className="flex items-center justify-between p-3.5 bg-background/40 border border-border/50 rounded-lg">
                  <div className="flex items-center gap-2">
                    <Wifi className="w-4 h-4 text-muted-foreground" />
                    <span className="text-xs font-semibold text-foreground">Internet Speed</span>
                  </div>
                  <div>
                    {checks.internet === "success" && (
                      <span className="text-xs font-bold text-emerald-400 bg-emerald-500/10 px-2.5 py-1 rounded-full">
                        {speedMbps !== null ? `${speedMbps.toFixed(2)} Mbps` : "Stable"}
                      </span>
                    )}
                    {checks.internet === "failed" && <span className="text-xs font-bold text-destructive bg-destructive/10 px-2.5 py-1 rounded-full">Slow</span>}
                    {checks.internet === "running" && <div className="w-4 h-4 border-2 border-primary border-t-transparent rounded-full animate-spin"></div>}
                  </div>
                </div>

                <div className="flex items-center justify-between p-3.5 bg-background/40 border border-border/50 rounded-lg">
                  <div className="flex items-center gap-2">
                    <Terminal className="w-4 h-4 text-muted-foreground" />
                    <span className="text-xs font-semibold text-foreground">Connection Latency</span>
                  </div>
                  <div>
                    {checks.latency === "success" && (
                      <span className={`text-xs font-bold px-2.5 py-1 rounded-full ${
                        latencyMs !== null && latencyMs < 200 ? "bg-emerald-500/10 text-emerald-400" : "bg-amber-500/10 text-amber-400"
                      }`}>
                        {latencyMs !== null ? `${latencyMs} ms` : "Excellent"}
                      </span>
                    )}
                    {checks.latency === "failed" && <span className="text-xs font-bold text-destructive bg-destructive/10 px-2.5 py-1 rounded-full">High Latency</span>}
                    {checks.latency === "running" && <div className="w-4 h-4 border-2 border-primary border-t-transparent rounded-full animate-spin"></div>}
                  </div>
                </div>
              </div>

              {error && (
                <div className="p-3 bg-destructive/10 border border-destructive/20 text-destructive-foreground text-xs font-semibold rounded-lg text-center max-w-md w-full mt-2">
                  {error}
                </div>
              )}
            </div>
          </div>
        );
      case 5:
        return (
          <div className="space-y-4 animate-in fade-in duration-200">
            <div className="p-6 bg-emerald-500/5 border border-emerald-500/20 rounded-xl flex flex-col items-center text-center gap-4 relative overflow-hidden">
              <div className="absolute top-0 right-0 w-24 h-24 bg-emerald-500/5 rounded-full blur-2xl pointer-events-none"></div>
              
              <div className="w-16 h-16 bg-emerald-500/10 rounded-full flex items-center justify-center text-emerald-400">
                <CheckCircle className="w-8 h-8" />
              </div>

              <h2 className="text-lg font-black text-emerald-400 uppercase tracking-widest animate-pulse">
                Audio Locked &amp; Verified
              </h2>

              <div className="space-y-3 max-w-lg leading-relaxed text-xs">
                <p className="text-foreground font-bold">
                  Your setup is professional-grade. You won&apos;t need to recalibrate for 24 hours. Your microphone is clear. Your internet is fast. You&apos;re ready.
                </p>
                <p className="text-muted-foreground italic bg-background/50 p-3.5 rounded-lg border border-border/50 border-dashed">
                  &ldquo;Remember: Top candidates sound natural and conversational, not perfect. You&apos;re calibrated to sound like YOU, not a podcast host. This is good.&rdquo;
                </p>
              </div>

              <div className="text-sm font-black text-emerald-400 flex items-center gap-2 mt-2">
                <span className="px-3 py-1 bg-emerald-500/10 border border-emerald-500/20 rounded">READY</span>
                <span className="text-muted-foreground font-bold">•</span>
                <span className="px-3 py-1 bg-emerald-500/10 border border-emerald-500/20 rounded">CONFIDENT</span>
                <span className="text-muted-foreground font-bold">•</span>
                <span className="px-3 py-1 bg-emerald-500/10 border border-emerald-500/20 rounded">PROCEED</span>
              </div>

              <button
                type="button"
                onClick={handleLockAndProceed}
                className="mt-4 cursor-pointer bg-emerald-500 hover:bg-emerald-400 text-black font-extrabold text-sm py-3.5 px-8 rounded-lg shadow-lg flex items-center gap-2 transition-all transform hover:scale-105"
              >
                PROCEED TO INTERVIEW
                <ArrowRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        );
      default:
        return null;
    }
  };

  // Pre-flight checks UI screen
  if (showPreFlight) {
    return (
      <div className="bg-card rounded-xl border border-border shadow-md overflow-hidden transition-all duration-200">
        <div className="border-b border-border px-6 py-4 bg-muted/10 flex items-center justify-between">
          <div>
            <h2 className="text-lg font-bold text-foreground">Pre-Flight Interview Setup</h2>
            <p className="text-xs text-muted-foreground mt-1">
              Verify your equipment and connection quality for the optimal voice interview experience.
            </p>
          </div>
          <button
            onClick={() => {
              if (micStream) {
                micStream.getTracks().forEach((track) => track.stop());
                setMicStream(null);
              }
              if (greetingRecognition) {
                try {
                  greetingRecognition.stop();
                } catch (e) {}
              }
              if (typeof window !== "undefined" && window.speechSynthesis) {
                window.speechSynthesis.cancel();
              }
              setShowPreFlight(false);
            }}
            className="cursor-pointer text-xs font-semibold bg-muted hover:bg-muted/80 text-foreground border border-border py-2 px-4 rounded-lg transition-all"
          >
            Cancel Setup
          </button>
        </div>

        {/* Wizard Progress Stepper */}
        <div className="px-6 py-4 border-b border-border bg-muted/5 flex items-center justify-between">
          <div className="flex items-center gap-2 w-full max-w-xl mx-auto justify-between text-xs font-bold text-muted-foreground">
            <span className={`flex items-center gap-1.5 pb-1 border-b-2 transition-all ${preFlightStep >= 1 ? "text-primary border-primary" : "border-transparent"}`}>
              <span className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] ${preFlightStep >= 1 ? "bg-primary/20 text-primary" : "bg-muted text-muted-foreground"}`}>1</span>
              Mic Access
            </span>
            <span className="text-muted-foreground/30 font-light">&rarr;</span>
            <span className={`flex items-center gap-1.5 pb-1 border-b-2 transition-all ${preFlightStep >= 2 ? "text-primary border-primary" : "border-transparent"}`}>
              <span className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] ${preFlightStep >= 2 ? "bg-primary/20 text-primary" : "bg-muted text-muted-foreground"}`}>2</span>
              Speaker Test
            </span>
            <span className="text-muted-foreground/30 font-light">&rarr;</span>
            <span className={`flex items-center gap-1.5 pb-1 border-b-2 transition-all ${preFlightStep >= 3 ? "text-primary border-primary" : "border-transparent"}`}>
              <span className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] ${preFlightStep >= 3 ? "bg-primary/20 text-primary" : "bg-muted text-muted-foreground"}`}>3</span>
              Calibration
            </span>
            <span className="text-muted-foreground/30 font-light">&rarr;</span>
            <span className={`flex items-center gap-1.5 pb-1 border-b-2 transition-all ${preFlightStep >= 4 ? "text-primary border-primary" : "border-transparent"}`}>
              <span className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] ${preFlightStep >= 4 ? "bg-primary/20 text-primary" : "bg-muted text-muted-foreground"}`}>4</span>
              Network
            </span>
            <span className="text-muted-foreground/30 font-light">&rarr;</span>
            <span className={`flex items-center gap-1.5 pb-1 border-b-2 transition-all ${preFlightStep >= 5 ? "text-primary border-primary" : "border-transparent"}`}>
              <span className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] ${preFlightStep >= 5 ? "bg-primary/20 text-primary" : "bg-muted text-muted-foreground"}`}>5</span>
              Ready
            </span>
          </div>
        </div>

        {/* Audio Device Settings Bar */}
        <div className="px-6 py-3 border-b border-border bg-muted/20 flex flex-wrap gap-4 items-center justify-between text-xs">
          <div className="flex items-center gap-2">
            <Settings className="w-4 h-4 text-muted-foreground animate-spin-slow" />
            <span className="font-bold text-foreground">Audio Hardware Configuration</span>
            <span className="text-[10px] text-muted-foreground italic">(Speech synthesis uses OS default)</span>
          </div>
          <div className="flex flex-wrap gap-3 items-center">
            {availableMics.length > 0 && (
              <div className="flex items-center gap-1.5">
                <span className="text-muted-foreground font-medium">Mic:</span>
                <select
                  value={selectedMicId}
                  onChange={(e) => {
                    setSelectedMicId(e.target.value);
                  }}
                  className="bg-background border border-border rounded px-2.5 py-1 text-xs text-foreground outline-none focus:ring-1 focus:ring-primary focus:border-primary cursor-pointer max-w-[200px] truncate"
                >
                  {availableMics.map(m => (
                    <option key={m.deviceId} value={m.deviceId}>
                      {m.label || `Microphone (${m.deviceId.slice(0, 5)}...)`}
                    </option>
                  ))}
                </select>
              </div>
            )}
            {availableSpeakers.length > 0 && (
              <div className="flex items-center gap-1.5">
                <span className="text-muted-foreground font-medium">Speaker:</span>
                <select
                  value={selectedSpeakerId}
                  onChange={(e) => setSelectedSpeakerId(e.target.value)}
                  className="bg-background border border-border rounded px-2.5 py-1 text-xs text-foreground outline-none focus:ring-1 focus:ring-primary focus:border-primary cursor-pointer max-w-[200px] truncate"
                >
                  {availableSpeakers.map(s => (
                    <option key={s.deviceId} value={s.deviceId}>
                      {s.label || `Speaker (${s.deviceId.slice(0, 5)}...)`}
                    </option>
                  ))}
                </select>
              </div>
            )}
          </div>
        </div>

        <div className="p-6">
          {renderPreFlightStepContent()}
        </div>
      </div>
    );
  }


  // Active Practice Interview Session UI
  if (activeSessionId && currentQuestion) {
    return (
      <div className="bg-card rounded-xl border border-border shadow-md overflow-hidden transition-all duration-200">
        {/* Header bar */}
        <div className="border-b border-border px-6 py-4 bg-muted/20 flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2">
              <span className="relative flex h-2.5 w-2.5">
                {online ? (
                  <>
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                    <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-emerald-500"></span>
                  </>
                ) : (
                  <>
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-destructive opacity-75"></span>
                    <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-destructive"></span>
                  </>
                )}
              </span>
              <h2 className="text-base font-bold text-foreground">
                Practice Session
              </h2>
            </div>
            <span className="text-xs text-muted-foreground border-l border-border pl-4">
              {profile?.interview_type.toUpperCase()} Loop • {profile?.target_company}
            </span>
          </div>
          
          <button
            onClick={handleExitInterview}
            className="cursor-pointer text-xs font-semibold bg-destructive/10 text-destructive hover:bg-destructive/20 border border-destructive/20 py-2 px-4 rounded-lg flex items-center gap-1.5 transition-all"
          >
            <LogOut className="w-3.5 h-3.5" />
            End Session
          </button>
        </div>

        {/* Content Body */}
        <div className="p-6 space-y-6">
          
          {/* Avatar Waveform Display */}
          <div className="flex flex-col items-center justify-center py-6 bg-muted/10 border border-border/50 rounded-lg space-y-3 relative overflow-hidden">
            <div className="absolute top-0 right-0 w-48 h-48 bg-primary/5 rounded-full blur-3xl pointer-events-none"></div>
            
            {/* Avatar representation of Eleanor */}
            <div className={`w-24 h-24 rounded-full border-4 flex items-center justify-center transition-all duration-300 relative shadow-inner ${
              eleanorSpeaking ? "bg-primary/10 border-primary animate-pulse shadow-primary/20" :
              isRecording ? "bg-destructive/5 border-destructive/40 animate-pulse shadow-destructive/10" :
              "bg-muted border-border"
            }`}>
              {eleanorSpeaking ? (
                <Volume2 className="w-10 h-10 text-primary" />
              ) : isRecording ? (
                <Mic className="w-10 h-10 text-destructive" />
              ) : (
                <User className="w-10 h-10 text-muted-foreground" />
              )}

              {/* Ping Ring animation */}
              {isRecording && (
                <span className="absolute inset-0 rounded-full border-2 border-destructive animate-ping opacity-25"></span>
              )}
            </div>

            <span className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
              {eleanorSpeaking ? "Interviewer Eleanor Speaking" :
               isRecording ? "Listening to response..." : "Standing By"}
            </span>

            {/* Simulated Animated voice-speech waveforms */}
            {eleanorSpeaking && (
              <div className="flex items-center gap-1.5 h-8">
                <span className="w-1 bg-primary rounded-full animate-[bounce_0.8s_infinite] h-4"></span>
                <span className="w-1 bg-primary rounded-full animate-[bounce_0.8s_infinite_0.15s] h-6"></span>
                <span className="w-1 bg-primary rounded-full animate-[bounce_0.8s_infinite_0.3s] h-5"></span>
                <span className="w-1 bg-primary rounded-full animate-[bounce_0.8s_infinite_0.45s] h-7"></span>
                <span className="w-1 bg-primary rounded-full animate-[bounce_0.8s_infinite_0.6s] h-3"></span>
              </div>
            )}

            {isRecording && (
              <div className="flex items-center gap-1.5 h-8">
                <span className="w-1 bg-destructive rounded-full animate-[bounce_0.6s_infinite] h-2"></span>
                <span className="w-1 bg-destructive rounded-full animate-[bounce_0.6s_infinite_0.1s] h-4"></span>
                <span className="w-1 bg-destructive rounded-full animate-[bounce_0.6s_infinite_0.2s] h-5"></span>
                <span className="w-1 bg-destructive rounded-full animate-[bounce_0.6s_infinite_0.3s] h-3"></span>
              </div>
            )}
          </div>

          {/* Question Box */}
          <div className="bg-muted/30 rounded-lg p-5 border border-border">
            <div className="flex items-start gap-3.5">
              <div className="w-9 h-9 rounded-full bg-primary/10 border border-primary/20 flex items-center justify-center text-primary shrink-0">
                <Sparkles className="w-4 h-4" />
              </div>
              <div className="space-y-1">
                <span className="text-xs font-bold text-primary uppercase tracking-wider">Active Question</span>
                <p className="text-sm text-foreground leading-relaxed font-medium">
                  {currentQuestion}
                </p>
              </div>
            </div>
          </div>

          {/* Recognition Error Alert */}
          {recognitionError && (
            <div className="p-3.5 bg-destructive/10 border border-destructive/20 text-destructive-foreground text-xs font-semibold rounded-lg text-center w-full animate-in fade-in duration-200">
              {recognitionError}
              <div className="mt-1 text-[10px] font-medium text-muted-foreground">
                Try switching microphone inputs or ensuring other communication tools (Teams, Zoom) are closed.
              </div>
            </div>
          )}

          {/* Live transcript Preview Captions */}
          {isRecording && (
            <div className="p-4 bg-muted/40 border border-border/60 rounded-lg space-y-2">
              <span className="text-xs font-bold text-muted-foreground uppercase tracking-wider block">Live Captions</span>
              <p className="text-sm italic text-foreground leading-relaxed min-h-[40px] pl-2 border-l-2 border-primary/40">
                {liveTranscript || "Start speaking to answer..."}
              </p>
              <div className="text-[10px] text-muted-foreground bg-primary/5 p-2 rounded flex items-center gap-2">
                <span className="w-1.5 h-1.5 rounded-full bg-primary animate-ping"></span>
                Voice-First Active: Speech Recognition is active. Pausing for 2 seconds automatically completes and submits your answer.
              </div>
            </div>
          )}

          {/* Live Audio Meters */}
          {isRecording && (
            <div className="grid gap-4 md:grid-cols-2 p-4 bg-muted/10 rounded-lg border border-border/50">
              {/* Voice Level Meter */}
              <div className="space-y-2">
                <div className="flex items-center justify-between text-xs font-bold text-muted-foreground uppercase">
                  <span>Voice level</span>
                  <span>{liveVolume > 75 ? "Loud (Clipping)" : liveVolume > 20 ? "Good" : "Quiet"}</span>
                </div>
                <div className="h-3.5 bg-muted rounded-full overflow-hidden border border-border flex p-[2px]">
                  <div
                    className={`h-full rounded-full transition-all duration-75 ${
                      liveVolume > 75 ? "bg-destructive" :
                      liveVolume > 20 ? "bg-emerald-500" :
                      "bg-amber-500"
                    }`}
                    style={{ width: `${liveVolume}%` }}
                  ></div>
                </div>
                <div className="flex justify-between text-[9px] text-muted-foreground">
                  <span>Too Quiet</span>
                  <span>Ideal Volume Range</span>
                  <span>Clipping</span>
                </div>
              </div>

              {/* Room Noise Meter */}
              <div className="space-y-2">
                <div className="flex items-center justify-between text-xs font-bold text-muted-foreground uppercase">
                  <span>Ambient Noise Level</span>
                  <span>{liveNoise > 35 ? "Too Noisy" : "Quiet Room"}</span>
                </div>
                <div className="h-3.5 bg-muted rounded-full overflow-hidden border border-border flex p-[2px]">
                  <div
                    className={`h-full rounded-full transition-all duration-300 ${
                      liveNoise > 35 ? "bg-destructive" : "bg-emerald-500/80"
                    }`}
                    style={{ width: `${Math.min(100, liveNoise * 2.5)}%` }}
                  ></div>
                </div>
                <div className="flex justify-between text-[9px] text-muted-foreground">
                  <span>Silent</span>
                  <span>Acceptable Floor</span>
                  <span>Noisy Room Limit</span>
                </div>
              </div>
            </div>
          )}

          {/* Answer Input and Manual Controls */}
          {!feedback && (
            <>
              <div className="space-y-4 pt-4 border-t border-border/60">
                <div className="flex justify-between items-center">
                  <h4 className="text-xs font-bold text-foreground uppercase tracking-wider">
                    Your Response
                  </h4>
                  
                  <button
                    type="button"
                    onClick={handleToggleRecord}
                    className={`py-1.5 px-3 rounded-lg border text-xs font-bold flex items-center gap-1.5 transition-all cursor-pointer ${
                      isRecording 
                        ? "bg-red-500/10 border-red-500/20 text-red-400" 
                        : "bg-primary/10 border-primary/20 text-primary hover:bg-primary/20"
                    }`}
                  >
                    {isRecording ? <MicOff className="w-3.5 h-3.5" /> : <Mic className="w-3.5 h-3.5" />}
                    {isRecording ? "Stop Dictation" : "Dictate Voice"}
                  </button>
                </div>

                <textarea
                  value={userAnswer}
                  onChange={(e) => setUserAnswer(e.target.value)}
                  placeholder="Record your response or type here. Using the STAR model (Situation, Task, Action, Result) is highly encouraged."
                  className="w-full h-32 p-4 bg-background border border-border rounded-xl text-sm leading-relaxed outline-none focus:border-primary/40 resize-none font-sans"
                />
              </div>

              {/* Submission and Action buttons */}
              <div className="flex items-center justify-between pt-4 border-t border-border mt-4">
                <span className="text-[10px] text-muted-foreground">
                  {userAnswer.split(/\s+/).filter(Boolean).length} words recorded
                </span>
                <button
                  type="button"
                  onClick={() => {
                    if (userAnswer.trim()) {
                      submitAnswerAction(userAnswer);
                    }
                  }}
                  disabled={!userAnswer.trim() || isSubmittingAnswer}
                  className="cursor-pointer font-bold bg-primary text-primary-foreground hover:bg-primary/90 py-2.5 px-6 rounded-lg disabled:opacity-50 disabled:cursor-not-allowed transition-all flex items-center gap-2 shadow-sm"
                >
                  {isSubmittingAnswer ? "Evaluating..." : "Submit Answer"}
                  <ArrowRight className="w-4 h-4" />
                </button>
              </div>
            </>
          )}

          {/* Answer Feedback & Calibration displays */}
          {feedback && (
            <div className="space-y-6">
              
              {/* Calibration alert */}
              {answerCount <= 3 && (
                <div className="bg-primary/5 border border-primary/20 rounded-lg p-4 flex items-center gap-3">
                  <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center text-primary shrink-0 animate-pulse">
                    <Sparkles className="w-4 h-4" />
                  </div>
                  <div>
                    <h4 className="text-xs font-bold text-primary uppercase tracking-wider">Calibration Mode (Response {answerCount}/3)</h4>
                    <p className="text-xs text-muted-foreground leading-relaxed mt-0.5">
                      We are calibrating your performance against elite standards. Focus on structure and metrics to unlock your potential score.
                    </p>
                  </div>
                </div>
              )}

              {/* Streak alerts */}
              {feedback.streak_message && (
                <div className={`border rounded-lg p-4 flex items-start gap-3 ${
                  feedback.streak_message.includes("🔥")
                    ? "bg-emerald-500/5 border-emerald-500/20 text-emerald-400"
                    : "bg-amber-500/5 border-amber-500/20 text-amber-400"
                }`}>
                  <div className="text-xl shrink-0">
                    {feedback.streak_message.includes("🔥") ? "🔥" : "💡"}
                  </div>
                  <div className="space-y-1">
                    <h4 className="text-xs font-bold uppercase tracking-wider">
                      {feedback.streak_message.includes("🔥") ? "Streak Active" : "Interviewer Coaching"}
                    </h4>
                    <p className="text-xs text-foreground leading-relaxed">
                      {feedback.streak_message}
                    </p>
                  </div>
                </div>
              )}

              {/* Calibration scorecard */}
              <div className="grid gap-6 md:grid-cols-4">
                
                {/* Score panel */}
                <div className="bg-muted/40 p-5 rounded-lg border border-border flex flex-col items-center justify-center text-center space-y-2 relative overflow-hidden md:col-span-1">
                  <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">Rating</span>
                  <div className="relative flex items-center justify-center">
                    <div className="text-2xl font-extrabold text-foreground bg-primary/5 w-24 h-24 rounded-full flex flex-col items-center justify-center border border-primary/10">
                      <span className="text-3xl font-black">{feedback.score}</span>
                      <span className="text-[10px] text-muted-foreground font-medium border-t border-border w-12 pt-0.5 mt-0.5">
                        {feedback.potential_score ? `→ ${feedback.potential_score}` : "/10"}
                      </span>
                    </div>
                  </div>
                  <span className="text-[10px] font-bold text-primary truncate max-w-full block px-1">{feedback.growth_path || "Elite Bound"}</span>
                </div>

                {/* Pacing feedback display */}
                {pacingFeedback && (
                  <div className="bg-muted/30 p-5 rounded-lg border border-border flex flex-col space-y-2 md:col-span-1 text-xs">
                    <span className="text-[10px] font-bold text-primary uppercase tracking-wider block border-b border-border pb-1">Pacing Analytics</span>
                    <div className="space-y-1.5 pt-1">
                      <div className="flex justify-between">
                        <span className="text-muted-foreground font-medium">Pause before speaking:</span>
                        <span className="font-bold">{pacingFeedback.thinkingPause}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-muted-foreground font-medium">Speaking pace:</span>
                        <span className="font-bold">{pacingFeedback.speakingRate}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-muted-foreground font-medium">Strategic pauses:</span>
                        <span className="font-bold">{pacingFeedback.pausesWithinAnswer}</span>
                      </div>
                      <div className="flex flex-col gap-1 border-t border-border/40 pt-1.5">
                        <span className="text-muted-foreground font-medium">Fillers detected:</span>
                        <div className="flex flex-wrap gap-1 mt-0.5">
                          {pacingFeedback.fillersDetected.length > 0 ? (
                            pacingFeedback.fillersDetected.slice(0, 4).map((f: string, idx: number) => (
                              <span key={idx} className="bg-destructive/10 text-destructive text-[9px] font-bold px-1.5 py-0.5 rounded">
                                &ldquo;{f}&rdquo;
                              </span>
                            ))
                          ) : (
                            <span className="text-emerald-400 text-[10px] font-semibold">Clean (No fillers!)</span>
                          )}
                          {pacingFeedback.fillersDetected.length > 4 && (
                            <span className="text-muted-foreground text-[9px] italic">+{pacingFeedback.fillersDetected.length - 4}</span>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {/* Strengths list */}
                <div className="bg-emerald-500/5 p-5 rounded-lg border border-emerald-500/10 md:col-span-1 space-y-2.5">
                  <span className="text-[10px] font-bold text-emerald-400 uppercase tracking-wider block border-b border-emerald-500/10 pb-1">Strengths</span>
                  <ul className="space-y-1.5">
                    {feedback.strengths.map((str, idx) => (
                      <li key={idx} className="text-[11px] font-medium text-foreground flex items-start gap-1.5 leading-normal">
                        <CheckCircle className="w-3.5 h-3.5 text-emerald-500 shrink-0 mt-0.5" />
                        <span>{str}</span>
                      </li>
                    ))}
                  </ul>
                </div>

                {/* Gaps list */}
                <div className="bg-amber-500/5 p-5 rounded-lg border border-amber-500/10 md:col-span-1 space-y-2.5">
                  <span className="text-[10px] font-bold text-amber-400 uppercase tracking-wider block border-b border-amber-500/10 pb-1">Gaps & Feedback</span>
                  <ul className="space-y-1.5">
                    {feedback.gaps.map((gap, idx) => (
                      <li key={idx} className="text-[11px] font-medium text-foreground flex items-start gap-1.5 leading-normal">
                        <AlertCircle className="w-3.5 h-3.5 text-amber-400 shrink-0 mt-0.5" />
                        <span>{gap}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              </div>

              {/* pacing summary feedback text */}
              {pacingFeedback?.feedbackScore && (
                <div className="bg-primary/5 border border-primary/10 rounded-lg p-3 text-xs text-foreground flex items-start gap-2">
                  <Info className="w-4 h-4 text-primary shrink-0 mt-0.5" />
                  <span><strong>Pacing Coaching:</strong> {pacingFeedback.feedbackScore}</span>
                </div>
              )}

              {/* Example rewrites upgrade */}
              {feedback.example_rewrites && feedback.example_rewrites.length > 0 && (
                <div className="bg-muted/20 border border-border rounded-lg p-5 space-y-3">
                  <h4 className="text-xs font-bold text-primary uppercase tracking-wider flex items-center gap-1.5">
                    <Sparkles className="w-3.5 h-3.5" />
                    Elite Response Upgrade Example:
                  </h4>
                  <div className="space-y-2.5">
                    {feedback.example_rewrites.map((rewrite, idx) => (
                      <div key={idx} className="text-xs text-muted-foreground bg-card border border-border/50 p-3 rounded-lg leading-relaxed whitespace-pre-line">
                        {rewrite}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Gated Submit button loaders */}
          {isSubmittingAnswer && (
            <div className="flex items-center gap-2 text-xs font-medium text-primary animate-pulse bg-primary/5 border border-primary/10 p-4 rounded-lg justify-center">
              <div className="w-4 h-4 border-2 border-primary border-t-transparent rounded-full animate-spin"></div>
              Evaluating response... Analyzing technical depth and grading pace delivery metrics.
            </div>
          )}

          {/* Action Footer navigation */}
          {feedback && (
            <div className="flex justify-between items-center pt-4 border-t border-border">
              <p className="text-xs text-muted-foreground">
                {isInterviewFinished 
                  ? "Interview Loop Completed successfully." 
                  : "Listen to the next question when ready."
                }
              </p>
              
              <div className="flex gap-3">
                {isInterviewFinished ? (
                  <button
                    onClick={() => setViewingReport(true)}
                    className="cursor-pointer bg-primary text-primary-foreground hover:bg-primary/95 font-semibold text-sm py-2.5 px-6 rounded-lg shadow-sm transition-all flex items-center gap-2"
                  >
                    <Award className="w-4 h-4" />
                    View Performance Report
                  </button>
                ) : (
                  <button
                    onClick={handleNextQuestion}
                    className="cursor-pointer bg-primary text-primary-foreground hover:bg-primary/95 font-semibold text-sm py-2.5 px-6 rounded-lg shadow-sm transition-all flex items-center gap-2"
                  >
                    Next Question
                    <ArrowRight className="w-4 h-4" />
                  </button>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    );
  }

  // Final performance report screen
  if (viewingReport) {
    const reportItem = sessionHistory[activeReportIndex];
    const avgScore = (sessionHistory.reduce((acc, curr) => acc + curr.score, 0) / sessionHistory.length).toFixed(1);

    return (
      <div className="bg-card rounded-xl border border-border shadow-md overflow-hidden transition-all duration-200">
        {/* Header */}
        <div className="border-b border-border px-6 py-5 bg-muted/10 flex flex-wrap items-center justify-between gap-4">
          <div>
            <h2 className="text-xl font-bold text-foreground">Interview Performance Report</h2>
            <p className="text-xs text-muted-foreground mt-1">
              Coaching report for your {profile?.interview_type} mock loop at {profile?.target_company}.
            </p>
          </div>
          <button
            onClick={cleanupStates}
            className="cursor-pointer text-xs font-semibold bg-primary text-primary-foreground hover:bg-primary/90 py-2.5 px-5 rounded-lg transition-all shadow-sm"
          >
            Back to Practice Center
          </button>
        </div>

        {/* Confidence booster audio feedback banner */}
        <div className="mx-6 mt-6 p-4 bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 rounded-lg flex items-start gap-3 shadow-sm">
          <Sparkles className="w-5 h-5 shrink-0 mt-0.5 text-emerald-400" />
          <div>
            <h4 className="text-xs font-black uppercase tracking-wider text-emerald-400">Audio Quality Verified</h4>
            <p className="text-xs text-foreground mt-1 leading-relaxed">
              Your audio was crystal clear. The interviewer could hear every word. This is a strength for you. Move forward with confidence.
            </p>
          </div>
        </div>

        {/* Overview Stats */}

        <div className="p-6 grid gap-6 md:grid-cols-3 border-b border-border/80">
          <div className="bg-muted/30 p-5 rounded-lg border border-border flex flex-col items-center justify-center text-center space-y-1">
            <span className="text-[10px] font-bold text-muted-foreground uppercase">Average Score</span>
            <div className="text-3xl font-black text-primary">{avgScore} <span className="text-xs text-muted-foreground">/10</span></div>
            <span className="text-[10px] text-muted-foreground">Calibrated strict assessment standard</span>
          </div>

          <div className="bg-muted/30 p-5 rounded-lg border border-border flex flex-col items-center justify-center text-center space-y-1">
            <span className="text-[10px] font-bold text-muted-foreground uppercase">Average Pacing Rate</span>
            <div className="text-2xl font-black text-foreground">
              {Math.round(sessionHistory.reduce((acc, curr) => acc + parseFloat(curr.pacingAnalysis.speakingRate), 0) / sessionHistory.length)}
              <span className="text-xs text-muted-foreground"> WPM</span>
            </div>
            <span className="text-[10px] text-muted-foreground">Ideal flow: 120-150 words/min</span>
          </div>

          <div className="bg-muted/30 p-5 rounded-lg border border-border flex flex-col items-center justify-center text-center space-y-1">
            <span className="text-[10px] font-bold text-muted-foreground uppercase">Total Filler Words</span>
            <div className="text-2xl font-black text-destructive">
              {sessionHistory.reduce((acc, curr) => acc + curr.pacingAnalysis.fillersDetected.length, 0)}
            </div>
            <span className="text-[10px] text-muted-foreground">&ldquo;um&rdquo;, &ldquo;uh&rdquo;, &ldquo;like&rdquo;, &ldquo;basically&rdquo;</span>
          </div>
        </div>

        <div className="p-6 space-y-6">
          {/* Round Navigation Tabs / Carousel */}
          <div className="space-y-2">
            <span className="text-xs font-bold text-muted-foreground uppercase tracking-wider block">Select Round to Inspect</span>
            <div className="flex gap-2 overflow-x-auto pb-2 scrollbar-thin">
              {sessionHistory.map((metric, idx) => (
                <button
                  key={idx}
                  onClick={() => setActiveReportIndex(idx)}
                  className={`cursor-pointer px-4 py-2.5 rounded-lg text-xs font-bold border transition-all whitespace-nowrap ${
                    activeReportIndex === idx
                      ? "bg-primary text-primary-foreground border-primary shadow-sm"
                      : "bg-muted hover:bg-muted/80 text-foreground border-border"
                  }`}
                >
                  Round {metric.round} (Grade: {metric.score}/10)
                </button>
              ))}
            </div>
          </div>

          {reportItem && (
            <div className="space-y-6 bg-muted/10 p-5 rounded-lg border border-border/80">
              
              {/* Question & Candidate Transcript */}
              <div className="space-y-4">
                <div className="p-4 bg-muted/30 border border-border rounded-lg">
                  <span className="text-[10px] font-bold text-primary uppercase block mb-1">Eleanor Asked</span>
                  <p className="text-sm font-medium text-foreground">{reportItem.question}</p>
                </div>

                <div className="p-4 bg-background border border-border rounded-lg">
                  <span className="text-[10px] font-bold text-muted-foreground uppercase block mb-1">Your Speech Response</span>
                  <p className="text-sm italic text-foreground leading-relaxed">{reportItem.transcript}</p>
                </div>
              </div>

              {/* Coaching evaluations */}
              <div className="grid gap-6 md:grid-cols-3">
                {/* Score & Pacing */}
                <div className="bg-background/80 p-4 rounded-lg border border-border space-y-3 text-xs">
                  <span className="text-[10px] font-bold text-primary uppercase block border-b border-border pb-1">Round Pacing Analysis</span>
                  <div className="space-y-2">
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Thinking pause:</span>
                      <span className="font-semibold">{reportItem.pacingAnalysis.thinkingPause}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Speaking pace:</span>
                      <span className="font-semibold">{reportItem.pacingAnalysis.speakingRate}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Strategic pauses:</span>
                      <span className="font-semibold">{reportItem.pacingAnalysis.pausesWithinAnswer}</span>
                    </div>
                    <div>
                      <span className="text-muted-foreground block mb-1">Filler words:</span>
                      <div className="flex flex-wrap gap-1">
                        {reportItem.pacingAnalysis.fillersDetected.length > 0 ? (
                          reportItem.pacingAnalysis.fillersDetected.map((f, idx) => (
                            <span key={idx} className="bg-destructive/10 text-destructive text-[9px] font-bold px-1.5 py-0.5 rounded">
                              &ldquo;{f}&rdquo;
                            </span>
                          ))
                        ) : (
                          <span className="text-emerald-400 text-[10px] font-bold">None</span>
                        )}
                      </div>
                    </div>
                  </div>
                </div>

                {/* Strengths */}
                <div className="bg-emerald-500/5 p-4 rounded-lg border border-emerald-500/10 space-y-2">
                  <span className="text-[10px] font-bold text-emerald-400 uppercase block border-b border-emerald-500/10 pb-1">Strengths</span>
                  <ul className="space-y-1 text-xs">
                    {reportItem.strengths.map((str, idx) => (
                      <li key={idx} className="flex items-start gap-1 text-foreground leading-normal">
                        <CheckCircle className="w-3.5 h-3.5 text-emerald-500 shrink-0 mt-0.5" />
                        <span>{str}</span>
                      </li>
                    ))}
                  </ul>
                </div>

                {/* Gaps */}
                <div className="bg-amber-500/5 p-4 rounded-lg border border-amber-500/10 space-y-2">
                  <span className="text-[10px] font-bold text-amber-400 uppercase block border-b border-amber-500/10 pb-1">Gaps</span>
                  <ul className="space-y-1 text-xs">
                    {reportItem.gaps.map((gap, idx) => (
                      <li key={idx} className="flex items-start gap-1 text-foreground leading-normal">
                        <AlertCircle className="w-3.5 h-3.5 text-amber-400 shrink-0 mt-0.5" />
                        <span>{gap}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              </div>

              {/* Audio Quality stats */}
              <div className="p-4 bg-background/60 border border-border/50 rounded-lg text-xs space-y-2">
                <span className="text-[10px] font-bold text-muted-foreground uppercase block border-b border-border/20 pb-1">Audio Quality Parameters</span>
                <div className="grid grid-cols-3 gap-4 text-center">
                  <div className="p-2 bg-muted/20 border border-border/40 rounded">
                    <span className="text-muted-foreground block text-[10px]">Peak Amplitude</span>
                    <span className="font-bold text-foreground text-sm">{reportItem.audioQuality.peakAmplitude} dBFS</span>
                  </div>
                  <div className="p-2 bg-muted/20 border border-border/40 rounded">
                    <span className="text-muted-foreground block text-[10px]">Room Noise Floor</span>
                    <span className="font-bold text-foreground text-sm">{reportItem.audioQuality.noiseLevel} dB</span>
                  </div>
                  <div className="p-2 bg-muted/20 border border-border/40 rounded">
                    <span className="text-muted-foreground block text-[10px]">Speech Clarity</span>
                    <span className={`font-bold text-sm uppercase ${
                      reportItem.audioQuality.clarity === "clear" ? "text-emerald-400" :
                      reportItem.audioQuality.clarity === "acceptable" ? "text-amber-400" :
                      "text-destructive"
                    }`}>{reportItem.audioQuality.clarity}</span>
                  </div>
                </div>
              </div>

              {/* pacing coaching feedback text */}
              <div className="bg-primary/5 border border-primary/10 rounded-lg p-3 text-xs text-foreground flex items-start gap-2">
                <Info className="w-4 h-4 text-primary shrink-0 mt-0.5" />
                <span><strong>Pacing Coaching:</strong> {reportItem.pacingAnalysis.feedbackScore}</span>
              </div>

              {/* Upgrades */}
              {reportItem.example_rewrites && reportItem.example_rewrites.length > 0 && (
                <div className="bg-background/80 p-4 border border-border rounded-lg space-y-2 text-xs">
                  <span className="text-[10px] font-bold text-primary uppercase block">Level-up suggestions</span>
                  {reportItem.example_rewrites.map((rewrite, idx) => (
                    <p key={idx} className="text-muted-foreground leading-relaxed whitespace-pre-line bg-muted/20 p-2.5 rounded border border-border/40">{rewrite}</p>
                  ))}
                </div>
              )}

            </div>
          )}
        </div>
      </div>
    );
  }

  // Dashboard / Interview Profile Display
  return (
    <div className="bg-card rounded-xl border border-border shadow-sm transition-all duration-200 hover:shadow-md">
      <div className="border-b border-border px-6 py-4 bg-muted/10 flex items-center justify-between">
        <div>
          <h2 className="text-lg font-bold text-foreground">Interview Practice Center</h2>
          <p className="text-xs text-muted-foreground mt-1">
            Build and practice mock interviews tailored to your resume details with a voice-first AI.
          </p>
        </div>
        
        {profile && !showSetupForm && (
          <button
            onClick={() => setShowSetupForm(true)}
            className="cursor-pointer text-xs font-semibold bg-muted hover:bg-muted/80 text-foreground border border-border py-2 px-4 rounded-lg flex items-center gap-1.5 transition-all"
          >
            <Settings className="w-3.5 h-3.5" />
            Edit Profile Setup
          </button>
        )}
      </div>

      <div className="p-6">
        {profile && !showSetupForm ? (
          /* Profile Overview & Practice Launcher */
          <div className="space-y-6">
            <div className="grid gap-6 md:grid-cols-2">
              {/* Profile details */}
              <div className="p-5 bg-muted/20 border border-border rounded-lg space-y-4">
                <span className="text-xs font-bold text-primary uppercase tracking-wider block">
                  Active Interview Profile
                </span>
                
                <div className="space-y-3">
                  <div className="flex justify-between border-b border-border/50 pb-2">
                    <span className="text-xs font-medium text-muted-foreground">Target Company</span>
                    <span className="text-xs font-bold text-foreground">{profile.target_company}</span>
                  </div>
                  <div className="flex justify-between border-b border-border/50 pb-2">
                    <span className="text-xs font-medium text-muted-foreground">Interview Type</span>
                    <span className="text-xs font-bold text-foreground uppercase">{profile.interview_type}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-xs font-medium text-muted-foreground">Experience Level</span>
                    <span className="text-xs font-bold text-foreground">{profile.experience_level}</span>
                  </div>
                </div>
              </div>

              {/* Sync Resume Details */}
              <div className="p-5 bg-muted/20 border border-border rounded-lg flex flex-col justify-between">
                <div>
                  <span className="text-xs font-bold text-primary uppercase tracking-wider block mb-2">
                    Linked Resume
                  </span>
                  <p className="text-xs font-semibold text-foreground truncate">
                    {selectedResume?.file_name || "Extracted Resume"}
                  </p>
                  
                  {selectedResume?.technical_skills && selectedResume.technical_skills.length > 0 && (
                    <div className="mt-3.5 space-y-1.5">
                      <span className="text-[10px] font-bold text-muted-foreground uppercase">Extracted Technical Skills:</span>
                      <div className="flex flex-wrap gap-1">
                        {selectedResume.technical_skills.slice(0, 5).map((skill) => (
                          <span
                            key={skill}
                            className="px-2 py-0.5 bg-background border border-border text-muted-foreground rounded text-[10px] font-medium"
                          >
                            {skill}
                          </span>
                        ))}
                        {selectedResume.technical_skills.length > 5 && (
                          <span className="text-[10px] text-muted-foreground italic font-medium">
                            +{selectedResume.technical_skills.length - 5} more
                          </span>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>

            {error && (
              <div className="p-3.5 bg-destructive/10 border border-destructive/20 text-destructive-foreground text-sm font-medium rounded-lg">
                {error}
              </div>
            )}

            <div className="flex flex-col md:flex-row gap-4 justify-center pt-4 border-t border-border">
              <button
                type="button"
                onClick={() => {
                  window.location.href = "/interview/preflight";
                }}
                className="cursor-pointer w-full md:w-auto bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-sm py-3 px-8 rounded-lg shadow-md transition-all flex items-center justify-center gap-2 group"
              >
                <Sparkles className="w-4 h-4 text-white group-hover:scale-110 transition-all" />
                Start Unified Interview Loop
              </button>

              <button
                onClick={async () => {
                  warmUpAudioAndSpeech();
                  setError(null);
                  setShowPreFlight(true);
                  runPreFlightChecks();
                }}
                disabled={isSubmitting}
                className="cursor-pointer w-full md:w-auto bg-primary hover:bg-primary/95 text-primary-foreground font-semibold text-sm py-3 px-8 rounded-lg shadow-md transition-all flex items-center justify-center gap-2 group"
              >
                {isSubmitting ? (
                  <>
                    <div className="w-4 h-4 border-2 border-primary-foreground border-t-transparent rounded-full animate-spin"></div>
                    Preparing Interview Session...
                  </>
                ) : (
                  <>
                    <Play className="w-4 h-4 fill-primary-foreground group-hover:scale-110 transition-all" />
                    Start Local Voice Practice
                  </>
                )}
              </button>
            </div>
          </div>
        ) : (
          /* Profile Setup Form */
          <form onSubmit={handleSubmit} className="space-y-6">
            {/* Resume Selection */}
            <div className="space-y-2">
              <label className="text-sm font-semibold text-card-foreground block">Select Active Resume</label>
              <select
                value={selectedResumeId ?? ""}
                onChange={(e) => setSelectedResumeId(Number(e.target.value))}
                className="w-full text-sm rounded-lg border border-border shadow-sm p-2.5 bg-muted/10 text-foreground outline-none focus:ring-1 focus:ring-primary focus:border-primary"
              >
                {analyzedResumes.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.file_name} (Uploaded {new Date(r.created_at).toLocaleDateString()})
                  </option>
                ))}
              </select>
            </div>

            {/* Extracted Profile Details Preview */}
            {selectedResume && (
              <div className="p-4 bg-muted/20 rounded-lg border border-border space-y-4">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold uppercase tracking-wider text-primary">
                    Extracted Resume Analysis
                  </span>
                  <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-primary/10 text-primary border border-primary/20">
                    {selectedResume.experience_level || "Not Extracted"} Experience
                  </span>
                </div>

                <div className="space-y-1.5">
                  <span className="text-xs font-semibold text-muted-foreground block">Technical Skills:</span>
                  <div className="flex flex-wrap gap-1.5">
                    {selectedResume.technical_skills && selectedResume.technical_skills.length > 0 ? (
                      selectedResume.technical_skills.map((skill) => (
                        <span
                          key={skill}
                          className="px-2 py-0.5 bg-background border border-border text-foreground rounded text-xs font-medium shadow-sm"
                        >
                          {skill}
                        </span>
                      ))
                    ) : (
                      <span className="text-xs text-muted-foreground italic">No skills extracted</span>
                    )}
                  </div>
                </div>
              </div>
            )}

            {/* Form Inputs Grid */}
            <div className="grid gap-6 md:grid-cols-2">
              {/* Target Company Searchable Combobox */}
              <div className="space-y-2 relative" ref={dropdownRef}>
                <div className="flex items-center justify-between">
                  <label className="text-sm font-semibold text-card-foreground block">Target Company</label>
                  {isSearching && (
                    <span className="text-[10px] text-primary animate-pulse flex items-center gap-1 font-medium">
                      <RefreshCw className="h-2.5 w-2.5 animate-spin" />
                      Searching AI...
                    </span>
                  )}
                </div>

                {/* AI Recommended Companies Quick Tags */}
                {selectedResumeId && (isLoadingRecommendations || recommendedCompanies.length > 0) && (
                  <div className="py-1 animate-fade-in">
                    {isLoadingRecommendations ? (
                      <div className="flex items-center gap-1.5 text-xs text-muted-foreground italic">
                        <RefreshCw className="h-3 w-3 animate-spin" />
                        Fetching AI recommendations...
                      </div>
                    ) : (
                      <div className="space-y-1">
                        <span className="text-[10px] font-semibold text-primary block uppercase tracking-wider">
                          AI Suggestions based on Resume:
                        </span>
                        <div className="flex flex-wrap gap-1.5">
                          {recommendedCompanies.map((c) => (
                            <button
                              key={c.name}
                              type="button"
                              onClick={() => {
                                setTargetCompany(c.name);
                                setSearchQuery(c.name);
                                setIsDropdownOpen(false);
                              }}
                              className="px-2 py-1 bg-primary/10 border border-primary/20 text-primary hover:bg-primary hover:text-primary-foreground rounded text-[11px] font-medium shadow-sm transition-all cursor-pointer flex items-center gap-1"
                            >
                              <Sparkles className="h-2.5 w-2.5" />
                              {c.name}
                            </button>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                )}

                <div className="relative">
                  <input
                    type="text"
                    placeholder="Search 500+ tech companies (e.g. Stripe, OpenAI)..."
                    value={searchQuery}
                    onFocus={() => setIsDropdownOpen(true)}
                    onChange={(e) => {
                      setSearchQuery(e.target.value);
                      setTargetCompany(e.target.value); // Keep in sync for validation
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
                          setTargetCompany(selected.name);
                          setSearchQuery(selected.name);
                          setIsDropdownOpen(false);
                        }
                      } else if (e.key === "Escape") {
                        setIsDropdownOpen(false);
                      }
                    }}
                    className="w-full text-sm rounded-lg border border-border shadow-sm p-2.5 bg-muted/10 text-foreground outline-none focus:ring-1 focus:ring-primary focus:border-primary cursor-pointer"
                    required
                  />
                  {searchQuery && (
                    <button
                      type="button"
                      onClick={() => {
                        setSearchQuery("");
                        setTargetCompany("");
                      }}
                      className="absolute right-3 top-3 text-xs text-muted-foreground hover:text-foreground cursor-pointer"
                    >
                      Clear
                    </button>
                  )}
                </div>

                {isDropdownOpen && filteredCompanies.length > 0 && (
                  <div className="absolute z-50 w-full mt-1.5 max-h-60 overflow-y-auto bg-card border border-border rounded-lg shadow-lg scrollbar-thin">
                    {filteredCompanies.map((company, index) => (
                      <div
                        key={company.name}
                        onClick={() => {
                          setTargetCompany(company.name);
                          setSearchQuery(company.name);
                          setIsDropdownOpen(false);
                        }}
                        onMouseEnter={() => setHighlightedIndex(index)}
                        className={`p-3 text-sm cursor-pointer transition-all flex items-center justify-between border-b border-border/50 last:border-0 ${
                          highlightedIndex === index
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
                          <span className={`px-2 py-0.5 rounded text-[9px] font-bold ${
                            company.hiring_intensity === "High"
                              ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20"
                              : company.hiring_intensity === "Medium"
                              ? "bg-amber-500/10 text-amber-400 border border-amber-500/20"
                              : "bg-muted text-muted-foreground border border-border"
                          }`}>
                            {company.hiring_intensity}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Interview Type Selection */}
              <div className="space-y-2">
                <label className="text-sm font-semibold text-card-foreground block">Interview Type</label>
                <div className="flex flex-col sm:flex-row gap-4 p-2 bg-muted/10 rounded-lg border border-border">
                  {INTERVIEW_TYPES.map((type) => (
                    <label
                      key={type.id}
                      className="flex-1 flex items-center justify-center gap-2 p-2 rounded-md cursor-pointer transition-all hover:bg-muted/20"
                    >
                      <input
                        type="radio"
                        name="interview_type"
                        value={type.id}
                        checked={interviewType === type.id}
                        onChange={(e) => setInterviewType(e.target.value)}
                        className="text-primary focus:ring-primary border-border w-4 h-4 cursor-pointer"
                        required
                      />
                      <span className="text-xs font-semibold text-foreground select-none">
                        {type.label}
                      </span>
                    </label>
                  ))}
                </div>
              </div>
            </div>

            {/* Feedback Messages */}
            {error && (
              <div className="p-3.5 bg-destructive/10 border border-destructive/20 text-destructive-foreground text-sm font-medium rounded-lg">
                {error}
              </div>
            )}

            {success && (
              <div className="p-3.5 bg-success/10 border border-success/20 text-success-foreground text-sm font-medium rounded-lg">
                Interview profile successfully synchronized!
              </div>
            )}

            {/* Submit Button */}
            <div className="flex justify-end gap-3 pt-2 border-t border-border">
              {profile && (
                <button
                  type="button"
                  onClick={() => setShowSetupForm(false)}
                  className="cursor-pointer bg-muted hover:bg-muted/80 text-foreground border border-border font-medium text-sm py-2.5 px-5 rounded-lg shadow-sm transition-all"
                >
                  Cancel
                </button>
              )}
              
              <button
                type="submit"
                disabled={isSubmitting}
                className="cursor-pointer bg-primary text-primary-foreground hover:bg-primary/95 disabled:opacity-50 font-medium text-sm py-2.5 px-5 rounded-lg shadow-sm transition-all flex items-center gap-2"
              >
                {isSubmitting ? (
                  <>
                    <div className="w-4 h-4 border-2 border-primary-foreground border-t-transparent rounded-full animate-spin"></div>
                    Saving Setup...
                  </>
                ) : (
                  <>
                    <RefreshCw className="w-4 h-4 animate-spin-slow" />
                    {profile ? "Update Interview Setup" : "Initialize Interview Setup"}
                  </>
                )}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
