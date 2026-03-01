# Fixture Profile Import

**Concept**: Import fixture profiles from the Open Fixture Library and optionally auto-patch via OLA RDM discovery
**Created**: 2026-03-01
**Status**: Proposal

---

## Overview

This design covers two complementary approaches for populating dmx-mcp with fixture profiles:

1. **Open Fixture Library (OFL) import** (primary) — Download fixture definitions from the community OFL database (198 manufacturers, 1000+ fixtures) with full channel names, types, and multi-mode support
2. **OLA RDM discovery** (optional complement) — Detect RDM-capable fixtures on the DMX bus to auto-detect addresses and match against imported profiles

OFL import solves the profile quality problem — users get proper channel definitions (`red`, `green`, `pan`, `tilt`, `dimmer`) instead of generic unnamed channels. RDM discovery solves the addressing problem — auto-detect what's plugged in and where.

---

## Problem Statement

- Users must manually define fixture profiles using `create_fixture_profile`, which requires knowing the exact channel layout of each fixture
- The 3 built-in generic profiles (dimmer, RGB par, RGBW par) don't cover real-world fixtures with strobes, gobos, pan/tilt, fine channels, etc.
- For setups with many different fixture types, creating accurate profiles is tedious and error-prone
- A community-maintained database of 1000+ fixtures already exists (Open Fixture Library) but there's no way to use it

---

## Solution

### Primary: OFL Profile Import

Add MCP tools that browse and import fixture profiles from the Open Fixture Library's public REST API.

```
┌─────────────┐         HTTPS              ┌─────────────────────┐
│  dmx-mcp    │ ──── GET /api/v1/ ────────►│  Open Fixture       │
│  server     │                            │  Library API        │
│             │ ◄─── JSON ─────────────────│  (open-fixture-     │
│             │                            │   library.org)      │
│  OFL        │                            └─────────────────────┘
│  Client     │  transform OFL format           │
│      │      │  to FixtureProfile              │
│      ▼      │                                 │
│  Profile    │                            ┌─────────────────────┐
│  Registry   │                            │  GitHub raw JSON    │
│  (imported  │ ◄─── fetch fixture def ────│  (fixtures/*.json)  │
│   profiles) │                            └─────────────────────┘
└─────────────┘
```

### Optional Complement: RDM Discovery

After profiles are imported from OFL, RDM discovery can auto-match physical fixtures to those profiles and auto-patch with correct DMX addresses.

```
┌─────────────┐     ola_rdm_discover      ┌──────────┐
│  dmx-mcp    │ ──── shell exec ─────────► │   OLA    │
│  server     │                            │  (olad)  │
│             │ ◄─── parse stdout ──────── │          │
│             │                            └──────────┘
│  Profile    │                                 │
│  Registry   │  match manufacturer+model       │ RDM
│  (OFL       │◄──────────────────────────      │ protocol
│   profiles) │                                 ▼
│             │                           ┌──────────┐
│  Fixture    │  auto-patch with          │ Fixtures  │
│  Manager    │◄─── address + profile     │ on DMX    │
└─────────────┘                           │ bus       │
                                          └──────────┘
```

---

## Implementation

### 1. OFL API Client

```typescript
// src/ofl/client.ts

const OFL_API_BASE = "https://open-fixture-library.org/api/v1";
const OFL_RAW_BASE = "https://raw.githubusercontent.com/OpenLightingProject/open-fixture-library/master/fixtures";

export interface OFLManufacturer {
  key: string;            // e.g. "cameo"
  name: string;           // e.g. "Cameo"
  fixtureCount: number;
}

export interface OFLFixtureSummary {
  key: string;            // e.g. "auro-beam-150"
  name: string;           // e.g. "Auro Beam 150"
  categories: string[];   // e.g. ["Color Changer", "Moving Head"]
}

export class OFLClient {
  /**
   * List all manufacturers.
   * GET /api/v1/manufacturers
   */
  async listManufacturers(): Promise<OFLManufacturer[]>;

  /**
   * List fixtures for a manufacturer.
   * GET /api/v1/manufacturers/{key}
   */
  async listFixtures(manufacturerKey: string): Promise<OFLFixtureSummary[]>;

  /**
   * Download full fixture definition JSON.
   * GET raw GitHub: fixtures/{manufacturer}/{fixture}.json
   */
  async getFixtureDefinition(
    manufacturerKey: string,
    fixtureKey: string,
  ): Promise<OFLFixtureDefinition>;
}
```

### 2. OFL-to-FixtureProfile transformer

The OFL format is richer than our `FixtureProfile`. The transformer maps the subset we need:

```typescript
// src/ofl/transformer.ts

/**
 * OFL capability types → dmx-mcp ChannelType mapping
 */
const OFL_TYPE_MAP: Record<string, ChannelType> = {
  "Intensity":      "dimmer",
  "ColorIntensity": /* by color name */ "red" | "green" | "blue" | "white" | "amber" | "uv",
  "Pan":            "pan",
  "PanFine":        "pan_fine",
  "Tilt":           "tilt",
  "TiltFine":       "tilt_fine",
  "ShutterStrobe":  "strobe",
  "Speed":          "speed",
  "Gobo":           "gobo",
  "Effect":         "macro",
  "Maintenance":    "control",
  "NoFunction":     "control",
};

export function transformOFLFixture(
  manufacturerKey: string,
  fixtureKey: string,
  oflDef: OFLFixtureDefinition,
): FixtureProfile {
  // 1. Map availableChannels → ChannelDefinition[]
  //    - Infer ChannelType from the first capability's type
  //    - For ColorIntensity, use the color name (red, green, blue, etc.)
  //    - For unknown types, default to "control"
  //    - Use defaultValue from OFL (default 0)

  // 2. Map modes → FixtureMode[]
  //    - Each OFL mode has a name and channel list
  //    - Channel list references keys in availableChannels
  //    - Fine channel aliases expand to separate channels

  // 3. Return FixtureProfile
  return {
    id: `ofl-${manufacturerKey}-${fixtureKey}`,
    manufacturer: oflDef.$schema ? manufacturerKey : manufacturerKey,
    model: oflDef.name,
    channels: mappedChannels,
    modes: mappedModes,
  };
}
```

**Channel type inference example:**

```typescript
function inferChannelType(
  channelKey: string,
  channelDef: OFLChannel,
): ChannelType {
  // Single capability → use its type directly
  if (channelDef.capability) {
    return mapCapabilityType(channelDef.capability);
  }

  // Multiple capabilities → use the first one's type as primary
  if (channelDef.capabilities?.length > 0) {
    return mapCapabilityType(channelDef.capabilities[0]);
  }

  // Fallback: infer from channel key name
  const keyLower = channelKey.toLowerCase();
  if (keyLower.includes("red"))     return "red";
  if (keyLower.includes("green"))   return "green";
  if (keyLower.includes("blue"))    return "blue";
  if (keyLower.includes("white"))   return "white";
  if (keyLower.includes("amber"))   return "amber";
  if (keyLower.includes("dimmer"))  return "dimmer";
  if (keyLower.includes("pan"))     return keyLower.includes("fine") ? "pan_fine" : "pan";
  if (keyLower.includes("tilt"))    return keyLower.includes("fine") ? "tilt_fine" : "tilt";
  if (keyLower.includes("strobe"))  return "strobe";
  if (keyLower.includes("gobo"))    return "gobo";

  return "control";
}
```

### 3. MCP Tools — OFL Import

```typescript
// Tool: search_fixture_profiles
server.tool(
  "search_fixture_profiles",
  "Search the Open Fixture Library for fixture profiles by manufacturer. Returns available manufacturers and their fixtures. Requires internet access.",
  {
    manufacturer: z.string().optional()
      .describe("Manufacturer name or key to search (e.g. 'cameo', 'american-dj'). Omit to list all manufacturers."),
  },
  async (args) => {
    if (!args.manufacturer) {
      const manufacturers = await oflClient.listManufacturers();
      return { content: [{ type: "text", text: JSON.stringify({ manufacturers }, null, 2) }] };
    }
    const fixtures = await oflClient.listFixtures(args.manufacturer);
    return { content: [{ type: "text", text: JSON.stringify({ manufacturer: args.manufacturer, fixtures }, null, 2) }] };
  },
);

// Tool: import_fixture_profile
server.tool(
  "import_fixture_profile",
  "Import a fixture profile from the Open Fixture Library into the profile registry. Use search_fixture_profiles to find the manufacturer and fixture keys.",
  {
    manufacturer: z.string().describe("Manufacturer key (e.g. 'cameo')"),
    fixture: z.string().describe("Fixture key (e.g. 'auro-beam-150')"),
  },
  async (args) => {
    const oflDef = await oflClient.getFixtureDefinition(args.manufacturer, args.fixture);
    const profile = transformOFLFixture(args.manufacturer, args.fixture, oflDef);
    profileRegistry.register(profile);
    return {
      content: [{
        type: "text",
        text: JSON.stringify({
          success: true,
          profile: {
            id: profile.id,
            manufacturer: profile.manufacturer,
            model: profile.model,
            channelCount: profile.channels.length,
            modes: profile.modes.map((m) => ({ name: m.name, channels: m.channelCount })),
          },
        }, null, 2),
      }],
    };
  },
);
```

### 4. MCP Tools — RDM Discovery (optional)

```typescript
// src/ola/rdm.ts

export interface RDMDevice {
  uid: string;              // e.g. "7a70:00000001"
  manufacturer: string;     // from DEVICE_INFO
  model: string;            // from DEVICE_INFO
  dmxStartAddress: number;  // current DMX start address
  dmxFootprint: number;     // number of DMX channels used
  universe: number;
}

export class OLARDMClient {
  /** Wraps: ola_rdm_discover + ola_rdm_get device_info */
  async discoverDevices(universe: number): Promise<RDMDevice[]>;
}

// Tool: discover_fixtures
server.tool(
  "discover_fixtures",
  "Run RDM discovery on a DMX universe to find connected fixtures. Returns manufacturer, model, DMX address, and channel count. Requires OLA and RDM-capable fixtures.",
  {
    universe: z.number().describe("Universe number to scan"),
  },
  async (args) => {
    const devices = await rdmClient.discoverDevices(args.universe);
    return {
      content: [{
        type: "text",
        text: JSON.stringify({ universe: args.universe, devices, count: devices.length }, null, 2),
      }],
    };
  },
);

// Tool: auto_patch
server.tool(
  "auto_patch",
  "Discover RDM fixtures on a universe and auto-patch them. Matches discovered devices to profiles in the registry by manufacturer+model. Import profiles from OFL first for best results.",
  {
    universe: z.number().describe("Universe to discover and auto-patch"),
  },
  async (args) => {
    const devices = await rdmClient.discoverDevices(args.universe);
    const results = [];
    for (const device of devices) {
      const profile = findProfileByManufacturerModel(profileRegistry, device.manufacturer, device.model);
      if (profile) {
        fixtureManager.patchFixture({
          id: `${device.uid.replace(":", "-")}`,
          name: `${device.manufacturer} ${device.model}`,
          profileId: profile.id,
          universe: args.universe,
          startAddress: device.dmxStartAddress,
        });
        results.push({ uid: device.uid, status: "patched", profileId: profile.id });
      } else {
        results.push({ uid: device.uid, status: "no-profile", hint: "Use import_fixture_profile to add a profile for this fixture." });
      }
    }
    return { content: [{ type: "text", text: JSON.stringify({ results }, null, 2) }] };
  },
);
```

### 5. Typical agent workflow

```
Agent: "Let me set up your lights."

1. discover_fixtures(universe=1)
   → Found 4 devices: 2x Cameo Auro Beam 150, 2x ADJ Mega Par Profile

2. search_fixture_profiles(manufacturer="cameo")
   → Lists 46 fixtures including "auro-beam-150"

3. import_fixture_profile(manufacturer="cameo", fixture="auro-beam-150")
   → Profile "ofl-cameo-auro-beam-150" registered (19ch, 4 modes)

4. import_fixture_profile(manufacturer="american-dj", fixture="mega-par-profile")
   → Profile "ofl-american-dj-mega-par-profile" registered (7ch, 2 modes)

5. auto_patch(universe=1)
   → 4 fixtures patched with correct profiles and addresses
```

---

## Benefits

- **Complete channel definitions**: OFL provides proper channel names and types for 1000+ fixtures — no guessing
- **Multi-mode support**: OFL fixtures include all available DMX modes (3ch, 7ch, 19ch, etc.)
- **Community maintained**: OFL is actively maintained with contributions from the lighting community
- **No new runtime dependencies**: Uses native `fetch` for OFL API, OLA CLI tools for RDM
- **Progressive enhancement**: OFL import works without hardware; RDM discovery works without internet
- **Works alongside manual profiles**: Imported profiles coexist with built-in and user-created ones

---

## Trade-offs

- **Internet required for OFL import**: First-time import needs internet access (could cache locally for offline use later)
- **OFL format complexity**: OFL supports features we don't (switching channels, pixel matrices, wheels) — the transformer ignores these and maps to our simpler model
- **Channel type inference is heuristic**: Some OFL channels have complex capability ranges (e.g. 0-50 = color, 51-100 = strobe on same channel). We take the primary capability as the channel type
- **RDM coverage is limited**: Most budget fixtures don't support RDM. OFL import is the main value; RDM auto-patching is a bonus
- **OFL API stability**: The API is not versioned; format changes could break the transformer

---

## Dependencies

- **OFL import**: Internet access to `open-fixture-library.org` and `raw.githubusercontent.com`
- **RDM discovery** (optional): `olad` running, `ola_rdm_discover` / `ola_rdm_get` CLI tools, RDM-capable fixtures

---

## Testing Strategy

- **OFL client unit tests**: Mock fetch, verify manufacturer listing and fixture download
- **Transformer unit tests**: Convert sample OFL fixture JSON to FixtureProfile, verify channel types, modes, and naming
- **Integration tests**: Import a real OFL fixture → patch → create scene → verify DMX mapping works end-to-end
- **RDM parsing tests**: Parse hardcoded CLI output strings, verify device info extraction
- **Edge cases**: Fixtures with fine channels, switching channels, pixel matrices — verify graceful degradation

---

## Migration Path

No migration needed. Additive changes only.

1. Add `src/ofl/client.ts` (OFL API client)
2. Add `src/ofl/transformer.ts` (OFL → FixtureProfile conversion)
3. Add `src/ola/rdm.ts` (RDM CLI wrapper — optional)
4. Register new MCP tools in `server.ts`
5. Existing workflows unchanged

---

## Future Considerations

- **Local OFL cache**: Download and cache OFL fixtures locally for offline use
- **QLC+ XML import**: Parse QLC+ fixture definitions as an alternative profile source
- **GDTF/MVR support**: Industry-standard fixture data format for professional consoles
- **RDM parameter setting**: Use `ola_rdm_set` to configure fixture addresses and modes from dmx-mcp
- **Profile auto-update**: Periodically check OFL for updated fixture definitions
- **Fuzzy matching**: Match RDM device info to OFL profiles even when manufacturer/model names differ slightly

---

**Status**: Proposal
**Recommendation**: Implement as M7 with 4-5 tasks: OFL client, transformer, OFL MCP tools, RDM discovery (optional), tests
**Related Documents**: [DMX Lighting MCP Design](local.dmx-lighting-mcp.md), [OLA Hardware Setup (Linux)](local.ola-hardware-setup-linux.md)
