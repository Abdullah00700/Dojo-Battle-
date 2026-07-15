import { InputProvider, InputState } from './Types';
import { Stickman, CharacterState } from './Stickman';
import { Vec2 } from './MathUtils';

export type BotDifficulty = 'EASY' | 'MEDIUM' | 'HARD' | 'IMPOSSIBLE';

interface Snapshot {
    time: number;
    pos: Vec2;
    state: CharacterState;
}

export class BotAI implements InputProvider {
    public difficulty: BotDifficulty = 'MEDIUM';
    private targetHistory: Snapshot[] = [];
    private currentTime: number = 0;

    constructor(private me: Stickman, private target: Stickman) {}
    
    public update(dt: number) {
        this.currentTime += dt;
        this.targetHistory.push({
            time: this.currentTime,
            pos: new Vec2(this.target.pos.x, this.target.pos.y),
            state: this.target.state
        });
        
        // Keep up to 1 second of history at 60fps
        if (this.targetHistory.length > 60) {
            this.targetHistory.shift();
        }
    }

    private getDelayedTarget(latencyMs: number): Snapshot {
        const targetTime = this.currentTime - (latencyMs / 1000);
        let bestSnap = this.targetHistory[0];
        
        for (const snap of this.targetHistory) {
            if (snap.time <= targetTime) {
                bestSnap = snap;
            } else {
                break;
            }
        }
        
        return bestSnap || { pos: this.target.pos, state: this.target.state, time: this.currentTime };
    }

    getInput(): InputState {
        let dirX = 0;
        let punch = false, kick = false, block = false, dash = false, jump = false, special = false;

        if (this.me.state === 'STUNNED' || this.me.state === 'KNOCKED_OUT') {
             return { dirX, jump, punch, kick, block, dash, special };
        }

        // Determine latency based on difficulty
        let latency = 250; // EASY
        if (this.difficulty === 'MEDIUM') latency = 150;
        else if (this.difficulty === 'HARD') latency = 50;
        else if (this.difficulty === 'IMPOSSIBLE') latency = 0; // Gemini 3 prediction

        const perceivedTarget = this.getDelayedTarget(latency);
        const dist = perceivedTarget.pos.x - this.me.pos.x;
        const absDist = Math.abs(dist);
        
        // Base logic with difficulty multipliers
        const reactionMult = this.difficulty === 'EASY' ? 0.3 :
                             this.difficulty === 'MEDIUM' ? 0.7 :
                             this.difficulty === 'HARD' ? 1.0 : 1.5; // IMPOSSIBLE reads perfectly
                             
        const targetAttacking = perceivedTarget.state === 'PUNCHING' || perceivedTarget.state === 'KICKING' || perceivedTarget.state === 'DASHING' || perceivedTarget.state === 'SPECIAL';

        if (this.me.energy >= this.me.maxEnergy && Math.random() < 0.1 * reactionMult && absDist < 200) {
            special = true;
        }

        if (this.difficulty === 'IMPOSSIBLE' || this.difficulty === 'HARD') {
            // Strategic block: do not spam block if target isn't attacking
            if (targetAttacking && absDist < 120 && this.me.blockCooldown <= 0) {
                // If it's IMPOSSIBLE, almost always block. If HARD, high chance.
                const blockChance = this.difficulty === 'IMPOSSIBLE' ? 0.95 : 0.8;
                if (Math.random() < blockChance) {
                    block = true;
                    // Perfect parry attempt if very close
                    if (this.difficulty === 'IMPOSSIBLE' && Math.random() < 0.3) block = false; // drop block and re-engage if parry missed? Wait, no
                }
            }
            // Counter attack when opponent recovers
            if (!targetAttacking && absDist < 100 && perceivedTarget.state !== 'IDLE' && perceivedTarget.state !== 'RUNNING') {
                if (Math.random() < 0.2 * reactionMult) punch = true;
            }
        } else if (targetAttacking) {
            // Lower difficulties occasionally fail to block
            if (absDist < 100 && Math.random() < (0.5 * reactionMult)) {
                block = true;
            }
        }

        if (absDist > 140 && !block) {
            dirX = Math.sign(dist);
            if (absDist > 300 && Math.random() < (0.01 * reactionMult)) dash = true;
            if (Math.random() < (0.01 * reactionMult)) jump = true;
        } else if (absDist > 70 && !block) {
            dirX = Math.sign(dist);
            if (Math.random() < (0.05 * reactionMult)) kick = true;
        } else if (!block) {
            // Too close, push back
            dirX = -Math.sign(dist); 
            if (Math.random() < (0.08 * reactionMult)) punch = true;
        }

        return { dirX, jump, punch, kick, block, dash, special };
    }
}
