import { io } from "socket.io-client";
import versionData from './version.json';
import { MATERIALS, MATERIAL_PROPERTIES, BIOMES, CHASSIS, WEAPON_MODULES } from '../backend/gameConfig.js';

// Connect to the same host the game is served from
const socket = io({
    transports: ['websocket', 'polling']
});

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

socket.on('connect_error', (err) => {
    console.error('Socket Connection Error:', err.message, err.description);
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
let shake = { x: 0, y: 0, intensity: 0 };
let particles = []; // { x, y, vx, vy, life, color, size }
let atmosphereParticles = []; // { x, y, size, vx, vy, speed, color }
let environmentalObjects = []; // Dynamic objects like Tumbleweeds
let lizards = []; // Scurrying desert life
let snowHares = []; // Scurrying arctic life
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
let renderTime = 0;

// Liquid Patterns (9 Variations each for variety)
let waterPatterns = []; 
let oilPatterns = [];
let acidPatterns = [];
let gasPatterns = [];
let electricPatterns = [];
let lastWaterPatternUpdate = 0;
let lastOilPatternUpdate = 0;
let lastAcidPatternUpdate = 0;
let lastGasPatternUpdate = 0;
let lastElectricPatternUpdate = 0;
const WATER_TILE_SIZE = 128;
const OIL_TILE_SIZE = 128;
const ACID_TILE_SIZE = 128;
const GAS_TILE_SIZE = 128;
const ELECTRIC_TILE_SIZE = 128;

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
}

// Global pattern variable for backward compatibility
let waterPattern = null;
let oilPattern = null;
let acidPattern = null;
let gasPattern = null;
let electricPattern = null;

function updateElectricPattern(time) {
    if (time - lastElectricPatternUpdate < 30) return; // Faster updates for jitter
    lastElectricPatternUpdate = time;

    for (let p = 0; p < 9; p++) {
        const ctx = electricContexts[p];
        ctx.clearRect(0, 0, ELECTRIC_TILE_SIZE, ELECTRIC_TILE_SIZE);
        
        // Jittery Static Noise Pattern
        ctx.strokeStyle = 'rgba(0, 242, 255, 0.4)';
        ctx.lineWidth = 1;
        for (let i = 0; i < 15; i++) {
            const x1 = getStableRandom(p + i + time) * ELECTRIC_TILE_SIZE;
            const y1 = getStableRandom(p + i + 1 + time) * ELECTRIC_TILE_SIZE;
            const x2 = x1 + (getStableRandom(p + i + 2) - 0.5) * 20;
            const y2 = y1 + (getStableRandom(p + i + 3) - 0.5) * 20;
            
            ctx.beginPath();
            ctx.moveTo(x1, y1);
            ctx.lineTo(x2, y2);
            ctx.stroke();
        }

        // Faint Cyan Glow base
        ctx.fillStyle = 'rgba(0, 80, 150, 0.1)';
        ctx.fillRect(0, 0, ELECTRIC_TILE_SIZE, ELECTRIC_TILE_SIZE);

        electricPatterns[p] = ctx.createPattern(electricCanvases[p], 'repeat');
    }
}

function updateGasPattern(time) {
    if (time - lastGasPatternUpdate < 60) return;
    lastGasPatternUpdate = time;

    for (let p = 0; p < 9; p++) {
        const ctx = gasContexts[p];
        ctx.clearRect(0, 0, GAS_TILE_SIZE, GAS_TILE_SIZE);
        
        // Wispy Toxic Smoke Texture (Soft Puffs, no lines)
        for (let i = 0; i < 6; i++) {
            const seed = p * 10 + i;
            const gx = getStableRandom(seed) * GAS_TILE_SIZE;
            const gy = getStableRandom(seed + 1) * GAS_TILE_SIZE;
            const r = 30 + getStableRandom(seed + 2) * 30;
            
            const g = ctx.createRadialGradient(gx, gy, 0, gx, gy, r);
            g.addColorStop(0, 'rgba(212, 255, 0, 0.15)'); // More Yellowish
            g.addColorStop(1, 'rgba(212, 255, 0, 0)');
            ctx.fillStyle = g;
            ctx.beginPath();
            ctx.arc(gx, gy, r, 0, Math.PI * 2);
            ctx.fill();
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
let isMenuOpen = false;
let isShopOpen = false;

function setupAudio() {
    musicTracks.forEach(track => {
        track.loop = false;
        track.volume = musicVolume;
        track.onended = () => {
            currentMusicIndex = (currentMusicIndex + 1) % musicTracks.length;
            playMusic();
        };
    });
    shotSFX.volume = sfxVolume;
    flameSFX.volume = sfxVolume;
    teslaSFX.volume = sfxVolume;
}

function playMusic() {
    const track = musicTracks[currentMusicIndex];
    track.play().catch(e => console.log("Audio play blocked until interaction"));
}

function playWeaponSound(weaponType, x, y) {
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

if (musicSlider) musicSlider.oninput = (e) => {
    musicVolume = e.target.value;
    musicTracks.forEach(t => t.volume = musicVolume);
    localStorage.setItem('tanks_music_vol', musicVolume);
};

if (sfxSlider) sfxSlider.oninput = (e) => {
    sfxVolume = e.target.value;
    shotSFX.volume = sfxVolume;
    flameSFX.volume = sfxVolume;
    teslaSFX.volume = sfxVolume;
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
    window.addEventListener('mousemove', e => {
        mousePos.x = e.clientX;
        mousePos.y = e.clientY;
        updateAimAngle();
    });


    requestAnimationFrame(renderLoop);
}

function updateAimAngle() {
    if (!gameActive || !myId) return;
    const me = gameState.players.find(p => p.id === myId);
    if (!me) return;
    
    const rect = canvas.getBoundingClientRect();
    const canvasMouseX = mousePos.x - rect.left;
    const canvasMouseY = mousePos.y - rect.top;

    const worldMouseX = canvasMouseX + camera.x;
    const worldMouseY = canvasMouseY + camera.y;
    const aimAngle = Math.atan2(worldMouseY - me.y, worldMouseX - me.x);
    
    if (isNaN(keys.aimAngle) || Math.abs(aimAngle - keys.aimAngle) > 0.01) {
        keys.aimAngle = aimAngle;
        sendInput();
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

let debugMode = false;
let debugSpawnType = null;
let botsActive = true;

socket.on('debug-init', () => {
    debugMode = true;
    const debugMenu = document.getElementById('debug-menu');
    if (debugMenu) debugMenu.classList.remove('hidden');
    console.log('Debug mode activated');
});

socket.on('dev-reload', () => {
    console.log('Backend changed, reloading...');
    location.reload();
});

function updateLobbyUI(id, players) {
    if (lobbyIdSpan) lobbyIdSpan.innerText = id.toUpperCase();
    
    // 1. Tank Selection Rendering
    const selectionArea = document.getElementById('tank-selection-area');
    const me = players.find(p => p.id === myId);
    if (selectionArea && me) {
        selectionArea.innerHTML = '';
        Object.entries(CHASSIS).forEach(([type, config]) => {

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
                    <div class="slot-chassis">${player.ch}</div>
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
            updateAtmosphere(dt);
            updateEnvironmentalObjects(dt);
            drawAtmosphere();
            drawEnvironmentalObjects();
        }

        ctx.strokeStyle = 'rgba(0, 242, 255, 0.5)';
        ctx.lineWidth = 5;
        ctx.strokeRect(0, 0, gameState.worldSize, gameState.worldSize);

        drawElements();
        drawGuardians();
        updateBulletTrails();
        drawBulletTrails();
        drawBullets();

        gameState.players.forEach(p => {
            drawTank(p);
            // NEW: Dust particles when moving
            if (ENABLE_PREMIUM_VISUALS && renderTime % 5 < 1) { 
                const currentBiome = gameState.zones && gameState.zones[0] ? gameState.zones[0].t : 'RANDOM';
                const isMoving = p.id === myId ? (keys.up || keys.down || keys.left || keys.right) : true; 
                if (isMoving) {
                    const overWater = currentBiome === 'WETLAND' || (p.wet); // Simplification: if player has 'wet' status or is in wetland
                    
                    if (overWater && ENABLE_PREMIUM_VISUALS) {
                        // Water Wakes (Tails)
                        if (renderTime % 4 < 1) {
                            const cos = Math.cos(p.a);
                            const sin = Math.sin(p.a);
                            // Two ripples behind tracks
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
                        }
                    } else {
                        // More intense dust in wasteland/tundra
                        const pCount = (currentBiome === 'WASTELAND' || currentBiome === 'TUNDRA') ? 2 : 1;
                        const pColor = currentBiome === 'WASTELAND' ? 'rgba(150, 100, 50, 0.3)' : 
                                       (currentBiome === 'TUNDRA' ? 'rgba(230, 250, 255, 0.4)' : 'rgba(100,100,100,0.2)');
                        spawnParticles(p.x - Math.cos(p.a) * 20, p.y - Math.sin(p.a) * 20, pColor, pCount, 0.5);
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
        }
    } else {
        drawGrid();
    }
}

function drawTank(p) {
    if (p.hid && p.id !== myId) return;

    const color = p.t === 'blue' ? '#00f2ff' : '#ff00ff';
    ctx.save();
    if (p.hid && p.id === myId) ctx.globalAlpha = 0.5;
    
    // Burning Glow Effect
    if (p.brn) {
        ctx.shadowBlur = 15 + Math.sin(Date.now() * 0.01) * 5;
        ctx.shadowColor = '#ff4400';
    }

    ctx.translate(p.x, p.y);
    ctx.save();
    ctx.rotate(p.a);

    // Tracks (Larvfotter) - Chassis specific
    ctx.fillStyle = '#111';
    ctx.strokeStyle = '#222';
    ctx.lineWidth = 1;
    
    let trackW = TANK_WIDTH + 4;
    let trackH = 10;
    let trackOffset = TANK_HEIGHT/2 - 2;

    if (p.ch === 'BRAWLER') {
        trackH = 14;
        trackOffset = TANK_HEIGHT/2 - 4;
    } else if (p.ch === 'SCOUT') {
        trackW = TANK_WIDTH - 4;
        trackH = 8;
    } else if (p.ch === 'ARTILLERY') {
        trackW = TANK_WIDTH + 12;
        trackH = 8;
    }

    // Left Track
    ctx.beginPath();
    ctx.roundRect(-trackW/2, -trackOffset - trackH/2, trackW, trackH, 3);
    ctx.fill();
    ctx.stroke();
    // Right Track
    ctx.beginPath();
    ctx.roundRect(-trackW/2, trackOffset - trackH/2, trackW, trackH, 3);
    ctx.fill();
    ctx.stroke();

    // Body - Chassis specific
    ctx.fillStyle = '#1a1a2e';
    ctx.strokeStyle = color;
    ctx.lineWidth = 3;
    ctx.beginPath();

    if (p.ch === 'SCOUT') {
        // Sleeker, more aerodynamic scout
        ctx.roundRect(-TANK_WIDTH/2 + 4, -TANK_HEIGHT/2 + 2, TANK_WIDTH - 4, TANK_HEIGHT - 4, 15);
    } else if (p.ch === 'BRAWLER') {
        // Heavy, blocky brawler with extra plating lines
        ctx.roundRect(-TANK_WIDTH/2, -TANK_HEIGHT/2, TANK_WIDTH, TANK_HEIGHT, 4);
        ctx.fill();
        ctx.stroke();
        // Extra armor plates visual
        ctx.lineWidth = 1;
        ctx.strokeStyle = 'rgba(255,255,255,0.2)';
        ctx.strokeRect(-TANK_WIDTH/2 + 5, -TANK_HEIGHT/2 + 5, TANK_WIDTH - 10, TANK_HEIGHT - 10);
        ctx.strokeStyle = color;
        ctx.lineWidth = 3;
    } else if (p.ch === 'ARTILLERY') {
        // Long, narrow artillery chassis
        ctx.roundRect(-TANK_WIDTH/2 - 5, -TANK_HEIGHT/2 + 6, TANK_WIDTH + 10, TANK_HEIGHT - 12, 6);
    } else {
        // Default/DEV
        ctx.roundRect(-TANK_WIDTH/2, -TANK_HEIGHT/2, TANK_WIDTH, TANK_HEIGHT, 8);
    }
    ctx.fill();
    ctx.stroke();

    // Special DEV tank glow
    if (p.ch === 'DEV') {
        ctx.strokeStyle = '#fff';
        ctx.lineWidth = 1;
        ctx.strokeRect(-TANK_WIDTH/2 + 2, -TANK_HEIGHT/2 + 2, TANK_WIDTH - 4, TANK_HEIGHT - 4);
        ctx.strokeStyle = color;
        ctx.lineWidth = 3;
    }

    // Front Indicators (Headlights)
    ctx.fillStyle = 'rgba(255, 255, 100, 0.8)';
    let headLightX = TANK_WIDTH/2 - 6;
    if (p.ch === 'ARTILLERY') headLightX += 4;
    
    ctx.beginPath();
    ctx.arc(headLightX, -TANK_HEIGHT/4, 3, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(headLightX, TANK_HEIGHT/4, 3, 0, Math.PI * 2);
    ctx.fill();

    // Back Indicators (Engine Vents)
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.2)';
    ctx.lineWidth = 2;
    let ventX = -TANK_WIDTH/2 + 8;
    if (p.ch === 'ARTILLERY') ventX -= 4;
    
    ctx.beginPath();
    ctx.moveTo(ventX, -10);
    ctx.lineTo(ventX, 10);
    ctx.moveTo(ventX + 4, -10);
    ctx.lineTo(ventX + 4, 10);
    ctx.stroke();
    
    ctx.restore();

    // Turret (Separate Rotation)
    ctx.save();
    ctx.rotate(p.aa || p.a);
    
    // Turret Base Dome
    const turretRadius = 14;
    const gradient = ctx.createRadialGradient(-2, -2, 2, 0, 0, turretRadius);
    gradient.addColorStop(0, '#3a3a5e');
    gradient.addColorStop(1, '#1a1a2e');
    ctx.fillStyle = gradient;
    ctx.beginPath();
    ctx.arc(0, 0, turretRadius, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    // Turret Hatch (Lucka)
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.3)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(-4, -4, 4, 0, Math.PI * 2);
    ctx.stroke();

    // Barrel
    const weaponType = p.sl && p.sl[p.cs];
    let barrelLen = 30;
    let barrelWidth = 10;
    let muzzleBrake = true;

    if (weaponType === 'HEAVY_GUN') {
        barrelLen = 42;
        barrelWidth = 14;
    } else if (weaponType === 'FLAMETHROWER') {
        barrelLen = 25;
        barrelWidth = 8;
        muzzleBrake = false;
    } else if (weaponType === 'TESLA') {
        barrelLen = 35;
        barrelWidth = 6;
    }

    ctx.fillStyle = '#1a1a2e';
    ctx.strokeStyle = color;
    ctx.lineWidth = 2;
    
    // Draw Barrel
    ctx.beginPath();
    ctx.roundRect(turretRadius - 2, -barrelWidth/2, barrelLen, barrelWidth, 2);
    ctx.fill();
    ctx.stroke();

    // Muzzle Brake or Details
    if (muzzleBrake) {
        ctx.beginPath();
        ctx.roundRect(turretRadius + barrelLen - 6, -barrelWidth/2 - 2, 8, barrelWidth + 4, 2);
        ctx.fill();
        ctx.stroke();
    }

    // Tesla Coil effect
    if (weaponType === 'TESLA') {
        ctx.strokeStyle = '#ffff00';
        ctx.lineWidth = 1;
        for (let i = 0; i < 4; i++) {
            ctx.beginPath();
            ctx.moveTo(turretRadius + 5 + i*7, -barrelWidth/2 - 2);
            ctx.lineTo(turretRadius + 5 + i*7, barrelWidth/2 + 2);
            ctx.stroke();
        }
    }

    ctx.restore();

    // Username
    ctx.restore();
    ctx.save();
    ctx.translate(p.x, p.y);
    ctx.fillStyle = 'white';
    ctx.font = '700 12px Outfit';
    ctx.textAlign = 'center';
    const labelY = -TANK_HEIGHT - 10 - (p.labelYOffset || 0);
    const nameLabel = (p.username || p.u || 'PLAYER').toUpperCase();
    ctx.fillText(nameLabel, 0, labelY);
    ctx.restore();

    // Shield / Invulnerability
    if (p.invulnerable) {
        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.8)';
        ctx.lineWidth = 3;
        ctx.setLineDash([8, 4]);
        ctx.lineDashOffset = -renderTime * 0.15;
        ctx.beginPath();
        ctx.arc(0, 0, TANK_WIDTH * 0.75, 0, Math.PI * 2);
        ctx.stroke();
        
        // Inner glow
        ctx.globalAlpha = 0.2 + Math.sin(renderTime * 0.01) * 0.1;
        ctx.fillStyle = '#fff';
        ctx.beginPath();
        ctx.arc(0, 0, TANK_WIDTH * 0.7, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
    }

    // Status Icons
    if (p.stunned || p.slowed || p.burning || p.scrap >= 100) {
        ctx.save();
        ctx.translate(p.x, p.y - TANK_HEIGHT - 35);
        ctx.textAlign = 'center';
        
        let yOffset = 0;
        if (p.stunned) {
            ctx.fillStyle = '#ffff00';
            ctx.font = '700 16px Outfit';
            ctx.fillText('\u26A1 STUNNED', 0, yOffset);
            yOffset -= 20;
        }
        if (p.slowed) {
            ctx.fillStyle = '#00aaff';
            ctx.font = '700 16px Outfit';
            ctx.fillText('\u2744\uFE0F SLOWED', 0, yOffset);
            yOffset -= 20;
        }
        if (p.burning) {
            ctx.fillStyle = '#ff4400';
            ctx.font = '700 16px Outfit';
            ctx.fillText('\uD83D\uDD25 BURNING', 0, yOffset);
            yOffset -= 20;
        }
        if (p.wet) {
            ctx.fillStyle = '#0088ff';
            ctx.font = '700 16px Outfit';
            ctx.fillText('\uD83D\uDCA7 WET', 0, yOffset);
            yOffset -= 20;
        }
        
        // Show buff level only if not stunned (to keep UI clean)
        if (p.scrap >= 100 && !p.stunned && !p.slowed && !p.burning && !p.wet) {
            const buffLevel = Math.floor(p.scrap / 100);
            if (buffLevel >= 5) {
                ctx.fillStyle = '#ffcc00';
                ctx.font = '900 16px Outfit';
                ctx.fillText('\u2B50 MAX BUFF', 0, yOffset);
            } else if (buffLevel >= 1) {
                ctx.fillStyle = '#00ffaa';
                ctx.font = '700 14px Outfit';
                ctx.fillText(`\uD83D\uDD33 LVL ${buffLevel} BUFF`, 0, yOffset);
            }
        }
        ctx.restore();
    }
}

function drawCrosshair() {
    if (!gameActive || isMenuOpen || isShopOpen || (gameState && gameState.gameOver)) return;

    const me = serverState?.players?.find(p => p.id === myId);
    if (!me) return;

    ctx.save();
    ctx.translate(mousePos.x, mousePos.y);

    const currentWeapon = me.w; // w is the current weapon name from server
    const weaponMod = WEAPON_MODULES[currentWeapon];
    const weaponType = weaponMod ? weaponMod.type : 'metal';
    const color = TRAIL_COLORS[weaponType] || '#fff';
    
    // Outer reload circle
    const reloadProgress = (me.c / 100); // me.c is 0-100
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.2)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(0, 0, 18, 0, Math.PI * 2);
    ctx.stroke();

    if (reloadProgress < 1.0) {
        ctx.strokeStyle = color;
        ctx.beginPath();
        ctx.arc(0, 0, 18, -Math.PI / 2, -Math.PI / 2 + (Math.PI * 2 * reloadProgress));
        ctx.stroke();
    } else {
        // Ready glow
        ctx.shadowBlur = 10;
        ctx.shadowColor = color;
        ctx.strokeStyle = color;
        ctx.beginPath();
        ctx.arc(0, 0, 18, 0, Math.PI * 2);
        ctx.stroke();
    }

    // Inner crosshair
    const pulse = keys.shoot ? 1.4 : 1.0;
    ctx.shadowBlur = 0;
    ctx.fillStyle = color;
    
    // 4 dots
    for (let i = 0; i < 4; i++) {
        ctx.rotate(Math.PI / 2);
        ctx.beginPath();
        ctx.arc(10 * pulse, 0, 2, 0, Math.PI * 2);
        ctx.fill();
    }

    // Center dot
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
}

function drawGrid() {
    const gridSize = 100;
    const worldSize = gameState.worldSize || 4000;
    
    const currentBiome = gameState.zones && gameState.zones[0] ? gameState.zones[0].type : 'RANDOM';

    // Reset ground details if biome or size changes
    if (currentBiome !== lastBiome || worldSize !== lastWorldSize) {
        groundDetails = [];
        lizards = []; // Reset lizards too
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

            // Concrete Plate Lines
            ctx.strokeStyle = 'rgba(255,255,255,0.04)';
            ctx.lineWidth = 2;
            ctx.beginPath();
            for (let x = 0; x < worldSize; x += plateSize) {
                ctx.moveTo(x, 0); ctx.lineTo(x, worldSize);
            }
            for (let y = 0; y < worldSize; y += plateSize) {
                ctx.moveTo(0, y); ctx.lineTo(worldSize, y);
            }
            ctx.stroke();

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

        // 2. Sidewalks & Curbs
        const blockSize = 350, streetWidth = 150, padding = 150, step = blockSize + streetWidth;
        for (let x = padding - 10; x < worldSize - padding; x += step) {
            for (let y = padding - 10; y < worldSize - padding; y += step) {
                // Sidewalk Base
                ctx.fillStyle = isIndustrial ? '#11111a' : '#1a1a25';
                ctx.beginPath();
                ctx.roundRect(x, y, blockSize + 20, blockSize + 20, 10);
                ctx.fill();
                
                // Caution Stripes for Industrial
                if (isIndustrial) {
                    ctx.save();
                    ctx.strokeStyle = '#ffcc00'; ctx.lineWidth = 6;
                    ctx.setLineDash([10, 10]);
                    ctx.strokeRect(x, y, blockSize + 20, blockSize + 20);
                    ctx.restore();
                } else {
                    ctx.strokeStyle = 'rgba(255,255,255,0.03)';
                    ctx.strokeRect(x, y, blockSize + 20, blockSize + 20);
                }

                // Internal grid patterns
                if (isIndustrial && ENABLE_PREMIUM_VISUALS) {
                    ctx.strokeStyle = 'rgba(0, 242, 255, 0.04)'; ctx.lineWidth = 1;
                    for (let i = 40; i < blockSize; i += 80) {
                        ctx.beginPath(); ctx.moveTo(x + i, y + 10); ctx.lineTo(x + i, y + blockSize + 10); ctx.stroke();
                        ctx.beginPath(); ctx.moveTo(x + 10, y + i); ctx.lineTo(x + blockSize + 10, y + i); ctx.stroke();
                    }
                }
            }
        }

        // 3. Road Markings
        ctx.strokeStyle = isIndustrial ? 'rgba(255, 255, 255, 0.05)' : 'rgba(255, 200, 0, 0.1)';
        ctx.setLineDash([20, 30]); ctx.lineWidth = 2;
        ctx.beginPath();
        for (let x = padding - streetWidth/2; x < worldSize; x += step) { ctx.moveTo(x, 0); ctx.lineTo(x, worldSize); }
        for (let y = padding - streetWidth/2; y < worldSize; y += step) { ctx.moveTo(0, y); ctx.lineTo(worldSize, y); }
        ctx.stroke(); ctx.setLineDash([]); 

    } else if (currentBiome === 'WASTELAND') {
        ctx.fillStyle = '#160e0a';
        ctx.fillRect(0, 0, worldSize, worldSize);
        if (ENABLE_PREMIUM_VISUALS) {
            const wobble = Math.sin(Date.now() * 0.003) * 1.5;
            ctx.translate(0, wobble);
            if (groundDetails.length === 0) {
                for (let i = 0; i < 700; i++) {
                    const r = Math.random();
                    groundDetails.push({
                        x: Math.random() * worldSize, y: Math.random() * worldSize,
                        size: r < 0.1 ? 15 + Math.random() * 25 : (r < 0.3 ? 5 + Math.random() * 10 : 2 + Math.random() * 5),
                        opacity: 0.04 + Math.random() * 0.1,
                        type: r < 0.1 ? 'rock' : (r < 0.3 ? 'crack' : 'dust'),
                        color: Math.random() > 0.5 ? '#2a1a0f' : '#1e140d'
                    });
                }
            }
            ctx.save();
            groundDetails.forEach(d => {
                if (d.x < camera.x - 40 || d.x > camera.x + canvas.width + 40 || d.y < camera.y - 40 || d.y > camera.y + canvas.height + 40) return;
                if (d.type === 'rock') {
                    ctx.fillStyle = '#1a100a'; ctx.globalAlpha = d.opacity * 2;
                    ctx.beginPath(); ctx.moveTo(d.x, d.y - d.size); ctx.lineTo(d.x + d.size, d.y); ctx.lineTo(d.x, d.y + d.size); ctx.lineTo(d.x - d.size, d.y); ctx.closePath(); ctx.fill();
                } else if (d.type === 'crack') {
                    ctx.strokeStyle = 'rgba(0, 0, 0, 0.2)'; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(d.x - d.size, d.y); ctx.lineTo(d.x + d.size, d.y); ctx.stroke();
                } else {
                    ctx.fillStyle = d.color; ctx.globalAlpha = d.opacity; ctx.beginPath(); ctx.arc(d.x, d.y, d.size, 0, Math.PI * 2); ctx.fill();
                }
            });
            ctx.restore();
            ctx.save(); ctx.globalCompositeOperation = 'multiply'; ctx.fillStyle = 'rgba(0, 0, 0, 0.05)';
            for (let i = 0; i < 3; i++) {
                const cx = ((renderTime * 0.5) + (i * worldSize/3)) % worldSize, cy = ((renderTime * 0.3) + (i * worldSize/4)) % worldSize;
                ctx.beginPath(); ctx.ellipse(cx, cy, 400, 300, Math.PI/4, 0, Math.PI * 2); ctx.fill();
            }
            ctx.restore();
            if (lizards.length === 0) for (let i = 0; i < 20; i++) lizards.push({ x: Math.random() * worldSize, y: Math.random() * worldSize, vx: 0, vy: 0 });
            const me = gameState.players.find(p => p.id === myId);
            lizards.forEach(l => {
                if (me) { const dist = Math.hypot(me.x - l.x, me.y - l.y); if (dist < 150) { const a = Math.atan2(l.y - me.y, l.x - me.x); l.vx = Math.cos(a)*5; l.vy = Math.sin(a)*5; } }
                l.x += l.vx; l.y += l.vy; l.vx *= 0.95; l.vy *= 0.95;
                if (l.x > camera.x && l.x < camera.x + canvas.width && l.y > camera.y && l.y < camera.y + canvas.height) { ctx.fillStyle = '#4a3a1a'; ctx.fillRect(l.x, l.y, 3, 2); }
            });
        }
    } else if (currentBiome === 'TUNDRA') {
        // Deep Frozen Ice Base
        ctx.fillStyle = '#050c12'; 
        ctx.fillRect(0, 0, worldSize, worldSize);
        
        if (ENABLE_PREMIUM_VISUALS) {
            if (groundDetails.length === 0) {
                for (let i = 0; i < 600; i++) {
                    const r = Math.random();
                    groundDetails.push({
                        x: Math.random() * worldSize,
                        y: Math.random() * worldSize,
                        size: r < 0.1 ? 15 + Math.random() * 30 : (r < 0.4 ? 5 + Math.random() * 10 : 1 + Math.random() * 2),
                        opacity: 0.05 + Math.random() * 0.15,
                        type: r < 0.1 ? 'ice_sheet' : (r < 0.4 ? 'snow_drift' : 'crystal'),
                        angle: Math.random() * Math.PI * 2,
                        glint: Math.random()
                    });
                }
            }
            
            ctx.save();
            groundDetails.forEach(d => {
                if (d.x < camera.x - 100 || d.x > camera.x + canvas.width + 100 || d.y < camera.y - 100 || d.y > camera.y + canvas.height + 100) return;
                
                if (d.type === 'ice_sheet') {
                    // Large frozen plate with cracks
                    ctx.strokeStyle = 'rgba(200, 240, 255, 0.1)';
                    ctx.lineWidth = 1;
                    ctx.beginPath();
                    ctx.moveTo(d.x - d.size, d.y);
                    ctx.lineTo(d.x + d.size, d.y);
                    ctx.moveTo(d.x, d.y - d.size);
                    ctx.lineTo(d.x, d.y + d.size);
                    ctx.stroke();
                    
                    ctx.fillStyle = 'rgba(150, 220, 255, 0.03)';
                    ctx.beginPath();
                    ctx.arc(d.x, d.y, d.size, 0, Math.PI * 2);
                    ctx.fill();
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
    } else if (currentBiome === 'WETLAND') {
        // Murky Dark Swamp Water
        ctx.fillStyle = '#080d08';
        ctx.fillRect(0, 0, worldSize, worldSize);
        
        if (ENABLE_PREMIUM_VISUALS) {
            if (groundDetails.length === 0) {
                for (let i = 0; i < 400; i++) {
                    const r = Math.random();
                    groundDetails.push({
                        x: Math.random() * worldSize, y: Math.random() * worldSize,
                        size: r < 0.2 ? 10 + Math.random() * 15 : (r < 0.5 ? 20 + Math.random() * 30 : 2 + Math.random() * 5),
                        opacity: 0.1 + Math.random() * 0.2,
                        type: r < 0.2 ? 'lily' : (r < 0.5 ? 'mud' : 'bubble'),
                        color: r < 0.2 ? '#2d4d2d' : '#1a221a',
                        phase: Math.random() * Math.PI * 2
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
                    // Subtle vein
                    ctx.strokeStyle = 'rgba(255,255,255,0.05)'; ctx.lineWidth = 1;
                    ctx.beginPath(); ctx.moveTo(d.x, d.y); ctx.lineTo(d.x + d.size, d.y); ctx.stroke();
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

            // 2. Fireflies (Lively particles)
            ctx.save();
            for (let i = 0; i < 40; i++) {
                const fx = (Math.sin(renderTime * 0.0005 + i) * 0.5 + 0.5) * worldSize;
                const fy = (Math.cos(renderTime * 0.0007 + i * 2) * 0.5 + 0.5) * worldSize;
                
                if (fx > camera.x && fx < camera.x + canvas.width && fy > camera.y && fy < camera.y + canvas.height) {
                    const glow = 0.5 + Math.sin(renderTime * 0.01 + i) * 0.5;
                    ctx.shadowBlur = 10 * glow;
                    ctx.shadowColor = '#aaff00';
                    ctx.fillStyle = `rgba(170, 255, 0, ${0.4 * glow})`;
                    ctx.beginPath(); ctx.arc(fx, fy, 2, 0, Math.PI * 2); ctx.fill();
                }
            }
            ctx.restore();

            // 3. Murky Fog/Mist
            ctx.save();
            ctx.globalCompositeOperation = 'screen';
            const mistGrad = ctx.createRadialGradient(camera.x + canvas.width/2, camera.y + canvas.height/2, 100, camera.x + canvas.width/2, camera.y + canvas.height/2, 800);
            mistGrad.addColorStop(0, 'rgba(40, 60, 40, 0)');
            mistGrad.addColorStop(1, 'rgba(20, 30, 20, 0.15)');
            ctx.fillStyle = mistGrad;
            ctx.fillRect(camera.x, camera.y, canvas.width, canvas.height);
            ctx.restore();
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

    const P_POS = 1 - Math.pow(0.1, dt); // Stiff interpolation for CSP reconciliation
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
            let predictedX = sp.x;
            let predictedY = sp.y;
            let predictedAngle = sp.a;
            
            // 3. Re-apply all pending inputs
            // Note: This is a simplified simulation of the server physics
            const config = CHASSIS[sp.ch] || CHASSIS.SCOUT;
            const zone = (serverState.zones && serverState.zones[0]) || { t: 'URBAN' };
            const biome = BIOMES[zone.t] || BIOMES.URBAN;
            
            // Use a fixed timestep for prediction consistency (matches server TICK_RATE)
            const tickDt = 1.0; 
            
            pendingInputs.forEach(input => {
                const moveSpeed = config.speed * biome.speedMult * 60; // 60 is for force normalization
                const turnSpeed = config.turnSpeed * biome.speedMult;
                
                // Rotation
                if (input.left) predictedAngle -= turnSpeed * tickDt;
                if (input.right) predictedAngle += turnSpeed * tickDt;
                
                // Movement (Forward/Back)
                if (input.up) {
                    predictedX += Math.cos(predictedAngle) * moveSpeed * tickDt;
                    predictedY += Math.sin(predictedAngle) * moveSpeed * tickDt;
                }
                if (input.down) {
                    predictedX -= Math.cos(predictedAngle) * moveSpeed * tickDt;
                    predictedY -= Math.sin(predictedAngle) * moveSpeed * tickDt;
                }
            });

            return {
                ...sp,
                x: lerp(gp.x, predictedX, P_POS),
                y: lerp(gp.y, predictedY, P_POS),
                angle: lerpAngle(gp.angle, predictedAngle, P_POS),
                aimAngle: lerpAngle(gp.aa || gp.a, sp.aa || sp.a, P_POS)
            };
        } else {
            // Standard Interpolation for other players
            const P_OTHER = 1 - Math.pow(0.75, dt);
            return {
                ...sp,
                x: lerp(gp.x, sp.x, P_OTHER),
                y: lerp(gp.y, sp.y, P_OTHER),
                angle: lerpAngle(gp.angle, sp.a, P_OTHER),
                aimAngle: lerpAngle(gp.aa || gp.a, sp.aa || sp.a, P_OTHER)
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



function drawElements() {
    if (!gameState.elements) return;
    const currentBiome = gameState.zones && gameState.zones[0] ? gameState.zones[0].t : 'RANDOM';
    const isWasteland = currentBiome === 'WASTELAND';
    const isIndustrial = currentBiome === 'INDUSTRIAL';
    const isWetland = currentBiome === 'WETLAND';
    const isTundra = currentBiome === 'TUNDRA';

    gameState.elements.forEach(e => {
        ctx.save();
        const config = MATERIAL_PROPERTIES[e.t] || { color: '#fff' };
        
        if (e.t === MATERIALS.BUILDING) {
            // 1. Building Shadow (Deep Depth)
            ctx.fillStyle = 'rgba(0, 0, 0, 0.5)';
            ctx.beginPath();
            ctx.roundRect(e.x - e.w/2 + 8, e.y - e.h/2 + 8, e.w, e.h, 6);
            ctx.fill();

            // 2. Main Building Body
            const bGradient = ctx.createLinearGradient(e.x, e.y - e.h/2, e.x, e.y + e.h/2);
            if (isWasteland) {
                bGradient.addColorStop(0, '#3a2a1a'); // Rusted Top
                bGradient.addColorStop(1, '#1a100a'); // Dark Bottom
            } else if (isIndustrial) {
                bGradient.addColorStop(0, '#2a2a3a'); // Metallic Top
                bGradient.addColorStop(1, '#0a0a15'); // Dark Bottom
            } else if (isWetland) {
                bGradient.addColorStop(0, '#152515'); // Mossy Green Top
                bGradient.addColorStop(1, '#050a05'); // Murky Bottom
            } else if (isTundra) {
                bGradient.addColorStop(0, '#3a4a5a'); // Frosty Blue Top
                bGradient.addColorStop(1, '#050c12'); // Deep Cold Bottom
            } else {
                bGradient.addColorStop(0, '#252535'); // Top (lighter)
                bGradient.addColorStop(1, '#151520'); // Bottom (darker)
            }
            ctx.fillStyle = bGradient;
            ctx.strokeStyle = isWasteland ? 'rgba(150, 80, 50, 0.5)' : (isWetland ? 'rgba(50, 100, 50, 0.4)' : (isTundra ? 'rgba(200, 240, 255, 0.6)' : 'rgba(0, 242, 255, 0.6)'));
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.roundRect(e.x - e.w/2, e.y - e.h/2, e.w, e.h, 4);
            ctx.fill();
            ctx.stroke();

            // Wetland Overgrowth (Moss & Vines)
            if (isWetland && ENABLE_PREMIUM_VISUALS) {
                ctx.save();
                // Moss Patches
                ctx.fillStyle = 'rgba(40, 80, 40, 0.4)';
                for (let i = 0; i < 5; i++) {
                    const mx = e.x + (Math.sin(e.id + i) * 0.4) * e.w;
                    const my = e.y + (Math.cos(e.id * 2 + i) * 0.4) * e.h;
                    ctx.beginPath(); ctx.arc(mx, my, 15 + getStableRandom(e.id + i) * 15, 0, Math.PI * 2); ctx.fill();
                }
                // Hanging Vines
                ctx.strokeStyle = 'rgba(20, 40, 20, 0.6)'; ctx.lineWidth = 2;
                for (let i = 0; i < 3; i++) {
                    const vx = e.x - e.w/2 + 20 + (i * (e.w-40)/3);
                    ctx.beginPath(); ctx.moveTo(vx, e.y - e.h/2); ctx.lineTo(vx + Math.sin(e.id+i)*10, e.y + e.h/2 - 10); ctx.stroke();
                }
                ctx.restore();
            }

            // 3. Roof Details (The "Shell" fix)
            ctx.fillStyle = isWasteland ? 'rgba(100, 50, 0, 0.05)' : 'rgba(255, 255, 255, 0.03)';
            ctx.fillRect(e.x - e.w/2 + 10, e.y - e.h/2 + 10, e.w - 20, e.h - 20);
            
            // Add a "Roof Unit" (HVAC / Helipad)
            if (e.w > 120 && e.h > 120) {
                ctx.fillStyle = isWasteland ? '#2a1a0f' : '#111';
                ctx.strokeStyle = isWasteland ? 'rgba(150,80,50,0.1)' : 'rgba(255,255,255,0.1)';
                ctx.beginPath();
                ctx.roundRect(e.x - 20, e.y - 20, 40, 40, 5);
                ctx.fill();
                ctx.stroke();
                // Fan details
                ctx.beginPath();
                ctx.arc(e.x, e.y, 15, 0, Math.PI * 2);
                ctx.fill();
                ctx.stroke();
            }

            // Tundra Roof Details (Snow Cap)
            if (isTundra && ENABLE_PREMIUM_VISUALS) {
                ctx.save();
                ctx.fillStyle = '#fff';
                ctx.globalAlpha = 0.2;
                // Accumulate snow on top edge
                ctx.beginPath();
                ctx.roundRect(e.x - e.w/2 + 5, e.y - e.h/2 + 5, e.w - 10, 15, 5);
                ctx.fill();
                // Random snow patches
                for (let i = 0; i < 3; i++) {
                    const sx = e.x + Math.sin(e.id + i) * (e.w * 0.3);
                    const sy = e.y + Math.cos(e.id + i) * (e.h * 0.3);
                    ctx.fillStyle = 'rgba(255, 255, 255, 0.05)';
                    ctx.beginPath(); ctx.arc(sx, sy, 10 + getStableRandom(e.id + i * 2) * 10, 0, Math.PI * 2); ctx.fill();
                }
                ctx.restore();
            }

            // 3. Industrial / Factory Details
            if (isIndustrial && ENABLE_PREMIUM_VISUALS) {
                // Hazard Stripes (Yellow/Black) at the base
                ctx.save();
                ctx.beginPath();
                ctx.rect(e.x - e.w/2, e.y + e.h/2 - 12, e.w, 12);
                ctx.clip();
                const stripeW = 15;
                for (let sx = e.x - e.w/2 - 20; sx < e.x + e.w/2 + 20; sx += stripeW * 2) {
                    ctx.fillStyle = '#ffcc00';
                    ctx.beginPath();
                    ctx.moveTo(sx, e.y + e.h/2 - 15);
                    ctx.lineTo(sx + stripeW, e.y + e.h/2 - 15);
                    ctx.lineTo(sx + stripeW - 10, e.y + e.h/2 + 5);
                    ctx.lineTo(sx - 10, e.y + e.h/2 + 5);
                    ctx.fill();
                    ctx.fillStyle = '#111';
                    ctx.beginPath();
                    ctx.moveTo(sx + stripeW, e.y + e.h/2 - 15);
                    ctx.lineTo(sx + stripeW * 2, e.y + e.h/2 - 15);
                    ctx.lineTo(sx + stripeW * 2 - 10, e.y + e.h/2 + 5);
                    ctx.lineTo(sx + stripeW - 10, e.y + e.h/2 + 5);
                    ctx.fill();
                }
                ctx.restore();

                // Vertical Metal Pipes
                ctx.strokeStyle = '#333';
                ctx.lineWidth = 5;
                ctx.beginPath();
                ctx.moveTo(e.x - e.w/2 + 8, e.y - e.h/2);
                ctx.lineTo(e.x - e.w/2 + 8, e.y + e.h/2 - 12);
                ctx.stroke();
                
                // Rivets/Bolts along the pipe
                ctx.fillStyle = 'rgba(255,255,255,0.15)';
                for (let ry = -e.h/2 + 20; ry < e.h/2 - 20; ry += 35) {
                    ctx.beginPath();
                    ctx.arc(e.x - e.w/2 + 8, e.y + ry, 2.5, 0, Math.PI*2);
                    ctx.fill();
                }

                // Panel lines for metallic feel
                ctx.strokeStyle = 'rgba(255,255,255,0.05)';
                ctx.lineWidth = 1;
                ctx.beginPath();
                ctx.moveTo(e.x, e.y - e.h/2); ctx.lineTo(e.x, e.y + e.h/2 - 12);
                ctx.moveTo(e.x - e.w/2, e.y); ctx.lineTo(e.x + e.w/2, e.y);
                ctx.stroke();
            }

            // 4. Windows ( facade feel)
            const flicker = Math.sin(Date.now() * 0.01 + e.id) * 0.3 + 0.7;
            const winSize = 6;
            const winSpacingX = 15;
            const winSpacingY = 18;
            for (let wx = e.x - e.w/2 + 15; wx < e.x + e.w/2 - 10; wx += winSpacingX) {
                for (let wy = e.y - e.h/2 + 15; wy < e.y + e.h/2 - 10; wy += winSpacingY) {
                    const isLit = !isWetland && (Math.floor(wx * 0.7 + wy * 1.3 + e.id)) % 6 > (isWasteland ? 5 : 3);
                    if (isLit) {
                        if (isIndustrial) {
                            ctx.fillStyle = `rgba(0, 242, 255, ${0.4 * flicker})`;
                            ctx.shadowBlur = 8;
                            ctx.shadowColor = '#00f2ff';
                        } else if (isTundra) {
                            ctx.fillStyle = `rgba(150, 220, 255, ${0.3 * flicker})`;
                            ctx.shadowBlur = 5;
                            ctx.shadowColor = '#aaddff';
                        } else {
                            ctx.fillStyle = isWasteland ? `rgba(255, 150, 50, ${0.2 * flicker})` : `rgba(255, 240, 150, ${0.3 * flicker})`;
                            ctx.shadowBlur = isWasteland ? 2 : 5;
                            ctx.shadowColor = isWasteland ? '#ff6600' : 'rgba(255, 240, 150, 0.5)';
                        }
                        ctx.fillRect(wx, wy, winSize, winSize);
                        ctx.shadowBlur = 0;
                    } else {
                        ctx.fillStyle = 'rgba(0, 0, 0, 0.4)';
                        ctx.fillRect(wx, wy, winSize, winSize);
                    }
                }
            }

            // Neon Signs (Disabled for Wetland)
            if (e.id % 5 === 0 && !isWetland) {
                const isIndustrial = currentBiome === 'INDUSTRIAL';
                let neonColors = ['#ff00ff', '#00f2ff', '#ffff00', '#ff0000'];
                let texts = ['HOTEL', 'BAR', 'CLUB', 'REPAIR', 'TANK', 'NEON'];
                
                if (isWasteland) {
                    neonColors = ['#ff5500', '#ff0000', '#aa6600', '#666'];
                    texts = ['DEAD', 'LOST', 'VOID', 'RUST', 'STOP', 'WAR'];
                } else if (isIndustrial) {
                    neonColors = ['#00f2ff', '#00ffff', '#ffff00', '#55ff00'];
                    texts = ['POWER', 'TECH', 'CORE', 'GRID', 'FLOW', 'HVAC'];
                }
                
                const nColor = neonColors[e.id % neonColors.length];
                const text = texts[e.id % texts.length];
                
                ctx.save();
                ctx.translate(e.x, e.y - e.h/2 - 10);
                
                // Intense flickering for wasteland
                const atmoFlicker = isWasteland ? (Math.random() > 0.2 ? (Math.sin(Date.now() * 0.05 + e.id) > 0 ? 1 : 0) : 0) : (Math.sin(Date.now() * 0.02 + e.id) > -0.9 ? 1 : 0);
                
                if (atmoFlicker) {
                    ctx.shadowBlur = isWasteland ? 5 : 10;
                    ctx.shadowColor = nColor;
                    ctx.fillStyle = nColor;
                    ctx.font = 'bold 14px Outfit';
                    ctx.textAlign = 'center';
                    ctx.fillText(text, 0, 0);
                    ctx.fillRect(-ctx.measureText(text).width/2 - 4, 4, ctx.measureText(text).width + 8, 2);
                }
                ctx.restore();
            }

            // Wasteland specific ruin effects (More prominent)
            if (isWasteland && ENABLE_PREMIUM_VISUALS) {
                // Rusted patches / Damage marks
                ctx.fillStyle = 'rgba(0,0,0,0.2)';
                for (let i = 0; i < 3; i++) {
                    const dx = (Math.sin(e.id + i) * 0.4) * e.w;
                    const dy = (getStableRandom(e.id + i + 2.5) - 0.5) * e.h * 0.8;
                    ctx.beginPath();
                    ctx.arc(e.x + dx, e.y + dy, 10 + getStableRandom(e.id + i + 5.1) * 10, 0, Math.PI * 2);
                    ctx.fill();
                }
            }

            // Industrial specific effects (Power arcs)
            if (isIndustrial && ENABLE_PREMIUM_VISUALS) {
                if (Math.random() > 0.98) {
                    ctx.save();
                    ctx.strokeStyle = '#fff';
                    ctx.shadowBlur = 15;
                    ctx.shadowColor = '#00f2ff';
                    ctx.lineWidth = 1.5;
                    ctx.beginPath();
                    let sx = e.x + (Math.random()-0.5)*e.w*0.8;
                    let sy = e.y - e.h/2;
                    ctx.moveTo(sx, sy);
                    for (let i=0; i<4; i++) {
                        sx += (Math.random()-0.5)*30;
                        sy -= Math.random()*20;
                        ctx.lineTo(sx, sy);
                    }
                    ctx.stroke();
                    ctx.restore();
                }
            }

                // Smoke from roof unit (More frequent)
                if (e.id % 2 === 0 && Math.random() > 0.92) {
                    particles.push({
                        x: e.x + (Math.random()-0.5)*20, y: e.y - e.h/2 + 20,
                        vx: (Math.random() - 0.5) * 0.5 + windIntensity,
                        vy: -1.5 - Math.random() * 2,
                        life: 1.2, color: 'rgba(70,70,70,0.4)', size: 8 + Math.random() * 12
                    });
                }
                // Sparks from broken signs (More frequent + larger)
                if (e.id % 3 === 0 && Math.random() > 0.96) {
                    spawnParticles(e.x + (Math.random()-0.5)*e.w, e.y - e.h/2, '#ffffaa', 3, 0.8);
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
        } else if (e.t === MATERIALS.BARREL_EXPLOSIVE || e.t === MATERIALS.BARREL_OIL) {
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
            } else {
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
            ctx.strokeStyle = '#222';
            ctx.strokeRect(-e.w/2 + 8, -e.h/2 + 8, e.w - 16, e.h - 16);
        } else {
            ctx.fillStyle = config.color;
            const isLiquid = [MATERIALS.WATER, MATERIALS.OIL, MATERIALS.DIRT, MATERIALS.ELECTRIC, MATERIALS.ICE, MATERIALS.ACID].includes(e.t);
            const hasSpecialRendering = [MATERIALS.GAS, MATERIALS.STEAM].includes(e.t);

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

            if (isLiquid) {
                // Organic Metaball Tiling (Overlapping circles for a natural blob feel)
                const baseRadius = e.w * 0.5;
                const pulse = (e.t === MATERIALS.WATER || e.t === MATERIALS.OIL) ? (1.0 + Math.sin(renderTime * (e.t === MATERIALS.WATER ? 0.002 : 0.0012) + e.id) * 0.03) : 1.0;
                

                if (e.t === MATERIALS.WATER && ENABLE_PREMIUM_VISUALS && waterPatterns.length > 0) {
                    const drawRadius = baseRadius * pulse;
                    
                    // 1. Depth Gradient
                    const grad = ctx.createRadialGradient(e.x, e.y, 0, e.x, e.y, drawRadius * 1.5);
                    grad.addColorStop(0, 'rgba(0, 80, 220, 0.45)');
                    grad.addColorStop(0.7, 'rgba(0, 40, 150, 0.5)');
                    grad.addColorStop(1, 'rgba(0, 20, 80, 0)'); 
                    ctx.fillStyle = grad;
                    drawOrganicPath(ctx, e.x, e.y, drawRadius, e.id);
                    ctx.fill();

                    // 2. Pattern Layer (Seamless flow)
                    ctx.save();
                    ctx.globalAlpha = 0.85;
                    const p = waterPatterns[e.id % 9];
                    const flowX = (renderTime * 0.02) % WATER_TILE_SIZE;
                    const flowY = (renderTime * 0.01) % WATER_TILE_SIZE;
                    
                    const matrix = new DOMMatrix().translate(flowX, flowY);
                    p.setTransform(matrix);
                    
                    ctx.fillStyle = p;
                    drawOrganicPath(ctx, e.x, e.y, drawRadius, e.id);
                    
                    // 3. Polished Rim Glow & Shoreline Foam
                    ctx.shadowBlur = 15;
                    ctx.shadowColor = 'rgba(0, 242, 255, 0.6)';
                    ctx.fill();
                    
                    ctx.restore();
                } else if (e.t === MATERIALS.OIL && ENABLE_PREMIUM_VISUALS && oilPatterns.length > 0) {
                    ctx.save();
                    const drawRadius = baseRadius * pulse;

                    // Oil Depth (Viscous & Dark)
                    const grad = ctx.createRadialGradient(e.x, e.y, 0, e.x, e.y, drawRadius * 1.5);
                    grad.addColorStop(0, 'rgba(30, 30, 35, 0.95)');
                    grad.addColorStop(0.6, 'rgba(15, 15, 20, 0.98)');
                    grad.addColorStop(1, 'rgba(0, 0, 0, 0)');
                    ctx.fillStyle = grad;
                    
                    drawOrganicPath(ctx, e.x, e.y, drawRadius, e.id);
                    ctx.fill();

                    // Thick Pattern Overlay (Seamless flow)
                    ctx.save();
                    ctx.globalAlpha = 0.95;
                    const p = oilPatterns[e.id % 9];
                    const flowX = -(renderTime * 0.01) % OIL_TILE_SIZE;
                    const flowY = (renderTime * 0.005) % OIL_TILE_SIZE;
                    
                    const matrix = new DOMMatrix().translate(flowX, flowY);
                    p.setTransform(matrix);
                    
                    ctx.fillStyle = p;
                    drawOrganicPath(ctx, e.x, e.y, drawRadius, e.id);
                    ctx.fill();

                    // Dynamic Oily Bubbles
                    ctx.fillStyle = 'rgba(255, 255, 255, 0.1)';
                    for (let i = 0; i < 5; i++) {
                        const seed = e.id + i * 10;
                        const phase = renderTime * (0.0006 + i * 0.0001) + seed;
                        const dist = (0.1 + (i % 3) * 0.2) * drawRadius;
                        const angle = getStableRandom(seed) * Math.PI * 2 + phase;
                        const bx = e.x + Math.cos(angle) * dist;
                        const by = e.y + Math.sin(angle) * dist;
                        const bSize = (Math.sin(phase * 1.5) + 1) * (2 + (i % 2));
                        
                        if (bSize > 1) {
                            ctx.beginPath();
                            ctx.arc(bx, by, bSize, 0, Math.PI * 2);
                            ctx.fill();
                            ctx.fillStyle = 'rgba(255, 255, 255, 0.15)';
                            ctx.beginPath(); ctx.arc(bx - bSize/3, by - bSize/3, bSize/4, 0, Math.PI * 2); ctx.fill();
                            ctx.fillStyle = 'rgba(255, 255, 255, 0.1)';
                        }
                    }
                    ctx.restore(); // Restore Pattern Layer
                    ctx.restore(); // Restore Oil Depth Layer
                } else if (e.t === MATERIALS.ACID && ENABLE_PREMIUM_VISUALS && acidPatterns.length > 0) {
                    ctx.save();
                    const drawRadius = baseRadius * pulse;

                    // 1. Radioactive Base (More vibrant)
                    const grad = ctx.createRadialGradient(e.x, e.y, 0, e.x, e.y, drawRadius * 1.5);
                    grad.addColorStop(0, 'rgba(0, 255, 0, 0.4)'); // Saturated Neon
                    grad.addColorStop(0.7, 'rgba(0, 100, 0, 0.6)');
                    grad.addColorStop(1, 'rgba(0, 20, 0, 0)');
                    ctx.fillStyle = grad;
                    drawOrganicPath(ctx, e.x, e.y, drawRadius, e.id);
                    ctx.fill();

                    // 2. Toxic Pattern
                    ctx.globalAlpha = 1.0; // Full intensity
                    const p = acidPatterns[e.id % 9];
                    const flowX = (renderTime * 0.015) % ACID_TILE_SIZE;
                    const matrix = new DOMMatrix().translate(flowX, flowX * 0.5);
                    p.setTransform(matrix);
                    ctx.fillStyle = p;
                    drawOrganicPath(ctx, e.x, e.y, drawRadius, e.id);
                    ctx.fill();

                    // 3. Radioactive Glow (Tight & Intense neon)
                    ctx.shadowBlur = 12;
                    ctx.shadowColor = 'rgba(0, 255, 100, 0.8)';
                    ctx.fill(); 
                    
                    // NEW: Rising Toxic Wisps
                    ctx.globalAlpha = 0.2;
                    ctx.strokeStyle = '#8f8';
                    ctx.lineWidth = 1;
                    for (let i = 0; i < 2; i++) {
                        const drift = (renderTime * 0.05 + e.id * 100) % 100;
                        ctx.beginPath();
                        ctx.arc(e.x + Math.sin(renderTime * 0.002 + i) * 30, e.y - drift, 5 + drift/10, 0, Math.PI * 2);
                        ctx.stroke();
                    }
                    
                    ctx.restore();
                } else if (e.t === MATERIALS.ELECTRIC && ENABLE_PREMIUM_VISUALS && electricPatterns.length > 0) {
                    const drawRadius = baseRadius;
                    
                    // 1. Electric Depth (Deep Blue Glow)
                    const grad = ctx.createRadialGradient(e.x, e.y, 0, e.x, e.y, drawRadius * 1.5);
                    grad.addColorStop(0, 'rgba(0, 100, 255, 0.4)');
                    grad.addColorStop(0.7, 'rgba(0, 50, 150, 0.5)');
                    grad.addColorStop(1, 'rgba(0, 0, 50, 0)');
                    ctx.fillStyle = grad;
                    drawOrganicPath(ctx, e.x, e.y, drawRadius, e.id);
                    ctx.fill();

                    // 2. High-Voltage Jitter Pattern
                    const p = electricPatterns[e.id % 9];
                    if (p) {
                        ctx.save();
                        ctx.globalAlpha = 0.8;
                        // Rapid jittery movement
                        const flowX = (renderTime * 0.1) % ELECTRIC_TILE_SIZE;
                        const matrix = new DOMMatrix().translate(flowX, -flowX * 0.5);
                        p.setTransform(matrix);
                        ctx.fillStyle = p;
                        
                        // Intense Cyan Glow (Optimized: only if quality allows)
                        ctx.shadowBlur = 10 + Math.sin(renderTime * 0.01) * 5;
                        ctx.shadowColor = '#00f2ff';
                        drawOrganicPath(ctx, e.x, e.y, drawRadius, e.id);
                        ctx.fill();
                        ctx.restore();
                    }

                    // 3. Dynamic Lightning Bolts
                    if (Math.random() > 0.4) { // Throttled lightning for performance
                        ctx.save();
                        ctx.strokeStyle = '#fff';
                        ctx.lineWidth = 1.5;
                        ctx.shadowBlur = 8;
                        ctx.shadowColor = '#00f2ff';
                    for (let i = 0; i < 2; i++) {
                        if (Math.random() > 0.3) {
                            ctx.beginPath();
                            const seed = renderTime + i + e.id;
                            const angle = getStableRandom(seed) * Math.PI * 2;
                            const startDist = drawRadius * 0.2;
                            let lx = e.x + Math.cos(angle) * startDist;
                            let ly = e.y + Math.sin(angle) * startDist;
                            ctx.moveTo(lx, ly);
                            for (let j = 0; j < 4; j++) {
                                lx += (Math.random() - 0.5) * 30;
                                ly += (Math.random() - 0.5) * 30;
                                ctx.lineTo(lx, ly);
                            }
                            ctx.stroke();
                        }
                    }
                    ctx.restore();
                }
            } else {
                // Fallback for non-premium or other liquids (DIRT, ICE, etc.)
                ctx.fillStyle = config.color;
                drawOrganicPath(ctx, e.x, e.y, baseRadius, e.id);
                ctx.fill();
                
                if (e.t === MATERIALS.OIL) {
                    ctx.strokeStyle = 'rgba(0,0,0,0.3)';
                    ctx.lineWidth = 1;
                    ctx.stroke();
                } else if (e.t === MATERIALS.DIRT) {
                    ctx.strokeStyle = 'rgba(0,0,0,0.1)';
                    ctx.lineWidth = 1;
                    ctx.stroke();
                } else if (e.t === MATERIALS.ICE) {
                    ctx.strokeStyle = 'rgba(255,255,255,0.2)';
                    ctx.lineWidth = 1;
                    ctx.stroke();
                }
            }
        } else if (!hasSpecialRendering) {
            // Buildings and other solid objects stay rectangular
            ctx.fillRect(e.x - e.w/2, e.y - e.h/2, e.w, e.h);
        }

        // Gas clouds (Toxic Organic Clouds V4 - Mustard Gas Theme)
        if (e.t === MATERIALS.GAS && ENABLE_PREMIUM_VISUALS && gasPatterns.length > 0) {
            ctx.save();
            const drawRadius = e.w * 0.65;
            
            // 1. Base Atmospheric Glow (More yellowish)
            const gGrad = ctx.createRadialGradient(e.x, e.y, 0, e.x, e.y, drawRadius * 1.5);
            gGrad.addColorStop(0, 'rgba(212, 255, 0, 0.08)');
            gGrad.addColorStop(0.7, 'rgba(180, 220, 0, 0.04)');
            gGrad.addColorStop(1, 'rgba(0, 0, 0, 0)');
            ctx.fillStyle = gGrad;
            drawOrganicPath(ctx, e.x, e.y, drawRadius * 1.2, e.id);
            ctx.fill();

            // 2. Swirling Smoke Pattern (Wispy & Flowing)
            const p = gasPatterns[e.id % 9];
            if (p) {
                ctx.save();
                ctx.globalAlpha = 0.5;
                const flowX = (renderTime * 0.008) % GAS_TILE_SIZE;
                const matrix = new DOMMatrix().translate(flowX, flowX * 0.2);
                p.setTransform(matrix);
                ctx.fillStyle = p;
                
                // Extremely soft edges
                ctx.shadowBlur = 60;
                ctx.shadowColor = 'rgba(212, 255, 0, 0.15)';
                drawOrganicPath(ctx, e.x, e.y, drawRadius, e.id);
                ctx.fill();

                // 3. Secondary Drifting Layer (Volume)
                ctx.globalAlpha = 0.25;
                const matrix2 = new DOMMatrix().translate(-flowX * 0.6, flowX * 0.1);
                p.setTransform(matrix2);
                drawOrganicPath(ctx, e.x + Math.sin(renderTime * 0.0008) * 30, e.y, drawRadius * 0.95, e.id + 5);
                ctx.fill();

                ctx.restore();
            }
            ctx.restore();
        }
        }
        ctx.restore(); // Final balance for ctx.save() at top of forEach
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
    if (currentBiome === 'WASTELAND' && ashParticles.length < 40) {
        if (Math.random() > 0.9) {
            ashParticles.push({
                x: Math.random() * worldSize,
                y: worldSize + 50,
                vx: (Math.random() - 0.5) * 2 + (1.5 * windIntensity),
                vy: -Math.random() * 3 - 2,
                size: 2 + Math.random() * 3,
                life: 1.0,
                rotation: Math.random() * Math.PI * 2,
                rotVel: (Math.random() - 0.5) * 0.2
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

    if (currentBiome === 'WASTELAND' && environmentalObjects.length < 15) {
        if (Math.random() > 0.98) {
            const type = Math.random() > 0.3 ? 'tumbleweed' : 'debris';
            environmentalObjects.push({
                x: -100,
                y: Math.random() * worldSize,
                size: type === 'tumbleweed' ? 10 + Math.random() * 15 : 5 + Math.random() * 10,
                vx: (3 + Math.random() * 5) * windIntensity,
                vy: (Math.random() - 0.5) * 2,
                angle: Math.random() * Math.PI * 2,
                rotationSpeed: 0.1 + Math.random() * 0.2,
                type: type,
                color: type === 'debris' ? (Math.random() > 0.5 ? '#666' : '#8b4513') : '#3a2a1a'
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
            ctx.fillStyle = '#ff6600';
            ctx.shadowBlur = 5;
            ctx.shadowColor = '#ff3300';
            ctx.fillRect(-p.size/2, -p.size/2, p.size, p.size);
            ctx.restore();
        }
    });
    ctx.restore();
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
