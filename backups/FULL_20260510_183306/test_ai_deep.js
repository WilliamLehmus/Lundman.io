import Matter from 'matter-js';
import { BotAI } from './backend/logic/BotAI.js';
const { Vector, Bodies, Engine, Composite } = Matter;

async function testAI() {
    console.log('Starting AI deep dive test...');
    const engine = Engine.create({ gravity: { x: 0, y: 0 } });
    const mockLobby = {
        worldSize: 2500,
        elements: {},
        players: {},
        bullets: {},
        engine: engine,
        navGrid: { 
            findPath: () => [{x: 100, y: 100}],
            markDirty: () => {}
        }
    };
    
    const bot = {
        id: 'bot1',
        isBot: true,
        hp: 100,
        body: Bodies.circle(500, 500, 25),
        slots: ['HEAVY_GUN'],
        currentSlot: 0,
        inputs: {},
        botDifficulty: 'NORMAL'
    };
    mockLobby.players[bot.id] = bot;
    Composite.add(engine.world, bot.body);
    
    const ai = new BotAI(mockLobby);
    
    try {
        console.log('Processing first tick...');
        ai.processBots(Date.now());
        console.log('Tick 1 OK.');
        
        console.log('Adding target...');
        const player = {
            id: 'player1',
            hp: 100,
            body: Bodies.circle(600, 600, 25),
            team: 'blue'
        };
        bot.team = 'red';
        mockLobby.players[player.id] = player;
        Composite.add(engine.world, player.body);
        
        console.log('Processing combat tick...');
        ai.processBots(Date.now());
        console.log('Combat Tick OK.');
        
        console.log('Deep dive test passed!');
    } catch (e) {
        console.error('CRASH DETECTED:', e);
        process.exit(1);
    }
}

testAI();
