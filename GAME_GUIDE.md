# Stellar Hex - Game Guide

## Overview

Stellar Hex is a turn-based strategy game played on an infinite hex grid. You explore procedurally generated space, build structures, produce units, research technologies, and compete against AI opponents. The goal is to achieve victory through domination or economic supremacy.

---

## Resources

There are four resources, displayed in the resource bar at the top of the screen:

| Resource     | Use                                     |
| ------------ | --------------------------------------- |
| **Energy**   | Primary building/unit cost, upkeep      |
| **Minerals** | Building materials, mining drone output |
| **Alloys**   | Advanced construction (ships, colonies) |
| **Credits**  | Trade goods, economic victory condition |

Each turn you receive **income** from buildings and mining drones, and pay **upkeep** for military units. If you go bankrupt (any resource at 0 while upkeep exceeds income), your units take 2 attrition damage per turn.

---

## Hex Types

The galaxy contains different stellar objects you can explore and exploit:

| Hex Type           | Description                                                        |
| ------------------ | ------------------------------------------------------------------ |
| **Star**           | Central bodies. Build solar collectors adjacent to them.           |
| **Planet**         | Build colonies here. Starbases must be within 8 hexes of a planet. |
| **Asteroid**       | Resource-rich. Build mining stations here.                         |
| **Asteroid Field** | Dense asteroid regions. Build mining stations here.                |
| **Nebula**         | Gas clouds. Build starbases or research labs here.                 |
| **Black Hole**     | Dangerous. No building allowed.                                    |
| **Comet**          | Moving objects that cross the map.                                 |
| **Empty**          | Open space. Build solar collectors or starbases here.              |

---

## Structures

Build structures to generate resources, produce units, and research technology. Right-click a hex (or press **B**) with a unit present to see build options.

| Structure           | Cost        | HP  | Build Turns | Yield/Turn            | Allowed Hex              | Sight | Requirements                        |
| ------------------- | ----------- | --- | ----------- | --------------------- | ------------------------ | ----- | ----------------------------------- |
| **Mining Station**  | 20E 5M      | 15  | 1           | +3 Minerals           | Asteroid, Asteroid Field | 2     | Friendly unit at hex                |
| **Colony**          | 30E 10A     | 30  | 2           | +2 Alloys, +2 Credits | Planet                   | 5     | Colony Ship at hex (consumed)       |
| **Solar Collector** | 10E 15C     | 10  | 1           | +4 Energy             | Empty                    | 2     | Adjacent to a star                  |
| **Starbase**        | 40E 20A 20C | 50  | 3           | +2 Energy, +1 Credits | Empty, Nebula            | 5     | Scout at hex, planet within 8 hexes |
| **Research Lab**    | 25E 10A     | 12  | 2           | +1 Energy, +1 Credits | Nebula                   | 4     | Friendly unit at hex                |

**Key notes:**

- Starbases produce units. Select one to open the production menu.
- Research labs conduct research. Select one to open the research menu.
- All structures extend your **sphere of influence** based on their sight range.

---

## Units

Units are produced at starbases. Each unit has a per-turn upkeep cost.

### Combat Units

| Unit           | Size   | Weapon  | HP  | ATK | DEF | Armor | Shields | Range | MP  | Sight | Cost        | Build | Upkeep |
| -------------- | ------ | ------- | --- | --- | --- | ----- | ------- | ----- | --- | ----- | ----------- | ----- | ------ |
| **Scout**      | Small  | Laser   | 8   | 3   | 0   | 0     | 0       | 1     | 4   | 4     | 20E 5A      | 2     | Free   |
| **Fighter**    | Small  | Laser   | 15  | 7   | 3   | 1     | 2       | 1     | 3   | 2     | 30E 15A     | 2     | 2E     |
| **Corvette**   | Small  | Kinetic | 18  | 8   | 5   | 2     | 3       | 1     | 3   | 2     | 35E 18A     | 2     | 3E     |
| **Frigate**    | Medium | Missile | 25  | 9   | 8   | 3     | 5       | 2     | 2   | 3     | 45E 25A 10C | 3     | 4E 1C  |
| **Cruiser**    | Medium | Laser   | 30  | 12  | 12  | 4     | 8       | 2     | 2   | 3     | 50E 30A 20C | 3     | 5E 2C  |
| **Battleship** | Large  | Kinetic | 50  | 18  | 18  | 6     | 12      | 2     | 1   | 3     | 80E 50A 40C | 4     | 8E 4C  |

### Support Units

| Unit             | Size   | HP  | MP  | Sight | Cost        | Build | Upkeep | Purpose                    |
| ---------------- | ------ | --- | --- | ----- | ----------- | ----- | ------ | -------------------------- |
| **Colony Ship**  | Medium | 12  | 2   | 2     | 40E 20A 30C | 2     | 3E     | Found colonies on planets  |
| **Mining Drone** | Small  | 6   | 2   | 1     | 15E 10M     | 2     | Free   | Extract resources from hex |

**Key notes:**

- Colony ships and mining drones have **no weapons** and cannot attack.
- Mining drones extract resources from the hex they occupy (e.g., asteroids yield minerals).
- Scouts are free to maintain, making them ideal for exploration.

---

## Combat

### How It Works

1. Select a combat unit, then click an enemy within range to attack.
2. The **attacker strikes first**, dealing damage to the defender.
3. If the defender **survives** and the attacker is within the defender's range, the defender **retaliates**.

### Damage Formula

1. **Base damage** = attacker's ATK x veteran multiplier
2. **Size factor**: Small targets take 75% damage, large targets take 125%
3. **Weapon bonuses** applied (see weapon table)
4. **Critical hit** check (10% base chance + veteran bonus) = 1.5x damage
5. **Variance**: +/-10% random
6. **Influence modifier** applied (see below)
7. **Shields absorb** damage first (lasers deal 1.25x to shields)
8. **Armor reduces** remaining damage (kinetics bypass 25% of armor)
9. **Minimum 1 hull damage** per hit

### Weapon Types

| Weapon      | Shield Bonus            | Armor Bypass     | Special                     |
| ----------- | ----------------------- | ---------------- | --------------------------- |
| **Laser**   | 1.25x damage to shields | None             | Good vs shielded targets    |
| **Kinetic** | None                    | 25% armor bypass | Good vs armored targets     |
| **Missile** | None                    | None             | 1.25x damage vs small ships |

### Veterancy

Units gain XP from combat (damage dealt + kill bonus + survival bonus). Higher veteran tiers improve combat performance.

| Tier         | XP Required | ATK Multiplier | DEF Multiplier | Crit Bonus |
| ------------ | ----------- | -------------- | -------------- | ---------- |
| **Standard** | 0           | 1.0x           | 1.0x           | +0%        |
| **Improved** | 50          | 1.15x          | 1.1x           | +5%        |
| **Advanced** | 150         | 1.3x           | 1.2x           | +10%       |

### Sphere of Influence

Buildings project a sphere of influence based on their sight range. This affects combat:

- **Own influence**: Incoming damage reduced by 10%
- **Enemy influence**: Incoming damage increased by 10%
- **Influence regen**: Units in own influence (and not adjacent to enemies) heal +2 HP and +1 shield per turn

Press **I** to toggle the influence overlay, **R** for the attack range overlay.

---

## Research

Build a **Research Lab** in a nebula to unlock the tech tree. Select the lab and choose a technology to research.

### Tech Tree (5 branches x 3 tiers)

Tiers must be researched in order (T1 before T2, T2 before T3). Bonuses stack across tiers and apply to **all your units** immediately upon completion.

#### Shields Branch

| Tier | Name                  | Bonus      | Cost    | Turns |
| ---- | --------------------- | ---------- | ------- | ----- |
| T1   | Improved Deflectors   | +1 Shields | 30E 15C | 3     |
| T2   | Hardened Barriers     | +2 Shields | 50E 30C | 5     |
| T3   | Quantum Shield Matrix | +3 Shields | 80E 50C | 8     |

#### Weapons Branch

| Tier | Name                   | Bonus     | Cost    | Turns |
| ---- | ---------------------- | --------- | ------- | ----- |
| T1   | Refined Targeting      | +1 Attack | 30E 10A | 3     |
| T2   | Overcharged Capacitors | +2 Attack | 50E 20A | 5     |
| T3   | Particle Accelerators  | +3 Attack | 80E 40A | 8     |

#### Armor Branch

| Tier | Name               | Bonus    | Cost    | Turns |
| ---- | ------------------ | -------- | ------- | ----- |
| T1   | Reinforced Plating | +1 Armor | 25E 15A | 3     |
| T2   | Composite Alloys   | +2 Armor | 45E 30A | 5     |
| T3   | Nano-reactive Hull | +3 Armor | 75E 50A | 8     |

#### Systems Branch

| Tier | Name               | Bonus    | Cost    | Turns |
| ---- | ------------------ | -------- | ------- | ----- |
| T1   | Long-range Sensors | +1 Sight | 25E 10C | 3     |
| T2   | Tachyon Scanners   | +1 Sight | 40E 25C | 5     |
| T3   | Subspace Array     | +1 Sight | 65E 45C | 8     |

#### Drive Branch

| Tier | Name          | Bonus       | Cost    | Turns |
| ---- | ------------- | ----------- | ------- | ----- |
| T1   | Ion Thrusters | +1 Movement | 30E 10A | 4     |
| T2   | Fusion Drive  | +1 Movement | 55E 25A | 6     |
| T3   | Warp Coils    | +1 Movement | 90E 45A | 9     |

**Max cumulative bonuses** (all 15 techs): +6 Shields, +6 Attack, +6 Armor, +3 Sight, +3 Movement

---

## Anomalies

While exploring, your units may discover anomalies. Move a unit to the anomaly hex and collect the reward.

| Anomaly            | Reward                                |
| ------------------ | ------------------------------------- |
| **Derelict Ship**  | +15 Alloys, +10 Credits               |
| **Resource Cache** | +20 Minerals, +10 Energy              |
| **Alien Signal**   | +25 Credits                           |
| **Wormhole**       | +30 Energy                            |
| **Ancient Ruins**  | +10 Alloys, +10 Minerals, +10 Credits |

---

## Victory Conditions

There are two ways to win:

| Condition      | Requirement                                                         |
| -------------- | ------------------------------------------------------------------- |
| **Domination** | Eliminate all other players (destroy all their units and buildings) |
| **Economic**   | Accumulate **500 credits**                                          |

A player is **eliminated** when they have no units and no buildings remaining.

---

## Turn Flow

Each turn follows this sequence:

1. **Income** from buildings and mining drones added
2. **Upkeep** costs deducted
3. **Attrition** (2 damage to all units if any resource is negative)
4. **Resource clamp** (resources can't go below 0)
5. **Influence regen** (+2 HP, +1 shield for units in own influence, not near enemies)
6. **Production/Research** timers tick down; completed units spawn, completed techs apply
7. **Movement points** refresh for all units
8. **Shield regen** (shields restored to max)
9. **Elimination** check
10. **Victory** check
11. **Comet** movement

---

## Controls

### Mouse

- **Left click**: Select hex/unit
- **Left click on destination**: Move selected unit
- **Left click on enemy**: Attack with selected unit
- **Right click**: Open context menu (build, move, attack)
- **Scroll wheel**: Zoom in/out

### Keyboard

| Key                           | Action                          |
| ----------------------------- | ------------------------------- |
| **W/A/S/D** or **Arrow Keys** | Pan camera                      |
| **+/-**                       | Zoom in/out                     |
| **Tab**                       | Cycle to next unit              |
| **Shift+Tab**                 | Cycle to previous unit          |
| **B**                         | Open build menu at selected hex |
| **H**                         | Center camera on home base      |
| **I**                         | Toggle influence overlay        |
| **R**                         | Toggle attack range overlay     |
| **?**                         | Toggle help panel               |
| **Ctrl+Z**                    | Undo last action                |
| **Escape**                    | Cancel selection / close menus  |

---

## Getting Started Tips

1. **Explore early** with your starting scouts. They're fast (4 MP) and free to maintain.
2. **Build a starbase** near a planet as your first priority - you need it to produce units.
3. **Secure mining stations** on asteroids for mineral income.
4. **Build solar collectors** adjacent to stars for energy income.
5. **Watch your upkeep** - don't build more military than your economy can support. Bankruptcy causes attrition damage.
6. **Use terrain** to your advantage - nebulae are good for research labs, and your sphere of influence provides combat bonuses.
7. **Research early** - tech bonuses apply to all your existing units, not just new ones.
8. **Colony ships** are expensive but colonies provide alloys and credits, essential for advanced units.
9. **Collect anomalies** as you explore for free resource boosts.
10. **500 credits wins** the game economically - keep an eye on your credit income.
