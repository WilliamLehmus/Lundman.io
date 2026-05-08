export const MATERIALS = {
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
    BUILDING: 'building',
    BARREL_EXPLOSIVE: 'barrel_explosive',
    BARREL_OIL: 'barrel_oil',
    CRATE: 'crate',
    DRONE: 'drone'
};

export const MATERIAL_PROPERTIES = {
    [MATERIALS.WATER]: { w: 100, h: 100, color: 'rgba(0, 100, 255, 0.4)' },
    [MATERIALS.OIL]: { w: 80, h: 80, color: 'rgba(40, 40, 40, 0.8)' },
    [MATERIALS.FIRE]: { w: 40, h: 40, color: 'rgba(255, 100, 0, 0.8)' },
    [MATERIALS.ICE]: { w: 60, h: 60, color: 'rgba(200, 240, 255, 0.6)' },
    [MATERIALS.STEAM]: { w: 120, h: 120, color: 'rgba(255, 255, 255, 0.2)' },
    [MATERIALS.SCRAP]: { w: 20, h: 20, color: '#ffd700' },
    [MATERIALS.BUILDING]: { w: 100, h: 100, color: '#333' },
    [MATERIALS.DIRT]: { w: 40, h: 40, color: '#554433' },
    [MATERIALS.ACID]: { w: 100, h: 100, color: 'rgba(0, 255, 0, 0.4)' },
    [MATERIALS.GAS]: { w: 150, h: 150, color: 'rgba(100, 200, 50, 0.4)' },
    [MATERIALS.ELECTRIC]: { w: 120, h: 120, color: 'rgba(0, 242, 255, 0.3)' },
    [MATERIALS.BARREL_EXPLOSIVE]: { w: 35, h: 45, color: '#ff4444', hp: 20 },
    [MATERIALS.BARREL_OIL]: { w: 35, h: 45, color: '#ffcc00', hp: 20 },
    [MATERIALS.CRATE]: { w: 45, h: 45, color: '#8b4513', hp: 30 },
    [MATERIALS.DRONE]: { w: 40, h: 40, color: '#00f2ff', hp: 150 }
};

export const BIOMES = {
    TUNDRA: { color: 'rgba(10, 25, 40, 0.4)', friction: 0.015, speedMult: 1.1 },
    SWAMP: { color: '#2d3e2d33', friction: 0.3, speedMult: 0.6 },
    DESERT: { color: '#edc9af33', friction: 0.1, speedMult: 0.9 },
    URBAN: { color: 'rgba(0,0,0,0)', friction: 0.1, speedMult: 1.0 },
    WASTELAND: { color: 'rgba(139, 69, 19, 0.1)', friction: 0.12, speedMult: 1.0 },
    INDUSTRIAL: { color: 'rgba(50, 50, 50, 0.2)', friction: 0.08, speedMult: 1.1 },
    WETLAND: { color: 'rgba(0, 100, 50, 0.2)', friction: 0.25, speedMult: 0.7 }
};

export const CHASSIS = {
    SCOUT: {
        name: 'Scout',
        hp: 80,
        speed: 0.008, 
        turnSpeed: 0.065,
        mass: 3,
        slots: 2,
        allowedWeapons: ['STANDARD', 'FLAMETHROWER', 'WATER_CANNON', 'FROST_GUN'],
        weapons: ['STANDARD', 'FLAMETHROWER'] // Default loadout
    },
    BRAWLER: {
        name: 'Brawler',
        hp: 200,
        speed: 0.006, 
        turnSpeed: 0.04,
        mass: 10,
        slots: 1,
        allowedWeapons: ['HEAVY_GUN', 'STANDARD', 'DIRT_GUN'],
        weapons: ['HEAVY_GUN']
    },
    ARTILLERY: {
        name: 'Artillery',
        hp: 60,
        speed: 0.0045, 
        turnSpeed: 0.04,
        mass: 15,
        slots: 4,
        allowedWeapons: ['STANDARD', 'TESLA', 'WATER_CANNON', 'FROST_GUN', 'DIRT_GUN'],
        weapons: ['STANDARD', 'TESLA', 'WATER_CANNON', 'FROST_GUN']
    }
};

export const WEAPON_MODULES = {
    HEAVY_GUN: {
        name: 'Heavy Gun',
        type: MATERIALS.METAL,
        reload: 1200,
        damage: 45,
        speed: 10,
        radius: 12,
        impact: 0.05,
        recoil: 0.03,
        ttl: 2000
    },
    STANDARD: {
        name: 'Main Gun',
        type: MATERIALS.METAL,
        reload: 500,
        damage: 15,
        speed: 14,
        radius: 5,
        impact: 0.01,
        recoil: 0.006,
        ttl: 1500
    },
    FLAMETHROWER: {
        name: 'Flamethrower',
        type: MATERIALS.FIRE,
        reload: 100,
        damage: 2,
        speed: 8,
        radius: 12,
        impact: 0.001,
        recoil: 0.001,
        duration: 3000,
        ttl: 550
    },
    WATER_CANNON: {
        name: 'Water Cannon',
        type: MATERIALS.WATER,
        reload: 300,
        damage: 1,
        speed: 10,
        radius: 15,
        impact: 0.02,
        recoil: 0.004,
        ttl: 800
    },
    DIRT_GUN: {
        name: 'Dirt Gun',
        type: MATERIALS.DIRT,
        reload: 1000,
        damage: 0,
        speed: 6,
        radius: 20,
        impact: 0,
        hp: 50,
        ttl: 1000
    },
    TESLA: {
        name: 'Tesla Coil',
        type: MATERIALS.ELECTRIC,
        reload: 800,
        damage: 10,
        speed: 20,
        radius: 5,
        impact: 0,
        stunDuration: 1500,
        ttl: 1000
    },
    FROST_GUN: {
        name: 'Frost Gun',
        type: MATERIALS.ICE,
        reload: 600,
        damage: 5,
        speed: 12,
        radius: 8,
        impact: 0.005,
        recoil: 0.002,
        ttl: 1200
    }
};

export const ALL_WEAPONS = ['HEAVY_GUN', 'STANDARD', 'FLAMETHROWER', 'WATER_CANNON', 'TESLA', 'FROST_GUN', 'DIRT_GUN'];

