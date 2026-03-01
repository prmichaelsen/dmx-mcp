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

export interface ChannelDefinition {
  name: string;
  type: ChannelType;
  defaultValue: number;
  min: number;
  max: number;
}

export interface FixtureMode {
  name: string;
  channelCount: number;
  channels: string[]; // references to ChannelDefinition names
}

export interface FixtureProfile {
  id: string;
  manufacturer: string;
  model: string;
  channels: ChannelDefinition[];
  modes: FixtureMode[];
}

export interface Fixture {
  id: string;
  name: string;
  profileId: string;
  profile: FixtureProfile;
  universe: number;
  startAddress: number;
  mode: string; // references a FixtureMode name
}

export type ChannelValues = Record<string, number>;

export interface Scene {
  id: string;
  name: string;
  fixtureStates: Record<string, ChannelValues>; // fixture ID → channel values
}

export interface Cue {
  id: string;
  name: string;
  sceneId: string;
  fadeInMs: number;
  holdMs: number;
  fadeOutMs: number;
}

export interface CueList {
  id: string;
  name: string;
  cues: Cue[];
  loop: boolean;
}

export interface Show {
  id: string;
  name: string;
  fixtures: Fixture[];
  scenes: Scene[];
  cueLists: CueList[];
}
