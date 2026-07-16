import { Stickman } from './Stickman';
import { Vec2 } from './MathUtils';
import { ParticleManager } from './ParticleManager';

export class Renderer {
    constructor(private canvas: HTMLCanvasElement, private ctx: CanvasRenderingContext2D) {}

    render(
        p1: Stickman,
        p2: Stickman,
        particleManager: ParticleManager,
        screenShake: boolean = false,
        parry: boolean = false,
    ) {
        this.ctx.save();

        if (screenShake) {
            this.ctx.translate(
                (Math.random() - 0.5) * 20,
                (Math.random() - 0.5) * 20,
            );
        }

        // ── Background ────────────────────────────────────────────────────────
        this.ctx.fillStyle = '#ff7e67';
        this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);

        this.ctx.fillStyle = '#ffb347';
        this.ctx.beginPath();
        this.ctx.arc(this.canvas.width / 2, 300, 150, 0, Math.PI * 2);
        this.ctx.fill();

        this.ctx.fillStyle = '#8b4513';
        this.ctx.beginPath();
        this.ctx.moveTo(0, 600);
        this.ctx.lineTo(200, 350);
        this.ctx.lineTo(600, 600);
        this.ctx.lineTo(900, 250);
        this.ctx.lineTo(this.canvas.width, 600);
        this.ctx.fill();

        this.ctx.fillStyle = '#1a1a1a';
        this.ctx.fillRect(0, 600, this.canvas.width, this.canvas.height - 600);

        // ── Motion lines ──────────────────────────────────────────────────────
        for (const m of particleManager.motionLines) {
            const alpha = 1 - m.life / m.maxLife;
            this.ctx.globalAlpha = alpha;
            this.ctx.strokeStyle = m.color;
            this.ctx.lineWidth   = 4;
            this.ctx.beginPath();
            this.ctx.moveTo(m.pos.x, m.pos.y);
            this.ctx.lineTo(m.pos.x + m.length, m.pos.y);
            this.ctx.stroke();
        }
        this.ctx.globalAlpha = 1;

        // ── Characters ────────────────────────────────────────────────────────
        this.drawStickman(p1, '#3b82f6');
        this.drawStickman(p2, '#ef4444');

        // ── Particles ─────────────────────────────────────────────────────────
        this.ctx.save();
        this.ctx.lineCap = 'round';
        for (const p of particleManager.particles) {
            const t     = p.life / p.maxLife;   // 0 → 1 (ageing)
            const alpha = 1 - t;
            this.ctx.globalAlpha = alpha;

            if (p.isSpark) {
                // Velocity-oriented streak
                const vx  = p.vel.x, vy = p.vel.y;
                const mag = Math.sqrt(vx * vx + vy * vy);
                if (mag > 5) {
                    const nx  = vx / mag, ny = vy / mag;
                    const len = Math.min(mag * 0.036, 14) * (1 - t * 0.5);
                    this.ctx.strokeStyle = p.color;
                    this.ctx.lineWidth   = Math.max(0.5, p.size * (1 - t * 0.6));
                    this.ctx.beginPath();
                    this.ctx.moveTo(p.pos.x - nx * len * 0.3, p.pos.y - ny * len * 0.3);
                    this.ctx.lineTo(p.pos.x + nx * len,       p.pos.y + ny * len);
                    this.ctx.stroke();
                }
            } else {
                // Circle
                this.ctx.fillStyle = p.color;
                this.ctx.beginPath();
                this.ctx.arc(
                    p.pos.x, p.pos.y,
                    Math.max(0.5, p.size * (1 - t * 0.4)),
                    0, Math.PI * 2,
                );
                this.ctx.fill();
            }
        }
        this.ctx.globalAlpha = 1;
        this.ctx.restore();

        this.ctx.restore(); // un-shake before HUD

        if (parry) {
            this.ctx.fillStyle = 'rgba(255,255,255,0.8)';
            this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
        }

        this.drawHUD(p1, p2);
    }

    private drawStickman(s: Stickman, color: string) {
        // ── Block shield background glow (drawn behind body) ──────────────────
        if (s.state === 'BLOCKING') {
            const cx    = s.pos.x;
            const cy    = s.pos.y - 60;
            const pulse = Math.sin(s.stateTimer * 8) * 0.08 + 0.24;
            const grad  = this.ctx.createRadialGradient(cx, cy, 8, cx, cy, 72);
            grad.addColorStop(0,   `rgba(6,182,212,${(pulse * 1.6).toFixed(2)})`);
            grad.addColorStop(0.5, `rgba(6,182,212,${(pulse * 0.7).toFixed(2)})`);
            grad.addColorStop(1,   'rgba(6,182,212,0)');
            this.ctx.fillStyle = grad;
            this.ctx.beginPath();
            this.ctx.arc(cx, cy, 72, 0, Math.PI * 2);
            this.ctx.fill();
        }

        // ── Body ──────────────────────────────────────────────────────────────
        this.ctx.strokeStyle = color;
        this.ctx.lineWidth   = 5;
        this.ctx.lineCap     = 'round';
        this.ctx.lineJoin    = 'round';

        const px = s.pos.x, py = s.pos.y;
        const line = (a: Vec2, b: Vec2) => {
            this.ctx.beginPath();
            this.ctx.moveTo(px + a.x, py + a.y);
            this.ctx.lineTo(px + b.x, py + b.y);
            this.ctx.stroke();
        };

        line(s.head, s.pelvis);
        line(s.shoulder, s.elbowL); line(s.elbowL, s.handL);
        line(s.shoulder, s.elbowR); line(s.elbowR, s.handR);
        line(s.pelvis,   s.kneeL);  line(s.kneeL,  s.footL);
        line(s.pelvis,   s.kneeR);  line(s.kneeR,  s.footR);

        // Head
        this.ctx.beginPath();
        this.ctx.arc(px + s.head.x, py + s.head.y, 14, 0, Math.PI * 2);
        this.ctx.fillStyle = color;
        this.ctx.fill();

        // Weapon
        if (s.weapon === 'KATANA') {
            this.ctx.strokeStyle = '#cbd5e1';
            this.ctx.lineWidth   = 4;
            line(s.handR, s.handR.add(new Vec2(50 * s.facing, -10)));
        } else if (s.weapon === 'STAFF') {
            this.ctx.strokeStyle = '#78350f';
            this.ctx.lineWidth   = 6;
            const staffDir = s.handL.sub(s.handR).normalize();
            let dx = staffDir.x, dy = staffDir.y;
            if (s.handL.dist(s.handR) < 5) { dx = 0.2 * s.facing; dy = -1; }
            const len = 70;
            let p1 = s.handR.add(new Vec2(-len * dy, len * dx));
            let p2 = s.handR.add(new Vec2( len * dy, -len * dx));
            if (s.state === 'SPECIAL' && s.stateTimer > 0.35) {
                // During slam show staff angled downward
                p1 = s.handR.add(new Vec2(-20 * s.facing,  -50));
                p2 = s.handR.add(new Vec2( 20 * s.facing,   50));
            }
            line(p1.sub(s.pos), p2.sub(s.pos));
        }

        // Attack collider hint
        if (s.activeAttackCollider) {
            this.ctx.beginPath();
            this.ctx.arc(
                s.activeAttackCollider.pos.x, s.activeAttackCollider.pos.y,
                s.activeAttackCollider.radius, 0, Math.PI * 2,
            );
            this.ctx.fillStyle = 'rgba(255,255,255,0.15)';
            this.ctx.fill();
        }

        // ── Block shield foreground — animated concentric rings ───────────────
        if (s.state === 'BLOCKING') {
            const cx = s.pos.x, cy = s.pos.y - 60;
            for (let i = 0; i < 3; i++) {
                const phase  = ((s.stateTimer * 1.8) + (i / 3)) % 1.0;
                const radius = 36 + phase * 44;
                const alpha  = (1 - phase) * 0.88;
                this.ctx.strokeStyle = `rgba(6,182,212,${alpha.toFixed(2)})`;
                this.ctx.lineWidth   = Math.max(0.5, 2.8 * (1 - phase * 0.85));
                this.ctx.beginPath();
                this.ctx.arc(cx, cy, radius, 0, Math.PI * 2);
                this.ctx.stroke();
            }
            // Inner X-guard gleam
            this.ctx.strokeStyle = `rgba(186,230,253,0.35)`;
            this.ctx.lineWidth   = 1.5;
            this.ctx.beginPath();
            this.ctx.arc(cx, cy, 36, 0, Math.PI * 2);
            this.ctx.stroke();
        }

        // State indicators
        if (s.state === 'STUNNED') {
            this.ctx.fillStyle  = '#facc15';
            this.ctx.font       = '20px sans-serif';
            this.ctx.textAlign  = 'center';
            this.ctx.fillText('STUNNED!', px, py - 125);
        }
    }

    private drawHUD(p1: Stickman, p2: Stickman) {
        this.drawHealthBar( 50, 40, 400, 24, p1, false);
        this.drawHealthBar(this.canvas.width - 450, 40, 400, 24, p2, true);
    }

    /** Smooth three-stop colour gradient: green → yellow → red. */
    private healthColor(ratio: number): string {
        const r = Math.max(0, Math.min(1, ratio));
        let red: number, green: number, blue: number;
        if (r > 0.5) {
            // #22c55e → #eab308
            const t = (1 - r) * 2;  // 0=full-green, 1=half-yellow
            red   = Math.round(34  + (234 - 34)  * t);
            green = Math.round(197 + (179 - 197) * t);
            blue  = Math.round(94  + (8   - 94)  * t);
        } else {
            // #eab308 → #ef4444
            const t = 1 - r * 2;    // 0=half-yellow, 1=empty-red
            red   = Math.round(234 + (239 - 234) * t);
            green = Math.round(179 + (68  - 179) * t);
            blue  = Math.round(8   + (68  - 8)   * t);
        }
        return `rgb(${red},${green},${blue})`;
    }

    private drawHealthBar(
        x: number, y: number, w: number, h: number,
        s: Stickman, isRight: boolean,
    ) {
        const align = (width: number) => isRight ? x + w - width : x;

        // Background
        this.ctx.fillStyle   = '#0f172a';
        this.ctx.fillRect(x, y, w, h);
        this.ctx.strokeStyle = '#334155';
        this.ctx.lineWidth   = 3;
        this.ctx.strokeRect(x, y, w, h);

        // Impact (catch-up) layer — white
        const dw = Math.max(0, (s.displayHealth / s.stats.maxHealth) * w);
        this.ctx.fillStyle = '#ffffff';
        this.ctx.fillRect(align(dw), y, dw, h);

        // Instant health — smoothly-interpolated colour
        const healthRatio = s.health / s.stats.maxHealth;
        const cw          = Math.max(0, healthRatio * w);
        this.ctx.fillStyle = this.healthColor(healthRatio);
        this.ctx.fillRect(align(cw), y, cw, h);

        // Hit-flash overlay — white burst that fades quickly
        if (s.healthFlash > 0) {
            this.ctx.globalAlpha = s.healthFlash * 0.6;
            this.ctx.fillStyle   = '#ffffff';
            this.ctx.fillRect(x, y, w, h);
            this.ctx.globalAlpha = 1;
        }

        // Energy meter
        this.ctx.fillStyle = '#0f172a';
        this.ctx.fillRect(x, y + h + 4, w * 0.8, 8);
        const energyFull = s.energy >= s.maxEnergy;
        const energyFlash = energyFull && Math.floor(Date.now() / 100) % 2 === 0;
        this.ctx.fillStyle = energyFlash ? '#bae6fd' : (energyFull ? '#38bdf8' : '#0284c7');
        const ew = Math.max(0, (s.energy / s.maxEnergy) * (w * 0.8));
        this.ctx.fillRect(
            isRight ? x + (w * 0.2) + (w * 0.8) - ew : x,
            y + h + 4, ew, 8,
        );

        // Micro-meters
        if (s.blockCooldown > 0) {
            this.ctx.fillStyle = '#06b6d4';
            const cbW = (s.blockCooldown / 5) * (w * 0.5);
            this.ctx.fillRect(align(cbW), y + h + 16, cbW, 4);
        }
        if (s.stunTimer > 0) {
            this.ctx.fillStyle = '#facc15';
            const stW = (s.stunTimer / 10) * (w * 0.5);
            this.ctx.fillRect(align(stW), y + h + 24, stW, 4);
        }
    }
}
