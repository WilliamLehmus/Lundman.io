import express from 'express';
import http from 'http';
import { Server } from 'socket.io';
import Matter from 'matter-js';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import { MATERIALS, MATERIAL_PROPERTIES, BIOMES, CHASSIS, WEAPON_MODULES, ALL_WEAPONS } from './gameConfig.js';

dotenv.config();
const __dirname = path.dirname(fileURLToPath(import.meta.url));

const ENVIRONMENT = process.env.ENVIRONMENT || process.env.NODE_ENV || 'development';
const IS_DEV = ENVIRONMENT === 'development';

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
            
        this.matchTimer = 480; // 8 minutes match duration
        this.scoreCap = 20;
        this.scores = { blue: 0, pink: 0 };
        this.gameOver = false;
        this.lastTimeTick = Date.now();
        this.worldSize = 2500; // Default until match starts
        this.walls = [];

        this.setupWorld(2); // Initial small lobby map
        
        this.handleCollisions();
        this.physicsInterval = setInterval(() => {
            try {
                this.update();
                Engine.update(this.engine, 1000 / TICK_RATE);
                this.cleanupElements();
            } catch (e) {
                console.error('CRITICAL: Physics update failed in lobby', this.id, e);
            }
        }, 1000 / TICK_RATE);

        this.syncInterval = setInterval(() => {
            this.broadcastState();
        }, 1000 / 60); // 60Hz sync
    }

    setupWorld(playerCount) {
        // Clear existing
        Object.values(this.elements).forEach(e => Composite.remove(this.engine.world, e.body));
        this.elements = {};
        this.zones = [];
        this.walls.forEach(w => Composite.remove(this.engine.world, w));
        this.walls = [];

        // Calculate size
        if (playerCount <= 2) this.worldSize = 1800;
        else if (playerCount <= 4) this.worldSize = 2400;
        else if (playerCount <= 6) this.worldSize = 3000;
        else if (playerCount <= 8) this.worldSize = 3500;
        else this.worldSize = 4000;

        // Walls
        const wallThickness = 100;
        const walls = [
            Bodies.rectangle(this.worldSize/2, -wallThickness/2, this.worldSize, wallThickness, { isStatic: true, label: 'wall' }),
            Bodies.rectangle(this.worldSize/2, this.worldSize + wallThickness/2, this.worldSize, wallThickness, { isStatic: true, label: 'wall' }),
            Bodies.rectangle(-wallThickness/2, this.worldSize/2, wallThickness, this.worldSize, { isStatic: true, label: 'wall' }),
            Bodies.rectangle(this.worldSize + wallThickness/2, this.worldSize/2, wallThickness, this.worldSize, { isStatic: true, label: 'wall' })
        ];
        this.walls = walls;
        Composite.add(this.engine.world, walls);

        this.generateMap();
    }

    getRandomSpawn(team) {
        let pos;
        let attempts = 0;
        const xBase = team === 'blue' ? 400 : this.worldSize - 400;
        
        while (attempts < 50) {
            pos = {
                x: xBase + (Math.random() - 0.5) * 600,
                y: (this.worldSize / 2) + (Math.random() - 0.5) * (this.worldSize * 0.7)
            };
            
            // Check a region around the spawn point to ensure the whole tank fits
            const bodies = Query.region(Object.values(this.elements).map(e => e.body), {
                min: { x: pos.x - 40, y: pos.y - 40 },
                max: { x: pos.x + 40, y: pos.y + 40 }
            });
            
            if (bodies.length === 0) break;
            attempts++;
        }
        return pos;
    }

    addPlayer(socket, username, chassisType = 'SCOUT') {
        const team = Object.values(this.players).filter(p => p.team === 'blue').length <= 
                     Object.values(this.players).filter(p => p.team === 'pink').length ? 'blue' : 'pink';
        
        // Replace a bot on this team if one exists
        const botOnTeam = Object.values(this.players).find(p => p.isBot && p.team === team);
        if (botOnTeam) {
            this.removePlayer(botOnTeam.id);
        }

        const startPos = this.getRandomSpawn(team);
        const config = CHASSIS[chassisType];
        
        const body = Bodies.rectangle(startPos.x, startPos.y, TANK_SIZE - 2, TANK_SIZE - 2, {
            frictionAir: config.speed > 0.005 ? 0.1 : 0.2,
            mass: config.mass,
            label: `tank-${socket.id}`,
            chamfer: { radius: 12 }, // Rounded corners prevent sticking and overlapping
            friction: 0.1,
            restitution: 0.2
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
            kills: 0,
            deaths: 0,
            statusEffects: { stun: 0, slip: 0 },
            inputs: { up: false, down: false, left: false, right: false, shoot: false },
            lastBuffLevel: 0
        };
    }

    addBot(difficulty = 'NORMAL', pos = null, isActive = true, forcedTeam = null, forcedChassis = 'RANDOM') {
        const botNames = [
            'Ironclad', 'Panzer', 'Steel Rain', 'Blitz', 'Vanguard', 
            'Sentinel', 'Titan', 'Reaper', 'Havoc', 'Goliath',
            'Maverick', 'Warthog', 'Sabre', 'Thunder', 'Ghost',
            'Spectre', 'Rogue', 'Apex', 'Predator', 'Odin'
        ];
        const existingNames = Object.values(this.players).map(p => p.username);
        const availableNames = botNames.filter(n => !existingNames.includes(n));
        const username = availableNames.length > 0 ? 
            availableNames[Math.floor(Math.random() * availableNames.length)] : 
            `Bot-${Math.random().toString(36).substring(7, 10).toUpperCase()}`;

        const id = 'bot-' + Math.random().toString(36).substring(7);
        let chassisType = forcedChassis;
        if (!chassisType || chassisType === 'RANDOM') {
            const types = ['SCOUT', 'BRAWLER', 'ARTILLERY'];
            chassisType = types[Math.floor(Math.random() * types.length)];
        }
        const team = forcedTeam || (Object.keys(this.players).length % 2 === 0 ? 'blue' : 'pink');
        
        const startPos = this.getRandomSpawn(team);
        
        const config = CHASSIS[chassisType];
        
        const body = Bodies.rectangle(startPos.x, startPos.y, TANK_SIZE - 2, TANK_SIZE - 2, {
            frictionAir: config.speed > 0.005 ? 0.1 : 0.2,
            mass: config.mass,
            label: `tank-${id}`,
            chamfer: { radius: 12 },
            friction: 0.1,
            restitution: 0.2
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
            kills: 0,
            deaths: 0,
            statusEffects: { stun: 0, slip: 0 },
            inputs: { up: false, down: false, left: false, right: false, shoot: false },
            isBot: true,
            botDifficulty: difficulty,
            isActive: isActive,
            nextWeaponSwap: 0,
            stuckTicks: 0,
            evadeUntil: 0,
            evadeDir: 1,
            targetOffset: {
                x: (Math.random() - 0.5) * 150,
                y: (Math.random() - 0.5) * 150
            },
            role: Math.random() > 0.6 ? 'FLANKER' : 'ASSAULT',
            strafeDir: Math.random() > 0.5 ? 1 : -1,
            lastRoleSwitch: Date.now(),
            lastBuffLevel: 0
        };
    }

    removePlayer(socketId) {
        const p = this.players[socketId];
        if (p) {
            const wasBot = p.isBot;
            const team = p.team;
            Composite.remove(this.engine.world, p.body);
            delete this.players[socketId];

            // Replace human with bot
            if (!wasBot) {
                this.addBot('NORMAL', null, true, team);
            }
        }
    }

    generateMap() {
        const biomes = ['URBAN', 'WASTELAND', 'INDUSTRIAL', 'WETLAND'];
        const mapType = biomes[Math.floor(Math.random() * biomes.length)];
        this.zones.push({ x: 0, y: 0, w: this.worldSize, h: this.worldSize, type: mapType });

        const blockSize = 350;
        const streetWidth = 150;
        const padding = 150;

        for (let x = padding; x < this.worldSize - padding; x += blockSize + streetWidth) {
            for (let y = padding; y < this.worldSize - padding; y += blockSize + streetWidth) {
                const rand = Math.random();
                
                if (mapType === 'URBAN') {
                    if (rand < 0.85) this.generateCityBlock(x, y, blockSize);
                    else if (rand > 0.95) this.spawnElement({ x: x + blockSize/2, y: y + blockSize/2 }, MATERIALS.WATER, null, null, null, 250, 250);
                } 
                else if (mapType === 'WASTELAND') {
                    if (rand < 0.4) this.generateCityBlock(x, y, blockSize); // Sparse buildings
                    else if (rand < 0.7) this.spawnElement({ x: x + blockSize/2, y: y + blockSize/2 }, MATERIALS.OIL, 300000, null, null, 200, 200);
                    else if (rand < 0.8) this.spawnElement({ x: x + blockSize/2, y: y + blockSize/2 }, MATERIALS.DIRT, null, null, null, 300, 300);
                }
                else if (mapType === 'INDUSTRIAL') {
                    if (rand < 0.7) this.generateCityBlock(x, y, blockSize);
                    if (Math.random() > 0.5) this.spawnElement({ x: x + blockSize, y: y + blockSize }, MATERIALS.ELECTRIC, 60000, null, null, 150, 150);
                }
                else if (mapType === 'WETLAND') {
                    if (rand < 0.3) this.generateCityBlock(x, y, blockSize);
                    else if (rand < 0.8) this.spawnElement({ x: x + blockSize/2, y: y + blockSize/2 }, MATERIALS.WATER, null, null, null, 300, 300);
                    if (Math.random() > 0.7) this.spawnElement({ x: x + blockSize, y: y + blockSize }, MATERIALS.DIRT, null, null, null, 200, 200);
                }
            }
        }

        // Random scatters based on biome
        const scatterCount = mapType === 'WASTELAND' ? 40 : 20;
        for (let i = 0; i < scatterCount; i++) {
            const pos = { x: Math.random() * this.worldSize, y: Math.random() * this.worldSize };
            const type = mapType === 'WETLAND' ? MATERIALS.WATER : (mapType === 'WASTELAND' ? MATERIALS.OIL : MATERIALS.DIRT);
            this.spawnElement(pos, type, 120000);
        }
    }

    generateCityBlock(bx, by, size) {
        const type = Math.random();
        
        if (type < 0.3) {
            // One big building (e.g. factory or skyscraper)
            this.spawnBuilding({ x: bx + size/2, y: by + size/2 }, size * 0.7, size * 0.7);
        } else if (type < 0.7) {
            // Two buildings with a guaranteed wide alley (at least 80px)
            const bW = size * 0.35;
            this.spawnBuilding({ x: bx + bW/2 + 10, y: by + size/2 }, bW, size * 0.85);
            this.spawnBuilding({ x: bx + size - bW/2 - 10, y: by + size/2 }, bW, size * 0.85);
        } else {
            // Four small corner buildings with wide central cross-path
            const s = size * 0.3;
            this.spawnBuilding({ x: bx + s, y: by + s }, s*1.6, s*1.6);
            this.spawnBuilding({ x: bx + size - s, y: by + s }, s*1.6, s*1.6);
            this.spawnBuilding({ x: bx + s, y: by + size - s }, s*1.6, s*1.6);
            this.spawnBuilding({ x: bx + size - s, y: by + size - s }, s*1.6, s*1.6);
        }
    }

    spawnBuilding(pos, w, h) {
        // Skip if building is outside world bounds
        const padding = 10;
        if (pos.x - w/2 < padding || pos.x + w/2 > this.worldSize - padding ||
            pos.y - h/2 < padding || pos.y + h/2 > this.worldSize - padding) {
            return;
        }
        
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
                    const now = Date.now();
                    const isInvulnerable = victim.invulnerableUntil && now < victim.invulnerableUntil;
                    
                    if (!isInvulnerable) {
                        victim.hp -= bulletData.damage;
                    }
                    
                    const forceDir = Vector.normalise(bullet.velocity);
                    Body.applyForce(target, target.position, Vector.mult(forceDir, bulletData.impact));
                    
                    if (bulletData.type === MATERIALS.ELECTRIC) {
                        const inWater = Object.values(this.elements).some(e => e.type === MATERIALS.WATER && Query.point([e.body], victim.body.position).length > 0);
                        victim.statusEffects.stun = Date.now() + (inWater ? 2500 : 1000);
                    }

                    if (victim.hp < victim.maxHp * 0.5) {
                        this.spawnElement(victim.body.position, MATERIALS.OIL, 5000);
                    }

                    this.destroyBullet(bullet.id);
                    if (victim.hp <= 0) this.respawn(victim, bulletData.ownerId, bulletData.weapon || bulletData.type);
                }
            }
        }
        
        if (target.label === 'element') {
            const element = this.elements[target.elementId];
            if (element) {
                if (bulletData.type === MATERIALS.FIRE && element.type === MATERIALS.OIL) {
                    const pos = { x: element.body.position.x, y: element.body.position.y };
                    this.destroyElement(element.id);
                    this.spawnElement(pos, MATERIALS.FIRE, 5000, 100, bulletData.ownerId);
                    this.destroyBullet(bullet.id);
                    return;
                }

                if (bulletData.type === MATERIALS.ELECTRIC && element.type === MATERIALS.WATER) {
                    element.type = MATERIALS.ELECTRIC;
                    element.expiresAt = Date.now() + 2000;
                    this.destroyBullet(bullet.id);
                    return;
                }

                if (bulletData.type === MATERIALS.FIRE && element.type === MATERIALS.WATER) {
                    this.spawnElement(bullet.position, MATERIALS.STEAM, 4000);
                    this.destroyElement(element.id);
                    this.destroyBullet(bullet.id);
                    return;
                }

                if (bulletData.type === MATERIALS.ICE && element.type === MATERIALS.WATER) {
                    element.type = MATERIALS.ICE;
                    this.destroyBullet(bullet.id);
                    return;
                }

                if (bulletData.type === element.type) return;

                if (element.hp != null) {
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
}

    processElementInteraction(bodyA, bodyB) {
        const elementA = bodyA.label === 'element' ? this.elements[bodyA.elementId] : null;
        const elementB = bodyB.label === 'element' ? this.elements[bodyB.elementId] : null;
        const bullet = bodyA.label === 'bullet' ? bodyA : (bodyB.label === 'bullet' ? bodyB : null);

        // Bullet vs Puddle Alchemy is now handled in processBulletCollision for consistency
        if (!bullet && elementA && elementB) {
            // Puddle vs Puddle Alchemy (e.g. Fire puddle hits Ice puddle)
            if ((elementA.type === MATERIALS.FIRE && elementB.type === MATERIALS.ICE) ||
                (elementB.type === MATERIALS.FIRE && elementA.type === MATERIALS.ICE)) {
                this.destroyElement(elementA.id);
                this.destroyElement(elementB.id);
            }
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
                const now = Date.now();
                const isInvulnerable = p.invulnerableUntil && now < p.invulnerableUntil;

                if (element.type === MATERIALS.ELECTRIC && !isInvulnerable) p.statusEffects.stun = now + 500;
                if (element.type === MATERIALS.ICE) p.statusEffects.slip = now + 1000;
                if (element.type === MATERIALS.FIRE && element.ownerId !== p.id && !isInvulnerable) p.hp -= 0.5;
                if (element.type === MATERIALS.STEAM) p.hidden = true;
                if (element.type === MATERIALS.SCRAP) {
                    p.scrap = Math.min(p.scrap + 10, 500);
                    this.destroyElement(element.id);
                }
                if (p.hp <= 0) {
                    const weaponSource = element.type === MATERIALS.FIRE ? 'FLAMETHROWER' : 
                                       (element.type === MATERIALS.ELECTRIC ? 'TESLA' : element.type);
                    this.respawn(p, element.ownerId, weaponSource);
                }
            }
        }
    }

    spawnElement(pos, type, duration = null, hp = null, ownerId = null, customW = null, customH = null) {
        // Prevent spawning elements inside buildings
        if (type !== MATERIALS.BUILDING) {
            const buildings = Object.values(this.elements)
                .filter(e => e.type === MATERIALS.BUILDING)
                .map(e => e.body);
            
            const isInside = Query.point(buildings, pos).length > 0;
            if (isInside) return null;
        }

        const id = ++this.lastElementId;
        const config = MATERIAL_PROPERTIES[type] || { w: 30, h: 30 };
        const w = customW || config.w;
        const h = customH || config.h;

        const body = Bodies.rectangle(pos.x, pos.y, w, h, {
            label: 'element',
            isStatic: true,
            isSensor: true
        });
        body.elementId = id;

        this.elements[id] = {
            id,
            body,
            type,
            hp,
            ownerId,
            expiresAt: duration ? Date.now() + duration : null,
            w, h, x: pos.x, y: pos.y
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

    respawn(player, killerId = null, weaponType = 'UNKNOWN') {
        player.hp = player.maxHp;
        player.deaths++;

        if (killerId && this.players[killerId]) {
            this.players[killerId].kills++;
            
            const killer = this.players[killerId];
            const victim = player;
            
            io.to(this.id).emit('kill-feed', {
                killer: killer.username,
                victim: victim.username,
                weapon: weaponType,
                killerTeam: killer.team,
                victimTeam: victim.team
            });
        }

        const otherTeam = player.team === 'blue' ? 'pink' : 'blue';
        if (!this.gameOver) {
            this.scores[otherTeam]++;
            this.checkMatchEnd();
        }

        player.invulnerableUntil = Date.now() + 3000;

        for (let i = 0; i < 5; i++) {
            this.spawnElement({
                x: player.body.position.x + (Math.random() - 0.5) * 60,
                y: player.body.position.y + (Math.random() - 0.5) * 60
            }, MATERIALS.SCRAP, 30000);
        }
        player.hp = CHASSIS[player.chassis].hp;
        player.scrap = Math.floor(player.scrap / 2);
        const pos = this.getRandomSpawn(player.team);
        Body.setPosition(player.body, pos);
        Body.setVelocity(player.body, { x: 0, y: 0 });
    }

    update() {
        const now = Date.now();

        if (this.active && !this.gameOver) {
            if (now - this.lastTimeTick >= 1000) {
                this.matchTimer--;
                this.lastTimeTick = now;
                if (this.matchTimer <= 0) this.checkMatchEnd();
            }

            this.processBots(now);
            Object.values(this.players).forEach(p => {
                // Scrap Buff Feedback
                const buffLevel = Math.floor(p.scrap / 100);
                if (buffLevel > p.lastBuffLevel && buffLevel <= 5) {
                    p.lastBuffLevel = buffLevel;
                    if (p.id.startsWith('bot-')) {
                        // Bots don't need popups, but maybe in future
                    } else {
                        const socket = io.sockets.sockets.get(p.id);
                        if (socket) socket.emit('scrap-buff', { text: 'COMBAT BUFF: DMG & RELOAD UP!' });
                    }
                }

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
    }

    playerShoot(p) {
        const moduleName = p.slots[p.currentSlot];
        const baseWeapon = WEAPON_MODULES[moduleName];
        const now = Date.now();
        
        // Scrap Bonus: +20% damage and +10% fire rate per 100 scrap
        const scrapBuff = 1 + (p.scrap / 500); 
        const reloadTime = baseWeapon.reload / (1 + (p.scrap / 1000));

        if (now - p.lastShot > reloadTime) {
            // Apply damage bonus in the fire call
            this.fire(p, baseWeapon, moduleName, scrapBuff);
            p.lastShot = now;
        }
    }

    processBots(now) {
        Object.values(this.players).filter(p => p.isBot).forEach(bot => {
            if (bot.hp <= 0 || bot.isActive === false) {
                bot.inputs = { up: false, down: false, left: false, right: false, shoot: false };
                return;
            }
            let avoidX = 0;
            let avoidY = 0;
            let closestEnemy = null;
            let minDist = Infinity;
            Object.values(this.players).filter(p => p.team !== bot.team && p.hp > 0 && (!p.invulnerableUntil || now > p.invulnerableUntil)).forEach(enemy => {
                const dist = Vector.magnitude(Vector.sub(enemy.body.position, bot.body.position));
                if (dist < minDist) {
                    minDist = dist;
                    closestEnemy = enemy;
                }
            });

            let targetPos = null;
            if (closestEnemy) {
                targetPos = closestEnemy.body.position;
            } else {
                bot.inputs.shoot = false; // Stop shooting if no valid target
                let closestScrap = null;
                let minScrapDist = 800; 
                Object.values(this.elements).forEach(e => {
                    if (e.type === MATERIALS.SCRAP) {
                        const dist = Vector.magnitude(Vector.sub(e.body.position, bot.body.position));
                        if (dist < minScrapDist) {
                            minScrapDist = dist;
                            closestScrap = e;
                        }
                    }
                });
                if (closestScrap) {
                    targetPos = closestScrap.body.position;
                    minDist = minScrapDist;
                }
            }

            if (!targetPos) {
                bot.inputs = { up: false, down: false, left: false, right: false, shoot: false };
                return;
            }

            const targetPull = 2.5;
            let targetAngle = Math.atan2(targetPos.y - bot.body.position.y, targetPos.x - bot.body.position.x);

            // 1. Stuck Detection
            const distMoved = Vector.magnitude(Vector.sub(bot.body.position, bot.lastPos || bot.body.position));
            bot.lastPos = { x: bot.body.position.x, y: bot.body.position.y };
            
            if (distMoved < 0.5 && bot.inputs.up) {
                bot.stuckTicks = (bot.stuckTicks || 0) + 1;
            } else {
                bot.stuckTicks = 0;
            }

            if (bot.stuckTicks > 60) {
                bot.reverseUntil = now + 1500;
                bot.stuckTicks = 0;
            }

            if (now < bot.reverseUntil) {
                bot.inputs = { up: false, down: true, left: Math.random() > 0.5, right: Math.random() < 0.5, shoot: true };
                return;
            }

            // 2. Separation Force
            Object.values(this.players).forEach(other => {
                if (other.id === bot.id) return;
                const dx = bot.body.position.x - other.body.position.x;
                const dy = bot.body.position.y - other.body.position.y;
                const distSq = dx*dx + dy*dy;
                const minClearance = 200; 
                if (distSq < minClearance * minClearance) {
                    const dist = Math.sqrt(distSq) || 1;
                    const force = (minClearance - dist) / minClearance;
                    const strength = force * force * 15.0; 
                    avoidX += (dx / dist) * strength;
                    avoidY += (dy / dist) * strength;
                }
            });

            // HARD: Target Leading
            if (bot.botDifficulty === 'HARD' && closestEnemy) {
                const weapon = WEAPON_MODULES[bot.slots[bot.currentSlot]];
                const timeToTarget = minDist / (weapon.speed || 10);
                targetPos = {
                    x: targetPos.x + closestEnemy.body.velocity.x * timeToTarget,
                    y: targetPos.y + closestEnemy.body.velocity.y * timeToTarget
                };
            }

            if (bot.ignoreTargetUntil && now < bot.ignoreTargetUntil) {
                targetAngle = bot.body.angle; 
            } else {
                let tx = targetPos.x + bot.targetOffset.x;
                let ty = targetPos.y + bot.targetOffset.y;

                if (bot.role === 'FLANKER') {
                    const distToPlayer = Vector.magnitude(Vector.sub(targetPos, bot.body.position));
                    if (distToPlayer > 500) {
                        const angleToPlayer = Math.atan2(ty - bot.body.position.y, tx - bot.body.position.x);
                        const flankAngle = angleToPlayer + (Math.PI / 2.5) * bot.strafeDir;
                        tx = bot.body.position.x + Math.cos(flankAngle) * 600;
                        ty = bot.body.position.y + Math.sin(flankAngle) * 600;
                    }
                }

                targetAngle = Math.atan2(ty - bot.body.position.y, tx - bot.body.position.x);

                const strafeAngle = targetAngle + (Math.PI / 2) * bot.strafeDir;
                avoidX += Math.cos(strafeAngle) * 1.5;
                avoidY += Math.sin(strafeAngle) * 1.5;
            }

            const lookAhead = 250;
            const obstacles = Composite.allBodies(this.engine.world).filter(b => 
                b !== bot.body && !b.isSensor && b.label !== 'bullet' && !b.label.startsWith('tank-')
            );
            
            const angles = [-0.6, -0.3, 0, 0.3, 0.6];
            let hitCount = 0;

            for (const offset of angles) {
                const rayAngle = bot.body.angle + offset;
                const rayEnd = {
                    x: bot.body.position.x + Math.cos(rayAngle) * lookAhead,
                    y: bot.body.position.y + Math.sin(rayAngle) * lookAhead
                };
                const hits = Query.ray(obstacles, bot.body.position, rayEnd);
                if (hits.length > 0) {
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
                
                const finalX = Math.cos(targetAngle) * targetPull + avoidX;
                const finalY = Math.sin(targetAngle) * targetPull + avoidY;
                
                targetAngle = Math.atan2(finalY, finalX);
            }

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

    fire(p, weapon, moduleName = 'UNKNOWN', scrapBuff = 1) {
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
            isSensor: weapon.type === MATERIALS.DIRT 
        });
        bullet.id = id;
        
        bullet.customData = { 
            ownerId: p.id, 
            damage: weapon.damage * scrapBuff, 
            impact: weapon.impact * scrapBuff,
            type: weapon.type,
            weapon: moduleName, 
            expiresAt: Date.now() + (weapon.ttl || 2000)
        };
        Body.setVelocity(bullet, {
            x: Math.cos(p.body.angle) * weapon.speed,
            y: Math.sin(p.body.angle) * weapon.speed
        });
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
            // Spawn fire elements slightly ahead to avoid immediate collision
            this.spawnElement({
                x: pos.x + Math.cos(p.body.angle) * 20,
                y: pos.y + Math.sin(p.body.angle) * 20
            }, MATERIALS.FIRE, 1500, undefined, p.id);
        }
    }

    broadcastState() {
        const state = {
            worldSize: this.worldSize,
            timer: this.matchTimer,
            scores: this.scores,
            gameOver: this.gameOver,
            zones: this.zones.map(z => ({ ...z, color: BIOMES[z.type].color })),
            players: Object.values(this.players).map(p => ({
                id: p.id, username: p.username, team: p.team,
                x: p.body.position.x, y: p.body.position.y, angle: p.body.angle,
                hp: p.hp, maxHp: p.maxHp, weapon: p.slots[p.currentSlot],
                currentSlot: p.currentSlot, slots: p.slots, scrap: p.scrap, hidden: p.hidden,
                invulnerable: p.invulnerableUntil && Date.now() < p.invulnerableUntil
            })),
            bullets: Object.values(this.bullets).map(b => ({
                id: b.id, x: b.position.x, y: b.position.y,
                type: b.customData.type,
                weapon: b.customData.weapon,
                color: this.getElementColor(b.customData.type),
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
            if (b.position.x < -100 || b.position.x > this.worldSize + 100 || 
                b.position.y < -100 || b.position.y > this.worldSize + 100) {
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

    startGame() {
        if (this.active) return;
        
        const playerCount = Object.keys(this.players).length;
        this.setupWorld(playerCount);

        this.active = true;
        this.matchTimer = 480; // 8 minutes
        this.scores = { blue: 0, pink: 0 };
        this.gameOver = false;
        this.lastTimeTick = Date.now();
        
        Object.values(this.players).forEach(p => {
            p.hp = p.maxHp;
            p.scrap = 0;
            const spawn = this.getRandomSpawn(p.team);
            Body.setPosition(p.body, spawn);
            Body.setVelocity(p.body, { x: 0, y: 0 });
        });
    }

    checkMatchEnd() {
        if (this.gameOver) return;

        let winner = null;
        if (this.scores.blue >= this.scoreCap) winner = 'blue';
        else if (this.scores.pink >= this.scoreCap) winner = 'pink';
        else if (this.matchTimer <= 0) {
            if (this.scores.blue > this.scores.pink) winner = 'blue';
            else if (this.scores.pink > this.scores.blue) winner = 'pink';
            else winner = 'draw';
        }

        if (winner) {
            this.gameOver = true;
            io.to(this.id).emit('match-ended', { 
                winner, 
                scores: this.scores,
                stats: Object.values(this.players).map(p => ({
                    username: p.username,
                    team: p.team,
                    kills: p.kills,
                    deaths: p.deaths,
                    scrap: p.scrap
                })).sort((a, b) => b.kills - a.kills)
            });
        }
    }

    resetLobby() {
        this.active = false;
        this.gameOver = false;
        this.matchTimer = 480;
        this.scores = { blue: 0, pink: 0 };
        this.lastTimeTick = Date.now();

        Object.keys(this.bullets).forEach(id => this.destroyBullet(id));
        Object.keys(this.elements).forEach(id => this.destroyElement(id));
        
        Object.values(this.players).forEach(p => this.respawn(p));
        
        this.generateMap();
        
        io.to(this.id).emit('lobby-reset', {
            id: this.id,
            players: Object.values(this.players).map(p => ({ username: p.username, team: p.team, id: p.id }))
        });
    }

    destroy() {
        clearInterval(this.physicsInterval);
        clearInterval(this.syncInterval);
    }
}

io.on('connection', (socket) => {
    console.log('User connected:', socket.id);

    if (IS_DEV) {
        socket.emit('debug-init');
    }
    socket.on('join-game', (data) => {
        if (!data || typeof data.username !== 'string' || data.username.trim() === '') return;
        let { username, chassisType } = data;
        username = username.trim().substring(0, 12);
        if (!['SCOUT', 'BRAWLER', 'ARTILLERY'].includes(chassisType)) chassisType = 'SCOUT';

        console.log('Join Game request from:', username, 'chassis:', chassisType);
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
            lobby.addBot(data.difficulty, null, true, null, data.chassisType);
            io.to(lobby.id).emit('lobby-update', {
                id: lobby.id,
                players: Object.values(lobby.players).map(p => ({ username: p.username, team: p.team, id: p.id, chassis: p.chassis }))
            });
        }
    });

    socket.on('remove-bot', () => {
        const lobby = lobbies[socket.lobbyId];
        if (lobby) {
            const bots = Object.values(lobby.players).filter(p => p.isBot);
            if (bots.length > 0) {
                const botToRemove = bots[bots.length - 1];
                lobby.removePlayer(botToRemove.id);
                io.to(lobby.id).emit('lobby-update', {
                    id: lobby.id,
                    players: Object.values(lobby.players).map(p => ({ username: p.username, team: p.team, id: p.id, chassis: p.chassis }))
                });
            }
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
            lobby.startGame();
            io.to(lobby.id).emit('game-started');
        }
    });

    socket.on('request-rematch', () => {
        const lobby = lobbies[socket.lobbyId];
        if (lobby) lobby.resetLobby();
    });

    socket.on('debug-spawn-bot', (data) => {
        if (!IS_DEV) return;
        const lobby = lobbies[socket.lobbyId];
        if (lobby) {
            lobby.addBot(data.difficulty || 'NORMAL', data.pos, data.isActive);
        }
    });

    socket.on('debug-toggle-bots', (active) => {
        if (!IS_DEV) return;
        const lobby = lobbies[socket.lobbyId];
        if (lobby) {
            Object.values(lobby.players).forEach(p => {
                if (p.isBot) p.isActive = active;
            });
        }
    });

    socket.on('change-chassis', (chassisType) => {
        const lobby = lobbies[socket.lobbyId];
        if (lobby && lobby.players[socket.id] && !lobby.active) {
            const p = lobby.players[socket.id];
            if (CHASSIS[chassisType]) {
                p.chassis = chassisType;
                p.hp = CHASSIS[chassisType].hp;
                p.maxHp = p.hp;
                const availableWeapons = ALL_WEAPONS.slice(0, CHASSIS[chassisType].slots);
                p.slots = availableWeapons;
                p.currentSlot = 0;
                
                io.to(lobby.id).emit('lobby-update', {
                    id: lobby.id,
                    players: Object.values(lobby.players).map(p => ({ username: p.username, team: p.team, id: p.id, chassis: p.chassis }))
                });
            }
        }
    });

    socket.on('debug-spawn-terrain', (data) => {
        if (!IS_DEV) return;
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
server.listen(PORT, '0.0.0.0', () => {
    console.log(`Server on ${PORT}`);
    console.log(`Environment: ${ENVIRONMENT}`);
    console.log(`Debug Mode: ${IS_DEV ? 'ENABLED' : 'DISABLED'}`);
});
