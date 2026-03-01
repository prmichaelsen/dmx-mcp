import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";

import { OLAClient } from "./ola/client.js";
import {
  ProfileRegistry,
  initializeBuiltInProfiles,
} from "./fixtures/profiles.js";
import { FixtureManager } from "./fixtures/manager.js";
import { setFixtureColor, blackout } from "./playback/live-control.js";

export function createServer() {
  const olaHost = process.env.OLA_HOST ?? "localhost";
  const olaPort = process.env.OLA_PORT ?? "9090";

  const olaClient = new OLAClient({
    baseUrl: `http://${olaHost}:${olaPort}`,
  });

  const profileRegistry = new ProfileRegistry();
  initializeBuiltInProfiles(profileRegistry);

  const fixtureManager = new FixtureManager(profileRegistry);

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
