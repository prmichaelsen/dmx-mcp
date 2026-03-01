import { readdir, readFile, writeFile, mkdir, unlink } from "node:fs/promises";
import { join } from "node:path";
import { homedir } from "node:os";
import type { Show } from "../types/index.js";

const DEFAULT_BASE_DIR = join(homedir(), ".dmx-lighting-mcp");
const SHOWS_SUBDIR = "shows";

export interface ShowMetadata {
  id: string;
  name: string;
  fixtureCount: number;
  sceneCount: number;
  cueListCount: number;
}

export class ShowStorage {
  private readonly showsDir: string;

  constructor(baseDir?: string) {
    const base = baseDir ?? DEFAULT_BASE_DIR;
    this.showsDir = join(base, SHOWS_SUBDIR);
  }

  private async ensureDirectory(): Promise<void> {
    await mkdir(this.showsDir, { recursive: true });
  }

  private getShowPath(id: string): string {
    return join(this.showsDir, `${id}.json`);
  }

  async saveShow(show: Show): Promise<void> {
    await this.ensureDirectory();
    const json = JSON.stringify(show, null, 2);
    await writeFile(this.getShowPath(show.id), json, "utf-8");
  }

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
        `Failed to read show "${id}": ${error instanceof Error ? error.message : String(error)}`,
      );
    }

    try {
      return JSON.parse(json) as Show;
    } catch (error) {
      throw new Error(
        `Failed to parse show "${id}" as JSON: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

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
        const show = JSON.parse(json) as Show;

        metadata.push({
          id: show.id,
          name: show.name,
          fixtureCount: show.fixtures?.length ?? 0,
          sceneCount: show.scenes?.length ?? 0,
          cueListCount: show.cueLists?.length ?? 0,
        });
      } catch {
        continue;
      }
    }

    return metadata;
  }

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
        `Failed to delete show "${id}": ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  getShowsDir(): string {
    return this.showsDir;
  }
}
