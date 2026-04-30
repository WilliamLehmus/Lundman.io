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

### 4. Persistence & Data
- **Player Stats**: Persistent player statistics (Lifetime Kills, Deaths, Scrap) are stored in `players.json`.
- **Session Data**: HUD settings and volume preferences are persisted in the browser's `localStorage`.

---

## 🎮 Gameplay Features

### 1. Procedural World Generation (Biomes)
Matches feature unique, randomly generated maps:
- **URBAN**: Dense city grid with buildings and narrow streets.
- **WASTELAND**: Post-apocalyptic terrain with radioactive pools, floating ash, and dynamic wind.
- **INDUSTRIAL**: High-tech factory environment with concrete floors, pulsing neon power cables, and procedural steam vents.
- **WETLAND**: Marshland with water pools and reduced movement speed.

### 2. Elemental Interactions (Alchemy)
The environment is reactive:
- **Fire**: Melts ICE, ignites OIL, reacts with ACID to create GAS.
- **Water**: Extinguishes FIRE, creates STEAM, can be electrified by TESLA. Dilutes ACID.
- **Acid**: Corrosive green pools that damage tanks over time. Reacts with FIRE to create GAS.
- **Gas**: Toxic cloud created by chemical reactions. Causes area-denial damage.
- **Electric**: Stuns tanks, spreads through WATER pools. **Reveals** tanks hidden in STEAM.
- **Ice**: Reduces friction significantly, created by FROST_GUN or freezing WATER.
- **Dirt**: Acts as an **insulator**, blocking ELECTRIC arcs.
- **Scrap**: Provides linear automated scaling (+100% damage per 100 Scrap, -50% reload per 200 Scrap).
- **Hazard Damage**: ALL environmental hazards (Fire, Acid, Gas, Electric) damage ALL players within their range, regardless of who created the hazard. Standing in your own fire or acid will cause damage.

### 3. Bot AI System
The game features a server-side AI system:
- **Replacement Logic**: Bots automatically fill empty slots in lobbies to maintain a 5v5 balance.
- **Behavior**: Bots lead their shots, avoid hazards like FIRE and ELECTRIC puddles, and have stuck-recovery logic.
- **Combat Evasion**: Bots can detect incoming projectiles and perform side-stepping maneuvers to dodge.

### 4. AI Guardians (Drones)
- **Deployment**: Defensive drones spawn periodically near the map center.
- **Engagement**: They orbit a fixed point and fire ELECTRIC pulses at any player that enters their range.
- **Visuals**: Features a rotating red scanning laser and a pulsing thruster glow for high readability.
- **Rewards**: Destroying a guardian yields high-density SCRAP drops.

### 5. Match Rules & Scoring
- **Point Conditions**: Points are ONLY awarded for kills on players of the **opposing team**.
- **Neutral Deaths**: Deaths caused by AI Guardians, World Hazards (Acid/Fire), or Self-Damage do NOT grant points to the other team.
- **Kill Feed Labels**:
    - `GUARDIAN`: Indicates death by a defensive drone.
    - `WORLD`: Indicates death by environmental hazards.

---

## 🛠️ Technology Stack
- **Backend**: Node.js, Express (ES Modules)
- **Frontend**: Vite 6, Vanilla JavaScript, HTML5 Canvas
- **Physics**: Matter.js (Server-side)
- **Real-time**: Socket.io

---

## 🚀 Getting Started

### Local Development
```bash
npm install
npm run dev
```

### Controls
- **Movement**: `W, A, S, D` or `Arrow Keys`
- **Shoot**: `Space` or `Enter`
- **Weapons**: `1-6` to switch slots.

---

## 🛠️ Development & Debugging

### 1. Common Pitfalls
> [!IMPORTANT]
> **Syntax Integrity**: When editing `server.js`, ensure the class structure remains intact. A misplaced `}` can crash the server.

### 2. Debugging Tools
- **Manual Map Selection**: Force biomes in the lobby dropdown.
- **Server Logs**: Watch the `npm run dev` output for logic debugging.

### 3. Developer Tools (Hidden)
- **Dev Tank**: High-performance tank with all weapons.
    - **How to activate**: Open browser console (F12) and type `activateDevTank()`.
- **Debug Menu**: Enables bot/terrain spawning if `debugMode` is active.
