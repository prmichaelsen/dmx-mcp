import type { Fixture, ChannelValues } from "../types/index.js";
import type { EffectCalculator, EffectParams } from "./engine.js";

const DEFAULT_RATE_HZ = 5;
const DEFAULT_DUTY_CYCLE = 0.5;

export const strobeCalculator: EffectCalculator = (
  fixtures: Fixture[],
  elapsedMs: number,
  params: EffectParams,
): Map<string, ChannelValues> => {
  const result = new Map<string, ChannelValues>();
  if (fixtures.length === 0) return result;

  const rate = Math.min(25, Math.max(1, params.rate ?? DEFAULT_RATE_HZ));
  const dutyCycle = Math.min(
    0.9,
    Math.max(0.1, params.dutyCycle ?? DEFAULT_DUTY_CYCLE),
  );
  const intensity = params.intensity ?? 255;
  const color = params.color ?? { red: 255, green: 255, blue: 255 };

  const periodMs = 1000 / rate;
  const cyclePosition = (elapsedMs % periodMs) / periodMs;
  const isOn = cyclePosition < dutyCycle;

  for (const fixture of fixtures) {
    const channels: ChannelValues = {};

    if (isOn) {
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
