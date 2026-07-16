/**
 * SoundEngine — procedural Web Audio SFX + adaptive music loop.
 * All synthesis is done in-browser; no audio files required.
 *
 * Usage:
 *   const se = new SoundEngine();
 *   se.resume();          // call on first user interaction
 *   se.playHit(false);
 *   se.targetIntensity = 0.9;  // drive from game state each frame
 */

export class SoundEngine {
    private ctx: AudioContext | null = null;
    private masterGain!: GainNode;
    private sfxGain!: GainNode;
    private musicGain!: GainNode;
    private distCurve!: Float32Array;
    private noiseBuffer: AudioBuffer | null = null;

    // ── Adaptive music ────────────────────────────────────────────────────────
    /** 0 = everyone healthy, 1 = someone on the brink */
    public  targetIntensity: number = 0;
    private intensity: number = 0;
    private bpm = 110;
    private nextStepTime = 0;
    private step = 0;
    private musicRunning = false;
    private lastFootstepTime = 0;
    private lastFootstepIsLeft = false;

    // 16-step drum patterns ──────────────────────────────────────────────────
    private static readonly CALM_KICK  = [1,0,0,0, 0,0,0,0, 1,0,0,0, 0,0,0,0];
    private static readonly CALM_SNR   = [0,0,0,0, 1,0,0,0, 0,0,0,0, 1,0,0,0];
    private static readonly CALM_HAT   = [0,0,1,0, 0,0,1,0, 0,0,1,0, 0,0,1,0];

    private static readonly MID_KICK   = [1,0,0,0, 1,0,0,0, 1,0,1,0, 0,0,1,0];
    private static readonly MID_SNR    = [0,0,0,0, 1,0,0,1, 0,0,0,0, 1,0,0,1];
    private static readonly MID_HAT    = [1,1,1,1, 1,1,1,1, 1,1,1,1, 1,1,1,1];

    private static readonly INT_KICK   = [1,0,1,0, 1,0,0,1, 1,1,0,0, 1,0,1,1];
    private static readonly INT_SNR    = [0,0,1,0, 1,0,1,0, 0,1,0,1, 1,0,1,1];
    private static readonly INT_HAT    = [1,1,1,1, 1,1,1,1, 1,1,1,1, 1,1,1,1];
    private static readonly INT_OPEN   = [0,0,0,0, 0,0,0,1, 0,0,0,0, 0,0,0,1];

    // Bass note sequence (Hz) on steps 0, 4, 8, 12
    private static readonly BASS_Q  = [110,  110,  146.8, 82.4];  // calm
    private static readonly BASS_8  = [110,  82.4, 110,  82.4,    // mid/intense 8th notes
                                        146.8, 82.4, 82.4, 110];

    // ─────────────────────────────────────────────────────────────────────────

    private ensureCtx(): AudioContext {
        if (!this.ctx) {
            this.ctx = new AudioContext();
            this.setupGraph();
        }
        if (this.ctx.state === 'suspended') void this.ctx.resume();
        return this.ctx;
    }

    private setupGraph() {
        const ctx = this.ctx!;

        this.masterGain = ctx.createGain();
        this.masterGain.gain.value = 0.88;

        const comp = ctx.createDynamicsCompressor();
        comp.threshold.value = -16;
        comp.knee.value = 8;
        comp.ratio.value = 5;
        comp.attack.value = 0.003;
        comp.release.value = 0.12;

        this.masterGain.connect(comp);
        comp.connect(ctx.destination);

        this.sfxGain = ctx.createGain();
        this.sfxGain.gain.value = 0.75;
        this.sfxGain.connect(this.masterGain);

        this.musicGain = ctx.createGain();
        this.musicGain.gain.value = 0.30;
        this.musicGain.connect(this.masterGain);

        // Distortion curve for heavy-bass moments
        this.distCurve = new Float32Array(256);
        const k = 80;
        for (let i = 0; i < 256; i++) {
            const x = (i * 2) / 256 - 1;
            this.distCurve[i] = ((Math.PI + k) * x) / (Math.PI + k * Math.abs(x));
        }

        // 2-second shared noise buffer
        const sr = ctx.sampleRate;
        this.noiseBuffer = ctx.createBuffer(1, sr * 2, sr);
        const d = this.noiseBuffer.getChannelData(0);
        for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    }

    /** Call on first user gesture to unlock audio and start music. */
    public resume() {
        const ctx = this.ensureCtx();
        if (!this.musicRunning) {
            this.musicRunning = true;
            this.nextStepTime = ctx.currentTime + 0.08;
            this.scheduleTick();
        }
    }

    public stop() {
        if (this.ctx) {
            void this.ctx.suspend();
            this.musicRunning = false;
        }
    }

    // ── SFX ──────────────────────────────────────────────────────────────────

    public playHit(isHeavy: boolean) {
        const ctx = this.ensureCtx();
        const t = ctx.currentTime;
        const dur = isHeavy ? 0.18 : 0.10;

        // Thud oscillator
        const osc = ctx.createOscillator();
        const og  = ctx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(isHeavy ? 180 : 230, t);
        osc.frequency.exponentialRampToValueAtTime(isHeavy ? 38 : 55, t + dur);
        og.gain.setValueAtTime(isHeavy ? 0.65 : 0.38, t);
        og.gain.exponentialRampToValueAtTime(0.001, t + dur);
        osc.connect(og); og.connect(this.sfxGain);
        osc.start(t); osc.stop(t + dur + 0.01);

        // Noise smack
        this.noiseShot(t, isHeavy ? 0.14 : 0.07, isHeavy ? 450 : 950, isHeavy ? 0.7 : 0.4, 'bandpass');

        // Haptic
        this.vibrate(isHeavy ? [20, 8, 30] : [15]);
    }

    public playBlock() {
        const ctx = this.ensureCtx();
        const t = ctx.currentTime;

        const osc = ctx.createOscillator();
        const og  = ctx.createGain();
        osc.type = 'square';
        osc.frequency.setValueAtTime(700, t);
        osc.frequency.exponentialRampToValueAtTime(380, t + 0.12);
        og.gain.setValueAtTime(0.28, t);
        og.gain.exponentialRampToValueAtTime(0.001, t + 0.12);

        const filt = ctx.createBiquadFilter();
        filt.type = 'bandpass'; filt.frequency.value = 1100; filt.Q.value = 3;

        osc.connect(filt); filt.connect(og); og.connect(this.sfxGain);
        osc.start(t); osc.stop(t + 0.14);

        this.noiseShot(t, 0.06, 1800, 0.35, 'highpass');
        this.vibrate([10]);
    }

    public playParry() {
        const ctx = this.ensureCtx();
        const t = ctx.currentTime;
        const freqs = [880, 1320, 1760];
        for (const freq of freqs) {
            const osc = ctx.createOscillator();
            const og  = ctx.createGain();
            osc.type = 'sine';
            osc.frequency.value = freq;
            og.gain.setValueAtTime(0.14, t);
            og.gain.exponentialRampToValueAtTime(0.001, t + 0.32);
            osc.connect(og); og.connect(this.sfxGain);
            osc.start(t); osc.stop(t + 0.34);
        }
        this.noiseShot(t, 0.05, 5000, 0.55, 'highpass');
        this.vibrate([8, 4, 8, 4, 12]);
    }

    public playDash() {
        const ctx = this.ensureCtx();
        const t = ctx.currentTime;
        const dur = 0.14;
        const src = ctx.createBufferSource();
        src.buffer = this.noiseBuffer;
        const filt = ctx.createBiquadFilter();
        filt.type = 'bandpass';
        filt.frequency.setValueAtTime(2800, t);
        filt.frequency.exponentialRampToValueAtTime(320, t + dur);
        filt.Q.value = 3.5;
        const g = ctx.createGain();
        g.gain.setValueAtTime(0.55, t);
        g.gain.exponentialRampToValueAtTime(0.001, t + dur);
        src.connect(filt); filt.connect(g); g.connect(this.sfxGain);
        src.start(t); src.stop(t + dur + 0.01);
        this.vibrate([8]);
    }

    public playJump() {
        const ctx = this.ensureCtx();
        const t = ctx.currentTime;
        const dur = 0.18;
        const osc = ctx.createOscillator();
        const og  = ctx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(180, t);
        osc.frequency.exponentialRampToValueAtTime(520, t + dur * 0.35);
        osc.frequency.exponentialRampToValueAtTime(280, t + dur);
        og.gain.setValueAtTime(0.22, t);
        og.gain.exponentialRampToValueAtTime(0.001, t + dur);
        osc.connect(og); og.connect(this.sfxGain);
        osc.start(t); osc.stop(t + dur + 0.01);
    }

    public playFootstep() {
        const ctx = this.ensureCtx();
        const now = ctx.currentTime;
        if (now - this.lastFootstepTime < 0.19) return;
        this.lastFootstepTime = now;
        this.lastFootstepIsLeft = !this.lastFootstepIsLeft;

        // Slightly different tone for left/right
        const freq = this.lastFootstepIsLeft ? 240 : 260;
        this.noiseShot(now, 0.038, freq, 0.22, 'lowpass');
    }

    public playSpecial(weapon: string) {
        const ctx = this.ensureCtx();
        const t = ctx.currentTime;
        const dur = 0.28;

        // Whoosh
        const src = ctx.createBufferSource();
        src.buffer = this.noiseBuffer;
        const filt = ctx.createBiquadFilter();
        filt.type = 'bandpass';
        const baseFreq = weapon === 'KATANA' ? 3200 : weapon === 'STAFF' ? 900 : 1600;
        const endFreq  = weapon === 'KATANA' ? 500  : weapon === 'STAFF' ? 160 : 320;
        filt.frequency.setValueAtTime(baseFreq, t);
        filt.frequency.exponentialRampToValueAtTime(endFreq, t + dur);
        filt.Q.value = 2.5;
        const g = ctx.createGain();
        g.gain.setValueAtTime(0.8, t);
        g.gain.exponentialRampToValueAtTime(0.001, t + dur);
        src.connect(filt); filt.connect(g); g.connect(this.sfxGain);
        src.start(t); src.stop(t + dur + 0.01);

        // Weapon accent
        if (weapon === 'KATANA') {
            const osc = ctx.createOscillator(); const og = ctx.createGain();
            osc.type = 'sawtooth';
            osc.frequency.setValueAtTime(1320, t);
            osc.frequency.exponentialRampToValueAtTime(165, t + 0.09);
            og.gain.setValueAtTime(0.28, t);
            og.gain.exponentialRampToValueAtTime(0.001, t + 0.09);
            osc.connect(og); og.connect(this.sfxGain);
            osc.start(t); osc.stop(t + 0.10);
        } else if (weapon === 'STAFF') {
            // Low boom
            const osc = ctx.createOscillator(); const og = ctx.createGain();
            osc.type = 'sine';
            osc.frequency.setValueAtTime(90, t + 0.18);
            osc.frequency.exponentialRampToValueAtTime(30, t + 0.40);
            og.gain.setValueAtTime(0.001, t + 0.18);
            og.gain.linearRampToValueAtTime(0.7, t + 0.20);
            og.gain.exponentialRampToValueAtTime(0.001, t + 0.40);
            osc.connect(og); og.connect(this.sfxGain);
            osc.start(t + 0.18); osc.stop(t + 0.42);
        }

        this.vibrate([5, 5, 5, 5, 45]);
    }

    public playKO() {
        const ctx = this.ensureCtx();
        const t = ctx.currentTime;

        // Deep boom
        const osc = ctx.createOscillator(); const og = ctx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(115, t);
        osc.frequency.exponentialRampToValueAtTime(28, t + 0.55);
        og.gain.setValueAtTime(0.9, t);
        og.gain.exponentialRampToValueAtTime(0.001, t + 0.55);
        osc.connect(og); og.connect(this.sfxGain);
        osc.start(t); osc.stop(t + 0.57);

        this.noiseShot(t, 0.30, 550, 0.65, 'lowpass');
        this.vibrate([50, 30, 80]);
    }

    // ── MUSIC SCHEDULER ───────────────────────────────────────────────────────

    private scheduleTick() {
        if (!this.musicRunning || !this.ctx) return;

        const LOOKAHEAD = 0.13;   // schedule up to 130ms ahead
        const INTERVAL  = 28;     // call every 28ms

        while (this.nextStepTime < this.ctx.currentTime + LOOKAHEAD) {
            // Smooth intensity
            this.intensity += (this.targetIntensity - this.intensity) * 0.04;
            this.scheduleStep(this.step, this.nextStepTime);
            this.step = (this.step + 1) % 16;
            const beatDur  = 60 / this.bpm;
            this.nextStepTime += beatDur / 4;
        }

        setTimeout(() => this.scheduleTick(), INTERVAL);
    }

    private scheduleStep(step: number, t: number) {
        const i = this.intensity;
        const beatDur = 60 / this.bpm;
        const stepDur = beatDur / 4;

        if (i < 0.40) {
            // CALM layer
            const g = 0.45 + (i / 0.40) * 0.35;
            if (SoundEngine.CALM_KICK[step]) this.drumKick(t, g);
            if (SoundEngine.CALM_SNR[step])  this.drumSnare(t, g * 0.7);
            if (SoundEngine.CALM_HAT[step])  this.drumHat(t, false, g * 0.55);

            // Quarter-note bass
            const qIdx = step / 4;
            if (Number.isInteger(qIdx)) {
                this.drumBass(t, SoundEngine.BASS_Q[qIdx], stepDur * 3.5, 0.28 + i * 0.4);
            }

        } else if (i < 0.70) {
            // MID layer
            const g = 0.72 + ((i - 0.40) / 0.30) * 0.28;
            if (SoundEngine.MID_KICK[step]) this.drumKick(t, g);
            if (SoundEngine.MID_SNR[step])  this.drumSnare(t, g * 0.75);
            if (SoundEngine.MID_HAT[step])  this.drumHat(t, false, g * 0.22);

            // 8th-note bass on even steps
            if (step % 2 === 0) {
                const bIdx = step / 2;
                this.drumBass(t, SoundEngine.BASS_8[bIdx], stepDur * 1.8, 0.38 + (i - 0.4) * 0.6);
            }

        } else {
            // INTENSE layer
            const g = 0.92 + ((i - 0.70) / 0.30) * 0.28;
            if (SoundEngine.INT_KICK[step])  this.drumKick(t, g);
            if (SoundEngine.INT_SNR[step])   this.drumSnare(t, g * 0.80);
            if (SoundEngine.INT_HAT[step])   this.drumHat(t, false, g * 0.25);
            if (SoundEngine.INT_OPEN[step])  this.drumHat(t, true,  g * 0.38);

            // Dense 8th-note bass, slightly distorted
            if (step % 2 === 0) {
                const bIdx = step / 2;
                this.drumBass(t, SoundEngine.BASS_8[bIdx], stepDur * 1.7, 0.55 + (i - 0.7) * 0.5, true);
            }

            // Sub-bass rumble underneath
            if (step === 0) {
                this.drumSub(t, 40, stepDur * 16, 0.25 * (i - 0.6));
            }
        }
    }

    // ── Drum synthesis ────────────────────────────────────────────────────────

    private drumKick(t: number, vol: number) {
        const ctx = this.ctx!;
        const osc = ctx.createOscillator();
        const g   = ctx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(190, t);
        osc.frequency.exponentialRampToValueAtTime(38, t + 0.18);
        g.gain.setValueAtTime(vol, t);
        g.gain.exponentialRampToValueAtTime(0.001, t + 0.22);
        osc.connect(g); g.connect(this.musicGain);
        osc.start(t); osc.stop(t + 0.24);

        // Click transient
        this.noiseToMusicGain(t, 0.012, 1800, 'bandpass', vol * 0.55);
    }

    private drumSnare(t: number, vol: number) {
        this.noiseToMusicGain(t, 0.10, 880, 'bandpass', vol, 0.7);

        const ctx = this.ctx!;
        const osc = ctx.createOscillator();
        const g   = ctx.createGain();
        osc.type = 'triangle';
        osc.frequency.value = 210;
        g.gain.setValueAtTime(vol * 0.35, t);
        g.gain.exponentialRampToValueAtTime(0.001, t + 0.05);
        osc.connect(g); g.connect(this.musicGain);
        osc.start(t); osc.stop(t + 0.06);
    }

    private drumHat(t: number, open: boolean, vol: number) {
        const dur = open ? 0.15 : 0.038;
        this.noiseToMusicGain(t, dur, 10000, 'highpass', vol);
    }

    private drumBass(t: number, freq: number, dur: number, vol: number, distort = false) {
        const ctx = this.ctx!;
        const osc = ctx.createOscillator();
        const g   = ctx.createGain();
        osc.type = 'triangle';
        osc.frequency.value = freq;
        g.gain.setValueAtTime(0.001, t);
        g.gain.linearRampToValueAtTime(vol, t + 0.020);
        g.gain.setValueAtTime(vol, t + dur * 0.6);
        g.gain.exponentialRampToValueAtTime(0.001, t + dur);
        osc.connect(g);

        if (distort) {
            const ws = ctx.createWaveShaper();
            ws.curve = this.distCurve;
            const dg = ctx.createGain();
            dg.gain.value = 0.55;
            const filter = ctx.createBiquadFilter();
            filter.type = 'lowpass';
            filter.frequency.value = 800;
            g.connect(ws); ws.connect(dg); dg.connect(filter);
            filter.connect(this.musicGain);
        }
        g.connect(this.musicGain);  // always a dry path too
        osc.start(t); osc.stop(t + dur + 0.02);
    }

    private drumSub(t: number, freq: number, dur: number, vol: number) {
        if (vol <= 0) return;
        const ctx = this.ctx!;
        const osc = ctx.createOscillator();
        const g   = ctx.createGain();
        osc.type = 'sine';
        osc.frequency.value = freq;
        g.gain.setValueAtTime(0.001, t);
        g.gain.linearRampToValueAtTime(vol, t + 0.5);
        g.gain.setValueAtTime(vol, t + dur - 0.5);
        g.gain.exponentialRampToValueAtTime(0.001, t + dur);
        osc.connect(g); g.connect(this.musicGain);
        osc.start(t); osc.stop(t + dur + 0.02);
    }

    // ── Helpers ───────────────────────────────────────────────────────────────

    private noiseShot(
        t: number, dur: number, freq: number, vol: number,
        filterType: BiquadFilterType,
    ) {
        const ctx = this.ctx!;
        const src  = ctx.createBufferSource();
        src.buffer = this.noiseBuffer;
        const filt = ctx.createBiquadFilter();
        filt.type  = filterType;
        filt.frequency.value = freq;
        const g = ctx.createGain();
        g.gain.setValueAtTime(vol, t);
        g.gain.exponentialRampToValueAtTime(0.001, t + dur);
        src.connect(filt); filt.connect(g); g.connect(this.sfxGain);
        src.start(t); src.stop(t + dur + 0.01);
    }

    private noiseToMusicGain(
        t: number, dur: number, freq: number,
        filterType: BiquadFilterType, vol: number, q = 1,
    ) {
        const ctx = this.ctx!;
        const src  = ctx.createBufferSource();
        src.buffer = this.noiseBuffer;
        const filt = ctx.createBiquadFilter();
        filt.type  = filterType;
        filt.frequency.value = freq;
        filt.Q.value = q;
        const g = ctx.createGain();
        g.gain.setValueAtTime(vol, t);
        g.gain.exponentialRampToValueAtTime(0.001, t + dur);
        src.connect(filt); filt.connect(g); g.connect(this.musicGain);
        src.start(t); src.stop(t + dur + 0.01);
    }

    private vibrate(pattern: number[]) {
        try { navigator.vibrate(pattern); } catch { /* ignore */ }
    }
}
