export interface AudioCalibration {
  voiceTarget: { min: number; max: number; unit: "dB SPL" };
  voiceAcceptable: { min: number; max: number; unit: "dB SPL" };
  backgroundNoiseMax: number;
  snr: { minimum: number };
}

export interface AudioMetrics {
  peakDb: number;
  snr: number;
  backgroundNoise: number;
  clarity: "clear" | "acceptable" | "poor";
  timestamp: string;
}
