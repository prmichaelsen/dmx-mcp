# Task 4: Implement OLA REST Client

**Milestone**: [M1 - Project Foundation & OLA Client](../../milestones/milestone-1-project-foundation.md)
**Estimated Time**: 1.5 hours
**Dependencies**: Task 1 (Initialize TypeScript Project), Task 3 (Core TypeScript Interfaces)
**Status**: Not Started

---

## Objective

Implement the `OLAClient` class in `src/ola/client.ts` that communicates with OLA's REST API running on localhost:9090. The client provides `setDMX` and `getDMX` methods that all higher-level modules (scene manager, cue engine, effect engine) will use to send and read DMX data.

---

## Context

Open Lighting Architecture (OLA) provides a REST API on `http://localhost:9090` for controlling DMX universes. The two endpoints we need are:

- **`POST /set_dmx`** -- Sets DMX channel values for a universe. Accepts `application/x-www-form-urlencoded` body with parameters `u` (universe number) and `d` (comma-separated channel values).
- **`GET /get_dmx?u={universe}`** -- Reads the current DMX output for a universe. Returns JSON with a `dmx` array of channel values.

The OLA client is the lowest-level module in the architecture -- it sits between our show logic and the OLA daemon. Every DMX operation in the entire project flows through this client. It must handle errors gracefully (OLA not running, network timeouts, invalid responses) because failures here affect all higher-level operations.

---

## Steps

### 1. Create src/ola/client.ts

Create the OLA client module at `src/ola/client.ts`:

```typescript
/**
 * OLA REST API client.
 *
 * Communicates with the Open Lighting Architecture daemon's REST API
 * to send and receive DMX data. OLA handles the actual DMX transport
 * (Art-Net, sACN, USB dongles, etc.).
 *
 * OLA REST API docs: https://wiki.openlighting.org/index.php/OLA_-_HTTP_API
 */

export interface OLAClientOptions {
  /** Base URL for the OLA REST API (default: "http://localhost:9090") */
  baseUrl?: string;
  /** Request timeout in milliseconds (default: 5000) */
  timeoutMs?: number;
}

export class OLAClient {
  private readonly baseUrl: string;
  private readonly timeoutMs: number;

  constructor(options: OLAClientOptions = {}) {
    this.baseUrl = options.baseUrl ?? "http://localhost:9090";
    this.timeoutMs = options.timeoutMs ?? 5000;

    // Strip trailing slash from baseUrl for consistency
    if (this.baseUrl.endsWith("/")) {
      this.baseUrl = this.baseUrl.slice(0, -1);
    }
  }

  /**
   * Set DMX channel values for a universe.
   *
   * @param universe - DMX universe number (typically 1-based)
   * @param channels - Array of channel values (0-255). Index 0 = channel 1.
   *                   The array can be shorter than 512; unspecified channels
   *                   are not modified by OLA.
   * @throws {OLAConnectionError} if OLA is not reachable
   * @throws {OLARequestError} if OLA returns a non-OK response
   */
  async setDMX(universe: number, channels: number[]): Promise<void> {
    const url = `${this.baseUrl}/set_dmx`;
    const body = `u=${universe}&d=${channels.join(",")}`;

    let response: Response;
    try {
      response = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body,
        signal: AbortSignal.timeout(this.timeoutMs),
      });
    } catch (error) {
      throw new OLAConnectionError(
        `Failed to connect to OLA at ${this.baseUrl}: ${error instanceof Error ? error.message : String(error)}`
      );
    }

    if (!response.ok) {
      throw new OLARequestError(
        `OLA setDMX failed with status ${response.status}: ${response.statusText}`,
        response.status
      );
    }
  }

  /**
   * Get current DMX channel values for a universe.
   *
   * @param universe - DMX universe number (typically 1-based)
   * @returns Array of channel values (0-255), up to 512 entries
   * @throws {OLAConnectionError} if OLA is not reachable
   * @throws {OLARequestError} if OLA returns a non-OK response
   * @throws {OLAParseError} if the response cannot be parsed
   */
  async getDMX(universe: number): Promise<number[]> {
    const url = `${this.baseUrl}/get_dmx?u=${universe}`;

    let response: Response;
    try {
      response = await fetch(url, {
        signal: AbortSignal.timeout(this.timeoutMs),
      });
    } catch (error) {
      throw new OLAConnectionError(
        `Failed to connect to OLA at ${this.baseUrl}: ${error instanceof Error ? error.message : String(error)}`
      );
    }

    if (!response.ok) {
      throw new OLARequestError(
        `OLA getDMX failed with status ${response.status}: ${response.statusText}`,
        response.status
      );
    }

    let data: unknown;
    try {
      data = await response.json();
    } catch (error) {
      throw new OLAParseError(
        `Failed to parse OLA getDMX response as JSON: ${error instanceof Error ? error.message : String(error)}`
      );
    }

    if (
      typeof data !== "object" ||
      data === null ||
      !("dmx" in data) ||
      !Array.isArray((data as { dmx: unknown }).dmx)
    ) {
      throw new OLAParseError(
        `Unexpected OLA getDMX response format: expected { dmx: number[] }, got ${JSON.stringify(data)}`
      );
    }

    return (data as { dmx: number[] }).dmx;
  }

  /**
   * Get the configured base URL (useful for diagnostics/logging).
   */
  getBaseUrl(): string {
    return this.baseUrl;
  }
}

// ---------------------------------------------------------------------------
// Error Classes
// ---------------------------------------------------------------------------

/**
 * Thrown when the OLA daemon is not reachable (connection refused, timeout, etc.).
 */
export class OLAConnectionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "OLAConnectionError";
  }
}

/**
 * Thrown when OLA returns a non-OK HTTP status.
 */
export class OLARequestError extends Error {
  public readonly statusCode: number;

  constructor(message: string, statusCode: number) {
    super(message);
    this.name = "OLARequestError";
    this.statusCode = statusCode;
  }
}

/**
 * Thrown when the OLA response cannot be parsed.
 */
export class OLAParseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "OLAParseError";
  }
}
```

### 2. Understand the API Contract

The OLA REST API works as follows:

**Setting DMX values:**
```
POST /set_dmx
Content-Type: application/x-www-form-urlencoded

u=1&d=255,128,0,0,64
```

This sets universe 1, channels 1-5 to values `[255, 128, 0, 0, 64]`.

**Reading DMX values:**
```
GET /get_dmx?u=1

Response:
{
  "dmx": [255, 128, 0, 0, 64, 0, 0, ...]
}
```

### 3. Support Configurable Base URL

The client accepts an options object so the base URL and timeout can be customized. This supports:

- **Different hosts**: OLA running on a remote machine or Raspberry Pi
- **Different ports**: Non-standard OLA port
- **Testing**: Point at a mock server for integration tests

```typescript
// Default -- OLA on localhost
const client = new OLAClient();

// OLA on a Raspberry Pi
const remoteClient = new OLAClient({
  baseUrl: "http://192.168.1.50:9090",
});

// Custom timeout for slow networks
const slowClient = new OLAClient({
  timeoutMs: 10000,
});
```

### 4. Verify TypeScript Compilation

Run the type checker to ensure the new code compiles:

```bash
npx tsc --noEmit
```

---

## Verification

- [ ] `src/ola/client.ts` exists and exports `OLAClient`, `OLAClientOptions`, `OLAConnectionError`, `OLARequestError`, `OLAParseError`
- [ ] `OLAClient` constructor accepts optional `baseUrl` and `timeoutMs` options
- [ ] `setDMX(universe, channels)` sends a `POST` to `/set_dmx` with form-encoded body `u={universe}&d={channels}`
- [ ] `getDMX(universe)` sends a `GET` to `/get_dmx?u={universe}` and parses the `dmx` array from the JSON response
- [ ] Connection errors throw `OLAConnectionError`
- [ ] Non-OK HTTP responses throw `OLARequestError` with the status code
- [ ] Unparseable JSON responses throw `OLAParseError`
- [ ] `AbortSignal.timeout` is used for request timeouts
- [ ] `npx tsc --noEmit` passes with zero errors

---

## Notes

- The client uses Node 18+'s native `fetch` API. No external HTTP library (axios, node-fetch, etc.) is needed.
- `AbortSignal.timeout()` is available in Node 18+ and provides a clean way to implement request timeouts without manual AbortController management.
- The `setDMX` channels array is 0-indexed (index 0 = DMX channel 1). This matches OLA's API convention. Higher-level modules that work with 1-based DMX addresses (as specified in fixture configs) will need to handle the offset.
- The error classes extend `Error` and set a custom `name` property. This allows callers to use `instanceof` checks or inspect `error.name` for error handling.
- The client is stateless -- it creates a new HTTP request for each call. Connection pooling is handled by Node.js's built-in HTTP agent.

---

**Next Task**: [Task 5: Add OLA Client Unit Tests](task-5-ola-client-tests.md)
**Related Design Docs**: [DMX Lighting MCP Design](../../design/local.dmx-lighting-mcp.md)
