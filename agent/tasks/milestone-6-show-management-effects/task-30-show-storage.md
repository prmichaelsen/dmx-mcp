# Task 30: Implement Show Storage

**Milestone**: [M6 - Show Management & Effects](../../milestones/milestone-6-show-management-effects.md)
**Estimated Time**: 1.5 hours
**Dependencies**: Task 3 (Core TypeScript Interfaces)
**Status**: Not Started

---

## Objective

Implement a `ShowStorage` class that persists shows as JSON files to `~/.dmx-lighting-mcp/shows/`. The class handles saving, loading, listing, and deleting show files, including proper serialization and deserialization of `Map` objects that JSON does not natively support.

---

## Context

Shows are the top-level container in the dmx-mcp data model. A `Show` bundles all fixtures, scenes, and cue lists into a single unit that can be saved to disk and restored later. The storage directory lives in the user's home directory at `~/.dmx-lighting-mcp/`, which also holds fixture profiles and a config file:

```
~/.dmx-lighting-mcp/
├── shows/
│   ├── sunday-service.json
│   ├── concert-2026-03.json
│   └── test-rig.json
├── profiles/
│   ├── generic-rgb-par.json
│   └── custom-moving-head.json
└── config.yaml
```

The primary challenge is that `Scene.fixtureStates` is a `Map<string, ChannelValues>`, and JSON does not natively serialize `Map` objects. The `ShowStorage` class must convert Maps to plain objects on save and reconstruct them on load.

---

## Steps

### 1. Create the Show Storage Module

```bash
mkdir -p src/shows
touch src/shows/storage.ts
```

### 2. Implement the ShowStorage Class

```typescript
// src/shows/storage.ts

import { readdir, readFile, writeFile, mkdir, unlink } from "node:fs/promises";
import { join } from "node:path";
import { homedir } from "node:os";
import type { Show, Scene, ChannelValues } from "../types/index.js";

/**
 * Default base directory for all dmx-mcp data.
 */
const DEFAULT_BASE_DIR = join(homedir(), ".dmx-lighting-mcp");

/**
 * Subdirectory within the base directory for show files.
 */
const SHOWS_SUBDIR = "shows";

/**
 * Metadata about a saved show, returned by listShows().
 */
export interface ShowMetadata {
  /** Show ID (derived from filename) */
  id: string;
  /** Show name */
  name: string;
  /** Number of fixtures in the show */
  fixtureCount: number;
  /** Number of scenes in the show */
  sceneCount: number;
  /** Number of cue lists in the show */
  cueListCount: number;
}

/**
 * JSON-safe representation of a Scene.
 * Maps are converted to plain objects for serialization.
 */
interface SerializedScene {
  id: string;
  name: string;
  fixtureStates: Record<string, ChannelValues>;
}

/**
 * JSON-safe representation of a Show.
 * Scene fixtureStates Maps are converted to plain objects.
 */
interface SerializedShow {
  id: string;
  name: string;
  fixtures: Show["fixtures"];
  scenes: SerializedScene[];
  cueLists: Show["cueLists"];
}

/**
 * Persists shows as JSON files to disk.
 *
 * Shows are saved to ~/.dmx-lighting-mcp/shows/{id}.json.
 * The storage directory is created automatically if it does not exist.
 *
 * Map<string, ChannelValues> fields in scenes are serialized to/from
 * plain objects since JSON does not support Map natively.
 */
export class ShowStorage {
  private readonly showsDir: string;

  constructor(baseDir?: string) {
    const base = baseDir ?? DEFAULT_BASE_DIR;
    this.showsDir = join(base, SHOWS_SUBDIR);
  }

  /**
   * Ensure the shows directory exists, creating it (and parents) if needed.
   */
  private async ensureDirectory(): Promise<void> {
    await mkdir(this.showsDir, { recursive: true });
  }

  /**
   * Get the file path for a show by its ID.
   */
  private getShowPath(id: string): string {
    return join(this.showsDir, `${id}.json`);
  }

  /**
   * Save a show to disk as a JSON file.
   *
   * The show is written to ~/.dmx-lighting-mcp/shows/{show.id}.json.
   * If a file with that ID already exists, it is overwritten.
   *
   * @param show - The show to save
   */
  async saveShow(show: Show): Promise<void> {
    await this.ensureDirectory();

    const serialized = this.serializeShow(show);
    const json = JSON.stringify(serialized, null, 2);
    const filePath = this.getShowPath(show.id);

    await writeFile(filePath, json, "utf-8");
  }

  /**
   * Load a show from disk by its ID.
   *
   * @param id - The show ID (matches the filename without .json extension)
   * @returns The deserialized Show object with Maps reconstructed
   * @throws Error if the show file does not exist or cannot be parsed
   */
  async loadShow(id: string): Promise<Show> {
    const filePath = this.getShowPath(id);

    let json: string;
    try {
      json = await readFile(filePath, "utf-8");
    } catch (error) {
      if (
        error instanceof Error &&
        "code" in error &&
        (error as NodeJS.ErrnoException).code === "ENOENT"
      ) {
        throw new Error(`Show "${id}" not found at ${filePath}`);
      }
      throw new Error(
        `Failed to read show "${id}": ${error instanceof Error ? error.message : String(error)}`
      );
    }

    let serialized: SerializedShow;
    try {
      serialized = JSON.parse(json) as SerializedShow;
    } catch (error) {
      throw new Error(
        `Failed to parse show "${id}" as JSON: ${error instanceof Error ? error.message : String(error)}`
      );
    }

    return this.deserializeShow(serialized);
  }

  /**
   * List all saved shows with their metadata.
   *
   * Reads the shows directory, parses each JSON file to extract
   * metadata (id, name, counts), and returns the list.
   *
   * @returns Array of ShowMetadata for all saved shows
   */
  async listShows(): Promise<ShowMetadata[]> {
    await this.ensureDirectory();

    let entries: string[];
    try {
      entries = await readdir(this.showsDir);
    } catch {
      return [];
    }

    const jsonFiles = entries.filter((f) => f.endsWith(".json"));
    const metadata: ShowMetadata[] = [];

    for (const file of jsonFiles) {
      try {
        const filePath = join(this.showsDir, file);
        const json = await readFile(filePath, "utf-8");
        const show = JSON.parse(json) as SerializedShow;

        metadata.push({
          id: show.id,
          name: show.name,
          fixtureCount: show.fixtures?.length ?? 0,
          sceneCount: show.scenes?.length ?? 0,
          cueListCount: show.cueLists?.length ?? 0,
        });
      } catch {
        // Skip files that cannot be parsed -- they may be corrupt
        // or not valid show files
        continue;
      }
    }

    return metadata;
  }

  /**
   * Delete a saved show by its ID.
   *
   * @param id - The show ID to delete
   * @throws Error if the show file does not exist
   */
  async deleteShow(id: string): Promise<void> {
    const filePath = this.getShowPath(id);

    try {
      await unlink(filePath);
    } catch (error) {
      if (
        error instanceof Error &&
        "code" in error &&
        (error as NodeJS.ErrnoException).code === "ENOENT"
      ) {
        throw new Error(`Show "${id}" not found at ${filePath}`);
      }
      throw new Error(
        `Failed to delete show "${id}": ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  /**
   * Convert a Show to a JSON-safe representation.
   *
   * Converts Scene.fixtureStates from Map<string, ChannelValues>
   * to Record<string, ChannelValues> (plain object).
   */
  private serializeShow(show: Show): SerializedShow {
    return {
      id: show.id,
      name: show.name,
      fixtures: show.fixtures,
      scenes: show.scenes.map((scene) => this.serializeScene(scene)),
      cueLists: show.cueLists,
    };
  }

  /**
   * Convert a serialized show back into a Show with Maps reconstructed.
   */
  private deserializeShow(serialized: SerializedShow): Show {
    return {
      id: serialized.id,
      name: serialized.name,
      fixtures: serialized.fixtures,
      scenes: serialized.scenes.map((scene) =>
        this.deserializeScene(scene)
      ),
      cueLists: serialized.cueLists,
    };
  }

  /**
   * Serialize a Scene by converting its fixtureStates Map to a plain object.
   */
  private serializeScene(scene: Scene): SerializedScene {
    const fixtureStates: Record<string, ChannelValues> = {};
    for (const [fixtureId, values] of scene.fixtureStates) {
      fixtureStates[fixtureId] = values;
    }

    return {
      id: scene.id,
      name: scene.name,
      fixtureStates,
    };
  }

  /**
   * Deserialize a Scene by converting its fixtureStates plain object
   * back to a Map<string, ChannelValues>.
   */
  private deserializeScene(serialized: SerializedScene): Scene {
    return {
      id: serialized.id,
      name: serialized.name,
      fixtureStates: new Map(Object.entries(serialized.fixtureStates)),
    };
  }

  /**
   * Get the shows directory path (useful for diagnostics).
   */
  getShowsDir(): string {
    return this.showsDir;
  }
}
```

### 3. Create the Barrel Export

Create `src/shows/index.ts` to re-export the storage module:

```typescript
// src/shows/index.ts

export { ShowStorage } from "./storage.js";
export type { ShowMetadata } from "./storage.js";
```

### 4. Verify TypeScript Compilation

```bash
npx tsc --noEmit
```

---

## Verification

- [ ] `src/shows/storage.ts` exists and exports the `ShowStorage` class
- [ ] `ShowStorage` constructor defaults to `~/.dmx-lighting-mcp/shows/` directory
- [ ] `ShowStorage` constructor accepts optional `baseDir` override for testing
- [ ] `saveShow()` creates the shows directory if it does not exist
- [ ] `saveShow()` writes a valid JSON file to `{showsDir}/{show.id}.json`
- [ ] `saveShow()` correctly converts `Scene.fixtureStates` Map to a plain object in JSON
- [ ] `loadShow()` reads the JSON file and returns a `Show` object
- [ ] `loadShow()` correctly reconstructs `Scene.fixtureStates` as a `Map<string, ChannelValues>`
- [ ] `loadShow()` throws a descriptive error if the show file does not exist
- [ ] `loadShow()` throws a descriptive error if the JSON is invalid
- [ ] `listShows()` returns an array of `ShowMetadata` for all `.json` files in the directory
- [ ] `listShows()` returns an empty array if the directory is empty or does not exist
- [ ] `listShows()` skips corrupt/invalid JSON files without crashing
- [ ] `deleteShow()` removes the show file from disk
- [ ] `deleteShow()` throws a descriptive error if the show file does not exist
- [ ] `src/shows/index.ts` barrel export exists and re-exports `ShowStorage` and `ShowMetadata`
- [ ] `npx tsc --noEmit` passes with zero errors

---

## Notes

- The `ShowStorage` constructor accepts an optional `baseDir` parameter to override the default `~/.dmx-lighting-mcp` path. This is essential for unit tests -- tests should write to a temporary directory (e.g., via `os.tmpdir()`) rather than the user's home directory.
- `Scene.fixtureStates` is the only field in the Show data model that uses a `Map`. All other fields (fixtures, cueLists, cues) are arrays or plain objects that JSON handles natively. The serialization/deserialization logic is scoped to just this one field.
- `listShows()` reads and parses each file to extract metadata. For typical use cases (a few dozen shows at most), this is acceptable. If performance becomes an issue, a metadata index file could be introduced.
- The `mkdir({ recursive: true })` call is idempotent -- it succeeds even if the directory already exists. It also creates parent directories (e.g., `~/.dmx-lighting-mcp/` if it does not exist).
- JSON files are written with `null, 2` indentation for human readability. Show files may be version-controlled or manually inspected.
- The `Fixture` type contains a nested `FixtureProfile` object with `ChannelDefinition[]`. These are all plain objects/arrays and serialize to JSON without any special handling.

---

**Next Task**: [Task 31: Implement Show Management Tools](task-31-show-management-tools.md)
**Related Design Docs**: [DMX Lighting MCP Design](../../design/local.dmx-lighting-mcp.md)
