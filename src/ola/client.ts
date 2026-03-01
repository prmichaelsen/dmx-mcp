export class OLAConnectionError extends Error {
  constructor(message: string, public cause?: unknown) {
    super(message);
    this.name = "OLAConnectionError";
  }
}

export class OLARequestError extends Error {
  constructor(
    message: string,
    public statusCode: number,
  ) {
    super(message);
    this.name = "OLARequestError";
  }
}

export class OLAParseError extends Error {
  constructor(message: string, public cause?: unknown) {
    super(message);
    this.name = "OLAParseError";
  }
}

export interface OLAClientOptions {
  baseUrl?: string;
  timeoutMs?: number;
}

export class OLAClient {
  private baseUrl: string;
  private timeoutMs: number;

  constructor(options: OLAClientOptions = {}) {
    this.baseUrl = options.baseUrl ?? "http://localhost:9090";
    this.timeoutMs = options.timeoutMs ?? 5000;
  }

  async setDMX(universe: number, channels: number[]): Promise<void> {
    const body = `u=${universe}&d=${channels.join(",")}`;

    let response: Response;
    try {
      response = await fetch(`${this.baseUrl}/set_dmx`, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body,
        signal: AbortSignal.timeout(this.timeoutMs),
      });
    } catch (err) {
      if (err instanceof DOMException && err.name === "TimeoutError") {
        throw new OLAConnectionError(
          `OLA request timed out after ${this.timeoutMs}ms`,
          err,
        );
      }
      throw new OLAConnectionError(
        `Failed to connect to OLA at ${this.baseUrl}`,
        err,
      );
    }

    if (!response.ok) {
      throw new OLARequestError(
        `OLA returned HTTP ${response.status}: ${response.statusText}`,
        response.status,
      );
    }
  }

  async getDMX(universe: number): Promise<number[]> {
    let response: Response;
    try {
      response = await fetch(`${this.baseUrl}/get_dmx?u=${universe}`, {
        signal: AbortSignal.timeout(this.timeoutMs),
      });
    } catch (err) {
      if (err instanceof DOMException && err.name === "TimeoutError") {
        throw new OLAConnectionError(
          `OLA request timed out after ${this.timeoutMs}ms`,
          err,
        );
      }
      throw new OLAConnectionError(
        `Failed to connect to OLA at ${this.baseUrl}`,
        err,
      );
    }

    if (!response.ok) {
      throw new OLARequestError(
        `OLA returned HTTP ${response.status}: ${response.statusText}`,
        response.status,
      );
    }

    let data: unknown;
    try {
      data = await response.json();
    } catch (err) {
      throw new OLAParseError("Failed to parse OLA JSON response", err);
    }

    if (
      !data ||
      typeof data !== "object" ||
      !("dmx" in data) ||
      !Array.isArray((data as { dmx: unknown }).dmx)
    ) {
      throw new OLAParseError(
        `Unexpected OLA response format: ${JSON.stringify(data)}`,
      );
    }

    return (data as { dmx: number[] }).dmx;
  }
}
