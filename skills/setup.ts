import { createHash } from "node:crypto";
import { promises as fs } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

type Assistant = "opencode" | "claude" | "gemini" | "codex" | "copilot";
type AdapterKind = "directory" | "file";
type Options = { dryRun: boolean; assistants: Assistant[] };

const ASSISTANTS: Assistant[] = ["opencode", "claude", "gemini", "codex", "copilot"];
const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const timestamp = new Date().toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
const copyMarkerSuffix = ".setup-copy.json";

function usage(): string {
  return "Usage: npx --yes tsx skills/setup.ts (--all | --opencode | --claude | --gemini | --codex | --copilot) [--dry-run]";
}

function parseArgs(args: string[]): Options {
  let dryRun = false;
  let all = false;
  const selected = new Set<Assistant>();
  for (const argument of args) {
    if (argument === "--dry-run") dryRun = true;
    else if (argument === "--all") all = true;
    else if (argument.startsWith("--") && ASSISTANTS.includes(argument.slice(2) as Assistant)) selected.add(argument.slice(2) as Assistant);
    else throw new Error(`Unknown flag: ${argument}`);
  }
  if (all && selected.size > 0) throw new Error("--all cannot be combined with individual assistant flags");
  const assistants = all ? [...ASSISTANTS] : ASSISTANTS.filter((assistant) => selected.has(assistant));
  if (assistants.length === 0) throw new Error("Select at least one assistant or use --all");
  return { dryRun, assistants };
}

function relative(file: string): string {
  return path.relative(repositoryRoot, file).replaceAll("\\", "/") || ".";
}

function isWithin(root: string, candidate: string): boolean {
  const result = path.relative(root, candidate);
  return result === "" || (!result.startsWith("..") && !path.isAbsolute(result));
}

function assertWithin(candidate: string, label: string): void {
  if (!isWithin(repositoryRoot, path.resolve(candidate))) throw new Error(`${label} escapes repository root: ${candidate}`);
}

function normalizeComparable(candidate: string): string {
  let normalized = path.resolve(candidate.replace(/^\\\\\?\\/, ""));
  if (process.platform === "win32") normalized = normalized.toLowerCase();
  return normalized;
}

async function pathState(candidate: string): Promise<"missing" | "link" | "file" | "directory" | "other"> {
  try {
    const stat = await fs.lstat(candidate);
    if (stat.isSymbolicLink()) return "link";
    if (stat.isFile()) return "file";
    if (stat.isDirectory()) return "directory";
    return "other";
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return "missing";
    throw error;
  }
}

async function existingAncestor(candidate: string): Promise<string> {
  let current = candidate;
  while (true) {
    if ((await pathState(current)) !== "missing") return current;
    const parent = path.dirname(current);
    if (parent === current) throw new Error(`No existing ancestor for ${candidate}`);
    current = parent;
  }
}

async function assertPhysicalParentWithin(candidate: string): Promise<void> {
  const rootReal = normalizeComparable(await fs.realpath(repositoryRoot));
  const ancestorReal = normalizeComparable(await fs.realpath(await existingAncestor(path.dirname(candidate))));
  if (!isWithin(rootReal, ancestorReal)) throw new Error(`Existing parent resolves outside repository root: ${relative(candidate)}`);
}

async function assertPhysicalSourceWithin(candidate: string): Promise<void> {
  const rootReal = normalizeComparable(await fs.realpath(repositoryRoot));
  const sourceReal = normalizeComparable(await fs.realpath(candidate));
  if (!isWithin(rootReal, sourceReal)) throw new Error(`Canonical source resolves outside repository root: ${relative(candidate)}`);
}

async function linkPointsTo(destination: string, source: string): Promise<boolean> {
  const rawTarget = await fs.readlink(destination);
  const resolved = path.isAbsolute(rawTarget) ? rawTarget : path.resolve(path.dirname(destination), rawTarget);
  return normalizeComparable(resolved) === normalizeComparable(source);
}

async function ensureParent(destination: string, dryRun: boolean): Promise<void> {
  const parent = path.dirname(destination);
  const state = await pathState(parent);
  if (state === "missing") {
    console.log(`${dryRun ? "would create" : "create"} directory ${relative(parent)}`);
    if (!dryRun) await fs.mkdir(parent, { recursive: true });
  } else if (state !== "directory") throw new Error(`Adapter parent must be an ordinary directory: ${relative(parent)}`);
}

async function uniqueBackupPath(destination: string): Promise<string> {
  const base = `${destination}.backup-${timestamp}`;
  let candidate = base;
  let suffix = 1;
  while ((await pathState(candidate)) !== "missing") candidate = `${base}-${suffix++}`;
  assertWithin(candidate, "Backup path");
  return candidate;
}

async function backupOrdinary(destination: string, dryRun: boolean): Promise<void> {
  const backup = dryRun ? `${destination}.backup-<timestamp>` : await uniqueBackupPath(destination);
  console.log(`${dryRun ? "would back up" : "back up"} ${relative(destination)} -> ${relative(backup)}`);
  if (!dryRun) await fs.rename(destination, backup);
}

function contentHash(content: Buffer): string {
  return createHash("sha256").update(content).digest("hex");
}

async function isManagedCopy(destination: string, source: string): Promise<boolean> {
  const marker = `${destination}${copyMarkerSuffix}`;
  if ((await pathState(destination)) !== "file" || (await pathState(marker)) !== "file") return false;
  try {
    const record = JSON.parse(await fs.readFile(marker, "utf8")) as Record<string, unknown>;
    const sourceContent = await fs.readFile(source);
    const destinationContent = await fs.readFile(destination);
    return record.source === relative(source) && record.destination === relative(destination)
      && record.sha256 === contentHash(sourceContent) && sourceContent.equals(destinationContent);
  } catch {
    return false;
  }
}

async function writeCopyAdapter(destination: string, source: string): Promise<void> {
  const marker = `${destination}${copyMarkerSuffix}`;
  if ((await pathState(marker)) !== "missing") await backupOrdinary(marker, false);
  const content = await fs.readFile(source);
  await fs.copyFile(source, destination);
  await fs.writeFile(marker, `${JSON.stringify({ destination: relative(destination), source: relative(source), sha256: contentHash(content) }, null, 2)}\n`, "utf8");
}

async function createAdapter(destination: string, source: string, kind: AdapterKind, dryRun: boolean): Promise<void> {
  assertWithin(destination, "Adapter destination");
  assertWithin(source, "Canonical source");
  await assertPhysicalParentWithin(destination);
  await assertPhysicalSourceWithin(source);
  const sourceStat = await fs.stat(source);
  if ((kind === "directory" && !sourceStat.isDirectory()) || (kind === "file" && !sourceStat.isFile())) throw new Error(`Canonical source has wrong type: ${relative(source)}`);

  let state = await pathState(destination);
  if (state === "link" && await linkPointsTo(destination, source)) {
    console.log(`unchanged ${relative(destination)} (correct link)`);
    return;
  }
  if (kind === "file" && state === "file" && await isManagedCopy(destination, source)) {
    console.log(`unchanged ${relative(destination)} (managed copy fallback)`);
    return;
  }

  await ensureParent(destination, dryRun);
  if (kind === "file") {
    const marker = `${destination}${copyMarkerSuffix}`;
    const markerState = await pathState(marker);
    if (markerState === "link") {
      console.log(`${dryRun ? "would remove" : "remove"} stale copy marker link ${relative(marker)}`);
      if (!dryRun) await fs.unlink(marker);
    } else if (markerState === "file" || markerState === "directory") await backupOrdinary(marker, dryRun);
    else if (markerState === "other") throw new Error(`Refusing unsupported copy marker object: ${relative(marker)}`);
  }

  state = await pathState(destination);
  if (state === "link") {
    const rawTarget = await fs.readlink(destination);
    console.log(`${dryRun ? "would replace" : "replace"} wrong link ${relative(destination)} -> ${rawTarget}`);
    if (!dryRun) await fs.unlink(destination);
  } else if (state === "file" || state === "directory") await backupOrdinary(destination, dryRun);
  else if (state === "other") throw new Error(`Refusing unsupported filesystem object: ${relative(destination)}`);

  console.log(`${dryRun ? "would link" : "link"} ${relative(destination)} -> ${relative(source)}`);
  if (dryRun) return;
  const target = process.platform === "win32" ? source : path.relative(path.dirname(destination), source) || ".";
  try {
    const linkType = kind === "directory" ? process.platform === "win32" ? "junction" : "dir" : "file";
    await fs.symlink(target, destination, linkType);
  } catch (error) {
    if (kind !== "file" || process.platform !== "win32" || (error as NodeJS.ErrnoException).code !== "EPERM") throw error;
    console.log(`file symlink unavailable for ${relative(destination)}; using managed copy fallback`);
    await writeCopyAdapter(destination, source);
  }
}

async function configureAssistant(assistant: Assistant, dryRun: boolean): Promise<void> {
  const skills = path.join(repositoryRoot, "skills");
  const agents = path.join(repositoryRoot, "AGENTS.md");
  console.log(`[${assistant}]`);
  if (assistant === "opencode") {
    await createAdapter(path.join(repositoryRoot, ".opencode", "skills"), skills, "directory", dryRun);
  } else if (assistant === "claude") {
    await createAdapter(path.join(repositoryRoot, ".claude", "skills"), skills, "directory", dryRun);
    await createAdapter(path.join(repositoryRoot, "CLAUDE.md"), agents, "file", dryRun);
  } else if (assistant === "gemini") {
    await createAdapter(path.join(repositoryRoot, ".gemini", "skills"), skills, "directory", dryRun);
    await createAdapter(path.join(repositoryRoot, "GEMINI.md"), agents, "file", dryRun);
    console.log("note Gemini AGENTS-to-GEMINI linking is a project adapter convention");
  } else if (assistant === "codex") {
    await createAdapter(path.join(repositoryRoot, ".agents", "skills"), skills, "directory", dryRun);
    console.log("note Codex uses the root AGENTS.md instructions natively");
  } else {
    await createAdapter(path.join(repositoryRoot, ".github", "skills"), skills, "directory", dryRun);
    await createAdapter(path.join(repositoryRoot, ".github", "copilot-instructions.md"), agents, "file", dryRun);
  }
}

async function main(): Promise<void> {
  const options = parseArgs(process.argv.slice(2));
  for (const assistant of options.assistants) await configureAssistant(assistant, options.dryRun);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  console.error(usage());
  process.exitCode = 1;
});
