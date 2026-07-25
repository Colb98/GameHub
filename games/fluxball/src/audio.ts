/** WebAudio synth, same approach as the other hub games — no audio assets. */
export class Synth {
  private context?: AudioContext;

  constructor(private readonly isMuted: () => boolean) {}

  tone(frequency: number, duration = 0.06, gain = 0.035, slide = 0, type: OscillatorType = 'sine') {
    if (this.isMuted()) return;
    const AudioCtor =
      window.AudioContext ??
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AudioCtor) return;
    this.context ??= new AudioCtor();
    const context = this.context;
    if (context.state === 'suspended') void context.resume();
    const oscillator = context.createOscillator();
    const volume = context.createGain();
    const now = context.currentTime;
    oscillator.type = type;
    oscillator.frequency.setValueAtTime(frequency, now);
    oscillator.frequency.exponentialRampToValueAtTime(
      Math.max(40, frequency + slide),
      now + duration,
    );
    volume.gain.setValueAtTime(gain, now);
    volume.gain.exponentialRampToValueAtTime(0.0001, now + duration);
    oscillator.connect(volume);
    volume.connect(context.destination);
    oscillator.start(now);
    oscillator.stop(now + duration);
  }

  peg(pitchStep: number) {
    this.tone(320 + pitchStep * 26, 0.07, 0.03, 60);
  }

  target() {
    this.tone(660, 0.16, 0.045, 240, 'triangle');
  }

  flip(charge: number) {
    this.tone(charge > 0 ? 520 : 380, 0.09, 0.035, charge > 0 ? 140 : -110, 'square');
  }

  launch() {
    this.tone(200, 0.12, 0.03, 180);
  }

  bucket() {
    this.tone(520, 0.22, 0.05, 400, 'triangle');
  }

  fail() {
    this.tone(180, 0.3, 0.04, -90, 'sawtooth');
  }

  levelClear() {
    this.tone(440, 0.18, 0.05, 320, 'triangle');
    window.setTimeout(() => this.tone(660, 0.26, 0.05, 260, 'triangle'), 120);
  }
}
