# Task 15: Implement preview_scene Tool

**Milestone**: [M3 - Scene Programming](../../milestones/milestone-3-scene-programming.md)
**Estimated Time**: 1 hour
**Dependencies**: Task 14 (Scene-to-DMX mapping), Task 4 (OLA client)
**Status**: Not Started

---

## Objective

Implement the `preview_scene` MCP tool that outputs a scene to DMX in real-time through OLA. This is the first tool that sends actual DMX data to lighting hardware, making lights respond to agent commands.

---

## Context

The `preview_scene` tool is the culmination of the scene programming pipeline: the agent creates a scene (Task 13), the mapper converts it to DMX channel values (Task 14), and now this tool pushes those values to OLA so the physical lights change.

The flow is:
1. Agent calls `preview_scene` with a `scene_id`
2. Tool looks up the scene in SceneManager
3. Tool calls `sceneToDMX()` to convert fixture states to DMX arrays
4. For each universe in the result, tool calls `olaClient.setDMX(universe, channels)`
5. Tool returns a confirmation with a summary of what was sent

The OLA client (from Task 4) provides:
```typescript
class OLAClient {
  async setDMX(universe: number, channels: number[]): Promise<void>;
  async getDMX(universe: number): Promise<number[]>;
}
```

This tool will be registered as an MCP tool in Task 16 alongside the other scene tools.

---

## Steps

### 1. Create the Scene Tools File

Create `src/scenes/tools.ts`:

```bash
touch src/scenes/tools.ts
```

### 2. Implement the preview_scene Handler

The handler function takes a scene ID, resolves it to DMX data, and sends it to OLA:

```typescript
// src/scenes/tools.ts

import type { SceneManager, Scene, ChannelValues } from "./manager.js";
import type { OLAClient } from "../ola/client.js";
import type { FixtureManager } from "../fixtures/manager.js";
import { sceneToDMX } from "./dmx-mapper.js";

/**
 * Result returned by the preview_scene tool handler.
 */
export interface PreviewSceneResult {
  success: boolean;
  sceneId: string;
  sceneName: string;
  universeSummary: UniverseSummary[];
}

export interface UniverseSummary {
  universe: number;
  activeChannels: number;  // count of non-zero channels
  fixtureCount: number;    // number of fixtures mapped to this universe
}

/**
 * Handle the preview_scene tool call.
 *
 * Looks up the scene, converts it to DMX, and sends each universe
 * to OLA via setDMX.
 *
 * @param sceneId - The ID of the scene to preview
 * @param sceneManager - For looking up the scene
 * @param fixtureManager - For looking up fixture details during DMX mapping
 * @param olaClient - For sending DMX data to OLA
 * @returns Summary of what was sent
 * @throws If scene not found, fixture lookup fails, or OLA communication fails
 */
export async function handlePreviewScene(
  sceneId: string,
  sceneManager: SceneManager,
  fixtureManager: FixtureManager,
  olaClient: OLAClient
): Promise<PreviewSceneResult> {
  // 1. Look up the scene
  const scene: Scene = sceneManager.getScene(sceneId);

  // 2. Convert to DMX channel arrays per universe
  const dmxMap = sceneToDMX(scene, fixtureManager);

  // 3. Count fixtures per universe for the summary
  const fixturesPerUniverse = new Map<number, number>();
  for (const [fixtureId] of scene.fixtureStates) {
    const fixture = fixtureManager.getFixture(fixtureId);
    const count = fixturesPerUniverse.get(fixture.universe) ?? 0;
    fixturesPerUniverse.set(fixture.universe, count + 1);
  }

  // 4. Send DMX to OLA for each universe
  const universeSummary: UniverseSummary[] = [];

  for (const [universe, channels] of dmxMap) {
    await olaClient.setDMX(universe, channels);

    // Count non-zero channels for the summary
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

/**
 * Format the preview result as a human-readable text response
 * suitable for returning from an MCP tool.
 */
export function formatPreviewResult(result: PreviewSceneResult): string {
  const lines: string[] = [
    `Scene "${result.sceneName}" (${result.sceneId}) sent to DMX.`,
    "",
  ];

  for (const summary of result.universeSummary) {
    lines.push(
      `  Universe ${summary.universe}: ` +
      `${summary.fixtureCount} fixture(s), ` +
      `${summary.activeChannels} active channel(s)`
    );
  }

  return lines.join("\n");
}
```

### 3. Implement Additional Scene Tool Handlers

While the main focus of this task is `preview_scene`, add the handler functions for the other scene CRUD tools so they are available for registration in Task 16:

```typescript
// Add to src/scenes/tools.ts

/**
 * Handle the create_scene tool call.
 */
export function handleCreateScene(
  id: string,
  name: string,
  fixtureStates: Record<string, ChannelValues>,
  sceneManager: SceneManager
): { success: boolean; sceneId: string; sceneName: string; fixtureCount: number } {
  const scene = sceneManager.createScene(id, name, fixtureStates);
  return {
    success: true,
    sceneId: scene.id,
    sceneName: scene.name,
    fixtureCount: scene.fixtureStates.size,
  };
}

/**
 * Handle the update_scene tool call.
 */
export function handleUpdateScene(
  id: string,
  fixtureStates: Record<string, ChannelValues>,
  sceneManager: SceneManager
): { success: boolean; sceneId: string; sceneName: string; fixtureCount: number } {
  const scene = sceneManager.updateScene(id, fixtureStates);
  return {
    success: true,
    sceneId: scene.id,
    sceneName: scene.name,
    fixtureCount: scene.fixtureStates.size,
  };
}

/**
 * Handle the delete_scene tool call.
 */
export function handleDeleteScene(
  id: string,
  sceneManager: SceneManager
): { success: boolean; sceneId: string } {
  sceneManager.deleteScene(id);
  return {
    success: true,
    sceneId: id,
  };
}

/**
 * Handle the list_scenes tool call.
 */
export function handleListScenes(
  sceneManager: SceneManager
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
```

### 4. Update the Barrel Export

Update `src/scenes/index.ts` to include tool exports:

```typescript
// src/scenes/index.ts

export { SceneManager } from "./manager.js";
export type { Scene, SceneInfo, ChannelValues } from "./manager.js";
export { sceneToDMX } from "./dmx-mapper.js";
export type { DMXUniverseMap } from "./dmx-mapper.js";
export {
  handlePreviewScene,
  handleCreateScene,
  handleUpdateScene,
  handleDeleteScene,
  handleListScenes,
  formatPreviewResult,
} from "./tools.js";
export type { PreviewSceneResult, UniverseSummary } from "./tools.js";
```

### 5. Verify TypeScript Compilation

```bash
npx tsc --noEmit
```

---

## Verification

- [ ] File `src/scenes/tools.ts` exists and exports `handlePreviewScene`
- [ ] `handlePreviewScene()` calls `sceneManager.getScene()` with the provided scene ID
- [ ] `handlePreviewScene()` calls `sceneToDMX()` to convert scene to DMX arrays
- [ ] `handlePreviewScene()` calls `olaClient.setDMX()` for each universe in the DMX map
- [ ] `handlePreviewScene()` returns a result object with success, sceneId, sceneName, and universeSummary
- [ ] `universeSummary` includes the correct count of active (non-zero) channels per universe
- [ ] `universeSummary` includes the correct count of fixtures per universe
- [ ] `handlePreviewScene()` throws (propagates) errors if scene not found
- [ ] `handlePreviewScene()` throws (propagates) errors if OLA communication fails
- [ ] `formatPreviewResult()` returns a human-readable string summary
- [ ] CRUD handler functions (`handleCreateScene`, `handleUpdateScene`, `handleDeleteScene`, `handleListScenes`) are implemented
- [ ] `src/scenes/index.ts` re-exports all tool functions and types
- [ ] `npx tsc --noEmit` passes with no errors

---

## Notes

- The `handlePreviewScene` function is `async` because `olaClient.setDMX()` is asynchronous (it makes an HTTP POST to OLA). The CRUD handlers are synchronous since they only interact with in-memory state.
- If a scene spans multiple universes, `setDMX` is called once per universe. The calls are sequential (awaited one at a time) to avoid overwhelming OLA. If latency becomes an issue with many universes, these could be parallelized with `Promise.all()`.
- Error handling is intentionally simple: errors from `SceneManager`, `sceneToDMX`, and `OLAClient` are allowed to propagate. The MCP tool registration layer (Task 16) will catch these and format appropriate error responses for the agent.
- The `formatPreviewResult` helper is separated from the handler so the raw result object can be used in tests without parsing strings.
- This is the first tool that writes to real DMX hardware. For testing, the OLA client should be mocked (see Task 17).

---

**Next Task**: [Task 16: Register Scene MCP Tools](task-16-register-scene-mcp-tools.md)
**Related Design Docs**: [DMX Lighting MCP Design](../../design/local.dmx-lighting-mcp.md)
