# Task 19: Implement Fade Engine

**Milestone**: [M4 - Cue Management & Fade Engine](../../milestones/milestone-4-cue-management-fade-engine.md)
**Estimated Time**: 1.5 hours
**Dependencies**: Task 4 (OLA client), Task 14 (DMX mapper)
**Status**: Not Started

---

## Objective

Implement the `FadeEngine` class that interpolates between two DMX channel states over a configurable duration, pushing intermediate values to OLA at approximately 40 frames per second (~25ms per frame). This is the most timing-critical code in the system.

---

## Context

When transitioning between scenes (cues), DMX channel values need to smoothly interpolate from their current state to the target state. The fade engine takes a "from" channel state and a "to" channel state, a duration in milliseconds, and pushes interpolated values to OLA at ~40fps for smooth visual transitions.

The fade engine is the bridge between the cue sequencer (Milestone 5) and the OLA client (Task 4). During a fade:

1. Calculate the total number of steps based on duration and target frame rate (~40fps = 25ms per frame)
2. For each step, calculate `progress` (0.0 to 1.0)
3. Interpolate every channel: `value = Math.round(fromVal + (toVal - fromVal) * progress)`
4. Build a 512-element channel array and push to OLA via `setDMX`
5. Wait until the next frame time using `performance.now()` for precise timing

The channel states are represented as `Map<number, number>` where keys are 0-based DMX channel indices (0-511) and values are DMX values (0-255). This is the output format produced by the `sceneToDMX()` function from Task 14.

Key requirements:
- Support cancellation via `AbortSignal` so fades can be interrupted (e.g., when the operator hits "go" again mid-fade)
- Handle 0ms duration as an instant snap (set target values immediately, no interpolation)
- Use monotonic clock (`performance.now()`) to avoid drift from `setTimeout` inaccuracy
- The engine must be fully async and non-blocking

The design document specifies this pattern:

```typescript
class FadeEngine {
  async executeFade(
    from: Map<number, number>,   // channel → value
    to: Map<number, number>,
    durationMs: number,
    universe: number,
    ola: OLAClient
  ): Promise<void> {
    const fps = 40;
    const steps = Math.max(1, Math.floor(durationMs / (1000 / fps)));
    // ... interpolation loop
  }
}
```

---

## Steps

### 1. Create the Fade Engine File

Create `src/cues/fade-engine.ts`:

```bash
touch src/cues/fade-engine.ts
```

### 2. Implement the FadeEngine Class

```typescript
// src/cues/fade-engine.ts

import type { OLAClient } from "../ola/client.js";

/**
 * DMX universes use 512 channels (indices 0-511).
 */
const DMX_CHANNEL_COUNT = 512;

/**
 * Target frame rate for fade interpolation.
 * 40fps = 25ms per frame, which is smooth enough for lighting
 * and achievable over the OLA REST API.
 */
const TARGET_FPS = 40;

/**
 * Milliseconds per frame at the target frame rate.
 */
const FRAME_INTERVAL_MS = 1000 / TARGET_FPS; // 25ms

/**
 * Utility to sleep for a given number of milliseconds.
 * Returns a promise that resolves after the delay.
 */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * FadeEngine interpolates between two DMX channel states over a
 * configurable duration, pushing intermediate values to OLA at ~40fps.
 *
 * This is the most timing-critical component in the system. It uses
 * performance.now() for monotonic timing to avoid drift from
 * setTimeout inaccuracy.
 */
export class FadeEngine {
  /**
   * Execute a fade (crossfade) between two DMX channel states.
   *
   * Interpolates linearly from the "from" state to the "to" state
   * over the given duration, pushing intermediate values to OLA
   * at approximately 40 frames per second.
   *
   * @param from - Starting channel state. Map of 0-based channel index to DMX value (0-255).
   * @param to - Target channel state. Map of 0-based channel index to DMX value (0-255).
   * @param durationMs - Fade duration in milliseconds. 0 means instant snap.
   * @param universe - DMX universe number to push values to.
   * @param olaClient - OLA client instance for sending DMX data.
   * @param signal - Optional AbortSignal for cancelling the fade mid-execution.
   * @throws {Error} If the fade is aborted via the AbortSignal.
   */
  async executeFade(
    from: Map<number, number>,
    to: Map<number, number>,
    durationMs: number,
    universe: number,
    olaClient: OLAClient,
    signal?: AbortSignal
  ): Promise<void> {
    // Handle instant snap (0ms duration)
    if (durationMs <= 0) {
      const channels = this.buildChannelArray(to);
      await olaClient.setDMX(universe, channels);
      return;
    }

    // Check if already aborted before starting
    if (signal?.aborted) {
      throw new Error("Fade aborted before starting");
    }

    // Calculate number of interpolation steps
    // At 40fps, each step is 25ms. For a 1000ms fade, that's 40 steps.
    const steps = Math.max(1, Math.floor(durationMs / FRAME_INTERVAL_MS));

    // Collect all channels that appear in either from or to
    const allChannels = this.collectAllChannels(from, to);

    // Record the start time using monotonic clock
    const startTime = performance.now();

    for (let step = 0; step <= steps; step++) {
      // Check for cancellation
      if (signal?.aborted) {
        throw new Error("Fade aborted");
      }

      // Calculate progress (0.0 to 1.0)
      const progress = step / steps;

      // Interpolate all channels at this progress point
      const interpolated = this.interpolate(from, to, allChannels, progress);

      // Build 512-element channel array and push to OLA
      const channels = this.buildChannelArray(interpolated);
      await olaClient.setDMX(universe, channels);

      // Wait until the next frame time (except for the last step)
      if (step < steps) {
        const nextFrameTime = startTime + (step + 1) * FRAME_INTERVAL_MS;
        const now = performance.now();
        const sleepTime = nextFrameTime - now;

        if (sleepTime > 0) {
          await sleep(sleepTime);
        }
        // If sleepTime <= 0, we're running behind schedule.
        // Skip the sleep and push the next frame immediately
        // to catch up. The timing will self-correct because
        // we calculate nextFrameTime from the absolute start time.
      }
    }

    // Ensure the final state is exactly the target (no rounding drift)
    const finalChannels = this.buildChannelArray(to);
    await olaClient.setDMX(universe, finalChannels);
  }

  /**
   * Collect all unique channel indices that appear in either the
   * "from" or "to" state.
   */
  private collectAllChannels(
    from: Map<number, number>,
    to: Map<number, number>
  ): number[] {
    const channelSet = new Set<number>();
    for (const ch of from.keys()) {
      channelSet.add(ch);
    }
    for (const ch of to.keys()) {
      channelSet.add(ch);
    }
    return Array.from(channelSet);
  }

  /**
   * Interpolate between "from" and "to" states at the given progress.
   *
   * For each channel:
   * - fromVal = from.get(ch) ?? 0
   * - toVal = to.get(ch) ?? 0
   * - interpolated = Math.round(fromVal + (toVal - fromVal) * progress)
   *
   * @param from - Starting state
   * @param to - Target state
   * @param channels - All channel indices to interpolate
   * @param progress - Interpolation progress, 0.0 (start) to 1.0 (end)
   * @returns Map of channel index to interpolated value
   */
  private interpolate(
    from: Map<number, number>,
    to: Map<number, number>,
    channels: number[],
    progress: number
  ): Map<number, number> {
    const result = new Map<number, number>();

    for (const ch of channels) {
      const fromVal = from.get(ch) ?? 0;
      const toVal = to.get(ch) ?? 0;
      const value = Math.round(fromVal + (toVal - fromVal) * progress);
      result.set(ch, value);
    }

    return result;
  }

  /**
   * Build a 512-element DMX channel array from a channel state map.
   * Channels not present in the map default to 0.
   *
   * @param state - Map of 0-based channel index to DMX value
   * @returns 512-element array of DMX values
   */
  private buildChannelArray(state: Map<number, number>): number[] {
    const channels = new Array(DMX_CHANNEL_COUNT).fill(0);
    for (const [ch, value] of state) {
      if (ch >= 0 && ch < DMX_CHANNEL_COUNT) {
        channels[ch] = value;
      }
    }
    return channels;
  }
}
```

### 3. Update the Barrel Export

Add the fade engine export to `src/cues/index.ts`:

```typescript
// src/cues/index.ts

export { CueManager } from "./manager.js";
export type { CueListInfo } from "./manager.js";
export { FadeEngine } from "./fade-engine.js";
```

### 4. Verify TypeScript Compilation

```bash
npx tsc --noEmit
```

---

## Verification

- [ ] File `src/cues/fade-engine.ts` exists and exports the `FadeEngine` class
- [ ] `executeFade()` accepts `from`, `to` (both `Map<number, number>`), `durationMs`, `universe`, `olaClient`, and optional `signal` (AbortSignal)
- [ ] `executeFade()` with `durationMs=0` instantly sets the target values via a single `setDMX` call
- [ ] `executeFade()` calculates correct number of steps: `Math.max(1, Math.floor(durationMs / 25))`
- [ ] `executeFade()` interpolates channel values linearly: `Math.round(fromVal + (toVal - fromVal) * progress)`
- [ ] `executeFade()` pushes a 512-element channel array to OLA each step
- [ ] `executeFade()` uses `performance.now()` for monotonic timing
- [ ] `executeFade()` sends a final frame at exactly the target values to avoid rounding drift
- [ ] `executeFade()` checks `signal.aborted` before each step and throws if aborted
- [ ] `executeFade()` throws immediately if signal is already aborted before starting
- [ ] Channels present in "to" but not "from" interpolate from 0
- [ ] Channels present in "from" but not "to" interpolate to 0
- [ ] `src/cues/index.ts` re-exports `FadeEngine`
- [ ] `npx tsc --noEmit` passes with no errors

---

## Notes

- The fade engine uses linear interpolation. More advanced easing curves (ease-in, ease-out, S-curve) could be added later by making the interpolation function configurable. Linear interpolation is standard for DMX lighting and matches the behavior of most lighting consoles.
- The `performance.now()` monotonic clock is critical for accurate timing. Using `Date.now()` would be susceptible to system clock adjustments. Using a simple `setTimeout` chain would accumulate drift over long fades.
- The engine sends a final frame at exactly the target values after the interpolation loop completes. This ensures that the final state is precisely the target values, even if rounding during interpolation introduced small errors on intermediate frames.
- The channel state format (`Map<number, number>`) uses 0-based channel indices, matching the array format expected by `OLAClient.setDMX()`. The `sceneToDMX()` function (Task 14) produces 512-element arrays; the caller will need to convert these to Maps before passing to the fade engine. Alternatively, the cue sequencer (Milestone 5) can extract the relevant channel values from the scene DMX arrays.
- When the fade engine falls behind schedule (e.g., because OLA takes longer than expected to process a `setDMX` call), it skips the sleep and sends the next frame immediately. This self-corrects because frame times are calculated as absolute offsets from the start time, not relative to the previous frame.
- The `AbortSignal` support is essential for the cue sequencer (Milestone 5). When an operator triggers "go" mid-fade, the current fade must be cancelled immediately so the new fade can begin. Without cancellation support, overlapping fades would conflict on the same DMX channels.
- The `sleep()` utility uses `setTimeout` which has ~4ms minimum resolution in Node.js. For a 25ms target frame interval, this is acceptable and results in actual frame rates of 30-40fps depending on system load.

---

**Next Task**: [Task 20: Implement Cue Management Tools](task-20-cue-management-tools.md)
**Related Design Docs**: [DMX Lighting MCP Design](../../design/local.dmx-lighting-mcp.md)
