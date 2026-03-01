# Task 22: Register Cue MCP Tools

**Milestone**: [M4 - Cue Management & Fade Engine](../../milestones/milestone-4-cue-management-fade-engine.md)
**Estimated Time**: 1 hour
**Dependencies**: Task 20 (cue management tools), Task 21 (reorder_cues tool)
**Status**: Not Started

---

## Objective

Register all 4 cue management tools (`create_cue_list`, `add_cue`, `remove_cue`, `reorder_cues`) with the MCP server so they appear in `tools/list` responses and can be called via `tools/call` requests.

---

## Context

The MCP server (set up in Task 2) exposes tools to AI agents via two request handlers:

1. **`tools/list`** -- Returns all available tools with names, descriptions, and input schemas. This is how agents discover what tools are available.
2. **`tools/call`** -- Executes a specific tool by name with provided arguments and returns the result.

The fixture tools (Milestone 2, Task 10) and scene tools (Milestone 3, Task 16) are already registered. This task adds the 4 cue management tools alongside them, following the same tool router pattern established in Task 10.

The tool schemas and handler functions are already implemented in Tasks 20 and 21. This task wires them into the MCP server and ensures all dependencies (`CueManager`, `SceneManager`) are properly initialized and available to the handlers.

The MCP SDK registration pattern uses:

```typescript
server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [
    ...existingFixtureTools,
    ...existingSceneTools,
    ...cueTools,  // <-- add here
  ],
}));

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;
  // Route to appropriate handler
});
```

---

## Steps

### 1. Create a Cue Tool Router

Add a centralized tool router function to `src/cues/tools.ts` that dispatches `tools/call` requests to the appropriate handler, following the pattern from `routeFixtureTool()` in Task 10:

```typescript
// Add to src/cues/tools.ts

/**
 * Array of all cue tool schema definitions for the tools/list handler.
 */
export const ALL_CUE_TOOLS = [
  CREATE_CUE_LIST_TOOL,
  ADD_CUE_TOOL,
  REMOVE_CUE_TOOL,
  REORDER_CUES_TOOL,
];

/**
 * MCP tool response format.
 */
type ToolResponse = {
  content: Array<{ type: "text"; text: string }>;
  isError?: boolean;
};

/**
 * Route a tool call to the appropriate cue handler.
 *
 * @param toolName - The name of the tool being called
 * @param args - The tool arguments from the MCP request
 * @param cueManager - CueManager instance
 * @returns ToolResponse if this is a cue tool, null if not
 */
export function routeCueTool(
  toolName: string,
  args: Record<string, unknown>,
  cueManager: CueManager
): ToolResponse | null {
  try {
    switch (toolName) {
      case "create_cue_list": {
        const { id, name, loop } = args as {
          id: string;
          name: string;
          loop?: boolean;
        };
        const result = handleCreateCueList(id, name, loop, cueManager);
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(result, null, 2),
            },
          ],
        };
      }

      case "add_cue": {
        const { cue_list_id, cue } = args as {
          cue_list_id: string;
          cue: AddCueInput;
        };
        const result = handleAddCue(cue_list_id, cue, cueManager);
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(result, null, 2),
            },
          ],
        };
      }

      case "remove_cue": {
        const { cue_list_id, cue_id } = args as {
          cue_list_id: string;
          cue_id: string;
        };
        const result = handleRemoveCue(cue_list_id, cue_id, cueManager);
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(result, null, 2),
            },
          ],
        };
      }

      case "reorder_cues": {
        const { cue_list_id, cue_ids } = args as {
          cue_list_id: string;
          cue_ids: string[];
        };
        const result = handleReorderCues(cue_list_id, cue_ids, cueManager);
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(result, null, 2),
            },
          ],
        };
      }

      default:
        return null; // Not a cue tool
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      content: [
        {
          type: "text",
          text: JSON.stringify({ success: false, error: message }, null, 2),
        },
      ],
      isError: true,
    };
  }
}
```

### 2. Wire Cue Tools into the MCP Server

Update the main server file (e.g., `src/server.ts` or `src/index.ts`) to include the cue tools in both the `ListTools` and `CallTool` handlers:

```typescript
// In the main server setup file (src/server.ts or src/index.ts)

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";

// Existing imports from Milestones 1-3
import { OLAClient } from "./ola/client.js";
import { FixtureManager } from "./fixtures/manager.js";
import { ProfileRegistry } from "./fixtures/profiles.js";
import { SceneManager } from "./scenes/manager.js";
import { ALL_FIXTURE_TOOLS, routeFixtureTool } from "./fixtures/tools.js";
// Scene tools imports...

// New imports for Milestone 4
import { CueManager } from "./cues/manager.js";
import { ALL_CUE_TOOLS, routeCueTool } from "./cues/tools.js";

// Initialize all managers
const olaClient = new OLAClient();
const profileRegistry = new ProfileRegistry();
const fixtureManager = new FixtureManager();
const sceneManager = new SceneManager(fixtureManager);
const cueManager = new CueManager(sceneManager); // <-- NEW

// Handle tools/list -- include cue tools alongside fixture and scene tools
server.setRequestHandler(ListToolsRequestSchema, async () => {
  return {
    tools: [
      ...ALL_FIXTURE_TOOLS,
      // ...ALL_SCENE_TOOLS,
      ...ALL_CUE_TOOLS,       // <-- NEW
    ],
  };
});

// Handle tools/call -- route to cue tool handler
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  // Try fixture tools
  const fixtureResult = routeFixtureTool(
    name,
    args ?? {},
    fixtureManager,
    profileRegistry
  );
  if (fixtureResult) return fixtureResult;

  // Try scene tools
  // const sceneResult = routeSceneTool(name, args ?? {}, ...);
  // if (sceneResult) return sceneResult;

  // Try cue tools  <-- NEW
  const cueResult = routeCueTool(name, args ?? {}, cueManager);
  if (cueResult) return cueResult;

  // Unknown tool
  return {
    content: [
      {
        type: "text",
        text: JSON.stringify({
          success: false,
          error: `Unknown tool: "${name}"`,
        }),
      },
    ],
    isError: true,
  };
});
```

### 3. Initialize CueManager with SceneManager Dependency

Ensure the `CueManager` is initialized with the `SceneManager` reference so scene validation works correctly. The initialization order matters:

```typescript
// Correct initialization order:
const fixtureManager = new FixtureManager();              // no deps
const sceneManager = new SceneManager(fixtureManager);    // depends on FixtureManager
const cueManager = new CueManager(sceneManager);          // depends on SceneManager
```

### 4. Update the Barrel Export

Ensure `src/cues/index.ts` exports the router and tool list:

```typescript
// src/cues/index.ts

export { CueManager } from "./manager.js";
export type { CueListInfo } from "./manager.js";
export { FadeEngine } from "./fade-engine.js";
export {
  CREATE_CUE_LIST_TOOL,
  ADD_CUE_TOOL,
  REMOVE_CUE_TOOL,
  REORDER_CUES_TOOL,
  ALL_CUE_TOOLS,
  handleCreateCueList,
  handleAddCue,
  handleRemoveCue,
  handleReorderCues,
  routeCueTool,
} from "./tools.js";
export type { AddCueInput } from "./tools.js";
```

### 5. Verify Compilation and Tool Discovery

```bash
npx tsc --noEmit
```

To manually test tool discovery, start the server and verify the `tools/list` response includes all 4 cue tools:

```bash
# Using MCP Inspector or a test client
# Verify tools/list returns: create_cue_list, add_cue, remove_cue, reorder_cues
```

---

## Verification

- [ ] `routeCueTool()` function is exported and handles all 4 cue tool names
- [ ] `ALL_CUE_TOOLS` array contains all 4 tool schema definitions
- [ ] `tools/list` response includes `create_cue_list`, `add_cue`, `remove_cue`, `reorder_cues`
- [ ] `tools/call` with `create_cue_list` creates a cue list and returns JSON with success and cue list summary
- [ ] `tools/call` with `add_cue` adds a cue and returns JSON with success, cue details, and updated count
- [ ] `tools/call` with `add_cue` returns error if referenced scene does not exist
- [ ] `tools/call` with `remove_cue` removes a cue and returns JSON with remaining cues
- [ ] `tools/call` with `remove_cue` returns error if cue ID not found
- [ ] `tools/call` with `reorder_cues` reorders and returns JSON with new position order
- [ ] `tools/call` with `reorder_cues` returns error for missing/duplicate/unknown cue IDs
- [ ] `tools/call` with unknown tool name returns `{ isError: true }` response
- [ ] Error handling wraps all handlers -- errors are returned as `{ isError: true }` MCP responses, not thrown
- [ ] `CueManager` is initialized with `SceneManager` reference in the correct order
- [ ] All tool responses use the MCP content format: `{ content: [{ type: "text", text: "..." }] }`
- [ ] `npx tsc --noEmit` passes with no errors

---

## Notes

- The `routeCueTool()` function returns `null` for unknown tool names, allowing the server to chain multiple tool routers (fixture, scene, cue, etc.) in sequence. This follows the same pattern as `routeFixtureTool()` from Task 10.
- Error handling is centralized in the `try/catch` block inside `routeCueTool()`. All errors from `CueManager` (cue list not found, scene not found, duplicate cue ID, invalid timing, reorder validation failures) are caught and returned as MCP error responses with `isError: true`. This prevents the MCP server from crashing on bad input.
- The `CueManager` depends on `SceneManager`, which in turn depends on `FixtureManager`. This creates a dependency chain: `CueManager -> SceneManager -> FixtureManager`. All three must be initialized at server startup in the correct order and shared across tool handlers via closure.
- Tool inputs are cast using `as { ... }` because MCP tool arguments arrive as `Record<string, unknown>`. The JSON Schema validation on the MCP protocol side provides the first layer of defense. For additional safety, runtime validation with a library like zod could be added in a future task.
- The 4 cue tools bring the total tool count to 14 (5 fixture + 5 scene + 4 cue). As more tools are added in later milestones (playback, effects, show management), the router chain pattern keeps each tool group isolated and maintainable.

---

**Next Task**: [Task 23: Add Cue and Fade Engine Tests](task-23-cue-fade-engine-tests.md)
**Related Design Docs**: [DMX Lighting MCP Design](../../design/local.dmx-lighting-mcp.md)
