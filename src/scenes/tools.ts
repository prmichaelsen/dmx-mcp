import type { ChannelValues } from "../types/index.js";
import type { SceneManager, Scene } from "./manager.js";
import type { OLAClient } from "../ola/client.js";
import type { FixtureManager } from "../fixtures/manager.js";
import { sceneToDMX } from "./dmx-mapper.js";

export interface PreviewSceneResult {
  success: boolean;
  sceneId: string;
  sceneName: string;
  universeSummary: UniverseSummary[];
}

export interface UniverseSummary {
  universe: number;
  activeChannels: number;
  fixtureCount: number;
}

export async function handlePreviewScene(
  sceneId: string,
  sceneManager: SceneManager,
  fixtureManager: FixtureManager,
  olaClient: OLAClient,
): Promise<PreviewSceneResult> {
  const scene: Scene = sceneManager.getScene(sceneId);
  const dmxMap = sceneToDMX(scene, fixtureManager);

  const fixturesPerUniverse = new Map<number, number>();
  for (const [fixtureId] of scene.fixtureStates) {
    const fixture = fixtureManager.getFixture(fixtureId);
    if (fixture) {
      const count = fixturesPerUniverse.get(fixture.universe) ?? 0;
      fixturesPerUniverse.set(fixture.universe, count + 1);
    }
  }

  const universeSummary: UniverseSummary[] = [];

  for (const [universe, channels] of dmxMap) {
    await olaClient.setDMX(universe, channels);

    const activeChannels = channels.filter((v) => v !== 0).length;

    universeSummary.push({
      universe,
      activeChannels,
      fixtureCount: fixturesPerUniverse.get(universe) ?? 0,
    });
  }

  return {
    success: true,
    sceneId: scene.id,
    sceneName: scene.name,
    universeSummary,
  };
}

export function formatPreviewResult(result: PreviewSceneResult): string {
  const lines: string[] = [
    `Scene "${result.sceneName}" (${result.sceneId}) sent to DMX.`,
    "",
  ];

  for (const summary of result.universeSummary) {
    lines.push(
      `  Universe ${summary.universe}: ` +
        `${summary.fixtureCount} fixture(s), ` +
        `${summary.activeChannels} active channel(s)`,
    );
  }

  return lines.join("\n");
}

export function handleCreateScene(
  id: string,
  name: string,
  fixtureStates: Record<string, ChannelValues>,
  sceneManager: SceneManager,
): { success: boolean; sceneId: string; sceneName: string; fixtureCount: number } {
  const scene = sceneManager.createScene(id, name, fixtureStates);
  return {
    success: true,
    sceneId: scene.id,
    sceneName: scene.name,
    fixtureCount: scene.fixtureStates.size,
  };
}

export function handleUpdateScene(
  id: string,
  fixtureStates: Record<string, ChannelValues>,
  sceneManager: SceneManager,
): { success: boolean; sceneId: string; sceneName: string; fixtureCount: number } {
  const scene = sceneManager.updateScene(id, fixtureStates);
  return {
    success: true,
    sceneId: scene.id,
    sceneName: scene.name,
    fixtureCount: scene.fixtureStates.size,
  };
}

export function handleDeleteScene(
  id: string,
  sceneManager: SceneManager,
): { success: boolean; sceneId: string } {
  sceneManager.deleteScene(id);
  return {
    success: true,
    sceneId: id,
  };
}

export function handleListScenes(
  sceneManager: SceneManager,
): { success: boolean; scenes: Array<{ id: string; name: string; fixtureCount: number }> } {
  const scenes = sceneManager.listScenes();
  return {
    success: true,
    scenes: scenes.map((s) => ({
      id: s.id,
      name: s.name,
      fixtureCount: s.fixtureCount,
    })),
  };
}
