# Task 18: Implement CueList and Cue Data Management

**Milestone**: [M4 - Cue Management & Fade Engine](../../milestones/milestone-4-cue-management-fade-engine.md)
**Estimated Time**: 1 hour
**Dependencies**: Task 3 (core interfaces)
**Status**: Not Started

---

## Objective

Create the `CueManager` class with full CRUD operations for cue lists and cues. The manager handles creating, reading, listing, and deleting cue lists, as well as adding, removing, and reordering cues within a list. It validates that scene references exist via the `SceneManager` before storing cues.

---

## Context

Cue lists are ordered sequences of cues that form a programmed lighting sequence. Each cue references a scene ID and defines timing parameters: `fadeInMs` (how long to transition into the scene), `holdMs` (how long to hold at the scene before proceeding), and `fadeOutMs` (how long to fade out before the next cue begins). Cue lists can optionally loop back to the first cue after the last one completes.

The `CueList` and `Cue` types are already defined in the core interfaces (Task 3):

```typescript
// From src/types/index.ts (Task 3)
interface Cue {
  id: string;
  name: string;
  scene: string;       // scene ID
  fadeInMs: number;
  holdMs: number;
  fadeOutMs: number;
}

interface CueList {
  id: string;
  name: string;
  cues: Cue[];
  loop: boolean;
}
```

The `CueManager` depends on the `SceneManager` to validate that cue scene references point to existing scenes. This prevents cues from referencing non-existent scenes, which would cause errors during playback. This follows the same validation pattern used by `SceneManager` validating fixture references through `FixtureManager` (Task 13).

---

## Steps

### 1. Create the Cue Manager File

Create `src/cues/manager.ts`:

```bash
mkdir -p src/cues
touch src/cues/manager.ts
```

### 2. Implement the CueManager Class

The class maintains an in-memory `Map<string, CueList>` and accepts a reference to the `SceneManager` for scene validation.

```typescript
// src/cues/manager.ts

import type { SceneManager } from "../scenes/manager.js";
import type { Cue, CueList } from "../types/index.js";

export interface CueListInfo {
  id: string;
  name: string;
  cueCount: number;
  loop: boolean;
}

export class CueManager {
  private cueLists: Map<string, CueList> = new Map();
  private sceneManager: SceneManager;

  constructor(sceneManager: SceneManager) {
    this.sceneManager = sceneManager;
  }

  // -----------------------------------------------------------------------
  // CueList CRUD
  // -----------------------------------------------------------------------

  /**
   * Create a new cue list.
   * Throws if a cue list with the given ID already exists.
   *
   * @param id - Unique identifier for the cue list
   * @param name - Human-readable name
   * @param loop - Whether the cue list loops after the last cue (default: false)
   */
  createCueList(id: string, name: string, loop: boolean = false): CueList {
    if (this.cueLists.has(id)) {
      throw new Error(`Cue list with ID "${id}" already exists`);
    }

    const cueList: CueList = {
      id,
      name,
      cues: [],
      loop,
    };

    this.cueLists.set(id, cueList);
    return cueList;
  }

  /**
   * Get a cue list by ID.
   * Throws if the cue list does not exist.
   */
  getCueList(id: string): CueList {
    const cueList = this.cueLists.get(id);
    if (!cueList) {
      throw new Error(`Cue list with ID "${id}" not found`);
    }
    return cueList;
  }

  /**
   * List all cue lists with summary information.
   */
  listCueLists(): CueListInfo[] {
    return Array.from(this.cueLists.values()).map((cueList) => ({
      id: cueList.id,
      name: cueList.name,
      cueCount: cueList.cues.length,
      loop: cueList.loop,
    }));
  }

  /**
   * Delete a cue list by ID.
   * Throws if the cue list does not exist.
   */
  deleteCueList(id: string): void {
    if (!this.cueLists.has(id)) {
      throw new Error(`Cue list with ID "${id}" not found`);
    }
    this.cueLists.delete(id);
  }

  // -----------------------------------------------------------------------
  // Cue Management within a CueList
  // -----------------------------------------------------------------------

  /**
   * Add a cue to the end of a cue list.
   * Validates that the cue's scene reference exists in the SceneManager.
   * Throws if the cue list does not exist, the scene does not exist,
   * or a cue with the same ID already exists in the list.
   *
   * @param cueListId - ID of the cue list to add the cue to
   * @param cue - The cue to add
   */
  addCue(cueListId: string, cue: Cue): CueList {
    const cueList = this.getCueList(cueListId);

    // Validate scene reference exists
    this.validateSceneReference(cue.scene);

    // Check for duplicate cue ID within this list
    const existingCue = cueList.cues.find((c) => c.id === cue.id);
    if (existingCue) {
      throw new Error(
        `Cue with ID "${cue.id}" already exists in cue list "${cueListId}"`
      );
    }

    // Validate timing values are non-negative
    this.validateTimingValues(cue);

    cueList.cues.push(cue);
    return cueList;
  }

  /**
   * Remove a cue from a cue list by cue ID.
   * Throws if the cue list or cue does not exist.
   *
   * @param cueListId - ID of the cue list
   * @param cueId - ID of the cue to remove
   */
  removeCue(cueListId: string, cueId: string): CueList {
    const cueList = this.getCueList(cueListId);

    const cueIndex = cueList.cues.findIndex((c) => c.id === cueId);
    if (cueIndex === -1) {
      throw new Error(
        `Cue with ID "${cueId}" not found in cue list "${cueListId}"`
      );
    }

    cueList.cues.splice(cueIndex, 1);
    return cueList;
  }

  /**
   * Reorder cues within a cue list.
   * The provided cue IDs array defines the new order.
   * Throws if any cue ID is missing, duplicated, or not found in the list.
   *
   * @param cueListId - ID of the cue list
   * @param cueIds - Array of cue IDs in the desired new order
   */
  reorderCues(cueListId: string, cueIds: string[]): CueList {
    const cueList = this.getCueList(cueListId);

    // Validate that cueIds contains exactly the same IDs as the current list
    const existingIds = new Set(cueList.cues.map((c) => c.id));
    const newIds = new Set(cueIds);

    // Check for duplicates in the input
    if (cueIds.length !== newIds.size) {
      throw new Error(
        `Duplicate cue IDs in reorder request. Each cue ID must appear exactly once.`
      );
    }

    // Check for missing IDs
    for (const existingId of existingIds) {
      if (!newIds.has(existingId)) {
        throw new Error(
          `Cue ID "${existingId}" exists in the list but is missing from the reorder request. ` +
          `All cue IDs must be included.`
        );
      }
    }

    // Check for unknown IDs
    for (const newId of newIds) {
      if (!existingIds.has(newId)) {
        throw new Error(
          `Cue ID "${newId}" is not in cue list "${cueListId}". ` +
          `Only existing cue IDs can be used in a reorder.`
        );
      }
    }

    // Build the reordered cue array
    const cueMap = new Map(cueList.cues.map((c) => [c.id, c]));
    cueList.cues = cueIds.map((id) => cueMap.get(id)!);

    return cueList;
  }

  // -----------------------------------------------------------------------
  // Validation Helpers
  // -----------------------------------------------------------------------

  /**
   * Validate that a scene ID exists in the SceneManager.
   * Throws with a descriptive error if the scene is not found.
   */
  private validateSceneReference(sceneId: string): void {
    try {
      this.sceneManager.getScene(sceneId);
    } catch {
      throw new Error(
        `Scene with ID "${sceneId}" not found. ` +
        `Scenes must be created before they can be referenced in a cue.`
      );
    }
  }

  /**
   * Validate that cue timing values are non-negative integers.
   */
  private validateTimingValues(cue: Cue): void {
    if (cue.fadeInMs < 0 || !Number.isFinite(cue.fadeInMs)) {
      throw new Error(
        `Invalid fadeInMs value: ${cue.fadeInMs}. Must be a non-negative number.`
      );
    }
    if (cue.holdMs < 0 || !Number.isFinite(cue.holdMs)) {
      throw new Error(
        `Invalid holdMs value: ${cue.holdMs}. Must be a non-negative number.`
      );
    }
    if (cue.fadeOutMs < 0 || !Number.isFinite(cue.fadeOutMs)) {
      throw new Error(
        `Invalid fadeOutMs value: ${cue.fadeOutMs}. Must be a non-negative number.`
      );
    }
  }
}
```

### 3. Create the Barrel Export

Create `src/cues/index.ts` to re-export the cue module:

```typescript
// src/cues/index.ts

export { CueManager } from "./manager.js";
export type { CueListInfo } from "./manager.js";
```

### 4. Verify TypeScript Compilation

Run the type checker to ensure there are no compilation errors:

```bash
npx tsc --noEmit
```

---

## Verification

- [ ] File `src/cues/manager.ts` exists and exports the `CueManager` class
- [ ] `CueManager` constructor accepts a `SceneManager` reference
- [ ] `createCueList()` stores a cue list with an empty cues array in the internal Map
- [ ] `createCueList()` throws if the cue list ID already exists
- [ ] `createCueList()` defaults `loop` to `false` when not specified
- [ ] `getCueList()` returns the full cue list object
- [ ] `getCueList()` throws if the cue list ID does not exist
- [ ] `listCueLists()` returns an array of `CueListInfo` summaries for all cue lists
- [ ] `deleteCueList()` removes the cue list from the Map
- [ ] `deleteCueList()` throws if the cue list ID does not exist
- [ ] `addCue()` appends a cue to the end of the cue list's cues array
- [ ] `addCue()` throws if the referenced scene does not exist in SceneManager
- [ ] `addCue()` throws if a cue with the same ID already exists in the list
- [ ] `addCue()` throws if timing values are negative
- [ ] `removeCue()` removes a cue from the list by ID
- [ ] `removeCue()` throws if the cue ID is not found in the list
- [ ] `reorderCues()` rearranges cues to match the provided ID order
- [ ] `reorderCues()` throws if cue IDs contain duplicates
- [ ] `reorderCues()` throws if any existing cue ID is missing from the input
- [ ] `reorderCues()` throws if any unknown cue ID is provided
- [ ] `src/cues/index.ts` barrel export exists
- [ ] `npx tsc --noEmit` passes with no errors

---

## Notes

- The `CueManager` stores cue lists in memory and state is lost on server restart. Persistence is handled in Milestone 6 (Show Management).
- The `addCue` method accepts a full `Cue` object (from `src/types/index.ts`) rather than individual parameters. This keeps the API simple and matches the data model directly. The MCP tool handler (Task 20) will construct the `Cue` object from the tool's input parameters.
- The `reorderCues` method requires that the provided `cueIds` array contains exactly the same set of IDs as the current cue list -- no more, no less. This prevents accidental data loss (dropping a cue) or invalid state (referencing a non-existent cue).
- Scene validation in `addCue` catches errors from `SceneManager.getScene()` and re-throws with a more descriptive message, following the same pattern used by `SceneManager.validateFixtureIds()` in Task 13.
- Timing values (`fadeInMs`, `holdMs`, `fadeOutMs`) are validated to be non-negative but are not required to be integers. Fractional millisecond values are allowed since `setTimeout` and `performance.now()` work with sub-millisecond precision.

---

**Next Task**: [Task 19: Implement Fade Engine](task-19-fade-engine.md)
**Related Design Docs**: [DMX Lighting MCP Design](../../design/local.dmx-lighting-mcp.md)
