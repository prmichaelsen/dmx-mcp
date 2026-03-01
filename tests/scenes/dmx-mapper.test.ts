import { describe, it, expect, vi } from "vitest";
import { sceneToDMX } from "../../src/scenes/dmx-mapper.js";
import type { Scene } from "../../src/scenes/manager.js";
import type { FixtureManager } from "../../src/fixtures/manager.js";
import type { Fixture, ChannelDefinition } from "../../src/types/index.js";

function channel(
  name: string,
  type: string,
  defaultValue: number = 0,
): ChannelDefinition {
  return {
    name,
    type: type as ChannelDefinition["type"],
    defaultValue,
    min: 0,
    max: 255,
  };
}

function createFixture(
  id: string,
  universe: number,
  startAddress: number,
  channels: ChannelDefinition[],
): Fixture {
  return {
    id,
    name: `Fixture ${id}`,
    profileId: "test-profile",
    profile: {
      id: "test-profile",
      manufacturer: "Generic",
      model: "Test",
      channels,
      modes: [
        {
          name: "default",
          channelCount: channels.length,
          channels: channels.map((c) => c.name),
        },
      ],
    },
    universe,
    startAddress,
    mode: "default",
  };
}

function createMockFixtureManager(
  fixtures: Map<string, Fixture>,
): FixtureManager {
  return {
    getFixture: vi.fn((id: string) => {
      return fixtures.get(id);
    }),
  } as unknown as FixtureManager;
}

function createScene(
  id: string,
  name: string,
  fixtureStates: Record<string, Record<string, number>>,
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
    it("maps RGB values to correct DMX channels", () => {
      const fixtures = new Map<string, Fixture>();
      fixtures.set(
        "par-1",
        createFixture("par-1", 1, 10, [
          channel("red", "red"),
          channel("green", "green"),
          channel("blue", "blue"),
        ]),
      );

      const fixtureManager = createMockFixtureManager(fixtures);
      const scene = createScene("test", "Test", {
        "par-1": { red: 255, green: 128, blue: 0 },
      });

      const result = sceneToDMX(scene, fixtureManager);

      expect(result.size).toBe(1);
      const universe1 = result.get(1)!;
      expect(universe1).toHaveLength(512);

      // Address 10 -> index 9 (red)
      // Address 11 -> index 10 (green)
      // Address 12 -> index 11 (blue)
      expect(universe1[9]).toBe(255);
      expect(universe1[10]).toBe(128);
      expect(universe1[11]).toBe(0);
    });

    it("sets other channels to 0 by default", () => {
      const fixtures = new Map<string, Fixture>();
      fixtures.set(
        "par-1",
        createFixture("par-1", 1, 1, [
          channel("red", "red"),
          channel("green", "green"),
          channel("blue", "blue"),
        ]),
      );

      const fixtureManager = createMockFixtureManager(fixtures);
      const scene = createScene("test", "Test", {
        "par-1": { red: 255, green: 128, blue: 64 },
      });

      const result = sceneToDMX(scene, fixtureManager);
      const universe1 = result.get(1)!;

      expect(universe1[3]).toBe(0);
      expect(universe1[100]).toBe(0);
      expect(universe1[511]).toBe(0);
    });
  });

  describe("multi-fixture scene (same universe)", () => {
    it("maps all fixtures into the same universe array", () => {
      const fixtures = new Map<string, Fixture>();
      fixtures.set(
        "par-1",
        createFixture("par-1", 1, 1, [
          channel("red", "red"),
          channel("green", "green"),
          channel("blue", "blue"),
        ]),
      );
      fixtures.set(
        "par-2",
        createFixture("par-2", 1, 10, [
          channel("red", "red"),
          channel("green", "green"),
          channel("blue", "blue"),
        ]),
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
      expect(universe1[0]).toBe(255);
      expect(universe1[1]).toBe(0);
      expect(universe1[2]).toBe(0);

      // par-2 at address 10: indices 9, 10, 11
      expect(universe1[9]).toBe(0);
      expect(universe1[10]).toBe(0);
      expect(universe1[11]).toBe(255);
    });
  });

  describe("multi-universe scene", () => {
    it("produces separate arrays for each universe", () => {
      const fixtures = new Map<string, Fixture>();
      fixtures.set(
        "par-1",
        createFixture("par-1", 1, 1, [
          channel("red", "red"),
          channel("green", "green"),
          channel("blue", "blue"),
        ]),
      );
      fixtures.set(
        "par-2",
        createFixture("par-2", 2, 1, [
          channel("red", "red"),
          channel("green", "green"),
          channel("blue", "blue"),
        ]),
      );

      const fixtureManager = createMockFixtureManager(fixtures);
      const scene = createScene("test", "Test", {
        "par-1": { red: 255, green: 128, blue: 64 },
        "par-2": { red: 10, green: 20, blue: 30 },
      });

      const result = sceneToDMX(scene, fixtureManager);

      expect(result.size).toBe(2);

      const universe1 = result.get(1)!;
      expect(universe1[0]).toBe(255);
      expect(universe1[1]).toBe(128);
      expect(universe1[2]).toBe(64);

      const universe2 = result.get(2)!;
      expect(universe2[0]).toBe(10);
      expect(universe2[1]).toBe(20);
      expect(universe2[2]).toBe(30);
    });

    it("does not have cross-universe contamination", () => {
      const fixtures = new Map<string, Fixture>();
      fixtures.set(
        "par-1",
        createFixture("par-1", 1, 5, [channel("red", "red")]),
      );
      fixtures.set(
        "par-2",
        createFixture("par-2", 2, 5, [channel("red", "red")]),
      );

      const fixtureManager = createMockFixtureManager(fixtures);
      const scene = createScene("test", "Test", {
        "par-1": { red: 200 },
        "par-2": { red: 100 },
      });

      const result = sceneToDMX(scene, fixtureManager);

      const universe1 = result.get(1)!;
      const universe2 = result.get(2)!;

      expect(universe1[4]).toBe(200);
      expect(universe2[4]).toBe(100);
    });
  });

  describe("missing channel values (defaults)", () => {
    it("uses profile defaultValue for channels not set in the scene", () => {
      const fixtures = new Map<string, Fixture>();
      fixtures.set(
        "par-1",
        createFixture("par-1", 1, 1, [
          channel("dimmer", "dimmer", 255),
          channel("red", "red", 0),
          channel("green", "green", 0),
          channel("blue", "blue", 0),
        ]),
      );

      const fixtureManager = createMockFixtureManager(fixtures);

      // Scene only sets red -- dimmer, green, blue should use defaults
      const scene = createScene("test", "Test", {
        "par-1": { red: 255 },
      });

      const result = sceneToDMX(scene, fixtureManager);
      const universe1 = result.get(1)!;

      expect(universe1[0]).toBe(255); // dimmer: default 255
      expect(universe1[1]).toBe(255); // red: scene value 255
      expect(universe1[2]).toBe(0); // green: default 0
      expect(universe1[3]).toBe(0); // blue: default 0
    });

    it("uses default 0 for channels with no explicit default", () => {
      const fixtures = new Map<string, Fixture>();
      fixtures.set(
        "par-1",
        createFixture("par-1", 1, 1, [
          channel("red", "red"),
          channel("green", "green"),
          channel("blue", "blue"),
        ]),
      );

      const fixtureManager = createMockFixtureManager(fixtures);
      const scene = createScene("test", "Test", {
        "par-1": {},
      });

      const result = sceneToDMX(scene, fixtureManager);
      const universe1 = result.get(1)!;

      expect(universe1[0]).toBe(0);
      expect(universe1[1]).toBe(0);
      expect(universe1[2]).toBe(0);
    });
  });

  describe("complex fixture profiles", () => {
    it("handles multi-channel fixtures (RGBW + dimmer)", () => {
      const fixtures = new Map<string, Fixture>();
      fixtures.set(
        "wash-1",
        createFixture("wash-1", 1, 20, [
          channel("dimmer", "dimmer", 0),
          channel("red", "red", 0),
          channel("green", "green", 0),
          channel("blue", "blue", 0),
          channel("white", "white", 0),
        ]),
      );

      const fixtureManager = createMockFixtureManager(fixtures);
      const scene = createScene("test", "Test", {
        "wash-1": {
          dimmer: 255,
          red: 200,
          green: 100,
          blue: 50,
          white: 180,
        },
      });

      const result = sceneToDMX(scene, fixtureManager);
      const universe1 = result.get(1)!;

      // Address 20 -> index 19 (dimmer)
      expect(universe1[19]).toBe(255);
      expect(universe1[20]).toBe(200);
      expect(universe1[21]).toBe(100);
      expect(universe1[22]).toBe(50);
      expect(universe1[23]).toBe(180);
    });

    it("handles fixture at address 1 (edge case)", () => {
      const fixtures = new Map<string, Fixture>();
      fixtures.set(
        "par-1",
        createFixture("par-1", 1, 1, [channel("red", "red")]),
      );

      const fixtureManager = createMockFixtureManager(fixtures);
      const scene = createScene("test", "Test", {
        "par-1": { red: 128 },
      });

      const result = sceneToDMX(scene, fixtureManager);
      const universe1 = result.get(1)!;

      expect(universe1[0]).toBe(128);
    });

    it("handles fixture at address 512 (edge case)", () => {
      const fixtures = new Map<string, Fixture>();
      fixtures.set(
        "par-1",
        createFixture("par-1", 1, 512, [channel("dimmer", "dimmer")]),
      );

      const fixtureManager = createMockFixtureManager(fixtures);
      const scene = createScene("test", "Test", {
        "par-1": { dimmer: 200 },
      });

      const result = sceneToDMX(scene, fixtureManager);
      const universe1 = result.get(1)!;

      expect(universe1[511]).toBe(200);
    });
  });

  describe("empty scene", () => {
    it("returns an empty map for a scene with no fixture states", () => {
      const fixtureManager = createMockFixtureManager(new Map());
      const scene = createScene("empty", "Empty", {});

      const result = sceneToDMX(scene, fixtureManager);

      expect(result.size).toBe(0);
    });
  });
});
