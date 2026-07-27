const PENTATONIC_SEMITONES = [0, 2, 4, 7, 9, 12, 14, 16, 19, 21] as const;
const BASE_FREQUENCY = 220;

type AudioContextConstructor = typeof AudioContext;

function dbToGain(db: number): number {
  return 10 ** (db / 20);
}

export class GameAudio {
  private context: AudioContext | null = null;
  private sfxBus: GainNode | null = null;
  private muted = true;

  setMuted(muted: boolean): void {
    this.muted = muted;
  }

  async unlock(): Promise<void> {
    if (!this.context) {
      const Constructor = (
        window.AudioContext ??
        (window as typeof window & { webkitAudioContext?: AudioContextConstructor })
          .webkitAudioContext
      );
      if (!Constructor) return;
      this.context = new Constructor();
      this.createMixBus(this.context);
    }
    if (this.context.state === 'suspended') {
      await this.context.resume();
    }
  }

  private createMixBus(context: AudioContext): void {
    const sfxBus = context.createGain();
    const compressor = context.createDynamicsCompressor();

    // A small SFX bus with headroom makes the layered transient feel loud on a
    // phone without allowing closely spaced pops to clip.
    sfxBus.gain.value = dbToGain(-1.5);
    compressor.threshold.value = -15;
    compressor.knee.value = 18;
    compressor.ratio.value = 7;
    compressor.attack.value = 0.003;
    compressor.release.value = 0.12;
    sfxBus.connect(compressor);
    compressor.connect(context.destination);
    this.sfxBus = sfxBus;
  }

  playBubble(index: number): void {
    if (this.muted) return;
    void this.unlock().then(() => {
      const context = this.context;
      const output = this.sfxBus;
      if (!context || !output || this.muted) return;

      const now = context.currentTime + 0.002;
      const semitone = PENTATONIC_SEMITONES[index % PENTATONIC_SEMITONES.length];
      const variation = 0.985 + Math.random() * 0.03;
      const frequency = BASE_FREQUENCY * 2 ** (semitone / 12) * variation;

      // The rounded body: a quick pitch drop makes a small speaker read this as
      // displaced air rather than a sustained musical beep.
      const body = context.createOscillator();
      const bodyGain = context.createGain();
      body.type = 'sine';
      body.frequency.setValueAtTime(frequency * 1.42, now);
      body.frequency.exponentialRampToValueAtTime(frequency * 0.72, now + 0.085);
      bodyGain.gain.setValueAtTime(0.0001, now);
      bodyGain.gain.exponentialRampToValueAtTime(0.42, now + 0.004);
      bodyGain.gain.exponentialRampToValueAtTime(0.11, now + 0.045);
      bodyGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.17);
      body.connect(bodyGain);
      bodyGain.connect(output);

      // A short high transient supplies the tactile "p" consonant.
      const click = context.createOscillator();
      const clickGain = context.createGain();
      click.type = 'triangle';
      click.frequency.setValueAtTime(Math.min(2200, frequency * 5.4), now);
      click.frequency.exponentialRampToValueAtTime(frequency * 1.6, now + 0.028);
      clickGain.gain.setValueAtTime(0.2, now);
      clickGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.034);
      click.connect(clickGain);
      clickGain.connect(output);

      // Filtered noise adds the tiny air snap a silicone dome makes.
      const noiseBuffer = context.createBuffer(
        1,
        Math.ceil(context.sampleRate * 0.05),
        context.sampleRate,
      );
      const noiseData = noiseBuffer.getChannelData(0);
      for (let sample = 0; sample < noiseData.length; sample += 1) {
        noiseData[sample] = Math.random() * 2 - 1;
      }
      const noise = context.createBufferSource();
      const noiseFilter = context.createBiquadFilter();
      const noiseGain = context.createGain();
      noise.buffer = noiseBuffer;
      noiseFilter.type = 'bandpass';
      noiseFilter.frequency.value = Math.min(3400, frequency * 4.2);
      noiseFilter.Q.value = 0.75;
      noiseGain.gain.setValueAtTime(0.14, now);
      noiseGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.052);
      noise.connect(noiseFilter);
      noiseFilter.connect(noiseGain);
      noiseGain.connect(output);

      body.start(now);
      click.start(now);
      noise.start(now);
      body.stop(now + 0.18);
      click.stop(now + 0.04);
      noise.stop(now + 0.055);
    });
  }

  playFail(): void {
    if (this.muted) return;
    void this.unlock().then(() => {
      const context = this.context;
      const output = this.sfxBus;
      if (!context || !output || this.muted) return;
      const now = context.currentTime;

      [118, 111].forEach((frequency, index) => {
        const oscillator = context.createOscillator();
        const gain = context.createGain();
        oscillator.type = index === 0 ? 'triangle' : 'sine';
        oscillator.frequency.setValueAtTime(frequency, now);
        oscillator.frequency.exponentialRampToValueAtTime(frequency * 0.78, now + 0.38);
        gain.gain.setValueAtTime(0.0001, now);
        gain.gain.exponentialRampToValueAtTime(0.18, now + 0.018);
        gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.42);
        oscillator.connect(gain);
        gain.connect(output);
        oscillator.start(now + index * 0.035);
        oscillator.stop(now + 0.44);
      });
    });
  }
}
