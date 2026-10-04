import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  existsSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const cli = fileURLToPath(
  new URL("../bin/openapi-result-sync.mjs", import.meta.url),
);

interface Inputs {
  specPath: string;
  checksumPath: string;
  typesPath: string;
  outDir: string;
}

const specText = "openapi: 3.0.0\ninfo:\n  title: Fixture\n";
const typesText = "export type paths = Record<string, never>;\n";

function makeInputs(): Inputs {
  const dir = mkdtempSync(join(tmpdir(), "openapi-result-sync-"));
  const specPath = join(dir, "openapi.yaml");
  const checksumPath = join(dir, "openapi.sha256");
  const typesPath = join(dir, "schema.d.ts");
  const outDir = join(dir, "out");
  writeFileSync(specPath, specText);
  writeFileSync(
    checksumPath,
    `${createHash("sha256").update(specText).digest("hex")}  openapi.yaml\n`,
  );
  writeFileSync(typesPath, typesText);
  return { specPath, checksumPath, typesPath, outDir };
}

function argsFor(inputs: Inputs): string[] {
  return [
    "--spec",
    inputs.specPath,
    "--checksum",
    inputs.checksumPath,
    "--types",
    inputs.typesPath,
    "--out",
    inputs.outDir,
  ];
}

function run(args: string[]) {
  return spawnSync(process.execPath, [cli, ...args], { encoding: "utf8" });
}

describe("openapi-result-sync", () => {
  it("exits with code 2 when an output cannot be written", () => {
    const inputs = makeInputs();
    writeFileSync(inputs.outDir, "not a directory");
    const result = run(argsFor(inputs));
    expect(result.status).toBe(2);
    expect(result.stderr).toContain("cannot write output");
  });
});

describe("openapi-result-sync", () => {
  it("verifies the checksum and writes both outputs", () => {
    const inputs = makeInputs();
    const result = run(argsFor(inputs));
    expect(result.status).toBe(0);
    expect(result.stdout).toContain("synced");
    expect(readFileSync(join(inputs.outDir, "schema.d.ts"), "utf8")).toBe(
      typesText,
    );
    expect(readFileSync(join(inputs.outDir, "openapi.sha256"), "utf8")).toBe(
      `${createHash("sha256").update(specText).digest("hex")}  openapi.yaml\n`,
    );
    const leftovers = readdirSync(inputs.outDir).filter((name) =>
      name.includes(".tmp"),
    );
    expect(leftovers).toEqual([]);
  });

  it("reads the checksum from the first whitespace token", () => {
    const inputs = makeInputs();
    const digest = createHash("sha256").update(specText).digest("hex");
    writeFileSync(
      inputs.checksumPath,
      `# generated\n${digest} *openapi.yaml\n`,
    );
    const result = run(argsFor(inputs));
    expect(result.status).toBe(1);
    expect(result.stderr).toContain("checksum drift");
  });

  it("exits 1 on checksum drift and writes nothing", () => {
    const inputs = makeInputs();
    writeFileSync(inputs.checksumPath, `${"0".repeat(64)}  openapi.yaml\n`);
    const result = run(argsFor(inputs));
    expect(result.status).toBe(1);
    expect(result.stderr).toContain("checksum drift");
    expect(existsSync(inputs.outDir)).toBe(false);
  });

  it("exits 2 when the spec is unreadable", () => {
    const inputs = makeInputs();
    const result = run([
      "--spec",
      join(inputs.outDir, "missing.yaml"),
      "--checksum",
      inputs.checksumPath,
      "--types",
      inputs.typesPath,
      "--out",
      inputs.outDir,
    ]);
    expect(result.status).toBe(2);
    expect(result.stderr).toContain("openapi-result-sync:");
    expect(existsSync(inputs.outDir)).toBe(false);
  });

  it("exits 2 when the types are unreadable", () => {
    const inputs = makeInputs();
    const result = run([
      "--spec",
      inputs.specPath,
      "--checksum",
      inputs.checksumPath,
      "--types",
      join(inputs.outDir, "missing.d.ts"),
      "--out",
      inputs.outDir,
    ]);
    expect(result.status).toBe(2);
    expect(result.stderr).toContain("generated types");
  });

  it("exits 2 when a required flag is missing", () => {
    const inputs = makeInputs();
    const result = run([
      "--spec",
      inputs.specPath,
      "--checksum",
      inputs.checksumPath,
      "--types",
      inputs.typesPath,
    ]);
    expect(result.status).toBe(2);
    expect(result.stderr).toContain("missing required flag --out");
  });

  it("exits 2 on an unknown flag", () => {
    const inputs = makeInputs();
    const result = run([...argsFor(inputs), "--force"]);
    expect(result.status).toBe(2);
    expect(result.stderr).toContain("unknown argument");
  });
});
