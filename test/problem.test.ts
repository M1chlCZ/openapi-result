import { describe, expect, it } from "vitest";
import { normalizeProblem, syntheticProblem } from "../src/problem.js";

describe("normalizeProblem", () => {
  it("reads the problem fields from a valid body", () => {
    const problem = normalizeProblem(
      422,
      {
        code: "validation_failed",
        title: "Validation failed",
        detail: "One field is invalid",
        field_errors: { name: "Required" },
        request_id: "body-request",
      },
      "argument-request",
    );
    expect(problem).toEqual({
      status: 422,
      code: "validation_failed",
      title: "Validation failed",
      detail: "One field is invalid",
      field_errors: { name: "Required" },
      request_id: "body-request",
    });
  });

  it("uses the documented defaults for missing fields", () => {
    const problem = normalizeProblem(500, {});
    expect(problem.code).toBe("http_error");
    expect(problem.title).toBe("HTTP 500");
    expect(problem.detail).toBe("");
    expect(problem.field_errors).toEqual({});
    expect(problem.request_id).toBe("");
  });

  it("ignores bodies that are not plain objects", () => {
    for (const body of [null, undefined, "text", 42, true, ["array"]]) {
      const problem = normalizeProblem(502, body);
      expect(problem.code).toBe("http_error");
      expect(problem.title).toBe("HTTP 502");
      expect(problem.field_errors).toEqual({});
    }
  });

  it("ignores non-string field values and array field errors", () => {
    const problem = normalizeProblem(422, {
      field_errors: { name: "Required", count: 3 },
    });
    expect(problem.field_errors).toEqual({ name: "Required" });

    const arrayFields = normalizeProblem(422, { field_errors: ["nope"] });
    expect(arrayFields.field_errors).toEqual({});
  });

  it("truncates text values to 500 characters", () => {
    const long = "x".repeat(900);
    const problem = normalizeProblem(400, {
      code: long,
      title: long,
      detail: long,
      request_id: long,
    });
    expect(problem.code).toHaveLength(500);
    expect(problem.title).toHaveLength(500);
    expect(problem.detail).toHaveLength(500);
    expect(problem.request_id).toHaveLength(500);
  });

  it("keeps at most 50 field errors", () => {
    const fieldErrors: Record<string, string> = {};
    for (let index = 0; index < 80; index += 1) {
      fieldErrors[`field_${index}`] = `value_${index}`;
    }
    const problem = normalizeProblem(422, { field_errors: fieldErrors });
    expect(Object.keys(problem.field_errors)).toHaveLength(50);
    expect(problem.field_errors.field_49).toBe("value_49");
    expect(problem.field_errors.field_50).toBeUndefined();
  });

  it("bounds field error keys and values", () => {
    const problem = normalizeProblem(422, {
      field_errors: { ["k".repeat(900)]: "v".repeat(900) },
    });
    const entries = Object.entries(problem.field_errors);
    expect(entries).toHaveLength(1);
    expect(entries[0]?.[0]).toHaveLength(500);
    expect(entries[0]?.[1]).toHaveLength(500);
  });

  it("uses the argument request id when the body has none", () => {
    const problem = normalizeProblem(500, { code: "boom" }, "req-1");
    expect(problem.request_id).toBe("req-1");
  });

  it("bounds the argument request id", () => {
    const problem = normalizeProblem(500, {}, "r".repeat(900));
    expect(problem.request_id).toHaveLength(500);
  });
});

describe("syntheticProblem", () => {
  it("builds a problem with empty field errors", () => {
    expect(
      syntheticProblem(
        0,
        "client_timeout",
        "Request failed",
        "The request timed out",
        "req-2",
      ),
    ).toEqual({
      status: 0,
      code: "client_timeout",
      title: "Request failed",
      detail: "The request timed out",
      field_errors: {},
      request_id: "req-2",
    });
  });

  it("bounds the detail and the request id", () => {
    const problem = syntheticProblem(
      500,
      "invalid_response",
      "Invalid response",
      "d".repeat(900),
      "r".repeat(900),
    );
    expect(problem.detail).toHaveLength(500);
    expect(problem.request_id).toHaveLength(500);
  });
});
