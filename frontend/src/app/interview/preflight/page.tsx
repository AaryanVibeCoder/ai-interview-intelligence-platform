"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { audioSession } from "@/lib/audioSession";
import { useInterviewStore } from "@/store/interview-store";
import { apiConfig } from "@/services/api/config";
import { 
  Mic, 
  Volume2, 
  Wifi, 
  ShieldCheck, 
  AlertCircle, 
  RefreshCw, 
  Activity, 
  CheckCircle2, 
  Sparkles, 
  ArrowRight
} from "lucide-react";

type PreflightStep = "environment" | "mic" | "internet" | "audio" | "speaker" | "latency";
type PreflightStatus = "pending" | "checking" | "passed" | "failed";

interface PreflightState {
  step: PreflightStep;
  statuses: Record<PreflightStep, PreflightStatus>;
  internetSpeed: number | null;
  latency: number | null;
  retryCount: Record<PreflightStep, number>;
}

export default function PreflightPage() {
  const router = useRouter();
  const { preflightCompleted, setPreflightCompleted, interviewType } = useInterviewStore();

  const [state, setState] = useState<PreflightState>({
    step: "environment",
    statuses: {
      environment: "pending",
      mic: "pending",
      internet: "pending",
      audio: "pending",
      speaker: "pending",
      latency: "pending"
    },
    internetSpeed: null,
    latency: null,
    retryCount: { environment: 0, mic: 0, internet: 0, audio: 0, speaker: 0, latency: 0 }
  });

  const [environment, setEnvironment] = useState<"quiet" | "noisy" | "professional">("quiet");
  const [peakDb, setPeakDb] = useState<number>(30);
  const [isTestTonePlaying, setIsTestTonePlaying] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const meterAnimationRef = useRef<number | null>(null);
  const maxPeakRef = useRef<number>(-100);
  const speakerResolveRef = useRef<((val: boolean) => void) | null>(null);
  const [requiresSpeakerConfirmation, setRequiresSpeakerConfirmation] = useState(false);

  const [isBuiltInMic, setIsBuiltInMic] = useState<boolean>(true);

  const updateDeviceList = async () => {
    if (typeof window === "undefined" || !navigator.mediaDevices) return;
    try {
      const devices = await navigator.mediaDevices.enumerateDevices();
      const inputs = devices.filter((d) => d.kind === "audioinput");

      let hasExternalMic = false;
      for (const d of inputs) {
        const label = d.label ? d.label.toLowerCase() : "";
        if (!label) continue;

        // ponytail: check if labeled device indicates an external mic or headset
        const isExternal = label.includes("usb") || 
                           label.includes("headset") || 
                           label.includes("headphone") || 
                           label.includes("bluetooth") || 
                           label.includes("airpods") || 
                           label.includes("external") || 
                           label.includes("hands-free") ||
                           (label.includes("mic") && !label.includes("built-in") && !label.includes("internal") && !label.includes("integrated") && !label.includes("realtek") && !label.includes("conexant") && !label.includes("intel"));

        if (isExternal) {
          hasExternalMic = true;
          break;
        }
      }

      setIsBuiltInMic(!hasExternalMic);
    } catch (err) {
      console.warn("Failed to enumerate audio input devices:", err);
      setIsBuiltInMic(true);
    }
  };

  useEffect(() => {
    if (typeof window === "undefined" || !navigator.mediaDevices) return;
    navigator.mediaDevices.addEventListener("devicechange", updateDeviceList);
    return () => {
      navigator.mediaDevices.removeEventListener("devicechange", updateDeviceList);
    };
  }, []);

  // If already completed in the store, redirect or show options
  useEffect(() => {
    if (preflightCompleted) {
      // Allow candidates to jump straight to setup if preflight passed
      console.log("Preflight already completed in this session.");
    }
  }, [preflightCompleted]);

  // Pre-warm SpeechSynthesis voices on mount (Chrome loads them asynchronously)
  useEffect(() => {
    if (typeof window !== "undefined" && window.speechSynthesis) {
      window.speechSynthesis.getVoices();
    }
  }, []);

  // Handle active audio level visualization
  useEffect(() => {
    if (state.statuses.mic === "passed" && state.step === "audio") {
      const updateMeter = () => {
        audioSession.getMicLevel();
        const metrics = audioSession.getAudioMetrics();
        setPeakDb(metrics.peakDb);

        if (metrics.peakDb > maxPeakRef.current) {
          maxPeakRef.current = metrics.peakDb;
        }

        meterAnimationRef.current = requestAnimationFrame(updateMeter);
      };
      updateMeter();
    }
    return () => {
      if (meterAnimationRef.current) {
        cancelAnimationFrame(meterAnimationRef.current);
      }
    };
  }, [state.statuses.mic, state.step]);

  const startPreflight = async () => {
    setErrorMessage(null);
    
    // Step 1: Environment Selection
    setState((s) => ({
      ...s,
      step: "environment",
      statuses: { ...s.statuses, environment: "checking" }
    }));
    await new Promise((resolve) => setTimeout(resolve, 800));
    setState((s) => ({
      ...s,
      statuses: { ...s.statuses, environment: "passed" },
      step: "mic"
    }));

    // Step 2: Microphone Access
    setState((s) => ({
      ...s,
      step: "mic",
      statuses: { ...s.statuses, mic: "checking" }
    }));
    try {
      await audioSession.initialize();
      await updateDeviceList();
      setState((s) => ({
        ...s,
        statuses: { ...s.statuses, mic: "passed" },
        step: "internet"
      }));
    } catch (err) {
      console.error("Microphone access denied or error during initialization:", err);
      setState((s) => ({
        ...s,
        statuses: { ...s.statuses, mic: "failed" }
      }));
      setErrorMessage("Microphone access denied. Please verify your system permissions and try again.");
      return;
    }

    // Step 3: Internet Speed Check
    setState((s) => ({
      ...s,
      step: "internet",
      statuses: { ...s.statuses, internet: "checking" }
    }));
    const speed = await checkInternetSpeed();
    if (speed >= 0.1) {
      maxPeakRef.current = -100;
      setState((s) => ({
        ...s,
        internetSpeed: speed,
        statuses: { ...s.statuses, internet: "passed" },
        step: "audio"
      }));
    } else {
      setState((s) => ({
        ...s,
        internetSpeed: speed,
        statuses: { ...s.statuses, internet: "failed" }
      }));
      setErrorMessage(`Internet speed is too slow (${speed.toFixed(1)} Mbps). Minimum requirement is 0.1 Mbps.`);
      return;
    }

    // Step 4: Audio Quality Test (Speak Check)
    setState((s) => ({
      ...s,
      step: "audio",
      statuses: { ...s.statuses, audio: "checking" }
    }));
    
    // Record sample for 4 seconds while candidate speaks
    await new Promise((resolve) => setTimeout(resolve, 4000));
    
    const finalMetrics = {
      peakDb: maxPeakRef.current === -100 ? 30 : Math.round(maxPeakRef.current)
    };
    
    const audioPass = validateAudioMetrics(finalMetrics, environment);
    if (audioPass) {
      setState((s) => ({
        ...s,
        statuses: { ...s.statuses, audio: "passed" },
        step: "speaker"
      }));
    } else {
      const retries = (state.retryCount.audio || 0) + 1;
      setState((s) => ({
        ...s,
        statuses: { ...s.statuses, audio: "failed" },
        retryCount: { ...s.retryCount, audio: retries }
      }));
      setErrorMessage(
        `Audio quality check failed (Peak level captured was only ${finalMetrics.peakDb} dB). ` +
        `Please ensure your microphone is unmuted, verify your browser permission, and try speaking louder.`
      );
    }
  };

  const triggerSpeakerTestManually = async () => {
    setErrorMessage(null);
    setState((s) => ({
      ...s,
      statuses: { ...s.statuses, speaker: "checking" }
    }));
    const speakerPass = await runSpeakerTest();
    if (speakerPass) {
      setState((s) => ({
        ...s,
        statuses: { ...s.statuses, speaker: "passed" },
        step: "latency"
      }));
      continuePreflightAfterSpeaker();
    } else {
      setState((s) => ({
        ...s,
        statuses: { ...s.statuses, speaker: "failed" }
      }));
      setErrorMessage("Speaker verification failed or dismissed. Check output volumes.");
    }
  };

  const continuePreflightAfterSpeaker = async () => {
    // Step 6: Latency Check
    setState((s) => ({
      ...s,
      step: "latency",
      statuses: { ...s.statuses, latency: "checking" }
    }));
    const latencyMs = await checkLatency();
    const latencyPass = latencyMs < 500;

    setState((s) => ({
      ...s,
      latency: latencyMs,
      statuses: {
        ...s.statuses,
        latency: latencyPass ? ("passed" as const) : ("failed" as const)
      }
    }));

    if (latencyPass) {
      setPreflightCompleted(true);
      setTimeout(() => {
        if (interviewType === "coding") {
          router.push("/interview/coding");
        } else if (interviewType === "behavioral") {
          router.push("/interview/behavioral");
        } else {
          router.push("/dashboard");
        }
      }, 1500);
    } else {
      setErrorMessage(`Latency is too high (${latencyMs}ms). Requirement: < 500ms.`);
    }
  };

  async function checkInternetSpeed(): Promise<number> {
    try {
      const startTime = performance.now();
      const response = await fetch(`${apiConfig.baseUrl}/health/test-1mb?t=${Date.now()}`, { cache: "no-store" });
      if (!response.ok) throw new Error("Network speed test endpoint failed");
      await response.json();
      const endTime = performance.now();
      const duration = (endTime - startTime) / 1000;
      
      // 1MB is 8.388608 Megabits
      const speed = 8.388608 / duration;
      return speed;
    } catch (err) {
      console.warn("Real network throughput check failed, falling back to latency estimation:", err);
      try {
        const startTime = performance.now();
        await fetch(`${apiConfig.baseUrl}/health/`, { cache: "no-store" });
        const elapsed = performance.now() - startTime;
        if (elapsed > 400) return 0.8;
        return 5.0;
      } catch {
        return 0;
      }
    }
  }

  function validateAudioMetrics(metrics: { peakDb: number }, env: string): boolean {
    const minPeak = 45;
    return metrics.peakDb >= minPeak;
  }

  /** Wait for browser to load TTS voices (Chrome loads them asynchronously) */
  function waitForVoices(): Promise<SpeechSynthesisVoice[]> {
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
      // Safety timeout — if voiceschanged never fires, resolve with whatever we have
      setTimeout(() => {
        window.speechSynthesis.removeEventListener("voiceschanged", onVoicesChanged);
        resolve(window.speechSynthesis.getVoices());
      }, 3000);
    });
  }

  async function runSpeakerTest(): Promise<boolean> {
    setIsTestTonePlaying(true);
    
    // Wait for voices to be loaded before speaking
    const voices = await waitForVoices();
    
    const utterance = new SpeechSynthesisUtterance("Hi, can you hear me clearly? I am your ElevateIQ AI interviewer.");
    utterance.rate = 0.95;
    utterance.volume = 1.0;
    
    // Select a good English voice
    const voice = voices.find((v) => v.lang.startsWith("en-US") && v.name.includes("Natural")) ||
                  voices.find((v) => v.lang.startsWith("en-US")) ||
                  voices.find((v) => v.lang.startsWith("en")) ||
                  voices[0];
    if (voice) utterance.voice = voice;
    
    return new Promise((resolve) => {
      utterance.onend = () => {
        setIsTestTonePlaying(false);
        setRequiresSpeakerConfirmation(true);
        speakerResolveRef.current = resolve;
      };
      utterance.onerror = () => {
        setIsTestTonePlaying(false);
        setRequiresSpeakerConfirmation(true);
        speakerResolveRef.current = resolve;
      };
      window.speechSynthesis.speak(utterance);
    });
  }

  async function checkLatency(): Promise<number> {
    const start = performance.now();
    try {
      await fetch(`${apiConfig.baseUrl || "http://127.0.0.1:8500"}/health/live`, { cache: "no-store" });
      return Math.round(performance.now() - start);
    } catch {
      return 600; // fail limit
    }
  }

  return (
    <div className="max-w-3xl mx-auto py-12 px-6">
      <div className="bg-card border border-border rounded-2xl shadow-elevate-md p-8 md:p-10 space-y-8 backdrop-blur-md">
        
        {/* Header */}
        <div className="text-center space-y-3">
          <div className="inline-flex p-3 bg-primary/10 rounded-2xl text-primary mb-2 animate-pulse">
            <ShieldCheck className="w-10 h-10" />
          </div>
          <h1 className="text-3xl font-extrabold tracking-tight bg-gradient-to-r from-foreground via-foreground to-primary bg-clip-text text-transparent">
            Audio & Network Pre-Flight Check
          </h1>
          <p className="text-muted-foreground text-sm max-w-xl mx-auto">
            Verify your local workspace, microphone levels, audio speakers, and connectivity ping to ensure a flawless interview session.
          </p>
        </div>

        {/* Bypass check if already complete */}
        {preflightCompleted && interviewType === "coding" && (
          <div className="p-4 bg-success/10 border border-success/20 rounded-xl flex items-center justify-between">
            <div className="flex items-center gap-3 text-success">
              <CheckCircle2 className="w-5 h-5 flex-shrink-0" />
              <span className="text-sm font-semibold">Pre-Flight calibration has already passed for this session.</span>
            </div>
            <button 
              onClick={() => {
                if (interviewType === "coding") {
                  router.push("/interview/coding");
                } else if (interviewType === "behavioral") {
                  router.push("/interview/behavioral");
                } else {
                  router.push("/dashboard");
                }
              }}
              className="text-xs font-bold bg-success text-success-foreground hover:bg-success/90 py-2 px-4 rounded-lg flex items-center gap-1.5 transition-all"
            >
              Skip to Interview <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>
        )}

        {/* Step 1: Environment selection */}
        <div className="space-y-4 bg-muted/20 border border-border p-6 rounded-xl">
          <h2 className="text-md font-bold flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-primary" />
            1. Select Your Interview Environment
          </h2>
          <div className="grid grid-cols-3 gap-3">
            {(["quiet", "noisy", "professional"] as const).map((env) => (
              <button
                key={env}
                onClick={() => setEnvironment(env)}
                className={`py-3 px-4 rounded-xl border text-xs font-bold flex flex-col items-center gap-2 transition-all ${
                  environment === env
                    ? "bg-primary/10 border-primary text-primary shadow-glow-primary"
                    : "bg-background border-border text-muted-foreground hover:text-foreground"
                }`}
              >
                <span className="capitalize">{env} Workspace</span>
              </button>
            ))}
          </div>
        </div>

        {/* Steps display list */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {(["environment", "mic", "internet", "audio", "speaker", "latency"] as const).map((step) => {
            const status = state.statuses[step];
            const isCurrent = state.step === step;
            
            return (
              <div 
                key={step} 
                className={`p-4 rounded-xl border flex items-center justify-between transition-all ${
                  isCurrent 
                    ? "bg-accent/10 border-accent/30 shadow-sm" 
                    : status === "passed" 
                      ? "bg-success/5 border-success/20" 
                      : status === "failed" 
                        ? "bg-destructive/5 border-destructive/20" 
                        : "bg-background/40 border-border/50"
                }`}
              >
                <div className="flex items-center gap-3">
                  <div className={`p-2.5 rounded-lg ${
                    status === "passed" 
                      ? "bg-success/15 text-success" 
                      : status === "failed" 
                        ? "bg-destructive/15 text-destructive" 
                        : isCurrent 
                          ? "bg-accent/20 text-accent" 
                          : "bg-muted text-muted-foreground"
                  }`}>
                    {step === "environment" && <Sparkles className="w-4 h-4" />}
                    {step === "mic" && <Mic className="w-4 h-4" />}
                    {step === "internet" && <Wifi className="w-4 h-4" />}
                    {step === "audio" && <Activity className="w-4 h-4" />}
                    {step === "speaker" && <Volume2 className="w-4 h-4" />}
                    {step === "latency" && <Activity className="w-4 h-4" />}
                  </div>
                  <div className="flex flex-col">
                    <span className="text-xs font-semibold capitalize">{step.replace("-", " ")}</span>
                    <span className="text-[10px] text-muted-foreground">
                      {step === "environment" && "Calibration profile selection"}
                      {step === "mic" && "Device driver authorization"}
                      {step === "internet" && state.internetSpeed ? `${state.internetSpeed.toFixed(1)} Mbps bandwidth` : step === "internet" && "Download rate diagnostics"}
                      {step === "audio" && state.statuses.audio === "checking" ? "Analyzing speak levels (4s)..." : step === "audio" && "Room frequency & SNR levels"}
                      {step === "speaker" && isTestTonePlaying ? "Playing vocal track..." : step === "speaker" && "Hardware voice generation"}
                      {step === "latency" && state.latency ? `${state.latency} ms round-trip` : step === "latency" && "Network router ping rate"}
                    </span>
                  </div>
                </div>
                <div>
                  {status === "passed" && <CheckCircle2 className="w-5 h-5 text-success" />}
                  {status === "failed" && <AlertCircle className="w-5 h-5 text-destructive" />}
                  {status === "checking" && <RefreshCw className="w-4 h-4 text-primary animate-spin" />}
                  {status === "pending" && <span className="text-[10px] font-bold text-muted-foreground uppercase">Wait</span>}
                </div>
              </div>
            );
          })}
        </div>

        {/* Live levels monitor for Audio Check */}
        {state.step === "audio" && state.statuses.mic === "passed" && (
          <div className="p-6 bg-muted/10 border border-border/50 rounded-xl space-y-4 animate-in fade-in duration-200">
            <h3 className="text-xs font-bold text-foreground uppercase tracking-wider flex items-center gap-1.5">
              <Activity className="w-3.5 h-3.5 text-primary" /> Live Mic Input Levels
            </h3>
            <p className="text-[11px] text-muted-foreground leading-normal">
              Speak out loud now to test the calibration: <strong className="text-primary font-semibold">&ldquo;Test testing, checking audio on ElevateIQ.&rdquo;</strong>
            </p>
            
            <div className="bg-background border border-border p-4 rounded-lg text-center space-y-1">
              <span className="block text-[10px] text-muted-foreground font-semibold uppercase tracking-wide">Mic Input Signal</span>
              <span className="block text-xl font-black text-foreground">{peakDb > 35 ? "🎙️ Active Sound Detected" : "🔇 Waiting for Input"}</span>
              <span className="text-[9px] text-muted-foreground block">Peak Level: {peakDb} dB SPL (Target: &gt;= 45)</span>
            </div>
            
            {/* Visual sound wave meter */}
            <div className="h-2.5 w-full bg-background rounded-full overflow-hidden border border-border flex">
              <div 
                className={`h-full transition-all duration-75 ${
                  peakDb < 45 ? "bg-amber-500" : peakDb > 85 ? "bg-red-500" : "bg-success"
                }`}
                style={{ width: `${Math.max(5, Math.min(100, ((peakDb - 30) / 70) * 100))}%` }}
              ></div>
            </div>

            {/* Recommendation Banner */}
            <div className="pt-4 border-t border-border/60">
              {isBuiltInMic ? (
                <div className="p-3 bg-amber-500/10 border border-amber-500/20 rounded-xl text-[10px] text-amber-500 leading-normal flex gap-2 animate-in fade-in duration-200">
                  <span className="text-sm shrink-0">⚠️</span>
                  <p className="font-semibold">
                    For best results, we recommend using headphones or an external microphone to ensure optimal voice recognition quality.
                  </p>
                </div>
              ) : (
                <div className="p-3 bg-emerald-500/10 border border-emerald-500/20 rounded-xl text-[10px] text-emerald-500 leading-normal flex gap-2 animate-in fade-in duration-200">
                  <span className="text-sm shrink-0">✨</span>
                  <p className="font-semibold">
                    External microphone or headset detected. Ready for optimal voice capture!
                  </p>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Speaker Manual Trigger Panel */}
        {state.step === "speaker" && !requiresSpeakerConfirmation && state.statuses.speaker !== "passed" && (
          <div className="p-6 bg-primary/5 border border-primary/20 rounded-xl flex flex-col items-center text-center gap-4 animate-in fade-in duration-200">
            <Volume2 className="w-8 h-8 text-primary animate-pulse" />
            <div className="space-y-1">
              <h3 className="text-sm font-bold text-foreground">Test Your Speakers</h3>
              <p className="text-xs text-muted-foreground max-w-sm">
                Click the button below to play a short test phrase and verify your audio output hardware is working.
              </p>
            </div>
            <button
              type="button"
              onClick={triggerSpeakerTestManually}
              className="cursor-pointer font-bold bg-primary text-primary-foreground hover:bg-primary/90 py-2.5 px-6 rounded-xl text-xs flex items-center gap-2 transition-all shadow-glow-primary"
            >
              <Volume2 className="w-4 h-4" />
              Play Test Voice
            </button>
          </div>
        )}

        {/* Speaker Confirmation Panel */}
        {requiresSpeakerConfirmation && (
          <div className="p-6 bg-primary/5 border border-primary/20 rounded-xl space-y-4 animate-in fade-in slide-in-from-bottom-2 duration-200">
            <h3 className="text-sm font-bold text-foreground flex items-center gap-2">
              <Volume2 className="w-4 h-4 text-primary animate-bounce" />
              Confirm Speaker Output
            </h3>
            <p className="text-xs text-muted-foreground leading-relaxed">
              We played an AI vocal track: <strong className="text-foreground">&ldquo;Hi, can you hear me clearly? I am your ElevateIQ AI interviewer.&rdquo;</strong> Did you hear it clearly from your speakers or headphones?
            </p>
            <div className="flex gap-3 justify-end">
              <button
                onClick={() => {
                  setRequiresSpeakerConfirmation(false);
                  if (speakerResolveRef.current) {
                    speakerResolveRef.current(true);
                  }
                }}
                className="cursor-pointer font-bold bg-success text-success-foreground hover:bg-success/90 py-2 px-5 rounded-lg text-xs transition-all"
              >
                Yes, I heard it clearly
              </button>
              <button
                onClick={() => {
                  setRequiresSpeakerConfirmation(false);
                  if (speakerResolveRef.current) {
                    speakerResolveRef.current(false);
                  }
                }}
                className="cursor-pointer font-bold bg-destructive text-destructive-foreground hover:bg-destructive/90 py-2 px-5 rounded-lg text-xs transition-all"
              >
                No, I didn&apos;t hear anything
              </button>
            </div>
          </div>
        )}

        {/* Global Error Banner */}
        {errorMessage && (
          <div className="p-4 bg-destructive/10 border border-destructive/20 rounded-xl flex gap-3 text-destructive animate-in slide-in-from-top-2">
            <AlertCircle className="w-5 h-5 flex-shrink-0 mt-0.5" />
            <div className="text-xs space-y-1">
              <p className="font-bold">Check Diagnostics Error</p>
              <p className="leading-relaxed opacity-90">{errorMessage}</p>
            </div>
          </div>
        )}

        {/* Submit action */}
        <div className="flex justify-end gap-3 pt-4 border-t border-border">
          <button
            onClick={startPreflight}
            disabled={Object.values(state.statuses).some((s) => s === "checking")}
            className="cursor-pointer font-bold bg-primary text-primary-foreground hover:bg-primary/90 py-3 px-8 rounded-xl shadow-glow-primary transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
          >
            <RefreshCw className={`w-4 h-4 ${Object.values(state.statuses).some((s) => s === "checking") ? "animate-spin" : ""}`} />
            Start Pre-Flight Checks
          </button>
        </div>

      </div>
    </div>
  );
}
