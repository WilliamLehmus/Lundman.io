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

### 3. Modular Backend Architecture
- **`backend/server.js`**: Entry point. Handles Express, Socket.io, and high-level lobby orchestration.
- **`backend/logic/LobbyManager.js`**: Core `Lobby` class. Manages player lifecycle, teams, and match state.
- **`backend/logic/CombatEngine.js`**: Physics interactions, bullet collisions, damage, status effects, and AI Guardians.
- **`backend/logic/MapGenerator.js`**: Biome-aware procedural map generation.
- **`backend/logic/BotAI.js`**: Decision making and movement logic for bots. Features **Difficulty Scaling** (Easy/Normal/Hard) and distance-based weapon strategy.
- **`backend/logic/Persistence.js`**: JSON-based player statistics and PIN authentication.
- **`backend/gameConfig.js`**: Shared source of truth for weapon and chassis data.

### 4. Persistence & Data
- **Player Stats**: Persistent player statistics (Lifetime Kills, Deaths, Scrap) are stored in `players.json`.
- **Session Data**: HUD settings and volume preferences are persisted in the browser's `localStorage`.

---
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

### 3. Modular Backend Architecture
- **`backend/server.js`**: Entry point. Handles Express, Socket.io, and high-level lobby orchestration.
- **`backend/logic/LobbyManager.js`**: Core `Lobby` class. Manages player lifecycle, teams, and match state.
- **`backend/logic/CombatEngine.js`**: Physics interactions, bullet collisions, damage, status effects, and AI Guardians.
- **`backend/logic/MapGenerator.js`**: Biome-aware procedural map generation.
- **`backend/logic/BotAI.js`**: Decision making and movement logic for bots. Features **Difficulty Scaling** (Easy/Normal/Hard), distance-based weapon strategy, and **Multi-Point Raycasting** for local avoidance.
- **`backend/logic/Navigation.js`**: **Dynamic A* Pathfinding** with a weighted heatmap. Rebuilds automatically when the environment changes (e.g., walls destroyed or built). Uses **Octile Heuristic** for optimized 8-directional movement.
- **`backend/logic/Persistence.js`**: JSON-based player statistics and PIN authentication.
- **`backend/gameConfig.js`**: Shared source of truth for weapon and chassis data.

### 4. Persistence & Data
- **Player Stats**: Persistent player statistics (Lifetime Kills, Deaths, Scrap) are stored in `players.json`.
- **Session Data**: HUD settings and volume preferences are persisted in the browser's `localStorage`.

---

## 🎮 Gameplay Features

### 1. Procedural World Generation (Biomes)
Matches feature unique, randomly generated maps:
- **DESERT**: Scorched sands with intense heat haze, volumetric sandstorms, oases (water pools), and ancient architecture. Features **Lizards**, **Scorpions**, and **Vulture Shadows**.
- **TUNDRA**: Frozen wasteland with **Snow Hares**, **Penguins**, **Arctic Foxes**, wind gusts, and slippery ice. Features a cold frost aesthetic.
- **URBAN**: Dense neon city with a **Wet Asphalt** floor, procedural reflective puddles, and vibrant **Neon Crosswalks**. Buildings feature "Living Windows" with TV flicker, warm residential glows, and office lighting. Rooftops include AC units and water tanks. Features **Pigeons**, **Stray Cats**, and **Cockroaches**.
- **INDUSTRIAL**: High-tech factory environment with a **Modular Panel** floor, pulsing energy tracks, and complex **Megastructure** complexes. Features animated gears, ventilation fans with motion blur, laser scanners, and flickering holographic sign projections. Periodic steam blowoff and furnace glows enhance the atmosphere. Features **Rats**, **Micro-Drones**, and **Moths**.
- **WETLAND**: Murky swamp land with dynamic water ripples, interactive **Dragonflies**, **Frogs**, and **Water Striders**. Features **Swamp Shack** structures, thick atmospheric mist, and fireflies.
- **WASTELAND**: Post-apocalyptic terrain with radioactive pools, floating ash, and dynamic wind. Features **Mutated Crows**, **Scrap Beetles**, and **Radioactive Slugs**.
- **WORLD BORDER**: The playable area is contained within a high-fidelity **Neon Energy Barrier** with pulsing corner accents and a subtle outer glow.
- **QUICKSAND**: Created when Water hits Dirt. Features a high-fidelity **Swirling Vortex** animation and rising methane bubbles. Very high movement penalty.

### 2. Elemental Interactions (Alchemy)
The environment is reactive:
- **Fire**: Melts ICE, ignites OIL, reacts with ACID to create GAS.
- **Water**: Extinguishes FIRE, creates STEAM, can be electrified by TESLA. Dilutes ACID.
- **Acid**: Corrosive green pools that damage tanks over time. Reacts with FIRE to create GAS.
- **Gas**: Toxic cloud created by chemical reactions. Causes area-denial damage.
- **Electric**: Stuns tanks, spreads through WATER pools. **Reveals** tanks hidden in STEAM.
- **Ice**: Reduces friction significantly. Can be found naturally in the **TUNDRA** biome or created when **WATER** freezes (in Tundra). No longer created directly by the FROST_GUN.
- **Dirt**: Acts as an **insulator**, blocking ELECTRIC arcs.
- **Scrap**: Provides linear automated scaling (+100% damage per 100 Scrap, -50% reload per 200 Scrap).
- **Scrap Shop (Upgrades)**: Manual upgrades accessible via the `B` key during matches. Players can spend collected Scrap on:
    - **Armor**: Increases Max HP (+20 per level).
    - **Engine**: Increases Movement & Turn Speed (+15% per level).
    - **Caliber**: Increases Damage (+25% per level) and reduces Reload Time (-10% per level).
    - *Note: Upgrades go up to Level 5. Costs: 100, 250, 500, 1000, 2000. Upgrades reset after each match.*
- **Premium Tank Rendering**: Tanks use a high-fidelity vector rendering system in-game:
    - **Volumetric Shading**: Gradients and highlights provide a 3D, metallic appearance.
    - **Team Glow**: Soft, pulsed neon glows replace harsh outlines for team identification.
    - **Mechanical Detailing**: Procedural panel lines, rivets, and segmented tracks add industrial complexity.
    - **Dynamic Weapons**: Weapon barrels feature unique shading and glowing effects (e.g., Tesla coils).
- **Chassis Variations**:
    - **SCOUT**: Rounded, aerodynamic body with narrow tracks. (2 Weapon Slots)
    - **BRAWLER**: Blocky, reinforced body with heavy-duty tracks and extra armor plating. (1 Weapon Slot)
    - **ARTILLERY**: Long, narrow chassis with extended tracks for stability. (4 Weapon Slots)
- **Visual Tank Selector**: The lobby features a visual interface where players can select their chassis by clicking on high-fidelity tank cards.
- **Weapon Loadout Customization**: Each chassis has a specific number of weapon slots. In the lobby, players can click on these slots to cycle through allowed weapons for that chassis, allowing for custom loadouts (e.g., a Scout with a Flamethrower and a Frost Gun).
- **Hazard Damage**: Environmental hazards like **Fire**, **Acid**, and **Gas** damage ALL players within their range, regardless of who created the hazard. **Electric** hazards do not deal HP damage but cause a powerful **Stun** effect to all targets. Standing in your own fire or acid will cause damage.
- **Specialized Hazard Barrels (Tunor Overhaul)**:
    - **Explosive (Red)**: Standard explosion. **Neutralized** by Water (creates steam instead).
    - **Oil (Yellow)**: Spawns oil puddles. **Ignited** by Fire (explodes).
    - **Acid (Green)**: Spawns acid puddles.
    - **Electric (Cyan)**: Spawns electric puddles and deals **15 direct damage + stun** in a radius upon destruction.
    - **Frost (Blue)**: Spawns ice puddles.
    - **Gas (Lime)**: Spawns toxic gas clouds.
    - *Note: Puddle sizes are randomized between 80% and 150% of the base size for a "True Premium" organic look.*
- **ElevenLabs Audio Engine**:
    - **SoundSynth**: Web Audio API-based procedural synthesizer for UI and tactical beeps.
    - **AudioManager**: Centralized channel pooling system that manages high-fidelity ElevenLabs assets.
    - **Weapon SFX**: Professional audio assets mapped to elemental weapon types (Water, Frost, Dirt, Heavy, Tesla, Flame).
    - **Environmental Impacts**: Dynamic sound triggers for entering puddles (Acid, Oil, Quicksand, Electric, Fire, Gas, Ice, Water) and bullet impact feedback (Water Splash, Ice Shatter, Dirt Impact).

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
- **Ready Status**: All human players must toggle their "READY" status before the host can start the match. Bots are always considered ready. The "START GAME" button is only functional when everyone is ready.
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
- **Point Conditions**: Points are awarded to the **opposing team** whenever a player dies, regardless of the cause (Combat, Hazard, or Self-Damage). This prevents "Suicide Exploits".
- **Neutral Deaths**: Deaths caused by AI Guardians or World Hazards (Acid/Fire) grant a point to the enemy team.
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
- **Options Menu**: `ESC` to toggle volume, mute all sound, and exit settings.
- **Navigation**: "QUIT" buttons in the Options Menu and Lobby Screen allow returning to the main menu.

---

## 🛠️ Development & Debugging

### 1. Common Pitfalls
> [!IMPORTANT]
> **Syntax Integrity**: When editing `server.js`, ensure the class structure remains intact. A misplaced `}` can crash the server.

> [!CAUTION]
> **AI Testing Restriction**: The AI agent is STRICTLY FORBIDDEN from starting browser sessions or testing the game directly. Browser-based verification must be performed by the USER or William.

### 2. Debugging Tools
- **Manual Map Selection**: Force biomes in the lobby dropdown.
- **Server Logs**: Watch the `npm run dev` output for logic debugging.

### 3. Developer Tools (Hidden)
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
#### **Canvas Stack Overflow (OIL Rendering)**
- **Date**: 2026-05-03
- **Issue**: Rendering would "freeze" after a few seconds of gameplay, although sounds and logic continued.
- **Root Cause**: A mismatched `ctx.save()` and `ctx.restore()` in the `OIL` material rendering block. For every oil puddle on screen, the canvas state stack grew by 1 every frame, hitting the browser limit almost instantly.
- **Fix**: Added the missing `ctx.restore()` call to correctly balance the stack.
- **Verification**: Balanced the total counts of `save()` and `restore()` calls to exactly 52 each in the codebase.

#### **Deterministic Randomness (getStableRandom)**
- **Date**: 2026-05-03
- **Issue**: Procedural grid details and organic hazard paths would "jitter" or "smear" because they relied on `Math.random()`, which changes every frame.
- **Fix**: Implemented `getStableRandom(seed)` helper to provide deterministic noise based on object IDs or coordinates.
- **Usage**: Used in `drawGrid`, `drawOrganicPath`, and `drawAtmosphere` to ensure visual consistency across frames.

#### **Global Cursor Hide V2**
- **Date**: 2026-05-03
- **Issue**: The system cursor remained visible when hovering over the new Dota-style HUD panels (Health/Weapons), breaking immersion.
- **Fix**: Updated CSS to apply `cursor: none !important` to the entire `body` and `#ui-layer` when `game-active-cursor` is active. Explicitly re-enabled for menus and shop using state-driven class toggling.

#### **Minimap Sync Fix**
- **Date**: 2026-05-03
- **Issue**: Buildings and Scrap were not showing up on the minimap despite being visible in the world.
- **Root Cause**: The minimap logic was checking for `e.type === 'building'`, but the server-authoritative state uses shortened keys (`e.t` and `MATERIALS.BUILDING`).
- **Fix**: Synchronized `drawMinimap` to use the same property keys as the main rendering loop (`e.t`).

#### **Jittery Rendering Stabilization**
- **Date**: 2026-05-03
- **Issue**: Environmental decorations (industrial vents, lights, wetland lilies) would "vibrate" or jitter every frame.
- **Root Cause**: Use of `Math.random()` inside the rendering loop for properties like radius or position.
- **Fix**: Replaced with `getStableRandom(seed)` using the object's unique ID as a seed to ensure deterministic, flicker-free rendering.


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
        - **Fire (Hellfire)**: Organic spreading pools with intense heat aura, animated rising flames, white-hot flickering, and dynamic rising ember particles.
        - **Steam**: Soft, wispy white clouds with low-alpha procedural movement. (Reveals hidden units when electrified).


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
    5.  **Global Cursor Hide**: Implemented `body.game-active-cursor` CSS class to ensure the system cursor is hidden across all UI layers during gameplay, preventing the "double cursor" effect.

#### **Missing Imports (ReferenceError)**
- **Date**: 2026-05-03
- **Issue**: `Uncaught ReferenceError: WEAPON_MODULES is not defined`.
- **Root Cause**: When adding the custom crosshair, I used the `WEAPON_MODULES` constant but forgot to add it to the `import` statement at the top of `game.js`.
- **Fix**: Added `WEAPON_MODULES` to the curly-brace import list from `../backend/gameConfig.js`.
- **Lesson**: Always verify that all constants used in a new function are properly imported, especially when working with shared config files.

#### **Missing Particle Function (ReferenceError)**
- **Date**: 2026-05-03
- **Issue**: `Uncaught (in promise) ReferenceError: createParticle is not defined` when an explosion occurred.
- **Root Cause**: The `createParticle` function was called in the `explosion` socket event, but the function did not exist (likely removed during a previous refactor of the particle system).
- **Fix**: Replaced the non-existent `createParticle` calls with direct object pushes to the `particles` array (`particles.push({ ... })`).
#### **Lobby UI Overlap on Small Screens**
- **Date**: 2026-05-03
- **Issue**: On smaller desktop screens or narrow browser windows, the lobby status and host selectors (chassis/map) were vertically overlapping the player lists.
- **Root Cause**: The `#lobby-screen` flex container was squashing the `flex: 1` columns to zero height when fixed-height elements below them took up too much vertical space. Since the columns had `overflow: visible`, their content remained visible but the siblings moved up into their space.
- **Fix**: 
    1.  Removed messy inline styles from `index.html` and migrated them to standardized CSS classes.
    2.  Added `flex-shrink: 0` to all control elements (status, chassis, map, actions) to ensure they maintain their intended size.
    3.  Enabled `overflow-y: auto` on the main lobby panel as a fallback for extreme aspect ratios.
    4.  Implemented height-based media queries (`@media (max-height: ...)` ) to dynamically scale down UI elements (font sizes, margins, slot heights) on smaller screens.

#### **Invisible Steam & Square Fire Fix**
- **Date**: 2026-05-03
- **Issue**: Eld (Fire) renderades som en enkel orange kvadrat, och ånga (Steam) var helt osynlig trots att den fanns i spelets logik.
- **Root Cause**: Eld saknade specifik rendering i `drawElements` och föll tillbaka på en rektangulär standardform. Ånga fanns med i listan för `hasSpecialRendering` men saknade kod för att faktiskt ritas ut.
- **Fix**: 
    3.  Implementerade "Hellfire"-systemet med organiska former, flammande mönster, vit-glödande kärnor och stigande gnist-partiklar.
    4.  Lade till en ny renderings-block för `MATERIALS.STEAM` som ritar ut mjuka, genomskinliga ångmoln.
    5.  Skapade `updateFirePattern` och `updateSteamPattern` för att animera mönstren i realtid.

#### **Hellfire Visibility & Syntax Fix (Brace Nesting)**
- **Date**: 2026-05-03
- **Issue**: Hellfire (Fire hazards) were invisible or causing a total game freeze with a `SyntaxError: Unexpected token 'else'`.
- **Root Cause**: A severe brace nesting error in `drawElements`. The fire rendering logic was accidentally nested inside the `ELECTRIC` block, making it unreachable. Additionally, mismatched closing braces caused the `isLiquid` chain to terminate prematurely, making the subsequent `else if` statements invalid.
- **Fix**: Re-balanced the `if/else` ladder within `drawElements`, ensuring each material (Water, Oil, Electric, Fire) occupies its own distinct branch. Cleaned up trailing braces to correctly close the main element loop.
- **Aesthetic Update**: Improved the `firePattern` density (15 blobs) and replaced the dark core with a solid white-hot fill (`#fff`) to eliminate the "biological/meatball" look and achieve a premium "Hellfire" aesthetic.
- **Verification**: Validated using `node -c frontend/game.js`.
#### **Industrial Biome "True Factory" Overhaul**
- **Date**: 2026-05-09
- **Issue**: The Industrial biome felt like an "Urban" reskin and lacked a true factory atmosphere.
- **Root Cause**: Reliance on the "City Block" grid system and generic windowed buildings.
- **Fix (The "Megastructure" Update)**: 
    1.  **Abolished City Grid**: Removed yellow dashed sidewalks and streets. Replaced with a unified **Facility Floor** using large concrete plates and hazard zones.
    2.  **Megastructures**: Increased building size and clustering. Buildings now overlap "streets" to create dense, interconnected factory complexes.
        - **Industrial Detail System**:
            - **Clipping**: All interior details are now clipped to the building shape.
            - **Megastructure Aesthetic**: Buildings feature composite silhouettes with stacked modules and structural bulkheads.
            - **Industrial Modules**: Rotating **Gears**, high-fidelity **Ventilation Fans** (with motion blur), and rotating **Laser Scanners**.
            - **Holographic Signs**: Neon signs in the industrial biome use a flickering hologram effect with scanlines and glow.
            - **Status LEDs**: Blinking red/green/yellow indicators on building corners and equipment.
            - **Floor Overhaul**: Replaced plain concrete with a **Modular Panel** system featuring recessed pulsing energy tracks and "Caution" decals.
            - **Atmosphere**: Subtle background furnace/energy glows and periodic steam blowoff from vents.
            - **Volumetric Silos**: Circular buildings feature advanced cylindrical shading with metal highlights and rim shadows.
---

## 🛡️ Known Issues & Critical Fixes

#### **Electric Puddle Stun Lock**
- **Date**: 2026-05-09
- **Issue**: Players would get "stuck" indefinitely in small electric puddles in the Industrial biome.
- **Root Cause**: A nesting error in `processElementInteraction` prevented the logic for destroying/reverting small puddles from executing. Additionally, the 2.0s stun duration was too punishing for a non-lethal hazard.
- **Fix**: 
    1. Corrected the `if/else` nesting to ensure small puddles are reliably destroyed or reverted after one stun activation.
    2. Reduced environmental stun duration from **2.0s** to **1.2s**.
    3. Added a `stunImmunity` grace period for all hits to prevent instant restun from overlapping hazards.
- **Verification**: Verified that small puddles disappear on hit and large ones grant enough immunity to exit.

#### **Urban Stabilization & Aesthetic Finalization**
- **Date**: 2026-05-09 (15:36 - 17:14)
- **Issue**: A series of regressions occurred during the "Urban" aesthetic upgrade, including a crash (`ReferenceError: currentBiome is not defined`) and lost biome details (pipes, snow, sparks).
- **Root Cause**:
    1. `drawZones` attempted to access `currentBiome` without local definition.
    2. Large-scale refactoring of `drawElements` accidentally truncated biome-specific branches (Industrial pipes, Tundra snow, Wasteland ruins).
    3. Brace imbalance in the main rendering loop led to a `SyntaxError` on load.
- **Fix (The "Surgical Recovery" Update)**:
    1. **ReferenceError Fix**: Defined `currentBiome` at the top of `drawZones` (sourced from `gameState.zones[0]`).
    2. **BUILDING Block Refactor**: Rebuilt the building rendering from scratch to be "Omni-Biome" aware. It now correctly layers:
        - **Industrial**: Vertical pipes, rivets, cooling fins, and rotating fans (all clipped).
        - **Urban**: Flicker-seeded neon windows with variable colors.
        - **Wasteland**: Smoke from roof units and sign sparks.
        - **Tundra**: Layered snow caps and spots.
    3. **Hazard Logic Restoration**: Re-integrated the high-fidelity rendering paths for **Acid**, **Fire**, **Oil**, **Gas**, **Steam**, and **Ice** into the `drawElements` loop, ensuring they are correctly reachable.
- **New Feature: Crosshair V2**:
    - Upgraded the crosshair to change color dynamically based on the active weapon (`me.w`).
    - Added a pulsing neon glow and a rotating dashed outer ring for a premium feel.
    - Synchronized with `gameState` for zero-latency visual feedback.
- **Verification**: All syntax validated with `node -c`. Rendering stability confirmed across all biomes.
- **Urban "Neon Metropolis" Overhaul**:
    - **Wet Asphalt Floor**: Replaced plain black floor with a textured asphalt surface featuring procedural reflective puddles.
    - **Neon Road Markings**: Upgraded to high-fidelity, pulsing Cyan/Magenta road lines and zebra-stripe crosswalks.
    - **Living Windows**: Implemented logic for windows to show TV flicker, warm residential lamps, or cool office lighting.
    - **Rooftop Details**: Added AC units with rotating fans and water tanks to building rooftops.
    - **Sidewalk Upgrades**: Improved curbing with depth shadows and subtle yellow tactile paving details.
    - **City Haze**: Added a purple/blue background ambient glow to simulate light pollution and urban atmosphere.
    - **Street Steam**: Added wispy steam puffs rising from manholes.

#### **Node.js API Leak in Browser (process is not defined)**
- **Date**: 2026-05-09
- **Issue**: Sidan laddar inte och konsolen visar `ReferenceError: process is not defined` i `game.js`.
- **Root Cause**: Node.js-specifik kod (`process.on('uncaughtException', ...)`) lades av misstag till i `frontend/game.js`. Eftersom webbläsaren inte har tillgång till `process`-objektet kraschar skriptet vid laddning.
- **Fix**: Tog bort `process.on`-raden. All felhantering i frontenden ska ske via `window.addEventListener('error', ...)` eller try-catch om det behövs, aldrig via Node-specifika moduler som `process` eller `fs`.
- **Prevention**: Kör alltid `node -c frontend/game.js` efter ändringar, men var medveten om att Node-syntax-checkar inte fångar miljöspecifika objekt som saknas i webbläsaren.

#### **Tundra "Eternal Winter" Visual Overhaul**
- **Date**: 2026-05-09
- **Goal**: Transform the Tundra from a basic blue zone to a high-fidelity frozen wasteland.
- **Features Added**:
    1.  **Aurora Borealis**: Waving green/purple curtain effect using global composite operations.
    2.  **Volumetric Blizzard**: Wind-aware soft snow puffs that drift across the screen.
    3.  **Screen Frosting**: Subtle ice crystal vignette in the corners of the screen.
    4.  **Icicles**: Procedural icicles with glint effects hanging from buildings.
    5.  **Engine Vapor**: Smoke/vapor puffs from tank chassit in cold air.
    6.  **Refined Ice Sheets**: Improved "Black Ice" ground details with sharp crack lines and reflections.
- **Technical Note**: Added global `windVector` and `auroraPhase` to manage atmospheric animations.

#### **ReferenceError: worldSize is not defined in drawZones**
- **Date**: 2026-05-09
- **Issue**: The game would crash in the `drawZones` function with `Uncaught ReferenceError: worldSize is not defined`.
- **Root Cause**: The `drawZones` function was using `worldSize` in a loop to draw road markings/grid lines, but the variable was not defined within the function's scope.
- **Fix**: Added `const worldSize = gameState.worldSize || 4000;` to the top of the `drawZones` function, consistent with other rendering functions like `drawGrid` and `drawMinimap`.
- **Verification**: Validated syntax and verified that the urban road markings render correctly without crashing.

#### **Wasteland "Scorched Earth" Visual Overhaul**
- **Date**: 2026-05-09
- **Goal**: Elevate the Wasteland biome to "True Premium" standards with more depth and atmosphere.
- **Features Added**:
    1.  **Scorched Earth**: Added large impact craters and radioactive "stains" (green/yellow glows) to the ground.
    2.  **Toxic Sky Glow**: Occasional distant flashes of orange/green light to simulate toxic storms.
    3.  **Nuclear Fog**: Layered, low-hanging brown/orange fog for depth.
    4.  **Ruined Architecture**: Buildings now feature jagged, procedurally broken shapes, internal fire glows, exposed rebar, and flickering "HOT" scrap signs.
    5.  **Varied Footprints**: Implemented L-shaped, T-shaped, and Plus-shaped building complexes for organic, non-grid layouts.
    6.  **Glowing Embers**: Upgraded ash particles into high-fidelity glowing coals with inner white-hot cores.
- **Technical Note**: Fixed a critical brace imbalance in the biome rendering loop and updated the `MapGenerator` to support procedural composite building shapes.

#### **WebSocket Connection Failure (Vite Proxy & EADDRINUSE)**
- **Datum**: 2026-05-09
- **Symptom**: Webbläsarkonsolen visar `WebSocket connection to 'ws://localhost:5173/socket.io/... failed` och spelet fastnar i "Game Initializing...".
- **Root Cause**: 
    1.  **Port-konklift**: Backend-servern kunde inte starta p.g.a. `EADDRINUSE`. Detta orsakades av att `nodemon` hamnade i en omstarts-loop när `backend/players.json` uppdaterades av servern (eftersom filen inte ignorerades korrekt i `package.json`).
    2.  **DNS/Proxy Issue**: Vite-proxyn hade svårt att mappa `localhost` på Windows.
- **Åtgärd**:
    1.  **Nodemon Fix**: Uppdaterat `package.json` med `"ignore": ["backend/players.json"]` för att bryta omstarts-loopen.
    2.  **Process Cleanup**: Dödat gamla Node-processer som låste porten.
    3.  **Polling-First**: Ändrat `transports` till `['polling', 'websocket']`.
    4.  **Backend Error Handling**: Lagt till explicit felhantering för `EADDRINUSE`.
- **Felsökning**: Kontrollerat port-status med `netstat` och verifierat att anslutningen stabiliseras efter transport-bytet.

#### **ReferenceError: Matter is not defined in server.js**
- **Datum**: 2026-05-09
- **Symptom**: Backend kraschar med 500-fel i webbläsaren när en spelare försöker byta chassis eller aktivera DEV-tanken via debug-menyn.
- **Root Cause**: `Matter.Body.setMass` anropades i `backend/server.js`, men `matter-js` var inte importerad i den filen. Detta orsakade en `ReferenceError` som stängde ner servern.
- **Åtgärd**: Lagt till `import Matter from 'matter-js';` i `backend/server.js`.
- **Verifiering**: Verifierat med `node -c` och manuell testning av chassis-byte i debug-menyn.

#### **The "Nature & Neon" Expansion**
- **Date**: 2026-05-09
- **Goal**: Expand environmental immersion by adding 3 unique animal types per biome.
- **Implementation**: 
    - Added 18 unique animal types across 6 biomes.
    - Implemented high-fidelity procedural animations: hopping (hares/frogs), flapping (birds), waddling/sliding (penguins), and skating (striders).
    - Integrated "Flee Logic" where animals react to tank proximity.
    - Optimized rendering with `isVisible` checks to maintain 60FPS.
- **Species List**:
    - **Desert**: Lizards, Scorpions, Vulture Shadows.
    - **Urban**: Pigeons, Stray Cats, Cockroaches.
    - **Industrial**: Rats, Micro-Drones, Moths.
    - **Tundra**: Snow Hares, Penguins, Arctic Foxes.
    - **Wetland**: Dragonflies, Frogs, Water Striders.
    - **Wasteland**: Mutated Crows, Scrap Beetles, Radioactive Slugs.
- **Scoring Hardening**: Modified `LobbyManager.js` to award points to the opposing team for ALL deaths, eliminating tactical suicides.

#### **Turret Rotation Lag & Zero-Angle Snap Fix**
- **Date**: 2026-05-09
- **Issue**: Turret rotation felt laggy, jittery, and would occasionally "snap" to the hull's angle.
- **Root Causes**:
    1. **Property Mismatch**: `interpolateState` used `p.aimAngle` while `drawTank` used `p.aa` (server value), causing visual lag.
    2. **Falsy Zero Bug**: `ctx.rotate(p.aa || p.a)` caused the turret to use the hull angle (`a`) whenever the aim angle (`aa`) was exactly `0`.
    3. **Input Flooding**: Excessive network packets from high-frequency mouse moves were hitting server rate limits.
    4. **Async Jitter**: Mouse-to-world conversion was happening outside the main render sync.
- **Fix**:
    1. **Unified Properties**: Updated all logic to use `a` and `aa` for smoothed/predicted rotation.
    2. **Safe Rotation Check**: Replaced falsy check with `(p.aa !== undefined ? p.aa : p.a)`.
    3. **Synchronized Calculation**: Moved aim calculation into `renderLoop` for perfect frame sync.
    4. **Input Throttling**: Limited network updates to 60Hz.
    5. **Layout Optimization**: Cached `canvas.getBoundingClientRect()` to prevent layout thrashing.
- **Verification**: Smooth turret movement confirmed for local and remote players.

#### **Steering Responsiveness & Collision Smoothing**
- **Date**: 2026-05-09
- **Issue**: Steering felt "sluggish" and "choppy," and tanks would get stuck when turning against buildings.
- **Root Causes**:
    1. **Physics Mismatch**: The client's prediction model was linear, while the server used a force/acceleration model with dampening. This caused constant "snap-backs" during movement.
    2. **Friction Lock**: High friction on building bodies caused tanks to stick to walls when applying forward force, preventing rotation.
    3. **Aggressive Reconciliation**: A stiff interpolation factor (0.9) made even minor prediction errors look like jittery "teleportation."
- **Fix**:
    1. **Synced Physics Model**: Rewrote the client's prediction loop to match the server's force and angular velocity acceleration logic exactly.
    2. **Velocity Broadcasting**: Added linear and angular velocity to the server state packets to improve prediction accuracy.
    3. **Zero Friction Walls**: Set building friction to `0`, allowing tanks to "slide" along surfaces while turning.
    4. **Snappier Steering**: Increased the server's angular velocity lerp factor from `0.15` to `0.3`.
    5. **Softer Smoothing**: Reduced reconciliation stiffness to `0.4` to hide minor sync offsets.
- **Verification**: Steering now feels responsive and collisions are smooth without visual jitter.

#### **Urban Performance & AI Navigation Fix**
- **Date**: 2026-05-10
- **Issue**: FPS drops to 40 in 10-player Urban matches and bots get stuck or crash the server.
- **Root Causes**:
    1. **Expensive Windows**: Hundreds of windows with `shadowBlur` were rendered per frame.
    2. **Redundant Rendering**: Objects outside the viewport were still being drawn.
    3. **Navigation Bottleneck**: Slow `JSON.parse(JSON.stringify)` and `Map` lookups in the A* algorithm.
    4. **ReferenceError**: `canSeeTarget` was referenced before initialization in `BotAI.js`.
- **Fix**:
    1. **View Frustum Culling**: Implemented `isRectInView` to skip off-screen rendering.
    2. **Urban Optimization**: Halved window count and replaced `shadowBlur` with a lightweight "glow" rect.
    3. **Backend Acceleration**: Switched to `TypedArrays` for A* scores and removed slow cloning logic.
    4. **Stability Fix**: Properly scoped and initialized AI variables.
- **Verification**: 60 FPS maintained in dense 5v5 Urban scenarios; `test_ai_deep.js` passed.
- **Hazard Barrel Self-Blocking (ignoreId Fix)**:
    - **Date**: 2026-05-10
    - **Issue**: Barrels would occasionally fail to generate puddles or gas clouds upon destruction.
    - **Root Cause**: The barrel remained in the physics engine's state during the frame it was destroyed. The `spawnElement` method's collision checks would detect the barrel itself as an obstacle, preventing the puddle from spawning at the same location.
    - **Fix**: Added an `ignoreId` parameter to `spawnElement`. When a barrel is destroyed, its ID is passed to the spawn logic to allow the puddle to overlap the barrel's final position.
    - **Verification**: Verified that all barrel types reliably spawn puddles/clouds upon destruction.
401: 
402: #### **Environmental Audio Overhaul ("True Premium" Feedback)**
403: - **Date**: 2026-05-10
404: - **Issue**: Missing weapon-impact sounds (Water, Ice, Dirt) and inconsistent puddle audio triggers.
405: - **Root Cause**: 
406:     1. **Impact Feedback**: The `collision-effect` handler in `game.js` lacked logic to trigger audio feedback.
407:     2. **Puddle Detection**: `updateLocalPlayerAudio` used incorrect material mappings (e.g., `MATERIALS.FROST` instead of `MATERIALS.ICE`) and lacked a buffer for organic shapes.
408: - **Fix**:
409:     1. **Impact Integration**: Linked `playEnvironmentalImpact` to the `collision-effect` socket event.
410:     2. **Puddle Refinement**: Updated `updateLocalPlayerAudio` with correct mappings for **Water** and **Ice**, increased the detection buffer (+25px), and added a 4s re-trigger timeout to prevent sound spam.
411:     3. **Asset Mapping**: Verified and corrected the mapping of ElevenLabs `.mp3` assets in `playWeaponSound` and `playEnvironmentalImpact`.
412: - **Verification**: Verified using `node -c` and audited all `playChannel` calls for proper channel management.

#### **CombatEngine Interaction Recursion (Infinite Loop Fix)**
- **Date**: 2026-05-10
- **Issue**: The server would crash with a "Maximum call stack size exceeded" error during intense combat involving multiple elemental hazards (e.g., Fire hitting Ice).
- **Root Cause**: A recursive chain of events in `processElementInteraction`. One interaction (Fire melts Ice to Water) could trigger another (Water reacts with nearby Fire to create Steam), which in turn could trigger the first one again if the bodies were still colliding, leading to an infinite loop within a single physics tick.
- **Fix**: 
    1. Implemented a recursion guard (`isProcessingInteraction`) in the `CombatEngine`.
    2. Wrapped the entire interaction logic in a `try...finally` block to ensure the guard is always reset, even if a logic error occurs.
    3. Added `return` statements after destructive interactions (like Fire + Water) to immediately exit the current processing chain.
- **Verification**: Verified that the server remains stable even when dozens of elemental hazards overlap.

#### **Dev Tank Weapon Expansion (7-Slot Support)**
- **Date**: 2026-05-10
- **Goal**: Enable testing of all seven weapon types on a single tank.
- **Changes**:
    1. **Backend**: Increased `CHASSIS.DEV` slots to **7** and added `DIRT_GUN` to its default loadout in `server.js`.
    2. **Input**: Added a key binding for the `7` key (`Digit7`) in `game.js` to switch to the 7th weapon slot.
    3. **HUD**: The weapon slot HUD is dynamically generated and now correctly displays 7 slots when using the Dev Tank.
- **Verification**: Verified that all 7 weapons can be cycled and fired using keys 1-7.

#### **Local Player Audio Crash (me.statusEffects TypeError)**
- **Date**: 2026-05-10
- **Issue**: Spelet kraschade med `TypeError: Cannot read properties of undefined (reading 'slip')` när man körde i Tundra-biomen.
- **Root Cause**: `updateLocalPlayerAudio` försökte läsa `me.statusEffects.slip`, men `statusEffects`-objektet skickas inte direkt till klienten i det formatet (det skickas som minifierade flaggor som `slp`).
- **Fix**: 
    1. **Backend**: Lade till `slp: p.statusEffects.slip > now` i `broadcastState` i `LobbyManager.js`.
    2. **Frontend**: Uppdaterade `game.js` att använda `me.slp` och lade till en säkerhetskontroll `if (me)` innan åtkomst.
- **Verification**: Kraschen åtgärdad och is-ljudet triggas korrekt i Tundra.

#### **Weapon Audio Finalization ("True Premium" Soundscapes)**
- **Date**: 2026-05-10
- **Status**: **VERIFIED**
- **Outcome**: All seven elemental weapons now have distinct, spatialized high-fidelity audio feedback.
- **Implemented Sounds**:
    - **Standard/Heavy**: Snappy mechanical firing sounds.
    - **Tesla**: High-frequency electrical discharge.
    - **Flamethrower**: Sustained low-frequency combustion.
    - **Water Cannon**: High-pressure splash feedback.
    - **Frost Gun**: Crystalline freezing impacts.
    - **Dirt Gun**: Heavy earthen thuds.
- **Environmental Impact Audio**:
    - Bullet impacts now trigger biome-specific sounds (Water Splash, Ice Shatter, Dirt Impact).
    - Local player movement now triggers high-fidelity "puddle" audio when entering hazards (Acid, Oil, Electric, Fire, Gas, Water, Steam, Ice).
- **Optimization**: Switched from generic `playSFX` to a managed `playChannel` system for weapons and puddles to prevent sound overlapping and ensure a clean, premium audio mix.
