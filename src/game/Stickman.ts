import { Vec2 } from './MathUtils';
import { CharacterStats, InputState, WeaponType } from './Types';

export type CharacterState =
    | 'IDLE' | 'RUNNING' | 'JUMPING' | 'DASHING'
    | 'PUNCHING' | 'KICKING' | 'BLOCKING'
    | 'STUNNED' | 'KNOCKED_OUT' | 'SPECIAL';

// ─── Anatomy constants ───────────────────────────────────────────────────────
const PELVIS_Y   = -35;
const SHOULDER_Y = -76;
const HEAD_Y     = -97;

export class Stickman {
    public pos: Vec2;
    public vel: Vec2 = new Vec2(0, 0);
    public facing: number = 1;
    public state: CharacterState = 'IDLE';
    public stateTimer: number = 0;
    public stateBeforeAttack: CharacterState = 'IDLE';
    public weapon: WeaponType;

    public grounded: boolean = false;

    public health: number;
    public displayHealth: number;
    public energy: number = 0;
    public maxEnergy: number = 100;
    public blockHits: number = 0;
    public blockCooldown: number = 0;
    public stunTimer: number = 0;
    public dashTimer: number = 0;
    public dashCooldown: number = 0;
    public comboCount: number = 0;
    public comboTimer: number = 0;
    public attackVariant: number = 0;
    public justWallJumped: boolean = false;
    public canWallJump: boolean = true;

    /** Set by GameLoop each frame — used to pick contextual attack variants. */
    public opponentY: number | null = null;
    /** 0–1; set to 1 on damage, decays to 0 for the health-bar flash effect. */
    public healthFlash: number = 0;

    public hasHit: boolean = false;
    private prevInput: InputState = {
        dirX: 0, jump: false, punch: false,
        kick: false, block: false, dash: false, special: false,
    };

    // Skeleton joints (all relative to pos)
    public head: Vec2     = new Vec2(0, 0);
    public shoulder: Vec2 = new Vec2(0, 0);
    public pelvis: Vec2   = new Vec2(0, 0);
    public elbowL: Vec2   = new Vec2(0, 0); public handL: Vec2 = new Vec2(0, 0);
    public elbowR: Vec2   = new Vec2(0, 0); public handR: Vec2 = new Vec2(0, 0);
    public kneeL: Vec2    = new Vec2(0, 0); public footL: Vec2 = new Vec2(0, 0);
    public kneeR: Vec2    = new Vec2(0, 0); public footR: Vec2 = new Vec2(0, 0);

    public activeAttackCollider: {
        pos: Vec2; radius: number; type: 'PUNCH' | 'KICK' | 'SPECIAL';
    } | null = null;

    constructor(
        x: number, y: number,
        public stats: CharacterStats,
        isPlayer1: boolean,
        weapon: WeaponType = 'UNARMED',
    ) {
        this.pos     = new Vec2(x, y);
        this.health  = stats.maxHealth;
        this.displayHealth = stats.maxHealth;
        this.facing  = isPlayer1 ? 1 : -1;
        this.weapon  = weapon;
        this.updateAnimation(0);
    }

    public setState(newState: CharacterState) {
        if (this.state === newState) return;
        this.state = newState;
        this.stateTimer = 0;
        if (newState === 'PUNCHING' || newState === 'KICKING') this.hasHit = false;
    }

    public applyDamage(amount: number, knockback: Vec2, isHeavy: boolean) {
        this.comboCount = 0;
        if (this.state === 'BLOCKING') {
            if (isHeavy) {
                this.setState('STUNNED');
                this.stunTimer   = 10;
                this.blockCooldown = 5;
                this.blockHits   = 0;
                this.vel = knockback.mult(0.2);
            } else {
                this.blockHits++;
                if (this.blockHits >= 3) {
                    this.blockCooldown = 5;
                    this.setState('IDLE');
                    this.blockHits = 0;
                }
                this.vel = new Vec2(knockback.x * 0.5, 0);
            }
        } else {
            this.health = Math.max(0, this.health - amount);
            this.healthFlash = 1.0;  // trigger hit-flash on health bar
            this.vel = knockback;
            if (this.health === 0) {
                this.setState('KNOCKED_OUT');
            } else if (
                this.state === 'PUNCHING' ||
                this.state === 'KICKING'  ||
                this.state === 'DASHING'
            ) {
                this.setState('IDLE');
            }
        }
    }

    public update(dt: number, input: InputState) {
        this.stateTimer += dt;
        this.displayHealth += (this.health - this.displayHealth) * 5 * dt;
        if (this.healthFlash > 0) this.healthFlash = Math.max(0, this.healthFlash - dt * 5);

        if (this.dashCooldown  > 0) this.dashCooldown  -= dt;
        if (this.blockCooldown > 0) this.blockCooldown -= dt;
        if (this.stunTimer > 0) {
            this.stunTimer -= dt;
            if (this.stunTimer <= 0) this.setState('IDLE');
        }
        if (this.dashTimer > 0) {
            this.dashTimer -= dt;
            if (this.dashTimer <= 0) this.setState('IDLE');
        }
        if (this.comboTimer > 0) {
            this.comboTimer -= dt;
            if (this.comboTimer <= 0) this.comboCount = 0;
        }

        if (this.state === 'KNOCKED_OUT' || this.state === 'STUNNED') {
            this.updatePhysics(dt);
            this.updateAnimation(dt);
            return;
        }

        const justJumped  = input.jump   && !this.prevInput.jump;
        const justPunched = input.punch  && !this.prevInput.punch;
        const justKicked  = input.kick   && !this.prevInput.kick;
        const justDashed  = input.dash   && !this.prevInput.dash;
        const justSpecial = input.special && !this.prevInput.special;
        this.prevInput = { ...input };

        const canAct =
            this.state !== 'PUNCHING'  && this.state !== 'KICKING' &&
            this.state !== 'DASHING'   && this.state !== 'BLOCKING' &&
            this.state !== 'SPECIAL';

        const touchingLeftWall  = this.pos.x <= 50;
        const touchingRightWall = this.pos.x >= 1230;

        if (canAct) {
            if (justSpecial && this.energy >= this.maxEnergy) {
                this.energy = 0;
                this.setState('SPECIAL');
                this.vel.x = 0;
            } else if (justPunched) {
                this.stateBeforeAttack = this.state;
                this.attackVariant = this.selectAttackVariant(false);
                this.setState('PUNCHING');
            } else if (justKicked) {
                this.stateBeforeAttack = this.state;
                this.attackVariant = this.selectAttackVariant(true);
                this.setState('KICKING');
            } else if (input.block && this.grounded && this.blockCooldown <= 0) {
                this.setState('BLOCKING');
                this.vel.x = 0;
            } else if (justDashed && this.dashCooldown <= 0) {
                this.setState('DASHING');
                this.dashTimer    = 0.3;
                this.dashCooldown = 1.0;
                this.vel.x = this.facing * 1200;
                this.vel.y = 0;
            } else if (justJumped && this.grounded) {
                this.vel.y = -this.stats.jumpForce;
                this.grounded = false;
                this.setState('JUMPING');
            } else if (
                justJumped && !this.grounded &&
                (touchingLeftWall || touchingRightWall) && this.canWallJump
            ) {
                this.vel.y      = -this.stats.jumpForce * 1.1;
                this.vel.x      = touchingLeftWall ? 800 : -800;
                this.facing     = touchingLeftWall ? 1 : -1;
                this.setState('JUMPING');
                this.canWallJump    = false;
                this.justWallJumped = true;
                setTimeout(() => { this.justWallJumped = false; }, 500);
            }
        } else if (this.state === 'BLOCKING') {
            if (!input.block) {
                // 0.5 s cooldown whenever the player voluntarily drops block
                this.blockCooldown = Math.max(this.blockCooldown, 0.5);
                this.setState('IDLE');
            }
        }

        if (this.state !== 'BLOCKING' && this.state !== 'DASHING') {
            const targetVelX = input.dirX * this.stats.moveSpeed;
            if (this.grounded) {
                this.vel.x += (targetVelX - this.vel.x) * 15 * dt;
                if      (Math.abs(this.vel.x) > 20 && this.state === 'IDLE')    this.setState('RUNNING');
                else if (Math.abs(this.vel.x) <= 20 && this.state === 'RUNNING') this.setState('IDLE');
            } else {
                this.vel.x += (targetVelX - this.vel.x) * 5 * dt;
            }
        }

        this.updatePhysics(dt);
        this.updateAnimation(dt);
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Pick attack variant based on the opponent's relative height.
    //   heightDiff = my pos.y − opponent pos.y
    //   pos.y is the feet level; lower pos.y = higher on screen.
    //   + diff → I'm lower (opponent above me) → reach UP
    //   − diff → I'm higher (opponent below me) → strike DOWN
    // ─────────────────────────────────────────────────────────────────────────
    private selectAttackVariant(isKick: boolean): number {
        if (this.opponentY === null) return Math.floor(Math.random() * 3);
        const diff = this.pos.y - this.opponentY;
        if (diff > 80)  return isKick ? 1 : 1; // high roundhouse / uppercut
        if (diff < -80) return isKick ? 2 : 2; // low sweep / body hook
        return Math.floor(Math.random() * 3);   // same level → random
    }

    private updatePhysics(dt: number) {
        this.vel.y += 1800 * dt;
        if (this.state === 'DASHING') this.vel.y = 0;

        this.pos.x += this.vel.x * dt;
        this.pos.y += this.vel.y * dt;

        const FLOOR_Y = 600;
        if (this.pos.y > FLOOR_Y) {
            this.pos.y    = FLOOR_Y;
            this.vel.y    = 0;
            this.grounded = true;
            this.canWallJump = true;
            if (this.state === 'JUMPING') this.setState('IDLE');
        } else {
            this.grounded = false;
        }

        if (this.pos.x < 50)   this.pos.x = 50;
        if (this.pos.x > 1230) this.pos.x = 1230;
    }

    // ─────────────────────────────────────────────────────────────────────────
    // 24-FRAME ANIMATION SYSTEM
    // ─────────────────────────────────────────────────────────────────────────
    private updateAnimation(_dt: number) {
        const f = this.facing;

        // Snap timer to 24 fps grid for crisp fighting-game feel
        const t24 = Math.floor(this.stateTimer * 24) / 24;

        const lerp  = (a: number, b: number, t: number) =>
            a + (b - a) * Math.max(0, Math.min(1, t));
        const lerpV = (a: Vec2, b: Vec2, t: number) =>
            new Vec2(lerp(a.x, b.x, t), lerp(a.y, b.y, t));

        // ── BASE POSE ─────────────────────────────────────────────────────────
        this.pelvis   = new Vec2(0,        PELVIS_Y);
        this.shoulder = new Vec2(0,        SHOULDER_Y);
        this.head     = new Vec2(0,        HEAD_Y);
        this.elbowL   = new Vec2(-f * 14,  -57);
        this.handL    = new Vec2(-f * 16,  -34);
        this.elbowR   = new Vec2( f * 14,  -57);
        this.handR    = new Vec2( f * 16,  -34);
        this.kneeL    = new Vec2(-f *  9,  -18);
        this.footL    = new Vec2(-f * 11,    0);
        this.kneeR    = new Vec2( f *  9,  -18);
        this.footR    = new Vec2( f * 11,    0);

        this.activeAttackCollider = null;

        // ── IDLE ──────────────────────────────────────────────────────────────
        if (this.state === 'IDLE') {
            const breathPhase = (t24 * 0.5) % 1.0;
            const breath      = Math.sin(breathPhase * Math.PI * 2);
            const shift       = Math.sin(breathPhase * Math.PI * 2 + 0.8) * 1.5;

            this.shoulder.y += breath * 2.5;
            this.head.y     += breath * 2.5;
            this.pelvis.x   += f * shift;
            this.shoulder.x += f * shift * 0.4;

            // Combat-ready guard
            this.elbowR = new Vec2( f * 18,  -65 + breath * 1.5);
            this.handR  = new Vec2( f * 14,  -82 + breath * 1.5);
            this.elbowL = new Vec2(-f * 10,  -58 + breath * 1.0);
            this.handL  = new Vec2(-f * 14,  -46 + breath * 1.0);
            this.kneeL  = new Vec2(-f * 11,  -20);
            this.footL  = new Vec2(-f * 14,    0);
            this.kneeR  = new Vec2( f * 11,  -20);
            this.footR  = new Vec2( f * 14,    0);
        }

        // ── RUNNING ───────────────────────────────────────────────────────────
        if (this.state === 'RUNNING') {
            const CYCLE  = 0.44;
            const phase  = ((t24 / CYCLE) % 1.0) * Math.PI * 2;
            const STRIDE = 27, LIFT = 17, ARM_SW = 24, BOB = 3.5, LEAN = 5;

            const rP = phase, lP = phase + Math.PI;

            this.footR  = new Vec2(f * STRIDE * Math.sin(rP) * 0.88, -LIFT * Math.max(0, Math.sin(rP - 0.25)));
            this.footL  = new Vec2(f * STRIDE * Math.sin(lP) * 0.88, -LIFT * Math.max(0, Math.sin(lP - 0.25)));
            this.kneeR  = new Vec2(f * STRIDE * 0.44 * Math.sin(rP), -18 - 11 * Math.max(0, Math.sin(rP - 0.15)));
            this.kneeL  = new Vec2(f * STRIDE * 0.44 * Math.sin(lP), -18 - 11 * Math.max(0, Math.sin(lP - 0.15)));

            this.handR  = new Vec2(-f * ARM_SW * Math.sin(rP), -40 + 7 * Math.cos(rP));
            this.handL  = new Vec2(-f * ARM_SW * Math.sin(lP), -40 + 7 * Math.cos(lP));
            this.elbowR = new Vec2(this.handR.x * 0.48, -59 + 4 * Math.cos(rP));
            this.elbowL = new Vec2(this.handL.x * 0.48, -59 + 4 * Math.cos(lP));

            const bob        = -BOB * Math.abs(Math.cos(phase));
            this.pelvis.y   += bob;
            this.shoulder.x  = f * LEAN * 0.35;
            this.shoulder.y += bob * 0.6;
            this.head.x      = f * LEAN * 0.7;
            this.head.y     += bob * 0.4;
        }

        // ── JUMPING ───────────────────────────────────────────────────────────
        // Three clean phases: tuck (rise) → float (apex) → extend (fall).
        // Legs tuck symmetrically; arms stay at natural chest height.
        if (this.state === 'JUMPING') {
            if (this.vel.y < -100) {
                // Rising — knees draw up, arms pump to chest
                const riseT = Math.min(1, -this.vel.y / this.stats.jumpForce);

                this.kneeL  = new Vec2(-f * 12, lerp(-18, -32, riseT));
                this.footL  = new Vec2(-f *  8, lerp(  0, -22, riseT));
                this.kneeR  = new Vec2( f * 12, lerp(-18, -30, riseT));
                this.footR  = new Vec2( f *  8, lerp(  0, -20, riseT));

                this.elbowL = new Vec2(-f * 16, lerp(-57, -68, riseT));
                this.handL  = new Vec2(-f * 18, lerp(-34, -72, riseT));
                this.elbowR = new Vec2( f * 16, lerp(-57, -70, riseT));
                this.handR  = new Vec2( f * 18, lerp(-34, -74, riseT));

                this.pelvis.y   -= riseT * 3;
                this.shoulder.y -= riseT * 2;

            } else if (this.vel.y <= 100) {
                // Apex — controlled float, arms spread naturally
                this.kneeL  = new Vec2(-f * 11, -22);
                this.footL  = new Vec2(-f * 12, -10);
                this.kneeR  = new Vec2( f * 11, -22);
                this.footR  = new Vec2( f * 12, -10);
                this.elbowL = new Vec2(-f * 22, -64);
                this.handL  = new Vec2(-f * 26, -52);
                this.elbowR = new Vec2( f * 22, -64);
                this.handR  = new Vec2( f * 26, -52);

            } else {
                // Falling — legs extend, arms wide for balance
                const fallT = Math.min(1, (this.vel.y - 100) / 600);

                this.kneeL  = new Vec2(-f *  9, lerp(-22, -17, fallT));
                this.footL  = new Vec2(-f * 10, lerp(-10,   0, fallT));
                this.kneeR  = new Vec2( f *  9, lerp(-22, -17, fallT));
                this.footR  = new Vec2( f * 10, lerp(-10,   0, fallT));

                this.elbowL = new Vec2(-f * lerp(22, 28, fallT), lerp(-64, -58, fallT));
                this.handL  = new Vec2(-f * lerp(26, 34, fallT), lerp(-52, -44, fallT));
                this.elbowR = new Vec2( f * lerp(22, 28, fallT), lerp(-64, -58, fallT));
                this.handR  = new Vec2( f * lerp(26, 34, fallT), lerp(-52, -44, fallT));

                this.shoulder.y += fallT * 2;
            }
        }

        // ── DASHING ───────────────────────────────────────────────────────────
        if (this.state === 'DASHING') {
            const legPhase = (t24 / 0.3) * Math.PI * 4;

            this.pelvis.x   = f *  8;  this.pelvis.y   -= 4;
            this.shoulder.x = f * 15;  this.shoulder.y -= 3;
            this.head.x     = f * 20;

            this.elbowR = new Vec2( f * 30,  -70);
            this.handR  = new Vec2( f * 46,  -73);
            this.elbowL = new Vec2(-f * 22,  -55);
            this.handL  = new Vec2(-f * 32,  -46);

            const rOff  = Math.sin(legPhase) * 20;
            const lOff  = Math.sin(legPhase + Math.PI) * 20;
            const rLift = Math.max(0, Math.sin(legPhase)) * 8;
            const lLift = Math.max(0, Math.sin(legPhase + Math.PI)) * 8;
            this.footR  = new Vec2( f * (14 + rOff * 0.5),  -rLift);
            this.kneeR  = new Vec2( f * (10 + rOff * 0.25), -18);
            this.footL  = new Vec2(-f * (8  + lOff * 0.5),  -lLift);
            this.kneeL  = new Vec2(-f * (6  + lOff * 0.25), -18);
        }

        // ── BLOCKING — X-guard with energy pulse ──────────────────────────────
        if (this.state === 'BLOCKING') {
            const bPulse = Math.sin(t24 * Math.PI * 2 * 1.5) * 2.5; // 1.5 Hz heartbeat

            // Deep, wide, rooted stance
            this.pelvis.y   -= 9;
            this.shoulder.y -= 6;
            this.head.y     -= 3;
            this.shoulder.x  = -f * 2;
            this.head.x      = -f * 3;
            this.kneeL  = new Vec2(-f * 15, -25);
            this.footL  = new Vec2(-f * 20,   0);
            this.kneeR  = new Vec2( f * 15, -25);
            this.footR  = new Vec2( f * 20,   0);

            // X-guard: arms cross in front creating a hard barrier
            // Right arm crosses to the left; left arm crosses to the right
            this.elbowR = new Vec2( f * 14,  -70 + bPulse);
            this.handR  = new Vec2(-f *  4,  -87 + bPulse);  // ← crosses over
            this.elbowL = new Vec2(-f * 10,  -66 + bPulse);
            this.handL  = new Vec2( f * 20,  -83 + bPulse);  // → crosses over
        }

        // ── STUNNED ───────────────────────────────────────────────────────────
        if (this.state === 'STUNNED') {
            const wobble  = Math.sin(t24 * 8   * Math.PI * 2) * 11;
            const stagger = Math.sin(t24 * 2.5 * Math.PI * 2) * 6;

            this.pelvis.y   -= 4;
            this.pelvis.x   += stagger * 0.4;
            this.head.x     += wobble;
            this.shoulder.x += wobble * 0.45;

            this.elbowL = new Vec2(-f * 18 + wobble * 0.4,  -50);
            this.handL  = new Vec2(-f * 22 + wobble * 0.6,  -28);
            this.elbowR = new Vec2( f * 14 + wobble * 0.3,  -48);
            this.handR  = new Vec2( f * 18 + wobble * 0.5,  -26);
            this.kneeL  = new Vec2(-f * 12 + stagger * 0.2, -17);
            this.footL  = new Vec2(-f * 15 + stagger * 0.4,   3);
        }

        // ── KNOCKED OUT ───────────────────────────────────────────────────────
        if (this.state === 'KNOCKED_OUT') {
            const fallT = Math.min(1, t24 * 2.2);

            this.pelvis   = lerpV(new Vec2(0,       PELVIS_Y),   new Vec2(-f * 12,  -7), fallT);
            this.shoulder = lerpV(new Vec2(0,       SHOULDER_Y), new Vec2(-f * 30,  -6), fallT);
            this.head     = lerpV(new Vec2(0,       HEAD_Y),     new Vec2(-f * 50,  -5), fallT);

            this.elbowR = lerpV(new Vec2( f * 14,  -57), new Vec2(-f *  6,  -20), fallT);
            this.handR  = lerpV(new Vec2( f * 16,  -34), new Vec2(-f * 10,    6), fallT);
            this.elbowL = lerpV(new Vec2(-f * 14,  -57), new Vec2( f * 22,  -16), fallT);
            this.handL  = lerpV(new Vec2(-f * 16,  -34), new Vec2( f * 36,    8), fallT);

            this.kneeR  = lerpV(new Vec2( f *  9,  -18), new Vec2( f * 22,  -22), fallT);
            this.footR  = lerpV(new Vec2( f * 11,    0), new Vec2( f * 32,  -10), fallT);
            this.kneeL  = lerpV(new Vec2(-f *  9,  -18), new Vec2(-f *  5,  -26), fallT);
            this.footL  = lerpV(new Vec2(-f * 11,    0), new Vec2( f *  6,  -14), fallT);
        }

        // ─────────────────────────────────────────────────────────────────────
        // ATTACK ANIMATIONS — override base pose completely.
        // ─────────────────────────────────────────────────────────────────────

        // ── SPECIAL ───────────────────────────────────────────────────────────
        if (this.state === 'SPECIAL') {
            const t = this.stateTimer / 0.8;

            if (t >= 1) {
                this.setState('IDLE');
            } else if (this.weapon === 'KATANA') {
                // ── Iaijutsu Lightning Draw ───────────────────────────────────
                // Phase A (0–0.44): crouch into stance, hilt at hip
                // Phase B (0.44–0.68): explosive horizontal slash
                // Phase C (0.68–1.0): recovery
                if (t < 0.44) {
                    const charge = t / 0.44;
                    const ease   = charge * charge;

                    this.pelvis.y   -= ease * 16;
                    this.shoulder.y -= ease * 12;
                    this.head.y     -= ease * 8;
                    this.head.x      = f * ease * 6;

                    const hipY      = this.pelvis.y - 4;
                    this.handR  = new Vec2(f *  8,  hipY);
                    this.elbowR = new Vec2(f *  4,  hipY - 16);

                    this.elbowL = new Vec2(-f * 24, this.shoulder.y - 4);
                    this.handL  = new Vec2(-f * 34, this.shoulder.y + 3);

                    this.kneeL  = new Vec2(-f * 16, -24 - ease * 4);
                    this.footL  = new Vec2(-f * 22, 0);
                    this.kneeR  = new Vec2( f * 12, -22 - ease * 4);
                    this.footR  = new Vec2( f * 16, 0);

                } else if (t < 0.68) {
                    const sl   = (t - 0.44) / 0.24;
                    const ease = Math.sin(sl * Math.PI / 2);
                    const sy   = this.shoulder.y;

                    this.pelvis.x    = f * ease * 8;
                    this.shoulder.x  = f * ease * 12;
                    this.head.x      = f * lerp(6, 20, ease);

                    this.handR  = new Vec2(f * lerp(8,  90, ease), lerp(-39, sy, ease));
                    this.elbowR = new Vec2(f * lerp(4,  45, ease), lerp(-55, sy + 5, ease));
                    this.elbowL = new Vec2(-f * lerp(24, 8,  ease), sy - 4);
                    this.handL  = new Vec2(-f * lerp(34, 16, ease), sy + 2);

                    this.footR  = new Vec2(f * lerp(16, 28, ease), 0);
                    this.kneeR  = new Vec2(f * lerp(12, 18, ease), -20);

                    this.vel.x  = f * 3000 * (1 - sl);

                    if (sl > 0.15) {
                        this.activeAttackCollider = {
                            pos:    this.pos.add(new Vec2(f * lerp(50, 96, ease), sy)),
                            radius: 72, type: 'SPECIAL',
                        };
                    }

                } else {
                    const rec = (t - 0.68) / 0.32;
                    const sy  = this.shoulder.y;
                    this.handR  = new Vec2(f * lerp(90, 22, rec), sy);
                    this.elbowR = new Vec2(f * lerp(45, 16, rec), sy + 5);
                    this.elbowL = new Vec2(-f * lerp(8,  12, rec), sy - 4);
                    this.handL  = new Vec2(-f * lerp(16, 18, rec), sy + 2);
                }

            } else if (this.weapon === 'STAFF') {
                // ── Dragon Slam ───────────────────────────────────────────────
                // Phase A (0–0.35): raise staff overhead
                // Phase B (0.35–0.65): drive it down hard
                // Phase C (0.65–1.0): recover
                if (t < 0.35) {
                    const wind = t / 0.35;
                    this.handR  = new Vec2(f * lerp(16, 28, wind),  lerp(-20, -62, wind));
                    this.elbowR = new Vec2(f * lerp(14, 18, wind),  lerp( -5, -30, wind));
                    this.handL  = new Vec2(-f * lerp(10, 18, wind), lerp(-20, -58, wind));
                    this.elbowL = new Vec2(-f * lerp(8,  12, wind), lerp( -5, -28, wind));
                    this.shoulder.x = -f * wind * 8;
                    this.head.x     = -f * wind * 5;
                    this.pelvis.x   = -f * wind * 4;
                    this.pelvis.y   -= wind * 6;
                    this.shoulder.y -= wind * 4;

                } else if (t < 0.65) {
                    const sl   = (t - 0.35) / 0.30;
                    const ease = Math.pow(sl, 0.4);

                    this.shoulder.x = f * lerp(-8,  14, ease);
                    this.pelvis.x   = f * lerp(-4,   8, ease);
                    this.head.x     = f * lerp(-5,  12, ease);
                    this.shoulder.y += ease * 14;
                    this.pelvis.y   += ease * 10;

                    this.handR  = new Vec2(f * lerp(28, 12, ease),  lerp(-62,  50, ease));
                    this.elbowR = new Vec2(f * lerp(18,  6, ease),  lerp(-30,  24, ease));
                    this.handL  = new Vec2(-f * lerp(18, 6, ease),  lerp(-58,  46, ease));
                    this.elbowL = new Vec2(-f * lerp(12, 4, ease),  lerp(-28,  18, ease));

                    this.footR  = new Vec2(f * lerp(16, 28, ease), 0);
                    this.kneeR  = new Vec2(f * lerp(12, 18, ease), -18);
                    this.vel.x  = f * 300 * (1 - sl);

                    if (sl > 0.2 && sl < 0.92) {
                        this.activeAttackCollider = {
                            pos:    this.pos.add(new Vec2(f * 22, -20)),
                            radius: 110, type: 'SPECIAL',
                        };
                    }

                } else {
                    const rec = (t - 0.65) / 0.35;
                    this.handR  = new Vec2(f * lerp(12, 18, rec), lerp( 50, -20, rec));
                    this.elbowR = new Vec2(f * lerp( 6, 14, rec), lerp( 24,  -5, rec));
                    this.handL  = new Vec2(-f * lerp(6, 12, rec), lerp( 46, -18, rec));
                    this.elbowL = new Vec2(-f * lerp(4,  8, rec), lerp( 18,  -5, rec));
                    this.shoulder.x = f * lerp(14, 0, rec);
                    this.shoulder.y += lerp(14, 0, rec);
                    this.pelvis.y   += lerp(10, 0, rec);
                }

            } else {
                // ── Unarmed: Rising Dragon Rush ───────────────────────────────
                // Phase A (0–0.30): energy crouch
                // Phase B (0.30–0.65): explosive flurry dash
                // Phase C (0.65–1.0): decelerate + recover
                if (t < 0.30) {
                    const charge = t / 0.30;
                    const ease   = charge * charge;

                    this.pelvis.y   -= ease * 24;
                    this.shoulder.y -= ease * 18;
                    this.head.y     -= ease * 12;

                    const py        = this.pelvis.y;
                    this.handR  = new Vec2( f * 24,  py - 6);
                    this.elbowR = new Vec2( f * 18,  py - 14);
                    this.handL  = new Vec2(-f * 20,  py - 4);
                    this.elbowL = new Vec2(-f * 14,  py - 12);

                    this.kneeL  = new Vec2(-f * 14, -24 - ease * 6);
                    this.kneeR  = new Vec2( f * 14, -24 - ease * 6);
                    this.footL  = new Vec2(-f * 16, 0);
                    this.footR  = new Vec2( f * 16, 0);

                } else if (t < 0.65) {
                    const rush  = (t - 0.30) / 0.35;
                    const ease  = Math.sin(rush * Math.PI / 2);

                    this.pelvis.y   -= (1 - ease) * 24;
                    this.shoulder.y -= (1 - ease) * 18;
                    this.head.y     -= (1 - ease) * 12;
                    this.pelvis.x    = f * rush * 12;
                    this.shoulder.x  = f * rush * 18;
                    this.head.x      = f * rush * 22;

                    const flurryPhase = rush * Math.PI * 8;
                    const fl  = Math.sin(flurryPhase);
                    const flC = Math.cos(flurryPhase);

                    this.handR  = this.shoulder.add(new Vec2(f * (48 + fl * 10),  flC * 15));
                    this.elbowR = this.shoulder.add(new Vec2(f * (24 + fl *  5),  flC * 8));
                    this.handL  = this.shoulder.add(new Vec2(-f * (8 - fl * 10), -flC * 10));
                    this.elbowL = this.shoulder.add(new Vec2(-f * (4 - fl *  5), -flC *  5));

                    this.footR  = new Vec2(f * lerp(16, 35, ease), -ease * 8);
                    this.kneeR  = new Vec2(f * lerp(14, 22, ease), -18);
                    this.footL  = new Vec2(f * lerp(-16, 5, ease), 0);
                    this.kneeL  = new Vec2(f * lerp(-14, 0, ease), -18);

                    this.vel.x  = f * 1500 * (1 - rush);

                    if (rush < 0.88) {
                        this.activeAttackCollider = {
                            pos:    this.handR.add(this.pos),
                            radius: 28, type: 'SPECIAL',
                        };
                    }

                } else {
                    const rec = (t - 0.65) / 0.35;
                    this.pelvis.x   = f * lerp(12, 0, rec);
                    this.shoulder.x = f * lerp(18, 0, rec);
                    this.head.x     = f * lerp(22, 0, rec);
                    this.handR  = this.shoulder.add(new Vec2(f * lerp(48, 16, rec),  0));
                    this.elbowR = this.shoulder.add(new Vec2(f * lerp(24, 14, rec),  5));
                    this.handL  = this.shoulder.add(new Vec2(-f * lerp(8, 16, rec),  0));
                    this.elbowL = this.shoulder.add(new Vec2(-f * lerp(4, 10, rec),  5));
                }
            }
        }

        // ── PUNCHING ──────────────────────────────────────────────────────────
        if (this.state === 'PUNCHING') {
            const duration = this.weapon === 'KATANA' ? 0.45 : (this.weapon === 'STAFF' ? 0.4 : 0.3);
            const t        = this.stateTimer / duration;
            if (t < 1) {
                let ext = 0, twist = 0;
                if (t < 0.2) {
                    ext   = -0.32 * (t / 0.2);
                    twist = -0.22 * (t / 0.2);
                } else if (t < 0.42) {
                    const st = (t - 0.2) / 0.22;
                    ext   = -0.32 + 1.35 * Math.sin(st * Math.PI / 2);
                    twist = -0.22 + 0.72 * Math.sin(st * Math.PI / 2);
                } else {
                    const rt = (t - 0.42) / 0.58;
                    ext   = 1.03 * (1 - rt * rt);
                    twist = 0.50 * (1 - rt);
                }

                this.shoulder.x += twist * 12 * f;
                this.head.x     += twist * 16 * f;
                this.handL.x    -= twist * 10 * f;

                if (this.attackVariant === 0) {
                    this.handR  = this.shoulder.add(new Vec2(52 * ext * f,  0));
                    this.elbowR = this.shoulder.add(new Vec2(26 * ext * f, 10));
                } else if (this.attackVariant === 1) {
                    this.handR  = this.shoulder.add(new Vec2(32 * ext * f, -44 * ext));
                    this.elbowR = this.shoulder.add(new Vec2(16 * ext * f, -12 * ext));
                    this.shoulder.y -= ext * 12;
                } else {
                    this.handR  = this.shoulder.add(new Vec2(42 * ext * f, 32 * ext));
                    this.elbowR = this.shoulder.add(new Vec2(26 * ext * f, -8 * ext));
                    this.head.y += ext * 6;
                }

                if (t > 0.2 && t < 0.52) {
                    let r = 11;
                    if (this.weapon === 'KATANA') r = 36;
                    if (this.weapon === 'STAFF')  r = 26;
                    this.activeAttackCollider = {
                        pos: this.handR.add(this.pos), radius: r, type: 'PUNCH',
                    };
                }
            } else {
                const isMoving = Math.abs(this.vel.x) > 20 && this.grounded;
                this.setState(isMoving ? 'RUNNING' : 'IDLE');
            }
        }

        // ── KICKING ───────────────────────────────────────────────────────────
        if (this.state === 'KICKING') {
            const duration = this.weapon === 'KATANA' ? 0.6 : (this.weapon === 'STAFF' ? 0.5 : 0.4);
            const t        = this.stateTimer / duration;
            if (t < 1) {
                let ext = 0, twist = 0;
                if (t < 0.2) {
                    ext   = -0.30 * (t / 0.2);
                    twist = -0.20 * (t / 0.2);
                } else if (t < 0.42) {
                    const st = (t - 0.2) / 0.22;
                    ext   = -0.30 + 1.32 * Math.sin(st * Math.PI / 2);
                    twist = -0.20 + 0.72 * Math.sin(st * Math.PI / 2);
                } else {
                    const rt = (t - 0.42) / 0.58;
                    ext   = 1.02 * (1 - rt * rt);
                    twist = 0.52 * (1 - rt);
                }

                this.shoulder.x -= twist * 10 * f;
                this.head.x     -= twist * 14 * f;
                this.handR.x    += twist * 10 * f;
                this.handL.x    += twist * 10 * f;

                if (this.attackVariant === 0) {
                    // Front kick
                    this.footR  = this.pelvis.add(new Vec2(62 * ext * f, -20 * ext));
                    this.kneeR  = this.pelvis.add(new Vec2(30 * ext * f,   0));
                } else if (this.attackVariant === 1) {
                    // High roundhouse
                    this.footR  = this.pelvis.add(new Vec2(42 * ext * f, -62 * ext));
                    this.kneeR  = this.pelvis.add(new Vec2(20 * ext * f, -32 * ext));
                    this.pelvis.y -= ext * 5;
                } else {
                    // Low sweep
                    this.footR  = this.pelvis.add(new Vec2(52 * ext * f, 22 * ext));
                    this.kneeR  = this.pelvis.add(new Vec2(26 * ext * f, 12 * ext));
                    this.pelvis.y   += ext * 16;
                    this.shoulder.y += ext * 11;
                }

                if (t > 0.2 && t < 0.52) {
                    this.activeAttackCollider = {
                        pos: this.footR.add(this.pos), radius: 13, type: 'KICK',
                    };
                }
            } else {
                const isMoving = Math.abs(this.vel.x) > 20 && this.grounded;
                this.setState(isMoving ? 'RUNNING' : 'IDLE');
            }
        }
    }
}
