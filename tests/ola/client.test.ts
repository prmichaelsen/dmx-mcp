import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  OLAClient,
  OLAConnectionError,
  OLARequestError,
  OLAParseError,
} from "../../src/ola/client.js";

describe("OLAClient", () => {
  let client: OLAClient;

  beforeEach(() => {
    client = new OLAClient({ baseUrl: "http://localhost:9090" });
    vi.restoreAllMocks();
  });

  describe("setDMX", () => {
    it("should send POST request with form-encoded body", async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
      });
      vi.stubGlobal("fetch", mockFetch);

      await client.setDMX(1, [255, 128, 0]);

      expect(mockFetch).toHaveBeenCalledWith(
        "http://localhost:9090/set_dmx",
        expect.objectContaining({
          method: "POST",
          headers: { "Content-Type": "application/x-www-form-urlencoded" },
          body: "u=1&d=255,128,0",
        }),
      );
    });

    it("should throw OLARequestError on non-ok response", async () => {
      vi.stubGlobal(
        "fetch",
        vi.fn().mockResolvedValue({
          ok: false,
          status: 500,
          statusText: "Internal Server Error",
        }),
      );

      await expect(client.setDMX(1, [0])).rejects.toThrow(OLARequestError);
    });

    it("should throw OLAConnectionError on fetch failure", async () => {
      vi.stubGlobal(
        "fetch",
        vi.fn().mockRejectedValue(new Error("ECONNREFUSED")),
      );

      await expect(client.setDMX(1, [0])).rejects.toThrow(
        OLAConnectionError,
      );
    });

    it("should throw OLAConnectionError on timeout", async () => {
      const timeoutErr = new DOMException("Timeout", "TimeoutError");
      vi.stubGlobal("fetch", vi.fn().mockRejectedValue(timeoutErr));

      await expect(client.setDMX(1, [0])).rejects.toThrow(
        OLAConnectionError,
      );
      await expect(client.setDMX(1, [0])).rejects.toThrow(/timed out/);
    });
  });

  describe("getDMX", () => {
    it("should return DMX values array", async () => {
      vi.stubGlobal(
        "fetch",
        vi.fn().mockResolvedValue({
          ok: true,
          json: async () => ({ dmx: [255, 128, 0] }),
        }),
      );

      const result = await client.getDMX(1);
      expect(result).toEqual([255, 128, 0]);
    });

    it("should send GET request with universe param", async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ dmx: [] }),
      });
      vi.stubGlobal("fetch", mockFetch);

      await client.getDMX(3);

      expect(mockFetch).toHaveBeenCalledWith(
        "http://localhost:9090/get_dmx?u=3",
        expect.objectContaining({}),
      );
    });

    it("should throw OLARequestError on non-ok response", async () => {
      vi.stubGlobal(
        "fetch",
        vi.fn().mockResolvedValue({
          ok: false,
          status: 404,
          statusText: "Not Found",
        }),
      );

      await expect(client.getDMX(1)).rejects.toThrow(OLARequestError);
    });

    it("should throw OLAParseError on invalid JSON", async () => {
      vi.stubGlobal(
        "fetch",
        vi.fn().mockResolvedValue({
          ok: true,
          json: async () => {
            throw new Error("invalid json");
          },
        }),
      );

      await expect(client.getDMX(1)).rejects.toThrow(OLAParseError);
    });

    it("should throw OLAParseError on unexpected response format", async () => {
      vi.stubGlobal(
        "fetch",
        vi.fn().mockResolvedValue({
          ok: true,
          json: async () => ({ channels: [1, 2, 3] }),
        }),
      );

      await expect(client.getDMX(1)).rejects.toThrow(OLAParseError);
    });

    it("should throw OLAConnectionError on fetch failure", async () => {
      vi.stubGlobal(
        "fetch",
        vi.fn().mockRejectedValue(new Error("ECONNREFUSED")),
      );

      await expect(client.getDMX(1)).rejects.toThrow(OLAConnectionError);
    });
  });

  describe("constructor options", () => {
    it("should use default baseUrl and timeout", () => {
      const defaultClient = new OLAClient();
      // Just verify it constructs without error
      expect(defaultClient).toBeInstanceOf(OLAClient);
    });

    it("should use custom baseUrl", async () => {
      const customClient = new OLAClient({
        baseUrl: "http://192.168.1.100:9090",
      });
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ dmx: [] }),
      });
      vi.stubGlobal("fetch", mockFetch);

      await customClient.getDMX(1);

      expect(mockFetch).toHaveBeenCalledWith(
        "http://192.168.1.100:9090/get_dmx?u=1",
        expect.anything(),
      );
    });
  });
});
