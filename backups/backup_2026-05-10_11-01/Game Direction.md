# Game Direction: The Alchemy of War

## 🎨 Core Vision
*Tanks.io* is not a game of twitch reflexes alone, but of **tactical elemental strategy**. Players don't just shoot; they react, combine, and counter elements to control the battlefield. It is a "Combat Alchemist" simulator where your tank is your laboratory.

---

## 🌪️ The "Elemental Alchemy" System
The heart of the game is how elements interact in the physical world.

| Element | Primary Effect | Secondary Synergy (Alchemy) |
| :--- | :--- | :--- |
| **Metal (Kinetic)** | High knockback & raw damage. | Shivers ICE; breaks DIRT mounds. |
| **Fire** | Persistent burn damage. | Ignites OIL; melts ICE; extinguished by WATER. |
| **Water** | Slows & pushes targets. | Extinguishes FIRE; creates STEAM; conducts ELECTRICITY. |
| **Oil** | Extremely slippery; no friction. | Highly flammable; ignites into massive FIRE zones. |
| **Electricity** | Stuns targets (0 movement). | Jumps through WATER pools; reveals STEALTH targets. |
| **Ice** | Low friction (sliding). | Melts into WATER; shatters under heavy METAL impact. |
| **Dirt** | Creates physical barriers. | Insulates against ELECTRICITY; creates cover. |
| **Steam** | Vision blocking (Stealth). | Created by FIRE + WATER; hides tanks within. |

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

### 1. The Scrap Economy
Scrap is the lifeblood of a match. It is obtained by:
- **Demolishing Buildings**: Static structures drop high-density scrap.
- **Player Eliminations**: Defeated enemies drop a percentage of their held scrap.
- **Strategic Harvesting**: High-value scrap zones are placed in the center of biomes.

### 2. Physical Buffs (Automated Scaling)
Scrap provides **linear automated scaling** during the match:
- **Damage Scaling**: Each 100 Scrap increases projectile damage by 100% (Buff Factor = 1 + Scrap/100).
- **Reload Acceleration**: Each 200 Scrap reduces reload time by 50% (Reload Factor = 1 / (1 + Scrap/200)).

### 3. The "Alchemist's Choice" (Leveling Up)
*Proposed for Phase 3:* When you gather enough Scrap to level up, you are presented with random **Power-Up Cards**:
- *"Conductive Armor":* Taking electric damage allows you to store and fire it back.
- *"Steam Engine":* Moving through steam clouds gives you a temporary speed boost.
- *"Clay Architect":* Your Dirt Gun now fires 2 mounds at once.

---

## 🛠️ Roadmap & Implementation

### Phase 1: Core Alchemy (COMPLETED)
- **Interaction Manager:** System that checks for collisions between different "Material" types.
- **Modular Inventory:** Chassis + Slots system (Scout, Brawler, Artillery).
- **Basic Counter-Logic:** Water vs Fire, Tesla vs Water, Dirt vs Electricity.

### Phase 2: Refinement (ACTIVE)
- **Audio System**: Dynamic soundtracks and spatial sound effects.
- **Options Menu**: Volume persistence and LocalStorage settings.
- **Vite Migration**: High-speed HMR and optimized asset delivery.

### Phase 3: Future Alchemy (PLANNED)
- **Acid & Gas**: New elements for area denial and chain reactions.
- **AI Guardians**: Drones that guard high-value scrap zones.
- **Advanced Leveling**: The "Power-Up Card" system.
