import { describe, it, expect, beforeEach } from "vitest";
import { FadeEngine } from "../../src/cues/fade-engine.js";
import type { OLAClient } from "../../src/ola/client.js";

function createMockOLAClient(): {
  client: OLAClient;
  calls: Array<{ universe: number; channels: number[] }>;
} {
  const calls: Array<{ universe: number; channels: number[] }> = [];

  const client = {
    async setDMX(universe: number, channels: number[]): Promise<void> {
      calls.push({ universe, channels: [...channels] });
    },
  } as unknown as OLAClient;

  return { client, calls };
}

describe("FadeEngine", () => {
  let fadeEngine: FadeEngine;

  beforeEach(() => {
    fadeEngine = new FadeEngine();
  });

  // --- Instant Snap (0ms duration) ---

  describe("instant snap (0ms duration)", () => {
    it("sets target values immediately with a single setDMX call", async () => {
      const { client, calls } = createMockOLAClient();

      const from = new Map<number, number>();
      const to = new Map<number, number>([
        [0, 255],
        [1, 128],
        [2, 64],
      ]);

      await fadeEngine.executeFade(from, to, 0, 1, client);

      expect(calls).toHaveLength(1);
      expect(calls[0].universe).toBe(1);
      expect(calls[0].channels[0]).toBe(255);
      expect(calls[0].channels[1]).toBe(128);
      expect(calls[0].channels[2]).toBe(64);
    });

    it("produces a 512-element channel array", async () => {
      const { client, calls } = createMockOLAClient();

      const to = new Map<number, number>([[0, 100]]);
      await fadeEngine.executeFade(new Map(), to, 0, 1, client);

      expect(calls[0].channels).toHaveLength(512);
    });

    it("sets unspecified channels to 0", async () => {
      const { client, calls } = createMockOLAClient();

      const to = new Map<number, number>([[5, 200]]);
      await fadeEngine.executeFade(new Map(), to, 0, 1, client);

      expect(calls[0].channels[0]).toBe(0);
      expect(calls[0].channels[5]).toBe(200);
      expect(calls[0].channels[511]).toBe(0);
    });
  });

  // --- Interpolation ---

  describe("interpolation", () => {
    it("interpolates from 0 to 255 correctly", async () => {
      const { client, calls } = createMockOLAClient();

      const from = new Map<number, number>([[0, 0]]);
      const to = new Map<number, number>([[0, 255]]);

      await fadeEngine.executeFade(from, to, 50, 1, client);

      expect(calls.length).toBeGreaterThan(1);
      expect(calls[0].channels[0]).toBe(0);
      expect(calls[calls.length - 1].channels[0]).toBe(255);
    });

    it("interpolates from 255 to 0 correctly", async () => {
      const { client, calls } = createMockOLAClient();

      const from = new Map<number, number>([[0, 255]]);
      const to = new Map<number, number>([[0, 0]]);

      await fadeEngine.executeFade(from, to, 50, 1, client);

      expect(calls[0].channels[0]).toBe(255);
      expect(calls[calls.length - 1].channels[0]).toBe(0);
    });

    it("produces monotonically increasing values for a fade up", async () => {
      const { client, calls } = createMockOLAClient();

      const from = new Map<number, number>([[0, 0]]);
      const to = new Map<number, number>([[0, 255]]);

      await fadeEngine.executeFade(from, to, 100, 1, client);

      for (let i = 1; i < calls.length; i++) {
        expect(calls[i].channels[0]).toBeGreaterThanOrEqual(
          calls[i - 1].channels[0],
        );
      }
    });

    it("interpolates multiple channels simultaneously", async () => {
      const { client, calls } = createMockOLAClient();

      const from = new Map<number, number>([
        [0, 0],
        [1, 255],
        [2, 100],
      ]);
      const to = new Map<number, number>([
        [0, 255],
        [1, 0],
        [2, 100],
      ]);

      await fadeEngine.executeFade(from, to, 50, 1, client);

      // First frame
      expect(calls[0].channels[0]).toBe(0);
      expect(calls[0].channels[1]).toBe(255);
      expect(calls[0].channels[2]).toBe(100);

      // Last frame
      const last = calls[calls.length - 1];
      expect(last.channels[0]).toBe(255);
      expect(last.channels[1]).toBe(0);
      expect(last.channels[2]).toBe(100);
    });

    it("handles 50% progress correctly for a simple fade", async () => {
      const { client, calls } = createMockOLAClient();

      const from = new Map<number, number>([[0, 0]]);
      const to = new Map<number, number>([[0, 200]]);

      // 50ms at 40fps (25ms/frame) = 2 steps: progress 0/2, 1/2, 2/2, + final
      await fadeEngine.executeFade(from, to, 50, 1, client);

      if (calls.length >= 3) {
        // Step 1 at 50% progress: 0 + (200-0) * 0.5 = 100
        expect(calls[1].channels[0]).toBe(100);
      }
    });

    it("channels in 'to' but not 'from' interpolate from 0", async () => {
      const { client, calls } = createMockOLAClient();

      const from = new Map<number, number>();
      const to = new Map<number, number>([[0, 200]]);

      await fadeEngine.executeFade(from, to, 50, 1, client);

      expect(calls[0].channels[0]).toBe(0);
      expect(calls[calls.length - 1].channels[0]).toBe(200);
    });

    it("channels in 'from' but not 'to' interpolate to 0", async () => {
      const { client, calls } = createMockOLAClient();

      const from = new Map<number, number>([[0, 200]]);
      const to = new Map<number, number>();

      await fadeEngine.executeFade(from, to, 50, 1, client);

      expect(calls[0].channels[0]).toBe(200);
      expect(calls[calls.length - 1].channels[0]).toBe(0);
    });
  });

  // --- Cancellation via AbortSignal ---

  describe("cancellation", () => {
    it("throws if aborted before starting", async () => {
      const { client } = createMockOLAClient();

      const controller = new AbortController();
      controller.abort();

      const from = new Map<number, number>();
      const to = new Map<number, number>([[0, 255]]);

      await expect(
        fadeEngine.executeFade(from, to, 1000, 1, client, controller.signal),
      ).rejects.toThrow(/aborted/i);
    });

    it("throws when aborted mid-fade", async () => {
      const { client } = createMockOLAClient();

      const controller = new AbortController();
      const from = new Map<number, number>();
      const to = new Map<number, number>([[0, 255]]);

      setTimeout(() => controller.abort(), 30);

      await expect(
        fadeEngine.executeFade(from, to, 5000, 1, client, controller.signal),
      ).rejects.toThrow(/aborted/i);
    });

    it("does not push all frames when aborted mid-fade", async () => {
      const { client, calls } = createMockOLAClient();

      const controller = new AbortController();
      const from = new Map<number, number>();
      const to = new Map<number, number>([[0, 255]]);

      setTimeout(() => controller.abort(), 30);

      try {
        await fadeEngine.executeFade(
          from,
          to,
          5000,
          1,
          client,
          controller.signal,
        );
      } catch {
        // Expected
      }

      // 5 seconds at 40fps = 200 frames. Should have far fewer.
      expect(calls.length).toBeLessThan(200);
    });
  });

  // --- Universe and Channel Array ---

  describe("universe and channel array", () => {
    it("sends to the correct universe", async () => {
      const { client, calls } = createMockOLAClient();

      const to = new Map<number, number>([[0, 100]]);
      await fadeEngine.executeFade(new Map(), to, 0, 3, client);

      expect(calls[0].universe).toBe(3);
    });

    it("always produces 512-element arrays", async () => {
      const { client, calls } = createMockOLAClient();

      const to = new Map<number, number>([[511, 42]]);
      await fadeEngine.executeFade(new Map(), to, 0, 1, client);

      expect(calls[0].channels).toHaveLength(512);
      expect(calls[0].channels[511]).toBe(42);
    });

    it("ignores out-of-range channel indices", async () => {
      const { client, calls } = createMockOLAClient();

      const to = new Map<number, number>([
        [0, 100],
        [512, 200],
        [-1, 150],
      ]);
      await fadeEngine.executeFade(new Map(), to, 0, 1, client);

      expect(calls[0].channels[0]).toBe(100);
      expect(calls[0].channels).toHaveLength(512);
    });
  });

  // --- Final Frame Guarantee ---

  describe("final frame", () => {
    it("sends exact target values as the final frame", async () => {
      const { client, calls } = createMockOLAClient();

      const from = new Map<number, number>([[0, 0]]);
      const to = new Map<number, number>([[0, 173]]);

      await fadeEngine.executeFade(from, to, 100, 1, client);

      const lastCall = calls[calls.length - 1];
      expect(lastCall.channels[0]).toBe(173);
    });
  });
});
