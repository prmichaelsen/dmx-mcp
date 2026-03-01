import type { Scene } from "./manager.js";
import type { FixtureManager } from "../fixtures/manager.js";
import type { ChannelDefinition } from "../types/index.js";

const DMX_CHANNEL_COUNT = 512;

export type DMXUniverseMap = Map<number, number[]>;

function buildChannelOffsetMap(
  channels: ChannelDefinition[],
): Map<string, { offset: number; definition: ChannelDefinition }> {
  const map = new Map<
    string,
    { offset: number; definition: ChannelDefinition }
  >();
  for (let i = 0; i < channels.length; i++) {
    map.set(channels[i].name, { offset: i, definition: channels[i] });
  }
  return map;
}

function getOrCreateUniverseArray(
  universeMap: DMXUniverseMap,
  universe: number,
): number[] {
  let channels = universeMap.get(universe);
  if (!channels) {
    channels = new Array(DMX_CHANNEL_COUNT).fill(0);
    universeMap.set(universe, channels);
  }
  return channels;
}

export function sceneToDMX(
  scene: Scene,
  fixtureManager: FixtureManager,
): DMXUniverseMap {
  const universeMap: DMXUniverseMap = new Map();

  for (const [fixtureId, channelValues] of scene.fixtureStates) {
    const fixture = fixtureManager.getFixture(fixtureId);
    if (!fixture) {
      throw new Error(`Fixture "${fixtureId}" not found`);
    }

    const profile = fixture.profile;
    const channels = profile.channels;
    const channelOffsetMap = buildChannelOffsetMap(channels);
    const universeChannels = getOrCreateUniverseArray(
      universeMap,
      fixture.universe,
    );

    for (const [channelName, info] of channelOffsetMap) {
      const dmxAddress = fixture.startAddress + info.offset;
      const arrayIndex = dmxAddress - 1;

      if (arrayIndex < 0 || arrayIndex >= DMX_CHANNEL_COUNT) {
        continue;
      }

      const value =
        channelValues[channelName] !== undefined
          ? channelValues[channelName]
          : info.definition.defaultValue;

      universeChannels[arrayIndex] = value;
    }
  }

  return universeMap;
}
