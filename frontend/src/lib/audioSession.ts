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
    
    // ponytail: connect to destination via muted gain node to prevent browser from optimizing away processing
    const gainNode = this.audioContext.createGain();
    gainNode.gain.value = 0;
    this.source.connect(this.analyser);
    this.analyser.connect(gainNode);
    gainNode.connect(this.audioContext.destination);

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
    if (this.audioContext.state === "closed") return -100;

    // Use time-domain data as it is more robust than frequency domain for measuring sound amplitude/peak level.
    const dataArray = new Uint8Array(this.analyser.fftSize);
    this.analyser.getByteTimeDomainData(dataArray);
    
    let maxDeviation = 0;
    for (let i = 0; i < dataArray.length; i++) {
      const deviation = Math.abs(dataArray[i] - 128);
      if (deviation > maxDeviation) {
        maxDeviation = deviation;
      }
    }
    
    // Normalized to [0, 1]
    const normalized = maxDeviation / 128;
    if (normalized === 0) return -100;
    
    // Convert to relative amplitude value (dBFS)
    const db = 20 * Math.log10(normalized);
    
    // Scale to positive dB SPL range matching the 30 - 100 dB SPL target
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

  getMediaStream(): MediaStream | null {
    return this.mediaStream;
  }
}

// Instantiate singleton (browser-only)
export const audioSession = typeof window !== "undefined" ? new AudioSession() : ({} as AudioSession);
