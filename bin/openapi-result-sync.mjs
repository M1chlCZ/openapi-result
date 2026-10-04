#!/usr/bin/env node
import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const USAGE = `openapi-result-sync --spec <file> --checksum <file> --types <file> --out <dir>

Reads an OpenAPI document and a generated type declaration file. Computes the
SHA-256 digest of the spec and compares it with the first token of the checksum
file. On a match, copies the type declaration to <out>/schema.d.ts and the
checksum file to <out>/openapi.sha256. Both writes are atomic.

Exit codes:
  0  the checksum matches and both outputs are written
  1  the checksum does not match; nothing is written
  2  a flag is missing, a flag is unknown, or an input is unreadable`;

function fail(code, message) {
  console.error(`openapi-result-sync: ${message}`);
  process.exit(code);
}

function parseArgs(argv) {
  const values = { spec: null, checksum: null, types: null, out: null };
  for (let index = 0; index < argv.length; index += 1) {
    const flag = argv[index];
    if (flag === "--help" || flag === "-h") {
      console.log(USAGE);
      process.exit(0);
    }
    const key = flag.startsWith("--") ? flag.slice(2) : "";
    if (!(key in values)) {
      fail(2, `unknown argument: ${flag}`);
    }
    const value = argv[index + 1];
    if (value === undefined || value.startsWith("--")) {
      fail(2, `missing value for ${flag}`);
    }
    values[key] = value;
    index += 1;
  }
  for (const key of ["spec", "checksum", "types", "out"]) {
    if (values[key] === null) {
      fail(2, `missing required flag --${key}`);
    }
  }
  return values;
}

const args = parseArgs(process.argv.slice(2));

let specBytes;
let checksumText;
try {
  specBytes = readFileSync(args.spec);
  checksumText = readFileSync(args.checksum, "utf8");
} catch {
  fail(2, "cannot read the spec file or the checksum file");
}

let typesBytes;
try {
  typesBytes = readFileSync(args.types);
} catch {
  fail(2, `cannot read the generated types at ${args.types}`);
}

const computed = createHash("sha256").update(specBytes).digest("hex");
const recorded = checksumText.trim().split(/\s+/)[0] ?? "";
if (computed !== recorded) {
  fail(
    1,
    `checksum drift: computed ${computed}, recorded ${recorded}; nothing written`,
  );
}

function atomicWrite(name, bytes) {
  const tmp = join(args.out, `.${name}.${process.pid}.tmp`);
  writeFileSync(tmp, bytes);
  renameSync(tmp, join(args.out, name));
}

try {
  mkdirSync(args.out, { recursive: true });
  atomicWrite("schema.d.ts", typesBytes);
  atomicWrite("openapi.sha256", checksumText);
} catch (error) {
  fail(
    2,
    `cannot write output: ${error instanceof Error ? error.message : String(error)}`,
  );
}
console.log(`openapi-result-sync: synced (sha256 ${computed})`);
