import { describe, it, expect, beforeEach } from "vitest";
import {
  ProfileRegistry,
  validateProfile,
  validateAddress,
  getChannelCount,
  getChannelByName,
  getChannelOffset,
  getAddressRange,
  isValidChannelType,
  initializeBuiltInProfiles,
  GENERIC_DIMMER,
  GENERIC_RGB_PAR,
  GENERIC_RGBW_PAR,
} from "../../src/fixtures/profiles.js";
import type { FixtureProfile } from "../../src/types/index.js";

// ── isValidChannelType ─────────────────────────────────────────

describe("isValidChannelType", () => {
  it("accepts all valid channel types", () => {
    const validTypes = [
      "dimmer", "red", "green", "blue", "white", "amber", "uv",
      "pan", "tilt", "pan_fine", "tilt_fine",
      "gobo", "strobe", "speed", "macro", "control",
    ];
    for (const type of validTypes) {
      expect(isValidChannelType(type)).toBe(true);
    }
  });

  it("rejects invalid channel types", () => {
    expect(isValidChannelType("brightness")).toBe(false);
    expect(isValidChannelType("colour")).toBe(false);
    expect(isValidChannelType("")).toBe(false);
    expect(isValidChannelType("RGB")).toBe(false);
  });
});

// ── validateProfile ────────────────────────────────────────────

describe("validateProfile", () => {
  const validProfile: FixtureProfile = {
    id: "test-par",
    manufacturer: "TestCo",
    model: "TestPar",
    channels: [
      { name: "red", type: "red", defaultValue: 0, min: 0, max: 255 },
      { name: "green", type: "green", defaultValue: 0, min: 0, max: 255 },
      { name: "blue", type: "blue", defaultValue: 0, min: 0, max: 255 },
    ],
    modes: [
      { name: "default", channelCount: 3, channels: ["red", "green", "blue"] },
    ],
  };

  it("accepts a valid profile", () => {
    expect(() => validateProfile(validProfile)).not.toThrow();
  });

  it("rejects profile with empty id", () => {
    expect(() => validateProfile({ ...validProfile, id: "" })).toThrow();
  });

  it("rejects profile with empty manufacturer", () => {
    expect(() => validateProfile({ ...validProfile, manufacturer: "" })).toThrow();
  });

  it("rejects profile with empty model", () => {
    expect(() => validateProfile({ ...validProfile, model: "" })).toThrow();
  });

  it("rejects profile with no channels", () => {
    expect(() =>
      validateProfile({ ...validProfile, channels: [], modes: [] }),
    ).toThrow();
  });

  it("rejects profile with no modes", () => {
    expect(() =>
      validateProfile({ ...validProfile, modes: [] }),
    ).toThrow();
  });

  it("rejects profile with min > max", () => {
    expect(() =>
      validateProfile({
        ...validProfile,
        channels: [
          { name: "red", type: "red", defaultValue: 0, min: 200, max: 100 },
        ],
        modes: [{ name: "default", channelCount: 1, channels: ["red"] }],
      }),
    ).toThrow("invalid range");
  });

  it("rejects profile with defaultValue outside range", () => {
    expect(() =>
      validateProfile({
        ...validProfile,
        channels: [
          { name: "red", type: "red", defaultValue: 128, min: 0, max: 100 },
        ],
        modes: [{ name: "default", channelCount: 1, channels: ["red"] }],
      }),
    ).toThrow("outside range");
  });

  it("rejects mode with mismatched channel count", () => {
    expect(() =>
      validateProfile({
        ...validProfile,
        modes: [
          { name: "default", channelCount: 2, channels: ["red", "green", "blue"] },
        ],
      }),
    ).toThrow("declares 2 channels but lists 3");
  });

  it("rejects mode referencing unknown channel", () => {
    expect(() =>
      validateProfile({
        ...validProfile,
        modes: [
          { name: "default", channelCount: 1, channels: ["nonexistent"] },
        ],
      }),
    ).toThrow('unknown channel "nonexistent"');
  });
});

// ── getChannelCount ────────────────────────────────────────────

describe("getChannelCount", () => {
  it("returns 1 for dimmer", () => {
    expect(getChannelCount(GENERIC_DIMMER, "default")).toBe(1);
  });

  it("returns 3 for RGB par", () => {
    expect(getChannelCount(GENERIC_RGB_PAR, "default")).toBe(3);
  });

  it("returns 4 for RGBW par", () => {
    expect(getChannelCount(GENERIC_RGBW_PAR, "default")).toBe(4);
  });

  it("throws for unknown mode", () => {
    expect(() => getChannelCount(GENERIC_RGB_PAR, "extended")).toThrow(
      'Mode "extended" not found',
    );
  });
});

// ── getChannelByName ───────────────────────────────────────────

describe("getChannelByName", () => {
  it("finds channel by exact name", () => {
    const channel = getChannelByName(GENERIC_RGB_PAR, "red");
    expect(channel).toBeDefined();
    expect(channel!.type).toBe("red");
  });

  it("returns undefined for nonexistent channel", () => {
    expect(getChannelByName(GENERIC_RGB_PAR, "white")).toBeUndefined();
  });
});

// ── getChannelOffset ───────────────────────────────────────────

describe("getChannelOffset", () => {
  it("returns correct offset for each RGB channel", () => {
    expect(getChannelOffset(GENERIC_RGB_PAR, "default", "red")).toBe(0);
    expect(getChannelOffset(GENERIC_RGB_PAR, "default", "green")).toBe(1);
    expect(getChannelOffset(GENERIC_RGB_PAR, "default", "blue")).toBe(2);
  });

  it("throws for nonexistent channel", () => {
    expect(() =>
      getChannelOffset(GENERIC_RGB_PAR, "default", "white"),
    ).toThrow('Channel "white" not found');
  });

  it("throws for nonexistent mode", () => {
    expect(() =>
      getChannelOffset(GENERIC_RGB_PAR, "extended", "red"),
    ).toThrow('Mode "extended" not found');
  });
});

// ── validateAddress ────────────────────────────────────────────

describe("validateAddress", () => {
  it("accepts valid address with room to spare", () => {
    expect(() => validateAddress(1, 3)).not.toThrow();
  });

  it("accepts fixture that fits exactly at end of universe", () => {
    expect(() => validateAddress(510, 3)).not.toThrow(); // 510,511,512
  });

  it("accepts single-channel fixture at address 512", () => {
    expect(() => validateAddress(512, 1)).not.toThrow();
  });

  it("rejects address that causes overflow", () => {
    expect(() => validateAddress(511, 3)).toThrow(); // needs 511,512,513
  });

  it("rejects address 0", () => {
    expect(() => validateAddress(0, 1)).toThrow();
  });

  it("rejects negative address", () => {
    expect(() => validateAddress(-1, 1)).toThrow();
  });

  it("rejects address above 512", () => {
    expect(() => validateAddress(513, 1)).toThrow();
  });
});

// ── getAddressRange ────────────────────────────────────────────

describe("getAddressRange", () => {
  it("returns correct range for single-channel", () => {
    expect(getAddressRange(100, 1)).toEqual([100, 100]);
  });

  it("returns correct range for 3-channel fixture", () => {
    expect(getAddressRange(100, 3)).toEqual([100, 102]);
  });

  it("returns correct range for 4-channel fixture", () => {
    expect(getAddressRange(1, 4)).toEqual([1, 4]);
  });
});

// ── ProfileRegistry ────────────────────────────────────────────

describe("ProfileRegistry", () => {
  let registry: ProfileRegistry;

  beforeEach(() => {
    registry = new ProfileRegistry();
  });

  it("registers and retrieves a profile by id", () => {
    registry.register(GENERIC_RGB_PAR);
    const profile = registry.get("generic-rgb-par");
    expect(profile).toBeDefined();
    expect(profile!.channels).toHaveLength(3);
  });

  it("returns undefined for unregistered profile", () => {
    expect(registry.get("nonexistent")).toBeUndefined();
  });

  it("checks if profile exists with has()", () => {
    registry.register(GENERIC_DIMMER);
    expect(registry.has("generic-dimmer")).toBe(true);
    expect(registry.has("generic-rgb-par")).toBe(false);
  });

  it("lists all registered profiles", () => {
    registry.register(GENERIC_DIMMER);
    registry.register(GENERIC_RGB_PAR);
    expect(registry.list()).toHaveLength(2);
  });

  it("rejects invalid profiles", () => {
    const invalid: FixtureProfile = {
      id: "",
      manufacturer: "",
      model: "Bad",
      channels: [],
      modes: [],
    };
    expect(() => registry.register(invalid)).toThrow();
  });
});

// ── Built-in Profiles ──────────────────────────────────────────

describe("Built-in Profiles", () => {
  it("all built-in profiles pass validation", () => {
    expect(() => validateProfile(GENERIC_DIMMER)).not.toThrow();
    expect(() => validateProfile(GENERIC_RGB_PAR)).not.toThrow();
    expect(() => validateProfile(GENERIC_RGBW_PAR)).not.toThrow();
  });

  it("GENERIC_DIMMER has 1 dimmer channel", () => {
    expect(GENERIC_DIMMER.channels).toHaveLength(1);
    expect(GENERIC_DIMMER.channels[0].type).toBe("dimmer");
  });

  it("GENERIC_RGB_PAR has 3 color channels in order", () => {
    expect(GENERIC_RGB_PAR.channels.map((c) => c.type)).toEqual([
      "red", "green", "blue",
    ]);
  });

  it("GENERIC_RGBW_PAR has 4 color channels in order", () => {
    expect(GENERIC_RGBW_PAR.channels.map((c) => c.type)).toEqual([
      "red", "green", "blue", "white",
    ]);
  });

  it("initializeBuiltInProfiles registers all 3 profiles", () => {
    const reg = new ProfileRegistry();
    initializeBuiltInProfiles(reg);
    expect(reg.list()).toHaveLength(3);
    expect(reg.has("generic-dimmer")).toBe(true);
    expect(reg.has("generic-rgb-par")).toBe(true);
    expect(reg.has("generic-rgbw-par")).toBe(true);
  });

  it("initializeBuiltInProfiles is idempotent", () => {
    const reg = new ProfileRegistry();
    initializeBuiltInProfiles(reg);
    initializeBuiltInProfiles(reg);
    expect(reg.list()).toHaveLength(3);
  });
});
