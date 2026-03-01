import type { CueManager } from "./manager.js";
import type { Cue } from "../types/index.js";

export interface AddCueInput {
  id: string;
  name: string;
  scene_id: string;
  fade_in_ms: number;
  hold_ms: number;
  fade_out_ms: number;
}

export function handleCreateCueList(
  id: string,
  name: string,
  loop: boolean | undefined,
  cueManager: CueManager,
): { success: boolean; cueList: { id: string; name: string; cueCount: number; loop: boolean } } {
  const cueList = cueManager.createCueList(id, name, loop ?? false);
  return {
    success: true,
    cueList: {
      id: cueList.id,
      name: cueList.name,
      cueCount: cueList.cues.length,
      loop: cueList.loop,
    },
  };
}

export function handleAddCue(
  cueListId: string,
  cueInput: AddCueInput,
  cueManager: CueManager,
): { success: boolean; cueListId: string; cue: { id: string; name: string; sceneId: string; fadeInMs: number; holdMs: number; fadeOutMs: number }; cueCount: number } {
  const cue: Cue = {
    id: cueInput.id,
    name: cueInput.name,
    sceneId: cueInput.scene_id,
    fadeInMs: cueInput.fade_in_ms,
    holdMs: cueInput.hold_ms,
    fadeOutMs: cueInput.fade_out_ms,
  };

  const updatedCueList = cueManager.addCue(cueListId, cue);

  return {
    success: true,
    cueListId: updatedCueList.id,
    cue: {
      id: cue.id,
      name: cue.name,
      sceneId: cue.sceneId,
      fadeInMs: cue.fadeInMs,
      holdMs: cue.holdMs,
      fadeOutMs: cue.fadeOutMs,
    },
    cueCount: updatedCueList.cues.length,
  };
}

export function handleRemoveCue(
  cueListId: string,
  cueId: string,
  cueManager: CueManager,
): { success: boolean; cueListId: string; removedCueId: string; remainingCueCount: number; remainingCues: Array<{ id: string; name: string }> } {
  const updatedCueList = cueManager.removeCue(cueListId, cueId);

  return {
    success: true,
    cueListId: updatedCueList.id,
    removedCueId: cueId,
    remainingCueCount: updatedCueList.cues.length,
    remainingCues: updatedCueList.cues.map((c) => ({
      id: c.id,
      name: c.name,
    })),
  };
}

export function handleReorderCues(
  cueListId: string,
  cueIds: string[],
  cueManager: CueManager,
): { success: boolean; cueListId: string; newOrder: Array<{ position: number; id: string; name: string }> } {
  const updatedCueList = cueManager.reorderCues(cueListId, cueIds);

  return {
    success: true,
    cueListId: updatedCueList.id,
    newOrder: updatedCueList.cues.map((cue, index) => ({
      position: index + 1,
      id: cue.id,
      name: cue.name,
    })),
  };
}

export function handleListCueLists(
  cueManager: CueManager,
): { success: boolean; cueLists: Array<{ id: string; name: string; cueCount: number; loop: boolean }> } {
  const cueLists = cueManager.listCueLists();
  return {
    success: true,
    cueLists,
  };
}

export function handleDeleteCueList(
  id: string,
  cueManager: CueManager,
): { success: boolean; cueListId: string } {
  cueManager.deleteCueList(id);
  return {
    success: true,
    cueListId: id,
  };
}
