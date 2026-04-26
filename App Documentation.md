# Tanks.io | Technical Documentation

## 🚀 Project Overview
Tanks.io is a high-performance, 5v5 online multiplayer tank combat game. It features a premium neon aesthetic, server-authoritative physics, and real-time streaming using Socket.io and Matter.js.

---

## 🏗️ System Architecture

### 1. Server-Authoritative Physics
The core of the game engine lives on the **Node.js server**. 
- **Reasoning**: To prevent client-side cheating and ensure perfect synchronization between all players.
- **Implementation**: The `Matter.js` engine runs on the server at a consistent **60Hz (TICK_RATE)**. Every collision, bullet trajectory, and tank movement is calculated centrally.

### 2. Real-Time Streaming
- **Networking**: Powered by `Socket.io`.
- **State Updates**: The server broadcasts the global game state to all clients at **20Hz (STATE_RATE)**. This includes position, rotation, health, and bullet coordinates.
- **Input Handling**: Clients send minimal input packets (WASD + Shoot) to the server, which are then processed in the next physics tick.

### 3. Monorepo Structure
- **Backend**: `/backend/server.js` (Express + Socket.io + Matter.js)
- **Frontend**: `/frontend/` (Vite 6 + Vanilla JS)
- **Shared**: `/backend/gameConfig.js` contains the source of truth for weapon and chassis data.

### 4. Multiplayer & Synchronization
- **Client-Side Prediction**: Currently, the game does **not** implement client-side prediction for the local player. The local client snaps to the server's authoritative position every state update.
- **Latency Sensitivity**: Due to the lack of prediction, high-latency connections may result in visible jitter or "snapping" for the local player. This is a known architectural state and is not currently prioritized for refactoring.

### 5. Persistence & Data
- **Player Stats**: Basic player statistics (Kills, Deaths, Scrap) are persisted in a local `players.json` file on the server.
- **Authentication**: There is currently no authentication or password system. Usernames are treated as unique identifiers, but any client can claim any username.
- **Session Data**: HUD settings and volume preferences are persisted in the browser's `localStorage`.

---

## 🎮 Gameplay Features

### 1. Physics Engine (Matter.js)
- **Rigid Body Dynamics**: Tanks have mass, friction, and inertia.
- **World Borders**: Dynamic world size scaling (1800px to 4000px) based on player count.
- **Recoil & Impact**: Every shot applies recoil to the shooter and kinetic impact to the target.

### 2. Procedural World Generation (Biomes)
Matches feature unique, randomly generated maps based on four biomes:
- **URBAN**: Dense city grid with buildings and narrow streets.
- **WASTELAND**: Open terrain with oil pools and high scrap yield.
- **INDUSTRIAL**: Concrete surfaces with electric hazards and factory blocks.
- **WETLAND**: Marshland with water pools and reduced movement speed.

### 3. Elemental Interactions (Alchemy)
The environment is reactive:
- **Fire**: Melts ICE, ignites OIL, extinguished by WATER.
- **Water**: Extinguishes FIRE, creates STEAM when hitting FIRE, can be electrified by TESLA.
- **Steam**: Provides temporary stealth (hides tanks within).
- **Ice**: Reduces friction significantly, created by FROST_GUN or freezing WATER.
- **Electric**: Stuns tanks, spreads through WATER pools.
- **Dirt**: Creates physical barriers (insulators against electricity).

### 4. Progression & Stats
- **Scrap Bonus**: Collecting scrap permanently buffs your tank for the duration of the match.
    - +20% Damage per 100 scrap (Max 2x).
    - +10% Fire Rate per 100 scrap (Max 1.5x).
- **Match Stats**: Full breakdown of Kills, Deaths, and Scrap presented at match end.

### 5. HUD & UI Experience
- **Adaptive HUD**: Player 2 stats panel is hidden in online sessions to maximize visibility.
- **Kill Feed**: Real-time event log with localized weapon names.
- **Minimap**: High-contrast overview showing buildings, borders, and scrap (gold markers).
- **Spawn Protection**: 3 seconds of invulnerability after respawn with visual feedback.

### 6. Bot AI System
The game features a server-side AI system that scales with player count:
- **Replacement Logic**: Bots automatically fill empty slots in lobbies to maintain a 5v5 balance. When a human player joins, a bot is removed.
- **Behavior States**:
### 6. Environmental Physics & Alchemy
- **Alchemy Matrix**:
    - **Fire + Water**: Evaporates into `STEAM` (Small puddles only).
    - **Fire + Oil**: Large Oil puddles ignite into massive `FIRE` zones.
    - **Ice + Water**: Freezes into `ICE` for 5 seconds, then melts back to water.
    - **Electric + Water**: Electrifies the puddle for 2 seconds. Reverts to water after stunning one target or timeout.
- **Electric Puddles**:
    - **Small**: Single-use stun (2s), then disappears/reverts.
    - **Large**: Permanent. Stuns (2s), provides a 5s grace period, then re-stuns if still inside.

### 7. Status Effects
- **⚡ STUNNED**: Cannot move or shoot (Electric/Tesla).
- **❄️ SLOWED**: 50% Speed reduction, 40% Turn speed reduction (Ice).
- **🔥 BURNING**: Constant minor HP loss for 0.5s (Fire/Flamethrower).
- **💧 WET**: Lasts 4s. Being hit by Tesla while wet triggers the 2.5s "Electrified" stun.

### 8. AI Bot Behavior
- **Hazard Avoidance**: Bots now intelligently avoid `FIRE` and `ELECTRIC` puddles using their raycasting system.
- **Leading Shots**: Hard bots lead their targets based on velocity and distance.
- **Combat Logic**: Bots prioritize enemies over scrap, and teammates are ignored (no friendly fire).
- **Sync Rate**: Server physics runs at 60Hz, while state is broadcasted at 60Hz for maximum smoothness.
- **Error Handling**: The physics loop is wrapped in safety buffers to prevent server crashes from isolated lobby errors.

### 7. Audio System
- **Implementation**: Managed on the frontend using the Web Audio API (standard `Audio` objects).
- **Spatial Audio**: Sound effects (like gunshots) are attenuated based on the distance between the camera (local player) and the source of the sound.
- **Pitch Shifting**: Different weapon types use the same base samples but with varying `playbackRate` to create unique sound profiles (e.g., deeper boom for Artillery, higher snap for Tesla).

### 8. Navigation & Pathfinding
- **Authority**: All pathfinding calculations occur on the **server**. 
- **Method**: Bots use a combination of local raycasting for immediate obstacle avoidance and a server-side navigation mesh/grid (planned) to navigate the procedurally generated biomes.
- **Dynamic Awareness**: Because the server handles the map generation and bot logic, it can adapt bot paths in real-time as buildings are destroyed or elements (like fire or oil) are spawned.

---

## 🛠️ Technology Stack
- **Backend**: Node.js, Express (ES Modules)
- **Frontend**: Vite 6, Vanilla JavaScript, HTML5 Canvas (Optimized)
- **Physics**: Matter.js (Server-side)
- **Real-time**: Socket.io
- **Deployment**: Railway Monorepo Pattern (`postinstall` builds frontend)

---

## 🚀 Getting Started

### Local Development
```bash
npm install
npm run dev
```
*Runs backend (Nodemon) and frontend (Vite HMR) concurrently.*

### Controls
- **Movement**: `W, A, S, D` or `Arrow Keys`
- **Shoot**: `Space` or `Enter`
- **Weapons**: `1, 2, 3, 4, 5, 6` to switch slots.
- **Persistence**: Username is automatically saved to LocalStorage.
