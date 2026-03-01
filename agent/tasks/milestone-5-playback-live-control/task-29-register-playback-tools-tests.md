# Task 29: Register Playback MCP Tools and Tests

**Milestone**: [M5 - Playback & Live Control](../../milestones/milestone-5-playback-live-control.md)
**Estimated Time**: 1.5 hours
**Dependencies**: Task 24 (CueSequencer), Task 25 (Blackout), Task 26 (set_fixture_color), Task 27 (set_fixture_dimmer), Task 28 (get_dmx_state)
**Status**: Not Started

---

## Objective

Register all 7 playback and live control tools with the MCP server (`go_cue`, `go_to_cue`, `stop`, `blackout`, `set_fixture_color`, `set_fixture_dimmer`, `get_dmx_state`), define their input schemas, wire them to handler functions, and write comprehensive unit tests for the sequencer and live control functions.

---

## Context

This is the integration task for Milestone 5. All the individual components -- CueSequencer (Task 24), blackout (Task 25), setFixtureColor (Task 26), setFixtureDimmer (Task 27), and getDMXState (Task 28) -- are implemented. This task wires them into the MCP server so the agent can call them as tools, and adds unit tests to verify correctness.

The MCP server (set up in Task 2) exposes tools via the `ListToolsRequestSchema` and `CallToolRequestSchema` handlers. Each tool needs a name, description, input schema (JSON Schema), and a handler function.

The 7 tools split into two groups:
1. **Sequencer tools** (`go_cue`, `go_to_cue`, `stop`): Drive cue list playback via the CueSequencer
2. **Live control tools** (`blackout`, `set_fixture_color`, `set_fixture_dimmer`, `get_dmx_state`): Direct fixture control and state reading

---

## Steps

### 1. Define Tool Schemas

Create the tool definitions for all 7 playback/live control tools:

```typescript
// Tool definitions to add to the MCP server's ListTools handler

const playbackTools = [
  {
    name: "go_cue",
    description:
      "Advance to the next cue in the active cue list. " +
      "If no cue list is active, use start_cue_list first to begin playback. " +
      "If the current cue list loops and you are at the last cue, wraps to the first cue. " +
      "If the list does not loop, stops playback at the end.",
    inputSchema: {
      type: "object" as const,
      properties: {
        cue_list_id: {
          type: "string",
          description:
            "ID of the cue list to play. Required on first call to start playback. " +
            "On subsequent calls, advances the already-active cue list (this parameter is optional).",
        },
      },
      required: [],
    },
  },
  {
    name: "go_to_cue",
    description:
      "Jump to a specific cue by ID within the active cue list. " +
      "Cancels any in-progress fade and immediately starts the target cue's fade. " +
      "A cue list must be active (started via go_cue with a cue_list_id).",
    inputSchema: {
      type: "object" as const,
      properties: {
        cue_id: {
          type: "string",
          description: "ID of the cue to jump to within the active cue list",
        },
      },
      required: ["cue_id"],
    },
  },
  {
    name: "stop",
    description:
      "Stop cue list playback. Cancels any active fade and holds the current DMX state. " +
      "Lights will remain at their current values. " +
      "Use go_cue to resume playback from the current position.",
    inputSchema: {
      type: "object" as const,
      properties: {},
      required: [],
    },
  },
  {
    name: "blackout",
    description:
      "Emergency blackout: set all DMX channels to 0 across all universes that have " +
      "patched fixtures. Also stops any active cue list playback. " +
      "All lights will turn off immediately.",
    inputSchema: {
      type: "object" as const,
      properties: {},
      required: [],
    },
  },
  {
    name: "set_fixture_color",
    description:
      "Directly set a fixture's color without creating a scene. " +
      "Works with RGB, RGBW, and RGBA fixtures. " +
      "Other channels (dimmer, position, etc.) are preserved. " +
      "For dimmer-only fixtures, use set_fixture_dimmer instead.",
    inputSchema: {
      type: "object" as const,
      properties: {
        fixture_id: {
          type: "string",
          description: "ID of the fixture to set",
        },
        red: {
          type: "number",
          minimum: 0,
          maximum: 255,
          description: "Red channel value (0-255)",
        },
        green: {
          type: "number",
          minimum: 0,
          maximum: 255,
          description: "Green channel value (0-255)",
        },
        blue: {
          type: "number",
          minimum: 0,
          maximum: 255,
          description: "Blue channel value (0-255)",
        },
        white: {
          type: "number",
          minimum: 0,
          maximum: 255,
          description: "Optional white channel (0-255) for RGBW fixtures",
        },
        amber: {
          type: "number",
          minimum: 0,
          maximum: 255,
          description: "Optional amber channel (0-255) for RGBA fixtures",
        },
        uv: {
          type: "number",
          minimum: 0,
          maximum: 255,
          description: "Optional UV channel (0-255) for RGBUV fixtures",
        },
      },
      required: ["fixture_id", "red", "green", "blue"],
    },
  },
  {
    name: "set_fixture_dimmer",
    description:
      "Directly set a fixture's dimmer intensity. " +
      "Set level as 0-255 (absolute) or 0.0-1.0 with unit='percent'. " +
      "Requires the fixture to have a dedicated dimmer channel. " +
      "For RGB-only fixtures, use set_fixture_color to control brightness.",
    inputSchema: {
      type: "object" as const,
      properties: {
        fixture_id: {
          type: "string",
          description: "ID of the fixture to set",
        },
        level: {
          type: "number",
          description:
            "Dimmer level. 0-255 for absolute mode, 0.0-1.0 for percent mode.",
        },
        unit: {
          type: "string",
          enum: ["absolute", "percent"],
          description:
            "Unit for the level value. Default: 'absolute' (0-255). " +
            "Use 'percent' for 0.0-1.0 range.",
        },
      },
      required: ["fixture_id", "level"],
    },
  },
  {
    name: "get_dmx_state",
    description:
      "Read current DMX output values from OLA for a given universe. " +
      "Returns all 512 channel values. " +
      "Optionally provide a fixture_id to get labeled channel values " +
      "(e.g., red=255, green=128) instead of raw addresses.",
    inputSchema: {
      type: "object" as const,
      properties: {
        universe: {
          type: "number",
          description: "DMX universe number to read (1-based)",
        },
        fixture_id: {
          type: "string",
          description:
            "Optional fixture ID to extract and label channels for. " +
            "If provided, the response includes named channel values from the fixture's profile.",
        },
      },
      required: ["universe"],
    },
  },
];
```

### 2. Add Tool Call Handlers

Wire each tool name to its handler function in the `CallToolRequestSchema` handler:

```typescript
// In the CallToolRequestSchema handler, add cases for playback tools.
// Assumes these imports and instances exist from server initialization:
//
// import { CueSequencer } from "./playback/sequencer.js";
// import {
//   blackout,
//   setFixtureColor,
//   setFixtureDimmer,
//   getDMXState,
//   formatDMXStateResult,
// } from "./playback/live-control.js";
//
// const sequencer = new CueSequencer({
//   olaClient, sceneManager, fixtureManager, fadeEngine, cueManager,
// });

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  try {
    switch (name) {
      // ... existing tool cases from Milestones 2, 3, 4 ...

      case "go_cue": {
        const { cue_list_id } = (args ?? {}) as {
          cue_list_id?: string;
        };

        if (cue_list_id) {
          // Start a new cue list
          await sequencer.start(cue_list_id);
        } else {
          // Advance the active cue list
          await sequencer.goCue();
        }

        const state = sequencer.getState();
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(
                {
                  success: true,
                  action: cue_list_id ? "started" : "advanced",
                  ...state,
                },
                null,
                2
              ),
            },
          ],
        };
      }

      case "go_to_cue": {
        const { cue_id } = args as { cue_id: string };
        await sequencer.goToCue(cue_id);

        const state = sequencer.getState();
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(
                {
                  success: true,
                  action: "jumped",
                  targetCueId: cue_id,
                  ...state,
                },
                null,
                2
              ),
            },
          ],
        };
      }

      case "stop": {
        sequencer.stop();

        const state = sequencer.getState();
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(
                {
                  success: true,
                  action: "stopped",
                  ...state,
                },
                null,
                2
              ),
            },
          ],
        };
      }

      case "blackout": {
        const result = await blackout(
          olaClient,
          fixtureManager,
          sequencer
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

      case "set_fixture_color": {
        const colorParams = args as {
          fixture_id: string;
          red: number;
          green: number;
          blue: number;
          white?: number;
          amber?: number;
          uv?: number;
        };
        const result = await setFixtureColor(
          colorParams,
          fixtureManager,
          olaClient
        );
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(result, null, 2),
            },
          ],
          isError: !result.success ? true : undefined,
        };
      }

      case "set_fixture_dimmer": {
        const dimmerParams = args as {
          fixture_id: string;
          level: number;
          unit?: "absolute" | "percent";
        };
        const result = await setFixtureDimmer(
          dimmerParams,
          fixtureManager,
          olaClient
        );
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(result, null, 2),
            },
          ],
          isError: !result.success ? true : undefined,
        };
      }

      case "get_dmx_state": {
        const { universe, fixture_id } = args as {
          universe: number;
          fixture_id?: string;
        };
        const result = await getDMXState(
          { universe, fixture_id },
          olaClient,
          fixtureManager
        );

        // Use formatted output for readability
        const text = formatDMXStateResult(result);
        return {
          content: [
            {
              type: "text",
              text,
            },
          ],
          isError: !result.success ? true : undefined,
        };
      }

      default:
        throw new Error(`Unknown tool: ${name}`);
    }
  } catch (error) {
    const message =
      error instanceof Error ? error.message : String(error);
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

### 3. Create Sequencer Unit Tests

Create `tests/playback/sequencer.test.ts`:

```typescript
// tests/playback/sequencer.test.ts

import { describe, it, expect, beforeEach, vi } from "vitest";
import { CueSequencer } from "../../src/playback/sequencer.js";

// Mock dependencies
function createMockOLAClient() {
  return {
    setDMX: vi.fn().mockResolvedValue(undefined),
    getDMX: vi.fn().mockResolvedValue(new Array(512).fill(0)),
    getBaseUrl: vi.fn().mockReturnValue("http://localhost:9090"),
  };
}

function createMockSceneManager() {
  const scenes = new Map();
  return {
    getScene: vi.fn((id: string) => {
      const scene = scenes.get(id);
      if (!scene) throw new Error(`Scene "${id}" not found`);
      return scene;
    }),
    _addScene: (scene: any) => scenes.set(scene.id, scene),
  };
}

function createMockFixtureManager() {
  const fixtures = new Map();
  return {
    getFixture: vi.fn((id: string) => fixtures.get(id)),
    listFixtures: vi.fn(() => Array.from(fixtures.values())),
    _addFixture: (fixture: any) => fixtures.set(fixture.id, fixture),
  };
}

function createMockFadeEngine() {
  return {
    executeFade: vi.fn().mockResolvedValue(undefined),
  };
}

function createMockCueManager() {
  const cueLists = new Map();
  return {
    getCueList: vi.fn((id: string) => cueLists.get(id)),
    _addCueList: (cueList: any) => cueLists.set(cueList.id, cueList),
  };
}

describe("CueSequencer", () => {
  let sequencer: CueSequencer;
  let mockOLA: ReturnType<typeof createMockOLAClient>;
  let mockSceneManager: ReturnType<typeof createMockSceneManager>;
  let mockFixtureManager: ReturnType<typeof createMockFixtureManager>;
  let mockFadeEngine: ReturnType<typeof createMockFadeEngine>;
  let mockCueManager: ReturnType<typeof createMockCueManager>;

  beforeEach(() => {
    mockOLA = createMockOLAClient();
    mockSceneManager = createMockSceneManager();
    mockFixtureManager = createMockFixtureManager();
    mockFadeEngine = createMockFadeEngine();
    mockCueManager = createMockCueManager();

    sequencer = new CueSequencer({
      olaClient: mockOLA as any,
      sceneManager: mockSceneManager as any,
      fixtureManager: mockFixtureManager as any,
      fadeEngine: mockFadeEngine as any,
      cueManager: mockCueManager as any,
    });

    // Set up a test fixture
    mockFixtureManager._addFixture({
      id: "par-1",
      name: "Par 1",
      universe: 1,
      startAddress: 1,
      profile: {
        manufacturer: "Generic",
        model: "RGB Par",
        channels: [
          { name: "red", type: "red", defaultValue: 0, min: 0, max: 255 },
          { name: "green", type: "green", defaultValue: 0, min: 0, max: 255 },
          { name: "blue", type: "blue", defaultValue: 0, min: 0, max: 255 },
        ],
        modes: [],
      },
    });

    // Set up test scenes
    mockSceneManager._addScene({
      id: "scene-red",
      name: "Red Wash",
      fixtureStates: new Map([["par-1", { red: 255, green: 0, blue: 0 }]]),
    });

    mockSceneManager._addScene({
      id: "scene-blue",
      name: "Blue Wash",
      fixtureStates: new Map([["par-1", { red: 0, green: 0, blue: 255 }]]),
    });

    // Set up a test cue list
    mockCueManager._addCueList({
      id: "cue-list-1",
      name: "Test Cue List",
      loop: false,
      cues: [
        {
          id: "cue-1",
          name: "Cue 1",
          scene: "scene-red",
          fadeInMs: 1000,
          holdMs: 0,
          fadeOutMs: 0,
        },
        {
          id: "cue-2",
          name: "Cue 2",
          scene: "scene-blue",
          fadeInMs: 500,
          holdMs: 0,
          fadeOutMs: 0,
        },
      ],
    });
  });

  describe("start()", () => {
    it("should start playback of a cue list", async () => {
      await sequencer.start("cue-list-1");

      const state = sequencer.getState();
      expect(state.activeCueListId).toBe("cue-list-1");
      expect(state.currentCueIndex).toBe(0);
    });

    it("should throw for nonexistent cue list", async () => {
      await expect(
        sequencer.start("nonexistent")
      ).rejects.toThrow('Cue list "nonexistent" not found');
    });

    it("should throw for empty cue list", async () => {
      mockCueManager._addCueList({
        id: "empty-list",
        name: "Empty",
        loop: false,
        cues: [],
      });

      await expect(
        sequencer.start("empty-list")
      ).rejects.toThrow("has no cues");
    });

    it("should call fadeEngine.executeFade for the first cue", async () => {
      await sequencer.start("cue-list-1");

      expect(mockFadeEngine.executeFade).toHaveBeenCalled();
      expect(mockSceneManager.getScene).toHaveBeenCalledWith(
        "scene-red"
      );
    });
  });

  describe("goCue()", () => {
    it("should advance to the next cue", async () => {
      await sequencer.start("cue-list-1");
      mockFadeEngine.executeFade.mockClear();

      await sequencer.goCue();

      const state = sequencer.getState();
      expect(state.currentCueIndex).toBe(1);
      expect(mockSceneManager.getScene).toHaveBeenCalledWith(
        "scene-blue"
      );
    });

    it("should throw when no cue list is active", async () => {
      await expect(sequencer.goCue()).rejects.toThrow(
        "No active cue list"
      );
    });

    it("should stop at end of non-looping list", async () => {
      await sequencer.start("cue-list-1");
      await sequencer.goCue(); // advance to cue 2
      await sequencer.goCue(); // try to advance past end

      const state = sequencer.getState();
      expect(state.isPlaying).toBe(false);
    });

    it("should wrap to cue 0 in a looping list", async () => {
      mockCueManager._addCueList({
        id: "loop-list",
        name: "Loop",
        loop: true,
        cues: [
          {
            id: "cue-a",
            name: "A",
            scene: "scene-red",
            fadeInMs: 100,
            holdMs: 0,
            fadeOutMs: 0,
          },
          {
            id: "cue-b",
            name: "B",
            scene: "scene-blue",
            fadeInMs: 100,
            holdMs: 0,
            fadeOutMs: 0,
          },
        ],
      });

      await sequencer.start("loop-list");
      await sequencer.goCue(); // advance to cue-b
      await sequencer.goCue(); // should wrap to cue-a

      const state = sequencer.getState();
      expect(state.currentCueIndex).toBe(0);
      expect(state.isPlaying).toBe(true);
    });
  });

  describe("goToCue()", () => {
    it("should jump to a specific cue by ID", async () => {
      await sequencer.start("cue-list-1");
      mockFadeEngine.executeFade.mockClear();

      await sequencer.goToCue("cue-2");

      const state = sequencer.getState();
      expect(state.currentCueIndex).toBe(1);
      expect(state.currentCueId).toBe("cue-2");
    });

    it("should throw for nonexistent cue ID", async () => {
      await sequencer.start("cue-list-1");

      await expect(
        sequencer.goToCue("nonexistent")
      ).rejects.toThrow('Cue "nonexistent" not found');
    });

    it("should throw when no cue list is active", async () => {
      await expect(
        sequencer.goToCue("cue-1")
      ).rejects.toThrow("No active cue list");
    });
  });

  describe("stop()", () => {
    it("should stop playback", async () => {
      await sequencer.start("cue-list-1");

      sequencer.stop();

      const state = sequencer.getState();
      expect(state.isPlaying).toBe(false);
    });

    it("should preserve active cue list reference after stop", async () => {
      await sequencer.start("cue-list-1");

      sequencer.stop();

      const state = sequencer.getState();
      expect(state.activeCueListId).toBe("cue-list-1");
    });
  });

  describe("getState()", () => {
    it("should return idle state when no cue list is active", () => {
      const state = sequencer.getState();

      expect(state.activeCueListId).toBeNull();
      expect(state.currentCueIndex).toBe(0);
      expect(state.isPlaying).toBe(false);
      expect(state.currentCueId).toBeNull();
    });

    it("should return active state during playback", async () => {
      await sequencer.start("cue-list-1");

      const state = sequencer.getState();

      expect(state.activeCueListId).toBe("cue-list-1");
      expect(state.isPlaying).toBe(true);
      expect(state.currentCueId).toBe("cue-1");
    });
  });
});
```

### 4. Create Live Control Unit Tests

Create `tests/playback/live-control.test.ts`:

```typescript
// tests/playback/live-control.test.ts

import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  blackout,
  setFixtureColor,
  setFixtureDimmer,
  getDMXState,
  formatDMXStateResult,
} from "../../src/playback/live-control.js";

// Mock OLA client
function createMockOLAClient() {
  const universeData = new Map<number, number[]>();
  return {
    setDMX: vi.fn(async (universe: number, channels: number[]) => {
      universeData.set(universe, [...channels]);
    }),
    getDMX: vi.fn(async (universe: number) => {
      return universeData.get(universe) ?? new Array(512).fill(0);
    }),
    _universeData: universeData,
  };
}

// Mock fixture manager
function createMockFixtureManager() {
  const fixtures = new Map<string, any>();
  return {
    getFixture: vi.fn((id: string) => fixtures.get(id)),
    listFixtures: vi.fn(() => Array.from(fixtures.values())),
    _addFixture: (fixture: any) => fixtures.set(fixture.id, fixture),
  };
}

// Mock sequencer
function createMockSequencer(isPlaying: boolean = false) {
  return {
    getState: vi.fn(() => ({
      activeCueListId: isPlaying ? "list-1" : null,
      currentCueIndex: 0,
      isPlaying,
      currentCueId: null,
    })),
    stop: vi.fn(),
  };
}

// Helper to create a standard RGB fixture
function createRGBFixture(id: string, universe: number, startAddress: number) {
  return {
    id,
    name: `RGB Par ${id}`,
    universe,
    startAddress,
    profile: {
      manufacturer: "Generic",
      model: "RGB Par",
      channels: [
        { name: "red", type: "red", defaultValue: 0, min: 0, max: 255 },
        { name: "green", type: "green", defaultValue: 0, min: 0, max: 255 },
        { name: "blue", type: "blue", defaultValue: 0, min: 0, max: 255 },
      ],
      modes: [],
    },
  };
}

// Helper to create a dimmer + RGB fixture
function createDimmerRGBFixture(
  id: string,
  universe: number,
  startAddress: number
) {
  return {
    id,
    name: `Dimmer RGB ${id}`,
    universe,
    startAddress,
    profile: {
      manufacturer: "Generic",
      model: "Dimmer RGB",
      channels: [
        { name: "dimmer", type: "dimmer", defaultValue: 0, min: 0, max: 255 },
        { name: "red", type: "red", defaultValue: 0, min: 0, max: 255 },
        { name: "green", type: "green", defaultValue: 0, min: 0, max: 255 },
        { name: "blue", type: "blue", defaultValue: 0, min: 0, max: 255 },
      ],
      modes: [],
    },
  };
}

// Helper to create a dimmer-only fixture
function createDimmerOnlyFixture(
  id: string,
  universe: number,
  startAddress: number
) {
  return {
    id,
    name: `Dimmer ${id}`,
    universe,
    startAddress,
    profile: {
      manufacturer: "Generic",
      model: "Single Dimmer",
      channels: [
        { name: "dimmer", type: "dimmer", defaultValue: 0, min: 0, max: 255 },
      ],
      modes: [],
    },
  };
}

describe("blackout", () => {
  let mockOLA: ReturnType<typeof createMockOLAClient>;
  let mockFixtureManager: ReturnType<typeof createMockFixtureManager>;

  beforeEach(() => {
    mockOLA = createMockOLAClient();
    mockFixtureManager = createMockFixtureManager();
  });

  it("should send zeros to all active universes", async () => {
    mockFixtureManager._addFixture(createRGBFixture("par-1", 1, 1));
    mockFixtureManager._addFixture(createRGBFixture("par-2", 2, 1));

    const result = await blackout(
      mockOLA as any,
      mockFixtureManager as any
    );

    expect(result.success).toBe(true);
    expect(result.universesBlackedOut).toEqual([1, 2]);
    expect(mockOLA.setDMX).toHaveBeenCalledTimes(2);

    // Verify zeros were sent
    const call1 = mockOLA.setDMX.mock.calls[0];
    expect(call1[1].length).toBe(512);
    expect(call1[1].every((v: number) => v === 0)).toBe(true);
  });

  it("should stop the sequencer if playing", async () => {
    mockFixtureManager._addFixture(createRGBFixture("par-1", 1, 1));
    const mockSeq = createMockSequencer(true);

    const result = await blackout(
      mockOLA as any,
      mockFixtureManager as any,
      mockSeq as any
    );

    expect(result.sequencerWasStopped).toBe(true);
    expect(mockSeq.stop).toHaveBeenCalled();
  });

  it("should not stop sequencer if not playing", async () => {
    mockFixtureManager._addFixture(createRGBFixture("par-1", 1, 1));
    const mockSeq = createMockSequencer(false);

    const result = await blackout(
      mockOLA as any,
      mockFixtureManager as any,
      mockSeq as any
    );

    expect(result.sequencerWasStopped).toBe(false);
    expect(mockSeq.stop).not.toHaveBeenCalled();
  });

  it("should handle no patched fixtures", async () => {
    const result = await blackout(
      mockOLA as any,
      mockFixtureManager as any
    );

    expect(result.success).toBe(true);
    expect(result.universesBlackedOut).toEqual([]);
    expect(mockOLA.setDMX).not.toHaveBeenCalled();
  });

  it("should deduplicate universes", async () => {
    mockFixtureManager._addFixture(createRGBFixture("par-1", 1, 1));
    mockFixtureManager._addFixture(createRGBFixture("par-2", 1, 10));

    const result = await blackout(
      mockOLA as any,
      mockFixtureManager as any
    );

    expect(result.universesBlackedOut).toEqual([1]);
    expect(mockOLA.setDMX).toHaveBeenCalledTimes(1);
  });
});

describe("setFixtureColor", () => {
  let mockOLA: ReturnType<typeof createMockOLAClient>;
  let mockFixtureManager: ReturnType<typeof createMockFixtureManager>;

  beforeEach(() => {
    mockOLA = createMockOLAClient();
    mockFixtureManager = createMockFixtureManager();
  });

  it("should set RGB values on an RGB fixture", async () => {
    mockFixtureManager._addFixture(createRGBFixture("par-1", 1, 10));

    const result = await setFixtureColor(
      { fixture_id: "par-1", red: 255, green: 128, blue: 0 },
      mockFixtureManager as any,
      mockOLA as any
    );

    expect(result.success).toBe(true);
    expect(result.channelsSet.red).toEqual({
      dmxAddress: 10,
      value: 255,
    });
    expect(result.channelsSet.green).toEqual({
      dmxAddress: 11,
      value: 128,
    });
    expect(result.channelsSet.blue).toEqual({
      dmxAddress: 12,
      value: 0,
    });

    // Verify OLA received correct values
    const setCall = mockOLA.setDMX.mock.calls[0];
    expect(setCall[0]).toBe(1); // universe
    expect(setCall[1][9]).toBe(255); // DMX 10 = red
    expect(setCall[1][10]).toBe(128); // DMX 11 = green
    expect(setCall[1][11]).toBe(0); // DMX 12 = blue
  });

  it("should return error for nonexistent fixture", async () => {
    const result = await setFixtureColor(
      { fixture_id: "nonexistent", red: 255, green: 0, blue: 0 },
      mockFixtureManager as any,
      mockOLA as any
    );

    expect(result.success).toBe(false);
    expect(result.error).toContain("not found");
  });

  it("should return error for dimmer-only fixture", async () => {
    mockFixtureManager._addFixture(
      createDimmerOnlyFixture("dim-1", 1, 1)
    );

    const result = await setFixtureColor(
      { fixture_id: "dim-1", red: 255, green: 0, blue: 0 },
      mockFixtureManager as any,
      mockOLA as any
    );

    expect(result.success).toBe(false);
    expect(result.error).toContain("no color channels");
  });

  it("should clamp values to 0-255", async () => {
    mockFixtureManager._addFixture(createRGBFixture("par-1", 1, 1));

    const result = await setFixtureColor(
      { fixture_id: "par-1", red: 300, green: -10, blue: 128 },
      mockFixtureManager as any,
      mockOLA as any
    );

    expect(result.success).toBe(true);
    expect(result.channelsSet.red.value).toBe(255);
    expect(result.channelsSet.green.value).toBe(0);
    expect(result.channelsSet.blue.value).toBe(128);
  });

  it("should preserve non-color channels", async () => {
    const fixture = createDimmerRGBFixture("par-1", 1, 1);
    mockFixtureManager._addFixture(fixture);

    // Set initial DMX state with dimmer at 200
    const initialChannels = new Array(512).fill(0);
    initialChannels[0] = 200; // DMX 1 = dimmer
    mockOLA._universeData.set(1, initialChannels);

    const result = await setFixtureColor(
      { fixture_id: "par-1", red: 255, green: 0, blue: 0 },
      mockFixtureManager as any,
      mockOLA as any
    );

    expect(result.success).toBe(true);

    // Verify dimmer was preserved
    const setCall = mockOLA.setDMX.mock.calls[0];
    expect(setCall[1][0]).toBe(200); // dimmer preserved
    expect(setCall[1][1]).toBe(255); // red set
  });
});

describe("setFixtureDimmer", () => {
  let mockOLA: ReturnType<typeof createMockOLAClient>;
  let mockFixtureManager: ReturnType<typeof createMockFixtureManager>;

  beforeEach(() => {
    mockOLA = createMockOLAClient();
    mockFixtureManager = createMockFixtureManager();
  });

  it("should set dimmer value in absolute mode", async () => {
    mockFixtureManager._addFixture(
      createDimmerRGBFixture("par-1", 1, 10)
    );

    const result = await setFixtureDimmer(
      { fixture_id: "par-1", level: 200 },
      mockFixtureManager as any,
      mockOLA as any
    );

    expect(result.success).toBe(true);
    expect(result.dimmerChannel).toEqual({
      name: "dimmer",
      dmxAddress: 10,
      value: 200,
    });
  });

  it("should convert percent to absolute", async () => {
    mockFixtureManager._addFixture(
      createDimmerRGBFixture("par-1", 1, 1)
    );

    const result = await setFixtureDimmer(
      { fixture_id: "par-1", level: 0.5, unit: "percent" },
      mockFixtureManager as any,
      mockOLA as any
    );

    expect(result.success).toBe(true);
    expect(result.dimmerChannel!.value).toBe(128); // 0.5 * 255 = 127.5 -> 128
  });

  it("should return hint for RGB-only fixture", async () => {
    mockFixtureManager._addFixture(createRGBFixture("par-1", 1, 1));

    const result = await setFixtureDimmer(
      { fixture_id: "par-1", level: 128 },
      mockFixtureManager as any,
      mockOLA as any
    );

    expect(result.success).toBe(false);
    expect(result.error).toContain("no dedicated dimmer channel");
    expect(result.hint).toContain("set_fixture_color");
  });

  it("should return error for nonexistent fixture", async () => {
    const result = await setFixtureDimmer(
      { fixture_id: "nonexistent", level: 128 },
      mockFixtureManager as any,
      mockOLA as any
    );

    expect(result.success).toBe(false);
    expect(result.error).toContain("not found");
  });

  it("should clamp level values", async () => {
    mockFixtureManager._addFixture(
      createDimmerOnlyFixture("dim-1", 1, 1)
    );

    const result = await setFixtureDimmer(
      { fixture_id: "dim-1", level: 300 },
      mockFixtureManager as any,
      mockOLA as any
    );

    expect(result.success).toBe(true);
    expect(result.dimmerChannel!.value).toBe(255);
  });

  it("should clamp percent values", async () => {
    mockFixtureManager._addFixture(
      createDimmerOnlyFixture("dim-1", 1, 1)
    );

    const result = await setFixtureDimmer(
      { fixture_id: "dim-1", level: 1.5, unit: "percent" },
      mockFixtureManager as any,
      mockOLA as any
    );

    expect(result.success).toBe(true);
    expect(result.dimmerChannel!.value).toBe(255);
  });
});

describe("getDMXState", () => {
  let mockOLA: ReturnType<typeof createMockOLAClient>;
  let mockFixtureManager: ReturnType<typeof createMockFixtureManager>;

  beforeEach(() => {
    mockOLA = createMockOLAClient();
    mockFixtureManager = createMockFixtureManager();
  });

  it("should return 512-channel array for a universe", async () => {
    const result = await getDMXState(
      { universe: 1 },
      mockOLA as any
    );

    expect(result.success).toBe(true);
    expect(result.universe).toBe(1);
    expect(result.channels).toHaveLength(512);
    expect(result.activeChannelCount).toBe(0);
  });

  it("should count active (non-zero) channels", async () => {
    const channels = new Array(512).fill(0);
    channels[0] = 255;
    channels[5] = 128;
    channels[10] = 64;
    mockOLA._universeData.set(1, channels);

    const result = await getDMXState(
      { universe: 1 },
      mockOLA as any
    );

    expect(result.activeChannelCount).toBe(3);
  });

  it("should label fixture channels when fixture_id provided", async () => {
    const fixture = createRGBFixture("par-1", 1, 10);
    mockFixtureManager._addFixture(fixture);

    const channels = new Array(512).fill(0);
    channels[9] = 255; // DMX 10 = red
    channels[10] = 128; // DMX 11 = green
    channels[11] = 64; // DMX 12 = blue
    mockOLA._universeData.set(1, channels);

    const result = await getDMXState(
      { universe: 1, fixture_id: "par-1" },
      mockOLA as any,
      mockFixtureManager as any
    );

    expect(result.success).toBe(true);
    expect(result.fixtureState).toBeDefined();
    expect(result.fixtureState!.fixture_id).toBe("par-1");
    expect(result.fixtureState!.channels).toHaveLength(3);
    expect(result.fixtureState!.channels[0]).toEqual({
      name: "red",
      type: "red",
      dmxAddress: 10,
      value: 255,
    });
    expect(result.fixtureState!.channels[1]).toEqual({
      name: "green",
      type: "green",
      dmxAddress: 11,
      value: 128,
    });
    expect(result.fixtureState!.channels[2]).toEqual({
      name: "blue",
      type: "blue",
      dmxAddress: 12,
      value: 64,
    });
  });

  it("should return error for invalid universe", async () => {
    const result = await getDMXState(
      { universe: 0 },
      mockOLA as any
    );

    expect(result.success).toBe(false);
    expect(result.error).toContain("positive integer");
  });

  it("should warn when fixture is on different universe", async () => {
    const fixture = createRGBFixture("par-1", 2, 1); // universe 2
    mockFixtureManager._addFixture(fixture);

    const result = await getDMXState(
      { universe: 1, fixture_id: "par-1" }, // requesting universe 1
      mockOLA as any,
      mockFixtureManager as any
    );

    expect(result.success).toBe(true);
    expect(result.error).toContain("universe 2");
    expect(result.fixtureState).toBeUndefined();
  });

  it("should handle OLA connection failure", async () => {
    mockOLA.getDMX.mockRejectedValue(new Error("Connection refused"));

    const result = await getDMXState(
      { universe: 1 },
      mockOLA as any
    );

    expect(result.success).toBe(false);
    expect(result.error).toContain("Failed to read DMX");
  });
});

describe("formatDMXStateResult", () => {
  it("should format error result", () => {
    const output = formatDMXStateResult({
      success: false,
      universe: 1,
      error: "Connection refused",
    });

    expect(output).toContain("Error");
    expect(output).toContain("Connection refused");
  });

  it("should format universe summary", () => {
    const channels = new Array(512).fill(0);
    channels[0] = 255;
    channels[5] = 128;

    const output = formatDMXStateResult({
      success: true,
      universe: 1,
      channels,
      activeChannelCount: 2,
    });

    expect(output).toContain("Universe 1");
    expect(output).toContain("Active channels: 2");
    expect(output).toContain("DMX 1: 255");
    expect(output).toContain("DMX 6: 128");
  });

  it("should format fixture state when available", () => {
    const output = formatDMXStateResult({
      success: true,
      universe: 1,
      channels: new Array(512).fill(0),
      activeChannelCount: 0,
      fixtureState: {
        fixture_id: "par-1",
        fixture_name: "Par 1",
        profile: "Generic RGB Par",
        startAddress: 10,
        channels: [
          { name: "red", type: "red", dmxAddress: 10, value: 255 },
          { name: "green", type: "green", dmxAddress: 11, value: 0 },
          { name: "blue", type: "blue", dmxAddress: 12, value: 0 },
        ],
      },
    });

    expect(output).toContain("Par 1");
    expect(output).toContain("par-1");
    expect(output).toContain("Generic RGB Par");
    expect(output).toContain("red (red): 255");
  });
});
```

### 5. Verify TypeScript Compilation and Run Tests

```bash
npx tsc --noEmit
npx vitest run tests/playback/
```

---

## Verification

- [ ] All 7 tools (`go_cue`, `go_to_cue`, `stop`, `blackout`, `set_fixture_color`, `set_fixture_dimmer`, `get_dmx_state`) appear in the `ListTools` response
- [ ] `go_cue` handler starts a cue list when `cue_list_id` is provided
- [ ] `go_cue` handler advances the active cue list when `cue_list_id` is omitted
- [ ] `go_to_cue` handler jumps to the specified cue
- [ ] `stop` handler stops playback and returns current state
- [ ] `blackout` handler sends zeros to all active universes and stops the sequencer
- [ ] `set_fixture_color` handler sets correct RGB channels and returns confirmation
- [ ] `set_fixture_dimmer` handler sets dimmer channel and returns confirmation
- [ ] `get_dmx_state` handler returns formatted DMX state with optional fixture labels
- [ ] Error handling wraps all handlers -- errors return `{ isError: true }` MCP responses
- [ ] Tool input schemas define correct required and optional parameters
- [ ] `tests/playback/sequencer.test.ts` passes all tests
- [ ] `tests/playback/live-control.test.ts` passes all tests
- [ ] Sequencer tests verify: start, goCue advance, goCue loop, goToCue jump, stop
- [ ] Live control tests verify: blackout zeros, blackout stops sequencer, color sets channels, dimmer works, DMX state reads
- [ ] `npx tsc --noEmit` passes with no errors

---

## Notes

- The `go_cue` tool has a dual purpose: when given a `cue_list_id` it starts a new cue list, and when called without arguments it advances the active list. This makes the agent's workflow simple: first call `go_cue({ cue_list_id: "my-list" })` to start, then subsequent `go_cue({})` calls advance through the cues.
- The `CueSequencer` instance must be shared between the `go_cue`, `go_to_cue`, `stop`, and `blackout` handlers. It should be instantiated once at server startup alongside the other managers.
- The `get_dmx_state` tool uses `formatDMXStateResult` for its response text rather than raw JSON. A 512-element JSON array is not useful to the agent; a summary of active channels and labeled fixture values is much more actionable.
- The test files use Vitest's `vi.fn()` for mocking. All dependencies are mocked to isolate the unit under test. No actual OLA connection is needed for tests.
- The `isError` field on MCP responses is only set when the operation logically failed (not found, validation error). It is not set for successful operations. This helps the agent distinguish between "the tool worked but the result is informational" and "the tool failed."
- Consider running the full test suite after integration to ensure these new tools do not conflict with tools from Milestones 2, 3, and 4.

---

**Next Task**: None (this is the final task in Milestone 5)
**Related Design Docs**: [DMX Lighting MCP Design](../../design/local.dmx-lighting-mcp.md)
