import { createHash } from "node:crypto";
import { mkdir } from "node:fs/promises";
import { resolve } from "node:path";
export const APPROVED_BUCKETS = Object.freeze(["company-documents", "company-images"]);
export function assertStorageProject(projectId) { if (!projectId || !/^[a-z0-9-]{8,80}$/i.test(projectId)) throw new Error("Invalid Storage source project."); }
export function validateStorageKey(bucket, path) { if (!APPROVED_BUCKETS.includes(bucket) || !path || path.includes("..") || path.startsWith("/") || path.includes("\\")) throw new Error("Unsafe Storage bucket/path."); return `${bucket}/${path}`; }
export function checksum(bytes) { return createHash("sha256").update(bytes).digest("hex"); }
export function validateStorageManifest(manifest) {
  if (!manifest || !Array.isArray(manifest.objects) || manifest.objects.length === 0) throw new Error("Complete Storage object manifest is required.");
  for (const object of manifest.objects) {
    validateStorageKey(object.bucket, object.path);
    if (!Number.isInteger(object.byteSize) || object.byteSize < 0) throw new Error("Storage byte size is required.");
    if (!/^[a-f0-9]{64}$/i.test(object.sha256 ?? "")) throw new Error("Storage SHA-256 is required.");
    if (typeof object.tenantId !== "string" || object.tenantId.length === 0) throw new Error("Storage tenant authorization evidence is required.");
  }
  return { status: "complete", objectCount: manifest.objects.length };
}
export async function exportStorage({ projectId, artifactDirectory, execute = false }) { assertStorageProject(projectId); if (!execute) throw new Error("Remote Storage export is disabled until BR1.2B approval."); if (process.env.BR1_ALLOW_REMOTE_BACKUP !== "1") throw new Error("Remote Storage export is disabled."); await mkdir(resolve(artifactDirectory), { recursive: true }); return { status: "requires-approved-supabase-adapter", artifactDirectory }; }
