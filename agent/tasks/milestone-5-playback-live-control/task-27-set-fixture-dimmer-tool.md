# Task 27: Implement set_fixture_dimmer Tool

**Milestone**: [M5 - Playback & Live Control](../../milestones/milestone-5-playback-live-control.md)
**Estimated Time**: 30 minutes
**Dependencies**: Task 4 (OLA client), Task 8 (FixtureManager)
**Status**: Not Started

---

## Objective

Implement a convenience function for directly setting a fixture's dimmer intensity. If the fixture has a dedicated dimmer channel, set it directly. If the fixture is RGB-only with no dimmer channel, return an informational hint suggesting the agent use `set_fixture_color` instead.

---

## Context

Simple intensity control. Most professional fixtures have a dedicated dimmer channel that controls overall brightness independently of color. For these fixtures, setting the dimmer to 128 means 50% brightness regardless of the current color values.

However, some cheap RGB fixtures (common LED pars) have no dedicated dimmer channel -- brightness is controlled entirely through the RGB values themselves. For these fixtures, the dimmer tool cannot directly control intensity and should inform the agent to use `set_fixture_color` with scaled values instead.

The dimmer function supports two input modes:
- **Absolute**: `level` is 0-255 (raw DMX value)
- **Percent**: `level` is 0.0-1.0 with `unit: "percent"` (converted to 0-255 internally)

This function lives in `src/playback/live-control.ts` alongside `blackout` and `setFixtureColor`.

---

## Steps

### 1. Define the Input and Result Types

Add these types to `src/playback/live-control.ts`:

```typescript
// Add to src/playback/live-control.ts

export interface SetFixtureDimmerParams {
  /** ID of the fixture to set */
  fixture_id: string;
  /** Dimmer level. 0-255 for absolute, 0.0-1.0 for percent mode. */
  level: number;
  /** Unit for the level value. Default is "absolute" (0-255). */
  unit?: "absolute" | "percent";
}

export interface SetFixtureDimmerResult {
  success: boolean;
  fixture_id: string;
  universe: number;
  dimmerChannel?: {
    name: string;
    dmxAddress: number;
    value: number;
  };
  error?: string;
  hint?: string;
}
```

### 2. Implement the setFixtureDimmer Function

```typescript
// Add to src/playback/live-control.ts

/**
 * Directly set a fixture's dimmer intensity.
 *
 * If the fixture has a dedicated dimmer channel (type "dimmer"), sets
 * that channel to the specified level. If the fixture has no dimmer
 * channel but has RGB channels, returns an informational hint
 * suggesting the agent use set_fixture_color to control brightness.
 *
 * @param params - The fixture ID, level, and optional unit
 * @param fixtureManager - FixtureManager for looking up the fixture
 * @param olaClient - OLA client for sending DMX
 * @returns Result with details of the dimmer channel set
 */
export async function setFixtureDimmer(
  params: SetFixtureDimmerParams,
  fixtureManager: FixtureManager,
  olaClient: OLAClient
): Promise<SetFixtureDimmerResult> {
  // 1. Look up the fixture
  const fixture = fixtureManager.getFixture(params.fixture_id);
  if (!fixture) {
    return {
      success: false,
      fixture_id: params.fixture_id,
      universe: 0,
      error: `Fixture "${params.fixture_id}" not found`,
    };
  }

  const profile = fixture.profile;
  const channels = profile.channels;

  // 2. Convert level to absolute 0-255 value
  let absoluteLevel: number;
  if (params.unit === "percent") {
    // Percent mode: 0.0-1.0 mapped to 0-255
    const clamped = Math.max(0, Math.min(1, params.level));
    absoluteLevel = Math.round(clamped * 255);
  } else {
    // Absolute mode: 0-255
    absoluteLevel = Math.max(0, Math.min(255, Math.round(params.level)));
  }

  // 3. Find the dimmer channel in the profile
  let dimmerOffset: number | null = null;
  let dimmerChannelName: string | null = null;

  for (let i = 0; i < channels.length; i++) {
    const channelType = channels[i].type ?? channels[i].name;
    if (channelType === "dimmer") {
      dimmerOffset = i;
      dimmerChannelName = channels[i].name;
      break;
    }
  }

  // 4. If no dimmer channel, check for RGB and return hint
  if (dimmerOffset === null) {
    const hasRGB = channels.some((ch) => {
      const t = ch.type ?? ch.name;
      return t === "red" || t === "green" || t === "blue";
    });

    if (hasRGB) {
      return {
        success: false,
        fixture_id: params.fixture_id,
        universe: fixture.universe,
        error:
          `Fixture "${params.fixture_id}" (${profile.manufacturer} ${profile.model}) ` +
          `has no dedicated dimmer channel.`,
        hint:
          `This fixture uses RGB channels for brightness control. ` +
          `To dim it, scale the RGB values proportionally using set_fixture_color. ` +
          `For example, for 50% brightness with red: ` +
          `set_fixture_color({ fixture_id: "${params.fixture_id}", red: 128, green: 0, blue: 0 })`,
      };
    }

    return {
      success: false,
      fixture_id: params.fixture_id,
      universe: fixture.universe,
      error:
        `Fixture "${params.fixture_id}" (${profile.manufacturer} ${profile.model}) ` +
        `has no dimmer or color channels. ` +
        `Available channels: ${channels.map((c) => c.name).join(", ")}`,
    };
  }

  // 5. Read current DMX state to preserve other channels
  let currentChannels: number[];
  try {
    currentChannels = await olaClient.getDMX(fixture.universe);
    while (currentChannels.length < DMX_CHANNEL_COUNT) {
      currentChannels.push(0);
    }
  } catch {
    currentChannels = new Array(DMX_CHANNEL_COUNT).fill(0);
  }

  // 6. Set the dimmer channel value
  const dmxAddress = fixture.startAddress + dimmerOffset;
  const arrayIndex = dmxAddress - 1;

  if (arrayIndex < 0 || arrayIndex >= DMX_CHANNEL_COUNT) {
    return {
      success: false,
      fixture_id: params.fixture_id,
      universe: fixture.universe,
      error: `Dimmer channel maps to DMX address ${dmxAddress}, which is outside the valid range 1-512`,
    };
  }

  currentChannels[arrayIndex] = absoluteLevel;

  // 7. Send the updated channel array to OLA
  await olaClient.setDMX(fixture.universe, currentChannels);

  return {
    success: true,
    fixture_id: params.fixture_id,
    universe: fixture.universe,
    dimmerChannel: {
      name: dimmerChannelName!,
      dmxAddress,
      value: absoluteLevel,
    },
  };
}
```

### 3. Update the Barrel Export

Update `src/playback/index.ts`:

```typescript
// src/playback/index.ts

export { CueSequencer } from "./sequencer.js";
export type { SequencerState } from "./sequencer.js";
export {
  blackout,
  setFixtureColor,
  setFixtureDimmer,
} from "./live-control.js";
export type {
  BlackoutResult,
  SetFixtureColorParams,
  SetFixtureColorResult,
  SetFixtureDimmerParams,
  SetFixtureDimmerResult,
} from "./live-control.js";
```

### 4. Verify TypeScript Compilation

```bash
npx tsc --noEmit
```

---

## Verification

- [ ] `setFixtureDimmer()` is exported from `src/playback/live-control.ts`
- [ ] Setting `{ fixture_id: "par-1", level: 128 }` on a fixture with a dimmer channel sets DMX to 128
- [ ] Setting `{ fixture_id: "par-1", level: 0.5, unit: "percent" }` converts to DMX value 128 (rounded)
- [ ] Setting `{ fixture_id: "par-1", level: 1.0, unit: "percent" }` converts to DMX value 255
- [ ] Setting `{ fixture_id: "par-1", level: 0.0, unit: "percent" }` converts to DMX value 0
- [ ] The function reads current DMX state before writing, preserving non-dimmer channels
- [ ] An RGB-only fixture (no dimmer channel) returns `success: false` with a helpful `hint`
- [ ] A fixture with no dimmer and no RGB returns `success: false` with an error listing available channels
- [ ] A nonexistent fixture ID returns `success: false` with a "not found" error
- [ ] Level values are clamped (negative to 0, over 255 to 255, over 1.0 to 1.0)
- [ ] Percent values outside 0.0-1.0 are clamped before conversion
- [ ] The result includes `dimmerChannel` with channel name, DMX address, and value
- [ ] `npx tsc --noEmit` passes with no errors

---

## Notes

- The percent mode uses 0.0-1.0 as the range (not 0-100). This is consistent with common lighting control conventions and avoids ambiguity between "50" meaning 50% or DMX value 50.
- The dimmer lookup searches for a channel with type `"dimmer"`. This relies on fixture profiles correctly typing their dimmer channel. If a profile uses a custom type name, the lookup will not find it. Profile creators should use the standard `"dimmer"` type for dimmer channels.
- When an RGB-only fixture is encountered, the hint provides a concrete example of how to achieve the same effect using `set_fixture_color`. This is designed to help the agent self-correct without requiring the user to explain the workaround.
- Like `setFixtureColor`, this function reads the current DMX state before writing to preserve other channel values (color, position, etc.). Only the dimmer channel is modified.
- The function returns early with an error result rather than throwing exceptions. This is consistent with the other live control functions and makes error handling straightforward in the MCP tool handler.

---

**Next Task**: [Task 28: Implement get_dmx_state Tool](task-28-get-dmx-state-tool.md)
**Related Design Docs**: [DMX Lighting MCP Design](../../design/local.dmx-lighting-mcp.md)
