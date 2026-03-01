# Task 6: Add Development Scripts

**Milestone**: [M1 - Project Foundation & OLA Client](../../milestones/milestone-1-project-foundation.md)
**Estimated Time**: 30 minutes
**Dependencies**: Task 1 (Initialize TypeScript Project), Task 2 (MCP Server Scaffold), Task 5 (OLA Client Unit Tests)
**Status**: Not Started

---

## Objective

Configure and verify all npm scripts for building, developing, testing, and type-checking the project. Install any remaining dev dependencies needed for the development workflow.

---

## Context

At this point in Milestone 1, all source code and tests are written. This final task ensures the development workflow is smooth by verifying that every script works correctly and installing any dev dependencies that were not yet added. A working set of npm scripts is essential for both human developers and CI/CD pipelines.

The scripts were initially declared in Task 1's `package.json`, but now that all source files exist (server, types, OLA client, tests), we can verify they actually run. This task also installs `tsx` for watch-mode development and `typescript` and `esbuild` as explicit dev dependencies.

---

## Steps

### 1. Install Remaining Dev Dependencies

Install all dev dependencies needed for the development workflow:

```bash
npm install --save-dev typescript esbuild tsx vitest
```

- **typescript** -- TypeScript compiler for `typecheck` script and type definitions
- **esbuild** -- Fast bundler for production builds
- **tsx** -- TypeScript execution with watch mode for development
- **vitest** -- Test runner (may already be installed from Task 5, but ensure it is present)

### 2. Verify package.json Scripts

Ensure the `scripts` section of `package.json` contains all required scripts:

```json
{
  "scripts": {
    "build": "node esbuild.config.js",
    "dev": "tsx watch src/index.ts",
    "start": "node dist/index.js",
    "test": "vitest run",
    "typecheck": "tsc --noEmit"
  }
}
```

Script details:
- **`build`** -- Runs the esbuild configuration to bundle the project into `dist/`. Uses `node esbuild.config.js` because the config is an ESM script that calls the esbuild API directly.
- **`dev`** -- Starts the server in development mode with hot reloading. `tsx watch` re-runs the entry point whenever source files change. Note: since this is a stdio MCP server, "dev mode" is primarily useful for testing with a pipe or MCP client.
- **`start`** -- Runs the compiled production build.
- **`test`** -- Runs all tests once via vitest. Uses `vitest run` (not `vitest` which starts watch mode).
- **`typecheck`** -- Runs the TypeScript compiler in check-only mode. No output files are generated.

### 3. Test the `typecheck` Script

```bash
npm run typecheck
```

Expected output: No errors. The command should exit with code 0.

If there are type errors, fix them before proceeding. Common issues:
- Missing `.js` extensions in import paths (required for Node16 module resolution)
- Type mismatches between interfaces and implementations

### 4. Test the `build` Script

```bash
npm run build
```

Expected output:
```
Build complete.
```

Verify the output:
```bash
ls dist/
```

You should see `index.js` and `index.js.map` (and possibly other bundled files).

### 5. Test the `start` Script

```bash
# The server reads from stdin, so it will hang waiting for input.
# Run it and verify the startup message appears on stderr.
# Use timeout to auto-kill after 2 seconds:
timeout 2 npm run start 2>&1 || true
```

You should see `dmx-mcp v0.1.0 running on stdio` on stderr.

### 6. Test the `test` Script

```bash
npm run test
```

Expected output: All OLA client tests pass. Example:

```
 ✓ tests/ola/client.test.ts (14)
   ✓ OLAClient (14)
     ✓ constructor (3)
     ✓ setDMX (5)
     ✓ getDMX (6)

 Test Files  1 passed (1)
      Tests  14 passed (14)
```

### 7. Test the `dev` Script (Quick Verification)

```bash
# Start dev mode briefly to verify tsx watch works, then kill it
timeout 3 npm run dev 2>&1 || true
```

You should see the server start. When you modify a source file, `tsx watch` would normally restart the server automatically.

### 8. Add a test:watch Script (Optional Enhancement)

For convenience during development, add a watch-mode test script:

```json
{
  "scripts": {
    "test:watch": "vitest"
  }
}
```

This runs vitest in interactive watch mode, re-running tests on file changes.

---

## Verification

- [ ] `typescript` is listed in `devDependencies`
- [ ] `esbuild` is listed in `devDependencies`
- [ ] `tsx` is listed in `devDependencies`
- [ ] `vitest` is listed in `devDependencies`
- [ ] `npm run typecheck` exits with code 0 (no type errors)
- [ ] `npm run build` creates files in the `dist/` directory
- [ ] `npm run start` prints the startup message to stderr
- [ ] `npm run test` passes all unit tests
- [ ] `npm run dev` starts the server with tsx watch mode
- [ ] All five scripts (`build`, `dev`, `start`, `test`, `typecheck`) are present in `package.json`

---

## Notes

- The `dev` script uses `tsx watch` which provides TypeScript execution with file watching. This is a simpler alternative to `nodemon` + `ts-node` and works well for MCP servers.
- The `build` script uses the esbuild config from Task 1 rather than `tsc` for compilation. esbuild is significantly faster than tsc for bundling and is preferred for production builds. The `typecheck` script still uses `tsc --noEmit` because esbuild does not perform type checking.
- The `test` script uses `vitest run` (single run) rather than `vitest` (watch mode) so that it works correctly in CI/CD and scripted contexts. Use `npm run test:watch` or `npx vitest` for interactive development.
- If the `build` script fails with "esbuild.config.js not found", ensure the file was created in Task 1 and that `"type": "module"` is set in package.json (required for top-level `await` in the config).
- After this task, Milestone 1 is complete. All foundational infrastructure is in place for Milestone 2 (Fixture Management) to begin.

---

**Next Task**: [Task 7 (Milestone 2): Register Fixture MCP Tools](../milestone-2-fixture-management/task-7-register-fixture-tools.md)
**Related Design Docs**: [DMX Lighting MCP Design](../../design/local.dmx-lighting-mcp.md)
