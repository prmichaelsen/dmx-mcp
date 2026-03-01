import type { Fixture, ChannelValues } from "../types/index.js";
import type { EffectCalculator, EffectParams } from "./engine.js";

const DEFAULT_PERIOD_MS = 5000;

function hsvToRgb(
  h: number,
  s: number,
  v: number,
): { red: number; green: number; blue: number } {
  h = ((h % 360) + 360) % 360;

  const c = v * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = v - c;

  let r: number, g: number, b: number;

  if (h < 60) {
    [r, g, b] = [c, x, 0];
  } else if (h < 120) {
    [r, g, b] = [x, c, 0];
  } else if (h < 180) {
    [r, g, b] = [0, c, x];
  } else if (h < 240) {
    [r, g, b] = [0, x, c];
  } else if (h < 300) {
    [r, g, b] = [x, 0, c];
  } else {
    [r, g, b] = [c, 0, x];
  }

  return {
    red: Math.round((r + m) * 255),
    green: Math.round((g + m) * 255),
    blue: Math.round((b + m) * 255),
  };
}

export const rainbowCalculator: EffectCalculator = (
  fixtures: Fixture[],
  elapsedMs: number,
  params: EffectParams,
): Map<string, ChannelValues> => {
  const result = new Map<string, ChannelValues>();
  if (fixtures.length === 0) return result;

  const speed = params.speed ?? 1.0;
  const intensity = params.intensity ?? 255;

  const periodMs = DEFAULT_PERIOD_MS / speed;
  const baseHue = ((elapsedMs % periodMs) / periodMs) * 360;

  for (let i = 0; i < fixtures.length; i++) {
    const fixture = fixtures[i];
    const channels: ChannelValues = {};

    const hueOffset = (i / fixtures.length) * 360;
    const hue = (baseHue + hueOffset) % 360;

    const brightness = intensity / 255;
    const rgb = hsvToRgb(hue, 1.0, brightness);

    for (const channelDef of fixture.profile.channels) {
      switch (channelDef.type) {
        case "dimmer":
          channels[channelDef.name] = intensity;
          break;
        case "red":
          channels[channelDef.name] = rgb.red;
          break;
        case "green":
          channels[channelDef.name] = rgb.green;
          break;
        case "blue":
          channels[channelDef.name] = rgb.blue;
          break;
        case "white":
          channels[channelDef.name] = 0;
          break;
        default:
          channels[channelDef.name] = channelDef.defaultValue;
          break;
      }
    }

    result.set(fixture.id, channels);
  }

  return result;
};
