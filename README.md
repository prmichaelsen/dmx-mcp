# lightkey-mcp

MCP server for programming and controlling DMX lighting shows via OLA, driven by AI agents.

> Built with [Agent Context Protocol](https://github.com/prmichaelsen/agent-context-protocol)

## Overview

An MCP server that gives AI agents the ability to design, program, and run DMX lighting shows. Instead of manually clicking through lighting software GUIs, describe what you want in natural language and the agent handles fixture patching, scene creation, cue sequencing, and live playback.

**Architecture:**
```
Claude (agent)  →  lightkey-mcp  →  OLA REST API (:9090)  →  Enttec USB DMX  →  Fixtures
```

## Features

- Patch and manage DMX fixtures with named profiles
- Create scenes with colors, intensities, and positions
- Build cue lists with fade times and sequencing
- Live playback control (go, stop, blackout)
- Dynamic effects (chase, rainbow, strobe)
- Save/load shows as JSON files
- Full control through MCP tools — no GUI required

## Prerequisites

- [OLA](https://www.openlighting.org/ola/) installed and running
- Enttec USB DMX adapter (or any OLA-compatible interface)
- Node.js 20+

## Quick Start

```bash
# Install dependencies
npm install

# Start OLA (if not already running)
olad

# Build and run
npm run build
```

## Development

This project uses the Agent Context Protocol for development:

- `@acp.init` - Initialize agent context
- `@acp.plan` - Plan milestones and tasks
- `@acp.proceed` - Continue with next task
- `@acp.status` - Check project status

See [AGENT.md](./AGENT.md) for complete ACP documentation.

## Project Structure

```
lightkey-mcp/
├── AGENT.md              # ACP methodology
├── agent/                # ACP directory
│   ├── design/          # Design documents
│   ├── milestones/      # Project milestones
│   ├── tasks/           # Task breakdown
│   ├── patterns/        # Architectural patterns
│   └── progress.yaml    # Progress tracking
├── src/                  # Source code
│   ├── index.ts         # MCP server entry point
│   ├── tools/           # MCP tool implementations
│   ├── models/          # Data models (fixture, scene, cue)
│   ├── engine/          # Fade engine, effect engine
│   └── ola/             # OLA REST client
└── shows/               # Saved show files
```

## License

MIT

## Author

Patrick Michaelsen
