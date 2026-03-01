# DMX Lighting MCP Server

**Concept**: MCP server that enables AI agents to program and control DMX lighting shows via OLA's REST API
**Created**: 2026-03-01
**Status**: Proposal

---

## Overview

An MCP server that provides AI agents with tools to design, program, and trigger DMX lighting shows. Instead of manually using lighting control software GUIs, an agent can create fixture profiles, define scenes with color/intensity/position values, build cue lists with timing, and execute shows — all through MCP tool calls.

The server acts as a high-level show programming layer on top of Open Lighting Architecture (OLA), which handles the actual DMX transport to hardware (Art-Net, sACN, USB dongles).

---

## Problem Statement

- **Lighting programming is manual and GUI-bound**: Tools like Lightkey, QLC+, and professional consoles require hands-on interaction to set up fixtures, create scenes, and build cue sequences
- **No agent-friendly interface exists**: Current lighting software either has no API (Lightkey), trigger-only APIs (OSC), or raw channel-level APIs (OLA) with no show abstractions
- **Barrier to entry**: Programming a lighting show requires understanding DMX addressing, fixture modes, channel layouts — knowledge that an agent could handle given proper abstractions
- **Iteration is slow**: Tweaking a show means navigating GUIs repeatedly; an agent could iterate programmatically in seconds

---

## Solution

Build an MCP server that sits between an AI agent and OLA, providing high-level lighting abstractions as MCP tools:

```
Agent (Claude)  →  MCP Server (show logic)  →  OLA REST API (:9090)  →  DMX hardware
```

### Key Abstractions

1. **Fixtures** — Named lighting instruments with typed channels (dimmer, RGB, pan/tilt, etc.)
2. **Scenes** — Snapshots of fixture states (colors, intensities, positions)
3. **Cues** — Timed transitions between scenes with fade times
4. **Cue Lists** — Ordered sequences of cues forming a show
5. **Effects** — Dynamic patterns (chase, rainbow, strobe) applied to fixtures

### Why OLA as the backend

- Open source, well-maintained, runs on Linux/Mac/Raspberry Pi
- REST API on localhost:9090 (`POST /set_dmx`, `GET /get_dmx`)
- Supports all major DMX transports: Art-Net, sACN, ESP-Net, USB dongles
- Handles the hard part (protocol translation, timing, hardware abstraction)

---

## Implementation

### Architecture

```
┌─────────────────────────────────────────────────────────┐
│  AI Agent (Claude)                                      │
│  "Create a warm amber wash on fixtures 1-4, then fade   │
│   to deep blue over 3 seconds"                          │
└──────────────────────┬──────────────────────────────────┘
                       │ MCP Protocol (stdio/SSE)
┌──────────────────────▼──────────────────────────────────┐
│  MCP Server: dmx-lighting-mcp                           │
│                                                         │
│  ┌─────────────┐  ┌─────────────┐  ┌────────────────┐  │
│  │  Fixture     │  │  Scene      │  │  Cue Engine    │  │
│  │  Manager     │  │  Manager    │  │  (sequencer)   │  │
│  └─────────────┘  └─────────────┘  └────────────────┘  │
│  ┌─────────────┐  ┌─────────────┐  ┌────────────────┐  │
│  │  Effect      │  │  Show       │  │  DMX Output    │  │
│  │  Engine      │  │  Storage    │  │  (OLA client)  │  │
│  └─────────────┘  └─────────────┘  └────────────────┘  │
└──────────────────────┬──────────────────────────────────┘
                       │ HTTP REST (localhost:9090)
┌──────────────────────▼──────────────────────────────────┐
│  OLA (Open Lighting Architecture)                       │
│  DMX universes → Art-Net / sACN / USB                   │
└──────────────────────┬──────────────────────────────────┘
                       │ DMX512
              ┌────────▼────────┐
              │  Lighting Rig   │
              │  (fixtures)     │
              └─────────────────┘
```

### Core Data Models

```typescript
interface Fixture {
  id: string;                    // e.g. "par-1"
  name: string;                  // e.g. "Front Wash Left"
  profile: FixtureProfile;       // channel layout
  universe: number;              // DMX universe (1-based)
  startAddress: number;          // DMX start address (1-512)
}

interface FixtureProfile {
  manufacturer: string;
  model: string;
  channels: ChannelDefinition[];
  modes: FixtureMode[];          // e.g. 3-channel RGB, 7-channel extended
}

interface ChannelDefinition {
  name: string;                  // e.g. "red", "dimmer", "pan"
  type: ChannelType;             // dimmer | color | position | control | speed
  defaultValue: number;          // 0-255
  min: number;
  max: number;
}

type ChannelType =
  | "dimmer"
  | "red" | "green" | "blue" | "white" | "amber" | "uv"
  | "pan" | "tilt" | "pan_fine" | "tilt_fine"
  | "gobo" | "strobe" | "speed" | "macro" | "control";

interface Scene {
  id: string;
  name: string;
  fixtureStates: Map<string, ChannelValues>;  // fixture ID → channel values
}

interface Cue {
  id: string;
  name: string;
  scene: string;                 // scene ID
  fadeInMs: number;              // fade time in milliseconds
  holdMs: number;                // hold time before next cue
  fadeOutMs: number;
}

interface CueList {
  id: string;
  name: string;
  cues: Cue[];
  loop: boolean;
}

interface Show {
  id: string;
  name: string;
  fixtures: Fixture[];
  scenes: Scene[];
  cueLists: CueList[];
}
```

### MCP Tools

#### Fixture Management
| Tool | Description |
|---|---|
| `patch_fixture` | Add a fixture to a universe at a DMX address |
| `unpatch_fixture` | Remove a fixture |
| `list_fixtures` | List all patched fixtures |
| `list_fixture_profiles` | Browse available fixture profiles |
| `create_fixture_profile` | Define a custom fixture profile |

#### Scene Programming
| Tool | Description |
|---|---|
| `create_scene` | Create a new scene with fixture states |
| `update_scene` | Modify fixture values in a scene |
| `delete_scene` | Remove a scene |
| `list_scenes` | List all scenes |
| `preview_scene` | Output a scene to DMX (live preview) |

#### Cue Management
| Tool | Description |
|---|---|
| `create_cue_list` | Create a new cue sequence |
| `add_cue` | Add a cue to a cue list |
| `remove_cue` | Remove a cue from a list |
| `reorder_cues` | Change cue order |

#### Playback / Live Control
| Tool | Description |
|---|---|
| `go_cue` | Execute next cue in a cue list |
| `go_to_cue` | Jump to a specific cue |
| `stop` | Stop playback |
| `blackout` | Set all channels to 0 |
| `set_fixture_color` | Directly set a fixture's color (convenience) |
| `set_fixture_dimmer` | Directly set a fixture's intensity |

#### Show Management
| Tool | Description |
|---|---|
| `save_show` | Persist show to disk (JSON) |
| `load_show` | Load a show from disk |
| `list_shows` | List saved shows |
| `get_dmx_state` | Read current DMX output from OLA |

#### Effects
| Tool | Description |
|---|---|
| `apply_effect` | Apply a dynamic effect (chase, rainbow, strobe) to fixtures |
| `stop_effect` | Stop a running effect |

### OLA Integration

The DMX output module translates scenes to raw channel values and pushes them to OLA:

```typescript
class OLAClient {
  private baseUrl = "http://localhost:9090";

  async setDMX(universe: number, channels: number[]): Promise<void> {
    await fetch(`${this.baseUrl}/set_dmx`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: `u=${universe}&d=${channels.join(",")}`,
    });
  }

  async getDMX(universe: number): Promise<number[]> {
    const res = await fetch(`${this.baseUrl}/get_dmx?u=${universe}`);
    const data = await res.json();
    return data.dmx;
  }
}
```

### Fade Engine

Cue transitions require interpolating DMX values over time:

```typescript
class FadeEngine {
  async executeFade(
    from: Map<number, number>,   // channel → value
    to: Map<number, number>,
    durationMs: number,
    universe: number,
    ola: OLAClient
  ): Promise<void> {
    const fps = 40;  // DMX refresh rate
    const steps = Math.max(1, Math.floor(durationMs / (1000 / fps)));

    for (let step = 0; step <= steps; step++) {
      const progress = step / steps;
      const interpolated = this.interpolate(from, to, progress);
      await ola.setDMX(universe, interpolated);
      await sleep(1000 / fps);
    }
  }

  private interpolate(
    from: Map<number, number>,
    to: Map<number, number>,
    progress: number
  ): number[] {
    const channels = new Array(512).fill(0);
    for (const [ch, toVal] of to) {
      const fromVal = from.get(ch) ?? 0;
      channels[ch] = Math.round(fromVal + (toVal - fromVal) * progress);
    }
    return channels;
  }
}
```

### Show Storage

Shows are persisted as JSON files:

```
~/.dmx-lighting-mcp/
├── shows/
│   ├── sunday-service.json
│   ├── concert-2026-03.json
│   └── test-rig.json
├── profiles/
│   ├── generic-rgb-par.json
│   └── custom-moving-head.json
└── config.yaml          # OLA connection, default universe
```

---

## Benefits

- **Agent-programmable**: Full show creation through natural language → MCP tools
- **No GUI required**: Entire workflow is API-driven
- **Fast iteration**: Agent can create, preview, tweak, and save scenes in seconds
- **Portable shows**: JSON show files are version-controllable and shareable
- **Hardware agnostic**: OLA handles any DMX transport (Art-Net, sACN, USB)
- **Live + programmed**: Supports both real-time control and pre-programmed cue sequences

---

## Trade-offs

- **OLA dependency**: Requires OLA installed and running; adds infrastructure complexity
- **No visual feedback to agent**: Agent can't "see" the lights — relies on DMX state readback and user feedback
- **Latency**: HTTP REST to OLA adds ~1-5ms per call; fine for show programming, may matter for tight real-time effects
- **Fixture profiles**: Need to build/import fixture profiles; could leverage QLC+ or OLA's existing libraries
- **DMX knowledge still needed**: Someone needs to know the physical rig's DMX addressing to patch fixtures correctly

---

## Dependencies

- **OLA** (Open Lighting Architecture) — DMX transport layer, REST API on :9090
- **DMX hardware** — Art-Net node, sACN gateway, or USB DMX dongle (e.g., Enttec Open DMX)
- **Node.js / TypeScript** — MCP server runtime
- **MCP SDK** (`@modelcontextprotocol/sdk`) — MCP server framework

---

## Testing Strategy

- **Unit tests**: Fixture patching, scene creation, channel calculation, fade interpolation
- **Integration tests**: OLA REST API communication (mock OLA or use OLA in test mode)
- **End-to-end**: Patch fixtures → create scene → create cue list → run show → verify DMX output via `GET /get_dmx`
- **Visual testing**: Manual verification with actual lights (or OLA's built-in DMX monitor)

---

## Migration Path

N/A — New project, no existing system to migrate from.

---

## Future Considerations

- **Fixture profile import**: Import from QLC+ fixture library (XML) or OLA's profile database
- **Music sync**: BPM detection and beat-synced effects
- **Multi-universe support**: Shows spanning multiple DMX universes
- **Artnet discovery**: Auto-detect Art-Net nodes on the network
- **Web dashboard**: Visual DMX monitor alongside the MCP tools
- **Lightkey bridge**: Optional OSC output to trigger Lightkey cues in addition to direct DMX
- **Scene suggestions**: Agent could suggest lighting based on mood, music genre, or event type
- **GDTF/MVR support**: Import fixture data from industry-standard formats

---

**Status**: Proposal
**Recommendation**: Review design, then create ACP project with milestones and tasks
**Related Documents**: None yet — this is the foundational design
