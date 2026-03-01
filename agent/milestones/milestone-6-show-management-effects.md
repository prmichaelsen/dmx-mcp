# Milestone 6: Show Management & Effects

**Goal**: Implement show persistence (save/load), dynamic effects engine, and end-to-end testing
**Duration**: ~1 week
**Dependencies**: M5 - Playback & Live Control
**Status**: Not Started

---

## Overview

This final milestone completes the dmx-mcp server with two remaining feature areas: show management (persisting entire shows as JSON files to disk) and the effects engine (dynamic patterns like chase, rainbow, and strobe). It also includes end-to-end integration tests that exercise the full pipeline from MCP tool call through to DMX output. After this milestone, the server is feature-complete per the design document.

---

## Deliverables

### 1. Show Storage
- Save complete shows to ~/.dmx-lighting-mcp/shows/ as JSON
- Load shows from disk
- List saved shows
- Config file support (~/.dmx-lighting-mcp/config.yaml)

### 2. Effects Engine
- Base effect loop with fixture targeting
- Chase effect (sequential fixture activation)
- Rainbow effect (color cycling across fixtures)
- Strobe effect (rapid on/off)
- Start and stop effects independently

### 3. MCP Tools (6 tools)
- `save_show` — Persist show to disk
- `load_show` — Load a show from disk
- `list_shows` — List saved shows
- `apply_effect` — Apply a dynamic effect to fixtures
- `stop_effect` — Stop a running effect

### 4. End-to-End Tests
- Full pipeline: patch fixtures, create scene, build cue list, run show
- Verify DMX output via get_dmx_state
- Show save/load round-trip

---

## Success Criteria

- [ ] Can save a complete show (fixtures, scenes, cue lists) to JSON
- [ ] Can load a saved show and restore all state
- [ ] Can list saved shows from disk
- [ ] Chase effect activates fixtures sequentially
- [ ] Rainbow effect cycles colors across fixtures
- [ ] Strobe effect toggles fixtures at configurable speed
- [ ] Effects can be stopped independently
- [ ] End-to-end test passes: patch → scene → cue → play → verify DMX
- [ ] All unit and integration tests pass

---

## Key Files to Create

```
src/
├── shows/
│   ├── storage.ts           # ShowStorage class (JSON persistence)
│   └── tools.ts             # MCP tool definitions
├── effects/
│   ├── engine.ts            # EffectEngine base class
│   ├── chase.ts             # Chase effect
│   ├── rainbow.ts           # Rainbow effect
│   ├── strobe.ts            # Strobe effect
│   └── tools.ts             # MCP tool definitions
tests/
├── shows/
│   └── storage.test.ts
├── effects/
│   ├── engine.test.ts
│   └── effects.test.ts
└── e2e/
    └── full-pipeline.test.ts
```

---

## Tasks

30. [Task 30: Implement Show Storage](../tasks/milestone-6-show-management-effects/task-30-show-storage.md) - JSON persistence to disk
31. [Task 31: Implement Show Management Tools](../tasks/milestone-6-show-management-effects/task-31-show-management-tools.md) - save_show, load_show, list_shows
32. [Task 32: Implement Effect Engine Base](../tasks/milestone-6-show-management-effects/task-32-effect-engine-base.md) - Effect loop, fixture targeting
33. [Task 33: Implement Chase, Rainbow, Strobe Effects](../tasks/milestone-6-show-management-effects/task-33-chase-rainbow-strobe-effects.md) - Three built-in effects
34. [Task 34: Register Show and Effect MCP Tools](../tasks/milestone-6-show-management-effects/task-34-register-show-effect-mcp-tools.md) - Wire all tools to server
35. [Task 35: End-to-End Integration Tests](../tasks/milestone-6-show-management-effects/task-35-end-to-end-tests.md) - Full pipeline testing

---

## Testing Requirements

- [ ] Show serialization/deserialization round-trips correctly
- [ ] Show file written to correct path with valid JSON
- [ ] Effects produce expected DMX output patterns
- [ ] Effects are cancellable without leaving stale state
- [ ] E2E test covers patch → scene → cue → play → verify

---

## Risks and Mitigation

| Risk | Impact | Probability | Mitigation Strategy |
|------|--------|-------------|---------------------|
| File system permissions for show storage | Medium | Low | Use user home directory, handle permission errors gracefully |
| Effect timing jitter | Low | Medium | Effects are visual — small timing variations are acceptable |
| Large show files | Low | Low | JSON is efficient for this data volume; optimize only if needed |

---

**Next Milestone**: None (feature-complete per design)
**Blockers**: M5 must be complete
**Notes**: After this milestone, consider future enhancements from design doc: fixture profile import, music sync, multi-universe, web dashboard.
