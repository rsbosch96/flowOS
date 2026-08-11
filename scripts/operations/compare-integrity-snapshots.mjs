import { readFile } from "node:fs/promises";

const [sourcePath, restoredPath] = process.argv.slice(2);
const comparisonContracts = {
  "flowos-integrity-snapshot": [
    "migrationLedger",
    "objects",
    "security",
    "rowCounts",
    "financial",
    "relationships",
    "auth",
  ],
  "flowos-storage-inventory": ["buckets"],
};

function fail(message, code = 2) {
  process.stderr.write(`${message}\n`);
  process.exitCode = code;
}

async function readSnapshot(path) {
  const input = await readFile(path, "utf8");
  const parsed = JSON.parse(input);
  if (!Object.hasOwn(comparisonContracts, parsed?.format) || parsed?.formatVersion !== 1) {
    throw new Error("Snapshot does not match the FlowOS integrity snapshot contract.");
  }
  return parsed;
}

function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonical(value[key])]));
  }
  return value;
}

function equal(left, right) {
  return JSON.stringify(canonical(left)) === JSON.stringify(canonical(right));
}

if (!sourcePath || !restoredPath) {
  fail("Usage: node scripts/operations/compare-integrity-snapshots.mjs <source.json> <restored.json>");
} else {
  try {
    const [source, restored] = await Promise.all([readSnapshot(sourcePath), readSnapshot(restoredPath)]);
    if (source.format !== restored.format) {
      throw new Error("Source and restored snapshots use different contracts.");
    }

    const comparedFields = comparisonContracts[source.format];
    const missingFields = comparedFields.filter((field) => source[field] === undefined || restored[field] === undefined);
    if (missingFields.length > 0) {
      throw new Error(`Snapshot is missing required comparison sections: ${missingFields.join(", ")}.`);
    }

    const differences = comparedFields.filter((field) => !equal(source[field], restored[field]));

    if (differences.length > 0) {
      // Do not echo snapshot values: they are backup-sensitive operational metadata.
      process.stdout.write(JSON.stringify({ status: "mismatch", differingSections: differences }, null, 2) + "\n");
      process.exitCode = 1;
    } else {
      process.stdout.write(JSON.stringify({ status: "match", comparedSections: comparedFields }, null, 2) + "\n");
    }
  } catch (error) {
    fail(error instanceof Error ? error.message : "Unable to read integrity snapshots.");
  }
}
