import { promises as fs } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const START = "<!-- skill-sync:start -->";
const END = "<!-- skill-sync:end -->";
const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
const skillsRoot = path.join(repositoryRoot, "skills");
const agentsFile = path.join(repositoryRoot, "AGENTS.md");

type Skill = { name: string; actions: string[] };

function usage(): string {
  return "Usage: npx --yes tsx skills/skill-sync/assets/sync.ts [--dry-run]";
}

function parseArgs(args: string[]): { dryRun: boolean } {
  if (args.some((argument) => argument !== "--dry-run")) throw new Error(`Unknown argument: ${args.find((argument) => argument !== "--dry-run")}`);
  if (args.filter((argument) => argument === "--dry-run").length > 1) throw new Error("--dry-run may be provided only once");
  return { dryRun: args.includes("--dry-run") };
}

function parseQuotedString(raw: string, field: string, file: string): string {
  const value = raw.trim();
  if (value.startsWith('"') && value.endsWith('"')) {
    try {
      const parsed: unknown = JSON.parse(value);
      if (typeof parsed === "string") return parsed;
    } catch {
      // Use the common diagnostic below.
    }
  }
  throw new Error(`${file}: ${field} must be a double-quoted string`);
}

function extractField(lines: string[], key: string, file: string): string {
  const matches = lines.filter((line) => line.startsWith(`${key}:`));
  if (matches.length !== 1) throw new Error(`${file}: expected exactly one ${key} field`);
  return parseQuotedString(matches[0].slice(key.length + 1), key, file);
}

function parseSkill(content: string, file: string): Skill {
  const lines = content.replace(/\r\n/g, "\n").split("\n");
  if (lines[0] !== "---") throw new Error(`${file}: missing opening frontmatter delimiter`);
  const end = lines.indexOf("---", 1);
  if (end < 0) throw new Error(`${file}: missing closing frontmatter delimiter`);
  const frontmatter = lines.slice(1, end);

  if (frontmatter.some((line) => /^allowed-tools\s*:/.test(line.trim()))) throw new Error(`${file}: allowed-tools is forbidden`);
  if (frontmatter.some((line) => /^\s*-\s+/.test(line))) throw new Error(`${file}: YAML arrays are forbidden`);

  const name = extractField(frontmatter, "name", file).trim();
  const description = extractField(frontmatter, "description", file);
  const license = extractField(frontmatter, "license", file);
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(name)) throw new Error(`${file}: name must be lowercase kebab-case`);
  if (!description.startsWith("Trigger: ") || description.length > 250) throw new Error(`${file}: description must be trigger-first and at most 250 characters`);
  if (license !== "Apache-2.0") throw new Error(`${file}: license must be Apache-2.0`);

  const metadataIndex = frontmatter.findIndex((line) => line === "metadata:");
  if (metadataIndex < 0) throw new Error(`${file}: missing metadata mapping`);
  const metadataLines: string[] = [];
  for (let index = metadataIndex + 1; index < frontmatter.length; index += 1) {
    const line = frontmatter[index];
    if (line.trim() === "") continue;
    if (!line.startsWith("  ")) break;
    if (/^\s{4,}/.test(line)) throw new Error(`${file}: nested metadata is forbidden`);
    metadataLines.push(line.slice(2));
  }

  const expectedMetadata = ["author", "version", "scope", "auto_invoke"];
  const actualMetadata = metadataLines.map((line) => line.slice(0, line.indexOf(":")));
  if (actualMetadata.length !== expectedMetadata.length || actualMetadata.some((key) => !expectedMetadata.includes(key))) {
    throw new Error(`${file}: metadata must contain only ${expectedMetadata.join(", ")}`);
  }
  if (extractField(metadataLines, "author", file) !== "maxdev") throw new Error(`${file}: metadata.author must be maxdev`);
  if (extractField(metadataLines, "version", file) !== "1.0.0") throw new Error(`${file}: metadata.version must be 1.0.0`);
  if (extractField(metadataLines, "scope", file) !== "root") throw new Error(`${file}: metadata.scope must be root`);

  const actions = extractField(metadataLines, "auto_invoke", file).split(";").map((action) => action.trim());
  if (actions.some((action) => action.length < 4 || /^(true|false|yes|no|on|off)$/i.test(action) || /[|`\r\n]/.test(action))) {
    throw new Error(`${file}: auto_invoke must contain safe, meaningful action text`);
  }
  if (new Set(actions).size !== actions.length) throw new Error(`${file}: auto_invoke contains duplicate actions`);
  return { name, actions };
}

async function loadSkills(): Promise<Skill[]> {
  const entries = await fs.readdir(skillsRoot, { withFileTypes: true });
  const directories = entries.filter((entry) => entry.isDirectory()).map((entry) => entry.name).sort((a, b) => a.localeCompare(b, "en"));
  const skills: Skill[] = [];
  const errors: string[] = [];
  for (const directory of directories) {
    const skillFile = path.join(skillsRoot, directory, "SKILL.md");
    const relativeFile = path.relative(repositoryRoot, skillFile).replaceAll("\\", "/");
    try {
      const skill = parseSkill(await fs.readFile(skillFile, "utf8"), relativeFile);
      if (skill.name !== directory) throw new Error(`${relativeFile}: name must match directory ${directory}`);
      skills.push(skill);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") errors.push(error instanceof Error ? error.message : String(error));
    }
  }
  const names = skills.map((skill) => skill.name);
  const duplicates = names.filter((name, index) => names.indexOf(name) !== index);
  if (duplicates.length > 0) errors.push(`Duplicate skill names: ${duplicates.join(", ")}`);
  if (errors.length > 0) throw new Error(`Skill metadata validation failed:\n- ${errors.join("\n- ")}`);
  return skills;
}

function renderBlock(skills: Skill[], eol: string): string {
  const rows = skills.flatMap((skill) => skill.actions.map((action) => ({ action, name: skill.name })))
    .sort((left, right) => left.action.localeCompare(right.action, "en") || left.name.localeCompare(right.name, "en"));
  return [
    START,
    "## Auto-invoked project skills",
    "",
    "Generated from canonical `skills/*/SKILL.md` metadata. Do not edit this block manually.",
    "",
    "| Trigger | Load |",
    "| --- | --- |",
    ...rows.map(({ action, name }) => `| ${action} | \`skills/${name}/SKILL.md\` |`),
    END,
  ].join(eol);
}

function replaceManagedBlock(content: string, block: string): string {
  const starts = content.split(START).length - 1;
  const ends = content.split(END).length - 1;
  if (starts !== 1 || ends !== 1) throw new Error("AGENTS.md must contain exactly one complete skill-sync block");
  const start = content.indexOf(START);
  const endStart = content.indexOf(END);
  if (start + START.length > endStart) throw new Error("AGENTS.md skill-sync markers are out of order");
  return `${content.slice(0, start)}${block}${content.slice(endStart + END.length)}`;
}

async function main(): Promise<void> {
  const { dryRun } = parseArgs(process.argv.slice(2));
  const skills = await loadSkills();
  const content = await fs.readFile(agentsFile, "utf8");
  const eol = content.includes("\r\n") ? "\r\n" : "\n";
  const next = replaceManagedBlock(content, renderBlock(skills, eol));
  console.log(`Validated ${skills.length} project skills.`);
  if (next === content) console.log("unchanged AGENTS.md");
  else if (dryRun) console.log("would update AGENTS.md");
  else {
    await fs.writeFile(agentsFile, next, "utf8");
    console.log("updated AGENTS.md");
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  console.error(usage());
  process.exitCode = 1;
});
