# Task 33: Implement Chase, Rainbow, Strobe Effects

**Milestone**: [M6 - Show Management & Effects](../../milestones/milestone-6-show-management-effects.md)
**Estimated Time**: 1.5 hours
**Dependencies**: Task 32 (Effect Engine Base)
**Status**: Not Started

---

## Objective

Implement three built-in effect types -- chase (sequential fixture activation), rainbow (color cycling across fixtures), and strobe (rapid on/off flash) -- as `EffectCalculator` functions that plug into the EffectEngine's strategy pattern.

---

## Context

Each effect type implements the `EffectCalculator` function signature defined in Task 32:

```typescript
type EffectCalculator = (
  fixtures: Fixture[],
  elapsedMs: number,
  params: EffectParams
) => Map<string, ChannelValues>;
```

The calculator receives the target fixtures, the elapsed time since the effect started, and user-specified parameters (speed, color, rate, etc.). It returns a `Map<string, ChannelValues>` mapping each fixture ID to its channel values at this instant.

The three effects cover common lighting patterns:

- **Chase**: Lights up one fixture at a time in sequence, creating a "chasing" motion along the fixture group. Speed controls the cycle time.
- **Rainbow**: Cycles through hue values over time, with each fixture offset by its position in the group to create a wave effect. Produces continuously shifting RGB colors.
- **Strobe**: Rapidly toggles between full color and blackout. Rate (Hz) controls flash frequency, and duty cycle controls the fraction of time the lights are on.

---

## Steps

### 1. Implement the Chase Effect

Chase lights up fixtures one at a time in sequence. At any given moment, one fixture is at full intensity while the others are off. The active fixture advances over time based on the speed parameter.

```bash
touch src/effects/chase.ts
```

```typescript
// src/effects/chase.ts

import type { Fixture, ChannelValues } from "../types/index.js";
import type { EffectCalculator, EffectParams } from "./engine.js";

/**
 * Default chase cycle period in milliseconds.
 * One full cycle lights up each fixture once.
 */
const DEFAULT_PERIOD_MS = 2000;

/**
 * Chase effect: sequentially activates fixtures one at a time.
 *
 * At any given moment, one fixture is at full intensity (all color
 * channels at 255, dimmer at 255) while all other fixtures are at
 * zero. The active fixture advances through the list over time.
 *
 * Parameters:
 * - speed: multiplier for cycle speed (default 1.0, higher = faster)
 * - intensity: master intensity 0-255 (default 255)
 * - color: optional RGB color for the active fixture (default white)
 */
export const chaseCalculator: EffectCalculator = (
  fixtures: Fixture[],
  elapsedMs: number,
  params: EffectParams
): Map<string, ChannelValues> => {
  const result = new Map<string, ChannelValues>();

  if (fixtures.length === 0) return result;

  const speed = params.speed ?? 1.0;
  const intensity = params.intensity ?? 255;
  const color = params.color ?? { red: 255, green: 255, blue: 255 };

  // Calculate the period for a full cycle through all fixtures
  const periodMs = DEFAULT_PERIOD_MS / speed;

  // Determine which fixture is currently active
  // Use modulo to loop through fixtures continuously
  const phase = (elapsedMs % periodMs) / periodMs; // 0.0 to 1.0
  const activeIndex = Math.floor(phase * fixtures.length);

  for (let i = 0; i < fixtures.length; i++) {
    const fixture = fixtures[i];
    const channels: ChannelValues = {};

    if (i === activeIndex) {
      // Active fixture: set to full color and intensity
      for (const channelDef of fixture.profile.channels) {
        switch (channelDef.type) {
          case "dimmer":
            channels[channelDef.name] = intensity;
            break;
          case "red":
            channels[channelDef.name] = color.red;
            break;
          case "green":
            channels[channelDef.name] = color.green;
            break;
          case "blue":
            channels[channelDef.name] = color.blue;
            break;
          case "white":
            // White channel follows intensity for white chase
            channels[channelDef.name] =
              params.color ? 0 : intensity;
            break;
          default:
            channels[channelDef.name] = channelDef.defaultValue;
            break;
        }
      }
    } else {
      // Inactive fixture: all channels at zero
      for (const channelDef of fixture.profile.channels) {
        channels[channelDef.name] = 0;
      }
    }

    result.set(fixture.id, channels);
  }

  return result;
};
```

### 2. Implement the Rainbow Effect

Rainbow cycles hue values over time, converting HSV to RGB. Each fixture is offset by its position in the group to create a wave/gradient effect.

```bash
touch src/effects/rainbow.ts
```

```typescript
// src/effects/rainbow.ts

import type { Fixture, ChannelValues } from "../types/index.js";
import type { EffectCalculator, EffectParams } from "./engine.js";

/**
 * Default rainbow cycle period in milliseconds.
 * One full cycle goes through the entire hue spectrum (0-360).
 */
const DEFAULT_PERIOD_MS = 5000;

/**
 * Convert HSV color to RGB.
 *
 * @param h - Hue in degrees (0-360)
 * @param s - Saturation (0-1)
 * @param v - Value/brightness (0-1)
 * @returns RGB values each in range 0-255
 */
function hsvToRgb(
  h: number,
  s: number,
  v: number
): { red: number; green: number; blue: number } {
  // Normalize hue to 0-360 range
  h = ((h % 360) + 360) % 360;

  const c = v * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = v - c;

  let r: number, g: number, b: number;

  if (h < 60) {
    [r, g, b] = [c, x, 0];
  } else if (h < 120) {
    [r, g, b] = [x, c, 0];
  } else if (h < 180) {
    [r, g, b] = [0, c, x];
  } else if (h < 240) {
    [r, g, b] = [0, x, c];
  } else if (h < 300) {
    [r, g, b] = [x, 0, c];
  } else {
    [r, g, b] = [c, 0, x];
  }

  return {
    red: Math.round((r + m) * 255),
    green: Math.round((g + m) * 255),
    blue: Math.round((b + m) * 255),
  };
}

/**
 * Rainbow effect: cycles through the color spectrum across fixtures.
 *
 * Each fixture gets a different hue based on its position in the group,
 * creating a rainbow wave effect. The hue advances over time so the
 * colors continuously shift.
 *
 * Parameters:
 * - speed: multiplier for cycle speed (default 1.0, higher = faster)
 * - intensity: master intensity 0-255 (default 255)
 */
export const rainbowCalculator: EffectCalculator = (
  fixtures: Fixture[],
  elapsedMs: number,
  params: EffectParams
): Map<string, ChannelValues> => {
  const result = new Map<string, ChannelValues>();

  if (fixtures.length === 0) return result;

  const speed = params.speed ?? 1.0;
  const intensity = params.intensity ?? 255;

  // Calculate the period for a full hue cycle
  const periodMs = DEFAULT_PERIOD_MS / speed;

  // Base hue advances over time (0-360 degrees)
  const baseHue = ((elapsedMs % periodMs) / periodMs) * 360;

  for (let i = 0; i < fixtures.length; i++) {
    const fixture = fixtures[i];
    const channels: ChannelValues = {};

    // Offset each fixture's hue by its position in the group
    // This creates the rainbow wave effect
    const hueOffset = (i / fixtures.length) * 360;
    const hue = (baseHue + hueOffset) % 360;

    // Convert to RGB at full saturation
    const brightness = intensity / 255;
    const rgb = hsvToRgb(hue, 1.0, brightness);

    for (const channelDef of fixture.profile.channels) {
      switch (channelDef.type) {
        case "dimmer":
          channels[channelDef.name] = intensity;
          break;
        case "red":
          channels[channelDef.name] = rgb.red;
          break;
        case "green":
          channels[channelDef.name] = rgb.green;
          break;
        case "blue":
          channels[channelDef.name] = rgb.blue;
          break;
        case "white":
          // White channel off during rainbow (pure RGB colors)
          channels[channelDef.name] = 0;
          break;
        default:
          channels[channelDef.name] = channelDef.defaultValue;
          break;
      }
    }

    result.set(fixture.id, channels);
  }

  return result;
};
```

### 3. Implement the Strobe Effect

Strobe rapidly toggles between full color/intensity and blackout.

```bash
touch src/effects/strobe.ts
```

```typescript
// src/effects/strobe.ts

import type { Fixture, ChannelValues } from "../types/index.js";
import type { EffectCalculator, EffectParams } from "./engine.js";

/**
 * Default strobe rate in Hz (flashes per second).
 */
const DEFAULT_RATE_HZ = 5;

/**
 * Default duty cycle: fraction of each cycle that the light is on.
 * 0.5 = on for half the cycle, off for half.
 */
const DEFAULT_DUTY_CYCLE = 0.5;

/**
 * Strobe effect: rapidly toggles fixtures between on and off.
 *
 * All targeted fixtures flash in sync. The on-state uses the
 * specified color (or white if not specified) at the given intensity.
 * The off-state sets all channels to zero (blackout).
 *
 * Parameters:
 * - rate: flash frequency in Hz (default 5, range: 1-25)
 * - dutyCycle: fraction of cycle that is "on" (default 0.5, range 0.1-0.9)
 * - intensity: master intensity 0-255 (default 255)
 * - color: RGB color for the on-state (default white)
 */
export const strobeCalculator: EffectCalculator = (
  fixtures: Fixture[],
  elapsedMs: number,
  params: EffectParams
): Map<string, ChannelValues> => {
  const result = new Map<string, ChannelValues>();

  if (fixtures.length === 0) return result;

  const rate = Math.min(25, Math.max(1, params.rate ?? DEFAULT_RATE_HZ));
  const dutyCycle = Math.min(
    0.9,
    Math.max(0.1, params.dutyCycle ?? DEFAULT_DUTY_CYCLE)
  );
  const intensity = params.intensity ?? 255;
  const color = params.color ?? { red: 255, green: 255, blue: 255 };

  // Calculate the period of one flash cycle in milliseconds
  const periodMs = 1000 / rate;

  // Determine if we're in the "on" or "off" portion of the cycle
  const cyclePosition = (elapsedMs % periodMs) / periodMs; // 0.0 to 1.0
  const isOn = cyclePosition < dutyCycle;

  for (const fixture of fixtures) {
    const channels: ChannelValues = {};

    if (isOn) {
      // On state: apply color and intensity
      for (const channelDef of fixture.profile.channels) {
        switch (channelDef.type) {
          case "dimmer":
            channels[channelDef.name] = intensity;
            break;
          case "red":
            channels[channelDef.name] = color.red;
            break;
          case "green":
            channels[channelDef.name] = color.green;
            break;
          case "blue":
            channels[channelDef.name] = color.blue;
            break;
          case "white":
            channels[channelDef.name] =
              params.color ? 0 : intensity;
            break;
          default:
            channels[channelDef.name] = channelDef.defaultValue;
            break;
        }
      }
    } else {
      // Off state: all channels at zero (blackout)
      for (const channelDef of fixture.profile.channels) {
        channels[channelDef.name] = 0;
      }
    }

    result.set(fixture.id, channels);
  }

  return result;
};
```

### 4. Create a Registration Helper

Create a convenience function that registers all three built-in effects with an EffectEngine instance.

```typescript
// src/effects/register.ts

import type { EffectEngine } from "./engine.js";
import { chaseCalculator } from "./chase.js";
import { rainbowCalculator } from "./rainbow.js";
import { strobeCalculator } from "./strobe.js";

/**
 * Register all built-in effect types with the given EffectEngine.
 *
 * Call this during server initialization to make chase, rainbow,
 * and strobe effects available via startEffect().
 */
export function registerBuiltInEffects(engine: EffectEngine): void {
  engine.registerEffect("chase", chaseCalculator);
  engine.registerEffect("rainbow", rainbowCalculator);
  engine.registerEffect("strobe", strobeCalculator);
}
```

### 5. Update the Barrel Export

```typescript
// src/effects/index.ts

export { EffectEngine } from "./engine.js";
export type {
  EffectType,
  EffectParams,
  ActiveEffect,
  EffectCalculator,
} from "./engine.js";
export { chaseCalculator } from "./chase.js";
export { rainbowCalculator } from "./rainbow.js";
export { strobeCalculator } from "./strobe.js";
export { registerBuiltInEffects } from "./register.js";
```

### 6. Verify TypeScript Compilation

```bash
npx tsc --noEmit
```

---

## Verification

- [ ] `src/effects/chase.ts` exists and exports `chaseCalculator`
- [ ] `src/effects/rainbow.ts` exists and exports `rainbowCalculator`
- [ ] `src/effects/strobe.ts` exists and exports `strobeCalculator`
- [ ] `src/effects/register.ts` exists and exports `registerBuiltInEffects`
- [ ] Chase: only one fixture is at full intensity at any given time
- [ ] Chase: the active fixture advances through the list over time
- [ ] Chase: speed parameter controls cycle rate (higher = faster)
- [ ] Chase: supports custom color parameter
- [ ] Rainbow: each fixture gets a different hue based on position
- [ ] Rainbow: hue values cycle continuously over time
- [ ] Rainbow: `hsvToRgb` correctly converts HSV to RGB values (0-255)
- [ ] Rainbow: speed parameter controls cycle rate
- [ ] Strobe: all fixtures toggle between on and off in sync
- [ ] Strobe: rate parameter controls flash frequency in Hz
- [ ] Strobe: duty cycle parameter controls on/off ratio
- [ ] Strobe: rate is clamped to 1-25 Hz range
- [ ] Strobe: duty cycle is clamped to 0.1-0.9 range
- [ ] All three calculators handle empty fixture arrays gracefully (return empty Map)
- [ ] All three calculators set channel values for all channel types in each fixture's profile
- [ ] All three calculators return `Map<string, ChannelValues>` as required by `EffectCalculator`
- [ ] `registerBuiltInEffects()` registers all three effect types with the engine
- [ ] `src/effects/index.ts` barrel export updated with all new modules
- [ ] `npx tsc --noEmit` passes with zero errors

---

## Notes

- The chase effect uses `Math.floor(phase * fixtures.length)` to determine the active fixture. This creates a hard cut between fixtures rather than a crossfade. A smooth crossfade chase could be added as a future enhancement.
- The rainbow effect uses HSV-to-RGB conversion at full saturation (S=1.0) and maps the value (V) to the intensity parameter. This produces vivid, fully saturated colors. Desaturated rainbows could be supported by adding a saturation parameter.
- The strobe rate is clamped to 1-25 Hz. Below 1 Hz the effect is too slow to be perceived as a strobe. Above 25 Hz, the 40 FPS loop cannot accurately represent the flash pattern (Nyquist limit). Additionally, very high strobe rates can be uncomfortable or dangerous for photosensitive individuals.
- The duty cycle is clamped to 0.1-0.9 to ensure there is always a visible on-state and off-state. A duty cycle of 0 or 1 would result in no flashing.
- For fixtures that have a hardware strobe channel (channelDef.type === "strobe"), these effects do not use it. They control the strobe effect in software by toggling the color/dimmer channels. Hardware strobe could be supported as a future enhancement.
- The `white` channel is set to 0 during rainbow effects (which are pure RGB) and during strobe/chase when a specific color is provided. When no color is specified (default white), the white channel mirrors the intensity.

---

**Next Task**: [Task 34: Register Show and Effect MCP Tools](task-34-register-show-effect-mcp-tools.md)
**Related Design Docs**: [DMX Lighting MCP Design](../../design/local.dmx-lighting-mcp.md)
