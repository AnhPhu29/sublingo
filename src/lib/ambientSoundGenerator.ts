// Web Audio API Ambient Sound Synthesizer
// Generates 100% offline, procedural soundscapes for focused & relaxing reading.

export type AmbientSoundType = "none" | "rain" | "ocean" | "fire" | "cafe" | "piano";

export interface AmbientSoundOption {
  id: AmbientSoundType;
  name: string;
  icon: string;
  desc: string;
}

export const AMBIENT_SOUND_OPTIONS: AmbientSoundOption[] = [
  { id: "none", name: "Tắt nhạc nền", icon: "🔇", desc: "Không phát âm thanh nền" },
  { id: "rain", name: "Mưa rơi êm dịu", icon: "🌧️", desc: "Tiếng mưa rào êm ái xua tan căng thẳng" },
  { id: "ocean", name: "Sóng biển dạt dào", icon: "🌊", desc: "Nhịp sóng vỗ bờ thư thái, định tâm" },
  { id: "fire", name: "Lò sưởi ấm áp", icon: "🔥", desc: "Tiếng lửa reo lách tách bên tách trà" },
  { id: "cafe", name: "Quán cà phê mưa", icon: "☕", desc: "Không gian ấm cúng, thư thả đọc sách" },
  { id: "piano", name: "Giai điệu Piano Lofi", icon: "🎵", desc: "Hợp âm nhẹ nhàng kích thích sóng não Alpha" },
];

class AmbientSoundEngine {
  private ctx: AudioContext | null = null;
  private masterGain: GainNode | null = null;
  private currentType: AmbientSoundType = "none";
  private isPlaying: boolean = false;
  private volume: number = 0.35; // 0.0 to 1.0

  // Active generator nodes & intervals
  private activeNodes: (AudioNode | number)[] = [];
  private pianoInterval: number | null = null;

  private initContext() {
    if (!this.ctx) {
      const AudioCtxClass = window.AudioContext || (window as any).webkitAudioContext;
      if (AudioCtxClass) {
        this.ctx = new AudioCtxClass();
        this.masterGain = this.ctx.createGain();
        this.masterGain.gain.setValueAtTime(this.volume, this.ctx.currentTime);
        this.masterGain.connect(this.ctx.destination);
      }
    }
    if (this.ctx && this.ctx.state === "suspended") {
      this.ctx.resume().catch(() => {});
    }
  }

  public setVolume(val: number) {
    this.volume = Math.max(0, Math.min(1, val));
    if (this.masterGain && this.ctx) {
      this.masterGain.gain.setTargetAtTime(this.volume, this.ctx.currentTime, 0.05);
    }
  }

  public getVolume(): number {
    return this.volume;
  }

  public getCurrentType(): AmbientSoundType {
    return this.currentType;
  }

  public play(type: AmbientSoundType) {
    this.initContext();
    if (!this.ctx || !this.masterGain) return;

    if (this.currentType === type && this.isPlaying) return;

    this.stop();
    this.currentType = type;

    if (type === "none") {
      this.isPlaying = false;
      return;
    }

    this.isPlaying = true;

    switch (type) {
      case "rain":
        this.startRain();
        break;
      case "ocean":
        this.startOcean();
        break;
      case "fire":
        this.startFire();
        break;
      case "cafe":
        this.startCafe();
        break;
      case "piano":
        this.startPiano();
        break;
    }
  }

  public stop() {
    // Clear piano intervals
    if (this.pianoInterval !== null) {
      window.clearInterval(this.pianoInterval);
      this.pianoInterval = null;
    }

    // Stop and disconnect nodes
    this.activeNodes.forEach((node) => {
      if (typeof node !== "number") {
        try {
          if ("stop" in node && typeof (node as any).stop === "function") {
            (node as any).stop();
          }
          node.disconnect();
        } catch {}
      }
    });
    this.activeNodes = [];
    this.isPlaying = false;
  }

  // 🌧️ 1. GENTLE RAIN (Pink noise with random soft droplet filtering)
  private startRain() {
    if (!this.ctx || !this.masterGain) return;
    const ctx = this.ctx;

    const bufferSize = ctx.sampleRate * 2;
    const noiseBuffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
    const output = noiseBuffer.getChannelData(0);
    let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0;

    for (let i = 0; i < bufferSize; i++) {
      const white = Math.random() * 2 - 1;
      b0 = 0.99886 * b0 + white * 0.0555179;
      b1 = 0.99332 * b1 + white * 0.0750759;
      b2 = 0.969 * b2 + white * 0.153852;
      b3 = 0.8665 * b3 + white * 0.3104856;
      b4 = 0.55 * b4 + white * 0.5329522;
      b5 = -0.7616 * b5 - white * 0.016898;
      output[i] = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + white * 0.5362) * 0.11;
      b6 = white * 0.115926;
    }

    const whiteNoise = ctx.createBufferSource();
    whiteNoise.buffer = noiseBuffer;
    whiteNoise.loop = true;

    // Filter to make gentle rain frequencies (lowpass 850Hz)
    const filter = ctx.createBiquadFilter();
    filter.type = "lowpass";
    filter.frequency.setValueAtTime(900, ctx.currentTime);

    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.75, ctx.currentTime);

    whiteNoise.connect(filter);
    filter.connect(gain);
    gain.connect(this.masterGain);

    whiteNoise.start();
    this.activeNodes.push(whiteNoise, filter, gain);
  }

  // 🌊 2. OCEAN WAVES (Brown noise with sinusoidal LFO wave swell)
  private startOcean() {
    if (!this.ctx || !this.masterGain) return;
    const ctx = this.ctx;

    const bufferSize = ctx.sampleRate * 2;
    const noiseBuffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
    const output = noiseBuffer.getChannelData(0);
    let lastOut = 0.0;

    for (let i = 0; i < bufferSize; i++) {
      const white = Math.random() * 2 - 1;
      output[i] = (lastOut + 0.02 * white) / 1.02;
      lastOut = output[i];
      output[i] *= 3.5;
    }

    const noise = ctx.createBufferSource();
    noise.buffer = noiseBuffer;
    noise.loop = true;

    // Lowpass filter modulated by LFO to simulate rhythm of waves
    const filter = ctx.createBiquadFilter();
    filter.type = "lowpass";
    filter.frequency.setValueAtTime(350, ctx.currentTime);

    const lfo = ctx.createOscillator();
    lfo.frequency.setValueAtTime(0.12, ctx.currentTime); // 1 wave every ~8 seconds

    const lfoGain = ctx.createGain();
    lfoGain.gain.setValueAtTime(280, ctx.currentTime);

    lfo.connect(lfoGain);
    lfoGain.connect(filter.frequency);

    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.85, ctx.currentTime);

    noise.connect(filter);
    filter.connect(gain);
    gain.connect(this.masterGain);

    noise.start();
    lfo.start();
    this.activeNodes.push(noise, filter, lfo, lfoGain, gain);
  }

  // 🔥 3. COZY FIREPLACE (Warm rumble + crackling pops)
  private startFire() {
    if (!this.ctx || !this.masterGain) return;
    const ctx = this.ctx;

    // Low rumble
    const bufferSize = ctx.sampleRate * 2;
    const noiseBuffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
    const output = noiseBuffer.getChannelData(0);
    let lastOut = 0.0;

    for (let i = 0; i < bufferSize; i++) {
      const white = Math.random() * 2 - 1;
      output[i] = (lastOut + 0.015 * white) / 1.015;
      lastOut = output[i];
      output[i] *= 2.8;
    }

    const noise = ctx.createBufferSource();
    noise.buffer = noiseBuffer;
    noise.loop = true;

    const filter = ctx.createBiquadFilter();
    filter.type = "lowpass";
    filter.frequency.setValueAtTime(220, ctx.currentTime);

    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.65, ctx.currentTime);

    noise.connect(filter);
    filter.connect(gain);
    gain.connect(this.masterGain);
    noise.start();

    this.activeNodes.push(noise, filter, gain);

    // Random crackle generator
    const crackleInterval = window.setInterval(() => {
      if (!this.isPlaying || this.currentType !== "fire" || !this.ctx || !this.masterGain) return;
      if (Math.random() > 0.4) return;

      const popOsc = this.ctx.createOscillator();
      const popGain = this.ctx.createGain();
      const popFilter = this.ctx.createBiquadFilter();

      popFilter.type = "bandpass";
      popFilter.frequency.setValueAtTime(800 + Math.random() * 1500, this.ctx.currentTime);
      popFilter.Q.setValueAtTime(3, this.ctx.currentTime);

      popOsc.type = "sawtooth";
      popOsc.frequency.setValueAtTime(100 + Math.random() * 300, this.ctx.currentTime);

      const popVol = 0.05 + Math.random() * 0.15;
      popGain.gain.setValueAtTime(popVol, this.ctx.currentTime);
      popGain.gain.exponentialRampToValueAtTime(0.0001, this.ctx.currentTime + 0.04);

      popOsc.connect(popFilter);
      popFilter.connect(popGain);
      popGain.connect(this.masterGain);

      popOsc.start();
      popOsc.stop(this.ctx.currentTime + 0.05);
    }, 120);

    this.activeNodes.push(crackleInterval as any);
  }

  // ☕ 4. COFFEE SHOP (Warm ambient murmur)
  private startCafe() {
    if (!this.ctx || !this.masterGain) return;
    const ctx = this.ctx;

    // Dual layered soft filtered noise
    const bufferSize = ctx.sampleRate * 2;
    const noiseBuffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
    const output = noiseBuffer.getChannelData(0);

    for (let i = 0; i < bufferSize; i++) {
      output[i] = (Math.random() * 2 - 1) * 0.18;
    }

    const noise = ctx.createBufferSource();
    noise.buffer = noiseBuffer;
    noise.loop = true;

    const filter1 = ctx.createBiquadFilter();
    filter1.type = "bandpass";
    filter1.frequency.setValueAtTime(500, ctx.currentTime);
    filter1.Q.setValueAtTime(1.2, ctx.currentTime);

    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.55, ctx.currentTime);

    noise.connect(filter1);
    filter1.connect(gain);
    gain.connect(this.masterGain);

    noise.start();
    this.activeNodes.push(noise, filter1, gain);
  }

  // 🎵 5. RELAXING PIANO LOFI (Gentle procedural pentatonic chords)
  private startPiano() {
    if (!this.ctx || !this.masterGain) return;
    const ctx = this.ctx;

    // Pentatonic scale frequencies in C Major / A Minor: C4, D4, E4, G4, A4, C5, E5
    const notes = [261.63, 293.66, 329.63, 392.0, 440.0, 523.25, 659.25];
    const chords = [
      [261.63, 329.63, 392.0], // C
      [220.0, 261.63, 329.63], // Am
      [174.61, 220.0, 261.63], // F
      [196.0, 246.94, 293.66], // G
    ];

    let chordIdx = 0;

    const playChord = () => {
      if (!this.isPlaying || this.currentType !== "piano" || !this.ctx || !this.masterGain) return;
      const currentChord = chords[chordIdx % chords.length];
      chordIdx++;

      currentChord.forEach((freq, i) => {
        const osc = this.ctx!.createOscillator();
        const gain = this.ctx!.createGain();
        const filter = this.ctx!.createBiquadFilter();

        osc.type = "sine";
        osc.frequency.setValueAtTime(freq, this.ctx!.currentTime);

        filter.type = "lowpass";
        filter.frequency.setValueAtTime(1200, this.ctx!.currentTime);

        const startTime = this.ctx!.currentTime + i * 0.08;
        const duration = 4.2;

        gain.gain.setValueAtTime(0.0001, startTime);
        gain.gain.linearRampToValueAtTime(0.09, startTime + 0.15);
        gain.gain.exponentialRampToValueAtTime(0.0001, startTime + duration);

        osc.connect(filter);
        filter.connect(gain);
        gain.connect(this.masterGain!);

        osc.start(startTime);
        osc.stop(startTime + duration);
      });
    };

    playChord();
    this.pianoInterval = window.setInterval(playChord, 4500);
  }
}

// Global Singleton Instance
export const ambientSound = typeof window !== "undefined" ? new AmbientSoundEngine() : (null as any);
