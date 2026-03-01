# Task 13: Implement Scene Manager

**Milestone**: [M3 - Scene Programming](../../milestones/milestone-3-scene-programming.md)
**Estimated Time**: 1.5 hours
**Dependencies**: Task 3 (core interfaces), Task 8 (FixtureManager for validation)
**Status**: Not Started

---

## Objective

Create the `SceneManager` class with full CRUD operations for scenes. Scenes store snapshots of fixture states (channel name-value pairs per fixture), and the manager validates that referenced fixture IDs exist in the FixtureManager before storing them.

---

## Context

Scenes are the fundamental building block for lighting programming. A scene captures a "look" -- the colors, intensities, and positions of one or more fixtures at a moment in time. Each scene contains a `Map<string, ChannelValues>` mapping fixture IDs (e.g., `"par-1"`) to their channel values (e.g., `{ red: 255, green: 128, blue: 0 }`).

The SceneManager is responsible for creating, reading, updating, and deleting scenes. It depends on the FixtureManager to validate that fixture IDs referenced in a scene actually correspond to patched fixtures. This validation prevents scenes from referencing non-existent fixtures, which would cause errors during DMX output.

The `Scene` and `ChannelValues` types are defined in the core interfaces (Task 3):

```typescript
// From src/types/index.ts (Task 3)
type ChannelValues = Record<string, number>;  // channel name → value (0-255)

interface Scene {
  id: string;
  name: string;
  fixtureStates: Map<string, ChannelValues>;  // fixture ID → channel values
}
```

---

## Steps

### 1. Create the Scene Manager File

Create `src/scenes/manager.ts`:

```bash
mkdir -p src/scenes
touch src/scenes/manager.ts
```

### 2. Implement the SceneManager Class

The class maintains an in-memory `Map<string, Scene>` and accepts a reference to the `FixtureManager` for validation.

```typescript
// src/scenes/manager.ts

import type { FixtureManager } from "../fixtures/manager.js";

export type ChannelValues = Record<string, number>;

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
  private scenes: Map<string, Scene> = new Map();
  private fixtureManager: FixtureManager;

  constructor(fixtureManager: FixtureManager) {
    this.fixtureManager = fixtureManager;
  }

  /**
   * Create a new scene with the given fixture states.
   * Validates that all fixture IDs exist in the FixtureManager.
   * Throws if scene ID already exists or any fixture ID is unknown.
   */
  createScene(
    id: string,
    name: string,
    fixtureStates: Record<string, ChannelValues>
  ): Scene {
    if (this.scenes.has(id)) {
      throw new Error(`Scene with ID "${id}" already exists`);
    }

    // Validate all fixture IDs exist
    this.validateFixtureIds(Object.keys(fixtureStates));

    // Validate channel values are in range 0-255
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

  /**
   * Update an existing scene by merging new fixture states into it.
   * New fixture IDs are added; existing fixture IDs have their
   * channel values merged (not replaced entirely).
   * Throws if scene does not exist or any fixture ID is unknown.
   */
  updateScene(
    id: string,
    fixtureStates: Record<string, ChannelValues>
  ): Scene {
    const scene = this.scenes.get(id);
    if (!scene) {
      throw new Error(`Scene with ID "${id}" not found`);
    }

    // Validate all fixture IDs exist
    this.validateFixtureIds(Object.keys(fixtureStates));

    // Validate channel values are in range 0-255
    this.validateChannelValues(fixtureStates);

    // Merge new fixture states into existing scene
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

  /**
   * Delete a scene by ID.
   * Throws if scene does not exist.
   */
  deleteScene(id: string): void {
    if (!this.scenes.has(id)) {
      throw new Error(`Scene with ID "${id}" not found`);
    }
    this.scenes.delete(id);
  }

  /**
   * Get a scene by ID.
   * Throws if scene does not exist.
   */
  getScene(id: string): Scene {
    const scene = this.scenes.get(id);
    if (!scene) {
      throw new Error(`Scene with ID "${id}" not found`);
    }
    return scene;
  }

  /**
   * List all scenes with summary information.
   */
  listScenes(): SceneInfo[] {
    return Array.from(this.scenes.values()).map((scene) => ({
      id: scene.id,
      name: scene.name,
      fixtureCount: scene.fixtureStates.size,
      createdAt: scene.createdAt,
      updatedAt: scene.updatedAt,
    }));
  }

  /**
   * Validate that all fixture IDs exist in the FixtureManager.
   * Throws with a descriptive error listing all unknown IDs.
   */
  private validateFixtureIds(fixtureIds: string[]): void {
    const unknownIds: string[] = [];
    for (const fixtureId of fixtureIds) {
      try {
        this.fixtureManager.getFixture(fixtureId);
      } catch {
        unknownIds.push(fixtureId);
      }
    }
    if (unknownIds.length > 0) {
      throw new Error(
        `Unknown fixture IDs: ${unknownIds.join(", ")}. ` +
        `Fixtures must be patched before they can be used in a scene.`
      );
    }
  }

  /**
   * Validate that all channel values are integers in the range 0-255.
   */
  private validateChannelValues(
    fixtureStates: Record<string, ChannelValues>
  ): void {
    for (const [fixtureId, channels] of Object.entries(fixtureStates)) {
      for (const [channelName, value] of Object.entries(channels)) {
        if (!Number.isInteger(value) || value < 0 || value > 255) {
          throw new Error(
            `Invalid channel value for fixture "${fixtureId}", ` +
            `channel "${channelName}": ${value}. ` +
            `Values must be integers between 0 and 255.`
          );
        }
      }
    }
  }
}
```

### 3. Create the Barrel Export

Create `src/scenes/index.ts` to re-export the scene module:

```typescript
// src/scenes/index.ts

export { SceneManager } from "./manager.js";
export type { Scene, SceneInfo, ChannelValues } from "./manager.js";
```

### 4. Verify TypeScript Compilation

Run the type checker to ensure there are no compilation errors:

```bash
npx tsc --noEmit
```

---

## Verification

- [ ] File `src/scenes/manager.ts` exists and exports the `SceneManager` class
- [ ] `createScene()` stores a scene with fixture states in the internal Map
- [ ] `createScene()` throws if the scene ID already exists
- [ ] `createScene()` throws if any fixture ID is not found in FixtureManager
- [ ] `createScene()` throws if any channel value is outside 0-255
- [ ] `updateScene()` merges new channel values into existing fixture states
- [ ] `updateScene()` adds new fixture IDs to the scene
- [ ] `updateScene()` throws if the scene ID does not exist
- [ ] `deleteScene()` removes the scene from the Map
- [ ] `deleteScene()` throws if the scene ID does not exist
- [ ] `getScene()` returns the full scene object
- [ ] `getScene()` throws if the scene ID does not exist
- [ ] `listScenes()` returns an array of SceneInfo summaries for all scenes
- [ ] `src/scenes/index.ts` barrel export exists
- [ ] `npx tsc --noEmit` passes with no errors

---

## Notes

- The `fixtureStates` parameter in `createScene` and `updateScene` uses `Record<string, ChannelValues>` (a plain object) rather than `Map` for ease of use from MCP tool handlers, which receive JSON input. Internally the SceneManager converts this to a `Map<string, ChannelValues>`.
- The `updateScene` method uses a merge strategy: existing channel values for a fixture are preserved, and only the channels specified in the update are overwritten. This allows updating a single channel (e.g., just `{ red: 200 }`) without losing other channels (green, blue) that were set previously.
- No persistence is implemented in this task. Scenes are stored in memory and lost when the server restarts. Persistence is handled in Milestone 6 (Show Management).
- The `FixtureManager.getFixture()` method is expected to throw if the fixture ID does not exist. The SceneManager catches these errors to collect all invalid IDs before throwing a single descriptive error.

---

**Next Task**: [Task 14: Implement Scene-to-DMX Channel Mapping](task-14-scene-dmx-mapping.md)
**Related Design Docs**: [DMX Lighting MCP Design](../../design/local.dmx-lighting-mcp.md)
