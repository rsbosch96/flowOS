import { createHash } from "node:crypto";
import { readFile, readdir, stat } from "node:fs/promises";
import { relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

function sha256(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

function safeRelativePath(root, path) {
  const value = relative(root, path);
  if (!value || value.startsWith(`..${sep}`) || value === "..") throw new Error("Artifact path escapes its root.");
  return value.split(sep).join("/");
}

async function walk(root, directory = root) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];
  for (const entry of entries.sort((left, right) => left.name.localeCompare(right.name))) {
    const fullPath = resolve(directory, entry.name);
    if (entry.isSymbolicLink()) throw new Error("Backup artifacts may not contain symbolic links.");
    if (entry.isDirectory()) files.push(...await walk(root, fullPath));
    else if (entry.isFile()) files.push(fullPath);
    else throw new Error("Backup artifact contains an unsupported filesystem entry.");
  }
  return files;
}

export async function createArtifactInventory(rootDirectory) {
  const root = resolve(rootDirectory);
  const rootState = await stat(root).catch(() => null);
  if (!rootState?.isDirectory()) throw new Error("Backup artifact directory is missing.");

  const files = await walk(root);
  const entries = [];
  for (const path of files.sort((left, right) => safeRelativePath(root, left).localeCompare(safeRelativePath(root, right)))) {
    const bytes = await readFile(path);
    entries.push({ path: safeRelativePath(root, path), bytes: bytes.byteLength, sha256: sha256(bytes) });
  }
  const fingerprintSha256 = sha256(entries.map((entry) => `${entry.path}\n${entry.bytes}\n${entry.sha256}\n`).join(""));
  return { format: "flowos-artifact-inventory", formatVersion: 1, entries, fingerprintSha256 };
}

export async function verifyArtifactInventory(rootDirectory, expectedInventory) {
  if (expectedInventory?.format !== "flowos-artifact-inventory" || expectedInventory?.formatVersion !== 1 || !Array.isArray(expectedInventory.entries)) {
    throw new Error("Backup artifact inventory is invalid.");
  }
  const actual = await createArtifactInventory(rootDirectory);
  const expected = JSON.stringify(expectedInventory.entries);
  const received = JSON.stringify(actual.entries);
  if (expected !== received || expectedInventory.fingerprintSha256 !== actual.fingerprintSha256) {
    throw new Error("Backup artifact checksum verification failed.");
  }
  return { status: "match", fileCount: actual.entries.length, fingerprintSha256: actual.fingerprintSha256 };
}

async function runCli() {
  const [mode, first, second] = process.argv.slice(2);
  if (!mode) throw new Error("Usage: node scripts/operations/hash-backup-artifacts.mjs <artifact-directory> or --verify <artifact-directory> <inventory.json>");
  if (mode === "--verify") {
    if (!first || !second) throw new Error("Verification requires an artifact directory and inventory file.");
    const inventory = JSON.parse(await readFile(resolve(second), "utf8"));
    process.stdout.write(`${JSON.stringify(await verifyArtifactInventory(first, inventory), null, 2)}\n`);
    return;
  }
  process.stdout.write(`${JSON.stringify(await createArtifactInventory(mode), null, 2)}\n`);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  runCli().catch((error) => {
    process.stderr.write(`Backup artifact operation failed: ${error instanceof Error ? error.message : "unknown error"}\n`);
    process.exitCode = 2;
  });
}
