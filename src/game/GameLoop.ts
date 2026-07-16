import { Stickman } from './Stickman';
import { PhysicsEngine } from './PhysicsEngine';
import { Renderer } from './Renderer';
import { InputProvider, CharacterStats, WeaponType } from './Types';
import { BotAI } from './BotAI';
import { ParticleManager } from './ParticleManager';
import { Vec2 } from './MathUtils';

const getStats = (weapon: WeaponType): CharacterStats => {
    switch (weapon) {
        case 'KATANA': return { maxHealth: 2000, moveSpeed: 250, jumpForce: 750, baseDamage: 70 };
        case 'STAFF':  return { maxHealth: 2000, moveSpeed: 280, jumpForce: 800, baseDamage: 40 };
        default:       return { maxHealth: 2000, moveSpeed: 350, jumpForce: 750, baseDamage: 50 };
    }
};

// Colours that match the renderer's drawStickman calls
const P1_COLOR = '#3b82f6';
const P2_COLOR = '#ef4444';

export class GameLoop {
    private p1: Stickman;
    private p2: Stickman;
    private renderer: Renderer;
    public  bot: BotAI;
    private particleManager: ParticleManager;

    public  onGameOver: ((winner: number) => void) | null = null;
    private gameOverTriggered: boolean = false;

    private hitStopTimer:    number = 0;
    private screenShakeTimer: number = 0;
    private lastTime: number = performance.now();
    private reqId:    number = 0;

    constructor(
        canvas: HTMLCanvasElement,
        private p1Input: InputProvider,
        weapon: WeaponType = 'UNARMED',
    ) {
        const ctx  = canvas.getContext('2d')!;
        this.renderer        = new Renderer(canvas, ctx);
        this.particleManager = new ParticleManager();

        const p2Weapon: WeaponType =
            Math.random() > 0.5 ? 'KATANA' : (Math.random() > 0.5 ? 'STAFF' : 'UNARMED');

        this.p1  = new Stickman(200,  600, getStats(weapon),   true,  weapon);
        this.p2  = new Stickman(1080, 600, getStats(p2Weapon), false, p2Weapon);
        this.bot = new BotAI(this.p2, this.p1);
    }

    public reset() {
        const oldDifficulty = this.bot.difficulty;
        const w1 = this.p1.weapon, w2 = this.p2.weapon;
        this.p1  = new Stickman(200,  600, getStats(w1), true,  w1);
        this.p2  = new Stickman(1080, 600, getStats(w2), false, w2);
        this.bot = new BotAI(this.p2, this.p1);
        this.bot.difficulty      = oldDifficulty;
        this.particleManager     = new ParticleManager();
        this.gameOverTriggered   = false;
        this.hitStopTimer        = 0;
        this.screenShakeTimer    = 0;
        this.lastTime            = performance.now();
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

        // ── Cache player-1 input once ─────────────────────────────────────────
        const p1RawInput = this.p1Input.getInput();

        // ── Dynamic facing ─────────────────────────────────────────────────────
        // Joystick direction takes priority over auto-facing so dashes and
        // attacks always go the direction the player intends.
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

        // P2 (bot) always auto-faces the player
        if (
            this.p2.state === 'IDLE' ||
            this.p2.state === 'RUNNING' ||
            this.p2.state === 'BLOCKING'
        ) {
            this.p2.facing = this.p2.pos.x < this.p1.pos.x ? 1 : -1;
        }

        // ── Supply opponent Y so characters pick contextual attack variants ────
        this.p1.opponentY = this.p2.pos.y;
        this.p2.opponentY = this.p1.pos.y;

        // ── Update ────────────────────────────────────────────────────────────
        this.p1.update(dt, p1RawInput);
        this.bot.update(dt);
        this.p2.update(dt, this.bot.getInput());

        // Dash trail
        if (this.p1.state === 'DASHING') {
            this.particleManager.spawnMotionLine(
                this.p1.pos.add(new Vec2((Math.random() - 0.5) * 60, -30 + (Math.random() - 0.5) * 80)),
                this.p1.facing * -60, P1_COLOR.replace('6', '6,0.6'),
            );
        }
        if (this.p2.state === 'DASHING') {
            this.particleManager.spawnMotionLine(
                this.p2.pos.add(new Vec2((Math.random() - 0.5) * 60, -30 + (Math.random() - 0.5) * 80)),
                this.p2.facing * -60, P2_COLOR.replace('f', 'f,0.6'),
            );
        }

        // ── Collision resolution + contextual particles ────────────────────────
        const collisionEvents = PhysicsEngine.resolveCollisions(this.p1, this.p2);

        let heavyHit = false, normalHit = false, parry = false;

        for (const ev of collisionEvents) {
            const attackerColor = ev.attackerIsP1 ? P1_COLOR : P2_COLOR;

            if (ev.pos) {
                if (ev.type === 'PARRY') {
                    // Parry: cyan burst + white sparks
                    this.particleManager.spawnBlockBurst(ev.pos);
                    this.particleManager.spawnHitSparks(ev.pos, '#ffffff', true);
                    parry = true;
                } else if (ev.type === 'BLOCKED') {
                    // Blocked hit: cyan burst only
                    this.particleManager.spawnBlockBurst(ev.pos);
                } else {
                    // Normal or heavy hit: coloured sparks
                    this.particleManager.spawnHitSparks(ev.pos, attackerColor, ev.type === 'HEAVY');
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

        this.renderer.render(this.p1, this.p2, this.particleManager, this.screenShakeTimer > 0, parry);

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
}
