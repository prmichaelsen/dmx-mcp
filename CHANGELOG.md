# Changelog

All notable changes to this project will be documented in this file.

## [0.7.0] - 2026-03-01

### Added
- `DMXEmulatorServer` — OLA-compatible HTTP server for hardware-free DMX development and testing
- Browser-based DMX Monitor UI with real-time channel visualization via SSE, universe selector, dark theme
- Emulator integration tests (9 tests): round-trip, frame recording, multi-universe, reset, setFixtureColor/blackout through HTTP
- Standalone emulator entry point (`src/emulator/main.ts`) with SIGINT handling
- npm scripts: `emulator` (start emulator), `dev:emulator` (start with hot-reload)
- Updated `.env.example` with emulator usage instructions
- 209 tests passing across 11 test files

## [0.6.0] - 2026-03-01

### Added
- `ShowStorage` class for JSON-based show persistence (save, load, list, delete)
- Show management tools: `save_show`, `load_show`, `list_shows` with full state round-trip
- `EffectEngine` class with strategy pattern, fire-and-forget async loops at ~40fps
- Chase, rainbow, and strobe effect calculators with configurable parameters
- Effect tools: `apply_effect`, `stop_effect` for dynamic lighting effects
- End-to-end integration tests (5 tests): full show workflow, save/load round-trip, live control, effect lifecycle, simultaneous effects
- 28 total MCP tools registered
- 200 tests passing across 10 test files

## [0.5.0] - 2026-03-01

### Added
- `CueSequencer` class with fire-and-forget playback, auto-advance, looping, and AbortController cancellation
- `setFixtureDimmer` function with absolute (0-255) and percent (0.0-1.0) modes, clamping, and RGB-only fixture hints
- `getDMXState` function for reading DMX state from OLA with optional fixture channel labeling
- `formatDMXStateResult` for human-readable DMX state output
- 5 new playback MCP tools: `set_fixture_dimmer`, `get_dmx_state`, `go_cue`, `go_to_cue`, `stop_playback`
- Sequencer unit tests (15 tests): start, goCue, goToCue, stop, getState, looping
- Live control unit tests (20 tests): dimmer control, DMX state, formatting

## [0.4.0] - 2026-03-01

### Added
- `CueManager` class with cue list CRUD and cue operations (add, remove, reorder)
- Scene reference validation for cues (ensures referenced scenes exist)
- Cue timing validation (non-negative, finite values for fadeIn, hold, fadeOut)
- `FadeEngine` with linear interpolation at ~40fps, AbortSignal cancellation support
- 6 cue MCP tools: `create_cue_list`, `add_cue`, `remove_cue`, `reorder_cues`, `list_cue_lists`, `delete_cue_list`
- CueManager unit tests (33 tests): CRUD, validation, reordering
- FadeEngine unit tests (17 tests): interpolation, instant snap, cancellation, channel arrays

## [0.3.0] - 2026-03-01

### Added
- `SceneManager` class with full CRUD operations for scenes (create, update, delete, get, list)
- Scene fixture state validation against patched fixtures
- Channel value range validation (0-255 integers)
- Scene-to-DMX channel mapping (`sceneToDMX`) for converting scenes to raw DMX arrays
- `preview_scene` MCP tool for live DMX output through OLA
- 5 scene MCP tools: `create_scene`, `update_scene`, `delete_scene`, `list_scenes`, `preview_scene`
- Scene manager unit tests (23 tests): CRUD, validation, fixture state merging
- DMX mapper unit tests (11 tests): channel mapping, multi-fixture, multi-universe, defaults, edge cases

## [0.2.0] - 2026-03-01

### Added
- `create_fixture_profile` MCP tool for defining custom fixture profiles
- `isValidChannelType()` utility for channel type validation
- `start` script (`node dist/index.js`) for running production build
- Fixture profile unit tests (42 tests): validation, channel utilities, built-in profiles, registry
- Fixture manager unit tests (22 tests): patching, collision detection, unpatching, listing
- `dev` script now uses `tsx watch` for hot-reloading

## [0.1.0] - 2026-03-01

### Added
- MCP server with stdio transport for DMX lighting control via OLA
- Core TypeScript interfaces: Fixture, FixtureProfile, Scene, Cue, CueList, Show
- OLA REST client with setDMX/getDMX and custom error types
- ProfileRegistry with 3 built-in profiles: Generic Dimmer, Generic RGB Par, Generic RGBW Par
- FixtureManager with address collision detection
- 6 MCP tools: patch_fixture, unpatch_fixture, list_fixtures, list_fixture_profiles, set_fixture_color, blackout
- OLA client unit tests (12 tests)
- ESM build via esbuild
