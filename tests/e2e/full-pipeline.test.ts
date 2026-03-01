import { describe, it, expect, beforeEach, afterEach } from "vitest";
import {
  ProfileRegistry,
  initializeBuiltInProfiles,
} from "../../src/fixtures/profiles.js";
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
import { EffectEngine } from "../../src/effects/engine.js";
import { registerBuiltInEffects } from "../../src/effects/register.js";
import { sceneToDMX } from "../../src/scenes/dmx-mapper.js";
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
  public frames: DMXFrame[] = [];
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

  getLastFrame(universe: number): DMXFrame | undefined {
    for (let i = this.frames.length - 1; i >= 0; i--) {
      if (this.frames[i].universe === universe) {
        return this.frames[i];
      }
    }
    return undefined;
  }

  getFramesForUniverse(universe: number): DMXFrame[] {
    return this.frames.filter((f) => f.universe === universe);
  }

  clear(): void {
    this.frames = [];
    this.state.clear();
  }
}

// ---------------------------------------------------------------------------
// Test Suite
// ---------------------------------------------------------------------------

describe("End-to-End: Full Pipeline", () => {
  let mockOLA: MockOLAClient;
  let profileRegistry: ProfileRegistry;
  let fixtureManager: FixtureManager;
  let sceneManager: SceneManager;
  let tempDir: string;

  beforeEach(async () => {
    mockOLA = new MockOLAClient();
    profileRegistry = new ProfileRegistry();
    initializeBuiltInProfiles(profileRegistry);
    fixtureManager = new FixtureManager(profileRegistry);
    sceneManager = new SceneManager(fixtureManager);
    tempDir = await mkdtemp(join(tmpdir(), "dmx-mcp-test-"));
  });

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true });
  });

  it("should execute a full show workflow: patch, scene, DMX mapping, verify", async () => {
    // Step 1: Patch 4 RGB fixtures on universe 1
    const fixtureIds = ["par-1", "par-2", "par-3", "par-4"];
    for (let i = 0; i < 4; i++) {
      fixtureManager.patchFixture({
        id: fixtureIds[i],
        name: `Par ${i + 1}`,
        profileId: "generic-rgb-par",
        universe: 1,
        startAddress: 1 + i * 3, // 1, 4, 7, 10
      });
    }

    expect(fixtureManager.listFixtures()).toHaveLength(4);

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

    expect(sceneManager.listScenes()).toHaveLength(2);

    // Step 4: Map the warm scene to DMX and verify channel values
    const warmDMX = sceneToDMX(warmScene, fixtureManager);
    const warmChannels = warmDMX.get(1);
    expect(warmChannels).toBeDefined();

    // par-1 at address 1: red=255, green=180, blue=20
    expect(warmChannels![0]).toBe(255);
    expect(warmChannels![1]).toBe(180);
    expect(warmChannels![2]).toBe(20);

    // par-2 at address 4: red=255, green=180, blue=20
    expect(warmChannels![3]).toBe(255);
    expect(warmChannels![4]).toBe(180);
    expect(warmChannels![5]).toBe(20);

    // par-4 at address 10: red=255, green=180, blue=20
    expect(warmChannels![9]).toBe(255);
    expect(warmChannels![10]).toBe(180);
    expect(warmChannels![11]).toBe(20);

    // Step 5: Map the cool scene and verify
    const coolDMX = sceneToDMX(coolScene, fixtureManager);
    const coolChannels = coolDMX.get(1);
    expect(coolChannels).toBeDefined();

    // par-1 at address 1: red=20, green=50, blue=255
    expect(coolChannels![0]).toBe(20);
    expect(coolChannels![1]).toBe(50);
    expect(coolChannels![2]).toBe(255);

    // Step 6: Push the warm scene to mock OLA and verify
    await mockOLA.setDMX(1, warmChannels!);
    const lastFrame = mockOLA.getLastFrame(1);
    expect(lastFrame).toBeDefined();
    expect(lastFrame!.channels[0]).toBe(255);
    expect(lastFrame!.channels[1]).toBe(180);
    expect(lastFrame!.channels[2]).toBe(20);
  });

  it("should save and load a show with all state preserved", async () => {
    const showStorage = new ShowStorage(tempDir);
    const cueManager = new CueManager(sceneManager);

    const showDeps: ShowToolDependencies = {
      fixtureManager,
      sceneManager,
      cueManager,
      showStorage,
    };

    // Step 1: Set up show state — patch 2 fixtures
    fixtureManager.patchFixture({
      id: "par-1",
      name: "Par 1",
      profileId: "generic-rgb-par",
      universe: 1,
      startAddress: 1,
    });
    fixtureManager.patchFixture({
      id: "par-2",
      name: "Par 2",
      profileId: "generic-rgb-par",
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
      sceneId: "opening",
      fadeInMs: 2000,
      holdMs: 5000,
      fadeOutMs: 1000,
    });

    // Step 2: Save the show
    const saveResult = await handleSaveShow(
      { id: "test-show", name: "Test Show" },
      showDeps,
    );
    expect(saveResult.success).toBe(true);
    expect(saveResult.showId).toBe("test-show");

    // Step 3: Verify the show appears in list
    const listResult = await handleListShows(showDeps);
    expect(listResult.success).toBe(true);
    expect(listResult.shows).toHaveLength(1);
    expect(listResult.shows[0].id).toBe("test-show");
    expect(listResult.shows[0].name).toBe("Test Show");

    // Step 4: Clear all state
    fixtureManager.clear();
    sceneManager.clear();
    cueManager.clear();

    expect(fixtureManager.listFixtures()).toHaveLength(0);
    expect(sceneManager.listScenes()).toHaveLength(0);
    expect(cueManager.listCueLists()).toHaveLength(0);

    // Step 5: Load the show
    const loadResult = await handleLoadShow({ id: "test-show" }, showDeps);
    expect(loadResult.success).toBe(true);
    expect(loadResult.showName).toBe("Test Show");

    // Step 6: Verify all state was restored
    // Fixtures
    expect(fixtureManager.listFixtures()).toHaveLength(2);
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
    expect(restoredCueList.cues[0].sceneId).toBe("opening");
    expect(restoredCueList.cues[0].fadeInMs).toBe(2000);
  });

  it("should support live control: set color, verify DMX, blackout", async () => {
    // Patch a fixture
    fixtureManager.patchFixture({
      id: "par-1",
      name: "Par 1",
      profileId: "generic-rgb-par",
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
    expect(frame.channels[1]).toBe(0); // green
    expect(frame.channels[2]).toBe(0); // blue

    // Blackout: set all channels to zero
    const blackoutChannels = new Array(512).fill(0);
    await mockOLA.setDMX(1, blackoutChannels);

    // Verify all zeros
    const blackoutFrame = mockOLA.getLastFrame(1)!;
    expect(blackoutFrame.channels[0]).toBe(0);
    expect(blackoutFrame.channels[1]).toBe(0);
    expect(blackoutFrame.channels[2]).toBe(0);

    const hasNonZero = blackoutFrame.channels.some((v) => v !== 0);
    expect(hasNonZero).toBe(false);
  });

  it("should start, run, and stop effects with DMX output", async () => {
    // Patch 3 RGB fixtures
    for (let i = 0; i < 3; i++) {
      fixtureManager.patchFixture({
        id: `par-${i + 1}`,
        name: `Par ${i + 1}`,
        profileId: "generic-rgb-par",
        universe: 1,
        startAddress: 1 + i * 3,
      });
    }

    // Create effect engine with mock OLA
    const effectEngine = new EffectEngine(
      mockOLA as any,
      fixtureManager,
    );
    registerBuiltInEffects(effectEngine);

    // Start a chase effect
    const effectId = effectEngine.startEffect(
      "chase",
      ["par-1", "par-2", "par-3"],
      { speed: 2.0 },
    );

    expect(effectId).toBeDefined();
    expect(effectEngine.getActiveEffectCount()).toBe(1);

    // Wait for some frames to be generated
    await new Promise((resolve) => setTimeout(resolve, 150));

    // Verify DMX frames were sent
    const frames = mockOLA.getFramesForUniverse(1);
    expect(frames.length).toBeGreaterThan(0);

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

  it("should run multiple effects simultaneously on different fixtures", async () => {
    // Patch 6 fixtures: 3 for chase, 3 for rainbow
    for (let i = 0; i < 6; i++) {
      fixtureManager.patchFixture({
        id: `par-${i + 1}`,
        name: `Par ${i + 1}`,
        profileId: "generic-rgb-par",
        universe: 1,
        startAddress: 1 + i * 3,
      });
    }

    const effectEngine = new EffectEngine(
      mockOLA as any,
      fixtureManager,
    );
    registerBuiltInEffects(effectEngine);

    // Start chase on first 3 fixtures
    const chaseId = effectEngine.startEffect(
      "chase",
      ["par-1", "par-2", "par-3"],
      { speed: 1.0 },
    );

    // Start rainbow on last 3 fixtures
    const rainbowId = effectEngine.startEffect(
      "rainbow",
      ["par-4", "par-5", "par-6"],
      { speed: 1.0 },
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
});
