import { spawn } from "node:child_process";
import { mkdir } from "node:fs/promises";
import { resolve } from "node:path";

const protectedProjects = new Set(["ivifmemxvgglvnnarubt", "lkmzwhbbffppyiiiyswk"]);
export function assertSourceProject(projectId) {
  if (!/^[a-z0-9-]{8,80}$/i.test(projectId ?? "") || protectedProjects.has(projectId)) {
    throw new Error("Database backup source must be an explicitly approved source project.");
  }
}
export function buildPgDumpArgs({ output, host, port = "5432", database = "postgres", schemas = ["public", "auth", "storage", "supabase_migrations"] }) {
  if (!output || !host) throw new Error("Explicit output and host are required.");
  return ["--format=custom", "--no-owner", "--no-acl", `--file=${resolve(output)}`, `--host=${host}`, `--port=${port}`, `--dbname=${database}`, ...schemas.flatMap((schema) => ["--schema", schema])];
}
export function validateDatabaseArtifact(manifest) {
  if (!manifest || manifest.format !== "custom" || !Array.isArray(manifest.schemas) || !manifest.schemas.includes("public")) throw new Error("Complete custom-format database artifact manifest is required.");
  if (!manifest.sha256 || !/^[a-f0-9]{64}$/i.test(manifest.sha256)) throw new Error("Database artifact SHA-256 is required.");
  return { status: "complete", format: "custom" };
}
export async function runDatabaseBackup({ projectId, output, host, execute = false, env = process.env }) {
  assertSourceProject(projectId);
  if (!execute || env.BR1_ALLOW_REMOTE_BACKUP !== "1") throw new Error("Database backup is disabled until BR1.2B approval (set execute and BR1_ALLOW_REMOTE_BACKUP=1).");
  await mkdir(resolve(output, ".."), { recursive: true });
  return new Promise((resolvePromise, reject) => {
    const child = spawn("pg_dump", buildPgDumpArgs({ output, host }), { stdio: "inherit", env });
    child.on("error", reject); child.on("exit", (code) => code === 0 ? resolvePromise({ status: "created", output }) : reject(new Error(`pg_dump exited with ${code}`)));
  });
}
if (import.meta.url === `file://${process.argv[1]?.replaceAll("\\", "/")}`) console.error("BR1.2A: database execution is disabled; use the exported API only after BR1.2B approval.");
