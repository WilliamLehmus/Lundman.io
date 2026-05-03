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
- **State Updates**: The server broadcasts the global game state to all clients at **30Hz (STATE_RATE)**. This rate is optimized for bandwidth while maintaining smoothness via client-side interpolation.
- **Payload Optimization**: The game uses a compressed JSON format with shortened keys and reduced float precision to minimize network overhead.
- **Input Handling**: Clients send minimal input packets (WASD + Shoot + Seq) to the server.
- **Client-Side Prediction (CSP)**: The local client predicts tank movement instantly and reconciles with the server's authoritative state using sequence numbers, eliminating perceived input lag.

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
- **WETLAND**: Murky swamp land with lily pads, fireflies, rising gas bubbles, and a thick atmospheric mist. Reduced movement speed.
- **TUNDRA**: Frozen wasteland with snow hares, wind gusts, and slippery ice. Features a cold frost aesthetic.

### 2. Elemental Interactions (Alchemy)
The environment is reactive:
- **Fire**: Melts ICE, ignites OIL, reacts with ACID to create GAS.
- **Water**: Extinguishes FIRE, creates STEAM, can be electrified by TESLA. Dilutes ACID.
- **Acid**: Corrosive green pools that damage tanks over time. Reacts with FIRE to create GAS.
- **Gas**: Toxic cloud created by chemical reactions. Causes area-denial damage.
- **Electric**: Stuns tanks, spreads through WATER pools. **Reveals** tanks hidden in STEAM.
- **Ice**: Reduces friction significantly, created by FROST_GUN or freezing WATER. Found naturally in **TUNDRA** biome.
- **Dirt**: Acts as an **insulator**, blocking ELECTRIC arcs.
- **Scrap**: Provides linear automated scaling (+100% damage per 100 Scrap, -50% reload per 200 Scrap).
- **Scrap Shop (Upgrades)**: Manual upgrades accessible via the `B` key during matches. Players can spend collected Scrap on:
    - **Armor**: Increases Max HP (+20 per level).
    - **Engine**: Increases Movement & Turn Speed (+15% per level).
    - **Caliber**: Increases Damage (+25% per level) and reduces Reload Time (-10% per level).
    - *Note: Upgrades go up to Level 5. Costs: 100, 250, 500, 1000, 2000. Upgrades reset after each match.*
- **Chassis Visuals**: Each tank type has a unique aesthetic:
    - **SCOUT**: Rounded, aerodynamic body with narrow tracks.
    - **BRAWLER**: Blocky, reinforced body with heavy-duty tracks and extra plating lines.
    - **ARTILLERY**: Long, narrow chassis with extended tracks for stability.
    - **DEV**: Standard form with a unique white-neon high-tech glow.
- **Hazard Damage**: Environmental hazards like **Fire**, **Acid**, and **Gas** damage ALL players within their range, regardless of who created the hazard. **Electric** hazards do not deal HP damage but cause a powerful **Stun** effect to all targets. Standing in your own fire or acid will cause damage.

### 6. Lobby & Slot Management
- **Fixed Slots**: The lobby features a fixed layout of **5 slots per team** (10 total).
- **Slot States**:
    - **Empty**: Displayed as a shadowed outline with a "Dashed" border. Provides an "+ ADD BOT" button.
    - **Occupied (Human)**: Shows the player's callsign and selected chassis.
    - **Occupied (Bot)**: Shows the bot's name, its individual **Difficulty Selector** (Easy/Normal/Hard), and a removal button.
- **Bot Management**:
    - Bots can be added to specific teams by clicking the "+ ADD BOT" button in an empty slot.
    - Individual bot difficulty can be adjusted on-the-fly from the lobby.
    - A game can be started with **bots only** (at least 1 player total required, which includes the host).
- **Lobby State**: Managed in-memory on the server for low-latency physics.
- **Server Browser**: Synchronized with MongoDB (`MONGO_URL`). 
    - Lobbies are added to DB on creation.
    - Player counts and match status (active/lobby) are synced in real-time.
    - Lobbies are automatically deleted from DB when all human players leave.
    - DB is cleared on server startup to ensure only "live" lobbies are listed.
- **Quick Match**: Logic that prioritizes joining the most populated non-full lobby before creating a new one.

### 4. AI Guardians (Drones) [DISABLED]
> [!NOTE]
> AI Guardians are currently disabled but the logic remains in the codebase for potential future reactivation.

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
- **Persistence**: MongoDB (via Mongoose) for the active server list.
- **Physics Engine**: Matter.js (v0.20.0).
- **Icons & UI**: Google Fonts (Outfit), Custom CSS.

---

## 🚀 Getting Started

### Local Development
```bash
npm install
npm run dev
```

### Controls
- **Weapons**: `1-6` to switch slots.
- **Scrap Shop**: `B` to toggle the upgrade shop (during match).
- **Options Menu**: `ESC` to toggle volume and exit settings.
- **Navigation**: "QUIT" buttons in the Options Menu and Lobby Screen allow returning to the main menu.

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
- **Security Check**: The server validates all critical actions. (See Security section).

---

## 🔐 Security & Hardening

### 1. Server-Authoritative Physics
The game is inherently protected against most cheats (speed, health, walls) because the server calculates all physics centrally.

### 2. Implemented Security Measures
The following security measures have been successfully implemented:
- **Dev Mode Locking**: Restricted administrative chassis (`DEV` tank) and debug tools to local development only.
- **Input Sanitization**: Validating incoming socket packets to prevent malicious data injection.
- **Identity Protection**: A secure 4-10 character PIN system (hashed with `bcryptjs`) protects player accounts.
- **Rate Limiting**: Integrated `helmet`, `express-rate-limit`, and custom WebSocket rate limiting (100 pkts/sec) to prevent DDoS and brute-force attacks.

---

## 📈 Technical Debt & Future Roadmap

### 1. Current Limitations
- **Network Sync**: Uses advanced linear interpolation for other players and **Client-Side Prediction** for the local player.
- **Rendering Performance**: Using **Canvas 2D API** limits us to simple shapes and a few thousand particles. Transitioning to **WebGL** would enable complex shaders and better frame rates.
- **Monolithic Backend**: `server.js` handles all responsibilities. Future growth will require splitting logic into microservices or modular components (Lobby, Match, Persistence).
- **Static Environments**: Buildings and terrain are currently indestructible and visually static.

### 2. Proposed Expansion Strategy
- **Visuals**: Move to **PixiJS** for WebGL-accelerated 2D rendering. Implement a dynamic lighting system for neon glows.
- **Physics**: Optimize server-side Matter.js or explore **WASM-based physics** (Rapier) for higher player counts.
- **Networking**: Explore **WebRTC** (via Geckos.io) for UDP-like performance, reducing overhead compared to WebSockets.
- **Juice**: Implement Screen Shake, Dynamic Shadows, and layered Parallax backgrounds.

### 3. Commercial Path (Next Steps)
To transition from a learning project to a **marketable product**, the following migrations are recommended:

| Layer | Current (Learning) | Target (Commercial) | Key Benefit |
| :--- | :--- | :--- | :--- |
| **Rendering** | Canvas 2D | **PixiJS (WebGL)** | GPU acceleration, Shaders, 10x more particles. |
| **Network** | WebSockets | **WebRTC (Geckos.io)** | UDP-like performance, lower latency, better for fast-paced action. |
| **Networking Logic** | Client-Side Prediction | **Server-Side Rollback** | Further improves hit registration for high-latency shots. |
| **Architecture** | Monolith | **Modular Microservices** | Scalability and easier maintenance. |
| **Assets** | Procedural Code | **Sprite Sheets / Assets** | High-fidelity visuals, unique character design. |

### 4. Recommended Toolset for Expansion
- **Engine**: [PixiJS](https://pixijs.com/) for high-performance 2D.
- **Audio**: [Howler.js](https://howlerjs.com/) for spatial and ambient audio management.
- **Networking**: [Geckos.io](https://geckos.io/) for real-time multiplayer over UDP.
- **Asset Creation**: [Figma](https://www.figma.com/) (UI/UX), [Aseprite](https://www.aseprite.org/) (Pixel Art).
- **Mapping**: [Tiled Map Editor](https://www.mapeditor.org/) for handcrafted competitive maps.

---

## 📚 Lessons Learned & Best Practices

### 1. Renaming Constants & Keys
> [!WARNING]
> **Full Stack Consistency**: When renaming a core constant (like a Biome name), ensure updates are made across ALL layers:
> 1.  **Shared Config**: `backend/gameConfig.js`
> 2.  **Server Logic**: `backend/server.js` (Validation, Map Gen, Logic)
> 3.  **Frontend Logic**: `frontend/game.js` (Rendering, Atmosphere)
> 4.  **UI Elements**: `frontend/index.html` (Dropdown values, IDs)
> 
### 2. Known Issues & Critical Fixes

#### **Shop Menu (B-key) Non-Responsive**
- **Date**: 2026-05-02
- **Issue**: The Scrap Shop menu failed to open when pressing the `B` key, despite the player being in a match with collected Scrap.
- **Root Cause**: The client-side logic required `gameState.active` to be true. However, the server's `broadcastState()` method was not including the `active` property in the synchronization packets. This caused the client to believe the match was in an invalid state for shopping.
- **Fix**: 
    1.  Updated `backend/server.js` to include `active: this.active` in the global state broadcast.
    2.  Updated `frontend/game.js` to use the more reliable local `gameActive` flag for menu toggling.
    3.  Moved menu toggle listeners (`B` and `ESC`) to the top of the input handler to bypass `gameActive` checks for UI interactions.

### 3. High-Fidelity Liquid Rendering (V2)
- **Date**: 2026-05-03
- **Concept**: Organic, living environmental hazards that balance high-fidelity visuals with 2D Canvas performance.
- **Principles**:
    1.  **Organic Tiling (Metaball Logic)**: Liquids use overlapping circular tiles (Radius = Width * 0.65) to create a seamless, blob-like surface instead of a rigid grid.
    2.  **Pattern Diversity (Rule of 9)**: Pre-rendering 9 unique variations of procedural textures per liquid type to eliminate visual repetition.
    3.  **Layered Visuals**: Combining Depth Gradients (radial), Texture Overlays (waves/sheen), and Independent Dynamic Particles (bubbles/sparkles) for a high-end feel.
    4.  **Material-Specific "Personalities"**:
        - **Water**: Calming waves, neon-cyan highlights, and light glimmer.
        - **Oil**: Viscous black base, iridescent (rainbow) sheen, and thick spherical bubbles with specular highlights.
        - **Acid/Gas**: Pulsing radioactive glow and corrosive bubbling.


#### **Weapon Shooting & HUD Click Blocking**
- **Date**: 2026-05-03
- **Issue**: Players reported being unable to shoot. Two causes were found:
    1.  **HUD Blocking**: The Dota-style dashboard panels were capturing mouse clicks (`pointer-events: auto`), preventing them from reaching the canvas.
    2.  **Input Listeners**: The `mousedown` listener was on the `canvas`, which is layered behind the `ui-layer`.
- **Fix**: 
    1.  Moved shooting listeners (`mousedown`/`mouseup`) to the `window` to bypass UI layering issues.
    2.  Set `.dashboard-panel` to `pointer-events: none` and explicitly enabled it only for interactive buttons.
    3.  Re-added **Space** and **Enter** as shooting keys for better accessibility.
    4.  Added **Cooldown Broadcasting** (`c` property) to the server state to ensure the HUD cooldown bar reflects real-time weapon readiness.

#### **Missing Imports (ReferenceError)**
- **Date**: 2026-05-03
- **Issue**: `Uncaught ReferenceError: WEAPON_MODULES is not defined`.
- **Root Cause**: When adding the custom crosshair, I used the `WEAPON_MODULES` constant but forgot to add it to the `import` statement at the top of `game.js`.
- **Fix**: Added `WEAPON_MODULES` to the curly-brace import list from `../backend/gameConfig.js`.
- **Lesson**: Always verify that all constants used in a new function are properly imported, especially when working with shared config files.
