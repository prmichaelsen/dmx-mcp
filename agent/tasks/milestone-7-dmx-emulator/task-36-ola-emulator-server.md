# Task 36: Implement OLA Emulator Server

**Milestone**: [M7 - DMX Emulator & Monitor UI](../../milestones/milestone-7-dmx-emulator.md)
**Estimated Time**: 1.5 hours
**Dependencies**: None
**Status**: Not Started

---

## Objective

Create a lightweight HTTP server that emulates OLA's REST API for DMX control. The emulator accepts the same `/set_dmx` and `/get_dmx` requests that the real OLA daemon handles, stores DMX state in memory, and records a frame log for test assertions.

---

## Context

The real `OLAClient` in `src/ola/client.ts` makes HTTP calls to OLA at `http://localhost:9090`. Currently, the E2E tests bypass this by injecting a `MockOLAClient` at the code level. The emulator sits at the HTTP layer instead, so the real `OLAClient` can be tested end-to-end without modification.

The emulator only needs to implement the two endpoints dmx-mcp uses:
- `POST /set_dmx` — Set DMX channel values (form-encoded: `u=<universe>&d=<comma-separated values>`)
- `GET /get_dmx?u=<universe>` — Read current DMX state (returns `{"dmx": [...]}`)

---

## Steps

### 1. Create Emulator Module

```
src/emulator/
├── index.ts          # Barrel export
└── server.ts         # OLA emulator HTTP server
```

### 2. Implement DMXEmulatorServer Class

```typescript
// src/emulator/server.ts
import { createServer, type Server } from "node:http";

interface DMXFrame {
  universe: number;
  channels: number[];
  timestamp: number;
}

export class DMXEmulatorServer {
  private server: Server;
  private state: Map<number, number[]>;  // universe → 512-channel array
  private frames: DMXFrame[];            // recorded frame log

  constructor(private port: number = 9090);

  /** Start listening */
  async start(): Promise<void>;

  /** Stop the server */
  async stop(): Promise<void>;

  /** Get recorded frames (for test assertions) */
  getFrames(): DMXFrame[];

  /** Get frames for a specific universe */
  getFramesForUniverse(universe: number): DMXFrame[];

  /** Get current state for a universe */
  getState(universe: number): number[];

  /** Clear all state and frame log */
  reset(): void;
}
```

### 3. Implement Request Handling

**POST /set_dmx**:
- Parse form-encoded body: `u=<universe>&d=<comma-separated values>`
- Store channels in state map
- Record frame in log with timestamp
- Return `200 OK`

**GET /get_dmx**:
- Parse query parameter `u=<universe>`
- Return JSON: `{"dmx": [0, 0, 255, ...]}`
- If universe doesn't exist, return 512 zeros

**GET /** (root):
- Reserved for monitor UI (Task 37)
- For now, return simple JSON status: `{"status": "running", "universes": [...]}`

**POST /reset**:
- Clear all state and frame log
- Return `200 OK`
- Test helper endpoint (not part of real OLA API)

**GET /frames**:
- Return recorded frame log as JSON
- Optional query param `u=<universe>` to filter
- Test helper endpoint (not part of real OLA API)

### 4. Handle OLA Request Format

The real OLA expects form-encoded POST bodies, not JSON:
```
Content-Type: application/x-www-form-urlencoded
Body: u=1&d=255,0,128,0,0,...
```

Parse this correctly using `URLSearchParams` on the raw body.

### 5. Create Barrel Export

```typescript
// src/emulator/index.ts
export { DMXEmulatorServer } from "./server.js";
```

### 6. Verify

```bash
npx tsc --noEmit
```

Start the emulator manually and test with curl:
```bash
# In one terminal:
npx tsx src/emulator/server.ts

# In another:
curl -X POST http://localhost:9090/set_dmx -d "u=1&d=255,128,0"
curl "http://localhost:9090/get_dmx?u=1"
# Should return {"dmx": [255, 128, 0, 0, 0, ...]}
```

---

## Verification

- [ ] `DMXEmulatorServer` class exists in `src/emulator/server.ts`
- [ ] Server starts on configurable port
- [ ] `POST /set_dmx` accepts form-encoded body and stores state
- [ ] `GET /get_dmx?u=N` returns current DMX state as JSON
- [ ] Frame log records every `setDMX` call with timestamp
- [ ] `POST /reset` clears state and frame log
- [ ] `GET /frames` returns frame log as JSON
- [ ] No external dependencies (uses only `node:http`)
- [ ] `npx tsc --noEmit` passes

---

## Notes

- Keep the server minimal — it's a development/testing tool, not production infrastructure
- Use `node:http` directly, no Express or other framework
- The form-encoded body parsing matches what `OLAClient.setDMX()` sends
- Port defaults to 9090 (same as OLA) but is configurable to avoid conflicts
- The `/reset` and `/frames` endpoints are test helpers — they don't exist in real OLA

---

**Next Task**: [Task 37: Implement Browser Monitor UI](task-37-browser-monitor-ui.md)
