# Task 28: Implement get_dmx_state Tool

**Milestone**: [M5 - Playback & Live Control](../../milestones/milestone-5-playback-live-control.md)
**Estimated Time**: 1 hour
**Dependencies**: Task 4 (OLA client)
**Status**: Not Started

---

## Objective

Implement an MCP tool to read current DMX output values from OLA for a given universe. Optionally, if a fixture ID is provided, extract and label that fixture's channels with human-readable names from its profile.

---

## Context

The agent cannot see lights. This tool lets it read back current DMX state to verify values were set correctly, debug issues, or understand the current state of the lighting rig before making changes.

The tool has two modes:
1. **Universe mode**: Given a universe number, return the full 512-channel array. This gives a raw view of all DMX output.
2. **Fixture mode**: Given a universe and a fixture ID, extract just that fixture's channels and label them with channel names from the profile (e.g., `"red": 255, "green": 128, "blue": 0` instead of just `[255, 128, 0]`).

The fixture mode is especially useful for the agent because it can see meaningful channel names rather than raw address numbers. Both the raw values and the labeled fixture values are returned in the response.

This function lives in `src/playback/live-control.ts` alongside the other live control functions.

---

## Steps

### 1. Define the Input and Result Types

Add these types to `src/playback/live-control.ts`:

```typescript
// Add to src/playback/live-control.ts

export interface GetDMXStateParams {
  /** DMX universe number to read */
  universe: number;
  /** Optional fixture ID to extract and label channels for */
  fixture_id?: string;
}

export interface FixtureChannelState {
  /** Channel name from the fixture profile (e.g., "red", "dimmer") */
  name: string;
  /** Channel type from the fixture profile (e.g., "red", "dimmer") */
  type: string;
  /** Absolute DMX address (1-based) */
  dmxAddress: number;
  /** Current value (0-255) */
  value: number;
}

export interface GetDMXStateResult {
  success: boolean;
  universe: number;
  /** Full 512-channel array of current DMX values */
  channels?: number[];
  /** If a fixture_id was provided, labeled channel states for that fixture */
  fixtureState?: {
    fixture_id: string;
    fixture_name: string;
    profile: string;
    startAddress: number;
    channels: FixtureChannelState[];
  };
  /** Summary: count of non-zero channels */
  activeChannelCount?: number;
  error?: string;
}
```

### 2. Implement the getDMXState Function

```typescript
// Add to src/playback/live-control.ts

/**
 * Read current DMX output values from OLA for a given universe.
 *
 * Returns the full 512-channel array. If a fixture_id is provided,
 * also extracts and labels that fixture's channels with names from
 * its profile.
 *
 * @param params - Universe number and optional fixture ID
 * @param olaClient - OLA client for reading DMX
 * @param fixtureManager - FixtureManager for looking up fixture details (optional, needed for fixture mode)
 * @returns Result with channel array and optional fixture-labeled values
 */
export async function getDMXState(
  params: GetDMXStateParams,
  olaClient: OLAClient,
  fixtureManager?: FixtureManager
): Promise<GetDMXStateResult> {
  // 1. Validate universe number
  if (
    !Number.isInteger(params.universe) ||
    params.universe < 1
  ) {
    return {
      success: false,
      universe: params.universe,
      error: `Universe must be a positive integer, got ${params.universe}`,
    };
  }

  // 2. Read DMX state from OLA
  let rawChannels: number[];
  try {
    rawChannels = await olaClient.getDMX(params.universe);
  } catch (error) {
    return {
      success: false,
      universe: params.universe,
      error: `Failed to read DMX from OLA: ${error instanceof Error ? error.message : String(error)}`,
    };
  }

  // Pad to 512 if OLA returns fewer channels
  while (rawChannels.length < DMX_CHANNEL_COUNT) {
    rawChannels.push(0);
  }

  // Truncate if OLA returns more than 512 (shouldn't happen, but be safe)
  if (rawChannels.length > DMX_CHANNEL_COUNT) {
    rawChannels = rawChannels.slice(0, DMX_CHANNEL_COUNT);
  }

  // 3. Count active (non-zero) channels
  const activeChannelCount = rawChannels.filter((v) => v !== 0).length;

  // 4. Build the base result
  const result: GetDMXStateResult = {
    success: true,
    universe: params.universe,
    channels: rawChannels,
    activeChannelCount,
  };

  // 5. If a fixture_id was provided, extract and label its channels
  if (params.fixture_id && fixtureManager) {
    const fixture = fixtureManager.getFixture(params.fixture_id);

    if (!fixture) {
      result.error = `Fixture "${params.fixture_id}" not found. Returning raw universe data only.`;
    } else if (fixture.universe !== params.universe) {
      result.error =
        `Fixture "${params.fixture_id}" is on universe ${fixture.universe}, ` +
        `but you requested universe ${params.universe}. ` +
        `Returning raw universe data only.`;
    } else {
      const profile = fixture.profile;
      const fixtureChannels: FixtureChannelState[] = [];

      for (let i = 0; i < profile.channels.length; i++) {
        const channelDef = profile.channels[i];
        const dmxAddress = fixture.startAddress + i;
        const arrayIndex = dmxAddress - 1;

        fixtureChannels.push({
          name: channelDef.name,
          type: channelDef.type ?? channelDef.name,
          dmxAddress,
          value:
            arrayIndex >= 0 && arrayIndex < DMX_CHANNEL_COUNT
              ? rawChannels[arrayIndex]
              : 0,
        });
      }

      result.fixtureState = {
        fixture_id: fixture.id,
        fixture_name: fixture.name,
        profile: `${profile.manufacturer} ${profile.model}`,
        startAddress: fixture.startAddress,
        channels: fixtureChannels,
      };
    }
  }

  return result;
}
```

### 3. Add a Formatting Helper

Add a helper function that formats the DMX state for human-readable MCP tool output:

```typescript
// Add to src/playback/live-control.ts

/**
 * Format a GetDMXStateResult into a human-readable string for
 * MCP tool output. This is more useful to the agent than raw JSON
 * for large channel arrays.
 */
export function formatDMXStateResult(
  result: GetDMXStateResult
): string {
  if (!result.success) {
    return `Error reading DMX state: ${result.error}`;
  }

  const lines: string[] = [];

  lines.push(`DMX Universe ${result.universe}`);
  lines.push(
    `Active channels: ${result.activeChannelCount} of ${DMX_CHANNEL_COUNT}`
  );

  // If fixture state is available, show labeled channels
  if (result.fixtureState) {
    const fs = result.fixtureState;
    lines.push("");
    lines.push(
      `Fixture: ${fs.fixture_name} (${fs.fixture_id})`
    );
    lines.push(`Profile: ${fs.profile}`);
    lines.push(`Start address: ${fs.startAddress}`);
    lines.push("Channels:");

    for (const ch of fs.channels) {
      lines.push(
        `  ${ch.name} (${ch.type}): ${ch.value} [DMX ${ch.dmxAddress}]`
      );
    }
  }

  // Show non-zero channels as a summary
  if (result.channels && result.activeChannelCount! > 0) {
    lines.push("");
    lines.push("Non-zero channels:");

    for (let i = 0; i < result.channels.length; i++) {
      if (result.channels[i] !== 0) {
        lines.push(
          `  DMX ${i + 1}: ${result.channels[i]}`
        );
      }
    }
  }

  if (result.error) {
    lines.push("");
    lines.push(`Note: ${result.error}`);
  }

  return lines.join("\n");
}
```

### 4. Update the Barrel Export

Update `src/playback/index.ts`:

```typescript
// src/playback/index.ts

export { CueSequencer } from "./sequencer.js";
export type { SequencerState } from "./sequencer.js";
export {
  blackout,
  setFixtureColor,
  setFixtureDimmer,
  getDMXState,
  formatDMXStateResult,
} from "./live-control.js";
export type {
  BlackoutResult,
  SetFixtureColorParams,
  SetFixtureColorResult,
  SetFixtureDimmerParams,
  SetFixtureDimmerResult,
  GetDMXStateParams,
  GetDMXStateResult,
  FixtureChannelState,
} from "./live-control.js";
```

### 5. Verify TypeScript Compilation

```bash
npx tsc --noEmit
```

---

## Verification

- [ ] `getDMXState()` is exported from `src/playback/live-control.ts`
- [ ] `getDMXState({ universe: 1 })` returns the full 512-channel array from OLA
- [ ] The result includes `activeChannelCount` with the count of non-zero channels
- [ ] Passing an invalid universe number (0, negative, non-integer) returns `success: false`
- [ ] If OLA is unreachable, returns `success: false` with a descriptive error
- [ ] Passing `fixture_id: "par-1"` extracts and labels that fixture's channels from its profile
- [ ] Fixture channels include `name`, `type`, `dmxAddress`, and `value`
- [ ] Requesting a fixture on a different universe than the one being read returns a warning
- [ ] A nonexistent fixture ID returns a warning but still returns the raw universe data
- [ ] `formatDMXStateResult()` produces human-readable output for the agent
- [ ] The formatted output includes labeled fixture channels when available
- [ ] The formatted output lists all non-zero channels in the universe
- [ ] OLA responses with fewer than 512 channels are padded to 512 with zeros
- [ ] `npx tsc --noEmit` passes with no errors

---

## Notes

- The raw 512-channel array is always included in the result, even when a fixture is specified. This gives the agent full visibility into the universe state, not just the requested fixture.
- The `fixtureManager` parameter is optional for `getDMXState`. If not provided, fixture labeling is simply skipped. This makes the function usable in minimal setups where only the OLA client is available.
- The `formatDMXStateResult` helper produces a compact summary that is more useful to the agent than a 512-element JSON array. The agent can see at a glance which channels have values and what they correspond to.
- The non-zero channel summary in the formatted output omits channels that are 0, which is typically the vast majority of the 512 channels. This prevents flooding the agent's context with useless information.
- Channel `type` may differ from channel `name` in some profiles (e.g., `name: "Master Dimmer"`, `type: "dimmer"`). Both are included in the output so the agent has full context.
- The tool reads from OLA, which reflects the actual DMX output. If another application is also controlling OLA, the values returned may differ from what this MCP server set. This is by design -- the tool shows the truth of what is being sent to the lights.

---

**Next Task**: [Task 29: Register Playback MCP Tools and Tests](task-29-register-playback-tools-tests.md)
**Related Design Docs**: [DMX Lighting MCP Design](../../design/local.dmx-lighting-mcp.md)
