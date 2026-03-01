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
