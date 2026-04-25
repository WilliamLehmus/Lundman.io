const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');

const startScreen = document.getElementById('start-screen');
const hud = document.getElementById('game-hud');
const gameOverScreen = document.getElementById('game-over');
const winnerText = document.getElementById('winner-text');
const startBtn = document.getElementById('start-btn');
const restartBtn = document.getElementById('restart-btn');

const p1HpBar = document.getElementById('p1-hp');
const p2HpBar = document.getElementById('p2-hp');
const p1CooldownBar = document.getElementById('p1-cooldown');
const p2CooldownBar = document.getElementById('p2-cooldown');

const splashScreen = document.getElementById('splash-screen');
const enterBtn = document.getElementById('enter-btn');
const loadingProgress = document.getElementById('loading-progress');

// Game State
let gameActive = false;
let particles = [];
let bullets = [];

// Configuration
const TANK_SIZE = 40;
const BULLET_SPEED = 7;
const ROTATION_SPEED = 0.05;
const MOVE_SPEED = 3;

const WEAPONS = {
    1: { name: 'Standard', reload: 400, damage: 10, speed: 8, radius: 4, color: 'match' },
    2: { name: 'Blast', reload: 2000, damage: 30, speed: 5, radius: 10, color: '#ffeb3b', isAdvanced: true },
    3: { name: 'Burst', reload: 1500, damage: 5, speed: 10, radius: 3, color: '#4caf50', isAdvanced: true, burst: 3 }
};

class Tank {
    constructor(x, y, color, controls, id) {
        this.x = x;
        this.y = y;
        this.color = color;
        this.controls = controls;
        this.id = id;
        this.angle = id === 1 ? 0 : Math.PI;
        this.hp = 100;
        this.lastShot = 0;
        this.width = TANK_SIZE;
        this.height = TANK_SIZE;
        this.currentWeapon = 1;
        this.cooldown = 0; // 0 to 1
    }

    draw() {
        ctx.save();
        ctx.translate(this.x, this.y);
        ctx.rotate(this.angle);

        // Body glow
        ctx.shadowBlur = 15;
        ctx.shadowColor = this.color;

        // Tank Body
        ctx.fillStyle = '#1a1a2e';
        ctx.strokeStyle = this.color;
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.roundRect(-this.width/2, -this.height/2, this.width, this.height, 5);
        ctx.fill();
        ctx.stroke();

        // Turret
        ctx.beginPath();
        ctx.arc(0, 0, 10, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();

        // Barrel
        const weapon = WEAPONS[this.currentWeapon];
        const barrelLen = weapon.radius > 5 ? 32 : 25;
        const barrelWidth = weapon.radius > 5 ? 12 : 8;
        ctx.beginPath();
        ctx.roundRect(0, -barrelWidth/2, barrelLen, barrelWidth, 2);
        ctx.fill();
        ctx.stroke();

        ctx.restore();
    }

    update(keys, otherTank) {
        const prevX = this.x;
        const prevY = this.y;

        // Weapon switching
        if (this.id === 1) {
            if (keys['Digit1']) this.setWeapon(1);
            if (keys['Digit2']) this.setWeapon(2);
            if (keys['Digit3']) this.setWeapon(3);
        } else {
            if (keys['Digit7']) this.setWeapon(1);
            if (keys['Digit8']) this.setWeapon(2);
            if (keys['Digit9']) this.setWeapon(3);
        }

        // Rotation
        if (keys[this.controls.left]) this.angle -= ROTATION_SPEED;
        if (keys[this.controls.right]) this.angle += ROTATION_SPEED;

        // Movement
        let moved = false;
        if (keys[this.controls.up]) {
            this.x += Math.cos(this.angle) * MOVE_SPEED;
            this.y += Math.sin(this.angle) * MOVE_SPEED;
            moved = true;
        }
        if (keys[this.controls.down]) {
            this.x -= Math.cos(this.angle) * MOVE_SPEED;
            this.y -= Math.sin(this.angle) * MOVE_SPEED;
            moved = true;
        }

        // Tank-to-Tank Collision
        const dx = this.x - otherTank.x;
        const dy = this.y - otherTank.y;
        const dist = Math.sqrt(dx*dx + dy*dy);
        if (dist < TANK_SIZE) {
            // Simple push-back logic
            const angle = Math.atan2(dy, dx);
            this.x = otherTank.x + Math.cos(angle) * TANK_SIZE;
            this.y = otherTank.y + Math.sin(angle) * TANK_SIZE;
        }

        // Screen bounds
        this.x = Math.max(TANK_SIZE/2, Math.min(canvas.width - TANK_SIZE/2, this.x));
        this.y = Math.max(TANK_SIZE/2, Math.min(canvas.height - TANK_SIZE/2, this.y));

        // Update cooldown UI
        const weapon = WEAPONS[this.currentWeapon];
        const timeSinceShot = Date.now() - this.lastShot;
        this.cooldown = Math.min(1, timeSinceShot / weapon.reload);
        
        const cdBar = this.id === 1 ? p1CooldownBar : p2CooldownBar;
        cdBar.style.width = `${(1 - this.cooldown) * 100}%`;
        cdBar.style.background = this.cooldown === 1 ? 'rgba(255,255,255,0.2)' : this.color;

        // Shoot
        if (keys[this.controls.shoot]) {
            this.shoot();
        }
    }

    setWeapon(type) {
        if (this.currentWeapon === type) return;
        this.currentWeapon = type;
        
        // Update UI icons
        const icons = document.querySelectorAll(`.weapon-icon[data-player="${this.id}"]`);
        icons.forEach(icon => {
            icon.classList.toggle('active', parseInt(icon.dataset.type) === type);
        });
    }

    shoot() {
        const weapon = WEAPONS[this.currentWeapon];
        const now = Date.now();
        if (now - this.lastShot > weapon.reload) {
            if (weapon.burst) {
                for (let i = 0; i < weapon.burst; i++) {
                    setTimeout(() => {
                        this.fireBullet(weapon);
                    }, i * 100);
                }
            } else {
                this.fireBullet(weapon);
            }
            this.lastShot = now;
        }
    }

    fireBullet(weapon) {
        bullets.push(new Bullet(
            this.x + Math.cos(this.angle) * 30,
            this.y + Math.sin(this.angle) * 30,
            this.angle,
            weapon.color === 'match' ? this.color : weapon.color,
            this.id,
            weapon
        ));
        createExplosion(this.x + Math.cos(this.angle) * 25, this.y + Math.sin(this.angle) * 25, this.color, 5);
    }

    takeDamage(amount) {
        this.hp -= amount;
        createExplosion(this.x, this.y, this.color, 15);
        updateUI();
        if (this.hp <= 0) {
            endGame(this.id === 1 ? 2 : 1);
        }
    }
}

class Bullet {
    constructor(x, y, angle, color, ownerId, config) {
        this.x = x;
        this.y = y;
        this.vx = Math.cos(angle) * config.speed;
        this.vy = Math.sin(angle) * config.speed;
        this.color = color;
        this.ownerId = ownerId;
        this.radius = config.radius;
        this.damage = config.damage;
    }

    draw() {
        ctx.save();
        ctx.shadowBlur = 10;
        ctx.shadowColor = this.color;
        ctx.fillStyle = this.color;
        ctx.beginPath();
        ctx.arc(this.x, this.y, this.radius, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
    }

    update() {
        this.x += this.vx;
        this.y += this.vy;
    }
}

class Particle {
    constructor(x, y, color) {
        this.x = x;
        this.y = y;
        this.color = color;
        this.vx = (Math.random() - 0.5) * 10;
        this.vy = (Math.random() - 0.5) * 10;
        this.alpha = 1;
        this.life = 0.02 + Math.random() * 0.03;
    }

    draw() {
        ctx.save();
        ctx.globalAlpha = this.alpha;
        ctx.fillStyle = this.color;
        ctx.beginPath();
        ctx.arc(this.x, this.y, 2, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
    }

    update() {
        this.x += this.vx;
        this.y += this.vy;
        this.alpha -= this.life;
    }
}

let p1, p2;
const keys = {};

function init() {
    resize();
    
    // Splash screen loading simulation
    let progress = 0;
    const interval = setInterval(() => {
        progress += Math.random() * 15;
        if (progress >= 100) {
            progress = 100;
            clearInterval(interval);
            enterBtn.style.opacity = '1';
            enterBtn.style.pointerEvents = 'auto';
        }
        loadingProgress.style.width = `${progress}%`;
    }, 150);

    p1 = new Tank(100, canvas.height / 2, '#00f2ff', { up: 'KeyW', down: 'KeyS', left: 'KeyA', right: 'KeyD', shoot: 'Space' }, 1);
    p2 = new Tank(canvas.width - 100, canvas.height / 2, '#ff00ff', { up: 'ArrowUp', down: 'ArrowDown', left: 'ArrowLeft', right: 'ArrowRight', shoot: 'Enter' }, 2);
    
    window.addEventListener('keydown', e => keys[e.code] = true);
    window.addEventListener('keyup', e => keys[e.code] = false);
    window.addEventListener('resize', resize);

    requestAnimationFrame(gameLoop);
}

enterBtn.onclick = () => {
    splashScreen.style.opacity = '0';
    splashScreen.style.transform = 'scale(1.1)';
    setTimeout(() => {
        splashScreen.classList.add('hidden');
        startScreen.classList.remove('hidden');
    }, 1000);
};

function resize() {
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
}

function createExplosion(x, y, color, count) {
    for (let i = 0; i < count; i++) {
        particles.push(new Particle(x, y, color));
    }
}

function updateUI() {
    p1HpBar.style.width = `${Math.max(0, p1.hp)}%`;
    p2HpBar.style.width = `${Math.max(0, p2.hp)}%`;
}

function endGame(winnerId) {
    gameActive = false;
    hud.classList.add('hidden');
    gameOverScreen.classList.remove('hidden');
    winnerText.innerText = `PLAYER ${winnerId} WINS!`;
    winnerText.style.color = winnerId === 1 ? '#00f2ff' : '#ff00ff';
}

function gameLoop() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    drawGrid();

    if (gameActive) {
        p1.update(keys, p2);
        p2.update(keys, p1);

        bullets.forEach((bullet, bIndex) => {
            bullet.update();
            bullet.draw();

            if (bullet.x < 0 || bullet.x > canvas.width || bullet.y < 0 || bullet.y > canvas.height) {
                bullets.splice(bIndex, 1);
                return;
            }

            if (bullet.ownerId !== 1) {
                const dx = bullet.x - p1.x;
                const dy = bullet.y - p1.y;
                const dist = Math.sqrt(dx*dx + dy*dy);
                if (dist < TANK_SIZE / 1.5) {
                    p1.takeDamage(bullet.damage);
                    bullets.splice(bIndex, 1);
                }
            }

            if (bullet.ownerId !== 2) {
                const dx = bullet.x - p2.x;
                const dy = bullet.y - p2.y;
                const dist = Math.sqrt(dx*dx + dy*dy);
                if (dist < TANK_SIZE / 1.5) {
                    p2.takeDamage(bullet.damage);
                    bullets.splice(bIndex, 1);
                }
            }
        });

        p1.draw();
        p2.draw();
    }

    particles.forEach((p, i) => {
        p.update();
        p.draw();
        if (p.alpha <= 0) particles.splice(i, 1);
    });

    requestAnimationFrame(gameLoop);
}

function drawGrid() {
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.03)';
    ctx.lineWidth = 1;
    const size = 50;
    for (let x = 0; x < canvas.width; x += size) {
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, canvas.height);
        ctx.stroke();
    }
    for (let y = 0; y < canvas.height; y += size) {
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(canvas.width, y);
        ctx.stroke();
    }
}

startBtn.onclick = () => {
    gameActive = true;
    startScreen.classList.add('hidden');
    hud.classList.remove('hidden');
};

restartBtn.onclick = () => {
    p1.hp = 100;
    p2.hp = 100;
    p1.x = 100;
    p1.y = canvas.height / 2;
    p2.x = canvas.width - 100;
    p2.y = canvas.height / 2;
    p1.setWeapon(1);
    p2.setWeapon(1);
    bullets = [];
    particles = [];
    updateUI();
    gameActive = true;
    gameOverScreen.classList.add('hidden');
    hud.classList.remove('hidden');
};

init();
