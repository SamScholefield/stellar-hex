# Movement & Pathfinding Agent Memory

## Pathfinding Architecture
- Pure functions in `/core/pathfinding/hex-pathfinder.ts`: `findPath` (A*), `getReachableHexes` (Dijkstra flood-fill), `pathCost`
- All three accept optional `costOverride?: MoveCostOverride` as last param
- `MoveCostOverride` returns `number | undefined` -- undefined means "use default cost"
- Default costs: star=Infinity, black_hole=Infinity, nebula=2, asteroid/asteroid_field=1.5, everything else=1

## Unit-Specific Movement
- `miningDroneCostOverride` exported from hex-pathfinder.ts: stars cost 2 MP for mining drones
- Callers check `unit.type === 'mining_drone'` and pass override to pathfinding functions
- Applied in: game-viewport.component.ts (3 call sites), ai.service.ts (1 call site)
- Black holes remain impassable for all units (override returns undefined for non-star types)

## Movement Costs Table
| Terrain        | Default Cost | Mining Drone Cost |
|----------------|-------------|-------------------|
| empty/open     | 1           | 1                 |
| planet         | 1           | 1                 |
| nebula         | 2           | 2                 |
| asteroid       | 1.5         | 1.5               |
| asteroid_field | 1.5         | 1.5               |
| star           | Infinity    | 2                 |
| black_hole     | Infinity    | Infinity           |

## Unit MP Values
- scout: 4 MP, fighter: 3 MP, cruiser: 2 MP, colony_ship: 2 MP, mining_drone: 2 MP

## Key Integration Points
- game-viewport.component.ts: effect() computes reachable hexes + path preview; handleClick() executes moves
- ai.service.ts: executeActions() calls findPath for AI unit movement
- ai-scoring.ts: imports findPath but does not call it directly (unused import)
- game-reducer.ts: MOVE_UNIT action uses pathCost for MP deduction

## Testing
- 28 tests in hex-pathfinder.spec.ts (13 new for cost override)
- Helper functions: `starAt()`, `blackHoleAt()`, `blockedAt()`, `nebulaAt()` for test lookups
- 151 total tests in project, all passing
