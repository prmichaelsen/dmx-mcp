import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { CueSequencer } from "../../src/playback/sequencer.js";
import type { CueList } from "../../src/types/index.js";

// Flush pending microtasks from fire-and-forget cue execution.
// Background executeCueAtIndex chains through getDMX → executeFade → hold;
// a setTimeout(0) macrotask runs after all pending microtasks resolve.
const flush = () => new Promise((r) => setTimeout(r, 0));

function createMockOLAClient() {
  return {
    setDMX: vi.fn().mockResolvedValue(undefined),
    getDMX: vi.fn().mockResolvedValue(new Array(512).fill(0)),
  };
}

function createMockSceneManager() {
  const scenes = new Map<string, any>();
  return {
    getScene: vi.fn((id: string) => {
      const scene = scenes.get(id);
      if (!scene) throw new Error(`Scene "${id}" not found`);
      return scene;
    }),
    _addScene: (scene: any) => scenes.set(scene.id, scene),
  };
}

function createMockFixtureManager() {
  const fixtures = new Map<string, any>();
  return {
    getFixture: vi.fn((id: string) => fixtures.get(id)),
    listFixtures: vi.fn(() => Array.from(fixtures.values())),
    _addFixture: (fixture: any) => fixtures.set(fixture.id, fixture),
  };
}

function createMockFadeEngine() {
  return {
    executeFade: vi.fn().mockResolvedValue(undefined),
  };
}

function createMockCueManager() {
  const cueLists = new Map<string, CueList>();
  return {
    getCueList: vi.fn((id: string) => {
      const list = cueLists.get(id);
      if (!list) throw new Error(`Cue list with ID "${id}" not found`);
      return list;
    }),
    _addCueList: (cueList: CueList) => cueLists.set(cueList.id, cueList),
  };
}

// Use large holdMs so cues never auto-advance (sequencer stays on current cue).
// Tests manually call goCue() to advance.
const LONG_HOLD = 999999;

describe("CueSequencer", () => {
  let sequencer: CueSequencer;
  let mockOLA: ReturnType<typeof createMockOLAClient>;
  let mockSceneManager: ReturnType<typeof createMockSceneManager>;
  let mockFixtureManager: ReturnType<typeof createMockFixtureManager>;
  let mockFadeEngine: ReturnType<typeof createMockFadeEngine>;
  let mockCueManager: ReturnType<typeof createMockCueManager>;

  beforeEach(() => {
    mockOLA = createMockOLAClient();
    mockSceneManager = createMockSceneManager();
    mockFixtureManager = createMockFixtureManager();
    mockFadeEngine = createMockFadeEngine();
    mockCueManager = createMockCueManager();

    sequencer = new CueSequencer({
      olaClient: mockOLA as any,
      sceneManager: mockSceneManager as any,
      fixtureManager: mockFixtureManager as any,
      fadeEngine: mockFadeEngine as any,
      cueManager: mockCueManager as any,
    });

    mockFixtureManager._addFixture({
      id: "par-1",
      name: "Par 1",
      universe: 1,
      startAddress: 1,
      mode: "default",
      profileId: "generic-rgb-par",
      profile: {
        id: "generic-rgb-par",
        manufacturer: "Generic",
        model: "RGB Par",
        channels: [
          { name: "red", type: "red", defaultValue: 0, min: 0, max: 255 },
          {
            name: "green",
            type: "green",
            defaultValue: 0,
            min: 0,
            max: 255,
          },
          { name: "blue", type: "blue", defaultValue: 0, min: 0, max: 255 },
        ],
        modes: [
          {
            name: "default",
            channelCount: 3,
            channels: ["red", "green", "blue"],
          },
        ],
      },
    });

    mockSceneManager._addScene({
      id: "scene-red",
      name: "Red Wash",
      fixtureStates: new Map([["par-1", { red: 255, green: 0, blue: 0 }]]),
    });

    mockSceneManager._addScene({
      id: "scene-blue",
      name: "Blue Wash",
      fixtureStates: new Map([["par-1", { red: 0, green: 0, blue: 255 }]]),
    });

    mockCueManager._addCueList({
      id: "cue-list-1",
      name: "Test Cue List",
      loop: false,
      cues: [
        {
          id: "cue-1",
          name: "Cue 1",
          sceneId: "scene-red",
          fadeInMs: 0,
          holdMs: LONG_HOLD,
          fadeOutMs: 0,
        },
        {
          id: "cue-2",
          name: "Cue 2",
          sceneId: "scene-blue",
          fadeInMs: 0,
          holdMs: LONG_HOLD,
          fadeOutMs: 0,
        },
      ],
    });
  });

  afterEach(() => {
    sequencer.stop(); // Cancel any pending hold timers
  });

  describe("start()", () => {
    it("starts playback of a cue list", async () => {
      await sequencer.start("cue-list-1");

      const state = sequencer.getState();
      expect(state.activeCueListId).toBe("cue-list-1");
      expect(state.currentCueId).toBe("cue-1");
    });

    it("throws for nonexistent cue list", async () => {
      await expect(sequencer.start("nonexistent")).rejects.toThrow(/not found/);
    });

    it("throws for empty cue list", async () => {
      mockCueManager._addCueList({
        id: "empty-list",
        name: "Empty",
        loop: false,
        cues: [],
      });

      await expect(sequencer.start("empty-list")).rejects.toThrow(
        /has no cues/,
      );
    });

    it("calls fadeEngine.executeFade for the first cue", async () => {
      await sequencer.start("cue-list-1");
      await flush();

      expect(mockFadeEngine.executeFade).toHaveBeenCalled();
      expect(mockSceneManager.getScene).toHaveBeenCalledWith("scene-red");
    });
  });

  describe("goCue()", () => {
    it("advances to the next cue", async () => {
      await sequencer.start("cue-list-1");
      await flush();
      mockFadeEngine.executeFade.mockClear();

      await sequencer.goCue();
      await flush();

      const state = sequencer.getState();
      expect(state.currentCueIndex).toBe(1);
      expect(state.currentCueId).toBe("cue-2");
      expect(mockSceneManager.getScene).toHaveBeenCalledWith("scene-blue");
    });

    it("throws when no cue list is active", async () => {
      await expect(sequencer.goCue()).rejects.toThrow(/No active cue list/);
    });

    it("stops at end of non-looping list", async () => {
      await sequencer.start("cue-list-1");
      await flush();
      await sequencer.goCue(); // advance to cue 2
      await flush();
      await sequencer.goCue(); // try to advance past end

      const state = sequencer.getState();
      expect(state.isPlaying).toBe(false);
    });

    it("wraps to cue 0 in a looping list", async () => {
      mockCueManager._addCueList({
        id: "loop-list",
        name: "Loop",
        loop: true,
        cues: [
          {
            id: "cue-a",
            name: "A",
            sceneId: "scene-red",
            fadeInMs: 0,
            holdMs: LONG_HOLD,
            fadeOutMs: 0,
          },
          {
            id: "cue-b",
            name: "B",
            sceneId: "scene-blue",
            fadeInMs: 0,
            holdMs: LONG_HOLD,
            fadeOutMs: 0,
          },
        ],
      });

      await sequencer.start("loop-list");
      await flush();
      await sequencer.goCue(); // advance to cue-b
      await flush();
      await sequencer.goCue(); // should wrap to cue-a

      const state = sequencer.getState();
      expect(state.currentCueIndex).toBe(0);
      expect(state.isPlaying).toBe(true);
    });
  });

  describe("goToCue()", () => {
    it("jumps to a specific cue by ID", async () => {
      await sequencer.start("cue-list-1");
      await flush();
      mockFadeEngine.executeFade.mockClear();

      await sequencer.goToCue("cue-2");
      await flush();

      const state = sequencer.getState();
      expect(state.currentCueIndex).toBe(1);
      expect(state.currentCueId).toBe("cue-2");
    });

    it("throws for nonexistent cue ID", async () => {
      await sequencer.start("cue-list-1");
      await flush();

      await expect(sequencer.goToCue("nonexistent")).rejects.toThrow(
        /not found/,
      );
    });

    it("throws when no cue list is active", async () => {
      await expect(sequencer.goToCue("cue-1")).rejects.toThrow(
        /No active cue list/,
      );
    });
  });

  describe("stop()", () => {
    it("stops playback", async () => {
      await sequencer.start("cue-list-1");
      await flush();
      sequencer.stop();

      const state = sequencer.getState();
      expect(state.isPlaying).toBe(false);
    });

    it("preserves active cue list reference after stop", async () => {
      await sequencer.start("cue-list-1");
      await flush();
      sequencer.stop();

      const state = sequencer.getState();
      expect(state.activeCueListId).toBe("cue-list-1");
    });
  });

  describe("getState()", () => {
    it("returns idle state when no cue list is active", () => {
      const state = sequencer.getState();

      expect(state.activeCueListId).toBeNull();
      expect(state.currentCueIndex).toBe(0);
      expect(state.isPlaying).toBe(false);
      expect(state.currentCueId).toBeNull();
    });

    it("returns active state during playback", async () => {
      await sequencer.start("cue-list-1");

      const state = sequencer.getState();

      expect(state.activeCueListId).toBe("cue-list-1");
      expect(state.currentCueId).toBe("cue-1");
    });
  });
});
