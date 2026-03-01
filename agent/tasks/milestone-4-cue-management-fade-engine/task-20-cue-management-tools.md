# Task 20: Implement Cue Management Tools

**Milestone**: [M4 - Cue Management & Fade Engine](../../milestones/milestone-4-cue-management-fade-engine.md)
**Estimated Time**: 1.5 hours
**Dependencies**: Task 18 (CueManager)
**Status**: Not Started

---

## Objective

Implement MCP tool handler functions for `create_cue_list`, `add_cue`, and `remove_cue`. These tools allow an AI agent to create cue sequences and manage cues within them through the MCP protocol.

---

## Context

The cue management tools follow the same pattern established by the fixture tools (Task 10) and scene tools (Task 15/16). Each tool has:
1. A **schema definition** (name, description, JSON Schema for input)
2. A **handler function** that executes the operation via the `CueManager`
3. A **response** returned in the MCP content format

The three tools in this task cover the core cue list operations:
- `create_cue_list` -- Creates a new, empty cue list with optional loop setting
- `add_cue` -- Adds a cue to an existing cue list with scene reference and timing
- `remove_cue` -- Removes a cue from a cue list by cue ID

The `reorder_cues` tool is implemented separately in Task 21 to keep each task focused.

The `CueManager` from Task 18 provides all the underlying logic. These tool handlers are thin wrappers that:
1. Extract parameters from the MCP tool arguments
2. Call the appropriate `CueManager` method
3. Format the result (or error) for the MCP response

---

## Steps

### 1. Create the Cue Tools File

Create `src/cues/tools.ts`:

```bash
touch src/cues/tools.ts
```

### 2. Define Tool Schemas

Define the input schemas for the three cue management tools:

```typescript
// src/cues/tools.ts

import type { CueManager } from "./manager.js";
import type { Cue } from "../types/index.js";

// ── Tool Schema Definitions ─────────────────────────────────────────────

export const CREATE_CUE_LIST_TOOL = {
  name: "create_cue_list",
  description:
    "Create a new cue list (an ordered sequence of cues). " +
    "A cue list starts empty — use add_cue to populate it with cues. " +
    "Optionally set loop=true to repeat the sequence after the last cue.",
  inputSchema: {
    type: "object" as const,
    properties: {
      id: {
        type: "string",
        description:
          "Unique identifier for the cue list (e.g., 'main-show', 'ambient-loop')",
      },
      name: {
        type: "string",
        description:
          "Human-readable name for the cue list (e.g., 'Main Show', 'Ambient Loop')",
      },
      loop: {
        type: "boolean",
        description:
          "Whether the cue list loops back to the first cue after the last one completes. " +
          "Default: false",
      },
    },
    required: ["id", "name"],
  },
};

export const ADD_CUE_TOOL = {
  name: "add_cue",
  description:
    "Add a cue to the end of a cue list. A cue defines a timed transition to a scene. " +
    "The scene must already exist (created via create_scene). " +
    "Timing is specified in milliseconds: fade_in_ms (transition into the scene), " +
    "hold_ms (how long to hold at full), fade_out_ms (transition out before next cue).",
  inputSchema: {
    type: "object" as const,
    properties: {
      cue_list_id: {
        type: "string",
        description: "ID of the cue list to add the cue to",
      },
      cue: {
        type: "object",
        description: "The cue to add",
        properties: {
          id: {
            type: "string",
            description:
              "Unique identifier for the cue within this list (e.g., 'cue-1', 'verse-intro')",
          },
          name: {
            type: "string",
            description:
              "Human-readable name for the cue (e.g., 'Opening Look', 'Verse 1 Transition')",
          },
          scene_id: {
            type: "string",
            description:
              "ID of the scene to transition to (must exist in the scene manager)",
          },
          fade_in_ms: {
            type: "number",
            description:
              "Fade-in duration in milliseconds (how long to transition into this scene). " +
              "Use 0 for an instant snap.",
            minimum: 0,
          },
          hold_ms: {
            type: "number",
            description:
              "Hold duration in milliseconds (how long to stay at this scene before the next cue). " +
              "Use 0 to proceed immediately after fade-in completes.",
            minimum: 0,
          },
          fade_out_ms: {
            type: "number",
            description:
              "Fade-out duration in milliseconds (how long to fade out before the next cue begins). " +
              "Use 0 for no fade-out.",
            minimum: 0,
          },
        },
        required: ["id", "name", "scene_id", "fade_in_ms", "hold_ms", "fade_out_ms"],
      },
    },
    required: ["cue_list_id", "cue"],
  },
};

export const REMOVE_CUE_TOOL = {
  name: "remove_cue",
  description:
    "Remove a cue from a cue list by its cue ID. " +
    "The remaining cues maintain their relative order.",
  inputSchema: {
    type: "object" as const,
    properties: {
      cue_list_id: {
        type: "string",
        description: "ID of the cue list to remove the cue from",
      },
      cue_id: {
        type: "string",
        description: "ID of the cue to remove",
      },
    },
    required: ["cue_list_id", "cue_id"],
  },
};
```

### 3. Implement Tool Handler Functions

Add handler functions that bridge MCP tool calls to `CueManager` methods:

```typescript
// Add to src/cues/tools.ts

// ── Handler Functions ───────────────────────────────────────────────────

/**
 * Handle the create_cue_list tool call.
 *
 * @param id - Unique ID for the new cue list
 * @param name - Human-readable name
 * @param loop - Whether the cue list loops (default: false)
 * @param cueManager - CueManager instance
 */
export function handleCreateCueList(
  id: string,
  name: string,
  loop: boolean | undefined,
  cueManager: CueManager
): {
  success: boolean;
  cueList: { id: string; name: string; cueCount: number; loop: boolean };
} {
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

/**
 * Input format for the cue parameter as received from the MCP tool call.
 * Uses snake_case to match the JSON Schema convention.
 */
export interface AddCueInput {
  id: string;
  name: string;
  scene_id: string;
  fade_in_ms: number;
  hold_ms: number;
  fade_out_ms: number;
}

/**
 * Handle the add_cue tool call.
 *
 * Converts the snake_case MCP input to the camelCase Cue interface,
 * then delegates to CueManager.addCue().
 *
 * @param cueListId - ID of the cue list to add the cue to
 * @param cueInput - Cue parameters from the MCP tool call
 * @param cueManager - CueManager instance
 */
export function handleAddCue(
  cueListId: string,
  cueInput: AddCueInput,
  cueManager: CueManager
): {
  success: boolean;
  cueListId: string;
  cue: { id: string; name: string; sceneId: string; fadeInMs: number; holdMs: number; fadeOutMs: number };
  cueCount: number;
} {
  // Convert snake_case MCP input to camelCase Cue interface
  const cue: Cue = {
    id: cueInput.id,
    name: cueInput.name,
    scene: cueInput.scene_id,
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
      sceneId: cue.scene,
      fadeInMs: cue.fadeInMs,
      holdMs: cue.holdMs,
      fadeOutMs: cue.fadeOutMs,
    },
    cueCount: updatedCueList.cues.length,
  };
}

/**
 * Handle the remove_cue tool call.
 *
 * @param cueListId - ID of the cue list
 * @param cueId - ID of the cue to remove
 * @param cueManager - CueManager instance
 */
export function handleRemoveCue(
  cueListId: string,
  cueId: string,
  cueManager: CueManager
): {
  success: boolean;
  cueListId: string;
  removedCueId: string;
  remainingCueCount: number;
  remainingCues: Array<{ id: string; name: string }>;
} {
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
```

### 4. Update the Barrel Export

Update `src/cues/index.ts` to include tool exports:

```typescript
// src/cues/index.ts

export { CueManager } from "./manager.js";
export type { CueListInfo } from "./manager.js";
export { FadeEngine } from "./fade-engine.js";
export {
  CREATE_CUE_LIST_TOOL,
  ADD_CUE_TOOL,
  REMOVE_CUE_TOOL,
  handleCreateCueList,
  handleAddCue,
  handleRemoveCue,
} from "./tools.js";
export type { AddCueInput } from "./tools.js";
```

### 5. Verify TypeScript Compilation

```bash
npx tsc --noEmit
```

---

## Verification

- [ ] File `src/cues/tools.ts` exists and exports tool schemas and handler functions
- [ ] `CREATE_CUE_LIST_TOOL` schema has `id` (required), `name` (required), and `loop` (optional boolean) properties
- [ ] `ADD_CUE_TOOL` schema has `cue_list_id` (required) and nested `cue` object with `id`, `name`, `scene_id`, `fade_in_ms`, `hold_ms`, `fade_out_ms` (all required)
- [ ] `REMOVE_CUE_TOOL` schema has `cue_list_id` (required) and `cue_id` (required) properties
- [ ] `handleCreateCueList()` calls `cueManager.createCueList()` and returns success with cue list summary
- [ ] `handleCreateCueList()` defaults `loop` to `false` when not provided
- [ ] `handleAddCue()` converts snake_case input to camelCase `Cue` interface
- [ ] `handleAddCue()` calls `cueManager.addCue()` and returns success with cue details and updated count
- [ ] `handleRemoveCue()` calls `cueManager.removeCue()` and returns success with remaining cues list
- [ ] All handler functions propagate errors from CueManager (scene not found, duplicate ID, etc.)
- [ ] `src/cues/index.ts` re-exports all tool schemas, handlers, and types
- [ ] `npx tsc --noEmit` passes with no errors

---

## Notes

- The MCP tool input uses `snake_case` naming (`scene_id`, `fade_in_ms`, `cue_list_id`) while the internal TypeScript interfaces use `camelCase` (`scene`, `fadeInMs`, `cueListId`). The `handleAddCue` handler explicitly converts between these conventions. This follows the convention that MCP-facing APIs use snake_case (JSON convention) while internal code uses camelCase (TypeScript convention).
- The `add_cue` tool uses a nested `cue` object in its input schema rather than flat parameters. This groups the cue-specific fields logically and makes it clear which parameters belong to the cue versus the cue list context. It also makes it easier to extend the cue parameters in the future without flattening the namespace.
- The `remove_cue` handler returns the remaining cues list so the agent can see the current state of the cue list after removal. This provides better context for the agent than just returning "success".
- Error handling is intentionally simple: errors from `CueManager` (cue list not found, scene not found, duplicate cue ID, invalid timing) propagate directly to the caller. The MCP tool registration layer (Task 22) will catch these and format appropriate error responses.
- The `loop` parameter in `create_cue_list` defaults to `false`. Most cue lists in live production are run-once sequences. The agent can set `loop: true` for ambient/background loops.

---

**Next Task**: [Task 21: Implement reorder_cues Tool](task-21-reorder-cues-tool.md)
**Related Design Docs**: [DMX Lighting MCP Design](../../design/local.dmx-lighting-mcp.md)
