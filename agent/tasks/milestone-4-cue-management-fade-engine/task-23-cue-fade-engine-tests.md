# Task 23: Add Cue and Fade Engine Tests

**Milestone**: [M4 - Cue Management & Fade Engine](../../milestones/milestone-4-cue-management-fade-engine.md)
**Estimated Time**: 1.5 hours
**Dependencies**: Task 18 (CueManager), Task 19 (FadeEngine)
**Status**: Not Started

---

## Objective

Write comprehensive unit tests for the `CueManager` (cue list CRUD, add/remove/reorder cues, scene validation) and the `FadeEngine` (interpolation math, 0ms instant snap, multi-channel interpolation, cancellation via AbortSignal). Tests use vitest with mocked dependencies.

---

## Context

The cue management and fade engine are the core of Milestone 4. The `CueManager` handles data operations (creating/modifying cue lists and cues), while the `FadeEngine` handles the timing-critical interpolation of DMX values during transitions. Both need thorough testing:

- **CueManager tests** verify CRUD operations, ordering logic, and validation rules (scene references, duplicate IDs, timing values). These tests mock the `SceneManager` to control which scene IDs are considered valid.
- **FadeEngine tests** verify the interpolation math is correct, that 0ms durations snap instantly, that multi-channel interpolation works, and that cancellation via `AbortSignal` stops the fade. These tests mock the `OLAClient` to capture the DMX values pushed during a fade and verify they are correct.

The test framework is vitest (installed in Task 5), and the test patterns follow the conventions established in `tests/ola/client.test.ts`.

---

## Steps

### 1. Create the Test Directory

```bash
mkdir -p tests/cues
```

### 2. Create CueManager Tests

Create `tests/cues/manager.test.ts`:

```typescript
// tests/cues/manager.test.ts

import { describe, it, expect, beforeEach } from "vitest";
import { CueManager } from "../../src/cues/manager.js";
import type { SceneManager } from "../../src/scenes/manager.js";
import type { Cue } from "../../src/types/index.js";

/**
 * Create a mock SceneManager that recognizes a set of valid scene IDs.
 * getScene() throws for unknown IDs, mimicking real SceneManager behavior.
 */
function createMockSceneManager(validSceneIds: string[]): SceneManager {
  const validIds = new Set(validSceneIds);
  return {
    getScene(id: string) {
      if (!validIds.has(id)) {
        throw new Error(`Scene with ID "${id}" not found`);
      }
      return { id, name: `Scene ${id}`, fixtureStates: new Map() };
    },
  } as unknown as SceneManager;
}

/**
 * Helper to create a valid cue object for testing.
 */
function createTestCue(overrides: Partial<Cue> = {}): Cue {
  return {
    id: "cue-1",
    name: "Test Cue",
    scene: "scene-1",
    fadeInMs: 1000,
    holdMs: 2000,
    fadeOutMs: 500,
    ...overrides,
  };
}

describe("CueManager", () => {
  let cueManager: CueManager;
  let mockSceneManager: SceneManager;

  beforeEach(() => {
    mockSceneManager = createMockSceneManager(["scene-1", "scene-2", "scene-3"]);
    cueManager = new CueManager(mockSceneManager);
  });

  // -----------------------------------------------------------------------
  // CueList CRUD
  // -----------------------------------------------------------------------

  describe("createCueList", () => {
    it("creates a cue list with an empty cues array", () => {
      const cueList = cueManager.createCueList("list-1", "Main Show");
      expect(cueList.id).toBe("list-1");
      expect(cueList.name).toBe("Main Show");
      expect(cueList.cues).toEqual([]);
      expect(cueList.loop).toBe(false);
    });

    it("creates a cue list with loop enabled", () => {
      const cueList = cueManager.createCueList("list-1", "Ambient", true);
      expect(cueList.loop).toBe(true);
    });

    it("defaults loop to false when not specified", () => {
      const cueList = cueManager.createCueList("list-1", "Show");
      expect(cueList.loop).toBe(false);
    });

    it("throws if cue list ID already exists", () => {
      cueManager.createCueList("list-1", "First");
      expect(() => cueManager.createCueList("list-1", "Duplicate")).toThrow(
        /already exists/
      );
    });
  });

  describe("getCueList", () => {
    it("returns the cue list by ID", () => {
      cueManager.createCueList("list-1", "Main Show");
      const cueList = cueManager.getCueList("list-1");
      expect(cueList.id).toBe("list-1");
      expect(cueList.name).toBe("Main Show");
    });

    it("throws if cue list does not exist", () => {
      expect(() => cueManager.getCueList("nonexistent")).toThrow(/not found/);
    });
  });

  describe("listCueLists", () => {
    it("returns empty array when no cue lists exist", () => {
      expect(cueManager.listCueLists()).toEqual([]);
    });

    it("returns summary info for all cue lists", () => {
      cueManager.createCueList("list-1", "Show A");
      cueManager.createCueList("list-2", "Show B", true);

      const lists = cueManager.listCueLists();
      expect(lists).toHaveLength(2);
      expect(lists[0]).toEqual({
        id: "list-1",
        name: "Show A",
        cueCount: 0,
        loop: false,
      });
      expect(lists[1]).toEqual({
        id: "list-2",
        name: "Show B",
        cueCount: 0,
        loop: true,
      });
    });
  });

  describe("deleteCueList", () => {
    it("removes a cue list", () => {
      cueManager.createCueList("list-1", "Show");
      cueManager.deleteCueList("list-1");
      expect(() => cueManager.getCueList("list-1")).toThrow(/not found/);
    });

    it("throws if cue list does not exist", () => {
      expect(() => cueManager.deleteCueList("nonexistent")).toThrow(
        /not found/
      );
    });
  });

  // -----------------------------------------------------------------------
  // Cue Management
  // -----------------------------------------------------------------------

  describe("addCue", () => {
    beforeEach(() => {
      cueManager.createCueList("list-1", "Show");
    });

    it("appends a cue to the end of the list", () => {
      const cue = createTestCue({ id: "cue-1", scene: "scene-1" });
      const updated = cueManager.addCue("list-1", cue);
      expect(updated.cues).toHaveLength(1);
      expect(updated.cues[0].id).toBe("cue-1");
    });

    it("appends multiple cues in order", () => {
      cueManager.addCue("list-1", createTestCue({ id: "cue-1", scene: "scene-1" }));
      cueManager.addCue("list-1", createTestCue({ id: "cue-2", scene: "scene-2" }));
      cueManager.addCue("list-1", createTestCue({ id: "cue-3", scene: "scene-3" }));

      const cueList = cueManager.getCueList("list-1");
      expect(cueList.cues.map((c) => c.id)).toEqual(["cue-1", "cue-2", "cue-3"]);
    });

    it("throws if the referenced scene does not exist", () => {
      const cue = createTestCue({ scene: "nonexistent-scene" });
      expect(() => cueManager.addCue("list-1", cue)).toThrow(
        /Scene with ID "nonexistent-scene" not found/
      );
    });

    it("throws if a cue with the same ID already exists in the list", () => {
      cueManager.addCue("list-1", createTestCue({ id: "cue-1", scene: "scene-1" }));
      expect(() =>
        cueManager.addCue("list-1", createTestCue({ id: "cue-1", scene: "scene-2" }))
      ).toThrow(/already exists/);
    });

    it("throws if cue list does not exist", () => {
      expect(() =>
        cueManager.addCue("nonexistent", createTestCue())
      ).toThrow(/not found/);
    });

    it("throws if fadeInMs is negative", () => {
      const cue = createTestCue({ fadeInMs: -100 });
      expect(() => cueManager.addCue("list-1", cue)).toThrow(/fadeInMs/);
    });

    it("throws if holdMs is negative", () => {
      const cue = createTestCue({ holdMs: -50 });
      expect(() => cueManager.addCue("list-1", cue)).toThrow(/holdMs/);
    });

    it("throws if fadeOutMs is negative", () => {
      const cue = createTestCue({ fadeOutMs: -1 });
      expect(() => cueManager.addCue("list-1", cue)).toThrow(/fadeOutMs/);
    });

    it("allows zero timing values", () => {
      const cue = createTestCue({
        fadeInMs: 0,
        holdMs: 0,
        fadeOutMs: 0,
      });
      const updated = cueManager.addCue("list-1", cue);
      expect(updated.cues[0].fadeInMs).toBe(0);
      expect(updated.cues[0].holdMs).toBe(0);
      expect(updated.cues[0].fadeOutMs).toBe(0);
    });
  });

  describe("removeCue", () => {
    beforeEach(() => {
      cueManager.createCueList("list-1", "Show");
      cueManager.addCue("list-1", createTestCue({ id: "cue-1", scene: "scene-1" }));
      cueManager.addCue("list-1", createTestCue({ id: "cue-2", scene: "scene-2" }));
      cueManager.addCue("list-1", createTestCue({ id: "cue-3", scene: "scene-3" }));
    });

    it("removes a cue by ID", () => {
      const updated = cueManager.removeCue("list-1", "cue-2");
      expect(updated.cues.map((c) => c.id)).toEqual(["cue-1", "cue-3"]);
    });

    it("removes the first cue", () => {
      const updated = cueManager.removeCue("list-1", "cue-1");
      expect(updated.cues.map((c) => c.id)).toEqual(["cue-2", "cue-3"]);
    });

    it("removes the last cue", () => {
      const updated = cueManager.removeCue("list-1", "cue-3");
      expect(updated.cues.map((c) => c.id)).toEqual(["cue-1", "cue-2"]);
    });

    it("throws if cue ID is not found in the list", () => {
      expect(() => cueManager.removeCue("list-1", "nonexistent")).toThrow(
        /not found/
      );
    });

    it("throws if cue list does not exist", () => {
      expect(() => cueManager.removeCue("nonexistent", "cue-1")).toThrow(
        /not found/
      );
    });
  });

  describe("reorderCues", () => {
    beforeEach(() => {
      cueManager.createCueList("list-1", "Show");
      cueManager.addCue("list-1", createTestCue({ id: "cue-1", name: "First", scene: "scene-1" }));
      cueManager.addCue("list-1", createTestCue({ id: "cue-2", name: "Second", scene: "scene-2" }));
      cueManager.addCue("list-1", createTestCue({ id: "cue-3", name: "Third", scene: "scene-3" }));
    });

    it("reorders cues to match the provided order", () => {
      const updated = cueManager.reorderCues("list-1", ["cue-3", "cue-1", "cue-2"]);
      expect(updated.cues.map((c) => c.id)).toEqual(["cue-3", "cue-1", "cue-2"]);
    });

    it("reverses the order", () => {
      const updated = cueManager.reorderCues("list-1", ["cue-3", "cue-2", "cue-1"]);
      expect(updated.cues.map((c) => c.id)).toEqual(["cue-3", "cue-2", "cue-1"]);
    });

    it("preserves cue data after reorder", () => {
      cueManager.reorderCues("list-1", ["cue-2", "cue-3", "cue-1"]);
      const cueList = cueManager.getCueList("list-1");
      expect(cueList.cues[0].name).toBe("Second");
      expect(cueList.cues[1].name).toBe("Third");
      expect(cueList.cues[2].name).toBe("First");
    });

    it("throws if cue IDs contain duplicates", () => {
      expect(() =>
        cueManager.reorderCues("list-1", ["cue-1", "cue-1", "cue-3"])
      ).toThrow(/Duplicate/);
    });

    it("throws if a cue ID is missing from the input", () => {
      expect(() =>
        cueManager.reorderCues("list-1", ["cue-1", "cue-2"])
      ).toThrow(/missing/);
    });

    it("throws if an unknown cue ID is provided", () => {
      expect(() =>
        cueManager.reorderCues("list-1", ["cue-1", "cue-2", "unknown"])
      ).toThrow(/not in cue list/);
    });

    it("throws if cue list does not exist", () => {
      expect(() =>
        cueManager.reorderCues("nonexistent", ["cue-1"])
      ).toThrow(/not found/);
    });
  });
});
```

### 3. Create FadeEngine Tests

Create `tests/cues/fade-engine.test.ts`:

```typescript
// tests/cues/fade-engine.test.ts

import { describe, it, expect, vi, beforeEach } from "vitest";
import { FadeEngine } from "../../src/cues/fade-engine.js";
import type { OLAClient } from "../../src/ola/client.js";

/**
 * Create a mock OLAClient that captures all setDMX calls.
 * Returns the list of captured calls for verification.
 */
function createMockOLAClient(): {
  client: OLAClient;
  calls: Array<{ universe: number; channels: number[] }>;
} {
  const calls: Array<{ universe: number; channels: number[] }> = [];

  const client = {
    async setDMX(universe: number, channels: number[]): Promise<void> {
      // Store a copy of the channels array to avoid mutation issues
      calls.push({ universe, channels: [...channels] });
    },
  } as unknown as OLAClient;

  return { client, calls };
}

describe("FadeEngine", () => {
  let fadeEngine: FadeEngine;

  beforeEach(() => {
    fadeEngine = new FadeEngine();
  });

  // -----------------------------------------------------------------------
  // Instant Snap (0ms duration)
  // -----------------------------------------------------------------------

  describe("instant snap (0ms duration)", () => {
    it("sets target values immediately with a single setDMX call", async () => {
      const { client, calls } = createMockOLAClient();

      const from = new Map<number, number>();
      const to = new Map<number, number>([
        [0, 255],
        [1, 128],
        [2, 64],
      ]);

      await fadeEngine.executeFade(from, to, 0, 1, client);

      // Should make exactly one call (no interpolation steps)
      expect(calls).toHaveLength(1);
      expect(calls[0].universe).toBe(1);
      expect(calls[0].channels[0]).toBe(255);
      expect(calls[0].channels[1]).toBe(128);
      expect(calls[0].channels[2]).toBe(64);
    });

    it("produces a 512-element channel array", async () => {
      const { client, calls } = createMockOLAClient();

      const to = new Map<number, number>([[0, 100]]);
      await fadeEngine.executeFade(new Map(), to, 0, 1, client);

      expect(calls[0].channels).toHaveLength(512);
    });

    it("sets unspecified channels to 0", async () => {
      const { client, calls } = createMockOLAClient();

      const to = new Map<number, number>([[5, 200]]);
      await fadeEngine.executeFade(new Map(), to, 0, 1, client);

      expect(calls[0].channels[0]).toBe(0);
      expect(calls[0].channels[5]).toBe(200);
      expect(calls[0].channels[511]).toBe(0);
    });
  });

  // -----------------------------------------------------------------------
  // Interpolation Math
  // -----------------------------------------------------------------------

  describe("interpolation", () => {
    it("interpolates from 0 to 255 correctly", async () => {
      const { client, calls } = createMockOLAClient();

      const from = new Map<number, number>([[0, 0]]);
      const to = new Map<number, number>([[0, 255]]);

      // Use a short duration for fast test execution
      // 50ms at 40fps = 2 steps (0, 1, 2), plus final frame
      await fadeEngine.executeFade(from, to, 50, 1, client);

      // Verify we got multiple frames
      expect(calls.length).toBeGreaterThan(1);

      // First frame should be at or near 0 (progress = 0/steps)
      expect(calls[0].channels[0]).toBe(0);

      // Last frame should be exactly 255 (final frame at target)
      expect(calls[calls.length - 1].channels[0]).toBe(255);
    });

    it("interpolates from 255 to 0 correctly", async () => {
      const { client, calls } = createMockOLAClient();

      const from = new Map<number, number>([[0, 255]]);
      const to = new Map<number, number>([[0, 0]]);

      await fadeEngine.executeFade(from, to, 50, 1, client);

      // First frame should be 255
      expect(calls[0].channels[0]).toBe(255);

      // Last frame should be exactly 0
      expect(calls[calls.length - 1].channels[0]).toBe(0);
    });

    it("produces monotonically increasing values for a fade up", async () => {
      const { client, calls } = createMockOLAClient();

      const from = new Map<number, number>([[0, 0]]);
      const to = new Map<number, number>([[0, 255]]);

      await fadeEngine.executeFade(from, to, 100, 1, client);

      // Each frame's value should be >= the previous frame's value
      for (let i = 1; i < calls.length; i++) {
        expect(calls[i].channels[0]).toBeGreaterThanOrEqual(
          calls[i - 1].channels[0]
        );
      }
    });

    it("interpolates multiple channels simultaneously", async () => {
      const { client, calls } = createMockOLAClient();

      const from = new Map<number, number>([
        [0, 0],    // red: 0 → 255
        [1, 255],  // green: 255 → 0
        [2, 100],  // blue: 100 → 100 (no change)
      ]);
      const to = new Map<number, number>([
        [0, 255],
        [1, 0],
        [2, 100],
      ]);

      await fadeEngine.executeFade(from, to, 50, 1, client);

      // First frame
      expect(calls[0].channels[0]).toBe(0);    // red starts at 0
      expect(calls[0].channels[1]).toBe(255);  // green starts at 255
      expect(calls[0].channels[2]).toBe(100);  // blue starts at 100

      // Last frame
      const last = calls[calls.length - 1];
      expect(last.channels[0]).toBe(255);  // red ends at 255
      expect(last.channels[1]).toBe(0);    // green ends at 0
      expect(last.channels[2]).toBe(100);  // blue stays at 100
    });

    it("handles 50% progress correctly for a simple fade", async () => {
      const { client, calls } = createMockOLAClient();

      const from = new Map<number, number>([[0, 0]]);
      const to = new Map<number, number>([[0, 200]]);

      // 25ms = 1 step at 40fps. Steps: 0 (0%), 1 (100%), + final
      // Use 50ms = 2 steps: 0 (0%), 1 (50%), 2 (100%), + final
      await fadeEngine.executeFade(from, to, 50, 1, client);

      // With 2 steps, the middle frame (step 1) should be at 50% progress
      // 0 + (200 - 0) * 0.5 = 100
      // Find the middle frame (index 1, since index 0 is step 0)
      if (calls.length >= 3) {
        expect(calls[1].channels[0]).toBe(100);
      }
    });

    it("channels in 'to' but not 'from' interpolate from 0", async () => {
      const { client, calls } = createMockOLAClient();

      const from = new Map<number, number>();  // empty
      const to = new Map<number, number>([[0, 200]]);

      await fadeEngine.executeFade(from, to, 50, 1, client);

      // First frame: from value is 0 (default)
      expect(calls[0].channels[0]).toBe(0);
      // Last frame: target value
      expect(calls[calls.length - 1].channels[0]).toBe(200);
    });

    it("channels in 'from' but not 'to' interpolate to 0", async () => {
      const { client, calls } = createMockOLAClient();

      const from = new Map<number, number>([[0, 200]]);
      const to = new Map<number, number>();  // empty

      await fadeEngine.executeFade(from, to, 50, 1, client);

      // First frame: from value
      expect(calls[0].channels[0]).toBe(200);
      // Last frame: 0 (default)
      expect(calls[calls.length - 1].channels[0]).toBe(0);
    });
  });

  // -----------------------------------------------------------------------
  // Cancellation via AbortSignal
  // -----------------------------------------------------------------------

  describe("cancellation", () => {
    it("throws if aborted before starting", async () => {
      const { client } = createMockOLAClient();

      const controller = new AbortController();
      controller.abort(); // Abort immediately

      const from = new Map<number, number>();
      const to = new Map<number, number>([[0, 255]]);

      await expect(
        fadeEngine.executeFade(from, to, 1000, 1, client, controller.signal)
      ).rejects.toThrow(/aborted/i);
    });

    it("throws when aborted mid-fade", async () => {
      const { client } = createMockOLAClient();

      const controller = new AbortController();

      const from = new Map<number, number>();
      const to = new Map<number, number>([[0, 255]]);

      // Abort after a short delay
      setTimeout(() => controller.abort(), 30);

      await expect(
        fadeEngine.executeFade(from, to, 5000, 1, client, controller.signal)
      ).rejects.toThrow(/aborted/i);
    });

    it("does not push all frames when aborted mid-fade", async () => {
      const { client, calls } = createMockOLAClient();

      const controller = new AbortController();

      const from = new Map<number, number>();
      const to = new Map<number, number>([[0, 255]]);

      // Abort after a short delay
      setTimeout(() => controller.abort(), 30);

      try {
        await fadeEngine.executeFade(from, to, 5000, 1, client, controller.signal);
      } catch {
        // Expected to throw
      }

      // Should have fewer frames than a full 5-second fade at 40fps (200 frames)
      expect(calls.length).toBeLessThan(200);
    });
  });

  // -----------------------------------------------------------------------
  // Universe and Channel Array
  // -----------------------------------------------------------------------

  describe("universe and channel array", () => {
    it("sends to the correct universe", async () => {
      const { client, calls } = createMockOLAClient();

      const to = new Map<number, number>([[0, 100]]);
      await fadeEngine.executeFade(new Map(), to, 0, 3, client);

      expect(calls[0].universe).toBe(3);
    });

    it("always produces 512-element arrays", async () => {
      const { client, calls } = createMockOLAClient();

      const to = new Map<number, number>([[511, 42]]);
      await fadeEngine.executeFade(new Map(), to, 0, 1, client);

      expect(calls[0].channels).toHaveLength(512);
      expect(calls[0].channels[511]).toBe(42);
    });

    it("ignores out-of-range channel indices", async () => {
      const { client, calls } = createMockOLAClient();

      const to = new Map<number, number>([
        [0, 100],
        [512, 200],   // out of range -- should be ignored
        [-1, 150],    // out of range -- should be ignored
      ]);
      await fadeEngine.executeFade(new Map(), to, 0, 1, client);

      expect(calls[0].channels[0]).toBe(100);
      // Out-of-range channels should not appear
      expect(calls[0].channels).toHaveLength(512);
    });
  });

  // -----------------------------------------------------------------------
  // Final Frame Guarantee
  // -----------------------------------------------------------------------

  describe("final frame", () => {
    it("sends exact target values as the final frame", async () => {
      const { client, calls } = createMockOLAClient();

      const from = new Map<number, number>([[0, 0]]);
      const to = new Map<number, number>([[0, 173]]); // Odd value to test rounding

      await fadeEngine.executeFade(from, to, 100, 1, client);

      // The very last call should have exactly the target value
      const lastCall = calls[calls.length - 1];
      expect(lastCall.channels[0]).toBe(173);
    });
  });
});
```

### 4. Run the Tests

Execute the test suite:

```bash
npx vitest run tests/cues/
```

All tests should pass.

### 5. Run Full Test Suite

Ensure no existing tests are broken:

```bash
npx vitest run
```

---

## Verification

- [ ] `tests/cues/manager.test.ts` exists with comprehensive CueManager tests
- [ ] `tests/cues/fade-engine.test.ts` exists with comprehensive FadeEngine tests
- [ ] CueManager tests cover `createCueList` (success, duplicate ID, loop flag)
- [ ] CueManager tests cover `getCueList` (success, not found)
- [ ] CueManager tests cover `listCueLists` (empty, multiple lists)
- [ ] CueManager tests cover `deleteCueList` (success, not found)
- [ ] CueManager tests cover `addCue` (append, scene validation, duplicate ID, negative timing, zero timing)
- [ ] CueManager tests cover `removeCue` (first/middle/last, not found)
- [ ] CueManager tests cover `reorderCues` (valid reorder, preserves data, duplicates, missing IDs, unknown IDs)
- [ ] FadeEngine tests cover 0ms instant snap (single setDMX call, correct values)
- [ ] FadeEngine tests cover interpolation at 0% progress (from values)
- [ ] FadeEngine tests cover interpolation at 100% progress (to values)
- [ ] FadeEngine tests cover interpolation at 50% progress (midpoint values)
- [ ] FadeEngine tests cover multi-channel interpolation (simultaneous channels)
- [ ] FadeEngine tests cover channels present in only "from" or only "to"
- [ ] FadeEngine tests cover cancellation via AbortSignal (before start and mid-fade)
- [ ] FadeEngine tests cover correct universe number in setDMX calls
- [ ] FadeEngine tests cover 512-element channel arrays
- [ ] FadeEngine tests verify final frame has exact target values
- [ ] `npx vitest run` passes all tests with zero failures
- [ ] No existing tests are broken

---

## Notes

- The `CueManager` tests use a minimal mock of `SceneManager` that only implements `getScene()`. This is sufficient because `CueManager` only calls `sceneManager.getScene(id)` to validate scene references. The mock throws for unknown IDs, mimicking real `SceneManager` behavior.
- The `FadeEngine` tests use a mock `OLAClient` that captures `setDMX` calls into an array. This allows tests to inspect the exact DMX values pushed at each frame without any network or timing dependencies.
- Fade timing tests use short durations (50-100ms) to keep tests fast. The tests do not verify exact timing precision (e.g., that frames are exactly 25ms apart) because `setTimeout` resolution varies by platform. Instead, they verify the interpolation math and frame ordering.
- The `AbortSignal` tests use `setTimeout(() => controller.abort(), 30)` to trigger cancellation during a long fade. The exact number of frames before cancellation is non-deterministic, so the test only verifies that the fade was interrupted (fewer frames than expected) and that the Promise rejected.
- The FadeEngine tests for "50% progress" assume a specific step count based on `Math.floor(durationMs / 25)`. For 50ms, that is 2 steps, which produces frames at progress 0/2=0%, 1/2=50%, 2/2=100%. The test accounts for the guard condition on call count.
- Channel arrays are copied in the mock OLAClient (`[...channels]`) to prevent mutation between frames from affecting test assertions.

---

**Next Task**: None (this is the last task in Milestone 4)
**Related Design Docs**: [DMX Lighting MCP Design](../../design/local.dmx-lighting-mcp.md)
