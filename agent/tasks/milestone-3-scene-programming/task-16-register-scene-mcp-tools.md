# Task 16: Register Scene MCP Tools

**Milestone**: [M3 - Scene Programming](../../milestones/milestone-3-scene-programming.md)
**Estimated Time**: 1 hour
**Dependencies**: Task 13 (SceneManager), Task 15 (scene tool handlers)
**Status**: Not Started

---

## Objective

Register all 5 scene programming tools (`create_scene`, `update_scene`, `delete_scene`, `list_scenes`, `preview_scene`) with the MCP server, defining their input schemas and wiring them to the handler functions from Task 15.

---

## Context

The MCP server (set up in Task 2) exposes tools to AI agents. Each tool needs:
1. A **name** and **description** for the agent to understand what it does
2. An **input schema** (JSON Schema) defining the expected parameters
3. A **handler function** that executes when the tool is called

The 5 scene tools follow a consistent CRUD pattern plus the `preview_scene` action tool. The handlers were implemented in Tasks 13 and 15. This task wires them into the MCP server's tool registration system.

The MCP SDK tool registration pattern (from Task 2) looks like:

```typescript
server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [
    {
      name: "tool_name",
      description: "What this tool does",
      inputSchema: {
        type: "object",
        properties: { /* ... */ },
        required: [ /* ... */ ],
      },
    },
    // ... more tools
  ],
}));

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;
  switch (name) {
    case "tool_name":
      // call handler, return result
    // ...
  }
});
```

---

## Steps

### 1. Define Tool Schemas

Add the 5 scene tool definitions to the tool list. Create or update a scene tools registration module:

```typescript
// Tool definitions to add to the MCP server's ListTools handler

const sceneTools = [
  {
    name: "create_scene",
    description:
      "Create a new lighting scene with fixture states. " +
      "Each fixture state maps channel names (red, green, blue, dimmer, etc.) " +
      "to values (0-255). Fixture IDs must reference patched fixtures.",
    inputSchema: {
      type: "object" as const,
      properties: {
        id: {
          type: "string",
          description:
            "Unique identifier for the scene (e.g., 'warm-wash', 'blue-chase-start')",
        },
        name: {
          type: "string",
          description:
            "Human-readable name for the scene (e.g., 'Warm Wash', 'Blue Chase Start')",
        },
        fixtureStates: {
          type: "object",
          description:
            "Map of fixture ID to channel values. " +
            "Example: { \"par-1\": { \"red\": 255, \"green\": 128, \"blue\": 0 }, " +
            "\"par-2\": { \"red\": 0, \"green\": 0, \"blue\": 255 } }",
          additionalProperties: {
            type: "object",
            additionalProperties: {
              type: "number",
              minimum: 0,
              maximum: 255,
            },
          },
        },
      },
      required: ["id", "name", "fixtureStates"],
    },
  },
  {
    name: "update_scene",
    description:
      "Update an existing scene by merging new fixture states. " +
      "Only the specified channels are changed; other existing channels are preserved. " +
      "New fixture IDs can be added to the scene.",
    inputSchema: {
      type: "object" as const,
      properties: {
        id: {
          type: "string",
          description: "ID of the scene to update",
        },
        fixtureStates: {
          type: "object",
          description:
            "Map of fixture ID to channel values to merge. " +
            "Example: { \"par-1\": { \"red\": 200 } } updates only the red channel of par-1.",
          additionalProperties: {
            type: "object",
            additionalProperties: {
              type: "number",
              minimum: 0,
              maximum: 255,
            },
          },
        },
      },
      required: ["id", "fixtureStates"],
    },
  },
  {
    name: "delete_scene",
    description: "Delete a scene by its ID. This action cannot be undone.",
    inputSchema: {
      type: "object" as const,
      properties: {
        id: {
          type: "string",
          description: "ID of the scene to delete",
        },
      },
      required: ["id"],
    },
  },
  {
    name: "list_scenes",
    description:
      "List all scenes with summary information including ID, name, and fixture count.",
    inputSchema: {
      type: "object" as const,
      properties: {},
      required: [],
    },
  },
  {
    name: "preview_scene",
    description:
      "Output a scene to DMX in real-time through OLA. " +
      "This sends the scene's fixture states as DMX channel values to the lighting rig. " +
      "The lights will immediately change to reflect the scene. " +
      "Requires OLA to be running and connected to DMX hardware.",
    inputSchema: {
      type: "object" as const,
      properties: {
        scene_id: {
          type: "string",
          description: "ID of the scene to preview",
        },
      },
      required: ["scene_id"],
    },
  },
];
```

### 2. Add Scene Tools to the ListTools Handler

Merge the scene tools into the existing tool list in the server setup. The exact integration depends on how the server is structured, but the pattern is:

```typescript
// In the main server setup file (e.g., src/index.ts or src/server.ts)

import { SceneManager } from "./scenes/manager.js";
import { OLAClient } from "./ola/client.js";
import { FixtureManager } from "./fixtures/manager.js";
import {
  handlePreviewScene,
  handleCreateScene,
  handleUpdateScene,
  handleDeleteScene,
  handleListScenes,
  formatPreviewResult,
} from "./scenes/tools.js";

// Initialize managers (these may already exist from earlier milestones)
const olaClient = new OLAClient();
const fixtureManager = new FixtureManager();
const sceneManager = new SceneManager(fixtureManager);

// Add scene tools to the existing tools array in ListToolsRequestSchema handler
server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [
    ...existingFixtureTools,  // from Milestone 2
    ...sceneTools,            // scene tools defined above
  ],
}));
```

### 3. Add Scene Tool Call Handlers

Wire each tool name to its handler in the `CallToolRequestSchema` handler:

```typescript
// In the CallToolRequestSchema handler, add cases for scene tools

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  try {
    switch (name) {
      // ... existing fixture tool cases from Milestone 2 ...

      case "create_scene": {
        const { id, name: sceneName, fixtureStates } = args as {
          id: string;
          name: string;
          fixtureStates: Record<string, Record<string, number>>;
        };
        const result = handleCreateScene(id, sceneName, fixtureStates, sceneManager);
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(result, null, 2),
            },
          ],
        };
      }

      case "update_scene": {
        const { id, fixtureStates } = args as {
          id: string;
          fixtureStates: Record<string, Record<string, number>>;
        };
        const result = handleUpdateScene(id, fixtureStates, sceneManager);
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(result, null, 2),
            },
          ],
        };
      }

      case "delete_scene": {
        const { id } = args as { id: string };
        const result = handleDeleteScene(id, sceneManager);
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(result, null, 2),
            },
          ],
        };
      }

      case "list_scenes": {
        const result = handleListScenes(sceneManager);
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(result, null, 2),
            },
          ],
        };
      }

      case "preview_scene": {
        const { scene_id } = args as { scene_id: string };
        const result = await handlePreviewScene(
          scene_id,
          sceneManager,
          fixtureManager,
          olaClient
        );
        return {
          content: [
            {
              type: "text",
              text: formatPreviewResult(result),
            },
          ],
        };
      }

      default:
        throw new Error(`Unknown tool: ${name}`);
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      content: [
        {
          type: "text",
          text: `Error: ${message}`,
        },
      ],
      isError: true,
    };
  }
});
```

### 4. Verify All Tools Are Registered

After wiring, verify that the MCP server lists all 5 scene tools alongside any existing tools:

```bash
# Start the server and use the MCP inspector or a test client to list tools
npx tsc --noEmit
```

---

## Verification

- [ ] `create_scene` tool is registered with `id`, `name`, and `fixtureStates` parameters
- [ ] `update_scene` tool is registered with `id` and `fixtureStates` parameters
- [ ] `delete_scene` tool is registered with `id` parameter
- [ ] `list_scenes` tool is registered with no required parameters
- [ ] `preview_scene` tool is registered with `scene_id` parameter
- [ ] All 5 tools appear in the `ListTools` response
- [ ] `create_scene` handler calls `handleCreateScene` and returns JSON result
- [ ] `update_scene` handler calls `handleUpdateScene` and returns JSON result
- [ ] `delete_scene` handler calls `handleDeleteScene` and returns JSON result
- [ ] `list_scenes` handler calls `handleListScenes` and returns JSON result
- [ ] `preview_scene` handler calls `handlePreviewScene` and returns formatted text
- [ ] Error handling wraps all handlers -- errors are returned as `{ isError: true }` MCP responses, not thrown
- [ ] `SceneManager` is initialized with a reference to `FixtureManager`
- [ ] `npx tsc --noEmit` passes with no errors

---

## Notes

- The `fixtureStates` input schema uses `additionalProperties` for both the fixture-level and channel-level objects because the keys are dynamic (fixture IDs and channel names are user-defined strings). The JSON Schema `additionalProperties` with a number type constraint ensures channel values are numeric.
- The `preview_scene` tool uses `formatPreviewResult()` for its response text rather than raw JSON, since the agent benefits from a human-readable summary of what was sent to DMX. The CRUD tools return JSON for structured data.
- Error handling uses a try/catch at the top level of the `CallToolRequestSchema` handler. All errors (scene not found, invalid fixture ID, OLA communication failure) are caught and returned as MCP error responses with `isError: true`. This prevents the MCP server from crashing on bad input.
- The `SceneManager`, `FixtureManager`, and `OLAClient` instances need to be shared across all tool handlers. They should be instantiated once at server startup and passed into handlers via closure (as shown in the code examples). Do not create new instances per tool call.
- The `list_scenes` tool has an empty `required` array and empty `properties`, meaning it takes no parameters. Some MCP clients may still send an empty object `{}` as arguments, which is fine.

---

**Next Task**: [Task 17: Add Scene Programming Tests](task-17-scene-programming-tests.md)
**Related Design Docs**: [DMX Lighting MCP Design](../../design/local.dmx-lighting-mcp.md)
