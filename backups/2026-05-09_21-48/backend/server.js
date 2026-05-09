import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';
import Matter from 'matter-js';

// Import Modular Logic
import { loadPlayers, savePlayers, getPlayerData, setPlayerData } from './logic/Persistence.js';
import { Lobby } from './logic/LobbyManager.js';
import { CHASSIS, MIN_PLAYERS, ALL_WEAPONS } from './gameConfig.js';

const ENVIRONMENT = process.env.NODE_ENV || 'development';
const IS_DEV = ENVIRONMENT === 'development';

if (IS_DEV) {
    CHASSIS.DEV = {
        name: 'Dev Tank',
        hp: 1000,
        speed: 0.012, 
        turnSpeed: 0.08,
        mass: 10,
        slots: 6,
        allowedWeapons: ALL_WEAPONS,
        weapons: ['HEAVY_GUN', 'TESLA', 'FLAMETHROWER', 'WATER_CANNON', 'FROST_GUN', 'DIRT_GUN']
    };
}


dotenv.config();

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const server = createServer(app);
const io = new Server(server, {
    cors: { origin: "*", methods: ["GET", "POST"] },
    transports: ['polling', 'websocket'],
    allowEIO3: true
});

io.on('error', (err) => {
    console.error('SOCKET IO ERROR:', err);
});

const PORT = process.env.PORT || 3000;
const MONGO_URL = process.env.MONGO_URL;

// MongoDB Schema for Lobbies
const lobbySchema = new mongoose.Schema({
    lobbyId: String,
    players: Number,
    bots: Number,
    active: Boolean,
    lastUpdate: { type: Date, default: Date.now }
});
const LobbyModel = MONGO_URL ? mongoose.model('Lobby', lobbySchema) : null;

if (MONGO_URL) {
    mongoose.connect(MONGO_URL)
        .then(() => console.log('Connected to MongoDB'))
        .catch(err => console.error('MongoDB connection error:', err));
}

// Initial Data Load
setPlayerData(loadPlayers());
const lobbies = {};

// Production Static Serving
if (ENVIRONMENT === 'production') {
    app.use(express.static(path.join(__dirname, '../frontend/dist')));
}

app.use((req, res, next) => {
    if (req.url.startsWith('/socket.io')) {
        // Only log socket.io requests if needed, they are very frequent
    } else {
        console.log(`[${new Date().toISOString()}] ${req.method} ${req.url}`);
    }
    next();
});

// SPA Catch-all
app.use((req, res) => {
    if (ENVIRONMENT === 'production' && !req.path.startsWith('/api')) {
        res.sendFile(path.join(__dirname, '../frontend/dist/index.html'));
    } else {
        res.status(404).send('Not Found');
    }
});

// Global Error Handler
app.use((err, req, res, next) => {
    console.error('SERVER ERROR:', err.stack);
    res.status(500).send('Internal Server Error');
});

// Socket.io Rate Limiting Middleware
io.use((socket, next) => {
    socket.eventCount = 0;
    socket.lastReset = Date.now();
    next();
});

io.on('connection', (socket) => {
    try {
        socket.use(([event, ...args], next) => {
            const now = Date.now();
            if (now - socket.lastReset > 1000) {
                socket.eventCount = 0;
                socket.lastReset = now;
            }
            socket.eventCount++;
            if (socket.eventCount > 100) return;
            next();
        });

        console.log('User connected:', socket.id);
        if (IS_DEV) socket.emit('debug-init');
    } catch (err) {
        console.error('Socket Connection Error:', err);
    }

    socket.on('join-game', async (data) => {
        if (!data || !data.username || data.username.trim() === '') return;
        let { username, chassisType, pin } = data;
        username = username.trim().substring(0, 12);
        const allowedChassis = ['SCOUT', 'BRAWLER', 'ARTILLERY'];
        if (IS_DEV) allowedChassis.push('DEV');
        if (!allowedChassis.includes(chassisType)) chassisType = 'SCOUT';

        const playerData = getPlayerData();
        if (playerData[username]) {
            if (!pin || !playerData[username].pin) {
                if (pin) playerData[username].pin = await bcrypt.hash(pin, 10);
            } else {
                const match = await bcrypt.compare(pin, playerData[username].pin);
                if (!match) return socket.emit('auth-error', { message: 'INVALID PIN FOR THIS CALLSIGN!' });
            }
        } else {
            const hashedPin = pin ? await bcrypt.hash(pin, 10) : null;
            playerData[username] = { kills: 0, deaths: 0, scrap: 0, lastSeen: Date.now(), pin: hashedPin };
        }

        let lobbyList = Object.values(lobbies).filter(l => Object.keys(l.players).length < 10);
        lobbyList.sort((a, b) => Object.keys(b.players).length - Object.keys(a.players).length);
        let bestLobby = lobbyList[0];
        if (!bestLobby) {
            const id = Math.random().toString(36).substring(7);
            bestLobby = new Lobby(id, io);
            lobbies[id] = bestLobby;
        }
        bestLobby.addPlayer(socket, username, chassisType);
        bestLobby.players[socket.id].ready = true;
        socket.join(bestLobby.id);
        socket.lobbyId = bestLobby.id;
        if (bestLobby.active) socket.emit('game-started');
        io.to(bestLobby.id).emit('lobby-update', { id: bestLobby.id, players: bestLobby.mapLobbyPlayers() });
        syncLobbyToDB(bestLobby);
    });

    socket.on('host-game', async (data) => {
        if (!data || !data.username || data.username.trim() === '') return;
        let { username, chassisType, pin } = data;
        username = username.trim().substring(0, 12);

        const playerData = getPlayerData();
        if (playerData[username]) {
            if (playerData[username].pin) {
                const match = await bcrypt.compare(pin, playerData[username].pin);
                if (!match) return socket.emit('auth-error', { message: 'INVALID PIN!' });
            }
        } else {
            const hashedPin = pin ? await bcrypt.hash(pin, 10) : null;
            playerData[username] = { kills: 0, deaths: 0, scrap: 0, lastSeen: Date.now(), pin: hashedPin };
        }

        const id = Math.random().toString(36).substring(7);
        const lobby = new Lobby(id, io);
        lobbies[id] = lobby;
        lobby.addPlayer(socket, username, chassisType);
        socket.join(id);
        socket.lobbyId = id;
        io.to(socket.id).emit('lobby-update', { id: lobby.id, players: lobby.mapLobbyPlayers() });
        syncLobbyToDB(lobby);
    });

    socket.on('request-lobbies', async () => {
        if (MONGO_URL) {
            const list = await LobbyModel.find({}).lean();
            socket.emit('lobbies-list', list.map(l => ({ id: l.lobbyId, players: l.players, bots: l.bots, active: l.active })));
        } else {
            socket.emit('lobbies-list', Object.values(lobbies).map(l => ({ id: l.id, players: Object.values(l.players).filter(p => !p.isBot).length, bots: Object.values(l.players).filter(p => p.isBot).length, active: l.active })));
        }
    });

    socket.on('join-lobby', async (data) => {
        const lobby = lobbies[data?.lobbyId];
        if (!lobby) return socket.emit('auth-error', { message: 'LOBBY NOT FOUND!' });
        const { username, chassisType, pin } = data;
        
        const playerData = getPlayerData();
        if (playerData[username] && playerData[username].pin) {
            const match = await bcrypt.compare(pin, playerData[username].pin);
            if (!match) return socket.emit('auth-error', { message: 'INVALID PIN!' });
        }

        if (Object.keys(lobby.players).length >= 10) return socket.emit('auth-error', { message: 'LOBBY IS FULL!' });
        lobby.addPlayer(socket, username, chassisType);
        socket.join(lobby.id);
        socket.lobbyId = lobby.id;
        if (lobby.active) socket.emit('game-started');
        io.to(lobby.id).emit('lobby-update', { id: lobby.id, players: lobby.mapLobbyPlayers() });
        syncLobbyToDB(lobby);
    });

    socket.on('add-bot', (data) => {
        const lobby = lobbies[socket.lobbyId];
        if (lobby && Object.keys(lobby.players).length < 10) {
            lobby.addBot(data.difficulty, null, true, data.team, data.chassisType);
            io.to(lobby.id).emit('lobby-update', { id: lobby.id, players: lobby.mapLobbyPlayers() });
        }
    });

    socket.on('input', (data) => {
        const lobby = lobbies[socket.lobbyId];
        if (lobby && lobby.players[socket.id]) {
            lobby.players[socket.id].inputs = {
                up: !!data?.up, down: !!data?.down, left: !!data?.left, right: !!data?.right, shoot: !!data?.shoot,
                aimAngle: typeof data?.aimAngle === 'number' ? data.aimAngle : 0
            };
            if (typeof data?.seq === 'number') lobby.players[socket.id].lastInputSeq = data.seq;
        }
    });

    socket.on('start-game', (data) => {
        const lobby = lobbies[socket.lobbyId];
        if (lobby && Object.keys(lobby.players).length >= MIN_PLAYERS) {
            if (Object.values(lobby.players).filter(p => !p.isBot).every(p => p.ready)) {
                lobby.startGame(data?.mapType);
                io.to(lobby.id).emit('game-started');
            } else {
                socket.emit('player-event', { text: 'WAITING FOR ALL PLAYERS TO BE READY!', color: '#ffcc00' });
            }
        }
    });

    socket.on('toggle-ready', () => {
        const lobby = lobbies[socket.lobbyId];
        if (lobby && lobby.players[socket.id]) {
            lobby.players[socket.id].ready = !lobby.players[socket.id].ready;
            io.to(lobby.id).emit('lobby-update', { id: lobby.id, players: lobby.mapLobbyPlayers() });
        }
    });

    socket.on('buy-upgrade', (type) => {
        const lobby = lobbies[socket.lobbyId];
        if (!lobby?.active || !lobby.players[socket.id]) return;
        const p = lobby.players[socket.id];
        const lvl = p.upgrades[type] || 0;
        const cost = [100, 250, 500, 1000, 2000][lvl];
        if (lvl < 5 && p.scrap >= cost) {
            p.scrap -= cost; p.upgrades[type]++;
            if (type === 'health') { p.maxHp += 20; p.hp += 20; }
            socket.emit('player-event', { text: `UPGRADED ${type.toUpperCase()}!`, color: '#00ff00' });
            socket.emit('scrap-update', p.scrap);
        }
    });

    socket.on('update-bot-difficulty', (data) => {

        const lobby = lobbies[socket.lobbyId];
        if (lobby && data.botId && lobby.players[data.botId]) {
            lobby.players[data.botId].botDifficulty = data.difficulty;
            io.to(lobby.id).emit('lobby-update', { id: lobby.id, players: lobby.mapLobbyPlayers() });
        }
    });

    socket.on('remove-bot', (data) => {
        const lobby = lobbies[socket.lobbyId];
        if (lobby) {
            const botId = data?.botId;
            if (botId && lobby.players[botId] && lobby.players[botId].isBot) lobby.removePlayer(botId);
            else {
                const bots = Object.values(lobby.players).filter(p => p.isBot);
                if (bots.length > 0) lobby.removePlayer(bots[bots.length - 1].id);
            }
            io.to(lobby.id).emit('lobby-update', { id: lobby.id, players: lobby.mapLobbyPlayers() });
        }
    });

    socket.on('switch-weapon', (slotIndex) => {
        const lobby = lobbies[socket.lobbyId];
        if (lobby && lobby.players[socket.id]) {
            const p = lobby.players[socket.id];
            if (slotIndex >= 0 && slotIndex < p.slots.length) p.currentSlot = slotIndex;
        }
    });

    socket.on('change-chassis', (chassisType) => {
        const lobby = lobbies[socket.lobbyId];
        if (lobby && lobby.players[socket.id] && !lobby.active) {
            const p = lobby.players[socket.id];
            if (CHASSIS[chassisType]) {
                const config = CHASSIS[chassisType];
                p.chassis = chassisType; p.hp = config.hp; p.maxHp = p.hp;
                p.slots = [...config.weapons]; p.currentSlot = 0;
                if (p.body) Matter.Body.setMass(p.body, config.mass);
                io.to(lobby.id).emit('lobby-update', { id: lobby.id, players: lobby.mapLobbyPlayers() });
            }
        }
    });

    socket.on('change-loadout', (data) => {
        const lobby = lobbies[socket.lobbyId];
        if (lobby && lobby.players[socket.id] && !lobby.active) {
            const p = lobby.players[socket.id];
            const { slotIndex, weaponType } = data;
            const config = CHASSIS[p.chassis];
            if (config && config.allowedWeapons.includes(weaponType)) {
                if (slotIndex >= 0 && slotIndex < config.slots) {
                    p.slots[slotIndex] = weaponType;
                    io.to(lobby.id).emit('lobby-update', { id: lobby.id, players: lobby.mapLobbyPlayers() });
                }
            }
        }
    });

    socket.on('request-rematch', () => {
        const lobby = lobbies[socket.lobbyId];
        if (lobby) lobby.resetLobby();
    });

    socket.on('debug-spawn-bot', (data) => {
        if (!IS_DEV) return;
        const lobby = lobbies[socket.lobbyId];
        if (lobby) lobby.addBot(data.difficulty || 'NORMAL', data.pos, data.isActive);
    });

    socket.on('debug-toggle-bots', (active) => {
        if (!IS_DEV) return;
        const lobby = lobbies[socket.lobbyId];
        if (lobby) Object.values(lobby.players).forEach(p => { if (p.isBot) p.isActive = active; });
    });

    socket.on('debug-spawn-terrain', (data) => {
        if (!IS_DEV) return;
        const lobby = lobbies[socket.lobbyId];
        if (lobby) lobby.spawnBuilding(data.pos, data.w || 100, data.h || 100);
    });

    socket.on('debug-set-chassis', (chassisType) => {
        if (!IS_DEV) return;
        const lobby = lobbies[socket.lobbyId];
        if (lobby && lobby.players[socket.id] && CHASSIS[chassisType]) {
            const p = lobby.players[socket.id];
            const config = CHASSIS[chassisType];
            p.chassis = chassisType; p.hp = config.hp; p.maxHp = p.hp;
            p.slots = [...config.weapons]; p.currentSlot = 0;
            if (p.body) Matter.Body.setMass(p.body, config.mass);
            socket.emit('player-event', { text: `GOD MODE: ${chassisType} ACTIVATED`, color: '#ff00ff' });
        }
    });

    socket.on('disconnect', () => {

        const lobby = lobbies[socket.lobbyId];
        if (lobby) {
            const username = lobby.players[socket.id]?.username || 'PLAYER';
            lobby.removePlayer(socket.id);
            if (Object.values(lobby.players).filter(p => !p.isBot).length === 0) {
                lobby.destroy(); delete lobbies[socket.lobbyId];
                if (MONGO_URL) LobbyModel.deleteOne({ lobbyId: socket.lobbyId }).catch(console.error);
            } else {
                io.to(lobby.id).emit('player-event', { text: `${username.toUpperCase()} LEFT`, color: '#ff3333' });
                io.to(lobby.id).emit('lobby-update', { id: lobby.id, players: lobby.mapLobbyPlayers() });
            }
        }
    });
});

async function syncLobbyToDB(lobby) {
    if (!MONGO_URL) return;
    try {
        await LobbyModel.findOneAndUpdate(
            { lobbyId: lobby.id },
            { 
                players: Object.values(lobby.players).filter(p => !p.isBot).length,
                bots: Object.values(lobby.players).filter(p => p.isBot).length,
                active: lobby.active,
                lastUpdate: new Date()
            },
            { upsert: true }
        );
    } catch (e) { console.error('DB Sync Error:', e); }
}

server.listen(PORT, '0.0.0.0', () => {
    console.log(`Server on ${PORT} [${ENVIRONMENT.toUpperCase()}]`);
}).on('error', (err) => {
    if (err.code === 'EADDRINUSE') {
        console.error(`ERROR: Port ${PORT} is already in use. Please kill any existing node processes.`);
        process.exit(1);
    } else {
        console.error('Server Error:', err);
    }
});
