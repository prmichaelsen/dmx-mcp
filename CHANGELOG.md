# Changelog

All notable changes to this project will be documented in this file.

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
