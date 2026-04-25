// Matter.js Aliases
const { Engine, Render, Runner, Bodies, Body, Composite, Events, Vector } = Matter;

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

// Physics Engine Setup
const engine = Engine.create();
engine.gravity.y = 0; // Top-down game
const runner = Runner.create();

// Game State
let gameActive = false;
let particles = [];
let bulletBodies = new Map(); // body -> data

// Configuration
const TANK_SIZE = 45;
const ROTATION_SPEED = 0.06;
const MOVE_FORCE = 0.005;
const RECOIL_FORCE = 0.02;
const IMPACT_FORCE = 0.01;

const WEAPONS = {
    1: { name: 'Standard', reload: 400, damage: 10, speed: 12, radius: 4, color: 'match', recoil: 0.005, impact: 0.005 },
    2: { name: 'Blast', reload: 2000, damage: 35, speed: 8, radius: 10, color: '#ffeb3b', recoil: 0.03, impact: 0.05 },
    3: { name: 'Burst', reload: 1500, damage: 5, speed: 15, radius: 3, color: '#4caf50', burst: 3, recoil: 0.003, impact: 0.002 }
};

class Tank {
    constructor(x, y, color, controls, id) {
        this.color = color;
        this.controls = controls;
        this.id = id;
        this.hp = 100;
        this.lastShot = 0;
        this.currentWeapon = 1;
        this.cooldown = 0;

        // Create Physics Body
        this.body = Bodies.rectangle(x, y, TANK_SIZE, TANK_SIZE, {
            frictionAir: 0.1,
            friction: 0.5,
            restitution: 0.4,
            label: `tank-${id}`,
            mass: 5
        });
        
        if (id === 2) {
            Body.setAngle(this.body, Math.PI);
        }

        Composite.add(engine.world, this.body);
    }

    draw() {
        const { x, y } = this.body.position;
        const angle = this.body.angle;

        ctx.save();
        ctx.translate(x, y);
        ctx.rotate(angle);

        // Body glow
        ctx.shadowBlur = 15;
        ctx.shadowColor = this.color;

        // Tank Body
        ctx.fillStyle = '#1a1a2e';
        ctx.strokeStyle = this.color;
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
        const weapon = WEAPONS[this.currentWeapon];
        const barrelLen = weapon.radius > 5 ? 35 : 28;
        const barrelWidth = weapon.radius > 5 ? 14 : 10;
        ctx.beginPath();
        ctx.roundRect(0, -barrelWidth/2, barrelLen, barrelWidth, 2);
        ctx.fill();
        ctx.stroke();

        ctx.restore();
    }

    update(keys) {
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
        if (keys[this.controls.left]) {
            Body.setAngularVelocity(this.body, -ROTATION_SPEED);
        } else if (keys[this.controls.right]) {
            Body.setAngularVelocity(this.body, ROTATION_SPEED);
        }

        // Movement
        const angle = this.body.angle;
        const forceVector = { x: Math.cos(angle) * MOVE_FORCE, y: Math.sin(angle) * MOVE_FORCE };

        if (keys[this.controls.up]) {
            Body.applyForce(this.body, this.body.position, forceVector);
        }
        if (keys[this.controls.down]) {
            Body.applyForce(this.body, this.body.position, { x: -forceVector.x, y: -forceVector.y });
        }

        // Cooldown UI
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
                    setTimeout(() => this.fireBullet(weapon), i * 100);
                }
            } else {
                this.fireBullet(weapon);
            }
            this.lastShot = now;
        }
    }

    fireBullet(weapon) {
        const angle = this.body.angle;
        const pos = {
            x: this.body.position.x + Math.cos(angle) * 40,
            y: this.body.position.y + Math.sin(angle) * 40
        };

        const bulletBody = Bodies.circle(pos.x, pos.y, weapon.radius, {
            frictionAir: 0,
            friction: 0,
            restitution: 1,
            label: 'bullet',
            isSensor: false, // Set to false to allow impact force
            mass: 0.1
        });

        Body.setVelocity(bulletBody, {
            x: Math.cos(angle) * weapon.speed,
            y: Math.sin(angle) * weapon.speed
        });

        // Recoil
        Body.applyForce(this.body, this.body.position, {
            x: -Math.cos(angle) * weapon.recoil,
            y: -Math.sin(angle) * weapon.recoil
        });

        bulletBodies.set(bulletBody, {
            color: weapon.color === 'match' ? this.color : weapon.color,
            damage: weapon.damage,
            ownerId: this.id,
            impact: weapon.impact,
            radius: weapon.radius
        });

        Composite.add(engine.world, bulletBody);
        createExplosion(pos.x, pos.y, this.color, 5);
    }

    takeDamage(amount) {
        this.hp -= amount;
        createExplosion(this.body.position.x, this.body.position.y, this.color, 15);
        updateUI();
        if (this.hp <= 0) {
            endGame(this.id === 1 ? 2 : 1);
        }
    }
}

let p1, p2;
const keys = {};

// Collision Events
Events.on(engine, 'collisionStart', (event) => {
    event.pairs.forEach((pair) => {
        const { bodyA, bodyB } = pair;
        
        // Handle Bullet hits
        if (bodyA.label === 'bullet' || bodyB.label === 'bullet') {
            const bullet = bodyA.label === 'bullet' ? bodyA : bodyB;
            const target = bodyA.label === 'bullet' ? bodyB : bodyA;
            const bulletData = bulletBodies.get(bullet);

            if (bulletData && target.label.startsWith('tank-')) {
                const targetId = parseInt(target.label.split('-')[1]);
                if (targetId !== bulletData.ownerId) {
                    const tank = targetId === 1 ? p1 : p2;
                    tank.takeDamage(bulletData.damage);
                    
                    // Impact Reaction: The engine handles physical collision, 
                    // but we can add extra force for "oomph"
                    const forceDir = Vector.normalise(bullet.velocity);
                    Body.applyForce(target, target.position, {
                        x: forceDir.x * bulletData.impact,
                        y: forceDir.y * bulletData.impact
                    });

                    // Remove bullet
                    Composite.remove(engine.world, bullet);
                    bulletBodies.delete(bullet);
                }
            }
        }
    });
});

function init() {
    resize();
    
    // Splash screen loading
    let progress = 0;
    const interval = setInterval(() => {
        progress += Math.random() * 20;
        if (progress >= 100) {
            progress = 100;
            clearInterval(interval);
            enterBtn.style.opacity = '1';
            enterBtn.style.pointerEvents = 'auto';
        }
        loadingProgress.style.width = `${progress}%`;
    }, 100);

    p1 = new Tank(150, canvas.height / 2, '#00f2ff', { up: 'KeyW', down: 'KeyS', left: 'KeyA', right: 'KeyD', shoot: 'Space' }, 1);
    p2 = new Tank(canvas.width - 150, canvas.height / 2, '#ff00ff', { up: 'ArrowUp', down: 'ArrowDown', left: 'ArrowLeft', right: 'ArrowRight', shoot: 'Enter' }, 2);
    
    window.addEventListener('keydown', e => keys[e.code] = true);
    window.addEventListener('keyup', e => keys[e.code] = false);
    window.addEventListener('resize', resize);

    Runner.run(runner, engine);
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
        p1.update(keys);
        p2.update(keys);
    }

    // Draw Tanks
    p1.draw();
    p2.draw();

    // Draw Bullets
    bulletBodies.forEach((data, body) => {
        const { x, y } = body.position;
        ctx.save();
        ctx.shadowBlur = 10;
        ctx.shadowColor = data.color;
        ctx.fillStyle = data.color;
        ctx.beginPath();
        ctx.arc(x, y, data.radius, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();

        // Cleanup off-screen bullets
        if (x < -50 || x > canvas.width + 50 || y < -50 || y > canvas.height + 50) {
            Composite.remove(engine.world, body);
            bulletBodies.delete(body);
        }
    });

    // Draw Particles
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
    const size = 60;
    for (let x = 0; x < canvas.width; x += size) {
        ctx.beginPath();
        ctx.moveTo(x, 0); ctx.lineTo(x, canvas.height); ctx.stroke();
    }
    for (let y = 0; y < canvas.height; y += size) {
        ctx.beginPath();
        ctx.moveTo(0, y); ctx.lineTo(canvas.width, y); ctx.stroke();
    }
}

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

function createExplosion(x, y, color, count) {
    for (let i = 0; i < count; i++) particles.push(new Particle(x, y, color));
}

startBtn.onclick = () => {
    gameActive = true;
    startScreen.classList.add('hidden');
    hud.classList.remove('hidden');
};

restartBtn.onclick = () => {
    p1.hp = 100; p2.hp = 100;
    Body.setPosition(p1.body, { x: 150, y: canvas.height / 2 });
    Body.setPosition(p2.body, { x: canvas.width - 150, y: canvas.height / 2 });
    Body.setAngle(p1.body, 0);
    Body.setAngle(p2.body, Math.PI);
    Body.setVelocity(p1.body, { x: 0, y: 0 });
    Body.setVelocity(p2.body, { x: 0, y: 0 });
    
    bulletBodies.forEach((_, body) => Composite.remove(engine.world, body));
    bulletBodies.clear();
    particles = [];
    updateUI();
    gameActive = true;
    gameOverScreen.classList.add('hidden');
    hud.classList.remove('hidden');
};

init();
