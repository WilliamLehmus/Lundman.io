import express from 'express';
import http from 'http';
import { Server } from 'socket.io';
import Matter from 'matter-js';
import path from 'path';
import fs from 'fs';
import helmet from 'helmet';
import { rateLimit } from 'express-rate-limit';
import bcrypt from 'bcryptjs';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import { MATERIALS, MATERIAL_PROPERTIES, BIOMES, CHASSIS, WEAPON_MODULES, ALL_WEAPONS } from './gameConfig.js';

dotenv.config(); // Force restart triggered by Antigravity
const __dirname = path.dirname(fileURLToPath(import.meta.url));

const ENVIRONMENT = process.env.ENVIRONMENT || process.env.NODE_ENV || 'development';
const IS_DEV = ENVIRONMENT === 'development';

const app = express();
app.use(helmet({
    contentSecurityPolicy: {
        directives: {
            "default-src": ["'self'"],
            "script-src": ["'self'", "'unsafe-inline'", "'unsafe-eval'"], // Needed for Vite/Socket.io
            "style-src": ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
            "font-src": ["'self'", "https://fonts.gstatic.com"],
            "img-src": ["'self'", "data:", "blob:"],
            "connect-src": ["'self'", "ws:", "wss:", "http://localhost:*", "ws://localhost:*"]
        }
    }
}));

const limiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 100,
    standardHeaders: true,
    legacyHeaders: false,
});
app.use('/health', limiter); // Only apply to health/api for now to avoid blocking static assets if misconfigured

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
const TANK_WIDTH = 58;  // Length
const TANK_HEIGHT = 42; // Width
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
        this.guardians = {};
        this.lastGuardianId = 0;
        this.nextGuardianSpawn = 0;
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

    setupWorld(playerCount, forcedMapType = 'RANDOM') {
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

        this.generateMap(forcedMapType);
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

        // Final safety clamp
        pos.x = Math.max(100, Math.min(this.worldSize - 100, pos.x));
        pos.y = Math.max(100, Math.min(this.worldSize - 100, pos.y));

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
        
        // Persistence: Load previous stats if available
        if (playerData[username]) {
            console.log('Restoring stats for:', username);
        } else {
            playerData[username] = { kills: 0, deaths: 0, scrap: 0, lastSeen: Date.now() };
        }

        const body = Bodies.rectangle(startPos.x, startPos.y, TANK_WIDTH - 2, TANK_HEIGHT - 2, {
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
            slots: config.weapons,
            currentSlot: 0,
            lastShot: 0,
            scrap: 0,
            kills: 0,
            deaths: 0,
            statusEffects: { stun: 0, slip: 0, slow: 0, burn: 0, wet: 0, stunImmunity: 0, revealed: 0 },
            inputs: { up: false, down: false, left: false, right: false, shoot: false, aimAngle: 0 },
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
        
        const body = Bodies.rectangle(startPos.x, startPos.y, TANK_WIDTH - 2, TANK_HEIGHT - 2, {
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
            slots: config.weapons,
            currentSlot: 0,
            lastShot: 0,
            scrap: 0,
            kills: 0,
            deaths: 0,
            statusEffects: { stun: 0, slip: 0, slow: 0, burn: 0, wet: 0, stunImmunity: 0, revealed: 0 },
            inputs: { up: false, down: false, left: false, right: false, shoot: false, aimAngle: 0 },
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
            const username = p.username;

            // Persistence: Save human stats on leave
            if (!wasBot && playerData[username]) {
                playerData[username].kills += p.kills;
                playerData[username].deaths += p.deaths;
                playerData[username].scrap += p.scrap;
                playerData[username].lastSeen = Date.now();
                savePlayers();
            }

            Composite.remove(this.engine.world, p.body);
            delete this.players[socketId];

            // Replace human with bot
            if (!wasBot) {
                this.addBot('NORMAL', null, true, team);
            }
        }
    }

    generateMap(forcedType = 'RANDOM') {
        const biomes = ['URBAN', 'WASTELAND', 'INDUSTRIAL', 'WETLAND', 'TUNDRA'];
        let mapType = forcedType === 'RANDOM' || !biomes.includes(forcedType) 
            ? biomes[Math.floor(Math.random() * biomes.length)] 
            : forcedType;
        this.mapType = mapType; // Store for other methods
        this.zones.push({ x: 0, y: 0, w: this.worldSize, h: this.worldSize, type: mapType });

        const blockSize = 350;
        const streetWidth = 150;
        const padding = 150;

        for (let x = padding; x < this.worldSize - padding; x += blockSize + streetWidth) {
            for (let y = padding; y < this.worldSize - padding; y += blockSize + streetWidth) {
                const rand = Math.random();
                
                if (mapType === 'URBAN') {
                    if (rand < 0.85) this.generateCityBlock(x, y, blockSize);
                    else if (rand > 0.95) this.spawnElement({ x: x + blockSize/2, y: y + blockSize/2 }, MATERIALS.WATER, null, null, null, 160, 160);
                } 
                else if (mapType === 'WASTELAND') {
                    if (rand < 0.35) this.generateCityBlock(x, y, blockSize); // Sparse buildings
                    else if (rand < 0.55) this.spawnElement({ x: x + blockSize/2, y: y + blockSize/2 }, MATERIALS.OIL, 300000, null, null, 150, 150);
                    else if (rand < 0.75) this.spawnElement({ x: x + blockSize/2, y: y + blockSize/2 }, MATERIALS.ACID, null, null, null, 180, 180);
                    else if (rand < 0.85) this.spawnElement({ x: x + blockSize/2, y: y + blockSize/2 }, MATERIALS.DIRT, null, null, null, 200, 200);
                }
                else if (mapType === 'INDUSTRIAL') {
                    if (rand < 0.6) this.generateIndustrialComplex(x, y, blockSize);
                }
                else if (mapType === 'WETLAND') {
                    if (rand < 0.3) this.generateCityBlock(x, y, blockSize);
                    else if (rand < 0.8) {
                        const r2 = Math.random();
                        let pType = MATERIALS.WATER;
                        if (r2 > 0.5 && r2 <= 0.8) pType = MATERIALS.ACID;
                        else if (r2 > 0.8) pType = MATERIALS.GAS;
                        this.spawnElement({ x: x + blockSize/2, y: y + blockSize/2 }, pType, null, null, null, 220, 220);
                    }
                    if (Math.random() > 0.7) this.spawnElement({ x: x + blockSize, y: y + blockSize }, MATERIALS.DIRT, null, null, null, 150, 150);
                }
                else if (mapType === 'TUNDRA') {
                    if (rand < 0.2) this.generateCityBlock(x, y, blockSize);
                    else if (rand < 0.8) this.spawnElement({ x: x + blockSize/2, y: y + blockSize/2 }, MATERIALS.ICE, null, null, null, 180, 180);
                }
            }
        }

        // Random scatters based on biome
        if (mapType === 'INDUSTRIAL') {
            // Balanced puddle count: roughly 1 per 600px of world dimension (e.g. 6-7 on a 4000px map)
            const puddleCount = Math.floor(this.worldSize / 600); 
            for (let i = 0; i < puddleCount; i++) {
                let spawned = false;
                for (let attempts = 0; attempts < 15 && !spawned; attempts++) {
                    const pos = { 
                        x: 200 + Math.random() * (this.worldSize - 400), 
                        y: 200 + Math.random() * (this.worldSize - 400) 
                    };
                    
                    const r = Math.random();
                    let pType = MATERIALS.ELECTRIC;
                    if (r > 0.5 && r <= 0.7) pType = MATERIALS.ACID;
                    else if (r > 0.7 && r <= 0.85) pType = MATERIALS.WATER;
                    else if (r > 0.85) pType = MATERIALS.OIL;

                    // Distance check: ensure better spacing (min 500px between same-type, 350px between any type)
                    const tooClose = Object.values(this.elements).some(e => {
                        const dist = Vector.magnitude(Vector.sub(e.body.position, pos));
                        return (e.type === pType && dist < 500) || dist < 350;
                    });

                    if (!tooClose) {
                        // Smaller, tighter hazards for industrial
                        const size = 100 + Math.random() * 60; 
                        if (this.spawnElement(pos, pType, null, null, null, size, size)) {
                            spawned = true;
                        }
                    }
                }
            }
        }
        
        if (mapType === 'WETLAND') {
            const puddleCount = Math.floor(this.worldSize / 500);
            for (let i = 0; i < puddleCount; i++) {
                let spawned = false;
                for (let attempts = 0; attempts < 15 && !spawned; attempts++) {
                    const pos = { x: 200 + Math.random() * (this.worldSize - 400), y: 200 + Math.random() * (this.worldSize - 400) };
                    const r = Math.random();
                    let pType = MATERIALS.WATER;
                    if (r > 0.4 && r <= 0.75) pType = MATERIALS.ACID;
                    else if (r > 0.75) pType = MATERIALS.GAS;

                    const tooClose = Object.values(this.elements).some(e => Vector.magnitude(Vector.sub(e.body.position, pos)) < 400);
                    if (!tooClose) {
                        const size = 120 + Math.random() * 80;
                        if (this.spawnElement(pos, pType, null, null, null, size, size)) spawned = true;
                    }
                }
            }
        }

        // Removed initial random scatter of scrap/materials at match start as requested.
        // Elements should now primarily come from crates, barrels, or active gameplay.

        // --- NEW: Grid-based Global Props Scatter (Barrels & Crates) ---
        // Divides the map into a grid to ensure even distribution without clustering
        const cellSize = 350; 
        for (let gx = cellSize; gx < this.worldSize - cellSize; gx += cellSize) {
            for (let gy = cellSize; gy < this.worldSize - cellSize; gy += cellSize) {
                // Skip if too close to center (Guardian zone)
                const distToCenter = Math.hypot(gx - this.worldSize/2, gy - this.worldSize/2);
                if (distToCenter < 500) continue;

                // Random offset within the cell to avoid a sterile grid look
                const pos = { 
                    x: gx + (Math.random() - 0.5) * (cellSize * 0.7), 
                    y: gy + (Math.random() - 0.5) * (cellSize * 0.7) 
                };
                
                const rand = Math.random();
                let pType;
                if (rand < 0.35) pType = MATERIALS.BARREL_EXPLOSIVE;
                else if (rand < 0.70) pType = MATERIALS.BARREL_OIL;
                else pType = MATERIALS.CRATE;
                
                const props = MATERIAL_PROPERTIES[pType];
                this.spawnElement(pos, pType, null, props.hp);
            }
        }
    }
    generateIndustrialComplex(bx, by, size) {
        // Large factory-style buildings
        const bw = size * (0.7 + Math.random() * 0.4);
        const bh = size * (0.5 + Math.random() * 0.3);
        this.spawnBuilding({ x: bx + size/2, y: by + size/2 }, bw, bh);

        // Add industrial machinery/props clustered around factory
        const propCount = 2 + Math.floor(Math.random() * 3);
        for (let i = 0; i < propCount; i++) {
            const side = Math.random() > 0.5 ? 1 : -1;
            const pos = {
                x: bx + size/2 + (bw/2 + 30) * side,
                y: by + size/2 + (Math.random() - 0.5) * bh
            };
            const pType = Math.random() > 0.5 ? MATERIALS.BARREL_OIL : MATERIALS.CRATE;
            this.spawnElement(pos, pType, null, MATERIAL_PROPERTIES[pType].hp);
        }
    }

    generateCityBlock(bx, by, size) {
        // Main Building
        const bw = size * (0.6 + Math.random() * 0.3);
        const bh = size * (0.6 + Math.random() * 0.3);
        this.spawnBuilding({ x: bx + size/2, y: by + size/2 }, bw, bh);

        // Reduced Urban props around buildings to prevent clustering
        const propCount = 1 + Math.floor(Math.random() * 2);
        for (let i = 0; i < propCount; i++) {
            const pos = {
                x: bx + Math.random() * size,
                y: by + Math.random() * size
            };
            const rand = Math.random();
            let pType;
            // Favor barrels slightly more here too
            if (rand < 0.35) pType = MATERIALS.BARREL_EXPLOSIVE;
            else if (rand < 0.70) pType = MATERIALS.BARREL_OIL;
            else pType = MATERIALS.CRATE;
            
            const props = MATERIAL_PROPERTIES[pType];
            this.spawnElement(pos, pType, null, props.hp);
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
            hp: 800,
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
                    
                    // Emit hit effect for all clients
                    io.to(this.id).emit('collision-effect', {
                        x: bullet.position.x,
                        y: bullet.position.y,
                        type: bullet.customData.type,
                        targetLabel: target.label
                    });

                    this.processBulletCollision(bullet, target);
                }
            });
        });
    }

    processBulletCollision(bullet, target) {
        const bulletData = bullet.customData;

        // Insulation: Electricity cannot pass through Dirt mounds
        if (bulletData.type === MATERIALS.ELECTRIC && target.label && target.label.startsWith('tank-')) {
            const dirtBodies = Object.values(this.elements).filter(e => e.type === MATERIALS.DIRT).map(e => e.body);
            if (dirtBodies.length > 0) {
                const hits = Query.ray(dirtBodies, bullet.position, target.position);
                if (hits.length > 0) {
                    this.destroyBullet(bullet.id);
                    return;
                }
            }
        }

        if (target.label && target.label.startsWith('tank-')) {
            const targetId = target.label.split('tank-')[1];
            if (targetId !== bulletData.ownerId) {
                const victim = this.players[targetId];
                const attacker = this.players[bulletData.ownerId];
                if (victim && (!attacker || victim.team !== attacker.team)) {
                    const now = Date.now();
                    const isInvulnerable = victim.invulnerableUntil && now < victim.invulnerableUntil;
                    
                    if (!isInvulnerable) {
                        victim.hp -= bulletData.damage;

                        // Leak oil when damaged (persistent during match)
                        if (Math.random() > 0.4) {
                            const offset = { 
                                x: (Math.random() - 0.5) * 40, 
                                y: (Math.random() - 0.5) * 40 
                            };
                            this.spawnElement({ 
                                x: victim.body.position.x + offset.x, 
                                y: victim.body.position.y + offset.y 
                            }, MATERIALS.OIL, null, null, null, 25, 25);
                        }
                    }
                    
                    const forceDir = Vector.normalise(bullet.velocity);
                    Body.applyForce(target, target.position, Vector.mult(forceDir, bulletData.impact));
                    
                    if (bulletData.type === MATERIALS.ELECTRIC) {
                        const inWater = Object.values(this.elements).some(e => e.type === MATERIALS.WATER && Query.point([e.body], victim.body.position).length > 0);
                        const isWet = Date.now() < victim.statusEffects.wet;
                        victim.statusEffects.stun = Date.now() + (inWater || isWet ? 2500 : 1000);
                        // Reveal Mechanic: Electricity reveals stealth targets
                        victim.hidden = false;
                        victim.statusEffects.revealed = Date.now() + 2000;
                    }
                    if (bulletData.type === MATERIALS.WATER) {
                        victim.statusEffects.wet = Date.now() + 4000;
                    }
                    if (bulletData.type === MATERIALS.ICE) {
                        victim.statusEffects.slow = Date.now() + 2500;
                    }
                    if (bulletData.type === MATERIALS.FIRE) {
                        victim.statusEffects.burn = Date.now() + 2000;
                    }

                    if (victim.hp < victim.maxHp * 0.5) {
                        this.spawnElement(victim.body.position, MATERIALS.OIL, 5000);
                    }

                    this.destroyBullet(bullet.id);
                    if (victim.hp <= 0) this.respawn(victim, bulletData.ownerId, bulletData.weapon || bulletData.type);
                }
            }
        }
        
        if (target.label && target.label.startsWith('guardian-')) {
            const gId = target.label.split('guardian-')[1];
            const guardian = this.guardians[gId];
            if (guardian) {
                const damage = bulletData.type === MATERIALS.METAL ? bulletData.damage * 1.5 : bulletData.damage;
                guardian.hp -= damage;
                
                // Knockback
                const forceDir = Vector.normalise(bullet.velocity);
                Body.applyForce(guardian.body, guardian.body.position, Vector.mult(forceDir, bulletData.impact));

                this.destroyBullet(bullet.id);
                if (guardian.hp <= 0) this.destroyGuardian(gId, bulletData.ownerId);
            }
        }
        
        if (target.label === 'element') {
            const element = this.elements[target.elementId];
            if (element) {
                // Kinetic Shatter: Metal vs Ice puddles
                if (bulletData.type === MATERIALS.METAL && element.type === MATERIALS.ICE) {
                    this.destroyElement(element.id);
                    this.destroyBullet(bullet.id);
                    // Spawn ice shards (particles)
                    io.to(this.id).emit('collision-effect', { x: bullet.position.x, y: bullet.position.y, type: 'ICE_SHATTER' });
                    return;
                }
                // Bidirectional Alchemy
                const isFireVSWater = (bulletData.type === MATERIALS.FIRE && element.type === MATERIALS.WATER) || 
                                     (bulletData.type === MATERIALS.WATER && element.type === MATERIALS.FIRE);
                const isFireVSOil = (bulletData.type === MATERIALS.FIRE && element.type === MATERIALS.OIL);
                const isIceVSWater = (bulletData.type === MATERIALS.ICE && element.type === MATERIALS.WATER) ||
                                    (bulletData.type === MATERIALS.WATER && element.type === MATERIALS.ICE);
                const isElectricVSWater = (bulletData.type === MATERIALS.ELECTRIC && element.type === MATERIALS.WATER);
                const isAcidVSWater = (bulletData.type === MATERIALS.ACID && element.type === MATERIALS.WATER) || 
                                     (bulletData.type === MATERIALS.WATER && element.type === MATERIALS.ACID);
                const isFireVSAcid = (bulletData.type === MATERIALS.FIRE && element.type === MATERIALS.ACID);

                if (isFireVSOil) {
                    const pos = { x: element.body.position.x, y: element.body.position.y };
                    const ew = element.w;
                    const eh = element.h;
                    this.destroyElement(element.id);
                    // Spawn fire with the SAME size as the oil puddle
                    this.spawnElement(pos, MATERIALS.FIRE, 5000, 100, bulletData.ownerId, ew, eh);
                    this.destroyBullet(bullet.id);
                    return;
                }

                if (isElectricVSWater) {
                    element.type = MATERIALS.ELECTRIC;
                    element.originalType = MATERIALS.WATER; // Track for reversion
                    element.expiresAt = Date.now() + 2000;
                    this.destroyBullet(bullet.id);
                    return;
                }

                if (isFireVSWater) {
                    // Only small water puddles (w < 150) can become steam
                    if (element.w < 150) {
                        this.spawnElement(bullet.position, MATERIALS.STEAM, 4000);
                        this.destroyElement(element.id);
                    } else {
                        // Large puddles just create a puff of steam but stay water
                        this.spawnElement(bullet.position, MATERIALS.STEAM, 1500);
                    }
                    this.destroyBullet(bullet.id);
                    return;
                }

                if (isIceVSWater) {
                    element.type = MATERIALS.ICE;
                    element.originalType = MATERIALS.WATER;
                    element.expiresAt = Date.now() + 5000; // Frozen for 5 seconds
                    this.destroyBullet(bullet.id);
                    return;
                }

                if (isAcidVSWater) {
                    // Dilution effect
                    if (element.type === MATERIALS.ACID) {
                        this.destroyElement(element.id);
                    }
                    this.destroyBullet(bullet.id);
                    return;
                }

                if (isFireVSAcid) {
                    // Fire + Acid = GAS cloud (Area denial)
                    this.spawnElement(element.body.position, MATERIALS.GAS, 6000, null, bulletData.ownerId, element.w * 1.5, element.h * 1.5);
                    this.destroyElement(element.id);
                    this.destroyBullet(bullet.id);
                    return;
                }

                if (bulletData.type === element.type) return;

                // Determine if this element should physically block bullets
                const isSolid = [
                    MATERIALS.BUILDING, 
                    MATERIALS.BARREL_EXPLOSIVE, 
                    MATERIALS.BARREL_OIL, 
                    MATERIALS.CRATE,
                    MATERIALS.DIRT
                ].includes(element.type);

                if (isSolid) {
                    if (element.hp != null) {
                        let damage = bulletData.damage;
                        // Kinetic Bonus: Metal vs Dirt/Building
                        if (bulletData.type === MATERIALS.METAL && (element.type === MATERIALS.DIRT || element.type === MATERIALS.BUILDING)) {
                            damage *= 2.0;
                        }
                        element.hp -= damage;
                        if (element.hp <= 0) {
                            if (element.type === MATERIALS.BUILDING) {
                                for (let i = 0; i < 10; i++) {
                                    this.spawnElement({
                                        x: element.body.position.x + (Math.random() - 0.5) * element.w,
                                        y: element.body.position.y + (Math.random() - 0.5) * element.h
                                    }, MATERIALS.SCRAP, 30000);
                                }
                            } else if (element.type === MATERIALS.BARREL_EXPLOSIVE) {
                                this.barrelExplode(element.body.position, 'fire', bulletData.ownerId);
                            } else if (element.type === MATERIALS.BARREL_OIL) {
                                this.barrelExplode(element.body.position, 'oil', bulletData.ownerId);
                            } else if (element.type === MATERIALS.CRATE) {
                                for (let i = 0; i < 3; i++) {
                                    this.spawnElement({
                                        x: element.body.position.x + (Math.random() - 0.5) * 30,
                                        y: element.body.position.y + (Math.random() - 0.5) * 30
                                    }, MATERIALS.SCRAP, 30000);
                                }
                            }
                            this.destroyElement(target.elementId);
                        }
                    }
                    this.destroyBullet(bullet.id);
                }
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

        // Bullet vs Puddle Alchemy is now handled in processBulletCollision for consistency
        if (elementA && elementB) {
            // Fire vs Ice -> Destroy both
            if ((elementA.type === MATERIALS.FIRE && elementB.type === MATERIALS.ICE) ||
                (elementB.type === MATERIALS.FIRE && elementA.type === MATERIALS.ICE)) {
                this.destroyElement(elementA.id);
                this.destroyElement(elementB.id);
            }

            // Fire vs Acid -> GAS
            if ((elementA.type === MATERIALS.FIRE && elementB.type === MATERIALS.ACID) ||
                (elementB.type === MATERIALS.FIRE && elementA.type === MATERIALS.ACID)) {
                const pos = { 
                    x: (elementA.body.position.x + elementB.body.position.x)/2, 
                    y: (elementA.body.position.y + elementB.body.position.y)/2 
                };
                const w = Math.max(elementA.w, elementB.w);
                const h = Math.max(elementA.h, elementB.h);
                this.destroyElement(elementA.id);
                this.destroyElement(elementB.id);
                this.spawnElement(pos, MATERIALS.GAS, 6000, null, null, w * 1.5, h * 1.5);
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

                if (element.type === MATERIALS.ELECTRIC && !isInvulnerable) {
                    const isLarge = element.w >= 150;
                    const canStun = now > p.statusEffects.stun && now > p.statusEffects.stunImmunity;

                    if (canStun) {
                        p.statusEffects.stun = now + 2000;
                        if (isLarge) {
                            // Large puddles stay but give 5s grace period AFTER stun wears off
                            p.statusEffects.stunImmunity = now + 2000 + 5000;
                            // Small puddles disappear/revert after one stun
                            if (element.originalType) {
                                element.type = element.originalType;
                                delete element.originalType;
                                delete element.expiresAt;
                            } else {
                                this.destroyElement(element.id);
                            }
                        }
                    }
                }
                if ((element.type === MATERIALS.ICE || element.type === MATERIALS.OIL)) p.statusEffects.slip = now + 1000;
                
                // Burning tanks melt ice
                if (element.type === MATERIALS.ICE && now < p.statusEffects.burn) {
                    this.destroyElement(element.id);
                }
                
                if (element.type === MATERIALS.FIRE && !isInvulnerable) p.hp -= 0.5;
                
                if (element.type === MATERIALS.ACID && !isInvulnerable) {
                    p.hp -= 1.2;
                    // If tank is burning, trigger gas reaction!
                    if (now < p.statusEffects.burn) {
                        this.spawnElement(element.body.position, MATERIALS.GAS, 6000, null, p.id, element.w * 1.5, element.h * 1.5);
                        this.destroyElement(element.id);
                    }
                }
                if (element.type === MATERIALS.GAS && !isInvulnerable) p.hp -= 0.6;
                if (element.type === MATERIALS.STEAM) {
                    const isRevealed = p.statusEffects.revealed && now < p.statusEffects.revealed;
                    if (!isRevealed) p.hidden = true;
                }
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

    barrelExplode(pos, type, ownerId) {
        const radius = 180;
        Object.values(this.players).forEach(p => {
            const dist = Vector.magnitude(Vector.sub(p.body.position, pos));
            if (dist < radius) {
                const damage = (1 - dist/radius) * 70;
                p.hp -= damage;
                if (p.hp <= 0) this.respawn(p, ownerId, 'EXPLOSION');
            }
        });

        io.to(this.id).emit('explosion', { x: pos.x, y: pos.y, radius });

        if (type === 'fire') {
            for (let i = 0; i < 5; i++) {
                this.spawnElement({
                    x: pos.x + (Math.random() - 0.5) * 100,
                    y: pos.y + (Math.random() - 0.5) * 100
                }, MATERIALS.FIRE, 8000, 100, ownerId, 60, 60);
            }
        } else {
            for (let i = 0; i < 3; i++) {
                this.spawnElement({
                    x: pos.x + (Math.random() - 0.5) * 120,
                    y: pos.y + (Math.random() - 0.5) * 120
                }, MATERIALS.OIL, null, null, null, 80, 80);
            }
        }
    }

    spawnElement(pos, type, duration = null, hp = null, ownerId = null, customW = null, customH = null) {
        // Prevent spawning elements inside buildings
        const solidTypes = [MATERIALS.BUILDING, MATERIALS.CRATE, MATERIALS.BARREL_EXPLOSIVE, MATERIALS.BARREL_OIL, MATERIALS.DIRT];
        if (type !== MATERIALS.BUILDING) {
            const config = MATERIAL_PROPERTIES[type] || { w: 30, h: 30 };
            const ew = customW || config.w;
            const eh = customH || config.h;

            const buildings = Object.values(this.elements)
                .filter(e => e.type === MATERIALS.BUILDING)
                .map(e => e.body);
            
            // Dimension-aware overlap check
            const overlaps = Query.region(buildings, {
                min: { x: pos.x - ew/2, y: pos.y - eh/2 },
                max: { x: pos.x + ew/2, y: pos.y + eh/2 }
            });
            if (overlaps.length > 0) return null;

            // NEW: Sidewalk check for URBAN biome
            if (this.mapType === 'URBAN') {
                const blockSize = 350;
                const streetWidth = 150;
                const padding = 150;
                const step = blockSize + streetWidth;
                const buffer = 20; // Sidewalk extension

                const relativeX = (pos.x - (padding - buffer)) % step;
                const relativeY = (pos.y - (padding - buffer)) % step;
                
                // If we are within the blockSize + buffer*2 area, we are on a sidewalk/building lot
                if (relativeX >= 0 && relativeX < blockSize + buffer * 2 &&
                    relativeY >= 0 && relativeY < blockSize + buffer * 2) {
                    return null;
                }
            }

            // NEW: Prevent physical props from overlapping each other
            if (solidTypes.includes(type)) {
                const otherSolids = Object.values(this.elements)
                    .filter(e => solidTypes.includes(e.type))
                    .map(e => e.body);
                
                // Increased spacing to prevent tight clustering
                const spacing = 120; 
                const overlaps = Query.region(otherSolids, {
                    min: { x: pos.x - spacing, y: pos.y - spacing },
                    max: { x: pos.x + spacing, y: pos.y + spacing }
                });
                if (overlaps.length > 0) return null;
            }
        }

        const config = MATERIAL_PROPERTIES[type] || { w: 30, h: 30 };
        const w = customW || config.w;
        const h = customH || config.h;

        // Boundary check
        const padding = 10;
        if (pos.x - w/2 < padding || pos.x + w/2 > this.worldSize - padding ||
            pos.y - h/2 < padding || pos.y + h/2 > this.worldSize - padding) {
            return null;
        }

        const id = ++this.lastElementId;
        const isSolid = solidTypes.includes(type);
        
        // Auto-assign HP to Dirt if not provided
        if (type === MATERIALS.DIRT && hp === null) hp = 150;

        const body = Bodies.rectangle(pos.x, pos.y, w, h, {
            label: 'element',
            isStatic: true,
            isSensor: !isSolid
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
                if (e.originalType) {
                    // Revert to original state instead of destroying
                    e.type = e.originalType;
                    e.originalType = null;
                    e.expiresAt = null; 
                } else {
                    this.destroyElement(id);
                }
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

        let isOpponentKill = false;

        if (killerId && this.players[killerId]) {
            const killer = this.players[killerId];
            const victim = player;
            
            // Only count as opponent kill if teams are different
            if (killer.team !== victim.team) {
                killer.kills++;
                isOpponentKill = true;
            }
            
            io.to(this.id).emit('kill-feed', {
                killer: killer.username,
                victim: victim.username,
                weapon: weaponType,
                killerTeam: killer.team,
                victimTeam: victim.team
            });
        } else if (killerId && killerId.startsWith('guardian-')) {
             // Drone kill
             io.to(this.id).emit('kill-feed', {
                killer: 'GUARDIAN',
                victim: player.username,
                weapon: weaponType,
                killerTeam: 'neutral',
                victimTeam: player.team
            });
        } else {
            // Environment kill (Acid, Fire, etc)
            io.to(this.id).emit('kill-feed', {
                killer: 'WORLD',
                victim: player.username,
                weapon: weaponType,
                killerTeam: 'neutral',
                victimTeam: player.team
            });
        }

        if (isOpponentKill && !this.gameOver) {
            const otherTeam = player.team === 'blue' ? 'pink' : 'blue';
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

    replenishElements() {
        const envTypes = [MATERIALS.WATER, MATERIALS.OIL, MATERIALS.ELECTRIC, MATERIALS.ACID, MATERIALS.ICE];
        const allElements = Object.values(this.elements);
        const currentEnvCount = allElements.filter(e => envTypes.includes(e.type)).length;
        
        // Optimized density: approx 4.5 puddles per 1M square pixels
        const areaTarget = Math.floor((this.worldSize * this.worldSize) / (1000 * 1000) * 4.5); 
        const targetCount = Math.max(11, areaTarget); // Increased minimum by 2 more as requested
        
        if (currentEnvCount < targetCount) {
            let pos = null;
            for (let i = 0; i < 20; i++) {
                const testPos = {
                    x: 200 + Math.random() * (this.worldSize - 400),
                    y: 200 + Math.random() * (this.worldSize - 400)
                };
                
                // Density check: check if too many puddles exist in local 800px region (increased from 600)
                const localElements = allElements.filter(e => {
                    if (!envTypes.includes(e.type)) return false;
                    const dx = e.body.position.x - testPos.x;
                    const dy = e.body.position.y - testPos.y;
                    return (dx*dx + dy*dy) < 800*800;
                });
                
                if (localElements.length < 1) { // Ensure even more space between hazards
                    pos = testPos;
                    break;
                }
            }
            
            if (!pos) return;
            
            let pType;
            const biome = this.mapType;
            if (biome === 'WASTELAND') {
                pType = Math.random() > 0.6 ? MATERIALS.ACID : MATERIALS.OIL;
            } else if (biome === 'INDUSTRIAL') {
                const r = Math.random();
                if (r < 0.5) pType = MATERIALS.ELECTRIC;
                else if (r < 0.7) pType = MATERIALS.ACID;
                else if (r < 0.85) pType = MATERIALS.WATER;
                else pType = MATERIALS.OIL;
            } else if (biome === 'WETLAND') {
                const r = Math.random();
                if (r < 0.4) pType = MATERIALS.WATER;
                else if (r < 0.75) pType = MATERIALS.ACID;
                else pType = MATERIALS.GAS;
            } else if (biome === 'TUNDRA') {
                pType = MATERIALS.ICE;
            } else {
                pType = Math.random() > 0.6 ? MATERIALS.WATER : MATERIALS.OIL;
            }
            
            // Scaled size: random but smaller overall
            const size = 80 + Math.random() * 80;
            this.spawnElement(pos, pType, null, null, null, size, size);
        }
    }

    update() {
        const now = Date.now();

        if (this.active && !this.gameOver) {
            if (now - this.lastTimeTick >= 1000) {
                this.matchTimer--;
                this.lastTimeTick = now;
                if (this.matchTimer <= 0) this.checkMatchEnd();
                
                // Puddle Replenishment (Check every second, but only spawn if needed)
                this.replenishElements();

                // Periodic Guardian Spawn (with cooldown)
                if (this.active && Object.keys(this.guardians).length < 2 && now > (this.nextGuardianSpawn || 0)) {
                    this.spawnGuardian();
                }
            }

            this.processBots(now);
            this.processGuardians(now);
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
                const isSlipping = now < statusEffects.slip;
                const isSlowed = now < statusEffects.slow;
                const isBurning = now < statusEffects.burn;

                if (isBurning) p.hp -= 0.3; // Damage over time while burning

                // Adjust friction: Slips (Ice/Oil) are now less extreme (0.04 instead of 0.01)
                const baseFriction = isSlipping ? 0.04 : (zone.type === 'TUNDRA' ? 0.015 : biome.friction);
                const friction = config.speed > 0.005 ? baseFriction : baseFriction * 1.5;
                if (body.frictionAir !== friction) body.frictionAir = friction;
                
                const moveSpeed = config.speed * biome.speedMult * (isSlowed ? 0.5 : 1.0);
                const turnSpeed = config.turnSpeed * (isSlowed ? 0.6 : 1.0);

                if (inputs.left) Body.setAngularVelocity(body, -turnSpeed);
                if (inputs.right) Body.setAngularVelocity(body, turnSpeed);
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
        
        // Scrap Bonus: +100% damage per 100 scrap; -50% reload per 200 scrap
        const scrapBuff = 1 + (p.scrap / 100); 
        const reloadTime = baseWeapon.reload / (1 + (p.scrap / 200));

        if (now - p.lastShot > reloadTime) {
            // Apply damage bonus in the fire call
            this.fire(p, baseWeapon, moduleName, scrapBuff);
            p.lastShot = now;
        }
    }

    processBots(now) {
        const bots = Object.values(this.players).filter(p => p.isBot);
        if (bots.length === 0) return;

        // Optimization: Get obstacles once per frame
        const obstacles = Composite.allBodies(this.engine.world).filter(b => {
            if (b.label === 'bullet') return false;
            if (!b.isSensor) return true;
            // Bots also "see" hazardous sensors as obstacles to avoid them
            if (b.label === 'element') {
                const e = this.elements[b.elementId];
                if (e && [MATERIALS.FIRE, MATERIALS.ELECTRIC, MATERIALS.ACID, MATERIALS.GAS].includes(e.type)) return true;
            }
            return false;
        });

        bots.forEach(bot => {
            if (bot.hp <= 0 || bot.isActive === false) {
                bot.inputs = { up: false, down: false, left: false, right: false, shoot: false };
                return;
            }

            // 0. Dodge Logic (Gap fix)
            // Bots have a chance to evade incoming bullets if they are close
            if (now > (bot.evadeUntil || 0)) {
                const nearbyBullets = Object.values(this.bullets).filter(b => {
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

            // Target nearest enemy
            Object.values(this.players).forEach(p => {
                if (p.id !== bot.id && p.team !== bot.team && p.hp > 0 && !p.hidden) {
                    const d = Vector.magnitude(Vector.sub(p.body.position, bot.body.position));
                    if (d < minDist) {
                        minDist = d;
                        target = p;
                    }
                }
            });

            if (target) {
                objectivePos = target.body.position;
            } else {
                // If no enemy, wander
                if (!bot.wanderTarget || now > (bot.nextWanderChange || 0)) {
                    bot.wanderTarget = {
                        x: 500 + Math.random() * (this.worldSize - 1000),
                        y: 500 + Math.random() * (this.worldSize - 1000)
                    };
                    bot.nextWanderChange = now + 8000 + Math.random() * 5000;
                }
                objectivePos = bot.wanderTarget;
            }

            if (!objectivePos) return;

            // 2. Simple Pathfinding (Avoidance)
            let avoidX = 0;
            let avoidY = 0;
            const lookAhead = 200;
            
            const rays = [-0.7, 0, 0.7];
            rays.forEach(offset => {
                const angle = bot.body.angle + offset;
                const end = {
                    x: bot.body.position.x + Math.cos(angle) * lookAhead,
                    y: bot.body.position.y + Math.sin(angle) * lookAhead
                };
                const hits = Query.ray(obstacles, bot.body.position, end);
                if (hits.length > 0 && hits[0].body !== bot.body) {
                    const force = (lookAhead - (hits[0].fraction * lookAhead)) / lookAhead;
                    avoidX -= Math.cos(angle) * force * 15;
                    avoidY -= Math.sin(angle) * force * 15;
                    // Side nudge
                    const side = offset >= 0 ? -1 : 1;
                    avoidX += Math.cos(angle + Math.PI/2 * side) * force * 10;
                    avoidY += Math.sin(angle + Math.PI/2 * side) * force * 10;
                }
            });

            const angleToObj = Math.atan2(objectivePos.y - bot.body.position.y, objectivePos.x - bot.body.position.x);
            const moveX = Math.cos(angleToObj) * 10 + avoidX;
            const moveY = Math.sin(angleToObj) * 10 + avoidY;
            const moveAngle = Math.atan2(moveY, moveX);

            // 3. Apply Inputs
            let angleDiff = moveAngle - bot.body.angle;
            angleDiff = Math.atan2(Math.sin(angleDiff), Math.cos(angleDiff));

            bot.inputs.left = angleDiff < -0.2;
            bot.inputs.right = angleDiff > 0.2;
            
            const distToObj = Vector.magnitude(Vector.sub(objectivePos, bot.body.position));
            
            // If evading, prioritize side movement
            if (now < (bot.evadeUntil || 0)) {
                bot.inputs = {
                    up: Math.random() > 0.3, 
                    down: false,
                    left: bot.evadeDir > 0,
                    right: bot.evadeDir < 0,
                    shoot: distToObj < 600
                };
                return;
            }

            if (distToObj < 100) {
                bot.inputs.up = Math.abs(angleDiff) < 1.2;
                bot.inputs.down = false;
            } else {
                bot.inputs.up = false;
                bot.inputs.down = (target && distToObj < 100);
            }

            // 4. Aim & Shoot
            if (target) {
                bot.inputs.aimAngle = Math.atan2(target.body.position.y - bot.body.position.y, target.body.position.x - bot.body.position.x);
                bot.inputs.shoot = distToObj < 1000;
            } else {
                bot.inputs.aimAngle = bot.body.angle;
                bot.inputs.shoot = false;
            }

            // Stuck Recovery
            const dPos = Vector.magnitude(Vector.sub(bot.body.position, bot.lastPos || bot.body.position));
            bot.lastPos = { x: bot.body.position.x, y: bot.body.position.y };
            if (dPos < 0.2 && (bot.inputs.up || bot.inputs.down)) {
                bot.stuckTicks = (bot.stuckTicks || 0) + 1;
            } else {
                bot.stuckTicks = 0;
            }

            if (bot.stuckTicks > 40) {
                bot.reverseUntil = now + 1000;
                bot.panicDir = Math.random() > 0.5 ? 1 : -1;
                bot.stuckTicks = 0;
            }

            if (now < (bot.reverseUntil || 0)) {
                bot.inputs = { up: false, down: true, left: bot.panicDir > 0, right: bot.panicDir < 0, shoot: false };
            }
        });
    }

    spawnGuardian() {
        const id = ++this.lastGuardianId;
        const orbitCenter = { x: this.worldSize / 2, y: this.worldSize / 2 };
        const orbitRadius = 400 + Math.random() * 300;
        const startAngle = Math.random() * Math.PI * 2;
        
        const pos = {
            x: orbitCenter.x + Math.cos(startAngle) * orbitRadius,
            y: orbitCenter.y + Math.sin(startAngle) * orbitRadius
        };

        const body = Bodies.circle(pos.x, pos.y, 25, {
            frictionAir: 0.05,
            mass: 5,
            label: `guardian-${id}`,
            restitution: 0.5
        });

        this.guardians[id] = {
            id,
            body,
            hp: 200,
            maxHp: 200,
            orbitCenter,
            orbitRadius,
            angle: startAngle,
            lastShot: 0,
            speed: 0.005 + Math.random() * 0.005
        };

        Composite.add(this.engine.world, body);
        io.to(this.id).emit('player-event', { text: 'GUARDIAN DRONE DETECTED', color: '#ffcc00' });
    }

    destroyGuardian(id, killerId) {
        const g = this.guardians[id];
        if (g) {
            // Drop lots of scrap
            for (let i = 0; i < 15; i++) {
                this.spawnElement({
                    x: g.body.position.x + (Math.random() - 0.5) * 60,
                    y: g.body.position.y + (Math.random() - 0.5) * 60
                }, MATERIALS.SCRAP, 60000);
            }
            
            if (killerId && this.players[killerId]) {
                io.to(this.id).emit('player-event', { text: `${this.players[killerId].username} DESTROYED A GUARDIAN`, color: '#00ff00' });
            }

            Composite.remove(this.engine.world, g.body);
            delete this.guardians[id];
            
            // Cooldown: wait 45 seconds before allowing another spawn
            this.nextGuardianSpawn = Date.now() + 45000;
        }
    }

    processGuardians(now) {
        Object.values(this.guardians).forEach(g => {
            // 1. Orbit Movement
            g.angle += g.speed;
            const targetX = g.orbitCenter.x + Math.cos(g.angle) * g.orbitRadius;
            const targetY = g.orbitCenter.y + Math.sin(g.angle) * g.orbitRadius;
            
            const force = Vector.mult(Vector.normalise(Vector.sub({ x: targetX, y: targetY }, g.body.position)), 0.005);
            Body.applyForce(g.body, g.body.position, force);

            // 2. Targeting
            let target = null;
            let minDist = 800;
            Object.values(this.players).forEach(p => {
                if (p.hp > 0 && !p.hidden) {
                    const d = Vector.magnitude(Vector.sub(p.body.position, g.body.position));
                    if (d < minDist) {
                        minDist = d;
                        target = p;
                    }
                }
            });

            if (target && now - g.lastShot > 1500) {
                const aimAngle = Math.atan2(target.body.position.y - g.body.position.y, target.body.position.x - g.body.position.x);
                this.fireGuardianPulse(g, aimAngle);
                g.lastShot = now;
            }
        });
    }

    fireGuardianPulse(g, angle) {
        const bulletId = ++this.lastBulletId;
        const pos = {
            x: g.body.position.x + Math.cos(angle) * 40,
            y: g.body.position.y + Math.sin(angle) * 40
        };
        const bullet = Bodies.circle(pos.x, pos.y, 8, {
            label: 'bullet',
            frictionAir: 0,
            mass: 0.1
        });
        bullet.id = bulletId;
        bullet.customData = {
            ownerId: `guardian-${g.id}`,
            damage: 15,
            impact: 0.02,
            type: MATERIALS.ELECTRIC,
            weapon: 'GUARDIAN_PULSE',
            expiresAt: Date.now() + 1500
        };
        Body.setVelocity(bullet, {
            x: Math.cos(angle) * 12,
            y: Math.sin(angle) * 12
        });
        this.bullets[bulletId] = bullet;
        Composite.add(this.engine.world, bullet);
    }


    fire(p, weapon, moduleName = 'UNKNOWN', scrapBuff = 1) {
        const id = ++this.lastBulletId;
        const fireDist = weapon.type === MATERIALS.DIRT ? 80 : 45;
        const aimAngle = p.inputs.aimAngle !== undefined ? p.inputs.aimAngle : p.body.angle;
        const pos = {
            x: p.body.position.x + Math.cos(aimAngle) * fireDist,
            y: p.body.position.y + Math.sin(aimAngle) * fireDist
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
            x: Math.cos(aimAngle) * weapon.speed,
            y: Math.sin(aimAngle) * weapon.speed
        });
        const recoil = weapon.recoil || 0;
        if (recoil > 0) {
            Body.applyForce(p.body, p.body.position, {
                x: -Math.cos(aimAngle) * recoil,
                y: -Math.sin(aimAngle) * recoil
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
        if (weapon.type === MATERIALS.ICE) {
            this.spawnElement({
                x: pos.x + Math.cos(p.body.angle) * 20,
                y: pos.y + Math.sin(p.body.angle) * 20
            }, MATERIALS.ICE, 2000, undefined, p.id);
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
                aimAngle: p.inputs.aimAngle !== undefined ? p.inputs.aimAngle : p.body.angle,
                hp: p.hp, maxHp: p.maxHp, weapon: p.slots[p.currentSlot],
                currentSlot: p.currentSlot, slots: p.slots, scrap: p.scrap, hidden: p.hidden,
                stunned: p.statusEffects.stun > Date.now(),
                slowed: p.statusEffects.slow > Date.now(),
                burning: p.statusEffects.burn > Date.now(),
                wet: p.statusEffects.wet > Date.now(),
                invulnerable: p.invulnerableUntil && Date.now() < p.invulnerableUntil
            })),
            guardians: Object.values(this.guardians).map(g => ({
                id: g.id, x: g.body.position.x, y: g.body.position.y,
                angle: g.angle, hp: g.hp, maxHp: g.maxHp
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

    startGame(mapType = 'RANDOM') {
        if (this.active) return;
        
        const playerCount = Object.keys(this.players).length;
        this.setupWorld(playerCount, mapType);

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
            
            // Persistence: Save stats for all human players
            Object.values(this.players).forEach(p => {
                if (!p.isBot && playerData[p.username]) {
                    playerData[p.username].kills += p.kills;
                    playerData[p.username].deaths += p.deaths;
                    playerData[p.username].scrap += p.scrap;
                    playerData[p.username].lastSeen = Date.now();
                }
            });
            savePlayers();

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

// Socket.io Rate Limiting Middleware
io.use((socket, next) => {
    socket.eventCount = 0;
    socket.lastReset = Date.now();
    next();
});

io.on('connection', (socket) => {
    // Per-event rate limit (100 events/sec)
    socket.use(([event, ...args], next) => {
        const now = Date.now();
        if (now - socket.lastReset > 1000) {
            socket.eventCount = 0;
            socket.lastReset = now;
        }
        socket.eventCount++;
        
        if (socket.eventCount > 100) {
            return; // Drop the event quietly
        }
        next();
    });

    console.log('User connected:', socket.id);

    if (IS_DEV) {
        socket.emit('debug-init');
    }
    socket.on('join-game', async (data) => {
        if (!data || typeof data.username !== 'string' || data.username.trim() === '') return;
        let { username, chassisType, pin } = data;
        username = username.trim().substring(0, 12);
        if (!['SCOUT', 'BRAWLER', 'ARTILLERY'].includes(chassisType)) chassisType = 'SCOUT';

        // PIN Authentication & Validation
        if (!pin || pin.length < 4 || pin.length > 10) {
            socket.emit('auth-error', { message: 'PIN MUST BE 4-10 DIGITS!' });
            return;
        }
        
        if (playerData[username]) {
            if (!pin || !playerData[username].pin) {
                // If existing user has no PIN (legacy), set it now
                if (pin) playerData[username].pin = await bcrypt.hash(pin, 10);
            } else {
                const match = await bcrypt.compare(pin, playerData[username].pin);
                if (!match) {
                    socket.emit('auth-error', { message: 'INVALID PIN FOR THIS CALLSIGN!' });
                    return;
                }
            }
        } else {
            // New user: hash PIN if provided, otherwise use default
            const hashedPin = pin ? await bcrypt.hash(pin, 10) : null;
            playerData[username] = { kills: 0, deaths: 0, scrap: 0, lastSeen: Date.now(), pin: hashedPin };
        }

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
        io.to(bestLobby.id).emit('player-event', { text: `${username.toUpperCase()} JOINED THE BATTLE`, color: '#00f2ff' });
        io.to(bestLobby.id).emit('lobby-update', {
            id: bestLobby.id,
            players: Object.values(bestLobby.players).map(p => ({ username: p.username, team: p.team, id: p.id, chassis: p.chassis }))
        });
    });

    socket.on('host-game', async (data) => {
        if (!data || typeof data.username !== 'string' || data.username.trim() === '') return;
        let { username, chassisType, pin } = data;
        username = username.trim().substring(0, 12);
        if (!['SCOUT', 'BRAWLER', 'ARTILLERY'].includes(chassisType)) chassisType = 'SCOUT';

        // PIN Authentication & Validation
        if (!pin || pin.length < 4 || pin.length > 10) {
            socket.emit('auth-error', { message: 'PIN MUST BE 4-10 DIGITS!' });
            return;
        }
        
        if (playerData[username]) {
            if (!pin || !playerData[username].pin) {
                if (pin) playerData[username].pin = await bcrypt.hash(pin, 10);
            } else {
                const match = await bcrypt.compare(pin, playerData[username].pin);
                if (!match) {
                    socket.emit('auth-error', { message: 'INVALID PIN FOR THIS CALLSIGN!' });
                    return;
                }
            }
        } else {
            const hashedPin = pin ? await bcrypt.hash(pin, 10) : null;
            playerData[username] = { kills: 0, deaths: 0, scrap: 0, lastSeen: Date.now(), pin: hashedPin };
        }

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

    socket.on('input', (data) => {
        const lobby = lobbies[socket.lobbyId];
        if (lobby && lobby.players[socket.id]) {
            // Sanitization: Only allow expected properties and force correct types
            const sanitized = {
                up: !!data?.up,
                down: !!data?.down,
                left: !!data?.left,
                right: !!data?.right,
                shoot: !!data?.shoot,
                aimAngle: typeof data?.aimAngle === 'number' && !isNaN(data.aimAngle) ? data.aimAngle : 0
            };
            lobby.players[socket.id].inputs = sanitized;
        }
    });

    socket.on('switch-weapon', (slotIndex) => {
        const lobby = lobbies[socket.lobbyId];
        if (lobby && lobby.players[socket.id]) {
            const p = lobby.players[socket.id];
            if (slotIndex >= 0 && slotIndex < p.slots.length) p.currentSlot = slotIndex;
        }
    });

    socket.on('start-game', (data) => {
        const lobby = lobbies[socket.lobbyId];
        if (lobby && Object.keys(lobby.players).length >= MIN_PLAYERS) {
            lobby.startGame(data?.mapType);
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
        if (lobby && lobby.players[socket.id]) {
            const p = lobby.players[socket.id];
            
            // Allow normal switch only if not active, but ONLY allow DEV switch in development mode
            const isDevSwitch = (chassisType === 'DEV' && IS_DEV);
            if (!lobby.active || isDevSwitch) {
                if (CHASSIS[chassisType]) {
                    const config = CHASSIS[chassisType];
                    p.chassis = chassisType;
                    p.hp = config.hp;
                    p.maxHp = p.hp;
                    p.slots = config.weapons;
                    p.currentSlot = 0;
                    
                    // Update physics body if it exists
                    if (p.body) {
                        Body.setMass(p.body, config.mass);
                    }
                    
                    if (!lobby.active) {
                        io.to(lobby.id).emit('lobby-update', {
                            id: lobby.id,
                            players: Object.values(lobby.players).map(p => ({ username: p.username, team: p.team, id: p.id, chassis: p.chassis }))
                        });
                    } else {
                        // Notify match that a player changed (for health bars etc)
                        io.to(lobby.id).emit('player-event', { text: `${p.username.toUpperCase()} ACTIVATED DEV MODE`, color: '#00ff00' });
                    }
                }
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
            const p = lobby.players[socket.id];
            const username = p ? p.username : 'PLAYER';
            lobby.removePlayer(socket.id);
            if (Object.values(lobby.players).filter(p => !p.isBot).length === 0) {
                lobby.destroy();
                delete lobbies[socket.lobbyId];
            } else {
                io.to(lobby.id).emit('player-event', { text: `${username.toUpperCase()} LEFT THE BATTLE`, color: '#ff3333' });
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
