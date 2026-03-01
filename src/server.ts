import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";

import { OLAClient } from "./ola/client.js";
import {
  ProfileRegistry,
  initializeBuiltInProfiles,
  isValidChannelType,
} from "./fixtures/profiles.js";
import type { ChannelType, ChannelDefinition, FixtureProfile } from "./types/index.js";
import { FixtureManager } from "./fixtures/manager.js";
import { setFixtureColor, blackout } from "./playback/live-control.js";
import { SceneManager } from "./scenes/manager.js";
import {
  handlePreviewScene,
  handleCreateScene,
  handleUpdateScene,
  handleDeleteScene,
  handleListScenes,
  formatPreviewResult,
} from "./scenes/tools.js";

export function createServer() {
  const olaHost = process.env.OLA_HOST ?? "localhost";
  const olaPort = process.env.OLA_PORT ?? "9090";

  const olaClient = new OLAClient({
    baseUrl: `http://${olaHost}:${olaPort}`,
  });

  const profileRegistry = new ProfileRegistry();
  initializeBuiltInProfiles(profileRegistry);

  const fixtureManager = new FixtureManager(profileRegistry);
  const sceneManager = new SceneManager(fixtureManager);

  const server = new McpServer({
    name: "dmx-mcp",
    version: "0.1.0",
  });

  // --- Fixture Tools ---

  server.tool(
    "patch_fixture",
    "Add a fixture to a DMX universe at a specific address. Use list_fixture_profiles to see available profiles.",
    {
      id: z.string().describe("Unique fixture ID (e.g. 'front-wash', 'par-1')"),
      name: z.string().describe("Human-readable name (e.g. 'Front Wash Left')"),
      profileId: z
        .string()
        .describe("Profile ID (e.g. 'generic-rgb-par'). Use list_fixture_profiles to see options."),
      universe: z.number().describe("DMX universe number (1-based)"),
      startAddress: z.number().describe("DMX start address (1-512)"),
      mode: z
        .string()
        .optional()
        .describe("Fixture mode name (defaults to first mode in profile)"),
    },
    async (args) => {
      try {
        const fixture = fixtureManager.patchFixture(args);
        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify(
                {
                  success: true,
                  fixture: {
                    id: fixture.id,
                    name: fixture.name,
                    profile: `${fixture.profile.manufacturer} ${fixture.profile.model}`,
                    universe: fixture.universe,
                    startAddress: fixture.startAddress,
                    mode: fixture.mode,
                  },
                },
                null,
                2,
              ),
            },
          ],
        };
      } catch (err) {
        return {
          content: [
            { type: "text" as const, text: `Error: ${(err as Error).message}` },
          ],
          isError: true,
        };
      }
    },
  );

  server.tool(
    "unpatch_fixture",
    "Remove a patched fixture by its ID.",
    {
      id: z.string().describe("ID of the fixture to remove"),
    },
    async (args) => {
      const removed = fixtureManager.unpatchFixture(args.id);
      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify({
              success: removed,
              message: removed
                ? `Fixture "${args.id}" removed`
                : `Fixture "${args.id}" not found`,
            }),
          },
        ],
      };
    },
  );

  server.tool(
    "list_fixtures",
    "List all patched fixtures with their profiles, universes, and DMX addresses.",
    {},
    async () => {
      const fixtures = fixtureManager.listFixtures().map((f) => ({
        id: f.id,
        name: f.name,
        profile: `${f.profile.manufacturer} ${f.profile.model}`,
        universe: f.universe,
        startAddress: f.startAddress,
        mode: f.mode,
      }));
      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify({ fixtures, count: fixtures.length }, null, 2),
          },
        ],
      };
    },
  );

  server.tool(
    "list_fixture_profiles",
    "List all available fixture profiles that can be used when patching fixtures.",
    {},
    async () => {
      const profiles = profileRegistry.list().map((p) => ({
        id: p.id,
        manufacturer: p.manufacturer,
        model: p.model,
        modes: p.modes.map((m) => ({
          name: m.name,
          channels: m.channelCount,
        })),
        channels: p.channels.map((c) => ({
          name: c.name,
          type: c.type,
        })),
      }));
      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify(
              { profiles, count: profiles.length },
              null,
              2,
            ),
          },
        ],
      };
    },
  );

  server.tool(
    "create_fixture_profile",
    "Define a custom fixture profile with channel definitions. Profiles describe the DMX channel layout of a lighting fixture.",
    {
      id: z.string().describe("Unique profile ID (e.g. 'chauvet-slimpar-pro')"),
      manufacturer: z.string().describe("Manufacturer name (e.g. 'Chauvet', 'ADJ', 'Generic')"),
      model: z.string().describe("Model name (e.g. 'SlimPAR Pro H')"),
      channels: z
        .array(
          z.object({
            name: z.string().describe("Channel name (e.g. 'red', 'dimmer')"),
            type: z
              .enum([
                "dimmer", "red", "green", "blue", "white", "amber", "uv",
                "pan", "tilt", "pan_fine", "tilt_fine",
                "gobo", "strobe", "speed", "macro", "control",
              ])
              .describe("Channel type"),
            defaultValue: z.number().min(0).max(255).optional().describe("Default DMX value (0-255). Defaults to 0."),
          }),
        )
        .min(1)
        .describe("Ordered list of DMX channel definitions"),
    },
    async (args) => {
      try {
        if (profileRegistry.has(args.id)) {
          return {
            content: [{ type: "text" as const, text: `Error: Profile "${args.id}" already exists` }],
            isError: true,
          };
        }

        const channels: ChannelDefinition[] = args.channels.map((ch) => ({
          name: ch.name,
          type: ch.type as ChannelType,
          defaultValue: ch.defaultValue ?? 0,
          min: 0,
          max: 255,
        }));

        const channelNames = channels.map((c) => c.name);

        const profile: FixtureProfile = {
          id: args.id,
          manufacturer: args.manufacturer,
          model: args.model,
          channels,
          modes: [
            {
              name: "default",
              channelCount: channels.length,
              channels: channelNames,
            },
          ],
        };

        profileRegistry.register(profile);

        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify(
                {
                  success: true,
                  profile: {
                    id: profile.id,
                    manufacturer: profile.manufacturer,
                    model: profile.model,
                    channelCount: profile.channels.length,
                    channels: profile.channels.map((ch, i) => ({
                      offset: i,
                      name: ch.name,
                      type: ch.type,
                    })),
                  },
                },
                null,
                2,
              ),
            },
          ],
        };
      } catch (err) {
        return {
          content: [{ type: "text" as const, text: `Error: ${(err as Error).message}` }],
          isError: true,
        };
      }
    },
  );

  // --- Scene Tools ---

  server.tool(
    "create_scene",
    "Create a new lighting scene with fixture states. Each fixture state maps channel names (red, green, blue, dimmer, etc.) to values (0-255). Fixture IDs must reference patched fixtures.",
    {
      id: z.string().describe("Unique scene ID (e.g. 'warm-wash', 'blue-chase-start')"),
      name: z.string().describe("Human-readable scene name (e.g. 'Warm Wash', 'Blue Chase Start')"),
      fixtureStates: z
        .record(
          z.string(),
          z.record(z.string(), z.number().min(0).max(255)),
        )
        .describe(
          'Map of fixture ID to channel values. Example: { "par-1": { "red": 255, "green": 128, "blue": 0 } }',
        ),
    },
    async (args) => {
      try {
        const result = handleCreateScene(
          args.id,
          args.name,
          args.fixtureStates,
          sceneManager,
        );
        return {
          content: [
            { type: "text" as const, text: JSON.stringify(result, null, 2) },
          ],
        };
      } catch (err) {
        return {
          content: [
            { type: "text" as const, text: `Error: ${(err as Error).message}` },
          ],
          isError: true,
        };
      }
    },
  );

  server.tool(
    "update_scene",
    "Update an existing scene by merging new fixture states. Only the specified channels are changed; other existing channels are preserved.",
    {
      id: z.string().describe("ID of the scene to update"),
      fixtureStates: z
        .record(
          z.string(),
          z.record(z.string(), z.number().min(0).max(255)),
        )
        .describe(
          'Map of fixture ID to channel values to merge. Example: { "par-1": { "red": 200 } } updates only the red channel.',
        ),
    },
    async (args) => {
      try {
        const result = handleUpdateScene(
          args.id,
          args.fixtureStates,
          sceneManager,
        );
        return {
          content: [
            { type: "text" as const, text: JSON.stringify(result, null, 2) },
          ],
        };
      } catch (err) {
        return {
          content: [
            { type: "text" as const, text: `Error: ${(err as Error).message}` },
          ],
          isError: true,
        };
      }
    },
  );

  server.tool(
    "delete_scene",
    "Delete a scene by its ID. This action cannot be undone.",
    {
      id: z.string().describe("ID of the scene to delete"),
    },
    async (args) => {
      try {
        const result = handleDeleteScene(args.id, sceneManager);
        return {
          content: [
            { type: "text" as const, text: JSON.stringify(result, null, 2) },
          ],
        };
      } catch (err) {
        return {
          content: [
            { type: "text" as const, text: `Error: ${(err as Error).message}` },
          ],
          isError: true,
        };
      }
    },
  );

  server.tool(
    "list_scenes",
    "List all scenes with summary information including ID, name, and fixture count.",
    {},
    async () => {
      const result = handleListScenes(sceneManager);
      return {
        content: [
          { type: "text" as const, text: JSON.stringify(result, null, 2) },
        ],
      };
    },
  );

  server.tool(
    "preview_scene",
    "Output a scene to DMX in real-time through OLA. The lights will immediately change to reflect the scene. Requires OLA to be running and connected to DMX hardware.",
    {
      sceneId: z.string().describe("ID of the scene to preview"),
    },
    async (args) => {
      try {
        const result = await handlePreviewScene(
          args.sceneId,
          sceneManager,
          fixtureManager,
          olaClient,
        );
        return {
          content: [
            { type: "text" as const, text: formatPreviewResult(result) },
          ],
        };
      } catch (err) {
        return {
          content: [
            { type: "text" as const, text: `Error: ${(err as Error).message}` },
          ],
          isError: true,
        };
      }
    },
  );

  // --- Playback / Live Control Tools ---

  server.tool(
    "set_fixture_color",
    "Set a fixture's color by specifying RGB (and optionally W) values 0-255. The fixture must be patched and have color channels.",
    {
      fixtureId: z.string().describe("ID of the patched fixture"),
      red: z.number().min(0).max(255).optional().describe("Red value (0-255)"),
      green: z
        .number()
        .min(0)
        .max(255)
        .optional()
        .describe("Green value (0-255)"),
      blue: z
        .number()
        .min(0)
        .max(255)
        .optional()
        .describe("Blue value (0-255)"),
      white: z
        .number()
        .min(0)
        .max(255)
        .optional()
        .describe("White value (0-255), for RGBW fixtures"),
    },
    async (args) => {
      try {
        const result = await setFixtureColor(
          args,
          fixtureManager,
          olaClient,
        );
        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify({ success: true, ...result }, null, 2),
            },
          ],
        };
      } catch (err) {
        return {
          content: [
            { type: "text" as const, text: `Error: ${(err as Error).message}` },
          ],
          isError: true,
        };
      }
    },
  );

  server.tool(
    "blackout",
    "Set all DMX channels to zero on all universes with patched fixtures.",
    {},
    async () => {
      try {
        const result = await blackout(fixtureManager, olaClient);
        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify({ success: true, ...result }, null, 2),
            },
          ],
        };
      } catch (err) {
        return {
          content: [
            { type: "text" as const, text: `Error: ${(err as Error).message}` },
          ],
          isError: true,
        };
      }
    },
  );

  return server;
}

export async function startServer(): Promise<void> {
  const server = createServer();
  const transport = new StdioServerTransport();
  await server.connect(transport);
}
