# Milestone 1: Project Foundation & OLA Client

**Goal**: Establish the TypeScript project, MCP server scaffold, core data types, and OLA REST client
**Duration**: ~1 week
**Dependencies**: None
**Status**: Not Started

---

## Overview

This milestone establishes the foundational infrastructure for the dmx-mcp server. It creates the TypeScript project with build tooling, installs the MCP SDK and sets up a basic server scaffold, defines all core TypeScript interfaces from the design document, and implements the OLA REST client that all subsequent milestones depend on. Without this foundation, no MCP tools can be built.

---

## Deliverables

### 1. TypeScript Project Setup
- package.json with project metadata and scripts
- tsconfig.json configured for ES2022 + Node16
- esbuild configuration for fast builds
- .gitignore, .env.example

### 2. MCP Server Scaffold
- Basic MCP server using @modelcontextprotocol/sdk
- stdio transport configured
- Server starts and responds to MCP protocol

### 3. Core TypeScript Interfaces
- Fixture, FixtureProfile, ChannelDefinition, ChannelType
- Scene, Cue, CueList, Show
- All types from design document defined

### 4. OLA REST Client
- OLAClient class with setDMX and getDMX methods
- HTTP communication to localhost:9090
- Error handling for connection failures

### 5. Development Tooling
- Build, dev, and test scripts
- Vitest configured for unit tests
- Unit tests for OLA client with mocked HTTP

---

## Success Criteria

- [ ] `npm install` completes without errors
- [ ] `npm run build` compiles TypeScript without errors
- [ ] `npm run typecheck` passes
- [ ] MCP server starts via stdio and responds to initialize
- [ ] OLA client can setDMX and getDMX (mocked tests pass)
- [ ] All core TypeScript interfaces compile correctly
- [ ] `npm test` passes all unit tests

---

## Key Files to Create

```
dmx-mcp/
├── package.json
├── tsconfig.json
├── esbuild.config.js
├── .gitignore
├── .env.example
├── src/
│   ├── index.ts              # Entry point, MCP server setup
│   ├── server.ts             # MCP server configuration
│   ├── types/
│   │   └── index.ts          # All core interfaces
│   ├── ola/
│   │   └── client.ts         # OLA REST client
│   └── utils/
│       └── logger.ts         # Basic logging utility
└── tests/
    └── ola/
        └── client.test.ts    # OLA client unit tests
```

---

## Tasks

1. [Task 1: Initialize TypeScript Project](../tasks/milestone-1-project-foundation/task-1-initialize-typescript-project.md) - Set up package.json, tsconfig, esbuild
2. [Task 2: Set Up MCP Server Scaffold](../tasks/milestone-1-project-foundation/task-2-mcp-server-scaffold.md) - Install MCP SDK, create basic server
3. [Task 3: Define Core TypeScript Interfaces](../tasks/milestone-1-project-foundation/task-3-core-typescript-interfaces.md) - All data models from design
4. [Task 4: Implement OLA REST Client](../tasks/milestone-1-project-foundation/task-4-ola-rest-client.md) - setDMX, getDMX HTTP client
5. [Task 5: Add OLA Client Unit Tests](../tasks/milestone-1-project-foundation/task-5-ola-client-tests.md) - Mocked HTTP tests
6. [Task 6: Add Development Scripts](../tasks/milestone-1-project-foundation/task-6-development-scripts.md) - Build, dev, test scripts

---

## Environment Variables

```env
# OLA Configuration
OLA_HOST=localhost
OLA_PORT=9090
```

---

## Testing Requirements

- [ ] OLA client setDMX sends correct POST request
- [ ] OLA client getDMX parses response correctly
- [ ] OLA client handles connection errors gracefully
- [ ] TypeScript types are correct (typecheck passes)

---

## Risks and Mitigation

| Risk | Impact | Probability | Mitigation Strategy |
|------|--------|-------------|---------------------|
| OLA not installed for dev testing | Medium | Medium | Use mocked HTTP in tests; OLA only needed for integration |
| MCP SDK API changes | Low | Low | Pin SDK version in package.json |

---

**Next Milestone**: [Milestone 2: Fixture Management](milestone-2-fixture-management.md)
**Blockers**: None
**Notes**: This is the foundational milestone. All other milestones depend on it.
