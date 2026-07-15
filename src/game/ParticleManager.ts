import { Vec2 } from './MathUtils';

export interface Particle {
    pos: Vec2;
    vel: Vec2;
    life: number;
    maxLife: number;
    size: number;
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

    public spawnPuff(pos: Vec2) {
        for (let i = 0; i < 15; i++) {
            this.particles.push({
                pos: new Vec2(pos.x, pos.y),
                vel: new Vec2((Math.random() - 0.5) * 400, (Math.random() - 0.5) * 400),
                life: 0,
                maxLife: 0.15 + Math.random() * 0.2,
                size: 4 + Math.random() * 8
            });
        }
    }

    public spawnMotionLine(pos: Vec2, length: number, color: string = 'rgba(255,255,255,0.5)') {
        this.motionLines.push({
            pos: new Vec2(pos.x, pos.y),
            length,
            life: 0,
            maxLife: 0.2 + Math.random() * 0.1,
            color
        });
    }

    public update(dt: number) {
        for (let i = this.particles.length - 1; i >= 0; i--) {
            const p = this.particles[i];
            p.pos = p.pos.add(p.vel.mult(dt));
            p.vel = p.vel.mult(0.85); // friction
            p.life += dt;
            if (p.life >= p.maxLife) {
                this.particles.splice(i, 1);
            }
        }
        
        for (let i = this.motionLines.length - 1; i >= 0; i--) {
            const m = this.motionLines[i];
            m.life += dt;
            if (m.life >= m.maxLife) {
                this.motionLines.splice(i, 1);
            }
        }
    }
}
