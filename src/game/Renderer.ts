import { Stickman } from './Stickman';
import { Vec2 } from './MathUtils';
import { ParticleManager } from './ParticleManager';

export class Renderer {
    constructor(private canvas: HTMLCanvasElement, private ctx: CanvasRenderingContext2D) {}
    
    render(p1: Stickman, p2: Stickman, particleManager: ParticleManager, screenShake: boolean = false, parry: boolean = false) {
        this.ctx.save();
        
        if (screenShake) {
            const shakeX = (Math.random() - 0.5) * 20;
            const shakeY = (Math.random() - 0.5) * 20;
            this.ctx.translate(shakeX, shakeY);
        }

        // Sunset Silhouette Dojo Background
        this.ctx.fillStyle = '#ff7e67'; // Sunset sky
        this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
        
        // Sun
        this.ctx.fillStyle = '#ffb347';
        this.ctx.beginPath();
        this.ctx.arc(this.canvas.width / 2, 300, 150, 0, Math.PI * 2);
        this.ctx.fill();

        // Mountains
        this.ctx.fillStyle = '#8b4513';
        this.ctx.beginPath();
        this.ctx.moveTo(0, 600);
        this.ctx.lineTo(200, 350);
        this.ctx.lineTo(600, 600);
        this.ctx.lineTo(900, 250);
        this.ctx.lineTo(this.canvas.width, 600);
        this.ctx.fill();

        // Floor Silhouette
        this.ctx.fillStyle = '#1a1a1a'; // Pitch black ground
        this.ctx.fillRect(0, 600, this.canvas.width, this.canvas.height - 600);
        
        // Motion Lines
        for (const m of particleManager.motionLines) {
            this.ctx.strokeStyle = m.color;
            this.ctx.lineWidth = 4;
            this.ctx.beginPath();
            this.ctx.moveTo(m.pos.x, m.pos.y);
            this.ctx.lineTo(m.pos.x + m.length, m.pos.y);
            this.ctx.stroke();
        }

        this.drawStickman(p1, '#3b82f6'); // Blue for P1
        this.drawStickman(p2, '#ef4444'); // Red for P2

        // Draw particles
        for (const p of particleManager.particles) {
            const alpha = 1 - (p.life / p.maxLife);
            this.ctx.fillStyle = `rgba(255, 255, 255, ${alpha})`;
            this.ctx.beginPath();
            this.ctx.arc(p.pos.x, p.pos.y, p.size, 0, Math.PI * 2);
            this.ctx.fill();
        }
        
        this.ctx.restore(); // Restore before drawing HUD

        if (parry) {
            this.ctx.fillStyle = 'rgba(255, 255, 255, 0.8)';
            this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
        }

        this.drawHUD(p1, p2);
    }
    
    private drawStickman(s: Stickman, color: string) {
        this.ctx.strokeStyle = color;
        this.ctx.lineWidth = 5;
        this.ctx.lineCap = 'round';
        this.ctx.lineJoin = 'round';
        
        const drawLine = (p1: Vec2, p2: Vec2) => {
            this.ctx.beginPath();
            this.ctx.moveTo(s.pos.x + p1.x, s.pos.y + p1.y);
            this.ctx.lineTo(s.pos.x + p2.x, s.pos.y + p2.y);
            this.ctx.stroke();
        };
        
        // Body & Limbs
        drawLine(s.head, s.pelvis);
        drawLine(s.shoulder, s.elbowL); drawLine(s.elbowL, s.handL);
        drawLine(s.shoulder, s.elbowR); drawLine(s.elbowR, s.handR);
        drawLine(s.pelvis, s.kneeL); drawLine(s.kneeL, s.footL);
        drawLine(s.pelvis, s.kneeR); drawLine(s.kneeR, s.footR);
        
        // Head
        this.ctx.beginPath();
        this.ctx.arc(s.pos.x + s.head.x, s.pos.y + s.head.y, 14, 0, Math.PI * 2);
        this.ctx.fillStyle = color;
        this.ctx.fill();

        // Weapon
        if (s.weapon === 'KATANA') {
            this.ctx.strokeStyle = '#cbd5e1'; // Silver blade
            this.ctx.lineWidth = 4;
            drawLine(s.handR, s.handR.add(new Vec2(50 * s.facing, -10)));
        } else if (s.weapon === 'STAFF') {
            this.ctx.strokeStyle = '#78350f'; // Dark wood
            this.ctx.lineWidth = 6;
            // Staff held by both hands typically, or centered on right hand
            const staffDir = s.handL.sub(s.handR).normalize();
            // If they are too close, default to vertical-ish
            let dx = staffDir.x;
            let dy = staffDir.y;
            if (s.handL.dist(s.handR) < 5) {
                dx = 0.2 * s.facing;
                dy = -1;
            }
            // Rotate it slightly for effect, just make it a long line centered on handR
            const len = 70;
            // if punching/special, it might be horizontal
            let p1 = s.handR.add(new Vec2(-len * dy, len * dx));
            let p2 = s.handR.add(new Vec2(len * dy, -len * dx));
            
            // special spin
            if (s.state === 'SPECIAL' && s.stateTimer > 0.5) {
                p1 = s.handR.add(new Vec2((Math.random() - 0.5) * 100, (Math.random() - 0.5) * 100));
                p2 = s.handR.add(new Vec2((Math.random() - 0.5) * 100, (Math.random() - 0.5) * 100));
            }

            drawLine(p1.sub(s.pos), p2.sub(s.pos));
        }

        // Attack Collider (Visual Feedback)
        if (s.activeAttackCollider) {
            this.ctx.beginPath();
            this.ctx.arc(s.activeAttackCollider.pos.x, s.activeAttackCollider.pos.y, s.activeAttackCollider.radius, 0, Math.PI*2);
            this.ctx.fillStyle = 'rgba(255, 255, 255, 0.8)';
            this.ctx.fill();
        }

        // Indicators
        if (s.state === 'STUNNED') {
             this.ctx.fillStyle = '#facc15';
             this.ctx.font = '20px sans-serif';
             this.ctx.textAlign = 'center';
             this.ctx.fillText('STUNNED!', s.pos.x, s.pos.y - 120);
        }
        if (s.state === 'BLOCKING') {
             this.ctx.strokeStyle = '#06b6d4';
             this.ctx.lineWidth = 2;
             this.ctx.beginPath();
             this.ctx.arc(s.pos.x, s.pos.y - 45, 65, 0, Math.PI*2);
             this.ctx.stroke();
        }
    }

    private drawHUD(p1: Stickman, p2: Stickman) {
        this.drawHealthBar(50, 40, 400, 24, p1, false);
        this.drawHealthBar(this.canvas.width - 450, 40, 400, 24, p2, true);
    }

    private drawHealthBar(x: number, y: number, w: number, h: number, s: Stickman, isRight: boolean) {
        // Background container
        this.ctx.fillStyle = '#0f172a';
        this.ctx.fillRect(x, y, w, h);
        this.ctx.strokeStyle = '#334155';
        this.ctx.lineWidth = 3;
        this.ctx.strokeRect(x, y, w, h);
        
        // Catch-up / Impact layer
        this.ctx.fillStyle = '#ffffff';
        const dw = Math.max(0, (s.displayHealth / s.stats.maxHealth) * w);
        this.ctx.fillRect(isRight ? x + w - dw : x, y, dw, h);
        
        // Instant Health layer
        const healthRatio = s.health / s.stats.maxHealth;
        this.ctx.fillStyle = healthRatio > 0.5 ? '#22c55e' : (healthRatio > 0.25 ? '#facc15' : '#ef4444');
        const cw = Math.max(0, healthRatio * w);
        this.ctx.fillRect(isRight ? x + w - cw : x, y, cw, h);

        // Energy Meter
        this.ctx.fillStyle = '#0f172a';
        this.ctx.fillRect(x, y + h + 4, w * 0.8, 8);
        this.ctx.fillStyle = s.energy >= s.maxEnergy ? '#38bdf8' : '#0284c7';
        if (s.energy >= s.maxEnergy && Math.floor(Date.now() / 100) % 2 === 0) {
            this.ctx.fillStyle = '#bae6fd'; // Flash when full
        }
        const ew = Math.max(0, (s.energy / s.maxEnergy) * (w * 0.8));
        this.ctx.fillRect(isRight ? x + (w * 0.8) - ew + (w * 0.2) : x, y + h + 4, ew, 8);

        // Cooldown & Stun Micro-meters
        if (s.blockCooldown > 0) {
            this.ctx.fillStyle = '#06b6d4';
            const cbW = (s.blockCooldown / 5) * (w * 0.5);
            this.ctx.fillRect(isRight ? x + w - cbW : x, y + h + 16, cbW, 4);
        }
        if (s.stunTimer > 0) {
            this.ctx.fillStyle = '#facc15';
            const stW = (s.stunTimer / 10) * (w * 0.5);
            this.ctx.fillRect(isRight ? x + w - stW : x, y + h + 24, stW, 4);
        }
    }
}
