import { Stickman, CharacterState } from './Stickman';
import { PhysicsEngine } from './PhysicsEngine';
import { Renderer } from './Renderer';
import { InputProvider, CharacterStats, WeaponType } from './Types';
import { BotAI } from './BotAI';
import { ParticleManager } from './ParticleManager';
import { SoundEngine } from './SoundEngine';
import { Vec2 } from './MathUtils';

const getStats = (weapon: WeaponType): CharacterStats => {
    switch (weapon) {
        case 'KATANA': return { maxHealth: 2000, moveSpeed: 250, jumpForce: 750, baseDamage: 70 };
        case 'STAFF':  return { maxHealth: 2000, moveSpeed: 280, jumpForce: 800, baseDamage: 40 };
        default:       return { maxHealth: 2000, moveSpeed: 350, jumpForce: 750, baseDamage: 50 };
    }
};

const P1_COLOR = '#3b82f6';
const P2_COLOR = '#ef4444';

export class GameLoop {
    private p1: Stickman;
    private p2: Stickman;
    private renderer: Renderer;
    public  bot: BotAI;
    private particleManager: ParticleManager;
    public  soundEngine: SoundEngine;

    public  onGameOver: ((winner: number) => void) | null = null;
    private gameOverTriggered = false;

    private hitStopTimer     = 0;
    private screenShakeTimer = 0;
    private lastTime = performance.now();
    private reqId    = 0;

    // State-change tracking for SFX triggers
    private prevP1State: CharacterState = 'IDLE';
    private prevP2State: CharacterState = 'IDLE';

    // Footstep timers (per player, so both can stride independently)
    private p1FootstepTimer = 0;
    private p2FootstepTimer = 0;

    constructor(
        canvas: HTMLCanvasElement,
        private p1Input: InputProvider,
        weapon: WeaponType = 'UNARMED',
    ) {
        const ctx  = canvas.getContext('2d')!;
        this.renderer        = new Renderer(canvas, ctx);
        this.particleManager = new ParticleManager();
        this.soundEngine     = new SoundEngine();

        const p2Weapon: WeaponType =
            Math.random() > 0.5 ? 'KATANA' : (Math.random() > 0.5 ? 'STAFF' : 'UNARMED');

        this.p1  = new Stickman(200,  600, getStats(weapon),   true,  weapon);
        this.p2  = new Stickman(1080, 600, getStats(p2Weapon), false, p2Weapon);
        this.bot = new BotAI(this.p2, this.p1);
    }

    public reset() {
        const oldDiff = this.bot.difficulty;
        const w1 = this.p1.weapon, w2 = this.p2.weapon;
        this.p1  = new Stickman(200,  600, getStats(w1), true,  w1);
        this.p2  = new Stickman(1080, 600, getStats(w2), false, w2);
        this.bot = new BotAI(this.p2, this.p1);
        this.bot.difficulty      = oldDiff;
        this.particleManager     = new ParticleManager();
        this.gameOverTriggered   = false;
        this.hitStopTimer        = 0;
        this.screenShakeTimer    = 0;
        this.lastTime            = performance.now();
        this.prevP1State         = 'IDLE';
        this.prevP2State         = 'IDLE';
        this.p1FootstepTimer     = 0;
        this.p2FootstepTimer     = 0;
    }

    public start() { this.lastTime = performance.now(); this.loop(this.lastTime); }
    public stop()  { cancelAnimationFrame(this.reqId); }

    private loop = (time: number) => {
        let rawDt = (time - this.lastTime) / 1000;
        this.lastTime = time;
        if (rawDt > 0.1) rawDt = 0.1;

        if (this.hitStopTimer > 0) {
            this.hitStopTimer -= rawDt;
            if (this.screenShakeTimer > 0) this.screenShakeTimer -= rawDt;
            this.renderer.render(this.p1, this.p2, this.particleManager, this.screenShakeTimer > 0);
            this.reqId = requestAnimationFrame(this.loop);
            return;
        }

        const dt = rawDt;
        if (this.screenShakeTimer > 0) this.screenShakeTimer -= dt;

        // ── Input ─────────────────────────────────────────────────────────────
        const p1RawInput = this.p1Input.getInput();

        // ── Dynamic facing ────────────────────────────────────────────────────
        const p1CanJoystickFace =
            this.p1.state === 'IDLE' ||
            this.p1.state === 'RUNNING' ||
            this.p1.state === 'JUMPING';

        if (p1RawInput.dirX !== 0 && p1CanJoystickFace) {
            this.p1.facing = p1RawInput.dirX > 0 ? 1 : -1;
        } else if (
            this.p1.state === 'IDLE' ||
            this.p1.state === 'RUNNING' ||
            this.p1.state === 'BLOCKING'
        ) {
            this.p1.facing = this.p1.pos.x < this.p2.pos.x ? 1 : -1;
        }

        if (
            this.p2.state === 'IDLE' ||
            this.p2.state === 'RUNNING' ||
            this.p2.state === 'BLOCKING'
        ) {
            this.p2.facing = this.p2.pos.x < this.p1.pos.x ? 1 : -1;
        }

        // ── Opponent Y (context-aware attack variants) ────────────────────────
        this.p1.opponentY = this.p2.pos.y;
        this.p2.opponentY = this.p1.pos.y;

        // ── Update ────────────────────────────────────────────────────────────
        this.p1.update(dt, p1RawInput);
        this.bot.update(dt);
        this.p2.update(dt, this.bot.getInput());

        // ── SFX: state transitions ─────────────────────────────────────────
        this.handleStateChangeSFX(this.p1, this.prevP1State);
        this.handleStateChangeSFX(this.p2, this.prevP2State);
        this.prevP1State = this.p1.state;
        this.prevP2State = this.p2.state;

        // Footsteps (throttled per-player)
        if (this.p1.state === 'RUNNING' && this.p1.grounded) {
            this.p1FootstepTimer -= dt;
            if (this.p1FootstepTimer <= 0) {
                this.soundEngine.playFootstep();
                this.p1FootstepTimer = 0.22;
            }
        } else {
            this.p1FootstepTimer = 0;
        }
        if (this.p2.state === 'RUNNING' && this.p2.grounded) {
            this.p2FootstepTimer -= dt;
            if (this.p2FootstepTimer <= 0) {
                this.soundEngine.playFootstep();
                this.p2FootstepTimer = 0.22;
            }
        } else {
            this.p2FootstepTimer = 0;
        }

        // ── Dash trail ────────────────────────────────────────────────────────
        if (this.p1.state === 'DASHING') {
            this.particleManager.spawnMotionLine(
                this.p1.pos.add(new Vec2((Math.random() - 0.5) * 60, -30 + (Math.random() - 0.5) * 80)),
                this.p1.facing * -60, P1_COLOR,
            );
        }
        if (this.p2.state === 'DASHING') {
            this.particleManager.spawnMotionLine(
                this.p2.pos.add(new Vec2((Math.random() - 0.5) * 60, -30 + (Math.random() - 0.5) * 80)),
                this.p2.facing * -60, P2_COLOR,
            );
        }

        // ── Collision resolution ──────────────────────────────────────────────
        const events = PhysicsEngine.resolveCollisions(this.p1, this.p2);

        let heavyHit = false, normalHit = false, parry = false;

        for (const ev of events) {
            const attackerColor = ev.attackerIsP1 ? P1_COLOR : P2_COLOR;

            if (ev.pos) {
                if (ev.type === 'PARRY') {
                    this.particleManager.spawnBlockBurst(ev.pos);
                    this.particleManager.spawnHitSparks(ev.pos, '#ffffff', true);
                    this.soundEngine.playParry();
                    parry = true;
                } else if (ev.type === 'BLOCKED') {
                    this.particleManager.spawnBlockBurst(ev.pos);
                    this.soundEngine.playBlock();
                } else {
                    this.particleManager.spawnHitSparks(ev.pos, attackerColor, ev.type === 'HEAVY');
                    this.soundEngine.playHit(ev.type === 'HEAVY');
                }
            }

            if (ev.type === 'HEAVY')  heavyHit  = true;
            if (ev.type === 'NORMAL') normalHit = true;
        }

        this.particleManager.update(dt);

        if (parry) {
            this.hitStopTimer     = 0.20;
            this.screenShakeTimer = 0.30;
        } else if (heavyHit) {
            this.hitStopTimer     = 0.10;
            this.screenShakeTimer = 0.20;
        } else if (normalHit) {
            this.hitStopTimer     = 0.05;
            this.screenShakeTimer = 0.10;
        }

        // ── Adaptive music intensity ──────────────────────────────────────────
        const minHP = Math.min(this.p1.health, this.p2.health);
        const maxHP = this.p1.stats.maxHealth;
        this.soundEngine.targetIntensity = 1 - Math.max(0, minHP / maxHP);

        // ── Render ────────────────────────────────────────────────────────────
        this.renderer.render(this.p1, this.p2, this.particleManager, this.screenShakeTimer > 0, parry);

        // ── Game over ─────────────────────────────────────────────────────────
        if (!this.gameOverTriggered) {
            if (this.p1.state === 'KNOCKED_OUT') {
                this.gameOverTriggered = true;
                this.onGameOver?.(2);
            } else if (this.p2.state === 'KNOCKED_OUT') {
                this.gameOverTriggered = true;
                this.onGameOver?.(1);
            }
        }

        this.reqId = requestAnimationFrame(this.loop);
    };

    private handleStateChangeSFX(s: Stickman, prev: CharacterState) {
        if (s.state === prev) return;
        switch (s.state) {
            case 'JUMPING':      this.soundEngine.playJump();              break;
            case 'DASHING':      this.soundEngine.playDash();              break;
            case 'SPECIAL':      this.soundEngine.playSpecial(s.weapon);   break;
            case 'KNOCKED_OUT':  this.soundEngine.playKO();                break;
            default: break;
        }
    }
}
