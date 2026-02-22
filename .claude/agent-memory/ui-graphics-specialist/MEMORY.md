# UI/Graphics Specialist Memory

## Renderer Architecture
- `HexCanvasRendererService` at `/src/app/game/renderer/hex-canvas-renderer.service.ts`
- Chunk textures: per-chunk `OffscreenCanvas` cached via `chunk.texture`; `chunk.dirty` flag triggers re-render
- `renderChunkTexture()` sets grid stroke style (`rgba(42, 74, 90, 0.35)`, lineWidth 1) once before hex loop
- Must use `ctx.save()/ctx.restore()` when changing stroke/fill inside the hex loop to preserve grid line state
- `drawHex()` calls both `fill()` and `stroke()` (hex background + grid outline)
- `FILL_COLORS` maps `StellarObjectType` to hex fill colors
- `CELESTIAL_CIRCLE` defines stroked circle configs for star/planet/moon (rendered over space or nebula background)
- `ASTEROID_DEBRIS` config for debris patterns; `drawAsteroidDebris()` uses clip + seeded RNG for deterministic scattered squares
- Asteroid debris uses seed `0xA57E201D` with `hashCoord()` for per-hex deterministic RNG

## Color Palette
- Star: `#f0c040` (gold/yellow)
- Planet: `#4080d0` (blue)
- Moon: `#a0a0b0` (silver-gray)
- Asteroid/Asteroid field: space background + icy/rocky debris pattern (whites and grays)
  - `asteroid` debris: dark steel grays (`#3e3e44` to `#787880`), alpha 0.35-0.65, 4-8 pieces
  - `asteroid_field` debris: bright silvers/whites (`#8a8a92` to `#e8e8f0`), alpha 0.45-0.85, 10-20 pieces
- Comet: space/nebula background + icy-blue head circle (`#d0f0ff`) + gradient tail
  - Head: `#d0f0ff` fill, `#80d8e8` stroke, radiusRatio 0.14
  - Glow: radial gradient `rgba(200, 240, 255, 0.45)` to transparent, radiusRatio 0.25
  - Tail: tapered gradient `rgba(180, 230, 255, 0.55)` → transparent, length 0.65 hexSize
  - Direction derived from `StellarObject.velocity` (hex coords → pixel angle via flat-top math)
  - Clips to hex boundary; stationary comets default tail pointing left
- Nebula: `rgba(106, 13, 173, 0.35)` (purple, semi-transparent)
- Black hole: space/nebula background + layered rendering via `drawBlackHole()`
  - Outer glow: radial gradient, warm reddish-purple (`rgba(160,40,60,0.50)` → transparent), radius 0.7 hexSize
  - Accretion disk: stroked ring at radius 0.38 hexSize, lineWidth 0.14 hexSize, orange-red radial gradient
  - Event horizon: filled dark circle radius 0.22 hexSize, near-black radial gradient, subtle dark stroke
  - Clips to hex boundary like comet/asteroid
- Empty/space: `rgba(13, 17, 23, 0.35)`
- Selection: `#00e5ff` (cyan), Hover: `rgba(255, 255, 255, 0.1)`
- Influence: green (`#22c55e` / `rgba(34, 197, 94, ...)`), Attack range: red (`rgba(239, 68, 68, ...)`)
- Health bars: green > 50%, yellow > 25%, red below
- Shield bars: `#3b82f6` (blue)
- Bar background: `#1a1a2e`

## HexData Model & Nebula Layering
- `HexData` has `object: StellarObject | null` (single type) + optional `inNebula?: boolean`
- `inNebula` is computed during chunk generation from nebula noise, independent of object type
- Nebula noise threshold: `NEBULA_NOISE_THRESHOLD = 0.68` (constant in world-generator.service.ts)
- Generation priority: star > planet/moon > nebula > asteroid > comet > black_hole > empty
- In practice, only stars/planets/moons can coexist with `inNebula: true` (nebula check precedes asteroid)
- Renderer uses `hex.inNebula` to choose `FILL_COLORS.nebula` vs `FILL_COLORS.empty` as background for celestial/asteroid/comet/black_hole hexes

## Hex Grid
- Flat-top hexes; `HEX_VERTICES` pre-computed cos/sin at 60-degree intervals
- Grid outline: `rgba(42, 74, 90, 0.35)`, lineWidth 1

## Sprite System
- `SpriteAtlasService` at `/src/app/core/sprites/sprite-atlas.service.ts`
- `drawUnit()` and `drawBuilding()` return boolean (true if sprite drawn, false = fallback to geometric shapes)

## Test Suite
- 321 tests across 19 files (as of 2026-02-22)
- No renderer-specific tests exist
