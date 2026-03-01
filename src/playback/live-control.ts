import type { OLAClient } from "../ola/client.js";
import type { FixtureManager } from "../fixtures/manager.js";
import { getChannelCount, getChannelOffset } from "../fixtures/profiles.js";

export interface SetFixtureColorParams {
  fixtureId: string;
  red?: number;
  green?: number;
  blue?: number;
  white?: number;
}

function clamp(value: number): number {
  return Math.max(0, Math.min(255, Math.round(value)));
}

export async function setFixtureColor(
  params: SetFixtureColorParams,
  fixtureManager: FixtureManager,
  olaClient: OLAClient,
): Promise<{ fixtureId: string; channelsSet: Record<string, number> }> {
  const fixture = fixtureManager.getFixture(params.fixtureId);
  if (!fixture) {
    throw new Error(`Fixture "${params.fixtureId}" not found`);
  }

  const channelCount = getChannelCount(fixture.profile, fixture.mode);

  // Read current DMX state
  const currentDmx = await olaClient.getDMX(fixture.universe);

  // Ensure array is 512 channels
  const dmxValues = new Array(512).fill(0);
  for (let i = 0; i < currentDmx.length && i < 512; i++) {
    dmxValues[i] = currentDmx[i];
  }

  const channelsSet: Record<string, number> = {};

  // Map color params to DMX channels
  const colorParams: [string, number | undefined][] = [
    ["red", params.red],
    ["green", params.green],
    ["blue", params.blue],
    ["white", params.white],
  ];

  for (const [channelName, value] of colorParams) {
    if (value === undefined) continue;

    let offset: number;
    try {
      offset = getChannelOffset(fixture.profile, fixture.mode, channelName);
    } catch {
      // This fixture doesn't have this channel type — skip
      continue;
    }

    const dmxAddress = fixture.startAddress - 1 + offset; // 0-indexed array
    const clamped = clamp(value);
    dmxValues[dmxAddress] = clamped;
    channelsSet[channelName] = clamped;
  }

  // Write back only the channels this fixture uses
  await olaClient.setDMX(fixture.universe, dmxValues.slice(0, Math.max(
    fixture.startAddress - 1 + channelCount,
    currentDmx.length,
  )));

  return { fixtureId: params.fixtureId, channelsSet };
}

export interface SetFixtureDimmerParams {
  fixtureId: string;
  level: number;
  unit?: "absolute" | "percent";
}

export interface SetFixtureDimmerResult {
  fixtureId: string;
  success: boolean;
  dimmerChannel?: {
    name: string;
    dmxAddress: number;
    value: number;
  };
  error?: string;
  hint?: string;
}

export async function setFixtureDimmer(
  params: SetFixtureDimmerParams,
  fixtureManager: FixtureManager,
  olaClient: OLAClient,
): Promise<SetFixtureDimmerResult> {
  const fixture = fixtureManager.getFixture(params.fixtureId);
  if (!fixture) {
    return {
      fixtureId: params.fixtureId,
      success: false,
      error: `Fixture "${params.fixtureId}" not found`,
    };
  }

  const channels = fixture.profile.channels;

  // Convert level to absolute 0-255
  let absoluteLevel: number;
  if (params.unit === "percent") {
    const clamped = Math.max(0, Math.min(1, params.level));
    absoluteLevel = Math.round(clamped * 255);
  } else {
    absoluteLevel = Math.max(0, Math.min(255, Math.round(params.level)));
  }

  // Find the dimmer channel
  let dimmerIndex = -1;
  for (let i = 0; i < channels.length; i++) {
    if (channels[i].type === "dimmer") {
      dimmerIndex = i;
      break;
    }
  }

  if (dimmerIndex === -1) {
    const hasRGB = channels.some(
      (ch) => ch.type === "red" || ch.type === "green" || ch.type === "blue",
    );

    if (hasRGB) {
      return {
        fixtureId: params.fixtureId,
        success: false,
        error: `Fixture "${params.fixtureId}" (${fixture.profile.manufacturer} ${fixture.profile.model}) has no dedicated dimmer channel.`,
        hint:
          `This fixture uses RGB channels for brightness control. ` +
          `To dim it, scale the RGB values proportionally using set_fixture_color. ` +
          `For example, for 50% brightness with red: ` +
          `set_fixture_color({ fixtureId: "${params.fixtureId}", red: 128, green: 0, blue: 0 })`,
      };
    }

    return {
      fixtureId: params.fixtureId,
      success: false,
      error:
        `Fixture "${params.fixtureId}" (${fixture.profile.manufacturer} ${fixture.profile.model}) ` +
        `has no dimmer or color channels. ` +
        `Available channels: ${channels.map((c) => c.name).join(", ")}`,
    };
  }

  // Read current DMX state to preserve other channels
  let currentChannels: number[];
  try {
    currentChannels = await olaClient.getDMX(fixture.universe);
    const dmxValues = new Array(512).fill(0);
    for (let i = 0; i < currentChannels.length && i < 512; i++) {
      dmxValues[i] = currentChannels[i];
    }
    currentChannels = dmxValues;
  } catch {
    currentChannels = new Array(512).fill(0);
  }

  const dmxAddress = fixture.startAddress + dimmerIndex;
  const arrayIndex = dmxAddress - 1;

  if (arrayIndex < 0 || arrayIndex >= 512) {
    return {
      fixtureId: params.fixtureId,
      success: false,
      error: `Dimmer channel maps to DMX address ${dmxAddress}, which is outside the valid range 1-512`,
    };
  }

  currentChannels[arrayIndex] = absoluteLevel;
  await olaClient.setDMX(fixture.universe, currentChannels);

  return {
    fixtureId: params.fixtureId,
    success: true,
    dimmerChannel: {
      name: channels[dimmerIndex].name,
      dmxAddress,
      value: absoluteLevel,
    },
  };
}

export async function blackout(
  fixtureManager: FixtureManager,
  olaClient: OLAClient,
): Promise<{ universesCleared: number[] }> {
  // Collect all active universes
  const universes = new Set<number>();
  for (const fixture of fixtureManager.listFixtures()) {
    universes.add(fixture.universe);
  }

  const zeros = new Array(512).fill(0);
  const universesCleared: number[] = [];

  for (const universe of universes) {
    await olaClient.setDMX(universe, zeros);
    universesCleared.push(universe);
  }

  return { universesCleared: universesCleared.sort((a, b) => a - b) };
}
