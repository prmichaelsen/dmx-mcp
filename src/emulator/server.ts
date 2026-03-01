import { createServer, type Server, type IncomingMessage, type ServerResponse } from "node:http";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

export interface DMXFrame {
  universe: number;
  channels: number[];
  timestamp: number;
}

export class DMXEmulatorServer {
  private server: Server;
  private state = new Map<number, number[]>();
  private frameLog: DMXFrame[] = [];
  private sseClients: Set<ServerResponse> = new Set();

  constructor(private port: number = 9090) {
    this.server = createServer((req, res) => this.handleRequest(req, res));
  }

  async start(): Promise<void> {
    return new Promise((resolve, reject) => {
      this.server.on("error", reject);
      this.server.listen(this.port, () => resolve());
    });
  }

  async stop(): Promise<void> {
    for (const client of this.sseClients) {
      client.end();
    }
    this.sseClients.clear();
    return new Promise((resolve, reject) => {
      this.server.close((err) => (err ? reject(err) : resolve()));
    });
  }

  getFrames(): DMXFrame[] {
    return [...this.frameLog];
  }

  getFramesForUniverse(universe: number): DMXFrame[] {
    return this.frameLog.filter((f) => f.universe === universe);
  }

  getState(universe: number): number[] {
    return this.state.get(universe) ?? new Array(512).fill(0);
  }

  getActiveUniverses(): number[] {
    return Array.from(this.state.keys()).sort((a, b) => a - b);
  }

  reset(): void {
    this.state.clear();
    this.frameLog = [];
  }

  private async handleRequest(req: IncomingMessage, res: ServerResponse): Promise<void> {
    const url = new URL(req.url ?? "/", `http://localhost:${this.port}`);

    try {
      if (req.method === "POST" && url.pathname === "/set_dmx") {
        await this.handleSetDMX(req, res);
      } else if (req.method === "GET" && url.pathname === "/get_dmx") {
        this.handleGetDMX(url, res);
      } else if (req.method === "GET" && url.pathname === "/events") {
        this.handleSSE(res);
      } else if (req.method === "GET" && url.pathname === "/frames") {
        this.handleGetFrames(url, res);
      } else if (req.method === "POST" && url.pathname === "/reset") {
        this.handleReset(res);
      } else if (req.method === "GET" && url.pathname === "/") {
        this.handleIndex(res);
      } else {
        res.writeHead(404, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: "Not found" }));
      }
    } catch {
      res.writeHead(500, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "Internal server error" }));
    }
  }

  private async handleSetDMX(req: IncomingMessage, res: ServerResponse): Promise<void> {
    const body = await this.readBody(req);
    const params = new URLSearchParams(body);
    const universe = parseInt(params.get("u") ?? "", 10);
    const channelStr = params.get("d") ?? "";

    if (isNaN(universe)) {
      res.writeHead(400, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "Missing or invalid universe parameter 'u'" }));
      return;
    }

    const channels = channelStr
      .split(",")
      .map((v) => Math.round(Math.min(255, Math.max(0, parseInt(v, 10) || 0))));

    // Pad to 512 channels
    while (channels.length < 512) {
      channels.push(0);
    }

    this.state.set(universe, channels);

    const frame: DMXFrame = {
      universe,
      channels: [...channels],
      timestamp: Date.now(),
    };
    this.frameLog.push(frame);

    // Notify SSE clients
    this.broadcastSSE({ universe, channels });

    res.writeHead(200, { "Content-Type": "text/plain" });
    res.end("OK");
  }

  private handleGetDMX(url: URL, res: ServerResponse): void {
    const universe = parseInt(url.searchParams.get("u") ?? "", 10);

    if (isNaN(universe)) {
      res.writeHead(400, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "Missing or invalid universe parameter 'u'" }));
      return;
    }

    const channels = this.state.get(universe) ?? new Array(512).fill(0);
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ dmx: channels }));
  }

  private handleSSE(res: ServerResponse): void {
    res.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      "Connection": "keep-alive",
    });

    this.sseClients.add(res);

    res.on("close", () => {
      this.sseClients.delete(res);
    });

    // Send initial state for all universes
    for (const [universe, channels] of this.state) {
      res.write(`event: dmx\ndata: ${JSON.stringify({ universe, channels })}\n\n`);
    }
  }

  private broadcastSSE(data: { universe: number; channels: number[] }): void {
    const message = `event: dmx\ndata: ${JSON.stringify(data)}\n\n`;
    for (const client of this.sseClients) {
      client.write(message);
    }
  }

  private handleGetFrames(url: URL, res: ServerResponse): void {
    const universeParam = url.searchParams.get("u");
    let frames = this.frameLog;
    if (universeParam) {
      const universe = parseInt(universeParam, 10);
      frames = frames.filter((f) => f.universe === universe);
    }
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ frames, count: frames.length }));
  }

  private handleReset(res: ServerResponse): void {
    this.reset();
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ success: true, message: "State and frame log cleared" }));
  }

  private handleIndex(res: ServerResponse): void {
    try {
      const dir = dirname(fileURLToPath(import.meta.url));
      const html = readFileSync(join(dir, "monitor.html"), "utf-8");
      res.writeHead(200, { "Content-Type": "text/html" });
      res.end(html);
    } catch {
      // Fallback if HTML file not found (e.g. running from dist/)
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({
        status: "running",
        emulator: "dmx-mcp OLA emulator",
        message: "Monitor UI not available (monitor.html not found). Use /get_dmx?u=N to read state.",
      }, null, 2));
    }
  }

  private readBody(req: IncomingMessage): Promise<string> {
    return new Promise((resolve, reject) => {
      const chunks: Buffer[] = [];
      req.on("data", (chunk: Buffer) => chunks.push(chunk));
      req.on("end", () => resolve(Buffer.concat(chunks).toString()));
      req.on("error", reject);
    });
  }
}
