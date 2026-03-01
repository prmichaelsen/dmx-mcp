import { describe, it, expect, beforeEach, vi } from "vitest";
import { SceneManager } from "../../src/scenes/manager.js";
import type { FixtureManager } from "../../src/fixtures/manager.js";

function createMockFixtureManager(knownFixtureIds: string[]): FixtureManager {
  const knownSet = new Set(knownFixtureIds);
  return {
    getFixture: vi.fn((id: string) => {
      if (!knownSet.has(id)) {
        return undefined;
      }
      return {
        id,
        name: `Fixture ${id}`,
        profileId: "generic-rgb-par",
        profile: {
          id: "generic-rgb-par",
          manufacturer: "Generic",
          model: "RGB Par",
          channels: [],
          modes: [],
        },
        universe: 1,
        startAddress: 1,
        mode: "default",
      };
    }),
  } as unknown as FixtureManager;
}

describe("SceneManager", () => {
  let sceneManager: SceneManager;
  let mockFixtureManager: FixtureManager;

  beforeEach(() => {
    mockFixtureManager = createMockFixtureManager([
      "par-1",
      "par-2",
      "par-3",
    ]);
    sceneManager = new SceneManager(mockFixtureManager);
  });

  describe("createScene", () => {
    it("creates a scene with fixture states", () => {
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

    it("sets createdAt and updatedAt timestamps", () => {
      const before = new Date();
      const scene = sceneManager.createScene("test", "Test", {
        "par-1": { red: 255 },
      });
      const after = new Date();

      expect(scene.createdAt.getTime()).toBeGreaterThanOrEqual(
        before.getTime(),
      );
      expect(scene.createdAt.getTime()).toBeLessThanOrEqual(after.getTime());
      expect(scene.updatedAt).toEqual(scene.createdAt);
    });

    it("throws if scene ID already exists", () => {
      sceneManager.createScene("dup", "Duplicate", {
        "par-1": { red: 255 },
      });

      expect(() =>
        sceneManager.createScene("dup", "Duplicate Again", {
          "par-1": { red: 128 },
        }),
      ).toThrow('Scene with ID "dup" already exists');
    });

    it("throws if fixture ID is not found in FixtureManager", () => {
      expect(() =>
        sceneManager.createScene("bad", "Bad Scene", {
          "unknown-fixture": { red: 255 },
        }),
      ).toThrow("Unknown fixture IDs: unknown-fixture");
    });

    it("lists all unknown fixture IDs in the error message", () => {
      expect(() =>
        sceneManager.createScene("bad", "Bad Scene", {
          "unknown-1": { red: 255 },
          "unknown-2": { blue: 128 },
        }),
      ).toThrow("Unknown fixture IDs: unknown-1, unknown-2");
    });

    it("throws if channel value is below 0", () => {
      expect(() =>
        sceneManager.createScene("bad", "Bad Scene", {
          "par-1": { red: -1 },
        }),
      ).toThrow("Invalid channel value");
    });

    it("throws if channel value is above 255", () => {
      expect(() =>
        sceneManager.createScene("bad", "Bad Scene", {
          "par-1": { red: 256 },
        }),
      ).toThrow("Invalid channel value");
    });

    it("throws if channel value is not an integer", () => {
      expect(() =>
        sceneManager.createScene("bad", "Bad Scene", {
          "par-1": { red: 128.5 },
        }),
      ).toThrow("Invalid channel value");
    });

    it("allows a scene with no fixture states (empty scene)", () => {
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

    it("merges new channel values into existing fixture state", () => {
      const updated = sceneManager.updateScene("warm-wash", {
        "par-1": { red: 200 },
      });

      expect(updated.fixtureStates.get("par-1")).toEqual({
        red: 200,
        green: 200,
        blue: 100,
      });
    });

    it("adds new fixture IDs to the scene", () => {
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

    it("adds new channels to an existing fixture", () => {
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

    it("updates the updatedAt timestamp", () => {
      const original = sceneManager.getScene("warm-wash");
      const originalUpdatedAt = original.updatedAt;

      const updated = sceneManager.updateScene("warm-wash", {
        "par-1": { red: 100 },
      });

      expect(updated.updatedAt.getTime()).toBeGreaterThanOrEqual(
        originalUpdatedAt.getTime(),
      );
    });

    it("throws if scene does not exist", () => {
      expect(() =>
        sceneManager.updateScene("nonexistent", {
          "par-1": { red: 128 },
        }),
      ).toThrow('Scene with ID "nonexistent" not found');
    });

    it("throws if new fixture ID is unknown", () => {
      expect(() =>
        sceneManager.updateScene("warm-wash", {
          "unknown-fixture": { red: 128 },
        }),
      ).toThrow("Unknown fixture IDs: unknown-fixture");
    });
  });

  describe("deleteScene", () => {
    beforeEach(() => {
      sceneManager.createScene("to-delete", "To Delete", {
        "par-1": { red: 255 },
      });
    });

    it("deletes an existing scene", () => {
      sceneManager.deleteScene("to-delete");

      expect(() => sceneManager.getScene("to-delete")).toThrow(
        'Scene with ID "to-delete" not found',
      );
    });

    it("throws if scene does not exist", () => {
      expect(() => sceneManager.deleteScene("nonexistent")).toThrow(
        'Scene with ID "nonexistent" not found',
      );
    });

    it("does not affect other scenes", () => {
      sceneManager.createScene("keep-me", "Keep Me", {
        "par-1": { red: 128 },
      });

      sceneManager.deleteScene("to-delete");

      expect(sceneManager.getScene("keep-me").id).toBe("keep-me");
    });
  });

  describe("getScene", () => {
    it("returns the full scene object", () => {
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

    it("throws if scene does not exist", () => {
      expect(() => sceneManager.getScene("nonexistent")).toThrow(
        'Scene with ID "nonexistent" not found',
      );
    });
  });

  describe("listScenes", () => {
    it("returns empty array when no scenes exist", () => {
      expect(sceneManager.listScenes()).toEqual([]);
    });

    it("returns summary info for all scenes", () => {
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

    it("includes createdAt and updatedAt in summaries", () => {
      sceneManager.createScene("test", "Test", {
        "par-1": { red: 255 },
      });

      const scenes = sceneManager.listScenes();
      expect(scenes[0].createdAt).toBeInstanceOf(Date);
      expect(scenes[0].updatedAt).toBeInstanceOf(Date);
    });
  });
});
