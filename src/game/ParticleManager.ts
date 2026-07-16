import { Vec2 } from './MathUtils';

export interface Particle {
    pos: Vec2;
    vel: Vec2;
    life: number;
    maxLife: number;
    size: number;
    color: string;
    isSpark: boolean;   // true → draw as velocity-oriented line; false → circle
}

export interface MotionLine {
    pos: Vec2;
    length: number;
    life: number;
    maxLife: number;
    color: string;
}

export class ParticleManager {
    public particles: Particle[] = [];
    public motionLines: MotionLine[] = [];

    /** Legacy puff — white circles (kept for compat) */
    public spawnPuff(pos: Vec2) {
        for (let i = 0; i < 10; i++) {
            const angle = Math.random() * Math.PI * 2;
            const speed = 150 + Math.random() * 220;
            this.particles.push({
                pos: new Vec2(pos.x, pos.y),
                vel: new Vec2(Math.cos(angle) * speed, Math.sin(angle) * speed),
                life: 0,
                maxLife: 0.10 + Math.random() * 0.12,
                size: 3 + Math.random() * 5,
                color: '#ffffff',
                isSpark: false,
            });
        }
    }

    /** Coloured impact sparks — streaks that shoot outward from the hit point. */
    public spawnHitSparks(pos: Vec2, color: string, isHeavy: boolean) {
        const count = isHeavy ? 22 : 13;
        const speed = isHeavy ? 580 : 330;

        for (let i = 0; i < count; i++) {
            const angle = Math.random() * Math.PI * 2;
            const v     = speed * (0.35 + Math.random() * 0.65);
            this.particles.push({
                pos:     new Vec2(pos.x, pos.y),
                vel:     new Vec2(Math.cos(angle) * v, Math.sin(angle) * v),
                life:    0,
                maxLife: 0.07 + Math.random() * (isHeavy ? 0.14 : 0.09),
                size:    isHeavy ? 2.5 + Math.random() * 4 : 1.5 + Math.random() * 2.5,
                color,
                isSpark: true,
            });
        }
        // White core flash
        for (let i = 0; i < 5; i++) {
            const angle = Math.random() * Math.PI * 2;
            this.particles.push({
                pos:     new Vec2(pos.x, pos.y),
                vel:     new Vec2(Math.cos(angle) * speed * 0.25, Math.sin(angle) * speed * 0.25),
                life:    0,
                maxLife: 0.06,
                size:    isHeavy ? 5 + Math.random() * 5 : 3 + Math.random() * 3,
                color:   '#ffffff',
                isSpark: false,
            });
        }
    }

    /** Cyan burst for blocks and parries. */
    public spawnBlockBurst(pos: Vec2) {
        for (let i = 0; i < 12; i++) {
            const angle = (i / 12) * Math.PI * 2 + Math.random() * 0.3;
            const speed = 160 + Math.random() * 120;
            this.particles.push({
                pos:     new Vec2(pos.x, pos.y),
                vel:     new Vec2(Math.cos(angle) * speed, Math.sin(angle) * speed),
                life:    0,
                maxLife: 0.18 + Math.random() * 0.08,
                size:    4 + Math.random() * 4,
                color:   i % 2 === 0 ? '#06b6d4' : '#bae6fd',
                isSpark: true,
            });
        }
        // Small white core
        for (let i = 0; i < 4; i++) {
            const angle = Math.random() * Math.PI * 2;
            this.particles.push({
                pos:     new Vec2(pos.x, pos.y),
                vel:     new Vec2(Math.cos(angle) * 80, Math.sin(angle) * 80),
                life:    0,
                maxLife: 0.10,
                size:    6 + Math.random() * 4,
                color:   '#ffffff',
                isSpark: false,
            });
        }
    }

    public spawnMotionLine(pos: Vec2, length: number, color: string = 'rgba(255,255,255,0.5)') {
        this.motionLines.push({
            pos:     new Vec2(pos.x, pos.y),
            length,
            life:    0,
            maxLife: 0.18 + Math.random() * 0.08,
            color,
        });
    }

    public update(dt: number) {
        for (let i = this.particles.length - 1; i >= 0; i--) {
            const p = this.particles[i];
            p.pos  = p.pos.add(p.vel.mult(dt));
            p.vel  = p.vel.mult(0.82);
            p.life += dt;
            if (p.life >= p.maxLife) this.particles.splice(i, 1);
        }
        for (let i = this.motionLines.length - 1; i >= 0; i--) {
            const m = this.motionLines[i];
            m.life += dt;
            if (m.life >= m.maxLife) this.motionLines.splice(i, 1);
        }
    }
}
