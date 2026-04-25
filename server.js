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
const WEAPONS = {
    1: { name: 'Standard', reload: 400, damage: 10, speed: 12, radius: 4, recoil: 0.005, impact: 0.005 },
    2: { name: 'Blast', reload: 2000, damage: 35, speed: 8, radius: 10, recoil: 0.03, impact: 0.05 },
    3: { name: 'Burst', reload: 1500, damage: 5, speed: 15, radius: 3, burst: 3, recoil: 0.003, impact: 0.002 }
};

// Global State
let lobbies = {}; // roomId -> lobbyData

class Lobby {
    constructor(id) {
        this.id = id;
        this.players = {}; // socketId -> playerData
        this.active = false;
        this.engine = Engine.create({ gravity: { x: 0, y: 0 } });
        this.bullets = {}; // bulletId -> bulletBody
        this.lastBulletId = 0;
        
        // Start Physics Loop
        this.physicsInterval = setInterval(() => {
            Engine.update(this.engine, 1000 / TICK_RATE);
            this.handleCollisions();
        }, 1000 / TICK_RATE);

        // Start State Sync Loop
        this.syncInterval = setInterval(() => {
            this.broadcastState();
        }, 1000 / STATE_RATE);
    }

    addPlayer(socket, username) {
        const team = Object.keys(this.players).length % 2 === 0 ? 'blue' : 'pink';
        const startPos = team === 'blue' ? { x: 150, y: 300 } : { x: 1000, y: 300 };
        
        const body = Bodies.rectangle(startPos.x, startPos.y, TANK_SIZE, TANK_SIZE, {
            frictionAir: 0.1,
            mass: 5,
            label: `tank-${socket.id}`
        });
        
        if (team === 'pink') Body.setAngle(body, Math.PI);
        Composite.add(this.engine.world, body);

        this.players[socket.id] = {
            id: socket.id,
            username,
            team,
            hp: 100,
            body,
            currentWeapon: 1,
            lastShot: 0,
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
                let bullet, target;
                
                if (bodyA.label === 'bullet') { bullet = bodyA; target = bodyB; }
                else if (bodyB.label === 'bullet') { bullet = bodyB; target = bodyA; }

                if (bullet && target.label && target.label.startsWith('tank-')) {
                    const targetId = target.label.split('tank-')[1];
                    const bulletData = bullet.customData;
                    
                    if (targetId !== bulletData.ownerId) {
                        const victim = this.players[targetId];
                        if (victim) {
                            victim.hp -= bulletData.damage;
                            
                            // Impact
                            const forceDir = Vector.normalise(bullet.velocity);
                            Body.applyForce(target, target.position, Vector.mult(forceDir, bulletData.impact));

                            // Destroy Bullet
                            Composite.remove(this.engine.world, bullet);
                            delete this.bullets[bullet.id];
                            
                            if (victim.hp <= 0) this.respawn(victim);
                        }
                    }
                }
            });
        });
    }

    respawn(player) {
        player.hp = 100;
        const pos = player.team === 'blue' ? { x: 150, y: 300 } : { x: 1000, y: 300 };
        Body.setPosition(player.body, pos);
        Body.setVelocity(player.body, { x: 0, y: 0 });
    }

    update() {
        Object.values(this.players).forEach(p => {
            const { inputs, body } = p;
            if (inputs.left) Body.setAngularVelocity(body, -0.06);
            if (inputs.right) Body.setAngularVelocity(body, 0.06);
            
            const force = 0.005;
            if (inputs.up) {
                Body.applyForce(body, body.position, {
                    x: Math.cos(body.angle) * force,
                    y: Math.sin(body.angle) * force
                });
            }
            if (inputs.down) {
                Body.applyForce(body, body.position, {
                    x: -Math.cos(body.angle) * force,
                    y: -Math.sin(body.angle) * force
                });
            }

            if (inputs.shoot) this.playerShoot(p);
        });
    }

    playerShoot(p) {
        const weapon = WEAPONS[p.currentWeapon];
        const now = Date.now();
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
        bullet.customData = { ownerId: p.id, damage: weapon.damage, impact: weapon.impact };
        
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
    }

    broadcastState() {
        this.update();
        const state = {
            players: Object.values(this.players).map(p => ({
                id: p.id,
                username: p.username,
                team: p.team,
                x: p.body.position.x,
                y: p.body.position.y,
                angle: p.body.angle,
                hp: p.hp,
                weapon: p.currentWeapon
            })),
            bullets: Object.values(this.bullets).map(b => ({
                id: b.id,
                x: b.position.x,
                y: b.position.y,
                color: this.players[b.customData.ownerId]?.team === 'blue' ? '#00f2ff' : '#ff00ff'
            }))
        };
        io.to(this.id).emit('state', state);

        // Cleanup offscreen bullets
        Object.values(this.bullets).forEach(b => {
            if (b.position.x < -100 || b.position.x > 2000 || b.position.y < -100 || b.position.y > 2000) {
                Composite.remove(this.engine.world, b);
                delete this.bullets[b.id];
            }
        });
    }

    destroy() {
        clearInterval(this.physicsInterval);
        clearInterval(this.syncInterval);
    }
}

io.on('connection', (socket) => {
    console.log('User connected:', socket.id);

    socket.on('join-game', ({ username }) => {
        // Matchmaking: Find lobby with most players that isn't full and hasn't started
        let bestLobby = Object.values(lobbies).find(l => !l.active && Object.keys(l.players).length < 10);
        
        if (!bestLobby) {
            const id = Math.random().toString(36).substring(7);
            bestLobby = new Lobby(id);
            lobbies[id] = bestLobby;
        }

        bestLobby.addPlayer(socket, username);
        socket.join(bestLobby.id);
        socket.lobbyId = bestLobby.id;

        io.to(bestLobby.id).emit('lobby-update', {
            id: bestLobby.id,
            players: Object.values(bestLobby.players).map(p => ({ username: p.username, team: p.team, id: p.id }))
        });
    });

    socket.on('host-game', ({ username }) => {
        const id = Math.random().toString(36).substring(7);
        const lobby = new Lobby(id);
        lobbies[id] = lobby;
        lobby.addPlayer(socket, username);
        socket.join(id);
        socket.lobbyId = id;

        socket.emit('lobby-update', {
            id,
            players: Object.values(lobby.players).map(p => ({ username: p.username, team: p.team, id: p.id }))
        });
    });

    socket.on('input', (inputs) => {
        const lobby = lobbies[socket.lobbyId];
        if (lobby && lobby.players[socket.id]) {
            lobby.players[socket.id].inputs = inputs;
        }
    });

    socket.on('switch-weapon', (type) => {
        const lobby = lobbies[socket.lobbyId];
        if (lobby && lobby.players[socket.id]) {
            lobby.players[socket.id].currentWeapon = type;
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
