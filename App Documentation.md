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

---

## 🎮 Gameplay Features

### 1. Physics Engine (Matter.js)
- **Rigid Body Dynamics**: Tanks have mass, friction, and inertia.
- **Recoil System**: Firing any weapon applies an opposite impulse to the tank body.
- **Impact Reaction**: Bullets transfer kinetic energy to tanks upon impact, causing physical knockback.

### 2. Arsenal & Weapons
| Weapon | Damage | Reload | Special |
| :--- | :--- | :--- | :--- |
| **Standard** | 10 | 400ms | Balanced all-rounder |
| **Blast** | 35 | 2000ms | High impact + Heavy recoil |
| **Burst** | 5 | 1500ms | 3-shot rapid volley |

### 3. Matchmaking & Lobbies
- **Lobby Size**: 5v5 (10 players max).
- **Auto-Join**: Smart matchmaking prioritizes filling the lobby with the most active players that hasn't started yet.
- **Team Balance**: Automatically assigns players to Team Alpha (Blue) or Team Omega (Pink).

---

## 🎨 Design & UI
- **Aesthetic**: Modern Dark Mode with Glassmorphism.
- **Splash Screen**: Features a stylized AI-generated backdrop and a glitch-effect logo.
- **HUD**: Real-time health bars and weapon cooldown indicators synced via Socket.io.

---

### 3. Monorepo Structure
- **Backend**: `/backend/server.js` (Express + Socket.io + Matter.js)
- **Frontend**: `/frontend/` (Vite + Vanilla JS)
- **Shared**: `/backend/gameConfig.js` contains the source of truth for weapon and chassis data.

---

## 🎮 Gameplay Features
...
## 🛠️ Technology Stack
- **Backend**: Node.js, Express (ES Modules)
- **Frontend**: Vite 6, Vanilla JavaScript, HTML5 Canvas
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
- **Weapons**: `1, 2, 3` (P1) or `7, 8, 9` (P2)
