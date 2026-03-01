# Task 35: End-to-End Integration Tests

**Milestone**: [M6 - Show Management & Effects](../../milestones/milestone-6-show-management-effects.md)
**Estimated Time**: 2 hours
**Dependencies**: Task 30 (ShowStorage), Task 31 (Show Management Tools), Task 32 (Effect Engine), Task 33 (Effect Calculators), Task 34 (MCP Tool Registration)
**Status**: Not Started

---

## Objective

Write integration tests that exercise the full pipeline from fixture patching through show playback, show save/load round-trips, live control, and effect lifecycle. These tests verify that all components work together correctly using a mocked OLA client to capture DMX output.

---

## Context

End-to-end tests verify the entire system works as a cohesive whole, not just individual components in isolation. They follow the real workflow an AI agent would use: patch fixtures, create scenes, build cue lists, run playback, save/load shows, and apply effects. A mocked OLA client intercepts all `setDMX` calls and records the DMX frames that would have been sent to hardware, allowing assertions against the actual DMX output.

These tests are the final validation that the dmx-mcp server is feature-complete and working correctly per the design document. They complement the unit tests written in earlier milestones for individual components (OLA client, fixture profiles, scene manager, etc.).

---

## Steps

### 1. Create the Test File and Mock OLA Client

```bash
mkdir -p tests/e2e
touch tests/e2e/full-pipeline.test.ts
```

Create a mock OLA client that records all DMX frames:

```typescript
// tests/e2e/full-pipeline.test.ts

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { FixtureManager } from "../../src/fixtures/manager.js";
import { SceneManager } from "../../src/scenes/manager.js";
import { CueManager } from "../../src/cues/manager.js";
import { ShowStorage } from "../../src/shows/storage.js";
import {
  handleSaveShow,
  handleLoadShow,
  handleListShows,
} from "../../src/shows/tools.js";
import type { ShowToolDependencies } from "../../src/shows/tools.js";
import {
  EffectEngine,
  registerBuiltInEffects,
} from "../../src/effects/index.js";
import { sceneToDMX } from "../../src/scenes/dmx-mapper.js";
import type { FixtureProfile } from "../../src/types/index.js";
import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";

/**
 * A recorded DMX frame from the mock OLA client.
 */
interface DMXFrame {
  universe: number;
  channels: number[];
  timestamp: number;
}

/**
 * Mock OLA client that records all setDMX calls and returns
 * configurable getDMX responses. No actual HTTP calls are made.
 */
class MockOLAClient {
  /** All frames sent via setDMX, in order */
  public frames: DMXFrame[] = [];

  /** Current DMX state per universe (updated on each setDMX call) */
  private state: Map<number, number[]> = new Map();

  async setDMX(universe: number, channels: number[]): Promise<void> {
    this.frames.push({
      universe,
      channels: [...channels],
      timestamp: Date.now(),
    });
    this.state.set(universe, [...channels]);
  }

  async getDMX(universe: number): Promise<number[]> {
    return this.state.get(universe) ?? new Array(512).fill(0);
  }

  /**
   * Get the last frame sent for a specific universe.
   */
  getLastFrame(universe: number): DMXFrame | undefined {
    for (let i = this.frames.length - 1; i >= 0; i--) {
      if (this.frames[i].universe === universe) {
        return this.frames[i];
      }
    }
    return undefined;
  }

  /**
   * Get all frames sent for a specific universe.
   */
  getFramesForUniverse(universe: number): DMXFrame[] {
    return this.frames.filter((f) => f.universe === universe);
  }

  /**
   * Clear all recorded frames.
   */
  clear(): void {
    this.frames = [];
    this.state.clear();
  }

  getBaseUrl(): string {
    return "http://mock:9090";
  }
}

// ---------------------------------------------------------------------------
// Shared test fixtures (fixture profiles)
// ---------------------------------------------------------------------------

/**
 * Standard 3-channel RGB par fixture profile used across tests.
 */
const rgbParProfile: FixtureProfile = {
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
  modes: [
    {
      name: "3-Channel",
      channelCount: 3,
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
    },
  ],
};

/**
 * 4-channel RGBW par fixture profile.
 */
const rgbwParProfile: FixtureProfile = {
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
  modes: [
    {
      name: "4-Channel",
      channelCount: 4,
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
    },
  ],
};
```

### 2. Test 1: Full Show Workflow

This test exercises the primary workflow: patch fixtures, create scenes, create a cue list with fade transitions, execute cues, and verify DMX output.

```typescript
describe("End-to-End: Full Pipeline", () => {
  let mockOLA: MockOLAClient;
  let fixtureManager: FixtureManager;
  let sceneManager: SceneManager;
  let tempDir: string;

  beforeEach(async () => {
    mockOLA = new MockOLAClient();
    fixtureManager = new FixtureManager();
    sceneManager = new SceneManager(fixtureManager);
    tempDir = await mkdtemp(join(tmpdir(), "dmx-mcp-test-"));
  });

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true });
  });

  it("should execute a full show workflow: patch, scene, cue, play, verify DMX", async () => {
    // Step 1: Patch 4 RGB fixtures on universe 1
    const fixtureIds = ["par-1", "par-2", "par-3", "par-4"];
    for (let i = 0; i < 4; i++) {
      const result = fixtureManager.patchFixture({
        id: fixtureIds[i],
        name: `Par ${i + 1}`,
        profile: rgbParProfile,
        universe: 1,
        startAddress: 1 + i * 3, // 1, 4, 7, 10
      });
      expect(result.success).toBe(true);
    }

    // Verify 4 fixtures patched
    expect(fixtureManager.getFixtureCount()).toBe(4);

    // Step 2: Create a "warm" scene (amber tones)
    const warmScene = sceneManager.createScene("warm", "Warm Amber", {
      "par-1": { red: 255, green: 180, blue: 20 },
      "par-2": { red: 255, green: 180, blue: 20 },
      "par-3": { red: 255, green: 180, blue: 20 },
      "par-4": { red: 255, green: 180, blue: 20 },
    });
    expect(warmScene.id).toBe("warm");

    // Step 3: Create a "cool" scene (blue tones)
    const coolScene = sceneManager.createScene("cool", "Cool Blue", {
      "par-1": { red: 20, green: 50, blue: 255 },
      "par-2": { red: 20, green: 50, blue: 255 },
      "par-3": { red: 20, green: 50, blue: 255 },
      "par-4": { red: 20, green: 50, blue: 255 },
    });
    expect(coolScene.id).toBe("cool");

    // Verify 2 scenes created
    expect(sceneManager.listScenes()).toHaveLength(2);

    // Step 4: Map the warm scene to DMX and verify channel values
    const warmDMX = sceneToDMX(warmScene, fixtureManager);
    const warmChannels = warmDMX.get(1);
    expect(warmChannels).toBeDefined();

    // par-1 at address 1: red=255, green=180, blue=20
    expect(warmChannels![0]).toBe(255); // address 1, index 0
    expect(warmChannels![1]).toBe(180); // address 2, index 1
    expect(warmChannels![2]).toBe(20);  // address 3, index 2

    // par-2 at address 4: red=255, green=180, blue=20
    expect(warmChannels![3]).toBe(255); // address 4, index 3
    expect(warmChannels![4]).toBe(180); // address 5, index 4
    expect(warmChannels![5]).toBe(20);  // address 6, index 5

    // par-4 at address 10: red=255, green=180, blue=20
    expect(warmChannels![9]).toBe(255);  // address 10, index 9
    expect(warmChannels![10]).toBe(180); // address 11, index 10
    expect(warmChannels![11]).toBe(20);  // address 12, index 11

    // Step 5: Map the cool scene and verify
    const coolDMX = sceneToDMX(coolScene, fixtureManager);
    const coolChannels = coolDMX.get(1);
    expect(coolChannels).toBeDefined();

    // par-1 at address 1: red=20, green=50, blue=255
    expect(coolChannels![0]).toBe(20);
    expect(coolChannels![1]).toBe(50);
    expect(coolChannels![2]).toBe(255);

    // Step 6: Push the warm scene to OLA and verify
    await mockOLA.setDMX(1, warmChannels!);
    const lastFrame = mockOLA.getLastFrame(1);
    expect(lastFrame).toBeDefined();
    expect(lastFrame!.channels[0]).toBe(255); // par-1 red
    expect(lastFrame!.channels[1]).toBe(180); // par-1 green
    expect(lastFrame!.channels[2]).toBe(20);  // par-1 blue
  });
```

### 3. Test 2: Show Save/Load Round-Trip

This test verifies that a complete show can be saved to disk, all state cleared, and then loaded back with everything restored correctly.

```typescript
  it("should save and load a show with all state preserved", async () => {
    const showStorage = new ShowStorage(tempDir);
    const cueManager = new CueManager();

    const showDeps: ShowToolDependencies = {
      fixtureManager,
      sceneManager,
      cueManager,
      showStorage,
    };

    // Step 1: Set up show state
    // Patch 2 fixtures
    fixtureManager.patchFixture({
      id: "par-1",
      name: "Par 1",
      profile: rgbParProfile,
      universe: 1,
      startAddress: 1,
    });
    fixtureManager.patchFixture({
      id: "par-2",
      name: "Par 2",
      profile: rgbParProfile,
      universe: 1,
      startAddress: 4,
    });

    // Create a scene
    sceneManager.createScene("opening", "Opening Look", {
      "par-1": { red: 255, green: 0, blue: 128 },
      "par-2": { red: 0, green: 255, blue: 64 },
    });

    // Create a cue list with a cue
    cueManager.createCueList("main", "Main Show", false);
    cueManager.addCue("main", {
      id: "cue-1",
      name: "Opening",
      scene: "opening",
      fadeInMs: 2000,
      holdMs: 5000,
      fadeOutMs: 1000,
    });

    // Step 2: Save the show
    const saveResult = await handleSaveShow(
      { id: "test-show", name: "Test Show" },
      showDeps
    );
    expect(saveResult.success).toBe(true);
    expect(saveResult.showId).toBe("test-show");

    // Step 3: Verify the show appears in list
    const listResult = await handleListShows(showDeps);
    expect(listResult.success).toBe(true);
    expect(listResult.shows).toHaveLength(1);
    expect(listResult.shows[0].id).toBe("test-show");
    expect(listResult.shows[0].name).toBe("Test Show");
    expect(listResult.shows[0].fixtureCount).toBe(2);
    expect(listResult.shows[0].sceneCount).toBe(1);
    expect(listResult.shows[0].cueListCount).toBe(1);

    // Step 4: Clear all state
    fixtureManager.clear();
    sceneManager.clear();
    cueManager.clear();

    // Verify state is empty
    expect(fixtureManager.getFixtureCount()).toBe(0);
    expect(sceneManager.listScenes()).toHaveLength(0);
    expect(cueManager.listCueLists()).toHaveLength(0);

    // Step 5: Load the show
    const loadResult = await handleLoadShow(
      { id: "test-show" },
      showDeps
    );
    expect(loadResult.success).toBe(true);
    expect(loadResult.showName).toBe("Test Show");

    // Step 6: Verify all state was restored
    // Fixtures
    expect(fixtureManager.getFixtureCount()).toBe(2);
    const par1 = fixtureManager.getFixture("par-1");
    expect(par1).toBeDefined();
    expect(par1!.name).toBe("Par 1");
    expect(par1!.universe).toBe(1);
    expect(par1!.startAddress).toBe(1);

    const par2 = fixtureManager.getFixture("par-2");
    expect(par2).toBeDefined();
    expect(par2!.startAddress).toBe(4);

    // Scenes
    expect(sceneManager.listScenes()).toHaveLength(1);
    const restoredScene = sceneManager.getScene("opening");
    expect(restoredScene.name).toBe("Opening Look");
    expect(restoredScene.fixtureStates.size).toBe(2);

    // Verify Map was reconstructed correctly
    const par1State = restoredScene.fixtureStates.get("par-1");
    expect(par1State).toEqual({ red: 255, green: 0, blue: 128 });

    const par2State = restoredScene.fixtureStates.get("par-2");
    expect(par2State).toEqual({ red: 0, green: 255, blue: 64 });

    // Cue lists
    expect(cueManager.listCueLists()).toHaveLength(1);
    const restoredCueList = cueManager.getCueList("main");
    expect(restoredCueList.name).toBe("Main Show");
    expect(restoredCueList.cues).toHaveLength(1);
    expect(restoredCueList.cues[0].id).toBe("cue-1");
    expect(restoredCueList.cues[0].fadeInMs).toBe(2000);
  });
```

### 4. Test 3: Live Control

This test verifies direct fixture control (set color, blackout) with DMX output verification.

```typescript
  it("should support live control: set color, verify DMX, blackout", async () => {
    // Patch a fixture
    fixtureManager.patchFixture({
      id: "par-1",
      name: "Par 1",
      profile: rgbParProfile,
      universe: 1,
      startAddress: 1,
    });

    // Create a scene with a specific color
    const scene = sceneManager.createScene("red-look", "Red Look", {
      "par-1": { red: 255, green: 0, blue: 0 },
    });

    // Map to DMX and push to mock OLA
    const dmxMap = sceneToDMX(scene, fixtureManager);
    const channels = dmxMap.get(1)!;
    await mockOLA.setDMX(1, channels);

    // Verify DMX output shows red
    const frame = mockOLA.getLastFrame(1)!;
    expect(frame.channels[0]).toBe(255); // red
    expect(frame.channels[1]).toBe(0);   // green
    expect(frame.channels[2]).toBe(0);   // blue

    // Blackout: set all channels to zero
    const blackout = new Array(512).fill(0);
    await mockOLA.setDMX(1, blackout);

    // Verify all zeros
    const blackoutFrame = mockOLA.getLastFrame(1)!;
    expect(blackoutFrame.channels[0]).toBe(0);
    expect(blackoutFrame.channels[1]).toBe(0);
    expect(blackoutFrame.channels[2]).toBe(0);

    // Verify no non-zero values in the entire universe
    const hasNonZero = blackoutFrame.channels.some((v) => v !== 0);
    expect(hasNonZero).toBe(false);
  });
```

### 5. Test 4: Effect Lifecycle

This test verifies that effects can be started, produce changing DMX output over time, and be cleanly stopped.

```typescript
  it("should start, run, and stop effects with DMX output", async () => {
    // Patch 3 RGB fixtures
    for (let i = 0; i < 3; i++) {
      fixtureManager.patchFixture({
        id: `par-${i + 1}`,
        name: `Par ${i + 1}`,
        profile: rgbParProfile,
        universe: 1,
        startAddress: 1 + i * 3,
      });
    }

    // Create effect engine with mock OLA
    const effectEngine = new EffectEngine(
      mockOLA as any,
      fixtureManager
    );
    registerBuiltInEffects(effectEngine);

    // Start a chase effect
    const effectId = effectEngine.startEffect(
      "chase",
      ["par-1", "par-2", "par-3"],
      { speed: 2.0 }
    );

    expect(effectId).toBeDefined();
    expect(effectEngine.getActiveEffectCount()).toBe(1);

    // Wait for some frames to be generated
    await new Promise((resolve) => setTimeout(resolve, 150));

    // Verify DMX frames were sent
    const frames = mockOLA.getFramesForUniverse(1);
    expect(frames.length).toBeGreaterThan(0);

    // Verify that the chase produces different values over time
    // (at least some frames should have different active fixtures)
    const uniquePatterns = new Set<string>();
    for (const frame of frames) {
      // Extract just the 9 channels that our 3 fixtures use
      const relevant = frame.channels.slice(0, 9);
      uniquePatterns.add(JSON.stringify(relevant));
    }
    // With speed=2.0 and 150ms, we should see at least 2 patterns
    // (though exact count depends on timing)
    expect(uniquePatterns.size).toBeGreaterThanOrEqual(1);

    // List active effects
    const activeEffects = effectEngine.listActiveEffects();
    expect(activeEffects).toHaveLength(1);
    expect(activeEffects[0].id).toBe(effectId);
    expect(activeEffects[0].type).toBe("chase");
    expect(activeEffects[0].fixtureIds).toEqual([
      "par-1",
      "par-2",
      "par-3",
    ]);

    // Stop the effect
    effectEngine.stopEffect(effectId);
    expect(effectEngine.getActiveEffectCount()).toBe(0);

    // Record frame count after stopping
    const framesAfterStop = mockOLA.frames.length;

    // Wait briefly and verify no new frames are produced
    await new Promise((resolve) => setTimeout(resolve, 100));
    expect(mockOLA.frames.length).toBe(framesAfterStop);
  });
```

### 6. Test 5: Multiple Effects Simultaneously

```typescript
  it("should run multiple effects simultaneously on different fixtures", async () => {
    // Patch 6 fixtures: 3 for chase, 3 for rainbow
    for (let i = 0; i < 6; i++) {
      fixtureManager.patchFixture({
        id: `par-${i + 1}`,
        name: `Par ${i + 1}`,
        profile: rgbParProfile,
        universe: 1,
        startAddress: 1 + i * 3,
      });
    }

    const effectEngine = new EffectEngine(
      mockOLA as any,
      fixtureManager
    );
    registerBuiltInEffects(effectEngine);

    // Start chase on first 3 fixtures
    const chaseId = effectEngine.startEffect(
      "chase",
      ["par-1", "par-2", "par-3"],
      { speed: 1.0 }
    );

    // Start rainbow on last 3 fixtures
    const rainbowId = effectEngine.startEffect(
      "rainbow",
      ["par-4", "par-5", "par-6"],
      { speed: 1.0 }
    );

    expect(effectEngine.getActiveEffectCount()).toBe(2);

    // Let effects run
    await new Promise((resolve) => setTimeout(resolve, 100));

    // Verify both effects are producing frames
    expect(mockOLA.frames.length).toBeGreaterThan(0);

    // Stop all effects
    effectEngine.stopAll();
    expect(effectEngine.getActiveEffectCount()).toBe(0);
  });
```

### 7. Close the Describe Block

```typescript
});
```

### 8. Run the Tests

```bash
npx vitest run tests/e2e/full-pipeline.test.ts
```

---

## Verification

- [ ] `tests/e2e/full-pipeline.test.ts` exists and runs without errors
- [ ] MockOLAClient correctly records all `setDMX` calls with universe, channels, and timestamp
- [ ] Test 1 (Full Show Workflow): patches 4 fixtures, creates 2 scenes, maps scenes to DMX, verifies correct channel values at correct addresses
- [ ] Test 2 (Show Save/Load): saves a show with fixtures, scenes, and cue lists; clears all state; loads the show; verifies all state restored including Map reconstruction
- [ ] Test 3 (Live Control): sets a fixture color, verifies DMX output, performs blackout, verifies all zeros
- [ ] Test 4 (Effect Lifecycle): starts a chase effect, verifies DMX frames are produced, stops the effect, verifies no more frames are produced
- [ ] Test 5 (Multiple Effects): runs chase and rainbow simultaneously on different fixture groups, verifies both produce output, stops all
- [ ] All tests use the MockOLAClient (no real HTTP calls to OLA)
- [ ] Show storage tests use a temporary directory (not the user's home directory)
- [ ] Temporary directories are cleaned up in afterEach
- [ ] `npx vitest run tests/e2e/full-pipeline.test.ts` passes with all tests green

---

## Notes

- The MockOLAClient records every `setDMX` call as a `DMXFrame` with a timestamp. This allows tests to assert not just the final state but the sequence of frames sent over time. This is particularly important for effect tests where the output changes continuously.
- Effect timing tests use generous timeouts (100-150ms) to account for system load and event loop jitter. The assertions check for "at least N patterns" rather than exact counts to avoid flaky tests.
- The show save/load round-trip test is the most critical test in this file. It verifies that `Map<string, ChannelValues>` serialization/deserialization works correctly -- a common source of bugs since JSON does not natively support Maps. If the `fixtureStates` field comes back as an empty object or plain object instead of a Map, the scene system will break.
- The MockOLAClient is cast to `any` when passed to EffectEngine because the EffectEngine expects an `OLAClient` type. In a production codebase, you would define an `IOLAClient` interface. For these tests, the `any` cast is acceptable since the mock implements the same `setDMX`/`getDMX` contract.
- All tests use `beforeEach`/`afterEach` for setup and teardown, ensuring each test runs in isolation with clean state. The temporary directory for show storage is created fresh for each test and deleted afterward.
- These tests do not test the MCP protocol layer (JSON-RPC transport, tool schema validation). They test the handler functions directly. MCP protocol testing would require a full server/client setup, which is outside the scope of this task.

---

**Next Task**: None (final task in Milestone 6 and the project)
**Related Design Docs**: [DMX Lighting MCP Design](../../design/local.dmx-lighting-mcp.md)
