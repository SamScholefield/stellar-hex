# Stellar Hex - Game Reference

Quick-reference for all spawnable entities, user interactions, and game events.
Keep this in sync before each commit.

---

## Spawnable Entities

### Units

Produced at starbases. All units take **2 turns** to build.

| Unit | MP | HP | ATK | DEF | Range | Sight | Cost | Role |
|------|----|----|-----|-----|-------|-------|------|------|
| Scout | 4 | 8 | 2 | 1 | 1 | 4 | 20E, 5A | Exploration, anomaly collection |
| Fighter | 3 | 15 | 6 | 3 | 1 | 2 | 30E, 15A | Melee combat |
| Cruiser | 2 | 30 | 10 | 8 | 2 | 3 | 50E, 30A, 20C | Ranged heavy combat |
| Colony Ship | 2 | 12 | 0 | 2 | 0 | 2 | 40E, 20A, 30C | Consumed when building a colony |
| Mining Drone | 2 | 6 | 0 | 1 | 0 | 1 | 15E, 10M | Passive resource gathering |

**Resource key:** E = Energy, M = Minerals, A = Alloys, C = Credits

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
| Escape | Closes help panel (if open), otherwise deselects all | (no SFX) |
| H key | Centers camera on home base, selects that hex | (no SFX) |
| Hover over hex | Updates `hoveredHexCoord`; shows path preview if unit selected | (no rendering SFX) |
| Pointer leaves canvas | Clears hover state | -- |
| Click unit in Unit List panel | Selects unit, centers camera | SFX: `playClick` |
| Click building in Building List panel | Selects hex, centers camera | SFX: `playClick` |
| Click event log entry with coords | Centers camera on event location | SFX: `playClick` |
| Click toast notification with coords | Centers camera, dismisses toast | (no SFX) |
| Click minimap | Centers camera on corresponding world position | (no SFX) |

---

## Combat Events

Combat uses `resolveCombat()` from `combat-resolver.ts`.

**Damage formula:** `damage = ATK * (1 - DEF / (DEF + 100))` with seeded +/-15% variance, minimum 1.

**Retaliation:** Defender retaliates only if it survives AND the attacker is within the defender's range.

### Combat Flow

| Step | Description |
|------|-------------|
| 1. Validation | Attacker must own the unit, have MP > 0, ATK > 0, target must be enemy, target within attacker's range, target hex must be visible |
| 2. Preview | `attackWithResult()` computes result without mutating state (used by AI scoring and context menu) |
| 3. Animation | `animateCombat()` runs a 400ms flash sequence: attacker flash (0-200ms) then defender flash (200-400ms). Input is locked during animation. SFX: `playLaserZap` + `playImpactThud` |
| 4. Dispatch | `ATTACK` action applied to game state. Attacker's MP set to 0. Dead units removed from state |
| 5. Logging | Event log entry: "[unit] attacked [unit]: dealt X dmg, took Y dmg" with optional "destroyed" suffix. Includes coordinates for click-to-navigate |
| 6. Toast | Toast notification shown. Type = `danger` if any unit destroyed, otherwise `warning`. Includes coordinates for click-to-navigate |
| 7. Selection | If attacker survived: re-select attacker. If attacker destroyed: deselect all |

### Combat Entry Points

| Entry Point | Location | Description |
|-------------|----------|-------------|
| Context menu "Attack" | `context-menu.component.ts` | Right-click enemy unit while friendly unit is selected. Shows when unit has MP > 0, ATK > 0, target in range and visible |
| AI attack | `ai.service.ts` | AI scores attacks via `scoreAttack()`, skips if attacker would die. Follows same animation + dispatch flow |

---

## Game Actions (Reducer)

All state changes go through `gameReducer()`. Human actions route through `UndoService.dispatch()` (supports Ctrl+Z). AI actions use `GameStateService.dispatch()` directly.

| Action | Triggered By | Validation | State Change | UI Feedback |
|--------|-------------|------------|--------------|-------------|
| `MOVE_UNIT` | Viewport click, AI | Path exists, MP >= cost | Updates unit position, deducts MP | Movement animation (150ms/hex), SFX: `playMovement` |
| `BUILD` | Context menu, Build menu, AI | Friendly unit on hex, no existing building, correct hex type, sufficient resources | Creates building, deducts resources. Colony consumes colony_ship | Event log entry, SFX: `playBuild` |
| `PRODUCE_UNIT` | Production menu, AI | Starbase exists, sufficient resources | Deducts resources, adds item to starbase queue (2 turns) | Event log entry, toast (success), SFX: `playProduce` |
| `ATTACK` | Context menu, AI | See Combat Flow above | Applies damage, sets attacker MP to 0, removes destroyed units | Combat animation, event log, toast, SFX: laser + impact |
| `END_TURN` | Turn Controls button, AI | -- | Collects building income + mining yields, advances production queues (spawns units when complete), refreshes next player's unit MP, advances comets, increments turn counter | Clears undo history, SFX: `playEndTurn` |
| `DISCOVER_ANOMALY` | Discovery effect (auto) | Hex has anomaly data, not already discovered | Adds anomaly to state map | Event log entry, toast (info), SFX: `playDiscovery` |
| `COLLECT_ANOMALY` | Context menu, AI | Scout on hex, MP > 0, anomaly exists | Grants resource reward, removes anomaly | Event log entry, toast (success), SFX: `playClick` |
| `SET_HOME_BASE` | HUD home button, Production menu | Building is a starbase owned by player | Updates player's `homeBaseId` | Event log entry |
| `UPDATE_EXPLORED` | Vision system (auto) | Player exists | Adds hex keys to player's explored set | -- |
| `ADVANCE_COMETS` | END_TURN (auto, each full round) | -- | Moves all dynamic objects by their velocity | -- |

---

## Turn Lifecycle

1. Human player takes actions (move, build, attack, produce, collect)
2. Human clicks **End Turn** (or presses the button)
3. `END_TURN` dispatched: income collected, production advanced, units spawned, MP refreshed for next player
4. Undo history cleared
5. If next player is AI: `executeTurn()` called automatically
   - AI iterates units by priority: combat units first, then scouts, then others
   - Each unit: try attack, then move toward enemy/explore target
   - After units: try build, try production
   - AI dispatches its own `END_TURN` when done
6. Cycle repeats

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

*Last updated: 2026-02-21*
