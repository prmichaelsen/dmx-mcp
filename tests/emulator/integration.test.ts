import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { DMXEmulatorServer } from "../../src/emulator/server.js";
import { OLAClient } from "../../src/ola/client.js";
import {
  ProfileRegistry,
  initializeBuiltInProfiles,
} from "../../src/fixtures/profiles.js";
import { FixtureManager } from "../../src/fixtures/manager.js";
import { setFixtureColor, blackout } from "../../src/playback/live-control.js";

const TEST_PORT = 19090;

describe("Emulator Integration", () => {
  let emulator: DMXEmulatorServer;
  let olaClient: OLAClient;

  beforeAll(async () => {
    emulator = new DMXEmulatorServer(TEST_PORT);
    await emulator.start();
    olaClient = new OLAClient({ baseUrl: `http://localhost:${TEST_PORT}` });
  });

  afterAll(async () => {
    await emulator.stop();
  });

  beforeEach(() => {
    emulator.reset();
  });

  it("should round-trip DMX values through real OLAClient", async () => {
    await olaClient.setDMX(1, [255, 128, 0]);
    const result = await olaClient.getDMX(1);
    expect(result[0]).toBe(255);
    expect(result[1]).toBe(128);
    expect(result[2]).toBe(0);
    // Remaining channels should be 0
    expect(result[3]).toBe(0);
    expect(result.length).toBe(512);
  });

  it("should record frames for test assertions", async () => {
    await olaClient.setDMX(1, [100, 200, 50]);
    await olaClient.setDMX(1, [0, 0, 0]);

    const frames = emulator.getFramesForUniverse(1);
    expect(frames).toHaveLength(2);
    expect(frames[0].channels[0]).toBe(100);
    expect(frames[0].channels[1]).toBe(200);
    expect(frames[0].channels[2]).toBe(50);
    expect(frames[1].channels[0]).toBe(0);
  });

  it("should handle multiple universes independently", async () => {
    await olaClient.setDMX(1, [255, 0, 0]);
    await olaClient.setDMX(2, [0, 255, 0]);

    const u1 = await olaClient.getDMX(1);
    const u2 = await olaClient.getDMX(2);
    expect(u1[0]).toBe(255);
    expect(u1[1]).toBe(0);
    expect(u2[0]).toBe(0);
    expect(u2[1]).toBe(255);
  });

  it("should return 512 zeros for unset universe", async () => {
    const result = await olaClient.getDMX(99);
    expect(result.length).toBe(512);
    expect(result.every((v) => v === 0)).toBe(true);
  });

  it("should reset state and frame log", async () => {
    await olaClient.setDMX(1, [128]);
    expect(emulator.getFrames().length).toBe(1);

    emulator.reset();
    expect(emulator.getFrames().length).toBe(0);

    const result = await olaClient.getDMX(1);
    expect(result[0]).toBe(0);
  });

  it("should track active universes", async () => {
    await olaClient.setDMX(3, [1]);
    await olaClient.setDMX(1, [1]);

    const universes = emulator.getActiveUniverses();
    expect(universes).toEqual([1, 3]);
  });

  it("should work with setFixtureColor through real HTTP", async () => {
    const profileRegistry = new ProfileRegistry();
    initializeBuiltInProfiles(profileRegistry);
    const fixtureManager = new FixtureManager(profileRegistry);

    fixtureManager.patchFixture({
      id: "par-1",
      name: "Par 1",
      profileId: "generic-rgb-par",
      universe: 1,
      startAddress: 1,
    });

    await setFixtureColor(
      { fixtureId: "par-1", red: 255, green: 100, blue: 50 },
      fixtureManager,
      olaClient,
    );

    // Verify emulator received the correct DMX values
    const state = emulator.getState(1);
    expect(state[0]).toBe(255); // red at address 1
    expect(state[1]).toBe(100); // green at address 2
    expect(state[2]).toBe(50);  // blue at address 3
  });

  it("should verify blackout sends all zeros through HTTP", async () => {
    const profileRegistry = new ProfileRegistry();
    initializeBuiltInProfiles(profileRegistry);
    const fixtureManager = new FixtureManager(profileRegistry);

    fixtureManager.patchFixture({
      id: "par-1",
      name: "Par 1",
      profileId: "generic-rgb-par",
      universe: 1,
      startAddress: 1,
    });

    // Set some color first
    await setFixtureColor(
      { fixtureId: "par-1", red: 200, green: 150, blue: 100 },
      fixtureManager,
      olaClient,
    );

    // Verify non-zero
    let state = emulator.getState(1);
    expect(state[0]).toBe(200);

    // Blackout
    await blackout(fixtureManager, olaClient);

    // Verify all zeros
    state = emulator.getState(1);
    const hasNonZero = state.some((v) => v !== 0);
    expect(hasNonZero).toBe(false);
  });

  it("should handle rapid sequential setDMX calls", async () => {
    const promises = [];
    for (let i = 0; i < 20; i++) {
      promises.push(olaClient.setDMX(1, [i]));
    }
    await Promise.all(promises);

    const frames = emulator.getFramesForUniverse(1);
    expect(frames.length).toBe(20);
  });
});
