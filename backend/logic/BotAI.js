import Matter from 'matter-js';
import { MATERIALS, CHASSIS, WEAPON_MODULES } from '../gameConfig.js';

const { Vector, Composite, Query, Body } = Matter;

export class BotAI {
    constructor(lobby) {
        this.lobby = lobby;
    }

    processBots(now) {
        const bots = Object.values(this.lobby.players).filter(p => p.isBot);
        if (bots.length === 0) return;

        const obstacles = Composite.allBodies(this.lobby.engine.world).filter(b => {
            if (b.label === 'bullet') return false;
            if (!b.isSensor) return true;
            if (b.label === 'element') {
                const e = this.lobby.elements[b.elementId];
                if (e && [MATERIALS.FIRE, MATERIALS.ELECTRIC, MATERIALS.ACID, MATERIALS.GAS].includes(e.type)) return true;
            }
            return false;
        });

        bots.forEach(bot => {
            if (bot.hp <= 0 || bot.isActive === false) {
                bot.inputs = { up: false, down: false, left: false, right: false, shoot: false };
                return;
            }

            // --- DIFFICULTY SETTINGS ---
            const diff = bot.botDifficulty || 'NORMAL';
            const settings = {
                'EASY':   { aimError: 0.35, dodgeChance: 0.2, reactionMs: 1200, chaseDist: 400 },
                'NORMAL': { aimError: 0.12, dodgeChance: 0.5, reactionMs: 600,  chaseDist: 600 },
                'HARD':   { aimError: 0.03, dodgeChance: 0.85, reactionMs: 250, chaseDist: 800 }
            }[diff] || { aimError: 0.12, dodgeChance: 0.5, reactionMs: 600, chaseDist: 600 };

            // 0. Dodge Logic (Difficulty-aware)
            if (now > (bot.evadeUntil || 0)) {
                const nearbyBullets = Object.values(this.lobby.bullets).filter(b => {
                    if (b.customData.ownerId === bot.id) return false;
                    const d = Vector.magnitude(Vector.sub(b.position, bot.body.position));
                    return d < (diff === 'HARD' ? 350 : 250);
                });

                if (nearbyBullets.length > 0 && Math.random() < settings.dodgeChance) {
                    bot.evadeUntil = now + settings.reactionMs + Math.random() * 300;
                    bot.evadeDir = Math.random() > 0.5 ? 1 : -1;
                }
            }

            // 1. Objective Selection
            let target = null;
            let objectivePos = null;
            let minDist = settings.chaseDist;

            // Find nearest enemy
            Object.values(this.lobby.players).forEach(p => {
                if (p.id !== bot.id && p.team !== bot.team && p.hp > 0 && !p.hidden) {
                    const d = Vector.magnitude(Vector.sub(p.body.position, bot.body.position));
                    if (d < minDist) {
                        minDist = d;
                        target = p;
                    }
                }
            });

            // If no target or bot is low on scrap/healthy, look for scrap
            const needsScrap = bot.scrap < 200 || (!target && bot.scrap < 500);
            if (needsScrap) {
                const scrap = Object.values(this.lobby.elements).filter(e => e.type === MATERIALS.SCRAP);
                let minScrapDist = target ? 200 : 1000; // Only deviate for very close scrap if fighting
                scrap.forEach(s => {
                    const d = Vector.magnitude(Vector.sub(s.body.position, bot.body.position));
                    if (d < minScrapDist) {
                        minScrapDist = d;
                        objectivePos = s.body.position;
                    }
                });
            }

            if (target && !objectivePos) {
                objectivePos = target.body.position;
            }

            // Idle target if nothing to do
            if (!objectivePos) {
                if (Math.random() > 0.98 || !bot.idleTarget) {
                    bot.idleTarget = {
                        x: 200 + Math.random() * (this.lobby.worldSize - 400),
                        y: 200 + Math.random() * (this.lobby.worldSize - 400)
                    };
                }
                objectivePos = bot.idleTarget;
            }

            // 2. Navigation & Steering
            const dist = Vector.magnitude(Vector.sub(objectivePos, bot.body.position));
            const angleToTarget = Math.atan2(objectivePos.y - bot.body.position.y, objectivePos.x - bot.body.position.x);
            let angleDiff = angleToTarget - bot.body.angle;
            while (angleDiff > Math.PI) angleDiff -= Math.PI * 2;
            while (angleDiff < -Math.PI) angleDiff += Math.PI * 2;

            bot.inputs.left = angleDiff < -0.15;
            bot.inputs.right = angleDiff > 0.15;
            
            const isFacing = Math.abs(angleDiff) < 0.8;
            const isEvading = now < bot.evadeUntil;
            
            bot.inputs.up = isFacing && dist > (target ? 200 : 50);
            bot.inputs.down = !isFacing && dist < 120;

            if (isEvading) {
                bot.inputs.left = bot.evadeDir > 0;
                bot.inputs.right = bot.evadeDir < 0;
                bot.inputs.up = true;
            }

            // 3. Combat & Weapon Logic
            if (target) {
                // Better weapon selection based on distance
                if (now > (bot.nextWeaponSwap || 0)) {
                    const targetDist = Vector.magnitude(Vector.sub(target.body.position, bot.body.position));
                    
                    // Logic: Pick weapon best for current distance
                    let bestSlot = bot.currentSlot;
                    bot.slots.forEach((mod, idx) => {
                        const weapon = WEAPON_MODULES[mod];
                        if (!weapon) return;
                        
                        // Scoring weapons (simplified)
                        if (targetDist < 250 && (mod === 'TESLA' || mod === 'FLAMETHROWER' || mod === 'SHOTGUN')) bestSlot = idx;
                        else if (targetDist > 400 && (mod === 'HEAVY_GUN' || mod === 'SNIPER')) bestSlot = idx;
                    });
                    
                    bot.currentSlot = bestSlot;
                    bot.nextWeaponSwap = now + 2000 + Math.random() * 3000;
                }

                bot.inputs.aimAngle = angleToTarget + (Math.random() - 0.5) * settings.aimError;
                const canSee = this.canSee(bot.body.position, target.body.position, obstacles);
                bot.inputs.shoot = canSee && dist < settings.chaseDist;
            } else {
                bot.inputs.shoot = false;
                bot.inputs.aimAngle = bot.body.angle;
            }

            // 4. Stuck Detection
            if (bot.inputs.up && Vector.magnitude(bot.body.velocity) < 0.5) {
                bot.stuckTicks = (bot.stuckTicks || 0) + 1;
                if (bot.stuckTicks > 30) {
                    bot.inputs.up = false;
                    bot.inputs.down = true;
                    bot.inputs.left = Math.random() > 0.5;
                    bot.inputs.right = !bot.inputs.left;
                }
            } else {
                bot.stuckTicks = 0;
            }
        });
    }

    canSee(posA, posB, obstacles) {
        const ray = Query.ray(obstacles, posA, posB);
        return ray.length === 0;
    }
}
