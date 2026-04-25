# Tanks.io | Alchemical Siege (Ultimate Direction)

This document defines the merged and expanded "Alchemical Siege" direction, combining environmental destruction with deep elemental physics and modular tank customization.

---

## 🏗️ The Hybrid Vision: "Alchemical Siege"
In this world, tanks are not just armored vehicles; they are mobile laboratories. The environment is your primary weapon, and physics is the ammo.

### 🌊 The Core USP: **Physical Chain Reactions**
Everything in the world has a "Material State" (Oil, Water, Metal, Gas, Ice). Players win by layering these states to create catastrophic combos.

---

## 🧪 The Elemental Interaction Matrix
Inspired by systems like Baldur's Gate and Divinity: Original Sin, but optimized for fast-paced tank combat.

| Element A | Element B | Resulting Interaction | Gameplay Impact |
| :--- | :--- | :--- | :--- |
| **Fire** | **Oil** | **Ablaze** | Massive AoE fire; ticks damage; creates smoke. |
| **Electricity**| **Water** | **Electrified** | Stuns tanks in the puddle; damage scales with water size. |
| **Frost/Ice** | **Water** | **Frozen** | Creates slippery Ice terrain; can bridge water gaps. |
| **Dirt/Earth** | **Water** | **Mud/Slime** | Reduces speed/acceleration by 70%. |
| **Fire** | **Dirt/Mud** | **Hardened Clay**| Creates permanent physical walls (Higher HP than mounds). |
| **Ice** | **Ground** | **Slippery** | Reduces friction; tanks drift and take longer to stop. |
| **Frost** | **Fire** | **Steam Cloud**| Immediate vision blockage (Fog of War). |
| **Shockwave** | **Smoke/Gas** | **Dispersal** | Clears the area; pushes gas clouds into enemies. |

---

## 🛠️ Modular Tank Chassis System
Tanks are defined by their **Chassis**, which dictates the balance between mobility and firepower.

### 1. Chassis Statistics
- **Speed & Acceleration:** How fast you move and hit top speed.
- **Torque/Turn Speed:** How fast the body and turret rotate.
- **Mass:** Heavier tanks are harder to knock back but slower.
- **Weapon Slots:** The most critical stat (1 to 4 slots).

### 2. Configurable Weapon Slots
Each slot can be fitted with a unique module:
- **Main Gun:** High kinetic damage + knockback.
- **Flamethrower:** High fire application + ignores light cover.
- **Water Cannon:** Pushes objects + creates puddles for combos.
- **Dirt Gun:** Shoots "Dirt Mounds" (Matter.js physical bodies). Use them to block chokepoints or build defensive walls.
- **Tesla Coil:** Short-range electricity (jumps between targets).
- **Acid Sprayer:** Short-range cone that melts armor.
- **Mortar (Smoke/Gas/Oil/Ice):** Long-range area denial.
- **Rocket Pod:** High burst, slow reload, high physical impact.

---

## 🗺️ Map Design & Biomes
To support high-level strategy, the map is divided into distinct **Biomes**, each favoring different elemental archetypes.

### 1. The Dynamic Map Concept
The environment isn't just a backdrop; it's a "living" entity that reacts to player weapons.
- **Evolving Terrain:** A "Frost-Tank" can freeze a river to create a shortcut for its team. A "Fire-Tank" can melt it back to trap enemies.
- **Strategic Chokepoints:** Narrow valleys perfect for "Dirt Gun" barricades.

### 2. Primary Biomes
*   **🏢 The Steel Jungle (Urban):** High density of destructible buildings. Focuses on **Path A: Tactical Destruction**.
*   **💧 The Arcane Wetlands (Swamp):** Large puddles and mud pits. Ideal for **Electricity** and **Frost** combos.
*   **🏜️ The Dust Wastes (Desert):** Open terrain with high "Dirt" availability. Focuses on mobile combat and building/destroying mounds.
*   **❄️ The Glacial Peak (Tundra):** Naturally slippery terrain with destructible "Ice Spires."

---

## 🕵️ The "Stalking" Mechanic: Oil Leaks & Tracking
When a tank's health drops below **50%**, it begins to leak **Physical Oil**.
- **The Trail:** A trail of black oil slicks (Matter.js bodies) is left behind.
- **Tracking:** Enemies can follow the trail even through "Fog of War."
- **Risk/Reward:** An oil-leaking tank is a walking bomb. A single spark will ignite the entire trail, leading the fire directly back to the tank.
- **Repair:** Players must find a "Neutral Station" to fix leaks and stop the trail.

---

## 📈 Progression & Monetization

### The "Laboratory" Progression
1. **Scrap Collection:** Kill enemies → Collect scrap → Use it to "Brew" new weapon modules mid-game.
2. **Blueprints:** Permanent account progression. Unlock a "Blueprint" for a 4-slot chassis or a "Cryo-Mortar."
3. **Mastery:** Using a specific element (e.g., Fire) levels up your "Pyromancy" stat, increasing fire spread speed.

### Monetization: "The Alchemist's Vault"
- **Elemental Effects:** Change your "Fire" to "Purple Void Flames" or "Neon Green Acid."
- **Chassis Ornaments:** Physical attachments (Skulls, Spikes, Radar dishes) that don't affect hitboxes but look premium.
- **Kill Traces:** Leave a custom neon trail instead of smoke when you boost.

---

---

---

## ⚖️ The Meta-Balance Philosophy: "No Unstoppable Tank"
To ensure a healthy competitive environment, every elemental combo has a direct physical counter. Players must adapt their loadouts or coordinate with teammates to break an enemy's meta.

| Element / Style | Primary Counter | Counter Mechanic |
| :--- | :--- | :--- |
| **Fire (Burn)** | **Water** | Extinguishes fire immediately; creates vision-blocking steam. |
| **Electricity (Stun)** | **Dirt/Earth** | Dirt mounds act as insulators; electricity cannot pass through mud. |
| **Ice (Slippery)** | **Fire** | Melts ice back into water; restores normal ground friction. |
| **Acid (Corrosion)** | **Water** | Dilutes acid, stopping the persistent armor-eating effect. |
| **Dirt (Barricades)** | **Explosives/Kinetic**| High-impact shells shatter mounds and clay walls. |
| **Invis/Smoke (Stealth)**| **Electricity** | Arc-lightning jumps to hidden targets, revealing their position. |

---

## 📈 Evolution & In-Game Upgrades

### 1. Temporary "Field Upgrades"
Unlike permanent account unlocks, **Field Upgrades** are earned and lost within a single match. Collecting "Scrap" from fallen enemies allows you to invest in temporary weapon buffs:
- **Range+:** Increase projectile velocity and max travel distance.
- **Intensity+:** Fire burns hotter, Acid corrodes faster, Ice stays slippery longer.
- **Capacity+:** Reduces reload times or increases "magazine" size for burst weapons.
- **Impact+:** Increases physical knockback (Kinetic) or explosion radius.

### 2. The "Alchemist's Choice" (Leveling Up)
When you gather enough Scrap to level up, you are presented with 3 random **Power-Up Cards**. Examples:
- *"Conductive Armor":* Taking electric damage allows you to store and fire it back.
- *"Steam Engine":* Moving through steam clouds gives you a temporary speed boost.
- *"Clay Architect":* Your Dirt Gun now fires 2 mounds at once.

---

## 🛠️ Implementation Plan (Phase 2)
1. **Interaction Manager:** Build a system that checks for collisions between different "Material" types (e.g., `bullet_fire` vs `puddle_oil`).
2. **Modular Inventory:** Create the backend structure for the "Chassis + Slots" system (Player-driven customization).
3. **Field Upgrade System:** Implement the "Scrap" collection and the UI for choosing temporary buffs.
4. **Counter-Logic:** Ensure all elements have their `onContact` counter-effect programmed (e.g., `WaterBody.onContact(FireBody) -> spawn(SteamCloud)`).
