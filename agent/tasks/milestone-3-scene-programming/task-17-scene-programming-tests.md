# Task 17: Add Scene Programming Tests

**Milestone**: [M3 - Scene Programming](../../milestones/milestone-3-scene-programming.md)
**Estimated Time**: 1 hour
**Dependencies**: Task 13 (SceneManager), Task 14 (Scene-to-DMX mapping)
**Status**: Not Started

---

## Objective

Write unit tests for the SceneManager (CRUD operations and validation) and the DMX channel mapper (converting scene fixture states to raw DMX arrays). These tests ensure correctness of the core scene programming logic without requiring OLA or DMX hardware.

---

## Context

The scene programming system has two main units to test:

1. **SceneManager** (Task 13) -- manages scene CRUD and validates fixture IDs against the FixtureManager. Tests need a mock FixtureManager that responds to `getFixture()` calls.

2. **DMX Mapper** (Task 14) -- converts named channel values to absolute DMX addresses using fixture profiles. Tests need mock fixtures with known addresses and profiles.

Both units are pure logic with no external dependencies (no HTTP calls, no filesystem access), making them straightforward to test with mocks.

The test framework is vitest (set up in Task 5). Tests use `describe`/`it`/`expect` syntax.

---

## Steps

### 1. Create the Test Directory

```bash
mkdir -p tests/scenes
```

### 2. Create SceneManager Tests

Create `tests/scenes/manager.test.ts`:

```typescript
// tests/scenes/manager.test.ts

import { describe, it, expect, beforeEach, vi } from "vitest";
import { SceneManager } from "../../src/scenes/manager.js";
import type { FixtureManager } from "../../src/fixtures/manager.js";

/**
 * Create a mock FixtureManager that knows about a set of fixture IDs.
 * getFixture() returns a stub for known IDs and throws for unknown IDs.
 */
function createMockFixtureManager(knownFixtureIds: string[]): FixtureManager {
  const knownSet = new Set(knownFixtureIds);
  return {
    getFixture: vi.fn((id: string) => {
      if (!knownSet.has(id)) {
        throw new Error(`Fixture "${id}" not found`);
      }
      // Return a minimal fixture stub -- SceneManager only uses getFixture
      // for existence validation, not the returned value
      return {
        id,
        name: `Fixture ${id}`,
        profile: { manufacturer: "Generic", model: "RGB", channels: [], modes: [] },
        universe: 1,
        startAddress: 1,
      };
    }),
  } as unknown as FixtureManager;
}

describe("SceneManager", () => {
  let sceneManager: SceneManager;
  let mockFixtureManager: FixtureManager;

  beforeEach(() => {
    mockFixtureManager = createMockFixtureManager(["par-1", "par-2", "par-3"]);
    sceneManager = new SceneManager(mockFixtureManager);
  });

  describe("createScene", () => {
    it("should create a scene with fixture states", () => {
      const scene = sceneManager.createScene("warm-wash", "Warm Wash", {
        "par-1": { red: 255, green: 200, blue: 100 },
        "par-2": { red: 255, green: 180, blue: 80 },
      });

      expect(scene.id).toBe("warm-wash");
      expect(scene.name).toBe("Warm Wash");
      expect(scene.fixtureStates.size).toBe(2);
      expect(scene.fixtureStates.get("par-1")).toEqual({
        red: 255,
        green: 200,
        blue: 100,
      });
      expect(scene.fixtureStates.get("par-2")).toEqual({
        red: 255,
        green: 180,
        blue: 80,
      });
    });

    it("should set createdAt and updatedAt timestamps", () => {
      const before = new Date();
      const scene = sceneManager.createScene("test", "Test", {
        "par-1": { red: 255 },
      });
      const after = new Date();

      expect(scene.createdAt.getTime()).toBeGreaterThanOrEqual(before.getTime());
      expect(scene.createdAt.getTime()).toBeLessThanOrEqual(after.getTime());
      expect(scene.updatedAt).toEqual(scene.createdAt);
    });

    it("should throw if scene ID already exists", () => {
      sceneManager.createScene("dup", "Duplicate", {
        "par-1": { red: 255 },
      });

      expect(() =>
        sceneManager.createScene("dup", "Duplicate Again", {
          "par-1": { red: 128 },
        })
      ).toThrow('Scene with ID "dup" already exists');
    });

    it("should throw if fixture ID is not found in FixtureManager", () => {
      expect(() =>
        sceneManager.createScene("bad", "Bad Scene", {
          "unknown-fixture": { red: 255 },
        })
      ).toThrow("Unknown fixture IDs: unknown-fixture");
    });

    it("should list all unknown fixture IDs in the error message", () => {
      expect(() =>
        sceneManager.createScene("bad", "Bad Scene", {
          "unknown-1": { red: 255 },
          "unknown-2": { blue: 128 },
        })
      ).toThrow("Unknown fixture IDs: unknown-1, unknown-2");
    });

    it("should throw if channel value is below 0", () => {
      expect(() =>
        sceneManager.createScene("bad", "Bad Scene", {
          "par-1": { red: -1 },
        })
      ).toThrow("Invalid channel value");
    });

    it("should throw if channel value is above 255", () => {
      expect(() =>
        sceneManager.createScene("bad", "Bad Scene", {
          "par-1": { red: 256 },
        })
      ).toThrow("Invalid channel value");
    });

    it("should throw if channel value is not an integer", () => {
      expect(() =>
        sceneManager.createScene("bad", "Bad Scene", {
          "par-1": { red: 128.5 },
        })
      ).toThrow("Invalid channel value");
    });

    it("should allow a scene with no fixture states (empty scene)", () => {
      const scene = sceneManager.createScene("empty", "Empty Scene", {});
      expect(scene.fixtureStates.size).toBe(0);
    });
  });

  describe("updateScene", () => {
    beforeEach(() => {
      sceneManager.createScene("warm-wash", "Warm Wash", {
        "par-1": { red: 255, green: 200, blue: 100 },
      });
    });

    it("should merge new channel values into existing fixture state", () => {
      const updated = sceneManager.updateScene("warm-wash", {
        "par-1": { red: 200 },
      });

      // red is updated, green and blue are preserved
      expect(updated.fixtureStates.get("par-1")).toEqual({
        red: 200,
        green: 200,
        blue: 100,
      });
    });

    it("should add new fixture IDs to the scene", () => {
      const updated = sceneManager.updateScene("warm-wash", {
        "par-2": { red: 0, green: 0, blue: 255 },
      });

      expect(updated.fixtureStates.size).toBe(2);
      expect(updated.fixtureStates.get("par-2")).toEqual({
        red: 0,
        green: 0,
        blue: 255,
      });
    });

    it("should add new channels to an existing fixture", () => {
      const updated = sceneManager.updateScene("warm-wash", {
        "par-1": { dimmer: 200 },
      });

      expect(updated.fixtureStates.get("par-1")).toEqual({
        red: 255,
        green: 200,
        blue: 100,
        dimmer: 200,
      });
    });

    it("should update the updatedAt timestamp", () => {
      const original = sceneManager.getScene("warm-wash");
      const originalUpdatedAt = original.updatedAt;

      // Small delay to ensure timestamp difference
      const updated = sceneManager.updateScene("warm-wash", {
        "par-1": { red: 100 },
      });

      expect(updated.updatedAt.getTime()).toBeGreaterThanOrEqual(
        originalUpdatedAt.getTime()
      );
    });

    it("should throw if scene does not exist", () => {
      expect(() =>
        sceneManager.updateScene("nonexistent", {
          "par-1": { red: 128 },
        })
      ).toThrow('Scene with ID "nonexistent" not found');
    });

    it("should throw if new fixture ID is unknown", () => {
      expect(() =>
        sceneManager.updateScene("warm-wash", {
          "unknown-fixture": { red: 128 },
        })
      ).toThrow("Unknown fixture IDs: unknown-fixture");
    });
  });

  describe("deleteScene", () => {
    beforeEach(() => {
      sceneManager.createScene("to-delete", "To Delete", {
        "par-1": { red: 255 },
      });
    });

    it("should delete an existing scene", () => {
      sceneManager.deleteScene("to-delete");

      expect(() => sceneManager.getScene("to-delete")).toThrow(
        'Scene with ID "to-delete" not found'
      );
    });

    it("should throw if scene does not exist", () => {
      expect(() => sceneManager.deleteScene("nonexistent")).toThrow(
        'Scene with ID "nonexistent" not found'
      );
    });

    it("should not affect other scenes", () => {
      sceneManager.createScene("keep-me", "Keep Me", {
        "par-1": { red: 128 },
      });

      sceneManager.deleteScene("to-delete");

      expect(sceneManager.getScene("keep-me").id).toBe("keep-me");
    });
  });

  describe("getScene", () => {
    it("should return the full scene object", () => {
      sceneManager.createScene("test", "Test Scene", {
        "par-1": { red: 255, green: 128, blue: 0 },
      });

      const scene = sceneManager.getScene("test");

      expect(scene.id).toBe("test");
      expect(scene.name).toBe("Test Scene");
      expect(scene.fixtureStates.get("par-1")).toEqual({
        red: 255,
        green: 128,
        blue: 0,
      });
    });

    it("should throw if scene does not exist", () => {
      expect(() => sceneManager.getScene("nonexistent")).toThrow(
        'Scene with ID "nonexistent" not found'
      );
    });
  });

  describe("listScenes", () => {
    it("should return empty array when no scenes exist", () => {
      expect(sceneManager.listScenes()).toEqual([]);
    });

    it("should return summary info for all scenes", () => {
      sceneManager.createScene("scene-1", "Scene One", {
        "par-1": { red: 255 },
      });
      sceneManager.createScene("scene-2", "Scene Two", {
        "par-1": { red: 128 },
        "par-2": { blue: 255 },
      });

      const scenes = sceneManager.listScenes();

      expect(scenes).toHaveLength(2);
      expect(scenes[0]).toMatchObject({
        id: "scene-1",
        name: "Scene One",
        fixtureCount: 1,
      });
      expect(scenes[1]).toMatchObject({
        id: "scene-2",
        name: "Scene Two",
        fixtureCount: 2,
      });
    });

    it("should include createdAt and updatedAt in summaries", () => {
      sceneManager.createScene("test", "Test", {
        "par-1": { red: 255 },
      });

      const scenes = sceneManager.listScenes();
      expect(scenes[0].createdAt).toBeInstanceOf(Date);
      expect(scenes[0].updatedAt).toBeInstanceOf(Date);
    });
  });
});
```

### 3. Create DMX Mapper Tests

Create `tests/scenes/dmx-mapper.test.ts`:

```typescript
// tests/scenes/dmx-mapper.test.ts

import { describe, it, expect, vi } from "vitest";
import { sceneToDMX } from "../../src/scenes/dmx-mapper.js";
import type { Scene } from "../../src/scenes/manager.js";
import type { FixtureManager } from "../../src/fixtures/manager.js";
import type { Fixture, ChannelDefinition } from "../../src/types/index.js";

/**
 * Helper to create a ChannelDefinition.
 */
function channel(
  name: string,
  type: string,
  defaultValue: number = 0
): ChannelDefinition {
  return {
    name,
    type: type as ChannelDefinition["type"],
    defaultValue,
    min: 0,
    max: 255,
  };
}

/**
 * Helper to create a Fixture with a given profile and address.
 */
function createFixture(
  id: string,
  universe: number,
  startAddress: number,
  channels: ChannelDefinition[]
): Fixture {
  return {
    id,
    name: `Fixture ${id}`,
    profile: {
      manufacturer: "Generic",
      model: "Test",
      channels,
      modes: [],
    },
    universe,
    startAddress,
  };
}

/**
 * Create a mock FixtureManager from a map of fixture ID to Fixture.
 */
function createMockFixtureManager(
  fixtures: Map<string, Fixture>
): FixtureManager {
  return {
    getFixture: vi.fn((id: string) => {
      const fixture = fixtures.get(id);
      if (!fixture) {
        throw new Error(`Fixture "${id}" not found`);
      }
      return fixture;
    }),
  } as unknown as FixtureManager;
}

/**
 * Helper to create a Scene from a plain object of fixture states.
 */
function createScene(
  id: string,
  name: string,
  fixtureStates: Record<string, Record<string, number>>
): Scene {
  return {
    id,
    name,
    fixtureStates: new Map(Object.entries(fixtureStates)),
    createdAt: new Date(),
    updatedAt: new Date(),
  };
}

describe("sceneToDMX", () => {
  describe("single RGB fixture", () => {
    it("should map RGB values to correct DMX channels", () => {
      // Fixture at universe 1, address 10, with RGB channels
      const fixtures = new Map<string, Fixture>();
      fixtures.set(
        "par-1",
        createFixture("par-1", 1, 10, [
          channel("red", "red"),
          channel("green", "green"),
          channel("blue", "blue"),
        ])
      );

      const fixtureManager = createMockFixtureManager(fixtures);
      const scene = createScene("test", "Test", {
        "par-1": { red: 255, green: 128, blue: 0 },
      });

      const result = sceneToDMX(scene, fixtureManager);

      expect(result.size).toBe(1);
      const universe1 = result.get(1)!;
      expect(universe1).toHaveLength(512);

      // Address 10 → index 9 (red)
      // Address 11 → index 10 (green)
      // Address 12 → index 11 (blue)
      expect(universe1[9]).toBe(255);   // red
      expect(universe1[10]).toBe(128);  // green
      expect(universe1[11]).toBe(0);    // blue
    });

    it("should set other channels to 0 by default", () => {
      const fixtures = new Map<string, Fixture>();
      fixtures.set(
        "par-1",
        createFixture("par-1", 1, 1, [
          channel("red", "red"),
          channel("green", "green"),
          channel("blue", "blue"),
        ])
      );

      const fixtureManager = createMockFixtureManager(fixtures);
      const scene = createScene("test", "Test", {
        "par-1": { red: 255, green: 128, blue: 64 },
      });

      const result = sceneToDMX(scene, fixtureManager);
      const universe1 = result.get(1)!;

      // Channels outside the fixture should be 0
      expect(universe1[3]).toBe(0);
      expect(universe1[100]).toBe(0);
      expect(universe1[511]).toBe(0);
    });
  });

  describe("multi-fixture scene (same universe)", () => {
    it("should map all fixtures into the same universe array", () => {
      const fixtures = new Map<string, Fixture>();
      fixtures.set(
        "par-1",
        createFixture("par-1", 1, 1, [
          channel("red", "red"),
          channel("green", "green"),
          channel("blue", "blue"),
        ])
      );
      fixtures.set(
        "par-2",
        createFixture("par-2", 1, 10, [
          channel("red", "red"),
          channel("green", "green"),
          channel("blue", "blue"),
        ])
      );

      const fixtureManager = createMockFixtureManager(fixtures);
      const scene = createScene("test", "Test", {
        "par-1": { red: 255, green: 0, blue: 0 },
        "par-2": { red: 0, green: 0, blue: 255 },
      });

      const result = sceneToDMX(scene, fixtureManager);

      expect(result.size).toBe(1);
      const universe1 = result.get(1)!;

      // par-1 at address 1: indices 0, 1, 2
      expect(universe1[0]).toBe(255);  // par-1 red
      expect(universe1[1]).toBe(0);    // par-1 green
      expect(universe1[2]).toBe(0);    // par-1 blue

      // par-2 at address 10: indices 9, 10, 11
      expect(universe1[9]).toBe(0);    // par-2 red
      expect(universe1[10]).toBe(0);   // par-2 green
      expect(universe1[11]).toBe(255); // par-2 blue
    });
  });

  describe("multi-universe scene", () => {
    it("should produce separate arrays for each universe", () => {
      const fixtures = new Map<string, Fixture>();
      fixtures.set(
        "par-1",
        createFixture("par-1", 1, 1, [
          channel("red", "red"),
          channel("green", "green"),
          channel("blue", "blue"),
        ])
      );
      fixtures.set(
        "par-2",
        createFixture("par-2", 2, 1, [
          channel("red", "red"),
          channel("green", "green"),
          channel("blue", "blue"),
        ])
      );

      const fixtureManager = createMockFixtureManager(fixtures);
      const scene = createScene("test", "Test", {
        "par-1": { red: 255, green: 128, blue: 64 },
        "par-2": { red: 10, green: 20, blue: 30 },
      });

      const result = sceneToDMX(scene, fixtureManager);

      expect(result.size).toBe(2);

      const universe1 = result.get(1)!;
      expect(universe1[0]).toBe(255);  // par-1 red
      expect(universe1[1]).toBe(128);  // par-1 green
      expect(universe1[2]).toBe(64);   // par-1 blue

      const universe2 = result.get(2)!;
      expect(universe2[0]).toBe(10);   // par-2 red
      expect(universe2[1]).toBe(20);   // par-2 green
      expect(universe2[2]).toBe(30);   // par-2 blue
    });

    it("should not have cross-universe contamination", () => {
      const fixtures = new Map<string, Fixture>();
      fixtures.set(
        "par-1",
        createFixture("par-1", 1, 5, [
          channel("red", "red"),
        ])
      );
      fixtures.set(
        "par-2",
        createFixture("par-2", 2, 5, [
          channel("red", "red"),
        ])
      );

      const fixtureManager = createMockFixtureManager(fixtures);
      const scene = createScene("test", "Test", {
        "par-1": { red: 200 },
        "par-2": { red: 100 },
      });

      const result = sceneToDMX(scene, fixtureManager);

      const universe1 = result.get(1)!;
      const universe2 = result.get(2)!;

      // Each universe should only have its own fixture's value
      expect(universe1[4]).toBe(200);
      expect(universe2[4]).toBe(100);
    });
  });

  describe("missing channel values (defaults)", () => {
    it("should use profile defaultValue for channels not set in the scene", () => {
      const fixtures = new Map<string, Fixture>();
      fixtures.set(
        "par-1",
        createFixture("par-1", 1, 1, [
          channel("dimmer", "dimmer", 255),  // default 255 (full on)
          channel("red", "red", 0),
          channel("green", "green", 0),
          channel("blue", "blue", 0),
        ])
      );

      const fixtureManager = createMockFixtureManager(fixtures);

      // Scene only sets red -- dimmer, green, blue should use defaults
      const scene = createScene("test", "Test", {
        "par-1": { red: 255 },
      });

      const result = sceneToDMX(scene, fixtureManager);
      const universe1 = result.get(1)!;

      expect(universe1[0]).toBe(255);  // dimmer: default 255
      expect(universe1[1]).toBe(255);  // red: scene value 255
      expect(universe1[2]).toBe(0);    // green: default 0
      expect(universe1[3]).toBe(0);    // blue: default 0
    });

    it("should use default 0 for channels with no explicit default", () => {
      const fixtures = new Map<string, Fixture>();
      fixtures.set(
        "par-1",
        createFixture("par-1", 1, 1, [
          channel("red", "red"),   // default is 0
          channel("green", "green"),
          channel("blue", "blue"),
        ])
      );

      const fixtureManager = createMockFixtureManager(fixtures);
      const scene = createScene("test", "Test", {
        "par-1": {},  // no channels set -- all should be default
      });

      const result = sceneToDMX(scene, fixtureManager);
      const universe1 = result.get(1)!;

      expect(universe1[0]).toBe(0);
      expect(universe1[1]).toBe(0);
      expect(universe1[2]).toBe(0);
    });
  });

  describe("complex fixture profiles", () => {
    it("should handle multi-channel fixtures (RGBW + dimmer)", () => {
      const fixtures = new Map<string, Fixture>();
      fixtures.set(
        "wash-1",
        createFixture("wash-1", 1, 20, [
          channel("dimmer", "dimmer", 0),
          channel("red", "red", 0),
          channel("green", "green", 0),
          channel("blue", "blue", 0),
          channel("white", "white", 0),
        ])
      );

      const fixtureManager = createMockFixtureManager(fixtures);
      const scene = createScene("test", "Test", {
        "wash-1": { dimmer: 255, red: 200, green: 100, blue: 50, white: 180 },
      });

      const result = sceneToDMX(scene, fixtureManager);
      const universe1 = result.get(1)!;

      // Address 20 → index 19 (dimmer)
      // Address 21 → index 20 (red)
      // Address 22 → index 21 (green)
      // Address 23 → index 22 (blue)
      // Address 24 → index 23 (white)
      expect(universe1[19]).toBe(255);  // dimmer
      expect(universe1[20]).toBe(200);  // red
      expect(universe1[21]).toBe(100);  // green
      expect(universe1[22]).toBe(50);   // blue
      expect(universe1[23]).toBe(180);  // white
    });

    it("should handle fixture at address 1 (edge case)", () => {
      const fixtures = new Map<string, Fixture>();
      fixtures.set(
        "par-1",
        createFixture("par-1", 1, 1, [
          channel("red", "red"),
        ])
      );

      const fixtureManager = createMockFixtureManager(fixtures);
      const scene = createScene("test", "Test", {
        "par-1": { red: 128 },
      });

      const result = sceneToDMX(scene, fixtureManager);
      const universe1 = result.get(1)!;

      expect(universe1[0]).toBe(128);  // address 1 → index 0
    });

    it("should handle fixture at address 512 (edge case)", () => {
      const fixtures = new Map<string, Fixture>();
      fixtures.set(
        "par-1",
        createFixture("par-1", 1, 512, [
          channel("dimmer", "dimmer"),
        ])
      );

      const fixtureManager = createMockFixtureManager(fixtures);
      const scene = createScene("test", "Test", {
        "par-1": { dimmer: 200 },
      });

      const result = sceneToDMX(scene, fixtureManager);
      const universe1 = result.get(1)!;

      expect(universe1[511]).toBe(200);  // address 512 → index 511
    });
  });

  describe("empty scene", () => {
    it("should return an empty map for a scene with no fixture states", () => {
      const fixtureManager = createMockFixtureManager(new Map());
      const scene = createScene("empty", "Empty", {});

      const result = sceneToDMX(scene, fixtureManager);

      expect(result.size).toBe(0);
    });
  });
});
```

### 4. Run the Tests

```bash
npx vitest run tests/scenes/
```

Verify all tests pass. If any fail, investigate and fix the source code in Tasks 13 or 14.

### 5. Run the Full Test Suite

Ensure the new tests do not break any existing tests:

```bash
npx vitest run
```

---

## Verification

- [ ] File `tests/scenes/manager.test.ts` exists
- [ ] File `tests/scenes/dmx-mapper.test.ts` exists
- [ ] SceneManager tests cover: scene creation storing fixture states
- [ ] SceneManager tests cover: scene update merging values correctly
- [ ] SceneManager tests cover: scene deletion
- [ ] SceneManager tests cover: validation rejects unknown fixture IDs
- [ ] SceneManager tests cover: validation rejects out-of-range channel values
- [ ] SceneManager tests cover: getScene returns correct data
- [ ] SceneManager tests cover: listScenes returns summaries for all scenes
- [ ] DMX mapper tests cover: single RGB fixture maps to correct channels
- [ ] DMX mapper tests cover: multi-fixture scene maps all fixtures in same universe
- [ ] DMX mapper tests cover: missing channel values use default from profile
- [ ] DMX mapper tests cover: multi-universe scene returns correct universe map
- [ ] DMX mapper tests cover: edge cases (address 1, address 512)
- [ ] DMX mapper tests cover: empty scene returns empty map
- [ ] `npx vitest run tests/scenes/` passes with all tests green
- [ ] `npx vitest run` passes with no regressions in existing tests

---

## Notes

- The tests use mock `FixtureManager` objects created via `vi.fn()`. These mocks are minimal: they only implement `getFixture()` because that is the only method the SceneManager and DMX mapper use. If the `FixtureManager` interface changes, these mocks may need updating.
- The `createScene` helper in the DMX mapper tests constructs `Scene` objects directly (bypassing `SceneManager`) to test the mapper in isolation. This is intentional -- these are unit tests, not integration tests.
- The DMX mapper tests do not test error handling for unknown fixture IDs because the mapper assumes fixtures exist (the SceneManager validates them at creation time). If `getFixture` throws in the mapper, it propagates up naturally.
- Test file imports use relative paths (e.g., `../../src/scenes/manager.js`) matching the project's ESM configuration. The `.js` extension is required for Node16 module resolution even though the source files are `.ts`.
- No tests for `preview_scene` are included in this task because it requires mocking the OLA client (an async HTTP dependency). Integration-level tests for preview can be added in a future task or as part of Milestone 6 testing.

---

**Next Task**: None (this is the final task in Milestone 3)
**Related Design Docs**: [DMX Lighting MCP Design](../../design/local.dmx-lighting-mcp.md)
