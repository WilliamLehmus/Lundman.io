import Matter from 'matter-js';
import { MATERIALS, MATERIAL_PROPERTIES, WEAPON_MODULES, CHASSIS, BIOMES } from '../gameConfig.js';

const { Bodies, Body, Composite, Vector, Events, Query, Bounds } = Matter;

export class CombatEngine {
    constructor(lobby, io) {
        this.lobby = lobby;
        this.io = io;
        this.setupCollisions();
    }

    setupCollisions() {
        Events.on(this.lobby.engine, 'collisionActive', (event) => {
            event.pairs.forEach((pair) => {
                this.processElementInteraction(pair.bodyA, pair.bodyB);
            });
        });

        Events.on(this.lobby.engine, 'collisionStart', (event) => {
            event.pairs.forEach((pair) => {
                const bodyA = pair.bodyA;
                const bodyB = pair.bodyB;
                
                if (bodyA.label === 'bullet' || bodyB.label === 'bullet') {
                    const bullet = bodyA.label === 'bullet' ? bodyA : bodyB;
                    const target = bodyA.label === 'bullet' ? bodyB : bodyA;
                    
                    this.io.to(this.lobby.id).emit('collision-effect', {
                        x: bullet.position.x,
                        y: bullet.position.y,
                        type: bullet.customData.type,
                        targetLabel: target.label
                    });

                    this.processBulletCollision(bullet, target);
                }
            });
        });
    }

    processBulletCollision(bullet, target) {
        const bulletData = bullet.customData;

        if (bulletData.type === MATERIALS.ELECTRIC && target.label && target.label.startsWith('tank-')) {
            const dirtBodies = Object.values(this.lobby.elements).filter(e => e.type === MATERIALS.DIRT).map(e => e.body);
            if (dirtBodies.length > 0) {
                const hits = Query.ray(dirtBodies, bullet.position, target.position);
                if (hits.length > 0) {
                    this.lobby.destroyBullet(bullet.id);
                    return;
                }
            }
        }

        if (target.label && target.label.startsWith('tank-')) {
            const targetId = target.label.split('tank-')[1];
            if (targetId !== bulletData.ownerId) {
                const victim = this.lobby.players[targetId];
                const attacker = this.lobby.players[bulletData.ownerId];
                if (victim && (!attacker || victim.team !== attacker.team)) {
                    const now = Date.now();
                    const isInvulnerable = victim.invulnerableUntil && now < victim.invulnerableUntil;
                    
                    if (!isInvulnerable) {
                        victim.hp -= bulletData.damage;
                        if (Math.random() > 0.4) {
                            const offset = { x: (Math.random() - 0.5) * 40, y: (Math.random() - 0.5) * 40 };
                            this.lobby.spawnElement({ 
                                x: victim.body.position.x + offset.x, 
                                y: victim.body.position.y + offset.y 
                            }, MATERIALS.OIL, null, null, null, 25, 25);
                        }
                    }
                    
                    const forceDir = Vector.normalise(bullet.velocity);
                    Body.applyForce(target, target.position, Vector.mult(forceDir, bulletData.impact));
                    
                    if (bulletData.type === MATERIALS.ELECTRIC) {
                        const inWater = Object.values(this.lobby.elements).some(e => e.type === MATERIALS.WATER && Query.point([e.body], victim.body.position).length > 0);
                        const isWet = Date.now() < victim.statusEffects.wet;
                        victim.statusEffects.stun = Date.now() + (inWater || isWet ? 2500 : 1000);
                        victim.hidden = false;
                        victim.statusEffects.revealed = Date.now() + 2000;
                    }
                    if (bulletData.type === MATERIALS.WATER) victim.statusEffects.wet = Date.now() + 4000;
                    if (bulletData.type === MATERIALS.ICE) victim.statusEffects.slow = Date.now() + 2500;
                    if (bulletData.type === MATERIALS.FIRE) victim.statusEffects.burn = Date.now() + 2000;

                    if (victim.hp < victim.maxHp * 0.5) this.lobby.spawnElement(victim.body.position, MATERIALS.OIL, 5000);

                    this.lobby.destroyBullet(bullet.id);
                    if (victim.hp <= 0) this.lobby.respawn(victim, bulletData.ownerId, bulletData.weapon || bulletData.type);
                }
            }
        }
        
        if (target.label && target.label.startsWith('guardian-')) {
            const gId = target.label.split('guardian-')[1];
            const guardian = this.lobby.guardians[gId];
            if (guardian) {
                const damage = bulletData.type === MATERIALS.METAL ? bulletData.damage * 1.5 : bulletData.damage;
                guardian.hp -= damage;
                const forceDir = Vector.normalise(bullet.velocity);
                Body.applyForce(guardian.body, guardian.body.position, Vector.mult(forceDir, bulletData.impact));
                this.lobby.destroyBullet(bullet.id);
                if (guardian.hp <= 0) this.lobby.destroyGuardian(gId, bulletData.ownerId);
            }
        }
        
        if (target.label === 'element') {
            const element = this.lobby.elements[target.elementId];
            if (element) {
                if (bulletData.type === MATERIALS.FIRE && element.type === MATERIALS.ICE) {
                    element.type = MATERIALS.WATER;
                    if (this.lobby.mapType === 'TUNDRA') {
                        element.expiresAt = Date.now() + 30000;
                        element.originalType = MATERIALS.ICE;
                    } else {
                        element.expiresAt = null;
                        element.originalType = null;
                    }
                    this.lobby.destroyBullet(bullet.id);
                    return;
                }
                
                const isFireVSWater = (bulletData.type === MATERIALS.FIRE && element.type === MATERIALS.WATER) || 
                                     (bulletData.type === MATERIALS.WATER && element.type === MATERIALS.FIRE);
                const isFireVSOil = (bulletData.type === MATERIALS.FIRE && element.type === MATERIALS.OIL);
                const isIceVSWater = (bulletData.type === MATERIALS.ICE && element.type === MATERIALS.WATER) ||
                                    (bulletData.type === MATERIALS.WATER && element.type === MATERIALS.ICE);
                const isElectricVSWater = (bulletData.type === MATERIALS.ELECTRIC && element.type === MATERIALS.WATER);
                const isAcidVSWater = (bulletData.type === MATERIALS.ACID && element.type === MATERIALS.WATER) || 
                                     (bulletData.type === MATERIALS.WATER && element.type === MATERIALS.ACID);
                const isFireVSAcid = (bulletData.type === MATERIALS.FIRE && element.type === MATERIALS.ACID);
                const isWaterVSDirt = (bulletData.type === MATERIALS.WATER && element.type === MATERIALS.DIRT);

                if (isWaterVSDirt) {
                    element.type = MATERIALS.QUICKSAND;
                    element.hp = 200;
                    element.originalType = MATERIALS.DIRT;
                    element.expiresAt = Date.now() + 15000;
                    const oldPos = { x: element.body.position.x, y: element.body.position.y };
                    Composite.remove(this.lobby.engine.world, element.body);
                    element.body = Bodies.rectangle(oldPos.x, oldPos.y, element.w, element.h, {
                        label: 'element', isStatic: true, isSensor: true, collisionFilter: { category: 0, mask: 0 }
                    });
                    element.body.elementId = element.id;
                    Composite.add(this.lobby.engine.world, element.body);
                    this.io.to(this.lobby.id).emit('collision-effect', { x: oldPos.x, y: oldPos.y, type: MATERIALS.QUICKSAND, targetLabel: 'alchemy' });
                    this.lobby.destroyBullet(bullet.id);
                    return;
                }

                if (isFireVSOil) {
                    element.type = MATERIALS.FIRE;
                    element.expiresAt = Date.now() + 6000;
                    element.hp = 100;
                    element.ownerId = bulletData.ownerId;
                    this.io.to(this.lobby.id).emit('collision-effect', { x: element.body.position.x, y: element.body.position.y, type: MATERIALS.FIRE, targetLabel: 'alchemy' });
                    this.lobby.destroyBullet(bullet.id);
                    return;
                }

                if (isElectricVSWater) {
                    element.type = MATERIALS.ELECTRIC;
                    element.originalType = MATERIALS.WATER;
                    element.expiresAt = Date.now() + 2000;
                    element.ownerId = bulletData.ownerId;
                    this.io.to(this.lobby.id).emit('collision-effect', { x: element.body.position.x, y: element.body.position.y, type: MATERIALS.ELECTRIC, targetLabel: 'alchemy' });
                    this.lobby.destroyBullet(bullet.id);
                    return;
                }

                if (isFireVSWater) {
                    this.lobby.spawnElement(bullet.position, MATERIALS.STEAM, 15000, null, bulletData.ownerId);
                    this.io.to(this.lobby.id).emit('collision-effect', { x: bullet.position.x, y: bullet.position.y, type: MATERIALS.STEAM, targetLabel: 'alchemy' });
                    if (element.w < 150) this.lobby.destroyElement(element.id);
                    this.lobby.destroyBullet(bullet.id);
                    return;
                }

                if (isIceVSWater) {
                    element.type = MATERIALS.ICE;
                    element.originalType = MATERIALS.WATER;
                    element.expiresAt = Date.now() + 5000;
                    element.ownerId = bulletData.ownerId;
                    this.io.to(this.lobby.id).emit('collision-effect', { x: element.body.position.x, y: element.body.position.y, type: MATERIALS.ICE, targetLabel: 'alchemy' });
                    this.lobby.destroyBullet(bullet.id);
                    return;
                }

                if (isAcidVSWater) {
                    if (element.type === MATERIALS.ACID) this.lobby.destroyElement(element.id);
                    this.lobby.destroyBullet(bullet.id);
                    return;
                }

                if (isFireVSAcid) {
                    const pos = { x: element.body.position.x, y: element.body.position.y };
                    const size = { w: element.w * 1.5, h: element.h * 1.5 };
                    this.lobby.destroyElement(element.id);
                    this.lobby.spawnElement(pos, MATERIALS.GAS, 6000, null, bulletData.ownerId, size.w, size.h);
                    this.io.to(this.lobby.id).emit('collision-effect', { x: pos.x, y: pos.y, type: MATERIALS.GAS, targetLabel: 'alchemy' });
                    this.lobby.destroyBullet(bullet.id);
                    return;
                }

                if (bulletData.type === element.type) return;

                const isBarrel = element.type.startsWith('barrel_');
                const isSolid = isBarrel || [MATERIALS.BUILDING, MATERIALS.CRATE, MATERIALS.DIRT].includes(element.type);
                
                if (isSolid) {
                    // Specialized Weapon-Barrel Interactions
                    if (bulletData.type === MATERIALS.WATER && element.type === MATERIALS.BARREL_EXPLOSIVE) {
                        // Water neutralizes explosive barrels -> turn into steam
                        this.lobby.spawnElement(element.body.position, MATERIALS.STEAM, 8000, 50, bulletData.ownerId, 100, 100);
                        this.lobby.destroyElement(element.id);
                        this.lobby.destroyBullet(bullet.id);
                        return;
                    }

                    if (bulletData.type === MATERIALS.FIRE && element.type === MATERIALS.BARREL_OIL) {
                        // Fire ignites oil barrels -> explode
                        this.barrelExplode(element.body.position, 'fire', bulletData.ownerId, element.id);
                        this.lobby.destroyElement(element.id);
                        this.lobby.destroyBullet(bullet.id);
                        return;
                    }

                    if (element.hp != null) {
                        let damage = bulletData.damage;
                        if (bulletData.type === MATERIALS.METAL && (element.type === MATERIALS.DIRT || element.type === MATERIALS.BUILDING)) damage *= 2.0;
                        element.hp -= damage;
                        
                        if (element.hp <= 0) {
                            if (element.type === MATERIALS.BUILDING) {
                                for (let i = 0; i < 10; i++) this.lobby.spawnElement({ x: element.body.position.x + (Math.random()-0.5)*element.w, y: element.body.position.y + (Math.random()-0.5)*element.h }, MATERIALS.SCRAP, 30000);
                            } else if (element.type === MATERIALS.BARREL_EXPLOSIVE) {
                                this.barrelExplode(element.body.position, 'fire', bulletData.ownerId, element.id);
                            } else if (element.type === MATERIALS.BARREL_OIL) {
                                this.barrelBreak(element.body.position, MATERIALS.OIL, bulletData.ownerId, element.id);
                            } else if (element.type === MATERIALS.BARREL_ACID) {
                                this.barrelBreak(element.body.position, MATERIALS.ACID, bulletData.ownerId, element.id);
                            } else if (element.type === MATERIALS.BARREL_ELECTRIC) {
                                this.barrelBreak(element.body.position, MATERIALS.ELECTRIC, bulletData.ownerId, element.id);
                            } else if (element.type === MATERIALS.BARREL_FROST) {
                                this.barrelBreak(element.body.position, MATERIALS.ICE, bulletData.ownerId, element.id);
                            } else if (element.type === MATERIALS.BARREL_GAS) {
                                this.barrelBreak(element.body.position, MATERIALS.GAS, bulletData.ownerId, element.id);
                            } else if (element.type === MATERIALS.CRATE) {
                                for (let i = 0; i < 3; i++) this.lobby.spawnElement({ x: element.body.position.x + (Math.random()-0.5)*30, y: element.body.position.y + (Math.random()-0.5)*30 }, MATERIALS.SCRAP, 30000);
                            }
                            this.lobby.destroyElement(element.id);
                        }
                    }
                    this.lobby.destroyBullet(bullet.id);
                }
            }
        }
        
        if (target.label === 'wall') this.lobby.destroyBullet(bullet.id);
    }

    processElementInteraction(bodyA, bodyB) {
        if (this.isProcessingInteraction) return;
        this.isProcessingInteraction = true;
        
        try {
            const elementA = bodyA.label === 'element' ? this.lobby.elements[bodyA.elementId] : null;
            const elementB = bodyB.label === 'element' ? this.lobby.elements[bodyB.elementId] : null;

        if (elementA && elementB) {
            if ((elementA.type === MATERIALS.FIRE && elementB.type === MATERIALS.ICE) ||
                (elementB.type === MATERIALS.FIRE && elementA.type === MATERIALS.ICE)) {
                this.lobby.spawnElement(elementA.body.position, MATERIALS.STEAM, 15000);
                this.io.to(this.lobby.id).emit('collision-effect', { x: elementA.body.position.x, y: elementA.body.position.y, type: MATERIALS.STEAM, targetLabel: 'alchemy' });
                this.lobby.destroyElement(elementA.id);
                this.lobby.destroyElement(elementB.id);
                return;
            }

            if ((elementA.type === MATERIALS.FIRE && elementB.type === MATERIALS.OIL) ||
                (elementB.type === MATERIALS.FIRE && elementA.type === MATERIALS.OIL)) {
                const fire = elementA.type === MATERIALS.FIRE ? elementA : elementB;
                const oil = elementA.type === MATERIALS.OIL ? elementA : elementB;
                oil.type = MATERIALS.FIRE;
                oil.expiresAt = Date.now() + 6000;
                oil.hp = 100;
                oil.ownerId = fire.ownerId;
                this.io.to(this.lobby.id).emit('collision-effect', { x: oil.body.position.x, y: oil.body.position.y, type: MATERIALS.FIRE, targetLabel: 'alchemy' });
                return;
            }

            if ((elementA.type === MATERIALS.FIRE && elementB.type === MATERIALS.WATER) ||
                (elementB.type === MATERIALS.FIRE && elementA.type === MATERIALS.WATER)) {
                const fire = elementA.type === MATERIALS.FIRE ? elementA : elementB;
                if (!fire.lastSteamSpawn || Date.now() - fire.lastSteamSpawn > 400) {
                    this.lobby.spawnElement(fire.body.position, MATERIALS.STEAM, 15000);
                    this.io.to(this.lobby.id).emit('collision-effect', { x: fire.body.position.x, y: fire.body.position.y, type: MATERIALS.STEAM, targetLabel: 'alchemy' });
                    fire.lastSteamSpawn = Date.now();
                }
                this.lobby.destroyElement(fire.id);
                return;
            }

            if ((elementA.type === MATERIALS.FIRE && elementB.type === MATERIALS.ACID) ||
                (elementB.type === MATERIALS.FIRE && elementA.type === MATERIALS.ACID)) {
                const fire = elementA.type === MATERIALS.FIRE ? elementA : elementB;
                const pos = { x: (elementA.body.position.x + elementB.body.position.x)/2, y: (elementA.body.position.y + elementB.body.position.y)/2 };
                const w = Math.max(elementA.w, elementB.w);
                const h = Math.max(elementA.h, elementB.h);
                this.lobby.destroyElement(elementA.id);
                this.lobby.destroyElement(elementB.id);
                this.lobby.spawnElement(pos, MATERIALS.GAS, 6000, null, fire.ownerId, w * 1.5, h * 1.5);
                this.io.to(this.lobby.id).emit('collision-effect', { x: pos.x, y: pos.y, type: MATERIALS.GAS, targetLabel: 'alchemy' });
                return;
            }

            if ((elementA.type === MATERIALS.WATER && elementB.type === MATERIALS.DIRT) ||
                (elementB.type === MATERIALS.WATER && elementA.type === MATERIALS.DIRT)) {
                const dirt = elementA.type === MATERIALS.DIRT ? elementA : elementB;
                dirt.type = MATERIALS.QUICKSAND;
                dirt.hp = 200;
                dirt.originalType = MATERIALS.DIRT;
                dirt.expiresAt = Date.now() + 15000;
                const oldPos = { x: dirt.body.position.x, y: dirt.body.position.y };
                Composite.remove(this.lobby.engine.world, dirt.body);
                dirt.body = Bodies.rectangle(oldPos.x, oldPos.y, dirt.w, dirt.h, {
                    label: 'element', isStatic: true, isSensor: true, collisionFilter: { category: 0, mask: 0 }
                });
                dirt.body.elementId = dirt.id;
                Composite.add(this.lobby.engine.world, dirt.body);
                this.io.to(this.lobby.id).emit('collision-effect', { x: oldPos.x, y: oldPos.y, type: MATERIALS.QUICKSAND, targetLabel: 'alchemy' });
                return;
            }
        }

        const tankBody = bodyA.label.startsWith('tank-') ? bodyA : (bodyB.label.startsWith('tank-') ? bodyB : null);
        const element = elementA || elementB;
        if (tankBody && element) {
            const pId = tankBody.label.split('tank-')[1];
            const p = this.lobby.players[pId];
            if (p) {
                const now = Date.now();
                const isInvulnerable = p.invulnerableUntil && now < p.invulnerableUntil;

                if (element.type === MATERIALS.ELECTRIC && !isInvulnerable) {
                    const isLarge = element.w >= 150;
                    const canStun = now > p.statusEffects.stun && now > p.statusEffects.stunImmunity;
                    if (canStun) {
                        const duration = 1200;
                        p.statusEffects.stun = now + duration;
                        if (isLarge) p.statusEffects.stunImmunity = now + duration + 4000;
                        else {
                            if (element.originalType) {
                                element.type = element.originalType;
                                delete element.originalType;
                                delete element.expiresAt;
                            } else this.lobby.destroyElement(element.id);
                            p.statusEffects.stunImmunity = now + duration + 1000;
                        }
                    }
                }
                if (element.type === MATERIALS.QUICKSAND) {
                    p.statusEffects.quicksand = now + 1000;
                    if (now > p.statusEffects.stun && now > (p.statusEffects.trapImmunity || 0)) {
                        p.statusEffects.stun = now + 3000;
                        p.statusEffects.trapImmunity = now + 8000;
                    }
                }
                if ((element.type === MATERIALS.ICE || element.type === MATERIALS.OIL)) p.statusEffects.slip = now + 1000;
                if (element.type === MATERIALS.ICE && now < p.statusEffects.burn) this.lobby.destroyElement(element.id);
                if (element.type === MATERIALS.FIRE && !isInvulnerable) p.hp -= 0.5;
                if (element.type === MATERIALS.ACID && !isInvulnerable) {
                    p.hp -= 1.2;
                    if (now < p.statusEffects.burn) {
                        this.lobby.spawnElement(element.body.position, MATERIALS.GAS, 6000, null, p.id, element.w * 1.5, element.h * 1.5);
                        this.lobby.destroyElement(element.id);
                    }
                }
                if (element.type === MATERIALS.GAS && !isInvulnerable) p.hp -= 0.6;
                if (element.type === MATERIALS.STEAM) {
                    const isRevealed = p.statusEffects.revealed && now < p.statusEffects.revealed;
                    if (!isRevealed) p.hidden = true;
                }
                if (element.type === MATERIALS.SCRAP) {
                    p.scrap = Math.min(p.scrap + 10, 500);
                    this.lobby.destroyElement(element.id);
                }
                if (p.hp <= 0) {
                    const weaponSource = element.type === MATERIALS.FIRE ? 'FLAMETHROWER' : 
                                       (element.type === MATERIALS.ELECTRIC ? 'TESLA' : element.type);
                    this.lobby.respawn(p, element.ownerId, weaponSource);
                }
            }
            }
        } finally {
            this.isProcessingInteraction = false;
        }
    }

    barrelExplode(pos, type, ownerId, ignoreId) {
        const radius = 155; // Adjusted to match user's visual request ( Bild 2 )
        Object.values(this.lobby.players).forEach(p => {
            const dist = Vector.magnitude(Vector.sub(p.body.position, pos));
            if (dist < radius) {
                const damage = (1 - dist/radius) * 70;
                p.hp -= damage;
                if (p.hp <= 0) this.lobby.respawn(p, ownerId, 'EXPLOSION');
            }
        });

        this.io.to(this.lobby.id).emit('explosion', { x: pos.x, y: pos.y, radius });
        this.io.to(this.lobby.id).emit('barrel-break', { x: pos.x, y: pos.y, type: 'explosion' });

        if (type === 'fire') {
            for (let i = 0; i < 5; i++) {
                const size = 60 * (0.8 + Math.random() * 0.7); // Randomized size
                this.lobby.spawnElement({
                    x: pos.x + (Math.random() - 0.5) * 100,
                    y: pos.y + (Math.random() - 0.5) * 100
                }, MATERIALS.FIRE, 8000, 100, ownerId, size, size, ignoreId);
            }
        } else {
            const count = 3 + Math.floor(Math.random() * 4); // 3 to 6 puddles
            for (let i = 0; i < count; i++) {
                const size = 80 * (0.8 + Math.random() * 0.7); // Randomized size
                this.lobby.spawnElement({
                    x: pos.x + (Math.random() - 0.5) * 120,
                    y: pos.y + (Math.random() - 0.5) * 120
                }, MATERIALS.OIL, null, null, null, size, size, ignoreId);
            }
        }
    }

    barrelBreak(pos, type, ownerId, ignoreId) {
        const sizeMult = 0.8 + Math.random() * 0.7; // 80% to 150% as requested
        const baseSize = MATERIAL_PROPERTIES[type]?.w || 80;
        const size = baseSize * sizeMult;

        // Specialized logic for Electric Barrel
        if (type === MATERIALS.ELECTRIC) {
            const radius = 155; // Same as explosion radius
            Object.values(this.lobby.players).forEach(p => {
                const dist = Vector.magnitude(Vector.sub(p.body.position, pos));
                if (dist < radius) {
                    p.hp -= 15; // Direct direct damage
                    p.statusEffects.stun = Date.now() + 1500; // Stun effect
                    if (p.hp <= 0) this.lobby.respawn(p, ownerId, 'ELECTRIC_BARREL');
                }
            });
            this.io.to(this.lobby.id).emit('collision-effect', { x: pos.x, y: pos.y, type: MATERIALS.ELECTRIC, targetLabel: 'explosion' });
        }

        this.io.to(this.lobby.id).emit('barrel-break', { x: pos.x, y: pos.y, type });
        this.lobby.spawnElement(pos, type, type === MATERIALS.GAS ? 8000 : null, null, ownerId, size, size, ignoreId);
    }

    processGuardians(now) {
        Object.values(this.lobby.guardians).forEach(g => {
            if (g.hp <= 0) return;

            let target = null;
            let minDist = 1000; // Ruthless range

            Object.values(this.lobby.players).forEach(p => {
                if (p.hp > 0 && !p.hidden) {
                    const d = Vector.magnitude(Vector.sub(p.body.position, g.body.position));
                    if (d < minDist) {
                        minDist = d;
                        target = p;
                    }
                }
            });

            if (target) {
                const angle = Math.atan2(target.body.position.y - g.body.position.y, target.body.position.x - g.body.position.x);
                g.angle = angle;
                Body.setAngle(g.body, angle);
                
                // Ruthless firing rate (1.2s reload)
                if (now - g.lastShot > 1200) {
                    g.shotCount = (g.shotCount || 0) + 1;
                    // Every 3rd shot is a Tesla pulse, others are 40mm Cannon
                    if (g.shotCount % 3 === 0) {
                        this.lobby.fireGuardianPulse(g, angle);
                    } else {
                        this.fireGuardianCannon(g, angle);
                    }
                    g.lastShot = now;
                }

                const dist = Vector.magnitude(Vector.sub(target.body.position, g.body.position));
                if (dist > 200) {
                    Body.applyForce(g.body, g.body.position, {
                        x: Math.cos(angle) * 0.025, // Ruthless speed
                        y: Math.sin(angle) * 0.025
                    });
                }
            } else {
                g.angle += 0.01;
                Body.setAngle(g.body, g.angle);
            }
        });
    }

    fireGuardianCannon(g, angle) {
        const id = ++this.lobby.lastBulletId;
        const bullet = Bodies.circle(g.body.position.x + Math.cos(angle)*40, g.body.position.y + Math.sin(angle)*40, 6, { 
            label: 'bullet', frictionAir: 0, mass: 0.1 
        });
        bullet.id = id; 
        bullet.customData = { 
            ownerId: `guardian-${g.id}`, 
            damage: 25, 
            impact: 0.04, 
            type: MATERIALS.METAL, 
            weapon: 'DRONE_CANNON', 
            expiresAt: Date.now() + 2000 
        };
        Body.setVelocity(bullet, { x: Math.cos(angle)*15, y: Math.sin(angle)*15 });
        this.lobby.bullets[id] = bullet; 
        Composite.add(this.lobby.engine.world, bullet);
    }

    spawnGuardian() {
        const id = ++this.lobby.lastGuardianId;
        const pos = {
            x: this.lobby.worldSize / 2 + (Math.random() - 0.5) * 400,
            y: this.lobby.worldSize / 2 + (Math.random() - 0.5) * 400
        };
        const body = Bodies.circle(pos.x, pos.y, 25, {
            label: `guardian-${id}`,
            frictionAir: 0.1,
            mass: 5
        });
        this.lobby.guardians[id] = {
            id, body, hp: 400, maxHp: 400, angle: 0, lastShot: 0
        };
        Composite.add(this.lobby.engine.world, body);
        this.lobby.nextGuardianSpawn = Date.now() + 30000;
    }
}
