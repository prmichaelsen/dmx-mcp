# Task 14: Implement Scene-to-DMX Channel Mapping

**Milestone**: [M3 - Scene Programming](../../milestones/milestone-3-scene-programming.md)
**Estimated Time**: 1 hour
**Dependencies**: Task 13 (SceneManager), Task 7 (fixture profiles)
**Status**: Not Started

---

## Objective

Implement the logic to convert scene fixture states (named channel values like `{ red: 255, green: 128, blue: 0 }`) into raw DMX channel arrays per universe. This is the bridge between the high-level scene abstraction and the low-level DMX protocol.

---

## Context

A scene says "fixture `par-1` has `red=255, green=128, blue=0`". The DMX mapper needs to translate this into absolute DMX channel values. To do so, it must:

1. Look up `par-1` in the FixtureManager to find its universe (e.g., `1`), start address (e.g., `10`), and profile.
2. Use the fixture's profile to determine the channel layout. If the profile defines channels as `[red, green, blue]`, then `red` is at offset 0, `green` at offset 1, `blue` at offset 2.
3. Calculate the absolute DMX addresses: `startAddress + offset - 1` (DMX is 1-based, arrays are 0-based).
4. Set the values in a 512-element array for that universe: `channels[9] = 255` (red), `channels[10] = 128` (green), `channels[11] = 0` (blue).

Multiple fixtures may be at different addresses within the same universe, or even span different universes. The mapper must handle all cases and merge all fixture states into per-universe channel arrays.

When a scene references a channel name that is not set (e.g., the scene only sets `red` and `green` but the profile also has `blue`), the mapper should use the channel's `defaultValue` from the profile.

---

## Steps

### 1. Create the DMX Mapper File

Create `src/scenes/dmx-mapper.ts`:

```bash
touch src/scenes/dmx-mapper.ts
```

### 2. Implement the sceneToDMX Function

The function takes a `Scene` and a `FixtureManager` and returns a `Map<number, number[]>` where each key is a universe number and each value is a 512-element array of DMX channel values.

```typescript
// src/scenes/dmx-mapper.ts

import type { Scene } from "./manager.js";
import type { FixtureManager } from "../fixtures/manager.js";
import type { Fixture, ChannelDefinition } from "../types/index.js";

/**
 * DMX universes use 512 channels, addressed 1-512.
 * Array indices are 0-511.
 */
const DMX_CHANNEL_COUNT = 512;

/**
 * Result of mapping a scene to DMX. Each key is a universe number,
 * and each value is a 512-element array of channel values (0-255).
 */
export type DMXUniverseMap = Map<number, number[]>;

/**
 * Build a lookup from channel name to its offset within the fixture profile.
 * For example, if the profile channels are [red, green, blue], the map is:
 * { red: 0, green: 1, blue: 2 }
 */
function buildChannelOffsetMap(
  channels: ChannelDefinition[]
): Map<string, { offset: number; definition: ChannelDefinition }> {
  const map = new Map<
    string,
    { offset: number; definition: ChannelDefinition }
  >();
  for (let i = 0; i < channels.length; i++) {
    map.set(channels[i].name, { offset: i, definition: channels[i] });
  }
  return map;
}

/**
 * Get or create a 512-element channel array for the given universe.
 * All values default to 0.
 */
function getOrCreateUniverseArray(
  universeMap: DMXUniverseMap,
  universe: number
): number[] {
  let channels = universeMap.get(universe);
  if (!channels) {
    channels = new Array(DMX_CHANNEL_COUNT).fill(0);
    universeMap.set(universe, channels);
  }
  return channels;
}

/**
 * Convert a scene's fixture states into raw DMX channel arrays per universe.
 *
 * For each fixture in the scene:
 * 1. Look up the fixture's universe, startAddress, and profile from FixtureManager
 * 2. Map named channels (red, green, blue, dimmer, etc.) to absolute DMX addresses
 * 3. Use the scene's channel value if set, otherwise use the profile's defaultValue
 * 4. Merge into the universe's channel array
 *
 * @param scene - The scene containing fixture states
 * @param fixtureManager - The fixture manager for looking up fixture details
 * @returns Map of universe number to 512-element DMX channel arrays
 */
export function sceneToDMX(
  scene: Scene,
  fixtureManager: FixtureManager
): DMXUniverseMap {
  const universeMap: DMXUniverseMap = new Map();

  for (const [fixtureId, channelValues] of scene.fixtureStates) {
    // Look up the fixture definition
    const fixture: Fixture = fixtureManager.getFixture(fixtureId);
    const profile = fixture.profile;
    const channels = profile.channels;

    // Build a map from channel name to offset within the profile
    const channelOffsetMap = buildChannelOffsetMap(channels);

    // Get (or create) the universe's channel array
    const universeChannels = getOrCreateUniverseArray(
      universeMap,
      fixture.universe
    );

    // For each channel in the profile, determine the value to set
    for (const [channelName, info] of channelOffsetMap) {
      // DMX address is 1-based; array index is 0-based
      const dmxAddress = fixture.startAddress + info.offset;
      const arrayIndex = dmxAddress - 1;

      // Guard against out-of-range addresses
      if (arrayIndex < 0 || arrayIndex >= DMX_CHANNEL_COUNT) {
        console.warn(
          `Fixture "${fixtureId}" channel "${channelName}" maps to ` +
          `DMX address ${dmxAddress}, which is outside the valid range 1-512. Skipping.`
        );
        continue;
      }

      // Use the scene value if provided, otherwise fall back to profile default
      const value =
        channelValues[channelName] !== undefined
          ? channelValues[channelName]
          : info.definition.defaultValue;

      universeChannels[arrayIndex] = value;
    }
  }

  return universeMap;
}
```

### 3. Update the Barrel Export

Add the dmx-mapper export to `src/scenes/index.ts`:

```typescript
// src/scenes/index.ts

export { SceneManager } from "./manager.js";
export type { Scene, SceneInfo, ChannelValues } from "./manager.js";
export { sceneToDMX } from "./dmx-mapper.js";
export type { DMXUniverseMap } from "./dmx-mapper.js";
```

### 4. Verify TypeScript Compilation

```bash
npx tsc --noEmit
```

---

## Verification

- [ ] File `src/scenes/dmx-mapper.ts` exists and exports the `sceneToDMX` function
- [ ] `sceneToDMX()` returns a `Map<number, number[]>` keyed by universe number
- [ ] Each universe array is exactly 512 elements long, initialized to 0
- [ ] A single RGB fixture at address 10 with `{ red: 255, green: 128, blue: 0 }` sets `channels[9]=255, channels[10]=128, channels[11]=0`
- [ ] Multiple fixtures in the same universe are merged into a single array
- [ ] Fixtures in different universes produce separate arrays in the Map
- [ ] Missing channel values in the scene fall back to the profile's `defaultValue`
- [ ] DMX addresses outside 1-512 are skipped with a warning (no crash)
- [ ] `src/scenes/index.ts` re-exports `sceneToDMX` and `DMXUniverseMap`
- [ ] `npx tsc --noEmit` passes with no errors

---

## Notes

- DMX addressing is 1-based (addresses 1-512), but the output arrays are 0-based (indices 0-511). The conversion is `arrayIndex = dmxAddress - 1`.
- The function sets values for ALL channels in the fixture's profile, not just the ones explicitly set in the scene. Channels not mentioned in the scene get their profile default values. This ensures the fixture is in a fully-defined state.
- The function does not clamp values to 0-255 because the SceneManager already validates values at creation/update time (Task 13).
- This function is stateless and pure (aside from the console.warn for out-of-range addresses). It takes inputs and produces outputs without side effects, making it straightforward to test.
- Performance consideration: for shows with many fixtures, this function is called each time a scene is previewed. The current implementation is O(fixtures * channels), which is efficient for typical lighting rigs (tens to low hundreds of fixtures).

---

**Next Task**: [Task 15: Implement preview_scene Tool](task-15-preview-scene-tool.md)
**Related Design Docs**: [DMX Lighting MCP Design](../../design/local.dmx-lighting-mcp.md)
