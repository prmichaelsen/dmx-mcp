import type { ChannelValues } from "../types/index.js";
import type { FixtureManager } from "../fixtures/manager.js";

export interface Scene {
  id: string;
  name: string;
  fixtureStates: Map<string, ChannelValues>;
  createdAt: Date;
  updatedAt: Date;
}

export interface SceneInfo {
  id: string;
  name: string;
  fixtureCount: number;
  createdAt: Date;
  updatedAt: Date;
}

export class SceneManager {
  private scenes = new Map<string, Scene>();
  private fixtureManager: FixtureManager;

  constructor(fixtureManager: FixtureManager) {
    this.fixtureManager = fixtureManager;
  }

  createScene(
    id: string,
    name: string,
    fixtureStates: Record<string, ChannelValues>,
  ): Scene {
    if (this.scenes.has(id)) {
      throw new Error(`Scene with ID "${id}" already exists`);
    }

    this.validateFixtureIds(Object.keys(fixtureStates));
    this.validateChannelValues(fixtureStates);

    const now = new Date();
    const scene: Scene = {
      id,
      name,
      fixtureStates: new Map(Object.entries(fixtureStates)),
      createdAt: now,
      updatedAt: now,
    };

    this.scenes.set(id, scene);
    return scene;
  }

  updateScene(
    id: string,
    fixtureStates: Record<string, ChannelValues>,
  ): Scene {
    const scene = this.scenes.get(id);
    if (!scene) {
      throw new Error(`Scene with ID "${id}" not found`);
    }

    this.validateFixtureIds(Object.keys(fixtureStates));
    this.validateChannelValues(fixtureStates);

    for (const [fixtureId, channels] of Object.entries(fixtureStates)) {
      const existingChannels = scene.fixtureStates.get(fixtureId) ?? {};
      scene.fixtureStates.set(fixtureId, {
        ...existingChannels,
        ...channels,
      });
    }

    scene.updatedAt = new Date();
    return scene;
  }

  deleteScene(id: string): void {
    if (!this.scenes.has(id)) {
      throw new Error(`Scene with ID "${id}" not found`);
    }
    this.scenes.delete(id);
  }

  getScene(id: string): Scene {
    const scene = this.scenes.get(id);
    if (!scene) {
      throw new Error(`Scene with ID "${id}" not found`);
    }
    return scene;
  }

  listScenes(): SceneInfo[] {
    return Array.from(this.scenes.values()).map((scene) => ({
      id: scene.id,
      name: scene.name,
      fixtureCount: scene.fixtureStates.size,
      createdAt: scene.createdAt,
      updatedAt: scene.updatedAt,
    }));
  }

  private validateFixtureIds(fixtureIds: string[]): void {
    const unknownIds: string[] = [];
    for (const fixtureId of fixtureIds) {
      if (!this.fixtureManager.getFixture(fixtureId)) {
        unknownIds.push(fixtureId);
      }
    }
    if (unknownIds.length > 0) {
      throw new Error(
        `Unknown fixture IDs: ${unknownIds.join(", ")}. ` +
          `Fixtures must be patched before they can be used in a scene.`,
      );
    }
  }

  private validateChannelValues(
    fixtureStates: Record<string, ChannelValues>,
  ): void {
    for (const [fixtureId, channels] of Object.entries(fixtureStates)) {
      for (const [channelName, value] of Object.entries(channels)) {
        if (!Number.isInteger(value) || value < 0 || value > 255) {
          throw new Error(
            `Invalid channel value for fixture "${fixtureId}", ` +
              `channel "${channelName}": ${value}. ` +
              `Values must be integers between 0 and 255.`,
          );
        }
      }
    }
  }
}
