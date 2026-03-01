# Milestone 7: DMX Emulator & Monitor UI

**Goal**: Build a DMX emulator HTTP server that replaces OLA for development/testing, with a browser-based monitor UI for visualizing DMX output in real-time
**Duration**: ~0.5 weeks
**Dependencies**: M1 - Project Foundation (OLAClient interface)
**Status**: Not Started

---

## Overview

Currently, testing the full dmx-mcp pipeline requires a running OLA instance and physical DMX hardware. The E2E tests use a `MockOLAClient` injected at the code level, which skips the real `OLAClient` HTTP layer entirely. This milestone adds a lightweight HTTP server that mimics OLA's REST API (`/set_dmx`, `/get_dmx`), allowing the real `OLAClient` to make actual HTTP calls against an emulator. A browser-based monitor UI provides real-time visualization of DMX channel values — useful for development, demos, and debugging without hardware.

---

## Deliverables

### 1. OLA Emulator Server
- HTTP server implementing OLA's `/set_dmx` (POST) and `/get_dmx` (GET) endpoints
- In-memory DMX state storage (512-channel arrays per universe)
- Frame recording log for test assertions
- REST API to query recorded frames and reset state
- Configurable port (default 9090, matching OLA)

### 2. Browser Monitor UI
- Single-page HTML/JS served by the emulator
- Real-time DMX channel grid (512 channels per universe)
- Color-coded intensity bars (0-255)
- Universe selector for multi-universe setups
- Auto-refreshing via polling or SSE

### 3. Test Integration
- npm script to start emulator for development (`npm run emulator`)
- Integration test that uses real `OLAClient` against the emulator
- Verify MCP tool → OLAClient → HTTP → emulator → frame log pipeline

### 4. Documentation
- Update `.env.example` with emulator configuration
- Usage instructions in emulator source

---

## Success Criteria

- [ ] Emulator starts on configurable port, accepts `/set_dmx` and `/get_dmx`
- [ ] Real `OLAClient` works against emulator without code changes
- [ ] Browser monitor shows live DMX values at `http://localhost:9090/`
- [ ] Integration test verifies full HTTP pipeline (MCP tool → real OLAClient → emulator)
- [ ] Emulator can be used as a drop-in OLA replacement for development
- [ ] All existing tests continue to pass

---

## Tasks

| Task | Title | Est. Hours | Dependencies |
|------|-------|-----------|--------------|
| 36 | Implement OLA Emulator Server | 1.5 | None |
| 37 | Implement Browser Monitor UI | 1.5 | Task 36 |
| 38 | Add Emulator Integration Tests | 1 | Task 36 |
| 39 | Add Dev Scripts and Documentation | 0.5 | Task 36, 37 |

**Total**: ~4.5 hours

---

## Notes

- The emulator is a development tool, not a production component — keep it simple
- No dependencies beyond Node.js built-ins (`node:http`, `node:fs`)
- The monitor UI is a single static HTML file with inline CSS/JS — no build step, no framework
- The emulator implements only the two OLA endpoints dmx-mcp uses, not the full OLA API
- SSE (Server-Sent Events) is preferred over WebSockets for the monitor — simpler, no extra dependencies

---

**Related Design Docs**: [DMX Lighting MCP Design](../design/local.dmx-lighting-mcp.md)
