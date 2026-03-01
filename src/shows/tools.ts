import type { FixtureManager } from "../fixtures/manager.js";
import type { SceneManager } from "../scenes/manager.js";
import type { CueManager } from "../cues/manager.js";
import type { ShowStorage } from "./storage.js";
import type { ShowMetadata } from "./storage.js";
import type { Show, Scene, ChannelValues } from "../types/index.js";

export interface ShowToolDependencies {
  fixtureManager: FixtureManager;
  sceneManager: SceneManager;
  cueManager: CueManager;
  showStorage: ShowStorage;
}

export interface SaveShowParams {
  id: string;
  name: string;
}

export interface SaveShowResult {
  success: boolean;
  message: string;
  showId?: string;
}

export async function handleSaveShow(
  params: SaveShowParams,
  deps: ShowToolDependencies,
): Promise<SaveShowResult> {
  const { id, name } = params;
  const { fixtureManager, sceneManager, cueManager, showStorage } = deps;

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

  const fixtures = fixtureManager.listFixtures();

  // Convert SceneManager's Map-based scenes to Record-based Show scenes
  const sceneInfos = sceneManager.listScenes();
  const scenes: Scene[] = sceneInfos.map((info) => {
    const scene = sceneManager.getScene(info.id);
    const fixtureStates: Record<string, ChannelValues> = {};
    for (const [fixtureId, values] of scene.fixtureStates) {
      fixtureStates[fixtureId] = values;
    }
    return { id: scene.id, name: scene.name, fixtureStates };
  });

  const cueListInfos = cueManager.listCueLists();
  const cueLists = cueListInfos.map((info) => cueManager.getCueList(info.id));

  const show: Show = {
    id: id.trim(),
    name: name.trim(),
    fixtures,
    scenes,
    cueLists,
  };

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

export interface LoadShowParams {
  id: string;
}

export interface LoadShowResult {
  success: boolean;
  message: string;
  showId?: string;
  showName?: string;
}

export async function handleLoadShow(
  params: LoadShowParams,
  deps: ShowToolDependencies,
): Promise<LoadShowResult> {
  const { id } = params;
  const { fixtureManager, sceneManager, cueManager, showStorage } = deps;

  if (!id || typeof id !== "string" || id.trim().length === 0) {
    return {
      success: false,
      message: "Show ID is required and must be a non-empty string.",
    };
  }

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

  const errors: string[] = [];

  // Restore fixtures
  for (const fixture of show.fixtures) {
    try {
      fixtureManager.patchFixture({
        id: fixture.id,
        name: fixture.name,
        profileId: fixture.profileId,
        universe: fixture.universe,
        startAddress: fixture.startAddress,
        mode: fixture.mode,
      });
    } catch (error) {
      errors.push(
        `Fixture "${fixture.id}": ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  // Restore scenes
  for (const scene of show.scenes) {
    try {
      sceneManager.createScene(scene.id, scene.name, scene.fixtureStates);
    } catch (error) {
      errors.push(
        `Scene "${scene.id}": ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  // Restore cue lists
  for (const cueList of show.cueLists) {
    try {
      cueManager.createCueList(cueList.id, cueList.name, cueList.loop);
      for (const cue of cueList.cues) {
        cueManager.addCue(cueList.id, cue);
      }
    } catch (error) {
      errors.push(
        `CueList "${cueList.id}": ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  if (errors.length > 0) {
    return {
      success: true,
      message:
        `Show "${show.name}" loaded with warnings:\n` +
        errors.map((e) => `  - ${e}`).join("\n"),
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

export interface ListShowsResult {
  success: boolean;
  shows: ShowMetadata[];
  message: string;
}

export async function handleListShows(
  deps: ShowToolDependencies,
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
