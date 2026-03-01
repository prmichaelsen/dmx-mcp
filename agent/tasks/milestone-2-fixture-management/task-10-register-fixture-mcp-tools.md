# Task 10: Register Fixture MCP Tools

**Milestone**: [M2 - Fixture Management](../../milestones/milestone-2-fixture-management.md)
**Estimated Time**: 1.5 hours
**Dependencies**: Task 8 (Fixture Manager), Task 9 (create_fixture_profile Tool)
**Status**: Not Started

---

## Objective

Register all 5 fixture management tools (`patch_fixture`, `unpatch_fixture`, `list_fixtures`, `list_fixture_profiles`, `create_fixture_profile`) with the MCP server. This wires the fixture management logic into the MCP protocol so that AI agents can discover and call these tools.

---

## Context

The MCP protocol requires servers to handle two key request types for tools:

1. **`tools/list`** -- Returns an array of available tools with their names, descriptions, and input schemas. This is how agents discover what tools are available.
2. **`tools/call`** -- Executes a specific tool by name with provided arguments and returns the result.

The FixtureManager (Task 8) and ProfileRegistry (Task 7) are already implemented. The `create_fixture_profile` handler (Task 9) is also ready. This task defines the remaining 4 tool schemas and handlers, then registers everything with the MCP server created in the M1 scaffold.

---

## Steps

### 1. Define All Tool Schemas

Add the remaining tool schemas to `src/fixtures/tools.ts` alongside the existing `create_fixture_profile` schema.

```typescript
// Add to src/fixtures/tools.ts

import { FixtureManager, PatchFixtureParams } from "./manager.js";

// ── patch_fixture ──────────────────────────────────────────────

export const PATCH_FIXTURE_TOOL = {
  name: "patch_fixture",
  description:
    "Patch a lighting fixture to a DMX universe at a specific start address. " +
    "The fixture is assigned a profile that defines its channel layout. " +
    "Address collisions with existing fixtures are automatically detected and rejected.",
  inputSchema: {
    type: "object" as const,
    properties: {
      id: {
        type: "string",
        description:
          "Unique identifier for this fixture (e.g., 'par-1', 'mover-left')",
      },
      name: {
        type: "string",
        description:
          "Human-readable name (e.g., 'Front Wash Left', 'Center Spot')",
      },
      profileManufacturer: {
        type: "string",
        description:
          "Manufacturer of the fixture profile to use (must match a registered profile)",
      },
      profileModel: {
        type: "string",
        description:
          "Model of the fixture profile to use (must match a registered profile)",
      },
      universe: {
        type: "number",
        description: "DMX universe number (positive integer, typically 1-based)",
        minimum: 1,
      },
      startAddress: {
        type: "number",
        description: "DMX start address (1-512)",
        minimum: 1,
        maximum: 512,
      },
    },
    required: ["id", "name", "profileManufacturer", "profileModel", "universe", "startAddress"],
  },
};

// ── unpatch_fixture ────────────────────────────────────────────

export const UNPATCH_FIXTURE_TOOL = {
  name: "unpatch_fixture",
  description:
    "Remove a fixture from the DMX patch. " +
    "Frees the DMX address range so it can be used by another fixture.",
  inputSchema: {
    type: "object" as const,
    properties: {
      id: {
        type: "string",
        description: "ID of the fixture to unpatch",
      },
    },
    required: ["id"],
  },
};

// ── list_fixtures ──────────────────────────────────────────────

export const LIST_FIXTURES_TOOL = {
  name: "list_fixtures",
  description:
    "List all patched fixtures. Optionally filter by DMX universe.",
  inputSchema: {
    type: "object" as const,
    properties: {
      universe: {
        type: "number",
        description:
          "Optional: filter fixtures by universe number. Omit to list all fixtures.",
        minimum: 1,
      },
    },
    required: [],
  },
};

// ── list_fixture_profiles ──────────────────────────────────────

export const LIST_FIXTURE_PROFILES_TOOL = {
  name: "list_fixture_profiles",
  description:
    "List all available fixture profiles (built-in and custom). " +
    "Profiles define the channel layout of fixture types.",
  inputSchema: {
    type: "object" as const,
    properties: {},
    required: [],
  },
};
```

### 2. Implement Tool Handlers

Add handler functions for each tool.

```typescript
// Add to src/fixtures/tools.ts

type ToolResponse = {
  content: Array<{ type: "text"; text: string }>;
  isError?: boolean;
};

function successResponse(data: unknown): ToolResponse {
  return {
    content: [
      {
        type: "text",
        text: JSON.stringify(data, null, 2),
      },
    ],
  };
}

function errorResponse(error: string): ToolResponse {
  return {
    content: [
      {
        type: "text",
        text: JSON.stringify({ success: false, error }, null, 2),
      },
    ],
    isError: true,
  };
}

// ── patch_fixture handler ──────────────────────────────────────

export interface PatchFixtureInput {
  id: string;
  name: string;
  profileManufacturer: string;
  profileModel: string;
  universe: number;
  startAddress: number;
}

export function handlePatchFixture(
  input: PatchFixtureInput,
  manager: FixtureManager,
  registry: ProfileRegistry
): ToolResponse {
  // Look up the profile
  const profile = registry.get(input.profileManufacturer, input.profileModel);
  if (!profile) {
    return errorResponse(
      `Profile not found: "${input.profileManufacturer} ${input.profileModel}". ` +
        `Use list_fixture_profiles to see available profiles, ` +
        `or create_fixture_profile to define a new one.`
    );
  }

  const result = manager.patchFixture({
    id: input.id,
    name: input.name,
    profile,
    universe: input.universe,
    startAddress: input.startAddress,
  });

  if (!result.success) {
    return errorResponse(result.error!);
  }

  const fixture = result.fixture!;
  return successResponse({
    success: true,
    fixture: {
      id: fixture.id,
      name: fixture.name,
      universe: fixture.universe,
      startAddress: fixture.startAddress,
      channelCount: fixture.profile.channels.length,
      addressRange: `${fixture.startAddress}-${fixture.startAddress + fixture.profile.channels.length - 1}`,
      profile: `${fixture.profile.manufacturer} ${fixture.profile.model}`,
      channels: fixture.profile.channels.map((ch, i) => ({
        address: fixture.startAddress + i,
        name: ch.name,
        type: ch.type,
      })),
    },
  });
}

// ── unpatch_fixture handler ────────────────────────────────────

export function handleUnpatchFixture(
  input: { id: string },
  manager: FixtureManager
): ToolResponse {
  const result = manager.unpatchFixture(input.id);

  if (!result.success) {
    return errorResponse(result.error!);
  }

  return successResponse({
    success: true,
    message: `Fixture "${result.fixture!.name}" (${result.fixture!.id}) unpatched from universe ${result.fixture!.universe}, address ${result.fixture!.startAddress}`,
  });
}

// ── list_fixtures handler ──────────────────────────────────────

export function handleListFixtures(
  input: { universe?: number },
  manager: FixtureManager
): ToolResponse {
  const fixtures = manager.listFixtures(input.universe);

  return successResponse({
    success: true,
    count: fixtures.length,
    universe: input.universe ?? "all",
    fixtures: fixtures.map((f) => ({
      id: f.id,
      name: f.name,
      universe: f.universe,
      startAddress: f.startAddress,
      channelCount: f.profile.channels.length,
      addressRange: `${f.startAddress}-${f.startAddress + f.profile.channels.length - 1}`,
      profile: `${f.profile.manufacturer} ${f.profile.model}`,
    })),
  });
}

// ── list_fixture_profiles handler ──────────────────────────────

export function handleListFixtureProfiles(
  registry: ProfileRegistry
): ToolResponse {
  const profiles = registry.list();

  return successResponse({
    success: true,
    count: profiles.length,
    profiles: profiles.map((p) => ({
      manufacturer: p.manufacturer,
      model: p.model,
      channelCount: p.channels.length,
      channels: p.channels.map((ch) => ({
        name: ch.name,
        type: ch.type,
      })),
    })),
  });
}
```

### 3. Create a Tool Router

Add a centralized tool router that dispatches `tools/call` requests to the appropriate handler.

```typescript
// Add to src/fixtures/tools.ts

export const ALL_FIXTURE_TOOLS = [
  PATCH_FIXTURE_TOOL,
  UNPATCH_FIXTURE_TOOL,
  LIST_FIXTURES_TOOL,
  LIST_FIXTURE_PROFILES_TOOL,
  CREATE_FIXTURE_PROFILE_TOOL,
];

export function routeFixtureTool(
  toolName: string,
  args: Record<string, unknown>,
  manager: FixtureManager,
  registry: ProfileRegistry
): ToolResponse | null {
  switch (toolName) {
    case "patch_fixture":
      return handlePatchFixture(
        args as unknown as PatchFixtureInput,
        manager,
        registry
      );

    case "unpatch_fixture":
      return handleUnpatchFixture(
        args as unknown as { id: string },
        manager
      );

    case "list_fixtures":
      return handleListFixtures(
        args as unknown as { universe?: number },
        manager
      );

    case "list_fixture_profiles":
      return handleListFixtureProfiles(registry);

    case "create_fixture_profile":
      return handleCreateFixtureProfile(
        args as unknown as CreateFixtureProfileInput,
        registry
      );

    default:
      return null; // Not a fixture tool
  }
}
```

### 4. Register Tools with the MCP Server

Update `src/server.ts` (or wherever the MCP server is configured) to register the fixture tools.

```typescript
// In src/server.ts (or src/index.ts)

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { FixtureManager } from "./fixtures/manager.js";
import { ProfileRegistry } from "./fixtures/profiles.js";
import {
  ALL_FIXTURE_TOOLS,
  routeFixtureTool,
} from "./fixtures/tools.js";

// Initialize fixture subsystem
const profileRegistry = new ProfileRegistry();
const fixtureManager = new FixtureManager();

// Register built-in profiles (from Task 11)
// initializeBuiltInProfiles(profileRegistry);

// Handle tools/list
server.setRequestHandler(ListToolsRequestSchema, async () => {
  return {
    tools: [
      ...ALL_FIXTURE_TOOLS,
      // ... future tool groups will be added here
    ],
  };
});

// Handle tools/call
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  // Try fixture tools first
  const fixtureResult = routeFixtureTool(
    name,
    args ?? {},
    fixtureManager,
    profileRegistry
  );
  if (fixtureResult) {
    return fixtureResult;
  }

  // ... future tool groups will be checked here

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

### 5. Verify Compilation and Tool Discovery

```bash
npm run typecheck
```

To manually test tool discovery, start the server and send a `tools/list` request (or use the MCP Inspector if available).

---

## Verification

- [ ] All 5 tool schemas are defined with correct names, descriptions, and input schemas
- [ ] `tools/list` request returns all 5 fixture tools
- [ ] `tools/call` with `patch_fixture` correctly patches a fixture
- [ ] `tools/call` with `patch_fixture` returns error for unknown profile
- [ ] `tools/call` with `patch_fixture` returns error for address collision
- [ ] `tools/call` with `unpatch_fixture` correctly removes a fixture
- [ ] `tools/call` with `unpatch_fixture` returns error for unknown fixture ID
- [ ] `tools/call` with `list_fixtures` returns all patched fixtures
- [ ] `tools/call` with `list_fixtures` filters by universe when provided
- [ ] `tools/call` with `list_fixture_profiles` returns all registered profiles
- [ ] `tools/call` with `create_fixture_profile` creates and registers a new profile
- [ ] `tools/call` with unknown tool name returns an error response
- [ ] All tool responses use the MCP response format: `{ content: [{ type: "text", text: "..." }] }`
- [ ] `npm run typecheck` passes

---

## Notes

- The `routeFixtureTool()` function returns `null` for unknown tool names, allowing the server to chain multiple tool routers (fixture tools, scene tools, cue tools, etc.) as the project grows.
- Tool inputs are cast using `as unknown as T` because MCP tool arguments come as `Record<string, unknown>`. In production, you might add runtime validation with zod, but for this milestone the JSON Schema validation on the MCP side provides the first layer of defense.
- The `profileRegistry` and `fixtureManager` are initialized at server startup and live for the lifetime of the server process. State is in-memory only -- show persistence is a later milestone.
- The `successResponse()` and `errorResponse()` helpers standardize the response format and should be used by all tool handlers going forward.
- The server registration code in Step 4 shows the integration point. The exact file and structure depend on what was created in M1 Task 2 (MCP Server Scaffold). Adapt as needed.

---

**Next Task**: [Task 11: Add Built-in Fixture Profiles](task-11-built-in-fixture-profiles.md)
**Related Design Docs**: [DMX Lighting MCP Design](../../design/local.dmx-lighting-mcp.md)
