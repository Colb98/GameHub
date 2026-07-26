export class ArcadeAudio {
  private context?: AudioContext;

  constructor(private readonly isMuted: () => boolean) {}

  private getContext(): AudioContext | undefined {
    if (this.isMuted()) return undefined;
    const AudioCtor =
      window.AudioContext ??
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AudioCtor) return undefined;
    this.context ??= new AudioCtor();
    if (this.context.state === 'suspended') void this.context.resume();
    return this.context;
  }

  private tone(
    frequency: number,
    duration: number,
    gain: number,
    type: OscillatorType = 'square',
    slide = 0,
    delay = 0,
  ) {
    const context = this.getContext();
    if (!context) return;
    const oscillator = context.createOscillator();
    const volume = context.createGain();
    const now = context.currentTime + delay;
    oscillator.type = type;
    oscillator.frequency.setValueAtTime(frequency, now);
    oscillator.frequency.exponentialRampToValueAtTime(
      Math.max(45, frequency + slide),
      now + duration,
    );
    volume.gain.setValueAtTime(gain, now);
    volume.gain.exponentialRampToValueAtTime(0.0001, now + duration);
    oscillator.connect(volume);
    volume.connect(context.destination);
    oscillator.start(now);
    oscillator.stop(now + duration);
  }

  land() {
    this.tone(150, 0.045, 0.018, 'triangle', -24);
  }

  match() {
    this.tone(520, 0.07, 0.026, 'square', 90);
    this.tone(780, 0.08, 0.018, 'triangle', 50, 0.045);
  }

  mismatch() {
    this.tone(190, 0.12, 0.034, 'sawtooth', -80);
  }

  repaint() {
    this.tone(330, 0.06, 0.024, 'square', 120);
    this.tone(500, 0.07, 0.021, 'square', 160, 0.052);
  }

  heal() {
    this.tone(440, 0.1, 0.022, 'triangle', 80);
    this.tone(660, 0.13, 0.018, 'triangle', 110, 0.06);
  }

  pickup() {
    this.tone(720, 0.055, 0.022, 'square', 190);
    this.tone(980, 0.07, 0.017, 'square', 120, 0.045);
  }

  prism() {
    [392, 494, 587, 740, 880].forEach((frequency, index) => {
      this.tone(frequency, 0.18, 0.018, 'triangle', 120, index * 0.035);
    });
  }

  press() {
    this.tone(105, 0.15, 0.035, 'sawtooth', -45);
  }

  gameOver() {
    this.tone(260, 0.25, 0.035, 'square', -110);
    this.tone(160, 0.32, 0.028, 'sawtooth', -70, 0.16);
  }
}
