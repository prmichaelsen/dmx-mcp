import type { SceneManager } from "../scenes/manager.js";
import type { Cue, CueList } from "../types/index.js";

export interface CueListInfo {
  id: string;
  name: string;
  cueCount: number;
  loop: boolean;
}

export class CueManager {
  private cueLists = new Map<string, CueList>();
  private sceneManager: SceneManager;

  constructor(sceneManager: SceneManager) {
    this.sceneManager = sceneManager;
  }

  createCueList(id: string, name: string, loop: boolean = false): CueList {
    if (this.cueLists.has(id)) {
      throw new Error(`Cue list with ID "${id}" already exists`);
    }

    const cueList: CueList = { id, name, cues: [], loop };
    this.cueLists.set(id, cueList);
    return cueList;
  }

  getCueList(id: string): CueList {
    const cueList = this.cueLists.get(id);
    if (!cueList) {
      throw new Error(`Cue list with ID "${id}" not found`);
    }
    return cueList;
  }

  listCueLists(): CueListInfo[] {
    return Array.from(this.cueLists.values()).map((cl) => ({
      id: cl.id,
      name: cl.name,
      cueCount: cl.cues.length,
      loop: cl.loop,
    }));
  }

  deleteCueList(id: string): void {
    if (!this.cueLists.has(id)) {
      throw new Error(`Cue list with ID "${id}" not found`);
    }
    this.cueLists.delete(id);
  }

  addCue(cueListId: string, cue: Cue): CueList {
    const cueList = this.getCueList(cueListId);

    this.validateSceneReference(cue.sceneId);

    const existingCue = cueList.cues.find((c) => c.id === cue.id);
    if (existingCue) {
      throw new Error(
        `Cue with ID "${cue.id}" already exists in cue list "${cueListId}"`,
      );
    }

    this.validateTimingValues(cue);

    cueList.cues.push(cue);
    return cueList;
  }

  removeCue(cueListId: string, cueId: string): CueList {
    const cueList = this.getCueList(cueListId);

    const cueIndex = cueList.cues.findIndex((c) => c.id === cueId);
    if (cueIndex === -1) {
      throw new Error(
        `Cue with ID "${cueId}" not found in cue list "${cueListId}"`,
      );
    }

    cueList.cues.splice(cueIndex, 1);
    return cueList;
  }

  reorderCues(cueListId: string, cueIds: string[]): CueList {
    const cueList = this.getCueList(cueListId);

    const existingIds = new Set(cueList.cues.map((c) => c.id));
    const newIds = new Set(cueIds);

    if (cueIds.length !== newIds.size) {
      throw new Error(
        `Duplicate cue IDs in reorder request. Each cue ID must appear exactly once.`,
      );
    }

    for (const existingId of existingIds) {
      if (!newIds.has(existingId)) {
        throw new Error(
          `Cue ID "${existingId}" exists in the list but is missing from the reorder request. ` +
            `All cue IDs must be included.`,
        );
      }
    }

    for (const newId of newIds) {
      if (!existingIds.has(newId)) {
        throw new Error(
          `Cue ID "${newId}" is not in cue list "${cueListId}". ` +
            `Only existing cue IDs can be used in a reorder.`,
        );
      }
    }

    const cueMap = new Map(cueList.cues.map((c) => [c.id, c]));
    cueList.cues = cueIds.map((id) => cueMap.get(id)!);

    return cueList;
  }

  clear(): void {
    this.cueLists.clear();
  }

  private validateSceneReference(sceneId: string): void {
    try {
      this.sceneManager.getScene(sceneId);
    } catch {
      throw new Error(
        `Scene with ID "${sceneId}" not found. ` +
          `Scenes must be created before they can be referenced in a cue.`,
      );
    }
  }

  private validateTimingValues(cue: Cue): void {
    if (cue.fadeInMs < 0 || !Number.isFinite(cue.fadeInMs)) {
      throw new Error(
        `Invalid fadeInMs value: ${cue.fadeInMs}. Must be a non-negative number.`,
      );
    }
    if (cue.holdMs < 0 || !Number.isFinite(cue.holdMs)) {
      throw new Error(
        `Invalid holdMs value: ${cue.holdMs}. Must be a non-negative number.`,
      );
    }
    if (cue.fadeOutMs < 0 || !Number.isFinite(cue.fadeOutMs)) {
      throw new Error(
        `Invalid fadeOutMs value: ${cue.fadeOutMs}. Must be a non-negative number.`,
      );
    }
  }
}
