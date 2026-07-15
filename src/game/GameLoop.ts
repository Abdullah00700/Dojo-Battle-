import { Stickman } from './Stickman';
import { PhysicsEngine } from './PhysicsEngine';
import { Renderer } from './Renderer';
import { InputProvider, CharacterStats, WeaponType } from './Types';
import { BotAI } from './BotAI';
import { ParticleManager } from './ParticleManager';
import { Vec2 } from './MathUtils';

const getStats = (weapon: WeaponType): CharacterStats => {
    switch (weapon) {
        case 'KATANA':
            return { maxHealth: 2000, moveSpeed: 250, jumpForce: 750, baseDamage: 70 };
        case 'STAFF':
            return { maxHealth: 2000, moveSpeed: 280, jumpForce: 800, baseDamage: 40 };
        case 'UNARMED':
        default:
            return { maxHealth: 2000, moveSpeed: 350, jumpForce: 750, baseDamage: 50 };
    }
};

export class GameLoop {
    private p1: Stickman;
    private p2: Stickman;
    private renderer: Renderer;
    public bot: BotAI;
    private particleManager: ParticleManager;
    
    public onGameOver: ((winner: number) => void) | null = null;
    private gameOverTriggered: boolean = false;
    
    private hitStopTimer: number = 0;
    private screenShakeTimer: number = 0;

    private lastTime: number = performance.now();
    private reqId: number = 0;

    constructor(
        canvas: HTMLCanvasElement, 
        private p1Input: InputProvider,
        weapon: WeaponType = 'UNARMED'
    ) {
        const ctx = canvas.getContext('2d')!;
        this.renderer = new Renderer(canvas, ctx);
        this.particleManager = new ParticleManager();
        
        // P2 uses a random weapon, or just Unarmed for now. Let's make P2 use KATANA for a duel or match P1
        const p2Weapon: WeaponType = Math.random() > 0.5 ? 'KATANA' : (Math.random() > 0.5 ? 'STAFF' : 'UNARMED');
        
        this.p1 = new Stickman(200, 600, getStats(weapon), true, weapon);
        this.p2 = new Stickman(1080, 600, getStats(p2Weapon), false, p2Weapon);
        this.bot = new BotAI(this.p2, this.p1);
    }

    public reset() {
        const oldDifficulty = this.bot.difficulty;
        const weapon = this.p1.weapon;
        const p2Weapon = this.p2.weapon;
        this.p1 = new Stickman(200, 600, getStats(weapon), true, weapon);
        this.p2 = new Stickman(1080, 600, getStats(p2Weapon), false, p2Weapon);
        this.bot = new BotAI(this.p2, this.p1);
        this.bot.difficulty = oldDifficulty;
        this.particleManager = new ParticleManager();
        this.gameOverTriggered = false;
        this.hitStopTimer = 0;
        this.screenShakeTimer = 0;
        this.lastTime = performance.now();
    }

    public start() {
        this.lastTime = performance.now();
        this.loop(this.lastTime);
    }

    public stop() {
        cancelAnimationFrame(this.reqId);
    }

    private loop = (time: number) => {
        let rawDt = (time - this.lastTime) / 1000;
        this.lastTime = time;
        if (rawDt > 0.1) rawDt = 0.1;

        if (this.hitStopTimer > 0) {
            this.hitStopTimer -= rawDt;
            // Still render during hit stop, but with screen shake
            if (this.screenShakeTimer > 0) this.screenShakeTimer -= rawDt;
            this.renderer.render(this.p1, this.p2, this.particleManager, this.screenShakeTimer > 0);
            this.reqId = requestAnimationFrame(this.loop);
            return; // Skip update
        }

        let dt = rawDt;
        
        if (this.screenShakeTimer > 0) {
            this.screenShakeTimer -= dt;
        }

        // Auto facing logic
        if (this.p1.state === 'IDLE' || this.p1.state === 'RUNNING' || this.p1.state === 'BLOCKING') {
            this.p1.facing = this.p1.pos.x < this.p2.pos.x ? 1 : -1;
        }
        if (this.p2.state === 'IDLE' || this.p2.state === 'RUNNING' || this.p2.state === 'BLOCKING') {
            this.p2.facing = this.p2.pos.x < this.p1.pos.x ? 1 : -1;
        }

        this.p1.update(dt, this.p1Input.getInput());
        this.bot.update(dt);
        this.p2.update(dt, this.bot.getInput());
        
        if (this.p1.state === 'DASHING') {
            this.particleManager.spawnMotionLine(this.p1.pos.add(new Vec2((Math.random() - 0.5) * 60, -30 + (Math.random() - 0.5) * 80)), this.p1.facing * -60);
        }
        if (this.p2.state === 'DASHING') {
            this.particleManager.spawnMotionLine(this.p2.pos.add(new Vec2((Math.random() - 0.5) * 60, -30 + (Math.random() - 0.5) * 80)), this.p2.facing * -60);
        }
        
        const collisionEvents = PhysicsEngine.resolveCollisions(this.p1, this.p2);
        
        let heavyHit = false;
        let normalHit = false;
        let parry = false;
        
        for (const ev of collisionEvents) {
            if (ev.pos) this.particleManager.spawnPuff(ev.pos);
            if (ev.type === 'HEAVY') heavyHit = true;
            if (ev.type === 'NORMAL') normalHit = true;
            if (ev.type === 'PARRY') parry = true;
        }

        this.particleManager.update(dt);

        if (parry) {
            this.hitStopTimer = 0.2;
            this.screenShakeTimer = 0.3;
        } else if (heavyHit) {
            this.hitStopTimer = 0.1; // 100ms freeze
            this.screenShakeTimer = 0.2; // 200ms shake
        } else if (normalHit) {
            this.hitStopTimer = 0.05; // 50ms freeze
            this.screenShakeTimer = 0.1; // 100ms shake
        }
        
        this.renderer.render(this.p1, this.p2, this.particleManager, this.screenShakeTimer > 0, parry);

        if (!this.gameOverTriggered) {
            if (this.p1.state === 'KNOCKED_OUT') {
                this.gameOverTriggered = true;
                if (this.onGameOver) this.onGameOver(2);
            } else if (this.p2.state === 'KNOCKED_OUT') {
                this.gameOverTriggered = true;
                if (this.onGameOver) this.onGameOver(1);
            }
        }

        this.reqId = requestAnimationFrame(this.loop);
    }
}
