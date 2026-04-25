const socket = io(window.location.origin, {
    transports: ['websocket', 'polling']
});

socket.on('connect_error', (err) => {
    console.error('Connection Error:', err.message);
});

const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');

// UI Elements
const splashScreen = document.getElementById('splash-screen');
const lobbyScreen = document.getElementById('lobby-screen');
const hud = document.getElementById('game-hud');
const gameOverScreen = document.getElementById('game-over');
const loadingProgress = document.getElementById('loading-progress');

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

// Game State
let gameState = { players: [], bullets: [], elements: [], zones: [] };
let lastScrap = 0;
let popups = []; // { x, y, text, life }
let myId = null;
let gameActive = false;
let particles = [];
let camera = { x: 0, y: 0, zoom: 1 };
const keys = { up: false, down: false, left: false, right: false, shoot: false };

// Constants
const TANK_SIZE = 45;
const MATERIALS = {
    METAL: 'metal',
    FIRE: 'fire',
    WATER: 'water',
    OIL: 'oil',
    ELECTRIC: 'electric',
    ICE: 'ice',
    DIRT: 'dirt',
    ACID: 'acid',
    GAS: 'gas',
    STEAM: 'steam',
    SCRAP: 'scrap',
    BUILDING: 'building'
};

function init() {
    resize();
    
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
    if (code === 'Space' || code === 'Enter') { keys.shoot = isPressed; changed = true; }

    if (changed) {
        socket.emit('input', keys);
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
    gameState = state;
    updateHUD();
});

function updateHUD() {
    const me = gameState.players.find(p => p.id === myId);
    if (me) {
        if (p1HpBar.dataset.val !== me.hp.toString()) {
            p1HpBar.style.width = `${(me.hp / me.maxHp) * 100}%`;
            p1HpBar.dataset.val = me.hp;
        }
        if (p1Scrap && p1Scrap.innerText !== me.scrap.toString()) {
            p1Scrap.innerText = me.scrap;
        }
        
        const selector = document.querySelector(`.p1-stats .weapon-selector`);
        if (selector) {
            // Only rebuild if slot count changed or icons are missing
            if (selector.children.length !== me.slots.length) {
                selector.innerHTML = '';
                me.slots.forEach((slot, index) => {
                    const icon = document.createElement('div');
                    icon.className = `weapon-icon ${index === me.currentSlot ? 'active' : ''}`;
                    icon.dataset.player = "1";
                    icon.dataset.type = index + 1;
                    icon.innerText = index + 1;
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

function renderLoop(now) {
    requestAnimationFrame(renderLoop);

    const elapsed = now - then;
    if (elapsed < fpsInterval) return;
    then = now - (elapsed % fpsInterval);

    ctx.clearRect(0, 0, canvas.width, canvas.height);

    if (gameActive) {
        // Update Camera
        const me = gameState.players.find(p => p.id === myId);
        if (me) {
            camera.x = me.x - canvas.width / 2;
            camera.y = me.y - canvas.height / 2;
            
            // HUD & Popups Logic
            if (me.scrap > lastScrap) {
                popups.push({ x: me.x, y: me.y - 40, text: `+${me.scrap - lastScrap} SCRAP`, life: 1.0 });
            }
            lastScrap = me.scrap;
        }

        ctx.save();
        ctx.translate(-camera.x, -camera.y);

        drawZones();
        drawGrid();

        // Draw World Boundary
        ctx.strokeStyle = 'rgba(0, 242, 255, 0.5)';
        ctx.lineWidth = 5;
        ctx.strokeRect(0, 0, gameState.worldSize, gameState.worldSize);

        // Draw Elements
        if (gameState.elements) {
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
                    for(let i = 0; i < 2; i++) {
                        for(let j = 0; j < 2; j++) {
                            ctx.fillRect(e.x - e.w/3 + i*e.w/3, e.y - e.h/3 + j*e.h/3, 10, 10);
                        }
                    }
                } else {
                    ctx.fillStyle = e.color;
                    ctx.shadowBlur = e.type === 'fire' ? 15 : 5;
                    ctx.shadowColor = e.color;
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

        // Draw Bullets
        gameState.bullets.forEach(b => {
            ctx.save();
            ctx.shadowBlur = 10;
            ctx.shadowColor = b.color;
            ctx.fillStyle = b.color;
            ctx.beginPath();
            ctx.arc(b.x, b.y, 4, 0, Math.PI * 2);
            ctx.fill();
            ctx.restore();
        });

        // Draw Tanks
        gameState.players.forEach(p => {
            drawTank(p);
        });

        // Draw Popups
        popups = popups.filter(p => p.life > 0);
        popups.forEach(p => {
            ctx.save();
            ctx.globalAlpha = p.life;
            ctx.fillStyle = '#ffff00';
            ctx.font = 'bold 24px Outfit';
            ctx.textAlign = 'center';
            ctx.fillText(p.text, p.x, p.y);
            p.y -= 1;
            p.life -= 0.02;
            ctx.restore();
        });

        ctx.restore();
        // Removed updateHUD() here to save FPS. It runs in socket.on('state') instead.
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

    ctx.shadowBlur = 15;
    ctx.shadowColor = color;

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
    const gridSize = 60;
    const worldSize = gameState.worldSize || 4000;
    
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.03)'; // Made more transparent
    ctx.lineWidth = 1;

    // Only draw grid visible to camera
    const startX = Math.max(0, Math.floor(camera.x / gridSize) * gridSize);
    const endX = Math.min(worldSize, Math.ceil((camera.x + canvas.width) / gridSize) * gridSize);
    const startY = Math.max(0, Math.floor(camera.y / gridSize) * gridSize);
    const endY = Math.min(worldSize, Math.ceil((camera.y + canvas.height) / gridSize) * gridSize);

    for (let x = startX; x <= endX; x += gridSize) {
        ctx.beginPath();
        ctx.moveTo(x, startY);
        ctx.lineTo(x, endY);
        ctx.stroke();
    }
    for (let y = startY; y <= endY; y += gridSize) {
        ctx.beginPath();
        ctx.moveTo(startX, y);
        ctx.lineTo(endX, y);
        ctx.stroke();
    }
}

// Action Handlers
usernameInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') {
        joinBtn.click();
    }
});

hostBtn.onclick = () => {
    const name = usernameInput.value.trim();
    if (!name) {
        alert('PLEASE ENTER A CALLSIGN!');
        return;
    }
    const chassis = document.getElementById('chassis-select').value;
    socket.emit('host-game', { username: name, chassisType: chassis });
};

joinBtn.onclick = () => {
    const name = usernameInput.value.trim();
    if (!name) {
        alert('PLEASE ENTER A CALLSIGN!');
        return;
    }
    const chassis = document.getElementById('chassis-select').value;
    socket.emit('join-game', { username: name, chassisType: chassis });
};

startGameBtn.onclick = () => {
    socket.emit('start-game');
};

class Particle {
    constructor(x, y, color) {
        this.x = x; this.y = y; this.color = color;
        this.vx = (Math.random() - 0.5) * 10;
        this.vy = (Math.random() - 0.5) * 10;
        this.alpha = 1;
        this.life = 0.02 + Math.random() * 0.03;
    }
    draw() {
        ctx.save(); ctx.globalAlpha = this.alpha; ctx.fillStyle = this.color;
        ctx.beginPath(); ctx.arc(this.x, this.y, 2, 0, Math.PI * 2); ctx.fill(); ctx.restore();
    }
    update() { this.x += this.vx; this.y += this.vy; this.alpha -= this.life; }
}

init();
