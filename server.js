const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const Matter = require('matter-js');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = require('socket.io')(server, {
    cors: {
        origin: "*",
        methods: ["GET", "POST"]
    }
});
const PORT = process.env.PORT || 3000;

app.get('/health', (req, res) => res.send('Server is live!'));
app.use(express.static(path.join(__dirname, 'public')));

// Physics Aliases
const { Engine, Bodies, Body, Composite, Vector, Events } = Matter;

// Game Constants
const TICK_RATE = 60;
const STATE_RATE = 20; // Send state 20 times per second
const TANK_SIZE = 45;
const WORLD_SIZE = 4000; // 4000x4000 world

const { MATERIALS, CHASSIS, WEAPON_MODULES } = require('./gameConfig');

// Global State
let lobbies = {}; // roomId -> lobbyData

class Lobby {
    constructor(id) {
        this.id = id;
        this.players = {}; // socketId -> playerData
        this.active = false;
        this.engine = Engine.create({ gravity: { x: 0, y: 0 } });
        this.bullets = {}; // bulletId -> bulletBody
        this.elements = {}; // elementId -> { body, type, hp, expiresAt }
        this.lastBulletId = 0;
        this.lastElementId = 0;
        
        // Start Physics Loop
        this.physicsInterval = setInterval(() => {
            Engine.update(this.engine, 1000 / TICK_RATE);
            this.handleCollisions();
            this.cleanupElements();
        }, 1000 / TICK_RATE);

        // Start State Sync Loop
        this.syncInterval = setInterval(() => {
            this.broadcastState();
        }, 1000 / STATE_RATE);
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
            slots: ['STANDARD', 'FLAMETHROWER', 'WATER_CANNON', 'TESLA', 'FROST_GUN', 'DIRT_GUN'], // Full arsenal for testing
            currentSlot: 0,
            lastShot: 0,
            scrap: 0,
            statusEffects: { stun: 0, slip: 0 },
            inputs: { up: false, down: false, left: false, right: false, shoot: false }
        };
    }

    removePlayer(socketId) {
        if (this.players[socketId]) {
            Composite.remove(this.engine.world, this.players[socketId].body);
            delete this.players[socketId];
        }
    }

    handleCollisions() {
        Events.on(this.engine, 'collisionStart', (event) => {
            event.pairs.forEach((pair) => {
                const { bodyA, bodyB } = pair;
                
                // Bullet Logic
                if (bodyA.label === 'bullet' || bodyB.label === 'bullet') {
                    const bullet = bodyA.label === 'bullet' ? bodyA : bodyB;
                    const target = bodyA.label === 'bullet' ? bodyB : bodyA;
                    this.processBulletCollision(bullet, target);
                }

                // Elemental Interaction Logic
                if (bodyA.label === 'element' || bodyB.label === 'element') {
                    this.processElementInteraction(bodyA, bodyB);
                }
            });
        });
    }

    processBulletCollision(bullet, target) {
        const bulletData = bullet.customData;
        
        // Hit Tank
        if (target.label && target.label.startsWith('tank-')) {
            const targetId = target.label.split('tank-')[1];
            if (targetId !== bulletData.ownerId) {
                const victim = this.players[targetId];
                if (victim) {
                    victim.hp -= bulletData.damage;
                    const forceDir = Vector.normalise(bullet.velocity);
                    Body.applyForce(target, target.position, Vector.mult(forceDir, bulletData.impact));
                    
                    // Elemental Status Application
                    if (bulletData.type === MATERIALS.ELECTRIC) {
                        victim.statusEffects.stun = Date.now() + 1000;
                    }

                    // Oil Leak at 50% HP
                    if (victim.hp < victim.maxHp * 0.5) {
                        this.spawnElement(victim.body.position, MATERIALS.OIL, 5000);
                    }

                    this.destroyBullet(bullet.id);
                    if (victim.hp <= 0) this.respawn(victim);
                }
            }
        }
        
        // Hit Element (e.g. Dirt Mound)
        if (target.label === 'element') {
            const element = this.elements[target.elementId];
            if (element && element.hp !== undefined) {
                element.hp -= bulletData.damage;
                if (element.hp <= 0) this.destroyElement(target.elementId);
                this.destroyBullet(bullet.id);
            }
        }
    }

    processElementInteraction(bodyA, bodyB) {
        const elementA = bodyA.label === 'element' ? this.elements[bodyA.elementId] : null;
        const elementB = bodyB.label === 'element' ? this.elements[bodyB.elementId] : null;
        const bullet = bodyA.label === 'bullet' ? bodyA : (bodyB.label === 'bullet' ? bodyB : null);

        const pos = bullet ? bullet.position : bodyA.position;

        // 1. Fire + Oil = Ablaze
        if ((elementA?.type === MATERIALS.OIL && bullet?.customData.type === MATERIALS.FIRE) ||
            (elementB?.type === MATERIALS.OIL && bullet?.customData.type === MATERIALS.FIRE)) {
            this.spawnElement(pos, MATERIALS.FIRE, 3000);
            if (elementA?.type === MATERIALS.OIL) this.destroyElement(elementA.id);
            if (elementB?.type === MATERIALS.OIL) this.destroyElement(elementB.id);
        }

        // 2. Electricity + Water = Electrified Puddle
        if ((elementA?.type === MATERIALS.WATER && bullet?.customData.type === MATERIALS.ELECTRIC) ||
            (elementB?.type === MATERIALS.WATER && bullet?.customData.type === MATERIALS.ELECTRIC)) {
            const targetElement = elementA?.type === MATERIALS.WATER ? elementA : elementB;
            targetElement.type = MATERIALS.ELECTRIC; // Puddle becomes electrified
            targetElement.expiresAt = Date.now() + 2000;
        }

        // 3. Fire + Water = Steam
        if ((elementA?.type === MATERIALS.WATER && bullet?.customData.type === MATERIALS.FIRE) ||
            (elementB?.type === MATERIALS.WATER && bullet?.customData.type === MATERIALS.FIRE)) {
            this.spawnElement(pos, MATERIALS.STEAM, 4000);
            if (elementA?.type === MATERIALS.WATER) this.destroyElement(elementA.id);
            if (elementB?.type === MATERIALS.WATER) this.destroyElement(elementB.id);
        }

        // 4. Ice + Water = Frozen
        if ((elementA?.type === MATERIALS.WATER && bullet?.customData.type === MATERIALS.ICE) ||
            (elementB?.type === MATERIALS.WATER && bullet?.customData.type === MATERIALS.ICE)) {
            const targetElement = elementA?.type === MATERIALS.WATER ? elementA : elementB;
            targetElement.type = MATERIALS.ICE;
        }

        // 5. Tank entering Element
        const tankBody = bodyA.label.startsWith('tank-') ? bodyA : (bodyB.label.startsWith('tank-') ? bodyB : null);
        const element = elementA || elementB;
        if (tankBody && element) {
            const pId = tankBody.label.split('tank-')[1];
            const p = this.players[pId];
            if (p) {
                if (element.type === MATERIALS.ELECTRIC) p.statusEffects.stun = Date.now() + 500;
                if (element.type === MATERIALS.ICE) p.statusEffects.slip = Date.now() + 1000;
                if (element.type === MATERIALS.FIRE) p.hp -= 0.5; // Burn damage
                if (element.type === MATERIALS.STEAM) p.hidden = true;
                
                // Collection
                if (element.type === MATERIALS.SCRAP) {
                    p.scrap += 10;
                    this.destroyElement(element.id);
                }
            }
        }
    }

    spawnElement(pos, type, duration, hp) {
        const id = ++this.lastElementId;
        const radius = type === MATERIALS.SCRAP ? 10 : 
                      (type === MATERIALS.OIL || type === MATERIALS.FIRE) ? 20 : 
                      (type === MATERIALS.STEAM ? 40 : 30);
        
        const body = Bodies.circle(pos.x, pos.y, radius, {
            label: 'element',
            isSensor: type !== MATERIALS.DIRT, // Dirt is solid
            friction: type === MATERIALS.ICE ? 0.001 : 0.5
        });
        body.elementId = id;
        
        this.elements[id] = {
            id,
            body,
            type,
            hp,
            expiresAt: duration ? Date.now() + duration : null
        };
        Composite.add(this.engine.world, body);
    }

    // ... destroy methods ...
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
    }

    respawn(player) {
        // Spawn scrap at death location
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
        Object.values(this.players).forEach(p => {
            const { inputs, body, chassis, statusEffects } = p;
            const config = CHASSIS[chassis];
            
            // Handle Stun
            if (now < statusEffects.stun) return;

            p.hidden = false; // Reset hidden state

            // Handle Slippery Ground (Ice)
            const friction = now < statusEffects.slip ? 0.01 : config.speed > 0.005 ? 0.1 : 0.2;
            if (body.frictionAir !== friction) body.frictionAir = friction;

            if (inputs.left) Body.setAngularVelocity(body, -config.turnSpeed);
            if (inputs.right) Body.setAngularVelocity(body, config.turnSpeed);
            
            if (inputs.up) {
                Body.applyForce(body, body.position, {
                    x: Math.cos(body.angle) * config.speed,
                    y: Math.sin(body.angle) * config.speed
                });
            }
            if (inputs.down) {
                Body.applyForce(body, body.position, {
                    x: -Math.cos(body.angle) * config.speed,
                    y: -Math.sin(body.angle) * config.speed
                });
            }

            if (inputs.shoot) this.playerShoot(p);
        });
    }

    playerShoot(p) {
        const moduleName = p.slots[p.currentSlot];
        const baseWeapon = WEAPON_MODULES[moduleName];
        const now = Date.now();

        // Scrap Buffs (Damage & Reload)
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

    fire(p, weapon) {
        const id = ++this.lastBulletId;
        const pos = {
            x: p.body.position.x + Math.cos(p.body.angle) * 40,
            y: p.body.position.y + Math.sin(p.body.angle) * 40
        };
        
        const bullet = Bodies.circle(pos.x, pos.y, weapon.radius, {
            label: 'bullet',
            frictionAir: 0,
            mass: 0.1
        });
        
        bullet.id = id;
        bullet.customData = { 
            ownerId: p.id, 
            damage: weapon.damage, 
            impact: weapon.impact,
            type: weapon.type 
        };
        
        Body.setVelocity(bullet, {
            x: Math.cos(p.body.angle) * weapon.speed,
            y: Math.sin(p.body.angle) * weapon.speed
        });

        // Recoil
        Body.applyForce(p.body, p.body.position, {
            x: -Math.cos(p.body.angle) * weapon.recoil,
            y: -Math.sin(p.body.angle) * weapon.recoil
        });

        this.bullets[id] = bullet;
        Composite.add(this.engine.world, bullet);

        // Special logic for Dirt Gun
        if (weapon.type === MATERIALS.DIRT) {
            this.spawnElement(pos, MATERIALS.DIRT, 10000, weapon.hp);
        }
    }

    broadcastState() {
        this.update();
        const state = {
            worldSize: WORLD_SIZE,
            players: Object.values(this.players).map(p => ({
                id: p.id,
                username: p.username,
                team: p.team,
                x: p.body.position.x,
                y: p.body.position.y,
                angle: p.body.angle,
                hp: p.hp,
                maxHp: p.maxHp,
                weapon: p.slots[p.currentSlot],
                currentSlot: p.currentSlot,
                scrap: p.scrap,
                hidden: p.hidden
            })),
            bullets: Object.values(this.bullets).map(b => ({
                id: b.id,
                x: b.position.x,
                y: b.position.y,
                type: b.customData.type,
                color: this.getElementColor(b.customData.type)
            })),
            elements: Object.values(this.elements).map(e => ({
                id: e.id,
                x: e.body.position.x,
                y: e.body.position.y,
                type: e.type,
                radius: e.body.circleRadius,
                color: this.getElementColor(e.type)
            }))
        };
        io.to(this.id).emit('state', state);

        // Cleanup offscreen bullets
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

    socket.on('join-game', ({ username, chassisType }) => {
        // Matchmaking: Find lobby with most players that isn't full and hasn't started
        let bestLobby = Object.values(lobbies).find(l => !l.active && Object.keys(l.players).length < 10);
        
        if (!bestLobby) {
            const id = Math.random().toString(36).substring(7);
            bestLobby = new Lobby(id);
            lobbies[id] = bestLobby;
        }

        bestLobby.addPlayer(socket, username, chassisType);
        socket.join(bestLobby.id);
        socket.lobbyId = bestLobby.id;

        io.to(bestLobby.id).emit('lobby-update', {
            id: bestLobby.id,
            players: Object.values(bestLobby.players).map(p => ({ username: p.username, team: p.team, id: p.id, chassis: p.chassis }))
        });
    });

    socket.on('host-game', ({ username, chassisType }) => {
        const id = Math.random().toString(36).substring(7);
        const lobby = new Lobby(id);
        lobbies[id] = lobby;
        lobby.addPlayer(socket, username, chassisType);
        socket.join(id);
        socket.lobbyId = id;

        socket.emit('lobby-update', {
            id,
            players: Object.values(lobby.players).map(p => ({ username: p.username, team: p.team, id: p.id, chassis: p.chassis }))
        });
    });

    socket.on('input', (inputs) => {
        const lobby = lobbies[socket.lobbyId];
        if (lobby && lobby.players[socket.id]) {
            lobby.players[socket.id].inputs = inputs;
        }
    });

    socket.on('switch-weapon', (slotIndex) => {
        const lobby = lobbies[socket.lobbyId];
        if (lobby && lobby.players[socket.id]) {
            const p = lobby.players[socket.id];
            if (slotIndex >= 0 && slotIndex < p.slots.length) {
                p.currentSlot = slotIndex;
            }
        }
    });

    socket.on('start-game', () => {
        const lobby = lobbies[socket.lobbyId];
        if (lobby && Object.keys(lobby.players).length >= 2) {
            lobby.active = true;
            io.to(lobby.id).emit('game-started');
        }
    });

    socket.on('disconnect', () => {
        const lobby = lobbies[socket.lobbyId];
        if (lobby) {
            lobby.removePlayer(socket.id);
            if (Object.keys(lobby.players).length === 0) {
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

server.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});
