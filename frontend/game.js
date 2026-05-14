import { io } from "socket.io-client";
import versionData from './version.json';
import { MATERIALS, MATERIAL_PROPERTIES, BIOMES, CHASSIS, WEAPON_MODULES, ALL_WEAPONS } from '../backend/gameConfig.js';

// Connect to the same host the game is served from
const socket = io({
    transports: ['polling', 'websocket'],
    reconnectionAttempts: 15,
    reconnectionDelay: 1000,
    timeout: 20000
});


socket.on('connect_error', (err) => {
    console.error('Socket Connection Error:', err.message);
    if (err.description) console.error('Error Description:', err.description);
    if (err.context) console.error('Error Context:', err.context);
});

socket.on('reconnect_attempt', (attempt) => {
    console.log('Attempting to reconnect...', attempt);
});

console.log('Socket initialized, attempting connection...');

socket.on('explosion', (data) => {
    shake.intensity = 20;
    // Play ElevenLabs explosion sound (True Premium)
    audioManager.playSFX(explosionSFX, 1.2);
    // Massive particle burst
    for (let i = 0; i < 30; i++) {
        particles.push({
            x: data.x,
            y: data.y,
            vx: (Math.random() - 0.5) * 12,
            vy: (Math.random() - 0.5) * 12,
            life: 1.0,
            color: Math.random() > 0.5 ? '#ff4400' : '#ffcc00',
            size: 10 + Math.random() * 10
        });
    }
    for (let i = 0; i < 15; i++) {
        particles.push({
            x: data.x,
            y: data.y,
            vx: (Math.random() - 0.5) * 8,
            vy: (Math.random() - 0.5) * 8,
            life: 1.0,
            color: '#fff',
            size: 4 + Math.random() * 4
        });
    }
});

socket.on('barrel-break', (data) => {
    // 1. Play ElevenLabs break sound (True Premium)
    audioManager.playSFX(barrelBreakSFX, 0.8);

    // 2. Play material-specific splash sound
    let sfx = null;
    let vol = 1.0;
    
    if (data.type === 'explosion') {
        // Already handled by playExplosion above
    } else if (data.type === MATERIALS.WATER) sfx = waterSplashSFX;
    else if (data.type === MATERIALS.OIL) sfx = oilSloshSFX;
    else if (data.type === MATERIALS.ACID) sfx = acidSplashSFX;
    else if (data.type === MATERIALS.ICE) sfx = iceSFX;
    else if (data.type === MATERIALS.GAS) sfx = gasEntrySFX;
    
    if (sfx) audioManager.playSFX(sfx, vol);
});

socket.on('player-event', (data) => {
    // Handling for player-specific events like level up or achievements
});

socket.on('connect', () => {
    console.log('Socket connected successfully:', socket.id);
    myId = socket.id;
});

let debugMode = false;
let debugSpawnType = null;
let botsActive = true;

socket.on('debug-init', () => {
    debugMode = true;
    
    // Add DEV tank configuration to local config (hidden from selection UI)
    if (!CHASSIS.DEV) {
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

    const debugMenu = document.getElementById('debug-menu');
    if (debugMenu) {
        debugMenu.classList.remove('hidden');
        debugMenu.style.display = 'flex';
        
        // Add a dedicated button for the DEV tank if it's missing from the menu
        if (!document.getElementById('debug-dev-tank-btn')) {
            const group = debugMenu.querySelector('.debug-group');
            if (group) {
                const btn = document.createElement('button');
                btn.id = 'debug-dev-tank-btn';
                btn.className = 'debug-btn';
                btn.innerText = 'ACTIVATE DEV TANK';
                btn.onclick = () => {
                    socket.emit('debug-set-chassis', 'DEV');
                };
                group.appendChild(btn);
            }
        }
    }
    console.log('Debug mode activated');
});

socket.on('dev-reload', () => {
    console.log('Backend changed, reloading...');
    location.reload();
});

const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');

// UI Elements
const splashScreen = document.getElementById('splash-screen');
const lobbyScreen = document.getElementById('lobby-screen');
const hud = document.getElementById('game-hud');
const gameOverScreen = document.getElementById('game-over');
const loadingProgress = document.getElementById('loading-progress');
const fpsCounter = document.getElementById('fps-counter');

const usernameInput = document.getElementById('username');
const pinInput = document.getElementById('user-pin');
const hostBtn = document.getElementById('host-btn');
const joinBtn = document.getElementById('join-btn');
const quickMatchBtn = document.getElementById('quick-match-btn');
const startGameBtn = document.getElementById('start-game-btn');
const readyBtn = document.getElementById('ready-btn');
const dronesToggle = document.getElementById('drones-toggle');

const serverBrowser = document.getElementById('server-browser');
const serverList = document.getElementById('server-list');
const refreshServersBtn = document.getElementById('refresh-servers-btn');
const closeBrowserBtn = document.getElementById('close-browser-btn');

const blueTeamList = document.getElementById('blue-team-list');
const pinkTeamList = document.getElementById('pink-team-list');
const lobbyIdSpan = document.getElementById('lobby-id');
const lobbyStatus = document.getElementById('lobby-status');

// Bot management is now handled via slots

const p1HpBar = document.getElementById('p1-hp');
const p1Scrap = document.getElementById('p1-scrap');
const hpCurrentEl = document.getElementById('hp-current');
const hpMaxEl = document.getElementById('hp-max');
const p2HpBar = document.getElementById('p2-hp');
const p1CooldownBar = document.getElementById('p1-cooldown');
const p2CooldownBar = document.getElementById('p2-cooldown');

// Game State - server (authoritative) vs rendered (interpolated)
let serverState = { players: [], bullets: [], elements: [], zones: [] };
let gameState   = { players: [], bullets: [], elements: [], zones: [] };
let playerProfiles = new Map(); // Cache for static player data (u, t, mh, ch, sl)
let staticMapData = { zones: [], buildings: [] };

let lastScrap = 0;
let popups = []; // { x, y, text, life }
let killFeed = []; // { killer, victim, weapon, killerTeam, victimTeam, time }
let myId = null;
let inputSeq = 0;
let pendingInputs = [];

let gameActive = false;
let camera = { x: 0, y: 0 };
let windVector = { x: 1.5, y: 0.5 };
let auroraPhase = 0;
let shake = { x: 0, y: 0, intensity: 0 };
let particles = []; // { x, y, vx, vy, life, color, size }
let atmosphereParticles = []; // { x, y, size, vx, vy, speed, color }
let environmentalObjects = []; // Dynamic objects like Tumbleweeds
let lizards = []; // Scurrying desert life
let scorpions = []; // Desert scorpions
let vultures = []; // Desert vulture shadows
let pigeons = []; // Urban pigeons
let strayCats = []; // Urban cats
let cockroaches = []; // Urban cockroaches
let rats = []; // Industrial rats
let microDrones = []; // Industrial drones
let moths = []; // Industrial moths
let snowHares = []; // Arctic hares
let penguins = []; // Arctic penguins
let arcticFoxes = []; // Arctic foxes
let dragonflies = []; // Wetland dragonflies
let frogs = []; // Wetland frogs
let waterStriders = []; // Wetland striders
let mutatedCrows = []; // Wasteland crows
let scrapBeetles = []; // Wasteland beetles
let radioactiveSlugs = []; // Wasteland slugs
let ripples = []; // Surface disturbances
let windStreaks = []; // Fast moving wind lines
let ashParticles = []; // Atmospheric embers/ash for wasteland
let groundDetails = []; // Cache for procedural cracks/stains
let windIntensity = 1.0;
let windPhase = 0;
let lastBiome = null;
let lastWorldSize = 0;
let lastAtmoBiome = null;
let playerEvents = []; // { text, color, time }
let mousePos = { x: 0, y: 0 };
let canvasRect = null;
let lastInputSent = 0;
let renderTime = 0;
let lastPuddleCheck = 0;
let currentPuddleId = null;

// Liquid Patterns (9 Variations each for variety)
let waterPatterns = []; 
let oilPatterns = [];
let acidPatterns = [];
let gasPatterns = [];
let electricPatterns = [];
let firePatterns = [];
let steamPatterns = [];
let lastWaterPatternUpdate = 0;
let lastOilPatternUpdate = 0;
let lastAcidPatternUpdate = 0;
let lastGasPatternUpdate = 0;
let lastElectricPatternUpdate = 0;
let lastFirePatternUpdate = 0;
let lastSteamPatternUpdate = 0;
const WATER_TILE_SIZE = 128;
const OIL_TILE_SIZE = 128;
const ACID_TILE_SIZE = 128;
const GAS_TILE_SIZE = 128;
const ELECTRIC_TILE_SIZE = 128;
const FIRE_TILE_SIZE = 128;
const STEAM_TILE_SIZE = 128;

const waterCanvases = [];
const waterContexts = [];
const oilCanvases = [];
const oilContexts = [];
const acidCanvases = [];
const acidContexts = [];
const gasCanvases = [];
const gasContexts = [];
const electricCanvases = [];
const electricContexts = [];
const fireCanvases = [];
const fireContexts = [];
const steamCanvases = [];
const steamContexts = [];

// Initialize canvases
for (let i = 0; i < 9; i++) {
    const wCanv = document.createElement('canvas');
    wCanv.width = WATER_TILE_SIZE;
    wCanv.height = WATER_TILE_SIZE;
    waterCanvases.push(wCanv);
    waterContexts.push(wCanv.getContext('2d'));

    const oCanv = document.createElement('canvas');
    oCanv.width = OIL_TILE_SIZE;
    oCanv.height = OIL_TILE_SIZE;
    oilCanvases.push(oCanv);
    oilContexts.push(oCanv.getContext('2d'));

    const aCanv = document.createElement('canvas');
    aCanv.width = ACID_TILE_SIZE;
    aCanv.height = ACID_TILE_SIZE;
    acidCanvases.push(aCanv);
    acidContexts.push(aCanv.getContext('2d'));

    const gCanv = document.createElement('canvas');
    gCanv.width = GAS_TILE_SIZE;
    gCanv.height = GAS_TILE_SIZE;
    gasCanvases.push(gCanv);
    gasContexts.push(gCanv.getContext('2d'));

    const eCanv = document.createElement('canvas');
    eCanv.width = ELECTRIC_TILE_SIZE;
    eCanv.height = ELECTRIC_TILE_SIZE;
    electricCanvases.push(eCanv);
    electricContexts.push(eCanv.getContext('2d'));

    const fCanv = document.createElement('canvas');
    fCanv.width = FIRE_TILE_SIZE;
    fCanv.height = FIRE_TILE_SIZE;
    fireCanvases.push(fCanv);
    fireContexts.push(fCanv.getContext('2d'));

    const sCanv = document.createElement('canvas');
    sCanv.width = STEAM_TILE_SIZE;
    sCanv.height = STEAM_TILE_SIZE;
    steamCanvases.push(sCanv);
    steamContexts.push(sCanv.getContext('2d'));
}

// Global pattern variable for backward compatibility
let waterPattern = null;
let oilPattern = null;
let acidPattern = null;
let gasPattern = null;
let electricPattern = null;
let firePattern = null;
let steamPattern = null;

function updateElectricPattern(time) {
    if (time - lastElectricPatternUpdate < 40) return;
    lastElectricPatternUpdate = time;

    for (let p = 0; p < 9; p++) {
        const ctx = electricContexts[p];
        ctx.clearRect(0, 0, ELECTRIC_TILE_SIZE, ELECTRIC_TILE_SIZE);
        
        // 1. Deep Core Glow
        ctx.fillStyle = 'rgba(0, 40, 100, 0.2)';
        ctx.fillRect(0, 0, ELECTRIC_TILE_SIZE, ELECTRIC_TILE_SIZE);

        // 2. Jittery Static Noise Pattern
        ctx.strokeStyle = 'rgba(0, 242, 255, 0.3)';
        ctx.lineWidth = 1;
        for (let i = 0; i < 12; i++) {
            const x1 = getStableRandom(p + i + time) * ELECTRIC_TILE_SIZE;
            const y1 = getStableRandom(p + i + 1 + time) * ELECTRIC_TILE_SIZE;
            const x2 = x1 + (getStableRandom(p + i + 2) - 0.5) * 30;
            const y2 = y1 + (getStableRandom(p + i + 3) - 0.5) * 30;
            
            ctx.beginPath();
            ctx.moveTo(x1, y1);
            ctx.lineTo(x2, y2);
            ctx.stroke();
        }

        // 3. Arcing Bolts (Sharp neon white/cyan)
        ctx.strokeStyle = '#fff';
        ctx.shadowBlur = 10;
        ctx.shadowColor = '#00f2ff';
        ctx.lineWidth = 1.5;
        for (let i = 0; i < 3; i++) {
            const seed = p * 5 + i + Math.floor(time/100);
            let lx = getStableRandom(seed) * ELECTRIC_TILE_SIZE;
            let ly = getStableRandom(seed + 1) * ELECTRIC_TILE_SIZE;
            
            ctx.beginPath();
            ctx.moveTo(lx, ly);
            for (let segment = 0; segment < 4; segment++) {
                lx += (getStableRandom(seed + segment * 2) - 0.5) * 40;
                ly += (getStableRandom(seed + segment * 2 + 1) - 0.5) * 40;
                ctx.lineTo(lx, ly);
            }
            ctx.stroke();
        }
        ctx.shadowBlur = 0;

        electricPatterns[p] = ctx.createPattern(electricCanvases[p], 'repeat');
    }
}

function updateGasPattern(time) {
    if (time - lastGasPatternUpdate < 60) return;
    lastGasPatternUpdate = time;

    for (let p = 0; p < 9; p++) {
        const ctx = gasContexts[p];
        ctx.clearRect(0, 0, GAS_TILE_SIZE, GAS_TILE_SIZE);
        
        // Wispy Toxic Smoke Texture (Soft Puffs with seamless wrapping)
        for (let i = 0; i < 8; i++) {
            const seed = p * 12 + i;
            const gx = getStableRandom(seed) * GAS_TILE_SIZE;
            const gy = getStableRandom(seed + 1) * GAS_TILE_SIZE;
            const r = 35 + getStableRandom(seed + 2) * 35;
            
            const drawPuff = (ox, oy) => {
                const g = ctx.createRadialGradient(gx + ox, gy + oy, 0, gx + ox, gy + oy, r);
                g.addColorStop(0, 'rgba(180, 255, 0, 0.25)'); // More intense toxic yellow-green
                g.addColorStop(0.5, 'rgba(120, 200, 0, 0.1)');
                g.addColorStop(1, 'rgba(120, 200, 0, 0)');
                ctx.fillStyle = g;
                ctx.beginPath();
                ctx.arc(gx + ox, gy + oy, r, 0, Math.PI * 2);
                ctx.fill();
            };

            // Draw with 9-way wrapping for perfect tiling
            for (let xx = -1; xx <= 1; xx++) {
                for (let yy = -1; yy <= 1; yy++) {
                    drawPuff(xx * GAS_TILE_SIZE, yy * GAS_TILE_SIZE);
                }
            }
        }

        // Add soft swirling wisps
        ctx.strokeStyle = 'rgba(212, 255, 0, 0.05)';
        ctx.lineWidth = 2;
        for (let i = 0; i < 2; i++) {
            const drift = time * 0.0005 + p + i;
            ctx.beginPath();
            for (let x = 0; x <= GAS_TILE_SIZE; x += 20) {
                const y = (i * 60 + 30) + Math.cos(x * 0.03 + drift) * 20;
                if (x === 0) ctx.moveTo(x, y);
                else ctx.lineTo(x, y);
            }
            ctx.stroke();
        }

        gasPatterns[p] = ctx.createPattern(gasCanvases[p], 'repeat');
    }
}

function updateAcidPattern(time) {
    if (time - lastAcidPatternUpdate < 60) return;
    lastAcidPatternUpdate = time;

    for (let p = 0; p < 9; p++) {
        const ctx = acidContexts[p];
        ctx.clearRect(0, 0, ACID_TILE_SIZE, ACID_TILE_SIZE);
        
        // 1. Toxic Base (More vibrant)
        ctx.fillStyle = '#051a05';
        ctx.fillRect(0, 0, ACID_TILE_SIZE, ACID_TILE_SIZE);

        // 2. Radioactive Glow
        const grad = ctx.createRadialGradient(ACID_TILE_SIZE/2, ACID_TILE_SIZE/2, 0, ACID_TILE_SIZE/2, ACID_TILE_SIZE/2, ACID_TILE_SIZE);
        grad.addColorStop(0, 'rgba(0, 255, 100, 0.25)');
        grad.addColorStop(1, 'rgba(0, 50, 0, 0)');
        ctx.fillStyle = grad;
        ctx.fillRect(0, 0, ACID_TILE_SIZE, ACID_TILE_SIZE);

        // 3. Corrosive Bubbles (Brighter)
        ctx.fillStyle = 'rgba(0, 255, 50, 0.5)';
        for (let i = 0; i < 6; i++) {
            const phase = time * 0.002 + i + p;
            const bx = (getStableRandom(p + i) * ACID_TILE_SIZE + time * 0.01) % ACID_TILE_SIZE;
            const by = (getStableRandom(p + i + 1) * ACID_TILE_SIZE) % ACID_TILE_SIZE;
            const r = 1.5 + Math.sin(phase) * 2;
            if (r > 0.5) {
                ctx.beginPath();
                ctx.arc(bx, by, r, 0, Math.PI * 2);
                ctx.fill();
                // Glow around bubble
                ctx.shadowBlur = 4;
                ctx.shadowColor = '#0f0';
                ctx.stroke();
                ctx.shadowBlur = 0;
            }
        }

        // 4. Toxic Swirls (More visible)
        ctx.strokeStyle = 'rgba(0, 255, 100, 0.2)';
        ctx.lineWidth = 2;
        for (let i = 0; i < 2; i++) {
            ctx.beginPath();
            const offset = time * 0.001 + i;
            for (let x = 0; x <= ACID_TILE_SIZE; x += 10) {
                const y = (i * 40 + 30) + Math.sin(x * 0.05 + offset) * 15;
                if (x === 0) ctx.moveTo(x, y);
                else ctx.lineTo(x, y);
            }
            ctx.stroke();
        }

        acidPatterns[p] = ctx.createPattern(acidCanvases[p], 'repeat');
    }
}

function updateOilPattern(time) {
    if (time - lastOilPatternUpdate < 60) return; 
    lastOilPatternUpdate = time;

    for (let p = 0; p < 9; p++) {
        const ctx = oilContexts[p];
        ctx.clearRect(0, 0, OIL_TILE_SIZE, OIL_TILE_SIZE);
        
        // Base color - Thicker, more opaque black/grey
        ctx.fillStyle = `rgba(15, 15, 20, 0.95)`;
        ctx.fillRect(0, 0, OIL_TILE_SIZE, OIL_TILE_SIZE);

        // Enhanced Iridescence (Oil Sheen)
        const sheenPhase = time * 0.0005 + p;
        for (let i = 0; i < 2; i++) {
            const h = (sheenPhase * 50 + i * 60 + p * 30) % 360;
            const grad = ctx.createLinearGradient(0, 0, OIL_TILE_SIZE, OIL_TILE_SIZE);
            grad.addColorStop(0, `hsla(${h}, 40%, 40%, 0)`);
            grad.addColorStop(0.5, `hsla(${h}, 50%, 50%, 0.15)`);
            grad.addColorStop(1, `hsla(${h}, 40%, 40%, 0)`);
            
            ctx.strokeStyle = grad;
            ctx.lineWidth = 15;
            ctx.beginPath();
            const y = (OIL_TILE_SIZE * 0.3) + (i * 40) + Math.sin(time * 0.001 + p) * 15;
            ctx.moveTo(-20, y);
            ctx.bezierCurveTo(OIL_TILE_SIZE/2, y + 30, OIL_TILE_SIZE/2, y - 30, OIL_TILE_SIZE + 20, y);
            ctx.stroke();
        }

        // Spherical Bubbles with highlights
        for (let i = 0; i < 4; i++) {
            const phase = time * 0.0008 + i + p;
            const bx = ((i * 65 + p * 12) % OIL_TILE_SIZE);
            const by = ((i * 45 + p * 22) % OIL_TILE_SIZE);
            const r = 3 + Math.sin(phase) * 2;
            
            if (r > 1) {
                // Bubble body
                const bGrad = ctx.createRadialGradient(bx, by, 0, bx, by, r);
                bGrad.addColorStop(0, 'rgba(60, 60, 70, 0.4)');
                bGrad.addColorStop(1, 'rgba(20, 20, 25, 0.1)');
                ctx.fillStyle = bGrad;
                ctx.beginPath();
                ctx.arc(bx, by, r, 0, Math.PI * 2);
                ctx.fill();
                
                // Bubble Specular (Reflection)
                ctx.fillStyle = 'rgba(255, 255, 255, 0.15)';
                ctx.beginPath();
                ctx.arc(bx - r/3, by - r/3, r/4, 0, Math.PI * 2);
                ctx.fill();
            }
        }

        oilPatterns[p] = ctx.createPattern(oilCanvases[p], 'repeat');
    }
    oilPattern = oilPatterns[0];
}

function updateWaterPattern(time) {
    if (time - lastWaterPatternUpdate < 50) return; // 20fps update
    lastWaterPatternUpdate = time;

    for (let p = 0; p < 9; p++) {
        const ctx = waterContexts[p];
        ctx.clearRect(0, 0, WATER_TILE_SIZE, WATER_TILE_SIZE);
        
        // 1. Deep Base Depth with parallax-like layers
        const hueShift = Math.sin(time * 0.001 + p) * 10;
        ctx.fillStyle = `hsl(${210 + hueShift}, 80%, 15%)`;
        ctx.fillRect(0, 0, WATER_TILE_SIZE, WATER_TILE_SIZE);

        // 2. Mid-layer Glow
        const grad = ctx.createRadialGradient(WATER_TILE_SIZE/2, WATER_TILE_SIZE/2, 0, WATER_TILE_SIZE/2, WATER_TILE_SIZE/2, WATER_TILE_SIZE);
        grad.addColorStop(0, `hsla(${200 + hueShift}, 70%, 30%, 0.3)`);
        grad.addColorStop(1, `hsla(${220 + hueShift}, 90%, 10%, 0)`);
        ctx.fillStyle = grad;
        ctx.fillRect(0, 0, WATER_TILE_SIZE, WATER_TILE_SIZE);

        // 3. VARIATION STYLES (9 different personalities)
        ctx.lineWidth = 2;
        
        if (p % 3 === 0) { // STYLE: Ripply/Active - Neon Cyan highlights
            ctx.strokeStyle = 'rgba(0, 242, 255, 0.15)';
            for (let i = 0; i < 5; i++) {
                ctx.beginPath();
                const freq = 0.04 + (p * 0.005);
                const offset = time * 0.002 + i * 1.5;
                for (let x = 0; x <= WATER_TILE_SIZE; x += 10) {
                    const y = (i * WATER_TILE_SIZE / 5) + Math.sin(x * freq + offset) * 12;
                    if (x === 0) ctx.moveTo(x, y);
                    else ctx.lineTo(x, y);
                }
                ctx.stroke();
            }
        } else if (p % 3 === 1) { // STYLE: Bubbly/Murky - Deep Cyan
            ctx.fillStyle = 'rgba(0, 242, 255, 0.08)';
            for (let i = 0; i < 12; i++) {
                const phase = time * 0.0015 + i + p;
                const bx = ((i * 45 + p * 15) % WATER_TILE_SIZE);
                const by = ((Math.sin(phase) * 30 + i * 35) % WATER_TILE_SIZE);
                const r = 2 + Math.sin(phase) * 3;
                if (r > 0.5) {
                    ctx.beginPath();
                    ctx.arc(bx, by, r, 0, Math.PI * 2);
                    ctx.fill();
                    // Tiny bubble highlight
                    ctx.fillStyle = 'rgba(255, 255, 255, 0.1)';
                    ctx.beginPath(); ctx.arc(bx - r/3, by - r/3, r/4, 0, Math.PI * 2); ctx.fill();
                    ctx.fillStyle = 'rgba(0, 242, 255, 0.08)';
                }
            }
        } else { // STYLE: Deep/Calm - Soft Blue
            ctx.fillStyle = 'rgba(0, 150, 255, 0.05)';
            for (let i = 0; i < 3; i++) {
                ctx.beginPath();
                const x = getStableRandom(p + i) * WATER_TILE_SIZE;
                const y = getStableRandom(p + i + 1) * WATER_TILE_SIZE;
                const r = 20 + getStableRandom(p + i + 2) * 30;
                ctx.arc(x, y, r, 0, Math.PI * 2);
                ctx.fill();
            }
        }

        // 4. Premium Caustics (Light shimmer / Network look)
        ctx.save();
        ctx.globalCompositeOperation = 'screen';
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.05)';
        ctx.lineWidth = 1;
        for (let i = 0; i < 3; i++) {
            const cx = (time * 0.02 + i * 40 + p * 10) % WATER_TILE_SIZE;
            const cy = (time * 0.01 + i * 60 + p * 20) % WATER_TILE_SIZE;
            ctx.beginPath();
            ctx.moveTo(cx - 20, cy);
            ctx.lineTo(cx + 20, cy);
            ctx.moveTo(cx, cy - 20);
            ctx.lineTo(cx, cy + 20);
            ctx.stroke();
        }
        ctx.restore();

        // 5. Flowing Highlights (Linear sheen)
        const flowX = (time * 0.05) % (WATER_TILE_SIZE * 2);
        const flowGrad = ctx.createLinearGradient(flowX - 50, 0, flowX, 0);
        flowGrad.addColorStop(0, 'rgba(0, 242, 255, 0)');
        flowGrad.addColorStop(0.5, 'rgba(0, 242, 255, 0.05)');
        flowGrad.addColorStop(1, 'rgba(0, 242, 255, 0)');
        ctx.fillStyle = flowGrad;
        ctx.fillRect(0, 0, WATER_TILE_SIZE, WATER_TILE_SIZE);

        waterPatterns[p] = ctx.createPattern(waterCanvases[p], 'repeat');
    }
    waterPattern = waterPatterns[0];
}

function updateFirePattern(time) {
    if (time - lastFirePatternUpdate < 40) return; 
    lastFirePatternUpdate = time;

    for (let p = 0; p < 9; p++) {
        const ctx = fireContexts[p];
        ctx.clearRect(0, 0, FIRE_TILE_SIZE, FIRE_TILE_SIZE);
        
        // 1. Core Heat (Intense Glowing Red)
        ctx.fillStyle = '#661100';
        ctx.fillRect(0, 0, FIRE_TILE_SIZE, FIRE_TILE_SIZE);

        // 2. Rising Flames (Denser & More intense)
        for (let i = 0; i < 15; i++) {
            const seed = p * 15 + i;
            const phase = time * 0.005 + seed;
            const fx = (getStableRandom(seed) * FIRE_TILE_SIZE + Math.sin(phase) * 20) % FIRE_TILE_SIZE;
            const fy = (getStableRandom(seed + 1) * FIRE_TILE_SIZE - time * 0.12) % FIRE_TILE_SIZE;
            const r = 15 + getStableRandom(seed + 2) * 45;
            
            const g = ctx.createRadialGradient(fx, fy, 0, fx, fy, r);
            g.addColorStop(0, 'rgba(255, 255, 200, 0.9)'); // White-Hot core
            g.addColorStop(0.2, 'rgba(255, 230, 0, 0.8)'); // Yellow
            g.addColorStop(0.5, 'rgba(255, 80, 0, 0.6)');  // Orange
            g.addColorStop(1, 'rgba(150, 0, 0, 0)');
            
            ctx.fillStyle = g;
            ctx.beginPath();
            ctx.arc(fx, fy, r, 0, Math.PI * 2);
            ctx.fill();
        }

        // 3. Flickering White-Hot Embers
        ctx.fillStyle = 'rgba(255, 255, 255, 0.8)';
        for (let i = 0; i < 4; i++) {
            const ex = getStableRandom(time + i + p) * FIRE_TILE_SIZE;
            const ey = getStableRandom(time + i + p + 1) * FIRE_TILE_SIZE;
            ctx.fillRect(ex, ey, 2, 2);
        }

        firePatterns[p] = ctx.createPattern(fireCanvases[p], 'repeat');
    }
    firePattern = firePatterns[0];
}

function updateSteamPattern(time) {
    if (time - lastSteamPatternUpdate < 70) return;
    lastSteamPatternUpdate = time;

    for (let p = 0; p < 9; p++) {
        const ctx = steamContexts[p];
        ctx.clearRect(0, 0, STEAM_TILE_SIZE, STEAM_TILE_SIZE);
        
        // Denser, more volumetric puffs
        for (let i = 0; i < 8; i++) {
            const seed = p * 15 + i;
            const sx = (getStableRandom(seed) * STEAM_TILE_SIZE + time * 0.02) % STEAM_TILE_SIZE;
            const sy = (getStableRandom(seed + 1) * STEAM_TILE_SIZE - time * 0.04) % STEAM_TILE_SIZE;
            const r = 30 + getStableRandom(seed + 2) * 40;
            
            const g = ctx.createRadialGradient(sx, sy, 0, sx, sy, r);
            g.addColorStop(0, 'rgba(230, 235, 255, 0.45)'); // Thicker, whiter core
            g.addColorStop(0.4, 'rgba(230, 235, 255, 0.2)');
            g.addColorStop(1, 'rgba(230, 235, 255, 0)');
            ctx.fillStyle = g;
            ctx.beginPath();
            ctx.arc(sx, sy, r, 0, Math.PI * 2);
            ctx.fill();
        }
        steamPatterns[p] = ctx.createPattern(steamCanvases[p], 'repeat');
    }
    steamPattern = steamPatterns[0];
}

// Premium Visuals Toggle (Set to true to enable high-end atmosphere/effects)
let ENABLE_PREMIUM_VISUALS = localStorage.getItem('tanks_premium_visuals') === 'true';

const premiumToggle = document.getElementById('premium-visuals-toggle');
if (premiumToggle) {
    premiumToggle.checked = ENABLE_PREMIUM_VISUALS;
    premiumToggle.onchange = (e) => {
        ENABLE_PREMIUM_VISUALS = e.target.checked;
        localStorage.setItem('tanks_premium_visuals', ENABLE_PREMIUM_VISUALS);
        
        // Update CSS filter if needed
        const canvas = document.getElementById('gameCanvas');
        if (canvas) {
            canvas.style.filter = ENABLE_PREMIUM_VISUALS 
                ? 'brightness(1.1) contrast(1.1) saturate(1.1) drop-shadow(0 0 10px rgba(0, 242, 255, 0.1))' 
                : 'none';
        }
    };
}

socket.on('kill-feed', (data) => {
    killFeed.push({ ...data, time: Date.now() });
    if (killFeed.length > 8) killFeed.shift();
    
    // VFX for kill
    const victim = gameState.players.find(p => p.u === data.victim);
    if (victim) {
        spawnExplosion(victim.x, victim.y, victim.t === 'blue' ? '#00f2ff' : '#ff00ff');
    }
});

socket.on('collision-effect', (data) => {
    // Spawn hit particles at the exact collision point
    const isTank = data.targetLabel && data.targetLabel.startsWith('tank-');
    if (data.type === 'ICE_SHATTER') {
        spawnParticles(data.x, data.y, '#aaddff', 15, 2.0);
        return;
    }
    let hitColor = '#ffcc00'; // default yellow/orange
    if (data.targetLabel === 'element') hitColor = '#fff';
    else if (isTank) hitColor = '#ff0000';
    else if (data.targetLabel === 'explosion' && data.type === MATERIALS.ELECTRIC) hitColor = '#00f2ff'; // Cyan for electric
    else if (data.targetLabel === 'alchemy') hitColor = '#ffffff'; // White for alchemy puffs
    
    if (data.targetLabel === 'explosion') {
        spawnExplosion(data.x, data.y, hitColor);
        shake.intensity = Math.max(shake.intensity, 12); // Big shake for big booms
        if (data.type === MATERIALS.ELECTRIC) {
            audioManager.playSFX(droneDeathSFX, 1.5);
        } else {
            audioManager.playSFX(explosionSFX, 1.2);
        }
    } else {
        spawnParticles(data.x, data.y, hitColor, 8);
    }
    
    // PREMIUM: Extra impact juice
    if (ENABLE_PREMIUM_VISUALS) {
        if (data.targetLabel === 'element' || data.targetLabel === 'wall') {
            // Dust/Debris
            spawnParticles(data.x, data.y, '#666', 5, 1.5); 
            shake.intensity = Math.max(shake.intensity, 2);
        }
        
        const currentBiome = gameState.zones && gameState.zones[0] ? (gameState.zones[0].t || gameState.zones[0].type) : 'RANDOM';
        if (currentBiome === 'WETLAND') {
            ripples.push({ x: data.x, y: data.y, size: 5, life: 1.2 });
        }
    }

    // 3. Audio Feedback (Impact sounds)
    playEnvironmentalImpact(data.type, data.x, data.y);

    // If it hit a tank, maybe add a tiny shake
    if (isTank && data.targetLabel === `tank-${myId}`) {
        shake.intensity = Math.max(shake.intensity, 5);
    }
});
const keys = { up: false, down: false, left: false, right: false, shoot: false, aimAngle: 0 };

// Rendering
let lastFrameTime = performance.now();
const bulletTrails = new Map();

// Constants
const TANK_WIDTH = 58;  // Length
const TANK_HEIGHT = 42; // Width

// Audio System Classes
class SoundSynth {
    constructor() {
        this.ctx = null;
        this.masterGain = null;
        this.noiseBuffer = null;
    }

    init() {
        if (this.ctx) return;
        try {
            const AudioContext = window.AudioContext || window.webkitAudioContext;
            if (!AudioContext) return;
            this.ctx = new AudioContext();
            this.masterGain = this.ctx.createGain();
            this.masterGain.connect(this.ctx.destination);
            this.masterGain.gain.value = 0.5;

            // Generate white noise buffer
            const bufferSize = 2 * this.ctx.sampleRate;
            this.noiseBuffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
            const output = this.noiseBuffer.getChannelData(0);
            for (let i = 0; i < bufferSize; i++) {
                output[i] = Math.random() * 2 - 1;
            }
        } catch (e) {
            console.warn("Web Audio API not supported", e);
        }
    }

    playBeep(freq = 440, type = 'sine', duration = 0.1, vol = 0.1) {
        if (!this.ctx) return;
        if (this.ctx.state === 'suspended') this.ctx.resume();
        const osc = this.ctx.createOscillator();
        const g = this.ctx.createGain();
        osc.type = type;
        osc.frequency.setValueAtTime(freq, this.ctx.currentTime);
        g.gain.setValueAtTime(vol, this.ctx.currentTime);
        g.gain.exponentialRampToValueAtTime(0.01, this.ctx.currentTime + duration);
        osc.connect(g);
        g.connect(this.masterGain);
        osc.start();
        osc.stop(this.ctx.currentTime + duration);
    }

    playExplosion(vol = 0.5) {
        if (!this.ctx || !this.noiseBuffer) return;
        if (this.ctx.state === 'suspended') this.ctx.resume();

        const source = this.ctx.createBufferSource();
        source.buffer = this.noiseBuffer;

        const lowpass = this.ctx.createBiquadFilter();
        lowpass.type = 'lowpass';
        lowpass.frequency.setValueAtTime(800, this.ctx.currentTime);
        lowpass.frequency.exponentialRampToValueAtTime(40, this.ctx.currentTime + 1.5);

        const g = this.ctx.createGain();
        g.gain.setValueAtTime(vol, this.ctx.currentTime);
        g.gain.linearRampToValueAtTime(0, this.ctx.currentTime + 1.5);

        source.connect(lowpass);
        lowpass.connect(g);
        g.connect(this.masterGain);

        source.start();
        source.stop(this.ctx.currentTime + 1.5);
    }

    playBreak(vol = 0.3) {
        if (!this.ctx || !this.noiseBuffer) return;
        if (this.ctx.state === 'suspended') this.ctx.resume();

        const source = this.ctx.createBufferSource();
        source.buffer = this.noiseBuffer;

        const bandpass = this.ctx.createBiquadFilter();
        bandpass.type = 'bandpass';
        bandpass.frequency.setValueAtTime(2000, this.ctx.currentTime);
        bandpass.frequency.exponentialRampToValueAtTime(100, this.ctx.currentTime + 0.3);

        const g = this.ctx.createGain();
        g.gain.setValueAtTime(vol, this.ctx.currentTime);
        g.gain.exponentialRampToValueAtTime(0.01, this.ctx.currentTime + 0.3);

        source.connect(bandpass);
        bandpass.connect(g);
        g.connect(this.masterGain);

        source.start();
        source.stop(this.ctx.currentTime + 0.3);
    }
}

class AudioManager {
    constructor() {
        this.channels = new Map(); // name -> Audio
        this.pools = new Map();    // name -> Array<Audio>
        this.masterVolume = 1.0;
        this.musicVolume = 0.3;
        this.sfxVolume = 0.5;
        this.isMuted = false;
        this.initialized = false;
        this.synth = new SoundSynth();
    }

    init() {
        if (this.initialized) return;
        this.synth.init();
        this.initialized = true;
    }

    setMusicVolume(v) {
        this.musicVolume = v;
        musicTracks.forEach(t => t.volume = this.isMuted ? 0 : v);
    }

    setSFXVolume(v) {
        this.sfxVolume = v;
        // Update all active SFX volumes if needed
    }

    playSFX(audio, vol = 1.0, duration = null) {
        if (this.isMuted || !audio) return;
        this.init(); // Lazy init

        const sound = audio.cloneNode();
        sound.volume = Math.min(1, Math.max(0, this.sfxVolume * vol));
        sound.play().catch(e => console.warn("Audio play blocked", e));

        if (duration) {
            setTimeout(() => {
                sound.pause();
                sound.src = "";
            }, duration);
        }
    }

    playChannel(name, audio, vol = 1.0, duration = null) {
        if (this.isMuted || !audio) return;
        this.init();

        // Stop existing sound on this channel
        if (this.channels.has(name)) {
            const old = this.channels.get(name);
            old.pause();
            old.currentTime = 0;
        }

        const sound = audio.cloneNode();
        sound.volume = Math.min(1, Math.max(0, this.sfxVolume * vol));
        this.channels.set(name, sound);
        sound.play().catch(e => console.warn("Audio play blocked", e));

        if (duration) {
            setTimeout(() => {
                if (this.channels.get(name) === sound) {
                    sound.pause();
                    this.channels.delete(name);
                }
            }, duration);
        }
    }
}

const audioManager = new AudioManager();

// Audio setup
const optionsMenu = document.getElementById('options-menu');
const shopMenu = document.getElementById('shop-menu');
const musicSlider = document.getElementById('music-volume');
const sfxSlider = document.getElementById('sfx-volume');
const closeOptionsBtn = document.getElementById('close-options');
const closeShopBtn = document.getElementById('close-shop');
const openShopBtn = document.getElementById('open-shop-btn');

const feedbackModal = document.getElementById('feedback-modal');
const openFeedbackBtn = document.getElementById('open-feedback-btn');
const closeFeedbackBtn = document.getElementById('close-feedback-btn');
const submitFeedbackBtn = document.getElementById('submit-feedback-btn');
const feedbackMessage = document.getElementById('feedback-message');
const feedbackStatus = document.getElementById('feedback-status');

const musicTracks = [
    new Audio('/music_track1.mp3'),
    new Audio('/music_track2.mp3'),
    new Audio('/music_track3.mp3')
];

// Weapon SFX
const shotSFX = new Audio('/tank_shot.mp3');
const flameSFX = new Audio('/flamethrower.mp3');
const teslaSFX = new Audio('/tesla_gun.mp3');
const waterSFX = new Audio('/water_cannon.mp3');
const iceSFX = new Audio('/ice_shatter.mp3');
const dirtSFX = new Audio('/dirt_impact.mp3');
const heavySFX = new Audio('/heavy_gun.mp3');
const droneCannonSFX = new Audio('/drone_cannon.mp3');
const droneDeathSFX = new Audio('/drone_death.mp3');
const droneHumSFX = new Audio('/drone_hum.mp3');

// Environmental SFX
const steamSFX = new Audio('/steam_hiss.mp3');
const waterSplashSFX = new Audio('/water_splash.mp3');
const oilSloshSFX = new Audio('/oil_slosh.mp3');
const acidSplashSFX = new Audio('/acid_splash.mp3');
const quicksandSFX = new Audio('/quicksand_entry.mp3');
const electricZapSFX = new Audio('/electric_zap.mp3');
const iceSlideSFX = new Audio('/ice_slide.mp3');
const fireEntrySFX = new Audio('/fire_entry.mp3');
const gasEntrySFX = new Audio('/gas_entry.mp3');
const explosionSFX = new Audio('/explosion.mp3');
const barrelBreakSFX = new Audio('/barrel_break.mp3');

let currentMusicIndex = 0;
let musicVolume = parseFloat(localStorage.getItem('tanks_music_vol')) || 0.3;
let sfxVolume = parseFloat(localStorage.getItem('tanks_sfx_vol')) || 0.5;
let isMuted = localStorage.getItem('tanks_is_muted') === 'true';
let isMenuOpen = false;
let isShopOpen = false;



function setupAudio() {
    audioManager.musicVolume = isMuted ? 0 : musicVolume;
    audioManager.sfxVolume = isMuted ? 0 : sfxVolume;
    audioManager.isMuted = isMuted;

    musicTracks.forEach(track => {
        track.loop = false;
        track.volume = audioManager.musicVolume;
        track.onended = () => {
            currentMusicIndex = (currentMusicIndex + 1) % musicTracks.length;
            playMusic();
        };
    });

    // Update global SFX assets volume
    shotSFX.volume = audioManager.sfxVolume;
    flameSFX.volume = audioManager.sfxVolume;
    teslaSFX.volume = audioManager.sfxVolume;
    waterSFX.volume = audioManager.sfxVolume;
    iceSFX.volume = audioManager.sfxVolume;
    dirtSFX.volume = audioManager.sfxVolume;
    heavySFX.volume = audioManager.sfxVolume;
    steamSFX.volume = audioManager.sfxVolume;
    waterSplashSFX.volume = audioManager.sfxVolume;
    oilSloshSFX.volume = audioManager.sfxVolume;
    acidSplashSFX.volume = audioManager.sfxVolume;
    quicksandSFX.volume = audioManager.sfxVolume;
    electricZapSFX.volume = audioManager.sfxVolume;
    iceSlideSFX.volume = audioManager.sfxVolume;
    fireEntrySFX.volume = audioManager.sfxVolume;
    gasEntrySFX.volume = audioManager.sfxVolume;
    explosionSFX.volume = audioManager.sfxVolume;
    barrelBreakSFX.volume = audioManager.sfxVolume;

    syncAudioUI();
}

function playMusic() {
    if (isMuted) return;
    const track = musicTracks[currentMusicIndex];
    track.play().catch(e => console.log("Audio play blocked until interaction"));
}

function playWeaponSound(type, x, y) {
    if (!gameActive) return;
    
    // Spatial volume calculation relative to camera center (player position)
    let volMult = 1.0;
    if (x !== undefined && y !== undefined) {
        const centerX = camera.x + canvas.width / 2;
        const centerY = camera.y + canvas.height / 2;
        const dist = Math.hypot(x - centerX, y - centerY);
        const maxDist = 2000;
        if (dist > maxDist) return; // Cutoff for distance
        volMult = Math.max(0, 1 - dist / maxDist);
    }

    // Play tactical beep feedback (local only or very quiet)
    audioManager.synth.playBeep(880, 'sine', 0.05, 0.01 * volMult);

    switch(type) {
        case 'FLAMETHROWER':
            audioManager.playChannel('weapon-flame', flameSFX, 1.0 * volMult, 150);
            break;
        case 'TESLA':
        case 'GUARDIAN_PULSE':
            audioManager.playChannel('weapon-tesla', teslaSFX, 1.0 * volMult, 200);
            break;
        case 'WATER_CANNON':
            audioManager.playSFX(waterSFX, 1.2 * volMult);
            break;
        case 'FROST_GUN':
            audioManager.playSFX(iceSFX, 1.1 * volMult);
            break;
        case 'DIRT_GUN':
            audioManager.playSFX(dirtSFX, 1.8 * volMult);
            break;
        case 'HEAVY_GUN':
            audioManager.playSFX(heavySFX, 1.4 * volMult);
            break;
        case 'DRONE_CANNON':
            audioManager.playSFX(droneCannonSFX, 1.1 * volMult);
            break;
        default:
            audioManager.playSFX(shotSFX, 0.8 * volMult);
    }
}

function playEnvironmentalImpact(type, x, y) {
    // Only play if near camera for performance and clarity
    const centerX = camera.x + canvas.width / 2;
    const centerY = camera.y + canvas.height / 2;
    const dist = Math.hypot(x - centerX, y - centerY);
    const maxDist = 1800;
    if (dist > maxDist) return;
    
    const vol = Math.max(0, 1 - dist / maxDist);
    
    switch(type) {
        case MATERIALS.WATER:
            audioManager.playSFX(waterSplashSFX, vol);
            break;
        case MATERIALS.OIL:
            audioManager.playSFX(oilSloshSFX, vol * 0.8);
            break;
        case MATERIALS.ACID:
            audioManager.playSFX(acidSplashSFX, vol);
            break;
        case MATERIALS.QUICKSAND:
            audioManager.playSFX(quicksandSFX, vol * 1.2);
            break;
        case MATERIALS.ELECTRIC:
            audioManager.playSFX(electricZapSFX, vol * 0.9);
            break;
        case MATERIALS.ICE:
            audioManager.playSFX(iceSFX, vol * 0.9);
            break;
        case MATERIALS.DIRT:
            audioManager.playSFX(dirtSFX, vol * 0.8);
            break;
        case MATERIALS.FIRE:
            audioManager.playSFX(fireEntrySFX, vol);
            break;
        case MATERIALS.GAS:
            audioManager.playSFX(gasEntrySFX, vol * 0.6);
            break;
    }
}

function syncAudioUI() {
    const muteToggle = document.getElementById('mute-toggle');
    if (muteToggle) muteToggle.checked = isMuted;
    
    if (musicSlider) {
        musicSlider.disabled = isMuted;
        musicSlider.style.opacity = isMuted ? '0.3' : '1';
    }
    if (sfxSlider) {
        sfxSlider.disabled = isMuted;
        sfxSlider.style.opacity = isMuted ? '0.3' : '1';
    }
}

const muteToggle = document.getElementById('mute-toggle');
if (muteToggle) {
    muteToggle.onchange = (e) => {
        isMuted = e.target.checked;
        localStorage.setItem('tanks_is_muted', isMuted);
        
        audioManager.isMuted = isMuted;
        audioManager.setMusicVolume(isMuted ? 0 : musicVolume);
        
        if (!isMuted) {
            playMusic();
        }
        
        syncAudioUI();
    };
}

if (musicSlider) musicSlider.oninput = (e) => {
    musicVolume = parseFloat(e.target.value);
    audioManager.setMusicVolume(isMuted ? 0 : musicVolume);
    localStorage.setItem('tanks_music_vol', musicVolume);
};

if (sfxSlider) sfxSlider.oninput = (e) => {
    sfxVolume = parseFloat(e.target.value);
    audioManager.setSFXVolume(sfxVolume);
    localStorage.setItem('tanks_sfx_vol', sfxVolume);
};

function toggleMenu() {
    isMenuOpen = !isMenuOpen;
    optionsMenu.style.display = isMenuOpen ? 'flex' : 'none';
    if (isMenuOpen && isShopOpen) toggleShop(); // Close shop if options opened
    updateCursorState();
}

function updateCursorState() {
    const shouldHide = gameActive && !isMenuOpen && !isShopOpen && !(gameState && gameState.gameOver);
    if (shouldHide) {
        document.body.classList.add('game-active-cursor');
    } else {
        document.body.classList.remove('game-active-cursor');
    }
}

function toggleShop() {
    console.log('toggleShop called. gameActive:', gameActive);
    if (!gameActive || (gameState && gameState.gameOver)) {
        console.warn('Cannot open shop: match not active or game over');
        return;
    }
    isShopOpen = !isShopOpen;
    shopMenu.style.display = isShopOpen ? 'flex' : 'none';
    if (isShopOpen) {
        if (isMenuOpen) toggleMenu(); // Close options if shop opened
        updateShopUI();
    }
    updateCursorState();
}

const UPGRADE_COSTS = [100, 250, 500, 1000, 2000];
function updateShopUI() {
    if (!gameState || !myId) return;
    const me = gameState.players.find(p => p.id === myId);
    if (!me || !me.upgrades) return;

    // Update Scrap count in header
    const shopScrap = document.getElementById('shop-scrap-count');
    if (shopScrap) shopScrap.innerText = Math.floor(me.s);

    ['health', 'speed', 'power'].forEach(type => {
        const lvl = me.up[type] || 0;
        const badge = document.getElementById(`lvl-${type}`);
        const btn = document.getElementById(`btn-${type}`);
        
        if (badge) badge.innerText = `LVL ${lvl}`;
        if (btn) {
            if (lvl >= 5) {
                btn.innerText = 'MAXED';
                btn.disabled = true;
                btn.style.opacity = '0.5';
                btn.style.cursor = 'default';
            } else {
                const cost = UPGRADE_COSTS[lvl];
                btn.innerText = `BUY (${cost})`;
                const canAfford = me.s >= cost;
                btn.disabled = !canAfford;
                btn.style.opacity = canAfford ? '1' : '0.5';
                btn.style.cursor = canAfford ? 'pointer' : 'not-allowed';
            }
        }
    });
}

if (closeOptionsBtn) closeOptionsBtn.onclick = toggleMenu;
if (closeShopBtn) closeShopBtn.onclick = toggleShop;

// Feedback Logic
console.log("Feedback button attached:", !!openFeedbackBtn, !!feedbackModal);
if (openFeedbackBtn) {
    openFeedbackBtn.onclick = (e) => {
        e.preventDefault();
        console.log("Feedback button clicked!");
        toggleMenu(); // Close options menu
        
        const modal = document.getElementById('feedback-modal');
        if (modal) {
            console.log("Modal found, showing it");
            modal.style.display = 'flex';
            modal.style.pointerEvents = 'auto';
            modal.style.opacity = '1';
            modal.style.visibility = 'visible';
            
            const msgInput = document.getElementById('feedback-message');
            if (msgInput) msgInput.value = '';
            
            const statusEl = document.getElementById('feedback-status');
            if (statusEl) {
                statusEl.innerText = '';
                statusEl.style.color = 'inherit';
            }
        } else {
            console.error("CRITICAL: feedback-modal element NOT FOUND in DOM!");
            alert("Error: Feedback form missing from page.");
        }
    };
}

if (closeFeedbackBtn) {
    closeFeedbackBtn.onclick = () => {
        const modal = document.getElementById('feedback-modal');
        if (modal) modal.style.display = 'none';
    };
}


if (submitFeedbackBtn) {
    submitFeedbackBtn.onclick = async () => {
        const msgInput = document.getElementById('feedback-message');
        const statusEl = document.getElementById('feedback-status');
        const modal = document.getElementById('feedback-modal');
        
        const msg = msgInput ? msgInput.value.trim() : '';
        if (!msg) {
            if (statusEl) {
                statusEl.innerText = 'PLEASE ENTER A MESSAGE';
                statusEl.style.color = '#ff4444';
            }
            return;
        }

        submitFeedbackBtn.disabled = true;
        if (statusEl) {
            statusEl.innerText = 'SENDING...';
            statusEl.style.color = '#fff';
        }

        const username = localStorage.getItem('tanks_username') || 'Anonymous Player';

        try {
            const res = await fetch('/api/feedback', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ message: msg, username })
            });

            const data = await res.json();

            if (res.ok) {
                if (statusEl) {
                    statusEl.innerText = 'FEEDBACK SENT! THANK YOU.';
                    statusEl.style.color = '#00ff00';
                }
                setTimeout(() => {
                    if (modal) modal.style.display = 'none';
                    submitFeedbackBtn.disabled = false;
                }, 2000);
            } else {
                throw new Error(data.detail || data.error || 'Server error');
            }
        } catch (err) {
            if (statusEl) {
                statusEl.innerText = `ERROR: ${err.message.substring(0, 40)}`;
                statusEl.style.color = '#ff4444';
                console.error("Feedback submission failed:", err.message);
            }
            submitFeedbackBtn.disabled = false;
        }
    };
}

// Shop Logic
document.querySelectorAll('.buy-upgrade-btn').forEach(btn => {
    btn.onclick = (e) => {
        const type = e.target.getAttribute('data-type');
        socket.emit('buy-upgrade', type);
    };
});

socket.on('scrap-update', (newScrap) => {
    if (isShopOpen) updateShopUI();
    const shopScrap = document.getElementById('shop-scrap-count');
    if (shopScrap) shopScrap.innerText = Math.floor(newScrap);
});

// MATERIALS is now imported from gameConfig.js

const WEAPON_NAMES = {
    STANDARD: 'Main Gun', FLAMETHROWER: 'Flamethrower', WATER_CANNON: 'Water Cannon',
    DIRT_GUN: 'Dirt Gun', TESLA: 'Tesla Coil', FROST_GUN: 'Frost Gun', HEAVY_GUN: 'Heavy Cannon'
};
const WEAPON_ABBR = {
    STANDARD: 'GUN', FLAMETHROWER: 'FIRE', WATER_CANNON: 'H\u2082O',
    DIRT_GUN: 'DIRT', TESLA: 'TSL', FROST_GUN: 'ICE', HEAVY_GUN: 'HVY'
};

function getWeaponIcon(weaponType) {
    const name = weaponType.toUpperCase();
    if (name === 'STANDARD') return 'assets/icon_standard.png';
    if (name === 'HEAVY_GUN') return 'assets/icon_launcher.png';
    if (name === 'FLAMETHROWER') return 'assets/icon_flame.png';
    if (name === 'WATER_CANNON') return 'assets/icon_water.png';
    if (name === 'TESLA') return 'assets/icon_tesla.png';
    if (name === 'FROST_GUN') return 'assets/icon_frost.png';
    if (name === 'DIRT_GUN') return 'assets/icon_dirt.png';
    if (name === 'SHOTGUN') return 'assets/icon_shotgun.png';
    
    // Fallback search
    if (name.includes('STANDARD')) return 'assets/icon_standard.png';
    if (name.includes('HEAVY')) return 'assets/icon_launcher.png';
    if (name.includes('FLAME')) return 'assets/icon_flame.png';
    if (name.includes('WATER')) return 'assets/icon_water.png';
    if (name.includes('TESLA')) return 'assets/icon_tesla.png';
    if (name.includes('FROST')) return 'assets/icon_frost.png';
    if (name.includes('DIRT')) return 'assets/icon_dirt.png';
    return null;
}
const TRAIL_LENGTHS  = { metal: 6, fire: 4, water: 3, dirt: 3, electric: 8, ice: 7 };
const TRAIL_COLORS   = { metal: '#ffcc44', fire: '#ff6600', water: '#00aaff', dirt: '#6b3410', electric: '#ffff44', ice: '#aaddff' };
const TRAIL_WIDTHS   = { metal: 3, fire: 5, water: 4, dirt: 3, electric: 4, ice: 3 };

function lerp(a, b, t) { return a + (b - a) * t; }
function lerpAngle(a, b, t) {
    let d = b - a;
    while (d > Math.PI)  d -= Math.PI * 2;
    while (d < -Math.PI) d += Math.PI * 2;
    return a + d * t;
}

// Deterministic random for stable procedural shapes
function getStableRandom(seed) {
    const x = Math.sin(seed) * 10000;
    return x - Math.floor(x);
}

function init() {
    console.log('Game Initializing...');
    resize();
    setupAudio();
    
    // Set dynamic version
    const versionEl = document.getElementById('version-number');
    if (versionEl) versionEl.innerText = `v${versionData.version}`;
    
    // Set initial slider values
    if (musicSlider) musicSlider.value = musicVolume;
    if (sfxSlider) sfxSlider.value = sfxVolume;
    
    // Load username from local storage
    const savedName = localStorage.getItem('tanks_username');
    if (savedName) usernameInput.value = savedName;
    const savedPin = localStorage.getItem('tanks_user_pin');
    if (savedPin) pinInput.value = savedPin;
    
    // Loading animation
    let progress = 0;
    const interval = setInterval(() => {
        progress += Math.random() * 25;
        if (progress >= 100) {
            progress = 100;
            clearInterval(interval);
            showActionButtons();
        }
        loadingProgress.style.width = `${progress}%`;
    }, 100);

    window.addEventListener('resize', resize);
    resize(); // Ensure rect is cached

    window.addEventListener('mousemove', e => {
        mousePos.x = e.clientX;
        mousePos.y = e.clientY;
        // Calculation moved to renderLoop for sync
    });


    requestAnimationFrame(renderLoop);
}

function updateAimAngle() {
    if (!gameActive || !myId || !canvasRect) return;
    const me = gameState.players.find(p => p.id === myId);
    if (!me) return;
    
    const canvasMouseX = mousePos.x - canvasRect.left;
    const canvasMouseY = mousePos.y - canvasRect.top;

    const worldMouseX = canvasMouseX + camera.x;
    const worldMouseY = canvasMouseY + camera.y;
    const aimAngle = Math.atan2(worldMouseY - me.y, worldMouseX - me.x);
    
    // Smooth check + Rate limiting (Max 60Hz input packets)
    const now = Date.now();
    const changed = isNaN(keys.aimAngle) || Math.abs(aimAngle - keys.aimAngle) > 0.005;
    
    if (changed || now - lastInputSent > 200) { // Keep alive every 200ms
        keys.aimAngle = aimAngle;
        if (now - lastInputSent > 16.6) { // Throttle to ~60Hz
            sendInput();
            lastInputSent = now;
        }
    }
}

function sendInput() {
    inputSeq++;
    const inputPayload = { ...keys, seq: inputSeq };
    pendingInputs.push({ ...inputPayload, ts: Date.now() });
    socket.emit('input', inputPayload);
}

function showActionButtons() {
    [hostBtn, joinBtn].forEach(btn => {
        btn.style.opacity = '1';
        btn.style.pointerEvents = 'auto';
    });
}

function resize() {
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
    canvasRect = canvas.getBoundingClientRect();
}

function drawScreenFrost() {
    ctx.save();
    const grad = ctx.createRadialGradient(canvas.width/2, canvas.height/2, canvas.height * 0.3, canvas.width/2, canvas.height/2, canvas.height * 0.8);
    grad.addColorStop(0, 'rgba(200, 240, 255, 0)');
    grad.addColorStop(0.8, 'rgba(200, 240, 255, 0.05)');
    grad.addColorStop(1, 'rgba(255, 255, 255, 0.15)');
    
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Subtle frost crystal shapes in corners
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.1)';
    ctx.lineWidth = 1;
    const corners = [
        [0, 0], [canvas.width, 0], [0, canvas.height], [canvas.width, canvas.height]
    ];
    corners.forEach(([cx, cy]) => {
        ctx.save();
        ctx.translate(cx, cy);
        for (let i = 0; i < 5; i++) {
            const angle = (i / 5) * Math.PI * 0.5 + (cx > 0 ? Math.PI * 0.5 : 0) + (cy > 0 ? Math.PI : 0);
            ctx.rotate(angle);
            ctx.beginPath();
            ctx.moveTo(0, 0);
            ctx.lineTo(40 + Math.random() * 40, 0);
            ctx.stroke();
        }
        ctx.restore();
    });
    ctx.restore();
}

// Input Handling
window.addEventListener('keydown', e => handleInput(e.code, true));
window.addEventListener('keyup', e => handleInput(e.code, false));

function handleInput(code, isPressed) {
    if (isPressed) {
        if (code === 'Escape') toggleMenu();
        if (code === 'KeyB' || code === 'KeyV') {
            console.log('B or V key pressed');
            toggleShop();
        }
    }

    if (!gameActive) return;

    let changed = false;
    if (code === 'KeyW' || code === 'ArrowUp') { keys.up = isPressed; changed = true; }
    if (code === 'KeyS' || code === 'ArrowDown') { keys.down = isPressed; changed = true; }
    if (code === 'KeyA' || code === 'ArrowLeft') { keys.left = isPressed; changed = true; }
    if (code === 'KeyD' || code === 'ArrowRight') { keys.right = isPressed; changed = true; }
    if (code === 'Space' || code === 'Enter') { keys.shoot = isPressed; changed = true; }

    if (changed) {
        updateAimAngle();
        sendInput();
    }

    // Weapon slot switching
    if (isPressed) {
        if (code === 'Digit1') socket.emit('switch-weapon', 0);
        if (code === 'Digit2') socket.emit('switch-weapon', 1);
        if (code === 'Digit3') socket.emit('switch-weapon', 2);
        if (code === 'Digit4') socket.emit('switch-weapon', 3);
        if (code === 'Digit5') socket.emit('switch-weapon', 4);
        if (code === 'Digit6') socket.emit('switch-weapon', 5);
        if (code === 'Digit7') socket.emit('switch-weapon', 6);
    }
}

// Socket Events
socket.on('connect', () => {
    console.log('Socket connected:', socket.id);
    myId = socket.id;
});

function updateLobbyUI(id, payload) {
    const players = payload.players || [];
    const dronesEnabled = payload.dronesEnabled || false;
    
    if (lobbyIdSpan) lobbyIdSpan.innerText = id.toUpperCase();
    
    // 1. Tank Selection Rendering
    const selectionArea = document.getElementById('tank-selection-area');
    const me = players.find(p => p.id === myId);
    if (selectionArea && me) {
        selectionArea.innerHTML = '';
        Object.entries(CHASSIS)
            .filter(([type]) => type !== 'DEV') // Hide DEV tank from lobby selection
            .forEach(([type, config]) => {

            const card = document.createElement('div');
            card.className = `tank-card ${me.ch === type ? 'selected' : ''}`;
            
            const imgContainer = document.createElement('div');
            imgContainer.className = 'tank-img-container';
            const img = document.createElement('img');
            img.src = `assets/tanks/${type.toLowerCase()}.png`;
            imgContainer.appendChild(img);
            card.appendChild(imgContainer);

            const title = document.createElement('h4');
            title.innerText = config.name;
            card.appendChild(title);

            const stats = document.createElement('div');
            stats.className = 'tank-stats';
            const speedVal = (config.speed * 1000).toFixed(1);
            stats.innerHTML = `<span>HP: ${config.hp}</span><span>SLOTS: ${config.slots}</span><span>SPD: ${speedVal}</span>`;
            card.appendChild(stats);

            // Loadout Slots
            const loadout = document.createElement('div');
            loadout.className = 'tank-loadout-slots';
            
            // For the selected tank, show interactive slots
            if (me.ch === type) {
                for (let i = 0; i < config.slots; i++) {
                    const slot = document.createElement('div');
                    slot.className = 'loadout-slot';
                    const weaponType = (me.sl && me.sl[i]) ? me.sl[i] : 'EMPTY';
                    const icon = getWeaponIcon(weaponType);
                    if (icon) {
                        const iconImg = document.createElement('img');
                        iconImg.src = icon;
                        iconImg.className = 'weapon-img';
                        slot.appendChild(iconImg);
                    }
                    
                    const label = document.createElement('div');
                    label.className = 'weapon-slot-label';
                    label.innerText = WEAPON_ABBR[weaponType] || weaponType.substring(0, 3);
                    slot.appendChild(label);
                    
                    slot.title = `Click to cycle: ${WEAPON_NAMES[weaponType] || weaponType}`;

                    slot.onclick = (e) => {
                        e.stopPropagation();
                        // Cycle through allowed weapons
                        const currentIdx = config.allowedWeapons.indexOf(weaponType);
                        const nextIdx = (currentIdx + 1) % config.allowedWeapons.length;
                        const nextWeapon = config.allowedWeapons[nextIdx];
                        socket.emit('change-loadout', { slotIndex: i, weaponType: nextWeapon });
                    };
                    loadout.appendChild(slot);
                }
            } else {
                // For non-selected tanks, show empty/preview slots
                for (let i = 0; i < config.slots; i++) {
                    const slot = document.createElement('div');
                    slot.className = 'loadout-slot empty';
                    loadout.appendChild(slot);
                }
            }
            card.appendChild(loadout);

            card.onclick = () => {
                if (me.ch !== type) {
                    socket.emit('change-chassis', type);
                }
            };

            selectionArea.appendChild(card);
        });
    }
    
    const renderTeam = (teamName, container) => {
        if (!container) return;
        container.innerHTML = '';
        const teamPlayers = players.filter(p => p.t === teamName);
        const slotsCount = 5;

        for (let i = 0; i < slotsCount; i++) {
            const slot = document.createElement('div');
            slot.className = 'player-slot';
            
            const player = teamPlayers[i];
            if (player) {
                slot.classList.add('occupied');
                if (player.id === myId) slot.classList.add('self');
                
                const info = document.createElement('div');
                info.className = 'slot-info';
                info.innerHTML = `
                    <div class="slot-name">${player.u.toUpperCase()} ${player.isBot ? '(BOT)' : ''}</div>
                    <div class="slot-chassis">${player.ch} ${player.ready ? '<span class="ready-status">READY</span>' : '<span class="not-ready-status">WAITING</span>'}</div>
                    <div class="slot-weapons-preview" id="preview-${player.id}"></div>
                `;
                slot.appendChild(info);

                // Populate weapon preview
                const wp = info.querySelector('.slot-weapons-preview');
                if (wp && player.sl) {
                    player.sl.forEach(wType => {
                        const icon = getWeaponIcon(wType);
                        if (icon) {
                            const img = document.createElement('img');
                            img.src = icon;
                            img.className = 'mini-weapon-icon';
                            img.title = wType;
                            wp.appendChild(img);
                        }
                    });
                }

                const actions = document.createElement('div');
                actions.className = 'slot-actions';

                if (player.isBot) {
                    const diffSelect = document.createElement('select');
                    diffSelect.className = 'slot-difficulty';
                    ['EASY', 'NORMAL', 'HARD'].forEach(d => {
                        const opt = document.createElement('option');
                        opt.value = d;
                        opt.innerText = d;
                        if (player.botDifficulty === d) opt.selected = true;
                        diffSelect.appendChild(opt);
                    });
                    diffSelect.onchange = () => {
                        socket.emit('update-bot-difficulty', { botId: player.id, difficulty: diffSelect.value });
                    };
                    actions.appendChild(diffSelect);

                    const removeBtn = document.createElement('button');
                    removeBtn.className = 'remove-bot-slot-btn';
                    removeBtn.innerHTML = '×';
                    removeBtn.onclick = () => {
                        socket.emit('remove-bot', { botId: player.id });
                    };
                    actions.appendChild(removeBtn);
                }
                
                slot.appendChild(actions);
            } else {
                slot.classList.add('empty');
                slot.innerHTML = `
                    <div class="slot-info">
                        <div class="slot-name" style="opacity: 0.2;">EMPTY SLOT</div>
                    </div>
                `;
                
                const actions = document.createElement('div');
                actions.className = 'slot-actions';
                
                const addBtn = document.createElement('button');
                addBtn.className = 'slot-bot-btn';
                addBtn.innerText = '+ ADD BOT';
                addBtn.onclick = () => {
                    socket.emit('add-bot', { team: teamName, difficulty: 'NORMAL' });
                };
                actions.appendChild(addBtn);
                slot.appendChild(actions);
            }
            container.appendChild(slot);
        }
    };

    renderTeam('blue', blueTeamList);
    renderTeam('pink', pinkTeamList);

    const isHost = players.length > 0 && players[0].id === myId;
    const totalCount = players.length;
    if (isHost && totalCount >= 1) { // Bots count, so 1 human + anything is fine
        startGameBtn.classList.remove('hidden');
        lobbyStatus.innerText = `READY TO DEPLOY (${totalCount}/10)`;
        lobbyStatus.style.color = '#00ff00';
    } else {
        startGameBtn.classList.add('hidden');
        if (totalCount < 1) {
            lobbyStatus.innerText = `WAITING FOR PLAYERS...`;
            lobbyStatus.style.color = '#ffcc00';
        } else {
            lobbyStatus.innerText = `WAITING FOR HOST TO START (${totalCount}/10)`;
            lobbyStatus.style.color = '#00f2ff';
        }
    }

    // Update Drones Toggle
    if (dronesToggle) {
        dronesToggle.disabled = !isHost;
        dronesToggle.checked = dronesEnabled;
    }

    // Update Ready Button
    if (readyBtn) {
        const myPlayer = players.find(p => p.id === myId);
        if (myPlayer) {
            readyBtn.innerText = myPlayer.ready ? 'NOT READY' : 'READY';
            readyBtn.classList.toggle('ready-active', myPlayer.ready);
        }
    }
}

socket.on('lobby-update', (payload) => {
    const { id, players } = payload;
    
    // Cache player profiles for in-game use (reduces tick payload)
    if (players) {
        players.forEach(p => {
            playerProfiles.set(p.id, {
                u: p.u,
                t: p.t,
                mh: CHASSIS[p.ch]?.hp || 100,
                ch: p.ch,
                sl: p.sl
            });
        });
    }

    if (!gameActive) {
        splashScreen.classList.add('hidden');
        lobbyScreen.classList.remove('hidden');
        updateLobbyUI(id, payload);
    }
});

socket.on('map-data', (data) => {
    console.log('Received static map data:', data.buildings.length, 'buildings');
    staticMapData = data;
    // Inject immediately into state for early rendering if needed
    serverState.zones = data.zones;
});

socket.on('auth-error', (data) => {
    alert(data.message || 'AUTHENTICATION ERROR');
});

socket.on('game-started', () => {
    lobbyScreen.classList.add('hidden');
    gameOverScreen.classList.add('hidden');
    hud.classList.remove('hidden');
    if ('ontouchstart' in window) {
        document.getElementById('mobile-controls').classList.remove('hidden');
    }
    gameActive = true;
    updateCursorState();
});

socket.on('scrap-buff', ({ text }) => {
    const me = serverState?.players?.find(p => p.id === myId);
    if (me) {
        popups.push({
            text: text,
            x: me.x,
            y: me.y - 40,
            life: 1.5,
            color: '#ffff00'
        });
    }
});

socket.on('match-ended', ({ winner, scores, stats }) => {
    gameActive = false;
    gameOverScreen.classList.remove('hidden');
    updateCursorState();
    
    const winnerText = document.getElementById('winner-text');
    if (winnerText) {
        if (winner === 'draw') {
            winnerText.innerText = "IT'S A DRAW!";
            winnerText.style.color = "#fff";
        } else {
            const teamName = winner === 'blue' ? 'ALPHA TEAM' : 'OMEGA TEAM';
            winnerText.innerText = `${teamName} DOMINATES!`;
            winnerText.style.color = winner === 'blue' ? '#00f2ff' : '#ff00ff';
        }
    }

    const resultsContainer = document.getElementById('match-results');
    if (resultsContainer && stats) {
        resultsContainer.innerHTML = `
            <div class="result-row result-header">
                <div>PLAYER</div>
                <div>KILLS</div>
                <div>DEATHS</div>
                <div>SCRAP</div>
            </div>
        `;
        stats.forEach(p => {
            const row = document.createElement('div');
            row.className = `result-row ${p.t}`;
            row.innerHTML = `
                <div>${p.u.toUpperCase()}</div>
                <div>${p.kills || 0}</div>
                <div>${p.deaths || 0}</div>
                <div>${p.s || 0}</div>
            `;
            resultsContainer.appendChild(row);
        });
    }
});

socket.on('lobby-reset', (payload) => {
    const { id } = payload;
    gameActive = false;
    gameOverScreen.classList.add('hidden');
    hud.classList.add('hidden');
    lobbyScreen.classList.remove('hidden');
    updateLobbyUI(id, payload);
    updateCursorState();
});

const restartBtn = document.getElementById('restart-btn');
if (restartBtn) {
    restartBtn.onclick = () => {
        socket.emit('request-rematch');
    };
}

const leaveBtn = document.getElementById('leave-btn');
if (leaveBtn) {
    leaveBtn.onclick = () => {
        location.reload();
    };
}

const leaveLobbyBtn = document.getElementById('leave-lobby-btn');
if (leaveLobbyBtn) {
    leaveLobbyBtn.onclick = () => {
        location.reload();
    };
}

if (readyBtn) {
    readyBtn.onclick = () => {
        socket.emit('toggle-ready');
    };
}

const quitToMenuBtn = document.getElementById('quit-to-menu-btn');
if (quitToMenuBtn) {
    quitToMenuBtn.onclick = () => {
        location.reload();
    };
}

// Removed legacy chassis select listener as it's replaced by visual selector

const knownBulletIds = new Set();
socket.on('player-event', (data) => {
    playerEvents.push({ ...data, time: Date.now() });
    if (playerEvents.length > 5) playerEvents.shift();
});

socket.on('state', (state) => {
    // 1. Reconstruct full state from static caches (Egress Optimization)
    state.zones = staticMapData.zones || [];
    
    // Inject player metadata
    state.players.forEach(p => {
        const profile = playerProfiles.get(p.id);
        if (profile) {
            p.u = profile.u;
            p.t = profile.t;
            p.ch = profile.ch;
            p.sl = profile.sl;
            // Calculate current maxHp based on base HP + health upgrades
            p.mh = profile.mh + (p.up?.health || 0) * 20;
        }
    });

    // Merge static buildings with dynamic elements
    state.elements = [...(staticMapData.buildings || []), ...(state.elements || [])];

    serverState = state;
    
    // Play sounds for new bullets
    if (state.bullets) {
        state.bullets.forEach(b => {
            if (!knownBulletIds.has(b.id)) {
                playWeaponSound(b.w, b.x, b.y);
                knownBulletIds.add(b.id);
                
                // Muzzle Flash / Spawn particles
                spawnParticles(b.x, b.y, b.c, 5);
                
                // NEW: Small shake on shoot (only if near player)
                if (ENABLE_PREMIUM_VISUALS) {
                    const me = serverState?.players?.find(p => p.id === myId);
                    if (me) {
                        const dist = Math.hypot(me.x - b.x, me.y - b.y);
                        if (dist < 1000) {
                            shake.intensity = Math.max(shake.intensity, 3 * (1 - dist/1000));
                        }
                    }
                }
                
                if (knownBulletIds.size > 200) {
                    const first = knownBulletIds.values().next().value;
                    knownBulletIds.delete(first);
                }
            }
        });
    }

    const me = state.players.find(p => p.id === myId);
    if (me && me.s > lastScrap) {
        const renderMe = gameState.players.find(p => p.id === myId) || me;
        popups.push({ x: renderMe.x, y: renderMe.y - 40, text: `+${me.s - lastScrap} SCRAP`, life: 1.0 });
        lastScrap = me.s;
    }
    updateHUD();
    
    if (state.gameOver && gameActive) {
        gameActive = false;
    }
});

function updateHUD() {
    const me = serverState.players.find(p => p.id === myId);
    if (me) {
        if (p1HpBar) {
            if (p1HpBar.dataset.val !== me.h.toString()) {
                const oldHp = parseFloat(p1HpBar.dataset.val || me.mh);
                if (me.h < oldHp) {
                    shake.intensity = 15;
                    spawnParticles(me.x, me.y, '#fff', 10);
                }
                p1HpBar.style.width = `${(me.h / me.mh) * 100}%`;
                p1HpBar.dataset.val = me.h;
                
                if (hpCurrentEl) hpCurrentEl.innerText = Math.ceil(me.h);
                if (hpMaxEl) hpMaxEl.innerText = me.mh;
            }
        }
        if (p1Scrap && p1Scrap.innerText !== me.s.toString()) {
            p1Scrap.innerText = me.s;
        }

        const weaponNameEl = document.getElementById('weapon-name');
        if (weaponNameEl) {
            const currentWeapon = me.sl[me.cs];
            weaponNameEl.innerText = MATERIAL_PROPERTIES[currentWeapon]?.name || currentWeapon;
        }

        const weaponContainer = document.querySelector('.weapon-slots');
        if (weaponContainer) {
            // Check if slots have changed (either count or weapon types)
            const currentSlotTypes = Array.from(weaponContainer.querySelectorAll('.weapon-slot-label')).map(el => el.innerText);
            const newSlotTypes = me.sl.map(slot => WEAPON_ABBR[slot] || slot.toString().substring(0, 3));
            const needsFullRender = weaponContainer.children.length !== me.sl.length || 
                                   JSON.stringify(currentSlotTypes) !== JSON.stringify(newSlotTypes);

            if (needsFullRender) {
                weaponContainer.innerHTML = '';
                me.sl.forEach((slot, index) => {
                    const slotDiv = document.createElement('div');
                    slotDiv.className = `weapon-slot ${index === me.cs ? 'active' : ''}`;
                    slotDiv.dataset.slot = index;
                    
                    const keySpan = document.createElement('span');
                    keySpan.className = 'slot-key';
                    keySpan.innerText = index + 1;
                    
                    const iconDiv = document.createElement('div');
                    iconDiv.className = 'weapon-icon-new';
                    
                    // Weapon Icon Mapping
                    const weaponName = (MATERIAL_PROPERTIES[slot]?.name || slot.toString()).toUpperCase();
                    const iconSrc = getWeaponIcon(weaponName);

                    if (iconSrc) {
                        const img = document.createElement('img');
                        img.src = iconSrc;
                        img.className = 'weapon-img';
                        iconDiv.appendChild(img);
                    } else {
                        const fallback = document.createElement('span');
                        fallback.className = 'slot-fallback';
                        fallback.innerText = weaponName.substring(0, 3);
                        iconDiv.appendChild(fallback);
                    }
                    
                    slotDiv.appendChild(keySpan);
                    slotDiv.appendChild(iconDiv);
                    
                    const label = document.createElement('div');
                    label.className = 'weapon-slot-label';
                    label.innerText = WEAPON_ABBR[slot] || slot.toString().substring(0, 3);
                    slotDiv.appendChild(label);
                    
                    weaponContainer.appendChild(slotDiv);
                });
                weaponContainer.dataset.currentSlot = me.cs;
            } else {
                if (weaponContainer.dataset.currentSlot !== me.cs.toString()) {
                    const slots = weaponContainer.querySelectorAll('.weapon-slot');
                    slots.forEach((slot, index) => {
                        slot.classList.toggle('active', index === me.cs);
                    });
                    weaponContainer.dataset.currentSlot = me.cs;
                }
            }
        }

        if (p1CooldownBar) {
            p1CooldownBar.style.width = `${(me.c / 100) * 100}%`;
        }
    }

    // Global Match HUD
    const alphaScore = document.getElementById('score-alpha');
    const omegaScore = document.getElementById('score-omega');
    const timerDisplay = document.getElementById('match-timer');
    
    if (serverState.scores) {
        if (alphaScore) alphaScore.innerText = serverState.scores.blue;
        if (omegaScore) omegaScore.innerText = serverState.scores.pink;
    }
    
    if (serverState.timer !== undefined && timerDisplay) {
        const mins = Math.floor(serverState.timer / 60);
        const secs = serverState.timer % 60;
        timerDisplay.innerText = `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
        
        if (serverState.timer < 30) {
            timerDisplay.style.color = '#ff3333';
            timerDisplay.style.textShadow = '0 0 10px rgba(255, 51, 51, 0.5)';
        } else {
            timerDisplay.style.color = '#fff';
            timerDisplay.style.textShadow = 'none';
        }
    }
}

let lastFpsTime = performance.now();
let framesThisSecond = 0;
const FPS_LIMIT = 60;
const FRAME_INTERVAL = 1000 / FPS_LIMIT;
let lastRenderTime = 0;

function isRectInView(x, y, w, h, buffer = 100) {
    return x + w/2 > camera.x - buffer && 
           x - w/2 < camera.x + canvas.width + buffer && 
           y + h/2 > camera.y - buffer && 
           y - h/2 < camera.y + canvas.height + buffer;
}

function renderLoop(now) {
    requestAnimationFrame(renderLoop);

    const elapsed = now - lastRenderTime;
    if (elapsed < FRAME_INTERVAL) return;

    // Adjust lastRenderTime to maintain consistent timing
    lastRenderTime = now - (elapsed % FRAME_INTERVAL);

    const rawDt = now - lastFrameTime;
    lastFrameTime = now;
    renderTime = now;
    const dt = Math.min(rawDt / 16.667, 3); // 1.0 at 60fps

    framesThisSecond++;
    if (now - lastFpsTime >= 1000) {
        fpsCounter.innerText = `${framesThisSecond} FPS`;
        framesThisSecond = 0;
        lastFpsTime = now;
    }

    ctx.clearRect(0, 0, canvas.width, canvas.height);

    if (gameActive) {
        interpolateState(dt);

        const me = gameState.players.find(p => p.id === myId);
        if (me) {
            camera.x = me.x - canvas.width / 2;
            camera.y = me.y - canvas.height / 2;
            // CRITICAL: Recalculate aim angle AFTER interpolation to avoid jitter
            updateAimAngle();
            // Apply it immediately to the rendered state
            me.aa = keys.aimAngle;

            // NEW: Environmental Audio Detection
            updateLocalPlayerAudio(me);
        }

        if (shake.intensity > 0) {
            shake.x = (Math.random() - 0.5) * shake.intensity;
            shake.y = (Math.random() - 0.5) * shake.intensity;
            shake.intensity *= 0.9;
            if (shake.intensity < 0.5) shake.intensity = 0;
        } else {
            shake.x = 0;
            shake.y = 0;
        }

        ctx.save();
        ctx.translate(-camera.x + shake.x, -camera.y + shake.y);

        // 1. Clipping Mask (Prevents anything from leaking outside the map)
        const wSize = gameState.worldSize || 4000;
        ctx.beginPath();
        ctx.rect(0, 0, wSize, wSize);
        ctx.clip();

        drawZones();
        drawGrid();

        if (ENABLE_PREMIUM_VISUALS) {
            updateWaterPattern(renderTime);
            updateOilPattern(renderTime);
            updateAcidPattern(renderTime);
            updateGasPattern(renderTime);
            updateElectricPattern(renderTime);
            updateFirePattern(renderTime);
            updateSteamPattern(renderTime);
            
            // Trigger steam hiss SFX if newly created near player
            gameState.elements.forEach(e => {
                if (e.t === MATERIALS.STEAM && e.age && e.age < 2) {
                    const dist = Math.hypot(e.x - camera.x, e.y - camera.y);
                    if (dist < 600) {
                        audioManager.playChannel('steam', steamSFX, 0.4, 1500);
                    }
                }
            });

            updateAtmosphere(dt);
            updateEnvironmentalObjects(dt);
            updateEnvironmentalLife(dt);
            drawAtmosphere();
            drawEnvironmentalObjects();
        }

        drawWorldBorders();
        drawEnvironmentalLife();

        drawElements();
        drawGuardians();
        updateBulletTrails();
        drawBulletTrails();
        drawBullets();

        gameState.players.forEach(p => {
            drawTank(p);
            // NEW: Dust & Vapor particles when moving
            if (ENABLE_PREMIUM_VISUALS && renderTime % 4 < 1) { 
                const currentBiome = gameState.zones && gameState.zones[0] ? (gameState.zones[0].t || gameState.zones[0].type) : 'RANDOM';
                const isMoving = p.id === myId ? (keys.up || keys.down || keys.left || keys.right) : (Math.abs(p.vx||0) > 0.1 || Math.abs(p.vy||0) > 0.1); 
                
                if (currentBiome === 'TUNDRA') {
                    // Engine Vapor (Hot engine in cold air)
                    if (renderTime % 12 < 1) {
                        particles.push({
                            x: p.x - Math.cos(p.a) * 15,
                            y: p.y - Math.sin(p.a) * 15,
                            vx: (Math.random() - 0.5) * 0.5,
                            vy: -1.0 - Math.random(),
                            life: 0.8,
                            color: 'rgba(255, 255, 255, 0.3)',
                            size: 4 + Math.random() * 6,
                            isVapor: true
                        });
                    }
                }

                if (isMoving) {
                    const overWater = currentBiome === 'WETLAND' || (p.wet);
                    
                    if (overWater && ENABLE_PREMIUM_VISUALS) {
                        // Water Wakes (Tails)
                        const cos = Math.cos(p.a);
                        const sin = Math.sin(p.a);
                        for (let side = -1; side <= 1; side += 2) {
                            particles.push({
                                x: p.x - cos * 25 + sin * (18 * side),
                                y: p.y - sin * 25 - cos * (18 * side),
                                vx: -cos * 2 + (Math.random() - 0.5),
                                vy: -sin * 2 + (Math.random() - 0.5),
                                life: 1.0,
                                color: 'rgba(255, 255, 255, 0.3)',
                                size: 4 + Math.random() * 4,
                                isWaterWake: true
                            });
                        }
                        // Dynamic Ripple
                        if (renderTime % 30 < 1) {
                            ripples.push({ x: p.x, y: p.y, size: 10, life: 1.0 });
                        }
                    } else {
                        // More intense dust in wasteland/tundra
                        const pCount = (currentBiome === 'WASTELAND' || currentBiome === 'TUNDRA') ? 2 : 1;
                        const pColor = currentBiome === 'WASTELAND' ? 'rgba(150, 100, 50, 0.3)' : 
                                       (currentBiome === 'TUNDRA' ? 'rgba(230, 250, 255, 0.5)' : 'rgba(100,100,100,0.2)');
                        const px = p.x - Math.cos(p.a) * 22;
                        const py = p.y - Math.sin(p.a) * 22;
                        spawnParticles(px, py, pColor, pCount, currentBiome === 'TUNDRA' ? 0.8 : 0.5);
                        
                        if (currentBiome === 'TUNDRA') {
                            // Extra lingering snow dust
                            particles.push({
                                x: px, y: py,
                                vx: (Math.random() - 0.5) * 1.0,
                                vy: (Math.random() - 0.5) * 1.0,
                                life: 1.2,
                                color: 'rgba(255, 255, 255, 0.2)',
                                size: 8 + Math.random() * 10,
                                isSnowPuff: true
                            });
                        }
                    }
                }
            }
        });
        updateParticles(dt);
        drawParticles();
        drawPopups(dt);

        ctx.restore();

        drawMinimap();
        drawCrosshair();
        drawKillFeed();
        drawPlayerEvents();
        if (ENABLE_PREMIUM_VISUALS) {
            drawVignette();
            drawGlobalTint();
            const currentBiome = gameState.zones && gameState.zones[0] ? (gameState.zones[0].t || gameState.zones[0].type) : 'RANDOM';
            if (currentBiome === 'TUNDRA') drawScreenFrost();
        }
    } else {
        drawGrid();
    }
}

function drawTank(p) {
    if (!isRectInView(p.x, p.y, TANK_WIDTH * 1.5, TANK_WIDTH * 1.5)) return;
    if (p.hid && p.id !== myId) return;

    const teamColor = p.t === 'blue' ? '#00f2ff' : '#ff00ff';
    const isPremium = ENABLE_PREMIUM_VISUALS;
    
    ctx.save();
    if (p.hid && p.id === myId) ctx.globalAlpha = 0.5;

    // 1. DYNAMIC DROP SHADOW (Grounding)
    if (isPremium) {
        ctx.save();
        ctx.translate(p.x + 6, p.y + 6);
        ctx.rotate(p.a);
        ctx.fillStyle = 'rgba(0, 0, 0, 0.35)';
        ctx.beginPath();
        // Simplified shadow shape
        ctx.roundRect(-TANK_WIDTH/2 - 2, -TANK_HEIGHT/2 - 2, TANK_WIDTH + 4, TANK_HEIGHT + 4, 10);
        ctx.fill();
        ctx.restore();
    }
    
    ctx.translate(p.x, p.y);

    // 2. STATUS EFFECTS V2 (Floating above tank)
    if (p.stunned || p.slowed || p.burning || p.scrap >= 100) {
        ctx.save();
        ctx.translate(0, -TANK_HEIGHT - 45);
        ctx.textAlign = 'center';
        let yOff = 0;
        if (p.stunned) { ctx.fillStyle = '#ffff00'; ctx.font = '900 14px Outfit'; ctx.fillText('⚡ STUNNED', 0, yOff); yOff -= 18; }
        if (p.slowed)  { ctx.fillStyle = '#00aaff'; ctx.font = '900 14px Outfit'; ctx.fillText('❄️ SLOWED', 0, yOff); yOff -= 18; }
        if (p.burning) { ctx.fillStyle = '#ff4400'; ctx.font = '900 14px Outfit'; ctx.fillText('🔥 BURNING', 0, yOff); yOff -= 18; }
        ctx.restore();
    }

    // --- BASE ROTATION (Tracks & Hull) ---
    ctx.save();
    ctx.rotate(p.a);

    // 3. TRACKS (Volumetric & Dynamic)
    let trackW = TANK_WIDTH + 6;
    let trackH = 12;
    let trackGap = TANK_HEIGHT/2 - 2;
    
    if (p.ch === 'BRAWLER') { trackH = 16; trackGap = TANK_HEIGHT/2 - 4; }
    else if (p.ch === 'SCOUT') { trackW = TANK_WIDTH - 2; trackH = 10; }
    else if (p.ch === 'ARTILLERY') { trackW = TANK_WIDTH + 14; trackH = 10; }

    const drawPremiumTrack = (ySide) => {
        // Track Shadow/Inner
        ctx.fillStyle = '#050505';
        ctx.beginPath();
        ctx.roundRect(-trackW/2, ySide - trackH/2, trackW, trackH, 4);
        ctx.fill();

        // Track Tread Pattern
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.04)';
        ctx.lineWidth = 1;
        const scroll = (p.id === myId && (keys.up || keys.down)) ? (Date.now() * 0.02) % 10 : 0;
        for (let tx = -trackW/2 + 5; tx < trackW/2; tx += 8) {
            const xPos = tx + scroll;
            if (xPos < trackW/2 - 2) {
                ctx.beginPath();
                ctx.moveTo(xPos, ySide - trackH/2 + 2);
                ctx.lineTo(xPos, ySide + trackH/2 - 2);
                ctx.stroke();
            }
        }
        
        // Side Skirts (Brawler Only)
        if (p.ch === 'BRAWLER' && isPremium) {
            ctx.fillStyle = '#1a1a25';
            ctx.strokeStyle = '#000';
            ctx.lineWidth = 1;
            ctx.beginPath();
            ctx.roundRect(-trackW/2 - 2, ySide - trackH/2 - 2, trackW + 4, 5, 2);
            ctx.fill(); ctx.stroke();
        }
    };
    drawPremiumTrack(-trackGap);
    drawPremiumTrack(trackGap);

    // 4. MAIN HULL (Layered Armor)
    // Layer A: Lower Base
    const hullBaseGrad = ctx.createLinearGradient(0, -TANK_HEIGHT/2, 0, TANK_HEIGHT/2);
    hullBaseGrad.addColorStop(0, '#151520');
    hullBaseGrad.addColorStop(1, '#05050a');
    ctx.fillStyle = hullBaseGrad;
    ctx.strokeStyle = '#000';
    ctx.lineWidth = 1.5;

    ctx.beginPath();
    if (p.ch === 'SCOUT') {
        ctx.roundRect(-TANK_WIDTH/2 + 2, -TANK_HEIGHT/2 + 4, TANK_WIDTH - 2, TANK_HEIGHT - 8, 18);
    } else if (p.ch === 'BRAWLER') {
        ctx.roundRect(-TANK_WIDTH/2 - 2, -TANK_HEIGHT/2 - 1, TANK_WIDTH + 4, TANK_HEIGHT + 2, 5);
    } else {
        ctx.roundRect(-TANK_WIDTH/2, -TANK_HEIGHT/2 + 4, TANK_WIDTH, TANK_HEIGHT - 8, 8);
    }
    ctx.fill();
    ctx.stroke();
    ctx.shadowBlur = 0;

    // Layer B: Upper Plate (Volumetric Highlight)
    if (isPremium) {
        const plateGrad = ctx.createLinearGradient(0, -TANK_HEIGHT/3, 0, TANK_HEIGHT/3);
        plateGrad.addColorStop(0, 'rgba(255, 255, 255, 0.08)');
        plateGrad.addColorStop(0.5, 'rgba(255, 255, 255, 0.02)');
        plateGrad.addColorStop(1, 'rgba(0, 0, 0, 0.2)');
        ctx.fillStyle = plateGrad;
        ctx.beginPath();
        if (p.ch === 'SCOUT') ctx.roundRect(-TANK_WIDTH/2 + 8, -TANK_HEIGHT/2 + 8, TANK_WIDTH - 20, TANK_HEIGHT - 16, 12);
        else ctx.roundRect(-TANK_WIDTH/2 + 5, -TANK_HEIGHT/2 + 5, TANK_WIDTH - 10, TANK_HEIGHT - 10, 4);
        ctx.fill();
    }

    // 5. MECHANICAL DETAILS (Panel lines, rivets, vents)
    ctx.strokeStyle = 'rgba(0, 0, 0, 0.3)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    // Armor seams
    ctx.moveTo(-TANK_WIDTH/4, -TANK_HEIGHT/2 + 5); ctx.lineTo(-TANK_WIDTH/4, TANK_HEIGHT/2 - 5);
    ctx.moveTo(TANK_WIDTH/4, -TANK_HEIGHT/2 + 5); ctx.lineTo(TANK_WIDTH/4, TANK_HEIGHT/2 - 5);
    ctx.stroke();

    // Rivets (Metallic bolts)
    ctx.fillStyle = 'rgba(255, 255, 255, 0.05)';
    const rivetPos = [[-TANK_WIDTH/3, -TANK_HEIGHT/3], [TANK_WIDTH/3, -TANK_HEIGHT/3], [-TANK_WIDTH/3, TANK_HEIGHT/3], [TANK_WIDTH/3, TANK_HEIGHT/3]];
    rivetPos.forEach(([rx, ry]) => {
        ctx.beginPath(); ctx.arc(rx, ry, 0.8, 0, Math.PI * 2); ctx.fill();
    });


    // Headlights (Warm industrial glow)
    ctx.fillStyle = '#fffabb';
    if (isPremium) { ctx.shadowBlur = 6; ctx.shadowColor = '#ffffaa'; }
    ctx.beginPath(); ctx.arc(TANK_WIDTH/2 - 6, -10, 2.8, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(TANK_WIDTH/2 - 6, 10, 2.8, 0, Math.PI * 2); ctx.fill();
    ctx.shadowBlur = 0;

    // 6. DYNAMIC ACCESSORIES (Antennas)
    if (isPremium) {
        const sway = Math.sin(Date.now() * 0.005 + p.x * 0.01) * 4;
        ctx.strokeStyle = '#444';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(-TANK_WIDTH/2 + 10, 0);
        ctx.lineTo(-TANK_WIDTH/2 + 5 + sway/2, sway);
        ctx.stroke();
        // Antenna tip
        ctx.fillStyle = teamColor;
        ctx.beginPath(); ctx.arc(-TANK_WIDTH/2 + 5 + sway/2, sway, 1.5, 0, Math.PI * 2); ctx.fill();
    }

    ctx.restore(); // End base rotation

    // 7. TURRET (Independent Rotation)
    ctx.save();
    ctx.rotate(p.aa !== undefined ? p.aa : p.a);

    // Turret Base (Volumetric Dome)
    const tRad = p.ch === 'BRAWLER' ? 17 : 14;
    const tGrad = ctx.createRadialGradient(-4, -4, 2, 0, 0, tRad);
    tGrad.addColorStop(0, '#4a4a6e');
    tGrad.addColorStop(1, '#080812');
    ctx.fillStyle = tGrad;
    ctx.strokeStyle = '#000';
    ctx.lineWidth = 1.5;
    
    ctx.beginPath();
    if (p.ch === 'BRAWLER') ctx.roundRect(-tRad, -tRad, tRad*2, tRad*2, 4);
    else ctx.arc(0, 0, tRad, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    // Turret Rim Highlight (Sharp edge)
    if (isPremium) {
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.15)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.arc(0, 0, tRad - 2, -Math.PI*0.8, -Math.PI*0.2);
        ctx.stroke();
    }

    // Barrel (Industrial Shading)
    const weaponType = p.sl && p.sl[p.cs];
    let bLen = 32; let bWid = 10;
    if (weaponType === 'HEAVY_GUN') { bLen = 45; bWid = 15; }
    else if (weaponType === 'FLAMETHROWER') { bLen = 22; bWid = 12; }
    else if (weaponType === 'TESLA') { bLen = 38; bWid = 7; }

    const bGrad = ctx.createLinearGradient(tRad, -bWid/2, tRad, bWid/2);
    bGrad.addColorStop(0, '#2a2a3e');
    bGrad.addColorStop(0.5, '#151525');
    bGrad.addColorStop(1, '#050510');
    ctx.fillStyle = bGrad;
    ctx.beginPath();
    ctx.roundRect(tRad - 2, -bWid/2, bLen, bWid, 2);
    ctx.fill();
    ctx.stroke();

    // Muzzle / Specialized details
    if (weaponType === 'TESLA' && isPremium) {
        ctx.strokeStyle = teamColor;
        ctx.shadowBlur = 8; ctx.shadowColor = teamColor;
        for(let i=0; i<4; i++) {
            ctx.beginPath(); ctx.moveTo(tRad + 8 + i*7, -bWid/2 - 2); ctx.lineTo(tRad + 8 + i*7, bWid/2 + 2); ctx.stroke();
        }
        ctx.shadowBlur = 0;
    } else {
        // Standard Muzzle Brake
        ctx.fillStyle = '#111';
        ctx.beginPath(); ctx.roundRect(tRad + bLen - 6, -bWid/2 - 2, 8, bWid + 4, 1); ctx.fill(); ctx.stroke();
    }

    ctx.restore(); // End turret rotation

    // 8. USERNAME & HP (Final Overlay)
    ctx.save();
    ctx.fillStyle = 'white';
    ctx.font = '900 13px Outfit';
    ctx.textAlign = 'center';
    ctx.shadowBlur = 4; ctx.shadowColor = 'black';
    const name = (p.username || p.u || 'PLAYER').toUpperCase();
    ctx.fillText(name, 0, -TANK_HEIGHT - 12);
    
    // HP Bar Mini (Optional but premium)
    if (isPremium && p.id !== myId) {
        const hpW = 40;
        ctx.fillStyle = 'rgba(0,0,0,0.5)';
        ctx.fillRect(-hpW/2, -TANK_HEIGHT - 8, hpW, 4);
        ctx.fillStyle = teamColor;
        ctx.fillRect(-hpW/2, -TANK_HEIGHT - 8, hpW * (p.hp / 100), 4);
    }
    ctx.restore();

    ctx.restore(); // Final global restore
}

function drawCrosshair() {
    if (!gameActive || isMenuOpen || isShopOpen || (gameState && gameState.gameOver)) return;

    // Use gameState for interpolated/responsive state
    const me = gameState?.players?.find(p => p.id === myId);
    if (!me) return;

    const weaponMod = WEAPON_MODULES[me.w];
    const weaponType = weaponMod ? weaponMod.type : 'metal';
    const color = TRAIL_COLORS[weaponType] || '#00f2ff';
    const pulse = Math.sin(renderTime * 0.01) * 0.2 + 0.8;

    ctx.save();
    ctx.translate(mousePos.x, mousePos.y);

    // 1. Outer Rotating Ring (Premium feel)
    ctx.save();
    ctx.rotate(renderTime * 0.002);
    ctx.strokeStyle = color;
    ctx.lineWidth = 1.5;
    ctx.globalAlpha = 0.4;
    ctx.setLineDash([5, 15]);
    ctx.beginPath();
    ctx.arc(0, 0, 18, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();

    // 2. Main Crosshair
    ctx.strokeStyle = color;
    ctx.lineWidth = 2.5;
    ctx.shadowBlur = 15 * pulse;
    ctx.shadowColor = color;
    const size = 12;

    ctx.beginPath();
    // Horizontal
    ctx.moveTo(-size, 0); ctx.lineTo(-4, 0);
    ctx.moveTo(size, 0); ctx.lineTo(4, 0);
    // Vertical
    ctx.moveTo(0, -size); ctx.lineTo(0, -4);
    ctx.moveTo(0, size); ctx.lineTo(0, 4);
    ctx.stroke();

    // 3. Inner Point
    ctx.fillStyle = '#fff';
    ctx.shadowBlur = 5;
    ctx.beginPath();
    ctx.arc(0, 0, 2, 0, Math.PI * 2);
    ctx.fill();

    ctx.restore();
}

function drawMinimap() {
    const size = 180;
    const padding = 20;
    const x = padding;
    const y = canvas.height - size - padding;
    const worldSize = serverState.worldSize || 4000;
    const scale = size / worldSize;

    ctx.save();
    ctx.translate(x, y);

    // Background
    ctx.fillStyle = 'rgba(10, 10, 25, 0.85)';
    ctx.beginPath();
    ctx.roundRect(0, 0, size, size, 15);
    ctx.fill();
    ctx.strokeStyle = 'rgba(0, 242, 255, 0.3)';
    ctx.lineWidth = 2;
    ctx.stroke();

    // Elements (Buildings & Scrap)
    gameState.elements.forEach(e => {
        const ex = e.x * scale;
        const ey = e.y * scale;
        
        if (e.t === MATERIALS.BUILDING) {
            ctx.fillStyle = 'rgba(255, 255, 255, 0.15)';
            ctx.fillRect(ex - (e.w/2)*scale, ey - (e.h/2)*scale, e.w * scale, e.h * scale);
        } else if (e.t === MATERIALS.SCRAP) {
            ctx.fillStyle = '#ffd700';
            ctx.beginPath();
            ctx.arc(ex, ey, 1.5, 0, Math.PI * 2);
            ctx.fill();
        }
    });

    // Players
    gameState.players.forEach(p => {
        if (p.hidden && p.id !== myId) return;
        const color = p.t === 'blue' ? '#00f2ff' : '#ff00ff';
        ctx.fillStyle = color;
        const px = p.x * scale;
        const py = p.y * scale;
        
        if (p.id === myId) {
            ctx.shadowBlur = 10;
            ctx.shadowColor = color;
            ctx.beginPath();
            ctx.arc(px, py, 4.5, 0, Math.PI * 2);
            ctx.fill();
            ctx.strokeStyle = '#fff';
            ctx.lineWidth = 1.5;
            ctx.stroke();
            ctx.shadowBlur = 0;
        } else {
            ctx.beginPath();
            ctx.arc(px, py, 3, 0, Math.PI * 2);
            ctx.fill();
        }
    });

    // Borders
    ctx.strokeStyle = 'rgba(0, 242, 255, 0.3)';
    ctx.lineWidth = 1;
    ctx.strokeRect(0, 0, size, size);

    ctx.restore();
}

function drawKillFeed() {
    const now = Date.now();
    const padding = 25;
    const x = canvas.width - padding;
    let y = padding + 90;

    ctx.save();
    ctx.textAlign = 'right';
    ctx.font = '700 15px Outfit';
    ctx.textBaseline = 'middle';

    killFeed = killFeed.filter(f => now - f.time < 6000);

    killFeed.forEach(f => {
        const age = now - f.time;
        const alpha = age > 5000 ? 1 - (age - 5000) / 1000 : 1;
        ctx.globalAlpha = alpha;

        const killerColor = f.killerTeam === 'blue' ? '#00f2ff' : '#ff00ff';
        const victimColor = f.victimTeam === 'blue' ? '#00f2ff' : '#ff00ff';

        const victimWidth = ctx.measureText(f.victim).width;
        const friendlyWeapon = WEAPON_NAMES[f.weapon] || f.weapon;
        const weaponText = ` [${friendlyWeapon.toUpperCase()}] `;
        const weaponWidth = ctx.measureText(weaponText).width;
        const killerWidth = ctx.measureText(f.killer).width;

        // Victim
        ctx.fillStyle = victimColor;
        ctx.fillText(f.victim, x, y);
        
        // Weapon
        ctx.fillStyle = 'rgba(255, 255, 255, 0.7)';
        ctx.fillText(weaponText, x - victimWidth, y);
        
        // Killer
        ctx.fillStyle = killerColor;
        ctx.fillText(f.killer, x - victimWidth - weaponWidth, y);

        y += 28;
    });

    ctx.restore();
}

function drawZones() {
    if (!gameState.zones) return;
    const worldSize = gameState.worldSize || 4000;
    const currentBiome = gameState.zones[0] ? gameState.zones[0].type : 'RANDOM';
    gameState.zones.forEach(z => {
        // Draw Zone Color
        ctx.fillStyle = z.color;
        ctx.fillRect(z.x, z.y, z.w, z.h);

        // Draw Label
        ctx.save();
        ctx.fillStyle = 'rgba(255, 255, 255, 0.1)';
        ctx.font = '900 120px Outfit';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(z.type, z.x + z.w / 2, z.y + z.h / 2);
        ctx.restore();
    });

    // Urban Road Markings (Premium Neon Grid)
    if (currentBiome === 'URBAN') {
        ctx.save();
        const pulse = 0.6 + Math.sin(Date.now() * 0.001) * 0.2;
        ctx.strokeStyle = `rgba(0, 242, 255, ${0.1 * pulse})`;
        ctx.lineWidth = 2;
        
        const spacing = 400;
        for (let i = 0; i < worldSize; i += spacing) {
            if (i < camera.x - 100 || i > camera.x + canvas.width + 100) continue;
            // Main Road Lines
            ctx.beginPath(); ctx.moveTo(i, 0); ctx.lineTo(i, worldSize); ctx.stroke();
            ctx.beginPath(); ctx.moveTo(0, i); ctx.lineTo(worldSize, i); ctx.stroke();
            
            // Neon Crosswalks
            ctx.save();
            ctx.strokeStyle = `rgba(255, 0, 255, ${0.08 * pulse})`;
            ctx.lineWidth = 15;
            for (let j = 0; j < worldSize; j += 800) {
                if (j < camera.y - 100 || j > camera.y + canvas.height + 100) continue;
                // Vertical Crosswalk
                ctx.setLineDash([10, 15]);
                ctx.beginPath(); ctx.moveTo(i, j + 350); ctx.lineTo(i, j + 450); ctx.stroke();
                // Horizontal Crosswalk
                ctx.beginPath(); ctx.moveTo(j + 350, i); ctx.lineTo(j + 450, i); ctx.stroke();
            }
            ctx.restore();
        }
        ctx.restore();
    }
}

function drawGrid() {
    const gridSize = 100;
    const worldSize = gameState.worldSize || 4000;
    
    const currentBiome = gameState.zones && gameState.zones[0] ? gameState.zones[0].type : 'RANDOM';

    // Reset ground details if biome or size changes
    if (currentBiome !== lastBiome || worldSize !== lastWorldSize) {
        groundDetails = [];
        lizards = []; scorpions = []; vultures = [];
        pigeons = []; strayCats = []; cockroaches = [];
        rats = []; microDrones = []; moths = [];
        snowHares = []; penguins = []; arcticFoxes = [];
        dragonflies = []; frogs = []; waterStriders = [];
        mutatedCrows = []; scrapBeetles = []; radioactiveSlugs = [];
        environmentalObjects = [];
        lastBiome = currentBiome;
        lastWorldSize = worldSize;
    }

    if (currentBiome === 'URBAN' || currentBiome === 'INDUSTRIAL') {
        const isIndustrial = currentBiome === 'INDUSTRIAL';
        const isUrban = currentBiome === 'URBAN';
        // 1. Base floor
        ctx.fillStyle = isIndustrial ? '#1a1a20' : '#050508';
        ctx.fillRect(0, 0, worldSize, worldSize);

        // 1.1 URBAN: Wet Asphalt Texture
        if (isUrban) {
            ctx.save();
            // A. Grainy Asphalt
            const grainCount = ENABLE_PREMIUM_VISUALS ? 400 : 150;
            ctx.fillStyle = 'rgba(255,255,255,0.015)';
            for (let i = 0; i < grainCount; i++) {
                const seed = i * 13.5;
                const rx = getStableRandom(seed) * worldSize;
                const ry = getStableRandom(seed + 1) * worldSize;
                if (rx > camera.x && rx < camera.x + canvas.width && ry > camera.y && ry < camera.y + canvas.height) {
                    ctx.fillRect(rx, ry, 1.5, 1.5);
                }
            }
            
            // B. Reflective Puddles (Organic blobs)
            if (ENABLE_PREMIUM_VISUALS) {
                ctx.globalCompositeOperation = 'screen';
                for (let i = 0; i < 20; i++) {
                    const seed = i * 47.2;
                    const px = getStableRandom(seed) * worldSize;
                    const py = getStableRandom(seed + 1) * worldSize;
                    if (px > camera.x - 200 && px < camera.x + canvas.width + 200 && py > camera.y - 200 && py < camera.y + canvas.height + 200) {
                        const pGrad = ctx.createRadialGradient(px, py, 0, px, py, 60);
                        pGrad.addColorStop(0, 'rgba(0, 242, 255, 0.05)');
                        pGrad.addColorStop(1, 'rgba(0, 242, 255, 0)');
                        ctx.fillStyle = pGrad;
                        ctx.beginPath(); ctx.ellipse(px, py, 60, 30, getStableRandom(seed+2)*Math.PI, 0, Math.PI*2); ctx.fill();
                    }
                }
            }
            ctx.restore();
        }

        // 1.1 INDUSTRIAL Details (Modular Mega-Plate System)
        if (isIndustrial) {
            const panelSize = 400;
            const seamSize = 4;
            
            // A. Panel Grid with chamfered seams
            ctx.save();
            for (let x = 0; x < worldSize; x += panelSize) {
                if (x < camera.x - panelSize || x > camera.x + canvas.width + panelSize) continue;
                for (let y = 0; y < worldSize; y += panelSize) {
                    if (y < camera.y - panelSize || y > camera.y + canvas.height + panelSize) continue;
                    
                    // Panel Body
                    ctx.fillStyle = '#1e1e24';
                    ctx.fillRect(x + seamSize, y + seamSize, panelSize - seamSize*2, panelSize - seamSize*2);
                    
                    // Beveled edge highlights (Subtle)
                    ctx.strokeStyle = 'rgba(255,255,255,0.03)';
                    ctx.lineWidth = 1;
                    ctx.strokeRect(x + seamSize, y + seamSize, panelSize - seamSize*2, panelSize - seamSize*2);

                    // B. Rare Floor Details (Grates & Decals)
                    const seed = x + y;
                    const rand = getStableRandom(seed);
                    if (rand > 0.92 && ENABLE_PREMIUM_VISUALS) {
                        // Metal Grate
                        ctx.fillStyle = '#0a0a0c';
                        ctx.fillRect(x + 50, y + 50, 100, 100);
                        ctx.strokeStyle = '#333'; ctx.lineWidth = 2;
                        for (let gx = 60; gx < 150; gx += 10) {
                            ctx.beginPath(); ctx.moveTo(x + gx, y + 50); ctx.lineTo(x + gx, y + 150); ctx.stroke();
                        }
                    } else if (rand > 0.88 && ENABLE_PREMIUM_VISUALS) {
                        // Caution Decal
                        ctx.save();
                        ctx.translate(x + panelSize/2, y + panelSize/2);
                        ctx.rotate(Math.floor(getStableRandom(seed+1)*4) * Math.PI/2);
                        ctx.fillStyle = 'rgba(255, 204, 0, 0.15)';
                        ctx.font = 'bold 24px Outfit';
                        ctx.textAlign = 'center';
                        const labels = ['ZONE A', 'CAUTION', 'REACTOR', 'CORE 01', 'DANGER'];
                        ctx.fillText(labels[Math.floor(getStableRandom(seed+2)*labels.length)], 0, 0);
                        ctx.restore();
                    }
                }
            }
            ctx.restore();

            // C. Energy Tracks (Recessed pulsing lines along seams)
            if (ENABLE_PREMIUM_VISUALS) {
                const pulse = 0.3 + Math.sin(Date.now() * 0.002) * 0.2;
                ctx.save();
                ctx.lineWidth = 2;
                ctx.strokeStyle = `rgba(0, 242, 255, ${pulse * 0.4})`;
                ctx.shadowBlur = 10 * pulse;
                ctx.shadowColor = '#00f2ff';
                
                // Horizontal tracks
                for (let y = 0; y <= worldSize; y += panelSize) {
                    if (y < camera.y - 100 || y > camera.y + canvas.height + 100) continue;
                    ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(worldSize, y); ctx.stroke();
                }
                // Vertical tracks
                for (let x = 0; x <= worldSize; x += panelSize) {
                    if (x < camera.x - 100 || x > camera.x + canvas.width + 100) continue;
                    ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, worldSize); ctx.stroke();
                }
                
                // D. Traveling Energy Pulses
                ctx.save();
                ctx.strokeStyle = '#fff';
                ctx.lineWidth = 3;
                ctx.globalAlpha = 0.6;
                const flowPos = (Date.now() * 0.4) % worldSize;
                for (let i = 0; i < worldSize; i += 1200) {
                    const px = (flowPos + i) % worldSize;
                    if (px > camera.x - 200 && px < camera.x + canvas.width + 200) {
                        for (let y = 0; y < worldSize; y += panelSize) {
                            ctx.beginPath(); ctx.moveTo(px, y); ctx.lineTo(px + 40, y); ctx.stroke();
                        }
                    }
                    const py = (flowPos + i) % worldSize;
                    if (py > camera.y - 200 && py < camera.y + canvas.height + 200) {
                        for (let x = 0; x < worldSize; x += panelSize) {
                            ctx.beginPath(); ctx.moveTo(x, py); ctx.lineTo(x, py + 40); ctx.stroke();
                        }
                    }
                }
                ctx.restore();
                ctx.restore();
            }
        }

        // 1.3 Procedural Ground Detail (Grit & Vents)
        if (ENABLE_PREMIUM_VISUALS) {
            if (groundDetails.length === 0) {
                for (let i = 0; i < 800; i++) {
                    groundDetails.push({
                        x: Math.random() * worldSize, y: Math.random() * worldSize,
                        size: 1 + Math.random() * 3, opacity: 0.05 + Math.random() * 0.1,
                        isDark: Math.random() > 0.5, isVent: isIndustrial && Math.random() > 0.96
                    });
                }
            }
            ctx.save();
            groundDetails.forEach(d => {
                if (d.x < camera.x - 200 || d.x > camera.x + canvas.width + 200 || d.y < camera.y - 200 || d.y > camera.y + canvas.height + 200) return;
                if (d.isVent) {
                    ctx.fillStyle = '#111'; ctx.fillRect(d.x - 15, d.y - 15, 30, 30);
                    ctx.strokeStyle = '#333'; ctx.strokeRect(d.x - 15, d.y - 15, 30, 30);
                    if (Math.random() > 0.95) particles.push({ x: d.x, y: d.y, vx: (Math.random()-0.5)*0.3, vy: -1.0, life: 1.0, color: 'rgba(200,200,220,0.2)', size: 5+Math.random()*10 });
                } else {
                    ctx.globalAlpha = d.opacity; ctx.fillStyle = d.isDark ? '#000' : '#fff';
                    ctx.beginPath(); ctx.arc(d.x, d.y, d.size, 0, Math.PI * 2); ctx.fill();
                }
            });
            ctx.restore();
        }

        // 2. Facility Floor (Industrial) or Sidewalks (Other)
        const blockSize = 350, streetWidth = 150, padding = 150, step = blockSize + streetWidth;
        
        if (isIndustrial) {
            // Draw a continuous "Weathered Concrete" Facility Floor
            ctx.fillStyle = '#22222a'; 
            ctx.fillRect(0, 0, worldSize, worldSize);
            
            // Concrete Grit & Scratches (Static detail)
            ctx.save();
            ctx.strokeStyle = 'rgba(255,255,255,0.02)'; ctx.lineWidth = 1;
            for (let i=0; i<worldSize; i+=200) {
                for (let j=0; j<worldSize; j+=200) {
                    if (i < camera.x - 200 || i > camera.x + canvas.width + 200) continue;
                    if (getStableRandom(i + j) > 0.7) {
                        ctx.beginPath();
                        ctx.moveTo(i + getStableRandom(i)*200, j + getStableRandom(j)*200);
                        ctx.lineTo(i + getStableRandom(i+1)*200, j + getStableRandom(j+1)*200);
                        ctx.stroke();
                    }
                }
            }
            ctx.restore();

            gameState.elements.forEach(e => {
                if ([MATERIALS.OIL, MATERIALS.ACID, MATERIALS.FIRE].includes(e.t)) {
                    if (e.x < camera.x - 200 || e.x > camera.x + canvas.width + 200) return;
                    ctx.save();
                    // Inner dirt/stain around hazard
                    ctx.fillStyle = 'rgba(0,0,0,0.2)';
                    ctx.beginPath(); ctx.arc(e.x, e.y, e.w * 0.7, 0, Math.PI * 2); ctx.fill();
                    ctx.restore();
                }
            });
        } else {
            for (let x = padding - 10; x < worldSize - padding; x += step) {
                for (let y = padding - 10; y < worldSize - padding; y += step) {
                    if (x < camera.x - 500 || x > camera.x + canvas.width + 500 || y < camera.y - 500 || y > camera.y + canvas.height + 500) continue;

                    // Sidewalk Base
                    ctx.fillStyle = '#1a1a22';
                    ctx.beginPath();
                    ctx.roundRect(x, y, blockSize + 20, blockSize + 20, 8);
                    ctx.fill();
                    
                    // Curb Shadow/Depth
                    ctx.strokeStyle = '#050508'; ctx.lineWidth = 2;
                    ctx.strokeRect(x, y, blockSize + 20, blockSize + 20);
                    
                    // Tactile Paving (Subtle dots at corners)
                    ctx.fillStyle = 'rgba(255, 200, 0, 0.05)';
                    for (let dotX = x + 10; dotX < x + 30; dotX += 6) {
                        for (let dotY = y + 10; dotY < y + 30; dotY += 6) {
                            ctx.beginPath(); ctx.arc(dotX, dotY, 1.5, 0, Math.PI*2); ctx.fill();
                        }
                    }
                    
                    ctx.strokeStyle = 'rgba(255,255,255,0.02)'; ctx.lineWidth = 1;
                    ctx.strokeRect(x + 2, y + 2, blockSize + 16, blockSize + 16);
                }
            }
        }

        // 3. Road Markings (Urban Only)
        if (!isIndustrial) {
            ctx.strokeStyle = 'rgba(255, 200, 0, 0.1)';
            ctx.setLineDash([20, 30]); ctx.lineWidth = 2;
            ctx.beginPath();
            for (let x = padding - streetWidth/2; x < worldSize; x += step) { ctx.moveTo(x, 0); ctx.lineTo(x, worldSize); }
            for (let y = padding - streetWidth/2; y < worldSize; y += step) { ctx.moveTo(0, y); ctx.lineTo(worldSize, y); }
            ctx.stroke(); ctx.setLineDash([]); 
        }
    } else if (currentBiome === 'WASTELAND') {
        // Nuclear Wasteland Base (Scorched Earth)
        ctx.fillStyle = '#1c120d'; 
        ctx.fillRect(0, 0, worldSize, worldSize);
 
        if (ENABLE_PREMIUM_VISUALS) {
            if (groundDetails.length === 0) {
                for (let i = 0; i < 1000; i++) {
                    const r = Math.random();
                    groundDetails.push({
                        x: Math.random() * worldSize,
                        y: Math.random() * worldSize,
                        size: r < 0.05 ? 40 + Math.random() * 60 : (r < 0.1 ? 25 + Math.random() * 40 : (r < 0.2 ? 10 + Math.random() * 20 : (r < 0.4 ? 6 + Math.random() * 12 : 2 + Math.random() * 6))),
                        opacity: 0.05 + Math.random() * 0.15,
                        type: r < 0.05 ? 'crater' : (r < 0.1 ? 'stain' : (r < 0.2 ? 'slab' : (r < 0.4 ? 'stone' : (r < 0.6 ? 'heatcrack' : 'ash')))),
                        color: r < 0.1 ? (Math.random() > 0.5 ? '#ffff00' : '#88ff00') : (r < 0.4 ? (Math.random() > 0.5 ? '#333' : '#444') : (Math.random() > 0.5 ? '#2d1b0f' : '#1a0e08')),
                        phase: Math.random() * Math.PI * 2
                    });
                }
            }
 
            ctx.save();
            groundDetails.forEach(d => {
                if (d.x < camera.x - 150 || d.x > camera.x + canvas.width + 150 || d.y < camera.y - 150 || d.y > camera.y + canvas.height + 150) return;
                
                if (d.type === 'heatcrack') {
                    // Glowing heat cracks (Pulsing)
                    const pulse = 0.5 + Math.sin(renderTime * 0.002 + d.phase) * 0.5;
                    ctx.strokeStyle = `rgba(255, 68, 0, ${d.opacity * (0.2 + pulse * 0.4)})`; 
                    ctx.lineWidth = 1 + pulse;
                    ctx.beginPath();
                    ctx.moveTo(d.x - d.size, d.y);
                    ctx.lineTo(d.x, d.y + d.size/2);
                    ctx.lineTo(d.x + d.size, d.y - d.size/4);
                    ctx.stroke();
                } else if (d.type === 'crater') {
                    // Scorched impact craters
                    const g = ctx.createRadialGradient(d.x, d.y, 0, d.x, d.y, d.size);
                    g.addColorStop(0, 'rgba(0,0,0,0.4)');
                    g.addColorStop(0.7, 'rgba(20,10,5,0.2)');
                    g.addColorStop(1, 'rgba(0,0,0,0)');
                    ctx.fillStyle = g;
                    ctx.beginPath(); ctx.arc(d.x, d.y, d.size, 0, Math.PI * 2); ctx.fill();
                    // Rim
                    ctx.strokeStyle = 'rgba(40,20,10,0.1)'; ctx.lineWidth = 2;
                    ctx.beginPath(); ctx.arc(d.x, d.y, d.size * 0.9, 0, Math.PI * 2); ctx.stroke();
                } else if (d.type === 'stain') {
                    // Radioactive stains (Green/Yellow glow)
                    const pulse = 0.7 + Math.sin(renderTime * 0.001 + d.phase) * 0.3;
                    const g = ctx.createRadialGradient(d.x, d.y, 0, d.x, d.y, d.size);
                    g.addColorStop(0, `${d.color}${Math.floor(d.opacity * 200).toString(16).padStart(2,'0')}`);
                    g.addColorStop(1, 'rgba(0,0,0,0)');
                    ctx.fillStyle = g; ctx.globalAlpha = d.opacity * pulse;
                    ctx.beginPath(); ctx.ellipse(d.x, d.y, d.size, d.size * 0.6, d.phase, 0, Math.PI * 2); ctx.fill();
                    ctx.globalAlpha = 1.0;
                } else if (d.type === 'slab') {
                    // Broken building parts (Square/Rectangular)
                    ctx.save();
                    ctx.translate(d.x, d.y); ctx.rotate(d.phase);
                    ctx.fillStyle = d.color; ctx.globalAlpha = d.opacity * 2;
                    ctx.fillRect(-d.size/2, -d.size/2, d.size, d.size * 0.7);
                    // Detail line on slab
                    ctx.strokeStyle = 'rgba(255,255,255,0.05)'; ctx.lineWidth = 1;
                    ctx.beginPath(); ctx.moveTo(-d.size/2, 0); ctx.lineTo(d.size/2, 0); ctx.stroke();
                    ctx.restore();
                } else if (d.type === 'stone') {
                    // Jagged stones
                    ctx.fillStyle = d.color; ctx.globalAlpha = d.opacity * 2.5;
                    ctx.beginPath();
                    ctx.moveTo(d.x, d.y - d.size/2);
                    ctx.lineTo(d.x + d.size/2, d.y + d.size/4);
                    ctx.lineTo(d.x - d.size/3, d.y + d.size/2);
                    ctx.closePath(); ctx.fill();
                } else if (d.type === 'rubble') {
                    // Scorched debris
                    ctx.fillStyle = '#0a0806'; ctx.globalAlpha = d.opacity * 2;
                    ctx.beginPath();
                    ctx.moveTo(d.x, d.y - d.size/2);
                    ctx.lineTo(d.x + d.size/2, d.y + d.size/2);
                    ctx.lineTo(d.x - d.size/2, d.y + d.size/2);
                    ctx.closePath(); ctx.fill();
                    ctx.globalAlpha = 1.0;
                } else {
                    // Ash/Dust
                    ctx.fillStyle = d.color; ctx.globalAlpha = d.opacity;
                    ctx.beginPath(); ctx.arc(d.x, d.y, d.size, 0, Math.PI * 2); ctx.fill();
                    ctx.globalAlpha = 1.0;
                }
            });
            ctx.restore();

            // 2. Toxic Sky Glow (Distant flashes)
            if (Math.random() > 0.992) {
                ctx.save();
                ctx.globalAlpha = 0.08;
                ctx.fillStyle = Math.random() > 0.7 ? '#88ff00' : '#ff8800';
                ctx.fillRect(camera.x, camera.y, canvas.width, canvas.height);
                ctx.restore();
            }
 
            // 3. Nuclear Fog (Depth & Atmosphere)
            ctx.save();
            ctx.globalCompositeOperation = 'multiply';
            const fogGrad = ctx.createLinearGradient(camera.x, camera.y, camera.x, camera.y + canvas.height);
            fogGrad.addColorStop(0, 'rgba(50, 30, 20, 0)');
            fogGrad.addColorStop(1, 'rgba(20, 10, 5, 0.2)');
            ctx.fillStyle = fogGrad;
            ctx.fillRect(camera.x, camera.y, canvas.width, canvas.height);
            ctx.restore();
 
            // 4. Atmospheric Heat Distortion
            ctx.save();
            ctx.globalCompositeOperation = 'screen';
            ctx.fillStyle = 'rgba(255, 68, 0, 0.01)';
            for (let i = 0; i < 2; i++) {
                const cx = ((renderTime * 0.15) + (i * worldSize/2)) % worldSize;
                const cy = ((renderTime * 0.08) + (i * worldSize/3)) % worldSize;
                ctx.beginPath(); ctx.arc(cx, cy, 800, 0, Math.PI * 2); ctx.fill();
            }
            ctx.restore();
        }
    } else if (currentBiome === 'DESERT') {
        // Warm Golden Sand Base (Improved for better visibility and sand feel)
        ctx.fillStyle = '#4a3728'; 
        ctx.fillRect(0, 0, worldSize, worldSize);

        if (ENABLE_PREMIUM_VISUALS) {
            if (groundDetails.length === 0) {
                for (let i = 0; i < 1100; i++) {
                    const r = Math.random();
                    groundDetails.push({
                        x: Math.random() * worldSize,
                        y: Math.random() * worldSize,
                        size: r < 0.08 ? 80 + Math.random() * 120 : (r < 0.18 ? 20 + Math.random() * 40 : (r < 0.25 ? 30 + Math.random() * 60 : (r < 0.4 ? 15 + Math.random() * 25 : 1 + Math.random() * 3))),
                        opacity: 0.05 + Math.random() * 0.15,
                        type: r < 0.08 ? 'dune' : (r < 0.18 ? 'rock' : (r < 0.25 ? 'oasis_grass' : (r < 0.4 ? 'ripple' : 'glint'))),
                        phase: Math.random() * Math.PI * 2,
                        color: r < 0.18 ? (Math.random() > 0.5 ? '#7a5c43' : '#a68a64') : (r < 0.25 ? '#2d4d2d' : '#fff')
                    });
                }
            }

            ctx.save();
            groundDetails.forEach(d => {
                if (d.x < camera.x - 150 || d.x > camera.x + canvas.width + 150 || d.y < camera.y - 150 || d.y > camera.y + canvas.height + 150) return;
                
                if (d.type === 'dune') {
                    // Soft Sand Dune (Radial Gradient with shadow)
                    const g = ctx.createRadialGradient(d.x - d.size*0.2, d.y - d.size*0.2, 0, d.x, d.y, d.size);
                    g.addColorStop(0, 'rgba(255, 230, 200, 0.18)');
                    g.addColorStop(1, 'rgba(0, 0, 0, 0)');
                    ctx.fillStyle = g;
                    ctx.beginPath(); ctx.arc(d.x, d.y, d.size, 0, Math.PI * 2); ctx.fill();
                } else if (d.type === 'rock') {
                    // Sandstone Rock (Jagged layered)
                    ctx.save();
                    ctx.translate(d.x, d.y); ctx.rotate(d.phase);
                    ctx.fillStyle = d.color; ctx.globalAlpha = d.opacity * 3;
                    ctx.beginPath();
                    ctx.moveTo(-d.size/2, d.size/4); ctx.lineTo(-d.size/4, -d.size/2);
                    ctx.lineTo(d.size/2, -d.size/3); ctx.lineTo(d.size/3, d.size/2);
                    ctx.closePath(); ctx.fill();
                    // Layer highlight
                    ctx.strokeStyle = 'rgba(255,255,255,0.05)'; ctx.lineWidth = 1;
                    ctx.beginPath(); ctx.moveTo(-d.size/2.5, -d.size/8); ctx.lineTo(d.size/2.5, -d.size/8); ctx.stroke();
                    ctx.restore();
                } else if (d.type === 'oasis_grass') {
                    // Green oasis greenery
                    ctx.save();
                    ctx.translate(d.x, d.y); ctx.rotate(d.phase);
                    ctx.fillStyle = d.color; ctx.globalAlpha = d.opacity * 2;
                    ctx.beginPath();
                    for(let i=0; i<3; i++) {
                        const ang = (i / 3) * Math.PI * 2;
                        ctx.ellipse(Math.cos(ang)*10, Math.sin(ang)*10, d.size/2, d.size/4, ang, 0, Math.PI * 2);
                    }
                    ctx.fill();
                    ctx.restore();
                } else if (d.type === 'ripple') {
                    // Wind Ripples (Subtle sand waves)
                    ctx.strokeStyle = 'rgba(255, 255, 255, 0.08)';
                    ctx.lineWidth = 1.2;
                    ctx.beginPath();
                    for(let j=-d.size; j<d.size; j+=5) {
                        const off = Math.sin(j * 0.2 + d.phase) * 3;
                        ctx.moveTo(d.x + j, d.y + off);
                        ctx.lineTo(d.x + j + 3, d.y + off);
                    }
                    ctx.stroke();
                } else {
                    // Silica Glint
                    const shine = Math.sin(renderTime * 0.005 + d.phase) * 0.5 + 0.5;
                    if (shine > 0.96) {
                        ctx.fillStyle = '#fff';
                        ctx.globalAlpha = (shine - 0.96) * 15;
                        ctx.beginPath(); ctx.arc(d.x, d.y, 1, 0, Math.PI * 2); ctx.fill();
                    }
                }
            });
            ctx.restore();

            // 2. Volumetric Sandstorm (Dust Gusts)
            if (ENABLE_PREMIUM_VISUALS && Math.random() > 0.94) {
                const sx = camera.x - 100;
                const sy = camera.y + Math.random() * canvas.height;
                particles.push({
                    x: sx, y: sy,
                    vx: 12 + Math.random() * 8, vy: (Math.random() - 0.5) * 2,
                    size: 20 + Math.random() * 60,
                    life: 1.0, color: 'rgba(210, 180, 140, 0.1)',
                    isCloud: true
                });
            }

            // Heat Haze (Atmospheric shimmer - Softer & Horizontal)
            ctx.save();
            const shimmer = (renderTime * 0.05) % canvas.width;
            const hazeGrad = ctx.createLinearGradient(camera.x, 0, camera.x + canvas.width, 0);
            hazeGrad.addColorStop(0, 'rgba(237, 201, 175, 0)');
            hazeGrad.addColorStop(0.5, 'rgba(237, 201, 175, 0.03)');
            hazeGrad.addColorStop(1, 'rgba(237, 201, 175, 0)');
            
            ctx.fillStyle = hazeGrad;
            for(let i=0; i<2; i++) {
                const xOff = (shimmer + i * (canvas.width/2)) % canvas.width;
                ctx.fillRect(camera.x + xOff, camera.y, 150, canvas.height);
            }
            ctx.restore();
        }
    } else if (currentBiome === 'TUNDRA') {
        // Deep Frozen Ice Base
        ctx.fillStyle = '#050c12'; 
        ctx.fillRect(0, 0, worldSize, worldSize);
        
        if (ENABLE_PREMIUM_VISUALS) {
            if (groundDetails.length === 0) {
                for (let i = 0; i < 700; i++) {
                    const r = Math.random();
                    groundDetails.push({
                        x: Math.random() * worldSize,
                        y: Math.random() * worldSize,
                        size: r < 0.1 ? 25 + Math.random() * 40 : (r < 0.25 ? 12 + Math.random() * 20 : (r < 0.5 ? 5 + Math.random() * 10 : 1 + Math.random() * 2)),
                        opacity: 0.05 + Math.random() * 0.15,
                        type: r < 0.1 ? 'frozen_rock' : (r < 0.2 ? 'ice_shard' : (r < 0.35 ? 'ice_sheet' : (r < 0.55 ? 'snow_drift' : 'crystal'))),
                        angle: Math.random() * Math.PI * 2,
                        glint: Math.random()
                    });
                }
            }
            
            ctx.save();
            groundDetails.forEach(d => {
                if (d.x < camera.x - 100 || d.x > camera.x + canvas.width + 100 || d.y < camera.y - 100 || d.y > camera.y + canvas.height + 100) return;
                
                if (d.type === 'frozen_rock') {
                    // Cold jagged rock with snow dust
                    ctx.save();
                    ctx.translate(d.x, d.y); ctx.rotate(d.angle);
                    ctx.fillStyle = '#2a3a4a'; ctx.globalAlpha = d.opacity * 3;
                    ctx.beginPath();
                    ctx.moveTo(-d.size/2, d.size/4); ctx.lineTo(0, -d.size/2);
                    ctx.lineTo(d.size/2, d.size/3); ctx.lineTo(-d.size/4, d.size/2);
                    ctx.closePath(); ctx.fill();
                    // Snow cap on rock
                    ctx.fillStyle = '#fff'; ctx.globalAlpha = d.opacity * 2;
                    ctx.beginPath(); ctx.moveTo(-d.size/3, -d.size/6); ctx.lineTo(0, -d.size/2.2); ctx.lineTo(d.size/4, -d.size/8); ctx.fill();
                    ctx.restore();
                } else if (d.type === 'ice_shard') {
                    // Sharp translucent shard
                    ctx.save();
                    ctx.translate(d.x, d.y); ctx.rotate(d.angle);
                    ctx.fillStyle = 'rgba(200, 240, 255, 0.3)'; ctx.strokeStyle = 'rgba(255,255,255,0.4)'; ctx.lineWidth = 1;
                    ctx.beginPath(); ctx.moveTo(0, -d.size); ctx.lineTo(d.size/4, d.size); ctx.lineTo(-d.size/4, d.size); ctx.closePath();
                    ctx.fill(); ctx.stroke();
                    ctx.restore();
                } else if (d.type === 'ice_sheet') {
                    // Large frozen plate with sharp cracks & reflection
                    ctx.save();
                    ctx.translate(d.x, d.y);
                    ctx.rotate(d.angle);
                    
                    // Base Plate
                    ctx.fillStyle = 'rgba(100, 180, 255, 0.08)';
                    ctx.beginPath();
                    ctx.roundRect(-d.size, -d.size, d.size*2, d.size*2, d.size*0.4);
                    ctx.fill();
                    
                    // Cracks
                    ctx.strokeStyle = 'rgba(200, 240, 255, 0.15)';
                    ctx.lineWidth = 1;
                    ctx.beginPath();
                    ctx.moveTo(-d.size, 0); ctx.lineTo(d.size, 0);
                    ctx.moveTo(0, -d.size); ctx.lineTo(0, d.size);
                    ctx.stroke();
                    
                    // Surface Glint (Reflection)
                    const glintMove = (renderTime * 0.001) % 2;
                    ctx.strokeStyle = 'rgba(255, 255, 255, 0.1)';
                    ctx.lineWidth = 2;
                    ctx.beginPath();
                    ctx.moveTo(-d.size + glintMove * d.size, -d.size);
                    ctx.lineTo(d.size, d.size - glintMove * d.size);
                    ctx.stroke();
                    
                    ctx.restore();
                } else if (d.type === 'snow_drift') {
                    // Soft white patch
                    ctx.fillStyle = '#fff';
                    ctx.globalAlpha = d.opacity * 0.4;
                    ctx.beginPath();
                    ctx.ellipse(d.x, d.y, d.size, d.size * 0.5, d.angle, 0, Math.PI * 2);
                    ctx.fill();
                } else {
                    // Glistening crystal
                    const pulse = Math.sin(renderTime * 0.005 + d.glint * 10) * 0.5 + 0.5;
                    if (pulse > 0.8) {
                        ctx.fillStyle = '#fff';
                        ctx.globalAlpha = (pulse - 0.8) * 5;
                        ctx.beginPath();
                        ctx.arc(d.x, d.y, d.size, 0, Math.PI * 2);
                        ctx.fill();
                    }
                }
            });
            ctx.restore();

            // Snow Hares (Lively animals)
            if (snowHares.length === 0) {
                for (let i = 0; i < 25; i++) snowHares.push({ 
                    x: Math.random() * worldSize, 
                    y: Math.random() * worldSize, 
                    vx: 0, vy: 0, 
                    jump: 0, 
                    phase: Math.random() * Math.PI * 2 
                });
            }
            
            const me = gameState.players.find(p => p.id === myId);
            snowHares.forEach(h => {
                if (me) {
                    const dist = Math.hypot(me.x - h.x, me.y - h.y);
                    if (dist < 200) {
                        const a = Math.atan2(h.y - me.y, h.x - me.x);
                        h.vx = Math.cos(a) * 6;
                        h.vy = Math.sin(a) * 6;
                        h.jump = 1.0;
                    }
                }
                h.x += h.vx; h.y += h.vy;
                h.vx *= 0.92; h.vy *= 0.92;
                if (h.jump > 0) h.jump *= 0.9;
                else {
                    // Small random hops when idle
                    if (Math.random() > 0.99) h.jump = 0.5 + Math.random() * 0.5;
                }

                if (h.x > camera.x - 20 && h.x < camera.x + canvas.width + 20 && 
                    h.y > camera.y - 20 && h.y < camera.y + canvas.height + 20) {
                    ctx.save();
                    ctx.translate(h.x, h.y - h.jump * 10);
                    ctx.fillStyle = '#fff';
                    // Draw a small bunny shape
                    ctx.beginPath();
                    ctx.ellipse(0, 0, 4, 3, 0, 0, Math.PI * 2);
                    ctx.fill();
                    // Ears
                    ctx.beginPath();
                    ctx.ellipse(-2, -3, 1, 3, -0.2, 0, Math.PI * 2);
                    ctx.ellipse(0, -3, 1, 3, 0.2, 0, Math.PI * 2);
                    ctx.fill();
                    ctx.restore();
                }
            });
        }

        // --- NEW TUNDRA OVERHAUL EFFECTS ---
        
        // 1. Aurora Borealis (Backdrop)
        if (ENABLE_PREMIUM_VISUALS) {
            ctx.save();
            ctx.globalCompositeOperation = 'screen';
            auroraPhase += 0.005;
            for (let i = 0; i < 3; i++) {
                const phase = auroraPhase + i * 2;
                const grad = ctx.createLinearGradient(0, camera.y, 0, camera.y + 600);
                const color = i === 1 ? 'rgba(150, 0, 255, 0.15)' : 'rgba(0, 255, 150, 0.15)';
                grad.addColorStop(0, 'rgba(0,0,0,0)');
                grad.addColorStop(0.5, color);
                grad.addColorStop(1, 'rgba(0,0,0,0)');
                
                ctx.fillStyle = grad;
                ctx.beginPath();
                ctx.moveTo(camera.x, camera.y);
                for (let x = 0; x <= canvas.width; x += 50) {
                    const wave = Math.sin(x * 0.002 + phase) * 100 + Math.sin(x * 0.005 + phase * 0.5) * 50;
                    ctx.lineTo(camera.x + x, camera.y + 100 + wave + i * 40);
                }
                ctx.lineTo(camera.x + canvas.width, camera.y + canvas.height);
                ctx.lineTo(camera.x, camera.y + canvas.height);
                ctx.fill();
            }
            ctx.restore();
        }

        // 2. Volumetric Blizzard
        if (ENABLE_PREMIUM_VISUALS && Math.random() > 0.85) {
            const side = Math.random() > 0.5;
            particles.push({
                x: side ? camera.x - 50 : camera.x + canvas.width + 50,
                y: camera.y + Math.random() * canvas.height,
                vx: windVector.x * (2 + Math.random() * 2) * (side ? 1 : -1),
                vy: windVector.y + (Math.random() - 0.5),
                life: 1.5,
                color: 'rgba(255, 255, 255, 0.2)',
                size: 15 + Math.random() * 25,
                isSnowPuff: true
            });
        }
    } else if (currentBiome === 'WETLAND') {
        // Murky Dark Swamp Water
        ctx.fillStyle = '#080d08';
        ctx.fillRect(0, 0, worldSize, worldSize);
        
        if (ENABLE_PREMIUM_VISUALS) {
            if (groundDetails.length === 0) {
                for (let i = 0; i < 600; i++) {
                    const r = Math.random();
                    groundDetails.push({
                        x: Math.random() * worldSize, y: Math.random() * worldSize,
                        size: r < 0.2 ? 10 + Math.random() * 15 : (r < 0.3 ? 12 + Math.random() * 20 : (r < 0.45 ? 25 + Math.random() * 40 : (r < 0.6 ? 20 + Math.random() * 30 : 2 + Math.random() * 5))),
                        opacity: 0.1 + Math.random() * 0.2,
                        type: r < 0.2 ? 'lily' : (r < 0.3 ? 'mossy_rock' : (r < 0.45 ? 'wet_log' : (r < 0.6 ? 'mud' : 'bubble'))),
                        color: r < 0.2 ? '#2d4d2d' : (r < 0.3 ? '#3a4a2a' : (r < 0.45 ? '#1d150d' : '#1a221a')),
                        phase: Math.random() * Math.PI * 2,
                        hasBloom: r < 0.2 && Math.random() > 0.7,
                        bloomColor: Math.random() > 0.5 ? '#ff88cc' : '#ffffff'
                    });
                }
            }
            ctx.save();
            groundDetails.forEach(d => {
                if (d.x < camera.x - 50 || d.x > camera.x + canvas.width + 50 || d.y < camera.y - 50 || d.y > camera.y + canvas.height + 50) return;
                
                if (d.type === 'lily') {
                    // Lily Pad
                    ctx.fillStyle = d.color; ctx.globalAlpha = d.opacity * 2;
                    ctx.beginPath();
                    ctx.arc(d.x, d.y, d.size, 0.2, Math.PI * 1.8);
                    ctx.lineTo(d.x, d.y);
                    ctx.fill();
                    // Bloom
                    if (d.hasBloom) {
                        ctx.fillStyle = d.bloomColor; ctx.globalAlpha = d.opacity * 3;
                        const petals = 6;
                        for (let j = 0; j < petals; j++) {
                            const ang = (j / petals) * Math.PI * 2 + renderTime * 0.001;
                            ctx.beginPath();
                            ctx.ellipse(d.x + Math.cos(ang) * (d.size * 0.4), d.y + Math.sin(ang) * (d.size * 0.4), d.size * 0.3, d.size * 0.15, ang, 0, Math.PI * 2);
                            ctx.fill();
                        }
                        ctx.fillStyle = '#ffcc00'; ctx.beginPath(); ctx.arc(d.x, d.y, d.size * 0.15, 0, Math.PI * 2); ctx.fill();
                    }
                    // Subtle vein
                    ctx.strokeStyle = 'rgba(255,255,255,0.05)'; ctx.lineWidth = 1;
                    ctx.beginPath(); ctx.moveTo(d.x, d.y); ctx.lineTo(d.x + d.size, d.y); ctx.stroke();
                } else if (d.type === 'mossy_rock') {
                    // Green round stones
                    ctx.save();
                    ctx.translate(d.x, d.y); ctx.rotate(d.phase);
                    ctx.fillStyle = d.color; ctx.globalAlpha = d.opacity * 3;
                    ctx.beginPath(); ctx.ellipse(0, 0, d.size, d.size * 0.7, 0, 0, Math.PI * 2); ctx.fill();
                    // Moss highlight
                    ctx.fillStyle = '#4a5d23'; ctx.globalAlpha = d.opacity * 2;
                    ctx.beginPath(); ctx.ellipse(-d.size/4, -d.size/4, d.size/2, d.size/4, 0.5, 0, Math.PI * 2); ctx.fill();
                    ctx.restore();
                } else if (d.type === 'wet_log') {
                    // Dark wooden log
                    ctx.save();
                    ctx.translate(d.x, d.y); ctx.rotate(d.phase);
                    ctx.fillStyle = d.color; ctx.globalAlpha = d.opacity * 2.5;
                    ctx.beginPath(); ctx.roundRect(-d.size, -d.size/4, d.size*2, d.size/2, 4); ctx.fill();
                    // Grain lines
                    ctx.strokeStyle = 'rgba(255,255,255,0.03)'; ctx.lineWidth = 1;
                    ctx.beginPath(); ctx.moveTo(-d.size, 0); ctx.lineTo(d.size, 0); ctx.stroke();
                    ctx.restore();
                } else if (d.type === 'mud') {
                    // Dark Mud patch
                    ctx.fillStyle = d.color; ctx.globalAlpha = d.opacity;
                    ctx.beginPath(); ctx.ellipse(d.x, d.y, d.size, d.size/1.5, d.phase, 0, Math.PI * 2); ctx.fill();
                } else {
                    // Rising Bubble
                    const pulse = Math.sin(renderTime * 0.005 + d.phase) * 0.5 + 0.5;
                    ctx.strokeStyle = 'rgba(255,255,255,0.1)'; ctx.lineWidth = 1;
                    ctx.beginPath(); ctx.arc(d.x, d.y, d.size * pulse, 0, Math.PI * 2); ctx.stroke();
                }
            });
            ctx.restore();

            // 1.5 Dynamic Ripples
            ctx.save();
            ripples.forEach((r, idx) => {
                r.life -= 0.015;
                r.size += 1.5;
                if (r.life <= 0) { ripples.splice(idx, 1); return; }
                
                if (r.x > camera.x - 50 && r.x < camera.x + canvas.width + 50 && r.y > camera.y - 50 && r.y < camera.y + canvas.height + 50) {
                    ctx.strokeStyle = `rgba(255, 255, 255, ${r.life * 0.2})`;
                    ctx.lineWidth = 1.5;
                    ctx.beginPath();
                    ctx.arc(r.x, r.y, r.size, 0, Math.PI * 2);
                    ctx.stroke();
                }
            });
            ctx.restore();

            // 1.6 Dragonflies
            if (dragonflies.length === 0) {
                for (let i = 0; i < 25; i++) {
                    dragonflies.push({
                        x: Math.random() * worldSize, y: Math.random() * worldSize,
                        vx: 0, vy: 0,
                        angle: Math.random() * Math.PI * 2,
                        targetAngle: Math.random() * Math.PI * 2,
                        speed: 2 + Math.random() * 3,
                        wait: 0,
                        color: `hsl(${180 + Math.random() * 60}, 70%, 60%)`
                    });
                }
            }

            const me = gameState.players.find(p => p.id === myId);
            dragonflies.forEach(df => {
                if (df.wait > 0) {
                    df.wait--;
                    if (df.wait === 0) df.targetAngle = Math.random() * Math.PI * 2;
                } else {
                    df.angle = lerpAngle(df.angle, df.targetAngle, 0.1);
                    df.x += Math.cos(df.angle) * df.speed;
                    df.y += Math.sin(df.angle) * df.speed;
                    if (Math.random() > 0.98) df.wait = 30 + Math.random() * 60;
                }

                // React to player
                if (me) {
                    const dist = Math.hypot(me.x - df.x, me.y - df.y);
                    if (dist < 150) {
                        df.targetAngle = Math.atan2(df.y - me.y, df.x - me.x);
                        df.wait = 0;
                        df.speed = 8;
                    } else {
                        df.speed = lerp(df.speed, 3, 0.05);
                    }
                }

                // Keep in bounds
                if (df.x < 0 || df.x > worldSize || df.y < 0 || df.y > worldSize) {
                    df.targetAngle = Math.atan2(worldSize/2 - df.y, worldSize/2 - df.x);
                }

                if (df.x > camera.x - 20 && df.x < camera.x + canvas.width + 20 && 
                    df.y > camera.y - 20 && df.y < camera.y + canvas.height + 20) {
                    ctx.save();
                    ctx.translate(df.x, df.y);
                    ctx.rotate(df.angle);
                    
                    // Wings (Blurred motion)
                    ctx.fillStyle = 'rgba(200, 255, 255, 0.3)';
                    const wingSpread = Math.sin(renderTime * 0.1) * 10;
                    ctx.beginPath();
                    ctx.ellipse(0, -2, 8, 2, -0.2 + wingSpread * 0.01, 0, Math.PI * 2);
                    ctx.ellipse(0, 2, 8, 2, 0.2 - wingSpread * 0.01, 0, Math.PI * 2);
                    ctx.fill();

                    // Body
                    ctx.fillStyle = df.color;
                    ctx.beginPath();
                    ctx.ellipse(0, 0, 5, 1, 0, 0, Math.PI * 2);
                    ctx.fill();
                    
                    ctx.restore();
                }
            });

            // 2. Fireflies (Lively particles with trails)
            ctx.save();
            for (let i = 0; i < 40; i++) {
                const fx = (Math.sin(renderTime * 0.0005 + i) * 0.5 + 0.5) * worldSize;
                const fy = (Math.cos(renderTime * 0.0007 + i * 2) * 0.5 + 0.5) * worldSize;
                
                if (fx > camera.x && fx < camera.x + canvas.width && fy > camera.y && fy < camera.y + canvas.height) {
                    const glow = 0.5 + Math.sin(renderTime * 0.01 + i) * 0.5;
                    ctx.shadowBlur = 15 * glow;
                    ctx.shadowColor = '#aaff00';
                    ctx.fillStyle = `rgba(170, 255, 0, ${0.6 * glow})`;
                    ctx.beginPath(); ctx.arc(fx, fy, 2, 0, Math.PI * 2); ctx.fill();
                    
                    // Tiny trail
                    if (ENABLE_PREMIUM_VISUALS && renderTime % 5 < 1) {
                        particles.push({
                            x: fx, y: fy, vx: (Math.random()-0.5)*0.5, vy: (Math.random()-0.5)*0.5,
                            life: 0.5, color: 'rgba(170, 255, 0, 0.3)', size: 1
                        });
                    }
                }
            }
            ctx.restore();

            // 3. Murky Fog/Mist (Enhanced)
            ctx.save();
            ctx.globalCompositeOperation = 'screen';
            // Layer 1: Dark Outer Mist
            const mistGrad1 = ctx.createRadialGradient(camera.x + canvas.width/2, camera.y + canvas.height/2, 200, camera.x + canvas.width/2, camera.y + canvas.height/2, 1000);
            mistGrad1.addColorStop(0, 'rgba(40, 60, 40, 0)');
            mistGrad1.addColorStop(1, 'rgba(10, 25, 10, 0.2)');
            ctx.fillStyle = mistGrad1;
            ctx.fillRect(camera.x, camera.y, canvas.width, canvas.height);
            
            // Layer 2: Moving Mist patches
            for (let i = 0; i < 3; i++) {
                const mx = (camera.x + canvas.width/2) + Math.sin(renderTime * 0.0006 + i) * 400;
                const my = (camera.y + canvas.height/2) + Math.cos(renderTime * 0.0004 + i) * 300;
                const mGrad = ctx.createRadialGradient(mx, my, 0, mx, my, 500);
                mGrad.addColorStop(0, 'rgba(80, 110, 80, 0.08)');
                mGrad.addColorStop(1, 'rgba(0,0,0,0)');
                ctx.fillStyle = mGrad;
                ctx.fillRect(camera.x, camera.y, canvas.width, canvas.height);
            }
            ctx.restore();

            // 4. Swamp Drips (Occasional ripples)
            if (Math.random() > 0.985) {
                ripples.push({
                    x: camera.x + Math.random() * canvas.width,
                    y: camera.y + Math.random() * canvas.height,
                    size: 2,
                    life: 0.8
                });
            }
        }
    } else {
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.02)'; ctx.lineWidth = 1;
        const startX = Math.max(0, Math.floor(camera.x / gridSize) * gridSize), endX = Math.min(worldSize, Math.ceil((camera.x + canvas.width) / gridSize) * gridSize);
        const startY = Math.max(0, Math.floor(camera.y / gridSize) * gridSize), endY = Math.min(worldSize, Math.ceil((camera.y + canvas.height) / gridSize) * gridSize);
        ctx.beginPath();
        for (let x = startX; x <= endX; x += gridSize) { ctx.moveTo(x, startY); ctx.lineTo(x, endY); }
        for (let y = startY; y <= endY; y += gridSize) { ctx.moveTo(startX, y); ctx.lineTo(endX, y); }
        ctx.stroke();
    }
}



function interpolateState(dt) {
    const P = 1 - Math.pow(0.75, dt); // frame-rate independent lerp (~0.25 at 60fps)

    gameState.bullets   = serverState.bullets;
    gameState.elements  = serverState.elements;
    gameState.guardians = serverState.guardians;
    gameState.zones     = serverState.zones ? serverState.zones.map(z => ({ ...z, type: z.t || z.type })) : [];
    gameState.worldSize = serverState.worldSize || 4000;

    const P_POS = 1 - Math.pow(0.4, dt); // Softer interpolation to hide minor jitter
    gameState.players = serverState.players.map(sp => {
        // Map short keys to descriptive keys for rendering logic
        if (sp.u) sp.username = sp.u;
        if (sp.mh) sp.maxHp = sp.mh;
        if (sp.h) sp.hp = sp.h;

        const gp = gameState.players.find(p => p.id === sp.id);
        if (!gp) return { ...sp };
        
        if (sp.id === myId) {
            // CLIENT-SIDE PREDICTION & RECONCILIATION
            // 1. Remove inputs already processed by server
            pendingInputs = pendingInputs.filter(i => i.seq > sp.seq);
            
            // 2. Start from server authoritative state
            let pX = sp.x;
            let pY = sp.y;
            let pA = sp.a;
            let pVx = sp.v ? sp.v[0] : 0;
            let pVy = sp.v ? sp.v[1] : 0;
            let pAv = sp.v ? sp.v[2] : 0;
            
            // 3. Re-apply all pending inputs using server's force model
            const config = CHASSIS[sp.ch] || CHASSIS.SCOUT;
            const zone = (serverState.zones && serverState.zones[0]) || { type: 'URBAN' };
            const biome = BIOMES[zone.type] || BIOMES.URBAN;
            
            pendingInputs.forEach(input => {
                const speedBonus = 1 + ((sp.up?.speed || 0) * 0.15);
                const slowMult = sp.slw ? 0.5 : (sp.qs ? 0.3 : 1.0);
                const moveSpeed = config.speed * (biome.speedMult || 1.0) * slowMult * speedBonus;
                const turnSpeed = config.turnSpeed * (sp.slw ? 0.6 : (sp.qs ? 0.4 : 1.0)) * speedBonus;
                
                // Rotation (Acceleration model - matches server 0.3 lerp)
                const targetAv = input.left ? -turnSpeed : (input.right ? turnSpeed : 0);
                pAv += (targetAv - pAv) * 0.3;
                pA += pAv;

                // Movement (Force model)
                let fx = 0, fy = 0;
                if (input.up) {
                    fx += Math.cos(pA) * moveSpeed;
                    fy += Math.sin(pA) * moveSpeed;
                }
                if (input.down) {
                    fx -= Math.cos(pA) * moveSpeed;
                    fy -= Math.sin(pA) * moveSpeed;
                }
                
                // Apply force & friction (Simplified Matter.js integration)
                pVx += fx / (config.mass || 1);
                pVy += fy / (config.mass || 1);
                
                const friction = 1 - (biome.friction || 0.15);
                pVx *= friction;
                pVy *= friction;

                pX += pVx;
                pY += pVy;
            });

            return {
                ...sp,
                x: lerp(gp.x, pX, P_POS),
                y: lerp(gp.y, pY, P_POS),
                a: lerpAngle(gp.a, pA, P_POS),
                aa: keys.aimAngle // Instant local turret (Zero smoothing)
            };
        } else {
            // Standard Interpolation for other players
            const P_OTHER = 1 - Math.pow(0.75, dt);
            return {
                ...sp,
                x: lerp(gp.x, sp.x, P_OTHER),
                y: lerp(gp.y, sp.y, P_OTHER),
                a: lerpAngle(gp.a, sp.a, P_OTHER),
                aa: lerpAngle(gp.aa !== undefined ? gp.aa : gp.a, sp.aa !== undefined ? sp.aa : sp.a, P_OTHER)
            };
        }
    });

    if (isShopOpen) updateShopUI();

    // Label Avoidance Pre-pass (STRICTER)
    const sorted = [...gameState.players].sort((a, b) => a.y - b.y);
    sorted.forEach((p, i) => {
        p.labelYOffset = 0;
        for (let j = 0; j < i; j++) {
            const other = sorted[j];
            const dx = Math.abs(p.x - other.x);
            const dy = Math.abs(p.y - other.y);
            // Stricter overlap detection
            if (dx < 100 && dy < 50) {
                p.labelYOffset = Math.max(p.labelYOffset, (other.labelYOffset || 0) + 22);
            }
        }
    });
}



// Helper to draw the complex organic path (Used by liquids and gas)
const drawOrganicPath = (ctx, x, y, radius, id) => {
    ctx.beginPath();
    ctx.arc(x, y, radius, 0, Math.PI * 2);
    const blobCount = 4;
    for (let i = 0; i < blobCount; i++) {
        const seed = id * 1.37 + i * 2.41;
        const angle = getStableRandom(seed) * Math.PI * 2;
        const dist = radius * 0.45;
        const bx = x + Math.cos(angle) * dist;
        const by = y + Math.sin(angle) * dist;
        const br = radius * (0.5 + getStableRandom(seed + 0.5) * 0.3);
        ctx.moveTo(bx + br, by);
        ctx.arc(bx, by, br, 0, Math.PI * 2);
    }
};

function drawElements() {
    if (!gameState.elements) return;
    const currentBiome = gameState.zones && gameState.zones[0] ? gameState.zones[0].type : 'RANDOM';
    const isWasteland = currentBiome === 'WASTELAND';
    const isIndustrial = currentBiome === 'INDUSTRIAL';
    const isWetland = currentBiome === 'WETLAND';
    const isTundra = currentBiome === 'TUNDRA';

    gameState.elements.forEach(e => {
        // CULLING: Skip off-screen elements
        if (!isRectInView(e.x, e.y, e.w || 50, e.h || 50, 200)) return;

        ctx.save();
        const config = MATERIAL_PROPERTIES[e.t] || { color: '#fff' };
        
        if (e.t === MATERIALS.BUILDING) {
            const isIndustrial = currentBiome === 'INDUSTRIAL';
            const isWasteland = currentBiome === 'WASTELAND';
            const isTundra = currentBiome === 'TUNDRA';
            const isWetland = currentBiome === 'WETLAND';
            const isUrban = currentBiome === 'URBAN';
            const isDesert = currentBiome === 'DESERT';

            // 1. Building Shadow (Deep Depth - Warmer for Desert)
            ctx.fillStyle = isDesert ? 'rgba(61, 43, 31, 0.6)' : 'rgba(0, 0, 0, 0.5)';
            ctx.beginPath();
            if (isIndustrial && e.sh === 'circle') ctx.ellipse(e.x + 10, e.y + 10, e.w/2, e.h/2, 0, 0, Math.PI * 2);
            else ctx.roundRect(e.x - e.w/2 + 8, e.y - e.h/2 + 8, e.w, e.h, 6);
            ctx.fill();

            // 2. Main Building Body with Gradient
            const bGradient = isIndustrial && e.sh === 'circle' ? 
                ctx.createRadialGradient(e.x - e.w/4, e.y - e.h/4, 0, e.x, e.y, e.w/2) :
                ctx.createLinearGradient(e.x, e.y - e.h/2, e.x, e.y + e.h/2);

            if (isWasteland) { bGradient.addColorStop(0, '#3a2a1a'); bGradient.addColorStop(1, '#1a100a'); }
            else if (isIndustrial) {
                if (e.sh === 'circle') { 
                    // High-Fidelity Cylindrical Shading
                    bGradient.addColorStop(0, '#4a4a5a'); 
                    bGradient.addColorStop(0.3, '#2a2a35'); 
                    bGradient.addColorStop(0.5, '#666'); // Metal Highlight
                    bGradient.addColorStop(0.7, '#1a1a25');
                    bGradient.addColorStop(1, '#020205'); 
                }
                else { 
                    bGradient.addColorStop(0, '#2a2a35'); 
                    bGradient.addColorStop(1, '#08080f'); 
                }
            } else if (isUrban) { bGradient.addColorStop(0, '#10101a'); bGradient.addColorStop(1, '#020205'); }
            else if (isTundra) { bGradient.addColorStop(0, '#3a4a5a'); bGradient.addColorStop(1, '#050c12'); }
            else if (isDesert) { bGradient.addColorStop(0, '#c2b280'); bGradient.addColorStop(0.4, '#a68a64'); bGradient.addColorStop(1, '#7a5c43'); }
            else if (isWetland) { bGradient.addColorStop(0, '#2d1a0f'); bGradient.addColorStop(1, '#0d0805'); }
            else { bGradient.addColorStop(0, '#252535'); bGradient.addColorStop(1, '#151520'); }
            
            ctx.fillStyle = bGradient;
            ctx.strokeStyle = isWasteland ? 'rgba(150, 80, 50, 0.5)' : (isIndustrial ? '#333' : (isTundra ? 'rgba(200, 240, 255, 0.6)' : (isDesert ? '#5d4a37' : (isWetland ? '#1a2a1a' : 'rgba(0, 242, 255, 0.6)'))));
            ctx.lineWidth = 2;
            ctx.beginPath();
            if (e.sh === 'pyramid') {
                ctx.rect(e.x - e.w/2, e.y - e.h/2, e.w, e.h);
            } else if (e.sh === 'circle') {
                if (isWasteland) {
                    for (let i = 0; i < 16; i++) {
                        const angle = (i / 16) * Math.PI * 2;
                        const dist = (e.w/2) * (0.95 + getStableRandom(e.id + i) * 0.1);
                        if (i === 0) ctx.moveTo(e.x + Math.cos(angle) * dist, e.y + Math.sin(angle) * dist);
                        else ctx.lineTo(e.x + Math.cos(angle) * dist, e.y + Math.sin(angle) * dist);
                    }
                    ctx.closePath();
                } else {
                    ctx.ellipse(e.x, e.y, e.w/2, e.h/2, 0, 0, Math.PI * 2);
                }
            } else if (isWasteland) {
                // Jagged Broken Building Shape
                const seed = e.id;
                ctx.moveTo(e.x - e.w/2 + getStableRandom(seed) * 15, e.y - e.h/2 + getStableRandom(seed + 1) * 15);
                ctx.lineTo(e.x + e.w/2 - getStableRandom(seed + 2) * 15, e.y - e.h/2 + getStableRandom(seed + 3) * 15);
                ctx.lineTo(e.x + e.w/2 - getStableRandom(seed + 4) * 15, e.y + e.h/2 - getStableRandom(seed + 5) * 15);
                ctx.lineTo(e.x - e.w/2 + getStableRandom(seed + 6) * 15, e.y + e.h/2 - getStableRandom(seed + 7) * 15);
                ctx.closePath();
            } else {
                ctx.roundRect(e.x - e.w/2, e.y - e.h/2, e.w, e.h, 6);
            }
            ctx.fill();
            ctx.stroke();

            // Pyramid Facets (Visual only)
            if (e.sh === 'pyramid') {
                ctx.strokeStyle = 'rgba(0,0,0,0.15)'; ctx.lineWidth = 1;
                ctx.beginPath();
                ctx.moveTo(e.x - e.w/2, e.y - e.h/2); ctx.lineTo(e.x + e.w/2, e.y + e.h/2);
                ctx.moveTo(e.x + e.w/2, e.y - e.h/2); ctx.lineTo(e.x - e.w/2, e.y + e.h/2);
                ctx.stroke();
            }

            // Internal Fire Glow (Wasteland)
            if (isWasteland && ENABLE_PREMIUM_VISUALS) {
                const firePulse = 0.4 + Math.sin(renderTime * 0.003 + e.id) * 0.3;
                const fg = ctx.createRadialGradient(e.x, e.y, 0, e.x, e.y, e.w * 0.7);
                fg.addColorStop(0, `rgba(255, 100, 0, ${firePulse * 0.3})`);
                fg.addColorStop(1, 'rgba(0,0,0,0)');
                ctx.fillStyle = fg;
                ctx.fill(); // Fill the same path again with glow
            }

            // 3. Interior Details (Clipped)
            ctx.save();
            ctx.beginPath();
            if (e.sh === 'pyramid') {
                ctx.rect(e.x - e.w/2, e.y - e.h/2, e.w, e.h);
            } else if (e.sh === 'circle') {
                if (isWasteland) {
                    for (let i = 0; i < 16; i++) {
                        const angle = (i / 16) * Math.PI * 2;
                        const dist = (e.w/2) * (0.95 + getStableRandom(e.id + i) * 0.1);
                        if (i === 0) ctx.moveTo(e.x + Math.cos(angle) * dist, e.y + Math.sin(angle) * dist);
                        else ctx.lineTo(e.x + Math.cos(angle) * dist, e.y + Math.sin(angle) * dist);
                    }
                    ctx.closePath();
                } else {
                    ctx.ellipse(e.x, e.y, e.w/2, e.h/2, 0, 0, Math.PI * 2);
                }
            } else if (isWasteland) {
                // Same jagged path for clipping
                const seed = e.id;
                ctx.moveTo(e.x - e.w/2, e.y - e.h/2);
                if (getStableRandom(seed) > 0.3) { ctx.lineTo(e.x - e.w/4, e.y - e.h/2 + 5); ctx.lineTo(e.x, e.y - e.h/2 - 2); }
                ctx.lineTo(e.x + e.w/2, e.y - e.h/2);
                if (getStableRandom(seed + 1) > 0.5) { ctx.lineTo(e.x + e.w/2 - 5, e.y); }
                ctx.lineTo(e.x + e.w/2, e.y + e.h/2);
                ctx.lineTo(e.x - e.w/2, e.y + e.h/2);
                if (getStableRandom(seed + 2) > 0.6) { ctx.lineTo(e.x - e.w/2 + 8, e.y + 10); }
                ctx.closePath();
            } else {
                ctx.roundRect(e.x - e.w/2, e.y - e.h/2, e.w, e.h, 4);
            }
            ctx.clip();

            // A. Industrial Interior (Machinery, Pipes, Rivets)
            if (isIndustrial && ENABLE_PREMIUM_VISUALS) {
                // 1. Structural Bulkheads
                ctx.strokeStyle = '#111'; ctx.lineWidth = 8;
                ctx.beginPath(); ctx.moveTo(e.x - e.w/2, e.y); ctx.lineTo(e.x + e.w/2, e.y); ctx.stroke();
                
                // 2. Pipes & Rivets
                ctx.strokeStyle = '#222'; ctx.lineWidth = 6;
                const pipeX = e.sh === 'circle' ? e.x - e.w/3 : e.x - e.w/2 + 12;
                ctx.beginPath(); ctx.moveTo(pipeX, e.y - e.h/2); ctx.lineTo(pipeX, e.y + e.h/2); ctx.stroke();
                ctx.fillStyle = 'rgba(255,255,255,0.15)';
                for (let ry = -e.h/2 + 20; ry < e.h/2; ry += 35) { ctx.beginPath(); ctx.arc(pipeX, e.y + ry, 2.5, 0, Math.PI*2); ctx.fill(); }

                // 3. Rotating Gears (Visual Depth)
                if (e.w > 80 && e.id % 2 === 0) {
                    ctx.save(); ctx.translate(e.x - e.w/4, e.y + e.h/4); ctx.rotate(renderTime * 0.001);
                    ctx.fillStyle = '#222'; ctx.strokeStyle = '#333'; ctx.lineWidth = 2;
                    ctx.beginPath();
                    for(let i=0; i<12; i++) {
                        const a = i * Math.PI/6;
                        const r = i%2===0 ? 15 : 10;
                        ctx.lineTo(Math.cos(a)*r, Math.sin(a)*r);
                    }
                    ctx.closePath(); ctx.fill(); ctx.stroke();
                    ctx.restore();
                }

                // 4. Improved Ventilation Fans
                if (e.w > 60) {
                    ctx.save(); ctx.translate(e.x + e.w/4, e.y - e.h/4);
                    // Fan Housing
                    ctx.fillStyle = '#0a0a0c'; ctx.beginPath(); ctx.arc(0,0, 15, 0, Math.PI*2); ctx.fill();
                    ctx.rotate(renderTime * 0.008);
                    ctx.strokeStyle = '#666'; ctx.lineWidth = 4;
                    for (let i=0; i<4; i++) { 
                        ctx.rotate(Math.PI/2); 
                        ctx.beginPath(); ctx.moveTo(0,0); ctx.lineTo(12, 0); ctx.stroke(); 
                        // Motion Blur
                        ctx.globalAlpha = 0.3; ctx.lineWidth = 2;
                        ctx.beginPath(); ctx.moveTo(0,0); ctx.lineTo(14, 4); ctx.stroke();
                        ctx.globalAlpha = 1.0; ctx.lineWidth = 4;
                    }
                    ctx.restore();
                }

                // 5. Cooling Fins
                ctx.strokeStyle = 'rgba(255,255,255,0.05)'; ctx.lineWidth = 1;
                for (let fy = -e.h/2 + 20; fy < e.h/2 - 20; fy += 10) {
                    ctx.beginPath(); ctx.moveTo(e.x - e.w/4, e.y + fy); ctx.lineTo(e.x + e.w/4, e.y + fy); ctx.stroke();
                }

                // 6. Laser Scanner (Rotating)
                const laserAngle = renderTime * 0.002 + e.id;
                ctx.strokeStyle = 'rgba(255, 0, 0, 0.4)'; ctx.lineWidth = 1.5;
                ctx.beginPath();
                ctx.moveTo(e.x + e.w/2, e.y - e.h/2);
                ctx.lineTo(e.x + e.w/2 + Math.cos(laserAngle)*40, e.y - e.h/2 + Math.sin(laserAngle)*40);
                ctx.stroke();
                // Scanner Head
                ctx.fillStyle = '#ff0000'; ctx.beginPath(); ctx.arc(e.x + e.w/2, e.y - e.h/2, 3, 0, Math.PI*2); ctx.fill();
            }

            // B. Urban Neon Windows
            if (isUrban && ENABLE_PREMIUM_VISUALS) {
                const winSize = 6; 
                const spacingX = 16; // Increased spacing to spread out
                const spacingY = 22;
                const cols = Math.floor((e.w - 15) / spacingX); 
                const rows = Math.floor((e.h - 15) / spacingY);
                
                ctx.save();
                for (let r = 0; r < rows; r++) {
                    for (let c = 0; c < cols; c++) {
                        // User Request: Halve the windows, spread evenly.
                        // We use a checkerboard pattern or skip every other one.
                        if ((r + c) % 2 === 0) continue; 

                        const seed = e.id + r * 13 + c * 7;
                        const rand = getStableRandom(seed);
                        if (rand > 0.3) {
                            const wx = e.x - e.w/2 + 10 + c * spacingX; 
                            const wy = e.y - e.h/2 + 10 + r * spacingY;
                            
                            let winColor = '#000';
                            let alpha = 0.8;
                            let glow = false;

                            if (rand > 0.85) { // Office
                                winColor = '#b0e0ff'; glow = true;
                            } else if (rand > 0.7) { // Residential
                                winColor = '#ffcc66'; glow = true;
                            } else if (rand > 0.6) { // TV Glow
                                winColor = Math.sin(renderTime * 0.01 + seed) > 0 ? '#66ccff' : '#336699';
                                alpha = 0.5 + Math.random() * 0.2;
                                glow = true;
                            }

                            if (winColor !== '#000') {
                                ctx.globalAlpha = alpha;
                                ctx.fillStyle = winColor;
                                // PERFORMANCE FIX: Remove shadowBlur, use a small glow rect instead
                                if (glow) {
                                    ctx.globalAlpha = alpha * 0.3;
                                    ctx.fillRect(wx - 2, wy - 2, winSize + 4, winSize + 4);
                                    ctx.globalAlpha = alpha;
                                }
                                ctx.fillRect(wx, wy, winSize, winSize);
                            }
                        }
                    }
                }
                ctx.restore();

                // C. Urban Rooftop Modules (AC units, Water tanks)
                if (e.w > 60 && e.h > 60) {
                    const roofSeed = e.id * 1.5;
                    ctx.save();
                    // AC Unit
                    ctx.fillStyle = '#222'; ctx.strokeStyle = '#333'; ctx.lineWidth = 1;
                    const acX = e.x + e.w/4; const acY = e.y + e.h/4;
                    ctx.fillRect(acX - 10, acY - 10, 20, 20);
                    ctx.strokeRect(acX - 10, acY - 10, 20, 20);
                    // Fan on AC
                    ctx.beginPath(); ctx.arc(acX, acY, 6, 0, Math.PI*2); ctx.stroke();
                    
                    // Water Tank (Visual circle)
                    if (getStableRandom(roofSeed) > 0.6) {
                        ctx.fillStyle = '#111'; ctx.strokeStyle = '#222';
                        const tankX = e.x - e.w/4; const tankY = e.y - e.h/4;
                        ctx.beginPath(); ctx.arc(tankX, tankY, 12, 0, Math.PI*2); ctx.fill(); ctx.stroke();
                        ctx.beginPath(); ctx.moveTo(tankX - 12, tankY); ctx.lineTo(tankX + 12, tankY); ctx.stroke();
                        ctx.beginPath(); ctx.moveTo(tankX, tankY - 12); ctx.lineTo(tankX, tankY + 12); ctx.stroke();
                    }
                    ctx.restore();
                }
            }

            // C. Desert Adobe + Pyramid Interior Details
            if (isDesert && ENABLE_PREMIUM_VISUALS) {
                if (e.sh === 'pyramid') {
                    // Pyramid Interior: Hieroglyphs & Stone Blocks
                    // Stone block grid
                    ctx.strokeStyle = 'rgba(0,0,0,0.12)'; ctx.lineWidth = 1;
                    const blockH = 12;
                    for (let by = e.y - e.h/2; by < e.y + e.h/2; by += blockH) {
                        ctx.beginPath(); ctx.moveTo(e.x - e.w/2, by); ctx.lineTo(e.x + e.w/2, by); ctx.stroke();
                        // Offset horizontal joints for brick pattern
                        const offset = ((by / blockH) % 2 === 0) ? 0 : 15;
                        for (let bx = e.x - e.w/2 + offset; bx < e.x + e.w/2; bx += 30) {
                            ctx.beginPath(); ctx.moveTo(bx, by); ctx.lineTo(bx, by + blockH); ctx.stroke();
                        }
                    }
                    // Hieroglyph symbols (simple geometric marks)
                    ctx.fillStyle = 'rgba(0,0,0,0.15)'; ctx.font = '10px monospace'; ctx.textAlign = 'center';
                    const glyphs = ['|', '-', 'O', '+', '\\', '/'];
                    for (let i = 0; i < 6; i++) {
                        const seed = e.id + i * 17;
                        const gx = e.x - e.w/3 + getStableRandom(seed) * (e.w * 0.66);
                        const gy = e.y - e.h/3 + getStableRandom(seed + 1) * (e.h * 0.66);
                        ctx.fillText(glyphs[i], gx, gy);
                    }
                    // Interior Gradient (Dark at top, warm at bottom)
                    const pyIntGrad = ctx.createLinearGradient(e.x, e.y - e.h/2, e.x, e.y + e.h/2);
                    pyIntGrad.addColorStop(0, 'rgba(0,0,0,0.2)');
                    pyIntGrad.addColorStop(1, 'rgba(255, 150, 50, 0.05)');
                    ctx.fillStyle = pyIntGrad;
                    ctx.fillRect(e.x - e.w/2, e.y - e.h/2, e.w, e.h);
                } else {
                    // Adobe Building Interior
                    // 1. Sand-blasted Texture
                    ctx.fillStyle = 'rgba(0,0,0,0.05)';
                    for (let i = 0; i < 20; i++) {
                        const seed = e.id + i * 19;
                        const tx = e.x - e.w/2 + getStableRandom(seed) * e.w;
                        const ty = e.y - e.h/2 + getStableRandom(seed + 1) * e.h;
                        ctx.beginPath(); ctx.arc(tx, ty, 1.5, 0, Math.PI * 2); ctx.fill();
                    }
                    // 2. Adobe Windows (Small, dark, recessed)
                    const winSize = 8; const spacing = 20;
                    ctx.fillStyle = '#2a1a0f';
                    for (let wy = e.y - e.h/2 + 20; wy < e.y + e.h/2 - 10; wy += spacing) {
                        for (let wx = e.x - e.w/2 + 20; wx < e.x + e.w/2 - 10; wx += spacing) {
                            const seed = wx + wy + e.id;
                            if (getStableRandom(seed) > 0.4) {
                                ctx.fillRect(wx, wy, winSize, winSize);
                                ctx.fillStyle = 'rgba(0,0,0,0.3)';
                                ctx.fillRect(wx, wy, winSize, 2);
                                ctx.fillStyle = '#2a1a0f';
                            }
                        }
                    }
                    // 3. Wooden Vigas (Support beams)
                    ctx.fillStyle = '#3d2b1f';
                    const vigaSize = 4;
                    for (let vx = e.x - e.w/2 + 10; vx < e.x + e.w/2 - 5; vx += 15) {
                        ctx.beginPath(); ctx.arc(vx, e.y - e.h/2 + 10, vigaSize, 0, Math.PI * 2); ctx.fill();
                        ctx.fillStyle = 'rgba(0,0,0,0.4)';
                        ctx.beginPath(); ctx.arc(vx, e.y - e.h/2 + 11, vigaSize, 0, Math.PI * 2); ctx.fill();
                        ctx.fillStyle = '#3d2b1f';
                    }
                }
            }

            // D. Wasteland Scrap Ruins (Corrugated Metal, Rust, Scaffolding)
            if (isWasteland && ENABLE_PREMIUM_VISUALS) {
                // 1. Corrugated Metal Texture
                ctx.strokeStyle = 'rgba(0,0,0,0.1)'; ctx.lineWidth = 1;
                for (let i = 8; i < e.w; i += 8) {
                    ctx.beginPath(); ctx.moveTo(e.x - e.w/2 + i, e.y - e.h/2); ctx.lineTo(e.x - e.w/2 + i, e.y + e.h/2); ctx.stroke();
                }
                
                // 2. Rust patches
                ctx.fillStyle = 'rgba(139, 69, 19, 0.2)';
                for (let i = 0; i < 5; i++) {
                    const seed = e.id + i;
                    const rx = e.x - e.w/2 + getStableRandom(seed) * e.w;
                    const ry = e.y - e.h/2 + getStableRandom(seed + 1) * e.h;
                    ctx.beginPath(); ctx.arc(rx, ry, 10, 0, Math.PI * 2); ctx.fill();
                }

                // 3. Scaffolding / External Pipes
                ctx.strokeStyle = '#333'; ctx.lineWidth = 3;
                ctx.beginPath();
                ctx.moveTo(e.x - e.w/2 - 2, e.y - e.h/2 + 10);
                ctx.lineTo(e.x - e.w/2 - 2, e.y + e.h/2 - 10);
                ctx.stroke();
                // Rivets on pipes
                ctx.fillStyle = '#555';
                for (let py = -e.h/2 + 20; py < e.h/2 - 10; py += 30) {
                    ctx.beginPath(); ctx.arc(e.x - e.w/2 - 2, e.y + py, 2, 0, Math.PI * 2); ctx.fill();
                }

                // 4. Exposed Rebar (Bent metal rods)
                ctx.strokeStyle = '#444'; ctx.lineWidth = 1.5;
                for (let i = 0; i < 2; i++) {
                    const seed = e.id + i * 50;
                    if (getStableRandom(seed) > 0.5) {
                        const rx = e.x + (i === 0 ? -e.w/2 : e.w/2);
                        const ry = e.y - e.h/2 + 15;
                        ctx.beginPath();
                        ctx.moveTo(rx, ry);
                        ctx.quadraticCurveTo(rx + (i === 0 ? -10 : 10), ry - 10, rx + (i === 0 ? -5 : 5), ry - 20);
                        ctx.stroke();
                    }
                }

                // 5. Flickering Scrap Sign
                if (e.w > 50 && e.id % 4 === 0) {
                    const flick = Math.random() > 0.9 ? 0 : (0.4 + Math.sin(renderTime * 0.01 + e.id) * 0.3);
                    if (flick > 0) {
                        ctx.save();
                        ctx.translate(e.x, e.y - e.h/4);
                        ctx.fillStyle = '#222'; ctx.fillRect(-15, -8, 30, 16); 
                        ctx.strokeStyle = '#444'; ctx.lineWidth = 1; ctx.strokeRect(-15, -8, 30, 16);
                        ctx.fillStyle = `rgba(255, 100, 0, ${flick})`;
                        ctx.shadowBlur = 10 * flick; ctx.shadowColor = '#ff6600';
                        ctx.font = 'bold 8px Courier';
                        ctx.textAlign = 'center';
                        ctx.fillText('HOT', 0, 3);
                        ctx.restore();
                    }
                }
            }

            // F. Wetland Swamp Shack Details (Moss, Vines, Stilts)
            if (isWetland && ENABLE_PREMIUM_VISUALS) {
                // 1. Moss Patches
                ctx.fillStyle = 'rgba(40, 80, 40, 0.3)';
                for (let i = 0; i < 4; i++) {
                    const seed = e.id + i * 11;
                    const mx = e.x - e.w/2 + getStableRandom(seed) * e.w;
                    const my = e.y - e.h/2 + getStableRandom(seed + 1) * e.h;
                    ctx.beginPath(); ctx.ellipse(mx, my, 12, 6, getStableRandom(seed + 2) * Math.PI, 0, Math.PI * 2); ctx.fill();
                }

                // 2. Hanging Vines
                ctx.strokeStyle = 'rgba(60, 100, 60, 0.5)'; ctx.lineWidth = 2;
                for (let i = 0; i < 3; i++) {
                    const seed = e.id + i * 23;
                    const vx = e.x - e.w/2 + 10 + getStableRandom(seed) * (e.w - 20);
                    const vy = e.y - e.h/2;
                    const vLen = 15 + getStableRandom(seed + 1) * 20;
                    ctx.beginPath();
                    ctx.moveTo(vx, vy);
                    ctx.quadraticCurveTo(vx + Math.sin(renderTime * 0.002 + i) * 5, vy + vLen/2, vx, vy + vLen);
                    ctx.stroke();
                }

                // 3. Wooden Stilts (Corner support beams)
                ctx.fillStyle = '#1a0d05';
                const stiltW = 6;
                ctx.fillRect(e.x - e.w/2 - 2, e.y - e.h/2, stiltW, e.h); // Left stilt
                ctx.fillRect(e.x + e.w/2 - stiltW + 2, e.y - e.h/2, stiltW, e.h); // Right stilt
                
                // Horizontal reinforcement
                ctx.fillRect(e.x - e.w/2, e.y + e.h/4, e.w, 4);
            }

            // G. Fallback Windows (Tundra, Default)
            if (!isIndustrial && !isUrban && !isDesert && !isWasteland && !isWetland) {
                const winSpacingX = 15; const winSpacingY = 18;
                for (let wx = e.x - e.w/2 + 15; wx < e.x + e.w/2 - 10; wx += winSpacingX) {
                    for (let wy = e.y - e.h/2 + 15; wy < e.y + e.h/2 - 10; wy += winSpacingY) {
                        if ((Math.floor(wx * 0.7 + wy * 1.3 + e.id)) % 6 > (isWasteland ? 5 : 4)) {
                            ctx.fillStyle = isTundra ? 'rgba(150, 220, 255, 0.3)' : (isWasteland ? 'rgba(255, 150, 50, 0.2)' : 'rgba(255, 240, 150, 0.3)');
                            ctx.fillRect(wx, wy, 6, 6);
                        }
                    }
                }
            }
            ctx.restore(); // END CLIPPING

            // 4. Exterior Details (Drawn outside clipping)
            // Neon Signs
            if (e.id % 5 === 0 && !isWetland) {
                let neonColors = ['#ff00ff', '#00f2ff', '#ffff00', '#ff0000'];
                let texts = ['HOTEL', 'BAR', 'CLUB', 'REPAIR', 'TANK', 'NEON'];
                if (isWasteland) { neonColors = ['#ff5500', '#ff0000', '#aa6600']; texts = ['DEAD', 'LOST', 'VOID', 'RUST']; }
                else if (isIndustrial) { neonColors = ['#00f2ff', '#ffff00', '#55ff00']; texts = ['REACTOR', 'CORE', 'POWER']; }
                else if (isDesert) { neonColors = ['#ff8800', '#ffff00', '#ff0000']; texts = ['OASIS', 'SALOON', 'DUST', 'MIRAGE']; }
                const nColor = neonColors[e.id % neonColors.length]; const text = texts[e.id % texts.length];
                ctx.save(); ctx.translate(e.x, e.y - e.h/2);
                // Draw Support Pole for the sign
                ctx.strokeStyle = '#333'; ctx.lineWidth = 2;
                ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(0, -15); ctx.stroke();
                
                const flicker = isWasteland ? (Math.random() > 0.2 ? (Math.sin(renderTime * 0.05 + e.id) > 0 ? 1 : 0) : 0) : 1;
                if (flicker) { 
                    if (isIndustrial) {
                        // Holographic Projection Effect
                        ctx.globalAlpha = 0.4 + Math.sin(renderTime * 0.01) * 0.2;
                        ctx.shadowBlur = 15; ctx.shadowColor = nColor;
                        ctx.fillStyle = nColor; ctx.font = 'bold 16px Courier';
                        ctx.textAlign = 'center';
                        ctx.fillText(text, 0, -20);
                        // Scanlines
                        ctx.strokeStyle = 'rgba(255,255,255,0.1)'; ctx.lineWidth = 1;
                        for(let sy = -30; sy < -10; sy += 3) {
                            ctx.beginPath(); ctx.moveTo(-20, sy); ctx.lineTo(20, sy); ctx.stroke();
                        }
                    } else {
                        ctx.shadowBlur = 10; ctx.shadowColor = nColor; 
                        ctx.fillStyle = nColor; ctx.font = 'bold 14px Outfit'; 
                        ctx.textAlign = 'center'; 
                        ctx.fillText(text, 0, -20); 
                    }
                }
                ctx.restore();
            }

            // Hazard Stripes (Industrial)
            if (isIndustrial && ENABLE_PREMIUM_VISUALS) {
                ctx.save(); ctx.beginPath();
                if (e.sh === 'circle') ctx.ellipse(e.x, e.y + e.h/2 - 6, e.w/2 + 4, 12, 0, 0, Math.PI * 2);
                else ctx.rect(e.x - e.w/2 - 4, e.y + e.h/2 - 12, e.w + 8, 12);
                ctx.clip();
                for (let sx = e.x - e.w/2 - 40; sx < e.x + e.w/2 + 40; sx += 30) {
                    ctx.fillStyle = '#ffcc00'; ctx.beginPath(); ctx.moveTo(sx, e.y + e.h/2 - 20); ctx.lineTo(sx + 15, e.y + e.h/2 - 20); ctx.lineTo(sx + 5, e.y + e.h/2 + 10); ctx.lineTo(sx - 10, e.y + e.h/2 + 10); ctx.fill();
                    ctx.fillStyle = '#111'; ctx.beginPath(); ctx.moveTo(sx + 15, e.y + e.h/2 - 20); ctx.lineTo(sx + 30, e.y + e.h/2 - 20); ctx.lineTo(sx + 20, e.y + e.h/2 + 10); ctx.lineTo(sx + 5, e.y + e.h/2 + 10); ctx.fill();
                }
                ctx.restore();
            }

            // Desert Roof Details (AC units, Vents)
            if (isDesert && ENABLE_PREMIUM_VISUALS) {
                ctx.save();
                ctx.fillStyle = '#5d4a37'; // Dusty metallic
                const unitSize = 10;
                // Add a small AC unit on the roof
                const ux = e.x + e.w/4; const uy = e.y - e.h/4;
                ctx.fillRect(ux - unitSize/2, uy - unitSize/2, unitSize, unitSize);
                // AC Unit Grille
                ctx.strokeStyle = 'rgba(0,0,0,0.3)'; ctx.lineWidth = 1;
                for(let i=0; i<3; i++) { ctx.beginPath(); ctx.moveTo(ux - 4, uy - 3 + i*3); ctx.lineTo(ux + 4, uy - 3 + i*3); ctx.stroke(); }
                ctx.restore();
            }

            // Tundra Snow & Icicles
            if (isTundra && ENABLE_PREMIUM_VISUALS) {
                ctx.save(); ctx.fillStyle = '#fff'; ctx.globalAlpha = 0.3;
                // Snow on top
                ctx.beginPath(); ctx.roundRect(e.x - e.w/2 + 5, e.y - e.h/2 + 5, e.w - 10, 15, 5); ctx.fill();
                
                // Icicles hanging from edges
                ctx.strokeStyle = 'rgba(200, 240, 255, 0.8)';
                ctx.lineWidth = 2;
                ctx.lineCap = 'round';
                const icicleCount = Math.floor(e.w / 15);
                for (let i = 0; i < icicleCount; i++) {
                    const ix = e.x - e.w/2 + 10 + i * 15 + getStableRandom(e.id + i) * 5;
                    const iy = e.y + e.h/2; // Bottom edge
                    const iLen = 5 + getStableRandom(e.id + i * 2) * 15;
                    ctx.beginPath();
                    ctx.moveTo(ix, iy);
                    ctx.lineTo(ix, iy + iLen);
                    ctx.stroke();
                    // Glint on icicle
                    if (Math.sin(renderTime * 0.003 + i) > 0.8) {
                        ctx.fillStyle = '#fff'; ctx.globalAlpha = 0.8;
                        ctx.beginPath(); ctx.arc(ix, iy + iLen, 1.5, 0, Math.PI * 2); ctx.fill();
                    }
                }
                
                for (let i = 0; i < 3; i++) {
                    const sx = e.x + Math.sin(e.id + i) * (e.w * 0.3); const sy = e.y + Math.cos(e.id + i) * (e.h * 0.3);
                    ctx.beginPath(); ctx.arc(sx, sy, 8, 0, Math.PI * 2); ctx.fill();
                }
                ctx.restore();
            }

            // Smoke & Sparks
            if ((isWasteland || isIndustrial) && ENABLE_PREMIUM_VISUALS) {
                if (e.id % 2 === 0 && Math.random() > 0.94) {
                    particles.push({ x: e.x + (Math.random()-0.5)*20, y: e.y - e.h/2 + 20, vx: (Math.random()-0.5)*0.5 + (windIntensity||0), vy: -1.5 - Math.random()*2, life: 1.2, color: 'rgba(70,70,70,0.4)', size: 8 + Math.random()*12 });
                }
                if (e.id % 3 === 0 && Math.random() > 0.97) {
                    spawnParticles(e.x + (Math.random()-0.5)*e.w, e.y - e.h/2, '#ffffaa', 3, 0.8);
                }
            }
        } else if (e.t === MATERIALS.SCRAP) {
            // Draw Scrap as a rotating gold gear/nut
            ctx.translate(e.x, e.y);
            ctx.rotate(Date.now() / 1000);
            ctx.fillStyle = config.color;
            ctx.beginPath();
            for (let i = 0; i < 6; i++) {
                const angle = (i / 6) * Math.PI * 2;
                const r = i % 2 === 0 ? 12 : 8;
                ctx.lineTo(Math.cos(angle) * r, Math.sin(angle) * r);
            }
            ctx.closePath();
            ctx.fill();
            ctx.strokeStyle = '#fff';
            ctx.lineWidth = 1;
            ctx.stroke();
        } else if (e.t.startsWith('barrel_')) {
            ctx.translate(e.x, e.y);
            // Deep Shadow (Cylindrical)
            ctx.fillStyle = 'rgba(0,0,0,0.6)';
            ctx.beginPath();
            ctx.ellipse(5, 5, e.w/2 + 2, e.h/2 + 2, 0, 0, Math.PI*2);
            ctx.fill();

            // Main Cylinder Body
            const bGrad = ctx.createLinearGradient(-e.w/2, 0, e.w/2, 0);
            bGrad.addColorStop(0, config.color);
            bGrad.addColorStop(0.3, config.color);
            bGrad.addColorStop(0.5, 'rgba(255,255,255,0.5)'); // Central Highlight
            bGrad.addColorStop(0.7, config.color);
            bGrad.addColorStop(1, '#000'); // Shadow side
            
            ctx.fillStyle = bGrad;
            ctx.strokeStyle = '#111';
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.roundRect(-e.w/2, -e.h/2, e.w, e.h, 4);
            ctx.fill();
            ctx.stroke();

            // Reinforcing Rings (Doom style)
            ctx.fillStyle = 'rgba(0,0,0,0.4)';
            const ringH = 4;
            ctx.fillRect(-e.w/2, -e.h/2 + 8, e.w, ringH); // Top ring
            ctx.fillRect(-e.w/2, -ringH/2, e.w, ringH);   // Middle ring
            ctx.fillRect(-e.w/2, e.h/2 - 12, e.w, ringH); // Bottom ring

            // Metallic Cap (Top)
            ctx.fillStyle = 'rgba(255,255,255,0.15)';
            ctx.beginPath();
            ctx.ellipse(0, -e.h/2 + 2, e.w/2 - 2, 3, 0, 0, Math.PI*2);
            ctx.fill();

            // Symbol
            ctx.save();
            ctx.translate(0, 4);
            if (e.t === MATERIALS.BARREL_EXPLOSIVE) {
                // Draw Flame Symbol with Glow
                ctx.shadowBlur = 10;
                ctx.shadowColor = '#fff';
                ctx.fillStyle = '#fff';
                ctx.beginPath();
                ctx.moveTo(0, -14);
                ctx.bezierCurveTo(-10, -6, -12, 6, 0, 10);
                ctx.bezierCurveTo(12, 6, 10, -6, 0, -14);
                ctx.fill();
                ctx.shadowBlur = 0; // Reset
                
                // Inner flame
                ctx.fillStyle = '#ff4444';
                ctx.beginPath();
                ctx.moveTo(0, -8);
                ctx.bezierCurveTo(-6, -3, -7, 3, 0, 6);
                ctx.bezierCurveTo(7, 3, 6, -3, 0, -8);
                ctx.fill();
            } else if (e.t === MATERIALS.BARREL_OIL) {
                // Draw Oil Drop Symbol
                ctx.fillStyle = '#000';
                ctx.beginPath();
                ctx.moveTo(0, -12);
                ctx.bezierCurveTo(-8, -4, -10, 8, 0, 8);
                ctx.bezierCurveTo(10, 8, 8, -4, 0, -12);
                ctx.fill();
                // Highlight on drop
                ctx.fillStyle = 'rgba(255,255,255,0.4)';
                ctx.beginPath();
                ctx.arc(-3, -2, 2, 0, Math.PI*2);
                ctx.fill();
            } else if (e.t === MATERIALS.BARREL_ACID) {
                // Biohazard Symbol - High Visibility
                ctx.fillStyle = '#000';
                ctx.beginPath();
                ctx.arc(0, 0, 8, 0, Math.PI * 2);
                ctx.fill();
                
                ctx.strokeStyle = '#000';
                ctx.lineWidth = 2.5;
                for (let i = 0; i < 3; i++) {
                    ctx.save();
                    ctx.rotate((i * Math.PI * 2) / 3);
                    ctx.beginPath();
                    ctx.arc(0, -7, 6, 0.6, Math.PI - 0.6); // Curved biohazard lobes
                    ctx.stroke();
                    ctx.restore();
                }
                // Center cutout
                ctx.globalCompositeOperation = 'destination-out';
                ctx.beginPath(); ctx.arc(0, 0, 3, 0, Math.PI * 2); ctx.fill();
                ctx.globalCompositeOperation = 'source-over';
            } else if (e.t === MATERIALS.BARREL_GAS) {
                // Gas Cloud Symbol - Pulsing Toxic Feel
                const gasPulse = 0.9 + Math.sin(renderTime * 0.005) * 0.1;
                ctx.fillStyle = '#224400';
                ctx.save();
                ctx.scale(gasPulse, gasPulse);
                for (let i = 0; i < 5; i++) {
                    const ang = (i / 5) * Math.PI * 2;
                    ctx.beginPath();
                    ctx.arc(Math.cos(ang) * 7, Math.sin(ang) * 7, 7, 0, Math.PI * 2);
                    ctx.fill();
                }
                ctx.restore();
            } else if (e.t === MATERIALS.BARREL_ELECTRIC) {
                // Lightning Bolt - High Contrast Fix
                const pulse = 0.8 + Math.sin(renderTime * 0.01) * 0.2;
                ctx.shadowBlur = 15 * pulse;
                ctx.shadowColor = '#fff';
                
                // Outer Black Stroke for maximum visibility
                ctx.strokeStyle = '#000';
                ctx.lineWidth = 4;
                ctx.beginPath();
                ctx.moveTo(-5, -12); ctx.lineTo(3, -2); ctx.lineTo(-2, 0); ctx.lineTo(6, 12);
                ctx.lineTo(-2, 2); ctx.lineTo(3, 0); ctx.lineTo(-5, -12);
                ctx.stroke();

                // Main Bolt Fill
                ctx.fillStyle = '#fff';
                ctx.fill();
                
                // Sharp Cyan Inner Stroke
                ctx.strokeStyle = '#00f2ff';
                ctx.lineWidth = 1.5;
                ctx.stroke();

                ctx.shadowBlur = 0;
            } else if (e.t === MATERIALS.BARREL_FROST) {
                // Snowflake Symbol
                ctx.strokeStyle = '#fff';
                ctx.lineWidth = 2;
                for (let i = 0; i < 6; i++) {
                    ctx.save();
                    ctx.rotate((i * Math.PI * 2) / 6);
                    ctx.beginPath();
                    ctx.moveTo(0, 0); ctx.lineTo(0, -12);
                    ctx.moveTo(-3, -8); ctx.lineTo(0, -11); ctx.lineTo(3, -8);
                    ctx.stroke();
                    ctx.restore();
                }
            }
            ctx.restore();
        } else if (e.t === MATERIALS.CRATE) {
            ctx.translate(e.x, e.y);
            // Shadow
            ctx.fillStyle = 'rgba(0,0,0,0.4)';
            ctx.fillRect(-e.w/2 + 5, -e.h/2 + 5, e.w, e.h);
            // Body
            ctx.fillStyle = config.color;
            ctx.strokeStyle = '#222';
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.roundRect(-e.w/2, -e.h/2, e.w, e.h, 3);
            ctx.fill();
            ctx.stroke();
            // Wood Grain / Cross boards
            ctx.strokeStyle = 'rgba(0,0,0,0.3)';
            ctx.beginPath();
            ctx.moveTo(-e.w/2+5, -e.h/2+5); ctx.lineTo(e.w/2-5, e.h/2-5);
            ctx.moveTo(e.w/2-5, -e.h/2+5); ctx.lineTo(-e.w/2+5, e.h/2-5);
            ctx.stroke();
            ctx.strokeRect(-e.w/2 + 8, -e.h/2 + 8, e.w - 16, e.h - 16);
        } else {
            const isLiquid = [MATERIALS.WATER, MATERIALS.OIL, MATERIALS.DIRT, MATERIALS.ELECTRIC, MATERIALS.ICE, MATERIALS.ACID, MATERIALS.FIRE, MATERIALS.QUICKSAND].includes(e.t);
            const isCloud = [MATERIALS.GAS, MATERIALS.STEAM].includes(e.t);
            const isProp = [MATERIALS.CACTUS, MATERIALS.PALM].includes(e.t);
            const baseRadius = e.w * 0.5;
            const pulse = (1.0 + Math.sin(renderTime * 0.002 + e.id) * 0.03);

            if (isLiquid) {
                const drawRadius = baseRadius * pulse;
                if (e.t === MATERIALS.WATER && ENABLE_PREMIUM_VISUALS && waterPatterns.length > 0) {
                    ctx.fillStyle = 'rgba(0, 40, 150, 0.4)'; drawOrganicPath(ctx, e.x, e.y, drawRadius, e.id); ctx.fill();
                    ctx.save();
                    const p = waterPatterns[e.id % 9];
                    const flowX = (renderTime * 0.02) % WATER_TILE_SIZE;
                    p.setTransform(new DOMMatrix().translate(flowX, flowX * 0.5));
                    ctx.fillStyle = p; ctx.globalAlpha = 0.8; ctx.shadowBlur = 15; ctx.shadowColor = 'rgba(0, 242, 255, 0.6)';
                    drawOrganicPath(ctx, e.x, e.y, drawRadius, e.id); ctx.fill();
                    // Water Bubbles
                    ctx.fillStyle = 'rgba(255, 255, 255, 0.15)';
                    for (let i = 0; i < 3; i++) {
                        const seed = e.id + i * 15;
                        const phase = renderTime * 0.0015 + seed;
                        const bx = e.x + Math.cos(phase) * drawRadius * 0.5;
                        const by = e.y + Math.sin(phase) * drawRadius * 0.5;
                        ctx.beginPath(); ctx.arc(bx, by, 2, 0, Math.PI * 2); ctx.fill();
                    }
                    ctx.restore();
                } else if (e.t === MATERIALS.OIL && ENABLE_PREMIUM_VISUALS && oilPatterns.length > 0) {
                    ctx.fillStyle = 'rgba(15, 15, 20, 0.95)'; drawOrganicPath(ctx, e.x, e.y, drawRadius, e.id); ctx.fill();
                    ctx.save();
                    const p = oilPatterns[e.id % 9];
                    const flowX = -(renderTime * 0.01) % OIL_TILE_SIZE;
                    p.setTransform(new DOMMatrix().translate(flowX, flowX * 0.5));
                    ctx.fillStyle = p; ctx.globalAlpha = 0.9;
                    drawOrganicPath(ctx, e.x, e.y, drawRadius, e.id); ctx.fill();
                    // Oil Bubbles
                    ctx.fillStyle = 'rgba(255, 255, 255, 0.1)';
                    for (let i = 0; i < 3; i++) {
                        const seed = e.id + i * 10;
                        const phase = renderTime * 0.001 + seed;
                        const bx = e.x + Math.cos(phase) * drawRadius * 0.4;
                        const by = e.y + Math.sin(phase) * drawRadius * 0.4;
                        ctx.beginPath(); ctx.arc(bx, by, 2 + (i%2), 0, Math.PI * 2); ctx.fill();
                    }
                    ctx.restore();
                } else if (e.t === MATERIALS.ACID && ENABLE_PREMIUM_VISUALS && acidPatterns.length > 0) {
                    ctx.fillStyle = 'rgba(0, 80, 0, 0.5)'; drawOrganicPath(ctx, e.x, e.y, drawRadius, e.id); ctx.fill();
                    ctx.save();
                    const p = acidPatterns[e.id % 9];
                    const flowX = (renderTime * 0.015) % ACID_TILE_SIZE;
                    p.setTransform(new DOMMatrix().translate(flowX, flowX * 0.5));
                    ctx.fillStyle = p; ctx.shadowBlur = 12; ctx.shadowColor = 'rgba(0, 255, 100, 0.8)';
                    drawOrganicPath(ctx, e.x, e.y, drawRadius, e.id); ctx.fill();
                    // Acid Bubbles
                    ctx.fillStyle = 'rgba(100, 255, 100, 0.3)';
                    for (let i = 0; i < 4; i++) {
                        const seed = e.id + i * 12;
                        const phase = renderTime * 0.002 + seed;
                        const bx = e.x + Math.cos(phase) * drawRadius * 0.6;
                        const by = e.y + Math.sin(phase) * drawRadius * 0.6;
                        const r = 1.5 + Math.sin(phase * 2) * 2;
                        if (r > 0.5) { ctx.beginPath(); ctx.arc(bx, by, r, 0, Math.PI * 2); ctx.fill(); }
                    }
                    ctx.restore();
                } else if (e.t === MATERIALS.ELECTRIC && ENABLE_PREMIUM_VISUALS && electricPatterns.length > 0) {
                    ctx.fillStyle = 'rgba(0, 50, 150, 0.4)'; drawOrganicPath(ctx, e.x, e.y, drawRadius, e.id); ctx.fill();
                    ctx.save();
                    const p = electricPatterns[e.id % 9];
                    const flowX = (renderTime * 0.1) % ELECTRIC_TILE_SIZE;
                    p.setTransform(new DOMMatrix().translate(flowX, -flowX * 0.5));
                    ctx.fillStyle = p; ctx.shadowBlur = 15; ctx.shadowColor = '#00f2ff';
                    drawOrganicPath(ctx, e.x, e.y, drawRadius, e.id); ctx.fill();
                    ctx.restore();
                } else if (e.t === MATERIALS.DIRT && ENABLE_PREMIUM_VISUALS) {
                    const drawRadiusDirt = drawRadius;
                    // 1. Base Shadow
                    ctx.fillStyle = 'rgba(0, 0, 0, 0.3)';
                    drawOrganicPath(ctx, e.x + 5, e.y + 5, drawRadiusDirt, e.id);
                    ctx.fill();

                    // 2. Main Earth Body (Radial Gradient for Volume)
                    const dirtGrad = ctx.createRadialGradient(e.x - drawRadiusDirt * 0.2, e.y - drawRadiusDirt * 0.2, 0, e.x, e.y, drawRadiusDirt);
                    dirtGrad.addColorStop(0, '#6b4f3a'); // Lighter center
                    dirtGrad.addColorStop(1, '#3d2b1f'); // Darker edges
                    ctx.fillStyle = dirtGrad;
                    drawOrganicPath(ctx, e.x, e.y, drawRadiusDirt, e.id);
                    ctx.fill();

                    // 3. Texture (Grit/Pebbles)
                    ctx.save();
                    ctx.clip(); // Keep texture inside the mound
                    ctx.fillStyle = 'rgba(0, 0, 0, 0.2)';
                    for (let i = 0; i < 8; i++) {
                        const seed = e.id + i * 77;
                        const px = e.x + (getStableRandom(seed) - 0.5) * drawRadiusDirt * 1.5;
                        const py = e.y + (getStableRandom(seed + 1) - 0.5) * drawRadiusDirt * 1.5;
                        const ps = 2 + getStableRandom(seed + 2) * 4;
                        ctx.beginPath(); ctx.arc(px, py, ps, 0, Math.PI * 2); ctx.fill();
                    }
                    // Highlight on top edges
                    ctx.strokeStyle = 'rgba(255, 255, 255, 0.05)';
                    ctx.lineWidth = 2;
                    ctx.beginPath(); ctx.arc(e.x, e.y, drawRadiusDirt * 0.8, -2, -0.5); ctx.stroke();
                    ctx.restore();
                } else if (e.t === MATERIALS.ICE && ENABLE_PREMIUM_VISUALS) {
                    const drawRadiusIce = baseRadius;
                    
                    // 1. Drop Shadow
                    ctx.save();
                    ctx.fillStyle = 'rgba(0, 0, 0, 0.4)';
                    drawOrganicPath(ctx, e.x + 8, e.y + 8, drawRadiusIce, e.id);
                    ctx.fill();
                    ctx.restore();

                    // 2. Main Body with Vibrant Blue Gradient
                    const iceGrad = ctx.createRadialGradient(
                        e.x - drawRadiusIce * 0.35, e.y - drawRadiusIce * 0.35, 0,
                        e.x, e.y, drawRadiusIce
                    );
                    iceGrad.addColorStop(0, '#eefaff'); // Bright white center
                    iceGrad.addColorStop(0.3, '#9bdfff'); // Soft light blue
                    iceGrad.addColorStop(0.7, '#4fa9ff'); // Vibrant blue
                    iceGrad.addColorStop(1, '#3078cc');   // Darker rim blue
                    
                    ctx.fillStyle = iceGrad;
                    drawOrganicPath(ctx, e.x, e.y, drawRadiusIce, e.id);
                    ctx.fill();

                    // 3. Inner "Crack" Lines (Recreating the sharp lines in image)
                    ctx.save();
                    ctx.strokeStyle = 'rgba(0, 0, 0, 0.15)';
                    ctx.lineWidth = 1.5;
                    ctx.beginPath();
                    for (let i = 0; i < 3; i++) {
                        const angle = (e.id * 1.3 + i * 2.1) % (Math.PI * 2);
                        const len = drawRadiusIce * (0.4 + getStableRandom(e.id + i) * 0.4);
                        ctx.moveTo(e.x, e.y);
                        ctx.lineTo(e.x + Math.cos(angle) * len, e.y + Math.sin(angle) * len);
                        // Sub-cracks
                        if (getStableRandom(e.id + i + 10) > 0.5) {
                            const subAngle = angle + (getStableRandom(e.id + i + 20) - 0.5) * 1.5;
                            const subLen = len * 0.5;
                            ctx.moveTo(e.x + Math.cos(angle) * (len * 0.6), e.y + Math.sin(angle) * (len * 0.6));
                            ctx.lineTo(e.x + Math.cos(angle) * (len * 0.6) + Math.cos(subAngle) * subLen, e.y + Math.sin(angle) * (len * 0.6) + Math.sin(subAngle) * subLen);
                        }
                    }
                    ctx.stroke();
                    ctx.restore();

                    // 4. Highlight Arc (Glistening edge)
                    ctx.save();
                    ctx.strokeStyle = '#fff';
                    ctx.lineWidth = 4;
                    ctx.lineCap = 'round';
                    ctx.globalAlpha = 0.6;
                    ctx.beginPath();
                    ctx.arc(e.x, e.y, drawRadiusIce * 0.85, -2.4, -0.6);
                    ctx.stroke();
                    ctx.restore();

                    // 5. Twinkling Sparkles
                    ctx.fillStyle = '#fff';
                    for (let i = 0; i < 4; i++) {
                        const sparkleSeed = e.id + i * 117;
                        const sparkleTwinkle = Math.sin(renderTime * 0.01 + sparkleSeed) * 0.5 + 0.5;
                        if (sparkleTwinkle > 0.6) {
                            const sx = e.x + (getStableRandom(sparkleSeed) - 0.5) * drawRadiusIce * 1.2;
                            const sy = e.y + (getStableRandom(sparkleSeed + 1) - 0.5) * drawRadiusIce * 1.2;
                            ctx.globalAlpha = (sparkleTwinkle - 0.6) * 2;
                            ctx.beginPath(); ctx.arc(sx, sy, 1.5, 0, Math.PI * 2); ctx.fill();
                        }
                    }
                    ctx.globalAlpha = 1.0;
                } else if (e.t === MATERIALS.FIRE && ENABLE_PREMIUM_VISUALS && firePatterns.length > 0) {
                    const auraRad = drawRadius * 2.2;
                    const g = ctx.createRadialGradient(e.x, e.y, 0, e.x, e.y, auraRad);
                    g.addColorStop(0, 'rgba(255, 100, 0, 0.4)'); g.addColorStop(1, 'rgba(150, 0, 0, 0)');
                    ctx.fillStyle = g; drawOrganicPath(ctx, e.x, e.y, auraRad, e.id); ctx.fill();
                    ctx.save();
                    const p = firePatterns[e.id % 9];
                    const flowY = -(renderTime * 0.08) % FIRE_TILE_SIZE;
                    p.setTransform(new DOMMatrix().translate(0, flowY));
                    ctx.fillStyle = p; ctx.shadowBlur = 25; ctx.shadowColor = '#ff6600';
                    drawOrganicPath(ctx, e.x, e.y, drawRadius, e.id); ctx.fill();
                    ctx.restore();
                } else if (e.t === MATERIALS.QUICKSAND && ENABLE_PREMIUM_VISUALS) {
                    // 1. Thick Mud Base
                    ctx.fillStyle = '#3d2a14';
                    drawOrganicPath(ctx, e.x, e.y, drawRadius, e.id);
                    ctx.fill();
                    
                    // 2. Swirling Vortex Effect
                    ctx.save();
                    ctx.clip(); // Keep swirl inside the organic path
                    ctx.translate(e.x, e.y);
                    ctx.rotate(renderTime * 0.0006 + e.id);
                    
                    ctx.strokeStyle = 'rgba(0, 0, 0, 0.3)';
                    ctx.lineWidth = 5;
                    for (let i = 0; i < 3; i++) {
                        const r = drawRadius * (0.3 + i * 0.25);
                        ctx.beginPath();
                        ctx.arc(0, 0, r, 0, Math.PI * 1.6);
                        ctx.stroke();
                    }
                    
                    // 3. Rising Methane Bubbles
                    if (Math.random() > 0.96) {
                        particles.push({
                            x: e.x + (Math.random()-0.5) * drawRadius,
                            y: e.y + (Math.random()-0.5) * drawRadius,
                            vx: (Math.random()-0.5)*0.2, vy: -0.1,
                            life: 0.8, color: '#2a1a0f', size: 3 + Math.random()*5
                        });
                    }
                    ctx.restore();
                } else {
                    ctx.fillStyle = config.color;
                    drawOrganicPath(ctx, e.x, e.y, baseRadius, e.id); ctx.fill();
                }
            } else if (isCloud) {
                if (e.t === MATERIALS.GAS && ENABLE_PREMIUM_VISUALS && gasPatterns.length > 0) {
                    ctx.save();
                    const drawRadius = e.w * 0.65;
                    const p = gasPatterns[e.id % 9];
                    const flowX = (renderTime * 0.008) % GAS_TILE_SIZE;
                    p.setTransform(new DOMMatrix().translate(flowX, flowX * 0.2));
                    ctx.fillStyle = p; ctx.globalAlpha = 0.5; ctx.shadowBlur = 40; ctx.shadowColor = 'rgba(150, 200, 0, 0.3)';
                    drawOrganicPath(ctx, e.x, e.y, drawRadius, e.id); ctx.fill();
                    ctx.restore();
                } else if (e.t === MATERIALS.STEAM) {
                    ctx.save();
                    const baseRadiusSteam = e.w * 0.45;
                    ctx.globalAlpha = 0.7;
                    for (let i = 0; i < 5; i++) {
                        const seed = e.id + i * 137;
                        const angle = (getStableRandom(seed) * Math.PI * 2) + (renderTime * 0.0004);
                        const px = e.x + Math.cos(angle) * (baseRadiusSteam * 0.5);
                        const py = e.y + Math.sin(angle) * (baseRadiusSteam * 0.5);
                        ctx.fillStyle = 'rgba(240, 245, 255, 0.8)';
                        drawOrganicPath(ctx, px, py, baseRadiusSteam, seed); ctx.fill();
                    }
                    ctx.restore();
                }
            } else if (isProp) {
                if (e.t === MATERIALS.CACTUS) {
                    // Saguaro Cactus (True Premium)
                    ctx.save();
                    ctx.translate(e.x, e.y);
                    const drawRadius = baseRadius * pulse;
                    // Shadow
                    ctx.fillStyle = 'rgba(0,0,0,0.3)';
                    ctx.beginPath(); ctx.ellipse(8, 8, drawRadius * 0.4, drawRadius * 0.9, 0, 0, Math.PI * 2); ctx.fill();
                    // Main Stem
                    const cGrad = ctx.createLinearGradient(-drawRadius/2, 0, drawRadius/2, 0);
                    cGrad.addColorStop(0, '#2d5a27'); cGrad.addColorStop(0.5, '#4a7c44'); cGrad.addColorStop(1, '#1a3a17');
                    ctx.fillStyle = cGrad;
                    ctx.beginPath(); ctx.roundRect(-8, -drawRadius, 16, drawRadius * 2, 8); ctx.fill();
                    // Arms
                    ctx.beginPath();
                    ctx.roundRect(-drawRadius * 0.7, -drawRadius * 0.2, drawRadius * 0.6, 12, 6); // Left arm base
                    ctx.roundRect(-drawRadius * 0.7, -drawRadius * 0.6, 12, drawRadius * 0.5, 6); // Left arm up
                    ctx.roundRect(drawRadius * 0.2, 0, drawRadius * 0.6, 12, 6); // Right arm base
                    ctx.roundRect(drawRadius * 0.7, -drawRadius * 0.4, 12, drawRadius * 0.5, 6); // Right arm up
                    ctx.fill();
                    // Spines (Detail)
                    ctx.strokeStyle = 'rgba(255,255,255,0.1)'; ctx.lineWidth = 1;
                    ctx.beginPath();
                    for(let i=0; i<10; i++) {
                        const sy = -drawRadius + (i * drawRadius * 0.2);
                        ctx.moveTo(-4, sy); ctx.lineTo(-6, sy - 2);
                        ctx.moveTo(4, sy); ctx.lineTo(6, sy + 2);
                    }
                    ctx.stroke();
                    ctx.restore();
                } else if (e.t === MATERIALS.PALM) {
                    // Desert Palm (True Premium)
                    ctx.save();
                    ctx.translate(e.x, e.y);
                    const drawRadius = baseRadius * pulse;
                    // Trunk (Segmented)
                    ctx.fillStyle = '#5d4037';
                    for(let i=0; i<5; i++) {
                        ctx.beginPath(); ctx.roundRect(-6 + i, 10 - i*6, 12 - i*2, 8, 2); ctx.fill();
                    }
                    // Fronds (Leaves)
                    ctx.fillStyle = '#2d5a27';
                    const leafCount = 6;
                    for(let i=0; i<leafCount; i++) {
                        const ang = (i / leafCount) * Math.PI * 2 + renderTime * 0.0005;
                        ctx.save();
                        ctx.rotate(ang);
                        ctx.beginPath();
                        ctx.ellipse(drawRadius * 0.6, 0, drawRadius * 0.6, 6, 0, 0, Math.PI * 2);
                        ctx.fill();
                        // Leaf spine
                        ctx.strokeStyle = 'rgba(0,0,0,0.2)'; ctx.lineWidth = 1;
                        ctx.beginPath(); ctx.moveTo(0,0); ctx.lineTo(drawRadius, 0); ctx.stroke();
                        ctx.restore();
                    }
                    ctx.restore();
                }
            }
        }
        ctx.restore(); // Final balance for ctx.save() at top of forEach
    });
}

const droneHums = new Map();
function drawGuardians() {
    if (!gameState.guardians) return;
    const now = Date.now();
    gameState.guardians.forEach(g => {
        ctx.save();
        ctx.translate(g.x, g.y);
        
        // Audio Hum
        const lastHum = droneHums.get(g.id) || 0;
        if (now - lastHum > 1800) {
            droneHums.set(g.id, now);
            const dist = Math.hypot(camera.x + canvas.width/2 - g.x, camera.y + canvas.height/2 - g.y);
            if (dist < 1500) {
                const vol = Math.max(0, 1 - dist / 1500);
                audioManager.playSFX(droneHumSFX, vol * 0.6);
            }
        }

        // Shadow
        ctx.fillStyle = 'rgba(0,0,0,0.4)';
        ctx.beginPath();
        ctx.arc(5, 5, 25, 0, Math.PI * 2);
        ctx.fill();

        // Pulsing Glow
        const pulse = 0.8 + Math.sin(Date.now() * 0.01) * 0.2;
        ctx.shadowBlur = 15 * pulse;
        ctx.shadowColor = '#00f2ff';
        
        // Scanning Laser (Gap fix/Visual upgrade)
        const scanAngle = Math.sin(Date.now() * 0.002 + g.id) * 0.8;
        ctx.save();
        ctx.rotate(g.a + scanAngle);
        const laserGrad = ctx.createLinearGradient(0, 0, 300, 0);
        laserGrad.addColorStop(0, 'rgba(255, 0, 0, 0.4)');
        laserGrad.addColorStop(0.5, 'rgba(255, 0, 0, 0.1)');
        laserGrad.addColorStop(1, 'rgba(255, 0, 0, 0)');
        ctx.fillStyle = laserGrad;
        ctx.beginPath();
        ctx.moveTo(10, 0);
        ctx.lineTo(300, -15);
        ctx.lineTo(300, 15);
        ctx.closePath();
        ctx.fill();
        ctx.restore();

        // Drone Body (Polished Triangle)
        ctx.rotate(g.a);
        ctx.fillStyle = '#111';
        ctx.strokeStyle = '#00f2ff';
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.moveTo(30, 0);
        ctx.lineTo(-20, -20);
        ctx.lineTo(-10, 0); // Inner notch
        ctx.lineTo(-20, 20);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();

        // Thruster glow
        ctx.fillStyle = '#00f2ff';
        ctx.globalAlpha = 0.5 + Math.random() * 0.5;
        ctx.beginPath();
        ctx.arc(-15, 0, 5, 0, Math.PI * 2);
        ctx.fill();
        ctx.globalAlpha = 1.0;

        // Eye / Lens
        ctx.fillStyle = '#ff3333';
        ctx.beginPath();
        ctx.arc(10, 0, 4, 0, Math.PI * 2);
        ctx.fill();
        
        // Health bar
        ctx.restore();
        ctx.save();
        ctx.translate(g.x, g.y);
        const hpPerc = g.h / g.mh;
        ctx.fillStyle = '#333';
        ctx.fillRect(-25, -45, 50, 6);
        ctx.fillStyle = hpPerc > 0.5 ? '#00ff00' : (hpPerc > 0.2 ? '#ffff00' : '#ff0000');
        ctx.fillRect(-25, -45, 50 * hpPerc, 6);
        ctx.restore();
    });
}

function updateBulletTrails() {
    const ids = new Set(gameState.bullets.map(b => b.id));
    for (const id of bulletTrails.keys()) {
        if (!ids.has(id)) bulletTrails.delete(id);
    }
    for (const b of gameState.bullets) {
        if (!bulletTrails.has(b.id)) bulletTrails.set(b.id, []);
        const trail = bulletTrails.get(b.id);
        const last = trail[trail.length - 1];
        if (!last || last.x !== b.x || last.y !== b.y) {
            trail.push({ x: b.x, y: b.y });
            const maxLen = TRAIL_LENGTHS[b.t] || 4;
            if (trail.length > maxLen) trail.shift();
        }
    }
}

function drawBulletTrails() {
    ctx.lineCap = 'round';
    for (const b of gameState.bullets) {
        const trail = bulletTrails.get(b.id);
        if (!trail || trail.length < 2) continue;
        const trailColor = TRAIL_COLORS[b.t] || b.c;
        const trailW = TRAIL_WIDTHS[b.t] || 2;
        for (let i = 0; i < trail.length - 1; i++) {
            const t = (i + 1) / trail.length;
            ctx.globalAlpha = t * 0.55;
            ctx.strokeStyle = trailColor;
            ctx.lineWidth = trailW * t;
            ctx.beginPath();
            ctx.moveTo(trail[i].x, trail[i].y);
            ctx.lineTo(trail[i + 1].x, trail[i + 1].y);
            ctx.stroke();
        }
    }
    ctx.globalAlpha = 1.0;
}

function drawBullets() {
    for (const b of gameState.bullets) {
        if (!isRectInView(b.x, b.y, 20, 20, 50)) continue;
        ctx.save();
        ctx.translate(b.x, b.y);
        drawBulletBody(b);
        ctx.restore();
    }
}

function drawBulletBody(b) {
    if (b.t === 'fire' || b.w === 'FLAMETHROWER') {
        drawFireBullet(b);
        return;
    }
    
    switch (b.t) {
        case 'metal':    drawMetalBullet(b);    break;
        case 'water':    drawWaterBullet(b);    break;
        case 'dirt':     drawDirtBullet(b);     break;
        case 'electric': drawElectricBullet(b); break;
        case 'ice':      drawIceBullet(b);      break;
        default:
            ctx.fillStyle = b.c || '#ffffff';
            ctx.beginPath();
            ctx.arc(0, 0, 5, 0, Math.PI * 2);
            ctx.fill();
    }
}

function drawMetalBullet(b) {
    ctx.rotate(b.a || 0);
    ctx.globalAlpha = 0.3;
    ctx.fillStyle = '#ff8844';
    ctx.beginPath();
    ctx.ellipse(0, 0, 14, 7, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 1.0;
    ctx.fillStyle = '#ccaa44';
    ctx.beginPath();
    ctx.roundRect(-10, -3.5, 20, 7, 3.5);
    ctx.fill();
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.arc(9, 0, 3.5, 0, Math.PI * 2);
    ctx.fill();
}

function drawFireBullet(b) {
    const flicker = 0.8 + Math.sin(renderTime * 0.03 + b.id) * 0.2;
    const r = 30 * flicker;
    
    ctx.save();
    // Ultra vibrant neon fire
    ctx.shadowBlur = 20;
    ctx.shadowColor = '#ff0000';
    
    ctx.globalAlpha = 0.6;
    ctx.fillStyle = '#ff4400';
    ctx.beginPath();
    ctx.arc(0, 0, r * 1.4, 0, Math.PI * 2);
    ctx.fill();
    
    ctx.globalAlpha = 0.9;
    ctx.fillStyle = '#ffcc00';
    ctx.beginPath();
    ctx.arc(0, 0, r * 0.7, 0, Math.PI * 2);
    ctx.fill();
    
    ctx.restore();
}

function drawWaterBullet(b) {
    ctx.rotate(b.a || 0);
    ctx.globalAlpha = 0.3;
    ctx.fillStyle = '#0088ff';
    ctx.beginPath();
    ctx.arc(0, 0, 14, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 0.85;
    ctx.fillStyle = '#00aaff';
    ctx.beginPath();
    ctx.arc(0, 0, 10, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 1.0;
    ctx.fillStyle = '#cceeff';
    ctx.beginPath();
    ctx.arc(-4, -4, 4, 0, Math.PI * 2);
    ctx.fill();
}

function drawDirtBullet(b) {
    ctx.rotate(renderTime * 0.004 + b.id * 2.1);
    ctx.globalAlpha = 0.3;
    ctx.fillStyle = '#2a1500';
    ctx.beginPath();
    ctx.ellipse(2, 3, 14, 10, 0.3, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 1.0;
    ctx.fillStyle = '#7a3d10';
    ctx.beginPath();
    ctx.roundRect(-13, -9, 26, 18, [5, 8, 4, 9]);
    ctx.fill();
    ctx.fillStyle = '#a05a20';
    ctx.beginPath();
    ctx.arc(-4, -3, 4, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(5, 2, 3, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#4a2008';
    ctx.beginPath();
    ctx.arc(1, -1, 2.5, 0, Math.PI * 2);
    ctx.fill();
}

function drawElectricBullet(b) {
    const phase = renderTime * 0.03 + b.id * 0.5;
    const flicker = 0.7 + Math.sin(phase) * 0.3;
    ctx.globalAlpha = 0.2 * flicker;
    ctx.fillStyle = '#00ffff';
    ctx.beginPath();
    ctx.arc(0, 0, 18, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 0.5 * flicker;
    ctx.fillStyle = '#ffff00';
    ctx.beginPath();
    ctx.arc(0, 0, 10, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 1.0;
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.arc(0, 0, 5, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#ffff88';
    ctx.lineWidth = 1.5;
    ctx.globalAlpha = flicker;
    for (let i = 0; i < 4; i++) {
        const a0 = (i / 4) * Math.PI * 2 + phase * 0.2;
        const a1 = a0 + 0.5 + Math.sin(phase + i) * 0.3;
        ctx.beginPath();
        ctx.moveTo(Math.cos(a0) * 5, Math.sin(a0) * 5);
        ctx.lineTo(Math.cos(a1) * 12, Math.sin(a1) * 12);
        ctx.lineTo(Math.cos(a0 + 0.8) * 16, Math.sin(a0 + 0.8) * 16);
        ctx.stroke();
    }
    ctx.globalAlpha = 1.0;
}

function drawIceBullet(b) {
    ctx.rotate(b.a || 0);
    ctx.globalAlpha = 0.25;
    ctx.fillStyle = '#aaddff';
    ctx.beginPath();
    ctx.ellipse(0, 0, 18, 8, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 0.85;
    ctx.fillStyle = '#88ccee';
    ctx.beginPath();
    ctx.moveTo(14, 0);
    ctx.lineTo(6, -5);
    ctx.lineTo(-10, -4);
    ctx.lineTo(-14, 0);
    ctx.lineTo(-10, 4);
    ctx.lineTo(6, 5);
    ctx.closePath();
    ctx.fill();
    ctx.globalAlpha = 0.9;
    ctx.fillStyle = '#ddeeff';
    ctx.beginPath();
    ctx.moveTo(10, 0);
    ctx.lineTo(4, -3);
    ctx.lineTo(-6, -2);
    ctx.lineTo(-6, 2);
    ctx.lineTo(4, 3);
    ctx.closePath();
    ctx.fill();
    ctx.globalAlpha = 1.0;
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.arc(8, -1, 2.5, 0, Math.PI * 2);
    ctx.fill();
}

function drawPlayerEvents() {
    const now = Date.now();
    ctx.save();
    ctx.textAlign = 'center';
    ctx.font = '700 20px Outfit';
    
    playerEvents = playerEvents.filter(e => now - e.time < 4000);
    let y = canvas.height / 2 - 150;

    playerEvents.forEach(e => {
        const age = now - e.time;
        const alpha = age > 3000 ? 1 - (age - 3000) / 1000 : 1;
        ctx.globalAlpha = alpha;
        ctx.fillStyle = e.color;
        ctx.fillText(e.text, canvas.width / 2, y);
        y += 30;
    });
    ctx.restore();
}

function drawVignette() {
    const gradient = ctx.createRadialGradient(
        canvas.width / 2, canvas.height / 2, canvas.width * 0.1,
        canvas.width / 2, canvas.height / 2, canvas.width * 0.8
    );
    const currentBiome = gameState.zones && gameState.zones[0] ? gameState.zones[0].type : 'URBAN';
    gradient.addColorStop(0, 'rgba(0,0,0,0)');
    if (currentBiome === 'TUNDRA') {
        gradient.addColorStop(1, 'rgba(150, 220, 255, 0.25)'); // Cold frost vignette
    } else {
        gradient.addColorStop(1, 'rgba(0,0,15,0.4)');
    }
    
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0); // Ignore camera
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.restore();
}

function updateAtmosphere(dt) {
    const worldSize = gameState.worldSize || 4000;
    const currentBiome = gameState.zones && gameState.zones[0] ? gameState.zones[0].type : 'RANDOM';
    
    // Reset atmosphere if biome changes
    if (currentBiome !== lastAtmoBiome) {
        atmosphereParticles = [];
        lastAtmoBiome = currentBiome;
    }

    // Dynamic wind logic
    windPhase += 0.01 * dt;
    windIntensity = 1.0 + Math.sin(windPhase) * 0.5 + (Math.random() > 0.99 ? 1.5 : 0); // Sudden gusts

    if (atmosphereParticles.length < 120) {
        const pColor = currentBiome === 'WASTELAND' ? 'rgba(255, 150, 50, 0.15)' : 
                       (currentBiome === 'TUNDRA' ? 'rgba(230, 250, 255, 0.4)' : 'rgba(0, 242, 255, 0.2)');
        
        for (let i = 0; i < 120; i++) {
            const isTundra = currentBiome === 'TUNDRA';
            atmosphereParticles.push({
                x: Math.random() * worldSize,
                y: Math.random() * worldSize,
                size: isTundra ? 1.0 + Math.random() * 2.5 : 0.5 + Math.random() * 2.5,
                vx: (Math.random() - 0.5) * 0.5 + (currentBiome === 'WASTELAND' ? 0.8 * windIntensity : (isTundra ? 2.5 * windIntensity : 0)),
                vy: (Math.random() - 0.5) * 0.5 + (currentBiome === 'WASTELAND' ? 0.2 * windIntensity : (isTundra ? 1.5 * windIntensity : 0)),
                color: Math.random() > 0.7 ? pColor : (isTundra ? 'rgba(255, 255, 255, 0.6)' : 'rgba(255, 255, 255, 0.08)'),
                isSnow: isTundra && Math.random() > 0.3
            });
        }
    }

    // Tundra Wind Streaks
    if (currentBiome === 'TUNDRA' && windStreaks.length < 20) {
        if (Math.random() > 0.9) {
            windStreaks.push({
                x: -200,
                y: Math.random() * worldSize,
                w: 100 + Math.random() * 200,
                h: 1 + Math.random() * 2,
                speed: 15 + Math.random() * 10
            });
        }
    }
    windStreaks.forEach((s, i) => {
        s.x += s.speed * dt;
        if (s.x > worldSize + 300) windStreaks.splice(i, 1);
    });

    // Ash Particles (Embers) for Wasteland
    if (currentBiome === 'WASTELAND' && ashParticles.length < 60) {
        if (Math.random() > 0.85) {
            ashParticles.push({
                x: Math.random() * worldSize,
                y: worldSize + 50,
                vx: (Math.random() - 0.5) * 2 + (2.5 * windIntensity),
                vy: -Math.random() * 4 - 3,
                size: 1.5 + Math.random() * 4,
                life: 1.0,
                rotation: Math.random() * Math.PI * 2,
                rotVel: (Math.random() - 0.5) * 0.4
            });
        }
    }

    atmosphereParticles.forEach(p => {
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        if (p.x < 0) p.x = worldSize;
        if (p.x > worldSize) p.x = 0;
        if (p.y < 0) p.y = worldSize;
        if (p.y > worldSize) p.y = 0;
    });

    ashParticles.forEach((p, i) => {
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        p.rotation += p.rotVel * dt;
        p.life -= 0.005 * dt;
        if (p.life <= 0 || p.y < -100) ashParticles.splice(i, 1);
    });
}

function updateEnvironmentalObjects(dt) {
    const currentBiome = gameState.zones && gameState.zones[0] ? gameState.zones[0].type : 'RANDOM';
    const worldSize = gameState.worldSize || 4000;

    if (currentBiome === 'WASTELAND' && environmentalObjects.length < 20) {
        if (Math.random() > 0.97) {
            const type = Math.random() > 0.4 ? 'tumbleweed' : 'debris';
            environmentalObjects.push({
                x: -100,
                y: Math.random() * worldSize,
                size: type === 'tumbleweed' ? 12 + Math.random() * 18 : 6 + Math.random() * 12,
                vx: (4 + Math.random() * 6) * windIntensity,
                vy: (Math.random() - 0.5) * 3,
                angle: Math.random() * Math.PI * 2,
                rotationSpeed: 0.15 + Math.random() * 0.3,
                type: type,
                color: type === 'debris' ? (Math.random() > 0.5 ? '#555' : '#704214') : '#2d1b0f'
            });
        }
    }

    for (let i = environmentalObjects.length - 1; i >= 0; i--) {
        const obj = environmentalObjects[i];
        obj.x += obj.vx * dt;
        obj.y += obj.vy * dt;
        obj.angle += obj.rotationSpeed * dt;
        if (obj.x > worldSize + 200) environmentalObjects.splice(i, 1);
    }
}

function drawEnvironmentalObjects() {
    environmentalObjects.forEach(obj => {
        if (obj.x > camera.x - 50 && obj.x < camera.x + canvas.width + 50 &&
            obj.y > camera.y - 50 && obj.y < camera.y + canvas.height + 50) {
            
            ctx.save();
            ctx.translate(obj.x, obj.y);
            ctx.rotate(obj.angle);
            
            if (obj.type === 'tumbleweed') {
                ctx.strokeStyle = obj.color;
                ctx.lineWidth = 1.5;
                ctx.beginPath();
                for (let i = 0; i < 5; i++) {
                    ctx.ellipse(0, 0, obj.size, obj.size * 0.7, (i * Math.PI)/5, 0, Math.PI * 2);
                }
                ctx.stroke();
            } else if (obj.type === 'debris') {
                // Floating scrap metal or paper
                ctx.fillStyle = obj.color;
                ctx.globalAlpha = 0.6;
                ctx.beginPath();
                ctx.moveTo(-obj.size, -obj.size/2);
                ctx.lineTo(obj.size, -obj.size);
                ctx.lineTo(obj.size/2, obj.size);
                ctx.lineTo(-obj.size, obj.size/2);
                ctx.closePath();
                ctx.fill();
                ctx.strokeStyle = 'rgba(255,255,255,0.1)';
                ctx.stroke();
            }
            ctx.restore();
        }
    });
}

function drawGlobalTint() {
    if (!ENABLE_PREMIUM_VISUALS) return;
    const currentBiome = gameState.zones && gameState.zones[0] ? gameState.zones[0].type : 'RANDOM';
    
    if (currentBiome === 'WASTELAND') {
        ctx.save();
        ctx.globalCompositeOperation = 'multiply';
        ctx.fillStyle = 'rgba(255, 200, 100, 0.08)';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.restore();
    } else if (currentBiome === 'TUNDRA') {
        ctx.save();
        ctx.globalCompositeOperation = 'screen';
        ctx.fillStyle = 'rgba(200, 230, 255, 0.05)';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.restore();
        
        // Draw Wind Streaks
        ctx.save();
        ctx.translate(-camera.x, -camera.y);
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.15)';
        ctx.lineWidth = 1;
        windStreaks.forEach(s => {
            ctx.beginPath();
            ctx.moveTo(s.x, s.y);
            ctx.lineTo(s.x + s.w, s.y);
            ctx.stroke();
        });
        ctx.restore();
    }
}

function drawAtmosphere() {
    ctx.save();
    atmosphereParticles.forEach(p => {
        if (p.x > camera.x - 50 && p.x < camera.x + canvas.width + 50 &&
            p.y > camera.y - 50 && p.y < camera.y + canvas.height + 50) {
            
            if (p.isSnow) {
                // Shiny snowflake crystal
                ctx.fillStyle = '#fff';
                ctx.beginPath();
                ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
                ctx.fill();
                // Subtle glint
                ctx.strokeStyle = 'rgba(255,255,255,0.4)';
                ctx.lineWidth = 0.5;
                ctx.beginPath();
                ctx.moveTo(p.x - p.size * 2, p.y);
                ctx.lineTo(p.x + p.size * 2, p.y);
                ctx.moveTo(p.x, p.y - p.size * 2);
                ctx.lineTo(p.x, p.y + p.size * 2);
                ctx.stroke();
            } else {
                ctx.fillStyle = p.color;
                ctx.beginPath();
                ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
                ctx.fill();
            }
        }
    });

    // Draw Ash Embers
    ashParticles.forEach(p => {
        if (p.x > camera.x - 50 && p.x < camera.x + canvas.width + 50 &&
            p.y > camera.y - 50 && p.y < camera.y + canvas.height + 50) {
            ctx.save();
            ctx.translate(p.x, p.y);
            ctx.rotate(p.rotation);
            ctx.globalAlpha = p.life;
            const isGlow = p.size > 2.5;
            ctx.fillStyle = isGlow ? '#ff8800' : '#333';
            ctx.shadowBlur = isGlow ? 12 : 0;
            ctx.shadowColor = '#ff4400';
            ctx.fillRect(-p.size/2, -p.size/2, p.size, p.size);
            // Inner hot core
            if (isGlow && p.life > 0.5) {
                ctx.fillStyle = '#fff';
                ctx.globalAlpha = p.life * 0.5;
                ctx.fillRect(-p.size/4, -p.size/4, p.size/2, p.size/2);
            }
            ctx.restore();
        }
    });

    // 4. INDUSTRIAL: Background Ambient Glow (Furnace/Energy)
    const currentBiome = gameState.zones && gameState.zones[0] ? (gameState.zones[0].t || gameState.zones[0].type) : 'RANDOM';
    if (currentBiome === 'INDUSTRIAL' && ENABLE_PREMIUM_VISUALS) {
        ctx.save();
        const pulse = 0.5 + Math.sin(Date.now() * 0.001) * 0.5;
        const grad = ctx.createRadialGradient(canvas.width/2, canvas.height/2, 0, canvas.width/2, canvas.height/2, canvas.width);
        grad.addColorStop(0, `rgba(255, 100, 0, ${pulse * 0.03})`); // Warm furnace glow
        grad.addColorStop(1, `rgba(0, 242, 255, ${pulse * 0.02})`); // Cool energy glow
        ctx.fillStyle = grad;
        ctx.globalCompositeOperation = 'screen';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.restore();

        // Periodic Steam Blowoff from Buildings
        gameState.elements.forEach(e => {
            if (e.t === MATERIALS.BUILDING && e.id % 4 === 0) {
                if (Math.random() > 0.992) {
                    for (let i = 0; i < 5; i++) {
                        particles.push({
                            x: e.x + (Math.random()-0.5)*e.w, 
                            y: e.y - e.h/2, 
                            vx: (Math.random()-0.5)*1.5, 
                            vy: -2.5 - Math.random()*2, 
                            life: 1.5, 
                            color: 'rgba(230, 235, 255, 0.3)', 
                            size: 15 + Math.random()*20,
                            isSteam: true
                        });
                    }
                }
            }
        });
    }

    // 5. URBAN: City Ambient Glow (Light Pollution)
    if (currentBiome === 'URBAN' && ENABLE_PREMIUM_VISUALS) {
        ctx.save();
        const pulse = 0.7 + Math.sin(Date.now() * 0.0008) * 0.3;
        const cityGrad = ctx.createRadialGradient(canvas.width/2, canvas.height, 0, canvas.width/2, canvas.height, canvas.height * 1.5);
        cityGrad.addColorStop(0, `rgba(80, 0, 255, ${pulse * 0.04})`); // Purple/Magenta haze
        cityGrad.addColorStop(0.5, `rgba(0, 100, 255, ${pulse * 0.02})`); // Cyan haze
        cityGrad.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.fillStyle = cityGrad;
        ctx.globalCompositeOperation = 'screen';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.restore();

        // Wispy Street Steam (Manholes)
        if (Math.random() > 0.98) {
            const rx = camera.x + Math.random() * canvas.width;
            const ry = camera.y + Math.random() * canvas.height;
            for (let i = 0; i < 3; i++) {
                particles.push({
                    x: rx + (Math.random()-0.5)*20, 
                    y: ry + (Math.random()-0.5)*20, 
                    vx: (Math.random()-0.5)*0.5, 
                    vy: -0.5 - Math.random(), 
                    life: 2.0, 
                    color: 'rgba(255, 255, 255, 0.15)', 
                    size: 10 + Math.random()*15,
                    isSteam: true
                });
            }
        }
    }
    ctx.restore();
}

function updateLocalPlayerAudio(me) {
    const now = Date.now();
    if (now - lastPuddleCheck < 100) return; // Slightly faster check
    lastPuddleCheck = now;

    let activePuddleSFX = null;
    let activePuddleId = null;
    const isMoving = me.v && (Math.abs(me.v[0]) > 0.15 || Math.abs(me.v[1]) > 0.15);
    
    // Check elements (puddles, steam, etc)
    if (gameState.elements) {
        gameState.elements.forEach(e => {
            const dx = e.x - me.x;
            const dy = e.y - me.y;
            const distSq = dx * dx + dy * dy;
            const radius = e.w ? (e.w / 2 + 25) : 60; // Increased buffer for better detection
            
            if (distSq < radius * radius) {
                activePuddleId = e.id;
                if (e.t === MATERIALS.ACID) activePuddleSFX = acidSplashSFX;
                else if (e.t === MATERIALS.OIL) activePuddleSFX = oilSloshSFX;
                else if (e.t === MATERIALS.ELECTRIC) activePuddleSFX = electricZapSFX;
                else if (e.t === MATERIALS.QUICKSAND) activePuddleSFX = quicksandSFX;
                else if (e.t === MATERIALS.FIRE) activePuddleSFX = fireEntrySFX;
                else if (e.t === MATERIALS.GAS) activePuddleSFX = gasEntrySFX;
                else if (e.t === MATERIALS.ICE) activePuddleSFX = iceSlideSFX;
                else if (e.t === MATERIALS.WATER) activePuddleSFX = waterSplashSFX;
                else if (e.t === MATERIALS.STEAM) activePuddleSFX = steamSFX;
                else if (e.t === MATERIALS.DIRT) activePuddleSFX = dirtSFX;
            }
        });
    }

    // Only play if moving and entering a NEW puddle (or same puddle if sound expired)
    if (isMoving && activePuddleSFX && activePuddleId !== currentPuddleId) {
        audioManager.playChannel('puddle', activePuddleSFX, 0.45, 2500);
        currentPuddleId = activePuddleId;
        // Reset after 4s to allow re-triggering if still in it
        setTimeout(() => { if (currentPuddleId === activePuddleId) currentPuddleId = null; }, 4000);
    } else if (!activePuddleSFX || !isMoving) {
        currentPuddleId = null;
    }
}

function spawnParticles(x, y, color, count = 10, sizeMult = 1) {
    for (let i = 0; i < count; i++) {
        particles.push({
            x, y,
            vx: (Math.random() - 0.5) * 8,
            vy: (Math.random() - 0.5) * 8,
            life: 1.0,
            color,
            size: (Math.random() * 4 + 2) * sizeMult
        });
    }
}

function spawnExplosion(x, y, color) {
    spawnParticles(x, y, color, 30);
    spawnParticles(x, y, '#fff', 15);
}

function updateParticles(dt) {
    particles.forEach(p => {
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        p.life -= 0.02 * dt;
        if (p.isWaterWake) {
            p.size += 0.5 * dt; // Ripples grow
            p.life -= 0.01 * dt; // But fade faster
        }
        if (p.isEmber) {
            p.vx += (Math.random() - 0.5) * 0.2 * dt;
            p.size *= 0.98; // Shrink as they rise
        }
        if (p.isSlugTrail) {
            p.life -= 0.005 * dt; // Fade very slowly
            p.size *= 0.995;
        }
    });
    particles = particles.filter(p => p.life > 0);
}

function drawParticles() {
    ctx.save();
    particles.forEach(p => {
        ctx.globalAlpha = p.life;
        ctx.fillStyle = p.color;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
        ctx.fill();
    });
    ctx.restore();
}

function drawPopups(dt) {
    popups = popups.filter(p => p.life > 0);
    popups.forEach(p => {
        ctx.save();
        ctx.globalAlpha = p.life;
        ctx.fillStyle = '#ffff00';
        ctx.font = 'bold 24px Outfit';
        ctx.textAlign = 'center';
        ctx.fillText(p.text, p.x, p.y);
        p.y -= dt;
        p.life -= 0.02 * dt;
        ctx.restore();
    });
}

// Action Handlers
usernameInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') {
        joinBtn.click();
    }
});

pinInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') {
        joinBtn.click();
    }
});

hostBtn.onclick = () => {
    console.log('Host button clicked');
    playMusic();
    const name = usernameInput.value.trim();
    const pin = pinInput.value.trim();
    if (!name) {
        alert('PLEASE ENTER A CALLSIGN!');
        return;
    }
    if (!pin || pin.length < 4 || pin.length > 10) {
        alert('PLEASE ENTER A PIN (4-10 DIGITS)!');
        return;
    }
    localStorage.setItem('tanks_username', name);
    localStorage.setItem('tanks_user_pin', pin);
    const chassis = document.getElementById('chassis-select').value;
    console.log('Emitting host-game:', { name, chassis });
    socket.emit('host-game', { username: name, chassisType: chassis, pin: pin });
};

joinBtn.onclick = () => {
    playMusic();
    const name = usernameInput.value.trim();
    const pin = pinInput.value.trim();
    if (!name) {
        alert('PLEASE ENTER A CALLSIGN!');
        return;
    }
    if (!pin || pin.length < 4 || pin.length > 10) {
        alert('PLEASE ENTER A PIN (4-10 DIGITS)!');
        return;
    }
    localStorage.setItem('tanks_username', name);
    localStorage.setItem('tanks_user_pin', pin);
    const chassis = document.getElementById('chassis-select').value;
    socket.emit('join-game', { username: name, chassisType: chassis, pin: pin });
};

startGameBtn.onclick = () => {
    const mapType = document.getElementById('map-select').value;
    socket.emit('start-game', { mapType });
};

if (dronesToggle) {
    dronesToggle.onchange = (e) => {
        socket.emit('toggle-drones', e.target.checked);
    };
}

// Bot management is now handled via slots in updateLobbyUI

// Debug Button Handlers
const spawnBotBtn = document.getElementById('debug-spawn-bot-btn');
const toggleBotBtn = document.getElementById('debug-toggle-bot-btn');
const spawnWallBtn = document.getElementById('debug-spawn-wall-btn');

if (spawnBotBtn) {
    spawnBotBtn.onclick = () => {
        debugSpawnType = debugSpawnType === 'bot' ? null : 'bot';
        spawnBotBtn.classList.toggle('active', debugSpawnType === 'bot');
        if (spawnWallBtn) spawnWallBtn.classList.remove('active');
    };
}

if (toggleBotBtn) {
    toggleBotBtn.onclick = () => {
        botsActive = !botsActive;
        toggleBotBtn.classList.toggle('active', botsActive);
        toggleBotBtn.innerText = `BOTS: ${botsActive ? 'ON' : 'OFF'}`;
        socket.emit('debug-toggle-bots', botsActive);
    };
}

if (spawnWallBtn) {
    spawnWallBtn.onclick = () => {
        debugSpawnType = debugSpawnType === 'wall' ? null : 'wall';
        spawnWallBtn.classList.toggle('active', debugSpawnType === 'wall');
        if (spawnBotBtn) spawnBotBtn.classList.remove('active');
    };
}

window.addEventListener('mousedown', (e) => {
    if (!gameActive || isMenuOpen || isShopOpen) return;
    
    // Check if we clicked on a UI element that should block shooting
    if (e.target.closest('button') || e.target.closest('input') || e.target.closest('.weapon-slot')) return;

    if (debugMode && debugSpawnType) {
        const rect = canvas.getBoundingClientRect();
        const screenX = e.clientX - rect.left;
        const screenY = e.clientY - rect.top;
        const worldX = screenX + camera.x;
        const worldY = screenY + camera.y;

        if (debugSpawnType === 'bot') {
            socket.emit('debug-spawn-bot', { 
                pos: { x: worldX, y: worldY }, 
                difficulty: 'NORMAL',
                isActive: botsActive
            });
        } else if (debugSpawnType === 'wall') {
            socket.emit('debug-spawn-terrain', {
                pos: { x: worldX, y: worldY },
                w: 100,
                h: 100
            });
        }
        return;
    }

    if (e.button === 0) {
        keys.shoot = true;
        updateAimAngle();
        sendInput();
    }
});

window.addEventListener('mouseup', (e) => {
    if (e.button === 0 && keys.shoot) {
        keys.shoot = false;
        sendInput();
    }
});


// Mobile Control Implementation
const joystickContainer = document.getElementById('joystick-container');
const joystickHandle = document.getElementById('joystick-handle');
const mobileFireBtn = document.getElementById('mobile-fire-btn');
const mobileWeaponBtn = document.getElementById('mobile-weapon-btn');

if (joystickContainer) {
    let joystickActive = false;
    let joystickCenter = { x: 0, y: 0 };

    joystickContainer.addEventListener('touchstart', e => {
        joystickActive = true;
        const rect = joystickContainer.getBoundingClientRect();
        joystickCenter = { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
        handleJoystick(e.touches[0]);
    });

    window.addEventListener('touchmove', e => {
        if (!joystickActive) return;
        handleJoystick(e.touches[0]);
    }, { passive: false });

    window.addEventListener('touchend', () => {
        joystickActive = false;
        joystickHandle.style.transform = 'translate(0, 0)';
        keys.up = false; keys.down = false; keys.left = false; keys.right = false;
        socket.emit('input', keys);
    });

    function handleJoystick(touch) {
        const dx = touch.clientX - joystickCenter.x;
        const dy = touch.clientY - joystickCenter.y;
        const dist = Math.min(Math.hypot(dx, dy), 60);
        const angle = Math.atan2(dy, dx);
        
        joystickHandle.style.transform = `translate(${Math.cos(angle) * dist}px, ${Math.sin(angle) * dist}px)`;
        
        // Thresholds for movement
        keys.up = dy < -30;
        keys.down = dy > 30;
        keys.left = dx < -30;
        keys.right = dx > 30;
        
        if (dist > 10) {
            keys.aimAngle = angle;
        }
        
        socket.emit('input', keys);
    }
}

if (mobileFireBtn) {
    mobileFireBtn.addEventListener('touchstart', () => {
        keys.shoot = true;
        socket.emit('input', keys);
    });
    mobileFireBtn.addEventListener('touchend', () => {
        keys.shoot = false;
        socket.emit('input', keys);
    });
}

if (mobileWeaponBtn) {
    mobileWeaponBtn.addEventListener('touchstart', () => {
        const me = serverState.players.find(p => p.id === myId);
        if (me) {
            const nextSlot = (me.currentSlot + 1) % me.slots.length;
            socket.emit('switch-weapon', nextSlot);
        }
    });
}

init();

function fetchLobbies() {
    socket.emit('request-lobbies');
}

socket.on('lobbies-list', (list) => {
    if (!serverList) return;
    serverList.innerHTML = '';
    
    if (list.length === 0) {
        serverList.innerHTML = '<div class="server-item empty" style="padding: 2rem; opacity: 0.5; font-style: italic; color: #fff;">NO ACTIVE LOBBIES FOUND</div>';
        return;
    }
    
    list.forEach(lobby => {
        const item = document.createElement('div');
        item.className = 'server-item';
        item.style = 'display: flex; justify-content: space-between; align-items: center; padding: 1rem 2rem; background: rgba(255,255,255,0.05); margin-bottom: 0.5rem; border-radius: 4px; border-left: 4px solid ' + (lobby.active ? '#ff3333' : '#00f2ff') + ';';
        
        const info = document.createElement('div');
        info.innerHTML = `<span style="color: #00f2ff; font-weight: bold; font-size: 1.1rem; font-family: 'Outfit';">LOBBY: ${lobby.id.toUpperCase()}</span><br>
                          <span style="font-size: 0.8rem; opacity: 0.7; color: #fff; font-family: 'Outfit';">PLAYERS: ${lobby.players}/10 | BOTS: ${lobby.bots} | STATUS: ${lobby.active ? 'IN MATCH' : 'LOBBY'}</span>`;
        
        const joinBtnEl = document.createElement('button');
        joinBtnEl.innerText = 'JOIN';
        joinBtnEl.className = lobby.players >= 10 ? 'secondary-btn disabled' : 'btn';
        joinBtnEl.style = 'padding: 0.5rem 1.5rem; font-size: 0.9rem; margin-top: 0;';
        joinBtnEl.onclick = () => {
            const username = usernameInput.value;
            const pin = pinInput.value;
            const chassisType = document.getElementById('chassis-select').value;
            socket.emit('join-lobby', { username, pin, chassisType, lobbyId: lobby.id });
            serverBrowser.style.display = 'none';
        };
        
        item.appendChild(info);
        item.appendChild(joinBtnEl);
        serverList.appendChild(item);
    });
});

if (quickMatchBtn) {
    quickMatchBtn.onclick = () => {
        const username = usernameInput.value;
        const pin = pinInput.value;
        const chassisType = document.getElementById('chassis-select').value;
        socket.emit('join-game', { username, pin, chassisType });
    };
}

if (joinBtn) {
    joinBtn.onclick = () => {
        serverBrowser.style.display = 'flex';
        fetchLobbies();
    };
}

if (refreshServersBtn) {
    refreshServersBtn.onclick = () => {
        fetchLobbies();
    };
}

if (closeBrowserBtn) {
    closeBrowserBtn.onclick = () => {
        serverBrowser.style.display = 'none';
    };
}

function updateEnvironmentalLife(dt) {
    const currentBiome = gameState.zones && gameState.zones[0] ? (gameState.zones[0].t || gameState.zones[0].type) : 'RANDOM';
    const worldSize = gameState.worldSize || 4000;
    const me = gameState.players.find(p => p.id === myId);

    // Helper to handle flee logic
    const applyFlee = (l, fleeDist, speed) => {
        if (!me) return;
        const dist = Math.hypot(me.x - l.x, me.y - l.y);
        if (dist < fleeDist) {
            l.state = 'fleeing';
            l.angle = Math.atan2(l.y - me.y, l.x - me.x);
            l.x += Math.cos(l.angle) * speed * dt;
            l.y += Math.sin(l.angle) * speed * dt;
            return true;
        } else if (l.state === 'fleeing') {
            l.state = 'idle';
        }
        return false;
    };

    // 1. DESERT
    if (currentBiome === 'DESERT') {
        if (lizards.length === 0) {
            for (let i = 0; i < 12; i++) lizards.push({ x: Math.random() * worldSize, y: Math.random() * worldSize, angle: Math.random() * Math.PI * 2, state: 'idle', timer: 0 });
            for (let i = 0; i < 8; i++) scorpions.push({ x: Math.random() * worldSize, y: Math.random() * worldSize, angle: Math.random() * Math.PI * 2, state: 'idle', timer: 0 });
            for (let i = 0; i < 3; i++) vultures.push({ x: Math.random() * worldSize, y: Math.random() * worldSize, angle: Math.random() * Math.PI * 2, radius: 400 + Math.random() * 400, speed: 0.001 + Math.random() * 0.001 });
        }
        lizards.forEach(l => {
            l.timer -= dt;
            if (!applyFlee(l, 150, 4) && l.state === 'idle' && l.timer <= 0) {
                l.angle += (Math.random() - 0.5) * 1.5;
                l.timer = 100 + Math.random() * 200;
            }
        });
        scorpions.forEach(s => {
            s.timer -= dt;
            if (!applyFlee(s, 180, 5) && s.state === 'idle' && s.timer <= 0) {
                s.angle += (Math.random() - 0.5) * 2;
                s.timer = 50 + Math.random() * 150;
            }
        });
        vultures.forEach(v => {
            v.angle += v.speed * dt;
            // Circle around a point
        });
    }

    // 2. URBAN
    if (currentBiome === 'URBAN') {
        if (pigeons.length === 0) {
            for (let i = 0; i < 20; i++) pigeons.push({ x: Math.random() * worldSize, y: Math.random() * worldSize, angle: Math.random() * Math.PI * 2, state: 'idle', timer: 0, wingPhase: 0 });
            for (let i = 0; i < 5; i++) strayCats.push({ x: Math.random() * worldSize, y: Math.random() * worldSize, angle: Math.random() * Math.PI * 2, state: 'idle', timer: 0 });
            for (let i = 0; i < 30; i++) cockroaches.push({ x: Math.random() * worldSize, y: Math.random() * worldSize, angle: Math.random() * Math.PI * 2, state: 'idle' });
        }
        pigeons.forEach(p => {
            p.timer -= dt;
            if (applyFlee(p, 200, 6)) {
                p.wingPhase += 0.5 * dt;
                p.state = 'flying';
            } else if (p.state === 'flying') {
                p.state = 'idle';
            }
            if (p.state === 'idle' && p.timer <= 0) {
                p.angle += (Math.random() - 0.5) * 1.0;
                p.x += Math.cos(p.angle) * 0.5 * dt;
                p.y += Math.sin(p.angle) * 0.5 * dt;
                p.timer = 50 + Math.random() * 100;
            }
        });
        strayCats.forEach(c => {
            c.timer -= dt;
            if (!applyFlee(c, 250, 7) && c.state === 'idle' && c.timer <= 0) {
                c.angle += (Math.random() - 0.5) * 3;
                c.timer = 200 + Math.random() * 400;
            }
        });
        cockroaches.forEach(c => {
            if (me && Math.hypot(me.x - c.x, me.y - c.y) < 120) {
                c.angle = Math.atan2(c.y - me.y, c.x - me.x);
                c.x += Math.cos(c.angle) * 8 * dt;
                c.y += Math.sin(c.angle) * 8 * dt;
            }
        });
    }

    // 3. INDUSTRIAL
    if (currentBiome === 'INDUSTRIAL') {
        if (rats.length === 0) {
            for (let i = 0; i < 25; i++) rats.push({ x: Math.random() * worldSize, y: Math.random() * worldSize, angle: Math.random() * Math.PI * 2, state: 'idle', timer: 0 });
            for (let i = 0; i < 10; i++) microDrones.push({ x: Math.random() * worldSize, y: Math.random() * worldSize, startX: 0, startY: 0, angle: Math.random() * Math.PI * 2 });
            for (let i = 0; i < 40; i++) moths.push({ x: Math.random() * worldSize, y: Math.random() * worldSize, phase: Math.random() * Math.PI * 2 });
        }
        rats.forEach(r => {
            r.timer -= dt;
            if (!applyFlee(r, 160, 9) && r.state === 'idle' && r.timer <= 0) {
                r.angle += (Math.random() - 0.5) * 4;
                r.x += Math.cos(r.angle) * 2 * dt;
                r.y += Math.sin(r.angle) * 2 * dt;
                r.timer = 20 + Math.random() * 50;
            }
        });
        microDrones.forEach(d => {
            d.angle += 0.02 * dt;
            d.x += Math.cos(d.angle) * 1 * dt;
            d.y += Math.sin(d.angle * 0.5) * 1 * dt;
        });
        moths.forEach(m => {
            m.phase += 0.1 * dt;
            m.x += Math.sin(m.phase) * 2 * dt;
            m.y += Math.cos(m.phase * 0.7) * 2 * dt;
        });
    }

    // 4. TUNDRA
    if (currentBiome === 'TUNDRA') {
        if (snowHares.length === 0) {
            for (let i = 0; i < 15; i++) snowHares.push({ x: Math.random() * worldSize, y: Math.random() * worldSize, angle: Math.random() * Math.PI * 2, state: 'idle', jump: 0 });
            for (let i = 0; i < 10; i++) penguins.push({ x: Math.random() * worldSize, y: Math.random() * worldSize, angle: Math.random() * Math.PI * 2, state: 'idle', waddle: 0 });
            for (let i = 0; i < 6; i++) arcticFoxes.push({ x: Math.random() * worldSize, y: Math.random() * worldSize, angle: Math.random() * Math.PI * 2, state: 'idle' });
        }
        snowHares.forEach(h => {
            if (applyFlee(h, 200, 8)) {
                h.jump += 0.3 * dt;
            } else {
                h.jump = 0;
            }
        });
        penguins.forEach(p => {
            if (applyFlee(p, 150, 2)) {
                p.waddle += 0.2 * dt;
                if (Math.random() > 0.98) p.state = 'sliding';
            } else {
                p.waddle += 0.05 * dt;
            }
            if (p.state === 'sliding') {
                p.x += Math.cos(p.angle) * 5 * dt;
                p.y += Math.sin(p.angle) * 5 * dt;
                if (Math.random() > 0.95) p.state = 'idle';
            }
        });
        arcticFoxes.forEach(f => {
            applyFlee(f, 300, 10);
        });
    }

    // 5. WETLAND
    if (currentBiome === 'WETLAND') {
        if (dragonflies.length === 0) {
            for (let i = 0; i < 20; i++) dragonflies.push({ x: Math.random() * worldSize, y: Math.random() * worldSize, vx: (Math.random()-0.5)*2, vy: (Math.random()-0.5)*2, phase: Math.random() * Math.PI * 2 });
            for (let i = 0; i < 12; i++) frogs.push({ x: Math.random() * worldSize, y: Math.random() * worldSize, angle: Math.random() * Math.PI * 2, jump: 0, state: 'idle' });
            for (let i = 0; i < 15; i++) waterStriders.push({ x: Math.random() * worldSize, y: Math.random() * worldSize, vx: 0, vy: 0, timer: 0 });
        }
        dragonflies.forEach(d => {
            d.phase += 0.05 * dt;
            d.vx += Math.sin(d.phase) * 0.2 * dt; d.vy += Math.cos(d.phase) * 0.2 * dt;
            d.x += d.vx * dt; d.y += d.vy * dt;
            d.vx *= 0.98; d.vy *= 0.98;
            if (Math.random() > 0.98) { d.vx += (Math.random()-0.5) * 4; d.vy += (Math.random()-0.5) * 4; }
        });
        frogs.forEach(f => {
            if (applyFlee(f, 120, 6)) {
                f.jump += 0.2 * dt;
            } else {
                f.jump = 0;
            }
        });
        waterStriders.forEach(s => {
            s.timer -= dt;
            if (s.timer <= 0) {
                const ang = Math.random() * Math.PI * 2;
                s.vx = Math.cos(ang) * 3; s.vy = Math.sin(ang) * 3;
                s.timer = 30 + Math.random() * 60;
                // Add tiny ripple particle
                if (Math.random() > 0.5) {
                    particles.push({
                        x: s.x, y: s.y,
                        vx: 0, vy: 0,
                        life: 0.5, color: 'rgba(255,255,255,0.3)',
                        size: 2, isWaterWake: true
                    });
                }
            }
            s.x += s.vx * dt; s.y += s.vy * dt;
            s.vx *= 0.9; s.vy *= 0.9;
        });
    }

    // 6. WASTELAND
    if (currentBiome === 'WASTELAND') {
        if (mutatedCrows.length === 0) {
            for (let i = 0; i < 10; i++) mutatedCrows.push({ x: Math.random() * worldSize, y: Math.random() * worldSize, angle: Math.random() * Math.PI * 2, state: 'idle', flap: 0 });
            for (let i = 0; i < 15; i++) scrapBeetles.push({ x: Math.random() * worldSize, y: Math.random() * worldSize, angle: Math.random() * Math.PI * 2, speed: 0.2 + Math.random() * 0.3 });
            for (let i = 0; i < 12; i++) radioactiveSlugs.push({ x: Math.random() * worldSize, y: Math.random() * worldSize, angle: Math.random() * Math.PI * 2, trailTimer: 0 });
        }
        mutatedCrows.forEach(c => {
            if (applyFlee(c, 250, 8)) {
                c.flap += 0.4 * dt;
            } else {
                c.flap = 0;
            }
        });
        scrapBeetles.forEach(b => {
            b.x += Math.cos(b.angle) * b.speed * dt;
            b.y += Math.sin(b.angle) * b.speed * dt;
            if (Math.random() > 0.99) b.angle += (Math.random()-0.5) * 1;
        });
        radioactiveSlugs.forEach(s => {
            s.x += Math.cos(s.angle) * 0.1 * dt;
            s.y += Math.sin(s.angle) * 0.1 * dt;
            if (Math.random() > 0.99) s.angle += (Math.random()-0.5) * 2;
            
            s.trailTimer -= dt;
            if (s.trailTimer <= 0) {
                particles.push({
                    x: s.x, y: s.y,
                    vx: 0, vy: 0,
                    life: 1.0, color: 'rgba(74, 226, 74, 0.3)',
                    size: 3, isSlugTrail: true
                });
                s.trailTimer = 20;
            }
        });
    }
}

function drawEnvironmentalLife() {
    const currentBiome = gameState.zones && gameState.zones[0] ? (gameState.zones[0].t || gameState.zones[0].type) : 'RANDOM';
    
    const isVisible = (obj, pad = 20) => {
        return obj.x > camera.x - pad && obj.x < camera.x + canvas.width + pad && 
               obj.y > camera.y - pad && obj.y < camera.y + canvas.height + pad;
    };

    // 1. DESERT
    if (currentBiome === 'DESERT') {
        lizards.forEach(l => {
            if (isVisible(l)) {
                ctx.save();
                ctx.translate(l.x, l.y);
                ctx.rotate(l.angle);
                ctx.fillStyle = '#8a8d4a';
                ctx.beginPath(); ctx.ellipse(0, 0, 6, 3, 0, 0, Math.PI * 2); ctx.fill();
                ctx.strokeStyle = '#8a8d4a'; ctx.lineWidth = 1.5;
                ctx.beginPath(); ctx.moveTo(-6, 0); ctx.quadraticCurveTo(-10, Math.sin(renderTime*0.01)*3, -15, 0); ctx.stroke();
                ctx.restore();
            }
        });
        scorpions.forEach(s => {
            if (isVisible(s)) {
                ctx.save();
                ctx.translate(s.x, s.y);
                ctx.rotate(s.angle);
                ctx.fillStyle = '#6d4c41';
                ctx.beginPath(); ctx.ellipse(0, 0, 5, 4, 0, 0, Math.PI * 2); ctx.fill();
                // Tail
                ctx.strokeStyle = '#6d4c41'; ctx.lineWidth = 2;
                ctx.beginPath(); ctx.moveTo(-5, 0); ctx.quadraticCurveTo(-12, -10, -8, -15); ctx.stroke();
                // Stinger
                ctx.fillStyle = '#3e2723'; ctx.beginPath(); ctx.arc(-8, -15, 1.5, 0, Math.PI * 2); ctx.fill();
                ctx.restore();
            }
        });
        vultures.forEach(v => {
            // Only draw shadow on ground
            const sx = v.x + Math.cos(v.angle) * v.radius;
            const sy = v.y + Math.sin(v.angle) * v.radius;
            if (isVisible({x: sx, y: sy}, 100)) {
                ctx.save();
                ctx.translate(sx, sy);
                ctx.rotate(v.angle + Math.PI/2);
                ctx.fillStyle = 'rgba(0,0,0,0.15)';
                ctx.beginPath();
                ctx.ellipse(0, 0, 25, 12, 0, 0, Math.PI * 2);
                ctx.fill();
                ctx.restore();
            }
        });
    }

    // 2. URBAN
    if (currentBiome === 'URBAN') {
        pigeons.forEach(p => {
            if (isVisible(p)) {
                ctx.save();
                ctx.translate(p.x, p.y);
                ctx.rotate(p.angle);
                // Body
                ctx.fillStyle = '#808080';
                ctx.beginPath(); ctx.ellipse(0, 0, 7, 5, 0, 0, Math.PI * 2); ctx.fill();
                // Iridescent neck
                ctx.fillStyle = '#4b0082'; ctx.beginPath(); ctx.arc(4, 0, 3, 0, Math.PI * 2); ctx.fill();
                // Wings (flapping if flying)
                if (p.state === 'flying') {
                    const flap = Math.sin(p.wingPhase) * 10;
                    ctx.strokeStyle = '#999'; ctx.lineWidth = 2;
                    ctx.beginPath(); ctx.moveTo(0,0); ctx.lineTo(-2, flap); ctx.moveTo(0,0); ctx.lineTo(-2, -flap); ctx.stroke();
                }
                ctx.restore();
            }
        });
        strayCats.forEach(c => {
            if (isVisible(c)) {
                ctx.save();
                ctx.translate(c.x, c.y);
                ctx.rotate(c.angle);
                ctx.fillStyle = '#333';
                ctx.beginPath(); ctx.roundRect(-8, -4, 16, 8, 4); ctx.fill();
                // Head
                ctx.beginPath(); ctx.arc(8, 0, 5, 0, Math.PI * 2); ctx.fill();
                // Eyes (Glowy)
                ctx.fillStyle = '#00ff00'; ctx.beginPath(); ctx.arc(9, -2, 1, 0, Math.PI * 2); ctx.fill(); ctx.beginPath(); ctx.arc(9, 2, 1, 0, Math.PI * 2); ctx.fill();
                // Tail
                ctx.strokeStyle = '#333'; ctx.lineWidth = 1.5;
                ctx.beginPath(); ctx.moveTo(-8, 0); ctx.quadraticCurveTo(-15, Math.sin(renderTime*0.005)*10, -20, 0); ctx.stroke();
                ctx.restore();
            }
        });
        cockroaches.forEach(c => {
            if (isVisible(c, 5)) {
                ctx.fillStyle = '#3e2723';
                ctx.fillRect(c.x - 2, c.y - 1, 4, 2);
            }
        });
    }

    // 3. INDUSTRIAL
    if (currentBiome === 'INDUSTRIAL') {
        rats.forEach(r => {
            if (isVisible(r)) {
                ctx.save();
                ctx.translate(r.x, r.y);
                ctx.rotate(r.angle);
                ctx.fillStyle = '#4a372d';
                ctx.beginPath(); ctx.ellipse(0, 0, 5, 3, 0, 0, Math.PI * 2); ctx.fill();
                // Pink tail
                ctx.strokeStyle = '#ff80ab'; ctx.lineWidth = 1;
                ctx.beginPath(); ctx.moveTo(-5, 0); ctx.lineTo(-12, Math.sin(renderTime*0.02)*2); ctx.stroke();
                ctx.restore();
            }
        });
        microDrones.forEach(d => {
            if (isVisible(d)) {
                ctx.save();
                ctx.translate(d.x, d.y);
                ctx.fillStyle = '#111'; ctx.strokeStyle = '#00f2ff'; ctx.lineWidth = 1;
                ctx.beginPath(); ctx.arc(0, 0, 5, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
                // Neon eye
                ctx.fillStyle = '#00f2ff'; ctx.beginPath(); ctx.arc(2, 0, 1.5, 0, Math.PI * 2); ctx.fill();
                ctx.restore();
            }
        });
        moths.forEach(m => {
            if (isVisible(m, 5)) {
                const flicker = Math.random() > 0.5 ? 1 : 0.5;
                ctx.fillStyle = `rgba(255,255,255, ${flicker * 0.8})`;
                ctx.beginPath(); ctx.arc(m.x, m.y, 1.5, 0, Math.PI * 2); ctx.fill();
            }
        });
    }

    // 4. TUNDRA
    if (currentBiome === 'TUNDRA') {
        snowHares.forEach(h => {
            if (isVisible(h)) {
                ctx.save();
                ctx.translate(h.x, h.y - Math.abs(Math.sin(h.jump) * 8));
                ctx.rotate(h.angle);
                ctx.fillStyle = '#fff';
                ctx.beginPath(); ctx.ellipse(0, 0, 7, 5, 0, 0, Math.PI * 2); ctx.fill();
                // Ears
                ctx.beginPath(); ctx.ellipse(-2, -4, 2, 6, 0.2, 0, Math.PI * 2); ctx.fill();
                ctx.beginPath(); ctx.ellipse(-2, 4, 2, 6, -0.2, 0, Math.PI * 2); ctx.fill();
                ctx.restore();
            }
        });
        penguins.forEach(p => {
            if (isVisible(p)) {
                ctx.save();
                ctx.translate(p.x, p.y);
                if (p.state === 'sliding') {
                    ctx.rotate(p.angle);
                    ctx.fillStyle = '#111';
                    ctx.beginPath(); ctx.ellipse(0, 0, 12, 6, 0, 0, Math.PI * 2); ctx.fill();
                    ctx.fillStyle = '#fff';
                    ctx.beginPath(); ctx.ellipse(2, 0, 8, 4, 0, 0, Math.PI * 2); ctx.fill();
                } else {
                    const tilt = Math.sin(p.waddle) * 0.2;
                    ctx.rotate(tilt);
                    ctx.fillStyle = '#111';
                    ctx.beginPath(); ctx.ellipse(0, 0, 8, 10, 0, 0, Math.PI * 2); ctx.fill();
                    ctx.fillStyle = '#fff';
                    ctx.beginPath(); ctx.ellipse(0, 2, 5, 7, 0, 0, Math.PI * 2); ctx.fill();
                    // Beak
                    ctx.fillStyle = '#ff9800'; ctx.beginPath(); ctx.moveTo(0, -10); ctx.lineTo(4, -8); ctx.lineTo(0, -6); ctx.fill();
                }
                ctx.restore();
            }
        });
        arcticFoxes.forEach(f => {
            if (isVisible(f)) {
                ctx.save();
                ctx.translate(f.x, f.y);
                ctx.rotate(f.angle);
                ctx.fillStyle = '#fff';
                ctx.beginPath(); ctx.roundRect(-10, -5, 20, 10, 5); ctx.fill();
                // Bushy tail
                ctx.beginPath(); ctx.ellipse(-12, 0, 8, 4, 0, 0, Math.PI * 2); ctx.fill();
                ctx.restore();
            }
        });
    }

    // 5. WETLAND
    if (currentBiome === 'WETLAND') {
        dragonflies.forEach(d => {
            if (isVisible(d)) {
                ctx.save();
                ctx.translate(d.x, d.y);
                ctx.rotate(Math.atan2(d.vy, d.vx));
                ctx.fillStyle = '#00f2ff';
                ctx.fillRect(-4, -1, 8, 2);
                const wingW = Math.sin(renderTime * 0.5) * 8;
                ctx.strokeStyle = 'rgba(255,255,255,0.4)';
                ctx.beginPath(); ctx.moveTo(0,0); ctx.lineTo(2, wingW); ctx.moveTo(0,0); ctx.lineTo(2, -wingW); ctx.stroke();
                ctx.restore();
            }
        });
        frogs.forEach(f => {
            if (isVisible(f)) {
                ctx.save();
                const jumpY = Math.abs(Math.sin(f.jump) * 10);
                ctx.translate(f.x, f.y - jumpY);
                ctx.rotate(f.angle);
                ctx.fillStyle = '#4caf50';
                ctx.beginPath(); ctx.ellipse(0, 0, 8, 6, 0, 0, Math.PI * 2); ctx.fill();
                // Eyes
                ctx.fillStyle = '#000'; ctx.beginPath(); ctx.arc(4, -3, 2, 0, Math.PI * 2); ctx.fill(); ctx.beginPath(); ctx.arc(4, 3, 2, 0, Math.PI * 2); ctx.fill();
                ctx.restore();
            }
        });
        waterStriders.forEach(s => {
            if (isVisible(s)) {
                ctx.save();
                ctx.translate(s.x, s.y);
                ctx.strokeStyle = 'rgba(0,0,0,0.4)'; ctx.lineWidth = 1;
                for (let i = 0; i < 4; i++) {
                    const ang = (i / 4) * Math.PI * 2 + renderTime * 0.01;
                    ctx.beginPath(); ctx.moveTo(0,0); ctx.lineTo(Math.cos(ang) * 6, Math.sin(ang) * 6); ctx.stroke();
                }
                ctx.restore();
            }
        });
    }

    // 6. WASTELAND
    if (currentBiome === 'WASTELAND') {
        mutatedCrows.forEach(c => {
            if (isVisible(c)) {
                ctx.save();
                ctx.translate(c.x, c.y);
                ctx.rotate(c.angle);
                ctx.fillStyle = '#1a1a1a';
                ctx.beginPath(); ctx.ellipse(0, 0, 8, 4, 0, 0, Math.PI * 2); ctx.fill();
                // Glowing eye
                if (Math.random() > 0.9) { ctx.fillStyle = '#ff0000'; ctx.beginPath(); ctx.arc(6, -1, 1, 0, Math.PI * 2); ctx.fill(); }
                // Wings
                const flap = Math.sin(c.flap) * 12;
                ctx.strokeStyle = '#111'; ctx.lineWidth = 3;
                ctx.beginPath(); ctx.moveTo(0,0); ctx.lineTo(-4, flap); ctx.moveTo(0,0); ctx.lineTo(-4, -flap); ctx.stroke();
                ctx.restore();
            }
        });
        scrapBeetles.forEach(b => {
            if (isVisible(b)) {
                ctx.save();
                ctx.translate(b.x, b.y);
                ctx.rotate(b.angle);
                const bGrad = ctx.createLinearGradient(-5, 0, 5, 0);
                bGrad.addColorStop(0, '#2c3e50'); bGrad.addColorStop(1, '#16a085');
                ctx.fillStyle = bGrad;
                ctx.beginPath(); ctx.ellipse(0, 0, 8, 6, 0, 0, Math.PI * 2); ctx.fill();
                // Shell split
                ctx.strokeStyle = 'rgba(0,0,0,0.3)'; ctx.lineWidth = 1;
                ctx.beginPath(); ctx.moveTo(-8, 0); ctx.lineTo(8, 0); ctx.stroke();
                ctx.restore();
            }
        });
        radioactiveSlugs.forEach(s => {
            if (isVisible(s)) {
                ctx.save();
                ctx.translate(s.x, s.y);
                ctx.rotate(s.angle);
                ctx.fillStyle = '#4ae24a';
                ctx.beginPath(); ctx.ellipse(0, 0, 10, 4, 0, 0, Math.PI * 2); ctx.fill();
                // Glow
                ctx.shadowBlur = 10; ctx.shadowColor = '#4ae24a';
                ctx.beginPath(); ctx.ellipse(0, 0, 6, 2, 0, 0, Math.PI * 2); ctx.fill();
                ctx.restore();
            }
        });
    }
}

function drawWorldBorders() {
    const ws = gameState.worldSize || 4000;
    const pulse = 0.8 + Math.sin(renderTime * 0.002) * 0.2;
    
    ctx.save();
    // 1. Outer Glow
    ctx.strokeStyle = 'rgba(0, 242, 255, 0.15)';
    ctx.lineWidth = 30 * pulse;
    ctx.strokeRect(-15, -15, ws + 30, ws + 30);
    
    // 2. Main Energy Line
    ctx.strokeStyle = '#00f2ff';
    ctx.lineWidth = 4;
    ctx.shadowBlur = 20 * pulse;
    ctx.shadowColor = '#00f2ff';
    ctx.strokeRect(0, 0, ws, ws);
    
    // 3. Corner Accents
    ctx.lineWidth = 12;
    const len = 120;
    // TL
    ctx.beginPath(); ctx.moveTo(0, len); ctx.lineTo(0, 0); ctx.lineTo(len, 0); ctx.stroke();
    // TR
    ctx.beginPath(); ctx.moveTo(ws - len, 0); ctx.lineTo(ws, 0); ctx.lineTo(ws, len); ctx.stroke();
    // BL
    ctx.beginPath(); ctx.moveTo(0, ws - len); ctx.lineTo(0, ws); ctx.lineTo(len, ws); ctx.stroke();
    // BR
    ctx.beginPath(); ctx.moveTo(ws - len, ws); ctx.lineTo(ws, ws); ctx.lineTo(ws, ws - len); ctx.stroke();
    
    ctx.restore();
}
