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

            // 0. Dodge Logic
            if (now > (bot.evadeUntil || 0)) {
                const nearbyBullets = Object.values(this.lobby.bullets).filter(b => {
                    if (b.customData.ownerId === bot.id) return false;
                    const d = Vector.magnitude(Vector.sub(b.position, bot.body.position));
                    return d < 250;
                });

                if (nearbyBullets.length > 0) {
                    bot.evadeUntil = now + 500 + Math.random() * 300;
                    bot.evadeDir = Math.random() > 0.5 ? 1 : -1;
                }
            }

            // 1. Objective Selection
            let target = null;
            let objectivePos = null;
            let minDist = 1500;

            Object.values(this.lobby.players).forEach(p => {
                if (p.id !== bot.id && p.team !== bot.team && p.hp > 0 && !p.hidden) {
                    const d = Vector.magnitude(Vector.sub(p.body.position, bot.body.position));
                    if (d < minDist) {
                        minDist = d;
                        target = p;
                    }
                }
            });

            if (!target) {
                const scrap = Object.values(this.lobby.elements).filter(e => e.type === MATERIALS.SCRAP);
                let minScrapDist = 800;
                scrap.forEach(s => {
                    const d = Vector.magnitude(Vector.sub(s.body.position, bot.body.position));
                    if (d < minScrapDist) {
                        minScrapDist = d;
                        objectivePos = s.body.position;
                    }
                });
            } else {
                objectivePos = target.body.position;
            }

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
            
            bot.inputs.up = isFacing && dist > (target ? 250 : 50);
            bot.inputs.down = !isFacing && dist < 150;

            if (isEvading) {
                bot.inputs.left = bot.evadeDir > 0;
                bot.inputs.right = bot.evadeDir < 0;
                bot.inputs.up = true;
            }

            // 3. Combat Logic
            if (target) {
                bot.inputs.aimAngle = angleToTarget + (Math.random() - 0.5) * 0.1;
                const canSee = this.canSee(bot.body.position, target.body.position, obstacles);
                bot.inputs.shoot = canSee && dist < 600;
                
                if (now > bot.nextWeaponSwap) {
                    bot.currentSlot = (bot.currentSlot + 1) % bot.slots.length;
                    bot.nextWeaponSwap = now + 3000 + Math.random() * 5000;
                }
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
