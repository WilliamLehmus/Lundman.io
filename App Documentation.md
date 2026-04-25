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

---

## 🎮 Gameplay Features

### 1. Physics Engine (Matter.js)
- **Rigid Body Dynamics**: Tanks have mass, friction, and inertia.
- **World Borders**: Static physical boundaries at 4000x4000 pixels.
- **Recoil & Impact**: Every shot applies recoil to the shooter and kinetic impact to the target.

### 2. Elemental Interactions (Alchemy)
The environment is reactive:
- **Fire**: Melts ICE, ignites OIL, extinguished by WATER.
- **Water**: Extinguishes FIRE, creates STEAM when hitting FIRE, can be electrified by TESLA.
- **Steam**: Provides temporary stealth (hides tanks within).
- **Ice**: Reduces friction significantly, created by FROST_GUN or freezing WATER.
- **Dirt**: Creates physical barriers (insulators against electricity).

### 3. Arsenal & Modules
- **Chassis Types**:
    - **Scout**: High speed, low HP, 2 weapon slots.
    - **Brawler**: Balanced, 1 high-power slot.
    - **Artillery**: Slow, low HP, 4 weapon slots.
- **Weapons**:
    - **Standard**: Kinetic damage and knockback.
    - **Flamethrower**: Spawns FIRE elements, persistent damage.
    - **Tesla Coil**: Stuns targets and electrifies WATER pools.
    - **Frost Gun**: Slows targets and creates ICE patches.
    - **Dirt Gun**: Spawns defensive DIRT barricades.

### 4. Progression & Scrap
- **Scrap Collection**: Destroying buildings or players drops SCRAP elements.
- **Dynamic Buffs**: Scrap automatically increases your **Damage** and **Reload Speed** (buffs displayed in real-time).
- **Popups**: Visual "+10 SCRAP" indicators for immediate feedback.

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
