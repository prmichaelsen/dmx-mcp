# Task 38: Add Emulator Integration Tests

**Milestone**: [M7 - DMX Emulator & Monitor UI](../../milestones/milestone-7-dmx-emulator.md)
**Estimated Time**: 1 hour
**Dependencies**: Task 36 (OLA Emulator Server)
**Status**: Not Started

---

## Objective

Write integration tests that use the real `OLAClient` making actual HTTP calls against the `DMXEmulatorServer`. This verifies the full pipeline: MCP tool handler → OLAClient → HTTP → emulator → frame log.

---

## Context

The existing E2E tests in `tests/e2e/full-pipeline.test.ts` use a `MockOLAClient` injected at the code level, which skips the HTTP layer entirely. These new tests verify that the real `OLAClient` (with actual `fetch` calls) works correctly against the emulator, catching issues like:
- Incorrect form-encoding in `setDMX`
- Response parsing errors in `getDMX`
- Timeout handling
- Content-Type mismatches

---

## Steps

### 1. Create Test File

```
tests/emulator/
└── integration.test.ts
```

### 2. Test Setup: Start/Stop Emulator

```typescript
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { DMXEmulatorServer } from "../../src/emulator/server.js";
import { OLAClient } from "../../src/ola/client.js";

describe("Emulator Integration", () => {
  let emulator: DMXEmulatorServer;
  let olaClient: OLAClient;
  const TEST_PORT = 19090; // Avoid conflict with real OLA

  beforeAll(async () => {
    emulator = new DMXEmulatorServer(TEST_PORT);
    await emulator.start();
    olaClient = new OLAClient({ baseUrl: `http://localhost:${TEST_PORT}` });
  });

  afterAll(async () => {
    await emulator.stop();
  });
```

### 3. Test: setDMX and getDMX Round-Trip

```typescript
  it("should round-trip DMX values through real OLAClient", async () => {
    await olaClient.setDMX(1, [255, 128, 0]);
    const result = await olaClient.getDMX(1);
    expect(result[0]).toBe(255);
    expect(result[1]).toBe(128);
    expect(result[2]).toBe(0);
  });
```

### 4. Test: Frame Recording

```typescript
  it("should record frames for test assertions", async () => {
    emulator.reset();
    await olaClient.setDMX(1, [100, 200, 50]);
    await olaClient.setDMX(1, [0, 0, 0]);

    const frames = emulator.getFramesForUniverse(1);
    expect(frames).toHaveLength(2);
    expect(frames[0].channels[0]).toBe(100);
    expect(frames[1].channels[0]).toBe(0);
  });
```

### 5. Test: Full MCP Pipeline

```typescript
  it("should work with setFixtureColor through real HTTP", async () => {
    // Set up fixture manager with a patched fixture
    // Call setFixtureColor which uses olaClient.getDMX + olaClient.setDMX
    // Verify emulator received the correct DMX values
    // This tests the full pipeline without mocks
  });
```

### 6. Test: Multiple Universes

```typescript
  it("should handle multiple universes independently", async () => {
    emulator.reset();
    await olaClient.setDMX(1, [255, 0, 0]);
    await olaClient.setDMX(2, [0, 255, 0]);

    const u1 = await olaClient.getDMX(1);
    const u2 = await olaClient.getDMX(2);
    expect(u1[0]).toBe(255);
    expect(u2[1]).toBe(255);
  });
```

### 7. Test: Blackout

```typescript
  it("should verify blackout sends all zeros through HTTP", async () => {
    // Patch fixtures, set some colors, then blackout
    // Verify emulator's last frame for each universe is all zeros
  });
```

### 8. Run Tests

```bash
npx vitest run tests/emulator/integration.test.ts
```

---

## Verification

- [ ] `tests/emulator/integration.test.ts` exists
- [ ] Tests start and stop emulator in beforeAll/afterAll
- [ ] setDMX/getDMX round-trip works through real HTTP
- [ ] Frame recording captures all setDMX calls
- [ ] Multi-universe isolation works
- [ ] Full MCP pipeline test (fixture → setFixtureColor → emulator) passes
- [ ] All new tests pass
- [ ] All existing tests continue to pass (no port conflicts)

---

## Notes

- Use a non-standard port (e.g. 19090) to avoid conflicts with a real OLA instance or other tests
- Tests should be reasonably fast — HTTP calls to localhost are sub-millisecond
- The emulator server is started once per test file (beforeAll), not per test — this is faster and sufficient since `reset()` clears state between tests
- These tests complement (not replace) the existing E2E tests which use MockOLAClient for speed

---

**Next Task**: [Task 39: Add Dev Scripts and Documentation](task-39-dev-scripts-documentation.md)
