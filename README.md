# openapi-result

A typed OpenAPI client with a Result union and bounded RFC 7807 problem
normalization. The package has no runtime dependencies.

The client turns every HTTP failure, timeout, abort and network error into a
return value. Invalid caller input, such as a circular JSON body, can still
throw before the request starts.

## Requirements

- Node.js 20.3 or later (continuous integration tests Node 24).
- TypeScript 5.0 or later.
- A runtime with the global `fetch` API, `AbortSignal.timeout` and
  `AbortSignal.any` (Chrome 116+, Firefox 124+, Safari 17.4+, Node 20.3+).

## Install

```sh
npm install openapi-result
```

## Quick start

First, generate a `paths` type with your OpenAPI generator. This example uses
`openapi-typescript`:

```sh
npx openapi-typescript ./openapi.yaml -o ./src/schema.d.ts
```

Then create a client and call an operation:

```ts
import { createApi } from "openapi-result";
import type { paths } from "./schema";

const api = createApi<paths>({
  baseUrl: "https://api.example.test",
  onUnauthorized: (path) => {
    console.error("Unauthorized request:", path);
  },
});

const result = await api.fetch("/v1/items/{id}", "get", {
  pathParams: { id: "item-1" },
  query: { locale: "en" },
  timeoutMs: 5000,
});

if (result.ok) {
  console.log(result.status, result.data);
} else {
  console.error(result.problem.code, result.problem.title);
}
```

The client stores no application schema. The `paths` type supplies every path,
method, parameter and response type.

## The Result contract

- Every call returns a promise of `ApiResult<T>`.
- `ok: true` carries `status`, `data` and `headers`.
- `ok: false` carries `problem` and `headers`.
- The client returns `undefined` data for status 204, status 304 and HEAD
  requests.
- A JSON response maps to the declared data type.
- Any other success body maps to `ArrayBuffer`.

## The problem contract

`ApiProblem` describes every failure:

| Field | Type | Notes |
| --- | --- | --- |
| `status` | `number` | The HTTP status code, or 0 for a client-side failure |
| `code` | `string` | The error code. The default is `http_error` |
| `title` | `string` | The short summary. The default is `HTTP <status>` |
| `detail` | `string` | The explanation, or an empty string |
| `field_errors` | `Record<string, string>` | The field messages |
| `request_id` | `string` | The `x-request-id` value, or the argument value |

The client bounds every problem:

- The client truncates text to 500 characters.
- The client keeps at most 50 field errors.
- The client reads at most 64 KiB of an error body.
- The client releases a non-JSON error body without a read.

The client builds a synthetic problem for local failures. The codes are:

- `client_invalid_timeout`
- `client_timeout`
- `client_aborted`
- `client_network_error`

A server response that cannot be decoded produces `invalid_response`. That
problem carries the HTTP status.

## Request behavior

- Path parameters pass through `encodeURIComponent`.
- Query values skip `undefined` and `null`.
- A JSON body gets the `application/json` content type. A caller content type
  wins.
- An `ArrayBuffer` or `Blob` body passes through without a content type.
- Every request uses `credentials: "same-origin"` and `redirect: "error"`.
- A caller `signal` and the timeout signal combine with `AbortSignal.any`.
- A 401 response calls `onUnauthorized(path)`.
- A timeout value must be an integer from 0 to 2147483647.

## The type layer

The package exports these types: `PathKey`, `MethodOf`, `OperationOf`,
`PathParamsOf`, `QueryOf`, `HeaderParamsOf`, `ContentOf`, `JsonBodyOf`,
`BinaryBodyOf`, `RequiredKeysOf`, `PathInitOf`, `QueryInitOf`, `BodyInitOf`,
`HeadersInitOf`, `ApiInit`, `ApiArgs`, `DataOf`, `ApiResult`, `ApiClient` and
`ApiClientOptions`.

The init argument is optional only when the operation declares no mandatory
fragment. TypeScript requires each declared path parameter, required query
value, JSON body and required header.

`ApiInit` also accepts `signal`, `timeoutMs` and `baseUrl` for one call. A
call-level `baseUrl` wins over the client `baseUrl`.

## The sync CLI

The `openapi-result-sync` command verifies a spec checksum and copies the
generated types into a target directory:

```sh
npx openapi-result-sync \
  --spec ./openapi.yaml \
  --checksum ./openapi.sha256 \
  --types ./schema.d.ts \
  --out ./src/api
```

The command has these properties:

- All four flags are required. The command reads no environment variables.
- The command computes the SHA-256 digest of the spec file.
- The command compares the digest with the first whitespace token of the
  checksum file.
- If the digest differs, the command exits with code 1 and writes nothing.
- If the digest matches, the command writes `<out>/schema.d.ts` and
  `<out>/openapi.sha256` atomically.
- If an input is unreadable, or an output cannot be written, the command
  exits with code 2 and prints a message to stderr.

## Development

```sh
npm install
npm run typecheck
npm test
npm run build
```

`npm run typecheck` covers `src/`, `test/` and the config files, including the
compile-time assertions in `test/types.ts`. `npm test` runs the Vitest suites for the
problem, the client and the sync CLI.

## License

MIT. See [LICENSE](./LICENSE).
