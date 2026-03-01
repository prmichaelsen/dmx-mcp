# Task 12: Add Fixture Management Tests

**Milestone**: [M2 - Fixture Management](../../milestones/milestone-2-fixture-management.md)
**Estimated Time**: 1 hour
**Dependencies**: Task 8 (Fixture Manager), Task 10 (Register Fixture MCP Tools), Task 11 (Built-in Fixture Profiles)
**Status**: Not Started

---

## Objective

Write unit tests for fixture patching, collision detection, profile validation, and built-in profiles. These tests ensure the fixture management subsystem works correctly and provide a safety net for future changes.

---

## Context

The fixture management system has several critical behaviors that must be validated:
- Fixtures must be patched to valid DMX addresses within a 512-channel universe
- Two fixtures on the same universe must not occupy overlapping address ranges
- Fixtures on different universes are completely independent
- Profiles must be validated (correct channel types, valid value ranges, no duplicate names)
- Built-in profiles must be well-formed and load correctly

The tests use Vitest (configured in M1) and follow the Arrange-Act-Assert pattern. Each test file focuses on a specific module.

---

## Steps

### 1. Create Test Directory Structure

```bash
mkdir -p tests/fixtures
touch tests/fixtures/manager.test.ts
touch tests/fixtures/profiles.test.ts
```

### 2. Implement Profile Tests

Create `tests/fixtures/profiles.test.ts` to test profile validation, channel utilities, and built-in profiles.

```typescript
// tests/fixtures/profiles.test.ts

import { describe, it, expect, beforeEach } from "vitest";
import {
  validateProfile,
  validateAddress,
  getChannelCount,
  getChannelByName,
  getChannelOffset,
  getAddressRange,
  isValidChannelType,
  ProfileRegistry,
  initializeBuiltInProfiles,
  BUILT_IN_PROFILES,
  GENERIC_DIMMER,
  GENERIC_RGB_PAR,
  GENERIC_RGBW_PAR,
} from "../../src/fixtures/profiles.js";
import { FixtureProfile } from "../../src/types/index.js";

// ── isValidChannelType ─────────────────────────────────────────

describe("isValidChannelType", () => {
  it("accepts all valid channel types", () => {
    const validTypes = [
      "dimmer", "red", "green", "blue", "white", "amber", "uv",
      "pan", "tilt", "pan_fine", "tilt_fine",
      "gobo", "strobe", "speed", "macro", "control",
    ];

    for (const type of validTypes) {
      expect(isValidChannelType(type)).toBe(true);
    }
  });

  it("rejects invalid channel types", () => {
    expect(isValidChannelType("brightness")).toBe(false);
    expect(isValidChannelType("colour")).toBe(false);
    expect(isValidChannelType("")).toBe(false);
    expect(isValidChannelType("RGB")).toBe(false);
  });
});

// ── validateProfile ────────────────────────────────────────────

describe("validateProfile", () => {
  const validProfile: FixtureProfile = {
    manufacturer: "TestCo",
    model: "TestPar",
    channels: [
      { name: "red", type: "red", defaultValue: 0, min: 0, max: 255 },
      { name: "green", type: "green", defaultValue: 0, min: 0, max: 255 },
      { name: "blue", type: "blue", defaultValue: 0, min: 0, max: 255 },
    ],
    modes: [],
  };

  it("accepts a valid profile", () => {
    const errors = validateProfile(validProfile);
    expect(errors).toHaveLength(0);
  });

  it("rejects profile with empty manufacturer", () => {
    const errors = validateProfile({ ...validProfile, manufacturer: "" });
    expect(errors.length).toBeGreaterThan(0);
    expect(errors[0].field).toBe("manufacturer");
  });

  it("rejects profile with empty model", () => {
    const errors = validateProfile({ ...validProfile, model: "" });
    expect(errors.length).toBeGreaterThan(0);
    expect(errors.some((e) => e.field === "model")).toBe(true);
  });

  it("rejects profile with no channels", () => {
    const errors = validateProfile({ ...validProfile, channels: [] });
    expect(errors.length).toBeGreaterThan(0);
    expect(errors[0].field).toBe("channels");
  });

  it("rejects profile with invalid channel type", () => {
    const profile: FixtureProfile = {
      ...validProfile,
      channels: [
        {
          name: "brightness",
          type: "invalid_type" as any,
          defaultValue: 0,
          min: 0,
          max: 255,
        },
      ],
    };
    const errors = validateProfile(profile);
    expect(errors.length).toBeGreaterThan(0);
    expect(errors[0].message).toContain("Invalid channel type");
  });

  it("rejects profile with duplicate channel names", () => {
    const profile: FixtureProfile = {
      ...validProfile,
      channels: [
        { name: "red", type: "red", defaultValue: 0, min: 0, max: 255 },
        { name: "red", type: "green", defaultValue: 0, min: 0, max: 255 },
      ],
    };
    const errors = validateProfile(profile);
    expect(errors.some((e) => e.message.includes("Duplicate"))).toBe(true);
  });

  it("rejects profile with min > max", () => {
    const profile: FixtureProfile = {
      ...validProfile,
      channels: [
        { name: "red", type: "red", defaultValue: 0, min: 200, max: 100 },
      ],
    };
    const errors = validateProfile(profile);
    expect(
      errors.some((e) => e.message.includes("cannot be greater than"))
    ).toBe(true);
  });

  it("rejects profile with defaultValue outside min/max", () => {
    const profile: FixtureProfile = {
      ...validProfile,
      channels: [
        { name: "red", type: "red", defaultValue: 128, min: 0, max: 100 },
      ],
    };
    const errors = validateProfile(profile);
    expect(
      errors.some((e) => e.field.includes("defaultValue"))
    ).toBe(true);
  });

  it("rejects profile with channel min out of DMX range", () => {
    const profile: FixtureProfile = {
      ...validProfile,
      channels: [
        { name: "red", type: "red", defaultValue: 0, min: -1, max: 255 },
      ],
    };
    const errors = validateProfile(profile);
    expect(errors.some((e) => e.field.includes("min"))).toBe(true);
  });

  it("rejects profile with channel max out of DMX range", () => {
    const profile: FixtureProfile = {
      ...validProfile,
      channels: [
        { name: "red", type: "red", defaultValue: 0, min: 0, max: 256 },
      ],
    };
    const errors = validateProfile(profile);
    expect(errors.some((e) => e.field.includes("max"))).toBe(true);
  });
});

// ── getChannelCount ────────────────────────────────────────────

describe("getChannelCount", () => {
  it("returns correct count for dimmer (1 channel)", () => {
    expect(getChannelCount(GENERIC_DIMMER)).toBe(1);
  });

  it("returns correct count for RGB par (3 channels)", () => {
    expect(getChannelCount(GENERIC_RGB_PAR)).toBe(3);
  });

  it("returns correct count for RGBW par (4 channels)", () => {
    expect(getChannelCount(GENERIC_RGBW_PAR)).toBe(4);
  });
});

// ── getChannelByName ───────────────────────────────────────────

describe("getChannelByName", () => {
  it("finds channel by exact name", () => {
    const channel = getChannelByName(GENERIC_RGB_PAR, "red");
    expect(channel).toBeDefined();
    expect(channel!.type).toBe("red");
  });

  it("finds channel case-insensitively", () => {
    const channel = getChannelByName(GENERIC_RGB_PAR, "RED");
    expect(channel).toBeDefined();
    expect(channel!.type).toBe("red");
  });

  it("returns undefined for nonexistent channel", () => {
    const channel = getChannelByName(GENERIC_RGB_PAR, "white");
    expect(channel).toBeUndefined();
  });
});

// ── getChannelOffset ───────────────────────────────────────────

describe("getChannelOffset", () => {
  it("returns correct offset for each channel", () => {
    expect(getChannelOffset(GENERIC_RGB_PAR, "red")).toBe(0);
    expect(getChannelOffset(GENERIC_RGB_PAR, "green")).toBe(1);
    expect(getChannelOffset(GENERIC_RGB_PAR, "blue")).toBe(2);
  });

  it("throws for nonexistent channel", () => {
    expect(() => getChannelOffset(GENERIC_RGB_PAR, "white")).toThrow(
      'Channel "white" not found'
    );
  });
});

// ── validateAddress ────────────────────────────────────────────

describe("validateAddress", () => {
  it("accepts valid start address with room to spare", () => {
    const result = validateAddress(1, GENERIC_RGB_PAR);
    expect(result.valid).toBe(true);
  });

  it("accepts start address at the very end when fixture fits", () => {
    // 3-channel fixture at address 510 uses 510, 511, 512 -- fits exactly
    const result = validateAddress(510, GENERIC_RGB_PAR);
    expect(result.valid).toBe(true);
  });

  it("rejects start address that causes overflow", () => {
    // 3-channel fixture at address 511 would need 511, 512, 513 -- overflow
    const result = validateAddress(511, GENERIC_RGB_PAR);
    expect(result.valid).toBe(false);
    expect(result.error).toContain("extend to address 513");
  });

  it("rejects start address of 0", () => {
    const result = validateAddress(0, GENERIC_DIMMER);
    expect(result.valid).toBe(false);
  });

  it("rejects negative start address", () => {
    const result = validateAddress(-1, GENERIC_DIMMER);
    expect(result.valid).toBe(false);
  });

  it("rejects start address above 512", () => {
    const result = validateAddress(513, GENERIC_DIMMER);
    expect(result.valid).toBe(false);
  });

  it("rejects non-integer start address", () => {
    const result = validateAddress(1.5, GENERIC_DIMMER);
    expect(result.valid).toBe(false);
  });

  it("accepts single-channel fixture at address 512", () => {
    const result = validateAddress(512, GENERIC_DIMMER);
    expect(result.valid).toBe(true);
  });
});

// ── getAddressRange ────────────────────────────────────────────

describe("getAddressRange", () => {
  it("returns correct range for single-channel fixture", () => {
    const range = getAddressRange(100, GENERIC_DIMMER);
    expect(range).toEqual({ start: 100, end: 100 });
  });

  it("returns correct range for 3-channel fixture", () => {
    const range = getAddressRange(100, GENERIC_RGB_PAR);
    expect(range).toEqual({ start: 100, end: 102 });
  });

  it("returns correct range for 4-channel fixture", () => {
    const range = getAddressRange(1, GENERIC_RGBW_PAR);
    expect(range).toEqual({ start: 1, end: 4 });
  });
});

// ── ProfileRegistry ────────────────────────────────────────────

describe("ProfileRegistry", () => {
  let registry: ProfileRegistry;

  beforeEach(() => {
    registry = new ProfileRegistry();
  });

  it("registers and retrieves a profile", () => {
    registry.register(GENERIC_RGB_PAR);
    const profile = registry.get("Generic", "RGB Par");
    expect(profile).toBeDefined();
    expect(profile!.channels).toHaveLength(3);
  });

  it("retrieves profile case-insensitively", () => {
    registry.register(GENERIC_RGB_PAR);
    const profile = registry.get("generic", "rgb par");
    expect(profile).toBeDefined();
  });

  it("returns undefined for unregistered profile", () => {
    const profile = registry.get("Unknown", "Model");
    expect(profile).toBeUndefined();
  });

  it("rejects invalid profiles", () => {
    const invalidProfile: FixtureProfile = {
      manufacturer: "",
      model: "Bad",
      channels: [],
      modes: [],
    };
    expect(() => registry.register(invalidProfile)).toThrow("Invalid profile");
  });

  it("lists all registered profiles", () => {
    registry.register(GENERIC_DIMMER);
    registry.register(GENERIC_RGB_PAR);
    const profiles = registry.list();
    expect(profiles).toHaveLength(2);
  });

  it("checks if profile exists with has()", () => {
    registry.register(GENERIC_DIMMER);
    expect(registry.has("Generic", "Dimmer")).toBe(true);
    expect(registry.has("Generic", "RGB Par")).toBe(false);
  });

  it("removes a profile", () => {
    registry.register(GENERIC_DIMMER);
    expect(registry.remove("Generic", "Dimmer")).toBe(true);
    expect(registry.has("Generic", "Dimmer")).toBe(false);
  });

  it("returns false when removing nonexistent profile", () => {
    expect(registry.remove("Generic", "Nonexistent")).toBe(false);
  });
});

// ── Built-in Profiles ──────────────────────────────────────────

describe("Built-in Profiles", () => {
  it("BUILT_IN_PROFILES contains 3 profiles", () => {
    expect(BUILT_IN_PROFILES).toHaveLength(3);
  });

  it("all built-in profiles pass validation", () => {
    for (const profile of BUILT_IN_PROFILES) {
      const errors = validateProfile(profile);
      expect(errors).toHaveLength(0);
    }
  });

  it("GENERIC_DIMMER has 1 dimmer channel", () => {
    expect(GENERIC_DIMMER.channels).toHaveLength(1);
    expect(GENERIC_DIMMER.channels[0].type).toBe("dimmer");
  });

  it("GENERIC_RGB_PAR has 3 color channels", () => {
    expect(GENERIC_RGB_PAR.channels).toHaveLength(3);
    expect(GENERIC_RGB_PAR.channels.map((c) => c.type)).toEqual([
      "red", "green", "blue",
    ]);
  });

  it("GENERIC_RGBW_PAR has 4 color channels", () => {
    expect(GENERIC_RGBW_PAR.channels).toHaveLength(4);
    expect(GENERIC_RGBW_PAR.channels.map((c) => c.type)).toEqual([
      "red", "green", "blue", "white",
    ]);
  });

  it("initializeBuiltInProfiles registers all profiles", () => {
    const registry = new ProfileRegistry();
    initializeBuiltInProfiles(registry);
    expect(registry.list()).toHaveLength(3);
    expect(registry.has("Generic", "Dimmer")).toBe(true);
    expect(registry.has("Generic", "RGB Par")).toBe(true);
    expect(registry.has("Generic", "RGBW Par")).toBe(true);
  });

  it("initializeBuiltInProfiles is idempotent", () => {
    const registry = new ProfileRegistry();
    initializeBuiltInProfiles(registry);
    initializeBuiltInProfiles(registry); // second call should not throw
    expect(registry.list()).toHaveLength(3);
  });
});
```

### 3. Implement Fixture Manager Tests

Create `tests/fixtures/manager.test.ts` to test patching, unpatching, and collision detection.

```typescript
// tests/fixtures/manager.test.ts

import { describe, it, expect, beforeEach } from "vitest";
import { FixtureManager } from "../../src/fixtures/manager.js";
import {
  GENERIC_DIMMER,
  GENERIC_RGB_PAR,
  GENERIC_RGBW_PAR,
} from "../../src/fixtures/profiles.js";

describe("FixtureManager", () => {
  let manager: FixtureManager;

  beforeEach(() => {
    manager = new FixtureManager();
  });

  // ── patchFixture ───────────────────────────────────────────

  describe("patchFixture", () => {
    it("patches a fixture successfully", () => {
      const result = manager.patchFixture({
        id: "par-1",
        name: "Front Wash Left",
        profile: GENERIC_RGB_PAR,
        universe: 1,
        startAddress: 1,
      });

      expect(result.success).toBe(true);
      expect(result.fixture).toBeDefined();
      expect(result.fixture!.id).toBe("par-1");
      expect(result.fixture!.name).toBe("Front Wash Left");
      expect(result.fixture!.universe).toBe(1);
      expect(result.fixture!.startAddress).toBe(1);
      expect(result.fixture!.profile).toBe(GENERIC_RGB_PAR);
    });

    it("stores the patched fixture for later retrieval", () => {
      manager.patchFixture({
        id: "par-1",
        name: "Front Wash Left",
        profile: GENERIC_RGB_PAR,
        universe: 1,
        startAddress: 1,
      });

      const fixture = manager.getFixture("par-1");
      expect(fixture).toBeDefined();
      expect(fixture!.id).toBe("par-1");
    });

    it("rejects duplicate fixture ID", () => {
      manager.patchFixture({
        id: "par-1",
        name: "Front Wash Left",
        profile: GENERIC_RGB_PAR,
        universe: 1,
        startAddress: 1,
      });

      const result = manager.patchFixture({
        id: "par-1",
        name: "Front Wash Right",
        profile: GENERIC_RGB_PAR,
        universe: 1,
        startAddress: 10,
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain("already exists");
    });

    it("rejects invalid universe (0)", () => {
      const result = manager.patchFixture({
        id: "par-1",
        name: "Test",
        profile: GENERIC_RGB_PAR,
        universe: 0,
        startAddress: 1,
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain("positive integer");
    });

    it("rejects invalid universe (negative)", () => {
      const result = manager.patchFixture({
        id: "par-1",
        name: "Test",
        profile: GENERIC_RGB_PAR,
        universe: -1,
        startAddress: 1,
      });

      expect(result.success).toBe(false);
    });

    it("rejects start address that causes universe overflow", () => {
      const result = manager.patchFixture({
        id: "par-1",
        name: "Test",
        profile: GENERIC_RGB_PAR,
        universe: 1,
        startAddress: 511, // 3-ch fixture at 511 needs 511,512,513 -- overflow
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain("extend to address 513");
    });

    it("accepts fixture that fits exactly at end of universe", () => {
      const result = manager.patchFixture({
        id: "par-1",
        name: "Test",
        profile: GENERIC_RGB_PAR,
        universe: 1,
        startAddress: 510, // 3-ch fixture at 510 uses 510,511,512 -- fits
      });

      expect(result.success).toBe(true);
    });
  });

  // ── Address Collision Detection ────────────────────────────

  describe("address collision detection", () => {
    beforeEach(() => {
      // Patch an RGB par at universe 1, address 10 (uses 10, 11, 12)
      manager.patchFixture({
        id: "par-1",
        name: "Existing Par",
        profile: GENERIC_RGB_PAR,
        universe: 1,
        startAddress: 10,
      });
    });

    it("rejects exact same address range", () => {
      const result = manager.patchFixture({
        id: "par-2",
        name: "Conflicting Par",
        profile: GENERIC_RGB_PAR,
        universe: 1,
        startAddress: 10,
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain("collision");
    });

    it("rejects overlapping range (new starts inside existing)", () => {
      const result = manager.patchFixture({
        id: "par-2",
        name: "Conflicting Par",
        profile: GENERIC_RGB_PAR,
        universe: 1,
        startAddress: 11, // overlaps with existing at 10-12
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain("collision");
    });

    it("rejects overlapping range (new contains existing)", () => {
      const result = manager.patchFixture({
        id: "par-2",
        name: "Conflicting Par",
        profile: GENERIC_RGBW_PAR, // 4 channels
        universe: 1,
        startAddress: 9, // 9-12 overlaps with existing 10-12
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain("collision");
    });

    it("rejects overlapping range (new ends inside existing)", () => {
      const result = manager.patchFixture({
        id: "par-2",
        name: "Conflicting Par",
        profile: GENERIC_RGB_PAR,
        universe: 1,
        startAddress: 8, // 8-10 overlaps at address 10
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain("collision");
    });

    it("accepts non-overlapping range immediately after existing", () => {
      const result = manager.patchFixture({
        id: "par-2",
        name: "Adjacent Par",
        profile: GENERIC_RGB_PAR,
        universe: 1,
        startAddress: 13, // existing ends at 12, this starts at 13
      });

      expect(result.success).toBe(true);
    });

    it("accepts non-overlapping range immediately before existing", () => {
      const result = manager.patchFixture({
        id: "par-2",
        name: "Adjacent Par",
        profile: GENERIC_RGB_PAR,
        universe: 1,
        startAddress: 7, // 7-9, existing starts at 10
      });

      expect(result.success).toBe(true);
    });

    it("allows same address range on different universe", () => {
      const result = manager.patchFixture({
        id: "par-2",
        name: "Other Universe Par",
        profile: GENERIC_RGB_PAR,
        universe: 2, // different universe
        startAddress: 10, // same address -- no collision
      });

      expect(result.success).toBe(true);
    });

    it("detects collision among multiple fixtures", () => {
      // Add a second fixture at 20-22
      manager.patchFixture({
        id: "par-2",
        name: "Second Par",
        profile: GENERIC_RGB_PAR,
        universe: 1,
        startAddress: 20,
      });

      // Try to overlap with second fixture
      const result = manager.patchFixture({
        id: "par-3",
        name: "Conflicting Par",
        profile: GENERIC_RGB_PAR,
        universe: 1,
        startAddress: 21,
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain("par-2");
    });
  });

  // ── unpatchFixture ─────────────────────────────────────────

  describe("unpatchFixture", () => {
    it("removes a patched fixture", () => {
      manager.patchFixture({
        id: "par-1",
        name: "Test Par",
        profile: GENERIC_RGB_PAR,
        universe: 1,
        startAddress: 1,
      });

      const result = manager.unpatchFixture("par-1");
      expect(result.success).toBe(true);
      expect(result.fixture!.id).toBe("par-1");
    });

    it("makes the address range available after unpatching", () => {
      manager.patchFixture({
        id: "par-1",
        name: "Test Par",
        profile: GENERIC_RGB_PAR,
        universe: 1,
        startAddress: 1,
      });

      manager.unpatchFixture("par-1");

      // Should be able to patch another fixture at the same address
      const result = manager.patchFixture({
        id: "par-2",
        name: "Replacement Par",
        profile: GENERIC_RGB_PAR,
        universe: 1,
        startAddress: 1,
      });

      expect(result.success).toBe(true);
    });

    it("returns error for nonexistent fixture", () => {
      const result = manager.unpatchFixture("nonexistent");
      expect(result.success).toBe(false);
      expect(result.error).toContain("not found");
    });
  });

  // ── listFixtures ───────────────────────────────────────────

  describe("listFixtures", () => {
    it("returns empty array when no fixtures patched", () => {
      expect(manager.listFixtures()).toHaveLength(0);
    });

    it("returns all patched fixtures", () => {
      manager.patchFixture({
        id: "par-1",
        name: "Par 1",
        profile: GENERIC_RGB_PAR,
        universe: 1,
        startAddress: 1,
      });
      manager.patchFixture({
        id: "par-2",
        name: "Par 2",
        profile: GENERIC_RGB_PAR,
        universe: 1,
        startAddress: 10,
      });

      expect(manager.listFixtures()).toHaveLength(2);
    });

    it("filters by universe", () => {
      manager.patchFixture({
        id: "par-1",
        name: "Par 1",
        profile: GENERIC_RGB_PAR,
        universe: 1,
        startAddress: 1,
      });
      manager.patchFixture({
        id: "par-2",
        name: "Par 2",
        profile: GENERIC_RGB_PAR,
        universe: 2,
        startAddress: 1,
      });

      expect(manager.listFixtures(1)).toHaveLength(1);
      expect(manager.listFixtures(1)[0].id).toBe("par-1");
      expect(manager.listFixtures(2)).toHaveLength(1);
      expect(manager.listFixtures(2)[0].id).toBe("par-2");
    });

    it("returns empty array for universe with no fixtures", () => {
      manager.patchFixture({
        id: "par-1",
        name: "Par 1",
        profile: GENERIC_RGB_PAR,
        universe: 1,
        startAddress: 1,
      });

      expect(manager.listFixtures(99)).toHaveLength(0);
    });
  });

  // ── getFixture ─────────────────────────────────────────────

  describe("getFixture", () => {
    it("returns fixture by ID", () => {
      manager.patchFixture({
        id: "par-1",
        name: "Test Par",
        profile: GENERIC_RGB_PAR,
        universe: 1,
        startAddress: 1,
      });

      const fixture = manager.getFixture("par-1");
      expect(fixture).toBeDefined();
      expect(fixture!.name).toBe("Test Par");
    });

    it("returns undefined for nonexistent ID", () => {
      expect(manager.getFixture("nonexistent")).toBeUndefined();
    });
  });

  // ── getAddressMap ──────────────────────────────────────────

  describe("getAddressMap", () => {
    it("returns empty map for universe with no fixtures", () => {
      const map = manager.getAddressMap(1);
      expect(map.size).toBe(0);
    });

    it("returns correct mapping for a single fixture", () => {
      manager.patchFixture({
        id: "par-1",
        name: "Test Par",
        profile: GENERIC_RGB_PAR,
        universe: 1,
        startAddress: 10,
      });

      const map = manager.getAddressMap(1);
      expect(map.size).toBe(3);
      expect(map.get(10)).toBe("par-1");
      expect(map.get(11)).toBe("par-1");
      expect(map.get(12)).toBe("par-1");
    });

    it("only includes fixtures from the requested universe", () => {
      manager.patchFixture({
        id: "par-1",
        name: "Universe 1 Par",
        profile: GENERIC_RGB_PAR,
        universe: 1,
        startAddress: 1,
      });
      manager.patchFixture({
        id: "par-2",
        name: "Universe 2 Par",
        profile: GENERIC_RGB_PAR,
        universe: 2,
        startAddress: 1,
      });

      const map = manager.getAddressMap(1);
      expect(map.size).toBe(3);
      expect(map.get(1)).toBe("par-1");
    });
  });

  // ── clear ──────────────────────────────────────────────────

  describe("clear", () => {
    it("removes all fixtures", () => {
      manager.patchFixture({
        id: "par-1",
        name: "Par 1",
        profile: GENERIC_RGB_PAR,
        universe: 1,
        startAddress: 1,
      });
      manager.patchFixture({
        id: "par-2",
        name: "Par 2",
        profile: GENERIC_RGB_PAR,
        universe: 1,
        startAddress: 10,
      });

      manager.clear();
      expect(manager.listFixtures()).toHaveLength(0);
      expect(manager.getFixtureCount()).toBe(0);
    });
  });
});
```

### 4. Run the Tests

```bash
npm test
```

Or to run only fixture tests:

```bash
npx vitest run tests/fixtures/
```

### 5. Verify All Tests Pass

```bash
npm test -- --reporter=verbose
```

---

## Verification

- [ ] `tests/fixtures/profiles.test.ts` exists and runs
- [ ] `tests/fixtures/manager.test.ts` exists and runs
- [ ] All profile validation tests pass (valid profiles accepted, invalid ones rejected)
- [ ] All channel utility tests pass (getChannelCount, getChannelByName, getChannelOffset)
- [ ] All address validation tests pass (valid addresses accepted, overflows rejected)
- [ ] Built-in profiles load and pass validation
- [ ] `initializeBuiltInProfiles` is verified as idempotent
- [ ] Fixture patching stores and retrieves fixtures correctly
- [ ] Duplicate fixture IDs are rejected
- [ ] Address collision detection works for all overlap cases:
  - Exact same range
  - New starts inside existing
  - New contains existing
  - New ends inside existing
- [ ] Non-overlapping adjacent ranges on the same universe are accepted
- [ ] Fixtures on different universes do not collide
- [ ] Unpatching removes fixtures and frees addresses
- [ ] `listFixtures()` returns all fixtures; `listFixtures(universe)` filters correctly
- [ ] `npm test` passes with all tests green

---

## Notes

- Tests use `beforeEach` to create fresh instances of `FixtureManager` and `ProfileRegistry`, ensuring tests are isolated and do not affect each other.
- The collision detection tests are thorough because address collisions are the most critical safety check in the fixture management system. A missed collision could cause two fixtures to fight over the same DMX channels, producing unpredictable lighting behavior.
- Tests for the MCP tool handlers (Task 10) are not included here because they are thin wrappers around the FixtureManager and ProfileRegistry. If those wrappers grow more complex, dedicated tool handler tests should be added.
- The test file uses relative imports to `../../src/` which matches the standard Vitest project layout. Adjust paths if the project uses path aliases.

---

**Next Task**: Milestone 2 complete. Proceed to [Milestone 3: Scene Programming](../../milestones/milestone-3-scene-programming.md).
**Related Design Docs**: [DMX Lighting MCP Design](../../design/local.dmx-lighting-mcp.md)
