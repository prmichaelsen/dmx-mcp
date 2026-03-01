import type { FixtureProfile, ChannelDefinition, ChannelType } from "../types/index.js";

export class ProfileRegistry {
  private profiles = new Map<string, FixtureProfile>();

  register(profile: FixtureProfile): void {
    validateProfile(profile);
    this.profiles.set(profile.id, profile);
  }

  get(id: string): FixtureProfile | undefined {
    return this.profiles.get(id);
  }

  list(): FixtureProfile[] {
    return Array.from(this.profiles.values());
  }

  has(id: string): boolean {
    return this.profiles.has(id);
  }
}

export function validateProfile(profile: FixtureProfile): void {
  if (!profile.id || !profile.manufacturer || !profile.model) {
    throw new Error("Profile must have id, manufacturer, and model");
  }
  if (profile.channels.length === 0) {
    throw new Error("Profile must have at least one channel");
  }
  if (profile.modes.length === 0) {
    throw new Error("Profile must have at least one mode");
  }

  const channelNames = new Set(profile.channels.map((c) => c.name));
  for (const mode of profile.modes) {
    if (mode.channelCount !== mode.channels.length) {
      throw new Error(
        `Mode "${mode.name}" declares ${mode.channelCount} channels but lists ${mode.channels.length}`,
      );
    }
    for (const chName of mode.channels) {
      if (!channelNames.has(chName)) {
        throw new Error(
          `Mode "${mode.name}" references unknown channel "${chName}"`,
        );
      }
    }
  }

  for (const ch of profile.channels) {
    if (ch.min < 0 || ch.max > 255 || ch.min > ch.max) {
      throw new Error(
        `Channel "${ch.name}" has invalid range: ${ch.min}-${ch.max}`,
      );
    }
    if (ch.defaultValue < ch.min || ch.defaultValue > ch.max) {
      throw new Error(
        `Channel "${ch.name}" default ${ch.defaultValue} is outside range ${ch.min}-${ch.max}`,
      );
    }
  }
}

export function getChannelCount(
  profile: FixtureProfile,
  modeName: string,
): number {
  const mode = profile.modes.find((m) => m.name === modeName);
  if (!mode) {
    throw new Error(
      `Mode "${modeName}" not found in profile "${profile.id}"`,
    );
  }
  return mode.channelCount;
}

export function getChannelByName(
  profile: FixtureProfile,
  channelName: string,
): ChannelDefinition | undefined {
  return profile.channels.find((c) => c.name === channelName);
}

export function getChannelOffset(
  profile: FixtureProfile,
  modeName: string,
  channelName: string,
): number {
  const mode = profile.modes.find((m) => m.name === modeName);
  if (!mode) {
    throw new Error(
      `Mode "${modeName}" not found in profile "${profile.id}"`,
    );
  }
  const offset = mode.channels.indexOf(channelName);
  if (offset === -1) {
    throw new Error(
      `Channel "${channelName}" not found in mode "${modeName}"`,
    );
  }
  return offset;
}

export function validateAddress(
  startAddress: number,
  channelCount: number,
): void {
  if (startAddress < 1 || startAddress > 512) {
    throw new Error(
      `Start address must be between 1 and 512, got ${startAddress}`,
    );
  }
  const endAddress = startAddress + channelCount - 1;
  if (endAddress > 512) {
    throw new Error(
      `Fixture would exceed DMX address space (${startAddress} + ${channelCount} - 1 = ${endAddress} > 512)`,
    );
  }
}

export function getAddressRange(
  startAddress: number,
  channelCount: number,
): [number, number] {
  return [startAddress, startAddress + channelCount - 1];
}

const VALID_CHANNEL_TYPES: ReadonlySet<string> = new Set([
  "dimmer", "red", "green", "blue", "white", "amber", "uv",
  "pan", "tilt", "pan_fine", "tilt_fine",
  "gobo", "strobe", "speed", "macro", "control",
]);

export function isValidChannelType(type: string): type is ChannelType {
  return VALID_CHANNEL_TYPES.has(type);
}

// Built-in profiles

function ch(
  name: string,
  type: ChannelType,
  defaultValue = 0,
): ChannelDefinition {
  return { name, type, defaultValue, min: 0, max: 255 };
}

export const GENERIC_DIMMER: FixtureProfile = {
  id: "generic-dimmer",
  manufacturer: "Generic",
  model: "Dimmer",
  channels: [ch("dimmer", "dimmer")],
  modes: [{ name: "default", channelCount: 1, channels: ["dimmer"] }],
};

export const GENERIC_RGB_PAR: FixtureProfile = {
  id: "generic-rgb-par",
  manufacturer: "Generic",
  model: "RGB Par",
  channels: [ch("red", "red"), ch("green", "green"), ch("blue", "blue")],
  modes: [
    { name: "default", channelCount: 3, channels: ["red", "green", "blue"] },
  ],
};

export const GENERIC_RGBW_PAR: FixtureProfile = {
  id: "generic-rgbw-par",
  manufacturer: "Generic",
  model: "RGBW Par",
  channels: [
    ch("red", "red"),
    ch("green", "green"),
    ch("blue", "blue"),
    ch("white", "white"),
  ],
  modes: [
    {
      name: "default",
      channelCount: 4,
      channels: ["red", "green", "blue", "white"],
    },
  ],
};

export function initializeBuiltInProfiles(registry: ProfileRegistry): void {
  registry.register(GENERIC_DIMMER);
  registry.register(GENERIC_RGB_PAR);
  registry.register(GENERIC_RGBW_PAR);
}
