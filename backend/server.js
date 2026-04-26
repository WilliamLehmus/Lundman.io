import express from 'express';
import http from 'http';
import { Server } from 'socket.io';
import Matter from 'matter-js';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import { MATERIALS, BIOMES, CHASSIS, WEAPON_MODULES, ALL_WEAPONS } from './gameConfig.js';

// 1. Load Env from Root
dotenv.config();
const __dirname = path.dirname(fileURLToPath(import.meta.url));

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
    cors: {
        origin: ["http://localhost:5173", "http://127.0.0.1:5173"],
        methods: ["GET", "POST"],
        credentials: true
    }
});

// 2. Production Static Serving
if (process.env.NODE_ENV === 'production') {
    app.use(express.static(path.join(__dirname, '../frontend/dist')));
}

const DATA_PATH = path.join(__dirname, 'players.json');
let playerData = {};
try {
    if (fs.existsSync(DATA_PATH)) {
        playerData = JSON.parse(fs.readFileSync(DATA_PATH, 'utf8'));
    }
} catch (e) { console.error('Error loading players:', e); }

function savePlayers() {
    try {
        fs.writeFileSync(DATA_PATH, JSON.stringify(playerData, null, 2));
    } catch (e) { console.error('Error saving players:', e); }
}

const PORT = process.env.PORT || 3000;

app.get('/health', (req, res) => res.send('Server is live!'));

// Physics Aliases
const { Engine, Bodies, Body, Composite, Vector, Events, Query } = Matter;

// Game Constants
const TICK_RATE = 60;
const TANK_SIZE = 45;
const WORLD_SIZE = 4000;
const MIN_PLAYERS = 1;

// Global State
let lobbies = {};

class Lobby {
    constructor(id) {
        this.id = id;
        this.players = {};
        this.active = false;
        this.engine = Engine.create({ gravity: { x: 0, y: 0 } });
        this.bullets = {};
        this.elements = {};
        this.zones = [];
        this.lastBulletId = 0;
        this.lastElementId = 0;
        
        this.generateMap();
        
        const wallThickness = 100;
        const walls = [
            Bodies.rectangle(WORLD_SIZE/2, -wallThickness/2, WORLD_SIZE, wallThickness, { isStatic: true, label: 'wall' }),
            Bodies.rectangle(WORLD_SIZE/2, WORLD_SIZE + wallThickness/2, WORLD_SIZE, wallThickness, { isStatic: true, label: 'wall' }),
            Bodies.rectangle(-wallThickness/2, WORLD_SIZE/2, wallThickness, WORLD_SIZE, { isStatic: true, label: 'wall' }),
            Bodies.rectangle(WORLD_SIZE + wallThickness/2, WORLD_SIZE/2, wallThickness, WORLD_SIZE, { isStatic: true, label: 'wall' })
        ];
        Composite.add(this.engine.world, walls);

        this.handleCollisions();
        this.physicsInterval = setInterval(() => {
            Engine.update(this.engine, 1000 / TICK_RATE);
            this.cleanupElements();
        }, 1000 / TICK_RATE);

        this.syncInterval = setInterval(() => {
            this.broadcastState();
        }, 1000 / 60); // 60Hz sync
    }

    addPlayer(socket, username, chassisType = 'SCOUT') {
        const team = Object.keys(this.players).length % 2 === 0 ? 'blue' : 'pink';
        const startPos = team === 'blue' ? { x: 400, y: WORLD_SIZE/2 } : { x: WORLD_SIZE - 400, y: WORLD_SIZE/2 };
        const config = CHASSIS[chassisType];
        
        const body = Bodies.rectangle(startPos.x, startPos.y, TANK_SIZE, TANK_SIZE, {
            frictionAir: config.speed > 0.005 ? 0.1 : 0.2,
            mass: config.mass,
            label: `tank-${socket.id}`
        });
        
        if (team === 'pink') Body.setAngle(body, Math.PI);
        Composite.add(this.engine.world, body);

        this.players[socket.id] = {
            id: socket.id,
            username,
            team,
            chassis: chassisType,
            hp: config.hp,
            maxHp: config.hp,
            body,
            slots: ALL_WEAPONS.slice(0, config.slots),
            currentSlot: 0,
            lastShot: 0,
            scrap: 0,
            statusEffects: { stun: 0, slip: 0 },
            inputs: { up: false, down: false, left: false, right: false, shoot: false }
        };
    }

    addBot(difficulty = 'NORMAL', pos = null, isActive = true) {
        const id = 'bot-' + Math.random().toString(36).substr(2, 6);
        const botNumber = Object.values(this.players).filter(p => p.isBot).length + 1;
        const username = `BOT_MK${botNumber}_${difficulty}`;
        const chassisType = 'SCOUT'; // Default chassis
        const team = Object.keys(this.players).length % 2 === 0 ? 'blue' : 'pink';
        
        let startPos;
        if (pos) {
            startPos = pos;
        } else {
            startPos = team === 'blue' ? { x: 400, y: WORLD_SIZE/2 } : { x: WORLD_SIZE - 400, y: WORLD_SIZE/2 };
        }
        
        const config = CHASSIS[chassisType];
        
        const body = Bodies.rectangle(startPos.x, startPos.y, TANK_SIZE, TANK_SIZE, {
            frictionAir: config.speed > 0.005 ? 0.1 : 0.2,
            mass: config.mass,
            label: `tank-${id}`
        });
        
        if (team === 'pink' && !pos) Body.setAngle(body, Math.PI);
        Composite.add(this.engine.world, body);

        this.players[id] = {
            id,
            username,
            team,
            chassis: chassisType,
            hp: config.hp,
            maxHp: config.hp,
            body,
            slots: ALL_WEAPONS.slice(0, config.slots),
            currentSlot: 0,
            lastShot: 0,
            scrap: 0,
            statusEffects: { stun: 0, slip: 0 },
            inputs: { up: false, down: false, left: false, right: false, shoot: false },
            isBot: true,
            botDifficulty: difficulty,
            isActive: isActive,
            nextWeaponSwap: 0,
            stuckTicks: 0,
            evadeUntil: 0,
            evadeDir: 1
        };
    }

    removePlayer(socketId) {
        if (this.players[socketId]) {
            Composite.remove(this.engine.world, this.players[socketId].body);
            delete this.players[socketId];
        }
    }

    generateMap() {
        const size = WORLD_SIZE / 2;
        this.zones.push({ x: 0, y: 0, w: size, h: size, type: 'URBAN' });
        this.zones.push({ x: size, y: 0, w: size, h: size, type: 'ICE' });
        this.zones.push({ x: 0, y: size, w: size, h: size, type: 'SWAMP' });
        this.zones.push({ x: size, y: size, w: size, h: size, type: 'DESERT' });

        for (let i = 0; i < 40; i++) {
            const pos = {
                x: Math.random() * (size - 100) + 50,
                y: Math.random() * (size - 100) + 50
            };
            const w = 60 + Math.random() * 100;
            const h = 60 + Math.random() * 100;
            this.spawnBuilding(pos, w, h);
        }
    }

    spawnBuilding(pos, w, h) {
        const id = ++this.lastElementId;
        const body = Bodies.rectangle(pos.x, pos.y, w, h, {
            label: 'element',
            isStatic: true,
            isSensor: false
        });
        body.elementId = id;
        
        this.elements[id] = {
            id,
            body,
            type: MATERIALS.BUILDING,
            hp: 200,
            w, h
        };
        Composite.add(this.engine.world, body);
    }

    handleCollisions() {
        Events.on(this.engine, 'collisionActive', (event) => {
            event.pairs.forEach((pair) => {
                this.processElementInteraction(pair.bodyA, pair.bodyB);
            });
        });

        Events.on(this.engine, 'collisionStart', (event) => {
            event.pairs.forEach((pair) => {
                const bodyA = pair.bodyA;
                const bodyB = pair.bodyB;
                
                if (bodyA.label === 'bullet' || bodyB.label === 'bullet') {
                    const bullet = bodyA.label === 'bullet' ? bodyA : bodyB;
                    const target = bodyA.label === 'bullet' ? bodyB : bodyA;
                    this.processBulletCollision(bullet, target);
                }
            });
        });
    }

    processBulletCollision(bullet, target) {
        const bulletData = bullet.customData;
        if (target.label && target.label.startsWith('tank-')) {
            const targetId = target.label.split('tank-')[1];
            if (targetId !== bulletData.ownerId) {
                const victim = this.players[targetId];
                if (victim) {
                    victim.hp -= bulletData.damage;
                    const forceDir = Vector.normalise(bullet.velocity);
                    Body.applyForce(target, target.position, Vector.mult(forceDir, bulletData.impact));
                    
                    if (bulletData.type === MATERIALS.ELECTRIC) {
                        victim.statusEffects.stun = Date.now() + 1000;
                    }

                    if (victim.hp < victim.maxHp * 0.5) {
                        this.spawnElement(victim.body.position, MATERIALS.OIL, 5000);
                    }

                    this.destroyBullet(bullet.id);
                    if (victim.hp <= 0) this.respawn(victim);
                }
            }
        }
        
        if (target.label === 'element') {
            const element = this.elements[target.elementId];
            if (element && element.hp !== undefined) {
                element.hp -= bulletData.damage;
                if (element.hp <= 0) {
                    if (element.type === MATERIALS.BUILDING) {
                        for (let i = 0; i < 10; i++) {
                            this.spawnElement({
                                x: element.body.position.x + (Math.random() - 0.5) * element.w,
                                y: element.body.position.y + (Math.random() - 0.5) * element.h
                            }, MATERIALS.SCRAP, 30000);
                        }
                    }
                    this.destroyElement(target.elementId);
                }
                this.destroyBullet(bullet.id);
            }
        }
        
        if (target.label === 'wall') {
            this.destroyBullet(bullet.id);
        }
    }

    processElementInteraction(bodyA, bodyB) {
        const elementA = bodyA.label === 'element' ? this.elements[bodyA.elementId] : null;
        const elementB = bodyB.label === 'element' ? this.elements[bodyB.elementId] : null;
        const bullet = bodyA.label === 'bullet' ? bodyA : (bodyB.label === 'bullet' ? bodyB : null);
        const pos = bullet ? bullet.position : bodyA.position;

        if ((elementA?.type === MATERIALS.OIL && bullet?.customData.type === MATERIALS.FIRE) ||
            (elementB?.type === MATERIALS.OIL && bullet?.customData.type === MATERIALS.FIRE)) {
            this.spawnElement(pos, MATERIALS.FIRE, 3000, undefined, bullet?.customData.ownerId);
            if (elementA?.type === MATERIALS.OIL) this.destroyElement(elementA.id);
            if (elementB?.type === MATERIALS.OIL) this.destroyElement(elementB.id);
        }

        if ((elementA?.type === MATERIALS.WATER && bullet?.customData.type === MATERIALS.ELECTRIC) ||
            (elementB?.type === MATERIALS.WATER && bullet?.customData.type === MATERIALS.ELECTRIC)) {
            const targetElement = elementA?.type === MATERIALS.WATER ? elementA : elementB;
            targetElement.type = MATERIALS.ELECTRIC;
            targetElement.expiresAt = Date.now() + 2000;
        }

        if ((elementA?.type === MATERIALS.WATER && bullet?.customData.type === MATERIALS.FIRE) ||
            (elementB?.type === MATERIALS.WATER && bullet?.customData.type === MATERIALS.FIRE)) {
            this.spawnElement(pos, MATERIALS.STEAM, 4000);
            if (elementA?.type === MATERIALS.WATER) this.destroyElement(elementA.id);
            if (elementB?.type === MATERIALS.WATER) this.destroyElement(elementB.id);
        }

        if ((elementA?.type === MATERIALS.WATER && bullet?.customData.type === MATERIALS.ICE) ||
            (elementB?.type === MATERIALS.WATER && bullet?.customData.type === MATERIALS.ICE)) {
            const targetElement = elementA?.type === MATERIALS.WATER ? elementA : elementB;
            targetElement.type = MATERIALS.ICE;
        }

        // Alchemy: Fire vs Ice
        if ((elementA?.type === MATERIALS.ICE && bullet?.customData.type === MATERIALS.FIRE) ||
            (elementB?.type === MATERIALS.ICE && bullet?.customData.type === MATERIALS.FIRE)) {
            if (elementA?.type === MATERIALS.ICE) this.destroyElement(elementA.id);
            if (elementB?.type === MATERIALS.ICE) this.destroyElement(elementB.id);
        }

        if (elementA && elementB) {
            if ((elementA.type === MATERIALS.FIRE && elementB.type === MATERIALS.ICE) ||
                (elementB.type === MATERIALS.FIRE && elementA.type === MATERIALS.ICE)) {
                this.destroyElement(elementA.id);
                this.destroyElement(elementB.id);
            }
        }

        const tankBody = bodyA.label.startsWith('tank-') ? bodyA : (bodyB.label.startsWith('tank-') ? bodyB : null);
        const element = elementA || elementB;
        if (tankBody && element) {
            const pId = tankBody.label.split('tank-')[1];
            const p = this.players[pId];
            if (p) {
                if (element.type === MATERIALS.ELECTRIC) p.statusEffects.stun = Date.now() + 500;
                if (element.type === MATERIALS.ICE) p.statusEffects.slip = Date.now() + 1000;
                if (element.type === MATERIALS.FIRE && element.ownerId !== p.id) p.hp -= 0.5;
                if (element.type === MATERIALS.STEAM) p.hidden = true;
                if (element.type === MATERIALS.SCRAP) {
                    p.scrap = Math.min(p.scrap + 10, 500);
                    this.destroyElement(element.id);
                }
                if (p.hp <= 0) this.respawn(p);
            }
        }
    }

    spawnElement(pos, type, duration, hp, ownerId = null) {
        const id = ++this.lastElementId;
        const radius = type === MATERIALS.SCRAP ? 10 : 
                      (type === MATERIALS.OIL || type === MATERIALS.FIRE) ? 20 : 
                      (type === MATERIALS.STEAM ? 40 : 30);
        
        const body = Bodies.circle(pos.x, pos.y, radius, {
            label: 'element',
            isSensor: type !== MATERIALS.DIRT,
            friction: type === MATERIALS.ICE ? 0.001 : 0.5
        });
        body.elementId = id;
        
        this.elements[id] = {
            id,
            body,
            type,
            hp,
            ownerId,
            expiresAt: duration ? Date.now() + duration : null
        };
        Composite.add(this.engine.world, body);
    }

    destroyBullet(id) {
        const b = this.bullets[id];
        if (b) {
            Composite.remove(this.engine.world, b);
            delete this.bullets[id];
        }
    }

    destroyElement(id) {
        const e = this.elements[id];
        if (e) {
            Composite.remove(this.engine.world, e.body);
            delete this.elements[id];
        }
    }

    cleanupElements() {
        const now = Date.now();
        Object.keys(this.elements).forEach(id => {
            const e = this.elements[id];
            if (e.expiresAt && now > e.expiresAt) {
                this.destroyElement(id);
            }
        });
        
        Object.keys(this.bullets).forEach(id => {
            const b = this.bullets[id];
            if (b.customData.expiresAt && now > b.customData.expiresAt) {
                this.destroyBullet(id);
            }
        });
    }

    respawn(player) {
        for (let i = 0; i < 5; i++) {
            this.spawnElement({
                x: player.body.position.x + (Math.random() - 0.5) * 60,
                y: player.body.position.y + (Math.random() - 0.5) * 60
            }, MATERIALS.SCRAP, 30000);
        }
        player.hp = CHASSIS[player.chassis].hp;
        player.scrap = Math.floor(player.scrap / 2);
        const pos = player.team === 'blue' ? { x: 400, y: WORLD_SIZE/2 } : { x: WORLD_SIZE - 400, y: WORLD_SIZE/2 };
        Body.setPosition(player.body, pos);
        Body.setVelocity(player.body, { x: 0, y: 0 });
    }

    update() {
        const now = Date.now();
        this.processBots(now);
        Object.values(this.players).forEach(p => {
            const { inputs, body, chassis, statusEffects } = p;
            const config = CHASSIS[chassis];
            if (now < statusEffects.stun) return;
            p.hidden = false;
            const zone = this.zones.find(z => 
                body.position.x >= z.x && body.position.x <= z.x + z.w &&
                body.position.y >= z.y && body.position.y <= z.y + z.h
            ) || { type: 'URBAN' };
            const biome = BIOMES[zone.type];
            const isIce = now < statusEffects.slip || zone.type === 'ICE';
            const baseFriction = isIce ? 0.01 : biome.friction;
            const friction = config.speed > 0.005 ? baseFriction : baseFriction * 2;
            if (body.frictionAir !== friction) body.frictionAir = friction;
            const moveSpeed = config.speed * biome.speedMult;
            if (inputs.left) Body.setAngularVelocity(body, -config.turnSpeed);
            if (inputs.right) Body.setAngularVelocity(body, config.turnSpeed);
            if (inputs.up) {
                Body.applyForce(body, body.position, {
                    x: Math.cos(body.angle) * moveSpeed,
                    y: Math.sin(body.angle) * moveSpeed
                });
            }
            if (inputs.down) {
                Body.applyForce(body, body.position, {
                    x: -Math.cos(body.angle) * moveSpeed,
                    y: -Math.sin(body.angle) * moveSpeed
                });
            }
            if (inputs.shoot) this.playerShoot(p);
        });
    }

    playerShoot(p) {
        const moduleName = p.slots[p.currentSlot];
        const baseWeapon = WEAPON_MODULES[moduleName];
        const now = Date.now();
        const buffFactor = 1 + (p.scrap / 100);
        const reloadFactor = 1 / (1 + p.scrap / 200);
        const weapon = {
            ...baseWeapon,
            damage: baseWeapon.damage * buffFactor,
            reload: baseWeapon.reload * reloadFactor
        };
        if (now - p.lastShot > weapon.reload) {
            this.fire(p, weapon);
            p.lastShot = now;
        }
    }

    processBots(now) {
        Object.values(this.players).filter(p => p.isBot).forEach(bot => {
            if (bot.hp <= 0 || bot.isActive === false) {
                bot.inputs = { up: false, down: false, left: false, right: false, shoot: false };
                return;
            }
            let closestEnemy = null;
            let minDist = Infinity;
            Object.values(this.players).filter(p => p.team !== bot.team && p.hp > 0).forEach(enemy => {
                const dist = Vector.magnitude(Vector.sub(enemy.body.position, bot.body.position));
                if (dist < minDist) {
                    minDist = dist;
                    closestEnemy = enemy;
                }
            });

            if (!closestEnemy) {
                bot.inputs = { up: false, down: false, left: false, right: false, shoot: false };
                return;
            }

            let targetPos = closestEnemy.body.position;

            // HARD: Target Leading
            if (bot.botDifficulty === 'HARD') {
                const weapon = WEAPON_MODULES[bot.slots[bot.currentSlot]];
                const timeToTarget = minDist / (weapon.speed || 10);
                targetPos = {
                    x: targetPos.x + closestEnemy.body.velocity.x * timeToTarget,
                    y: targetPos.y + closestEnemy.body.velocity.y * timeToTarget
                };
            }

            let targetAngle;
            if (bot.ignoreTargetUntil && now < bot.ignoreTargetUntil) {
                // Break out of local minima: ignore the player and just drive forward to escape the trap
                targetAngle = bot.body.angle; 
            } else {
                const dx = targetPos.x - bot.body.position.x;
                const dy = targetPos.y - bot.body.position.y;
                targetAngle = Math.atan2(dy, dx);
            }

            // --- Stuck Detection (Fallback) ---
            if (now < bot.evadeUntil) {
                bot.inputs.up = false;
                bot.inputs.down = true; // Backup
                bot.inputs.left = bot.evadeDir === -1;
                bot.inputs.right = bot.evadeDir === 1;
                bot.inputs.shoot = false;
                return;
            }

            const speed = Vector.magnitude(bot.body.velocity);
            if (bot.inputs.up && speed < 1) {
                bot.stuckTicks = (bot.stuckTicks || 0) + 1;
            } else {
                bot.stuckTicks = 0;
            }

            if (bot.stuckTicks > 30) {
                bot.evadeUntil = now + 1000 + Math.random() * 500;
                bot.evadeDir = Math.random() > 0.5 ? 1 : -1;
                bot.ignoreTargetUntil = bot.evadeUntil + 2000; // Wander away for 2s after evading
                bot.stuckTicks = 0;
            }
            // ---------------------------------

            // --- Potential Field Obstacle Avoidance ---
            const lookAhead = 120; // Shortened slightly to avoid triggering on distant corners
            const obstacles = Composite.allBodies(this.engine.world).filter(b => 
                b !== bot.body && !b.isSensor && b.label !== 'bullet' && !b.label.startsWith('tank-')
            );
            
            // Narrower spread (-23, -11, 0, 11, 23 degrees) so it matches the tank's actual physical width
            // This allows it to "thread the needle" through gaps without being repulsed by the edges.
            const angles = [-0.4, -0.2, 0, 0.2, 0.4];
            let avoidX = 0;
            let avoidY = 0;
            let hitCount = 0;

            for (const offset of angles) {
                const rayAngle = bot.body.angle + offset;
                const rayEnd = {
                    x: bot.body.position.x + Math.cos(rayAngle) * lookAhead,
                    y: bot.body.position.y + Math.sin(rayAngle) * lookAhead
                };
                const hits = Query.ray(obstacles, bot.body.position, rayEnd);
                if (hits.length > 0) {
                    // Center rays have stronger repulsion
                    const weight = Math.abs(offset) < 0.1 ? 4.0 : 2.0;
                    avoidX -= Math.cos(rayAngle) * weight;
                    avoidY -= Math.sin(rayAngle) * weight;
                    hitCount++;
                }
            }

            if (hitCount > 0) {
                if (Math.abs(avoidX) < 0.01 && Math.abs(avoidY) < 0.01) {
                    const forceAngle = bot.body.angle + ((bot.id.charCodeAt(bot.id.length - 1) % 2 === 0) ? Math.PI/2 : -Math.PI/2);
                    avoidX = Math.cos(forceAngle) * 4.0;
                    avoidY = Math.sin(forceAngle) * 4.0;
                }
                
                // Pure vector addition for perfectly smooth steering
                // Target has a constant "pull" of 2.0. Avoidance forces stack up against it.
                const targetPull = 2.0;
                const finalX = Math.cos(targetAngle) * targetPull + avoidX;
                const finalY = Math.sin(targetAngle) * targetPull + avoidY;
                
                targetAngle = Math.atan2(finalY, finalX);
            }
            // -----------------------------------------

            // EASY: Aim Error
            if (bot.botDifficulty === 'EASY') {
                const error = Math.sin(now / 500 + bot.body.id) * 0.5;
                targetAngle += error;
            }

            let angleDiff = targetAngle - bot.body.angle;
            if (!Number.isFinite(angleDiff)) angleDiff = 0;
            angleDiff = Math.atan2(Math.sin(angleDiff), Math.cos(angleDiff));

            const turnThreshold = bot.botDifficulty === 'HARD' ? 0.05 : 0.1;

            if (angleDiff > turnThreshold) {
                bot.inputs.right = true; bot.inputs.left = false;
            } else if (angleDiff < -turnThreshold) {
                bot.inputs.left = true; bot.inputs.right = false;
            } else {
                bot.inputs.left = false; bot.inputs.right = false;
            }

            const currentWeapon = WEAPON_MODULES[bot.slots[bot.currentSlot]];
            const idealRange = currentWeapon.type === MATERIALS.FIRE ? 150 : 400;

            if (minDist > idealRange) {
                bot.inputs.up = true; bot.inputs.down = false;
            } else if (minDist < idealRange * 0.5 && bot.botDifficulty !== 'EASY') {
                bot.inputs.down = true; bot.inputs.up = false;
            } else {
                bot.inputs.up = false; bot.inputs.down = false;
            }

            const aimTolerance = bot.botDifficulty === 'HARD' ? 0.1 : (bot.botDifficulty === 'NORMAL' ? 0.3 : 0.5);
            if (Math.abs(angleDiff) < aimTolerance && minDist < idealRange * 1.5) {
                bot.inputs.shoot = bot.botDifficulty === 'EASY' ? Math.random() > 0.5 : true;
            } else {
                bot.inputs.shoot = false;
            }

            if (now > bot.nextWeaponSwap) {
                if (bot.botDifficulty === 'NORMAL' && Math.random() > 0.5) {
                    bot.currentSlot = Math.floor(Math.random() * bot.slots.length);
                } else if (bot.botDifficulty === 'HARD') {
                    if (minDist < 200) {
                        bot.currentSlot = Math.max(0, bot.slots.indexOf('FLAMETHROWER'));
                    } else if (minDist > 500) {
                        bot.currentSlot = Math.max(0, bot.slots.indexOf('STANDARD'));
                    } else {
                        bot.currentSlot = Math.floor(Math.random() * bot.slots.length);
                    }
                }
                bot.nextWeaponSwap = now + 3000 + Math.random() * 2000;
            }
        });
    }

    fire(p, weapon) {
        const id = ++this.lastBulletId;
        const fireDist = weapon.type === MATERIALS.DIRT ? 80 : 45;
        const pos = {
            x: p.body.position.x + Math.cos(p.body.angle) * fireDist,
            y: p.body.position.y + Math.sin(p.body.angle) * fireDist
        };
        const bullet = Bodies.circle(pos.x, pos.y, weapon.radius, {
            label: 'bullet',
            frictionAir: 0,
            mass: 0.1,
            isSensor: weapon.type === MATERIALS.DIRT // Dirt bullets shouldn't collide
        });
        bullet.id = id;
        bullet.customData = { 
            ownerId: p.id, 
            damage: weapon.damage, 
            impact: weapon.impact,
            type: weapon.type,
            expiresAt: Date.now() + (weapon.ttl || 2000)
        };
        Body.setVelocity(bullet, {
            x: Math.cos(p.body.angle) * weapon.speed,
            y: Math.sin(p.body.angle) * weapon.speed
        });
        // Recoil
        const recoil = weapon.recoil || 0;
        if (recoil > 0) {
            Body.applyForce(p.body, p.body.position, {
                x: -Math.cos(p.body.angle) * recoil,
                y: -Math.sin(p.body.angle) * recoil
            });
        }
        this.bullets[id] = bullet;
        Composite.add(this.engine.world, bullet);
        
        if (weapon.type === MATERIALS.DIRT) {
            this.spawnElement(pos, MATERIALS.DIRT, 10000, weapon.hp);
        }
        if (weapon.type === MATERIALS.FIRE) {
            this.spawnElement(pos, MATERIALS.FIRE, 2000, undefined, p.id);
        }
    }

    broadcastState() {
        this.update();
        const state = {
            worldSize: WORLD_SIZE,
            zones: this.zones.map(z => ({ ...z, color: BIOMES[z.type].color })),
            players: Object.values(this.players).map(p => ({
                id: p.id, username: p.username, team: p.team,
                x: p.body.position.x, y: p.body.position.y, angle: p.body.angle,
                hp: p.hp, maxHp: p.maxHp, weapon: p.slots[p.currentSlot],
                currentSlot: p.currentSlot, slots: p.slots, scrap: p.scrap, hidden: p.hidden
            })),
            bullets: Object.values(this.bullets).map(b => ({
                id: b.id, x: b.position.x, y: b.position.y,
                type: b.customData.type, color: this.getElementColor(b.customData.type),
                angle: Math.atan2(b.velocity.y, b.velocity.x)
            })),
            elements: Object.values(this.elements).map(e => ({
                id: e.id, x: e.body.position.x, y: e.body.position.y,
                type: e.type, radius: e.body.circleRadius, w: e.w, h: e.h,
                color: e.type === MATERIALS.SCRAP ? '#ffff00' : 
                       e.type === MATERIALS.OIL ? '#333' : 
                       e.type === MATERIALS.FIRE ? '#ff4400' : 
                       e.type === MATERIALS.WATER ? '#0088ff' : 
                       e.type === MATERIALS.ELECTRIC ? '#00f2ff' : 
                       e.type === MATERIALS.ICE ? '#aaddff' : 
                       e.type === MATERIALS.DIRT ? '#8b4513' : 
                       e.type === MATERIALS.STEAM ? 'rgba(200, 200, 200, 0.4)' : '#fff'
            }))
        };
        io.to(this.id).emit('state', state);
        Object.values(this.bullets).forEach(b => {
            if (b.position.x < -100 || b.position.x > WORLD_SIZE + 100 || 
                b.position.y < -100 || b.position.y > WORLD_SIZE + 100) {
                this.destroyBullet(b.id);
            }
        });
    }

    getElementColor(type) {
        switch(type) {
            case MATERIALS.FIRE: return '#ff4d00';
            case MATERIALS.WATER: return '#00a2ff';
            case MATERIALS.OIL: return '#222222';
            case MATERIALS.ELECTRIC: return '#ffff00';
            case MATERIALS.DIRT: return '#8b4513';
            case MATERIALS.STEAM: return 'rgba(255, 255, 255, 0.3)';
            case MATERIALS.ICE: return '#aaddff';
            default: return '#ffffff';
        }
    }

    destroy() {
        clearInterval(this.physicsInterval);
        clearInterval(this.syncInterval);
    }
}

io.on('connection', (socket) => {
    console.log('User connected:', socket.id);

    if (process.env.ENVIRONMENT === 'development') {
        socket.emit('debug-init');
    }
    socket.on('join-game', (data) => {
        if (!data || typeof data.username !== 'string' || data.username.trim() === '') return;
        let { username, chassisType } = data;
        username = username.trim().substring(0, 12);
        if (!['SCOUT', 'BRAWLER', 'ARTILLERY'].includes(chassisType)) chassisType = 'SCOUT';

        console.log('Join Game request from:', username, 'chassis:', chassisType);
        // Matchmaking: Find lobby with most players that isn't full
        let lobbyList = Object.values(lobbies).filter(l => Object.keys(l.players).length < 10);
        lobbyList.sort((a, b) => Object.keys(b.players).length - Object.keys(a.players).length);
        let bestLobby = lobbyList[0];
        if (!bestLobby) {
            const id = Math.random().toString(36).substring(7);
            bestLobby = new Lobby(id);
            lobbies[id] = bestLobby;
        }
        bestLobby.addPlayer(socket, username, chassisType);
        socket.join(bestLobby.id);
        socket.lobbyId = bestLobby.id;
        if (bestLobby.active) socket.emit('game-started');
        io.to(bestLobby.id).emit('lobby-update', {
            id: bestLobby.id,
            players: Object.values(bestLobby.players).map(p => ({ username: p.username, team: p.team, id: p.id, chassis: p.chassis }))
        });
    });

    socket.on('host-game', (data) => {
        if (!data || typeof data.username !== 'string' || data.username.trim() === '') return;
        let { username, chassisType } = data;
        username = username.trim().substring(0, 12);
        if (!['SCOUT', 'BRAWLER', 'ARTILLERY'].includes(chassisType)) chassisType = 'SCOUT';

        console.log('Host Game request from:', username, 'chassis:', chassisType);
        const id = Math.random().toString(36).substring(7);
        console.log('Created lobby:', id);
        const lobby = new Lobby(id);
        lobbies[id] = lobby;
        lobby.addPlayer(socket, username, chassisType);
        socket.join(id);
        socket.lobbyId = id;
        socket.emit('lobby-update', {
            id, players: Object.values(lobby.players).map(p => ({ username: p.username, team: p.team, id: p.id, chassis: p.chassis }))
        });
    });

    socket.on('add-bot', (data) => {
        const lobby = lobbies[socket.lobbyId];
        if (lobby && Object.keys(lobby.players).length < 10) {
            lobby.addBot(data.difficulty);
            io.to(lobby.id).emit('lobby-update', {
                id: lobby.id,
                players: Object.values(lobby.players).map(p => ({ username: p.username, team: p.team, id: p.id, chassis: p.chassis }))
            });
        }
    });

    socket.on('input', (inputs) => {
        const lobby = lobbies[socket.lobbyId];
        if (lobby && lobby.players[socket.id]) lobby.players[socket.id].inputs = inputs;
    });

    socket.on('switch-weapon', (slotIndex) => {
        const lobby = lobbies[socket.lobbyId];
        if (lobby && lobby.players[socket.id]) {
            const p = lobby.players[socket.id];
            if (slotIndex >= 0 && slotIndex < p.slots.length) p.currentSlot = slotIndex;
        }
    });

    socket.on('start-game', () => {
        const lobby = lobbies[socket.lobbyId];
        if (lobby && Object.keys(lobby.players).length >= MIN_PLAYERS) {
            lobby.active = true;
            io.to(lobby.id).emit('game-started');
        }
    });

    // Debug Listeners
    socket.on('debug-spawn-bot', (data) => {
        if (process.env.ENVIRONMENT !== 'development') return;
        const lobby = lobbies[socket.lobbyId];
        if (lobby) {
            lobby.addBot(data.difficulty || 'NORMAL', data.pos, data.isActive);
        }
    });

    socket.on('debug-toggle-bots', (active) => {
        if (process.env.ENVIRONMENT !== 'development') return;
        const lobby = lobbies[socket.lobbyId];
        if (lobby) {
            Object.values(lobby.players).forEach(p => {
                if (p.isBot) p.isActive = active;
            });
        }
    });

    socket.on('debug-spawn-terrain', (data) => {
        if (process.env.ENVIRONMENT !== 'development') return;
        const lobby = lobbies[socket.lobbyId];
        if (lobby) {
            lobby.spawnBuilding(data.pos, data.w || 100, data.h || 100);
        }
    });

    socket.on('disconnect', () => {
        const lobby = lobbies[socket.lobbyId];
        if (lobby) {
            lobby.removePlayer(socket.id);
            if (Object.values(lobby.players).filter(p => !p.isBot).length === 0) {
                lobby.destroy();
                delete lobbies[socket.lobbyId];
            } else {
                io.to(lobby.id).emit('lobby-update', {
                    id: lobby.id,
                    players: Object.values(lobby.players).map(p => ({ username: p.username, team: p.team, id: p.id }))
                });
            }
        }
    });
});

process.on('uncaughtException', e => fs.writeFileSync('crash.log', e.stack));
server.listen(PORT, '0.0.0.0', () => console.log(`Server on ${PORT}`));
