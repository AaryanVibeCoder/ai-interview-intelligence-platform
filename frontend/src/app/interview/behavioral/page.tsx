"use client";

import { useEffect, useState, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@clerk/nextjs";
import { apiClient } from "@/services/api/client";
import { useInterviewStore } from "@/store/interview-store";
import {
  Volume2,
  VolumeX,
  Mic,
  MicOff,
  ArrowRight,
  CheckCircle2,
  AlertCircle,
  Activity,
  LogOut,
  Sparkles,
  Award,
  BookOpen,
  X,
  RefreshCw
} from "lucide-react";

interface SpeechRecognitionInstance {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  start: () => void;
  stop: () => void;
  onstart: () => void;
  onresult: (event: any) => void;
  onerror: (event: { error: string }) => void;
  onend: () => void;
}

type WindowWithSpeech = typeof window & {
  SpeechRecognition?: any;
  webkitSpeechRecognition?: any;
};

export default function BehavioralPage() {
  const router = useRouter();
  const { getToken } = useAuth();

  const {
    currentQuestion,
    answers,
    addAnswer,
    activeSessionId,
    setActiveSessionId,
    targetCompany,
    experienceLevel,
    role,
    jobType,
    questionSource,
    setQuestionSource,
    setCurrentQuestion,
    resetSession
  } = useInterviewStore();

  const [question, setQuestion] = useState(currentQuestion || "Introduce yourself and describe your role in your last project.");
  const [userAnswerText, setUserAnswerText] = useState("");
  const [isRecording, setIsRecording] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [eleanorSpeaking, setEleanorSpeaking] = useState(false);
  const [recognition, setRecognition] = useState<SpeechRecognitionInstance | null>(null);
  const [roundFeedback, setRoundFeedback] = useState<any>(null);
  const [currentRound, setCurrentRound] = useState(1);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [liveVolume, setLiveVolume] = useState(0);
  const [hintsRemaining, setHintsRemaining] = useState(3);
  const [activeHint, setActiveHint] = useState<string | null>(null);
  const [isLoadingHint, setIsLoadingHint] = useState(false);

  const audioContextRef = useRef<AudioContext | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const animationFrameRef = useRef<number | null>(null);
  const silenceTimeoutRef = useRef<any>(null);
  const handleSubmitAnswerRef = useRef<() => void>(() => { });
  const ignoreSubmitOnEndRef = useRef(false);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);

  // Initialize Speech Recognition
  useEffect(() => {
    if (typeof window !== "undefined") {
      const win = window as WindowWithSpeech;
      const SpeechClass = win.SpeechRecognition || win.webkitSpeechRecognition;
      if (SpeechClass) {
        const rec = new SpeechClass();
        rec.continuous = true;
        rec.interimResults = true;
        rec.lang = "en-US";

        rec.onstart = () => {
          console.log("Speech recognition started");
          setErrorMessage(null);
        };

        rec.onresult = (event: any) => {
          let interimTranscript = "";
          let finalTranscript = "";

          for (let i = 0; i < event.results.length; ++i) {
            if (event.results[i].isFinal) {
              finalTranscript += event.results[i][0].transcript + " ";
            } else {
              interimTranscript += event.results[i][0].transcript;
            }
          }

          const txt = (finalTranscript + interimTranscript).trim();
          if (txt) {
            setUserAnswerText(txt);

            // Auto submit on silence (1.2s quiet window)
            if (silenceTimeoutRef.current) clearTimeout(silenceTimeoutRef.current);
            silenceTimeoutRef.current = setTimeout(() => {
              console.log("Silence threshold met, stopping recognition...");
              rec.stop();
            }, 1200);
          }
        };

        rec.onerror = (e: { error: string }) => {
          if (e.error === "no-speech") {
            ignoreSubmitOnEndRef.current = true;
            return;
          }
          console.warn("Speech recognition error:", e.error);
          ignoreSubmitOnEndRef.current = true;
        };

        rec.onend = () => {
          setIsRecording(false);
          stopAudioAnalysis();
          if (silenceTimeoutRef.current) clearTimeout(silenceTimeoutRef.current);
          if (ignoreSubmitOnEndRef.current) {
            console.log("Bypassing auto-submit inside onend");
            ignoreSubmitOnEndRef.current = false;
            return;
          }
          handleSubmitAnswerRef.current();
        };

        setRecognition(rec);
      }
    }
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      stopAudioAnalysis();
      window.speechSynthesis.cancel();
    };
  }, []);

  // Start the interview session in backend if not already done
  useEffect(() => {
    async function startSession() {
      if (activeSessionId) {
        // Session already started in store
        setCurrentRound(answers.length + 1);
        if (answers.length > 0) {
          const lastAns = answers[answers.length - 1];
          setQuestion(lastAns.feedback?.next_question || "Let's proceed to the next question.");
        }
        return;
      }

      setIsSubmitting(true);
      try {
        const token = await getToken();
        const headers = { Authorization: `Bearer ${token}` };

        // Fallback to mock session if mock environment is set
        const useMock = process.env.NEXT_PUBLIC_USE_MOCK === "true";
        const apiPath = useMock ? "/api/interview/mock/start" : "/api/interview/start";

        const res = await apiClient.post<{ session_id: number; question: string; question_source: string }>(
          apiPath,
          {
            target_company: targetCompany || "Google",
            interview_type: "behavioral",
            experience_level: experienceLevel || "Mid-level",
            role: role || "Software Engineer",
            job_type: jobType || "full time job"
          },
          { headers } as never
        );

        setActiveSessionId(res.session_id);
        setQuestion(res.question);
        setCurrentQuestion(res.question);
        setQuestionSource(res.question_source || "fallback");
        speakQuestion(res.question);
      } catch (err) {
        setErrorMessage("Failed to establish interview session. Verify connection.");
      } finally {
        setIsSubmitting(false);
      }
    }

    startSession();
  }, [activeSessionId, targetCompany, experienceLevel, role, jobType, getToken, setActiveSessionId, setCurrentQuestion, setQuestionSource]);

  // Poll session status for LLM personalized opener swap
  useEffect(() => {
    if (!activeSessionId || questionSource !== "fallback" || answers.length > 0) return;

    let isMounted = true;
    let pollInterval: NodeJS.Timeout;

    const pollStatus = async () => {
      try {
        const token = await getToken();
        const headers = token ? { Authorization: `Bearer ${token}` } : {};
        const useMock = process.env.NEXT_PUBLIC_USE_MOCK === "true";
        const apiPath = useMock
          ? `/api/interview/mock/session/${activeSessionId}`
          : `/api/interview/session/${activeSessionId}`;

        const res = await apiClient.get<{
          session_id: number;
          status: string;
          question_source: string;
          question: string;
        }>(apiPath, { headers } as never);

        if (!isMounted) return;

        // If the question source flipped to LLM
        if (res.question_source === "llm") {
          // Double check that the candidate hasn't started answering (answers.length is still 0)
          // and that Eleanor is not currently speaking.
          if (answers.length === 0 && !eleanorSpeaking) {
            const firstLlmQuestion = res.question;
            if (firstLlmQuestion && firstLlmQuestion !== question) {
              console.log("[POLL] Swapping fallback opener for personalized LLM opener:", firstLlmQuestion);
              setQuestion(firstLlmQuestion);
              setCurrentQuestion(firstLlmQuestion);
              setQuestionSource("llm");
              speakQuestion(firstLlmQuestion);
              clearInterval(pollInterval);
            }
          }
        }
      } catch (err) {
        console.warn("[POLL] Error polling session status:", err);
      }
    };

    // Start polling every 2 seconds
    pollInterval = setInterval(() => {
      // Only query if Eleanor is not speaking and user has not started answering
      if (!eleanorSpeaking && answers.length === 0) {
        pollStatus();
      }
    }, 2000);

    // Initial check after 1 second
    const initialTimeout = setTimeout(() => {
      if (!eleanorSpeaking && answers.length === 0) {
        pollStatus();
      }
    }, 1000);

    return () => {
      isMounted = false;
      clearInterval(pollInterval);
      clearTimeout(initialTimeout);
    };
  }, [activeSessionId, questionSource, answers.length, eleanorSpeaking, question, getToken, setQuestionSource, setCurrentQuestion]);

  const startAudioAnalysis = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      mediaStreamRef.current = stream;

      const win = window as any;
      const AudioCtxClass = win.AudioContext || win.webkitAudioContext;
      if (!AudioCtxClass) return;

      const ctx = new AudioCtxClass();
      audioContextRef.current = ctx;

      // CRITICAL: Resume AudioContext — Chrome starts it in "suspended" state
      if (ctx.state === "suspended") {
        await ctx.resume();
      }

      const source = ctx.createMediaStreamSource(stream);
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 256;
      analyserRef.current = analyser;

      source.connect(analyser);
      const dataArray = new Uint8Array(analyser.frequencyBinCount);

      const updateMeter = () => {
        if (!analyserRef.current) return;
        analyserRef.current.getByteFrequencyData(dataArray);
        const sum = dataArray.reduce((a, b) => a + b, 0);
        const avg = sum / dataArray.length;
        setLiveVolume(Math.min(100, Math.round((avg / 128) * 100)));
        animationFrameRef.current = requestAnimationFrame(updateMeter);
      };

      updateMeter();

      // Initialize MediaRecorder for ASR enrichment
      audioChunksRef.current = [];
      let options = { mimeType: "audio/webm" };
      if (!MediaRecorder.isTypeSupported(options.mimeType)) {
        options = { mimeType: "audio/ogg" };
      }
      if (!MediaRecorder.isTypeSupported(options.mimeType)) {
        options = { mimeType: "" }; // default fallback
      }

      let recorder: MediaRecorder;
      try {
        if (options.mimeType) {
          recorder = new MediaRecorder(stream, options);
        } else {
          recorder = new MediaRecorder(stream);
        }
      } catch (e) {
        recorder = new MediaRecorder(stream);
      }

      mediaRecorderRef.current = recorder;
      recorder.ondataavailable = (event) => {
        if (event.data && event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };

      recorder.onstop = async () => {
        const mimeType = recorder.mimeType || "audio/webm";
        const audioBlob = new Blob(audioChunksRef.current, { type: mimeType });
        if (audioBlob.size > 0 && activeSessionId) {
          try {
            const token = await getToken();
            const headers = { Authorization: `Bearer ${token}` };
            const formData = new FormData();
            formData.append("session_id", String(activeSessionId));
            formData.append("question_index", String(currentRound - 1));

            let ext = ".wav";
            if (mimeType.includes("webm")) ext = ".webm";
            else if (mimeType.includes("ogg")) ext = ".ogg";
            else if (mimeType.includes("mp4") || mimeType.includes("mpeg")) ext = ".mp4";

            formData.append("audio", audioBlob, `audio${ext}`);

            const useMock = process.env.NEXT_PUBLIC_USE_MOCK === "true";
            const uploadPath = useMock ? "/api/interview/mock/upload-answer-audio" : "/api/interview/upload-answer-audio";

            await apiClient.post(uploadPath, formData, { headers } as never);
            console.log(`Audio for question index ${currentRound - 1} uploaded successfully`);
          } catch (err) {
            console.error("Failed to upload audio blob:", err);
          }
        }
      };

      recorder.start();
    } catch (err) {
      console.warn("Could not load mic meter.", err);
    }
  };

  const stopAudioAnalysis = () => {
    if (animationFrameRef.current) cancelAnimationFrame(animationFrameRef.current);
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== "inactive") {
      try {
        mediaRecorderRef.current.stop();
      } catch (e) {
        console.warn("Error stopping media recorder:", e);
      }
    }
    if (mediaStreamRef.current) {
      mediaStreamRef.current.getTracks().forEach((track) => track.stop());
      mediaStreamRef.current = null;
    }
    if (audioContextRef.current) {
      audioContextRef.current.close().catch(() => { });
      audioContextRef.current = null;
    }
    analyserRef.current = null;
    setLiveVolume(0);
  };

  const startRecordingSpeech = async () => {
    if (!recognition) return;
    ignoreSubmitOnEndRef.current = false;
    window.speechSynthesis.cancel();
    setEleanorSpeaking(false);
    setUserAnswerText("");
    setIsRecording(true);
    await startAudioAnalysis();
    try {
      recognition.start();
    } catch (err) {
      console.warn("Recognition already active", err);
    }
  };

  const handleToggleRecord = async () => {
    if (!recognition) {
      setErrorMessage("Voice transcription is not supported in this browser. Please use text input below.");
      return;
    }

    if (isRecording) {
      ignoreSubmitOnEndRef.current = true;
      try {
        recognition.stop();
      } catch (e) { }
      setIsRecording(false);
      stopAudioAnalysis();
    } else {
      await startRecordingSpeech();
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
      // Chrome/Edge fires this event when voices finish loading
      const onVoicesChanged = () => {
        window.speechSynthesis.removeEventListener("voiceschanged", onVoicesChanged);
        resolve(window.speechSynthesis.getVoices());
      };
      window.speechSynthesis.addEventListener("voiceschanged", onVoicesChanged);
      // Safety timeout — resolve with whatever we have after 3s
      setTimeout(() => {
        window.speechSynthesis.removeEventListener("voiceschanged", onVoicesChanged);
        resolve(window.speechSynthesis.getVoices());
      }, 3000);
    });
  };

  const speakQuestion = async (text: string) => {
    if (typeof window === "undefined" || !window.speechSynthesis) return;

    window.speechSynthesis.cancel();
    setEleanorSpeaking(true);

    // Stop recording first
    ignoreSubmitOnEndRef.current = true;
    if (recognition) {
      try {
        recognition.stop();
      } catch (e) { }
    }
    setIsRecording(false);
    stopAudioAnalysis();

    // Wait for voices to be available (fixes silent Eleanor)
    const voices = await waitForVoices();

    // CRITICAL: Delay after cancel() — Chrome silently drops speak() calls
    // that happen immediately after cancel().
    await new Promise(resolve => setTimeout(resolve, 150));

    const utterance = new SpeechSynthesisUtterance(text);
    // Choose natural sounding default female voice
    const voice = voices.find((v) => v.lang.startsWith("en-US") && v.name.includes("Natural")) ||
      voices.find((v) => v.lang.startsWith("en-US")) ||
      voices.find((v) => v.lang.startsWith("en")) || voices[0];

    if (voice) utterance.voice = voice;
    utterance.rate = 0.95;
    utterance.pitch = 1.05;
    utterance.volume = 1.0;

    utterance.onend = () => {
      setEleanorSpeaking(false);
      // Auto-start recording
      startRecordingSpeech();
    };

    utterance.onerror = (e) => {
      console.warn("SpeechSynthesis error:", e);
      setEleanorSpeaking(false);
      setIsRecording(false);
    };

    // Prevent garbage collection of the utterance
    (window as any).activeUtterance = utterance;

    window.speechSynthesis.speak(utterance);
  };

  const handleRequestHint = async () => {
    if (hintsRemaining <= 0 || isLoadingHint) return;
    setIsLoadingHint(true);
    setErrorMessage(null);
    try {
      const token = await getToken();
      const headers = { Authorization: `Bearer ${token}` };
      
      const useMock = process.env.NEXT_PUBLIC_USE_MOCK === "true";
      const apiPath = useMock ? "/api/interview/mock/hint" : "/api/interview/hint";

      const res = await apiClient.post<{ hint: string }>(
        apiPath,
        {
          session_id: activeSessionId || 1001,
          question: question,
          user_transcript: userAnswerText,
        },
        { headers } as never
      );

      setActiveHint(res.hint);
      setHintsRemaining((prev) => prev - 1);
    } catch (err) {
      setErrorMessage("Failed to retrieve hint. Please try again.");
    } finally {
      setIsLoadingHint(false);
    }
  };

  const handleSubmitAnswer = async () => {
    if (!userAnswerText.trim() || isSubmitting) return;

    setIsSubmitting(true);
    setErrorMessage(null);

    // Stop recording first
    if (isRecording) {
      recognition?.stop();
      setIsRecording(false);
      stopAudioAnalysis();
    }

    try {
      const token = await getToken();
      const headers = { Authorization: `Bearer ${token}` };

      const useMock = process.env.NEXT_PUBLIC_USE_MOCK === "true";
      const apiPath = useMock ? "/api/interview/mock/answer" : "/api/interview/answer";

      const res = await apiClient.post<any>(
        apiPath,
        {
          session_id: activeSessionId,
          user_transcript: userAnswerText
        },
        { headers } as never
      );

      // Save answer details
      addAnswer(question, userAnswerText, res.feedback.score, {
        next_question: res.next_question,
        strengths: res.feedback.strengths,
        gaps: res.feedback.gaps,
        potential_score: res.feedback.potential_score,
        growth_path: res.feedback.growth_path,
        streak_message: res.feedback.streak_message,
        example_rewrites: res.feedback.example_rewrites
      });

      setActiveHint(null); // Clear hint for next question

      if (!res.next_question || currentRound >= 5) {
        // Last round reached - trigger NIM transcription enrichment and redirect
        try {
          const token = await getToken();
          const headers = { Authorization: `Bearer ${token}` };
          const useMock = process.env.NEXT_PUBLIC_USE_MOCK === "true";
          const enrichPath = useMock ? "/api/interview/mock/enrich" : "/api/interview/enrich";
          
          apiClient.post(enrichPath, { session_id: activeSessionId }, { headers } as never).catch(err => {
            console.error("Failed to trigger ASR enrichment:", err);
          });
        } catch (err) {
          console.error("Failed to trigger ASR enrichment:", err);
        }
        router.push("/interview/feedback");
      } else {
        setQuestion(res.next_question);
        setCurrentRound((r) => r + 1);
        setUserAnswerText("");
        speakQuestion(res.next_question);
      }

    } catch (err) {
      setErrorMessage("Answer submission failed. Please verify input or try again.");
    } finally {
      setIsSubmitting(false);
    }
  };

  // Sync reference to avoid stale closures
  useEffect(() => {
    handleSubmitAnswerRef.current = () => {
      if (userAnswerText.trim() && !isSubmitting) {
        handleSubmitAnswer();
      }
    };
  }, [userAnswerText, isSubmitting, handleSubmitAnswer]);

  const handleEndInterviewEarly = async () => {
    if (confirm("End the session early? We'll load the analytics dashboard with the rounds you completed.")) {
      try {
        const token = await getToken();
        const headers = { Authorization: `Bearer ${token}` };
        const useMock = process.env.NEXT_PUBLIC_USE_MOCK === "true";
        const enrichPath = useMock ? "/api/interview/mock/enrich" : "/api/interview/enrich";
        
        apiClient.post(enrichPath, { session_id: activeSessionId }, { headers } as never).catch(err => {
          console.error("Failed to trigger ASR enrichment on early end:", err);
        });
      } catch (err) {
        console.error("Failed to trigger ASR enrichment on early end:", err);
      }
      router.push("/interview/feedback");
    }
  };

  return (
    <div className="max-w-4xl mx-auto py-10 px-6 space-y-8">

      {/* Header bar */}
      <div className="flex justify-between items-center bg-card border border-border p-4 rounded-xl shadow-sm">
        <div className="flex flex-col">
          <span className="text-[10px] uppercase font-bold text-muted-foreground">Conversational Session</span>
          <span className="text-sm font-bold text-foreground capitalize">
            {targetCompany || "Google"} — {experienceLevel || "Senior Engineer"} loop
          </span>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-xs font-semibold bg-muted py-1.5 px-3 rounded-lg border border-border">
            Question {currentRound} of 5
          </span>
          <button
            onClick={handleEndInterviewEarly}
            className="cursor-pointer text-xs font-bold text-destructive hover:bg-destructive/10 border border-destructive/20 py-1.5 px-3.5 rounded-lg transition-all"
          >
            End Early
          </button>
        </div>
      </div>

      {errorMessage && (
        <div className="p-4 bg-destructive/10 border border-destructive/20 rounded-xl flex gap-3 text-destructive animate-in slide-in-from-top-2">
          <AlertCircle className="w-5 h-5 flex-shrink-0" />
          <span className="text-xs leading-relaxed">{errorMessage}</span>
        </div>
      )}

      {/* Main pane split */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">

        {/* Left pane: Interviewer character */}
        <div className="bg-card border border-border rounded-2xl p-6 shadow-sm flex flex-col items-center justify-center space-y-4 text-center min-h-[300px] cursor-default select-none">
          <div className="relative">
            <div className={`w-24 h-24 rounded-full bg-primary/10 border-2 border-primary/20 flex items-center justify-center transition-all ${eleanorSpeaking ? "scale-105 border-primary animate-pulse" : ""
              }`}>
              <span className="text-3xl font-black text-primary">E</span>
            </div>

            {/* Visual sound level rings */}
            {eleanorSpeaking && (
              <span className="absolute -inset-1 rounded-full border border-primary/40 animate-ping opacity-60"></span>
            )}
          </div>

          <div className="space-y-1">
            <h3 className="text-base font-bold flex items-center gap-1.5 justify-center cursor-default select-none">
              Eleanor
              <Sparkles className="w-4 h-4 text-amber-400" />
            </h3>
            <span className="text-[10px] uppercase text-muted-foreground font-bold tracking-wider cursor-default select-none">
              {eleanorSpeaking ? "Speaking..." : isRecording ? "Listening..." : "Waiting"}
            </span>
          </div>

          <p className="text-[11px] text-muted-foreground leading-relaxed cursor-default select-none">
            I am evaluating your answers using a strict 0-10 STAR criteria score. Use clear project statistics and metric impacts.
          </p>

          {/* Speech volume animations */}
          {isRecording && (
            <div className="flex gap-1 items-center justify-center pt-2">
              <span className="w-1 h-3 bg-primary rounded-full animate-bounce" style={{ animationDelay: '0.1s' }}></span>
              <span className="w-1 h-5 bg-primary rounded-full animate-bounce" style={{ animationDelay: '0.2s' }}></span>
              <span className="w-1 h-4 bg-primary rounded-full animate-bounce" style={{ animationDelay: '0.3s' }}></span>
              <span className="w-1 h-2 bg-primary rounded-full animate-bounce" style={{ animationDelay: '0.4s' }}></span>
            </div>
          )}
        </div>

        {/* Right pane: Question & Answer Workspace */}
        <div className="md:col-span-2 bg-card border border-border rounded-2xl p-6 shadow-sm space-y-6 flex flex-col justify-between">

          <div className="space-y-4">
            <div className="flex justify-between items-center">
              <h4 className="text-xs font-bold text-primary uppercase tracking-wider cursor-default select-none">Active Question</h4>
              {hintsRemaining > 0 && (
                <button
                  type="button"
                  onClick={handleRequestHint}
                  disabled={isLoadingHint}
                  className="cursor-pointer text-[11px] font-bold bg-amber-500 hover:bg-amber-600 disabled:opacity-50 text-black py-1 px-3 rounded-lg flex items-center gap-1 transition-all"
                >
                  {isLoadingHint ? (
                    <>
                      <RefreshCw className="h-3 w-3 animate-spin" />
                      Generating Hint...
                    </>
                  ) : (
                    <>
                      <Sparkles className="h-3 w-3 fill-black" />
                      Get Hint ({hintsRemaining} left)
                    </>
                  )}
                </button>
              )}
            </div>
            <div className="p-5 bg-muted/30 border border-border rounded-xl cursor-default select-none">
              <p className="text-sm font-semibold text-foreground leading-relaxed cursor-default">
                {question}
              </p>
            </div>

            {/* Hint Box display */}
            {activeHint && (
              <div className="p-4 bg-amber-500/10 border border-amber-500/20 rounded-xl relative animate-in fade-in slide-in-from-top-2 duration-200">
                <button
                  type="button"
                  onClick={() => setActiveHint(null)}
                  className="absolute right-3 top-3 p-0.5 rounded text-amber-500 hover:bg-amber-500/20 cursor-pointer"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
                <div className="flex items-start gap-2 pr-6">
                  <Sparkles className="h-4 w-4 text-amber-500 shrink-0 mt-0.5" />
                  <div className="space-y-1">
                    <span className="text-[10px] font-bold text-amber-500 uppercase tracking-wider block">Interviewer Hint</span>
                    <p className="text-xs text-foreground leading-relaxed font-medium">{activeHint}</p>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Answer details */}
          <div className="space-y-4 pt-4">
            <div className="flex justify-between items-center">
              <h4 className="text-xs font-bold text-foreground uppercase tracking-wider flex items-center gap-1.5">
                Your Answer
              </h4>

              {/* Mic toggle */}
              <button
                onClick={handleToggleRecord}
                className={`py-1.5 px-3 rounded-lg border text-xs font-bold flex items-center gap-1.5 transition-all cursor-pointer ${isRecording
                    ? "bg-red-500/10 border-red-500/20 text-red-400"
                    : "bg-primary/10 border-primary/20 text-primary hover:bg-primary/20"
                  }`}
              >
                {isRecording ? <MicOff className="w-3.5 h-3.5" /> : <Mic className="w-3.5 h-3.5" />}
                {isRecording ? "Stop Dictation" : "Dictate Voice"}
              </button>
            </div>

            {/* Answer textarea fallback */}
            <textarea
              value={userAnswerText}
              onChange={(e) => setUserAnswerText(e.target.value)}
              placeholder="Record your response or type here. Using the STAR model (Situation, Task, Action, Result) is highly encouraged."
              className="w-full h-32 p-4 bg-background border border-border rounded-xl text-sm leading-relaxed outline-none focus:border-primary/40 resize-none font-sans"
            />
          </div>

          {/* Submission and Action buttons */}
          <div className="flex items-center justify-between pt-4 border-t border-border mt-4">
            <span className="text-[10px] text-muted-foreground">
              {userAnswerText.split(/\s+/).filter(Boolean).length} words recorded
            </span>
            <button
              onClick={handleSubmitAnswer}
              disabled={!userAnswerText.trim() || isSubmitting}
              className="cursor-pointer font-bold bg-primary text-primary-foreground hover:bg-primary/90 py-2.5 px-6 rounded-lg disabled:opacity-50 disabled:cursor-not-allowed transition-all flex items-center gap-2 shadow-sm"
            >
              {isSubmitting ? "Evaluating..." : "Submit Answer"}
              <ArrowRight className="w-4 h-4" />
            </button>
          </div>

        </div>

      </div>
    </div>
  );
}
