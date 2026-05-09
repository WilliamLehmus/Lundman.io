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
            color: '#333',
            size: 15 + Math.random() * 20
        });
    }
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
            speed: 0.012, 
            turnSpeed: 0.08,
            mass: 10,
            slots: 6,
            allowedWeapons: ALL_WEAPONS,
            weapons: ['HEAVY_GUN', 'TESLA', 'FLAMETHROWER', 'WATER_CANNON', 'FROST_GUN', 'DIRT_GUN']
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
let urbanTrash = []; // Blowing paper/newspapers
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
    const hitColor = data.targetLabel === 'element' ? '#fff' : (isTank ? '#ff0000' : '#ffcc00');
    spawnParticles(data.x, data.y, hitColor, 8);
    
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

// Audio setup
const optionsMenu = document.getElementById('options-menu');
const shopMenu = document.getElementById('shop-menu');
const musicSlider = document.getElementById('music-volume');
const sfxSlider = document.getElementById('sfx-volume');
const closeOptionsBtn = document.getElementById('close-options');
const closeShopBtn = document.getElementById('close-shop');
const openShopBtn = document.getElementById('open-shop-btn');

if (openShopBtn) {
    openShopBtn.addEventListener('click', () => {
        if (shopMenu) {
            const isHidden = shopMenu.style.display === 'none' || shopMenu.style.display === '';
            shopMenu.style.display = isHidden ? 'flex' : 'none';
            if (isHidden) {
                updateShopUI();
            }
        }
    });
}

const musicTracks = [
    new Audio('/music_track1.mp3'),
    new Audio('/music_track2.mp3'),
    new Audio('/music_track3.mp3')
];
const shotSFX = new Audio('/tank_shot.mp3');
const flameSFX = new Audio('/flamethrower.mp3');
const teslaSFX = new Audio('/tesla_gun.mp3');

let currentMusicIndex = 0;
let musicVolume = parseFloat(localStorage.getItem('tanks_music_vol')) || 0.5;
let sfxVolume = parseFloat(localStorage.getItem('tanks_sfx_vol')) || 0.7;
let isMuted = localStorage.getItem('tanks_is_muted') === 'true';
let isMenuOpen = false;
let isShopOpen = false;

function setupAudio() {
    const currentMusicVol = isMuted ? 0 : musicVolume;
    const currentSfxVol = isMuted ? 0 : sfxVolume;

    musicTracks.forEach(track => {
        track.loop = false;
        track.volume = currentMusicVol;
        track.onended = () => {
            currentMusicIndex = (currentMusicIndex + 1) % musicTracks.length;
            playMusic();
        };
    });
    shotSFX.volume = currentSfxVol;
    flameSFX.volume = currentSfxVol;
    teslaSFX.volume = currentSfxVol;

    syncAudioUI();
}

function playMusic() {
    if (isMuted) return;
    const track = musicTracks[currentMusicIndex];
    track.play().catch(e => console.log("Audio play blocked until interaction"));
}

function playWeaponSound(weaponType, x, y) {
    if (isMuted) return;
    // Spatial volume based on distance to camera
    const dist = Math.hypot(x - (camera.x + canvas.width/2), y - (camera.y + canvas.height/2));
    const spatialVol = Math.max(0, 1 - (dist / 1500));
    const finalVol = sfxVolume * spatialVol;
    
    if (finalVol <= 0.01) return;

    let sfx;
    if (weaponType === 'FLAMETHROWER') {
        sfx = flameSFX.cloneNode();
    } else if (weaponType === 'TESLA') {
        sfx = teslaSFX.cloneNode();
    } else {
        sfx = shotSFX.cloneNode();
    }
    
    sfx.volume = finalVol;
    
    // Pitch shifting for specialized weapons using generic shot
    if (weaponType === 'ARTILLERY') {
        sfx.playbackRate = 0.7; // Deep heavy boom
    } else if (weaponType === 'STANDARD' || weaponType === 'HEAVY_GUN') {
        sfx.playbackRate = 0.9 + Math.random() * 0.2; // Slight variation
    }
    
    sfx.play();
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
        
        const currentMusicVol = isMuted ? 0 : musicVolume;
        const currentSfxVol = isMuted ? 0 : sfxVolume;
        
        musicTracks.forEach(t => t.volume = currentMusicVol);
        shotSFX.volume = currentSfxVol;
        flameSFX.volume = currentSfxVol;
        teslaSFX.volume = currentSfxVol;
        
        if (!isMuted) {
            playMusic();
        }
        
        syncAudioUI();
    };
}

if (musicSlider) musicSlider.oninput = (e) => {
    musicVolume = parseFloat(e.target.value);
    if (!isMuted) {
        musicTracks.forEach(t => t.volume = musicVolume);
    }
    localStorage.setItem('tanks_music_vol', musicVolume);
};

if (sfxSlider) sfxSlider.oninput = (e) => {
    sfxVolume = parseFloat(e.target.value);
    if (!isMuted) {
        shotSFX.volume = sfxVolume;
        flameSFX.volume = sfxVolume;
        teslaSFX.volume = sfxVolume;
    }
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
    DIRT_GUN: 'DIRT', TESLA: 'ARC', FROST_GUN: 'ICE', HEAVY_GUN: 'HVY'
};

function getWeaponIcon(weaponType) {
    const name = weaponType.toUpperCase();
    if (name.includes('STANDARD')) return 'assets/icon_standard.png';
    if (name.includes('HEAVY')) return 'assets/icon_launcher.png';
    if (name.includes('FLAME')) return 'assets/icon_flame.png';
    if (name.includes('WATER')) return 'assets/icon_water.png';
    if (name.includes('TESLA')) return 'assets/icon_tesla.png';
    if (name.includes('FROST')) return 'assets/icon_frost.png';
    if (name.includes('DIRT')) return 'assets/icon_dirt.png';
    if (name.includes('SHOTGUN')) return 'assets/icon_shotgun.png';
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
    }
}

// Socket Events
socket.on('connect', () => {
    console.log('Socket connected:', socket.id);
    myId = socket.id;
});

function updateLobbyUI(id, players) {
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
            stats.innerHTML = `<span>HP: ${config.hp}</span><span>SLOTS: ${config.slots}</span>`;
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
                `;
                slot.appendChild(info);

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

    // Update Ready Button
    if (readyBtn) {
        const myPlayer = players.find(p => p.id === myId);
        if (myPlayer) {
            readyBtn.innerText = myPlayer.ready ? 'NOT READY' : 'READY';
            readyBtn.classList.toggle('ready-active', myPlayer.ready);
        }
    }
}

socket.on('lobby-update', ({ id, players }) => {
    splashScreen.classList.add('hidden');
    lobbyScreen.classList.remove('hidden');
    updateLobbyUI(id, players);
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

socket.on('lobby-reset', ({ id, players }) => {
    gameActive = false;
    gameOverScreen.classList.add('hidden');
    hud.classList.add('hidden');
    lobbyScreen.classList.remove('hidden');
    updateLobbyUI(id, players);
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
            if (weaponContainer.children.length !== me.sl.length) {
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

        const currentBiome = gameState.zones && gameState.zones[0] ? (gameState.zones[0].t || gameState.zones[0].type) : 'RANDOM';

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
            updateAtmosphere(dt);
            updateEnvironmentalObjects(dt);
            updateEnvironmentalLife(dt);
            drawAtmosphere();
            drawEnvironmentalObjects();
        }

        drawWorldBorders();
        drawEnvironmentalLife();

        if (ENABLE_PREMIUM_VISUALS && currentBiome === 'INDUSTRIAL') {
            drawIndustrialAtmosphere();
        }
        if (ENABLE_PREMIUM_VISUALS && currentBiome === 'URBAN') {
            drawUrbanAtmosphere();
        }

        drawElements();
        drawGuardians();
        updateBulletTrails();
        drawBulletTrails();
        drawBullets();

        gameState.players.forEach(p => {
            drawTank(p);
            // NEW: Dust & Vapor particles when moving
            if (ENABLE_PREMIUM_VISUALS && renderTime % 4 < 1) { 
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

    // Urban & Industrial Road/Floor Markings
    if (currentBiome === 'URBAN' || currentBiome === 'INDUSTRIAL') {
        ctx.save();
        const isInd = currentBiome === 'INDUSTRIAL';
        ctx.strokeStyle = isInd ? 'rgba(0, 242, 255, 0.08)' : 'rgba(0, 242, 255, 0.05)';
        ctx.lineWidth = 1;
        
        // Facility Floor Plates / Grid
        for (let i = 0; i < worldSize; i += 400) {
            ctx.beginPath();
            ctx.moveTo(i, 0); ctx.lineTo(i, worldSize);
            ctx.moveTo(0, i); ctx.lineTo(worldSize, i);
            ctx.stroke();
            
            if (isInd && ENABLE_PREMIUM_VISUALS) {
                // 1. Energy Conduits (Pulsing neon lines along the grid)
                const pulse = 0.3 + Math.sin(renderTime * 0.002 + i) * 0.2;
                ctx.save();
                ctx.strokeStyle = '#00f2ff';
                ctx.globalAlpha = pulse;
                ctx.lineWidth = 2;
                ctx.shadowBlur = 10;
                ctx.shadowColor = '#00f2ff';
                
                // Horizontal conduit
                ctx.beginPath(); ctx.moveTo(0, i + 200); ctx.lineTo(worldSize, i + 200); ctx.stroke();
                // Vertical conduit
                ctx.beginPath(); ctx.moveTo(i + 200, 0); ctx.lineTo(i + 200, worldSize); ctx.stroke();
                ctx.restore();

                // 2. Facility Markings (Zone IDs, Arrows)
                ctx.fillStyle = 'rgba(255, 255, 255, 0.04)';
                ctx.font = 'bold 24px Outfit';
                ctx.textAlign = 'center';
                for (let j = 0; j < worldSize; j += 800) {
                    const zoneId = `SEC-${Math.floor(i/400).toString().padStart(2, '0')}-${Math.floor(j/800).toString().padStart(2, '0')}`;
                    ctx.fillText(zoneId, i + 200, j + 200);
                    
                    // Directional Arrows
                    ctx.save();
                    ctx.translate(i + 100, j + 100);
                    ctx.rotate(Math.PI / 4);
                    ctx.beginPath();
                    ctx.moveTo(0, -10); ctx.lineTo(10, 0); ctx.lineTo(0, 10); ctx.stroke();
                    ctx.restore();
                }
            } else if (currentBiome === 'URBAN') {
                // Urban Road Infrastructure (Grid intersections)
                const gridStep = 400;
                ctx.save();
                
                // 1. Manhole Covers
                for (let j = 0; j < worldSize; j += 800) {
                    const seed = i + j + 555;
                    if (getStableRandom(seed) > 0.3) {
                        const mx = i + 120; const my = j + 120;
                        // Outer Ring
                        ctx.fillStyle = '#1a1a1a'; ctx.beginPath(); ctx.arc(mx, my, 16, 0, Math.PI*2); ctx.fill();
                        ctx.strokeStyle = '#333'; ctx.lineWidth = 2; ctx.stroke();
                        // Inner Pattern
                        ctx.strokeStyle = '#222'; ctx.lineWidth = 1;
                        for(let r=0; r<8; r++) {
                            const ang = r * Math.PI/4;
                            ctx.beginPath(); ctx.moveTo(mx + Math.cos(ang)*4, my + Math.sin(ang)*4); 
                            ctx.lineTo(mx + Math.cos(ang)*14, my + Math.sin(ang)*14); ctx.stroke();
                        }
                        // NYC Steam
                        if (ENABLE_PREMIUM_VISUALS && Math.random() > 0.96) {
                            particles.push({
                                x: mx, y: my, vx: (Math.random()-0.5)*0.3, vy: -0.5 - Math.random()*0.5,
                                life: 1.5, color: 'rgba(200, 200, 255, 0.2)', size: 8 + Math.random()*12,
                                isSteam: true
                            });
                        }
                    }
                }

                // 2. Street Lamp Posts (Visible Infrastructure)
                if (ENABLE_PREMIUM_VISUALS) {
                    for (let j = 0; j < worldSize; j += 400) {
                        // The Base/Pole (Visible from top)
                        ctx.fillStyle = '#0a0a0a'; ctx.beginPath(); ctx.arc(i, j, 10, 0, Math.PI*2); ctx.fill();
                        ctx.strokeStyle = '#222'; ctx.lineWidth = 2; ctx.stroke();
                        
                        // The Lamp Core (Vibrant Neon)
                        ctx.fillStyle = '#00f2ff'; ctx.shadowBlur = 15; ctx.shadowColor = '#00f2ff';
                        ctx.beginPath(); ctx.arc(i, j, 5, 0, Math.PI*2); ctx.fill();
                        ctx.shadowBlur = 0;
                        
                        // The Street Glow (Larger Area)
                        const lGrad = ctx.createRadialGradient(i, j, 0, i, j, 180);
                        lGrad.addColorStop(0, 'rgba(0, 242, 255, 0.12)');
                        lGrad.addColorStop(0.6, 'rgba(0, 242, 255, 0.04)');
                        lGrad.addColorStop(1, 'rgba(0, 0, 0, 0)');
                        ctx.fillStyle = lGrad;
                        ctx.beginPath(); ctx.arc(i, j, 180, 0, Math.PI*2); ctx.fill();
                    }
                }

                // 3. Crosswalks (Higher visibility)
                ctx.fillStyle = 'rgba(255, 255, 255, 0.06)';
                for (let j = 0; j < worldSize; j += 800) {
                    for (let k = 0; k < 6; k++) {
                        ctx.fillRect(i + 140 + k*18, j + 380, 10, 45);
                        ctx.fillRect(j + 380, i + 140 + k*18, 45, 10);
                    }
                }
                ctx.restore();
            }
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
        urbanTrash = [];
        environmentalObjects = [];
        lastBiome = currentBiome;
        lastWorldSize = worldSize;
    }

    if (currentBiome === 'URBAN' || currentBiome === 'INDUSTRIAL') {
        const isIndustrial = currentBiome === 'INDUSTRIAL';
        // 1. Base floor
        ctx.fillStyle = isIndustrial ? '#1e1e24' : '#08080c';
        ctx.fillRect(0, 0, worldSize, worldSize);

        // 1.1 INDUSTRIAL Details
        if (isIndustrial) {
            // Diamond Plate Texture (Subtle)
            ctx.strokeStyle = 'rgba(255,255,255,0.03)';
            ctx.lineWidth = 1;
            const plateSize = 250;
            for (let x = 0; x < worldSize; x += plateSize) {
                for (let y = 0; y < worldSize; y += plateSize) {
                    ctx.beginPath();
                    ctx.moveTo(x + 10, y + 10); ctx.lineTo(x + 30, y + 30);
                    ctx.moveTo(x + 30, y + 10); ctx.lineTo(x + 10, y + 30);
                    ctx.stroke();
                }
            }

            // 1.2 Power Cables (Pulsing neon)
            if (ENABLE_PREMIUM_VISUALS) {
                const cablePulse = 0.05 + Math.sin(Date.now() * 0.0015) * 0.04;
                ctx.save();
                ctx.lineWidth = 5;
                ctx.strokeStyle = `rgba(0, 242, 255, ${cablePulse})`;
                ctx.shadowBlur = 12 * (cablePulse * 12);
                ctx.shadowColor = '#00f2ff';
                const spacing = 1000;
                for (let g = 500; g < worldSize; g += spacing) {
                    ctx.beginPath();
                    ctx.moveTo(g, 0);
                    for (let cy = 0; cy < worldSize; cy += 300) ctx.lineTo(g + Math.sin(cy/200 + g)*25, cy);
                    ctx.stroke();
                    ctx.beginPath();
                    ctx.moveTo(0, g);
                    for (let cx = 0; cx < worldSize; cx += 300) ctx.lineTo(cx, g + Math.cos(cx/250 + g)*25);
                    ctx.stroke();
                }
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
                    ctx.fillStyle = '#1a1a25';
                    ctx.beginPath();
                    ctx.roundRect(x, y, blockSize + 20, blockSize + 20, 10);
                    ctx.fill();
                    
                    ctx.strokeStyle = 'rgba(255,255,255,0.03)';
                    ctx.strokeRect(x, y, blockSize + 20, blockSize + 20);
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

    // PASS 1: Drawing Bodies & Foundations (Layer 0)
    gameState.elements.forEach(e => {
        ctx.save();
        const config = MATERIAL_PROPERTIES[e.t] || { color: '#fff' };
        
        if (e.t === MATERIALS.BUILDING) {
            const isIndustrial = currentBiome === 'INDUSTRIAL';
            const isWasteland = currentBiome === 'WASTELAND';
            const isTundra = currentBiome === 'TUNDRA';
            const isWetland = currentBiome === 'WETLAND';
            const isUrban = currentBiome === 'URBAN';
            const isDesert = currentBiome === 'DESERT';

            // 1. Building Shadow
            ctx.fillStyle = isDesert ? 'rgba(61, 43, 31, 0.6)' : 'rgba(0, 0, 0, 0.5)';
            ctx.beginPath();
            if (isIndustrial && e.sh === 'circle') ctx.ellipse(e.x + 10, e.y + 10, e.w/2, e.h/2, 0, 0, Math.PI * 2);
            else ctx.roundRect(e.x - e.w/2 + 8, e.y - e.h/2 + 8, e.w, e.h, 6);
            ctx.fill();

            // 2. Main Building Body
            const bGradient = isIndustrial && e.sh === 'circle' ? 
                ctx.createRadialGradient(e.x - e.w/4, e.y - e.h/4, 0, e.x, e.y, e.w/2) :
                ctx.createLinearGradient(e.x, e.y - e.h/2, e.x, e.y + e.h/2);

            if (isWasteland) { bGradient.addColorStop(0, '#3a2a1a'); bGradient.addColorStop(1, '#1a100a'); }
            else if (isIndustrial) {
                if (e.sh === 'circle') { bGradient.addColorStop(0, '#3a3a4a'); bGradient.addColorStop(0.6, '#1a1a25'); bGradient.addColorStop(1, '#020205'); }
                else { bGradient.addColorStop(0, '#1a1a25'); bGradient.addColorStop(1, '#05050a'); }
            } else if (isUrban) { bGradient.addColorStop(0, '#10101a'); bGradient.addColorStop(1, '#020205'); }
            else if (isTundra) { bGradient.addColorStop(0, '#3a4a5a'); bGradient.addColorStop(1, '#050c12'); }
            else if (isDesert) { bGradient.addColorStop(0, '#c2b280'); bGradient.addColorStop(0.4, '#a68a64'); bGradient.addColorStop(1, '#7a5c43'); }
            else if (isWetland) { bGradient.addColorStop(0, '#2d1a0f'); bGradient.addColorStop(1, '#0d0805'); }
            else { bGradient.addColorStop(0, '#252535'); bGradient.addColorStop(1, '#151520'); }
            
            ctx.fillStyle = bGradient;
            ctx.strokeStyle = isWasteland ? 'rgba(150, 80, 50, 0.5)' : (isIndustrial ? '#333' : (isTundra ? 'rgba(200, 240, 255, 0.6)' : (isDesert ? '#5d4a37' : (isWetland ? '#1a2a1a' : 'rgba(0, 242, 255, 0.6)'))));
            ctx.lineWidth = 2;
            ctx.beginPath();
            if (e.sh === 'pyramid') ctx.rect(e.x - e.w/2, e.y - e.h/2, e.w, e.h);
            else if (e.sh === 'circle') ctx.ellipse(e.x, e.y, e.w/2, e.h/2, 0, 0, Math.PI * 2);
            else ctx.roundRect(e.x - e.w/2, e.y - e.h/2, e.w, e.h, 6);
            ctx.fill();
            ctx.stroke();

            // Pyramid Facets
            if (e.sh === 'pyramid') {
                ctx.strokeStyle = 'rgba(0,0,0,0.15)'; ctx.lineWidth = 1;
                ctx.beginPath();
                ctx.moveTo(e.x - e.w/2, e.y - e.h/2); ctx.lineTo(e.x + e.w/2, e.y + e.h/2);
                ctx.moveTo(e.x + e.w/2, e.y - e.h/2); ctx.lineTo(e.x - e.w/2, e.y + e.h/2);
                ctx.stroke();
            }
        } else if (e.t === MATERIALS.SCRAP) {
            ctx.translate(e.x, e.y);
            ctx.rotate(Date.now() / 1000);
            ctx.fillStyle = config.color;
            ctx.beginPath();
            for (let i = 0; i < 6; i++) {
                const angle = (i / 6) * Math.PI * 2;
                const r = i % 2 === 0 ? 12 : 8;
                ctx.lineTo(Math.cos(angle) * r, Math.sin(angle) * r);
            }
            ctx.closePath(); ctx.fill(); ctx.strokeStyle = '#fff'; ctx.lineWidth = 1; ctx.stroke();
        } else if (e.t === MATERIALS.BARREL_EXPLOSIVE || e.t === MATERIALS.BARREL_OIL) {
            ctx.translate(e.x, e.y);
            ctx.fillStyle = 'rgba(0,0,0,0.6)'; ctx.beginPath(); ctx.ellipse(5, 5, e.w/2 + 2, e.h/2 + 2, 0, 0, Math.PI*2); ctx.fill();
            const bGrad = ctx.createLinearGradient(-e.w/2, 0, e.w/2, 0);
            bGrad.addColorStop(0, config.color); bGrad.addColorStop(0.5, 'rgba(255,255,255,0.5)'); bGrad.addColorStop(1, '#000');
            ctx.fillStyle = bGrad; ctx.strokeStyle = '#111'; ctx.lineWidth = 2;
            ctx.beginPath(); ctx.roundRect(-e.w/2, -e.h/2, e.w, e.h, 4); ctx.fill(); ctx.stroke();
        } else if (e.t === MATERIALS.CRATE) {
            ctx.translate(e.x, e.y);
            ctx.fillStyle = 'rgba(0,0,0,0.4)'; ctx.fillRect(-e.w/2 + 5, -e.h/2 + 5, e.w, e.h);
            ctx.fillStyle = config.color; ctx.strokeStyle = '#222'; ctx.lineWidth = 2;
            ctx.beginPath(); ctx.roundRect(-e.w/2, -e.h/2, e.w, e.h, 3); ctx.fill(); ctx.stroke();
        } else {
            const isLiquid = [MATERIALS.WATER, MATERIALS.OIL, MATERIALS.DIRT, MATERIALS.ELECTRIC, MATERIALS.ICE, MATERIALS.ACID, MATERIALS.FIRE, MATERIALS.QUICKSAND].includes(e.t);
            const isCloud = [MATERIALS.GAS, MATERIALS.STEAM].includes(e.t);
            const drawRadius = e.w * 0.5 * (1.0 + Math.sin(renderTime * 0.002 + e.id) * 0.03);

            if (isLiquid) {
                ctx.fillStyle = config.color;
                drawOrganicPath(ctx, e.x, e.y, drawRadius, e.id); ctx.fill();
            } else if (isCloud) {
                ctx.save();
                ctx.fillStyle = config.color; ctx.globalAlpha = 0.4;
                drawOrganicPath(ctx, e.x, e.y, drawRadius * 1.2, e.id); ctx.fill();
                ctx.restore();
            }
        }
        ctx.restore();
    });

    // PASS 2: Drawing Surface Details (Layer 1)
    gameState.elements.forEach(e => {
        if (e.t !== MATERIALS.BUILDING) return;
        
        ctx.save();
        const isIndustrial = currentBiome === 'INDUSTRIAL';
        const isUrban = currentBiome === 'URBAN';
        const isDesert = currentBiome === 'DESERT';
        const isWasteland = currentBiome === 'WASTELAND';
        const isWetland = currentBiome === 'WETLAND';
        const isTundra = currentBiome === 'TUNDRA';

        // Internal Clipping Pass
        ctx.save();
        ctx.beginPath();
        if (e.sh === 'pyramid') ctx.rect(e.x - e.w/2, e.y - e.h/2, e.w, e.h);
        else if (e.sh === 'circle') ctx.ellipse(e.x, e.y, e.w/2, e.h/2, 0, 0, Math.PI * 2);
        else ctx.roundRect(e.x - e.w/2, e.y - e.h/2, e.w, e.h, 6);
        ctx.clip();

        if (isIndustrial && ENABLE_PREMIUM_VISUALS) {
            ctx.strokeStyle = '#222'; ctx.lineWidth = 6;
            const pipeX = e.sh === 'circle' ? e.x - e.w/3 : e.x - e.w/2 + 8;
            ctx.beginPath(); ctx.moveTo(pipeX, e.y - e.h/2); ctx.lineTo(pipeX, e.y + e.h/2); ctx.stroke();
            if (e.w > 60) {
                ctx.save(); ctx.translate(e.x + e.w/4, e.y - e.h/4); ctx.rotate(renderTime * 0.005);
                ctx.strokeStyle = '#444'; ctx.lineWidth = 3;
                for (let i=0; i<3; i++) { ctx.rotate(Math.PI*2/3); ctx.beginPath(); ctx.moveTo(0,0); ctx.lineTo(10, 0); ctx.stroke(); }
                ctx.restore();
            }
        }

        if (isUrban && ENABLE_PREMIUM_VISUALS) {
            // Windows (Sparse & Living)
            const winSize = 6; const spacing = 12;
            const cols = Math.floor((e.w - 10) / spacing); const rows = Math.floor((e.h - 10) / spacing);
            if (cols > 0 && rows > 0) {
                const winCount = 5 + Math.floor(getStableRandom(e.id) * 7); // 5-12 windows per building
                for (let i = 0; i < winCount; i++) {
                    const seed = e.id + i * 37;
                    const r = Math.floor(getStableRandom(seed) * rows);
                    const c = Math.floor(getStableRandom(seed + 1) * cols);
                    
                    const wx = e.x - e.w/2 + 10 + c * spacing; const wy = e.y - e.h/2 + 10 + r * spacing;
                    const colors = ['#00f2ff', '#ff00ff', '#ffff00', '#ffffff', '#ffcc00'];
                    const winColor = colors[Math.floor(getStableRandom(seed + 2) * colors.length)];
                    
                    // Slower, more atmospheric flicker
                    const flicker = Math.sin(renderTime * 0.001 + seed) * 0.5 + 0.5;
                    const isOff = getStableRandom(seed + 5) < 0.2 && flicker < 0.3;
                    
                    if (!isOff) {
                        ctx.globalAlpha = 0.4 + flicker * 0.4;
                        ctx.fillStyle = winColor;
                        ctx.shadowBlur = 10 * flicker; ctx.shadowColor = winColor;
                        ctx.fillRect(wx, wy, winSize, winSize);
                        
                        // Interior silhouette (Distant room feel)
                        if (flicker > 0.5) {
                            ctx.fillStyle = 'rgba(0,0,0,0.5)';
                            ctx.fillRect(wx + 1, wy + 3, winSize - 2, 2);
                        }
                    }
                }
            }
            // Billboards
            if (e.w > 80 && e.id % 4 === 0) {
                const bTexts = ['NEO-GEN', 'LUMINA', 'VOID', 'SENS-IX', 'CORE', 'GLOW', 'VIRTUA'];
                const bText = bTexts[e.id % bTexts.length];
                const bColors = ['#00f2ff', '#ff00ff', '#ffff00'];
                const bColor = bColors[Math.floor(renderTime * 0.0005) % 3];
                ctx.save();
                ctx.fillStyle = '#111'; ctx.fillRect(e.x - e.w/3, e.y - 15, e.w/1.5, 30);
                ctx.strokeStyle = bColor; ctx.lineWidth = 1; ctx.strokeRect(e.x - e.w/3, e.y - 15, e.w/1.5, 30);
                ctx.fillStyle = bColor; ctx.shadowBlur = 10; ctx.shadowColor = bColor;
                ctx.globalAlpha = 0.5 + Math.sin(renderTime * 0.01) * 0.2;
                ctx.font = 'bold 10px Courier'; ctx.textAlign = 'center';
                ctx.fillText(bText, e.x, e.y + 4);
                ctx.restore();
            }
        }
        ctx.restore(); // End clipping

        // Exterior
        if (isUrban && ENABLE_PREMIUM_VISUALS) {
            if (e.h > 90 || e.id % 7 === 0) {
                ctx.strokeStyle = '#222'; ctx.lineWidth = 2;
                ctx.beginPath(); ctx.moveTo(e.x, e.y - e.h/2); ctx.lineTo(e.x, e.y - e.h/2 - 20); ctx.stroke();
                if (Math.sin(renderTime * 0.006 + e.id) > 0.4) {
                    ctx.fillStyle = '#ff0000'; ctx.shadowBlur = 12; ctx.shadowColor = '#f00';
                    ctx.beginPath(); ctx.arc(e.x, e.y - e.h/2 - 20, 3, 0, Math.PI*2); ctx.fill();
                }
            }
        }

        // Neon Sign Poles
        if (e.id % 5 === 0 && !isWetland) {
            let neonColors = ['#ff00ff', '#00f2ff', '#ffff00', '#ff0000'];
            let texts = ['HOTEL', 'BAR', 'CLUB', 'REPAIR', 'TANK', 'NEON'];
            const nColor = neonColors[e.id % neonColors.length]; const text = texts[e.id % texts.length];
            ctx.save(); ctx.translate(e.x, e.y - e.h/2);
            ctx.strokeStyle = '#333'; ctx.lineWidth = 2;
            ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(0, -15); ctx.stroke();
            ctx.shadowBlur = 10; ctx.shadowColor = nColor; 
            ctx.fillStyle = nColor; ctx.font = 'bold 14px Outfit'; ctx.textAlign = 'center'; 
            ctx.fillText(text, 0, -20); 
            ctx.restore();
        }

        ctx.restore();
    });
}

function drawGuardians() {
    if (!gameState.guardians) return;
    gameState.guardians.forEach(g => {
        ctx.save();
        ctx.translate(g.x, g.y);
        
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

    // 3. Urban Trash (Blowing papers)
    if (currentBiome === 'URBAN' && ENABLE_PREMIUM_VISUALS && urbanTrash.length < 15) {
        if (Math.random() > 0.95) {
            urbanTrash.push({
                x: camera.x + (Math.random() > 0.5 ? -40 : canvas.width + 40),
                y: camera.y + Math.random() * canvas.height,
                vx: 3 + Math.random() * 5,
                vy: (Math.random() - 0.5) * 2,
                life: 1.0,
                rotation: Math.random() * Math.PI * 2,
                rotSpeed: (Math.random() - 0.5) * 0.1,
                size: 8 + Math.random() * 8
            });
        }
    }

    urbanTrash.forEach((p, i) => {
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        p.rotation += p.rotSpeed * dt;
        p.life -= 0.002 * dt;
        if (p.life <= 0 || p.x > worldSize + 200 || p.x < -200) urbanTrash.splice(i, 1);
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
    const currentBiome = gameState.zones && gameState.zones[0] ? gameState.zones[0].type : 'RANDOM';
    const worldSize = gameState.worldSize || 4000;
    ctx.save();
    
    // Industrial Ground Vents
    if (currentBiome === 'INDUSTRIAL' && ENABLE_PREMIUM_VISUALS) {
        for (let i = 0; i < 30; i++) {
            const seed = i * 111;
            const vx = getStableRandom(seed) * worldSize;
            const vy = getStableRandom(seed + 1) * worldSize;
            
            if (vx > camera.x - 50 && vx < camera.x + canvas.width + 50 &&
                vy > camera.y - 50 && vy < camera.y + canvas.height + 50) {
                // Draw Vent Plate
                ctx.fillStyle = '#111115';
                ctx.beginPath(); ctx.arc(vx, vy, 12, 0, Math.PI*2); ctx.fill();
                ctx.strokeStyle = '#222228'; ctx.lineWidth = 2; ctx.stroke();
                // Grille lines
                ctx.beginPath(); ctx.moveTo(vx - 8, vy - 4); ctx.lineTo(vx + 8, vy - 4);
                ctx.moveTo(vx - 8, vy); ctx.lineTo(vx + 8, vy);
                ctx.moveTo(vx - 8, vy + 4); ctx.lineTo(vx + 8, vy + 4);
                ctx.stroke();
                
                // Occasional Steam Puff
                if (Math.random() > 0.985) {
                    particles.push({
                        x: vx, y: vy,
                        vx: (Math.random() - 0.5) * 0.4,
                        vy: -1.2 - Math.random() * 0.8,
                        life: 1.2,
                        color: 'rgba(240, 245, 255, 0.4)',
                        size: 8 + Math.random() * 12,
                        isSteam: true
                    });
                }
            }
        }
    }

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

    // Draw Urban Trash
    urbanTrash.forEach(p => {
        if (p.x > camera.x - 50 && p.x < camera.x + canvas.width + 50 &&
            p.y > camera.y - 50 && p.y < camera.y + canvas.height + 50) {
            ctx.save();
            ctx.translate(p.x, p.y);
            ctx.rotate(p.rotation);
            ctx.fillStyle = 'rgba(200, 200, 200, 0.4)';
            ctx.fillRect(-p.size/2, -p.size/2, p.size, p.size * 0.7);
            // "Text" lines on paper
            ctx.strokeStyle = 'rgba(0,0,0,0.1)'; ctx.lineWidth = 1;
            ctx.beginPath(); ctx.moveTo(-p.size/3, -2); ctx.lineTo(p.size/3, -2);
            ctx.moveTo(-p.size/3, 2); ctx.lineTo(p.size/3, 2); ctx.stroke();
            ctx.restore();
        }
    });

    ctx.restore();
}

function spawnParticles(x, y, color, count = 10, sizeMult = 1) {
    const currentBiome = gameState.zones && gameState.zones[0] ? gameState.zones[0].type : 'RANDOM';
    const isIndustrial = currentBiome === 'INDUSTRIAL';
    
    for (let i = 0; i < count; i++) {
        const isIndSpark = isIndustrial && Math.random() > 0.6;
        particles.push({
            x, y,
            vx: (Math.random() - 0.5) * 10,
            vy: (Math.random() - 0.5) * 10,
            life: 1.0 + Math.random() * 0.5,
            color: isIndSpark ? '#00f2ff' : color,
            size: (Math.random() * 3 + 1) * sizeMult,
            isIndustrialSpark: isIndSpark
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
        if (p.isIndustrialSpark) {
            p.vx *= 0.98; // Drag
            p.vy += 0.12 * dt; // Gravity
            p.life -= 0.012 * dt;
        }
    });
    particles = particles.filter(p => p.life > 0);
}

function drawParticles() {
    ctx.save();
    particles.forEach(p => {
        ctx.globalAlpha = p.life;
        if (p.isIndustrialSpark) {
            ctx.shadowBlur = 8;
            ctx.shadowColor = '#00f2ff';
            ctx.fillStyle = '#fff';
            ctx.fillRect(p.x - 1, p.y - 1, 2, 2);
            ctx.strokeStyle = '#00f2ff';
            ctx.lineWidth = 1;
            ctx.globalAlpha = p.life * 0.4;
            ctx.beginPath();
            ctx.moveTo(p.x, p.y);
            ctx.lineTo(p.x - p.vx * 1.5, p.y - p.vy * 1.5);
            ctx.stroke();
            ctx.shadowBlur = 0;
        } else {
            ctx.fillStyle = p.color;
            ctx.beginPath();
            ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
            ctx.fill();
        }
    });
    ctx.restore();
}

function drawIndustrialAtmosphere() {
    // 1. Falling Industrial Sparks (Simulating overhead infrastructure)
    if (Math.random() > 0.94) {
        particles.push({
            x: camera.x + Math.random() * canvas.width,
            y: camera.y - 20,
            vx: (Math.random() - 0.5) * 2,
            vy: 4 + Math.random() * 4,
            life: 1.2,
            color: '#00f2ff',
            size: 2,
            isIndustrialSpark: true
        });
    }

    // 2. Heat Distortion near Vents (Procedural shimmering)
    const elements = gameState.elements.filter(e => e.t === MATERIALS.BUILDING && e.w > 60);
    elements.forEach(e => {
        if (e.x > camera.x - 100 && e.x < camera.x + canvas.width + 100 &&
            e.y > camera.y - 100 && e.y < camera.y + canvas.height + 100) {
            
            ctx.save();
            ctx.globalCompositeOperation = 'screen';
            const shimmer = Math.sin(renderTime * 0.01 + e.id) * 5;
            const hGrad = ctx.createRadialGradient(e.x + e.w/4, e.y - e.h/4, 0, e.x + e.w/4, e.y - e.h/4, 40);
            hGrad.addColorStop(0, 'rgba(255, 255, 255, 0.05)');
            hGrad.addColorStop(1, 'rgba(0, 0, 0, 0)');
            ctx.fillStyle = hGrad;
            ctx.translate(shimmer, 0);
            ctx.beginPath();
            ctx.arc(e.x + e.w/4, e.y - e.h/4, 45, 0, Math.PI * 2);
            ctx.fill();
            ctx.restore();
        }
    });
}

function drawUrbanAtmosphere() {
    // 1. Sweeping Searchlights (Distant high-altitude beams)
    const worldSize = gameState.worldSize || 4000;
    const time = renderTime * 0.001;
    
    [[0,0], [worldSize, 0], [0, worldSize], [worldSize, worldSize]].forEach(([bx, by], idx) => {
        const ang = time * 0.2 + idx * Math.PI/2;
        const beamLen = 1200;
        const targetX = bx + Math.cos(ang) * beamLen;
        const targetY = by + Math.sin(ang) * beamLen;
        
        ctx.save();
        ctx.globalCompositeOperation = 'screen';
        const beamGrad = ctx.createLinearGradient(bx, by, targetX, targetY);
        beamGrad.addColorStop(0, 'rgba(0, 242, 255, 0.15)');
        beamGrad.addColorStop(0.5, 'rgba(0, 242, 255, 0.05)');
        beamGrad.addColorStop(1, 'rgba(0, 0, 0, 0)');
        
        ctx.strokeStyle = beamGrad;
        ctx.lineWidth = 60 + Math.sin(time * 2) * 20;
        ctx.beginPath();
        ctx.moveTo(bx, by);
        ctx.lineTo(targetX, targetY);
        ctx.stroke();
        ctx.restore();
    });

    // 2. Sky Glow / City Silhouette (Subtle overlay)
    const grad = ctx.createLinearGradient(0, worldSize, 0, worldSize - 200);
    grad.addColorStop(0, 'rgba(0, 200, 255, 0.05)');
    grad.addColorStop(1, 'rgba(0, 0, 0, 0)');
    ctx.fillStyle = grad;
    ctx.fillRect(0, worldSize - 200, worldSize, 200);
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
