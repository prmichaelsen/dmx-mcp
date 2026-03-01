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
import {
  setFixtureColor,
  setFixtureDimmer,
  getDMXState,
  formatDMXStateResult,
  blackout,
} from "./playback/live-control.js";
import { FadeEngine } from "./cues/fade-engine.js";
import { CueSequencer } from "./playback/sequencer.js";
import { SceneManager } from "./scenes/manager.js";
import {
  handlePreviewScene,
  handleCreateScene,
  handleUpdateScene,
  handleDeleteScene,
  handleListScenes,
  formatPreviewResult,
} from "./scenes/tools.js";
import { CueManager } from "./cues/manager.js";
import {
  handleCreateCueList,
  handleAddCue,
  handleRemoveCue,
  handleReorderCues,
  handleListCueLists,
  handleDeleteCueList,
} from "./cues/tools.js";
import type { AddCueInput } from "./cues/tools.js";

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
  const cueManager = new CueManager(sceneManager);
  const fadeEngine = new FadeEngine();
  const sequencer = new CueSequencer({
    olaClient,
    sceneManager,
    fixtureManager,
    fadeEngine,
    cueManager,
  });

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

  // --- Cue Management Tools ---

  server.tool(
    "create_cue_list",
    "Create a new cue list for sequencing lighting scenes. A cue list contains an ordered sequence of cues, each referencing a scene with timing parameters.",
    {
      id: z.string().describe("Unique cue list ID (e.g. 'main-show', 'intro-sequence')"),
      name: z.string().describe("Human-readable name (e.g. 'Main Show', 'Intro Sequence')"),
      loop: z.boolean().optional().describe("Whether the cue list loops after the last cue (default: false)"),
    },
    async (args) => {
      try {
        const result = handleCreateCueList(args.id, args.name, args.loop, cueManager);
        return {
          content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }],
        };
      } catch (err) {
        return {
          content: [{ type: "text" as const, text: `Error: ${(err as Error).message}` }],
          isError: true,
        };
      }
    },
  );

  server.tool(
    "add_cue",
    "Add a cue to a cue list. A cue references a scene and specifies fade-in, hold, and fade-out timing in milliseconds.",
    {
      cue_list_id: z.string().describe("ID of the cue list to add the cue to"),
      id: z.string().describe("Unique cue ID within the cue list"),
      name: z.string().describe("Human-readable cue name (e.g. 'Opening Red', 'Blackout')"),
      scene_id: z.string().describe("ID of the scene this cue activates"),
      fade_in_ms: z.number().min(0).describe("Fade-in duration in milliseconds"),
      hold_ms: z.number().min(0).describe("Hold duration in milliseconds (how long the scene stays at full)"),
      fade_out_ms: z.number().min(0).describe("Fade-out duration in milliseconds"),
    },
    async (args) => {
      try {
        const cueInput: AddCueInput = {
          id: args.id,
          name: args.name,
          scene_id: args.scene_id,
          fade_in_ms: args.fade_in_ms,
          hold_ms: args.hold_ms,
          fade_out_ms: args.fade_out_ms,
        };
        const result = handleAddCue(args.cue_list_id, cueInput, cueManager);
        return {
          content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }],
        };
      } catch (err) {
        return {
          content: [{ type: "text" as const, text: `Error: ${(err as Error).message}` }],
          isError: true,
        };
      }
    },
  );

  server.tool(
    "remove_cue",
    "Remove a cue from a cue list by its ID.",
    {
      cue_list_id: z.string().describe("ID of the cue list"),
      cue_id: z.string().describe("ID of the cue to remove"),
    },
    async (args) => {
      try {
        const result = handleRemoveCue(args.cue_list_id, args.cue_id, cueManager);
        return {
          content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }],
        };
      } catch (err) {
        return {
          content: [{ type: "text" as const, text: `Error: ${(err as Error).message}` }],
          isError: true,
        };
      }
    },
  );

  server.tool(
    "reorder_cues",
    "Reorder cues within a cue list by providing the complete list of cue IDs in the desired order. All existing cue IDs must be included.",
    {
      cue_list_id: z.string().describe("ID of the cue list"),
      cue_ids: z.array(z.string()).describe("Ordered array of all cue IDs in the desired sequence"),
    },
    async (args) => {
      try {
        const result = handleReorderCues(args.cue_list_id, args.cue_ids, cueManager);
        return {
          content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }],
        };
      } catch (err) {
        return {
          content: [{ type: "text" as const, text: `Error: ${(err as Error).message}` }],
          isError: true,
        };
      }
    },
  );

  server.tool(
    "list_cue_lists",
    "List all cue lists with summary information including ID, name, cue count, and loop setting.",
    {},
    async () => {
      const result = handleListCueLists(cueManager);
      return {
        content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }],
      };
    },
  );

  server.tool(
    "delete_cue_list",
    "Delete a cue list by its ID. This action cannot be undone.",
    {
      id: z.string().describe("ID of the cue list to delete"),
    },
    async (args) => {
      try {
        const result = handleDeleteCueList(args.id, cueManager);
        return {
          content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }],
        };
      } catch (err) {
        return {
          content: [{ type: "text" as const, text: `Error: ${(err as Error).message}` }],
          isError: true,
        };
      }
    },
  );

  // --- Playback / Sequencer Tools ---

  server.tool(
    "set_fixture_dimmer",
    "Set a fixture's dimmer intensity. Level is 0-255 (absolute) or 0.0-1.0 with unit='percent'. Requires a dedicated dimmer channel. For RGB-only fixtures, use set_fixture_color to control brightness.",
    {
      fixtureId: z.string().describe("ID of the patched fixture"),
      level: z.number().describe("Dimmer level. 0-255 for absolute, 0.0-1.0 for percent mode."),
      unit: z
        .enum(["absolute", "percent"])
        .optional()
        .describe("Unit for the level value. Default: 'absolute' (0-255)."),
    },
    async (args) => {
      try {
        const result = await setFixtureDimmer(
          { fixtureId: args.fixtureId, level: args.level, unit: args.unit },
          fixtureManager,
          olaClient,
        );
        return {
          content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }],
          isError: !result.success ? true : undefined,
        };
      } catch (err) {
        return {
          content: [{ type: "text" as const, text: `Error: ${(err as Error).message}` }],
          isError: true,
        };
      }
    },
  );

  server.tool(
    "get_dmx_state",
    "Read current DMX output values from OLA for a given universe. Returns all 512 channel values. Optionally provide a fixtureId to get labeled channel values (e.g., red=255, green=128).",
    {
      universe: z.number().describe("DMX universe number to read (1-based)"),
      fixtureId: z
        .string()
        .optional()
        .describe("Optional fixture ID to extract and label channels for."),
    },
    async (args) => {
      try {
        const result = await getDMXState(
          { universe: args.universe, fixtureId: args.fixtureId },
          olaClient,
          fixtureManager,
        );
        const text = formatDMXStateResult(result);
        return {
          content: [{ type: "text" as const, text }],
          isError: !result.success ? true : undefined,
        };
      } catch (err) {
        return {
          content: [{ type: "text" as const, text: `Error: ${(err as Error).message}` }],
          isError: true,
        };
      }
    },
  );

  server.tool(
    "go_cue",
    "Advance to the next cue in the active cue list, or start a new cue list by providing cue_list_id. If the list loops and you are at the last cue, wraps to the first.",
    {
      cue_list_id: z
        .string()
        .optional()
        .describe("ID of the cue list to start. On subsequent calls, omit to advance the active list."),
    },
    async (args) => {
      try {
        if (args.cue_list_id) {
          await sequencer.start(args.cue_list_id);
        } else {
          await sequencer.goCue();
        }
        const state = sequencer.getState();
        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify(
                { success: true, action: args.cue_list_id ? "started" : "advanced", ...state },
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

  server.tool(
    "go_to_cue",
    "Jump to a specific cue by ID within the active cue list. Cancels any in-progress fade and immediately starts the target cue.",
    {
      cue_id: z.string().describe("ID of the cue to jump to within the active cue list"),
    },
    async (args) => {
      try {
        await sequencer.goToCue(args.cue_id);
        const state = sequencer.getState();
        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify(
                { success: true, action: "jumped", targetCueId: args.cue_id, ...state },
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

  server.tool(
    "stop_playback",
    "Stop cue list playback. Cancels any active fade and holds the current DMX state. Lights remain at their current values.",
    {},
    async () => {
      sequencer.stop();
      const state = sequencer.getState();
      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify({ success: true, action: "stopped", ...state }, null, 2),
          },
        ],
      };
    },
  );

  return server;
}

export async function startServer(): Promise<void> {
  const server = createServer();
  const transport = new StdioServerTransport();
  await server.connect(transport);
}
