# Task 7: Implement Fixture Profile Models

**Milestone**: [M2 - Fixture Management](../../milestones/milestone-2-fixture-management.md)
**Estimated Time**: 1 hour
**Dependencies**: Task 3 (Core TypeScript Interfaces)
**Status**: Not Started

---

## Objective

Implement runtime classes and utilities for FixtureProfile and ChannelDefinition that validate and work with the type interfaces defined in Task 3. These utilities provide the building blocks for all fixture-related operations: validating profiles, looking up channels by name, computing channel counts, and verifying that a fixture fits within a DMX universe's 512-channel address space.

---

## Context

Fixtures need profiles that define their channel layout. A generic RGB par has 3 channels (R, G, B) starting at a given DMX address. A moving head might have 16+ channels covering dimmer, color, gobo, pan, tilt, and more. The profile system defines how many channels a fixture uses and what each channel controls.

DMX universes have exactly 512 channels (addresses 1-512). A fixture with a 3-channel profile patched at address 510 would need addresses 510, 511, 512 -- that works. But patched at address 511, it would need 511, 512, 513 -- that overflows the universe and must be rejected.

The FixtureProfile and ChannelDefinition interfaces are already defined in `src/types/index.ts` from Task 3. This task adds runtime validation and helper utilities that operate on those types.

---

## Steps

### 1. Create the Fixture Profiles Module

Create `src/fixtures/profiles.ts` with the profile validation and utility functions.

```bash
mkdir -p src/fixtures
touch src/fixtures/profiles.ts
```

### 2. Implement ChannelType Validation

Define the set of valid channel types and a guard function to validate them at runtime.

```typescript
// src/fixtures/profiles.ts

import {
  ChannelDefinition,
  ChannelType,
  FixtureProfile,
} from "../types/index.js";

const VALID_CHANNEL_TYPES: readonly ChannelType[] = [
  "dimmer",
  "red", "green", "blue", "white", "amber", "uv",
  "pan", "tilt", "pan_fine", "tilt_fine",
  "gobo", "strobe", "speed", "macro", "control",
] as const;

export function isValidChannelType(type: string): type is ChannelType {
  return VALID_CHANNEL_TYPES.includes(type as ChannelType);
}
```

### 3. Implement Profile Validation

Add a `validateProfile` function that checks a FixtureProfile for correctness:
- Must have at least one channel
- Each channel must have a valid type
- Channel values must be in the 0-255 DMX range
- Default values must be within the channel's min/max range
- Channel names must be unique within the profile

```typescript
export interface ProfileValidationError {
  field: string;
  message: string;
}

export function validateProfile(
  profile: FixtureProfile
): ProfileValidationError[] {
  const errors: ProfileValidationError[] = [];

  if (!profile.manufacturer || profile.manufacturer.trim() === "") {
    errors.push({
      field: "manufacturer",
      message: "Manufacturer is required",
    });
  }

  if (!profile.model || profile.model.trim() === "") {
    errors.push({
      field: "model",
      message: "Model is required",
    });
  }

  if (!profile.channels || profile.channels.length === 0) {
    errors.push({
      field: "channels",
      message: "Profile must have at least one channel",
    });
    return errors; // No point checking individual channels
  }

  const seenNames = new Set<string>();

  profile.channels.forEach((channel, index) => {
    const prefix = `channels[${index}]`;

    if (!channel.name || channel.name.trim() === "") {
      errors.push({
        field: `${prefix}.name`,
        message: "Channel name is required",
      });
    }

    if (seenNames.has(channel.name)) {
      errors.push({
        field: `${prefix}.name`,
        message: `Duplicate channel name: "${channel.name}"`,
      });
    }
    seenNames.add(channel.name);

    if (!isValidChannelType(channel.type)) {
      errors.push({
        field: `${prefix}.type`,
        message: `Invalid channel type: "${channel.type}". Must be one of: ${VALID_CHANNEL_TYPES.join(", ")}`,
      });
    }

    if (channel.min < 0 || channel.min > 255) {
      errors.push({
        field: `${prefix}.min`,
        message: `Min value must be 0-255, got ${channel.min}`,
      });
    }

    if (channel.max < 0 || channel.max > 255) {
      errors.push({
        field: `${prefix}.max`,
        message: `Max value must be 0-255, got ${channel.max}`,
      });
    }

    if (channel.min > channel.max) {
      errors.push({
        field: `${prefix}.min/max`,
        message: `Min (${channel.min}) cannot be greater than max (${channel.max})`,
      });
    }

    if (
      channel.defaultValue < channel.min ||
      channel.defaultValue > channel.max
    ) {
      errors.push({
        field: `${prefix}.defaultValue`,
        message: `Default value (${channel.defaultValue}) must be between min (${channel.min}) and max (${channel.max})`,
      });
    }
  });

  return errors;
}
```

### 4. Implement getChannelCount Helper

```typescript
export function getChannelCount(profile: FixtureProfile): number {
  return profile.channels.length;
}
```

### 5. Implement getChannelByName Lookup

```typescript
export function getChannelByName(
  profile: FixtureProfile,
  name: string
): ChannelDefinition | undefined {
  return profile.channels.find(
    (ch) => ch.name.toLowerCase() === name.toLowerCase()
  );
}

export function getChannelOffset(
  profile: FixtureProfile,
  name: string
): number {
  const index = profile.channels.findIndex(
    (ch) => ch.name.toLowerCase() === name.toLowerCase()
  );
  if (index === -1) {
    throw new Error(
      `Channel "${name}" not found in profile "${profile.manufacturer} ${profile.model}"`
    );
  }
  return index;
}
```

### 6. Implement validateAddress

Verify that a fixture with a given profile fits within the DMX universe when patched at a start address.

```typescript
export const DMX_MIN_ADDRESS = 1;
export const DMX_MAX_ADDRESS = 512;

export function validateAddress(
  startAddress: number,
  profile: FixtureProfile
): { valid: boolean; error?: string } {
  if (
    !Number.isInteger(startAddress) ||
    startAddress < DMX_MIN_ADDRESS ||
    startAddress > DMX_MAX_ADDRESS
  ) {
    return {
      valid: false,
      error: `Start address must be an integer between ${DMX_MIN_ADDRESS} and ${DMX_MAX_ADDRESS}, got ${startAddress}`,
    };
  }

  const channelCount = getChannelCount(profile);
  const lastAddress = startAddress + channelCount - 1;

  if (lastAddress > DMX_MAX_ADDRESS) {
    return {
      valid: false,
      error: `Fixture requires ${channelCount} channels starting at address ${startAddress}, which would extend to address ${lastAddress} (max is ${DMX_MAX_ADDRESS})`,
    };
  }

  return { valid: true };
}

/**
 * Returns the DMX address range [start, end] (inclusive) for a fixture.
 */
export function getAddressRange(
  startAddress: number,
  profile: FixtureProfile
): { start: number; end: number } {
  return {
    start: startAddress,
    end: startAddress + getChannelCount(profile) - 1,
  };
}
```

### 7. Implement ProfileRegistry

Create a registry class to store and retrieve profiles.

```typescript
export class ProfileRegistry {
  private profiles: Map<string, FixtureProfile> = new Map();

  /**
   * Generate a unique key for a profile based on manufacturer and model.
   */
  private getKey(manufacturer: string, model: string): string {
    return `${manufacturer.toLowerCase()}:${model.toLowerCase()}`;
  }

  register(profile: FixtureProfile): void {
    const errors = validateProfile(profile);
    if (errors.length > 0) {
      throw new Error(
        `Invalid profile: ${errors.map((e) => e.message).join(", ")}`
      );
    }

    const key = this.getKey(profile.manufacturer, profile.model);
    this.profiles.set(key, profile);
  }

  get(manufacturer: string, model: string): FixtureProfile | undefined {
    return this.profiles.get(this.getKey(manufacturer, model));
  }

  getById(id: string): FixtureProfile | undefined {
    return this.profiles.get(id.toLowerCase());
  }

  list(): FixtureProfile[] {
    return Array.from(this.profiles.values());
  }

  has(manufacturer: string, model: string): boolean {
    return this.profiles.has(this.getKey(manufacturer, model));
  }

  remove(manufacturer: string, model: string): boolean {
    return this.profiles.delete(this.getKey(manufacturer, model));
  }
}
```

### 8. Export Everything from a Barrel File

Create `src/fixtures/index.ts` to re-export the fixtures module.

```typescript
// src/fixtures/index.ts
export * from "./profiles.js";
```

---

## Verification

- [ ] `src/fixtures/profiles.ts` exists and compiles without errors
- [ ] `src/fixtures/index.ts` barrel file exists and re-exports profiles
- [ ] `validateProfile()` rejects profiles with no channels
- [ ] `validateProfile()` rejects profiles with invalid channel types
- [ ] `validateProfile()` rejects profiles with duplicate channel names
- [ ] `validateProfile()` rejects profiles with out-of-range DMX values
- [ ] `getChannelCount()` returns the correct number of channels
- [ ] `getChannelByName()` returns the correct channel (case-insensitive)
- [ ] `getChannelByName()` returns undefined for nonexistent channels
- [ ] `validateAddress()` accepts valid start addresses
- [ ] `validateAddress()` rejects addresses that cause universe overflow
- [ ] `validateAddress()` rejects non-integer or out-of-range addresses
- [ ] `ProfileRegistry.register()` stores profiles and rejects invalid ones
- [ ] `ProfileRegistry.get()` retrieves profiles by manufacturer/model
- [ ] `npm run typecheck` passes

---

## Notes

- Channel types are defined as a union type in `src/types/index.ts`. The runtime validation here mirrors that union with an array of valid strings for runtime checking.
- The `ProfileRegistry` uses a composite key of `manufacturer:model` (lowercased) to avoid duplicates while being case-insensitive.
- The `getAddressRange()` helper will be used by the FixtureManager (Task 8) for collision detection.
- Profiles are intentionally simple for now -- no modes support yet. The `modes` field on FixtureProfile from the design doc can be added later without breaking this API.

---

**Next Task**: [Task 8: Implement Fixture Manager](task-8-fixture-manager.md)
**Related Design Docs**: [DMX Lighting MCP Design](../../design/local.dmx-lighting-mcp.md)
