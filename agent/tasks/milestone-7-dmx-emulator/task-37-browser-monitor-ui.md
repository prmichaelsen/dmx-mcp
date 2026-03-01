# Task 37: Implement Browser Monitor UI

**Milestone**: [M7 - DMX Emulator & Monitor UI](../../milestones/milestone-7-dmx-emulator.md)
**Estimated Time**: 1.5 hours
**Dependencies**: Task 36 (OLA Emulator Server)
**Status**: Not Started

---

## Objective

Add a browser-based DMX monitor UI to the emulator server. When the user navigates to `http://localhost:9090/`, they see a real-time visualization of all DMX channel values, updated live as the MCP server sends commands.

---

## Context

Professional DMX software always includes a DMX monitor — a grid showing all 512 channel values for a universe. OLA itself has one at `/new/#/universe/1/dmx_monitor`. Our emulator should provide the same, making it easy to visually verify that MCP commands produce the expected DMX output without physical lights.

The UI is a single static HTML file with inline CSS and JS — no build step, no framework, no npm dependencies. It uses Server-Sent Events (SSE) for live updates from the emulator.

---

## Steps

### 1. Create the Monitor HTML File

```
src/emulator/
├── index.ts
├── server.ts
└── monitor.html        # Single-file monitor UI
```

### 2. Design the Channel Grid

The monitor displays a 512-channel grid for the selected universe:

```
┌─────────────────────────────────────────────────┐
│  DMX Monitor — Universe 1              [1][2][3] │
├─────────────────────────────────────────────────┤
│  001 ███████████████████████████  255            │
│  002 ████████████████             128            │
│  003                                0            │
│  004 ██████████████████████████   200            │
│  ...                                             │
│  512                                0            │
└─────────────────────────────────────────────────┘
```

**Elements**:
- Universe selector buttons (show all universes that have received data)
- Channel number (001-512)
- Horizontal intensity bar (width proportional to value, color-coded)
- Numeric value (0-255)
- Only show channels with non-zero values by default, with toggle to show all

### 3. Add SSE Endpoint to Emulator

Add a `GET /events` endpoint that streams DMX state updates:

```typescript
// In DMXEmulatorServer, add SSE support:

// GET /events — Server-Sent Events stream
// Sends a "dmx" event whenever setDMX is called
// Data format: { universe: number, channels: number[] }
```

When a `POST /set_dmx` is received:
1. Update state as before
2. Push an SSE event to all connected clients

### 4. Implement the Monitor JavaScript

```javascript
// Inline in monitor.html

const eventSource = new EventSource("/events");
eventSource.addEventListener("dmx", (event) => {
  const { universe, channels } = JSON.parse(event.data);
  updateGrid(universe, channels);
});

function updateGrid(universe, channels) {
  // Update the channel bars and values
  // Only re-render channels that changed (diff against previous state)
}
```

### 5. Style the Monitor

- Dark background (standard for lighting software)
- Channel bars colored by intensity (black → dim blue → bright white)
- Monospace font for channel numbers and values
- Responsive grid layout
- Compact rows to fit many channels on screen

### 6. Serve the HTML from the Emulator

Update `DMXEmulatorServer` to serve `monitor.html` on `GET /`:

```typescript
// In request handler:
if (req.method === "GET" && url.pathname === "/") {
  const html = readFileSync(join(__dirname, "monitor.html"), "utf-8");
  res.writeHead(200, { "Content-Type": "text/html" });
  res.end(html);
}
```

### 7. Verify

- Start emulator: `npx tsx src/emulator/server.ts`
- Open `http://localhost:9090/` in browser
- Send DMX data: `curl -X POST http://localhost:9090/set_dmx -d "u=1&d=255,128,0"`
- Verify channel bars update in real-time in the browser

---

## Verification

- [ ] `GET /` serves the monitor HTML page
- [ ] `GET /events` returns an SSE stream
- [ ] Channel grid shows 512 channels for selected universe
- [ ] Channel bars update in real-time when `/set_dmx` is called
- [ ] Universe selector works (shows all active universes)
- [ ] Non-zero channel filter toggle works
- [ ] Dark theme with readable channel values
- [ ] No external dependencies (inline CSS/JS, no CDN, no framework)
- [ ] Works in Chrome, Firefox, Safari

---

## Notes

- SSE is chosen over WebSockets because it's simpler (built into browsers, one-directional, auto-reconnect) and we only need server→client updates
- The HTML file is read from disk at startup (or on each request in dev mode) — no bundling needed
- For fixtures with RGB channels, adjacent channel bars will naturally show as R/G/B colors — no special fixture awareness needed in the monitor
- Keep the UI simple — this is a debug tool, not a lighting console

---

**Next Task**: [Task 38: Add Emulator Integration Tests](task-38-emulator-integration-tests.md)
