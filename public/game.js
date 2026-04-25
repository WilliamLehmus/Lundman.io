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
const p2HpBar = document.getElementById('p2-hp');
const p1CooldownBar = document.getElementById('p1-cooldown');
const p2CooldownBar = document.getElementById('p2-cooldown');

// Game State
let gameState = { players: [], bullets: [] };
let myId = null;
let gameActive = false;
let particles = [];
const keys = { up: false, down: false, left: false, right: false, shoot: false };

// Constants
const TANK_SIZE = 45;

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

    // Weapon switching
    if (isPressed) {
        if (code === 'Digit1') socket.emit('switch-weapon', 1);
        if (code === 'Digit2') socket.emit('switch-weapon', 2);
        if (code === 'Digit3') socket.emit('switch-weapon', 3);
    }
}

// Socket Events
socket.on('connect', () => {
    myId = socket.id;
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
    lobbyStatus.innerText = `PLAYERS: ${count}/10 ${count < 2 ? '(MIN 2 TO START)' : ''}`;
    
    if (count >= 2) {
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
        p1HpBar.style.width = `${me.hp}%`;
        // Weapon icons update
        const icons = document.querySelectorAll(`.weapon-icon[data-player="1"]`);
        icons.forEach(icon => {
            icon.classList.toggle('active', parseInt(icon.dataset.type) === me.weapon);
        });
    }
}

function renderLoop() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    drawGrid();

    if (gameActive) {
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
    }

    particles.forEach((p, i) => {
        p.update();
        p.draw();
        if (p.alpha <= 0) particles.splice(i, 1);
    });

    requestAnimationFrame(renderLoop);
}

function drawTank(p) {
    const color = p.team === 'blue' ? '#00f2ff' : '#ff00ff';
    ctx.save();
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

function drawGrid() {
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.03)';
    ctx.lineWidth = 1;
    const size = 60;
    for (let x = 0; x < canvas.width; x += size) {
        ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, canvas.height); ctx.stroke();
    }
    for (let y = 0; y < canvas.height; y += size) {
        ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(canvas.width, y); ctx.stroke();
    }
}

// Action Handlers
hostBtn.onclick = () => {
    const name = usernameInput.value.trim() || 'RECRUIT';
    socket.emit('host-game', { username: name });
};

joinBtn.onclick = () => {
    const name = usernameInput.value.trim() || 'RECRUIT';
    socket.emit('join-game', { username: name });
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
