# Milestone 3: Scene Programming

**Goal**: Implement scene creation, management, and live DMX preview via MCP tools
**Duration**: ~1 week
**Dependencies**: M2 - Fixture Management
**Status**: Not Started

---

## Overview

Scenes are snapshots of fixture states — the colors, intensities, and positions that define a "look" for the lighting rig. This milestone implements the SceneManager for CRUD operations on scenes, the logic to translate scene fixture states into raw DMX channel values, and the preview_scene tool that outputs a scene to DMX in real-time through OLA. This is the first milestone where lights actually respond to agent commands.

---

## Deliverables

### 1. Scene Manager
- Create, update, delete, list scenes
- Scene stores Map of fixture ID to channel values
- Validation against patched fixtures

### 2. Scene-to-DMX Mapping
- Convert fixture channel values to absolute DMX channel numbers
- Handle multi-channel fixtures spanning addresses
- Merge multiple fixture states into universe channel arrays

### 3. MCP Tools (5 tools)
- `create_scene` — Create a new scene with fixture states
- `update_scene` — Modify fixture values in a scene
- `delete_scene` — Remove a scene
- `list_scenes` — List all scenes
- `preview_scene` — Output scene to DMX (live preview)

### 4. Unit Tests
- Scene CRUD operations
- DMX channel mapping correctness
- Fixture state validation

---

## Success Criteria

- [ ] Can create a scene with fixture states via MCP tool
- [ ] Can update individual fixture values in a scene
- [ ] Can delete scenes and list all scenes
- [ ] preview_scene sends correct DMX values through OLA
- [ ] Scene validates fixture IDs against patched fixtures
- [ ] All unit tests pass

---

## Key Files to Create

```
src/
├── scenes/
│   ├── manager.ts           # SceneManager class
│   ├── dmx-mapper.ts        # Scene-to-DMX channel mapping
│   └── tools.ts             # MCP tool definitions
tests/
└── scenes/
    ├── manager.test.ts
    └── dmx-mapper.test.ts
```

---

## Tasks

13. [Task 13: Implement Scene Manager](../tasks/milestone-3-scene-programming/task-13-scene-manager.md) - CRUD operations for scenes
14. [Task 14: Implement Scene-to-DMX Channel Mapping](../tasks/milestone-3-scene-programming/task-14-scene-dmx-mapping.md) - Translate fixture states to DMX values
15. [Task 15: Implement preview_scene Tool](../tasks/milestone-3-scene-programming/task-15-preview-scene-tool.md) - Live DMX output through OLA
16. [Task 16: Register Scene MCP Tools](../tasks/milestone-3-scene-programming/task-16-register-scene-mcp-tools.md) - Wire all 5 tools to server
17. [Task 17: Add Scene Programming Tests](../tasks/milestone-3-scene-programming/task-17-scene-programming-tests.md) - Unit tests

---

## Testing Requirements

- [ ] Scene creation stores fixture states correctly
- [ ] DMX mapping produces correct channel values for various fixture types
- [ ] Preview sends values to correct universe via OLA client
- [ ] Invalid fixture references are rejected
- [ ] Scene update merges values correctly

---

## Risks and Mitigation

| Risk | Impact | Probability | Mitigation Strategy |
|------|--------|-------------|---------------------|
| DMX channel mapping errors | High | Medium | Exhaustive tests with known fixtures and expected outputs |
| OLA not available for preview testing | Medium | Medium | Mock OLA client in tests; manual verification with real hardware |

---

**Next Milestone**: [Milestone 4: Cue Management & Fade Engine](milestone-4-cue-management-fade-engine.md)
**Blockers**: M2 must be complete (scenes reference fixtures)
**Notes**: preview_scene is the first tool that writes to real DMX hardware. Requires OLA running for manual testing.
