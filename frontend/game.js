import { io } from "socket.io-client";
import versionData from './version.json';
import { MATERIALS, MATERIAL_PROPERTIES } from '../backend/gameConfig.js';

// Connect to the same host the game is served from
const socket = io({
    transports: ['websocket', 'polling']
});

socket.on('explosion', (data) => {
    shake.intensity = 20;
    // Massive particle burst
    for (let i = 0; i < 30; i++) {
        const p = createParticle(data.x, data.y, Math.random() > 0.5 ? '#ff4400' : '#ffcc00', 10 + Math.random() * 10);
        p.vx *= 1.5;
        p.vy *= 1.5;
    }
    for (let i = 0; i < 15; i++) {
        createParticle(data.x, data.y, '#333', 15 + Math.random() * 20);
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
const hostBtn = document.getElementById('host-btn');
const joinBtn = document.getElementById('join-btn');
const startGameBtn = document.getElementById('start-game-btn');

const blueTeamList = document.getElementById('blue-team-list');
const pinkTeamList = document.getElementById('pink-team-list');
const lobbyIdSpan = document.getElementById('lobby-id');
const lobbyStatus = document.getElementById('lobby-status');

const addBotBtn = document.getElementById('add-bot-btn');
const removeBotBtn = document.getElementById('remove-bot-btn');
const botDifficulty = document.getElementById('bot-difficulty');
// (Bot button handlers moved to bottom for consistency)

const p1HpBar = document.getElementById('p1-hp');
const p1Scrap = document.getElementById('p1-scrap');
const p2HpBar = document.getElementById('p2-hp');
const p1CooldownBar = document.getElementById('p1-cooldown');
const p2CooldownBar = document.getElementById('p2-cooldown');

// Game State — server (authoritative) vs rendered (interpolated)
let serverState = { players: [], bullets: [], elements: [], zones: [] };
let gameState   = { players: [], bullets: [], elements: [], zones: [] };
let lastScrap = 0;
let popups = []; // { x, y, text, life }
let killFeed = []; // { killer, victim, weapon, killerTeam, victimTeam, time }
let myId = null;

let gameActive = false;
let camera = { x: 0, y: 0 };
let shake = { x: 0, y: 0, intensity: 0 };
let particles = []; // { x, y, vx, vy, life, color, size }
let atmosphereParticles = []; // { x, y, size, vx, vy, speed, color }
let environmentalObjects = []; // Dynamic objects like Tumbleweeds
let lizards = []; // Scurrying desert life
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
    const victim = gameState.players.find(p => p.username === data.victim);
    if (victim) {
        spawnExplosion(victim.x, victim.y, victim.team === 'blue' ? '#00f2ff' : '#ff00ff');
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
const TANK_SIZE = 45;

// Audio setup
const optionsMenu = document.getElementById('options-menu');
const musicSlider = document.getElementById('music-volume');
const sfxSlider = document.getElementById('sfx-volume');
const closeOptionsBtn = document.getElementById('close-options');

const musicTracks = [
    new Audio('/music_track1.mp3'),
    new Audio('/music_track2.mp3')
];
const shotSFX = new Audio('/tank_shot.mp3');

let currentMusicIndex = 0;
let musicVolume = parseFloat(localStorage.getItem('tanks_music_vol')) || 0.5;
let sfxVolume = parseFloat(localStorage.getItem('tanks_sfx_vol')) || 0.7;
let isMenuOpen = false;

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

    const sfx = shotSFX.cloneNode();
    sfx.volume = finalVol;
    
    // Pitch shifting for different weapons
    if (weaponType === 'TESLA') {
        sfx.playbackRate = 2.0; // Sharp electric snap
    } else if (weaponType === 'ARTILLERY') {
        sfx.playbackRate = 0.7; // Deep heavy boom
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
    localStorage.setItem('tanks_sfx_vol', sfxVolume);
};

function toggleMenu() {
    isMenuOpen = !isMenuOpen;
    optionsMenu.style.display = isMenuOpen ? 'flex' : 'none';
}

if (closeOptionsBtn) closeOptionsBtn.onclick = toggleMenu;

// MATERIALS is now imported from gameConfig.js

const WEAPON_NAMES = {
    STANDARD: 'Main Gun', FLAMETHROWER: 'Flamethrower', WATER_CANNON: 'Water Cannon',
    DIRT_GUN: 'Dirt Gun', TESLA: 'Tesla Coil', FROST_GUN: 'Frost Gun'
};
const WEAPON_ABBR = {
    STANDARD: 'GUN', FLAMETHROWER: 'FIRE', WATER_CANNON: 'H₂O',
    DIRT_GUN: 'DIRT', TESLA: 'ARC', FROST_GUN: 'ICE'
};
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
        socket.emit('input', keys);
    }
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
    if (!gameActive) return;

    let changed = false;
    if (code === 'KeyW' || code === 'ArrowUp') { keys.up = isPressed; changed = true; }
    if (code === 'KeyS' || code === 'ArrowDown') { keys.down = isPressed; changed = true; }
    if (code === 'KeyA' || code === 'ArrowLeft') { keys.left = isPressed; changed = true; }
    if (code === 'KeyD' || code === 'ArrowRight') { keys.right = isPressed; changed = true; }
    if (code === 'Space' || code === 'Enter') {
        keys.shoot = isPressed;
        changed = true;
    }

    if (changed) {
        updateAimAngle();
        socket.emit('input', keys);
    }

    // Weapon slot switching
    if (isPressed) {
        if (code === 'Escape') toggleMenu();
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
    lobbyIdSpan.innerText = id.toUpperCase();
    
    blueTeamList.innerHTML = '';
    pinkTeamList.innerHTML = '';
    
    players.forEach(p => {
        const item = document.createElement('div');
        item.className = `player-item ${p.id === myId ? 'self' : ''}`;
        item.innerText = p.username.toUpperCase();
        
        if (p.team === 'blue') blueTeamList.appendChild(item);
        else pinkTeamList.appendChild(item);
        
        if (p.id === myId) {
            const lobbyChassisSelect = document.getElementById('lobby-chassis-select');
            if (lobbyChassisSelect && lobbyChassisSelect.value !== p.chassis) {
                lobbyChassisSelect.value = p.chassis;
            }
        }
    });

    const count = players.length;
    lobbyStatus.innerText = `PLAYERS: ${count}/10`;
    
    if (count >= 1) {
        startGameBtn.classList.remove('hidden');
    } else {
        startGameBtn.classList.add('hidden');
    }
}

socket.on('lobby-update', ({ id, players }) => {
    splashScreen.classList.add('hidden');
    lobbyScreen.classList.remove('hidden');
    updateLobbyUI(id, players);
});

socket.on('game-started', () => {
    lobbyScreen.classList.add('hidden');
    gameOverScreen.classList.add('hidden');
    hud.classList.remove('hidden');
    if ('ontouchstart' in window) {
        document.getElementById('mobile-controls').classList.remove('hidden');
    }
    gameActive = true;
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
            row.className = `result-row ${p.team}`;
            row.innerHTML = `
                <div>${p.username.toUpperCase()}</div>
                <div>${p.kills}</div>
                <div>${p.deaths}</div>
                <div>${p.scrap}</div>
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

const lobbyChassisSelect = document.getElementById('lobby-chassis-select');
if (lobbyChassisSelect) {
    lobbyChassisSelect.onchange = (e) => {
        socket.emit('change-chassis', e.target.value);
    };
}

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
                playWeaponSound(b.weapon, b.x, b.y);
                knownBulletIds.add(b.id);
                
                // Muzzle Flash / Spawn particles
                spawnParticles(b.x, b.y, b.color, 5);
                
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
    if (me && me.scrap > lastScrap) {
        const renderMe = gameState.players.find(p => p.id === myId) || me;
        popups.push({ x: renderMe.x, y: renderMe.y - 40, text: `+${me.scrap - lastScrap} SCRAP`, life: 1.0 });
        lastScrap = me.scrap;
    }
    updateHUD();
    
    if (state.gameOver && gameActive) {
        gameActive = false;
    }
});

function updateHUD() {
    const me = serverState.players.find(p => p.id === myId);
    if (me) {
        if (p1HpBar.dataset.val !== me.hp.toString()) {
            const oldHp = parseFloat(p1HpBar.dataset.val || me.maxHp);
            if (me.hp < oldHp) {
                shake.intensity = 15;
                spawnParticles(me.x, me.y, '#fff', 10);
            }
            p1HpBar.style.width = `${(me.hp / me.maxHp) * 100}%`;
            p1HpBar.dataset.val = me.hp;
        }
        if (p1Scrap && p1Scrap.innerText !== me.scrap.toString()) {
            p1Scrap.innerText = me.scrap;
        }

        const weaponNameEl = document.getElementById('weapon-name');
        if (weaponNameEl) weaponNameEl.innerText = WEAPON_NAMES[me.weapon] || me.weapon;

        const selector = document.querySelector('.p1-stats .weapon-selector');
        if (selector) {
            if (selector.children.length !== me.slots.length) {
                selector.innerHTML = '';
                me.slots.forEach((slot, index) => {
                    const icon = document.createElement('div');
                    icon.className = `weapon-icon ${index === me.currentSlot ? 'active' : ''}`;
                    icon.dataset.player = "1";
                    icon.dataset.slot = slot;
                    icon.innerText = WEAPON_ABBR[slot] || (index + 1);
                    selector.appendChild(icon);
                });
                selector.dataset.currentSlot = me.currentSlot;
            } else {
                if (selector.dataset.currentSlot !== me.currentSlot.toString()) {
                    const icons = selector.querySelectorAll('.weapon-icon');
                    icons.forEach((icon, index) => {
                        icon.classList.toggle('active', index === me.currentSlot);
                    });
                    selector.dataset.currentSlot = me.currentSlot;
                }
            }
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
        ctx.beginPath();
        ctx.rect(0, 0, gameState.worldSize, gameState.worldSize);
        ctx.clip();

        drawZones();
        drawGrid();
        
        if (ENABLE_PREMIUM_VISUALS) {
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
                const currentBiome = gameState.zones && gameState.zones[0] ? gameState.zones[0].type : 'RANDOM';
                const isMoving = p.id === myId ? (keys.up || keys.down || keys.left || keys.right) : true; 
                if (isMoving) {
                    // More intense dust in wasteland
                    const pCount = currentBiome === 'WASTELAND' ? 2 : 1;
                    const pColor = currentBiome === 'WASTELAND' ? 'rgba(150, 100, 50, 0.3)' : 'rgba(100,100,100,0.2)';
                    spawnParticles(p.x - Math.cos(p.angle) * 20, p.y - Math.sin(p.angle) * 20, pColor, pCount, 0.5);
                }
            }
        });
        updateParticles(dt);
        drawParticles();
        drawPopups(dt);

        ctx.restore();

        drawMinimap();
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
    if (p.hidden && p.id !== myId) return;

    const color = p.team === 'blue' ? '#00f2ff' : '#ff00ff';
    ctx.save();
    if (p.hidden && p.id === myId) ctx.globalAlpha = 0.5;
    
    // Burning Glow Effect
    if (p.burning) {
        ctx.shadowBlur = 15 + Math.sin(Date.now() * 0.01) * 5;
        ctx.shadowColor = '#ff4400';
    }

    ctx.translate(p.x, p.y);
    ctx.save();
    ctx.rotate(p.angle);

    // Tracks (Larvfotter)
    ctx.fillStyle = '#111';
    ctx.strokeStyle = '#222';
    ctx.lineWidth = 1;
    // Left Track
    ctx.beginPath();
    ctx.roundRect(-TANK_SIZE/2 - 4, -TANK_SIZE/2 + 2, TANK_SIZE + 8, 10, 3);
    ctx.fill();
    ctx.stroke();
    // Right Track
    ctx.beginPath();
    ctx.roundRect(-TANK_SIZE/2 - 4, TANK_SIZE/2 - 12, TANK_SIZE + 8, 10, 3);
    ctx.fill();
    ctx.stroke();

    // Body
    ctx.fillStyle = '#1a1a2e';
    ctx.strokeStyle = color;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.roundRect(-TANK_SIZE/2, -TANK_SIZE/2, TANK_SIZE, TANK_SIZE, 8);
    ctx.fill();
    ctx.stroke();

    // Front Indicators (Headlights)
    ctx.fillStyle = 'rgba(255, 255, 100, 0.8)';
    ctx.beginPath();
    ctx.arc(TANK_SIZE/2 - 4, -TANK_SIZE/4, 3, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(TANK_SIZE/2 - 4, TANK_SIZE/4, 3, 0, Math.PI * 2);
    ctx.fill();

    // Back Indicators (Engine Vents)
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.2)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(-TANK_SIZE/2 + 6, -10);
    ctx.lineTo(-TANK_SIZE/2 + 6, 10);
    ctx.moveTo(-TANK_SIZE/2 + 10, -10);
    ctx.lineTo(-TANK_SIZE/2 + 10, 10);
    ctx.stroke();
    
    ctx.restore();

    // Turret (Separate Rotation)
    ctx.save();
    ctx.rotate(p.aimAngle || p.angle);
    
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
    const weaponType = p.slots && p.slots[p.currentSlot];
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
    const labelY = -TANK_SIZE - 5 - (p.labelYOffset || 0);
    ctx.fillText(p.username.toUpperCase(), 0, labelY);
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
        ctx.arc(0, 0, TANK_SIZE * 0.85, 0, Math.PI * 2);
        ctx.stroke();
        
        // Inner glow
        ctx.globalAlpha = 0.2 + Math.sin(renderTime * 0.01) * 0.1;
        ctx.fillStyle = '#fff';
        ctx.beginPath();
        ctx.arc(0, 0, TANK_SIZE * 0.8, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
    }

    // Status Icons
    if (p.stunned || p.slowed || p.burning || p.scrap >= 100) {
        ctx.save();
        ctx.translate(p.x, p.y - TANK_SIZE - 30);
        ctx.textAlign = 'center';
        
        let yOffset = 0;
        if (p.stunned) {
            ctx.fillStyle = '#ffff00';
            ctx.font = '700 16px Outfit';
            ctx.fillText('⚡ STUNNED', 0, yOffset);
            yOffset -= 20;
        }
        if (p.slowed) {
            ctx.fillStyle = '#00aaff';
            ctx.font = '700 16px Outfit';
            ctx.fillText('❄️ SLOWED', 0, yOffset);
            yOffset -= 20;
        }
        if (p.burning) {
            ctx.fillStyle = '#ff4400';
            ctx.font = '700 16px Outfit';
            ctx.fillText('🔥 BURNING', 0, yOffset);
            yOffset -= 20;
        }
        if (p.wet) {
            ctx.fillStyle = '#0088ff';
            ctx.font = '700 16px Outfit';
            ctx.fillText('💧 WET', 0, yOffset);
            yOffset -= 20;
        }
        
        // Show buff level only if not stunned (to keep UI clean)
        if (p.scrap >= 100 && !p.stunned && !p.slowed && !p.burning && !p.wet) {
            const buffLevel = Math.floor(p.scrap / 100);
            if (buffLevel >= 5) {
                ctx.fillStyle = '#ffcc00';
                ctx.font = '900 16px Outfit';
                ctx.fillText('⭐ MAX BUFF', 0, yOffset);
            } else if (buffLevel >= 1) {
                ctx.fillStyle = '#00ffaa';
                ctx.font = '700 14px Outfit';
                ctx.fillText(`🔷 LVL ${buffLevel} BUFF`, 0, yOffset);
            }
        }
        ctx.restore();
    }
}

function drawMinimap() {
    const size = 180;
    const padding = 25;
    const x = canvas.width - size - padding;
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
        
        if (e.type === 'building') {
            ctx.fillStyle = 'rgba(255, 255, 255, 0.15)';
            ctx.fillRect(ex - (e.w/2)*scale, ey - (e.h/2)*scale, e.w * scale, e.h * scale);
        } else if (e.type === 'scrap') {
            ctx.fillStyle = '#ffd700';
            ctx.beginPath();
            ctx.arc(ex, ey, 1.5, 0, Math.PI * 2);
            ctx.fill();
        }
    });

    // Players
    gameState.players.forEach(p => {
        if (p.hidden && p.id !== myId) return;
        const color = p.team === 'blue' ? '#00f2ff' : '#ff00ff';
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
        // 1. Base floor (Asphalt for Urban, Concrete for Industrial)
        ctx.fillStyle = isIndustrial ? '#1e1e24' : '#08080c';
        ctx.fillRect(0, 0, worldSize, worldSize);

        // Industrial Concrete Plate Lines
        if (isIndustrial) {
            ctx.strokeStyle = 'rgba(255,255,255,0.03)';
            ctx.lineWidth = 2;
            const plateSize = 200;
            ctx.beginPath();
            for (let x = 0; x < worldSize; x += plateSize) {
                ctx.moveTo(x, 0); ctx.lineTo(x, worldSize);
            }
            for (let y = 0; y < worldSize; y += plateSize) {
                ctx.moveTo(0, y); ctx.lineTo(worldSize, y);
            }
            ctx.stroke();
        }

        // 1.1 Procedural Ground Detail (Grit & Stains)
        if (ENABLE_PREMIUM_VISUALS) {
            if (groundDetails.length === 0) {
                for (let i = 0; i < 800; i++) {
                    groundDetails.push({
                        x: Math.random() * worldSize,
                        y: Math.random() * worldSize,
                        size: 1 + Math.random() * 3,
                        opacity: 0.05 + Math.random() * 0.1,
                        isDark: Math.random() > 0.5
                    });
                }
            }
            
            ctx.save();
            groundDetails.forEach(d => {
                // Only draw if on screen
                if (d.x > camera.x - 10 && d.x < camera.x + canvas.width + 10 &&
                    d.y > camera.y - 10 && d.y < camera.y + canvas.height + 10) {
                    ctx.fillStyle = d.isDark ? `rgba(0,0,0,${d.opacity})` : `rgba(255,255,255,${d.opacity * 0.3})`;
                    ctx.beginPath();
                    ctx.arc(d.x, d.y, d.size, 0, Math.PI * 2);
                    ctx.fill();
                }
            });
            ctx.restore();
        }

        const blockSize = 350;
        const streetWidth = 150;
        const padding = 150;
        const step = blockSize + streetWidth;

        // 2. Draw Sidewalks (Curbs)
        ctx.fillStyle = isIndustrial ? '#11111a' : '#1a1a25';
        for (let x = padding - 10; x < worldSize - padding; x += step) {
            for (let y = padding - 10; y < worldSize - padding; y += step) {
                ctx.beginPath();
                ctx.roundRect(x, y, blockSize + 20, blockSize + 20, 10);
                ctx.fill();
                // Subtle curb edge
                ctx.strokeStyle = isIndustrial ? 'rgba(0, 242, 255, 0.08)' : 'rgba(255,255,255,0.03)';
                ctx.stroke();

                // Industrial circuitry patterns on sidewalks
                if (isIndustrial && ENABLE_PREMIUM_VISUALS) {
                    ctx.strokeStyle = 'rgba(0, 242, 255, 0.04)';
                    ctx.lineWidth = 1;
                    for (let i = 20; i < blockSize; i += 40) {
                        ctx.beginPath();
                        ctx.moveTo(x + i, y + 10); ctx.lineTo(x + i, y + blockSize + 10);
                        ctx.stroke();
                        ctx.beginPath();
                        ctx.moveTo(x + 10, y + i); ctx.lineTo(x + blockSize + 10, y + i);
                        ctx.stroke();
                    }
                }
            }
        }

        // 3. Grid Lines (Subtle Scanning Grid)
        ctx.strokeStyle = 'rgba(0, 242, 255, 0.03)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        for (let x = 0; x <= worldSize; x += 100) {
            ctx.moveTo(x, 0); ctx.lineTo(x, worldSize);
            ctx.moveTo(0, x); ctx.lineTo(worldSize, x);
        }
        ctx.stroke();

        // 4. Road Markings (Worn Yellow dashed lines)
        ctx.strokeStyle = 'rgba(255, 200, 0, 0.15)';
        ctx.setLineDash([20, 30]);
        ctx.lineWidth = 2;
        ctx.beginPath();
        
        for (let x = padding - streetWidth/2; x < worldSize; x += step) {
            ctx.moveTo(x, 0); ctx.lineTo(x, worldSize);
        }
        for (let y = padding - streetWidth/2; y < worldSize; y += step) {
            ctx.moveTo(0, y); ctx.lineTo(worldSize, y);
        }
        ctx.stroke();
        ctx.setLineDash([]); 

        // 5. Crosswalks (Worn Zebra crossings)
        ctx.fillStyle = 'rgba(255, 255, 255, 0.05)';
        for (let x = padding + blockSize; x < worldSize - padding; x += step) {
            for (let y = padding + blockSize; y < worldSize - padding; y += step) {
                for (let i = 0; i < 5; i++) {
                    // Add random wear to crosswalk bars
                    if (Math.random() > 0.1) {
                        ctx.fillRect(x + 15, y + 20 + i*25, streetWidth - 30, 10);
                    }
                }
            }
        }
    } else if (currentBiome === 'WASTELAND') {
        // 1. Dust/Rust Base
        ctx.fillStyle = '#160e0a';
        ctx.fillRect(0, 0, worldSize, worldSize);

        if (ENABLE_PREMIUM_VISUALS) {
            // Heat Shimmer (subtle wobble)
            const wobble = Math.sin(Date.now() * 0.003) * 1.5;
            ctx.translate(0, wobble);
            
            // Ground Textures
            if (groundDetails.length === 0) {
                for (let i = 0; i < 700; i++) {
                    const r = Math.random();
                    groundDetails.push({
                        x: Math.random() * worldSize,
                        y: Math.random() * worldSize,
                        size: r < 0.1 ? 15 + Math.random() * 25 : (r < 0.3 ? 5 + Math.random() * 10 : 2 + Math.random() * 5),
                        opacity: 0.04 + Math.random() * 0.1,
                        type: r < 0.1 ? 'rock' : (r < 0.3 ? 'crack' : 'dust'),
                        color: Math.random() > 0.5 ? '#2a1a0f' : '#1e140d'
                    });
                }
            }
            ctx.save();
            groundDetails.forEach(d => {
                if (d.x > camera.x - 40 && d.x < camera.x + canvas.width + 40 &&
                    d.y > camera.y - 40 && d.y < camera.y + canvas.height + 40) {
                    if (d.type === 'rock') {
                        ctx.fillStyle = '#1a100a';
                        ctx.globalAlpha = d.opacity * 2;
                        ctx.beginPath();
                        ctx.moveTo(d.x, d.y - d.size);
                        ctx.lineTo(d.x + d.size, d.y);
                        ctx.lineTo(d.x, d.y + d.size);
                        ctx.lineTo(d.x - d.size, d.y);
                        ctx.closePath();
                        ctx.fill();
                        ctx.strokeStyle = 'rgba(255, 150, 50, 0.05)';
                        ctx.stroke();
                    } else if (d.type === 'crack') {
                        ctx.strokeStyle = 'rgba(0, 0, 0, 0.2)';
                        ctx.lineWidth = 1;
                        ctx.beginPath();
                        ctx.moveTo(d.x - d.size, d.y);
                        ctx.lineTo(d.x + d.size, d.y);
                        ctx.stroke();
                    } else {
                        ctx.fillStyle = d.color;
                        ctx.globalAlpha = d.opacity;
                        ctx.beginPath();
                        ctx.arc(d.x, d.y, d.size, 0, Math.PI * 2);
                        ctx.fill();
                    }
                }
            });
            ctx.restore();

            // Cloud Shadows
            ctx.save();
            ctx.globalCompositeOperation = 'multiply';
            ctx.fillStyle = 'rgba(0, 0, 0, 0.05)';
            for (let i = 0; i < 3; i++) {
                const cx = ((renderTime * 0.5) + (i * worldSize/3)) % worldSize;
                const cy = ((renderTime * 0.3) + (i * worldSize/4)) % worldSize;
                ctx.beginPath();
                ctx.ellipse(cx, cy, 400, 300, Math.PI/4, 0, Math.PI * 2);
                ctx.fill();
            }
            ctx.restore();

            // Scurrying Lizards
            if (lizards.length === 0) {
                for (let i = 0; i < 20; i++) {
                    lizards.push({ x: Math.random() * worldSize, y: Math.random() * worldSize, vx: 0, vy: 0 });
                }
            }
            const me = gameState.players.find(p => p.id === myId);
            lizards.forEach(l => {
                if (me) {
                    const dist = Math.hypot(me.x - l.x, me.y - l.y);
                    if (dist < 150) {
                        const angle = Math.atan2(l.y - me.y, l.x - me.x);
                        l.vx = Math.cos(angle) * 5;
                        l.vy = Math.sin(angle) * 5;
                    }
                }
                l.x += l.vx; l.y += l.vy;
                l.vx *= 0.95; l.vy *= 0.95;
                if (l.x > camera.x && l.x < camera.x + canvas.width && l.y > camera.y && l.y < camera.y + canvas.height) {
                    ctx.fillStyle = '#4a3a1a';
                    ctx.fillRect(l.x, l.y, 3, 2);
                }
            });
        }

        // Wind streaks (Dynamic)
        const windSpeed = 200 * windIntensity;
        const windOffset = (renderTime * 0.2) % 300;
        ctx.strokeStyle = `rgba(255, 255, 255, ${0.02 * windIntensity})`;
        ctx.lineWidth = 1;
        ctx.setLineDash([100, 200]);
        ctx.beginPath();
        for (let i = -300; i < worldSize + 300; i += 300) {
            const y = i + windOffset;
            ctx.moveTo(0, y);
            ctx.lineTo(worldSize, y + 100);
        }
        ctx.stroke();
        ctx.setLineDash([]);
    } else if (currentBiome === 'ICE') {
        // 1. Frosty Deep Blue Base
        ctx.fillStyle = '#08141c';
        ctx.fillRect(0, 0, worldSize, worldSize);

        if (ENABLE_PREMIUM_VISUALS) {
            if (groundDetails.length === 0) {
                for (let i = 0; i < 400; i++) {
                    groundDetails.push({
                        x: Math.random() * worldSize,
                        y: Math.random() * worldSize,
                        size: 10 + Math.random() * 20,
                        opacity: 0.05 + Math.random() * 0.1,
                        type: Math.random() > 0.7 ? 'crack' : 'snow'
                    });
                }
            }
            ctx.save();
            groundDetails.forEach(d => {
                if (d.x > camera.x - 30 && d.x < camera.x + canvas.width + 30 &&
                    d.y > camera.y - 30 && d.y < camera.y + canvas.height + 30) {
                    if (d.type === 'snow') {
                        ctx.fillStyle = '#fff';
                        ctx.globalAlpha = d.opacity * 0.4;
                        ctx.beginPath();
                        ctx.arc(d.x, d.y, d.size, 0, Math.PI * 2);
                        ctx.fill();
                    } else {
                        ctx.strokeStyle = 'rgba(200, 240, 255, 0.15)';
                        ctx.lineWidth = 1;
                        ctx.beginPath();
                        ctx.moveTo(d.x - d.size, d.y - d.size/2);
                        ctx.lineTo(d.x + d.size, d.y + d.size/2);
                        ctx.stroke();
                    }
                }
            });
            ctx.restore();
        }
    } else if (currentBiome === 'INDUSTRIAL') {
        // 1. Concrete Grey Base
        ctx.fillStyle = '#121214';
        ctx.fillRect(0, 0, worldSize, worldSize);

        if (ENABLE_PREMIUM_VISUALS) {
            if (groundDetails.length === 0) {
                for (let i = 0; i < 500; i++) {
                    groundDetails.push({
                        x: Math.random() * worldSize,
                        y: Math.random() * worldSize,
                        size: 5 + Math.random() * 15,
                        opacity: 0.05 + Math.random() * 0.15,
                        type: Math.random() > 0.5 ? 'stain' : 'line'
                    });
                }
            }
            ctx.save();
            groundDetails.forEach(d => {
                if (d.x > camera.x - 30 && d.x < camera.x + canvas.width + 30 &&
                    d.y > camera.y - 30 && d.y < camera.y + canvas.height + 30) {
                    if (d.type === 'stain') {
                        ctx.fillStyle = '#000';
                        ctx.globalAlpha = d.opacity;
                        ctx.beginPath();
                        ctx.arc(d.x, d.y, d.size, 0, Math.PI * 2);
                        ctx.fill();
                    } else {
                        ctx.fillStyle = 'rgba(255, 200, 0, 0.05)';
                        ctx.fillRect(d.x, d.y, 40, 2);
                    }
                }
            });
            ctx.restore();
        }
    } else if (currentBiome === 'WETLAND') {
        // 1. Murky Green Base
        ctx.fillStyle = '#0a100a';
        ctx.fillRect(0, 0, worldSize, worldSize);

        if (ENABLE_PREMIUM_VISUALS) {
            if (groundDetails.length === 0) {
                for (let i = 0; i < 300; i++) {
                    groundDetails.push({
                        x: Math.random() * worldSize,
                        y: Math.random() * worldSize,
                        size: 15 + Math.random() * 25,
                        opacity: 0.1 + Math.random() * 0.15,
                        color: Math.random() > 0.5 ? '#1a2a1a' : '#0a1a0a'
                    });
                }
            }
            ctx.save();
            groundDetails.forEach(d => {
                if (d.x > camera.x - 40 && d.x < camera.x + canvas.width + 40 &&
                    d.y > camera.y - 40 && d.y < camera.y + canvas.height + 40) {
                    ctx.fillStyle = d.color;
                    ctx.globalAlpha = d.opacity;
                    ctx.beginPath();
                    ctx.arc(d.x, d.y, d.size, 0, Math.PI * 2);
                    ctx.fill();
                }
            });
            ctx.restore();
        }
    } else {
        // Default Grid
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.02)'; 
        ctx.lineWidth = 1;
        const startX = Math.max(0, Math.floor(camera.x / gridSize) * gridSize);
        const endX = Math.min(worldSize, Math.ceil((camera.x + canvas.width) / gridSize) * gridSize);
        const startY = Math.max(0, Math.floor(camera.y / gridSize) * gridSize);
        const endY = Math.min(worldSize, Math.ceil((camera.y + canvas.height) / gridSize) * gridSize);

        ctx.beginPath();
        for (let x = startX; x <= endX; x += gridSize) {
            ctx.moveTo(x, startY); ctx.lineTo(x, endY);
        }
        for (let y = startY; y <= endY; y += gridSize) {
            ctx.moveTo(startX, y); ctx.lineTo(endX, y);
        }
        ctx.stroke();
    }
}

function interpolateState(dt) {
    const P = 1 - Math.pow(0.75, dt); // frame-rate independent lerp (~0.25 at 60fps)

    gameState.bullets   = serverState.bullets;
    gameState.elements  = serverState.elements;
    gameState.guardians = serverState.guardians;
    gameState.zones     = serverState.zones;
    gameState.worldSize = serverState.worldSize;

    gameState.players = serverState.players.map(sp => {
        const gp = gameState.players.find(p => p.id === sp.id);
        if (!gp) return { ...sp };
        const P = sp.id === myId ? 1.0 : (1 - Math.pow(0.75, dt)); // local player snaps to server position
        return {
            ...sp,
            x: lerp(gp.x, sp.x, P),
            y: lerp(gp.y, sp.y, P),
            angle: lerpAngle(gp.angle, sp.angle, P),
            aimAngle: lerpAngle(gp.aimAngle || gp.angle, sp.aimAngle || sp.angle, P)
        };
    });

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
    const currentBiome = gameState.zones && gameState.zones[0] ? gameState.zones[0].type : 'RANDOM';
    const isWasteland = currentBiome === 'WASTELAND';
    const isIndustrial = currentBiome === 'INDUSTRIAL';

    gameState.elements.forEach(e => {
        ctx.save();
        const config = MATERIAL_PROPERTIES[e.type] || { color: '#fff' };
        
        if (e.type === MATERIALS.BUILDING) {
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
            } else {
                bGradient.addColorStop(0, '#252535'); // Top (lighter)
                bGradient.addColorStop(1, '#151520'); // Bottom (darker)
            }
            ctx.fillStyle = bGradient;
            ctx.strokeStyle = isWasteland ? 'rgba(150, 80, 50, 0.5)' : 'rgba(0, 242, 255, 0.6)';
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.roundRect(e.x - e.w/2, e.y - e.h/2, e.w, e.h, 4);
            ctx.fill();
            ctx.stroke();

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
                    const isLit = (Math.floor(wx * 0.7 + wy * 1.3 + e.id)) % 6 > (isWasteland ? 5 : 3);
                    if (isLit) {
                        if (isIndustrial) {
                            ctx.fillStyle = `rgba(0, 242, 255, ${0.4 * flicker})`;
                            ctx.shadowBlur = 8;
                            ctx.shadowColor = '#00f2ff';
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

            // Neon Signs on random buildings
            if (e.id % 5 === 0) {
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
                    const dy = (Math.cos(e.id * 2 + i) * 0.4) * e.h;
                    ctx.beginPath();
                    ctx.arc(e.x + dx, e.y + dy, 10 + Math.random() * 10, 0, Math.PI * 2);
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
        } else if (e.type === MATERIALS.SCRAP) {
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
        } else if (e.type === MATERIALS.BARREL_EXPLOSIVE || e.type === MATERIALS.BARREL_OIL) {
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
            if (e.type === MATERIALS.BARREL_EXPLOSIVE) {
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
        } else if (e.type === MATERIALS.CRATE) {
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
            ctx.beginPath();
            if (e.type === MATERIALS.DIRT) {
                ctx.roundRect(e.x - e.w/2, e.y - e.h/2, e.w, e.h, 5);
            } else {
                // Draw puddles as blobs
                ctx.arc(e.x, e.y, e.w/2, 0, Math.PI * 2);
            }
            ctx.fill();

            // Add animated lightning for electric pools
            if (e.type === MATERIALS.ELECTRIC) {
                ctx.save();
                ctx.strokeStyle = '#fff';
                ctx.lineWidth = 2;
                ctx.shadowBlur = 10;
                ctx.shadowColor = '#00f2ff';
                ctx.beginPath();
                for (let i = 0; i < 2; i++) {
                    let lx = e.x + (Math.random() - 0.5) * e.w * 0.7;
                    let ly = e.y + (Math.random() - 0.5) * e.h * 0.7;
                    ctx.moveTo(lx, ly);
                    for (let j = 0; j < 3; j++) {
                        lx += (Math.random() - 0.5) * 25;
                        ly += (Math.random() - 0.5) * 25;
                        ctx.lineTo(lx, ly);
                    }
                }
                ctx.stroke();
                ctx.restore();
            }

            // Acid / Radioactive Pools
            if (e.type === MATERIALS.ACID) {
                ctx.save();
                const pulse = 0.7 + Math.sin(renderTime * 0.005 + e.id) * 0.3;
                ctx.shadowBlur = 15 * pulse;
                ctx.shadowColor = '#00ff00';
                
                // Core puddle
                ctx.fillStyle = 'rgba(50, 200, 50, 0.3)';
                ctx.beginPath();
                ctx.arc(e.x, e.y, e.w/2, 0, Math.PI * 2);
                ctx.fill();

                // Pulsing glow
                ctx.fillStyle = `rgba(100, 255, 0, ${0.1 * pulse})`;
                ctx.beginPath();
                ctx.arc(e.x, e.y, e.w/2 + 10, 0, Math.PI * 2);
                ctx.fill();
                
                // Bubbles
                ctx.fillStyle = 'rgba(200, 255, 150, 0.5)';
                for (let i = 0; i < 4; i++) {
                    const phase = renderTime * 0.01 + e.id + i * 2;
                    const bx = e.x + Math.cos(phase * 0.7) * (e.w/3);
                    const by = e.y + Math.sin(phase * 1.3) * (e.h/3);
                    const bSize = (Math.sin(phase * 2) + 1) * 3;
                    if (bSize > 0.5) {
                        ctx.beginPath();
                        ctx.arc(bx, by, bSize, 0, Math.PI * 2);
                        ctx.fill();
                        // Tiny highlight on bubble
                        ctx.fillStyle = 'rgba(255,255,255,0.4)';
                        ctx.beginPath();
                        ctx.arc(bx - bSize/3, by - bSize/3, bSize/4, 0, Math.PI*2);
                        ctx.fill();
                        ctx.fillStyle = 'rgba(200, 255, 150, 0.5)'; // Reset
                    }
                }
                ctx.restore();
            }

            // Gas clouds
            if (e.type === MATERIALS.GAS) {
                ctx.save();
                const pulse = Math.sin(renderTime * 0.003 + e.id) * 0.1;
                ctx.globalAlpha = 0.4 + pulse;
                const gGrad = ctx.createRadialGradient(e.x, e.y, 0, e.x, e.y, e.w/2);
                gGrad.addColorStop(0, 'rgba(100, 200, 50, 0.5)');
                gGrad.addColorStop(0.6, 'rgba(100, 200, 50, 0.2)');
                gGrad.addColorStop(1, 'rgba(100, 200, 50, 0)');
                ctx.fillStyle = gGrad;
                ctx.beginPath();
                ctx.arc(e.x, e.y, e.w/2, 0, Math.PI * 2);
                ctx.fill();
                
                // Wisps
                ctx.strokeStyle = 'rgba(150, 255, 100, 0.1)';
                ctx.lineWidth = 2;
                for (let i = 0; i < 3; i++) {
                    ctx.beginPath();
                    const rot = renderTime * 0.001 + i * 2;
                    ctx.ellipse(e.x, e.y, e.w/3, e.h/4, rot, 0, Math.PI * 2);
                    ctx.stroke();
                }
                ctx.restore();
            }
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
        
        // Drone Body (Triangle)
        ctx.rotate(g.angle);
        ctx.fillStyle = '#111';
        ctx.strokeStyle = '#00f2ff';
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.moveTo(30, 0);
        ctx.lineTo(-20, -20);
        ctx.lineTo(-20, 20);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();

        // Eye / Lens
        ctx.fillStyle = '#ff3333';
        ctx.beginPath();
        ctx.arc(10, 0, 4, 0, Math.PI * 2);
        ctx.fill();
        
        // Health bar
        ctx.restore();
        ctx.save();
        ctx.translate(g.x, g.y);
        const hpPerc = g.hp / g.maxHp;
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
            const maxLen = TRAIL_LENGTHS[b.type] || 4;
            if (trail.length > maxLen) trail.shift();
        }
    }
}

function drawBulletTrails() {
    ctx.lineCap = 'round';
    for (const b of gameState.bullets) {
        const trail = bulletTrails.get(b.id);
        if (!trail || trail.length < 2) continue;
        const trailColor = TRAIL_COLORS[b.type] || b.color;
        const trailW = TRAIL_WIDTHS[b.type] || 2;
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
    if (b.type === 'fire' || b.weapon === 'FLAMETHROWER') {
        drawFireBullet(b);
        return;
    }
    
    switch (b.type) {
        case 'metal':    drawMetalBullet(b);    break;
        case 'water':    drawWaterBullet(b);    break;
        case 'dirt':     drawDirtBullet(b);     break;
        case 'electric': drawElectricBullet(b); break;
        case 'ice':      drawIceBullet(b);      break;
        default:
            ctx.fillStyle = b.color || '#ffffff';
            ctx.beginPath();
            ctx.arc(0, 0, 5, 0, Math.PI * 2);
            ctx.fill();
    }
}

function drawMetalBullet(b) {
    ctx.rotate(b.angle || 0);
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
    ctx.rotate(b.angle || 0);
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
    ctx.rotate(b.angle || 0);
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
    gradient.addColorStop(0, 'rgba(0,0,0,0)');
    gradient.addColorStop(1, 'rgba(0,0,15,0.4)');
    
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
                       (currentBiome === 'ICE' ? 'rgba(200, 240, 255, 0.2)' : 'rgba(0, 242, 255, 0.2)');
        
        for (let i = 0; i < 120; i++) {
            atmosphereParticles.push({
                x: Math.random() * worldSize,
                y: Math.random() * worldSize,
                size: 0.5 + Math.random() * 2.5,
                vx: (Math.random() - 0.5) * 0.5 + (currentBiome === 'WASTELAND' ? 0.8 * windIntensity : 0),
                vy: (Math.random() - 0.5) * 0.5 + (currentBiome === 'WASTELAND' ? 0.2 * windIntensity : 0),
                color: Math.random() > 0.7 ? pColor : 'rgba(255, 255, 255, 0.08)'
            });
        }
    }

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
    }
}

function drawAtmosphere() {
    ctx.save();
    atmosphereParticles.forEach(p => {
        if (p.x > camera.x - 50 && p.x < camera.x + canvas.width + 50 &&
            p.y > camera.y - 50 && p.y < camera.y + canvas.height + 50) {
            ctx.fillStyle = p.color;
            ctx.beginPath();
            ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
            ctx.fill();
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

hostBtn.onclick = () => {
    console.log('Host button clicked');
    playMusic();
    const name = usernameInput.value.trim();
    if (!name) {
        alert('PLEASE ENTER A CALLSIGN!');
        return;
    }
    localStorage.setItem('tanks_username', name);
    const chassis = document.getElementById('chassis-select').value;
    console.log('Emitting host-game:', { name, chassis });
    socket.emit('host-game', { username: name, chassisType: chassis });
};

joinBtn.onclick = () => {
    playMusic();
    const name = usernameInput.value.trim();
    if (!name) {
        alert('PLEASE ENTER A CALLSIGN!');
        return;
    }
    localStorage.setItem('tanks_username', name);
    const chassis = document.getElementById('chassis-select').value;
    socket.emit('join-game', { username: name, chassisType: chassis });
};

startGameBtn.onclick = () => {
    const mapType = document.getElementById('map-select').value;
    socket.emit('start-game', { mapType });
};

if (addBotBtn) {
    addBotBtn.onclick = () => {
        const difficulty = document.getElementById('bot-difficulty').value;
        const chassis = document.getElementById('bot-chassis-select').value;
        socket.emit('add-bot', { 
            difficulty: difficulty,
            chassisType: chassis
        });
    };
}

if (removeBotBtn) {
    removeBotBtn.onclick = () => {
        socket.emit('remove-bot');
    };
}

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

canvas.addEventListener('mousedown', (e) => {
    if (!gameActive) return;

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
        socket.emit('input', keys);
    }
});

window.addEventListener('mouseup', (e) => {
    if (e.button === 0 && keys.shoot) {
        keys.shoot = false;
        socket.emit('input', keys);
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

// Hidden Dev Command (Globally accessible)
window.activateDevTank = () => {
    if (typeof socket !== 'undefined' && socket.connected) {
        console.log("%c [DEV] Switching to Dev Tank... ", "background: #222; color: #00ff00; font-weight: bold;");
        socket.emit('change-chassis', 'DEV');
    } else {
        console.error("[DEV] Socket not connected. Join a lobby first.");
    }
};

