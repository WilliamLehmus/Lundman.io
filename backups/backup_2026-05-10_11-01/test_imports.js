import { Navigation } from './backend/logic/Navigation.js';
import { BotAI } from './backend/logic/BotAI.js';
import { Lobby } from './backend/logic/LobbyManager.js';

console.log('Testing imports...');
try {
    const mockLobby = { worldSize: 2500, elements: {}, players: {}, engine: { world: {} } };
    const nav = new Navigation(mockLobby);
    const ai = new BotAI(mockLobby);
    console.log('Successfully instantiated AI and Nav.');
} catch (e) {
    console.error('Import/Instantiation test failed:', e);
    process.exit(1);
}
