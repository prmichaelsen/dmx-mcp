import { describe, it, expect, beforeEach } from "vitest";
import { CueManager } from "../../src/cues/manager.js";
import type { SceneManager } from "../../src/scenes/manager.js";
import type { Cue } from "../../src/types/index.js";

function createMockSceneManager(validSceneIds: string[]): SceneManager {
  const validIds = new Set(validSceneIds);
  return {
    getScene(id: string) {
      if (!validIds.has(id)) {
        throw new Error(`Scene with ID "${id}" not found`);
      }
      return { id, name: `Scene ${id}`, fixtureStates: {} };
    },
  } as unknown as SceneManager;
}

function createTestCue(overrides: Partial<Cue> = {}): Cue {
  return {
    id: "cue-1",
    name: "Test Cue",
    sceneId: "scene-1",
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
    mockSceneManager = createMockSceneManager([
      "scene-1",
      "scene-2",
      "scene-3",
    ]);
    cueManager = new CueManager(mockSceneManager);
  });

  // --- CueList CRUD ---

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
        /already exists/,
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
        /not found/,
      );
    });
  });

  // --- Cue Management ---

  describe("addCue", () => {
    beforeEach(() => {
      cueManager.createCueList("list-1", "Show");
    });

    it("appends a cue to the end of the list", () => {
      const cue = createTestCue({ id: "cue-1", sceneId: "scene-1" });
      const updated = cueManager.addCue("list-1", cue);
      expect(updated.cues).toHaveLength(1);
      expect(updated.cues[0].id).toBe("cue-1");
    });

    it("appends multiple cues in order", () => {
      cueManager.addCue(
        "list-1",
        createTestCue({ id: "cue-1", sceneId: "scene-1" }),
      );
      cueManager.addCue(
        "list-1",
        createTestCue({ id: "cue-2", sceneId: "scene-2" }),
      );
      cueManager.addCue(
        "list-1",
        createTestCue({ id: "cue-3", sceneId: "scene-3" }),
      );

      const cueList = cueManager.getCueList("list-1");
      expect(cueList.cues.map((c) => c.id)).toEqual([
        "cue-1",
        "cue-2",
        "cue-3",
      ]);
    });

    it("throws if the referenced scene does not exist", () => {
      const cue = createTestCue({ sceneId: "nonexistent-scene" });
      expect(() => cueManager.addCue("list-1", cue)).toThrow(
        /Scene with ID "nonexistent-scene" not found/,
      );
    });

    it("throws if a cue with the same ID already exists in the list", () => {
      cueManager.addCue(
        "list-1",
        createTestCue({ id: "cue-1", sceneId: "scene-1" }),
      );
      expect(() =>
        cueManager.addCue(
          "list-1",
          createTestCue({ id: "cue-1", sceneId: "scene-2" }),
        ),
      ).toThrow(/already exists/);
    });

    it("throws if cue list does not exist", () => {
      expect(() =>
        cueManager.addCue("nonexistent", createTestCue()),
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

    it("throws if fadeInMs is NaN", () => {
      const cue = createTestCue({ fadeInMs: NaN });
      expect(() => cueManager.addCue("list-1", cue)).toThrow(/fadeInMs/);
    });

    it("throws if fadeInMs is Infinity", () => {
      const cue = createTestCue({ fadeInMs: Infinity });
      expect(() => cueManager.addCue("list-1", cue)).toThrow(/fadeInMs/);
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
      cueManager.addCue(
        "list-1",
        createTestCue({ id: "cue-1", sceneId: "scene-1" }),
      );
      cueManager.addCue(
        "list-1",
        createTestCue({ id: "cue-2", sceneId: "scene-2" }),
      );
      cueManager.addCue(
        "list-1",
        createTestCue({ id: "cue-3", sceneId: "scene-3" }),
      );
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
        /not found/,
      );
    });

    it("throws if cue list does not exist", () => {
      expect(() => cueManager.removeCue("nonexistent", "cue-1")).toThrow(
        /not found/,
      );
    });
  });

  describe("reorderCues", () => {
    beforeEach(() => {
      cueManager.createCueList("list-1", "Show");
      cueManager.addCue(
        "list-1",
        createTestCue({ id: "cue-1", name: "First", sceneId: "scene-1" }),
      );
      cueManager.addCue(
        "list-1",
        createTestCue({ id: "cue-2", name: "Second", sceneId: "scene-2" }),
      );
      cueManager.addCue(
        "list-1",
        createTestCue({ id: "cue-3", name: "Third", sceneId: "scene-3" }),
      );
    });

    it("reorders cues to match the provided order", () => {
      const updated = cueManager.reorderCues("list-1", [
        "cue-3",
        "cue-1",
        "cue-2",
      ]);
      expect(updated.cues.map((c) => c.id)).toEqual([
        "cue-3",
        "cue-1",
        "cue-2",
      ]);
    });

    it("reverses the order", () => {
      const updated = cueManager.reorderCues("list-1", [
        "cue-3",
        "cue-2",
        "cue-1",
      ]);
      expect(updated.cues.map((c) => c.id)).toEqual([
        "cue-3",
        "cue-2",
        "cue-1",
      ]);
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
        cueManager.reorderCues("list-1", ["cue-1", "cue-1", "cue-3"]),
      ).toThrow(/Duplicate/);
    });

    it("throws if a cue ID is missing from the input", () => {
      expect(() =>
        cueManager.reorderCues("list-1", ["cue-1", "cue-2"]),
      ).toThrow(/missing/);
    });

    it("throws if an unknown cue ID is provided", () => {
      expect(() =>
        cueManager.reorderCues("list-1", [
          "cue-1",
          "cue-2",
          "cue-3",
          "unknown",
        ]),
      ).toThrow(/not in cue list/);
    });

    it("throws if cue list does not exist", () => {
      expect(() =>
        cueManager.reorderCues("nonexistent", ["cue-1"]),
      ).toThrow(/not found/);
    });
  });
});
