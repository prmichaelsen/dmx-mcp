# Changelog

All notable changes to this project will be documented in this file.

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
