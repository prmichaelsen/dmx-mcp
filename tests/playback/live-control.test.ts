import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  setFixtureDimmer,
  getDMXState,
  formatDMXStateResult,
} from "../../src/playback/live-control.js";

function createMockOLAClient() {
  const universeData = new Map<number, number[]>();
  return {
    setDMX: vi.fn(async (universe: number, channels: number[]) => {
      universeData.set(universe, [...channels]);
    }),
    getDMX: vi.fn(async (universe: number) => {
      return universeData.get(universe) ?? new Array(512).fill(0);
    }),
    _universeData: universeData,
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

function createRGBFixture(
  id: string,
  universe: number,
  startAddress: number,
) {
  return {
    id,
    name: `RGB Par ${id}`,
    universe,
    startAddress,
    mode: "default",
    profileId: "generic-rgb-par",
    profile: {
      id: "generic-rgb-par",
      manufacturer: "Generic",
      model: "RGB Par",
      channels: [
        { name: "red", type: "red", defaultValue: 0, min: 0, max: 255 },
        { name: "green", type: "green", defaultValue: 0, min: 0, max: 255 },
        { name: "blue", type: "blue", defaultValue: 0, min: 0, max: 255 },
      ],
      modes: [{ name: "default", channelCount: 3, channels: ["red", "green", "blue"] }],
    },
  };
}

function createDimmerRGBFixture(
  id: string,
  universe: number,
  startAddress: number,
) {
  return {
    id,
    name: `Dimmer RGB ${id}`,
    universe,
    startAddress,
    mode: "default",
    profileId: "generic-dimmer-rgb",
    profile: {
      id: "generic-dimmer-rgb",
      manufacturer: "Generic",
      model: "Dimmer RGB",
      channels: [
        {
          name: "dimmer",
          type: "dimmer",
          defaultValue: 0,
          min: 0,
          max: 255,
        },
        { name: "red", type: "red", defaultValue: 0, min: 0, max: 255 },
        { name: "green", type: "green", defaultValue: 0, min: 0, max: 255 },
        { name: "blue", type: "blue", defaultValue: 0, min: 0, max: 255 },
      ],
      modes: [
        {
          name: "default",
          channelCount: 4,
          channels: ["dimmer", "red", "green", "blue"],
        },
      ],
    },
  };
}

function createDimmerOnlyFixture(
  id: string,
  universe: number,
  startAddress: number,
) {
  return {
    id,
    name: `Dimmer ${id}`,
    universe,
    startAddress,
    mode: "default",
    profileId: "generic-dimmer",
    profile: {
      id: "generic-dimmer",
      manufacturer: "Generic",
      model: "Single Dimmer",
      channels: [
        {
          name: "dimmer",
          type: "dimmer",
          defaultValue: 0,
          min: 0,
          max: 255,
        },
      ],
      modes: [{ name: "default", channelCount: 1, channels: ["dimmer"] }],
    },
  };
}

// --- setFixtureDimmer ---

describe("setFixtureDimmer", () => {
  let mockOLA: ReturnType<typeof createMockOLAClient>;
  let mockFixtureManager: ReturnType<typeof createMockFixtureManager>;

  beforeEach(() => {
    mockOLA = createMockOLAClient();
    mockFixtureManager = createMockFixtureManager();
  });

  it("sets dimmer value in absolute mode", async () => {
    mockFixtureManager._addFixture(createDimmerRGBFixture("par-1", 1, 10));

    const result = await setFixtureDimmer(
      { fixtureId: "par-1", level: 200 },
      mockFixtureManager as any,
      mockOLA as any,
    );

    expect(result.success).toBe(true);
    expect(result.dimmerChannel).toEqual({
      name: "dimmer",
      dmxAddress: 10,
      value: 200,
    });
  });

  it("converts percent to absolute", async () => {
    mockFixtureManager._addFixture(createDimmerRGBFixture("par-1", 1, 1));

    const result = await setFixtureDimmer(
      { fixtureId: "par-1", level: 0.5, unit: "percent" },
      mockFixtureManager as any,
      mockOLA as any,
    );

    expect(result.success).toBe(true);
    expect(result.dimmerChannel!.value).toBe(128);
  });

  it("handles 100% correctly", async () => {
    mockFixtureManager._addFixture(createDimmerOnlyFixture("dim-1", 1, 1));

    const result = await setFixtureDimmer(
      { fixtureId: "dim-1", level: 1.0, unit: "percent" },
      mockFixtureManager as any,
      mockOLA as any,
    );

    expect(result.success).toBe(true);
    expect(result.dimmerChannel!.value).toBe(255);
  });

  it("handles 0% correctly", async () => {
    mockFixtureManager._addFixture(createDimmerOnlyFixture("dim-1", 1, 1));

    const result = await setFixtureDimmer(
      { fixtureId: "dim-1", level: 0.0, unit: "percent" },
      mockFixtureManager as any,
      mockOLA as any,
    );

    expect(result.success).toBe(true);
    expect(result.dimmerChannel!.value).toBe(0);
  });

  it("returns hint for RGB-only fixture", async () => {
    mockFixtureManager._addFixture(createRGBFixture("par-1", 1, 1));

    const result = await setFixtureDimmer(
      { fixtureId: "par-1", level: 128 },
      mockFixtureManager as any,
      mockOLA as any,
    );

    expect(result.success).toBe(false);
    expect(result.error).toContain("no dedicated dimmer channel");
    expect(result.hint).toContain("set_fixture_color");
  });

  it("returns error for nonexistent fixture", async () => {
    const result = await setFixtureDimmer(
      { fixtureId: "nonexistent", level: 128 },
      mockFixtureManager as any,
      mockOLA as any,
    );

    expect(result.success).toBe(false);
    expect(result.error).toContain("not found");
  });

  it("clamps level above 255", async () => {
    mockFixtureManager._addFixture(createDimmerOnlyFixture("dim-1", 1, 1));

    const result = await setFixtureDimmer(
      { fixtureId: "dim-1", level: 300 },
      mockFixtureManager as any,
      mockOLA as any,
    );

    expect(result.success).toBe(true);
    expect(result.dimmerChannel!.value).toBe(255);
  });

  it("clamps negative level to 0", async () => {
    mockFixtureManager._addFixture(createDimmerOnlyFixture("dim-1", 1, 1));

    const result = await setFixtureDimmer(
      { fixtureId: "dim-1", level: -50 },
      mockFixtureManager as any,
      mockOLA as any,
    );

    expect(result.success).toBe(true);
    expect(result.dimmerChannel!.value).toBe(0);
  });

  it("clamps percent above 1.0", async () => {
    mockFixtureManager._addFixture(createDimmerOnlyFixture("dim-1", 1, 1));

    const result = await setFixtureDimmer(
      { fixtureId: "dim-1", level: 1.5, unit: "percent" },
      mockFixtureManager as any,
      mockOLA as any,
    );

    expect(result.success).toBe(true);
    expect(result.dimmerChannel!.value).toBe(255);
  });

  it("preserves other channels when setting dimmer", async () => {
    mockFixtureManager._addFixture(createDimmerRGBFixture("par-1", 1, 1));

    // Pre-set some channel values
    const initial = new Array(512).fill(0);
    initial[1] = 200; // DMX 2 = red
    initial[2] = 100; // DMX 3 = green
    mockOLA._universeData.set(1, initial);

    const result = await setFixtureDimmer(
      { fixtureId: "par-1", level: 128 },
      mockFixtureManager as any,
      mockOLA as any,
    );

    expect(result.success).toBe(true);

    const setCall = mockOLA.setDMX.mock.calls[0];
    expect(setCall[1][0]).toBe(128); // dimmer set
    expect(setCall[1][1]).toBe(200); // red preserved
    expect(setCall[1][2]).toBe(100); // green preserved
  });
});

// --- getDMXState ---

describe("getDMXState", () => {
  let mockOLA: ReturnType<typeof createMockOLAClient>;
  let mockFixtureManager: ReturnType<typeof createMockFixtureManager>;

  beforeEach(() => {
    mockOLA = createMockOLAClient();
    mockFixtureManager = createMockFixtureManager();
  });

  it("returns 512-channel array for a universe", async () => {
    const result = await getDMXState(
      { universe: 1 },
      mockOLA as any,
    );

    expect(result.success).toBe(true);
    expect(result.universe).toBe(1);
    expect(result.channels).toHaveLength(512);
    expect(result.activeChannelCount).toBe(0);
  });

  it("counts active (non-zero) channels", async () => {
    const channels = new Array(512).fill(0);
    channels[0] = 255;
    channels[5] = 128;
    channels[10] = 64;
    mockOLA._universeData.set(1, channels);

    const result = await getDMXState(
      { universe: 1 },
      mockOLA as any,
    );

    expect(result.activeChannelCount).toBe(3);
  });

  it("labels fixture channels when fixtureId provided", async () => {
    const fixture = createRGBFixture("par-1", 1, 10);
    mockFixtureManager._addFixture(fixture);

    const channels = new Array(512).fill(0);
    channels[9] = 255;
    channels[10] = 128;
    channels[11] = 64;
    mockOLA._universeData.set(1, channels);

    const result = await getDMXState(
      { universe: 1, fixtureId: "par-1" },
      mockOLA as any,
      mockFixtureManager as any,
    );

    expect(result.success).toBe(true);
    expect(result.fixtureState).toBeDefined();
    expect(result.fixtureState!.fixtureId).toBe("par-1");
    expect(result.fixtureState!.channels).toHaveLength(3);
    expect(result.fixtureState!.channels[0]).toEqual({
      name: "red",
      type: "red",
      dmxAddress: 10,
      value: 255,
    });
    expect(result.fixtureState!.channels[1]).toEqual({
      name: "green",
      type: "green",
      dmxAddress: 11,
      value: 128,
    });
    expect(result.fixtureState!.channels[2]).toEqual({
      name: "blue",
      type: "blue",
      dmxAddress: 12,
      value: 64,
    });
  });

  it("returns error for invalid universe", async () => {
    const result = await getDMXState(
      { universe: 0 },
      mockOLA as any,
    );

    expect(result.success).toBe(false);
    expect(result.error).toContain("positive integer");
  });

  it("warns when fixture is on different universe", async () => {
    const fixture = createRGBFixture("par-1", 2, 1);
    mockFixtureManager._addFixture(fixture);

    const result = await getDMXState(
      { universe: 1, fixtureId: "par-1" },
      mockOLA as any,
      mockFixtureManager as any,
    );

    expect(result.success).toBe(true);
    expect(result.error).toContain("universe 2");
    expect(result.fixtureState).toBeUndefined();
  });

  it("warns for nonexistent fixture but still returns data", async () => {
    const result = await getDMXState(
      { universe: 1, fixtureId: "nonexistent" },
      mockOLA as any,
      mockFixtureManager as any,
    );

    expect(result.success).toBe(true);
    expect(result.error).toContain("not found");
    expect(result.channels).toHaveLength(512);
  });

  it("handles OLA connection failure", async () => {
    mockOLA.getDMX.mockRejectedValue(new Error("Connection refused"));

    const result = await getDMXState(
      { universe: 1 },
      mockOLA as any,
    );

    expect(result.success).toBe(false);
    expect(result.error).toContain("Failed to read DMX");
  });
});

// --- formatDMXStateResult ---

describe("formatDMXStateResult", () => {
  it("formats error result", () => {
    const output = formatDMXStateResult({
      success: false,
      universe: 1,
      error: "Connection refused",
    });

    expect(output).toContain("Error");
    expect(output).toContain("Connection refused");
  });

  it("formats universe summary", () => {
    const channels = new Array(512).fill(0);
    channels[0] = 255;
    channels[5] = 128;

    const output = formatDMXStateResult({
      success: true,
      universe: 1,
      channels,
      activeChannelCount: 2,
    });

    expect(output).toContain("Universe 1");
    expect(output).toContain("Active channels: 2");
    expect(output).toContain("DMX 1: 255");
    expect(output).toContain("DMX 6: 128");
  });

  it("formats fixture state when available", () => {
    const output = formatDMXStateResult({
      success: true,
      universe: 1,
      channels: new Array(512).fill(0),
      activeChannelCount: 0,
      fixtureState: {
        fixtureId: "par-1",
        fixtureName: "Par 1",
        profile: "Generic RGB Par",
        startAddress: 10,
        channels: [
          { name: "red", type: "red", dmxAddress: 10, value: 255 },
          { name: "green", type: "green", dmxAddress: 11, value: 0 },
          { name: "blue", type: "blue", dmxAddress: 12, value: 0 },
        ],
      },
    });

    expect(output).toContain("Par 1");
    expect(output).toContain("par-1");
    expect(output).toContain("Generic RGB Par");
    expect(output).toContain("red (red): 255");
  });
});
