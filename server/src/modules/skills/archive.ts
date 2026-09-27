import { inflateRawSync } from 'node:zlib';
import { ValidationError } from '../../platform/errors.js';

/**
 * Minimal read-only ZIP reader for skill import. Pure: bytes in, bytes out — it
 * never touches the filesystem and never runs anything.
 *
 * `listZipEntries` reads only the central directory (names + sizes), so the
 * caller can pick the one entry it wants and reject the rest unread;
 * `readZipEntry` inflates exactly that entry, capped at `maxBytes`.
 * Supported: stored (0) and deflate (8). ZIP64, encryption and multi-disk → 422.
 */

export interface ZipEntry {
  name: string;
  method: number;
  compressedSize: number;
  size: number;
  localHeaderOffset: number;
  encrypted: boolean;
}

const EOCD_SIG = 0x06054b50;
const CENTRAL_SIG = 0x02014b50;
const LOCAL_SIG = 0x04034b50;
const EOCD_MIN = 22;
const MAX_COMMENT = 0xffff;

function invalid(msg: string): never {
  throw new ValidationError(`Invalid zip archive: ${msg}`);
}

function findEndOfCentralDirectory(buf: Buffer): number {
  const stop = Math.max(0, buf.length - EOCD_MIN - MAX_COMMENT);
  for (let i = buf.length - EOCD_MIN; i >= stop; i--) {
    if (buf.readUInt32LE(i) === EOCD_SIG) return i;
  }
  return invalid('end of central directory not found');
}

export function listZipEntries(buf: Buffer, maxEntries: number): ZipEntry[] {
  if (buf.length < EOCD_MIN) invalid('file is too small');
  const eocd = findEndOfCentralDirectory(buf);
  const count = buf.readUInt16LE(eocd + 10);
  const cdOffset = buf.readUInt32LE(eocd + 16);
  if (count === 0xffff || cdOffset === 0xffffffff) invalid('ZIP64 is not supported');
  if (count > maxEntries) invalid(`too many entries (${count} > ${maxEntries})`);

  const entries: ZipEntry[] = [];
  let p = cdOffset;
  for (let i = 0; i < count; i++) {
    if (p + 46 > buf.length || buf.readUInt32LE(p) !== CENTRAL_SIG) invalid('corrupt central directory');
    const flags = buf.readUInt16LE(p + 8);
    const nameLen = buf.readUInt16LE(p + 28);
    const extraLen = buf.readUInt16LE(p + 30);
    const commentLen = buf.readUInt16LE(p + 32);
    entries.push({
      name: buf.toString('utf8', p + 46, p + 46 + nameLen),
      method: buf.readUInt16LE(p + 10),
      compressedSize: buf.readUInt32LE(p + 20),
      size: buf.readUInt32LE(p + 24),
      localHeaderOffset: buf.readUInt32LE(p + 42),
      encrypted: (flags & 1) === 1,
    });
    p += 46 + nameLen + extraLen + commentLen;
  }
  return entries;
}

export function readZipEntry(buf: Buffer, entry: ZipEntry, maxBytes: number): Buffer {
  if (entry.encrypted) invalid(`${entry.name} is encrypted`);
  if (entry.size > maxBytes) invalid(`${entry.name} is larger than ${maxBytes} bytes`);
  const h = entry.localHeaderOffset;
  if (h + 30 > buf.length || buf.readUInt32LE(h) !== LOCAL_SIG) invalid('corrupt local header');
  const start = h + 30 + buf.readUInt16LE(h + 26) + buf.readUInt16LE(h + 28);
  const end = start + entry.compressedSize;
  if (end > buf.length) invalid(`${entry.name} is truncated`);
  const data = buf.subarray(start, end);
  if (entry.method === 0) return Buffer.from(data);
  if (entry.method === 8) {
    try {
      // maxOutputLength caps the inflate even if the header lies about `size`.
      return inflateRawSync(data, { maxOutputLength: maxBytes });
    } catch {
      return invalid(`${entry.name} could not be decompressed`);
    }
  }
  return invalid(`${entry.name} uses unsupported compression (method ${entry.method})`);
}
