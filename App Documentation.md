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
    - **Combat**: Bots prioritize the closest enemy, leading shots based on target velocity (Difficulty-dependent).
    - **Scavenging**: If no enemies are in range, bots hunt for SCRAP to gain buffs.
    - **Avoidance**: Bots use multi-directional raycasting to avoid walls, buildings, and other tanks.
    - **Stealth Awareness**: Bots cannot target players who are hidden (e.g., inside STEAM clouds).

---

## 🛠️ Technical Details

### Lobby & Match Management
- **Lobby Gate**: The server gates all gameplay logic (movement, shooting, AI) until the host sends the `start-game` signal.
- **Sync Rate**: Server physics runs at 60Hz, while state is broadcasted at 60Hz for maximum smoothness.
- **Error Handling**: The physics loop is wrapped in safety buffers to prevent server crashes from isolated lobby errors.

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
