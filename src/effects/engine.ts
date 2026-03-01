import type { OLAClient } from "../ola/client.js";
import type { FixtureManager } from "../fixtures/manager.js";
import type { Fixture, ChannelValues } from "../types/index.js";

export type EffectType = "chase" | "rainbow" | "strobe";

export interface EffectParams {
  speed?: number;
  color?: { red: number; green: number; blue: number };
  rate?: number;
  dutyCycle?: number;
  intensity?: number;
}

export interface ActiveEffect {
  id: string;
  type: EffectType;
  fixtureIds: string[];
  params: EffectParams;
  abortController: AbortController;
  startedAt: number;
}

export type EffectCalculator = (
  fixtures: Fixture[],
  elapsedMs: number,
  params: EffectParams,
) => Map<string, ChannelValues>;

const LOOP_INTERVAL_MS = 25;

export class EffectEngine {
  private readonly olaClient: OLAClient;
  private readonly fixtureManager: FixtureManager;
  private readonly activeEffects: Map<string, ActiveEffect> = new Map();
  private readonly calculators: Map<EffectType, EffectCalculator> = new Map();
  private nextEffectId: number = 1;

  constructor(olaClient: OLAClient, fixtureManager: FixtureManager) {
    this.olaClient = olaClient;
    this.fixtureManager = fixtureManager;
  }

  registerEffect(type: EffectType, calculator: EffectCalculator): void {
    this.calculators.set(type, calculator);
  }

  startEffect(
    type: EffectType,
    fixtureIds: string[],
    params: EffectParams = {},
  ): string {
    const calculator = this.calculators.get(type);
    if (!calculator) {
      throw new Error(
        `Unknown effect type "${type}". ` +
          `Registered types: ${Array.from(this.calculators.keys()).join(", ")}`,
      );
    }

    const fixtures: Fixture[] = [];
    for (const fixtureId of fixtureIds) {
      const fixture = this.fixtureManager.getFixture(fixtureId);
      if (!fixture) {
        throw new Error(
          `Fixture "${fixtureId}" not found. ` +
            `Fixtures must be patched before applying effects.`,
        );
      }
      fixtures.push(fixture);
    }

    const effectId = `effect-${this.nextEffectId++}`;
    const abortController = new AbortController();

    const activeEffect: ActiveEffect = {
      id: effectId,
      type,
      fixtureIds: [...fixtureIds],
      params,
      abortController,
      startedAt: Date.now(),
    };

    this.activeEffects.set(effectId, activeEffect);

    this.runEffectLoop(activeEffect, calculator, fixtures).catch(() => {
      this.activeEffects.delete(effectId);
    });

    return effectId;
  }

  stopEffect(effectId: string): void {
    const effect = this.activeEffects.get(effectId);
    if (!effect) {
      throw new Error(
        `Effect "${effectId}" not found. ` +
          `Active effects: ${Array.from(this.activeEffects.keys()).join(", ") || "none"}`,
      );
    }

    effect.abortController.abort();
    this.activeEffects.delete(effectId);
  }

  stopAll(): void {
    for (const effect of this.activeEffects.values()) {
      effect.abortController.abort();
    }
    this.activeEffects.clear();
  }

  listActiveEffects(): Array<{
    id: string;
    type: EffectType;
    fixtureIds: string[];
    params: EffectParams;
    runningMs: number;
  }> {
    const now = Date.now();
    return Array.from(this.activeEffects.values()).map((effect) => ({
      id: effect.id,
      type: effect.type,
      fixtureIds: effect.fixtureIds,
      params: effect.params,
      runningMs: now - effect.startedAt,
    }));
  }

  getActiveEffectCount(): number {
    return this.activeEffects.size;
  }

  private async runEffectLoop(
    effect: ActiveEffect,
    calculator: EffectCalculator,
    fixtures: Fixture[],
  ): Promise<void> {
    const { abortController } = effect;

    while (!abortController.signal.aborted) {
      const elapsedMs = Date.now() - effect.startedAt;

      const fixtureValues = calculator(fixtures, elapsedMs, effect.params);

      const universeChannels = new Map<number, number[]>();

      for (const [fixtureId, channelValues] of fixtureValues) {
        const fixture = fixtures.find((f) => f.id === fixtureId);
        if (!fixture) continue;

        let channels = universeChannels.get(fixture.universe);
        if (!channels) {
          channels = new Array(512).fill(0);
          universeChannels.set(fixture.universe, channels);
        }

        for (const channelDef of fixture.profile.channels) {
          const offset = fixture.profile.channels.indexOf(channelDef);
          const dmxAddress = fixture.startAddress + offset;
          const arrayIndex = dmxAddress - 1;

          if (arrayIndex >= 0 && arrayIndex < 512) {
            const value = channelValues[channelDef.name];
            if (value !== undefined) {
              channels[arrayIndex] = Math.round(
                Math.min(255, Math.max(0, value)),
              );
            }
          }
        }
      }

      for (const [universe, channels] of universeChannels) {
        try {
          await this.olaClient.setDMX(universe, channels);
        } catch {
          // Transient OLA errors — don't crash the loop
        }
      }

      await this.sleep(LOOP_INTERVAL_MS, abortController.signal);
    }
  }

  private sleep(ms: number, signal: AbortSignal): Promise<void> {
    return new Promise((resolve) => {
      if (signal.aborted) {
        resolve();
        return;
      }

      const timer = setTimeout(resolve, ms);

      const onAbort = () => {
        clearTimeout(timer);
        resolve();
      };

      signal.addEventListener("abort", onAbort, { once: true });
    });
  }
}
