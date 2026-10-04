import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createApi } from "../src/client.js";
import type { TestPaths } from "./paths.js";

const fetchMock = vi.fn();

function jsonResponse(
  status: number,
  payload: unknown,
  headers: Record<string, string> = {},
): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "content-type": "application/json", ...headers },
  });
}

function lastCall(): { url: string; init: RequestInit } {
  const call = fetchMock.mock.calls.at(-1);
  if (!call) throw new Error("fetch was not called");
  return { url: call[0] as string, init: call[1] as RequestInit };
}

beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("request shaping", () => {
  it("prefixes the base URL and encodes path parameters", async () => {
    const api = createApi<TestPaths>({ baseUrl: "https://api.example.test" });
    fetchMock.mockResolvedValue(jsonResponse(200, { items: [], total: 0 }));
    const result = await api.fetch("/v1/items/{id}", "get", {
      pathParams: { id: "a b/c" },
      query: { locale: "cs-CZ" },
    });
    expect(result.ok).toBe(true);
    expect(lastCall().url).toBe(
      "https://api.example.test/v1/items/a%20b%2Fc?locale=cs-CZ",
    );
  });

  it("uses a per-call base URL over the client base URL", async () => {
    const api = createApi<TestPaths>({ baseUrl: "https://api.example.test" });
    fetchMock.mockResolvedValue(jsonResponse(200, { status: "ok" }));
    await api.fetch("/v1/health", "get", {
      baseUrl: "https://call.example.test",
    });
    expect(lastCall().url).toBe("https://call.example.test/v1/health");
  });

  it("skips undefined and null query values", async () => {
    const api = createApi<TestPaths>();
    fetchMock.mockResolvedValue(jsonResponse(200, { items: [], total: 0 }));
    await api.fetch("/v1/items", "get", { query: { page: 2, tag: null } });
    expect(lastCall().url).toBe("/v1/items?page=2");
  });

  it("serializes a JSON body and sets the default content type", async () => {
    const api = createApi<TestPaths>();
    fetchMock.mockResolvedValue(
      jsonResponse(201, { id: "1", name: "Widget", price_cents: 100 }),
    );
    await api.fetch("/v1/items", "post", {
      headers: { "x-api-key": "key" },
      body: { name: "Widget", price_cents: 100 },
    });
    const { init } = lastCall();
    expect(init.method).toBe("POST");
    expect(init.credentials).toBe("same-origin");
    expect(init.redirect).toBe("error");
    expect(init.body).toBe(
      JSON.stringify({ name: "Widget", price_cents: 100 }),
    );
    const headers = new Headers(init.headers);
    expect(headers.get("content-type")).toBe("application/json");
    expect(headers.get("x-api-key")).toBe("key");
  });

  it("keeps a caller content type on a JSON body", async () => {
    const api = createApi<TestPaths>();
    fetchMock.mockResolvedValue(
      jsonResponse(201, { id: "1", name: "Widget", price_cents: 100 }),
    );
    await api.fetch("/v1/items", "post", {
      headers: {
        "x-api-key": "key",
        "content-type": "application/vnd.api+json",
      },
      body: { name: "Widget", price_cents: 100 },
    });
    expect(new Headers(lastCall().init.headers).get("content-type")).toBe(
      "application/vnd.api+json",
    );
  });

  it("passes raw bodies through without a content type", async () => {
    const api = createApi<TestPaths>();
    fetchMock.mockResolvedValue(jsonResponse(200, { size: 3 }));
    const bytes = new Uint8Array([1, 2, 3]).buffer;
    await api.fetch("/v1/items/{id}/file", "put", {
      pathParams: { id: "a" },
      query: { reason: "manual" },
      body: bytes,
    });
    const { init } = lastCall();
    expect(init.body).toBe(bytes);
    expect(new Headers(init.headers).has("content-type")).toBe(false);
  });
});

describe("failures", () => {
  it("maps fetch failures to client problems", async () => {
    const api = createApi<TestPaths>();
    const cases: Array<[Error, string]> = [
      [new DOMException("timed out", "TimeoutError"), "client_timeout"],
      [new DOMException("aborted", "AbortError"), "client_aborted"],
      [new TypeError("network down"), "client_network_error"],
    ];
    for (const [error, code] of cases) {
      fetchMock.mockRejectedValueOnce(error);
      const result = await api.fetch("/v1/health", "get");
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.problem.status).toBe(0);
        expect(result.problem.code).toBe(code);
        expect(result.problem.title).toBe("Request failed");
        expect(result.headers.has("x-request-id")).toBe(false);
      }
    }
  });

  it("returns a synthetic problem for an invalid timeout", async () => {
    const api = createApi<TestPaths>();
    for (const timeoutMs of [-1, 1.5, 2_147_483_648]) {
      const result = await api.fetch("/v1/health", "get", { timeoutMs });
      expect(fetchMock).not.toHaveBeenCalled();
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.problem.status).toBe(0);
        expect(result.problem.code).toBe("client_invalid_timeout");
        expect(result.problem.title).toBe("Invalid timeout");
        expect(result.problem.detail).toContain("2147483647");
        expect(result.headers.has("x-request-id")).toBe(false);
      }
    }
  });

  it("accepts a valid timeout", async () => {
    const api = createApi<TestPaths>();
    fetchMock.mockResolvedValueOnce(jsonResponse(200, { status: "ok" }));
    const result = await api.fetch("/v1/health", "get", {
      timeoutMs: 10_000,
    });
    expect(result.ok).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("bounds the text of a JSON error body", async () => {
    const api = createApi<TestPaths>();
    fetchMock.mockResolvedValueOnce(
      jsonResponse(422, {
        code: "c".repeat(600),
        detail: "d".repeat(600),
        field_errors: { name: "Required" },
      }),
    );
    const result = await api.fetch("/v1/health", "get");
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.problem.status).toBe(422);
      expect(result.problem.code).toHaveLength(500);
      expect(result.problem.detail).toHaveLength(500);
      expect(result.problem.field_errors).toEqual({ name: "Required" });
    }
  });

  it("drops an error body above 64 KiB to the defaults", async () => {
    const api = createApi<TestPaths>();
    const huge = JSON.stringify({ code: "c".repeat(70 * 1024) });
    fetchMock.mockResolvedValueOnce(
      new Response(huge, {
        status: 500,
        headers: { "content-type": "application/problem+json" },
      }),
    );
    const result = await api.fetch("/v1/health", "get");
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.problem.code).toBe("http_error");
      expect(result.problem.title).toBe("HTTP 500");
    }
  });

  it("releases a non-JSON error body", async () => {
    const api = createApi<TestPaths>();
    const response = new Response("<html>bad gateway</html>", {
      status: 502,
      headers: { "content-type": "text/html" },
    });
    const cancel = vi.spyOn(response.body!, "cancel");
    fetchMock.mockResolvedValueOnce(response);
    const result = await api.fetch("/v1/health", "get");
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.problem.code).toBe("http_error");
      expect(result.problem.title).toBe("HTTP 502");
    }
    expect(cancel).toHaveBeenCalledTimes(1);
  });

  it("forwards the request id header into the problem", async () => {
    const api = createApi<TestPaths>();
    fetchMock.mockResolvedValueOnce(
      jsonResponse(500, { code: "boom" }, { "x-request-id": "req-42" }),
    );
    const result = await api.fetch("/v1/health", "get");
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.problem.request_id).toBe("req-42");
      expect(result.headers.get("x-request-id")).toBe("req-42");
    }
  });
});

describe("unauthorized handling", () => {
  it("calls onUnauthorized with the path on a 401 response", async () => {
    const onUnauthorized = vi.fn();
    const api = createApi<TestPaths>({ onUnauthorized });
    fetchMock.mockResolvedValueOnce(jsonResponse(401, { code: "expired" }));
    const result = await api.fetch("/v1/items", "get");
    expect(onUnauthorized).toHaveBeenCalledWith("/v1/items");
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.problem.status).toBe(401);
      expect(result.problem.code).toBe("expired");
    }

    fetchMock.mockResolvedValueOnce(jsonResponse(200, { items: [], total: 0 }));
    await api.fetch("/v1/items", "get");
    expect(onUnauthorized).toHaveBeenCalledTimes(1);
  });

  it("keeps the result when the callback throws", async () => {
    const onUnauthorized = vi.fn(() => {
      throw new Error("callback failure");
    });
    const api = createApi<TestPaths>({ onUnauthorized });
    fetchMock.mockResolvedValueOnce(jsonResponse(401, {}));
    const result = await api.fetch("/v1/health", "get");
    expect(onUnauthorized).toHaveBeenCalledWith("/v1/health");
    expect(result.ok).toBe(false);
  });

  it("does not call the callback without a 401 response", async () => {
    const onUnauthorized = vi.fn();
    const api = createApi<TestPaths>({ onUnauthorized });
    fetchMock.mockResolvedValueOnce(jsonResponse(403, { code: "forbidden" }));
    const result = await api.fetch("/v1/items", "get");
    expect(result.ok).toBe(false);
    expect(onUnauthorized).not.toHaveBeenCalled();
  });
});

describe("successful responses", () => {
  it("returns undefined data for 204", async () => {
    const api = createApi<TestPaths>();
    fetchMock.mockResolvedValueOnce(new Response(null, { status: 204 }));
    const result = await api.fetch("/v1/items/{id}", "delete", {
      pathParams: { id: "a" },
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.status).toBe(204);
      expect(result.data).toBeUndefined();
    }
  });

  it("returns undefined data for 304", async () => {
    const api = createApi<TestPaths>();
    fetchMock.mockResolvedValueOnce(new Response(null, { status: 304 }));
    const result = await api.fetch("/v1/items/{id}", "get", {
      pathParams: { id: "a" },
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.status).toBe(304);
      expect(result.data).toBeUndefined();
    }
  });

  it("returns undefined data for HEAD", async () => {
    const api = createApi<TestPaths>();
    fetchMock.mockResolvedValueOnce(new Response(null, { status: 200 }));
    const result = await api.fetch("/v1/health", "head");
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.status).toBe(200);
      expect(result.data).toBeUndefined();
    }
    expect(lastCall().init.method).toBe("HEAD");
  });

  it("parses a JSON success body", async () => {
    const api = createApi<TestPaths>();
    fetchMock.mockResolvedValueOnce(jsonResponse(200, { status: "ok" }));
    const result = await api.fetch("/v1/health", "get");
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.status).toBe(200);
      expect(result.data).toEqual({ status: "ok" });
    }
  });

  it("returns an ArrayBuffer for a binary success body", async () => {
    const api = createApi<TestPaths>();
    const bytes = new Uint8Array([9, 8, 7]);
    fetchMock.mockResolvedValueOnce(
      new Response(bytes, {
        status: 200,
        headers: { "content-type": "application/octet-stream" },
      }),
    );
    const result = await api.fetch("/v1/items/{id}/file", "get", {
      pathParams: { id: "a" },
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data).toBeInstanceOf(ArrayBuffer);
      expect(new Uint8Array(result.data as ArrayBuffer)).toEqual(bytes);
    }
  });

  it("maps a decode failure to invalid_response", async () => {
    const api = createApi<TestPaths>();
    fetchMock.mockResolvedValueOnce(
      new Response("not json", {
        status: 200,
        headers: {
          "content-type": "application/json",
          "x-request-id": "req-7",
        },
      }),
    );
    const result = await api.fetch("/v1/health", "get");
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.problem.status).toBe(200);
      expect(result.problem.code).toBe("invalid_response");
      expect(result.problem.title).toBe("Invalid response");
      expect(result.problem.request_id).toBe("req-7");
      expect(result.headers.get("x-request-id")).toBe("req-7");
    }
  });
});

describe("signal combination", () => {
  it("passes a single caller signal through unchanged", async () => {
    const api = createApi<TestPaths>();
    const controller = new AbortController();
    let captured: AbortSignal | undefined;
    fetchMock.mockImplementation(async (_url: string, init: RequestInit) => {
      captured = init.signal ?? undefined;
      return jsonResponse(200, { status: "ok" });
    });
    await api.fetch("/v1/health", "get", { signal: controller.signal });
    expect(captured).toBe(controller.signal);
  });

  it("passes no signal when the caller sets none", async () => {
    const api = createApi<TestPaths>();
    let captured: AbortSignal | undefined;
    fetchMock.mockImplementation(async (_url: string, init: RequestInit) => {
      captured = init.signal ?? undefined;
      return jsonResponse(200, { status: "ok" });
    });
    await api.fetch("/v1/health", "get");
    expect(captured).toBeUndefined();
  });

  it("combines the caller and timeout signals", async () => {
    const api = createApi<TestPaths>();
    const controller = new AbortController();
    let captured: AbortSignal | undefined;
    fetchMock.mockImplementation(async (_url: string, init: RequestInit) => {
      captured = init.signal ?? undefined;
      return jsonResponse(200, { status: "ok" });
    });
    await api.fetch("/v1/health", "get", {
      signal: controller.signal,
      timeoutMs: 10_000,
    });
    expect(captured).toBeDefined();
    expect(captured).not.toBe(controller.signal);
    expect(captured?.aborted).toBe(false);
    controller.abort();
    expect(captured?.aborted).toBe(true);
  });

  it("returns client_timeout when the timeout signal fires", async () => {
    const api = createApi<TestPaths>();
    fetchMock.mockImplementation(
      (_url: string, init: RequestInit) =>
        new Promise((_resolve, reject) => {
          init.signal?.addEventListener("abort", () => {
            reject(new DOMException("timed out", "TimeoutError"));
          });
        }),
    );
    const result = await api.fetch("/v1/health", "get", { timeoutMs: 5 });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.problem.status).toBe(0);
      expect(result.problem.code).toBe("client_timeout");
    }
  });
});
