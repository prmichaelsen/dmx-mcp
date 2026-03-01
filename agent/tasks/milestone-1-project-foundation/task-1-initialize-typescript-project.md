# Task 1: Initialize TypeScript Project

**Milestone**: [M1 - Project Foundation & OLA Client](../../milestones/milestone-1-project-foundation.md)
**Estimated Time**: 1 hour
**Dependencies**: None
**Status**: Not Started

---

## Objective

Set up a complete TypeScript project with package.json, tsconfig.json, esbuild configuration, environment files, and the standard directory structure required for the dmx-mcp MCP server.

---

## Context

This is the very first task in the project. Every subsequent task depends on having a properly configured TypeScript project with build tooling in place. The project uses ES modules (ESM), targets Node.js 18+, and uses esbuild for fast bundling. The directory structure separates concerns into types, OLA client code, utilities, and tests, following the architecture laid out in the design document.

---

## Steps

### 1. Initialize npm Project

Run `npm init` to create the initial package.json:

```bash
cd /home/prmichaelsen/.acp/projects/dmx-mcp
npm init -y
```

### 2. Configure package.json

Replace the generated package.json with the project-specific configuration:

```json
{
  "name": "dmx-mcp",
  "version": "0.1.0",
  "description": "MCP server for programming and controlling DMX lighting shows via OLA",
  "main": "dist/index.js",
  "type": "module",
  "scripts": {
    "build": "node esbuild.config.js",
    "dev": "tsx watch src/index.ts",
    "start": "node dist/index.js",
    "test": "vitest",
    "typecheck": "tsc --noEmit"
  },
  "keywords": ["mcp", "dmx", "lighting", "ola", "artnet"],
  "author": "",
  "license": "MIT",
  "engines": {
    "node": ">=18.0.0"
  }
}
```

Key choices:
- `"type": "module"` enables ESM imports/exports throughout the project.
- `"main": "dist/index.js"` points to the compiled output.
- `"engines"` enforces Node 18+ for native `fetch` support (used by the OLA client).

### 3. Create tsconfig.json

Create `tsconfig.json` in the project root:

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "Node16",
    "moduleResolution": "Node16",
    "lib": ["ES2022"],
    "outDir": "./dist",
    "rootDir": "./src",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "resolveJsonModule": true,
    "declaration": true,
    "declarationMap": true,
    "sourceMap": true
  },
  "include": ["src/**/*"],
  "exclude": ["node_modules", "dist", "tests"]
}
```

Key choices:
- `ES2022` target provides modern JS features (top-level await, structuredClone, etc.).
- `Node16` module resolution matches the ESM + Node.js runtime.
- `strict: true` enables all strict type-checking options for maximum safety.
- `declaration` and `declarationMap` generate `.d.ts` files if the server is ever consumed as a library.

### 4. Create esbuild.config.js

Create `esbuild.config.js` in the project root for fast production builds:

```javascript
import { build } from "esbuild";

await build({
  entryPoints: ["src/index.ts"],
  bundle: true,
  platform: "node",
  target: "node18",
  format: "esm",
  outdir: "dist",
  sourcemap: true,
  external: [
    // Mark node_modules as external to avoid bundling them
    // MCP SDK and other deps will be resolved at runtime
  ],
  banner: {
    // Shim for __dirname in ESM if needed
    js: `
import { createRequire } from 'module';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
const require = createRequire(import.meta.url);
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
    `.trim(),
  },
});

console.log("Build complete.");
```

### 5. Create .gitignore

Create `.gitignore` in the project root:

```
# Dependencies
node_modules/

# Build output
dist/

# Environment
.env
.env.local

# IDE
.vscode/
.idea/
*.swp
*.swo

# OS
.DS_Store
Thumbs.db

# Test coverage
coverage/

# Logs
*.log

# Show data (user-generated, may contain custom configs)
# Uncomment if you want to exclude show data from version control:
# .dmx-lighting-mcp/
```

### 6. Create .env.example

Create `.env.example` documenting required environment variables:

```env
# OLA (Open Lighting Architecture) connection settings
OLA_HOST=localhost
OLA_PORT=9090
```

### 7. Create Directory Structure

Create all source and test directories:

```bash
mkdir -p src/types
mkdir -p src/ola
mkdir -p src/utils
mkdir -p tests/ola
```

Place a placeholder `.gitkeep` in each directory to ensure they are tracked by git before any source files are added:

```bash
touch src/types/.gitkeep
touch src/ola/.gitkeep
touch src/utils/.gitkeep
touch tests/ola/.gitkeep
```

---

## Verification

- [ ] `package.json` exists with `name: "dmx-mcp"`, `type: "module"`, and all five scripts (build, dev, start, test, typecheck)
- [ ] `tsconfig.json` exists with `target: "ES2022"`, `module: "Node16"`, and `strict: true`
- [ ] `esbuild.config.js` exists and is valid JavaScript
- [ ] `.gitignore` exists and includes `node_modules/`, `dist/`, `.env`
- [ ] `.env.example` exists with `OLA_HOST` and `OLA_PORT`
- [ ] Directory `src/types/` exists
- [ ] Directory `src/ola/` exists
- [ ] Directory `src/utils/` exists
- [ ] Directory `tests/ola/` exists

---

## Notes

- No dependencies are installed in this task. Dependency installation happens in Task 2 (MCP SDK) and Task 5 (vitest). This keeps the task focused on project structure only.
- The esbuild config uses ESM format (`format: "esm"`) to match the `"type": "module"` in package.json.
- Node 18+ is required for native `fetch` support, which the OLA client will use in Task 4.
- The `.env.example` file documents environment variables but should never contain real credentials. The actual `.env` file is gitignored.

---

**Next Task**: [Task 2: Set Up MCP Server Scaffold](task-2-mcp-server-scaffold.md)
**Related Design Docs**: [DMX Lighting MCP Design](../../design/local.dmx-lighting-mcp.md)
