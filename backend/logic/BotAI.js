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

        // Obstacles for raycasting (Local Avoidance)
        const localObstacles = Composite.allBodies(this.lobby.engine.world).filter(b => {
            if (b.label === 'bullet') return false;
            if (!b.isSensor) return true;
            if (b.label === 'element') {
                const e = this.lobby.elements[b.elementId];
                if (e && [MATERIALS.FIRE, MATERIALS.ELECTRIC, MATERIALS.ACID, MATERIALS.GAS].includes(e.type)) return true;
                if (e && e.type === MATERIALS.BUILDING) return true;
            }
            return false;
        });

        bots.forEach(bot => {
            if (bot.hp <= 0 || bot.isActive === false) {
                bot.inputs = { up: false, down: false, left: false, right: false, shoot: false, aimAngle: bot.body.angle };
                return;
            }

            const now = Date.now();
            const diff = bot.botDifficulty || 'NORMAL';
            const settings = {
                'EASY':   { aimError: 0.25, leadMult: 0.3, dodgeChance: 0.3, reactionMs: 1000, strafeFreq: 0.01 },
                'NORMAL': { aimError: 0.10, leadMult: 0.7, dodgeChance: 0.6, reactionMs: 500,  strafeFreq: 0.03 },
                'HARD':   { aimError: 0.02, leadMult: 1.0, dodgeChance: 0.9, reactionMs: 200,  strafeFreq: 0.08 }
            }[diff] || { aimError: 0.10, leadMult: 0.7, dodgeChance: 0.6, reactionMs: 500, strafeFreq: 0.03 };

            // 0. Objective Selection (Targeting)
            let target = null;
            let minDist = 1500;
            Object.values(this.lobby.players).forEach(p => {
                if (p.id !== bot.id && p.team !== bot.team && p.hp > 0 && !p.hidden) {
                    const d = Vector.magnitude(Vector.sub(p.body.position, bot.body.position));
                    if (d < minDist) {
                        if (diff === 'HARD' && p.hp < 40 && d < 1200) { target = p; minDist = d; }
                        else if (!target || d < minDist) { target = p; minDist = d; }
                    }
                }
            });

            // 1. Pathfinding Logic
            if (target) {
                const distToTarget = Vector.magnitude(Vector.sub(target.body.position, bot.body.position));
                
                // Recalculate path if target moved far or path is old
                if (distToTarget > 250 && (!bot.path || bot.path.length === 0 || now - bot.lastPathUpdate > 1200)) {
                    let newPath = this.lobby.navGrid.findPath(bot.body.position, target.body.position);
                    if (newPath) {
                        // String Pulling / Path Smoothing
                        bot.path = this.smoothPath(bot.body.position, newPath, localObstacles);
                        bot.lastPathUpdate = now;
                    }
                }

                // If we have a path, follow it
                if (bot.path && bot.path.length > 0) {
                    let nextNode = bot.path[0];
                    let distToNode = Vector.magnitude(Vector.sub(nextNode, bot.body.position));
                    
                    // LOS Check to further nodes to skip intermediate steps
                    if (bot.path.length > 1) {
                        for (let i = Math.min(bot.path.length - 1, 3); i > 0; i--) {
                            if (this.canSee(bot.body, { position: bot.path[i] }, localObstacles)) {
                                bot.path.splice(0, i);
                                nextNode = bot.path[0];
                                distToNode = Vector.magnitude(Vector.sub(nextNode, bot.body.position));
                                break;
                            }
                        }
                    }

                    if (distToNode < 60) {
                        bot.path.shift();
                    }
                    bot.pathObjective = nextNode || target.body.position;
                } else {
                    bot.pathObjective = target.body.position;
                }
            } else {
                bot.path = [];
                if (Math.random() > 0.99 || !bot.idleTarget) {
                    bot.idleTarget = { x: 300 + Math.random() * (this.lobby.worldSize - 600), y: 300 + Math.random() * (this.lobby.worldSize - 600) };
                }
                bot.pathObjective = bot.idleTarget;
            }

            // 2. Navigation & Steering
            const objectivePos = bot.pathObjective || bot.body.position;
            const dist = Vector.magnitude(Vector.sub(objectivePos, bot.body.position));
            const angleToPos = Math.atan2(objectivePos.y - bot.body.position.y, objectivePos.x - bot.body.position.x);
            let angleDiff = angleToPos - bot.body.angle;
            while (angleDiff > Math.PI) angleDiff -= Math.PI * 2;
            while (angleDiff < -Math.PI) angleDiff += Math.PI * 2;

            bot.inputs.left = angleDiff < -0.15;
            bot.inputs.right = angleDiff > 0.15;

            // Triple-Raycast Obstacle Avoidance (Now with wider spread for cornering)
            const rayDist = 130;
            const spread = 0.7;
            const centerRay = Vector.add(bot.body.position, Vector.mult(Vector.create(Math.cos(bot.body.angle), Math.sin(bot.body.angle)), rayDist));
            const leftRay = Vector.add(bot.body.position, Vector.mult(Vector.create(Math.cos(bot.body.angle - spread), Math.sin(bot.body.angle - spread)), rayDist));
            const rightRay = Vector.add(bot.body.position, Vector.mult(Vector.create(Math.cos(bot.body.angle + spread), Math.sin(bot.body.angle + spread)), rayDist));

            const hitC = Query.point(localObstacles, centerRay).length > 0;
            const hitL = Query.point(localObstacles, leftRay).length > 0;
            const hitR = Query.point(localObstacles, rightRay).length > 0;

            const isRecovering = (bot.recoveryUntil || 0) > now;

            if (isRecovering) {
                bot.inputs.up = false;
                bot.inputs.down = true;
                bot.inputs.left = bot.recoveryDir > 0;
                bot.inputs.right = bot.recoveryDir < 0;
            } else if (hitC || hitL || hitR) {
                if (hitL && !hitR) { bot.inputs.right = true; bot.inputs.left = false; }
                else if (hitR && !hitL) { bot.inputs.left = true; bot.inputs.right = false; }
                else {
                    bot.inputs.up = false;
                    bot.inputs.down = true;
                    bot.inputs.left = Math.random() > 0.5;
                    bot.inputs.right = !bot.inputs.left;
                }
            } else {
                let idealDist = 250;
                const currentWeapon = bot.slots[bot.currentSlot];
                if (['TESLA', 'FLAMETHROWER'].includes(currentWeapon)) idealDist = 130;
                if (['HEAVY_GUN', 'SNIPER'].includes(currentWeapon)) idealDist = 500;

                const isFacing = Math.abs(angleDiff) < 0.6;
                const isVeryCloseToObjective = dist < 70;

                if (target && dist < 300) {
                    const tDist = Vector.magnitude(Vector.sub(target.body.position, bot.body.position));
                    bot.inputs.up = isFacing && tDist > idealDist + 50;
                    bot.inputs.down = isFacing && tDist < idealDist - 50 && bot.chassis !== 'BRAWLER';
                    
                    if (Math.random() < settings.strafeFreq) bot.strafeDir = Math.random() > 0.5 ? 1 : -1;
                    if (tDist < idealDist + 200) {
                        if (bot.strafeDir > 0) bot.inputs.right = true; else bot.inputs.left = true;
                    }
                } else {
                    bot.inputs.up = isFacing && !isVeryCloseToObjective;
                    bot.inputs.down = !isFacing && dist < 120;
                }
            }

            // 3. Combat Logic
            if (target) {
                const tDist = Vector.magnitude(Vector.sub(target.body.position, bot.body.position));
                const weapon = WEAPON_MODULES[bot.slots[bot.currentSlot]] || { speed: 12 };
                const predicted = this.predictTargetPosition(bot.body.position, target.body.position, target.body.velocity, weapon.speed);
                const aimTarget = {
                    x: target.body.position.x + (predicted.x - target.body.position.x) * settings.leadMult,
                    y: target.body.position.y + (predicted.y - target.body.position.y) * settings.leadMult
                };
                
                const aimAngle = Math.atan2(aimTarget.y - bot.body.position.y, aimTarget.x - bot.body.position.x);
                bot.inputs.aimAngle = aimAngle + (Math.random() - 0.5) * settings.aimError;
                
                const canSee = this.canSee(bot.body, target.body, localObstacles);
                bot.inputs.shoot = canSee && tDist < 850;

                if (now > (bot.evadeUntil || 0)) {
                    const bullets = Object.values(this.lobby.bullets).filter(b => b.customData.ownerId !== bot.id && Vector.magnitude(Vector.sub(b.position, bot.body.position)) < 250);
                    if (bullets.length > 0 && Math.random() < settings.dodgeChance) {
                        bot.evadeUntil = now + 600;
                        bot.evadeDir = Math.random() > 0.5 ? 1 : -1;
                    }
                }
                if (now < bot.evadeUntil) {
                    if (bot.evadeDir > 0) bot.inputs.right = true; else bot.inputs.left = true;
                }
            } else {
                bot.inputs.shoot = false;
                bot.inputs.aimAngle = bot.body.angle;
            }

            // 4. Stuck Detection & Recovery
            const speed = Vector.magnitude(bot.body.velocity);
            if ((bot.inputs.up || bot.inputs.down) && speed < 0.2) {
                bot.stuckTicks = (bot.stuckTicks || 0) + 1;
                if (bot.stuckTicks > 50) {
                    bot.recoveryUntil = now + 800;
                    bot.recoveryDir = Math.random() > 0.5 ? 1 : -1;
                    bot.path = []; // Force rebuild
                    bot.stuckTicks = 0;
                }
            } else {
                bot.stuckTicks = 0;
            }
        });
    }

    smoothPath(startPos, path, obstacles) {
        if (!path || path.length < 2) return path;
        // Simple string pulling: if we can see further, skip intermediate nodes
        const result = [];
        let current = startPos;
        for (let i = 0; i < path.length; i++) {
            if (i === path.length - 1) {
                result.push(path[i]);
                break;
            }
            // Check if we can see the NEXT node from current
            if (!this.canSee({ position: current }, { position: path[i+1] }, obstacles)) {
                result.push(path[i]);
                current = path[i];
            }
        }
        return result;
    }

    predictTargetPosition(shooterPos, targetPos, targetVel, bulletSpeed) {
        if (bulletSpeed <= 0) return targetPos;
        const dx = targetPos.x - shooterPos.x, dy = targetPos.y - shooterPos.y, vx = targetVel.x, vy = targetVel.y;
        const a = vx * vx + vy * vy - bulletSpeed * bulletSpeed, b = 2 * (dx * vx + dy * vy), c = dx * dx + dy * dy;
        const disc = b * b - 4 * a * c;
        if (disc < 0) return targetPos;
        const t1 = (-b + Math.sqrt(disc)) / (2 * a), t2 = (-b - Math.sqrt(disc)) / (2 * a);
        let t = t1 > 0 && t2 > 0 ? Math.min(t1, t2) : (t1 > 0 ? t1 : (t2 > 0 ? t2 : -1));
        if (t < 0 || t > 2.5) return targetPos;
        return { x: targetPos.x + vx * t, y: targetPos.y + vy * t };
    }

    canSee(botBody, targetBody, obstacles) {
        const ray = Query.ray(obstacles, botBody.position, targetBody.position);
        return !ray.some(hit => hit.body !== botBody && hit.body !== targetBody);
    }
}
