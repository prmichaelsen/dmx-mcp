# Task 31: Implement Show Management Tools

**Milestone**: [M6 - Show Management & Effects](../../milestones/milestone-6-show-management-effects.md)
**Estimated Time**: 1.5 hours
**Dependencies**: Task 30 (ShowStorage), Task 8 (FixtureManager), Task 13 (SceneManager), Task 18 (CueManager)
**Status**: Not Started

---

## Objective

Implement `save_show`, `load_show`, and `list_shows` MCP tool handlers that capture the current server state into a Show object, persist it to disk, restore state from a saved show, and browse available shows.

---

## Context

The show management tools bridge the in-memory server state (all patched fixtures, created scenes, and built cue lists) with the persistent `ShowStorage` layer. `save_show` snapshots everything into a `Show` object and writes it to `~/.dmx-lighting-mcp/shows/{id}.json`. `load_show` reads a saved show and repopulates the FixtureManager, SceneManager, and CueManager -- replacing all current state. `list_shows` provides a way to browse what shows are available on disk.

The tool handlers need references to all three managers (FixtureManager, SceneManager, CueManager) to collect state on save and restore state on load. On load, existing state is cleared first to avoid conflicts (e.g., duplicate fixture IDs, overlapping DMX addresses).

---

## Steps

### 1. Create the Show Tools Module

```bash
touch src/shows/tools.ts
```

### 2. Implement the save_show Handler

The `save_show` tool collects all current state from the three managers and persists it via ShowStorage.

```typescript
// src/shows/tools.ts

import type { FixtureManager } from "../fixtures/manager.js";
import type { SceneManager, Scene } from "../scenes/manager.js";
import type { CueManager } from "../cues/manager.js";
import type { ShowStorage } from "./storage.js";
import type { Show } from "../types/index.js";

export interface ShowToolDependencies {
  fixtureManager: FixtureManager;
  sceneManager: SceneManager;
  cueManager: CueManager;
  showStorage: ShowStorage;
}

export interface SaveShowParams {
  /** Unique ID for the show (used as filename) */
  id: string;
  /** Human-readable name for the show */
  name: string;
}

export interface SaveShowResult {
  success: boolean;
  message: string;
  showId?: string;
}

/**
 * Save the current server state as a show.
 *
 * Collects all fixtures from FixtureManager, all scenes from SceneManager,
 * and all cue lists from CueManager. Bundles them into a Show object and
 * persists to disk via ShowStorage.
 */
export async function handleSaveShow(
  params: SaveShowParams,
  deps: ShowToolDependencies
): Promise<SaveShowResult> {
  const { id, name } = params;
  const { fixtureManager, sceneManager, cueManager, showStorage } = deps;

  // Validate inputs
  if (!id || typeof id !== "string" || id.trim().length === 0) {
    return {
      success: false,
      message: "Show ID is required and must be a non-empty string.",
    };
  }

  if (!name || typeof name !== "string" || name.trim().length === 0) {
    return {
      success: false,
      message: "Show name is required and must be a non-empty string.",
    };
  }

  // Collect current state from all managers
  const fixtures = fixtureManager.listFixtures();
  const sceneInfos = sceneManager.listScenes();
  const scenes: Scene[] = sceneInfos.map((info) =>
    sceneManager.getScene(info.id)
  );
  const cueListInfos = cueManager.listCueLists();
  const cueLists = cueListInfos.map((info) =>
    cueManager.getCueList(info.id)
  );

  // Build the Show object
  const show: Show = {
    id: id.trim(),
    name: name.trim(),
    fixtures,
    scenes,
    cueLists,
  };

  // Persist to disk
  try {
    await showStorage.saveShow(show);
  } catch (error) {
    return {
      success: false,
      message: `Failed to save show: ${error instanceof Error ? error.message : String(error)}`,
    };
  }

  return {
    success: true,
    message:
      `Show "${show.name}" saved with ${fixtures.length} fixtures, ` +
      `${scenes.length} scenes, and ${cueLists.length} cue lists.`,
    showId: show.id,
  };
}
```

### 3. Implement the load_show Handler

The `load_show` tool reads a saved show from disk and repopulates all managers, clearing existing state first.

```typescript
// Continued in src/shows/tools.ts

export interface LoadShowParams {
  /** ID of the show to load */
  id: string;
}

export interface LoadShowResult {
  success: boolean;
  message: string;
  showId?: string;
  showName?: string;
}

/**
 * Load a show from disk and restore all server state.
 *
 * Clears all current fixtures, scenes, and cue lists, then repopulates
 * from the saved show. This is a destructive operation -- any unsaved
 * state is lost.
 */
export async function handleLoadShow(
  params: LoadShowParams,
  deps: ShowToolDependencies
): Promise<LoadShowResult> {
  const { id } = params;
  const { fixtureManager, sceneManager, cueManager, showStorage } = deps;

  if (!id || typeof id !== "string" || id.trim().length === 0) {
    return {
      success: false,
      message: "Show ID is required and must be a non-empty string.",
    };
  }

  // Load show from disk
  let show: Show;
  try {
    show = await showStorage.loadShow(id.trim());
  } catch (error) {
    return {
      success: false,
      message: `Failed to load show: ${error instanceof Error ? error.message : String(error)}`,
    };
  }

  // Clear all existing state
  fixtureManager.clear();
  sceneManager.clear();
  cueManager.clear();

  // Restore fixtures
  const fixtureErrors: string[] = [];
  for (const fixture of show.fixtures) {
    const result = fixtureManager.patchFixture({
      id: fixture.id,
      name: fixture.name,
      profile: fixture.profile,
      universe: fixture.universe,
      startAddress: fixture.startAddress,
    });
    if (!result.success) {
      fixtureErrors.push(
        `Fixture "${fixture.id}": ${result.error}`
      );
    }
  }

  // Restore scenes
  const sceneErrors: string[] = [];
  for (const scene of show.scenes) {
    try {
      // Convert Map back to Record for the createScene API
      const fixtureStates: Record<string, Record<string, number>> = {};
      for (const [fixtureId, values] of scene.fixtureStates) {
        fixtureStates[fixtureId] = values;
      }
      sceneManager.createScene(scene.id, scene.name, fixtureStates);
    } catch (error) {
      sceneErrors.push(
        `Scene "${scene.id}": ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  // Restore cue lists
  const cueListErrors: string[] = [];
  for (const cueList of show.cueLists) {
    try {
      cueManager.createCueList(cueList.id, cueList.name, cueList.loop);
      for (const cue of cueList.cues) {
        cueManager.addCue(cueList.id, {
          id: cue.id,
          name: cue.name,
          scene: cue.scene,
          fadeInMs: cue.fadeInMs,
          holdMs: cue.holdMs,
          fadeOutMs: cue.fadeOutMs,
        });
      }
    } catch (error) {
      cueListErrors.push(
        `CueList "${cueList.id}": ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  // Build result message
  const allErrors = [
    ...fixtureErrors,
    ...sceneErrors,
    ...cueListErrors,
  ];

  if (allErrors.length > 0) {
    return {
      success: true,
      message:
        `Show "${show.name}" loaded with warnings:\n` +
        allErrors.map((e) => `  - ${e}`).join("\n"),
      showId: show.id,
      showName: show.name,
    };
  }

  return {
    success: true,
    message:
      `Show "${show.name}" loaded: ${show.fixtures.length} fixtures, ` +
      `${show.scenes.length} scenes, ${show.cueLists.length} cue lists.`,
    showId: show.id,
    showName: show.name,
  };
}
```

### 4. Implement the list_shows Handler

```typescript
// Continued in src/shows/tools.ts

import type { ShowMetadata } from "./storage.js";

export interface ListShowsResult {
  success: boolean;
  shows: ShowMetadata[];
  message: string;
}

/**
 * List all saved shows from disk.
 *
 * Returns metadata (id, name, fixture/scene/cueList counts) for
 * each show in the storage directory.
 */
export async function handleListShows(
  deps: ShowToolDependencies
): Promise<ListShowsResult> {
  const { showStorage } = deps;

  let shows: ShowMetadata[];
  try {
    shows = await showStorage.listShows();
  } catch (error) {
    return {
      success: false,
      shows: [],
      message: `Failed to list shows: ${error instanceof Error ? error.message : String(error)}`,
    };
  }

  if (shows.length === 0) {
    return {
      success: true,
      shows: [],
      message: "No saved shows found.",
    };
  }

  return {
    success: true,
    shows,
    message: `Found ${shows.length} saved show(s).`,
  };
}
```

### 5. Add clear() Methods to SceneManager and CueManager

The `load_show` handler needs to clear existing state before restoring. If the `SceneManager` and `CueManager` do not already have a `clear()` method (like `FixtureManager` does), add them:

```typescript
// In src/scenes/manager.ts -- add to SceneManager class:
clear(): void {
  this.scenes.clear();
}

// In src/cues/manager.ts -- add to CueManager class:
clear(): void {
  this.cueLists.clear();
}
```

### 6. Update the Barrel Export

```typescript
// src/shows/index.ts

export { ShowStorage } from "./storage.js";
export type { ShowMetadata } from "./storage.js";
export {
  handleSaveShow,
  handleLoadShow,
  handleListShows,
} from "./tools.js";
export type {
  ShowToolDependencies,
  SaveShowParams,
  SaveShowResult,
  LoadShowParams,
  LoadShowResult,
  ListShowsResult,
} from "./tools.js";
```

### 7. Verify TypeScript Compilation

```bash
npx tsc --noEmit
```

---

## Verification

- [ ] `src/shows/tools.ts` exists and exports `handleSaveShow`, `handleLoadShow`, `handleListShows`
- [ ] `save_show` collects all fixtures from FixtureManager
- [ ] `save_show` collects all scenes from SceneManager (with fixtureStates Maps)
- [ ] `save_show` collects all cue lists from CueManager (with their cues)
- [ ] `save_show` bundles everything into a Show object and passes to ShowStorage.saveShow()
- [ ] `save_show` validates that `id` and `name` are non-empty strings
- [ ] `save_show` returns a descriptive success message with counts
- [ ] `load_show` calls ShowStorage.loadShow() to read from disk
- [ ] `load_show` clears FixtureManager, SceneManager, CueManager before restoring
- [ ] `load_show` re-patches all fixtures via FixtureManager.patchFixture()
- [ ] `load_show` re-creates all scenes via SceneManager.createScene()
- [ ] `load_show` re-creates all cue lists and their cues via CueManager
- [ ] `load_show` reports errors (e.g., fixture collision) as warnings without aborting
- [ ] `list_shows` returns ShowMetadata[] from ShowStorage.listShows()
- [ ] `list_shows` returns an empty array with a descriptive message if no shows exist
- [ ] SceneManager.clear() and CueManager.clear() methods exist
- [ ] `npx tsc --noEmit` passes with zero errors

---

## Notes

- `load_show` uses a "clear and replace" strategy rather than a "merge" strategy. All existing state is wiped before the saved show is restored. This avoids complex conflict resolution (e.g., what happens if a loaded fixture ID already exists). The trade-off is that any unsaved state is lost. The user should be advised to save before loading.
- The `load_show` handler collects errors during restoration (e.g., a fixture that fails to patch) but continues loading the rest of the show. This graceful degradation is important -- a single corrupt fixture should not prevent the rest of the show from loading.
- The `handleSaveShow` function converts `SceneManager`'s in-memory scenes (which use `Map<string, ChannelValues>`) directly into the Show's `scenes` array. The `ShowStorage.saveShow()` handles the Map-to-object conversion during JSON serialization.
- The `CueManager` API shape (createCueList, addCue, listCueLists, getCueList) is assumed to follow the same pattern as FixtureManager and SceneManager. If the actual API differs, the handler code should be adjusted accordingly.
- `list_shows` does not load full shows into memory -- it uses `ShowStorage.listShows()` which only reads enough of each file to extract metadata.

---

**Next Task**: [Task 32: Implement Effect Engine Base](task-32-effect-engine-base.md)
**Related Design Docs**: [DMX Lighting MCP Design](../../design/local.dmx-lighting-mcp.md)
