# Task 9: Implement create_fixture_profile Tool

**Milestone**: [M2 - Fixture Management](../../milestones/milestone-2-fixture-management.md)
**Estimated Time**: 1 hour
**Dependencies**: Task 7 (Fixture Profile Models)
**Status**: Not Started

---

## Objective

Implement an MCP tool called `create_fixture_profile` that lets agents define custom fixture profiles with channel definitions. This tool allows agents to describe any fixture type -- from a simple single-channel dimmer to a complex moving head with dozens of channels -- and register it for use with the patching system.

---

## Context

Not all fixtures are covered by the built-in profiles (Task 11). Agents need the ability to define custom profiles for specific fixtures in their lighting rig. For example, a particular brand of LED bar might have 7 channels: dimmer, red, green, blue, strobe, macro, and speed. The `create_fixture_profile` tool accepts a profile definition from the agent, validates it, and registers it in the ProfileRegistry so it can be used with `patch_fixture`.

This tool is the first MCP tool implementation in the project and establishes the pattern for all subsequent tool implementations.

---

## Steps

### 1. Create the Fixture Tools Module

```bash
touch src/fixtures/tools.ts
```

### 2. Define the Tool Schema

Define the input schema for the `create_fixture_profile` tool. This uses JSON Schema format as required by the MCP protocol.

```typescript
// src/fixtures/tools.ts

import { FixtureProfile, ChannelDefinition, ChannelType } from "../types/index.js";
import {
  ProfileRegistry,
  validateProfile,
  isValidChannelType,
} from "./profiles.js";

export const CREATE_FIXTURE_PROFILE_TOOL = {
  name: "create_fixture_profile",
  description:
    "Define a custom fixture profile with channel definitions. " +
    "Profiles describe the DMX channel layout of a lighting fixture, " +
    "specifying each channel's name, type, default value, and value range.",
  inputSchema: {
    type: "object" as const,
    properties: {
      name: {
        type: "string",
        description: "Display name for this profile (e.g., 'My LED Par')",
      },
      manufacturer: {
        type: "string",
        description:
          "Manufacturer name (e.g., 'Chauvet', 'ADJ', 'Generic')",
      },
      model: {
        type: "string",
        description:
          "Model name (e.g., 'SlimPAR Pro H', 'Mega Hex Par')",
      },
      channels: {
        type: "array",
        description: "Ordered list of DMX channel definitions",
        items: {
          type: "object",
          properties: {
            name: {
              type: "string",
              description:
                "Channel name (e.g., 'red', 'dimmer', 'pan')",
            },
            type: {
              type: "string",
              description:
                "Channel type. One of: dimmer, red, green, blue, white, amber, uv, pan, tilt, pan_fine, tilt_fine, gobo, strobe, speed, macro, control",
              enum: [
                "dimmer",
                "red", "green", "blue", "white", "amber", "uv",
                "pan", "tilt", "pan_fine", "tilt_fine",
                "gobo", "strobe", "speed", "macro", "control",
              ],
            },
            defaultValue: {
              type: "number",
              description: "Default DMX value (0-255). Defaults to 0.",
              minimum: 0,
              maximum: 255,
            },
            min: {
              type: "number",
              description:
                "Minimum DMX value (0-255). Defaults to 0.",
              minimum: 0,
              maximum: 255,
            },
            max: {
              type: "number",
              description:
                "Maximum DMX value (0-255). Defaults to 255.",
              minimum: 0,
              maximum: 255,
            },
          },
          required: ["name", "type"],
        },
        minItems: 1,
      },
    },
    required: ["manufacturer", "model", "channels"],
  },
};
```

### 3. Implement the Tool Handler

```typescript
export interface CreateFixtureProfileInput {
  name?: string;
  manufacturer: string;
  model: string;
  channels: Array<{
    name: string;
    type: string;
    defaultValue?: number;
    min?: number;
    max?: number;
  }>;
}

export function handleCreateFixtureProfile(
  input: CreateFixtureProfileInput,
  registry: ProfileRegistry
): { content: Array<{ type: "text"; text: string }>; isError?: boolean } {
  // Build channel definitions with defaults
  const channels: ChannelDefinition[] = input.channels.map((ch) => {
    // Validate channel type
    if (!isValidChannelType(ch.type)) {
      throw new Error(
        `Invalid channel type "${ch.type}" for channel "${ch.name}"`
      );
    }

    return {
      name: ch.name,
      type: ch.type as ChannelType,
      defaultValue: ch.defaultValue ?? 0,
      min: ch.min ?? 0,
      max: ch.max ?? 255,
    };
  });

  const profile: FixtureProfile = {
    manufacturer: input.manufacturer,
    model: input.model,
    channels,
    modes: [], // Modes support is deferred to a future task
  };

  // Validate the profile
  const errors = validateProfile(profile);
  if (errors.length > 0) {
    return {
      content: [
        {
          type: "text",
          text: JSON.stringify(
            {
              success: false,
              error: "Profile validation failed",
              details: errors,
            },
            null,
            2
          ),
        },
      ],
      isError: true,
    };
  }

  // Check if profile already exists
  if (registry.has(input.manufacturer, input.model)) {
    return {
      content: [
        {
          type: "text",
          text: JSON.stringify(
            {
              success: false,
              error: `Profile "${input.manufacturer} ${input.model}" already exists`,
            },
            null,
            2
          ),
        },
      ],
      isError: true,
    };
  }

  // Register the profile
  try {
    registry.register(profile);
  } catch (err) {
    return {
      content: [
        {
          type: "text",
          text: JSON.stringify(
            {
              success: false,
              error:
                err instanceof Error
                  ? err.message
                  : "Failed to register profile",
            },
            null,
            2
          ),
        },
      ],
      isError: true,
    };
  }

  return {
    content: [
      {
        type: "text",
        text: JSON.stringify(
          {
            success: true,
            profile: {
              manufacturer: profile.manufacturer,
              model: profile.model,
              channelCount: profile.channels.length,
              channels: profile.channels.map((ch, i) => ({
                offset: i,
                name: ch.name,
                type: ch.type,
                defaultValue: ch.defaultValue,
                range: `${ch.min}-${ch.max}`,
              })),
            },
          },
          null,
          2
        ),
      },
    ],
  };
}
```

### 4. Update the Barrel File

```typescript
// src/fixtures/index.ts
export * from "./profiles.js";
export * from "./manager.js";
export * from "./tools.js";
```

### 5. Verify Compilation

```bash
npm run typecheck
```

---

## Verification

- [ ] `src/fixtures/tools.ts` exists and compiles without errors
- [ ] `CREATE_FIXTURE_PROFILE_TOOL` schema defines all required fields (manufacturer, model, channels)
- [ ] `CREATE_FIXTURE_PROFILE_TOOL` schema specifies channel type as an enum of valid ChannelType values
- [ ] `handleCreateFixtureProfile()` applies default values (defaultValue=0, min=0, max=255) when omitted
- [ ] `handleCreateFixtureProfile()` rejects invalid channel types with an error response
- [ ] `handleCreateFixtureProfile()` rejects profiles that fail validation (e.g., empty channels array)
- [ ] `handleCreateFixtureProfile()` rejects duplicate profiles (same manufacturer + model)
- [ ] `handleCreateFixtureProfile()` returns the created profile with channel details on success
- [ ] Response format uses MCP tool response structure (`{ content: [{ type: "text", text: "..." }] }`)
- [ ] `npm run typecheck` passes

---

## Notes

- This is the first MCP tool implementation and sets the pattern for all others. The response format (`{ content: [{ type: "text", text: JSON.stringify(...) }] }`) is the standard MCP tool response format.
- The `name` input field is optional and currently unused beyond display purposes. The profile is keyed by manufacturer + model in the registry.
- The `modes` field on FixtureProfile is set to an empty array for now. Multi-mode fixture support (where a single fixture model has different channel layouts depending on a DIP switch setting) is a future enhancement.
- Channel defaults (defaultValue=0, min=0, max=255) make the tool easier to use -- agents only need to specify name and type for simple channels.
- The handler function is pure (no side effects beyond the registry) and receives the ProfileRegistry as a parameter, making it easy to test.

---

**Next Task**: [Task 10: Register Fixture MCP Tools](task-10-register-fixture-mcp-tools.md)
**Related Design Docs**: [DMX Lighting MCP Design](../../design/local.dmx-lighting-mcp.md)
