import { Stickman } from './Stickman';
import { Vec2 } from './MathUtils';

export interface HitEvent {
    type: 'NORMAL' | 'HEAVY' | 'PARRY';
    pos: Vec2 | null;
}

export class PhysicsEngine {
    static resolveCollisions(p1: Stickman, p2: Stickman): HitEvent[] {
        // Simple pushbox to prevent exact overlap
        const dist = p1.pos.x - p2.pos.x;
        const absDist = Math.abs(dist);
        if (absDist < 40 && Math.abs(p1.pos.y - p2.pos.y) < 100) {
            const overlap = 40 - absDist;
            const push = (overlap / 2) * Math.sign(dist || 1);
            p1.pos.x += push;
            p2.pos.x -= push;
        }

        const events: HitEvent[] = [];
        const h1 = this.checkHit(p1, p2);
        if (h1) events.push(h1);
        const h2 = this.checkHit(p2, p1);
        if (h2) events.push(h2);

        return events;
    }
    
    private static checkHit(attacker: Stickman, defender: Stickman): HitEvent | null {
        if (!attacker.activeAttackCollider || attacker.hasHit) return null;
        
        const attackCircle = attacker.activeAttackCollider;
        
        const hitboxes = [
            { pos: defender.pos.add(defender.head), r: 15, isCrit: true },
            { pos: defender.pos.add(defender.shoulder), r: 15, isCrit: false },
            { pos: defender.pos.add(defender.pelvis), r: 15, isCrit: false },
        ];
        
        for (const box of hitboxes) {
            if (attackCircle.pos.dist(box.pos) < attackCircle.radius + box.r) {
                attacker.hasHit = true;
                
                // Perfect Parry Check
                if (defender.state === 'BLOCKING' && defender.stateTimer < 0.15) {
                    attacker.setState('STUNNED');
                    attacker.stunTimer = 1.5;
                    defender.energy = Math.min(defender.maxEnergy, defender.energy + 25);
                    return {
                        type: 'PARRY',
                        pos: attackCircle.pos
                    };
                }
                
                attacker.comboCount++;
                attacker.comboTimer = 2.0;
                attacker.energy = Math.min(attacker.maxEnergy, attacker.energy + 10);
                
                const isHeavy = attackCircle.type === 'KICK' || attackCircle.type === 'SPECIAL';
                
                let kb = new Vec2(0, 0);
                if (attackCircle.type === 'PUNCH') {
                    kb = new Vec2(400 * attacker.facing, -150);
                } else {
                    if (attacker.stateBeforeAttack === 'RUNNING' || attacker.stateBeforeAttack === 'DASHING') {
                        kb = new Vec2(800 * attacker.facing, -350); // High knockback
                    } else {
                        kb = new Vec2(350 * attacker.facing, -200); // Low knockback
                    }
                }
                
                let damage = attacker.stats.baseDamage;
                const isFalling = !attacker.grounded && attacker.vel.y > 0;
                const isComboCrit = attacker.comboCount % 4 === 0;
                
                let critMulti = 1.0;
                
                if (box.isCrit) critMulti += 0.5;
                if (isFalling) critMulti += 0.5;
                if (isComboCrit) critMulti += 0.5;
                
                damage *= critMulti;
                
                defender.applyDamage(damage, kb, isHeavy);
                return { 
                    type: isHeavy ? 'HEAVY' : 'NORMAL', 
                    pos: attackCircle.pos
                };
            }
        }
        
        return null;
    }
}
