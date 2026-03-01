# Task 8: Implement Fixture Manager

**Milestone**: [M2 - Fixture Management](../../milestones/milestone-2-fixture-management.md)
**Estimated Time**: 1.5 hours
**Dependencies**: Task 7 (Fixture Profile Models)
**Status**: Not Started

---

## Objective

Create a `FixtureManager` class that handles patching and unpatching fixtures to DMX addresses with collision detection. The FixtureManager is the central authority for tracking which fixtures are assigned to which DMX addresses, ensuring no two fixtures occupy overlapping address ranges within the same universe.

---

## Context

Patching maps a fixture (with its profile) to a specific DMX universe and start address. A fixture's profile determines how many consecutive DMX channels it occupies. For example, an RGB par with 3 channels patched at address 100 occupies addresses 100, 101, and 102.

Two fixtures on the same universe must not overlap in their address ranges. However, fixtures on different universes are completely independent and can use the same addresses without conflict.

The FixtureManager stores all patched fixtures in memory using a `Map<string, Fixture>` keyed by fixture ID. It validates addresses, checks for collisions, and provides lookup and listing operations that the MCP tools will call.

---

## Steps

### 1. Create the Fixture Manager Module

```bash
touch src/fixtures/manager.ts
```

### 2. Implement the FixtureManager Class

```typescript
// src/fixtures/manager.ts

import { Fixture, FixtureProfile } from "../types/index.js";
import {
  validateAddress,
  getChannelCount,
  getAddressRange,
} from "./profiles.js";

export interface PatchFixtureParams {
  id: string;
  name: string;
  profile: FixtureProfile;
  universe: number;
  startAddress: number;
}

export interface PatchResult {
  success: boolean;
  fixture?: Fixture;
  error?: string;
}

export class FixtureManager {
  private fixtures: Map<string, Fixture> = new Map();

  /**
   * Patch a fixture to a DMX universe at a specific start address.
   * Validates the address range and checks for collisions with existing fixtures.
   */
  patchFixture(params: PatchFixtureParams): PatchResult {
    const { id, name, profile, universe, startAddress } = params;

    // Check for duplicate fixture ID
    if (this.fixtures.has(id)) {
      return {
        success: false,
        error: `Fixture with ID "${id}" already exists. Unpatch it first or use a different ID.`,
      };
    }

    // Validate universe number
    if (!Number.isInteger(universe) || universe < 1) {
      return {
        success: false,
        error: `Universe must be a positive integer, got ${universe}`,
      };
    }

    // Validate that the fixture fits within the universe
    const addressValidation = validateAddress(startAddress, profile);
    if (!addressValidation.valid) {
      return {
        success: false,
        error: addressValidation.error,
      };
    }

    // Check for address collisions with existing fixtures in the same universe
    const collision = this.checkAddressCollision(
      universe,
      startAddress,
      profile
    );
    if (collision) {
      return {
        success: false,
        error: collision,
      };
    }

    // Create and store the fixture
    const fixture: Fixture = {
      id,
      name,
      profile,
      universe,
      startAddress,
    };

    this.fixtures.set(id, fixture);

    return { success: true, fixture };
  }

  /**
   * Remove a fixture from the patch.
   */
  unpatchFixture(id: string): PatchResult {
    const fixture = this.fixtures.get(id);
    if (!fixture) {
      return {
        success: false,
        error: `Fixture with ID "${id}" not found`,
      };
    }

    this.fixtures.delete(id);

    return { success: true, fixture };
  }

  /**
   * List all patched fixtures, optionally filtered by universe.
   */
  listFixtures(universe?: number): Fixture[] {
    const all = Array.from(this.fixtures.values());
    if (universe !== undefined) {
      return all.filter((f) => f.universe === universe);
    }
    return all;
  }

  /**
   * Get a single fixture by ID.
   */
  getFixture(id: string): Fixture | undefined {
    return this.fixtures.get(id);
  }

  /**
   * Get the number of patched fixtures.
   */
  getFixtureCount(): number {
    return this.fixtures.size;
  }

  /**
   * Check if a DMX address range would collide with any existing fixture
   * in the same universe. Returns an error message if collision detected,
   * or null if the range is clear.
   */
  private checkAddressCollision(
    universe: number,
    startAddress: number,
    profile: FixtureProfile
  ): string | null {
    const newRange = getAddressRange(startAddress, profile);

    for (const existing of this.fixtures.values()) {
      // Skip fixtures on different universes
      if (existing.universe !== universe) {
        continue;
      }

      const existingRange = getAddressRange(
        existing.startAddress,
        existing.profile
      );

      // Check for overlap: two ranges [a1, a2] and [b1, b2] overlap
      // if a1 <= b2 AND b1 <= a2
      if (
        newRange.start <= existingRange.end &&
        existingRange.start <= newRange.end
      ) {
        return (
          `Address collision on universe ${universe}: ` +
          `requested range ${newRange.start}-${newRange.end} overlaps with ` +
          `fixture "${existing.name}" (${existing.id}) at ${existingRange.start}-${existingRange.end}`
        );
      }
    }

    return null;
  }

  /**
   * Get a map of all DMX addresses in use for a given universe.
   * Returns a Map<number, string> where key is the address and value is the fixture ID.
   */
  getAddressMap(universe: number): Map<number, string> {
    const addressMap = new Map<number, string>();

    for (const fixture of this.fixtures.values()) {
      if (fixture.universe !== universe) {
        continue;
      }

      const channelCount = getChannelCount(fixture.profile);
      for (let i = 0; i < channelCount; i++) {
        addressMap.set(fixture.startAddress + i, fixture.id);
      }
    }

    return addressMap;
  }

  /**
   * Clear all fixtures (useful for testing or resetting state).
   */
  clear(): void {
    this.fixtures.clear();
  }
}
```

### 3. Update the Barrel File

Add the manager export to `src/fixtures/index.ts`.

```typescript
// src/fixtures/index.ts
export * from "./profiles.js";
export * from "./manager.js";
```

### 4. Verify Compilation

```bash
npm run typecheck
```

---

## Verification

- [ ] `src/fixtures/manager.ts` exists and compiles without errors
- [ ] `patchFixture()` stores fixture correctly and returns it
- [ ] `patchFixture()` rejects duplicate fixture IDs
- [ ] `patchFixture()` rejects invalid universe numbers (0, negative, non-integer)
- [ ] `patchFixture()` rejects start addresses that cause universe overflow
- [ ] `patchFixture()` rejects address ranges that collide with existing fixtures on the same universe
- [ ] `patchFixture()` allows same address range on different universes (no cross-universe collision)
- [ ] `unpatchFixture()` removes fixture and returns it
- [ ] `unpatchFixture()` returns error for nonexistent fixture ID
- [ ] `listFixtures()` returns all fixtures
- [ ] `listFixtures(universe)` filters by universe
- [ ] `getFixture()` returns the correct fixture by ID
- [ ] `getFixture()` returns undefined for nonexistent fixture ID
- [ ] `getAddressMap()` returns correct address-to-fixture mapping
- [ ] `npm run typecheck` passes

---

## Notes

- The `checkAddressCollision()` method is private because collision checking is an implementation detail of `patchFixture()`. External callers should not need to call it directly.
- The overlap detection formula `a1 <= b2 AND b1 <= a2` is the standard interval overlap test. It covers all cases: partial overlap, complete containment, and exact same range.
- `getAddressMap()` is a convenience method that will be useful for debugging and for the `get_dmx_state` tool in later milestones.
- Fixtures are stored in a Map keyed by ID for O(1) lookup, but collision detection requires iterating all fixtures in the same universe (O(n)). For typical lighting rigs (< 100 fixtures), this is negligible.
- The `clear()` method is mainly for testing -- it resets the manager to a clean state between test cases.

---

**Next Task**: [Task 9: Implement create_fixture_profile Tool](task-9-create-fixture-profile-tool.md)
**Related Design Docs**: [DMX Lighting MCP Design](../../design/local.dmx-lighting-mcp.md)
