import Matter from 'matter-js';
import { Server } from 'socket.io';
import { MATERIALS, MATERIAL_PROPERTIES, BIOMES, CHASSIS, WEAPON_MODULES } from '../gameConfig.js';
import { MapGenerator } from './MapGenerator.js';
import { BotAI } from './BotAI.js';
import { CombatEngine } from './CombatEngine.js';
import { Navigation } from './Navigation.js';
import { getPlayerData, savePlayers } from './Persistence.js';

const { Engine, Bodies, Body, Composite, Vector, Query, Bounds } = Matter;

export class Lobby {
    constructor(id, io) {
        this.id = id;
        this.io = io;
        this.players = {};
        this.active = false;
        this.engine = Engine.create({ gravity: { x: 0, y: 0 } });
        this.bullets = {};
        this.elements = {};
        this.zones = [];
        this.lastBulletId = 0;
        this.lastElementId = 0;
            
        this.matchTimer = 480;
        this.scoreCap = 20;

        this.scores = { blue: 0, pink: 0 };
        this.gameOver = false;
        this.guardians = {};
        this.lastGuardianId = 0;
        this.nextGuardianSpawn = 0;
        this.lastTimeTick = Date.now();
        this.worldSize = 2500;
        this.walls = [];

        this.mapGenerator = new MapGenerator(this);
        this.navGrid = new Navigation(this);
        this.botAI = new BotAI(this);
        this.combatEngine = new CombatEngine(this, io);

        this.setupWorld(2);
        
        this.physicsInterval = setInterval(() => {
            try {
                this.update();
                Engine.update(this.engine, 1000 / 60);
                this.cleanupElements();
            } catch (e) {
                console.error('CRITICAL: Physics update failed in lobby', this.id, e);
            }
        }, 1000 / 60);

        this.syncInterval = setInterval(() => {
            this.broadcastState();
        }, 1000 / 30);
    }

    setupWorld(playerCount, forcedMapType = 'RANDOM') {
        Object.values(this.elements).forEach(e => Composite.remove(this.engine.world, e.body));
        this.elements = {};
        this.zones = [];
        this.walls.forEach(w => Composite.remove(this.engine.world, w));
        this.walls = [];

        if (playerCount <= 2) this.worldSize = 1800;
        else if (playerCount <= 4) this.worldSize = 2400;
        else if (playerCount <= 6) this.worldSize = 3000;
        else if (playerCount <= 8) this.worldSize = 3500;
        else this.worldSize = 4000;

        const wallThickness = 100;
        const walls = [
            Bodies.rectangle(this.worldSize/2, -wallThickness/2, this.worldSize, wallThickness, { isStatic: true, label: 'wall' }),
            Bodies.rectangle(this.worldSize/2, this.worldSize + wallThickness/2, this.worldSize, wallThickness, { isStatic: true, label: 'wall' }),
            Bodies.rectangle(-wallThickness/2, this.worldSize/2, wallThickness, this.worldSize, { isStatic: true, label: 'wall' }),
            Bodies.rectangle(this.worldSize + wallThickness/2, this.worldSize/2, wallThickness, this.worldSize, { isStatic: true, label: 'wall' })
        ];
        this.walls = walls;
        Composite.add(this.engine.world, walls);

        this.mapGenerator.generateMap(forcedMapType);
        this.navGrid.buildGrid();
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
            const bodies = Query.region(Object.values(this.elements).map(e => e.body), {
                min: { x: pos.x - 40, y: pos.y - 40 },
                max: { x: pos.x + 40, y: pos.y + 40 }
            });
            if (bodies.length === 0) break;
            attempts++;
        }
        pos.x = Math.max(100, Math.min(this.worldSize - 100, pos.x));
        pos.y = Math.max(100, Math.min(this.worldSize - 100, pos.y));
        return pos;
    }

    mapLobbyPlayers() {
        return Object.values(this.players).map(p => ({ 
            u: p.username, t: p.team, id: p.id, ch: p.chassis, sl: p.slots, isBot: !!p.isBot,
            botDifficulty: p.botDifficulty, ready: p.isBot ? true : !!p.ready 
        }));
    }

    addPlayer(socket, username, chassisType = 'SCOUT') {
        const team = Object.values(this.players).filter(p => p.team === 'blue').length <= 
                     Object.values(this.players).filter(p => p.team === 'pink').length ? 'blue' : 'pink';
        const botOnTeam = Object.values(this.players).find(p => p.isBot && p.team === team);
        if (botOnTeam) this.removePlayer(botOnTeam.id);

        const startPos = this.getRandomSpawn(team);
        const config = CHASSIS[chassisType];
        
        const body = Bodies.circle(startPos.x, startPos.y, 20, {
            frictionAir: config.speed > 0.005 ? 0.1 : 0.2, mass: config.mass,
            label: `tank-${socket.id}`, friction: 0.02, restitution: 0.1
        });
        
        if (team === 'pink') Body.setAngle(body, Math.PI);
        Composite.add(this.engine.world, body);

        this.players[socket.id] = {
            id: socket.id, username, team, chassis: chassisType, hp: config.hp, maxHp: config.hp, body,
            slots: [...config.weapons], currentSlot: 0, lastShot: 0, scrap: 0, kills: 0, deaths: 0,
            statusEffects: { stun: 0, slip: 0, slow: 0, burn: 0, wet: 0, stunImmunity: 0, revealed: 0, quicksand: 0, trapImmunity: 0 },
            inputs: { up: false, down: false, left: false, right: false, shoot: false, aimAngle: 0 },
            lastInputSeq: 0, lastBuffLevel: 0, upgrades: { health: 0, speed: 0, power: 0 }, ready: false
        };
    }

    addBot(difficulty = 'NORMAL', pos = null, isActive = true, forcedTeam = null, forcedChassis = 'RANDOM') {
        const botNames = ['Ironclad', 'Panzer', 'Steel Rain', 'Blitz', 'Vanguard', 'Sentinel', 'Titan', 'Reaper', 'Havoc', 'Goliath'];
        const existingNames = Object.values(this.players).map(p => p.username);
        const availableNames = botNames.filter(n => !existingNames.includes(n));
        const username = availableNames.length > 0 ? 
            availableNames[Math.floor(Math.random() * availableNames.length)] : 
            `Bot-${Math.random().toString(36).substring(7, 10).toUpperCase()}`;

        const id = 'bot-' + Math.random().toString(36).substring(7);
        let chassisType = forcedChassis === 'RANDOM' ? ['SCOUT', 'BRAWLER', 'ARTILLERY'][Math.floor(Math.random()*3)] : forcedChassis;
        const team = forcedTeam || (Object.keys(this.players).length % 2 === 0 ? 'blue' : 'pink');
        const startPos = pos || this.getRandomSpawn(team);
        const config = CHASSIS[chassisType];
        
        const body = Bodies.circle(startPos.x, startPos.y, 20, {
            frictionAir: config.frictionAir || 0.15, friction: 0.02, restitution: 0.1, mass: config.mass, label: `tank-${id}`
        });
        
        if (team === 'pink' && !pos) Body.setAngle(body, Math.PI);
        Composite.add(this.engine.world, body);

        this.players[id] = {
            id, username, team, chassis: chassisType, hp: config.hp, maxHp: config.hp, body,
            slots: [...config.weapons], currentSlot: 0, lastShot: 0, scrap: 0, kills: 0, deaths: 0,
            statusEffects: { stun: 0, slip: 0, slow: 0, burn: 0, wet: 0, stunImmunity: 0, revealed: 0, quicksand: 0, trapImmunity: 0 },
            inputs: { up: false, down: false, left: false, right: false, shoot: false, aimAngle: 0 },
            lastInputSeq: 0, isBot: true, botDifficulty: difficulty, isActive: isActive,
            nextWeaponSwap: 0, stuckTicks: 0, evadeUntil: 0, evadeDir: 1, 
            targetOffset: { x: (Math.random()-0.5)*150, y: (Math.random()-0.5)*150 },
            role: Math.random() > 0.6 ? 'FLANKER' : 'ASSAULT', strafeDir: Math.random() > 0.5 ? 1 : -1,
            lastRoleSwitch: Date.now(), path: [], lastPathUpdate: 0, lastBuffLevel: 0,
            upgrades: { health: 0, speed: 0, power: 0 }, ready: true
        };
    }

    removePlayer(socketId) {
        const p = this.players[socketId];
        if (p) {
            const wasBot = p.isBot;
            const team = p.team;
            const username = p.username;
            const playerData = getPlayerData();
            if (!wasBot && playerData[username]) {
                playerData[username].kills += p.kills;
                playerData[username].deaths += p.deaths;
                playerData[username].scrap += p.scrap;
                playerData[username].lastSeen = Date.now();
                savePlayers(playerData);
            }
            Composite.remove(this.engine.world, p.body);
            delete this.players[socketId];
            if (!wasBot) this.addBot('NORMAL', null, true, team);
        }
    }

    spawnElement(pos, type, duration = null, hp = null, ownerId = null, customW = null, customH = null, ignoreId = null) {
        const solidTypes = [
            MATERIALS.BUILDING, MATERIALS.CRATE, MATERIALS.DIRT,
            MATERIALS.BARREL_EXPLOSIVE, MATERIALS.BARREL_OIL,
            MATERIALS.BARREL_ACID, MATERIALS.BARREL_ELECTRIC,
            MATERIALS.BARREL_FROST, MATERIALS.BARREL_GAS
        ];
        const config = MATERIAL_PROPERTIES[type] || { w: 30, h: 30 };
        const ew = customW || config.w;
        const eh = customH || config.h;

        if (type !== MATERIALS.BUILDING) {
            const buildings = Object.values(this.elements).filter(e => e.type === MATERIALS.BUILDING).map(e => e.body);
            if (!ignoreId && Query.region(buildings, { min: { x: pos.x - ew/2, y: pos.y - eh/2 }, max: { x: pos.x + ew/2, y: pos.y + eh/2 } }).length > 0) return null;
            if (this.mapType === 'URBAN' && solidTypes.includes(type)) {
                const step = 500, padding = 150, buffer = 20;
                const relativeX = (pos.x - (padding - buffer)) % step;
                const relativeY = (pos.y - (padding - buffer)) % step;
                if (relativeX >= 0 && relativeX < 350 + buffer * 2 && relativeY >= 0 && relativeY < 350 + buffer * 2) return null;
            }
            if (solidTypes.includes(type)) {
                const otherSolids = Object.values(this.elements)
                    .filter(e => solidTypes.includes(e.type) && e.id !== ignoreId)
                    .map(e => e.body);
                if (!ignoreId && Query.region(otherSolids, { min: { x: pos.x - 100, y: pos.y - 100 }, max: { x: pos.x + 100, y: pos.y + 100 } }).length > 0) return null;
            }
            const liquidTypes = [MATERIALS.WATER, MATERIALS.OIL, MATERIALS.ACID, MATERIALS.ELECTRIC, MATERIALS.ICE];
            if (liquidTypes.includes(type)) {
                const otherLiquids = Object.values(this.elements)
                    .filter(e => liquidTypes.includes(e.type) && e.id !== ignoreId)
                    .map(e => e.body);
                if (!ignoreId && Query.region(otherLiquids, { min: { x: pos.x - ew*0.8, y: pos.y - ew*0.8 }, max: { x: pos.x + ew*0.8, y: pos.y + ew*0.8 } }).length > 0) return null;
            }
        }

        const padding = 10;
        if (pos.x - ew/2 < padding || pos.x + ew/2 > this.worldSize - padding || pos.y - eh/2 < padding || pos.y + eh/2 > this.worldSize - padding) return null;

        const id = ++this.lastElementId;
        const isSolid = solidTypes.includes(type);
        const body = Bodies.rectangle(pos.x, pos.y, ew, eh, { label: 'element', isStatic: true, isSensor: !isSolid });
        body.elementId = id;

        this.elements[id] = { id, body, type, hp: (type === MATERIALS.DIRT && hp === null) ? 150 : hp, ownerId, expiresAt: duration ? Date.now() + duration : null, originalType: (type === MATERIALS.WATER && this.mapType === 'TUNDRA' && !duration) ? MATERIALS.ICE : null, w: ew, h: eh, x: pos.x, y: pos.y };
        if (this.elements[id].originalType) this.elements[id].expiresAt = Date.now() + 30000;
        Composite.add(this.engine.world, body);

        Query.region(Object.values(this.elements).map(e => e.body), body.bounds).forEach(other => {
            if (other !== body) this.combatEngine.processElementInteraction(body, other);
        });

        if (isSolid) this.navGrid.markDirty();
        return this.elements[id];
    }

    spawnBuilding(pos, w, h, shape = 'rect') {
        const padding = 10;
        if (pos.x - w/2 < padding || pos.x + w/2 > this.worldSize - padding || pos.y - h/2 < padding || pos.y + h/2 > this.worldSize - padding) return;
        const id = ++this.lastElementId;
        const body = Bodies.rectangle(pos.x, pos.y, w, h, { label: 'element', isStatic: true, isSensor: false, friction: 0, frictionStatic: 0 });
        body.elementId = id;
        this.elements[id] = { id, body, type: MATERIALS.BUILDING, hp: 800, w, h, shape: shape };
        Composite.add(this.engine.world, body);
        this.navGrid.markDirty();
    }

    destroyBullet(id) {
        if (this.bullets[id]) { Composite.remove(this.engine.world, this.bullets[id]); delete this.bullets[id]; }
    }

    destroyElement(id) {
        if (this.elements[id]) { 
            const isSolid = !this.elements[id].body.isSensor;
            Composite.remove(this.engine.world, this.elements[id].body); 
            delete this.elements[id]; 
            if (isSolid) this.navGrid.markDirty();
        }
    }

    cleanupElements() {
        const now = Date.now();
        Object.keys(this.elements).forEach(id => {
            const e = this.elements[id];
            if (e.expiresAt && now > e.expiresAt) {
                if (e.originalType) {
                    const oldPos = { x: e.body.position.x, y: e.body.position.y };
                    Composite.remove(this.engine.world, e.body);
                    e.type = e.originalType; e.originalType = null; e.expiresAt = null; 
                    const newBody = Bodies.rectangle(oldPos.x, oldPos.y, e.w, e.h, { label: 'element', isStatic: true, isSensor: false, collisionFilter: { category: 1, mask: -1 } });
                    newBody.elementId = e.id; e.body = newBody; Composite.add(this.engine.world, newBody);
                } else this.destroyElement(id);
            }
        });
        Object.keys(this.bullets).forEach(id => {
            if (this.bullets[id].customData.expiresAt && now > this.bullets[id].customData.expiresAt) this.destroyBullet(id);
        });
    }

    respawn(player, killerId = null, weaponType = 'UNKNOWN') {
        player.hp = player.maxHp; player.deaths++;
        let isOpponentKill = false;
        if (killerId && this.players[killerId]) {
            const killer = this.players[killerId];
            if (killer.team !== player.team) { killer.kills++; isOpponentKill = true; }
            this.io.to(this.id).emit('kill-feed', { killer: killer.username, victim: player.username, weapon: weaponType, killerTeam: killer.team, victimTeam: player.team });
        } else {
            this.io.to(this.id).emit('kill-feed', { killer: killerId?.startsWith('guardian') ? 'GUARDIAN' : 'WORLD', victim: player.username, weapon: weaponType, killerTeam: 'neutral', victimTeam: player.team });
        }
        if (!this.gameOver) { 
            this.scores[player.team === 'blue' ? 'pink' : 'blue']++; 
            this.checkMatchEnd(); 
        }
        player.invulnerableUntil = Date.now() + 3000;
        for (let i = 0; i < 5; i++) this.spawnElement({ x: player.body.position.x + (Math.random()-0.5)*60, y: player.body.position.y + (Math.random()-0.5)*60 }, MATERIALS.SCRAP, 30000);
        player.hp = CHASSIS[player.chassis].hp; player.scrap = Math.floor(player.scrap / 2);
        const pos = this.getRandomSpawn(player.team);
        Body.setPosition(player.body, pos); Body.setVelocity(player.body, { x: 0, y: 0 });
    }

    replenishElements() {
        const envTypes = [MATERIALS.WATER, MATERIALS.OIL, MATERIALS.ELECTRIC, MATERIALS.ACID, MATERIALS.ICE];
        const currentEnvCount = Object.values(this.elements).filter(e => envTypes.includes(e.type)).length;
        const targetCount = Math.max(11, Math.floor((this.worldSize * this.worldSize) / 1000000 * 4.5));
        if (currentEnvCount < targetCount) {
            let pos = null;
            for (let i = 0; i < 20; i++) {
                const testPos = { x: 200 + Math.random()*(this.worldSize-400), y: 200 + Math.random()*(this.worldSize-400) };
                if (Object.values(this.elements).filter(e => envTypes.includes(e.type) && Vector.magnitude(Vector.sub(e.body.position, testPos)) < 800).length < 1) { pos = testPos; break; }
            }
            if (!pos) return;
            let pType = { WASTELAND: Math.random()>0.6 ? MATERIALS.ACID : MATERIALS.OIL, INDUSTRIAL: [MATERIALS.ELECTRIC, MATERIALS.ACID, MATERIALS.WATER, MATERIALS.OIL][Math.floor(Math.random()*4)], WETLAND: Math.random()>0.4 ? MATERIALS.WATER : (Math.random()>0.75 ? MATERIALS.ACID : MATERIALS.GAS), TUNDRA: MATERIALS.ICE }[this.mapType] || (Math.random()>0.6 ? MATERIALS.WATER : MATERIALS.OIL);
            const size = 80 + Math.random() * 80;
            this.spawnElement(pos, pType, null, null, null, size, size);
        }
    }

    update() {
        const now = Date.now();
        if (this.active && !this.gameOver) {
            if (now - this.lastTimeTick >= 1000) {
                this.matchTimer--; this.lastTimeTick = now;
                if (this.matchTimer <= 0) this.checkMatchEnd();
                this.replenishElements();
                // if (Object.keys(this.guardians).length < 2 && now > this.nextGuardianSpawn) this.combatEngine.spawnGuardian();
            }
            this.botAI.processBots(now);
            // this.combatEngine.processGuardians(now);
            Object.values(this.players).forEach(p => {
                const buffLevel = Math.floor(p.scrap / 100);
                if (buffLevel > p.lastBuffLevel && buffLevel <= 5) {
                    p.lastBuffLevel = buffLevel;
                    if (!p.id.startsWith('bot-')) this.io.sockets.sockets.get(p.id)?.emit('scrap-buff', { text: 'COMBAT BUFF: DMG & RELOAD UP!' });
                }
                if (now < p.statusEffects.stun) return;
                p.hidden = false;
                const zone = this.zones.find(z => p.body.position.x >= z.x && p.body.position.x <= z.x + z.w && p.body.position.y >= z.y && p.body.position.y <= z.y + z.h) || { type: 'URBAN' };
                const config = CHASSIS[p.chassis]; const biome = BIOMES[zone.type];
                if (now < p.statusEffects.burn) p.hp -= 0.3;
                const friction = p.statusEffects.slip > now ? 0.04 : (zone.type === 'TUNDRA' ? 0.015 : biome.friction);
                if (p.body.frictionAir !== friction) p.body.frictionAir = friction;
                const speedBonus = 1 + (p.upgrades.speed * 0.15), slowMult = p.statusEffects.slow > now ? 0.5 : (p.statusEffects.quicksand > now ? 0.3 : 1.0);
                const moveSpeed = config.speed * biome.speedMult * slowMult * speedBonus, turnSpeed = config.turnSpeed * (p.statusEffects.slow > now ? 0.6 : (p.statusEffects.quicksand > now ? 0.4 : 1.0)) * speedBonus;
                const targetAngularVel = p.inputs.left ? -turnSpeed : (p.inputs.right ? turnSpeed : 0);
                Body.setAngularVelocity(p.body, p.body.angularVelocity + (targetAngularVel - p.body.angularVelocity) * 0.3);
                if (p.inputs.up) Body.applyForce(p.body, p.body.position, { x: Math.cos(p.body.angle) * moveSpeed, y: Math.sin(p.body.angle) * moveSpeed });
                if (p.inputs.down) Body.applyForce(p.body, p.body.position, { x: -Math.cos(p.body.angle) * moveSpeed, y: -Math.sin(p.body.angle) * moveSpeed });
                if (p.inputs.shoot && p.hp > 0) this.playerShoot(p);
            });
        }
    }

    playerShoot(p) {
        const mod = p.slots[p.currentSlot]; const weapon = WEAPON_MODULES[mod]; if (!weapon) return;
        const now = Date.now(), rt = weapon.reload / (1 + (p.scrap / 200) + (p.upgrades.power * 0.1));
        if (now - p.lastShot > rt) { this.fire(p, weapon, mod, (1 + (p.scrap / 100)) * (1 + (p.upgrades.power * 0.25))); p.lastShot = now; }
    }

    fireGuardianPulse(g, angle) {
        const id = ++this.lastBulletId;
        const bullet = Bodies.circle(g.body.position.x + Math.cos(angle)*40, g.body.position.y + Math.sin(angle)*40, 8, { label: 'bullet', frictionAir: 0, mass: 0.1 });
        bullet.id = id; bullet.customData = { ownerId: `guardian-${g.id}`, damage: 15, impact: 0.02, type: MATERIALS.ELECTRIC, weapon: 'GUARDIAN_PULSE', expiresAt: Date.now() + 1500 };
        Body.setVelocity(bullet, { x: Math.cos(angle)*12, y: Math.sin(angle)*12 });
        this.bullets[id] = bullet; Composite.add(this.engine.world, bullet);
    }

    fire(p, weapon, mod, buff) {
        const id = ++this.lastBulletId, aim = p.inputs.aimAngle ?? p.body.angle, dist = weapon.type === MATERIALS.DIRT ? 80 : 45;
        const pos = { x: p.body.position.x + Math.cos(aim)*dist, y: p.body.position.y + Math.sin(aim)*dist };
        const bullet = Bodies.circle(pos.x, pos.y, weapon.radius, { label: 'bullet', frictionAir: 0, mass: 0.1, isSensor: weapon.type === MATERIALS.DIRT });
        bullet.id = id; bullet.customData = { ownerId: p.id, damage: weapon.damage * buff, impact: weapon.impact * buff, type: weapon.type, weapon: mod, expiresAt: Date.now() + (weapon.ttl || 2000) };
        Body.setVelocity(bullet, { x: Math.cos(aim)*weapon.speed, y: Math.sin(aim)*weapon.speed });
        if (weapon.recoil) Body.applyForce(p.body, p.body.position, { x: -Math.cos(aim)*weapon.recoil, y: -Math.sin(aim)*weapon.recoil });
        this.bullets[id] = bullet; Composite.add(this.engine.world, bullet);
        if (weapon.type === MATERIALS.DIRT) this.spawnElement(pos, MATERIALS.DIRT, 10000, weapon.hp);
    }

    broadcastState() {
        const now = Date.now();
        const state = {
            active: this.active, worldSize: this.worldSize, timer: this.matchTimer, scores: this.scores, gameOver: this.gameOver,
            zones: this.zones.map(z => ({ ...z, color: BIOMES[z.type].color })),
            players: Object.values(this.players).map(p => ({
                id: p.id, u: p.username, t: p.team, x: +p.body.position.x.toFixed(1), y: +p.body.position.y.toFixed(1), a: +p.body.angle.toFixed(3),
                aa: +(p.inputs.aimAngle ?? p.body.angle).toFixed(3), v: [+p.body.velocity.x.toFixed(2), +p.body.velocity.y.toFixed(2), +p.body.angularVelocity.toFixed(3)],
                h: p.hp, mh: p.maxHp, w: p.slots[p.currentSlot], cs: p.currentSlot,
                sl: p.slots, s: p.scrap, hid: p.hidden, up: p.upgrades, ch: p.chassis, st: p.statusEffects.stun > now,
                slw: p.statusEffects.slow > now, brn: p.statusEffects.burn > now, wt: p.statusEffects.wet > now,
                slp: p.statusEffects.slip > now,
                c: (() => { const w = WEAPON_MODULES[p.slots[p.currentSlot]]; return w ? Math.min(100, Math.floor((now-p.lastShot)/(w.reload/(1+p.scrap/200+p.upgrades.power*0.1))*100)) : 100; })(),
                inv: p.invulnerableUntil > now, seq: p.lastInputSeq
            })),
            guardians: Object.values(this.guardians).map(g => ({ id: g.id, x: +g.body.position.x.toFixed(1), y: +g.body.position.y.toFixed(1), a: +g.angle.toFixed(3), h: g.hp, mh: g.maxHp })),
            bullets: Object.values(this.bullets).map(b => ({ id: b.id, x: +b.position.x.toFixed(1), y: +b.position.y.toFixed(1), t: b.customData.type, w: b.customData.weapon, c: { fire: '#ff4d00', water: '#00a2ff', oil: '#222', electric: '#ffff00', dirt: '#8b4513', steam: 'rgba(255,255,255,0.3)', ice: '#aaddff' }[b.customData.type] || '#fff', a: +Math.atan2(b.velocity.y, b.velocity.x).toFixed(3) })),
            elements: Object.values(this.elements).map(e => ({ id: e.id, x: +e.body.position.x.toFixed(1), y: +e.body.position.y.toFixed(1), t: e.type, r: e.body.circleRadius, w: e.w, h: e.h, sh: e.shape, c: { scrap: '#ffff00', oil: '#333', fire: '#ff4400', water: '#0088ff', electric: '#00f2ff', ice: '#aaddff', dirt: '#8b4513', steam: 'rgba(200,200,200,0.4)' }[e.type] || '#fff' }))
        };
        this.io.to(this.id).emit('state', state);
        Object.values(this.bullets).forEach(b => { if (b.position.x < -100 || b.position.x > this.worldSize + 100 || b.position.y < -100 || b.position.y > this.worldSize + 100) this.destroyBullet(b.id); });
    }

    startGame(mapType = 'RANDOM') {
        if (this.active) return;
        this.setupWorld(Object.keys(this.players).length, mapType);
        this.active = true; this.matchTimer = 480; this.scores = { blue: 0, pink: 0 }; this.gameOver = false; this.lastTimeTick = Date.now();
        Object.values(this.players).forEach(p => { p.hp = p.maxHp; p.scrap = 0; const spawn = this.getRandomSpawn(p.team); Body.setPosition(p.body, spawn); Body.setVelocity(p.body, { x: 0, y: 0 }); });
    }

    checkMatchEnd() {
        if (this.gameOver) return;
        let winner = this.scores.blue >= this.scoreCap ? 'blue' : (this.scores.pink >= this.scoreCap ? 'pink' : (this.matchTimer <= 0 ? (this.scores.blue > this.scores.pink ? 'blue' : (this.scores.pink > this.scores.blue ? 'pink' : 'draw')) : null));
        if (winner) {
            this.gameOver = true;
            const data = getPlayerData();
            Object.values(this.players).forEach(p => { if (!p.isBot && data[p.username]) { data[p.username].kills += p.kills; data[p.username].deaths += p.deaths; data[p.username].scrap += p.scrap; data[p.username].lastSeen = Date.now(); } });
            savePlayers(data);
            this.io.to(this.id).emit('match-ended', { winner, scores: this.scores, stats: Object.values(this.players).map(p => ({ u: p.username, t: p.team, kills: p.kills, deaths: p.deaths, s: p.scrap })).sort((a,b) => b.kills-a.kills) });
        }
    }

    resetLobby() {
        this.active = false; this.gameOver = false; this.matchTimer = 480; this.scores = { blue: 0, pink: 0 }; this.lastTimeTick = Date.now();
        Object.keys(this.bullets).forEach(id => this.destroyBullet(id)); Object.keys(this.elements).forEach(id => this.destroyElement(id)); Object.keys(this.guardians).forEach(id => this.destroyGuardian(id));
        Object.values(this.players).forEach(p => { this.respawn(p); p.ready = !!p.isBot; });
        this.generateMap();
        this.io.to(this.id).emit('lobby-reset', { id: this.id, players: Object.values(this.players).map(p => ({ username: p.username, team: p.team, id: p.id })) });
    }

    destroyGuardian(id, killerId) {
        if (this.guardians[id]) { Composite.remove(this.engine.world, this.guardians[id].body); delete this.guardians[id]; }
        if (killerId && this.players[killerId]) {
            for (let i = 0; i < 8; i++) this.spawnElement({ x: this.players[killerId].body.position.x, y: this.players[killerId].body.position.y }, MATERIALS.SCRAP, 30000);
        }
    }

    destroy() { clearInterval(this.physicsInterval); clearInterval(this.syncInterval); }
}
