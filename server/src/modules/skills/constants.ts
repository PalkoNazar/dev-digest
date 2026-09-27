/** Constants for the skills module. */

/** Version a skill starts at (a row in `skill_versions` is written for it). */
export const INITIAL_SKILL_VERSION = 1;

/** Largest upload accepted by the import preview (decoded bytes). */
export const IMPORT_MAX_FILE_BYTES = 1024 * 1024;

/** Zip-bomb guards: entry count, and the uncompressed size of the one entry we inflate. */
export const IMPORT_MAX_ARCHIVE_ENTRIES = 200;
export const IMPORT_MAX_CORE_BYTES = 200 * 1024;

/** Window of the Stats tab (runs / findings of the last N days). */
export const STATS_WINDOW_DAYS = 30;

/** The file that holds a skill's core inside an archive (Claude-style skill folder). */
export const SKILL_CORE_FILENAME = 'skill.md';
