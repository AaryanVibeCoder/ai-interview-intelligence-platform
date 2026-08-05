import { AudioMetrics } from "@/types/audio";

export class AudioSession {
  private audioContext: AudioContext | null = null;
  private analyser: AnalyserNode | null = null;
  private mediaStream: MediaStream | null = null;
  private source: MediaStreamAudioSourceNode | null = null;

  async initialize(): Promise<void> {
    if (typeof window === "undefined") return;

    // If already initialized, verify the stream is still active
    if (this.audioContext && this.mediaStream) {
      const tracks = this.mediaStream.getTracks();
      const allAlive = tracks.length > 0 && tracks.every((t) => t.readyState === "live");
      if (allAlive && this.audioContext.state !== "closed") {
        // Resume if suspended (Chrome autoplay policy)
        if (this.audioContext.state === "suspended") {
          await this.audioContext.resume();
        }
        return; // Already initialized and healthy
      }
      // Stream is dead or context is closed — clean up and reinitialize
      this.stopRecording();
    }

    const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
    if (!AudioContextClass) {
      throw new Error("Web Audio API is not supported in this browser.");
    }

    this.audioContext = new AudioContextClass();

    // CRITICAL: Resume the AudioContext — Chrome starts it in "suspended" state
    // and requires a user gesture to activate. This must be called from within
    // a user-initiated event handler (like a button click).
    if (this.audioContext.state === "suspended") {
      await this.audioContext.resume();
    }

    this.analyser = this.audioContext.createAnalyser();
    this.analyser.fftSize = 2048;

    try {
      this.mediaStream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch (err) {
      // Clean up context if mic access fails
      this.audioContext.close().catch(() => {});
      this.audioContext = null;
      this.analyser = null;
      throw err;
    }

    this.source = this.audioContext.createMediaStreamSource(this.mediaStream);
    this.source.connect(this.analyser);

    // Global reference so it survives the entire session
    (window as any).audioSession = this;
  }

  /** Force a fresh initialization — useful when navigating between pages */
  async reinitialize(): Promise<void> {
    this.stopRecording();
    await this.initialize();
  }

  isActive(): boolean {
    if (!this.audioContext || !this.mediaStream || !this.analyser) return false;
    if (this.audioContext.state === "closed") return false;
    const tracks = this.mediaStream.getTracks();
    return tracks.length > 0 && tracks.every((t) => t.readyState === "live");
  }

  getMicLevel(): number {
    if (!this.analyser || !this.audioContext) return -100;

    if (this.audioContext.state === "suspended") {
      this.audioContext.resume().catch(() => {});
    }
    if (this.audioContext.state !== "running") return -100;

    const dataArray = new Uint8Array(this.analyser.frequencyBinCount);
    this.analyser.getByteFrequencyData(dataArray);
    const avg = dataArray.reduce((a, b) => a + b) / dataArray.length;
    if (avg === 0) return -100;
    
    // Convert to relative amplitude value
    const db = 20 * Math.log10(avg / 255);
    
    // Scale it to decibel values matching the 60-70 dB SPL target range
    // Since math log results in negative dBFS, we map it:
    // -100 dBFS is silence (~30 dB SPL)
    // 0 dBFS is clipping (~100 dB SPL)
    const dbSpl = 100 + db;
    return Math.round(dbSpl);
  }

  getAudioMetrics(): AudioMetrics {
    const peakDb = this.getMicLevel();
    const bgNoise = this.getBackgroundNoise();
    const snr = Math.max(0, peakDb - bgNoise);
    
    let clarity: "clear" | "acceptable" | "poor" = "poor";
    if (peakDb >= 60 && peakDb <= 70 && snr >= 20) {
      clarity = "clear";
    } else if (peakDb >= 55 && peakDb <= 75 && snr >= 15) {
      clarity = "acceptable";
    }

    return {
      peakDb: Math.round(peakDb),
      snr: Math.round(snr),
      backgroundNoise: Math.round(bgNoise),
      clarity,
      timestamp: new Date().toISOString(),
    };
  }

  private getBackgroundNoise(): number {
    // Return a proxy silence level by monitoring low inputs, default to 30 dB SPL
    const peakDb = this.getMicLevel();
    if (peakDb <= -100) return 30;
    return Math.max(30, peakDb - 25);
  }

  stopRecording(): void {
    if (this.mediaStream) {
      this.mediaStream.getTracks().forEach((track) => track.stop());
      this.mediaStream = null;
    }
    if (this.source) {
      this.source.disconnect();
      this.source = null;
    }
    if (this.audioContext) {
      this.audioContext.close().catch(() => {});
      this.audioContext = null;
    }
    this.analyser = null;
  }
}

// Instantiate singleton (browser-only)
export const audioSession = typeof window !== "undefined" ? new AudioSession() : ({} as AudioSession);
