/**
 * Normalized problem object that describes every failed request.
 *
 * The shape follows RFC 7807 with the small field set that the client
 * returns to callers.
 */
export interface ApiProblem {
  /** HTTP status code, or 0 for failures without a response. */
  status: number;
  /** Stable machine-readable error code. */
  code: string;
  /** Short human-readable summary. */
  title: string;
  /** Longer human-readable explanation, or an empty string. */
  detail: string;
  /** Field-level validation messages, keyed by field name. */
  field_errors: Record<string, string>;
  /** Correlation identifier, usually from the `x-request-id` header. */
  request_id: string;
}

const MAX_TEXT_LENGTH = 500;
const MAX_FIELD_ERRORS = 50;

function boundedText(value: unknown): string {
  if (typeof value !== "string") return "";
  return value.slice(0, MAX_TEXT_LENGTH);
}

function boundedFieldErrors(value: unknown): Record<string, string> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }
  const result: Record<string, string> = {};
  let count = 0;
  for (const key in value as Record<string, unknown>) {
    if (count >= MAX_FIELD_ERRORS) break;
    if (!Object.prototype.hasOwnProperty.call(value, key)) continue;
    const raw = (value as Record<string, unknown>)[key];
    if (typeof raw !== "string") continue;
    result[key.slice(0, MAX_TEXT_LENGTH)] = raw.slice(0, MAX_TEXT_LENGTH);
    count += 1;
  }
  return result;
}

/**
 * Maps a parsed or unreadable error body onto the problem contract.
 *
 * Text values are truncated to 500 characters. Field errors are limited to
 * 50 entries. Unknown shapes fall back to the defaults `http_error` and
 * `HTTP <status>`. When the body has no `request_id`, the function uses the
 * `requestId` argument.
 */
export function normalizeProblem(
  status: number,
  body: unknown,
  requestId = "",
): ApiProblem {
  const source =
    body !== null && typeof body === "object" && !Array.isArray(body)
      ? (body as Record<string, unknown>)
      : {};
  return {
    status,
    code: boundedText(source.code) || "http_error",
    title: boundedText(source.title) || `HTTP ${status}`,
    detail: boundedText(source.detail),
    field_errors: boundedFieldErrors(source.field_errors),
    request_id:
      boundedText(source.request_id) || requestId.slice(0, MAX_TEXT_LENGTH),
  };
}

/**
 * Builds a client-side problem for failures without a backend response,
 * such as invalid options, timeouts, aborts and network errors.
 */
export function syntheticProblem(
  status: number,
  code: string,
  title: string,
  detail = "",
  requestId = "",
): ApiProblem {
  return {
    status,
    code,
    title,
    detail: detail.slice(0, MAX_TEXT_LENGTH),
    field_errors: {},
    request_id: requestId.slice(0, MAX_TEXT_LENGTH),
  };
}
