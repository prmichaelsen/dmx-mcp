import type { OLAClient } from "../ola/client.js";

const DMX_CHANNEL_COUNT = 512;
const TARGET_FPS = 40;
const FRAME_INTERVAL_MS = 1000 / TARGET_FPS;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export class FadeEngine {
  async executeFade(
    from: Map<number, number>,
    to: Map<number, number>,
    durationMs: number,
    universe: number,
    olaClient: OLAClient,
    signal?: AbortSignal,
  ): Promise<void> {
    if (durationMs <= 0) {
      const channels = this.buildChannelArray(to);
      await olaClient.setDMX(universe, channels);
      return;
    }

    if (signal?.aborted) {
      throw new Error("Fade aborted before starting");
    }

    const steps = Math.max(1, Math.floor(durationMs / FRAME_INTERVAL_MS));
    const allChannels = this.collectAllChannels(from, to);
    const startTime = performance.now();

    for (let step = 0; step <= steps; step++) {
      if (signal?.aborted) {
        throw new Error("Fade aborted");
      }

      const progress = step / steps;
      const interpolated = this.interpolate(from, to, allChannels, progress);
      const channels = this.buildChannelArray(interpolated);
      await olaClient.setDMX(universe, channels);

      if (step < steps) {
        const nextFrameTime = startTime + (step + 1) * FRAME_INTERVAL_MS;
        const now = performance.now();
        const sleepTime = nextFrameTime - now;

        if (sleepTime > 0) {
          await sleep(sleepTime);
        }
      }
    }

    const finalChannels = this.buildChannelArray(to);
    await olaClient.setDMX(universe, finalChannels);
  }

  private collectAllChannels(
    from: Map<number, number>,
    to: Map<number, number>,
  ): number[] {
    const channelSet = new Set<number>();
    for (const ch of from.keys()) channelSet.add(ch);
    for (const ch of to.keys()) channelSet.add(ch);
    return Array.from(channelSet);
  }

  private interpolate(
    from: Map<number, number>,
    to: Map<number, number>,
    channels: number[],
    progress: number,
  ): Map<number, number> {
    const result = new Map<number, number>();
    for (const ch of channels) {
      const fromVal = from.get(ch) ?? 0;
      const toVal = to.get(ch) ?? 0;
      const value = Math.round(fromVal + (toVal - fromVal) * progress);
      result.set(ch, value);
    }
    return result;
  }

  private buildChannelArray(state: Map<number, number>): number[] {
    const channels = new Array(DMX_CHANNEL_COUNT).fill(0);
    for (const [ch, value] of state) {
      if (ch >= 0 && ch < DMX_CHANNEL_COUNT) {
        channels[ch] = value;
      }
    }
    return channels;
  }
}
