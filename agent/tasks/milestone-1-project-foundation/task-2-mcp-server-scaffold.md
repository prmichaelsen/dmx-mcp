# Task 2: Set Up MCP Server Scaffold

**Milestone**: [M1 - Project Foundation & OLA Client](../../milestones/milestone-1-project-foundation.md)
**Estimated Time**: 1 hour
**Dependencies**: Task 1 (Initialize TypeScript Project)
**Status**: Not Started

---

## Objective

Install the `@modelcontextprotocol/sdk` package and create a minimal but functional MCP server that communicates over stdio transport. The server should start, respond to the MCP `initialize` handshake, and be ready to have tools registered in later milestones.

---

## Context

The MCP (Model Context Protocol) server is the core of this project -- it is the interface between the AI agent and the DMX lighting system. The server uses stdio transport, meaning it reads JSON-RPC messages from stdin and writes responses to stdout. This is the standard transport for MCP servers invoked by Claude Desktop, Claude Code, and other MCP clients.

The `@modelcontextprotocol/sdk` package provides the `Server` class and `StdioServerTransport` that handle all protocol-level concerns (message framing, JSON-RPC, capability negotiation). Our job is to configure the server with the correct name, version, and capabilities.

---

## Steps

### 1. Install the MCP SDK

```bash
npm install @modelcontextprotocol/sdk
```

This installs the official MCP SDK which provides:
- `Server` class for creating MCP servers
- `StdioServerTransport` for stdio-based communication
- Type definitions for MCP protocol messages

### 2. Create src/server.ts

Create the MCP server configuration module at `src/server.ts`:

```typescript
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";

const SERVER_NAME = "dmx-mcp";
const SERVER_VERSION = "0.1.0";

export function createServer(): Server {
  const server = new Server(
    {
      name: SERVER_NAME,
      version: SERVER_VERSION,
    },
    {
      capabilities: {
        tools: {},
      },
    }
  );

  return server;
}

export async function startServer(server: Server): Promise<void> {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error(`${SERVER_NAME} v${SERVER_VERSION} running on stdio`);
}
```

Key details:
- `capabilities: { tools: {} }` declares that this server will provide tools. The empty object means "tools capability is enabled with default settings."
- Logging goes to `console.error` (stderr) because stdout is reserved for MCP protocol messages.
- The `createServer` and `startServer` functions are separated to allow testing the server configuration without starting the transport.

### 3. Create src/index.ts

Create the entry point at `src/index.ts`:

```typescript
import { createServer, startServer } from "./server.js";

async function main(): Promise<void> {
  const server = createServer();

  // Tool handlers will be registered here in future milestones
  // e.g., registerFixtureTools(server);
  // e.g., registerSceneTools(server);

  await startServer(server);
}

main().catch((error) => {
  console.error("Fatal error starting dmx-mcp server:", error);
  process.exit(1);
});
```

Key details:
- The `.js` extension in the import path is required for Node16 module resolution with ESM.
- The `main()` function is async to support the awaitable `startServer`.
- Unhandled errors are caught, logged, and cause the process to exit with a non-zero code.

### 4. Test That the Server Starts

Build and verify the server starts correctly:

```bash
# Compile TypeScript
npx tsc

# Run the server (it will wait for input on stdin)
# Send a Ctrl+C to stop it after confirming it starts
node dist/index.js
```

You should see on stderr:
```
dmx-mcp v0.1.0 running on stdio
```

Alternatively, you can test the MCP initialize handshake by piping a JSON-RPC message:

```bash
echo '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2024-11-05","capabilities":{},"clientInfo":{"name":"test","version":"0.1.0"}}}' | node dist/index.js
```

The server should respond with a JSON-RPC response containing the server info and capabilities.

### 5. Verify MCP Client Compatibility (Optional)

If you have Claude Desktop or another MCP client available, you can add the server to your MCP configuration to verify it connects:

```json
{
  "mcpServers": {
    "dmx-mcp": {
      "command": "node",
      "args": ["/absolute/path/to/dmx-mcp/dist/index.js"]
    }
  }
}
```

---

## Verification

- [ ] `@modelcontextprotocol/sdk` is listed in `package.json` dependencies
- [ ] `src/server.ts` exists and exports `createServer` and `startServer`
- [ ] `src/index.ts` exists and imports from `./server.js`
- [ ] `npx tsc` compiles without errors
- [ ] Running `node dist/index.js` prints the startup message to stderr
- [ ] The server responds to an MCP `initialize` request with valid JSON-RPC

---

## Notes

- All MCP protocol communication happens over stdout/stdin. Never use `console.log` for debug output in this project -- always use `console.error` so debug messages go to stderr and do not corrupt the MCP protocol stream.
- Import paths must use the `.js` extension (e.g., `./server.js`) even though the source files are `.ts`. This is a requirement of Node16 ESM module resolution.
- The server currently has no tools registered. Tools will be added in Milestone 2 (Fixture Management) and beyond. The `capabilities: { tools: {} }` declaration tells the MCP client that this server supports tools.
- If the MCP SDK API changes in future versions, the `Server` constructor signature and transport setup may need to be updated. Pin the SDK version in package.json to avoid surprises.

---

**Next Task**: [Task 3: Define Core TypeScript Interfaces](task-3-core-typescript-interfaces.md)
**Related Design Docs**: [DMX Lighting MCP Design](../../design/local.dmx-lighting-mcp.md)
