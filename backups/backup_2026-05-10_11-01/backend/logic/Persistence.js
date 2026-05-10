import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_PATH = path.join(__dirname, '../players.json');

let playerData = {};

export function loadPlayers() {
    try {
        if (fs.existsSync(DATA_PATH)) {
            playerData = JSON.parse(fs.readFileSync(DATA_PATH, 'utf8'));
            return playerData;
        }
    } catch (e) {
        console.error('Error loading players:', e);
    }
    return {};
}

export function savePlayers(data) {
    try {
        fs.writeFileSync(DATA_PATH, JSON.stringify(data, null, 2));
    } catch (e) {
        console.error('Error saving players:', e);
    }
}

export function getPlayerData() {
    return playerData;
}

export function setPlayerData(data) {
    playerData = data;
}
