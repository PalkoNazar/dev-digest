import {
  SKILL_BODY_MAX,
  SKILL_DESCRIPTION_MAX,
  SkillName,
  SkillType,
  type SkillImportPreview,
} from '@devdigest/shared';
import { ValidationError } from '../../platform/errors.js';
import { listZipEntries, readZipEntry, type ZipEntry } from './archive.js';
import {
  IMPORT_MAX_ARCHIVE_ENTRIES,
  IMPORT_MAX_CORE_BYTES,
  IMPORT_MAX_FILE_BYTES,
  SKILL_CORE_FILENAME,
} from './constants.js';

/**
 * Pure helpers for the skills module: markdown/frontmatter parsing and the
 * import preview. No DB, no fs — an import is bytes in, a preview out.
 */

export interface ParsedSkillMarkdown {
  /** Top-level `key: value` pairs of the YAML frontmatter (strings only). */
  meta: Record<string, string>;
  body: string;
  hasFrontmatter: boolean;
}

function unquote(v: string): string {
  const t = v.trim();
  if (t.length >= 2 && (t[0] === '"' || t[0] === "'") && t.at(-1) === t[0]) return t.slice(1, -1);
  return t;
}

/**
 * Split `---\n…\n---` frontmatter from the body. Reads only top-level scalar
 * keys (plus `>`/`|` block scalars); nested maps are skipped. Enough for the
 * `name` / `description` / `type` of a skill without a YAML dependency.
 */
export function parseSkillMarkdown(text: string): ParsedSkillMarkdown {
  const src = text.replace(/^﻿/, '').replace(/\r\n/g, '\n');
  const m = /^---\n([\s\S]*?)\n---(?:\n|$)/.exec(src);
  if (!m) return { meta: {}, body: src.trim(), hasFrontmatter: false };

  const meta: Record<string, string> = {};
  const lines = m[1]!.split('\n');
  for (let i = 0; i < lines.length; i++) {
    const kv = /^([A-Za-z_][\w-]*):\s*(.*)$/.exec(lines[i]!);
    if (!kv) continue;
    const key = kv[1]!;
    const raw = kv[2]!.trim();
    if (raw === '>' || raw === '|' || raw === '>-' || raw === '|-') {
      const block: string[] = [];
      while (i + 1 < lines.length && /^\s+\S/.test(lines[i + 1]!)) block.push(lines[++i]!.trim());
      meta[key] = block.join(raw.startsWith('>') ? ' ' : '\n');
    } else if (raw !== '') {
      meta[key] = unquote(raw);
    }
  }
  return { meta, body: src.slice(m[0].length).trim(), hasFrontmatter: true };
}

/** Best-effort kebab-case slug that satisfies `SkillName`. */
export function toSkillName(raw: string): string {
  const slug = raw
    .toLowerCase()
    .replace(/\.(md|zip)$/, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 64)
    .replace(/-+$/, '');
  return SkillName.safeParse(slug).success ? slug : 'imported-skill';
}

function baseName(path: string): string {
  return path.split('/').filter(Boolean).at(-1) ?? path;
}

function isDir(e: ZipEntry): boolean {
  return e.name.endsWith('/');
}

/**
 * The skill's core inside an archive: `SKILL.md` at the root or one folder deep
 * (the usual `my-skill/SKILL.md` layout), else the archive's only `.md` file.
 */
export function pickCoreEntry(entries: ZipEntry[]): ZipEntry | undefined {
  const files = entries.filter((e) => !isDir(e) && !e.name.startsWith('__MACOSX/'));
  const core = files
    .filter((e) => baseName(e.name).toLowerCase() === SKILL_CORE_FILENAME)
    .filter((e) => e.name.split('/').length <= 2)
    .sort((a, b) => a.name.split('/').length - b.name.split('/').length);
  if (core[0]) return core[0];
  const md = files.filter((e) => e.name.toLowerCase().endsWith('.md'));
  return md.length === 1 ? md[0] : undefined;
}

/**
 * Turn an uploaded `.md` / `.zip` into a preview of the skill it would create.
 * Stores nothing. From an archive only the core markdown entry is inflated;
 * every other entry is reported in `ignored_files` and never read.
 */
export function buildImportPreview(filename: string, bytes: Buffer): SkillImportPreview {
  if (bytes.length === 0) throw new ValidationError('The file is empty');
  if (bytes.length > IMPORT_MAX_FILE_BYTES) {
    throw new ValidationError(`The file is larger than ${IMPORT_MAX_FILE_BYTES / 1024} KB`);
  }
  const lower = filename.toLowerCase();
  let text: string;
  let sourceFile = baseName(filename);
  let ignored: string[] = [];

  if (lower.endsWith('.zip')) {
    const entries = listZipEntries(bytes, IMPORT_MAX_ARCHIVE_ENTRIES);
    const core = pickCoreEntry(entries);
    if (!core) {
      throw new ValidationError('No SKILL.md (or single .md file) found in the archive');
    }
    text = readZipEntry(bytes, core, IMPORT_MAX_CORE_BYTES).toString('utf8');
    sourceFile = `${baseName(filename)} → ${core.name}`;
    ignored = entries
      .filter((e) => e !== core && !isDir(e) && !e.name.startsWith('__MACOSX/'))
      .map((e) => e.name);
  } else if (lower.endsWith('.md') || lower.endsWith('.markdown')) {
    text = bytes.toString('utf8');
  } else {
    throw new ValidationError('Upload a .md file or a .zip archive');
  }

  const parsed = parseSkillMarkdown(text);
  const warnings: string[] = [];
  if (parsed.body.length === 0) throw new ValidationError('The skill body is empty');
  if (parsed.body.length > SKILL_BODY_MAX) {
    throw new ValidationError(`The skill body is longer than ${SKILL_BODY_MAX} characters`);
  }

  const heading = /^#\s+(.+)$/m.exec(parsed.body)?.[1];
  const coreDir = sourceFile.includes('→') ? sourceFile.split('→')[1]!.trim().split('/') : [];
  const nameSource =
    parsed.meta.name ?? (coreDir.length > 1 ? coreDir[0]! : undefined) ?? heading ?? filename;
  const name = toSkillName(nameSource);
  if (!parsed.meta.name) warnings.push(`No "name" in frontmatter — derived "${name}".`);

  let description = (parsed.meta.description ?? '').trim();
  if (!description) {
    warnings.push('No description — write one as a directive before enabling the skill.');
  } else if (description.length > SKILL_DESCRIPTION_MAX) {
    description = description.slice(0, SKILL_DESCRIPTION_MAX);
    warnings.push(`Description truncated to ${SKILL_DESCRIPTION_MAX} characters.`);
  }

  const typeParsed = SkillType.safeParse(parsed.meta.type);
  const type = typeParsed.success ? typeParsed.data : 'custom';

  if (ignored.length > 0) {
    warnings.push(
      `${ignored.length} other file(s) in the archive were ignored — skills are text only; ` +
        'nothing is extracted or executed.',
    );
    const referenced = ignored.filter((f) => parsed.body.includes(baseName(f)));
    if (referenced.length > 0) {
      warnings.push(
        `The body refers to files that are not imported (${referenced.join(', ')}); ` +
          'the agent will only see this text.',
      );
    }
  }
  if (/```(?:bash|sh|shell|zsh|powershell|python)\b/i.test(parsed.body)) {
    warnings.push('The body contains shell/script code blocks — they are prompt text only, never run.');
  }

  return {
    name,
    description,
    type,
    body: parsed.body,
    source_file: sourceFile,
    ignored_files: ignored,
    warnings,
  };
}

