import { Vec2 } from './MathUtils';
import { CharacterStats, InputState, WeaponType } from './Types';

export type CharacterState = 'IDLE' | 'RUNNING' | 'JUMPING' | 'DASHING' | 'PUNCHING' | 'KICKING' | 'BLOCKING' | 'STUNNED' | 'KNOCKED_OUT' | 'SPECIAL';

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
    
    public hasHit: boolean = false;
    private prevInput: InputState = { dirX: 0, jump: false, punch: false, kick: false, block: false, dash: false, special: false };
    
    // Skeleton joints (relative to pos)
    public head: Vec2 = new Vec2(0,0);
    public shoulder: Vec2 = new Vec2(0,0);
    public pelvis: Vec2 = new Vec2(0,0);
    public elbowL: Vec2 = new Vec2(0,0); public handL: Vec2 = new Vec2(0,0);
    public elbowR: Vec2 = new Vec2(0,0); public handR: Vec2 = new Vec2(0,0);
    public kneeL: Vec2 = new Vec2(0,0); public footL: Vec2 = new Vec2(0,0);
    public kneeR: Vec2 = new Vec2(0,0); public footR: Vec2 = new Vec2(0,0);
    
    public activeAttackCollider: { pos: Vec2, radius: number, type: 'PUNCH' | 'KICK' | 'SPECIAL' } | null = null;

    constructor(x: number, y: number, public stats: CharacterStats, isPlayer1: boolean, weapon: WeaponType = 'UNARMED') {
        this.pos = new Vec2(x, y);
        this.health = stats.maxHealth;
        this.displayHealth = stats.maxHealth;
        this.facing = isPlayer1 ? 1 : -1;
        this.weapon = weapon;
        this.updateAnimation(0); // init skeleton
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
                // Guard break -> stun
                this.setState('STUNNED');
                this.stunTimer = 10;
                this.blockCooldown = 5;
                this.blockHits = 0;
                this.vel = knockback.mult(0.2); // slight push
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
                // Force end attacks if hit
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

        const justJumped = input.jump && !this.prevInput.jump;
        const justPunched = input.punch && !this.prevInput.punch;
        const justKicked = input.kick && !this.prevInput.kick;
        const justDashed = input.dash && !this.prevInput.dash;
        const justSpecial = input.special && !this.prevInput.special;
        this.prevInput = { ...input };

        const canAct = this.state !== 'PUNCHING' && this.state !== 'KICKING' && this.state !== 'DASHING' && this.state !== 'BLOCKING' && this.state !== 'SPECIAL';

        const touchingLeftWall = this.pos.x <= 50;
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
                this.vel.x = this.facing * 1200; // Dash impulse
                this.vel.y = 0; // stop vertical fall if in air
            } else if (justJumped && this.grounded) {
                this.vel.y = -this.stats.jumpForce;
                this.grounded = false;
                this.setState('JUMPING');
            } else if (justJumped && !this.grounded && (touchingLeftWall || touchingRightWall)) {
                this.vel.y = -this.stats.jumpForce * 1.1;
                this.vel.x = touchingLeftWall ? 800 : -800;
                this.facing = touchingLeftWall ? 1 : -1;
                this.setState('JUMPING');
                this.justWallJumped = true;
                setTimeout(() => this.justWallJumped = false, 500);
            }
        } else if (this.state === 'BLOCKING') {
            if (!input.block) {
                this.setState('IDLE');
            }
        }

        // Horizontal movement - possible during attacks!
        if (this.state !== 'BLOCKING' && this.state !== 'DASHING') {
            const targetVelX = input.dirX * this.stats.moveSpeed;
            if (this.grounded) {
                // Smooth ground acceleration/friction
                this.vel.x += (targetVelX - this.vel.x) * 15 * dt;
                
                // Only change to RUNNING if we are IDLE (don't override PUNCHING/KICKING)
                if (Math.abs(this.vel.x) > 20 && this.state === 'IDLE') {
                    this.setState('RUNNING');
                } else if (Math.abs(this.vel.x) <= 20 && this.state === 'RUNNING') {
                    this.setState('IDLE');
                }
            } else {
                // Air control
                this.vel.x += (targetVelX - this.vel.x) * 5 * dt;
            }
        }

        this.updatePhysics(dt);
        this.updateAnimation(dt);
    }

    private updatePhysics(dt: number) {
        this.vel.y += 1800 * dt; // Gravity
        
        if (this.state === 'DASHING') {
            this.vel.y = 0;
        }

        this.pos.x += this.vel.x * dt;
        this.pos.y += this.vel.y * dt;

        const FLOOR_Y = 600;
        if (this.pos.y > FLOOR_Y) {
            this.pos.y = FLOOR_Y;
            this.vel.y = 0;
            this.grounded = true;
            if (this.state === 'JUMPING') this.setState('IDLE');
        } else {
            this.grounded = false;
        }

        if (this.pos.x < 50) this.pos.x = 50;
        if (this.pos.x > 1230) this.pos.x = 1230;
    }

    private updateAnimation(dt: number) {
        const S = 1;
        this.pelvis = new Vec2(0, -35 * S);
        this.shoulder = new Vec2(0, -75 * S);
        this.head = new Vec2(0, -95 * S);
        
        let swing = 0;
        const isMoving = Math.abs(this.vel.x) > 20 && this.grounded;
        
        if (isMoving) {
            swing = Math.sin(this.pos.x * 0.05) * Math.sign(this.facing); // Bidirectional walk cycle based on position
        } else if (this.state === 'DASHING') {
            swing = 1.2;
        } else if (this.state === 'IDLE' || (this.state === 'BLOCKING' && !isMoving)) {
            const breath = Math.sin(this.stateTimer * 3);
            this.shoulder.y += breath * 2;
            this.head.y += breath * 2;
            this.handL.y += breath * 1;
            this.handR.y += breath * 1;
        }
        
        if (this.state === 'JUMPING') {
            if (this.vel.y < 0) {
                // Moving up
                this.kneeL.y -= 10;
                this.footL.y -= 20;
                this.kneeR.y -= 5;
                this.footR.y -= 10;
                this.handL.y -= 20;
                this.handR.y -= 20;
            } else {
                // Falling
                this.kneeL.y -= 5;
                this.footL.y -= 10;
                this.handL.y -= 30;
                this.handR.y -= 30;
            }
        }
        
        if (isMoving || this.state === 'DASHING') {
            this.shoulder.x += 5 * this.facing;
            this.head.x += 8 * this.facing;
        }

        this.elbowL = new Vec2(-15 * this.facing + swing * 10 * this.facing, -50 * S);
        this.handL = new Vec2(-20 * this.facing + swing * 20 * this.facing, -25 * S);
        
        this.elbowR = new Vec2(15 * this.facing - swing * 10 * this.facing, -50 * S);
        this.handR = new Vec2(20 * this.facing - swing * 20 * this.facing, -25 * S);
        
        this.kneeL = new Vec2(-10 * this.facing + swing * -15 * this.facing, -20 * S);
        this.footL = new Vec2(-15 * this.facing + swing * -30 * this.facing, 0);
        
        this.kneeR = new Vec2(10 * this.facing + swing * 15 * this.facing, -20 * S);
        this.footR = new Vec2(15 * this.facing + swing * 30 * this.facing, 0);

        this.activeAttackCollider = null;

        if (this.state === 'SPECIAL') {
            const t = this.stateTimer / 0.8; // Long attack
            if (t < 1) {
                if (this.weapon === 'KATANA') {
                    // Iaijutsu
                    if (t < 0.5) {
                        const charge = t / 0.5;
                        this.pelvis.y -= charge * 10;
                        this.handR = this.pelvis.add(new Vec2(-20 * this.facing, 0));
                    } else {
                        const release = (t - 0.5) / 0.5;
                        this.handR = this.shoulder.add(new Vec2(80 * this.facing, 0));
                        this.vel.x = this.facing * 3000 * (1 - release);
                        if (release < 0.3) {
                            this.activeAttackCollider = { pos: this.pos.add(new Vec2(50 * this.facing, -35)), radius: 80, type: 'SPECIAL' };
                        }
                    }
                } else if (this.weapon === 'STAFF') {
                    // Helicopter Spin
                    const spin = t * Math.PI * 10;
                    this.handR = this.shoulder.add(new Vec2(Math.cos(spin) * 60, Math.sin(spin) * 60));
                    this.handL = this.shoulder.add(new Vec2(-Math.cos(spin) * 60, -Math.sin(spin) * 60));
                    this.vel.x = this.facing * 300;
                    if (t > 0.1 && t < 0.9) {
                        this.activeAttackCollider = { pos: this.pos.add(new Vec2(0, -35)), radius: 100, type: 'SPECIAL' };
                    }
                } else {
                    // Unarmed Flurry
                    if (t < 0.5) {
                        const charge = t / 0.5;
                        this.pelvis.y -= charge * 20;
                        this.shoulder.y -= charge * 10;
                        this.handR = this.shoulder.add(new Vec2(-20 * this.facing, -50 * charge));
                        this.handL = this.shoulder.add(new Vec2(20 * this.facing, -50 * charge));
                        this.head.y -= charge * 15;
                    } else {
                        const release = (t - 0.5) / 0.5;
                        const flurry = Math.sin(release * Math.PI * 10);
                        this.shoulder.x += flurry * 10 * this.facing;
                        this.handR = this.shoulder.add(new Vec2(60 * this.facing, flurry * 20));
                        this.handL = this.shoulder.add(new Vec2(40 * this.facing, -flurry * 20));
                        this.vel.x = this.facing * 1500 * (1 - release);
                        
                        if (release < 0.8) {
                            this.activeAttackCollider = { pos: this.handR.add(this.pos), radius: 30, type: 'SPECIAL' };
                        }
                    }
                }
            } else {
                this.setState('IDLE');
            }
        }

        if (this.state === 'PUNCHING') {
            const duration = this.weapon === 'KATANA' ? 0.45 : (this.weapon === 'STAFF' ? 0.4 : 0.3);
            const t = this.stateTimer / duration;
            if (t < 1) {
                let ext = 0;
                let twist = 0;
                if (t < 0.2) {
                    ext = -0.3 * (t / 0.2); // Anticipation
                    twist = -0.2 * (t / 0.2);
                } else if (t < 0.4) {
                    const st = (t - 0.2) / 0.2;
                    ext = -0.3 + 1.3 * Math.sin(st * Math.PI / 2); // Strike
                    twist = -0.2 + 0.7 * Math.sin(st * Math.PI / 2);
                } else {
                    const rt = (t - 0.4) / 0.6;
                    ext = 1.0 * (1 - rt * rt); // Recovery
                    twist = 0.5 * (1 - rt);
                }
                
                this.shoulder.x += twist * 10 * this.facing;
                this.head.x += twist * 15 * this.facing;
                this.handL.x -= twist * 10 * this.facing;
                
                if (this.attackVariant === 0) {
                    this.handR = this.shoulder.add(new Vec2(50 * ext * this.facing, 0));
                    this.elbowR = this.shoulder.add(new Vec2(25 * ext * this.facing, 10));
                } else if (this.attackVariant === 1) {
                    this.handR = this.shoulder.add(new Vec2(30 * ext * this.facing, -40 * ext));
                    this.elbowR = this.shoulder.add(new Vec2(15 * ext * this.facing, -10 * ext));
                    this.shoulder.y -= ext * 10;
                } else {
                    this.handR = this.shoulder.add(new Vec2(40 * ext * this.facing, 30 * ext));
                    this.elbowR = this.shoulder.add(new Vec2(25 * ext * this.facing, -10 * ext));
                    this.head.y += ext * 5;
                }
                
                if (t > 0.2 && t < 0.5) {
                    let r = 10;
                    if (this.weapon === 'KATANA') r = 35;
                    if (this.weapon === 'STAFF') r = 25;
                    this.activeAttackCollider = { pos: this.handR.add(this.pos), radius: r, type: 'PUNCH' };
                }
            } else {
                this.setState(isMoving ? 'RUNNING' : 'IDLE');
            }
        }
        
        if (this.state === 'KICKING') {
            const duration = this.weapon === 'KATANA' ? 0.6 : (this.weapon === 'STAFF' ? 0.5 : 0.4);
            const t = this.stateTimer / duration;
            if (t < 1) {
                let ext = 0;
                let twist = 0;
                if (t < 0.2) {
                    ext = -0.3 * (t / 0.2); // Anticipation
                    twist = -0.2 * (t / 0.2);
                } else if (t < 0.4) {
                    const st = (t - 0.2) / 0.2;
                    ext = -0.3 + 1.3 * Math.sin(st * Math.PI / 2); // Strike
                    twist = -0.2 + 0.7 * Math.sin(st * Math.PI / 2);
                } else {
                    const rt = (t - 0.4) / 0.6;
                    ext = 1.0 * (1 - rt * rt); // Recovery
                    twist = 0.5 * (1 - rt);
                }
                
                this.shoulder.x -= twist * 10 * this.facing;
                this.head.x -= twist * 15 * this.facing;
                this.handR.x += twist * 10 * this.facing;
                this.handL.x += twist * 10 * this.facing;
                
                if (this.attackVariant === 0) {
                    this.footR = this.pelvis.add(new Vec2(60 * ext * this.facing, -20 * ext));
                    this.kneeR = this.pelvis.add(new Vec2(30 * ext * this.facing, 0));
                } else if (this.attackVariant === 1) {
                    this.footR = this.pelvis.add(new Vec2(40 * ext * this.facing, -60 * ext));
                    this.kneeR = this.pelvis.add(new Vec2(20 * ext * this.facing, -30 * ext));
                    this.pelvis.y -= ext * 5;
                } else {
                    this.footR = this.pelvis.add(new Vec2(50 * ext * this.facing, 20 * ext));
                    this.kneeR = this.pelvis.add(new Vec2(25 * ext * this.facing, 10 * ext));
                    this.pelvis.y += ext * 15;
                    this.shoulder.y += ext * 10;
                }
                
                if (t > 0.2 && t < 0.5) {
                    this.activeAttackCollider = { pos: this.footR.add(this.pos), radius: 12, type: 'KICK' };
                }
            } else {
                this.setState(isMoving ? 'RUNNING' : 'IDLE');
            }
        }

        if (this.state === 'BLOCKING') {
            this.handR = this.shoulder.add(new Vec2(15 * this.facing, -10));
            this.elbowR = this.shoulder.add(new Vec2(10 * this.facing, 10));
            this.handL = this.shoulder.add(new Vec2(20 * this.facing, -5));
        }
        
        if (this.state === 'STUNNED') {
            const wobble = Math.sin(this.stateTimer * 10) * 10;
            this.head.x += wobble;
            this.shoulder.x += wobble / 2;
        }

        if (this.state === 'KNOCKED_OUT') {
            this.pelvis.y = -5;
            this.shoulder.y = -5;
            this.head.y = -5;
            this.shoulder.x = -30 * this.facing;
            this.head.x = -50 * this.facing;
        }
    }
}
