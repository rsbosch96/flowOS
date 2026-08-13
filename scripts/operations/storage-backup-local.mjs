import { cp, lstat, mkdir, readFile, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createArtifactInventory, verifyArtifactInventory } from "./hash-backup-artifacts.mjs";
import { RECOVERY_CONFIRMATION, assertSafeRecoveryTarget } from "./recovery-safety.mjs";

export const recoveryStorageBuckets = Object.freeze(["company-documents", "company-images"]);

async function directoryExists(path) {
  return (await lstat(path).catch(() => null))?.isDirectory() ?? false;
}

async function assertStorageLayout(root) {
  for (const bucket of recoveryStorageBuckets) {
    if (!await directoryExists(join(root, bucket))) throw new Error("Storage artifact is missing a required private bucket.");
  }
}

export async function createStorageInventory(storageDirectory) {
  const root = resolve(storageDirectory);
  await assertStorageLayout(root);
  const buckets = [];
  for (const name of recoveryStorageBuckets) {
    const inventory = await createArtifactInventory(join(root, name));
    buckets.push({ name, isPrivate: true, objectCount: inventory.entries.length, objects: inventory.entries });
  }
  const objectCount = buckets.reduce((total, bucket) => total + bucket.objectCount, 0);
  return { format: "flowos-storage-artifact-inventory", formatVersion: 1, buckets, objectCount };
}

export async function exportStorageFixture({ sourceDirectory, artifactDirectory }) {
  const source = resolve(sourceDirectory);
  const artifact = resolve(artifactDirectory);
  await assertStorageLayout(source);
  if (await lstat(artifact).catch(() => null)) throw new Error("Storage artifact destination already exists.");

  const storage = join(artifact, "storage");
  await mkdir(storage, { recursive: true });
  for (const bucket of recoveryStorageBuckets) {
    await cp(join(source, bucket), join(storage, bucket), { recursive: true, errorOnExist: true, force: false, verbatimSymlinks: false });
  }
  const inventory = await createStorageInventory(storage);
  await writeFile(join(artifact, "storage-inventory.json"), `${JSON.stringify(inventory, null, 2)}\n`, "utf8");
  return inventory;
}

export async function verifyStorageArtifact({ artifactDirectory }) {
  const artifact = resolve(artifactDirectory);
  const expected = JSON.parse(await readFile(join(artifact, "storage-inventory.json"), "utf8"));
  const actual = await createStorageInventory(join(artifact, "storage"));
  if (JSON.stringify(expected) !== JSON.stringify(actual)) throw new Error("Storage backup artifact checksum verification failed.");
  return { status: "match", objectCount: actual.objectCount };
}

export async function restoreStorageFixture({ artifactDirectory, targetDirectory, targetProjectId, environmentType, confirmation, overwrite = false }) {
  assertSafeRecoveryTarget({ targetProjectId, environmentType, confirmation });
  const artifact = resolve(artifactDirectory);
  const target = resolve(targetDirectory);
  const expected = JSON.parse(await readFile(join(artifact, "storage-inventory.json"), "utf8"));
  if (expected?.format !== "flowos-storage-artifact-inventory" || expected?.formatVersion !== 1) throw new Error("Storage restore inventory is invalid.");
  await assertStorageLayout(join(artifact, "storage"));

  for (const bucket of recoveryStorageBuckets) {
    const destination = join(target, bucket);
    if (await lstat(destination).catch(() => null)) {
      if (!overwrite) throw new Error("Storage restore refuses to overwrite existing bucket data.");
    }
  }

  await mkdir(target, { recursive: true });
  for (const bucket of recoveryStorageBuckets) {
    await cp(join(artifact, "storage", bucket), join(target, bucket), { recursive: true, force: overwrite, errorOnExist: !overwrite, verbatimSymlinks: false });
  }
  const actual = await createStorageInventory(target);
  if (JSON.stringify(expected) !== JSON.stringify(actual)) throw new Error("Storage restore checksum verification failed.");
  return { status: "restored", objectCount: actual.objectCount };
}

async function runCli() {
  const [command, first, second, ...flags] = process.argv.slice(2);
  if (command === "export") {
    if (!first || !second) throw new Error("Usage: storage-backup-local.mjs export <source-directory> <artifact-directory>");
    process.stdout.write(`${JSON.stringify(await exportStorageFixture({ sourceDirectory: first, artifactDirectory: second }), null, 2)}\n`);
    return;
  }
  if (command === "verify") {
    if (!first) throw new Error("Usage: storage-backup-local.mjs verify <artifact-directory>");
    process.stdout.write(`${JSON.stringify(await verifyStorageArtifact({ artifactDirectory: first }), null, 2)}\n`);
    return;
  }
  if (command === "restore") {
    const targetProjectId = flags[flags.indexOf("--target-project") + 1];
    const confirmation = flags[flags.indexOf("--confirm") + 1];
    if (!first || !second) throw new Error("Usage: storage-backup-local.mjs restore <artifact-directory> <target-directory> --target-project <recovery-project-id> --confirm <confirmation>");
    process.stdout.write(`${JSON.stringify(await restoreStorageFixture({ artifactDirectory: first, targetDirectory: second, targetProjectId, environmentType: "recovery", confirmation, overwrite: flags.includes("--approved-overwrite") }), null, 2)}\n`);
    return;
  }
  throw new Error("Use export, verify or restore. Restore requires ENVIRONMENT_TYPE=recovery and explicit confirmation.");
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  runCli().catch((error) => {
    process.stderr.write(`Local Storage recovery operation failed: ${error instanceof Error ? error.message : "unknown error"}\n`);
    process.exitCode = 2;
  });
}

export { RECOVERY_CONFIRMATION, verifyArtifactInventory };
