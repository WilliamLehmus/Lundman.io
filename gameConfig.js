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

const BIOMES = {
    ICE: { color: '#aaddff33', friction: 0.005, speedMult: 1.2 },
    SWAMP: { color: '#2d3e2d33', friction: 0.3, speedMult: 0.6 },
    DESERT: { color: '#edc9af33', friction: 0.1, speedMult: 0.9 },
    URBAN: { color: 'rgba(0,0,0,0)', friction: 0.1, speedMult: 1.0 }
};

const CHASSIS = {
    SCOUT: {
        name: 'Scout',
        hp: 80,
        speed: 0.007,
        turnSpeed: 0.08,
        mass: 3,
        slots: 2
    },
    BRAWLER: {
        name: 'Brawler',
        hp: 200,
        speed: 0.004,
        turnSpeed: 0.04,
        mass: 10,
        slots: 1
    },
    ARTILLERY: {
        name: 'Artillery',
        hp: 60,
        speed: 0.003,
        turnSpeed: 0.03,
        mass: 15,
        slots: 4
    }
};

const WEAPON_MODULES = {
    STANDARD: {
        name: 'Main Gun',
        type: MATERIALS.METAL,
        reload: 500,
        damage: 15,
        speed: 14,
        radius: 5,
        impact: 0.01,
        recoil: 0.006
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
        duration: 3000 
    },
    WATER_CANNON: {
        name: 'Water Cannon',
        type: MATERIALS.WATER,
        reload: 300,
        damage: 1,
        speed: 10,
        radius: 15,
        impact: 0.02,
        recoil: 0.004
    },
    DIRT_GUN: {
        name: 'Dirt Gun',
        type: MATERIALS.DIRT,
        reload: 1000,
        damage: 0,
        speed: 6,
        radius: 20,
        impact: 0,
        hp: 50
    },
    TESLA: {
        name: 'Tesla Coil',
        type: MATERIALS.ELECTRIC,
        reload: 800,
        damage: 10,
        speed: 20,
        radius: 5,
        impact: 0,
        stunDuration: 1500
    },
    FROST_GUN: {
        name: 'Frost Gun',
        type: MATERIALS.ICE,
        reload: 600,
        damage: 5,
        speed: 12,
        radius: 8,
        impact: 0.005,
        recoil: 0.002
    }
};

module.exports = {
    MATERIALS,
    BIOMES,
    CHASSIS,
    WEAPON_MODULES
};
