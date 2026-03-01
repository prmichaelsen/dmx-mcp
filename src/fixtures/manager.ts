import type { Fixture } from "../types/index.js";
import {
  type ProfileRegistry,
  getChannelCount,
  validateAddress,
  getAddressRange,
} from "./profiles.js";

export interface PatchFixtureParams {
  id: string;
  name: string;
  profileId: string;
  universe: number;
  startAddress: number;
  mode?: string;
}

export class FixtureManager {
  private fixtures = new Map<string, Fixture>();

  constructor(private profileRegistry: ProfileRegistry) {}

  patchFixture(params: PatchFixtureParams): Fixture {
    if (this.fixtures.has(params.id)) {
      throw new Error(`Fixture "${params.id}" already exists`);
    }

    const profile = this.profileRegistry.get(params.profileId);
    if (!profile) {
      throw new Error(`Profile "${params.profileId}" not found`);
    }

    const modeName = params.mode ?? profile.modes[0].name;
    const channelCount = getChannelCount(profile, modeName);

    validateAddress(params.startAddress, channelCount);

    const [newStart, newEnd] = getAddressRange(
      params.startAddress,
      channelCount,
    );

    // Check for address collisions on the same universe
    for (const existing of this.fixtures.values()) {
      if (existing.universe !== params.universe) continue;

      const existingChannelCount = getChannelCount(
        existing.profile,
        existing.mode,
      );
      const [exStart, exEnd] = getAddressRange(
        existing.startAddress,
        existingChannelCount,
      );

      // Ranges overlap if a1 <= b2 AND b1 <= a2
      if (newStart <= exEnd && exStart <= newEnd) {
        throw new Error(
          `Address collision: fixture "${params.id}" (${newStart}-${newEnd}) overlaps with "${existing.id}" (${exStart}-${exEnd}) on universe ${params.universe}`,
        );
      }
    }

    const fixture: Fixture = {
      id: params.id,
      name: params.name,
      profileId: params.profileId,
      profile,
      universe: params.universe,
      startAddress: params.startAddress,
      mode: modeName,
    };

    this.fixtures.set(fixture.id, fixture);
    return fixture;
  }

  unpatchFixture(id: string): boolean {
    return this.fixtures.delete(id);
  }

  getFixture(id: string): Fixture | undefined {
    return this.fixtures.get(id);
  }

  listFixtures(): Fixture[] {
    return Array.from(this.fixtures.values());
  }

  clear(): void {
    this.fixtures.clear();
  }
}
