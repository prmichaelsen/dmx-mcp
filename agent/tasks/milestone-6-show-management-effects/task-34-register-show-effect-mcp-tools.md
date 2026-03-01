# Task 34: Register Show and Effect MCP Tools

**Milestone**: [M6 - Show Management & Effects](../../milestones/milestone-6-show-management-effects.md)
**Estimated Time**: 1 hour
**Dependencies**: Task 31 (Show Management Tools), Task 33 (Chase, Rainbow, Strobe Effects)
**Status**: Not Started

---

## Objective

Register all show management and effect tools with the MCP server: `save_show`, `load_show`, `list_shows`, `apply_effect`, and `stop_effect`. Define their input schemas, wire them to the ShowStorage and EffectEngine handlers, and verify they appear in the server's `tools/list` response.

---

## Context

The MCP server exposes tools that AI agents call to control the lighting system. Each tool has a name, description, JSON Schema for its input parameters, and a handler function. Previous milestones registered tools for fixture management, scene programming, cue management, and playback. This task adds the final set of tools: show persistence and dynamic effects.

The tool registration follows the same pattern established by earlier milestones: define the tool in the server's tool list with its schema, then route incoming calls to the appropriate handler function. The handlers were implemented in Tasks 31 (show tools) and 32-33 (effect engine + calculators).

---

## Steps

### 1. Define the Tool Schemas and Handlers

Add the show management and effect tool registrations to the MCP server. This follows the pattern established by previous tool registrations.

```typescript
// Add to the server's tool registration (e.g., src/server.ts or src/tools/index.ts)

import {
  handleSaveShow,
  handleLoadShow,
  handleListShows,
} from "./shows/tools.js";
import type { ShowToolDependencies } from "./shows/tools.js";
import { ShowStorage } from "./shows/storage.js";
import {
  EffectEngine,
  registerBuiltInEffects,
} from "./effects/index.js";

// --- Initialization (during server setup) ---

const showStorage = new ShowStorage();
const effectEngine = new EffectEngine(olaClient, fixtureManager);
registerBuiltInEffects(effectEngine);

const showDeps: ShowToolDependencies = {
  fixtureManager,
  sceneManager,
  cueManager,
  showStorage,
};
```

### 2. Register save_show Tool

```typescript
server.setRequestHandler(ListToolsRequestSchema, async () => {
  return {
    tools: [
      // ... existing tools from previous milestones ...

      // --- Show Management Tools ---
      {
        name: "save_show",
        description:
          "Save the current show state (all fixtures, scenes, and cue lists) " +
          "to disk as a JSON file. The show can be loaded later to restore " +
          "the complete state.",
        inputSchema: {
          type: "object" as const,
          properties: {
            id: {
              type: "string",
              description:
                "Unique identifier for the show. Used as the filename " +
                "(e.g., 'sunday-service' saves to sunday-service.json). " +
                "If a show with this ID already exists, it will be overwritten.",
            },
            name: {
              type: "string",
              description:
                "Human-readable name for the show (e.g., 'Sunday Service', " +
                "'Concert March 2026').",
            },
          },
          required: ["id", "name"],
        },
      },
```

### 3. Register load_show Tool

```typescript
      {
        name: "load_show",
        description:
          "Load a previously saved show from disk, restoring all fixtures, " +
          "scenes, and cue lists. WARNING: This replaces all current state. " +
          "Any unsaved changes will be lost.",
        inputSchema: {
          type: "object" as const,
          properties: {
            id: {
              type: "string",
              description:
                "ID of the show to load (matches the filename without .json extension). " +
                "Use list_shows to see available shows.",
            },
          },
          required: ["id"],
        },
      },
```

### 4. Register list_shows Tool

```typescript
      {
        name: "list_shows",
        description:
          "List all saved shows available on disk. Returns the ID, name, " +
          "and summary counts (fixtures, scenes, cue lists) for each show.",
        inputSchema: {
          type: "object" as const,
          properties: {},
          required: [],
        },
      },
```

### 5. Register apply_effect Tool

```typescript
      // --- Effect Tools ---
      {
        name: "apply_effect",
        description:
          "Apply a dynamic lighting effect to a group of fixtures. " +
          "Effects run continuously until stopped. Multiple effects can " +
          "run simultaneously on different fixture groups. " +
          "Available effects: chase (sequential activation), " +
          "rainbow (color cycling), strobe (rapid flash).",
        inputSchema: {
          type: "object" as const,
          properties: {
            type: {
              type: "string",
              enum: ["chase", "rainbow", "strobe"],
              description:
                "Effect type: 'chase' (lights up fixtures one at a time " +
                "in sequence), 'rainbow' (cycles through colors across " +
                "fixtures), 'strobe' (rapid on/off flash).",
            },
            fixture_ids: {
              type: "array",
              items: { type: "string" },
              description:
                "IDs of fixtures to apply the effect to. Fixtures must " +
                "be patched. Order matters for chase and rainbow effects " +
                "(determines the sequence/gradient direction).",
            },
            params: {
              type: "object",
              properties: {
                speed: {
                  type: "number",
                  description:
                    "Speed multiplier (default: 1.0). Higher values = " +
                    "faster effect. Applies to chase and rainbow.",
                },
                color: {
                  type: "object",
                  properties: {
                    red: { type: "number", minimum: 0, maximum: 255 },
                    green: { type: "number", minimum: 0, maximum: 255 },
                    blue: { type: "number", minimum: 0, maximum: 255 },
                  },
                  required: ["red", "green", "blue"],
                  description:
                    "RGB color for chase (active fixture color) and " +
                    "strobe (flash color). Not used for rainbow.",
                },
                rate: {
                  type: "number",
                  minimum: 1,
                  maximum: 25,
                  description:
                    "Strobe flash rate in Hz (flashes per second). " +
                    "Default: 5. Range: 1-25. Only used for strobe effect.",
                },
                duty_cycle: {
                  type: "number",
                  minimum: 0.1,
                  maximum: 0.9,
                  description:
                    "Strobe duty cycle: fraction of time the light is on. " +
                    "Default: 0.5. Range: 0.1-0.9. Only used for strobe.",
                },
                intensity: {
                  type: "number",
                  minimum: 0,
                  maximum: 255,
                  description:
                    "Master intensity for the effect (0-255, default: 255).",
                },
              },
              description: "Optional parameters to control the effect behavior.",
            },
          },
          required: ["type", "fixture_ids"],
        },
      },
```

### 6. Register stop_effect Tool

```typescript
      {
        name: "stop_effect",
        description:
          "Stop a running effect. Provide either an effect_id to stop " +
          "a specific effect, or set all=true to stop all running effects.",
        inputSchema: {
          type: "object" as const,
          properties: {
            effect_id: {
              type: "string",
              description:
                "ID of the effect to stop (returned by apply_effect). " +
                "Omit if using 'all' to stop all effects.",
            },
            all: {
              type: "boolean",
              description:
                "Set to true to stop all running effects. " +
                "Overrides effect_id if both are provided.",
            },
          },
        },
      },
    ],
  };
});
```

### 7. Wire Tool Handlers to CallTool

Add the handler routing for each new tool in the server's `CallTool` handler:

```typescript
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  switch (name) {
    // ... existing tool handlers ...

    // --- Show Management ---

    case "save_show": {
      const result = await handleSaveShow(
        { id: args.id as string, name: args.name as string },
        showDeps
      );
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(result, null, 2),
          },
        ],
      };
    }

    case "load_show": {
      const result = await handleLoadShow(
        { id: args.id as string },
        showDeps
      );
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(result, null, 2),
          },
        ],
      };
    }

    case "list_shows": {
      const result = await handleListShows(showDeps);
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(result, null, 2),
          },
        ],
      };
    }

    // --- Effects ---

    case "apply_effect": {
      try {
        const effectParams = args.params as Record<string, unknown> | undefined;
        const effectId = effectEngine.startEffect(
          args.type as "chase" | "rainbow" | "strobe",
          args.fixture_ids as string[],
          {
            speed: effectParams?.speed as number | undefined,
            color: effectParams?.color as
              | { red: number; green: number; blue: number }
              | undefined,
            rate: effectParams?.rate as number | undefined,
            dutyCycle: effectParams?.duty_cycle as number | undefined,
            intensity: effectParams?.intensity as number | undefined,
          }
        );
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(
                {
                  success: true,
                  effectId,
                  message: `Effect "${args.type}" started on ${(args.fixture_ids as string[]).length} fixture(s).`,
                },
                null,
                2
              ),
            },
          ],
        };
      } catch (error) {
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(
                {
                  success: false,
                  message:
                    error instanceof Error
                      ? error.message
                      : String(error),
                },
                null,
                2
              ),
            },
          ],
        };
      }
    }

    case "stop_effect": {
      try {
        if (args.all === true) {
          const count = effectEngine.getActiveEffectCount();
          effectEngine.stopAll();
          return {
            content: [
              {
                type: "text",
                text: JSON.stringify(
                  {
                    success: true,
                    message: `Stopped ${count} effect(s).`,
                  },
                  null,
                  2
                ),
              },
            ],
          };
        }

        if (!args.effect_id) {
          return {
            content: [
              {
                type: "text",
                text: JSON.stringify(
                  {
                    success: false,
                    message:
                      "Provide either 'effect_id' to stop a specific effect " +
                      "or 'all: true' to stop all effects.",
                  },
                  null,
                  2
                ),
              },
            ],
          };
        }

        effectEngine.stopEffect(args.effect_id as string);
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(
                {
                  success: true,
                  message: `Effect "${args.effect_id}" stopped.`,
                },
                null,
                2
              ),
            },
          ],
        };
      } catch (error) {
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(
                {
                  success: false,
                  message:
                    error instanceof Error
                      ? error.message
                      : String(error),
                },
                null,
                2
              ),
            },
          ],
        };
      }
    }

    default:
      throw new Error(`Unknown tool: ${name}`);
  }
});
```

### 8. Verify TypeScript Compilation

```bash
npx tsc --noEmit
```

### 9. Verify Tools Appear in tools/list

Start the server and verify all new tools are listed:

```bash
# Using the MCP inspector or a test client
echo '{"jsonrpc":"2.0","id":1,"method":"tools/list"}' | node dist/index.js
```

Verify the response includes: `save_show`, `load_show`, `list_shows`, `apply_effect`, `stop_effect`.

---

## Verification

- [ ] `save_show` tool is registered with `id` and `name` input parameters
- [ ] `load_show` tool is registered with `id` input parameter
- [ ] `list_shows` tool is registered with no required parameters
- [ ] `apply_effect` tool is registered with `type`, `fixture_ids`, and optional `params`
- [ ] `apply_effect` schema includes enum constraint on `type`: `["chase", "rainbow", "strobe"]`
- [ ] `apply_effect` schema includes nested `params` object with `speed`, `color`, `rate`, `duty_cycle`, `intensity`
- [ ] `stop_effect` tool is registered with optional `effect_id` and `all` parameters
- [ ] `save_show` handler calls `handleSaveShow` and returns JSON result
- [ ] `load_show` handler calls `handleLoadShow` and returns JSON result
- [ ] `list_shows` handler calls `handleListShows` and returns JSON result
- [ ] `apply_effect` handler calls `effectEngine.startEffect()` and returns the effect ID
- [ ] `apply_effect` handler maps `duty_cycle` (snake_case from schema) to `dutyCycle` (camelCase in EffectParams)
- [ ] `stop_effect` handler supports both `effect_id` (stop one) and `all: true` (stop all)
- [ ] Error cases return `{ success: false, message: "..." }` rather than throwing
- [ ] `ShowStorage` and `EffectEngine` are instantiated during server initialization
- [ ] `registerBuiltInEffects()` is called during server initialization
- [ ] All 5 new tools appear in the `tools/list` response
- [ ] `npx tsc --noEmit` passes with zero errors

---

## Notes

- The `apply_effect` tool's `params.duty_cycle` uses snake_case in the MCP schema (following JSON convention for external APIs) but maps to `dutyCycle` (camelCase) in the internal `EffectParams` interface. This conversion happens in the handler.
- The `stop_effect` tool accepts either `effect_id` or `all: true`, but not both simultaneously. If `all` is true, `effect_id` is ignored.
- Tool handler responses are always JSON-stringified objects with `success` and `message` fields. This is consistent with the pattern established by show management handlers and provides a uniform response format for the AI agent.
- The `EffectEngine` and `ShowStorage` instances are created once during server initialization and shared across all tool invocations. This is important because the EffectEngine maintains state (active effects) that persists between calls.
- The `list_shows` tool has no required parameters but still defines an empty `properties` object and `required: []` in its schema. This is valid JSON Schema and ensures the tool is callable without arguments.

---

**Next Task**: [Task 35: End-to-End Integration Tests](task-35-end-to-end-tests.md)
**Related Design Docs**: [DMX Lighting MCP Design](../../design/local.dmx-lighting-mcp.md)
