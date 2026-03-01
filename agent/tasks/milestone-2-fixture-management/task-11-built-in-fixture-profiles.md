# Task 11: Add Built-in Fixture Profiles

**Milestone**: [M2 - Fixture Management](../../milestones/milestone-2-fixture-management.md)
**Estimated Time**: 1 hour
**Dependencies**: Task 7 (Fixture Profile Models)
**Status**: Not Started

---

## Objective

Create built-in fixture profiles for common fixture types (generic RGB par, generic dimmer, generic RGBW par) so that agents can immediately start patching fixtures without first defining custom profiles. These profiles are automatically registered in the ProfileRegistry on server initialization.

---

## Context

Most lighting rigs include common fixture types that follow standard channel layouts. Rather than requiring agents to define profiles for these well-known fixtures every time, the server ships with built-in profiles that are ready to use out of the box.

The built-in profiles cover the most common generic fixture types:
- **Generic Dimmer** -- A single-channel fixture that controls intensity only. Used for conventional (non-LED) fixtures, fog machines, or any single-channel device.
- **Generic RGB Par** -- A 3-channel LED par that mixes red, green, and blue. The most common type of affordable LED fixture.
- **Generic RGBW Par** -- A 4-channel LED par that adds a dedicated white channel for better color rendering and brighter whites.

These profiles use "Generic" as the manufacturer name since they represent universal channel layouts rather than specific hardware models.

---

## Steps

### 1. Define Built-in Profiles

Add the built-in profile definitions to `src/fixtures/profiles.ts`.

```typescript
// Add to src/fixtures/profiles.ts

import { FixtureProfile } from "../types/index.js";

// ── Generic Dimmer ─────────────────────────────────────────────

export const GENERIC_DIMMER: FixtureProfile = {
  manufacturer: "Generic",
  model: "Dimmer",
  channels: [
    {
      name: "dimmer",
      type: "dimmer",
      defaultValue: 0,
      min: 0,
      max: 255,
    },
  ],
  modes: [],
};

// ── Generic RGB Par ────────────────────────────────────────────

export const GENERIC_RGB_PAR: FixtureProfile = {
  manufacturer: "Generic",
  model: "RGB Par",
  channels: [
    {
      name: "red",
      type: "red",
      defaultValue: 0,
      min: 0,
      max: 255,
    },
    {
      name: "green",
      type: "green",
      defaultValue: 0,
      min: 0,
      max: 255,
    },
    {
      name: "blue",
      type: "blue",
      defaultValue: 0,
      min: 0,
      max: 255,
    },
  ],
  modes: [],
};

// ── Generic RGBW Par ───────────────────────────────────────────

export const GENERIC_RGBW_PAR: FixtureProfile = {
  manufacturer: "Generic",
  model: "RGBW Par",
  channels: [
    {
      name: "red",
      type: "red",
      defaultValue: 0,
      min: 0,
      max: 255,
    },
    {
      name: "green",
      type: "green",
      defaultValue: 0,
      min: 0,
      max: 255,
    },
    {
      name: "blue",
      type: "blue",
      defaultValue: 0,
      min: 0,
      max: 255,
    },
    {
      name: "white",
      type: "white",
      defaultValue: 0,
      min: 0,
      max: 255,
    },
  ],
  modes: [],
};

// ── All Built-in Profiles ──────────────────────────────────────

export const BUILT_IN_PROFILES: FixtureProfile[] = [
  GENERIC_DIMMER,
  GENERIC_RGB_PAR,
  GENERIC_RGBW_PAR,
];
```

### 2. Implement Auto-Registration Function

Add a function that registers all built-in profiles into a ProfileRegistry instance.

```typescript
// Add to src/fixtures/profiles.ts

/**
 * Register all built-in fixture profiles into the given registry.
 * Call this during server initialization to make built-in profiles
 * available immediately.
 */
export function initializeBuiltInProfiles(registry: ProfileRegistry): void {
  for (const profile of BUILT_IN_PROFILES) {
    if (!registry.has(profile.manufacturer, profile.model)) {
      registry.register(profile);
    }
  }
}
```

### 3. Wire into Server Initialization

Update the server startup code to call `initializeBuiltInProfiles()` when the server starts.

```typescript
// In src/server.ts or src/index.ts

import {
  ProfileRegistry,
  initializeBuiltInProfiles,
} from "./fixtures/profiles.js";

const profileRegistry = new ProfileRegistry();
initializeBuiltInProfiles(profileRegistry);

// Now profileRegistry contains all 3 built-in profiles
// and is ready to be passed to tool handlers
```

### 4. Verify Built-in Profiles are Valid

As a sanity check, the built-in profiles should pass validation. This can be verified in tests (Task 12) but also confirmed by running the server and calling `list_fixture_profiles`.

```typescript
// Quick verification (can run in a test or ad-hoc script)
import { validateProfile } from "./profiles.js";

for (const profile of BUILT_IN_PROFILES) {
  const errors = validateProfile(profile);
  if (errors.length > 0) {
    throw new Error(
      `Built-in profile "${profile.manufacturer} ${profile.model}" is invalid: ${errors.map((e) => e.message).join(", ")}`
    );
  }
}
```

### 5. Verify Compilation

```bash
npm run typecheck
```

---

## Verification

- [ ] `GENERIC_DIMMER` profile is defined with 1 channel (dimmer, 0-255)
- [ ] `GENERIC_RGB_PAR` profile is defined with 3 channels (red, green, blue, all 0-255)
- [ ] `GENERIC_RGBW_PAR` profile is defined with 4 channels (red, green, blue, white, all 0-255)
- [ ] `BUILT_IN_PROFILES` array contains all 3 profiles
- [ ] All built-in profiles pass `validateProfile()` with no errors
- [ ] `initializeBuiltInProfiles()` registers all profiles into a ProfileRegistry
- [ ] `initializeBuiltInProfiles()` is idempotent (calling it twice does not throw)
- [ ] After initialization, `registry.get("Generic", "Dimmer")` returns the dimmer profile
- [ ] After initialization, `registry.get("Generic", "RGB Par")` returns the RGB par profile
- [ ] After initialization, `registry.get("Generic", "RGBW Par")` returns the RGBW par profile
- [ ] `list_fixture_profiles` MCP tool returns all 3 built-in profiles
- [ ] `npm run typecheck` passes

---

## Notes

- All built-in profiles use "Generic" as the manufacturer. This keeps them clearly distinct from any custom profiles agents might create for specific brands (e.g., "Chauvet", "ADJ").
- All channels default to 0, which means lights start dark. This is standard practice in lighting -- you always want fixtures to power on dark and only output light when explicitly commanded.
- The `modes` field is set to an empty array on all built-in profiles. Multi-mode support (e.g., a fixture that can run in 3-channel or 7-channel mode) is a future enhancement.
- `initializeBuiltInProfiles()` checks `registry.has()` before registering to make it safe to call multiple times. This prevents errors if the server reinitializes or if profiles are registered in tests before initialization.
- Additional built-in profiles (generic moving head, generic RGB strobe, etc.) can be added later by simply adding them to the `BUILT_IN_PROFILES` array.

---

**Next Task**: [Task 12: Add Fixture Management Tests](task-12-fixture-management-tests.md)
**Related Design Docs**: [DMX Lighting MCP Design](../../design/local.dmx-lighting-mcp.md)
