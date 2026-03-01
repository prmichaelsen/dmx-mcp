# Task 26: Implement set_fixture_color Tool

**Milestone**: [M5 - Playback & Live Control](../../milestones/milestone-5-playback-live-control.md)
**Estimated Time**: 1 hour
**Dependencies**: Task 4 (OLA client), Task 8 (FixtureManager), Task 14 (DMX mapper)
**Status**: Not Started

---

## Objective

Implement a convenience function for directly setting a fixture's color without creating a scene. This enables quick live control -- the agent can say "set par-1 to red" without going through the scene/cue workflow.

---

## Context

Sometimes the agent just wants to set a light to red. This tool bypasses the scene system for quick live control. Instead of creating a scene, previewing it, and then discarding it, the agent can directly set color values on a single fixture.

The function needs to:
1. Look up the fixture by ID to get its universe, start address, and profile
2. Find the color channels (red, green, blue, and optionally white, amber, uv) in the profile
3. Map the requested color values to absolute DMX addresses
4. Send the values to OLA

The function must handle different fixture types gracefully:
- **RGB fixtures**: Accept red, green, blue
- **RGBW fixtures**: Accept red, green, blue, white
- **RGBA fixtures**: Accept red, green, blue, amber
- **Non-color fixtures** (e.g., dimmer-only): Return an error explaining the fixture has no color channels

The color function lives in `src/playback/live-control.ts` alongside the blackout function (Task 25).

---

## Steps

### 1. Define the Input and Result Types

Add these types to `src/playback/live-control.ts`:

```typescript
// Add to src/playback/live-control.ts

export interface SetFixtureColorParams {
  /** ID of the fixture to set */
  fixture_id: string;
  /** Red channel value (0-255) */
  red: number;
  /** Green channel value (0-255) */
  green: number;
  /** Blue channel value (0-255) */
  blue: number;
  /** Optional white channel value (0-255) for RGBW fixtures */
  white?: number;
  /** Optional amber channel value (0-255) for RGBA fixtures */
  amber?: number;
  /** Optional UV channel value (0-255) for RGBUV fixtures */
  uv?: number;
}

export interface SetFixtureColorResult {
  success: boolean;
  fixture_id: string;
  universe: number;
  channelsSet: Record<string, { dmxAddress: number; value: number }>;
  error?: string;
}
```

### 2. Implement the setFixtureColor Function

```typescript
// Add to src/playback/live-control.ts

/**
 * Known color channel types that this function can set.
 * Maps from the input parameter name to the ChannelType name
 * used in fixture profiles.
 */
const COLOR_CHANNEL_MAP: Record<string, string> = {
  red: "red",
  green: "green",
  blue: "blue",
  white: "white",
  amber: "amber",
  uv: "uv",
};

/**
 * Directly set a fixture's color by writing to its color channels.
 *
 * This function bypasses the scene system for quick live control.
 * It looks up the fixture's profile to find color channels, maps the
 * requested color values to absolute DMX addresses, and sends them
 * via OLA.
 *
 * @param params - The fixture ID and color values to set
 * @param fixtureManager - FixtureManager for looking up the fixture
 * @param olaClient - OLA client for sending DMX
 * @returns Result with details of which channels were set
 */
export async function setFixtureColor(
  params: SetFixtureColorParams,
  fixtureManager: FixtureManager,
  olaClient: OLAClient
): Promise<SetFixtureColorResult> {
  // 1. Look up the fixture
  const fixture = fixtureManager.getFixture(params.fixture_id);
  if (!fixture) {
    return {
      success: false,
      fixture_id: params.fixture_id,
      universe: 0,
      channelsSet: {},
      error: `Fixture "${params.fixture_id}" not found`,
    };
  }

  const profile = fixture.profile;
  const channels = profile.channels;

  // 2. Build a map from channel type name to its offset in the profile
  const channelByType = new Map<
    string,
    { offset: number; name: string }
  >();
  for (let i = 0; i < channels.length; i++) {
    // Channel type (e.g., "red", "green", "blue") is the key
    channelByType.set(channels[i].type ?? channels[i].name, {
      offset: i,
      name: channels[i].name,
    });
  }

  // 3. Check that the fixture has at least one color channel
  const hasColorChannels =
    channelByType.has("red") ||
    channelByType.has("green") ||
    channelByType.has("blue");

  if (!hasColorChannels) {
    return {
      success: false,
      fixture_id: params.fixture_id,
      universe: fixture.universe,
      channelsSet: {},
      error:
        `Fixture "${params.fixture_id}" (${profile.manufacturer} ${profile.model}) ` +
        `has no color channels (red/green/blue). ` +
        `Available channels: ${channels.map((c) => c.name).join(", ")}. ` +
        `Use set_fixture_dimmer for dimmer-only fixtures.`,
    };
  }

  // 4. Build the color values to set
  const colorValues: Record<string, number> = {
    red: params.red,
    green: params.green,
    blue: params.blue,
  };

  // Add optional extended color channels
  if (params.white !== undefined) colorValues.white = params.white;
  if (params.amber !== undefined) colorValues.amber = params.amber;
  if (params.uv !== undefined) colorValues.uv = params.uv;

  // 5. Read the current DMX state so we only modify color channels
  let currentChannels: number[];
  try {
    currentChannels = await olaClient.getDMX(fixture.universe);
    while (currentChannels.length < DMX_CHANNEL_COUNT) {
      currentChannels.push(0);
    }
  } catch {
    currentChannels = new Array(DMX_CHANNEL_COUNT).fill(0);
  }

  // 6. Set the color channel values at the correct DMX addresses
  const channelsSet: Record<
    string,
    { dmxAddress: number; value: number }
  > = {};

  for (const [colorName, value] of Object.entries(colorValues)) {
    const profileType = COLOR_CHANNEL_MAP[colorName];
    const channelInfo = channelByType.get(profileType);

    if (!channelInfo) {
      // This color channel doesn't exist on this fixture -- skip it
      // (e.g., setting white on an RGB-only fixture)
      continue;
    }

    // Validate value range
    const clampedValue = Math.max(0, Math.min(255, Math.round(value)));

    // Calculate absolute DMX address (1-based) and array index (0-based)
    const dmxAddress = fixture.startAddress + channelInfo.offset;
    const arrayIndex = dmxAddress - 1;

    if (arrayIndex >= 0 && arrayIndex < DMX_CHANNEL_COUNT) {
      currentChannels[arrayIndex] = clampedValue;
      channelsSet[colorName] = {
        dmxAddress,
        value: clampedValue,
      };
    }
  }

  // 7. Send the updated channel array to OLA
  await olaClient.setDMX(fixture.universe, currentChannels);

  return {
    success: true,
    fixture_id: params.fixture_id,
    universe: fixture.universe,
    channelsSet,
  };
}
```

### 3. Update the Barrel Export

Add the new exports to `src/playback/index.ts`:

```typescript
// src/playback/index.ts

export { CueSequencer } from "./sequencer.js";
export type { SequencerState } from "./sequencer.js";
export { blackout, setFixtureColor } from "./live-control.js";
export type {
  BlackoutResult,
  SetFixtureColorParams,
  SetFixtureColorResult,
} from "./live-control.js";
```

### 4. Verify TypeScript Compilation

```bash
npx tsc --noEmit
```

---

## Verification

- [ ] `setFixtureColor()` is exported from `src/playback/live-control.ts`
- [ ] Passing `{ fixture_id: "par-1", red: 255, green: 0, blue: 0 }` sets the correct DMX channels for an RGB fixture
- [ ] The function reads current DMX state before writing, preserving non-color channels (e.g., dimmer)
- [ ] RGBW fixtures accept the optional `white` parameter and set the white channel
- [ ] RGBA fixtures accept the optional `amber` parameter and set the amber channel
- [ ] Optional color parameters (`white`, `amber`, `uv`) that don't exist on the fixture are silently skipped
- [ ] A dimmer-only fixture returns `success: false` with a descriptive error
- [ ] A nonexistent fixture ID returns `success: false` with a "not found" error
- [ ] Channel values are clamped to 0-255 range
- [ ] The result includes `channelsSet` with DMX address and value for each channel that was set
- [ ] The result includes the `universe` number for reference
- [ ] `npx tsc --noEmit` passes with no errors

---

## Notes

- The function reads the current DMX state from OLA before writing. This is important because the fixture may have other channels (dimmer, strobe, gobo, etc.) that should not be zeroed out when setting color. Only the color channels are modified; everything else is preserved.
- Color values are clamped to 0-255 rather than throwing an error. This is a pragmatic choice for live control -- if the agent asks for `red: 300`, we set it to 255 rather than failing.
- The `channelByType` lookup uses the `type` field from the `ChannelDefinition` (e.g., `"red"`, `"green"`, `"blue"`), falling back to the `name` field. This supports both explicitly-typed channels and channels where the name matches the type.
- If the fixture has color channels but the agent passes `white` on an RGB-only fixture, the extra channel is silently skipped. The result's `channelsSet` object makes it clear which channels were actually set, so the agent can see that `white` was not applied.
- This function is intentionally not transactional. If the OLA `setDMX` call fails, no rollback is attempted. The assumption is that if OLA is unreachable, there is a bigger problem to address.

---

**Next Task**: [Task 27: Implement set_fixture_dimmer Tool](task-27-set-fixture-dimmer-tool.md)
**Related Design Docs**: [DMX Lighting MCP Design](../../design/local.dmx-lighting-mcp.md)
