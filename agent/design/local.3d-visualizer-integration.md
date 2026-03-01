# 3D Visualizer Integration

**Concept**: Connect dmx-mcp to 3D lighting visualizers (grandMA3, Capture, Unreal) via Art-Net for hardware-free scene preview
**Created**: 2026-03-01
**Status**: Proposal

---

## Overview

This design describes how to bridge dmx-mcp's DMX output to industry-standard 3D lighting visualizers via Art-Net, enabling users to preview lighting scenes, effects, and cue sequences in a realistic 3D environment without physical lights or DMX hardware.

The core idea: our MCP server already sends DMX through OLA's REST API. OLA natively supports Art-Net output. 3D visualizers natively accept Art-Net input. The pieces already exist — we just need to connect them.

---

## Problem Statement

- **No visual feedback**: Currently, dmx-mcp outputs raw DMX values. Without physical lights, users can only see channel numbers and values in the emulator monitor UI.
- **Hardware dependency**: Testing lighting designs requires a full physical setup (DMX adapter, lights, rigging).
- **Scene design is blind**: Programming scenes, cues, and effects without seeing the result makes lighting design slow and error-prone.
- **Collaboration barrier**: Sharing a lighting design requires the other person to have identical hardware.

---

## Solution

Use Art-Net (DMX over IP) to bridge dmx-mcp output to any 3D visualizer that accepts Art-Net input. No code changes to dmx-mcp are required for the basic path — this is purely OLA configuration.

### Signal Flow

```
Claude Code → MCP tools → dmx-mcp server → OLA REST API
                                                ↓
                                          OLA DMX Engine
                                           ↙        ↘
                                    USB DMX           Art-Net
                                   (Enttec)          (network)
                                      ↓                  ↓
                                Physical Lights    3D Visualizer
                                                  (grandMA3 / Capture / Unreal)
```

### Recommended Visualizer: grandMA3 onPC

grandMA3 onPC is the best free option:
- **Free**: Full software download, no license required for visualization
- **Built-in 3D visualizer**: No separate app needed
- **Art-Net input**: Receives external Art-Net without MA hardware
- **Industry standard**: Same software used on professional tours and shows
- **Fixture library**: Extensive library of real fixture models with accurate beam rendering
- **Current version**: v2.3 (2025), v2.4 in development

**Limitation**: grandMA3 onPC cannot *output* DMX without MA hardware. This doesn't affect our use case — we only need it to *receive* and visualize.

### Alternative Visualizers

| Software | Cost | Pros | Cons |
|----------|------|------|------|
| **grandMA3 onPC** | Free | Industry standard, built-in 3D, great fixture library | Complex UI, steep learning curve |
| **Capture** | Free (Student) | Beautiful rendering, easy to learn | Student tier has fixture limits |
| **Unreal Engine 5** | Free | Full 3D control, DMX plugin built-in | Must build scenes from scratch |
| **Depence** | $2,000+ | Gorgeous rendering | Expensive |
| **L8** | Free (OSS) | Open source | Basic rendering |

All accept Art-Net or sACN input.

---

## Implementation

### Step 1: Configure OLA Art-Net Output

OLA's Art-Net plugin is configured in `~/.ola/ola-artnet.conf`:

```ini
# Enable Art-Net
enabled = true

# IP address to bind to (use network interface IP, not localhost)
ip = 0.0.0.0

# Use broadcast (simpler) or unicast to specific visualizer IP
use_limited_broadcast_address = true
```

Then in OLA's web UI (`http://localhost:9090/ola.html`):
1. Go to universe configuration
2. Patch universe 1 to **both** the Enttec USB output **and** Art-Net output
3. DMX data now goes to physical lights AND the visualizer simultaneously

### Step 2: Configure grandMA3 onPC Art-Net Input

1. Download and install grandMA3 onPC from [malighting.com](https://www.malighting.com/special/grandma3-software/)
2. Open grandMA3 onPC
3. Menu → DMX Protocols → Art-Net
4. Set mode to **Input** for the desired universes
5. Ensure the network interface matches OLA's Art-Net output
6. Open the 3D visualizer window (MA 3D tab)
7. Patch fixtures in grandMA3 matching the dmx-mcp fixture configuration

### Step 3: Patch Matching Fixtures

Fixtures must be patched identically in both systems:

| Property | dmx-mcp | grandMA3 |
|----------|---------|----------|
| Universe | 1 | 1 |
| Address | 1 | 1 |
| Profile | Generic RGB Par | Select matching fixture from MA library |

### Typical Workflow

```
1. Start OLA with Art-Net enabled
2. Start grandMA3 onPC, configure Art-Net input, patch fixtures, set up 3D stage
3. Start dmx-mcp MCP server (connects to OLA)
4. In Claude Code:
   → "Patch an RGB par at universe 1 address 1"
   → "Set it to deep blue"
   → Light turns blue in grandMA3's 3D view
   → "Create a rainbow chase across all fixtures"
   → 3D visualizer shows the effect in real-time
```

---

## Benefits

- **Zero code changes**: OLA already supports Art-Net output. No dmx-mcp modifications needed.
- **Real-time preview**: See lighting changes instantly in 3D as you program via Claude Code.
- **Dual output**: Art-Net and USB DMX can run simultaneously — preview and control real lights at the same time.
- **Industry-standard tools**: Uses the same software professional lighting designers use.
- **Hardware-free development**: Design and test complete shows without any DMX hardware.

---

## Trade-offs

- **Setup complexity**: Requires configuring OLA Art-Net, installing grandMA3, and patching fixtures in two places. Mitigated by documentation and step-by-step guides.
- **Fixture sync**: Fixtures must be manually patched in both dmx-mcp and the visualizer. A future enhancement could auto-generate grandMA3 patch files.
- **Network dependency**: Art-Net requires both apps on the same network (or same machine). Localhost works fine for single-machine setups.
- **grandMA3 learning curve**: The software is powerful but complex. Basic visualization setup is straightforward though.

---

## Dependencies

- **OLA** with Art-Net plugin enabled (`ola-artnet.conf`)
- **grandMA3 onPC** (free download) or another Art-Net-capable visualizer
- **Network**: Both apps on the same subnet (or loopback for same machine)
- **No dmx-mcp code changes required**

---

## Testing Strategy

- **Manual verification**: Send DMX from dmx-mcp, confirm values appear in grandMA3's DMX sheet
- **Visual verification**: Set fixture colors via MCP tools, confirm 3D visualizer renders correct colors
- **Emulator path**: Test with dmx-mcp emulator → Art-Net bridge (future) as a fully software-based pipeline

---

## Future Considerations

- **Native Art-Net output in emulator**: Add Art-Net broadcast directly to `DMXEmulatorServer`, bypassing OLA entirely for the visualizer-only path
- **Fixture patch export**: Generate grandMA3-compatible patch files from dmx-mcp's fixture configuration
- **sACN support**: Add sACN (E1.31) as an alternative to Art-Net — simpler protocol, better for unicast
- **Emulator 3D view**: Lightweight Three.js-based 3D preview built into the emulator monitor UI
- **Capture integration guide**: Step-by-step for Capture Student edition as an alternative to grandMA3

---

**Status**: Proposal
**Recommendation**: Start with OLA Art-Net configuration guide and grandMA3 onPC setup. No code changes needed — this is a configuration and documentation task.
**Related Documents**: [OLA Hardware Setup (Linux)](local.ola-hardware-setup-linux.md), [DMX Lighting MCP Design](local.dmx-lighting-mcp.md)
