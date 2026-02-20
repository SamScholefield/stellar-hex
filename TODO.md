# Stellar Hex RTS — Development TODO

## Project Overview

A turn-based, top-down hex-based space RTS built in Angular (zoneless, OnPush, signals architecture). The game features an infinite procedurally generated star map with stellar objects (stars, planets, moons, asteroids, comets, nebulae, black holes). Players explore, build, harvest resources, and engage in tactical combat.

## Technical Constraints

- Angular 21 with `provideZonelessChangeDetection()`
- `ChangeDetectionStrategy.OnPush` on every component — no exceptions
- Signals and `computed()` for all reactive state — no BehaviorSubjects
- All state mutations through a pure reducer via `dispatch(action)` — immutable state
- Cube coordinates for hex math (q, r, s where q + r + s = 0)
- Chunk size: 16×16 hexes
- Seed-based deterministic world generation
- Canvas for game board rendering, Angular HTML/SVG for UI overlays

## Module Structure

```
src/
├── app/
│   ├── core/                  # Singleton services, state management
│   │   ├── state/             # GameStateService, reducer, actions, models
│   │   ├── camera/            # CameraService
│   │   ├── selection/         # SelectionService
│   │   ├── chunks/            # ChunkManagerService
│   │   ├── generation/        # WorldGeneratorService
│   │   ├── pathfinding/       # A* over hex grid
│   │   ├── vision/            # Fog of war, vision sources
│   │   ├── economy/           # Resource collection, building yields
│   │   ├── combat/            # Combat resolution
│   │   └── ai/               # AI opponent logic
│   ├── game/                  # Game view components
│   │   ├── viewport/          # Canvas viewport component
│   │   ├── renderer/          # HexCanvasRenderer, StellarRenderer, chunk texture cache
│   │   ├── hud/               # ResourceBar, TurnControls, Minimap
│   │   ├── panels/            # HexInfoPanel, UnitInfoPanel, BuildMenu
│   │   ├── overlays/          # SelectionHighlight, ContextMenu, Tooltip
│   │   └── log/               # EventLog, CombatLog
│   ├── menu/                  # Main menu, settings, save/load screens
│   ├── shared/                # Shared utilities
│   │   └── hex/               # Hex math library (pure functions)
│   └── models/                # TypeScript interfaces and types
```

---

## Phase 1 — Project Skeleton & Static Hex Grid

### 1.1 Project Setup

- [ ] Set up folder structure per module layout above
- [ ] Install dev dependencies: `@angular/cdk` (for overlay positioning later)
- [ ] Configure strict TypeScript settings in `tsconfig.json`
- [ ] Set up a basic route structure: `/menu` and `/game`

### 1.2 Hex Math Library

- [ ] Create `src/app/shared/hex/hex-math.ts` — all pure functions, no dependencies
- [ ] Implement `HexCoord` type: `{ q: number; r: number; s: number }`
- [ ] Implement `hexToPixel(q, r, hexSize): { x: number, y: number }` — flat-top hex layout
- [ ] Implement `pixelToHex(x, y, hexSize): HexCoord` — inverse, with rounding to nearest hex
- [ ] Implement `hexNeighbors(q, r): HexCoord[]` — returns all 6 adjacent hex coords
- [ ] Implement `hexDistance(a: HexCoord, b: HexCoord): number`
- [ ] Implement `hexRing(center, radius): HexCoord[]` — all hexes at exact distance
- [ ] Implement `hexesInRange(center, range): HexCoord[]` — all hexes within distance
- [ ] Implement `hexLineDraw(a, b): HexCoord[]` — line between two hexes
- [ ] Implement `cubeRound(q, r, s): HexCoord` — round fractional cube coords to nearest hex
- [ ] Write unit tests for all hex math functions

### 1.3 Camera Service

- [ ] Create `src/app/core/camera/camera.service.ts`
- [ ] Signal: `panX = signal(0)`
- [ ] Signal: `panY = signal(0)`
- [ ] Signal: `zoom = signal(1)` — clamped between 0.3 and 3.0
- [ ] Computed: `viewport()` — returns `{ left, top, right, bottom }` in world coordinates based on pan, zoom, and canvas dimensions
- [ ] Signal: `canvasWidth = signal(0)`, `canvasHeight = signal(0)` — updated by resize observer
- [ ] Method: `screenToWorld(screenX, screenY): { x: number, y: number }`
- [ ] Method: `worldToScreen(worldX, worldY): { x: number, y: number }`
- [ ] Method: `panBy(dx, dy)` — adjusts pan signals
- [ ] Method: `zoomAt(screenX, screenY, delta)` — zoom toward cursor position
- [ ] Method: `centerOn(worldX, worldY)` — jump camera to a world position

### 1.4 Game Viewport Component

- [ ] Create `src/app/game/viewport/game-viewport.component.ts`
- [ ] Template: single `<canvas #gameCanvas>` element, filling the component
- [ ] Use `viewChild.required` to get canvas ElementRef
- [ ] Attach `ResizeObserver` to canvas element → update `CameraService.canvasWidth/Height`
- [ ] Handle `pointerdown` → start pan tracking
- [ ] Handle `pointermove` → if panning, call `cameraService.panBy()`
- [ ] Handle `pointerup` → stop pan tracking
- [ ] Handle `wheel` → call `cameraService.zoomAt()`
- [ ] Use `effect()` to trigger re-render when camera viewport changes

### 1.5 Hex Canvas Renderer

- [ ] Create `src/app/game/renderer/hex-canvas-renderer.service.ts`
- [ ] Method: `draw(canvas, viewport, hexes)` — clears canvas, draws all hexes in viewport
- [ ] Draw each hex as a flat-top polygon outline (white stroke on black fill)
- [ ] Use `hexToPixel` to compute hex centers, then compute 6 polygon vertices
- [ ] Apply camera transform: translate by pan, scale by zoom
- [ ] Hardcode a 20×20 hex grid for testing
- [ ] Confirm hexes render correctly, no gaps or overlaps between adjacent hexes
- [ ] Confirm pan and zoom transform the entire grid correctly

### 1.6 Integration

- [ ] Wire up `GameViewportComponent` in the `/game` route
- [ ] Create a basic `GameComponent` shell that contains the viewport
- [ ] Create a minimal `MenuComponent` at `/menu` with a "Start Game" button that navigates to `/game`
- [ ] Verify: app loads → menu → click start → see hex grid → pan and zoom work

---

## Phase 2 — Chunk System & Procedural Generation

### 2.1 Data Models

- [ ] Create `src/app/models/chunk.ts`:
  ```typescript
  interface ChunkCoord {
    cx: number;
    cy: number;
  }
  interface Chunk {
    coord: ChunkCoord;
    hexes: Map<string, HexData>; // key: "q,r"
    dirty: boolean;
    texture?: OffscreenCanvas;
  }
  ```
- [ ] Create `src/app/models/hex-data.ts`:
  ```typescript
  type StellarObjectType =
    | 'star'
    | 'planet'
    | 'moon'
    | 'asteroid'
    | 'asteroid_field'
    | 'comet'
    | 'nebula'
    | 'black_hole'
    | 'empty';
  interface StellarObject {
    type: StellarObjectType;
    subtype?: string;
    size: number;
    resources?: ResourceYield;
    orbitAnchor?: HexCoord;
    velocity?: HexCoord; // comets
  }
  interface HexData {
    q: number;
    r: number;
    object: StellarObject | null;
  }
  ```
- [ ] Create `src/app/models/star-system.ts`:
  ```typescript
  interface StarSystemAnchor {
    center: HexCoord;
    starClass: 'O' | 'B' | 'A' | 'F' | 'G' | 'K' | 'M';
    planetCount: number;
    seed: number;
  }
  ```

### 2.2 Seeded Random & Noise

- [ ] Install `open-simplex-noise` or implement a simple seeded noise function
- [ ] Implement `seededRNG(seed: number)` — returns an object with `next(): number` (0-1 range), deterministic from seed
- [ ] Implement `hashCoord(seed, cx, cy): number` — deterministic hash for chunk coordinates
- [ ] Implement `hash3(seed, a, b): number` — deterministic hash for coarse grid lookups
- [ ] Implement `fbmNoise(x, y, seed, octaves): number` — fractal Brownian motion layered noise
- [ ] Write tests confirming determinism: same inputs always produce same outputs

### 2.3 World Generator Service

- [ ] Create `src/app/core/generation/world-generator.service.ts`
- [ ] Signal: `seed = signal(Date.now())` — set at game creation
- [ ] Implement coarse anchor grid for star systems:
  - `SYSTEM_SPACING = 32` hexes between coarse grid cells
  - `getNearbySystems(q, r, seed): StarSystemAnchor[]` — checks 3×3 coarse cells around any position, deterministic
  - ~40% of coarse cells contain a star system
  - Star position jittered within its coarse cell
- [ ] Implement `generate(coord: ChunkCoord): Chunk`:
  - For each hex in the 16×16 chunk:
    - Check if hex is a star system center → place star
    - Check if hex is in orbital ring (distance 2-4 from a star) → maybe place planet/moon
    - Moons: placed adjacent to planets, `orbitAnchor` points to parent planet hex
    - Check noise threshold for asteroid belt regions → place asteroid
    - Check large-scale noise for nebula → mark as nebula
    - Small random chance (~0.3%) for comet with random velocity vector
    - Default: null (empty space)
- [ ] Ensure cross-chunk consistency: a star system near a chunk boundary is discoverable from both chunks via `getNearbySystems()`
- [ ] Write tests: generate chunk, evict, regenerate → identical output

### 2.4 Chunk Manager Service

- [ ] Create `src/app/core/chunks/chunk-manager.service.ts`
- [ ] Inject `CameraService` and `WorldGeneratorService`
- [ ] Implement `getChunkCoordsInRect(viewport, chunkSize): ChunkCoord[]` — which chunks overlap the current viewport
- [ ] Computed signal: `visibleChunkCoords()` — derived from `camera.viewport()`
- [ ] Private `cache = new Map<string, Chunk>()` — loaded chunks
- [ ] Computed signal: `visibleChunks()`:
  - For each visible chunk coord, check cache → if missing, generate and cache
  - Return array of Chunk objects
  - Trigger eviction of distant chunks (distance > 3 chunks from any visible chunk)
- [ ] Method: `markDirty(q, r)` — finds the chunk containing hex (q,r), sets `dirty = true`
- [ ] Method: `getHex(q, r): HexData | null` — look up a hex from cache, generating the chunk if needed

### 2.5 Chunk Texture Caching

- [ ] In `HexCanvasRenderer`, implement per-chunk offscreen canvas rendering:
  - Each chunk gets an `OffscreenCanvas` (or regular Canvas) of fixed pixel size
  - When `chunk.dirty === true`, re-render all 256 hexes to the chunk's offscreen canvas, then set `dirty = false`
  - Color-code hex fills by stellar object type: yellow=star, blue=planet, grey=asteroid, purple=nebula, cyan=comet, dark red=black hole, white dot=moon, transparent=empty
- [ ] Update main `draw()` method:
  - For each visible chunk: if dirty, render to offscreen canvas
  - Blit each chunk's offscreen canvas to the main canvas at the correct world position
  - Apply camera pan and zoom transforms

### 2.6 Integration

- [ ] Replace the hardcoded 20×20 grid with the chunk-based system
- [ ] Verify: pan in any direction → new chunks generate seamlessly
- [ ] Verify: zoom out → many chunks visible, performance stays smooth
- [ ] Verify: pan away and come back → same terrain regenerated identically
- [ ] Stress test: pan rapidly across large distances → no crashes, no stalls

---

## Phase 3 — Hex Interaction & Selection

### 3.1 Selection Service

- [ ] Create `src/app/core/selection/selection.service.ts`
- [ ] Signal: `selectedHexCoord = signal<HexCoord | null>(null)`
- [ ] Signal: `hoveredHexCoord = signal<HexCoord | null>(null)`
- [ ] Signal: `selectedUnit = signal<string | null>(null)` — unit ID, unused until Phase 5
- [ ] Computed: `selectedHexData()` — looks up hex data from `ChunkManagerService`
- [ ] Method: `selectHex(coord)`, `deselectAll()`, `hoverHex(coord)`

### 3.2 Canvas Hit Detection

- [ ] In `GameViewportComponent`:
  - On `click`: convert screen coords → world coords via `CameraService.screenToWorld()`, then `pixelToHex()` → get `HexCoord`
  - Call `selectionService.selectHex(coord)`
  - Distinguish click from drag: only select if pointer hasn't moved more than 4px since pointerdown
- [ ] On `pointermove` (when not panning): convert to hex coord → call `selectionService.hoverHex(coord)`

### 3.3 Selection Rendering

- [ ] In `HexCanvasRenderer`, after drawing chunk textures:
  - If `hoveredHexCoord()` is set: draw a semi-transparent highlight on that hex
  - If `selectedHexCoord()` is set: draw a bright outline (e.g. cyan border, 2px) on that hex
- [ ] These overlays draw directly on the main canvas (not on chunk textures) so they don't dirty the cache

### 3.4 Hex Info Panel

- [ ] Create `src/app/game/panels/hex-info-panel.component.ts`
- [ ] Positioned absolutely over the canvas (bottom-left or right sidebar)
- [ ] Reads `selectionService.selectedHexData()` signal
- [ ] Displays: hex coordinates (q, r), stellar object type, subtype, size, resource yield if any
- [ ] Shows "Empty Space" when hex has no object
- [ ] Hidden when nothing is selected

### 3.5 HUD Shell

- [ ] Create `src/app/game/hud/hud.component.ts` — container for all HUD elements
- [ ] Position as an overlay grid on top of the canvas using CSS (pointer-events: none on container, pointer-events: auto on interactive children)
- [ ] Create placeholder `ResourceBarComponent` — empty for now, will be populated in Phase 7
- [ ] Create placeholder `TurnControlsComponent` — "End Turn" button (non-functional until Phase 4)
- [ ] Create placeholder minimap area (implemented in Phase 12)

### 3.6 Context Menu

- [ ] Create `src/app/game/overlays/context-menu.component.ts`
- [ ] On right-click on canvas: prevent default, compute hex coord, show context menu at screen position
- [ ] Menu items are contextual stubs for now: "Inspect", "Move Here" (disabled), "Build" (disabled)
- [ ] Click outside or Escape dismisses the menu

### 3.7 Keyboard Controls

- [ ] Escape → `selectionService.deselectAll()`
- [ ] WASD or Arrow Keys → `cameraService.panBy()` with fixed step
- [ ] +/- → zoom in/out
- [ ] Register keyboard handlers at the `GameComponent` level via `@HostListener` or `fromEvent`

---

## Phase 4 — Game State, Turns & Reducer

### 4.1 State Models

- [ ] Create `src/app/models/game-state.ts`:
  ```typescript
  interface GameState {
    turn: number;
    currentPlayerIndex: number;
    players: PlayerState[];
    units: Map<string, UnitData>; // by unit ID
    buildings: Map<string, BuildingData>; // by building ID
    dynamicObjects: Map<string, DynamicObject>; // comets etc
    chunkOverrides: Map<string, HexOverride[]>; // player modifications to generated terrain
  }
  interface PlayerState {
    id: string;
    name: string;
    color: string;
    resources: Resources;
    isAI: boolean;
  }
  interface Resources {
    energy: number;
    minerals: number;
    alloys: number;
    credits: number;
  }
  ```

### 4.2 Actions

- [ ] Create `src/app/core/state/actions.ts`:
  ```typescript
  type GameAction =
    | { type: 'END_TURN' }
    | { type: 'MOVE_UNIT'; unitId: string; path: HexCoord[] }
    | { type: 'ATTACK'; attackerId: string; targetId: string }
    | { type: 'BUILD'; playerId: string; buildingType: string; hex: HexCoord }
    | { type: 'PRODUCE_UNIT'; buildingId: string; unitType: string }
    | { type: 'HARVEST'; unitId: string }
    | { type: 'ADVANCE_COMETS' };
  // ... extend as needed
  ```

### 4.3 Reducer

- [ ] Create `src/app/core/state/game-reducer.ts` — pure function `(state, action) => newState`
- [ ] Implement `END_TURN`: increment turn, advance `currentPlayerIndex` (wrap around), refresh unit movement points
- [ ] Implement `ADVANCE_COMETS`: move each comet by its velocity, update chunk dirty flags
- [ ] Wire `END_TURN` to also dispatch `ADVANCE_COMETS`
- [ ] Write unit tests for the reducer — pure function testing, no Angular needed

### 4.4 Game State Service

- [ ] Create `src/app/core/state/game-state.service.ts`
- [ ] Private signal: `_gameState = signal<GameState>(createInitialState())`
- [ ] Public computed signals for UI consumption:
  - `turn = computed(() => this._gameState().turn)`
  - `currentPlayer = computed(() => this._gameState().players[this._gameState().currentPlayerIndex])`
  - `resources = computed(() => this.currentPlayer().resources)`
  - `units = computed(() => this._gameState().units)`
  - `buildings = computed(() => this._gameState().buildings)`
- [ ] Method: `dispatch(action: GameAction)` — applies reducer, updates signal
- [ ] Method: `getState(): GameState` — snapshot for save

### 4.5 Turn Controls

- [ ] Update `TurnControlsComponent`:
  - Display current turn number from `gameState.turn()`
  - Display current player name and color from `gameState.currentPlayer()`
  - "End Turn" button calls `gameState.dispatch({ type: 'END_TURN' })`
  - Visual feedback: turn number updates, player indicator changes color

### 4.6 Resource Bar

- [ ] Update `ResourceBarComponent`:
  - Display each resource type and current amount from `gameState.resources()`
  - Values update reactively when state changes

### 4.7 Save / Load

- [ ] Create `src/app/core/state/save-load.service.ts`
- [ ] Method: `save()`:
  - Serialize `GameState` to JSON (convert Maps to arrays of entries)
  - Include the world seed
  - Trigger browser file download of the JSON
- [ ] Method: `load(file: File)`:
  - Parse JSON, reconstruct Maps
  - Set the world seed on `WorldGeneratorService`
  - Replace `_gameState` signal value
  - Invalidate all cached chunks (they'll regenerate from seed)
- [ ] Add Save/Load buttons to a pause menu or settings overlay
- [ ] Test: save game → reload page → load file → identical game state

### 4.8 Game Initialization

- [ ] Create `src/app/core/state/game-init.service.ts`
- [ ] Method: `newGame(config)`:
  - Takes: player name, number of AI opponents, seed (optional, default random)
  - Creates initial `GameState` with players, starting resources
  - Sets world seed
  - Determines starting positions (spread players apart on the coarse grid)
  - Spawns starting units for each player at their start location
- [ ] Wire "New Game" button on menu to this service → navigate to `/game`

---

## Phase 5 — Units, Movement & Pathfinding

### 5.1 Unit Models

- [ ] Create `src/app/models/unit-data.ts`:
  ```typescript
  interface UnitData {
    id: string;
    ownerId: string;
    type: UnitType;
    q: number;
    r: number;
    movementPoints: number;
    maxMovementPoints: number;
    health: number;
    maxHealth: number;
    attack: number;
    defense: number;
    range: number; // attack range in hexes
    sightRange: number;
  }
  type UnitType = 'scout' | 'fighter' | 'cruiser' | 'colony_ship' | 'mining_drone';
  ```
- [ ] Define unit type stats table: movement, health, attack, defense, range, sight, cost

### 5.2 Unit Rendering

- [ ] In `HexCanvasRenderer`, add a unit rendering pass after chunk textures:
  - For each visible unit: draw a colored shape (triangle=scout, diamond=fighter, etc.) at the hex center
  - Color by owner (player color from `PlayerState`)
  - Draw a small health bar below the unit if damaged
- [ ] Selected unit gets a highlight ring

### 5.3 Unit Selection

- [ ] Update canvas click handler:
  - After converting click to hex coord, check if a unit exists at that hex
  - If yes: `selectionService.selectedUnit.set(unitId)`
  - If no unit but hex exists: `selectionService.selectedHexCoord.set(coord)` (hex selection)
  - If a unit is already selected and the clicked hex is empty: treat as a move command (Phase 5.5)

### 5.4 Unit Info Panel

- [ ] Create `src/app/game/panels/unit-info-panel.component.ts`
- [ ] Reads `selectionService.selectedUnit()` → looks up unit from `gameState.units()`
- [ ] Displays: unit type, owner, health/max, movement/max, attack, defense, range
- [ ] Show instead of (or alongside) hex info panel when a unit is selected

### 5.5 Pathfinding

- [ ] Create `src/app/core/pathfinding/hex-pathfinder.ts`
- [ ] Implement A\* over hex grid:
  - Heuristic: hex distance
  - Movement cost per hex: 1 for empty space, 2 for nebula, 999 (impassable) for stars/black holes, 1.5 for asteroid fields
  - Blocked by enemy units (cannot move through them)
  - Must handle cross-chunk pathfinding: use `chunkManager.getHex()` to load hex data for frontier nodes
  - Limit search to `maxMovementPoints * 3` distance to prevent runaway searches on infinite grid
- [ ] Method: `findPath(from, to, movementPoints, hexLookup): HexCoord[] | null`
- [ ] Method: `getReachableHexes(from, movementPoints, hexLookup): Map<string, number>` — returns all reachable hexes with remaining movement at each
- [ ] Write tests with mock hex data

### 5.6 Movement Range Overlay

- [ ] When a unit is selected, compute `getReachableHexes()` and store result in a signal
- [ ] Render reachable hexes as a semi-transparent colored overlay on the canvas
- [ ] Render the path to the hovered hex (if reachable) as a line/arrow overlay

### 5.7 Move Action

- [ ] Implement `MOVE_UNIT` in the reducer:
  - Update unit's q, r to destination
  - Deduct movement points based on path cost
  - Mark affected chunks dirty
- [ ] On clicking a reachable hex while a unit is selected:
  - Compute path via A\*
  - Dispatch `MOVE_UNIT` action
- [ ] Clear movement overlay after move

### 5.8 Movement Animation

- [ ] Create `src/app/game/renderer/animation.service.ts`
- [ ] Method: `animateUnitMovement(unitId, path): Promise<void>`
  - Step through each hex in the path with ~150ms delay
  - On each step, update the unit's visual position (not state — just rendering) and redraw
  - Use `requestAnimationFrame` for smooth interpolation between hex centers
  - On completion, resolve the promise → then dispatch the state action
- [ ] During animation, disable user input (prevent clicking other hexes)

### 5.9 Action Bar

- [ ] Create `src/app/game/panels/action-bar.component.ts`
- [ ] Shows contextual buttons based on current selection:
  - Unit selected: "Move" (toggle movement mode), "Attack" (disabled until Phase 8), "End Turn"
  - No selection: "End Turn" only
- [ ] "End Turn" dispatches `END_TURN` action
- [ ] End turn also refreshes all owned units' movement points (in reducer)

### 5.10 Turn End Sequence

- [ ] Update `END_TURN` reducer logic:
  - Refresh all current player's units' movement points to max
  - Advance comets
  - (Placeholder for future: collect resources, process build queues)
  - Advance to next player

---

## Phase 6 — Fog of War & Exploration

### 6.1 Vision Service

- [ ] Create `src/app/core/vision/vision.service.ts`
- [ ] Computed: `visionSources()` — all units and buildings owned by current player, each with `{ q, r, sightRange }`
- [ ] Method: `isVisible(q, r): boolean` — true if within sight range of any vision source
- [ ] Method: `isExplored(q, r): boolean` — true if player has ever had vision on this hex
- [ ] Optimize: use a spatial hash or precomputed set of visible hex coords, recomputed when vision sources change (which only happens on discrete actions, not continuously)

### 6.2 Explored State Tracking

- [ ] In `GameState`, add per-player explored data:
  ```typescript
  exploredHexes: Set<string>; // "q,r" keys
  ```
- [ ] On every state change that moves/adds a vision source: compute newly visible hexes → add to `exploredHexes`
- [ ] Save/load the explored set (can be compressed: store as chunk-level bitmasks)

### 6.3 Fog of War Rendering

- [ ] Update `HexCanvasRenderer` with three rendering modes per hex:
  - **Unexplored**: don't draw hex content — render as solid black (or skip rendering)
  - **Explored but not visible**: draw hex content with a dark tint overlay (50-70% black)
  - **Visible**: draw normally
- [ ] Render fog overlay after chunk textures but before unit layer
- [ ] Only draw units that are in visible hexes (hide enemy units in fog)
- [ ] Ensure fog updates when units move (mark affected chunks for overlay redraw — but don't dirty the base texture, only the fog layer)

### 6.4 Exploration Discovery Events

- [ ] Create `src/app/models/anomaly.ts`:
  ```typescript
  interface Anomaly {
    type: 'derelict_ship' | 'resource_cache' | 'alien_signal' | 'wormhole' | 'ancient_ruins';
    hexQ: number;
    hexR: number;
    reward?: Partial<Resources>;
    discovered: boolean;
  }
  ```
- [ ] During generation: some hexes get an anomaly (low probability, ~1-2%)
- [ ] When a hex with an undiscovered anomaly becomes visible for the first time: trigger a discovery event
- [ ] Store discovered anomalies in game state

### 6.5 Event Log

- [ ] Create `src/app/game/log/event-log.component.ts`
- [ ] Display a scrollable list of game events: "Turn 5: Scout discovered Ancient Ruins at (12, -8)"
- [ ] Create `EventLogService` with a signal: `events = signal<GameEvent[]>([])`
- [ ] Push events on: discovery, combat (Phase 8), building completion (Phase 7), turn start
- [ ] Position as a collapsible panel in the bottom-right

---

## Phase 7 — Economy & Building

### 7.1 Resource System

- [ ] Define resource types in `Resources` interface (already created in Phase 4):
  - Energy: harvested near stars, solar collectors
  - Minerals: harvested from asteroids
  - Alloys: produced by colonies on planets (refining minerals)
  - Credits: passive income from colonies, used for unit production
- [ ] Stellar objects declare their yield in `ResourceYield`:
  ```typescript
  interface ResourceYield {
    energy?: number;
    minerals?: number;
    alloys?: number;
    credits?: number;
  }
  ```
- [ ] Assign yields during generation: stars → energy, asteroids → minerals, planets → alloys + credits

### 7.2 Building Models

- [ ] Create `src/app/models/building-data.ts`:
  ```typescript
  interface BuildingData {
    id: string;
    ownerId: string;
    type: BuildingType;
    q: number;
    r: number;
    health: number;
    maxHealth: number;
    productionQueue?: ProductionItem[];
  }
  type BuildingType = 'mining_station' | 'colony' | 'solar_collector' | 'starbase' | 'research_lab';
  ```
- [ ] Define building type table: cost, allowed placement (which stellar object types), per-turn yield, build time

### 7.3 Build Action

- [ ] Implement `BUILD` action in reducer:
  - Validate: player has enough resources, hex is valid for building type, no existing building on hex
  - Deduct resources
  - Add building to `GameState.buildings`
  - Add hex override to `chunkOverrides` (so save/load preserves it)
  - Mark chunk dirty for re-render
- [ ] Building rendering: draw building icons on the canvas at their hex positions (distinct from stellar objects — overlay on top)

### 7.4 Build Menu

- [ ] Create `src/app/game/panels/build-menu.component.ts`
- [ ] Show when a unit is selected on a valid hex for building
- [ ] List available building types for the current hex's stellar object
- [ ] Show cost and per-turn yield for each option
- [ ] Grey out buildings the player can't afford
- [ ] On selection: dispatch `BUILD` action

### 7.5 Resource Collection

- [ ] In `END_TURN` reducer: iterate all current player's buildings, sum their yields, add to player resources
- [ ] Update `ResourceBarComponent` to show per-turn income as "+N" next to each resource total

### 7.6 Unit Production

- [ ] Starbases can produce units:
  - `PRODUCE_UNIT` action: deduct cost, add item to starbase's `productionQueue` with turns remaining
  - Each turn end: decrement build timers, when complete → spawn unit at starbase hex
- [ ] Update starbase info panel to show production queue
- [ ] If starbase hex is occupied when a unit completes, place unit on nearest empty adjacent hex

---

## Phase 8 — Combat

### 8.1 Combat Resolution

- [ ] Create `src/app/core/combat/combat-resolver.ts` — pure function
- [ ] `resolveCombat(attacker: UnitData, defender: UnitData, seed: number): CombatResult`
  ```typescript
  interface CombatResult {
    attackerDamage: number; // damage dealt to attacker (defender strikes back)
    defenderDamage: number; // damage dealt to defender
    attackerDestroyed: boolean;
    defenderDestroyed: boolean;
  }
  ```
- [ ] Formula: damage = attacker.attack × (1 - defender.defense / (defender.defense + 100)) + random variance
- [ ] Defender retaliates if still alive and attacker is in defender's range
- [ ] Write unit tests for combat resolution with various stat combinations

### 8.2 Attack Action

- [ ] Implement `ATTACK` in reducer:
  - Validate: attacker has movement/action points, target is in range, target is enemy
  - Resolve combat
  - Apply damage to both units
  - Remove destroyed units from state
  - Deduct attacker's action (unit can't move after attacking, or vice versa — choose one)
  - Mark affected chunks dirty
  - Log combat event

### 8.3 Attack UI Flow

- [ ] When unit is selected, "Attack" button in action bar becomes clickable
- [ ] Entering attack mode: highlight all enemy units within attack range in red
- [ ] Clicking a highlighted enemy: dispatch `ATTACK`
- [ ] Cancel attack mode with Escape or right-click

### 8.4 Combat Preview

- [ ] Create `src/app/game/overlays/combat-preview.component.ts`
- [ ] When hovering an attackable enemy: show a tooltip with predicted damage, outcome probability
- [ ] Position tooltip near the mouse cursor using `worldToScreen`

### 8.5 Combat Animations

- [ ] In `AnimationService`:
  - `animateCombat(attackerId, defenderId, result): Promise<void>`
  - Flash/pulse effect on attacker and defender
  - Floating damage numbers rising from each unit
  - If unit destroyed: brief explosion effect (expanding circle or particle burst)
- [ ] Chain: animation plays → then state is applied → then canvas redraws with result

### 8.6 Zone of Control (Optional)

- [ ] Enemy units exert zone of control on adjacent hexes
- [ ] Moving through a ZoC hex costs extra movement points
- [ ] Or: entering a ZoC hex ends movement immediately
- [ ] Visual: highlight ZoC hexes in a faint red when planning movement

---

## Phase 9 — AI Opponent

### 9.1 AI Service

- [ ] Create `src/app/core/ai/ai.service.ts`
- [ ] Method: `executeTurn(playerId: string): Promise<void>`
- [ ] Called when `currentPlayer.isAI === true` after `END_TURN` advances to the AI player
- [ ] AI turn runs asynchronously with delays between actions so human can observe

### 9.2 AI Decision Making

- [ ] Implement utility-based AI with scoring functions:
  - **Explore score**: unexplored hexes near idle scouts → high priority to move scouts outward
  - **Expand score**: discovered resource hexes without buildings → send colony ships / build mining stations
  - **Exploit score**: optimize resource collection, produce units when resources are stockpiling
  - **Exterminate score**: enemy units/buildings within reach → evaluate if attack is favorable (compare combat prediction)
- [ ] Each turn, AI:
  1. Scores all possible actions for each unit
  2. Executes highest-scoring action for each unit in priority order
  3. Makes build/production decisions for each building
  4. Ends turn

### 9.3 AI Actions

- [ ] AI dispatches the same `GameAction` types as human player — no special actions
- [ ] Movement: pathfind toward high-value targets (unexplored space, resources, enemies)
- [ ] Building: place buildings on the best available resource hexes
- [ ] Production: build military units when enemy is near, scouts when map is unexplored
- [ ] Attack: engage when combat prediction is favorable (expected to win)

### 9.4 AI Visualization

- [ ] During AI turn, show a "AI is thinking..." indicator
- [ ] Play AI unit movements with the same animation as player movements (slower delay — 300ms per step)
- [ ] Flash AI buildings when placed
- [ ] Player can see AI actions in fog-of-war visible areas only

### 9.5 Difficulty Settings

- [ ] Easy: AI gets no bonuses, makes suboptimal decisions (random noise on utility scores)
- [ ] Normal: AI plays optimally with its available information
- [ ] Hard: AI gets +25% resource income bonus
- [ ] Setting stored in game config, applied during AI turn processing and resource collection

---

## Phase 10 — Audio

### 10.1 Audio Setup

- [ ] Install `howler` (`npm install howler`)
- [ ] Create `src/app/core/audio/audio.service.ts`
- [ ] Manage two audio categories: music and SFX, with independent volume controls

### 10.2 Sound Effects

- [ ] Source or create sound effects for:
  - Hex selection click
  - Unit selection confirmation
  - Unit movement (subtle engine hum or whoosh)
  - Button press
  - Turn end chime
  - Building placement
  - Resource collection
  - Combat: weapon fire, hit impact, explosion
  - Discovery event: mysterious chime or ping
  - Error/invalid action: soft buzz
- [ ] Play sounds via `audioService.play('selection')` called from relevant services/components

### 10.3 Music

- [ ] Source or create ambient space music tracks:
  - Exploration theme: calm, atmospheric
  - Combat theme: tenser, faster
- [ ] Implement music state machine: exploration ↔ combat, with crossfade transitions
- [ ] Trigger combat music when attack action is initiated, return to exploration after combat resolves

### 10.4 Settings

- [ ] Create audio settings panel with:
  - Master volume slider
  - Music volume slider
  - SFX volume slider
  - Mute toggle
- [ ] Persist settings in `localStorage`

---

## Phase 11 — Minimap & Quality of Life

### 11.1 Minimap

- [ ] Create `src/app/game/hud/minimap.component.ts`
- [ ] Render on a small `<canvas>` (200×200 or similar)
- [ ] Show all explored chunks at very low resolution (1-2 pixels per hex)
- [ ] Color dots for: player units (green), enemy units (red), player buildings (blue), stellar objects (dim colors)
- [ ] White rectangle showing current viewport bounds
- [ ] Click on minimap → `cameraService.centerOn()` to jump camera to that location
- [ ] Update minimap when explored area or unit positions change

### 11.2 Unit List

- [ ] Create `src/app/game/panels/unit-list.component.ts`
- [ ] Scrollable list of all owned units, grouped by type
- [ ] Each entry: unit type, health bar, hex position
- [ ] Click entry → select unit and center camera on it
- [ ] Highlight units with remaining movement points

### 11.3 Building List

- [ ] Create `src/app/game/panels/building-list.component.ts`
- [ ] List all owned buildings with type, location, per-turn yield
- [ ] Click entry → center camera on building
- [ ] Show total income summary at top

### 11.4 Keyboard Shortcuts

- [ ] M → enter Move mode for selected unit
- [ ] A → enter Attack mode for selected unit
- [ ] B → open Build menu
- [ ] Space → End Turn
- [ ] Tab → cycle through owned units with remaining movement
- [ ] Shift+Tab → cycle backward
- [ ] Home → center camera on starting position / capital
- [ ] Create a keyboard shortcut reference panel accessible via "?" key

### 11.5 Notifications

- [ ] Create `src/app/game/overlays/notification.service.ts`
- [ ] Toast notifications that appear briefly then fade:
  - "Colony under attack at (q, r)!"
  - "Mining Station construction complete"
  - "Anomaly discovered: Ancient Ruins"
  - "Enemy fleet spotted near (q, r)"
- [ ] Clicking a notification centers camera on the relevant location
- [ ] Queue multiple notifications with stagger

### 11.6 Undo (Within Turn)

- [ ] Store state snapshots at the start of each turn and after each action
- [ ] "Undo" button (Ctrl+Z) reverts to the previous snapshot
- [ ] Only available for actions within the current turn — can't undo past "End Turn"
- [ ] Clear undo stack on turn end

### 11.7 Auto-Save

- [ ] Trigger save to `localStorage` every 5 turns and on manual save
- [ ] On app load, check for auto-save and offer "Continue" option on menu
- [ ] Store max 3 auto-save slots, rotating

### 11.8 Performance

- [ ] Profile with Chrome DevTools: ensure 60fps during camera pan
- [ ] If chunk generation causes stutter, move `WorldGeneratorService.generate()` to a Web Worker:
  - Worker receives `{ coord, seed }`, returns serialized chunk data
  - `ChunkManagerService` sends generation requests to worker, receives results via messages
  - Show placeholder (dark hex outlines) for chunks still being generated
- [ ] Ensure fog of war computation doesn't block the main thread
- [ ] Lazy-load game module (menu loads fast, game module loaded on route entry)

---

## Phase 12 — Multiplayer (Optional)

### 12.1 Server Setup

- [ ] Create a Node.js server project (separate repo or `server/` directory)
- [ ] Install `socket.io` or `colyseus`
- [ ] Server holds authoritative `GameState` and runs the same `gameReducer`
- [ ] Server validates all incoming actions before applying

### 12.2 Networking Service

- [ ] Create `src/app/core/network/network.service.ts`
- [ ] Connect to server via WebSocket
- [ ] Method: `sendAction(action: GameAction)` — sends action to server
- [ ] Receive state updates from server → replace local `_gameState` signal
- [ ] Handle connection, disconnection, reconnection

### 12.3 Lobby

- [ ] Create `/lobby` route with `LobbyComponent`
- [ ] Create game: set name, max players, seed, game settings
- [ ] Join game: list available games, click to join
- [ ] Lobby chat
- [ ] Ready up → game starts when all players ready

### 12.4 Turn Synchronization

- [ ] Server enforces turn order: only accepts actions from the current player
- [ ] Other players see "Waiting for [PlayerName]..." during opponent's turn
- [ ] Optional: add a turn timer (configurable)

### 12.5 Fog of War (Server-Enforced)

- [ ] Server only sends each client hex data and enemy unit positions they're allowed to see
- [ ] Client renders fog based on what the server has revealed
- [ ] Prevents cheating via client modification

### 12.6 Reconnection

- [ ] On disconnect, server keeps player slot open for N minutes
- [ ] On reconnect: server sends full current state to the reconnecting client
- [ ] Other players see "Player disconnected" / "Player reconnected" messages

### 12.7 Simultaneous Turns (Optional Variant)

- [ ] All players submit orders during the same phase
- [ ] Server collects all orders, resolves simultaneously (movement, then combat)
- [ ] Broadcast results to all players
- [ ] Faster gameplay, but more complex conflict resolution

---

## Notes

- Check off tasks as completed: change `- [ ]` to `- [x]`
- Each phase should pass manual smoke testing before moving to the next
- Commit after completing each numbered subsection (e.g., 2.3, 5.5) for clean git history
- Write unit tests for: hex math, reducer, pathfinding, combat resolver, world generator determinism
- Integration tests for: save/load round-trip, turn cycling, chunk generation consistency
