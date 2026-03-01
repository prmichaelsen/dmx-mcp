# Task 24: Implement Cue Sequencer

**Milestone**: [M5 - Playback & Live Control](../../milestones/milestone-5-playback-live-control.md)
**Estimated Time**: 2 hours
**Dependencies**: Task 18 (CueManager), Task 19 (FadeEngine), Task 14 (DMX mapper)
**Status**: Not Started

---

## Objective

Create a `CueSequencer` class that orchestrates playback of cue lists. The sequencer supports advancing to the next cue (`goCue`), jumping to a specific cue (`goToCue`), and stopping playback (`stop`). It drives the FadeEngine to execute timed transitions between scenes and manages hold times, looping, and cancellation.

---

## Context

The sequencer is the show runtime. It tracks the current position in a cue list, executes fades between scenes using the FadeEngine, manages hold times, and supports looping. Only one cue list should be active at a time.

When the sequencer receives a `goCue()` call, it:
1. Looks up the current cue in the active cue list
2. Resolves the cue's scene via the SceneManager
3. Maps the scene to raw DMX channel values via `sceneToDMX`
4. Executes a fade from the current DMX state to the new scene's DMX state using the FadeEngine
5. Waits for the cue's `holdMs` duration
6. Auto-advances to the next cue (unless stopped or the list has ended)

The sequencer uses `AbortController` to make active fades and hold waits cancellable. When `stop()` is called, any in-progress fade is aborted and the current DMX state is held as-is. When `goToCue()` is called, any in-progress operation is cancelled before jumping to the target cue.

The `CueSequencer` depends on:
- **CueManager** (Task 18) -- to look up cue lists and their cues
- **SceneManager** (Task 13) -- to resolve scene IDs to Scene objects
- **sceneToDMX** (Task 14) -- to convert scenes to raw DMX channel arrays
- **FadeEngine** (Task 19) -- to interpolate between DMX states over time
- **OLAClient** (Task 4) -- to read current DMX state for fade-from values

---

## Steps

### 1. Create the Sequencer File

```bash
mkdir -p src/playback
touch src/playback/sequencer.ts
```

### 2. Implement the CueSequencer Class

```typescript
// src/playback/sequencer.ts

import type { OLAClient } from "../ola/client.js";
import type { SceneManager } from "../scenes/manager.js";
import type { FixtureManager } from "../fixtures/manager.js";
import type { FadeEngine } from "../cues/fade-engine.js";
import type { CueManager } from "../cues/manager.js";
import type { Cue, CueList } from "../types/index.js";
import { sceneToDMX, type DMXUniverseMap } from "../scenes/dmx-mapper.js";

/**
 * Utility to create a cancellable delay.
 * Returns a promise that resolves after `ms` milliseconds,
 * or rejects if the AbortSignal is aborted.
 */
function cancellableDelay(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    if (signal.aborted) {
      reject(new DOMException("Aborted", "AbortError"));
      return;
    }

    const timer = setTimeout(() => {
      signal.removeEventListener("abort", onAbort);
      resolve();
    }, ms);

    function onAbort() {
      clearTimeout(timer);
      reject(new DOMException("Aborted", "AbortError"));
    }

    signal.addEventListener("abort", onAbort, { once: true });
  });
}

export interface SequencerState {
  /** ID of the currently active cue list, or null if idle */
  activeCueListId: string | null;
  /** Index of the current cue within the active cue list */
  currentCueIndex: number;
  /** Whether the sequencer is actively playing (advancing through cues) */
  isPlaying: boolean;
  /** ID of the cue currently being executed, or null */
  currentCueId: string | null;
}

export class CueSequencer {
  private readonly olaClient: OLAClient;
  private readonly sceneManager: SceneManager;
  private readonly fixtureManager: FixtureManager;
  private readonly fadeEngine: FadeEngine;
  private readonly cueManager: CueManager;

  private activeCueList: CueList | null = null;
  private currentCueIndex: number = 0;
  private isPlaying: boolean = false;
  private abortController: AbortController | null = null;

  constructor(deps: {
    olaClient: OLAClient;
    sceneManager: SceneManager;
    fixtureManager: FixtureManager;
    fadeEngine: FadeEngine;
    cueManager: CueManager;
  }) {
    this.olaClient = deps.olaClient;
    this.sceneManager = deps.sceneManager;
    this.fixtureManager = deps.fixtureManager;
    this.fadeEngine = deps.fadeEngine;
    this.cueManager = deps.cueManager;
  }

  /**
   * Start playback of a cue list. Loads the cue list, resets to
   * position 0, and begins executing the first cue.
   *
   * If another cue list is already playing, it is stopped first.
   *
   * @param cueListId - ID of the cue list to play
   */
  async start(cueListId: string): Promise<void> {
    // Stop any active playback
    this.cancelActive();

    // Load the cue list from the CueManager
    const cueList = this.cueManager.getCueList(cueListId);
    if (!cueList) {
      throw new Error(`Cue list "${cueListId}" not found`);
    }

    if (cueList.cues.length === 0) {
      throw new Error(`Cue list "${cueListId}" has no cues`);
    }

    this.activeCueList = cueList;
    this.currentCueIndex = 0;
    this.isPlaying = true;

    // Begin executing from cue 0
    await this.executeCueAtIndex(0);
  }

  /**
   * Advance to the next cue in the active cue list.
   * If already at the last cue and the list loops, wraps to cue 0.
   * If at the last cue and the list does not loop, stops playback.
   *
   * @throws Error if no cue list is active
   */
  async goCue(): Promise<void> {
    if (!this.activeCueList) {
      throw new Error("No active cue list. Call start(cueListId) first.");
    }

    // Cancel any in-progress fade or hold
    this.cancelActive();

    const nextIndex = this.currentCueIndex + 1;

    if (nextIndex >= this.activeCueList.cues.length) {
      if (this.activeCueList.loop) {
        // Wrap around to the beginning
        this.isPlaying = true;
        await this.executeCueAtIndex(0);
      } else {
        // Reached the end of the list, stop
        this.isPlaying = false;
      }
    } else {
      this.isPlaying = true;
      await this.executeCueAtIndex(nextIndex);
    }
  }

  /**
   * Jump to a specific cue by its ID within the active cue list.
   *
   * @param cueId - The ID of the cue to jump to
   * @throws Error if no cue list is active or cue not found in the list
   */
  async goToCue(cueId: string): Promise<void> {
    if (!this.activeCueList) {
      throw new Error("No active cue list. Call start(cueListId) first.");
    }

    const index = this.activeCueList.cues.findIndex(
      (cue) => cue.id === cueId
    );
    if (index === -1) {
      throw new Error(
        `Cue "${cueId}" not found in cue list "${this.activeCueList.id}"`
      );
    }

    // Cancel any in-progress fade or hold
    this.cancelActive();

    this.isPlaying = true;
    await this.executeCueAtIndex(index);
  }

  /**
   * Stop playback. Cancels any active fade or hold wait and
   * holds the current DMX state as-is.
   */
  stop(): void {
    this.cancelActive();
    this.isPlaying = false;
  }

  /**
   * Get the current state of the sequencer.
   */
  getState(): SequencerState {
    return {
      activeCueListId: this.activeCueList?.id ?? null,
      currentCueIndex: this.currentCueIndex,
      isPlaying: this.isPlaying,
      currentCueId:
        this.activeCueList?.cues[this.currentCueIndex]?.id ?? null,
    };
  }

  /**
   * Execute the cue at the given index. This is the core playback loop:
   *
   * 1. Read current DMX state from OLA (fade-from values)
   * 2. Resolve the cue's scene and map to DMX (fade-to values)
   * 3. Execute fade via FadeEngine
   * 4. Wait for the cue's holdMs duration
   * 5. Auto-advance to next cue if still playing
   */
  private async executeCueAtIndex(index: number): Promise<void> {
    if (!this.activeCueList) return;

    this.currentCueIndex = index;
    const cue = this.activeCueList.cues[index];

    // Create a new AbortController for this cue execution
    this.abortController = new AbortController();
    const signal = this.abortController.signal;

    try {
      // 1. Resolve the cue's target scene to DMX values
      const scene = this.sceneManager.getScene(cue.scene);
      const targetDMX: DMXUniverseMap = sceneToDMX(
        scene,
        this.fixtureManager
      );

      // 2. For each universe in the target, read current state and fade
      for (const [universe, targetChannels] of targetDMX) {
        if (signal.aborted) break;

        // Read current DMX state from OLA as the fade-from values
        let currentChannels: number[];
        try {
          currentChannels = await this.olaClient.getDMX(universe);
          // Pad to 512 if OLA returns fewer channels
          while (currentChannels.length < 512) {
            currentChannels.push(0);
          }
        } catch {
          // If we can't read current state, start from all zeros
          currentChannels = new Array(512).fill(0);
        }

        // Build channel maps for the FadeEngine
        const fromMap = new Map<number, number>();
        const toMap = new Map<number, number>();

        for (let ch = 0; ch < 512; ch++) {
          const fromVal = currentChannels[ch] ?? 0;
          const toVal = targetChannels[ch] ?? 0;

          // Only include channels that differ or are explicitly set
          if (fromVal !== 0 || toVal !== 0) {
            fromMap.set(ch, fromVal);
            toMap.set(ch, toVal);
          }
        }

        // 3. Execute the fade
        await this.fadeEngine.executeFade(
          fromMap,
          toMap,
          cue.fadeInMs,
          universe,
          this.olaClient,
          signal
        );
      }

      // 4. Wait for hold time (if any)
      if (cue.holdMs > 0 && !signal.aborted) {
        await cancellableDelay(cue.holdMs, signal);
      }

      // 5. Auto-advance to next cue if still playing
      if (this.isPlaying && !signal.aborted) {
        const nextIndex = index + 1;

        if (nextIndex < this.activeCueList.cues.length) {
          await this.executeCueAtIndex(nextIndex);
        } else if (this.activeCueList.loop) {
          await this.executeCueAtIndex(0);
        } else {
          // Reached end of non-looping list
          this.isPlaying = false;
        }
      }
    } catch (error) {
      // AbortError is expected when stop() or goToCue() cancels us
      if (
        error instanceof DOMException &&
        error.name === "AbortError"
      ) {
        // Cancelled -- silently exit
        return;
      }
      // Re-throw unexpected errors
      throw error;
    }
  }

  /**
   * Cancel any in-progress fade or hold wait by aborting
   * the active AbortController.
   */
  private cancelActive(): void {
    if (this.abortController) {
      this.abortController.abort();
      this.abortController = null;
    }
  }
}
```

### 3. Note on FadeEngine AbortSignal Support

The `executeFade` method on the FadeEngine (Task 19) may need to accept an optional `AbortSignal` parameter to support cancellation. If the existing FadeEngine does not accept a signal, it should be updated to check `signal.aborted` at each step of the interpolation loop:

```typescript
// In src/cues/fade-engine.ts, update executeFade signature:

async executeFade(
  from: Map<number, number>,
  to: Map<number, number>,
  durationMs: number,
  universe: number,
  ola: OLAClient,
  signal?: AbortSignal   // <-- add optional signal
): Promise<void> {
  const fps = 40;
  const steps = Math.max(1, Math.floor(durationMs / (1000 / fps)));

  for (let step = 0; step <= steps; step++) {
    // Check for cancellation at each step
    if (signal?.aborted) {
      throw new DOMException("Aborted", "AbortError");
    }

    const progress = step / steps;
    const interpolated = this.interpolate(from, to, progress);
    await ola.setDMX(universe, interpolated);

    if (step < steps) {
      await sleep(1000 / fps);
    }
  }
}
```

### 4. Create the Barrel Export

Create `src/playback/index.ts`:

```typescript
// src/playback/index.ts

export { CueSequencer } from "./sequencer.js";
export type { SequencerState } from "./sequencer.js";
```

### 5. Verify TypeScript Compilation

```bash
npx tsc --noEmit
```

---

## Verification

- [ ] File `src/playback/sequencer.ts` exists and exports the `CueSequencer` class
- [ ] `start(cueListId)` loads a cue list from CueManager and begins playback at cue 0
- [ ] `start()` throws if the cue list ID is not found
- [ ] `start()` throws if the cue list has zero cues
- [ ] `start()` stops any previously active cue list before starting the new one
- [ ] `goCue()` advances to the next cue and executes the fade
- [ ] `goCue()` wraps to cue 0 when reaching the end of a looping cue list
- [ ] `goCue()` stops playback when reaching the end of a non-looping cue list
- [ ] `goCue()` throws if no cue list is active
- [ ] `goToCue(cueId)` jumps to the specified cue within the active list
- [ ] `goToCue()` throws if the cue ID is not found in the active list
- [ ] `goToCue()` cancels any in-progress fade before jumping
- [ ] `stop()` cancels any active fade via AbortController
- [ ] `stop()` holds the current DMX state (does not send additional values)
- [ ] `stop()` sets `isPlaying` to false
- [ ] `getState()` returns the current sequencer state
- [ ] The sequencer reads current DMX values from OLA before fading (for correct fade-from)
- [ ] Scenes are resolved via SceneManager and mapped to DMX via sceneToDMX
- [ ] Hold times between cues are respected
- [ ] AbortError exceptions from cancelled fades are caught silently
- [ ] `src/playback/index.ts` barrel export exists
- [ ] `npx tsc --noEmit` passes with no errors

---

## Notes

- Only one cue list can be active at a time. Calling `start()` while another list is playing stops the previous list.
- The `cancellableDelay` utility wraps `setTimeout` in a promise that rejects on abort. This allows hold times to be cancelled immediately when `stop()` or `goToCue()` is called.
- The FadeEngine may need to be updated (Task 19) to accept an `AbortSignal` parameter for cancellation support. If it was not originally designed with this, the sequencer is the right place to introduce the requirement.
- When OLA is unreachable for reading current DMX state, the sequencer falls back to all-zero starting values rather than failing. This is a pragmatic choice -- the show must go on.
- The auto-advance mechanism is recursive (`executeCueAtIndex` calls itself for the next cue). This is bounded by the number of cues in the list, so stack depth is not a concern for typical show sizes (< 1000 cues). For very large cue lists, consider converting to an iterative approach.
- The sequencer does not persist its state. If the server restarts, playback state is lost. Persistence of playback position could be added in a future milestone.

---

**Next Task**: [Task 25: Implement Blackout Tool](task-25-blackout-tool.md)
**Related Design Docs**: [DMX Lighting MCP Design](../../design/local.dmx-lighting-mcp.md)
