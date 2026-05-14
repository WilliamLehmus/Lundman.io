import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import path from 'path';
import { fileURLToPath } from 'url';
import Matter from 'matter-js';
import axios from 'axios';
import dotenv from 'dotenv';

// 1. Initial Load of environment variables
dotenv.config();

function findDiscordWebhook() {
    const keys = Object.keys(process.env);
    
    // Preference 1: Explicit keys
    if (process.env.DISCORD_FEEDBACK_WEBHOOK_URL) return process.env.DISCORD_FEEDBACK_WEBHOOK_URL;
    if (process.env.DISCORD_WEBHOOK_URL) return process.env.DISCORD_WEBHOOK_URL;
    
    // Preference 2: Any key containing DISCORD (case insensitive)
    const discordKey = keys.find(k => k.toUpperCase().includes('DISCORD'));
    if (discordKey && process.env[discordKey] && process.env[discordKey].startsWith('http')) {
        return process.env[discordKey];
    }
    
    // Preference 3: Greedy search for Discord Webhook URL format in ALL variables
    const greedyMatch = keys.find(k => {
        const val = process.env[k];
        return val && typeof val === 'string' && val.includes('discord.com/api/webhooks/');
    });
    
    if (greedyMatch) return process.env[greedyMatch];
    return null;
}

const BOOT_WEBHOOK = findDiscordWebhook();

import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';

// Import Modular Logic
import { loadPlayers, savePlayers, getPlayerData, setPlayerData } from './logic/Persistence.js';
import PlayerModel from './logic/PlayerModel.js';
import { Lobby } from './logic/LobbyManager.js';
import { CHASSIS, MIN_PLAYERS, ALL_WEAPONS } from './gameConfig.js';

const ENVIRONMENT = process.env.NODE_ENV || 'development';
const IS_DEV = ENVIRONMENT === 'development';

if (IS_DEV) {
    CHASSIS.DEV = {
        name: 'Dev Tank',
        hp: 1000,
        speed: 0.0040, 
        turnSpeed: 0.08,
        mass: 10,
        slots: 7,
        allowedWeapons: ALL_WEAPONS,
        weapons: ['STANDARD', 'HEAVY_GUN', 'TESLA', 'FLAMETHROWER', 'WATER_CANNON', 'FROST_GUN', 'DIRT_GUN']
    };
}




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

// Initial Data Load & Migration
const localPlayers = loadPlayers();
setPlayerData(localPlayers);
const lobbies = {};

// DIAGNOSTIC STARTUP LOG
const discordKeys = Object.keys(process.env).filter(k => k.includes('DISCORD'));
console.log(`[STARTUP] Environment - NODE_ENV: ${process.env.NODE_ENV}`);
console.log(`[STARTUP] Discord Diagnostic - Found keys: ${discordKeys.join(', ')}`);
if (process.env.DISCORD_FEEDBACK_WEBHOOK_URL) {
    console.log(`[STARTUP] Discord Webhook URL is present (Length: ${process.env.DISCORD_FEEDBACK_WEBHOOK_URL.length})`);
} else {
    console.warn(`[STARTUP] WARNING: DISCORD_FEEDBACK_WEBHOOK_URL IS MISSING!`);
}

async function migratePlayersToDB() {
    if (!MONGO_URL || !PlayerModel) return;
    try {
        const count = await PlayerModel.countDocuments();
        if (count === 0 && Object.keys(localPlayers).length > 0) {
            console.log('Migrating local players to MongoDB...');
            const playersToInsert = Object.entries(localPlayers).map(([username, data]) => ({
                username,
                ...data
            }));
            await PlayerModel.insertMany(playersToInsert);
            console.log(`Successfully migrated ${playersToInsert.length} players to MongoDB.`);
        }
    } catch (err) {
        console.error('Migration Error:', err);
    }
}
migratePlayersToDB();

// Production Static Serving
if (ENVIRONMENT === 'production') {
    // 1. Set Cache-Control for index.html to prevent stale client builds
    app.use((req, res, next) => {
        if (req.path === '/' || req.path === '/index.html') {
            res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
            res.setHeader('Pragma', 'no-cache');
            res.setHeader('Expires', '0');
            res.setHeader('Surrogate-Control', 'no-store');
        }
        next();
    });

    // 2. Serve static files
    app.use(express.static(path.join(__dirname, '../frontend/dist'), {
        etag: true,
        lastModified: true,
        maxAge: '1d' // Assets can be cached for a day, but index.html is bypassed above
    }));
}

app.use(express.json()); // Enable JSON parsing for API requests

// Capture everything at the absolute top level
// Capture everything at the absolute top level for requests
const STARTUP_ENV_KEYS = Object.keys(process.env);
const STARTUP_DISCORD_KEY = STARTUP_ENV_KEYS.find(k => k.toUpperCase().includes('DISCORD'));
const FROZEN_WEBHOOK = BOOT_WEBHOOK || process.env.DISCORD_FEEDBACK_WEBHOOK_URL || process.env.DISCORD_WEBHOOK_URL || (STARTUP_DISCORD_KEY ? process.env[STARTUP_DISCORD_KEY] : null);

console.log(`[BOOT] Startup Keys: ${STARTUP_ENV_KEYS.length}`);
console.log(`[BOOT] Found Discord Key at boot: ${STARTUP_DISCORD_KEY || 'NONE'}`);
console.log(`[BOOT] Frozen Webhook length: ${FROZEN_WEBHOOK ? FROZEN_WEBHOOK.length : 0}`);

// Feedback API Route
app.post('/api/feedback', async (req, res) => {
    try {
        const { message, username } = req.body;
        if (!message) return res.status(400).json({ error: 'Message is required' });
        
        const currentKeys = Object.keys(process.env);
        const currentDiscordKey = currentKeys.find(k => k.toUpperCase().includes('DISCORD'));
        
        console.log('--- FEEDBACK DEBUG ---');
        console.log(`Now Keys: ${currentKeys.length} | Discord Key Now: ${currentDiscordKey || 'NONE'}`);
        console.log(`Frozen Webhook exists: ${!!FROZEN_WEBHOOK}`);
        
        // Priority: Frozen > Live > Fallback
        const webhookUrl = FROZEN_WEBHOOK || process.env.DISCORD_FEEDBACK_WEBHOOK_URL || (currentDiscordKey ? process.env[currentDiscordKey] : null);

        if (!webhookUrl) {
            return res.status(500).json({ 
                error: 'Webhook URL not configured',
                diagnostic: `StartupKeys: ${STARTUP_ENV_KEYS.length}, NowKeys: ${currentKeys.length}, StartupDiscord: ${STARTUP_DISCORD_KEY || 'None'}`,
                hint: 'If StartupDiscord is present but webhookUrl is null, contact support.'
            });
        }

        const trimmedUrl = webhookUrl.trim();
        const content = `**Feedback from ${username || 'Anonymous'}:**\n${message}`;

        await axios.post(trimmedUrl, { content }, { timeout: 10000 });
        res.status(200).json({ success: true });
    } catch (err) {
        console.error('[FEEDBACK] Discord Webhook Error:', err.message);
        
        let detail = err.message;
        if (err.response) {
            detail = `Discord returned ${err.response.status}: ${JSON.stringify(err.response.data)}`;
        } else if (err.request) {
            detail = 'No response from Discord (Network Timeout)';
        }

        res.status(500).json({ 
            error: 'Failed to send feedback', 
            detail: detail,
            hint: 'Double-check DISCORD_FEEDBACK_WEBHOOK_URL in the Railway dashboard.'
        });
    }
});

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
        // Prevent serving index.html for missing JS/CSS/Assets (which causes MIME type errors)
        const isAsset = /\.(js|css|png|jpg|jpeg|gif|svg|ico|mp3)$/i.test(req.path);
        if (isAsset) {
            console.warn(`[404] Asset not found: ${req.path}`);
            return res.status(404).send('Asset Not Found');
        }
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

        let dbPlayer = null;
        if (MONGO_URL) {
            dbPlayer = await PlayerModel.findOne({ username });
        } else {
            const playerData = getPlayerData();
            dbPlayer = playerData[username];
        }

        if (dbPlayer) {
            if (!pin || !dbPlayer.pin) {
                if (pin) {
                    const hashed = await bcrypt.hash(pin, 10);
                    if (MONGO_URL) {
                        await PlayerModel.updateOne({ username }, { pin: hashed });
                    } else {
                        getPlayerData()[username].pin = hashed;
                    }
                }
            } else {
                const match = await bcrypt.compare(pin, dbPlayer.pin);
                if (!match) return socket.emit('auth-error', { message: 'INVALID PIN FOR THIS CALLSIGN!' });
            }
        } else {
            const hashedPin = pin ? await bcrypt.hash(pin, 10) : null;
            if (MONGO_URL) {
                await PlayerModel.create({
                    username,
                    pin: hashedPin,
                    kills: 0, deaths: 0, scrap: 0,
                    lastSeen: new Date()
                });
            } else {
                getPlayerData()[username] = { kills: 0, deaths: 0, scrap: 0, lastSeen: Date.now(), pin: hashedPin };
            }
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
        io.to(bestLobby.id).emit('lobby-update', { id: bestLobby.id, ...bestLobby.mapLobbyPlayers() });
        syncLobbyToDB(bestLobby);
    });

    socket.on('host-game', async (data) => {
        if (!data || !data.username || data.username.trim() === '') return;
        let { username, chassisType, pin } = data;
        username = username.trim().substring(0, 12);

        let dbPlayer = null;
        if (MONGO_URL) {
            dbPlayer = await PlayerModel.findOne({ username });
        } else {
            const playerData = getPlayerData();
            dbPlayer = playerData[username];
        }

        if (dbPlayer) {
            if (dbPlayer.pin) {
                const match = await bcrypt.compare(pin, dbPlayer.pin);
                if (!match) return socket.emit('auth-error', { message: 'INVALID PIN!' });
            }
        } else {
            const hashedPin = pin ? await bcrypt.hash(pin, 10) : null;
            if (MONGO_URL) {
                await PlayerModel.create({
                    username,
                    pin: hashedPin,
                    kills: 0, deaths: 0, scrap: 0,
                    lastSeen: new Date()
                });
            } else {
                getPlayerData()[username] = { kills: 0, deaths: 0, scrap: 0, lastSeen: Date.now(), pin: hashedPin };
            }
        }

        const id = Math.random().toString(36).substring(7);
        const lobby = new Lobby(id, io);
        lobbies[id] = lobby;
        lobby.addPlayer(socket, username, chassisType);
        socket.join(id);
        socket.lobbyId = id;
        io.to(socket.id).emit('lobby-update', { id: lobby.id, ...lobby.mapLobbyPlayers() });
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
        
        let dbPlayer = null;
        if (MONGO_URL) {
            dbPlayer = await PlayerModel.findOne({ username });
        } else {
            const playerData = getPlayerData();
            dbPlayer = playerData[username];
        }

        if (dbPlayer && dbPlayer.pin) {
            const match = await bcrypt.compare(pin, dbPlayer.pin);
            if (!match) return socket.emit('auth-error', { message: 'INVALID PIN!' });
        }

        if (Object.keys(lobby.players).length >= 10) return socket.emit('auth-error', { message: 'LOBBY IS FULL!' });
        lobby.addPlayer(socket, username, chassisType);
        socket.join(lobby.id);
        socket.lobbyId = lobby.id;
        if (lobby.active) socket.emit('game-started');
        io.to(lobby.id).emit('lobby-update', { id: lobby.id, ...lobby.mapLobbyPlayers() });
        syncLobbyToDB(lobby);
    });

    socket.on('add-bot', (data) => {
        const lobby = lobbies[socket.lobbyId];
        if (lobby && Object.keys(lobby.players).length < 10) {
            lobby.addBot(data.difficulty, null, true, data.team, data.chassisType);
            io.to(lobby.id).emit('lobby-update', { id: lobby.id, ...lobby.mapLobbyPlayers() });
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
            io.to(lobby.id).emit('lobby-update', { id: lobby.id, ...lobby.mapLobbyPlayers() });
        }
    });

    socket.on('toggle-drones', (enabled) => {
        const lobby = lobbies[socket.lobbyId];
        if (lobby && lobby.players[socket.id]) {
            const players = Object.values(lobby.players).sort((a,b) => a.joinedAt - b.joinedAt);
            const isHost = players.length > 0 && players[0].id === socket.id;
            if (isHost) {
                lobby.dronesEnabled = !!enabled;
                io.to(lobby.id).emit('lobby-update', { id: lobby.id, ...lobby.mapLobbyPlayers() });
            }
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
            io.to(lobby.id).emit('lobby-update', { id: lobby.id, ...lobby.mapLobbyPlayers() });
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
            io.to(lobby.id).emit('lobby-update', { id: lobby.id, ...lobby.mapLobbyPlayers() });
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
                p.chassis = chassisType; 
                p.hp = config.hp; 
                p.maxHp = config.hp;
                // Force update slots from the new config
                p.slots = [...config.weapons]; 
                p.currentSlot = 0;
                
                if (p.body) Matter.Body.setMass(p.body, config.mass);
                console.log(`[CHASSIS_CHANGE] Player ${p.username} changed to ${chassisType}. Slots:`, p.slots);
                io.to(lobby.id).emit('lobby-update', { id: lobby.id, ...lobby.mapLobbyPlayers() });
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
                    io.to(lobby.id).emit('lobby-update', { id: lobby.id, ...lobby.mapLobbyPlayers() });
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
            
            // Sync with all clients so they update their playerProfiles cache (Egress Optimization)
            io.to(lobby.id).emit('lobby-update', { id: lobby.id, ...lobby.mapLobbyPlayers() });
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
                io.to(lobby.id).emit('lobby-update', { id: lobby.id, ...lobby.mapLobbyPlayers() });
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
 
 
