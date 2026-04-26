import { io } from "socket.io-client";
import versionData from './version.json';
import { MATERIALS, MATERIAL_PROPERTIES } from '../backend/gameConfig.js';

// Connect to the same host the game is served from
const socket = io({
    transports: ['websocket', 'polling']
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
let playerEvents = []; // { text, color, time }


socket.on('kill-feed', (data) => {
    killFeed.push({ ...data, time: Date.now() });
    if (killFeed.length > 8) killFeed.shift();
    
    // VFX for kill
    const victim = gameState.players.find(p => p.username === data.victim);
    if (victim) {
        spawnExplosion(victim.x, victim.y, victim.team === 'blue' ? '#00f2ff' : '#ff00ff');
    }
});
const keys = { up: false, down: false, left: false, right: false, shoot: false };

// Rendering
let renderTime = 0;
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
    requestAnimationFrame(renderLoop);
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

        drawZones();
        drawGrid();

        ctx.strokeStyle = 'rgba(0, 242, 255, 0.5)';
        ctx.lineWidth = 5;
        ctx.strokeRect(0, 0, gameState.worldSize, gameState.worldSize);

        drawElements();
        updateBulletTrails();
        drawBulletTrails();
        drawBullets();

        gameState.players.forEach(p => drawTank(p));
        updateParticles(dt);
        drawParticles();
        drawPopups(dt);

        ctx.restore();

        drawMinimap();
        drawKillFeed();
        drawPlayerEvents();
    } else {
        drawGrid();
    }
}

function drawTank(p) {
    if (p.hidden && p.id !== myId) return;

    const color = p.team === 'blue' ? '#00f2ff' : '#ff00ff';
    ctx.save();
    if (p.hidden && p.id === myId) ctx.globalAlpha = 0.5;
    
    ctx.translate(p.x, p.y);
    ctx.rotate(p.angle);

    // Body
    ctx.fillStyle = '#1a1a2e';
    ctx.strokeStyle = color;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.roundRect(-TANK_SIZE/2, -TANK_SIZE/2, TANK_SIZE, TANK_SIZE, 5);
    ctx.fill();
    ctx.stroke();

    // Turret
    ctx.beginPath();
    ctx.arc(0, 0, 12, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    // Barrel
    ctx.beginPath();
    ctx.roundRect(0, -5, 30, 10, 2);
    ctx.fill();
    ctx.stroke();

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
    if (p.stunned || p.scrap >= 500) {
        ctx.save();
        ctx.translate(p.x, p.y - TANK_SIZE - 25);
        if (p.stunned) {
            ctx.fillStyle = '#ffff00';
            ctx.font = '700 16px Outfit';
            ctx.fillText('⚡ STUNNED', 0, 0);
        } else if (p.scrap >= 500) {
            ctx.fillStyle = '#ffcc00';
            ctx.font = '900 16px Outfit';
            ctx.fillText('⭐ MAX BUFF', 0, 0);
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
    
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.02)'; 
    ctx.lineWidth = 1;

    const startX = Math.max(0, Math.floor(camera.x / gridSize) * gridSize);
    const endX = Math.min(worldSize, Math.ceil((camera.x + canvas.width) / gridSize) * gridSize);
    const startY = Math.max(0, Math.floor(camera.y / gridSize) * gridSize);
    const endY = Math.min(worldSize, Math.ceil((camera.y + canvas.height) / gridSize) * gridSize);

    ctx.beginPath();
    for (let x = startX; x <= endX; x += gridSize) {
        ctx.moveTo(x, startY);
        ctx.lineTo(x, endY);
    }
    for (let y = startY; y <= endY; y += gridSize) {
        ctx.moveTo(startX, y);
        ctx.lineTo(endX, y);
    }
    ctx.stroke();
}

function interpolateState(dt) {
    const P = 1 - Math.pow(0.75, dt); // frame-rate independent lerp (~0.25 at 60fps)

    gameState.bullets   = serverState.bullets;
    gameState.elements  = serverState.elements;
    gameState.zones     = serverState.zones;
    gameState.worldSize = serverState.worldSize;

    gameState.players = serverState.players.map(sp => {
        if (sp.id === myId) return { ...sp }; // local player snaps to server position
        const gp = gameState.players.find(p => p.id === sp.id);
        if (!gp) return { ...sp };
        return {
            ...sp,
            x: lerp(gp.x, sp.x, P),
            y: lerp(gp.y, sp.y, P),
            angle: lerpAngle(gp.angle, sp.angle, P)
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
    gameState.elements.forEach(e => {
        ctx.save();
        const config = MATERIAL_PROPERTIES[e.type] || { color: '#fff' };
        
        if (e.type === MATERIALS.BUILDING) {
            ctx.fillStyle = '#222';
            ctx.strokeStyle = 'rgba(0, 242, 255, 0.4)';
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.roundRect(e.x - e.w/2, e.y - e.h/2, e.w, e.h, 4);
            ctx.fill();
            ctx.stroke();
            ctx.fillStyle = 'rgba(0, 242, 255, 0.1)';
            for (let i = 0; i < 2; i++) for (let j = 0; j < 2; j++) {
                ctx.fillRect(e.x - e.w/3 + i*e.w/3, e.y - e.h/3 + j*e.h/3, 10, 10);
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
        }
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

function spawnParticles(x, y, color, count = 10) {
    for (let i = 0; i < count; i++) {
        particles.push({
            x, y,
            vx: (Math.random() - 0.5) * 8,
            vy: (Math.random() - 0.5) * 8,
            life: 1.0,
            color,
            size: Math.random() * 4 + 2
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
    socket.emit('start-game');
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
    if (!debugMode || !debugSpawnType || !gameActive) return;

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

