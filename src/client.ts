import {
  normalizeProblem,
  syntheticProblem,
  type ApiProblem,
} from "./problem.js";

/**
 * Union of every path that the `Paths` type declares.
 */
export type PathKey<Paths> = keyof Paths & string;

type HttpMethod = "get" | "put" | "post" | "delete" | "patch" | "head";

type Index<T, K> = K extends keyof T ? T[K] : never;

/**
 * HTTP methods that the `Paths` type declares for the path `P`. This type
 * excludes a method when the generated schema maps it to `never`.
 */
export type MethodOf<Paths, P extends PathKey<Paths>> = {
  [M in HttpMethod]: Index<Paths[P], M> extends never ? never : M;
}[HttpMethod];

/**
 * Operation object that the `Paths` type declares for the path `P` and the
 * method `M`.
 */
export type OperationOf<
  Paths,
  P extends PathKey<Paths>,
  M extends MethodOf<Paths, P>,
> = Index<Paths[P], M>;

/**
 * Path parameters that an operation declares.
 */
export type PathParamsOf<Op> = Op extends { parameters: { path: infer PP } }
  ? PP extends Record<string, unknown>
    ? PP
    : never
  : never;

/**
 * Query parameters that an operation declares.
 */
export type QueryOf<Op> = Op extends { parameters: { query?: infer Q } }
  ? Q extends Record<string, unknown>
    ? Q
    : never
  : never;

/**
 * Header parameters that an operation declares.
 */
export type HeaderParamsOf<Op> = Op extends { parameters: { header?: infer H } }
  ? H extends Record<string, unknown>
    ? H
    : never
  : never;

/**
 * Request body content map that an operation declares.
 */
export type ContentOf<Op> = Op extends { requestBody: { content: infer C } }
  ? C
  : never;

/**
 * JSON request body that an operation declares, or `never`.
 */
export type JsonBodyOf<Op> = [ContentOf<Op>] extends [never]
  ? never
  : ContentOf<Op> extends { "application/json": infer B }
    ? B
    : never;

/**
 * Raw request body that an operation accepts when the contract has no JSON
 * body. Raw bytes are valid only for uploads of non-JSON data.
 */
export type BinaryBodyOf<Op> = [ContentOf<Op>] extends [never]
  ? never
  : ContentOf<Op> extends { "application/json": unknown }
    ? never
    : ArrayBuffer | Blob;

/**
 * Keys of `T` whose property type does not permit `undefined`.
 */
export type RequiredKeysOf<T> = {
  [K in keyof T]-?: undefined extends T[K] ? never : K;
}[keyof T];

/**
 * Init fragment for the path parameters of an operation.
 */
export type PathInitOf<Op> = [PathParamsOf<Op>] extends [never]
  ? { pathParams?: never }
  : { pathParams: PathParamsOf<Op> };

/**
 * Init fragment for the query of an operation. The `query` key is optional
 * only when the operation declares no required query parameter.
 */
export type QueryInitOf<Op> = [QueryOf<Op>] extends [never]
  ? { query?: never }
  : [RequiredKeysOf<QueryOf<Op>>] extends [never]
    ? { query?: QueryOf<Op> }
    : { query: QueryOf<Op> };

/**
 * Init fragment for the body of an operation. A declared JSON body is
 * mandatory. A non-JSON contract accepts `ArrayBuffer` or `Blob` bytes.
 */
export type BodyInitOf<Op> = [JsonBodyOf<Op>] extends [never]
  ? [BinaryBodyOf<Op>] extends [never]
    ? { body?: never }
    : { body: BinaryBodyOf<Op> }
  : { body: JsonBodyOf<Op> };

/**
 * Init fragment for the headers of an operation. The caller can always add
 * free-form headers. Declared headers are mandatory when the operation marks
 * at least one of them as required.
 */
export type HeadersInitOf<Op> = [HeaderParamsOf<Op>] extends [never]
  ? { headers?: Record<string, string> }
  : [RequiredKeysOf<HeaderParamsOf<Op>>] extends [never]
    ? { headers?: HeaderParamsOf<Op> & Record<string, string> }
    : { headers: HeaderParamsOf<Op> & Record<string, string> };

/**
 * Complete init object for one operation.
 */
export type ApiInit<
  Paths,
  P extends PathKey<Paths>,
  M extends MethodOf<Paths, P>,
> = PathInitOf<OperationOf<Paths, P, M>> &
  QueryInitOf<OperationOf<Paths, P, M>> &
  BodyInitOf<OperationOf<Paths, P, M>> &
  HeadersInitOf<OperationOf<Paths, P, M>> & {
    /** Caller signal. The client combines it with the timeout signal. */
    signal?: AbortSignal;
    /** Timeout in milliseconds. Valid values are integers from 0 to 2147483647. */
    timeoutMs?: number;
    /** Base URL for this call. This value wins over the client base URL. */
    baseUrl?: string;
  };

/**
 * Variadic argument tuple for one operation. The init argument is optional
 * only when the operation declares no mandatory fragment.
 */
export type ApiArgs<
  Paths,
  P extends PathKey<Paths>,
  M extends MethodOf<Paths, P>,
> = [RequiredKeysOf<ApiInit<Paths, P, M>>] extends [never]
  ? [init?: ApiInit<Paths, P, M>]
  : [init: ApiInit<Paths, P, M>];

/**
 * Response data of an operation, mapped from the success statuses. A status
 * without content maps to `undefined`.
 */
export type DataOf<Op> = Op extends { responses: infer R }
  ? {
      [S in keyof R]: S extends 200 | 201 | 202 | 203 | 204 | 205 | 206 | 304
        ? R[S] extends { content: infer C }
          ? C extends { "application/json": infer J }
            ? J
            : ArrayBuffer
          : undefined
        : never;
    }[keyof R]
  : never;

/**
 * Result of an API call. The union never throws for HTTP, timeout, abort or
 * network failures. Failures arrive as an {@link ApiProblem}.
 */
export type ApiResult<T> =
  | { ok: true; status: number; data: T; headers: Headers }
  | { ok: false; problem: ApiProblem; headers: Headers };

/**
 * Options for {@link createApi}.
 */
export interface ApiClientOptions {
  /** Prefix for every request URL. A per-call `baseUrl` wins over this value. */
  baseUrl?: string;
  /** Called after a `401` response. Receives the request path. */
  onUnauthorized?: (path: string) => void;
}

/**
 * Typed client that {@link createApi} returns.
 */
export interface ApiClient<Paths> {
  /**
   * Performs one request. TypeScript requires the path parameters, query
   * values, JSON body and required headers that the operation declares.
   */
  fetch<P extends PathKey<Paths>, M extends MethodOf<Paths, P>>(
    path: P,
    method: M,
    ...args: ApiArgs<Paths, P, M>
  ): Promise<ApiResult<DataOf<OperationOf<Paths, P, M>>>>;
}

const MAX_ERROR_BODY_BYTES = 64 * 1024;
const MAX_TIMEOUT_MS = 2_147_483_647;

interface BuildUrlInput {
  pathParams?: Record<string, unknown>;
  query?: Record<string, unknown>;
  baseUrl?: string;
}

function buildUrl(path: string, init: BuildUrlInput, defaultBaseUrl: string): string {
  let url: string = path;
  for (const [name, value] of Object.entries(init.pathParams ?? {})) {
    url = url.replace(`{${name}}`, encodeURIComponent(String(value)));
  }
  const params = new URLSearchParams();
  for (const [name, value] of Object.entries(init.query ?? {})) {
    if (value === undefined || value === null) continue;
    params.append(name, String(value));
  }
  const qs = params.toString();
  if (qs) url += `?${qs}`;
  return `${init.baseUrl ?? defaultBaseUrl}${url}`;
}

function isRawBody(body: unknown): body is ArrayBuffer | Blob {
  return body instanceof ArrayBuffer || body instanceof Blob;
}

function isValidTimeout(timeoutMs: number): boolean {
  return (
    Number.isInteger(timeoutMs) &&
    timeoutMs >= 0 &&
    timeoutMs <= MAX_TIMEOUT_MS
  );
}

function normalizeTimeout(
  timeoutMs: number | undefined,
): { signal?: AbortSignal; problem?: ApiProblem } {
  if (timeoutMs === undefined) return {};
  if (!isValidTimeout(timeoutMs)) {
    return {
      problem: syntheticProblem(
        0,
        "client_invalid_timeout",
        "Invalid timeout",
        `timeoutMs must be an integer between 0 and ${MAX_TIMEOUT_MS}`,
      ),
    };
  }
  try {
    return { signal: AbortSignal.timeout(timeoutMs) };
  } catch {
    return {
      problem: syntheticProblem(0, "client_invalid_timeout", "Invalid timeout"),
    };
  }
}

async function readBoundedText(response: Response, max: number): Promise<string> {
  if (!response.body) return "";
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done || !value) break;
      const remaining = max - total;
      if (remaining <= 0) break;
      chunks.push(value.subarray(0, remaining));
      total += Math.min(value.length, remaining);
      if (total >= max) break;
    }
  } finally {
    await reader.cancel().catch(() => {});
  }
  const merged = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    merged.set(chunk, offset);
    offset += chunk.length;
  }
  return new TextDecoder().decode(merged);
}

/**
 * Creates a typed API client for the generated `Paths` type.
 *
 * The client stores no application schema. Pass the `paths` type of your
 * OpenAPI generator as the generic argument. Every call returns an
 * {@link ApiResult} and never throws for HTTP or network failures.
 */
export function createApi<Paths>(
  options: ApiClientOptions = {},
): ApiClient<Paths> {
  async function clientFetch<
    P extends PathKey<Paths>,
    M extends MethodOf<Paths, P>,
  >(
    path: P,
    method: M,
    ...args: ApiArgs<Paths, P, M>
  ): Promise<ApiResult<DataOf<OperationOf<Paths, P, M>>>> {
    const init: ApiInit<Paths, P, M> = args[0] ?? ({} as ApiInit<Paths, P, M>);

    const timeout = normalizeTimeout(init.timeoutMs);
    if (timeout.problem) {
      return { ok: false, problem: timeout.problem, headers: new Headers() };
    }

    const headers = new Headers(init.headers);
    let body: BodyInit | undefined;
    const declaredBody = (init as { body?: unknown }).body;
    if (declaredBody !== undefined) {
      if (isRawBody(declaredBody)) {
        body = declaredBody;
      } else {
        if (!headers.has("content-type")) {
          headers.set("content-type", "application/json");
        }
        body = JSON.stringify(declaredBody);
      }
    }

    const signals: AbortSignal[] = [];
    if (init.signal) signals.push(init.signal);
    if (timeout.signal) signals.push(timeout.signal);
    const signal =
      signals.length === 0
        ? undefined
        : signals.length === 1
          ? signals[0]
          : AbortSignal.any(signals);

    let response: Response;
    try {
      response = await globalThis.fetch(
        buildUrl(path, init as BuildUrlInput, options.baseUrl ?? ""),
        {
          method: method.toUpperCase(),
          credentials: "same-origin",
          redirect: "error",
          headers,
          body,
          signal,
        },
      );
    } catch (error) {
      const name =
        error instanceof DOMException || error instanceof Error
          ? error.name
          : "";
      const code =
        name === "TimeoutError"
          ? "client_timeout"
          : name === "AbortError"
            ? "client_aborted"
            : "client_network_error";
      return {
        ok: false,
        problem: syntheticProblem(0, code, "Request failed"),
        headers: new Headers(),
      };
    }

    if (response.status === 401 && options.onUnauthorized) {
      try {
        options.onUnauthorized(path);
      } catch {}
    }

    const requestId = response.headers.get("x-request-id") ?? "";

    if (!response.ok && response.status !== 304) {
      let parsed: unknown;
      const contentType = (
        response.headers.get("content-type") ?? ""
      ).toLowerCase();
      if (contentType.includes("json")) {
        try {
          parsed = JSON.parse(
            await readBoundedText(response, MAX_ERROR_BODY_BYTES),
          );
        } catch {
          parsed = undefined;
        }
      } else {
        await response.body?.cancel().catch(() => {});
      }
      return {
        ok: false,
        problem: normalizeProblem(response.status, parsed, requestId),
        headers: response.headers,
      };
    }

    try {
      if (
        response.status === 204 ||
        response.status === 304 ||
        method === "head"
      ) {
        return {
          ok: true,
          status: response.status,
          data: undefined as unknown as DataOf<OperationOf<Paths, P, M>>,
          headers: response.headers,
        };
      }
      const contentType = (
        response.headers.get("content-type") ?? ""
      ).toLowerCase();
      if (contentType.includes("application/json")) {
        const data = (await response.json()) as DataOf<
          OperationOf<Paths, P, M>
        >;
        return {
          ok: true,
          status: response.status,
          data,
          headers: response.headers,
        };
      }
      const data = (await response.arrayBuffer()) as unknown as DataOf<
        OperationOf<Paths, P, M>
      >;
      return {
        ok: true,
        status: response.status,
        data,
        headers: response.headers,
      };
    } catch {
      return {
        ok: false,
        problem: syntheticProblem(
          response.status,
          "invalid_response",
          "Invalid response",
          "The response body could not be decoded",
          requestId,
        ),
        headers: response.headers,
      };
    }
  }

  return { fetch: clientFetch };
}
