# Task 5: Add OLA Client Unit Tests

**Milestone**: [M1 - Project Foundation & OLA Client](../../milestones/milestone-1-project-foundation.md)
**Estimated Time**: 1 hour
**Dependencies**: Task 4 (Implement OLA REST Client)
**Status**: Not Started

---

## Objective

Write comprehensive unit tests for the `OLAClient` class using vitest with mocked `fetch` responses. The tests should cover successful operations, error handling, and configuration options without requiring a running OLA instance.

---

## Context

The OLA client is a critical piece of infrastructure -- every DMX operation in the project flows through it. Unit tests with mocked HTTP ensure we can verify the client's behavior without a running OLA daemon. This is especially important because OLA may not be installed on every development machine, and CI/CD environments will not have DMX hardware.

We use vitest as the test framework because it is fast, TypeScript-native, and has excellent mocking capabilities built in. The tests mock the global `fetch` function to simulate OLA responses.

---

## Steps

### 1. Install vitest

```bash
npm install --save-dev vitest
```

### 2. Create vitest Configuration

Add a vitest config to `vitest.config.ts` in the project root (or configure inline in `package.json`):

```typescript
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globals: true,
    environment: "node",
    include: ["tests/**/*.test.ts"],
  },
});
```

### 3. Create tests/ola/client.test.ts

Create the test file at `tests/ola/client.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  OLAClient,
  OLAConnectionError,
  OLARequestError,
  OLAParseError,
} from "../../src/ola/client.js";

describe("OLAClient", () => {
  let client: OLAClient;

  beforeEach(() => {
    client = new OLAClient();
    vi.stubGlobal("fetch", vi.fn());
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // -----------------------------------------------------------------------
  // Constructor / Configuration
  // -----------------------------------------------------------------------

  describe("constructor", () => {
    it("uses default base URL when no options provided", () => {
      const c = new OLAClient();
      expect(c.getBaseUrl()).toBe("http://localhost:9090");
    });

    it("uses custom base URL when provided", () => {
      const c = new OLAClient({ baseUrl: "http://192.168.1.50:9090" });
      expect(c.getBaseUrl()).toBe("http://192.168.1.50:9090");
    });

    it("strips trailing slash from base URL", () => {
      const c = new OLAClient({ baseUrl: "http://localhost:9090/" });
      expect(c.getBaseUrl()).toBe("http://localhost:9090");
    });
  });

  // -----------------------------------------------------------------------
  // setDMX
  // -----------------------------------------------------------------------

  describe("setDMX", () => {
    it("sends POST to /set_dmx with correct form-encoded body", async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
      });
      vi.stubGlobal("fetch", mockFetch);

      await client.setDMX(1, [255, 128, 0]);

      expect(mockFetch).toHaveBeenCalledOnce();

      const [url, options] = mockFetch.mock.calls[0];
      expect(url).toBe("http://localhost:9090/set_dmx");
      expect(options.method).toBe("POST");
      expect(options.headers["Content-Type"]).toBe(
        "application/x-www-form-urlencoded"
      );
      expect(options.body).toBe("u=1&d=255,128,0");
    });

    it("sends correct universe number", async () => {
      const mockFetch = vi.fn().mockResolvedValue({ ok: true, status: 200 });
      vi.stubGlobal("fetch", mockFetch);

      await client.setDMX(3, [100]);

      const [, options] = mockFetch.mock.calls[0];
      expect(options.body).toBe("u=3&d=100");
    });

    it("handles empty channel array", async () => {
      const mockFetch = vi.fn().mockResolvedValue({ ok: true, status: 200 });
      vi.stubGlobal("fetch", mockFetch);

      await client.setDMX(1, []);

      const [, options] = mockFetch.mock.calls[0];
      expect(options.body).toBe("u=1&d=");
    });

    it("uses custom base URL", async () => {
      const customClient = new OLAClient({
        baseUrl: "http://192.168.1.50:9090",
      });
      const mockFetch = vi.fn().mockResolvedValue({ ok: true, status: 200 });
      vi.stubGlobal("fetch", mockFetch);

      await customClient.setDMX(1, [255]);

      const [url] = mockFetch.mock.calls[0];
      expect(url).toBe("http://192.168.1.50:9090/set_dmx");
    });

    it("throws OLAConnectionError when fetch fails", async () => {
      const mockFetch = vi
        .fn()
        .mockRejectedValue(new TypeError("fetch failed"));
      vi.stubGlobal("fetch", mockFetch);

      await expect(client.setDMX(1, [255])).rejects.toThrow(
        OLAConnectionError
      );
      await expect(client.setDMX(1, [255])).rejects.toThrow(
        /Failed to connect to OLA/
      );
    });

    it("throws OLARequestError when OLA returns non-OK status", async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 500,
        statusText: "Internal Server Error",
      });
      vi.stubGlobal("fetch", mockFetch);

      await expect(client.setDMX(1, [255])).rejects.toThrow(OLARequestError);
      await expect(client.setDMX(1, [255])).rejects.toThrow(/status 500/);
    });
  });

  // -----------------------------------------------------------------------
  // getDMX
  // -----------------------------------------------------------------------

  describe("getDMX", () => {
    it("sends GET to /get_dmx with correct universe parameter", async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({ dmx: [0, 0, 0] }),
      });
      vi.stubGlobal("fetch", mockFetch);

      await client.getDMX(1);

      expect(mockFetch).toHaveBeenCalledOnce();
      const [url] = mockFetch.mock.calls[0];
      expect(url).toBe("http://localhost:9090/get_dmx?u=1");
    });

    it("parses and returns the dmx array from the response", async () => {
      const expectedDmx = [255, 128, 0, 64, 32];
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({ dmx: expectedDmx }),
      });
      vi.stubGlobal("fetch", mockFetch);

      const result = await client.getDMX(1);

      expect(result).toEqual(expectedDmx);
    });

    it("returns empty array when OLA returns empty dmx", async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({ dmx: [] }),
      });
      vi.stubGlobal("fetch", mockFetch);

      const result = await client.getDMX(1);

      expect(result).toEqual([]);
    });

    it("uses custom base URL", async () => {
      const customClient = new OLAClient({
        baseUrl: "http://10.0.0.5:9090",
      });
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({ dmx: [] }),
      });
      vi.stubGlobal("fetch", mockFetch);

      await customClient.getDMX(2);

      const [url] = mockFetch.mock.calls[0];
      expect(url).toBe("http://10.0.0.5:9090/get_dmx?u=2");
    });

    it("throws OLAConnectionError when fetch fails", async () => {
      const mockFetch = vi
        .fn()
        .mockRejectedValue(new TypeError("fetch failed"));
      vi.stubGlobal("fetch", mockFetch);

      await expect(client.getDMX(1)).rejects.toThrow(OLAConnectionError);
    });

    it("throws OLARequestError when OLA returns non-OK status", async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 404,
        statusText: "Not Found",
      });
      vi.stubGlobal("fetch", mockFetch);

      await expect(client.getDMX(1)).rejects.toThrow(OLARequestError);
    });

    it("throws OLAParseError when response is not valid JSON", async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => {
          throw new SyntaxError("Unexpected token");
        },
      });
      vi.stubGlobal("fetch", mockFetch);

      await expect(client.getDMX(1)).rejects.toThrow(OLAParseError);
    });

    it("throws OLAParseError when response lacks dmx field", async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({ channels: [1, 2, 3] }),
      });
      vi.stubGlobal("fetch", mockFetch);

      await expect(client.getDMX(1)).rejects.toThrow(OLAParseError);
      await expect(client.getDMX(1)).rejects.toThrow(
        /Unexpected OLA getDMX response format/
      );
    });

    it("throws OLAParseError when dmx field is not an array", async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({ dmx: "not-an-array" }),
      });
      vi.stubGlobal("fetch", mockFetch);

      await expect(client.getDMX(1)).rejects.toThrow(OLAParseError);
    });
  });
});
```

### 4. Run the Tests

Execute the test suite:

```bash
npx vitest run
```

All tests should pass. You can also run in watch mode during development:

```bash
npx vitest
```

### 5. Verify Test Coverage

Run tests with coverage to confirm all code paths are tested:

```bash
npx vitest run --coverage
```

The OLA client should have high coverage across:
- `setDMX` happy path and error paths
- `getDMX` happy path, parse errors, and connection errors
- Constructor with default and custom options

---

## Verification

- [ ] `vitest` is listed in `package.json` devDependencies
- [ ] `vitest.config.ts` exists with node environment and test glob configured
- [ ] `tests/ola/client.test.ts` exists
- [ ] Tests cover `setDMX` sending correct POST method, URL, headers, and body
- [ ] Tests cover `getDMX` sending correct GET URL and parsing the `dmx` array
- [ ] Tests cover `OLAConnectionError` when `fetch` throws (connection refused / timeout)
- [ ] Tests cover `OLARequestError` when OLA returns non-OK HTTP status
- [ ] Tests cover `OLAParseError` when response JSON is malformed or missing `dmx` field
- [ ] Tests cover custom `baseUrl` configuration
- [ ] `npx vitest run` passes all tests with zero failures

---

## Notes

- The tests mock the global `fetch` function using `vi.stubGlobal`. This is the simplest approach since `OLAClient` uses native `fetch` directly. An alternative approach would be dependency injection (passing `fetch` as a constructor parameter), but global mocking is sufficient for unit tests and keeps the client API clean.
- Each test restores all mocks in `afterEach` to prevent test pollution.
- The tests do not require OLA to be running -- they test the client in complete isolation.
- Coverage reporting may require installing `@vitest/coverage-v8` as a dev dependency: `npm install --save-dev @vitest/coverage-v8`.
- The `AbortSignal.timeout` behavior is not directly tested because mocking timer-based aborts is complex. The connection error tests cover the general failure path.

---

**Next Task**: [Task 6: Add Development Scripts](task-6-development-scripts.md)
**Related Design Docs**: [DMX Lighting MCP Design](../../design/local.dmx-lighting-mcp.md)
