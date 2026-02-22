# Stellar Hex - Game Reference

Quick-reference for all spawnable entities, user interactions, and game events.
Keep this in sync before each commit.

---

## Spawnable Entities

### Units

Produced at starbases. Build time varies by unit type.

| Unit | MP | HP | ATK | DEF | Range | Sight | Size | Weapon | Armor | Shields | Build | Cost | Upkeep | Role |
|------|----|----|-----|-----|-------|-------|------|--------|-------|---------|-------|------|--------|------|
| Scout | 4 | 8 | 3 | 0 | 1 | 4 | Small | Laser | 0 | 0 | 2T | 20E, 5A | Free | Exploration, anomaly collection |
| Fighter | 3 | 15 | 7 | 3 | 1 | 2 | Small | Laser | 1 | 2 | 2T | 30E, 15A | 2E | Melee combat |
| Corvette | 3 | 18 | 8 | 5 | 1 | 2 | Small | Kinetic | 2 | 3 | 2T | 35E, 18A | 3E | Fast kinetic striker |
| Frigate | 2 | 25 | 9 | 8 | 2 | 3 | Medium | Missile | 3 | 5 | 3T | 45E, 25A, 10C | 4E, 1C | Ranged missile platform |
| Cruiser | 2 | 30 | 12 | 12 | 2 | 3 | Medium | Laser | 4 | 8 | 3T | 50E, 30A, 20C | 5E, 2C | Ranged heavy combat |
| Battleship | 1 | 50 | 18 | 18 | 2 | 3 | Large | Kinetic | 6 | 12 | 4T | 80E, 50A, 40C | 8E, 4C | Slow, devastating firepower |
| Colony Ship | 2 | 12 | 0 | 0 | 0 | 2 | Medium | None | 0 | 0 | 2T | 40E, 20A, 30C | 3E | Consumed when building a colony |
| Mining Drone | 2 | 6 | 0 | 0 | 0 | 1 | Small | None | 0 | 0 | 2T | 15E, 10M | Free | Passive resource gathering |

**Resource key:** E = Energy, M = Minerals, A = Alloys, C = Credits

**Weapon types:**
- **Laser** — +25% damage vs shields
- **Kinetic** — 25% armor bypass
- **Missile** — +25% damage vs small ships

**Ship sizes:** Small (take x0.75 dmg), Medium (x1.0), Large (x1.25)

**Unit upkeep:** Deducted each turn during END_TURN. Scouts and mining drones are free to maintain.

### Buildings

Placed by a friendly unit on the hex. Cost deducted immediately; yield applied each turn via END_TURN.

| Building | HP | Build Turns | Yield/Turn | Allowed Hex Types | Sight | Cost |
|----------|-----|-------------|------------|-------------------|-------|------|
| Mining Station | 15 | 1 | +3M | asteroid, asteroid_field | 2 | 20E, 5M |
| Colony | 30 | 2 | +2A, +2C | planet | 3 | 30E, 10A |
| Solar Collector | 10 | 1 | +4E | star | 1 | 10E, 15C |
| Starbase | 50 | 3 | +2E, +1C | empty, planet | 3 | 40E, 20A, 20C |
| Research Lab | 12 | 2 | +1E, +1C | nebula | 2 | 25E, 10A |

**Special rules:**
- Colony requires a **colony ship** on the hex (consumed on placement)
- First starbase built is automatically set as **home base**
- Starbases have a **production queue** for building units

### Anomalies

Placed by world generation (~1.5% of empty hexes). Discovered when a hex enters vision; collected by a **scout** with MP > 0 standing on the hex.

| Anomaly | Reward |
|---------|--------|
| Derelict Ship | +15A, +10C |
| Resource Cache | +20M, +10E |
| Alien Signal | +25C |
| Wormhole | +30E |
| Ancient Ruins | +10A, +10M, +10C |

---

## Combat System

Combat uses `resolveCombat()` from `combat-resolver.ts`.

### Damage Formula

```
baseDmg = ATK * veteranAttackMul * missileBonus * sizeFactor
-> crit check (10% base + 5%/vet tier, x1.5 multiplier)
-> variance (+/-15%, seeded)
-> shield absorption (laser bonus applies here)
-> armor reduction (kinetic bypasses 25%)
-> hull damage (minimum 1)
```

**Retaliation:** Defender retaliates only if it survives AND the attacker is within the defender's range.

### Shields and Armor

- **Shields** absorb damage before hull. Laser weapons deal +25% damage vs shields.
- **Armor** provides flat damage reduction after shield absorption. Kinetic weapons bypass 25% of armor.
- Shields regenerate +1 per turn (up to max) during the unit owner's MP refresh.

### Veterancy

Units gain XP from combat. Promotion thresholds: Standard (0) -> Improved (50 XP) -> Advanced (150 XP).

| Tier | ATK Multiplier | DEF Multiplier | Crit Bonus |
|------|---------------|----------------|------------|
| Standard | x1.0 | x1.0 | +0% |
| Improved | x1.15 | x1.1 | +5% |
| Advanced | x1.3 | x1.2 | +10% |

### Combat Flow

| Step | Description |
|------|-------------|
| 1. Validation | Attacker must own the unit, have MP >= 0, have a weapon, target must be enemy, target within attacker's range |
| 2. Preview | `attackWithResult()` computes result without mutating state (used by AI scoring and context menu) |
| 3. Animation | `animateCombat()` runs a 400ms flash sequence: attacker flash (0-200ms) then defender flash (200-400ms). Input is locked during animation. SFX: `playLaserZap` + `playImpactThud` |
| 4. Dispatch | `ATTACK` action applied to game state. Attacker's MP set to -1. Dead units removed from state. XP awarded, promotions applied |
| 5. Logging | Event log entry: "[unit] attacked [unit]: dealt X dmg, took Y dmg" with optional "destroyed" suffix. Includes coordinates for click-to-navigate |
| 6. Toast | Toast notification shown. Type = `danger` if any unit destroyed, otherwise `warning`. Includes coordinates for click-to-navigate |
| 7. Selection | If attacker survived: re-select attacker. If attacker destroyed: deselect all |

### Combat Entry Points

| Entry Point | Location | Description |
|-------------|----------|-------------|
| Context menu "Attack" | `context-menu.component.ts` | Right-click enemy unit while friendly unit is selected. Shows when unit has weapon, MP >= 0, target in range and visible |
| Context menu "Attack Here" | `context-menu.component.ts` | Right-click visible enemy unit beyond attack range. Sets a multi-turn waypoint; unit moves toward target each turn and auto-attacks when in range |
| AI attack | `ai.service.ts` | AI scores attacks via `scoreAttack()`, skips if attacker would die. Follows same animation + dispatch flow |

---

## Victory Conditions & Elimination

### Unit Upkeep

Each turn during END_TURN, unit maintenance costs are deducted from the player's resources. If any resource drops below 0 after upkeep:
- **Attrition:** All of that player's units take **2 damage**
- Units reduced to 0 HP are destroyed
- Resources are then clamped to 0 (no negative stockpiles)

### Player Elimination

After each END_TURN, any non-eliminated player with **0 units AND 0 buildings** is marked as `eliminated: true`. Eliminated players:
- Are skipped during turn processing (AI auto-ends their turn)
- Cannot take any further actions
- Do not count toward victory checks

### Victory Conditions

| Condition | Trigger | Description |
|-----------|---------|-------------|
| **Domination** | 1 non-eliminated player remains | Last player standing wins. All other players must be eliminated. |
| **Economic** | Any non-eliminated player reaches **500 credits** | First player to accumulate 500 credits wins. Checked after income + upkeep resolution. |

### Game Over

When a victory condition is met:
- `GameState.gameOver` is set with `{ winnerId, reason }`
- **Game Over Overlay** appears: "VICTORY" (teal) or "DEFEAT" (red) with winner name and reason
- End Turn button is disabled
- AI turns are skipped
- Waypoints are not executed
- "Return to Menu" button navigates back to `/menu`

---

## Multi-Turn Waypoints

Units can be given standing orders that persist across turns. Managed by `WaypointService` (UI-layer state, not saved to game state).

### Move Here

Right-click a hex beyond the selected unit's movement range. The unit immediately moves as far as possible this turn, and continues moving each subsequent turn until it arrives.

| Condition | Required |
|-----------|----------|
| Friendly unit selected | Yes |
| Unit has MP > 0 | Yes |
| Target hex outside reachable range | Yes |
| Target hex not the unit's current position | Yes |

### Attack Here

Right-click a visible enemy unit beyond attack range. The unit moves toward the target each turn and auto-attacks once in range.

| Condition | Required |
|-----------|----------|
| Friendly unit selected with weapon | Yes |
| Unit has MP > 0 | Yes |
| Visible enemy unit at target hex | Yes |
| Enemy outside attack range | Yes (otherwise normal "Attack" shows) |

### Waypoint Behavior

- Waypoints execute automatically at the start of each human turn (with movement animation)
- First-leg movement executes immediately when the order is issued
- Right-clicking a new target replaces any existing waypoint for that unit
- Escape cancels the selected unit's waypoint (toast: "Order cancelled")
- Waypoint clears when: unit arrives, target destroyed (Attack Here), unit destroyed
- Visual indicator: dashed line from unit to target with crosshair/diamond marker (blue for Move, red for Attack)

---

## Selection Events

All selection goes through `SelectionService`. Viewport clicks are blocked during AI turns and animations.

| Trigger | What Happens | Side Effects |
|---------|-------------|--------------|
| Click empty hex (no unit selected) | Selects hex, deselects unit | SFX: `playClick` |
| Click hex with friendly unit | Selects that unit + hex; cycles if already selected | SFX: `playClick` |
| Click hex with friendly unit selected elsewhere | Attempts pathfinding + movement | SFX: `playClick`, movement animation (150ms/hex), dispatches `MOVE_UNIT` |
| Shift+click hex with friendly unit | Toggles unit in multi-selection set | SFX: `playClick` |
| Double-click any hex | Centers camera on hex | (no SFX) |
| Tab | Cycles to next actionable unit (MP > 0); falls back to all units if none | (no SFX) |
| Shift+Tab | Cycles to previous actionable unit; same fallback | (no SFX) |
| Escape | Closes help panel (if open); cancels waypoint on selected unit (if any); otherwise deselects all | Toast: "Order cancelled" (if waypoint cancelled) |
| H key | Centers camera on home base, selects that hex | (no SFX) |
| Hover over hex | Updates `hoveredHexCoord`; shows path preview if unit selected | (no rendering SFX) |
| Pointer leaves canvas | Clears hover state | -- |
| Click unit in Unit List panel | Selects unit, centers camera | SFX: `playClick` |
| Click building in Building List panel | Selects hex, centers camera | SFX: `playClick` |
| Click event log entry with coords | Centers camera on event location | SFX: `playClick` |
| Click toast notification with coords | Centers camera, dismisses toast | (no SFX) |
| Click minimap | Centers camera on corresponding world position | (no SFX) |

---

## Game Actions (Reducer)

All state changes go through `gameReducer()`. Human actions route through `UndoService.dispatch()` (supports Ctrl+Z). AI actions use `GameStateService.dispatch()` directly.

| Action | Triggered By | Validation | State Change | UI Feedback |
|--------|-------------|------------|--------------|-------------|
| `MOVE_UNIT` | Viewport click, AI, waypoint execution | Path exists, MP >= cost | Updates unit position, deducts MP | Movement animation (150ms/hex), SFX: `playMovement` |
| `BUILD` | Context menu, Build menu, AI | Friendly unit on hex, no existing building, correct hex type, sufficient resources | Creates building, deducts resources. Colony consumes colony_ship | Event log entry, SFX: `playBuild` |
| `PRODUCE_UNIT` | Production menu, AI | Starbase exists, sufficient resources | Deducts resources, adds item to starbase queue | Event log entry, toast (success), SFX: `playProduce` |
| `ATTACK` | Context menu, AI | See Combat Flow above | Applies damage, sets attacker MP to -1, removes destroyed units, awards XP | Combat animation, event log, toast, SFX: laser + impact |
| `END_TURN` | Turn Controls button, AI | Not in gameOver state | See Turn Lifecycle below | Clears undo history, SFX: `playEndTurn` |
| `DISCOVER_ANOMALY` | Discovery effect (auto) | Hex has anomaly data, not already discovered | Adds anomaly to state map | Event log entry, toast (info), SFX: `playDiscovery` |
| `COLLECT_ANOMALY` | Context menu, AI | Scout on hex, MP > 0, anomaly exists | Grants resource reward, removes anomaly | Event log entry, toast (success), SFX: `playClick` |
| `SET_HOME_BASE` | HUD home button, Production menu | Building is a starbase owned by player | Updates player's `homeBaseId` | Event log entry |
| `UPDATE_EXPLORED` | Vision system (auto) | Player exists | Adds hex keys to player's explored set | -- |
| `ADVANCE_COMETS` | END_TURN (auto, each full round) | -- | Moves all dynamic objects by their velocity | -- |

---

## Turn Lifecycle

### END_TURN Flow (per player)

1. **Income** — Collect building yields + mining drone hex yields
2. **Upkeep** — Deduct unit maintenance costs from resources
3. **Attrition** — If any resource < 0: all player's units take 2 damage; dead units removed
4. **Resource clamp** — All resources clamped to >= 0
5. **Production** — Advance starbase queues; spawn completed units
6. **MP refresh** — Restore next player's unit movement points
7. **Shield regen** — Next player's units regenerate +1 shield (up to max)
8. **Elimination** — Mark players with 0 units + 0 buildings as eliminated
9. **Victory check** — Check for domination (1 player left) or economic (500 credits)
10. **Comets** — Advance dynamic objects (on full-round wrap only)

### Full Turn Cycle

1. At turn start, any standing waypoint orders execute automatically (animated movement)
2. Human player takes actions (move, build, attack, produce, collect)
3. Human clicks **End Turn** (or presses the button)
4. `END_TURN` dispatched with the flow above
5. Undo history cleared
6. If next player is AI:
   - If eliminated: auto-end turn immediately
   - If gameOver: skip entirely
   - Otherwise: `executeTurn()` called — iterates units by priority (combat > scouts > others), tries attack -> move -> build -> produce -> END_TURN
7. Cycle repeats until victory or all human players eliminated

---

## AI Behavior

The AI (`ai.service.ts` + `ai-scoring.ts`) executes a full turn autonomously:

- **Skips** if player is eliminated or game is over
- **Unit priority:** Combat units first, then scouts, then others (max 20 iterations)
- **Attack scoring:** Previews combat via `resolveCombat()`, skips if attacker would die or result is unfavorable
- **Movement:** Combat units move toward nearest visible enemy; scouts prefer anomalies then unexplored hexes
- **Building:** Scores all buildable hexes near owned positions by yield/cost ratio
- **Production:** Escalates unit type when enemies nearby (battleship > cruiser > frigate > corvette > fighter). Upkeep-aware: skips units if net energy income would drop below -5
- **300ms delay** between actions for visual feedback; minimum 1s total turn time

---

## Keyboard Shortcuts

| Key | Action |
|-----|--------|
| WASD / Arrows | Pan camera |
| +/- | Zoom in/out |
| Space (hold) | Pan mode (drag to pan) |
| Tab / Shift+Tab | Cycle owned units |
| B | Open context menu at selected hex |
| H | Center on home base |
| Escape | Close panels / deselect |
| Ctrl+Z | Undo last action |
| ? | Toggle help panel |
| Double-click | Center camera on hex |

---

*Last updated: 2026-02-22*
