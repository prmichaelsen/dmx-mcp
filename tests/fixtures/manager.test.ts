import { describe, it, expect, beforeEach } from "vitest";
import { FixtureManager } from "../../src/fixtures/manager.js";
import {
  ProfileRegistry,
  initializeBuiltInProfiles,
  GENERIC_DIMMER,
  GENERIC_RGB_PAR,
  GENERIC_RGBW_PAR,
} from "../../src/fixtures/profiles.js";

describe("FixtureManager", () => {
  let registry: ProfileRegistry;
  let manager: FixtureManager;

  beforeEach(() => {
    registry = new ProfileRegistry();
    initializeBuiltInProfiles(registry);
    manager = new FixtureManager(registry);
  });

  // ── patchFixture ───────────────────────────────────────────

  describe("patchFixture", () => {
    it("patches a fixture successfully", () => {
      const fixture = manager.patchFixture({
        id: "par-1",
        name: "Front Wash Left",
        profileId: "generic-rgb-par",
        universe: 1,
        startAddress: 1,
      });

      expect(fixture.id).toBe("par-1");
      expect(fixture.name).toBe("Front Wash Left");
      expect(fixture.universe).toBe(1);
      expect(fixture.startAddress).toBe(1);
      expect(fixture.profile).toBe(GENERIC_RGB_PAR);
      expect(fixture.mode).toBe("default");
    });

    it("stores the patched fixture for later retrieval", () => {
      manager.patchFixture({
        id: "par-1",
        name: "Front Wash Left",
        profileId: "generic-rgb-par",
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
        profileId: "generic-rgb-par",
        universe: 1,
        startAddress: 1,
      });

      expect(() =>
        manager.patchFixture({
          id: "par-1",
          name: "Front Wash Right",
          profileId: "generic-rgb-par",
          universe: 1,
          startAddress: 10,
        }),
      ).toThrow("already exists");
    });

    it("rejects unknown profile ID", () => {
      expect(() =>
        manager.patchFixture({
          id: "par-1",
          name: "Test",
          profileId: "nonexistent-profile",
          universe: 1,
          startAddress: 1,
        }),
      ).toThrow("not found");
    });

    it("rejects start address that causes universe overflow", () => {
      expect(() =>
        manager.patchFixture({
          id: "par-1",
          name: "Test",
          profileId: "generic-rgb-par",
          universe: 1,
          startAddress: 511, // 3-ch fixture at 511 needs 511,512,513
        }),
      ).toThrow();
    });

    it("accepts fixture that fits exactly at end of universe", () => {
      const fixture = manager.patchFixture({
        id: "par-1",
        name: "Test",
        profileId: "generic-rgb-par",
        universe: 1,
        startAddress: 510, // 3-ch: 510,511,512
      });

      expect(fixture.startAddress).toBe(510);
    });
  });

  // ── Address Collision Detection ────────────────────────────

  describe("address collision detection", () => {
    beforeEach(() => {
      // RGB par at universe 1, address 10 (uses 10, 11, 12)
      manager.patchFixture({
        id: "par-1",
        name: "Existing Par",
        profileId: "generic-rgb-par",
        universe: 1,
        startAddress: 10,
      });
    });

    it("rejects exact same address range", () => {
      expect(() =>
        manager.patchFixture({
          id: "par-2",
          name: "Conflicting",
          profileId: "generic-rgb-par",
          universe: 1,
          startAddress: 10,
        }),
      ).toThrow("collision");
    });

    it("rejects overlapping range (new starts inside existing)", () => {
      expect(() =>
        manager.patchFixture({
          id: "par-2",
          name: "Conflicting",
          profileId: "generic-rgb-par",
          universe: 1,
          startAddress: 11,
        }),
      ).toThrow("collision");
    });

    it("rejects overlapping range (new contains existing)", () => {
      expect(() =>
        manager.patchFixture({
          id: "par-2",
          name: "Conflicting",
          profileId: "generic-rgbw-par", // 4 channels
          universe: 1,
          startAddress: 9, // 9-12 overlaps with 10-12
        }),
      ).toThrow("collision");
    });

    it("rejects overlapping range (new ends inside existing)", () => {
      expect(() =>
        manager.patchFixture({
          id: "par-2",
          name: "Conflicting",
          profileId: "generic-rgb-par",
          universe: 1,
          startAddress: 8, // 8-10 overlaps at address 10
        }),
      ).toThrow("collision");
    });

    it("accepts non-overlapping range immediately after existing", () => {
      const fixture = manager.patchFixture({
        id: "par-2",
        name: "Adjacent",
        profileId: "generic-rgb-par",
        universe: 1,
        startAddress: 13, // existing ends at 12
      });

      expect(fixture.id).toBe("par-2");
    });

    it("accepts non-overlapping range immediately before existing", () => {
      const fixture = manager.patchFixture({
        id: "par-2",
        name: "Adjacent",
        profileId: "generic-rgb-par",
        universe: 1,
        startAddress: 7, // 7-9, existing starts at 10
      });

      expect(fixture.id).toBe("par-2");
    });

    it("allows same address range on different universe", () => {
      const fixture = manager.patchFixture({
        id: "par-2",
        name: "Other Universe",
        profileId: "generic-rgb-par",
        universe: 2,
        startAddress: 10,
      });

      expect(fixture.universe).toBe(2);
    });

    it("detects collision among multiple fixtures", () => {
      manager.patchFixture({
        id: "par-2",
        name: "Second Par",
        profileId: "generic-rgb-par",
        universe: 1,
        startAddress: 20,
      });

      expect(() =>
        manager.patchFixture({
          id: "par-3",
          name: "Conflicting",
          profileId: "generic-rgb-par",
          universe: 1,
          startAddress: 21,
        }),
      ).toThrow("par-2");
    });
  });

  // ── unpatchFixture ─────────────────────────────────────────

  describe("unpatchFixture", () => {
    it("removes a patched fixture", () => {
      manager.patchFixture({
        id: "par-1",
        name: "Test",
        profileId: "generic-rgb-par",
        universe: 1,
        startAddress: 1,
      });

      expect(manager.unpatchFixture("par-1")).toBe(true);
      expect(manager.getFixture("par-1")).toBeUndefined();
    });

    it("makes the address range available after unpatching", () => {
      manager.patchFixture({
        id: "par-1",
        name: "Test",
        profileId: "generic-rgb-par",
        universe: 1,
        startAddress: 1,
      });
      manager.unpatchFixture("par-1");

      const fixture = manager.patchFixture({
        id: "par-2",
        name: "Replacement",
        profileId: "generic-rgb-par",
        universe: 1,
        startAddress: 1,
      });

      expect(fixture.id).toBe("par-2");
    });

    it("returns false for nonexistent fixture", () => {
      expect(manager.unpatchFixture("nonexistent")).toBe(false);
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
        profileId: "generic-rgb-par",
        universe: 1,
        startAddress: 1,
      });
      manager.patchFixture({
        id: "par-2",
        name: "Par 2",
        profileId: "generic-rgb-par",
        universe: 1,
        startAddress: 10,
      });

      expect(manager.listFixtures()).toHaveLength(2);
    });
  });

  // ── getFixture ─────────────────────────────────────────────

  describe("getFixture", () => {
    it("returns fixture by ID", () => {
      manager.patchFixture({
        id: "par-1",
        name: "Test",
        profileId: "generic-rgb-par",
        universe: 1,
        startAddress: 1,
      });

      const fixture = manager.getFixture("par-1");
      expect(fixture).toBeDefined();
      expect(fixture!.name).toBe("Test");
    });

    it("returns undefined for nonexistent ID", () => {
      expect(manager.getFixture("nonexistent")).toBeUndefined();
    });
  });

  // ── clear ──────────────────────────────────────────────────

  describe("clear", () => {
    it("removes all fixtures", () => {
      manager.patchFixture({
        id: "par-1",
        name: "Par 1",
        profileId: "generic-rgb-par",
        universe: 1,
        startAddress: 1,
      });
      manager.patchFixture({
        id: "par-2",
        name: "Par 2",
        profileId: "generic-rgb-par",
        universe: 1,
        startAddress: 10,
      });

      manager.clear();
      expect(manager.listFixtures()).toHaveLength(0);
    });
  });
});
