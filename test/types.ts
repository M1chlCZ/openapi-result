import { createApi, type ApiResult } from "../src/client.js";
import type { TestPaths } from "./paths.js";

const api = createApi<TestPaths>();

export async function requiredFragmentChecks(): Promise<void> {
  await api.fetch("/v1/health", "get");
  await api.fetch("/v1/items", "get");
  await api.fetch("/v1/items", "get", { query: { page: 1 } });
  await api.fetch("/v1/items", "get", { query: { tag: null } });
  await api.fetch("/v1/items/{id}", "get", { pathParams: { id: "a" } });
  await api.fetch("/v1/items/{id}", "get", {
    pathParams: { id: "a" },
    query: { locale: "cs" },
  });
  await api.fetch("/v1/items/{id}", "patch", {
    pathParams: { id: "a" },
    body: { name: "Widget" },
  });
  await api.fetch("/v1/items/{id}", "patch", {
    pathParams: { id: "a" },
    headers: { "if-match": "7" },
    body: { price_cents: 100 },
  });
  await api.fetch("/v1/items/{id}", "delete", { pathParams: { id: "a" } });
  await api.fetch("/v1/items", "post", {
    headers: { "x-api-key": "key" },
    body: { name: "Widget", price_cents: 100 },
  });
  await api.fetch("/v1/search", "get", { query: { q: "widget" } });
  await api.fetch("/v1/items/{id}/file", "put", {
    pathParams: { id: "a" },
    query: { reason: "manual" },
    body: new ArrayBuffer(0),
  });
  await api.fetch("/v1/items/{id}/file", "put", {
    pathParams: { id: "a" },
    query: { reason: "manual" },
    body: new Blob(),
  });

  // @ts-expect-error the init object is mandatory for a path parameter
  await api.fetch("/v1/items/{id}", "get");

  const emptyInit = {};
  // @ts-expect-error the path parameter is mandatory even through a variable
  await api.fetch("/v1/items/{id}", "get", emptyInit);

  await api.fetch("/v1/items/{id}", "get", {
    // @ts-expect-error the path parameter must be a string
    pathParams: { id: 1 },
  });

  // @ts-expect-error the path is not declared in Paths
  await api.fetch("/v1/missing", "get");

  // @ts-expect-error the method is not declared for this path
  await api.fetch("/v1/health", "post");

  await api.fetch("/v1/items", "get", {
    // @ts-expect-error a GET request declares no body
    body: { sneaky: true },
  });

  const looseBody = { body: { sneaky: true } };
  // @ts-expect-error a GET request forbids a body even through a variable
  await api.fetch("/v1/items", "get", looseBody);

  // @ts-expect-error the JSON body is mandatory for this POST
  await api.fetch("/v1/items", "post", { headers: { "x-api-key": "key" } });

  // @ts-expect-error the API-key header is mandatory for this POST
  await api.fetch("/v1/items", "post", {
    body: { name: "Widget", price_cents: 100 },
  });

  await api.fetch("/v1/items", "get", {
    // @ts-expect-error the page query value must be a number
    query: { page: "1" },
  });

  // @ts-expect-error the query is mandatory for this search operation
  await api.fetch("/v1/search", "get");

  await api.fetch("/v1/items/{id}/file", "put", {
    pathParams: { id: "a" },
    query: { reason: "manual" },
    // @ts-expect-error the upload accepts raw bytes only
    body: { nope: true },
  });
}

export async function responseDataChecks(): Promise<void> {
  const health: ApiResult<{ status: string }> = await api.fetch(
    "/v1/health",
    "get",
  );
  if (health.ok) {
    const status: string = health.data.status;
    void status;
  } else {
    const code: string = health.problem.code;
    void code;
  }

  const items = await api.fetch("/v1/items", "get");
  if (items.ok) {
    const name: string = items.data.items[0]?.name ?? "";
    const total: number = items.data.total;
    void name;
    void total;
  }

  const created = await api.fetch("/v1/items", "post", {
    headers: { "x-api-key": "key" },
    body: { name: "Widget", price_cents: 100 },
  });
  if (created.ok) {
    const id: string = created.data.id;
    void id;
  }

  const patched = await api.fetch("/v1/items/{id}", "patch", {
    pathParams: { id: "a" },
    body: {},
  });
  if (patched.ok) {
    const name: string = patched.data.name;
    void name;
  }

  const removed = await api.fetch("/v1/items/{id}", "delete", {
    pathParams: { id: "a" },
  });
  if (removed.ok) {
    const nothing: undefined = removed.data;
    void nothing;
  }

  const file = await api.fetch("/v1/items/{id}/file", "get", {
    pathParams: { id: "a" },
  });
  if (file.ok) {
    const bytes: ArrayBuffer = file.data;
    void bytes;
  }

  const upload = await api.fetch("/v1/items/{id}/file", "put", {
    pathParams: { id: "a" },
    query: { reason: "manual" },
    body: new ArrayBuffer(0),
  });
  if (upload.ok) {
    const size: number = upload.data.size;
    void size;
  }

  const searched = await api.fetch("/v1/search", "get", {
    query: { q: "widget", page: 2 },
  });
  if (searched.ok) {
    const first: string | undefined = searched.data.items[0]?.id;
    void first;
  }
}

export function otherTypeChecks(): void {
  const options = {
    baseUrl: "https://api.example.test",
    onUnauthorized: (path: string) => {
      void path;
    },
  };
  const configured = createApi<TestPaths>(options);
  void configured;
}
