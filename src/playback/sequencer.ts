import type { OLAClient } from "../ola/client.js";
import type { SceneManager } from "../scenes/manager.js";
import type { FixtureManager } from "../fixtures/manager.js";
import type { FadeEngine } from "../cues/fade-engine.js";
import type { CueManager } from "../cues/manager.js";
import type { CueList } from "../types/index.js";
import { sceneToDMX } from "../scenes/dmx-mapper.js";

function cancellableDelay(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    if (signal.aborted) {
      reject(new Error("Aborted"));
      return;
    }

    const timer = setTimeout(() => {
      signal.removeEventListener("abort", onAbort);
      resolve();
    }, ms);

    function onAbort() {
      clearTimeout(timer);
      reject(new Error("Aborted"));
    }

    signal.addEventListener("abort", onAbort, { once: true });
  });
}

export interface SequencerState {
  activeCueListId: string | null;
  currentCueIndex: number;
  isPlaying: boolean;
  currentCueId: string | null;
}

export class CueSequencer {
  private readonly olaClient: OLAClient;
  private readonly sceneManager: SceneManager;
  private readonly fixtureManager: FixtureManager;
  private readonly fadeEngine: FadeEngine;
  private readonly cueManager: CueManager;

  private activeCueList: CueList | null = null;
  private currentCueIndex: number = 0;
  private isPlaying: boolean = false;
  private abortController: AbortController | null = null;

  constructor(deps: {
    olaClient: OLAClient;
    sceneManager: SceneManager;
    fixtureManager: FixtureManager;
    fadeEngine: FadeEngine;
    cueManager: CueManager;
  }) {
    this.olaClient = deps.olaClient;
    this.sceneManager = deps.sceneManager;
    this.fixtureManager = deps.fixtureManager;
    this.fadeEngine = deps.fadeEngine;
    this.cueManager = deps.cueManager;
  }

  async start(cueListId: string): Promise<void> {
    this.cancelActive();

    const cueList = this.cueManager.getCueList(cueListId);

    if (cueList.cues.length === 0) {
      throw new Error(`Cue list "${cueListId}" has no cues`);
    }

    this.activeCueList = cueList;
    this.currentCueIndex = 0;
    this.isPlaying = true;

    // Fire-and-forget — cue execution (fade + hold + auto-advance) runs in background
    this.executeCueAtIndex(0).catch(() => {});
  }

  async goCue(): Promise<void> {
    if (!this.activeCueList) {
      throw new Error("No active cue list. Call start(cueListId) first.");
    }

    this.cancelActive();

    const nextIndex = this.currentCueIndex + 1;

    if (nextIndex >= this.activeCueList.cues.length) {
      if (this.activeCueList.loop) {
        this.isPlaying = true;
        this.executeCueAtIndex(0).catch(() => {});
      } else {
        this.isPlaying = false;
      }
    } else {
      this.isPlaying = true;
      this.executeCueAtIndex(nextIndex).catch(() => {});
    }
  }

  async goToCue(cueId: string): Promise<void> {
    if (!this.activeCueList) {
      throw new Error("No active cue list. Call start(cueListId) first.");
    }

    const index = this.activeCueList.cues.findIndex(
      (cue) => cue.id === cueId,
    );
    if (index === -1) {
      throw new Error(
        `Cue "${cueId}" not found in cue list "${this.activeCueList.id}"`,
      );
    }

    this.cancelActive();

    this.isPlaying = true;
    this.executeCueAtIndex(index).catch(() => {});
  }

  stop(): void {
    this.cancelActive();
    this.isPlaying = false;
  }

  getState(): SequencerState {
    return {
      activeCueListId: this.activeCueList?.id ?? null,
      currentCueIndex: this.currentCueIndex,
      isPlaying: this.isPlaying,
      currentCueId:
        this.activeCueList?.cues[this.currentCueIndex]?.id ?? null,
    };
  }

  private async executeCueAtIndex(index: number): Promise<void> {
    if (!this.activeCueList) return;

    this.currentCueIndex = index;
    const cue = this.activeCueList.cues[index];

    this.abortController = new AbortController();
    const signal = this.abortController.signal;

    try {
      // Resolve the cue's target scene to DMX values
      const scene = this.sceneManager.getScene(cue.sceneId);
      const targetDMX = sceneToDMX(scene, this.fixtureManager);

      // For each universe in the target, read current state and fade
      for (const [universe, targetChannels] of targetDMX) {
        if (signal.aborted) break;

        // Read current DMX state from OLA as the fade-from values
        let currentChannels: number[];
        try {
          currentChannels = await this.olaClient.getDMX(universe);
          while (currentChannels.length < 512) {
            currentChannels.push(0);
          }
        } catch {
          currentChannels = new Array(512).fill(0);
        }

        // Build channel maps for the FadeEngine
        const fromMap = new Map<number, number>();
        const toMap = new Map<number, number>();

        for (let ch = 0; ch < 512; ch++) {
          const fromVal = currentChannels[ch] ?? 0;
          const toVal = targetChannels[ch] ?? 0;

          if (fromVal !== 0 || toVal !== 0) {
            fromMap.set(ch, fromVal);
            toMap.set(ch, toVal);
          }
        }

        // Execute the fade
        await this.fadeEngine.executeFade(
          fromMap,
          toMap,
          cue.fadeInMs,
          universe,
          this.olaClient,
          signal,
        );
      }

      // Wait for hold time (if any)
      if (cue.holdMs > 0 && !signal.aborted) {
        await cancellableDelay(cue.holdMs, signal);
      }

      // Auto-advance to next cue if still playing
      if (this.isPlaying && !signal.aborted) {
        const nextIndex = index + 1;

        if (nextIndex < this.activeCueList.cues.length) {
          await this.executeCueAtIndex(nextIndex);
        } else if (this.activeCueList.loop) {
          await this.executeCueAtIndex(0);
        } else {
          this.isPlaying = false;
        }
      }
    } catch (error) {
      // Aborted is expected when stop() or goToCue() cancels us
      if (error instanceof Error && error.message === "Aborted") {
        return;
      }
      // FadeEngine also throws "Fade aborted" or "Fade aborted before starting"
      if (
        error instanceof Error &&
        error.message.toLowerCase().includes("aborted")
      ) {
        return;
      }
      throw error;
    }
  }

  private cancelActive(): void {
    if (this.abortController) {
      this.abortController.abort();
      this.abortController = null;
    }
  }
}
