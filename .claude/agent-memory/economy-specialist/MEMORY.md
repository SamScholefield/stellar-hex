# Economy Specialist Memory

## Architecture Patterns

### Pure Reducer + Service Bridge Pattern
- The game reducer (`game-reducer.ts`) is pure -- no DI, no side effects
- Services that need external data (e.g., hex data from ChunkManager) use a bridge pattern:
  - Pure helper computes data from a lookup function parameter
  - GameStateService has a convenience method that wires the lookup and dispatches
  - Callers inject ChunkManagerService and pass `(q, r) => chunkManager.getHex(q, r)`
- Example: `computeMiningDroneIncome()` is pure, `dispatchEndTurn()` bridges it

### Action Payload Pattern for External Data
- When the reducer needs data it can't access, pass it via the action payload
- END_TURN action carries optional `miningYields?: Partial<Resources>`
- This keeps the reducer pure while allowing rich behavior

## Key Files & Relationships
- `actions.ts` - GameAction union type; END_TURN has optional miningYields
- `game-reducer.ts` - Pure reducer; endTurn() accepts miningYields parameter
- `economy.service.ts` - `computeIncome()` (buildings), `computeMiningDroneIncome()` (units on resource hexes)
- `game-state.service.ts` - `dispatchEndTurn(hexLookup)` bridges mining income to reducer
- `EconomyService.income` computed signal includes both building + mining drone income

## Mining Drone Income
- Mining drones extract resources from the hex they occupy
- ResourceYield fields: energy?, minerals?, alloys?, credits? (all optional)
- Only `mining_drone` unit type generates income; all other types are filtered out
- Income computed per-turn in `computeMiningDroneIncome()` -- pure function
- Callers of END_TURN: action-bar, turn-controls, ai.service (all updated to use dispatchEndTurn)

## Testing Notes
- Economy pure functions tested in `economy.service.spec.ts` (12 tests)
- Reducer mining yields tested in `game-reducer.spec.ts` (5 new tests in END_TURN resource collection)
- Total test count: 138 (as of mining drone income implementation)
- When using StellarObjectType in tests, import it explicitly -- `as const` on string literals narrows too much

## Resource Types (game-state.ts Resources interface)
- energy, minerals, alloys, credits (all required numbers)
- Partial<Resources> used for costs, yields, and miningYields
- BUILDING_STATS yield and ResourceYield (hex-data.ts) use optional fields

## Building Stats Quick Reference
- mining_station: cost(energy:20, minerals:5), yield(minerals:3), on asteroid/asteroid_field
- colony: cost(energy:30, alloys:10), yield(alloys:2, credits:2), on planet
- solar_collector: cost(energy:10, credits:15), yield(energy:4), on star
- starbase: cost(energy:40, alloys:20, credits:20), yield(credits:1), on empty/planet
- research_lab: cost(energy:25, alloys:10), yield(energy:1, credits:1), on nebula

## Unit Stats Quick Reference
- mining_drone: MP:2, HP:6, atk:0, def:1, cost(energy:15, minerals:10)
- scout: MP:4, HP:8, atk:2, def:1, cost(energy:20, alloys:5)
- fighter: MP:3, HP:15, atk:6, def:3, cost(energy:30, alloys:15)
- cruiser: MP:2, HP:30, atk:10, def:8, cost(energy:50, alloys:30, credits:20)
- colony_ship: MP:2, HP:12, atk:0, def:2, cost(energy:40, alloys:20, credits:30)
