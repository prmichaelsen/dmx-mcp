# Milestone 5: Playback & Live Control

**Goal**: Implement the cue sequencer for show playback and convenience tools for live control
**Duration**: ~1 week
**Dependencies**: M4 - Cue Management & Fade Engine
**Status**: Not Started

---

## Overview

This milestone brings the show to life. The CueSequencer orchestrates playback of cue lists — advancing through cues, triggering fades, and managing hold times. Alongside the sequencer, this milestone adds convenience tools for direct live control: setting a fixture's color or dimmer without defining a scene, reading current DMX state from OLA, and triggering a full blackout. These tools enable both pre-programmed shows and real-time interactive control.

---

## Deliverables

### 1. Cue Sequencer
- Execute cue lists sequentially (go_cue advances to next)
- Jump to specific cue (go_to_cue)
- Stop playback
- Manage fade-in, hold, fade-out timing per cue

### 2. Live Control Tools
- Blackout (all channels to 0)
- Direct fixture color setting (bypass scene system)
- Direct fixture dimmer setting

### 3. DMX State Reading
- Read current DMX output from OLA for any universe

### 4. MCP Tools (6 tools)
- `go_cue` — Execute next cue in a cue list
- `go_to_cue` — Jump to a specific cue
- `stop` — Stop playback
- `blackout` — Set all channels to 0
- `set_fixture_color` — Directly set a fixture's color
- `set_fixture_dimmer` — Directly set a fixture's intensity
- `get_dmx_state` — Read current DMX output from OLA

---

## Success Criteria

- [ ] go_cue advances through cue list with correct fades
- [ ] go_to_cue jumps to specific cue and executes fade
- [ ] stop halts active playback
- [ ] blackout sends all-zero to all active universes
- [ ] set_fixture_color sets correct RGB channels via OLA
- [ ] set_fixture_dimmer sets correct dimmer channel via OLA
- [ ] get_dmx_state returns current channel values from OLA
- [ ] All unit tests pass

---

## Key Files to Create

```
src/
├── playback/
│   ├── sequencer.ts         # CueSequencer class
│   ├── live-control.ts      # Blackout, direct fixture control
│   └── tools.ts             # MCP tool definitions
tests/
└── playback/
    ├── sequencer.test.ts
    └── live-control.test.ts
```

---

## Tasks

24. [Task 24: Implement Cue Sequencer](../tasks/milestone-5-playback-live-control/task-24-cue-sequencer.md) - go_cue, go_to_cue, stop
25. [Task 25: Implement Blackout Tool](../tasks/milestone-5-playback-live-control/task-25-blackout-tool.md) - All channels to zero
26. [Task 26: Implement set_fixture_color Tool](../tasks/milestone-5-playback-live-control/task-26-set-fixture-color-tool.md) - Direct color control
27. [Task 27: Implement set_fixture_dimmer Tool](../tasks/milestone-5-playback-live-control/task-27-set-fixture-dimmer-tool.md) - Direct dimmer control
28. [Task 28: Implement get_dmx_state Tool](../tasks/milestone-5-playback-live-control/task-28-get-dmx-state-tool.md) - Read DMX from OLA
29. [Task 29: Register Playback MCP Tools and Tests](../tasks/milestone-5-playback-live-control/task-29-register-playback-tools-tests.md) - Wire tools, add tests

---

## Testing Requirements

- [ ] Sequencer advances cues in correct order
- [ ] Sequencer respects hold times between cues
- [ ] Stop cancels active fade and holds current state
- [ ] Blackout sends zeros to all active universes
- [ ] Direct fixture control maps to correct DMX channels
- [ ] get_dmx_state returns valid channel array

---

## Risks and Mitigation

| Risk | Impact | Probability | Mitigation Strategy |
|------|--------|-------------|---------------------|
| Concurrent playback conflicts | High | Medium | Only allow one active cue list at a time, or implement priority system |
| Stop not cancelling fade cleanly | Medium | Medium | Use AbortController pattern for cancellable fades |

---

**Next Milestone**: [Milestone 6: Show Management & Effects](milestone-6-show-management-effects.md)
**Blockers**: M4 must be complete (sequencer uses fade engine and cue lists)
**Notes**: This milestone makes the system usable for live shows. Consider testing with actual hardware after implementation.
