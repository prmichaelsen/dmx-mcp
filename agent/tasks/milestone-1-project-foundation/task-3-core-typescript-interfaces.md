# Task 3: Define Core TypeScript Interfaces

**Milestone**: [M1 - Project Foundation & OLA Client](../../milestones/milestone-1-project-foundation.md)
**Estimated Time**: 1 hour
**Dependencies**: Task 1 (Initialize TypeScript Project)
**Status**: Not Started

---

## Objective

Define all core data model interfaces from the design document in `src/types/index.ts`. These types form the shared vocabulary for the entire project -- fixtures, scenes, cues, cue lists, and shows.

---

## Context

The design document specifies a set of data models that represent the DMX lighting domain: fixtures with typed channels, scenes that capture fixture states, cues that define timed transitions, cue lists that sequence cues, and shows that bundle everything together. Defining these types early ensures that all modules (OLA client, fixture manager, scene manager, cue engine) share a consistent, type-safe contract. Every MCP tool in later milestones will operate on these types.

---

## Steps

### 1. Create src/types/index.ts

Create the types file at `src/types/index.ts` with all core interfaces:

```typescript
/**
 * Core data model types for the dmx-mcp server.
 *
 * These types represent the DMX lighting domain: fixtures, scenes, cues,
 * cue lists, and shows. They are derived from the design document at
 * agent/design/local.dmx-lighting-mcp.md
 */

// ---------------------------------------------------------------------------
// Channel Types
// ---------------------------------------------------------------------------

/**
 * The semantic type of a DMX channel. Used to identify what a channel
 * controls on a fixture.
 */
export type ChannelType =
  | "dimmer"
  | "red"
  | "green"
  | "blue"
  | "white"
  | "amber"
  | "uv"
  | "pan"
  | "tilt"
  | "pan_fine"
  | "tilt_fine"
  | "gobo"
  | "strobe"
  | "speed"
  | "macro"
  | "control";

/**
 * Definition of a single DMX channel within a fixture profile.
 */
export interface ChannelDefinition {
  /** Human-readable name, e.g. "red", "dimmer", "pan" */
  name: string;
  /** Semantic type of the channel */
  type: ChannelType;
  /** Default DMX value (0-255) */
  defaultValue: number;
  /** Minimum allowed value (typically 0) */
  min: number;
  /** Maximum allowed value (typically 255) */
  max: number;
}

// ---------------------------------------------------------------------------
// Fixture Profiles and Modes
// ---------------------------------------------------------------------------

/**
 * A fixture mode defines a specific channel configuration.
 * Many fixtures support multiple modes (e.g., 3-channel RGB vs 7-channel extended).
 */
export interface FixtureMode {
  /** Mode name, e.g. "3-Channel", "7-Channel Extended" */
  name: string;
  /** Number of DMX channels this mode uses */
  channelCount: number;
  /** Ordered list of channel definitions for this mode */
  channels: ChannelDefinition[];
}

/**
 * A fixture profile describes the capabilities and channel layout
 * of a particular lighting instrument model.
 */
export interface FixtureProfile {
  /** Manufacturer name, e.g. "Generic", "Chauvet", "Martin" */
  manufacturer: string;
  /** Model name, e.g. "RGB Par Can", "Intimidator Spot 360" */
  model: string;
  /** All channel definitions this fixture supports */
  channels: ChannelDefinition[];
  /** Available operating modes */
  modes: FixtureMode[];
}

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

/**
 * A fixture represents a physical lighting instrument patched into
 * a DMX universe at a specific address.
 */
export interface Fixture {
  /** Unique identifier, e.g. "par-1", "mover-left" */
  id: string;
  /** Human-readable name, e.g. "Front Wash Left" */
  name: string;
  /** The fixture's profile (channel layout and capabilities) */
  profile: FixtureProfile;
  /** DMX universe number (1-based) */
  universe: number;
  /** DMX start address within the universe (1-512) */
  startAddress: number;
  /** Active mode name (must match one of profile.modes) */
  mode?: string;
}

// ---------------------------------------------------------------------------
// Scenes
// ---------------------------------------------------------------------------

/**
 * Channel values for a single fixture within a scene.
 * Keys are channel names (matching ChannelDefinition.name), values are 0-255.
 */
export type ChannelValues = Record<string, number>;

/**
 * A scene captures a snapshot of fixture states -- the colors, intensities,
 * positions, and other channel values for a set of fixtures at a moment in time.
 */
export interface Scene {
  /** Unique identifier */
  id: string;
  /** Human-readable name, e.g. "Warm Amber Wash", "Deep Blue Moody" */
  name: string;
  /**
   * Map of fixture ID to channel values.
   * Not every fixture needs to be included -- only fixtures with
   * explicitly set values appear in the map.
   */
  fixtureStates: Map<string, ChannelValues>;
}

// ---------------------------------------------------------------------------
// Cues
// ---------------------------------------------------------------------------

/**
 * A cue defines a timed transition to a scene. Cues are the building blocks
 * of cue lists and control the timing of lighting changes during a show.
 */
export interface Cue {
  /** Unique identifier */
  id: string;
  /** Human-readable name, e.g. "Opening Look", "Verse 1 Transition" */
  name: string;
  /** ID of the scene to transition to */
  scene: string;
  /** Fade-in duration in milliseconds */
  fadeInMs: number;
  /** Hold duration in milliseconds (time at full intensity before next cue) */
  holdMs: number;
  /** Fade-out duration in milliseconds */
  fadeOutMs: number;
}

// ---------------------------------------------------------------------------
// Cue Lists
// ---------------------------------------------------------------------------

/**
 * A cue list is an ordered sequence of cues that forms a programmed
 * lighting sequence. Cue lists can optionally loop.
 */
export interface CueList {
  /** Unique identifier */
  id: string;
  /** Human-readable name, e.g. "Main Show", "Ambient Loop" */
  name: string;
  /** Ordered array of cues */
  cues: Cue[];
  /** Whether the cue list loops back to the first cue after the last */
  loop: boolean;
}

// ---------------------------------------------------------------------------
// Shows
// ---------------------------------------------------------------------------

/**
 * A show is the top-level container that bundles all fixtures, scenes,
 * and cue lists into a single saveable/loadable unit.
 */
export interface Show {
  /** Unique identifier */
  id: string;
  /** Human-readable name, e.g. "Sunday Service", "Concert March 2026" */
  name: string;
  /** All fixtures in the show */
  fixtures: Fixture[];
  /** All scenes in the show */
  scenes: Scene[];
  /** All cue lists in the show */
  cueLists: CueList[];
}
```

### 2. Verify Types Compile

Run the TypeScript compiler to verify the types are valid:

```bash
npx tsc --noEmit
```

This should complete with zero errors.

### 3. Verify Exports Are Accessible

Create a quick smoke test by importing the types in another file. For example, temporarily add to `src/index.ts`:

```typescript
import type {
  Fixture,
  FixtureProfile,
  ChannelDefinition,
  ChannelType,
  ChannelValues,
  FixtureMode,
  Scene,
  Cue,
  CueList,
  Show,
} from "./types/index.js";
```

Run `npx tsc --noEmit` again to confirm all imports resolve correctly. The type import can be removed or kept as a reference -- it has no runtime cost due to the `import type` syntax.

---

## Verification

- [ ] `src/types/index.ts` exists and contains all interfaces
- [ ] `ChannelType` union type includes all 16 channel types from the design document
- [ ] `ChannelDefinition` interface has `name`, `type`, `defaultValue`, `min`, `max` fields
- [ ] `FixtureProfile` interface has `manufacturer`, `model`, `channels`, `modes` fields
- [ ] `FixtureMode` interface has `name`, `channelCount`, `channels` fields
- [ ] `Fixture` interface has `id`, `name`, `profile`, `universe`, `startAddress` fields
- [ ] `Scene` interface uses `Map<string, ChannelValues>` for `fixtureStates`
- [ ] `Cue` interface has `fadeInMs`, `holdMs`, `fadeOutMs` timing fields
- [ ] `CueList` interface has `cues` array and `loop` boolean
- [ ] `Show` interface has `fixtures`, `scenes`, `cueLists` arrays
- [ ] `npx tsc --noEmit` passes with zero errors
- [ ] All types are exported from the module

---

## Notes

- `ChannelValues` is defined as `Record<string, number>` rather than `Map<string, number>` because individual fixture channel values are simple key-value pairs that serialize cleanly to JSON. The `Scene.fixtureStates` field uses `Map<string, ChannelValues>` for the outer mapping (fixture ID to values), which will need special handling during JSON serialization/deserialization in the Show Storage module (Milestone 6).
- The `Fixture.mode` field is optional. When omitted, the first mode in the profile's `modes` array is used as the default.
- All DMX values are integers in the range 0-255. Validation of these ranges will be handled by the fixture manager and scene manager in later milestones, not by the type system alone.
- The `FixtureMode` interface is not explicitly shown in the design document's data models section but is referenced by `FixtureProfile.modes`. It has been added here to complete the type system.

---

**Next Task**: [Task 4: Implement OLA REST Client](task-4-ola-rest-client.md)
**Related Design Docs**: [DMX Lighting MCP Design](../../design/local.dmx-lighting-mcp.md)
