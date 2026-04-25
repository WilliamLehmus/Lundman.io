import { io } from "socket.io-client";

// Connect directly to the backend port in development to avoid proxy timeouts
const socket = io('http://localhost:3000', {
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
let myId = null;
let gameActive = false;
let camera = { x: 0, y: 0 };
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

function playShot() {
    const sfx = shotSFX.cloneNode();
    sfx.volume = sfxVolume;
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

const MATERIALS = {
    METAL: 'metal', FIRE: 'fire', WATER: 'water', OIL: 'oil',
    ELECTRIC: 'electric', ICE: 'ice', DIRT: 'dirt', ACID: 'acid',
    GAS: 'gas', STEAM: 'steam', SCRAP: 'scrap', BUILDING: 'building'
};

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
    
    // Set initial slider values
    musicSlider.value = musicVolume;
    sfxSlider.value = sfxVolume;
    
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
        if (isPressed && !keys.shoot) playShot();
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

socket.on('dev-reload', () => {
    console.log('Backend changed, reloading...');
    location.reload();
});

socket.on('lobby-update', ({ id, players }) => {
    splashScreen.classList.add('hidden');
    lobbyScreen.classList.remove('hidden');
    lobbyIdSpan.innerText = id.toUpperCase();
    
    blueTeamList.innerHTML = '';
    pinkTeamList.innerHTML = '';
    
    players.forEach(p => {
        const item = document.createElement('div');
        item.className = `player-item ${p.id === myId ? 'self' : ''}`;
        item.innerText = p.username.toUpperCase();
        
        if (p.team === 'blue') blueTeamList.appendChild(item);
        else pinkTeamList.appendChild(item);
    });

    const count = players.length;
    lobbyStatus.innerText = `PLAYERS: ${count}/10`;
    
    // Allow start with 1 player for testing
    if (count >= 1) {
        startGameBtn.classList.remove('hidden');
    } else {
        startGameBtn.classList.add('hidden');
    }
});

socket.on('game-started', () => {
    lobbyScreen.classList.add('hidden');
    hud.classList.remove('hidden');
    gameActive = true;
});

socket.on('state', (state) => {
    serverState = state;
    const me = state.players.find(p => p.id === myId);
    if (me && me.scrap > lastScrap) {
        const renderMe = gameState.players.find(p => p.id === myId) || me;
        popups.push({ x: renderMe.x, y: renderMe.y - 40, text: `+${me.scrap - lastScrap} SCRAP`, life: 1.0 });
        lastScrap = me.scrap;
    }
    updateHUD();
});

function updateHUD() {
    const me = serverState.players.find(p => p.id === myId);
    if (me) {
        if (p1HpBar.dataset.val !== me.hp.toString()) {
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
}

let fpsInterval = 1000 / 60;
let then = performance.now();
let lastFpsTime = performance.now();
let framesThisSecond = 0;

function renderLoop(now) {
    requestAnimationFrame(renderLoop);
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

        ctx.save();
        ctx.translate(-camera.x, -camera.y);

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
        drawPopups(dt);

        ctx.restore();
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
    ctx.fillText(p.username.toUpperCase(), 0, -TANK_SIZE);
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
}

function drawElements() {
    if (!gameState.elements) return;
    gameState.elements.forEach(e => {
        ctx.save();
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
        } else {
            ctx.fillStyle = e.color;
            ctx.beginPath();
            if (e.type === 'dirt') {
                ctx.roundRect(e.x - e.radius, e.y - e.radius, e.radius * 2, e.radius * 2, 5);
            } else {
                ctx.arc(e.x, e.y, e.radius, 0, Math.PI * 2);
            }
            ctx.fill();
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
    switch (b.type) {
        case 'metal':    drawMetalBullet(b);    break;
        case 'fire':     drawFireBullet(b);     break;
        case 'water':    drawWaterBullet(b);    break;
        case 'dirt':     drawDirtBullet(b);     break;
        case 'electric': drawElectricBullet(b); break;
        case 'ice':      drawIceBullet(b);      break;
        default:
            ctx.fillStyle = b.color;
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
    const flicker = 0.85 + Math.sin(renderTime * 0.008 + b.id * 1.1) * 0.15;
    const r = 9 * flicker;
    ctx.globalAlpha = 0.2;
    ctx.fillStyle = '#ff6600';
    ctx.beginPath();
    ctx.arc(0, 0, r * 2.2, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 0.7;
    ctx.fillStyle = '#ff3300';
    ctx.beginPath();
    ctx.arc(0, 0, r * 1.4, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 1.0;
    ctx.fillStyle = '#ffdd00';
    ctx.beginPath();
    ctx.arc(0, 0, r * 0.55, 0, Math.PI * 2);
    ctx.fill();
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


init();
