# Task 25: Implement Blackout Tool

**Milestone**: [M5 - Playback & Live Control](../../milestones/milestone-5-playback-live-control.md)
**Estimated Time**: 30 minutes
**Dependencies**: Task 4 (OLA client), Task 8 (FixtureManager for active universes)
**Status**: Not Started

---

## Objective

Implement the blackout function that sets all DMX channels to 0 across all active universes. This is an emergency/utility function that immediately kills all lights and stops any active sequencer playback.

---

## Context

Blackout is an emergency/utility function. It stops any active playback and sends all-zeros to every universe that has patched fixtures. In a live show environment, blackout is a critical safety function -- the operator (or agent) needs to be able to immediately kill all lights.

The blackout function must:
1. Stop the active CueSequencer (if playing) to prevent it from overwriting the blackout with the next cue fade
2. Determine which universes have patched fixtures (no point sending zeros to unused universes)
3. Send 512 zeros to each active universe via OLA

The blackout function lives in `src/playback/live-control.ts` alongside other direct fixture control functions (Tasks 26, 27, 28).

---

## Steps

### 1. Create the Live Control Module

```bash
touch src/playback/live-control.ts
```

### 2. Implement the Blackout Function

```typescript
// src/playback/live-control.ts

import type { OLAClient } from "../ola/client.js";
import type { FixtureManager } from "../fixtures/manager.js";
import type { CueSequencer } from "./sequencer.js";

const DMX_CHANNEL_COUNT = 512;

export interface BlackoutResult {
  success: boolean;
  universesBlackedOut: number[];
  sequencerWasStopped: boolean;
}

/**
 * Blackout: set all DMX channels to 0 across all active universes.
 *
 * This function:
 * 1. Stops the active CueSequencer if it is playing
 * 2. Collects all unique universe numbers from patched fixtures
 * 3. Sends 512 zeros to each universe via OLA
 *
 * @param olaClient - OLA REST client for sending DMX
 * @param fixtureManager - FixtureManager to determine active universes
 * @param sequencer - CueSequencer to stop if playing (optional)
 * @returns Result object with details of the blackout operation
 */
export async function blackout(
  olaClient: OLAClient,
  fixtureManager: FixtureManager,
  sequencer?: CueSequencer
): Promise<BlackoutResult> {
  // 1. Stop the sequencer if it is currently playing
  let sequencerWasStopped = false;
  if (sequencer) {
    const state = sequencer.getState();
    if (state.isPlaying) {
      sequencer.stop();
      sequencerWasStopped = true;
    }
  }

  // 2. Collect all unique universes from patched fixtures
  const allFixtures = fixtureManager.listFixtures();
  const universes = new Set<number>();
  for (const fixture of allFixtures) {
    universes.add(fixture.universe);
  }

  // 3. Send all-zeros to each universe
  const zeroChannels = new Array(DMX_CHANNEL_COUNT).fill(0);
  const universesBlackedOut: number[] = [];

  for (const universe of universes) {
    await olaClient.setDMX(universe, zeroChannels);
    universesBlackedOut.push(universe);
  }

  // Sort for consistent output
  universesBlackedOut.sort((a, b) => a - b);

  return {
    success: true,
    universesBlackedOut,
    sequencerWasStopped,
  };
}
```

### 3. Update the Barrel Export

Add the blackout export to `src/playback/index.ts`:

```typescript
// src/playback/index.ts

export { CueSequencer } from "./sequencer.js";
export type { SequencerState } from "./sequencer.js";
export { blackout } from "./live-control.js";
export type { BlackoutResult } from "./live-control.js";
```

### 4. Verify TypeScript Compilation

```bash
npx tsc --noEmit
```

---

## Verification

- [ ] File `src/playback/live-control.ts` exists and exports the `blackout` function
- [ ] `blackout()` stops the CueSequencer if it is actively playing
- [ ] `blackout()` collects all unique universes from patched fixtures
- [ ] `blackout()` sends a 512-element array of zeros to each active universe via `olaClient.setDMX`
- [ ] `blackout()` returns a `BlackoutResult` with the list of blacked-out universes
- [ ] `blackout()` reports whether the sequencer was stopped via `sequencerWasStopped`
- [ ] `blackout()` works correctly when no fixtures are patched (no universes, no OLA calls)
- [ ] `blackout()` works correctly when sequencer is null/undefined
- [ ] `blackout()` handles multiple universes (e.g., fixtures on universes 1, 2, and 5)
- [ ] `src/playback/index.ts` re-exports `blackout` and `BlackoutResult`
- [ ] `npx tsc --noEmit` passes with no errors

---

## Notes

- The blackout function accepts an optional `sequencer` parameter. This makes it usable both when a sequencer exists (during show playback) and in simpler setups where only direct control is used.
- The function sends zeros to all universes sequentially. For setups with many universes, this could be parallelized with `Promise.all`, but sequential is simpler and DMX latency is typically 1-5ms per call, so even 10 universes would complete in under 50ms.
- The zero-channel array is created once and reused for all universes. Since `olaClient.setDMX` does not mutate the array, this is safe.
- Blackout does not "remember" the previous state. If the operator wants to restore lights after a blackout, they need to re-trigger a scene or cue. A future enhancement could add a "restore from blackout" function that caches the pre-blackout state.
- If OLA is unreachable, `olaClient.setDMX` will throw an `OLAConnectionError`. The caller (MCP tool handler) should catch this and report it to the agent.

---

**Next Task**: [Task 26: Implement set_fixture_color Tool](task-26-set-fixture-color-tool.md)
**Related Design Docs**: [DMX Lighting MCP Design](../../design/local.dmx-lighting-mcp.md)
