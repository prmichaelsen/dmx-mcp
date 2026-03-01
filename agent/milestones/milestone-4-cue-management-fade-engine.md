# Milestone 4: Cue Management & Fade Engine

**Goal**: Implement cue lists, the fade engine for timed transitions, and cue management MCP tools
**Duration**: ~1.5 weeks
**Dependencies**: M3 - Scene Programming
**Status**: Not Started

---

## Overview

Cues are timed transitions between scenes — the building blocks of a lighting show. This milestone implements cue lists (ordered sequences of cues), the FadeEngine that interpolates DMX values over time to create smooth transitions, and the MCP tools for creating and managing cue sequences. The fade engine is the most timing-critical component in the system, running at ~40fps to push interpolated DMX values through OLA.

---

## Deliverables

### 1. Cue Data Management
- CueList and Cue model implementations
- CRUD operations for cue lists
- Add, remove, reorder cues within lists

### 2. Fade Engine
- Linear interpolation between DMX channel values
- Configurable fade duration (milliseconds)
- ~40fps refresh rate for smooth fades
- Async execution (non-blocking)

### 3. MCP Tools (4 tools)
- `create_cue_list` — Create a new cue sequence
- `add_cue` — Add a cue to a cue list
- `remove_cue` — Remove a cue from a list
- `reorder_cues` — Change cue order

### 4. Unit Tests
- Fade interpolation math
- Cue list ordering logic
- Cue CRUD operations

---

## Success Criteria

- [ ] Can create cue lists and add cues via MCP tools
- [ ] Can remove and reorder cues in a list
- [ ] Fade engine interpolates correctly between two channel states
- [ ] Fade engine respects duration timing (within ~25ms tolerance)
- [ ] Fade engine runs at target refresh rate
- [ ] All unit tests pass

---

## Key Files to Create

```
src/
├── cues/
│   ├── manager.ts           # CueList/Cue CRUD operations
│   ├── fade-engine.ts       # FadeEngine with interpolation
│   └── tools.ts             # MCP tool definitions
tests/
└── cues/
    ├── manager.test.ts
    └── fade-engine.test.ts
```

---

## Tasks

18. [Task 18: Implement CueList and Cue Data Management](../tasks/milestone-4-cue-management-fade-engine/task-18-cue-data-management.md) - CRUD for cue lists
19. [Task 19: Implement Fade Engine](../tasks/milestone-4-cue-management-fade-engine/task-19-fade-engine.md) - Linear interpolation at 40fps
20. [Task 20: Implement Cue Management Tools](../tasks/milestone-4-cue-management-fade-engine/task-20-cue-management-tools.md) - create_cue_list, add_cue, remove_cue
21. [Task 21: Implement reorder_cues Tool](../tasks/milestone-4-cue-management-fade-engine/task-21-reorder-cues-tool.md) - Reorder cues in a list
22. [Task 22: Register Cue MCP Tools](../tasks/milestone-4-cue-management-fade-engine/task-22-register-cue-mcp-tools.md) - Wire all 4 tools to server
23. [Task 23: Add Cue and Fade Engine Tests](../tasks/milestone-4-cue-management-fade-engine/task-23-cue-fade-engine-tests.md) - Unit tests

---

## Testing Requirements

- [ ] Fade interpolation math is correct for edge cases (0%, 50%, 100%)
- [ ] Fade from 0→255 over 1000ms produces correct intermediate values
- [ ] Cue list maintains correct ordering after add/remove/reorder
- [ ] Fade engine handles single-step fades (0ms duration)
- [ ] Cue references valid scenes

---

## Risks and Mitigation

| Risk | Impact | Probability | Mitigation Strategy |
|------|--------|-------------|---------------------|
| Timer drift in fade engine | Medium | Medium | Use monotonic clock, measure actual elapsed time per step |
| Blocking async during fades | High | Low | Ensure fade engine is fully async and cancellable |

---

**Next Milestone**: [Milestone 5: Playback & Live Control](milestone-5-playback-live-control.md)
**Blockers**: M3 must be complete (cues reference scenes)
**Notes**: The fade engine is the most performance-sensitive component. Consider profiling under load.
