import Matter from 'matter-js';
import { MATERIALS, MATERIAL_PROPERTIES } from '../gameConfig.js';

const { Bodies, Composite, Vector, Query } = Matter;

export class MapGenerator {
    constructor(lobby) {
        this.lobby = lobby;
    }

    generateMap(forcedType = 'RANDOM') {
        const biomes = ['URBAN', 'WASTELAND', 'INDUSTRIAL', 'WETLAND', 'TUNDRA', 'DESERT'];
        let mapType = forcedType === 'RANDOM' || !biomes.includes(forcedType) 
            ? biomes[Math.floor(Math.random() * biomes.length)] 
            : forcedType;
        
        this.lobby.mapType = mapType;
        this.lobby.zones = [{ x: 0, y: 0, w: this.lobby.worldSize, h: this.lobby.worldSize, type: mapType }];

        const blockSize = 350;
        const streetWidth = 150;
        const padding = 150;
        const sizeMult = this.lobby.worldSize <= 2000 ? 0.65 : 1.0;

        for (let x = padding; x < this.lobby.worldSize - padding; x += blockSize + streetWidth) {
            for (let y = padding; y < this.lobby.worldSize - padding; y += blockSize + streetWidth) {
                const rand = Math.random();
                
                if (mapType === 'URBAN') {
                    if (rand < 0.85) this.generateCityBlock(x, y, blockSize);
                    else if (rand > 0.95) this.lobby.spawnElement({ x: x + blockSize/2, y: y + blockSize/2 }, MATERIALS.WATER, null, null, null, 160 * sizeMult, 160 * sizeMult);
                } 
                else if (mapType === 'WASTELAND') {
                    if (rand < 0.35) this.generateCityBlock(x, y, blockSize);
                    else if (rand < 0.55) this.lobby.spawnElement({ x: x + blockSize/2, y: y + blockSize/2 }, MATERIALS.OIL, 300000, null, null, 150 * sizeMult, 150 * sizeMult);
                    else if (rand < 0.75) this.lobby.spawnElement({ x: x + blockSize/2, y: y + blockSize/2 }, MATERIALS.ACID, null, null, null, 180 * sizeMult, 180 * sizeMult);
                    else if (rand < 0.85) this.lobby.spawnElement({ x: x + blockSize/2, y: y + blockSize/2 }, MATERIALS.DIRT, null, null, null, 200 * sizeMult, 200 * sizeMult);
                }
                else if (mapType === 'DESERT') {
                    if (rand < 0.2) this.generateCityBlock(x, y, blockSize);
                    else if (rand < 0.3) this.lobby.spawnElement({ x: x + blockSize/2, y: y + blockSize/2 }, MATERIALS.OIL, 300000, null, null, 140 * sizeMult, 140 * sizeMult);
                    else if (rand < 0.4) this.lobby.spawnElement({ x: x + blockSize/2, y: y + blockSize/2 }, MATERIALS.WATER, null, null, null, 180 * sizeMult, 180 * sizeMult);
                    else if (rand < 0.6) this.lobby.spawnElement({ x: x + blockSize/2, y: y + blockSize/2 }, MATERIALS.DIRT, null, null, null, 180 * sizeMult, 180 * sizeMult);
                    else if (rand < 0.75) {
                        const pType = Math.random() > 0.4 ? MATERIALS.CACTUS : MATERIALS.PALM;
                        this.lobby.spawnElement({ x: x + blockSize/2, y: y + blockSize/2 }, pType);
                        for(let i=0; i<2; i++) {
                            this.lobby.spawnElement({ 
                                x: x + blockSize/2 + (Math.random()-0.5)*100, 
                                y: y + blockSize/2 + (Math.random()-0.5)*100 
                            }, pType);
                        }
                    }
                }
                else if (mapType === 'INDUSTRIAL') {
                    if (rand < 0.6) this.generateIndustrialComplex(x, y, blockSize);
                }
                else if (mapType === 'WETLAND') {
                    if (rand < 0.3) this.generateCityBlock(x, y, blockSize);
                    else if (rand < 0.8) {
                        const r2 = Math.random();
                        let pType = MATERIALS.WATER;
                        if (r2 > 0.5 && r2 <= 0.8) pType = MATERIALS.ACID;
                        else if (r2 > 0.8) pType = MATERIALS.GAS;
                        this.lobby.spawnElement({ x: x + blockSize/2, y: y + blockSize/2 }, pType, null, null, null, 220 * sizeMult, 220 * sizeMult);
                    }
                    if (Math.random() > 0.7) this.lobby.spawnElement({ x: x + blockSize, y: y + blockSize }, MATERIALS.DIRT, null, null, null, 150, 150);
                }
                else if (mapType === 'TUNDRA') {
                    if (rand < 0.2) this.generateCityBlock(x, y, blockSize);
                    else if (rand < 0.8) this.lobby.spawnElement({ x: x + blockSize/2, y: y + blockSize/2 }, MATERIALS.ICE, null, null, null, 180, 180);
                }
            }
        }

        if (mapType === 'INDUSTRIAL') {
            const puddleCount = Math.floor(this.lobby.worldSize / 600); 
            for (let i = 0; i < puddleCount; i++) {
                let spawned = false;
                for (let attempts = 0; attempts < 15 && !spawned; attempts++) {
                    const pos = { 
                        x: 200 + Math.random() * (this.lobby.worldSize - 400), 
                        y: 200 + Math.random() * (this.lobby.worldSize - 400) 
                    };
                    const r = Math.random();
                    let pType = MATERIALS.ELECTRIC;
                    if (r > 0.5 && r <= 0.7) pType = MATERIALS.ACID;
                    else if (r > 0.7 && r <= 0.85) pType = MATERIALS.WATER;
                    else if (r > 0.85) pType = MATERIALS.OIL;

                    const tooClose = Object.values(this.lobby.elements).some(e => {
                        const dist = Vector.magnitude(Vector.sub(e.body.position, pos));
                        return (e.type === pType && dist < 500) || dist < 350;
                    });

                    if (!tooClose) {
                        const size = 100 + Math.random() * 60; 
                        if (this.lobby.spawnElement(pos, pType, null, null, null, size, size)) {
                            spawned = true;
                        }
                    }
                }
            }
        }
        
        if (mapType === 'WETLAND') {
            const puddleCount = Math.floor(this.lobby.worldSize / 500);
            for (let i = 0; i < puddleCount; i++) {
                let spawned = false;
                for (let attempts = 0; attempts < 15 && !spawned; attempts++) {
                    const pos = { x: 200 + Math.random() * (this.lobby.worldSize - 400), y: 200 + Math.random() * (this.lobby.worldSize - 400) };
                    const r = Math.random();
                    let pType = MATERIALS.WATER;
                    if (r > 0.4 && r <= 0.75) pType = MATERIALS.ACID;
                    else if (r > 0.75) pType = MATERIALS.GAS;

                    const tooClose = Object.values(this.lobby.elements).some(e => Vector.magnitude(Vector.sub(e.body.position, pos)) < 400);
                    if (!tooClose) {
                        const size = 120 + Math.random() * 80;
                        if (this.lobby.spawnElement(pos, pType, null, null, null, size, size)) spawned = true;
                    }
                }
            }
        }

        const cellSize = 350; 
        for (let gx = cellSize; gx < this.lobby.worldSize - cellSize; gx += cellSize) {
            for (let gy = cellSize; gy < this.lobby.worldSize - cellSize; gy += cellSize) {
                const distToCenter = Math.hypot(gx - this.lobby.worldSize/2, gy - this.lobby.worldSize/2);
                if (distToCenter < 500) continue;

                const pos = { 
                    x: gx + (Math.random() - 0.5) * (cellSize * 0.7), 
                    y: gy + (Math.random() - 0.5) * (cellSize * 0.7) 
                };
                
                const rand = Math.random();
                let pType;
                if (rand < 0.35) pType = MATERIALS.BARREL_EXPLOSIVE;
                else if (rand < 0.70) pType = MATERIALS.BARREL_OIL;
                else pType = MATERIALS.CRATE;
                
                const props = MATERIAL_PROPERTIES[pType];
                this.lobby.spawnElement(pos, pType, null, props.hp);
            }
        }
    }

    generateIndustrialComplex(bx, by, size) {
        const clusterCount = 2 + Math.floor(Math.random() * 2);
        for (let i = 0; i < clusterCount; i++) {
            const isMain = i === 0;
            const isSilo = !isMain && Math.random() > 0.5;
            let bw, bh, ox, oy;
            if (isMain) {
                bw = size * (0.85 + Math.random() * 0.15);
                bh = size * (0.65 + Math.random() * 0.2);
                ox = size/2; oy = size/2;
            } else {
                bw = size * (0.3 + Math.random() * 0.3);
                bh = bw;
                const angle = (i / clusterCount) * Math.PI * 2;
                const dist = size * 0.45;
                ox = size/2 + Math.cos(angle) * dist;
                oy = size/2 + Math.sin(angle) * dist;
            }
            this.lobby.spawnBuilding({ x: bx + ox, y: by + oy }, bw, bh, isSilo ? 'circle' : 'rect');
            if (isMain) {
                const propCount = 4 + Math.floor(Math.random() * 4);
                for (let j = 0; j < propCount; j++) {
                    const ang = Math.random() * Math.PI * 2;
                    const r = (bw/2 + 35) + Math.random() * 15;
                    const pos = { x: bx + ox + Math.cos(ang) * r, y: by + oy + Math.sin(ang) * r };
                    const pType = Math.random() > 0.7 ? MATERIALS.BARREL_EXPLOSIVE : (Math.random() > 0.4 ? MATERIALS.BARREL_OIL : MATERIALS.CRATE);
                    this.lobby.spawnElement(pos, pType, null, MATERIAL_PROPERTIES[pType].hp);
                }
            }
        }
    }

    generateCityBlock(bx, by, size) {
        const mapType = this.lobby.mapType;
        const randShape = Math.random();
        
        // 1. Chance for Special Shapes (Circles/Pyramids) in specific biomes
        if (randShape < 0.2 && mapType === 'DESERT') {
            const diam = size * (0.6 + Math.random() * 0.2);
            this.lobby.spawnBuilding({ x: bx + size/2, y: by + size/2 }, diam, diam, 'pyramid');
        }
        else if (randShape < 0.15 && (mapType === 'WASTELAND' || mapType === 'INDUSTRIAL')) {
            const diam = size * (0.5 + Math.random() * 0.3);
            this.lobby.spawnBuilding({ x: bx + size/2, y: by + size/2 }, diam, diam, 'circle');
        } 
        else if (randShape < 0.6) {
            // Standard Rectangle
            const bw = size * (0.6 + Math.random() * 0.3);
            const bh = size * (0.6 + Math.random() * 0.3);
            this.lobby.spawnBuilding({ x: bx + size/2, y: by + size/2 }, bw, bh);
        } else if (randShape < 0.85) {
            // L-Shape Building (2 Overlapping Rects)
            const bw1 = size * (0.6 + Math.random() * 0.2);
            const bh1 = size * (0.3 + Math.random() * 0.2);
            const bw2 = size * (0.3 + Math.random() * 0.2);
            const bh2 = size * (0.6 + Math.random() * 0.2);
            
            this.lobby.spawnBuilding({ x: bx + size/2, y: by + size/2 - bh1/4 }, bw1, bh1);
            this.lobby.spawnBuilding({ x: bx + size/2 - bw1/2 + bw2/2, y: by + size/2 + bh2/4 }, bw2, bh2);
        } else {
            // T-Shape or Plus Shape
            const bw1 = size * (0.7 + Math.random() * 0.2);
            const bh1 = size * (0.3 + Math.random() * 0.15);
            const bw2 = size * (0.3 + Math.random() * 0.15);
            const bh2 = size * (0.7 + Math.random() * 0.2);
            this.lobby.spawnBuilding({ x: bx + size/2, y: by + size/2 }, bw1, bh1);
            this.lobby.spawnBuilding({ x: bx + size/2, y: by + size/2 }, bw2, bh2);
        }
        const propCount = 1 + Math.floor(Math.random() * 2);
        for (let i = 0; i < propCount; i++) {
            const pos = { x: bx + Math.random() * size, y: by + Math.random() * size };
            const rand = Math.random();
            let pType;
            if (rand < 0.35) pType = MATERIALS.BARREL_EXPLOSIVE;
            else if (rand < 0.70) pType = MATERIALS.BARREL_OIL;
            else pType = MATERIALS.CRATE;
            const props = MATERIAL_PROPERTIES[pType];
            this.lobby.spawnElement(pos, pType, null, props.hp);
        }
    }
}
