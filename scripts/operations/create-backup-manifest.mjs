import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const sha256Pattern = /^[a-f0-9]{64}$/i;
const backupIdPattern = /^[a-z0-9][a-z0-9._-]{7,159}$/i;
const approvedBuckets = ["company-documents", "company-images"];
const manifestKeys = new Set([
  "format",
  "formatVersion",
  "backupId",
  "createdAt",
  "source",
  "release",
  "migrationLedger",
  "database",
  "storage",
  "integrity",
  "encryption",
  "operator",
  "providerKillSwitch",
  "validation",
]);

function hash(value) {
  return createHash("sha256").update(value).digest("hex");
}

function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === "object") return Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonical(value[key])]));
  return value;
}

function requiredString(value, field) {
  if (typeof value !== "string" || !value.trim()) throw new Error(`Manifest field ${field} is required.`);
  return value.trim();
}

function requiredSha256(value, field) {
  const normalized = requiredString(value, field);
  if (!sha256Pattern.test(normalized)) throw new Error(`Manifest field ${field} must be a SHA-256 checksum.`);
  return normalized.toLowerCase();
}

function normalizeStorage(storage) {
  const buckets = storage?.buckets;
  if (!Array.isArray(buckets) || buckets.length !== approvedBuckets.length) throw new Error("Manifest must include exactly the two approved private Storage buckets.");
  const normalizedBuckets = buckets.map((bucket) => {
    const name = requiredString(bucket?.name, "storage.buckets.name");
    if (!approvedBuckets.includes(name) || bucket?.isPrivate !== true || !Array.isArray(bucket?.objects)) {
      throw new Error("Storage manifest contains an invalid bucket or privacy state.");
    }
    const objects = bucket.objects.map((object) => ({
      path: requiredString(object?.path, "storage object path"),
      bytes: Number.isInteger(object?.bytes) && object.bytes >= 0 ? object.bytes : (() => { throw new Error("Storage object bytes are invalid."); })(),
      sha256: requiredSha256(object?.sha256, "storage object checksum"),
    })).sort((left, right) => left.path.localeCompare(right.path));
    if (bucket.objectCount !== undefined && bucket.objectCount !== objects.length) throw new Error("Storage object count does not match its inventory.");
    return { name, isPrivate: true, objectCount: objects.length, objects };
  }).sort((left, right) => left.name.localeCompare(right.name));
  if (normalizedBuckets.map((bucket) => bucket.name).join(",") !== approvedBuckets.join(",")) throw new Error("Storage manifest has duplicate or missing approved buckets.");
  const objectCount = normalizedBuckets.reduce((total, bucket) => total + bucket.objectCount, 0);
  const objectsFingerprintSha256 = hash(JSON.stringify(canonical(normalizedBuckets)));
  return { buckets: normalizedBuckets, objectCount, objectsFingerprintSha256 };
}

export function buildBackupManifest(input) {
  const backupId = requiredString(input?.backupId, "backupId");
  if (!backupIdPattern.test(backupId)) throw new Error("Backup ID has an unsafe format.");
  const versions = input?.migrationLedger?.versions;
  if (!Array.isArray(versions) || versions.some((version) => typeof version !== "string" || !version.trim())) throw new Error("Migration ledger versions are required.");
  const database = input?.database;
  const storage = normalizeStorage(input?.storage);
  const createdAt = requiredString(input?.createdAt, "createdAt");
  if (Number.isNaN(Date.parse(createdAt))) throw new Error("Backup timestamp is invalid.");

  const manifest = {
    format: "flowos-backup-manifest",
    formatVersion: 1,
    backupId,
    createdAt: new Date(createdAt).toISOString(),
    source: { projectId: requiredString(input?.source?.projectId, "source.projectId"), region: requiredString(input?.source?.region, "source.region") },
    release: { gitCommit: requiredString(input?.release?.gitCommit, "release.gitCommit") },
    migrationLedger: { versions: [...versions].map((version) => version.trim()).sort(), fingerprintSha256: hash([...versions].map((version) => version.trim()).sort().join("\n")) },
    database: {
      artifactId: requiredString(database?.artifactId, "database.artifactId"),
      format: ["logical-dump", "managed-backup-export"].includes(database?.format) ? database.format : (() => { throw new Error("Database artifact format is invalid."); })(),
      sha256: requiredSha256(database?.sha256, "database.sha256"),
      encrypted: database?.encrypted === true,
    },
    storage,
    integrity: { snapshotArtifactId: requiredString(input?.integrity?.snapshotArtifactId, "integrity.snapshotArtifactId"), snapshotSha256: requiredSha256(input?.integrity?.snapshotSha256, "integrity.snapshotSha256") },
    encryption: { atRest: input?.encryption?.atRest === true, algorithm: requiredString(input?.encryption?.algorithm, "encryption.algorithm"), keyReference: requiredString(input?.encryption?.keyReference, "encryption.keyReference") },
    operator: { role: requiredString(input?.operator?.role, "operator.role") },
    providerKillSwitch: { confirmed: input?.providerKillSwitch?.confirmed === true, aiMode: input?.providerKillSwitch?.aiMode },
    validation: { status: input?.validation?.status },
  };
  validateBackupManifest(manifest);
  return manifest;
}

export function validateBackupManifest(manifest) {
  if (manifest?.format !== "flowos-backup-manifest" || manifest?.formatVersion !== 1) throw new Error("Backup manifest format is invalid.");
  if (!manifest || typeof manifest !== "object" || Object.keys(manifest).some((key) => !manifestKeys.has(key))) throw new Error("Backup manifest contains unsupported fields.");
  if (!backupIdPattern.test(manifest.backupId ?? "") || Number.isNaN(Date.parse(manifest.createdAt ?? ""))) throw new Error("Backup manifest identity is invalid.");
  requiredString(manifest.source?.projectId, "source.projectId");
  requiredString(manifest.source?.region, "source.region");
  requiredString(manifest.release?.gitCommit, "release.gitCommit");
  if (!Array.isArray(manifest.migrationLedger?.versions) || !sha256Pattern.test(manifest.migrationLedger?.fingerprintSha256 ?? "")) throw new Error("Backup manifest migration ledger is invalid.");
  if (manifest.database?.encrypted !== true || !["logical-dump", "managed-backup-export"].includes(manifest.database?.format) || !sha256Pattern.test(manifest.database?.sha256 ?? "")) throw new Error("Backup database artifact must be encrypted and checksummed.");
  normalizeStorage(manifest.storage);
  if (!sha256Pattern.test(manifest.integrity?.snapshotSha256 ?? "")) throw new Error("Backup integrity snapshot is invalid.");
  if (manifest.encryption?.atRest !== true || !requiredString(manifest.encryption?.algorithm, "encryption.algorithm") || !requiredString(manifest.encryption?.keyReference, "encryption.keyReference")) throw new Error("Backup encryption metadata is invalid.");
  if (manifest.providerKillSwitch?.confirmed !== true || manifest.providerKillSwitch?.aiMode !== "mock") throw new Error("Backup manifest lacks provider kill-switch confirmation.");
  if (manifest.validation?.status !== "validated") throw new Error("Backup manifest validation status is invalid.");
  requiredString(manifest.operator?.role, "operator.role");
  return true;
}

async function runCli() {
  const [flag, inputPath, outputPath] = process.argv.slice(2);
  if (flag !== "--input" || !inputPath || !outputPath) throw new Error("Usage: node scripts/operations/create-backup-manifest.mjs --input <metadata.json> <manifest.json>");
  const input = JSON.parse(await readFile(resolve(inputPath), "utf8"));
  const manifest = buildBackupManifest(input);
  await writeFile(resolve(outputPath), `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
  process.stdout.write(`${JSON.stringify({ status: "created", backupId: manifest.backupId }, null, 2)}\n`);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  runCli().catch((error) => {
    process.stderr.write(`Backup manifest operation failed: ${error instanceof Error ? error.message : "unknown error"}\n`);
    process.exitCode = 2;
  });
}
