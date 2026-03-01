# Task 32: Implement Effect Engine Base

**Milestone**: [M6 - Show Management & Effects](../../milestones/milestone-6-show-management-effects.md)
**Estimated Time**: 1.5 hours
**Dependencies**: Task 4 (OLA REST Client), Task 8 (FixtureManager), Task 14 (DMX Mapper)
**Status**: Not Started

---

## Objective

Create an `EffectEngine` base class with an effect loop that applies dynamic patterns to fixtures. The engine manages the lifecycle of effects (start, run, stop), runs async loops that continuously update DMX values, and supports multiple simultaneous effects on different fixture groups.

---

## Context

Effects are fundamentally different from scenes. Scenes are static snapshots -- you set them once and the lights stay at those values. Effects are dynamic, ongoing patterns that continuously change DMX values over time. Examples include chase (sequential activation), rainbow (color cycling), and strobe (rapid flashing).

The EffectEngine runs a loop for each active effect. On each iteration (~40 times per second), it calculates the current DMX values based on the effect's algorithm and elapsed time, then pushes them to OLA. Multiple effects can run simultaneously on different fixture groups (e.g., a chase on the front wash and a rainbow on the back wash).

Effects need to be cancellable. When `stopEffect()` is called, the engine signals the effect's loop to stop via an AbortController. The architecture uses a strategy pattern: each effect type implements a `calculate()` function that the engine calls on every loop iteration.

---

## Steps

### 1. Create the Effects Module

```bash
mkdir -p src/effects
touch src/effects/engine.ts
```

### 2. Define the Effect Interfaces

```typescript
// src/effects/engine.ts

import type { OLAClient } from "../ola/client.js";
import type { FixtureManager } from "../fixtures/manager.js";
import type { Fixture, ChannelValues } from "../types/index.js";

/**
 * Supported effect types. Each type has a corresponding EffectCalculator.
 */
export type EffectType = "chase" | "rainbow" | "strobe";

/**
 * Parameters that control an effect's behavior.
 * Different effect types use different subsets of these parameters.
 */
export interface EffectParams {
  /** Speed multiplier (default: 1.0). Higher = faster. */
  speed?: number;
  /** Base color for effects that use it (e.g., strobe). RGB values 0-255. */
  color?: { red: number; green: number; blue: number };
  /** Flash rate in Hz for strobe (default: 5) */
  rate?: number;
  /** Duty cycle for strobe: 0.0-1.0, fraction of time "on" (default: 0.5) */
  dutyCycle?: number;
  /** Master intensity: 0-255 (default: 255) */
  intensity?: number;
}

/**
 * An active effect instance. Tracks the effect's configuration,
 * the fixtures it targets, and the abort controller for cancellation.
 */
export interface ActiveEffect {
  /** Unique effect instance ID */
  id: string;
  /** Effect type (chase, rainbow, strobe) */
  type: EffectType;
  /** IDs of fixtures this effect targets */
  fixtureIds: string[];
  /** Effect parameters */
  params: EffectParams;
  /** Abort controller to cancel the effect loop */
  abortController: AbortController;
  /** Timestamp when the effect started (for elapsed time calculation) */
  startedAt: number;
}

/**
 * Function signature for effect calculators.
 *
 * Given the target fixtures and elapsed time, returns a map of
 * fixture ID to channel values that should be applied at this moment.
 *
 * This is the strategy pattern: each effect type implements this
 * function with its own algorithm.
 *
 * @param fixtures - The fixtures this effect targets
 * @param elapsedMs - Milliseconds since the effect started
 * @param params - Effect parameters (speed, color, rate, etc.)
 * @returns Map of fixture ID to channel values
 */
export type EffectCalculator = (
  fixtures: Fixture[],
  elapsedMs: number,
  params: EffectParams
) => Map<string, ChannelValues>;
```

### 3. Implement the EffectEngine Class

```typescript
// Continued in src/effects/engine.ts

/**
 * Target loop interval in milliseconds.
 * ~25ms = 40 FPS, which is the standard DMX refresh rate.
 */
const LOOP_INTERVAL_MS = 25;

/**
 * Manages the lifecycle of dynamic lighting effects.
 *
 * The engine supports multiple simultaneous effects, each running
 * its own async loop. Effects are registered by type via the
 * registerEffect() method, which maps an EffectType string to
 * an EffectCalculator function.
 *
 * Usage:
 *   const engine = new EffectEngine(olaClient, fixtureManager);
 *   engine.registerEffect("chase", chaseCalculator);
 *   const effectId = await engine.startEffect("chase", ["par-1", "par-2"], { speed: 1.5 });
 *   // ... later ...
 *   engine.stopEffect(effectId);
 */
export class EffectEngine {
  private readonly olaClient: OLAClient;
  private readonly fixtureManager: FixtureManager;
  private readonly activeEffects: Map<string, ActiveEffect> = new Map();
  private readonly calculators: Map<EffectType, EffectCalculator> =
    new Map();
  private nextEffectId: number = 1;

  constructor(olaClient: OLAClient, fixtureManager: FixtureManager) {
    this.olaClient = olaClient;
    this.fixtureManager = fixtureManager;
  }

  /**
   * Register an effect calculator for a given effect type.
   *
   * Must be called before startEffect() can be used with that type.
   * Typically called once during server initialization to register
   * all built-in effect types.
   *
   * @param type - The effect type identifier
   * @param calculator - The function that calculates DMX values each frame
   */
  registerEffect(type: EffectType, calculator: EffectCalculator): void {
    this.calculators.set(type, calculator);
  }

  /**
   * Start a new effect on the specified fixtures.
   *
   * Creates an ActiveEffect, starts an async loop that calls the
   * calculator on every iteration, and pushes the resulting DMX
   * values to OLA.
   *
   * @param type - The effect type to apply
   * @param fixtureIds - IDs of fixtures to target
   * @param params - Parameters controlling the effect behavior
   * @returns The effect instance ID (for later stopEffect() calls)
   * @throws Error if the effect type is not registered
   * @throws Error if any fixture ID is not found in FixtureManager
   */
  startEffect(
    type: EffectType,
    fixtureIds: string[],
    params: EffectParams = {}
  ): string {
    // Validate effect type is registered
    const calculator = this.calculators.get(type);
    if (!calculator) {
      throw new Error(
        `Unknown effect type "${type}". ` +
        `Registered types: ${Array.from(this.calculators.keys()).join(", ")}`
      );
    }

    // Validate all fixture IDs exist
    const fixtures: Fixture[] = [];
    for (const fixtureId of fixtureIds) {
      const fixture = this.fixtureManager.getFixture(fixtureId);
      if (!fixture) {
        throw new Error(
          `Fixture "${fixtureId}" not found. ` +
          `Fixtures must be patched before applying effects.`
        );
      }
      fixtures.push(fixture);
    }

    // Create the active effect
    const effectId = `effect-${this.nextEffectId++}`;
    const abortController = new AbortController();

    const activeEffect: ActiveEffect = {
      id: effectId,
      type,
      fixtureIds: [...fixtureIds],
      params,
      abortController,
      startedAt: Date.now(),
    };

    this.activeEffects.set(effectId, activeEffect);

    // Start the async effect loop (fire-and-forget)
    this.runEffectLoop(activeEffect, calculator, fixtures).catch(
      (error) => {
        // Only log if not aborted (aborted is expected on stop)
        if (!abortController.signal.aborted) {
          console.error(
            `Effect "${effectId}" (${type}) loop error:`,
            error
          );
        }
        // Clean up on unexpected error
        this.activeEffects.delete(effectId);
      }
    );

    return effectId;
  }

  /**
   * Stop a running effect by its ID.
   *
   * Signals the effect's abort controller to cancel the loop.
   * The effect is removed from the active effects map.
   *
   * @param effectId - The effect instance ID returned by startEffect()
   * @throws Error if the effect ID is not found
   */
  stopEffect(effectId: string): void {
    const effect = this.activeEffects.get(effectId);
    if (!effect) {
      throw new Error(
        `Effect "${effectId}" not found. ` +
        `Active effects: ${Array.from(this.activeEffects.keys()).join(", ") || "none"}`
      );
    }

    effect.abortController.abort();
    this.activeEffects.delete(effectId);
  }

  /**
   * Stop all running effects.
   */
  stopAll(): void {
    for (const effect of this.activeEffects.values()) {
      effect.abortController.abort();
    }
    this.activeEffects.clear();
  }

  /**
   * Get a list of all active effects.
   */
  listActiveEffects(): Array<{
    id: string;
    type: EffectType;
    fixtureIds: string[];
    params: EffectParams;
    runningMs: number;
  }> {
    const now = Date.now();
    return Array.from(this.activeEffects.values()).map((effect) => ({
      id: effect.id,
      type: effect.type,
      fixtureIds: effect.fixtureIds,
      params: effect.params,
      runningMs: now - effect.startedAt,
    }));
  }

  /**
   * Get the number of active effects.
   */
  getActiveEffectCount(): number {
    return this.activeEffects.size;
  }

  /**
   * The main effect loop. Runs continuously until the effect is
   * aborted or an error occurs.
   *
   * On each iteration:
   * 1. Calculate elapsed time since effect start
   * 2. Call the effect calculator to get DMX values for each fixture
   * 3. Map channel values to absolute DMX addresses
   * 4. Push DMX values to OLA per universe
   * 5. Sleep for LOOP_INTERVAL_MS
   */
  private async runEffectLoop(
    effect: ActiveEffect,
    calculator: EffectCalculator,
    fixtures: Fixture[]
  ): Promise<void> {
    const { abortController } = effect;

    while (!abortController.signal.aborted) {
      const elapsedMs = Date.now() - effect.startedAt;

      // Calculate current values for each fixture
      const fixtureValues = calculator(
        fixtures,
        elapsedMs,
        effect.params
      );

      // Group by universe and build DMX channel arrays
      const universeChannels = new Map<number, number[]>();

      for (const [fixtureId, channelValues] of fixtureValues) {
        const fixture = fixtures.find((f) => f.id === fixtureId);
        if (!fixture) continue;

        // Get or create the universe channel array
        let channels = universeChannels.get(fixture.universe);
        if (!channels) {
          channels = new Array(512).fill(0);
          universeChannels.set(fixture.universe, channels);
        }

        // Map named channels to absolute DMX addresses
        for (const channelDef of fixture.profile.channels) {
          const offset = fixture.profile.channels.indexOf(channelDef);
          const dmxAddress = fixture.startAddress + offset;
          const arrayIndex = dmxAddress - 1;

          if (arrayIndex >= 0 && arrayIndex < 512) {
            const value = channelValues[channelDef.name];
            if (value !== undefined) {
              channels[arrayIndex] = Math.round(
                Math.min(255, Math.max(0, value))
              );
            }
          }
        }
      }

      // Push DMX values to OLA for each universe
      for (const [universe, channels] of universeChannels) {
        try {
          await this.olaClient.setDMX(universe, channels);
        } catch (error) {
          // Log but don't crash the loop on transient OLA errors
          if (!abortController.signal.aborted) {
            console.warn(
              `Effect "${effect.id}": Failed to set DMX for universe ${universe}:`,
              error instanceof Error ? error.message : String(error)
            );
          }
        }
      }

      // Sleep until next frame
      await this.sleep(LOOP_INTERVAL_MS, abortController.signal);
    }
  }

  /**
   * Sleep for the specified duration, but return early if the
   * abort signal fires.
   */
  private sleep(
    ms: number,
    signal: AbortSignal
  ): Promise<void> {
    return new Promise((resolve) => {
      if (signal.aborted) {
        resolve();
        return;
      }

      const timer = setTimeout(resolve, ms);

      const onAbort = () => {
        clearTimeout(timer);
        resolve();
      };

      signal.addEventListener("abort", onAbort, { once: true });
    });
  }
}
```

### 4. Create the Barrel Export

```typescript
// src/effects/index.ts

export { EffectEngine } from "./engine.js";
export type {
  EffectType,
  EffectParams,
  ActiveEffect,
  EffectCalculator,
} from "./engine.js";
```

### 5. Verify TypeScript Compilation

```bash
npx tsc --noEmit
```

---

## Verification

- [ ] `src/effects/engine.ts` exists and exports `EffectEngine`, `EffectType`, `EffectParams`, `EffectCalculator`
- [ ] `registerEffect()` stores a calculator function for a given effect type
- [ ] `startEffect()` validates that the effect type is registered
- [ ] `startEffect()` validates that all fixture IDs exist in FixtureManager
- [ ] `startEffect()` creates an ActiveEffect with an AbortController and starts the loop
- [ ] `startEffect()` returns a unique effect ID
- [ ] The effect loop runs at ~40 FPS (25ms interval)
- [ ] The effect loop calls the calculator function on each iteration with fixtures, elapsed time, and params
- [ ] The effect loop maps named channel values to absolute DMX addresses using the fixture's profile and start address
- [ ] The effect loop pushes DMX values to OLA via `olaClient.setDMX()`
- [ ] The effect loop groups fixtures by universe and sends one `setDMX` call per universe
- [ ] `stopEffect()` aborts the effect's loop via AbortController
- [ ] `stopEffect()` removes the effect from the active effects map
- [ ] `stopEffect()` throws if the effect ID is not found
- [ ] `stopAll()` stops all running effects
- [ ] `listActiveEffects()` returns info about all running effects
- [ ] The sleep helper respects the abort signal for fast cancellation
- [ ] OLA connection errors in the loop are logged but do not crash the loop
- [ ] `src/effects/index.ts` barrel export exists
- [ ] `npx tsc --noEmit` passes with zero errors

---

## Notes

- The loop interval of 25ms (~40 FPS) matches the standard DMX512 refresh rate. This provides smooth visual effects without overwhelming OLA or the DMX hardware. The actual frame rate may be slightly lower due to OLA HTTP latency.
- The `sleep()` helper listens for the abort signal so that `stopEffect()` takes effect immediately, rather than waiting for the current sleep to complete. This ensures effects stop within one frame (~25ms) of being cancelled.
- Each effect's calculator function receives the full `Fixture` objects, not just IDs. This gives calculators access to fixture profiles (channel layout) and addressing (universe, start address) without needing to look them up.
- The engine uses `fire-and-forget` for starting effect loops (the Promise is not awaited). Errors are caught and logged, and the effect is cleaned up from the active effects map on failure.
- DMX values from the calculator are clamped to 0-255 and rounded to integers before being sent to OLA. This protects against calculator bugs producing out-of-range or floating-point values.
- Multiple effects running on the same fixture simultaneously will produce undefined behavior -- the last write wins on each loop iteration. This is acceptable for the initial implementation. A future enhancement could add priority or blending.

---

**Next Task**: [Task 33: Implement Chase, Rainbow, Strobe Effects](task-33-chase-rainbow-strobe-effects.md)
**Related Design Docs**: [DMX Lighting MCP Design](../../design/local.dmx-lighting-mcp.md)
