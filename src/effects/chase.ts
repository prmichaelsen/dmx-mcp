import type { Fixture, ChannelValues } from "../types/index.js";
import type { EffectCalculator, EffectParams } from "./engine.js";

const DEFAULT_PERIOD_MS = 2000;

export const chaseCalculator: EffectCalculator = (
  fixtures: Fixture[],
  elapsedMs: number,
  params: EffectParams,
): Map<string, ChannelValues> => {
  const result = new Map<string, ChannelValues>();
  if (fixtures.length === 0) return result;

  const speed = params.speed ?? 1.0;
  const intensity = params.intensity ?? 255;
  const color = params.color ?? { red: 255, green: 255, blue: 255 };

  const periodMs = DEFAULT_PERIOD_MS / speed;
  const phase = (elapsedMs % periodMs) / periodMs;
  const activeIndex = Math.floor(phase * fixtures.length);

  for (let i = 0; i < fixtures.length; i++) {
    const fixture = fixtures[i];
    const channels: ChannelValues = {};

    if (i === activeIndex) {
      for (const channelDef of fixture.profile.channels) {
        switch (channelDef.type) {
          case "dimmer":
            channels[channelDef.name] = intensity;
            break;
          case "red":
            channels[channelDef.name] = color.red;
            break;
          case "green":
            channels[channelDef.name] = color.green;
            break;
          case "blue":
            channels[channelDef.name] = color.blue;
            break;
          case "white":
            channels[channelDef.name] = params.color ? 0 : intensity;
            break;
          default:
            channels[channelDef.name] = channelDef.defaultValue;
            break;
        }
      }
    } else {
      for (const channelDef of fixture.profile.channels) {
        channels[channelDef.name] = 0;
      }
    }

    result.set(fixture.id, channels);
  }

  return result;
};
