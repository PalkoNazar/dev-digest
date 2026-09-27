/** Pure-ish helpers for ImportSkillModal. */

export const ACCEPTED_EXTENSIONS = [".md", ".markdown", ".zip"] as const;

/** Largest file the server accepts for a preview (bytes). */
export const MAX_IMPORT_BYTES = 1024 * 1024;

export function isAcceptedFile(name: string): boolean {
  const lower = name.toLowerCase();
  return ACCEPTED_EXTENSIONS.some((ext) => lower.endsWith(ext));
}

/** Read a file as base64 (no data-URL prefix) for the JSON preview request. */
export function fileToBase64(file: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(reader.error ?? new Error("Could not read the file"));
    reader.onload = () => {
      const url = String(reader.result ?? "");
      resolve(url.slice(url.indexOf(",") + 1));
    };
    reader.readAsDataURL(file);
  });
}
