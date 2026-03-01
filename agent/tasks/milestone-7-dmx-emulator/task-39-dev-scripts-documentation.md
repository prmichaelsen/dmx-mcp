# Task 39: Add Dev Scripts and Documentation

**Milestone**: [M7 - DMX Emulator & Monitor UI](../../milestones/milestone-7-dmx-emulator.md)
**Estimated Time**: 0.5 hours
**Dependencies**: Task 36 (OLA Emulator Server), Task 37 (Browser Monitor UI)
**Status**: Not Started

---

## Objective

Add npm scripts for running the emulator during development and update project documentation to explain the emulator setup.

---

## Context

Developers need a simple way to start the emulator for local development and testing. The emulator should be easy to run alongside the MCP server, with clear documentation on how to use them together.

---

## Steps

### 1. Add Emulator Entry Point

Create a standalone entry point that starts the emulator:

```typescript
// src/emulator/main.ts
import { DMXEmulatorServer } from "./server.js";

const port = parseInt(process.env.OLA_PORT ?? "9090", 10);
const emulator = new DMXEmulatorServer(port);

emulator.start().then(() => {
  console.log(`DMX Emulator running at http://localhost:${port}/`);
  console.log(`Monitor UI: http://localhost:${port}/`);
  console.log(`Press Ctrl+C to stop`);
});

process.on("SIGINT", async () => {
  await emulator.stop();
  process.exit(0);
});
```

### 2. Add npm Scripts

Update `package.json`:

```json
{
  "scripts": {
    "emulator": "tsx src/emulator/main.ts",
    "dev:emulator": "tsx watch src/emulator/main.ts"
  }
}
```

### 3. Update .env.example

```bash
# OLA connection (or emulator)
OLA_HOST=localhost
OLA_PORT=9090

# To use the emulator instead of real OLA:
# 1. Run: npm run emulator
# 2. Open http://localhost:9090/ to see the DMX monitor
# 3. Start the MCP server normally — it will connect to the emulator
```

### 4. Verify

```bash
# Start emulator
npm run emulator
# → "DMX Emulator running at http://localhost:9090/"

# In another terminal, start MCP server
npm run dev

# Use MCP tools — emulator receives DMX commands
# Open http://localhost:9090/ to see the monitor
```

---

## Verification

- [ ] `npm run emulator` starts the emulator on configured port
- [ ] `npm run dev:emulator` starts with hot-reload
- [ ] `.env.example` updated with emulator usage instructions
- [ ] Emulator and MCP server work together (same port config)
- [ ] Ctrl+C cleanly shuts down the emulator
- [ ] All tests pass

---

## Notes

- The emulator uses the same `OLA_PORT` environment variable as the MCP server — they share the config naturally
- `tsx watch` provides hot-reload for the emulator during development
- No changes to the MCP server code needed — it already connects to `OLA_HOST:OLA_PORT`

---

**Next Task**: None (final task in Milestone 7)
