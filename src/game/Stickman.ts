import { Vec2 } from './MathUtils';
import { CharacterStats, InputState, WeaponType } from './Types';

export type CharacterState = 'IDLE' | 'RUNNING' | 'JUMPING' | 'DASHING' | 'PUNCHING' | 'KICKING' | 'BLOCKING' | 'STUNNED' | 'KNOCKED_OUT' | 'SPECIAL';

// ─── Anatomy constants ───────────────────────────────────────────────────────
// All joint positions are relative to pos (character feet/base).
// Positive Y = down on screen, so joints at negative Y are above the feet.
// X values are multiplied by `facing` so the character mirrors correctly.
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
    // One wall jump allowed per ground contact
    public canWallJump: boolean = true;

    public hasHit: boolean = false;
    private prevInput: InputState = { dirX: 0, jump: false, punch: false, kick: false, block: false, dash: false, special: false };

    // Skeleton joints (relative to pos)
    public head: Vec2 = new Vec2(0, 0);
    public shoulder: Vec2 = new Vec2(0, 0);
    public pelvis: Vec2 = new Vec2(0, 0);
    public elbowL: Vec2 = new Vec2(0, 0); public handL: Vec2 = new Vec2(0, 0);
    public elbowR: Vec2 = new Vec2(0, 0); public handR: Vec2 = new Vec2(0, 0);
    public kneeL: Vec2 = new Vec2(0, 0);  public footL: Vec2 = new Vec2(0, 0);
    public kneeR: Vec2 = new Vec2(0, 0);  public footR: Vec2 = new Vec2(0, 0);

    public activeAttackCollider: { pos: Vec2, radius: number, type: 'PUNCH' | 'KICK' | 'SPECIAL' } | null = null;

    constructor(x: number, y: number, public stats: CharacterStats, isPlayer1: boolean, weapon: WeaponType = 'UNARMED') {
        this.pos = new Vec2(x, y);
        this.health = stats.maxHealth;
        this.displayHealth = stats.maxHealth;
        this.facing = isPlayer1 ? 1 : -1;
        this.weapon = weapon;
        this.updateAnimation(0);
    }

    public setState(newState: CharacterState) {
        if (this.state === newState) return;
        this.state = newState;
        this.stateTimer = 0;
        if (newState === 'PUNCHING' || newState === 'KICKING') {
            this.hasHit = false;
        }
    }

    public applyDamage(amount: number, knockback: Vec2, isHeavy: boolean) {
        this.comboCount = 0;
        if (this.state === 'BLOCKING') {
            if (isHeavy) {
                this.setState('STUNNED');
                this.stunTimer = 10;
                this.blockCooldown = 5;
                this.blockHits = 0;
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
            this.vel = knockback;
            if (this.health === 0) {
                this.setState('KNOCKED_OUT');
            } else {
                if (this.state === 'PUNCHING' || this.state === 'KICKING' || this.state === 'DASHING') {
                    this.setState('IDLE');
                }
            }
        }
    }

    public update(dt: number, input: InputState) {
        this.stateTimer += dt;
        this.displayHealth += (this.health - this.displayHealth) * 5 * dt;

        if (this.dashCooldown > 0) this.dashCooldown -= dt;
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

        const justJumped  = input.jump  && !this.prevInput.jump;
        const justPunched = input.punch && !this.prevInput.punch;
        const justKicked  = input.kick  && !this.prevInput.kick;
        const justDashed  = input.dash  && !this.prevInput.dash;
        const justSpecial = input.special && !this.prevInput.special;
        this.prevInput = { ...input };

        const canAct = this.state !== 'PUNCHING' && this.state !== 'KICKING' &&
                       this.state !== 'DASHING'  && this.state !== 'BLOCKING' &&
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
                this.attackVariant = Math.floor(Math.random() * 3);
                this.setState('PUNCHING');
            } else if (justKicked) {
                this.stateBeforeAttack = this.state;
                this.attackVariant = Math.floor(Math.random() * 3);
                this.setState('KICKING');
            } else if (input.block && this.grounded && this.blockCooldown <= 0) {
                this.setState('BLOCKING');
                this.vel.x = 0;
            } else if (justDashed && this.dashCooldown <= 0) {
                this.setState('DASHING');
                this.dashTimer = 0.3;
                this.dashCooldown = 1.0;
                this.vel.x = this.facing * 1200;
                this.vel.y = 0;
            } else if (justJumped && this.grounded) {
                this.vel.y = -this.stats.jumpForce;
                this.grounded = false;
                this.setState('JUMPING');
            } else if (justJumped && !this.grounded && (touchingLeftWall || touchingRightWall) && this.canWallJump) {
                // Wall jump — only once per ground contact
                this.vel.y = -this.stats.jumpForce * 1.1;
                this.vel.x = touchingLeftWall ? 800 : -800;
                this.facing = touchingLeftWall ? 1 : -1;
                this.setState('JUMPING');
                this.canWallJump = false;     // consumed; resets on next ground landing
                this.justWallJumped = true;
                setTimeout(() => this.justWallJumped = false, 500);
            }
        } else if (this.state === 'BLOCKING') {
            if (!input.block) this.setState('IDLE');
        }

        if (this.state !== 'BLOCKING' && this.state !== 'DASHING') {
            const targetVelX = input.dirX * this.stats.moveSpeed;
            if (this.grounded) {
                this.vel.x += (targetVelX - this.vel.x) * 15 * dt;
                if (Math.abs(this.vel.x) > 20 && this.state === 'IDLE') {
                    this.setState('RUNNING');
                } else if (Math.abs(this.vel.x) <= 20 && this.state === 'RUNNING') {
                    this.setState('IDLE');
                }
            } else {
                this.vel.x += (targetVelX - this.vel.x) * 5 * dt;
            }
        }

        this.updatePhysics(dt);
        this.updateAnimation(dt);
    }

    private updatePhysics(dt: number) {
        this.vel.y += 1800 * dt;

        if (this.state === 'DASHING') this.vel.y = 0;

        this.pos.x += this.vel.x * dt;
        this.pos.y += this.vel.y * dt;

        const FLOOR_Y = 600;
        if (this.pos.y > FLOOR_Y) {
            this.pos.y = FLOOR_Y;
            this.vel.y = 0;
            this.grounded = true;
            this.canWallJump = true;          // restore wall jump on landing
            if (this.state === 'JUMPING') this.setState('IDLE');
        } else {
            this.grounded = false;
        }

        if (this.pos.x < 50)   this.pos.x = 50;
        if (this.pos.x > 1230) this.pos.x = 1230;
    }

    // ─────────────────────────────────────────────────────────────────────────
    // 24-FRAME ANIMATION SYSTEM
    // All positions are relative to this.pos (feet/base).
    // x values use `f = this.facing` so the skeleton mirrors automatically.
    // The 24-fps quantisation snaps the timer to 1/24 s steps, giving that
    // classic sprite-animation crispness while gameplay runs at full framerate.
    // ─────────────────────────────────────────────────────────────────────────
    private updateAnimation(_dt: number) {
        const f = this.facing;

        // Snap to 24 fps grid for that crisp fighting-game animation feel
        const t24 = Math.floor(this.stateTimer * 24) / 24;

        // Linear interpolation helpers
        const lerp  = (a: number, b: number, t: number) => a + (b - a) * Math.max(0, Math.min(1, t));
        const lerpV = (a: Vec2, b: Vec2, t: number) => new Vec2(lerp(a.x, b.x, t), lerp(a.y, b.y, t));

        // ── BASE POSE (neutral stance, all joints initialised) ────────────────
        this.pelvis   = new Vec2(0,        PELVIS_Y);
        this.shoulder = new Vec2(0,        SHOULDER_Y);
        this.head     = new Vec2(0,        HEAD_Y);
        // Arms in relaxed guard (elbows bent, hands mid-height)
        this.elbowL   = new Vec2(-f * 14,  -57);
        this.handL    = new Vec2(-f * 16,  -34);
        this.elbowR   = new Vec2( f * 14,  -57);
        this.handR    = new Vec2( f * 16,  -34);
        // Legs planted, slight outward stance
        this.kneeL    = new Vec2(-f *  9,  -18);
        this.footL    = new Vec2(-f * 11,    0);
        this.kneeR    = new Vec2( f *  9,  -18);
        this.footR    = new Vec2( f * 11,    0);

        this.activeAttackCollider = null;

        // ── IDLE / BLOCKING-IN-PLACE ──────────────────────────────────────────
        if (this.state === 'IDLE' || (this.state === 'BLOCKING' && Math.abs(this.vel.x) <= 20)) {
            // 2-second breathing cycle quantised to 24 fps
            const breathPhase = (t24 * 0.5) % 1.0;
            const breath      = Math.sin(breathPhase * Math.PI * 2);
            const shift       = Math.sin(breathPhase * Math.PI * 2 + 0.8) * 1.5;

            this.shoulder.y += breath * 2.5;
            this.head.y     += breath * 2.5;
            this.elbowL.y   += breath * 1.5;
            this.handL.y    += breath * 1.0;
            this.elbowR.y   += breath * 1.5;
            this.handR.y    += breath * 1.0;
            this.pelvis.x   += f * shift;
            this.shoulder.x += f * shift * 0.4;

            // Combat-ready guard: lead hand higher, rear hand lower
            this.elbowR = new Vec2( f * 18,  -65 + breath * 1.5);
            this.handR  = new Vec2( f * 14,  -82 + breath * 1.5);
            this.elbowL = new Vec2(-f * 10,  -58 + breath * 1.0);
            this.handL  = new Vec2(-f * 14,  -46 + breath * 1.0);
            // Slight knee bend in stance
            this.kneeL  = new Vec2(-f * 11,  -20);
            this.footL  = new Vec2(-f * 14,    0);
            this.kneeR  = new Vec2( f * 11,  -20);
            this.footR  = new Vec2( f * 14,    0);
        }

        // ── RUNNING ───────────────────────────────────────────────────────────
        // Full 24-frame stride cycle with proper arm-leg opposition,
        // knee lift, foot plant / float phases, and forward body lean.
        if (this.state === 'RUNNING') {
            const CYCLE   = 0.44;   // seconds per full stride (tuned for game speed)
            const cycle   = (t24 / CYCLE) % 1.0;
            const phase   = cycle * Math.PI * 2;

            const STRIDE  = 27;   // half-stride x-reach
            const LIFT    = 17;   // max foot lift height
            const ARM_SW  = 24;   // arm swing x-reach
            const BOB     = 3.5;  // vertical body bob amplitude
            const LEAN    = 5;    // forward lean x-offset

            // Right leg: phase 0 = contact / plant, phase π = float / swing
            const rP = phase;
            const lP = phase + Math.PI;

            // Foot x-position: sinusoidal stride swing
            const fRx = f * STRIDE * Math.sin(rP) * 0.88;
            const fLx = f * STRIDE * Math.sin(lP) * 0.88;

            // Foot y-position: only lift during the forward-swing half
            const fRy = -LIFT * Math.max(0, Math.sin(rP - 0.25));
            const fLy = -LIFT * Math.max(0, Math.sin(lP - 0.25));

            // Knee: rises when foot lifts, straightens on contact
            const kRx = f * STRIDE * 0.44 * Math.sin(rP);
            const kRy = -18 - 11 * Math.max(0, Math.sin(rP - 0.15));
            const kLx = f * STRIDE * 0.44 * Math.sin(lP);
            const kLy = -18 - 11 * Math.max(0, Math.sin(lP - 0.15));

            // Arms swing opposite to legs (classic running opposition)
            const hRx = -f * ARM_SW * Math.sin(rP);
            const hRy = -40 + 7 * Math.cos(rP);
            const hLx = -f * ARM_SW * Math.sin(lP);
            const hLy = -40 + 7 * Math.cos(lP);
            const eRx = hRx * 0.48;
            const eRy = -59 + 4 * Math.cos(rP);
            const eLx = hLx * 0.48;
            const eLy = -59 + 4 * Math.cos(lP);

            // Body bob: dips at each foot-plant, peaks mid-flight
            const bob = -BOB * Math.abs(Math.cos(phase));

            this.pelvis.y   += bob;
            this.shoulder.x  = f * LEAN * 0.35;
            this.shoulder.y += bob * 0.6;
            this.head.x      = f * LEAN * 0.7;
            this.head.y     += bob * 0.4;

            this.elbowR = new Vec2(eRx, eRy);
            this.handR  = new Vec2(hRx, hRy);
            this.elbowL = new Vec2(eLx, eLy);
            this.handL  = new Vec2(hLx, hLy);
            this.kneeR  = new Vec2(kRx, kRy);
            this.footR  = new Vec2(fRx, fRy);
            this.kneeL  = new Vec2(kLx, kLy);
            this.footL  = new Vec2(fLx, fLy);
        }

        // ── JUMPING ───────────────────────────────────────────────────────────
        // Three distinct phases: rise (tuck) → apex (spread) → fall (extend).
        if (this.state === 'JUMPING') {
            if (this.vel.y < -300) {
                // Rising fast — tuck legs, throw arms up
                const rise = Math.min(1, (-this.vel.y - 300) / 500);
                this.pelvis.y   -= rise * 5;
                this.shoulder.y -= rise * 4;
                this.head.y     -= rise * 3;
                this.kneeL  = new Vec2(-f * 15, lerp(-18, -34, rise));
                this.footL  = new Vec2(-f *  9, lerp(  0, -24, rise));
                this.kneeR  = new Vec2( f * 12, lerp(-18, -28, rise));
                this.footR  = new Vec2( f *  7, lerp(  0, -16, rise));
                this.elbowL = new Vec2(-f * 22, lerp(-57, -72, rise));
                this.handL  = new Vec2(-f * 18, lerp(-34, -88, rise));
                this.elbowR = new Vec2( f * 20, lerp(-57, -74, rise));
                this.handR  = new Vec2( f * 14, lerp(-34, -90, rise));

            } else if (this.vel.y < 100) {
                // Near apex — wide open, slight tuck remaining
                this.kneeL  = new Vec2(-f * 17, -30);
                this.footL  = new Vec2(-f * 11, -18);
                this.kneeR  = new Vec2( f * 13, -26);
                this.footR  = new Vec2( f *  8, -13);
                this.elbowL = new Vec2(-f * 26, -66);
                this.handL  = new Vec2(-f * 30, -82);
                this.elbowR = new Vec2( f * 24, -68);
                this.handR  = new Vec2( f * 28, -84);

            } else {
                // Falling — legs extend down, arms out for balance
                const fall = Math.min(1, (this.vel.y - 100) / 700);
                this.shoulder.y += fall * 2;
                this.kneeL  = new Vec2(-f *  9, lerp(-30, -12, fall));
                this.footL  = new Vec2(-f * 11, lerp(-18,   4, fall));
                this.kneeR  = new Vec2( f *  7, lerp(-26, -12, fall));
                this.footR  = new Vec2( f *  9, lerp(-13,   4, fall));
                this.elbowL = new Vec2(-f * 32, lerp(-66, -58, fall));
                this.handL  = new Vec2(-f * 40, lerp(-82, -48, fall));
                this.elbowR = new Vec2( f * 32, lerp(-68, -58, fall));
                this.handR  = new Vec2( f * 40, lerp(-84, -48, fall));
            }
        }

        // ── DASHING ───────────────────────────────────────────────────────────
        if (this.state === 'DASHING') {
            const dashPhase = (t24 / 0.3) % 1.0;
            const legPhase  = dashPhase * Math.PI * 4; // fast scissor

            // Hard forward lean
            this.pelvis.x   = f *  8;
            this.shoulder.x = f * 15;
            this.head.x     = f * 20;
            this.pelvis.y  -= 4;
            this.shoulder.y -= 3;

            // Lead arm knifes forward
            this.elbowR = new Vec2( f * 30,  -70);
            this.handR  = new Vec2( f * 46,  -73);
            // Rear arm pulled back hard
            this.elbowL = new Vec2(-f * 22,  -55);
            this.handL  = new Vec2(-f * 32,  -46);

            // Legs scissor rapidly
            const rOff  = Math.sin(legPhase)       * 20;
            const lOff  = Math.sin(legPhase + Math.PI) * 20;
            const rLift = Math.max(0, Math.sin(legPhase))       * 8;
            const lLift = Math.max(0, Math.sin(legPhase + Math.PI)) * 8;
            this.footR  = new Vec2( f * (14 + rOff * 0.5),  -rLift);
            this.kneeR  = new Vec2( f * (10 + rOff * 0.25), -18);
            this.footL  = new Vec2(-f * (8  + lOff * 0.5),  -lLift);
            this.kneeL  = new Vec2(-f * (6  + lOff * 0.25), -18);
        }

        // ── BLOCKING ──────────────────────────────────────────────────────────
        if (this.state === 'BLOCKING') {
            const bBreath = Math.sin(t24 * Math.PI * 2 * 0.5) * 1.5;
            // Lower, wider stance
            this.pelvis.y   -= 6;
            this.shoulder.y -= 4;
            this.head.y     -= 2;
            this.shoulder.x  = -f * 2;
            this.kneeL = new Vec2(-f * 13, -23);
            this.footL = new Vec2(-f * 16,   0);
            this.kneeR = new Vec2( f * 13, -23);
            this.footR = new Vec2( f * 16,   0);
            // High guard — both forearms raised
            this.elbowR = new Vec2( f * 16,  -68 + bBreath);
            this.handR  = new Vec2( f * 22,  -84 + bBreath);
            this.elbowL = new Vec2(-f *  6,  -65 + bBreath);
            this.handL  = new Vec2( f *  8,  -82 + bBreath);
        }

        // ── STUNNED ───────────────────────────────────────────────────────────
        if (this.state === 'STUNNED') {
            // Fast head wobble at 8 Hz, slow stagger at 2.5 Hz
            const wobble  = Math.sin(t24 * 8   * Math.PI * 2) * 11;
            const stagger = Math.sin(t24 * 2.5 * Math.PI * 2) * 6;

            this.pelvis.y   -= 4;
            this.pelvis.x   += stagger * 0.4;
            this.head.x     += wobble;
            this.shoulder.x += wobble * 0.45;

            // Arms dangling loose
            this.elbowL = new Vec2(-f * 18 + wobble * 0.4,  -50);
            this.handL  = new Vec2(-f * 22 + wobble * 0.6,  -28);
            this.elbowR = new Vec2( f * 14 + wobble * 0.3,  -48);
            this.handR  = new Vec2( f * 18 + wobble * 0.5,  -26);
            // Feet slightly offset for off-balance look
            this.kneeL  = new Vec2(-f * 12 + stagger * 0.2, -17);
            this.footL  = new Vec2(-f * 15 + stagger * 0.4,   3);
        }

        // ── KNOCKED OUT ───────────────────────────────────────────────────────
        if (this.state === 'KNOCKED_OUT') {
            const fallT = Math.min(1, t24 * 2.2); // 0 → 1 over ~0.45 s

            // Body crumples backward
            this.pelvis   = lerpV(new Vec2(0,       PELVIS_Y),   new Vec2(-f * 12,  -7), fallT);
            this.shoulder = lerpV(new Vec2(0,       SHOULDER_Y), new Vec2(-f * 30,  -6), fallT);
            this.head     = lerpV(new Vec2(0,       HEAD_Y),     new Vec2(-f * 50,  -5), fallT);

            // Arms sprawled out
            this.elbowR = lerpV(new Vec2( f * 14,  -57), new Vec2(-f *  6,  -20), fallT);
            this.handR  = lerpV(new Vec2( f * 16,  -34), new Vec2(-f * 10,    6), fallT);
            this.elbowL = lerpV(new Vec2(-f * 14,  -57), new Vec2( f * 22,  -16), fallT);
            this.handL  = lerpV(new Vec2(-f * 16,  -34), new Vec2( f * 36,    8), fallT);

            // Legs collapse
            this.kneeR  = lerpV(new Vec2( f *  9,  -18), new Vec2( f * 22,  -22), fallT);
            this.footR  = lerpV(new Vec2( f * 11,    0), new Vec2( f * 32,  -10), fallT);
            this.kneeL  = lerpV(new Vec2(-f *  9,  -18), new Vec2(-f *  5,  -26), fallT);
            this.footL  = lerpV(new Vec2(-f * 11,    0), new Vec2( f *  6,  -14), fallT);
        }

        // ─────────────────────────────────────────────────────────────────────
        // ATTACK ANIMATIONS — run AFTER base/movement poses so they fully
        // override whatever the movement system set.
        // ─────────────────────────────────────────────────────────────────────

        // ── SPECIAL ───────────────────────────────────────────────────────────
        if (this.state === 'SPECIAL') {
            const t = this.stateTimer / 0.8;
            if (t < 1) {
                if (this.weapon === 'KATANA') {
                    if (t < 0.5) {
                        const charge = t / 0.5;
                        this.pelvis.y -= charge * 10;
                        this.handR = this.pelvis.add(new Vec2(-20 * f, 0));
                    } else {
                        const release = (t - 0.5) / 0.5;
                        this.handR = this.shoulder.add(new Vec2(80 * f, 0));
                        this.vel.x = f * 3000 * (1 - release);
                        if (release < 0.3) {
                            this.activeAttackCollider = { pos: this.pos.add(new Vec2(50 * f, -35)), radius: 80, type: 'SPECIAL' };
                        }
                    }
                } else if (this.weapon === 'STAFF') {
                    const spin = t * Math.PI * 10;
                    this.handR = this.shoulder.add(new Vec2(Math.cos(spin) * 60, Math.sin(spin) * 60));
                    this.handL = this.shoulder.add(new Vec2(-Math.cos(spin) * 60, -Math.sin(spin) * 60));
                    this.vel.x = f * 300;
                    if (t > 0.1 && t < 0.9) {
                        this.activeAttackCollider = { pos: this.pos.add(new Vec2(0, -35)), radius: 100, type: 'SPECIAL' };
                    }
                } else {
                    // Unarmed flurry
                    if (t < 0.5) {
                        const charge = t / 0.5;
                        this.pelvis.y   -= charge * 20;
                        this.shoulder.y -= charge * 10;
                        this.handR = this.shoulder.add(new Vec2(-20 * f, -50 * charge));
                        this.handL = this.shoulder.add(new Vec2( 20 * f, -50 * charge));
                        this.head.y -= charge * 15;
                    } else {
                        const release = (t - 0.5) / 0.5;
                        const flurry  = Math.sin(release * Math.PI * 10);
                        this.shoulder.x += flurry * 10 * f;
                        this.handR = this.shoulder.add(new Vec2(60 * f,  flurry * 20));
                        this.handL = this.shoulder.add(new Vec2(40 * f, -flurry * 20));
                        this.vel.x = f * 1500 * (1 - release);
                        if (release < 0.8) {
                            this.activeAttackCollider = { pos: this.handR.add(this.pos), radius: 30, type: 'SPECIAL' };
                        }
                    }
                }
            } else {
                this.setState('IDLE');
            }
        }

        // ── PUNCHING ──────────────────────────────────────────────────────────
        // Three variants: straight jab (0), uppercut (1), body hook (2).
        // Phases: windup → strike → recovery (each with clean 24-fps timing).
        if (this.state === 'PUNCHING') {
            const duration = this.weapon === 'KATANA' ? 0.45 : (this.weapon === 'STAFF' ? 0.4 : 0.3);
            const t = this.stateTimer / duration;
            if (t < 1) {
                let ext = 0, twist = 0;
                if (t < 0.2) {
                    // Windup — pull back
                    ext   = -0.32 * (t / 0.2);
                    twist = -0.22 * (t / 0.2);
                } else if (t < 0.42) {
                    // Strike — snap out
                    const st = (t - 0.2) / 0.22;
                    ext   = -0.32 + 1.35 * Math.sin(st * Math.PI / 2);
                    twist = -0.22 + 0.72 * Math.sin(st * Math.PI / 2);
                } else {
                    // Recovery — ease back
                    const rt = (t - 0.42) / 0.58;
                    ext   = 1.03 * (1 - rt * rt);
                    twist = 0.50 * (1 - rt);
                }

                // Torso rotation into the punch
                this.shoulder.x += twist * 12 * f;
                this.head.x     += twist * 16 * f;
                this.handL.x    -= twist * 10 * f;

                if (this.attackVariant === 0) {
                    // Straight jab
                    this.handR  = this.shoulder.add(new Vec2(52 * ext * f,  0));
                    this.elbowR = this.shoulder.add(new Vec2(26 * ext * f, 10));
                } else if (this.attackVariant === 1) {
                    // Uppercut
                    this.handR  = this.shoulder.add(new Vec2(32 * ext * f, -44 * ext));
                    this.elbowR = this.shoulder.add(new Vec2(16 * ext * f, -12 * ext));
                    this.shoulder.y -= ext * 12;
                } else {
                    // Body hook
                    this.handR  = this.shoulder.add(new Vec2(42 * ext * f, 32 * ext));
                    this.elbowR = this.shoulder.add(new Vec2(26 * ext * f, -8 * ext));
                    this.head.y += ext * 6;
                }

                if (t > 0.2 && t < 0.52) {
                    let r = 11;
                    if (this.weapon === 'KATANA') r = 36;
                    if (this.weapon === 'STAFF')  r = 26;
                    this.activeAttackCollider = { pos: this.handR.add(this.pos), radius: r, type: 'PUNCH' };
                }
            } else {
                const isMoving = Math.abs(this.vel.x) > 20 && this.grounded;
                this.setState(isMoving ? 'RUNNING' : 'IDLE');
            }
        }

        // ── KICKING ───────────────────────────────────────────────────────────
        // Three variants: front kick (0), high roundhouse (1), sweep (2).
        if (this.state === 'KICKING') {
            const duration = this.weapon === 'KATANA' ? 0.6 : (this.weapon === 'STAFF' ? 0.5 : 0.4);
            const t = this.stateTimer / duration;
            if (t < 1) {
                let ext = 0, twist = 0;
                if (t < 0.2) {
                    // Chamber — knee comes up
                    ext   = -0.30 * (t / 0.2);
                    twist = -0.20 * (t / 0.2);
                } else if (t < 0.42) {
                    // Extension — leg snaps out
                    const st = (t - 0.2) / 0.22;
                    ext   = -0.30 + 1.32 * Math.sin(st * Math.PI / 2);
                    twist = -0.20 + 0.72 * Math.sin(st * Math.PI / 2);
                } else {
                    // Recovery — leg retracts
                    const rt = (t - 0.42) / 0.58;
                    ext   = 1.02 * (1 - rt * rt);
                    twist = 0.52 * (1 - rt);
                }

                // Counter-rotation in shoulders for balance
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
                    this.activeAttackCollider = { pos: this.footR.add(this.pos), radius: 13, type: 'KICK' };
                }
            } else {
                const isMoving = Math.abs(this.vel.x) > 20 && this.grounded;
                this.setState(isMoving ? 'RUNNING' : 'IDLE');
            }
        }
    }
}
