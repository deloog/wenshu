import { deflateRawSync, inflateRawSync, crc32 } from "node:zlib";

export interface ZipEntry {
  readonly path: string;
  readonly bytes: Uint8Array;
}

export interface ParsedZipEntry {
  readonly path: string;
  readonly bytes: Uint8Array;
}

const LOCAL_HEADER_SIGNATURE = 0x04034b50;
const CENTRAL_DIRECTORY_SIGNATURE = 0x02014b50;
const EOCD_SIGNATURE = 0x06054b50;

const VERSION_NEEDED = 20;
const UTF8_FLAG = 0x0800;

function writeUInt16(value: number): Uint8Array {
  const buffer = new Uint8Array(2);
  const view = new DataView(buffer.buffer);
  view.setUint16(0, value, true);
  return buffer;
}

function writeUInt32(value: number): Uint8Array {
  const buffer = new Uint8Array(4);
  const view = new DataView(buffer.buffer);
  view.setUint32(0, value, true);
  return buffer;
}

function readUInt16(buffer: Uint8Array, offset: number): number {
  const view = new DataView(buffer.buffer, buffer.byteOffset, buffer.byteLength);
  return view.getUint16(offset, true);
}

function readUInt32(buffer: Uint8Array, offset: number): number {
  const view = new DataView(buffer.buffer, buffer.byteOffset, buffer.byteLength);
  return view.getUint32(offset, true);
}

function concat(chunks: readonly Uint8Array[]): Uint8Array {
  let total = 0;
  for (const chunk of chunks) {
    total += chunk.length;
  }
  const result = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    result.set(chunk, offset);
    offset += chunk.length;
  }
  return result;
}

function validateEntryPath(path: string): void {
  if (path.length === 0 || path.startsWith("/") || path.includes("\\")) {
    throw new ZipError(
      "INVALID_PATH",
      `zip entry path is absolute or backslashed: ${path}`,
    );
  }
  if (path.split("/").some((segment) => segment === ".." || segment === ".")) {
    throw new ZipError("INVALID_PATH", `zip entry path contains traversal: ${path}`);
  }
}

export class ZipError extends Error {
  readonly code: "INVALID_PATH" | "CORRUPT" | "UNSUPPORTED";

  constructor(code: "INVALID_PATH" | "CORRUPT" | "UNSUPPORTED", message: string) {
    super(message);
    this.code = code;
  }
}

/**
 * Build a minimal ZIP archive using raw DEFLATE when it shrinks the entry,
 * otherwise STORE. Filenames are UTF-8 (general purpose bit 11). No ZIP64.
 */
export function createZip(entries: readonly ZipEntry[]): Uint8Array {
  const localParts: Uint8Array[] = [];
  const centralParts: Uint8Array[] = [];
  let centralOffset = 0;
  const pathEncoder = new TextEncoder();

  for (const entry of entries) {
    validateEntryPath(entry.path);
    const pathBytes = pathEncoder.encode(entry.path);
    const checksum = crc32(entry.bytes);
    const compressedCandidate = deflateRawSync(entry.bytes);
    const useDeflate = compressedCandidate.length < entry.bytes.length;
    const compressedBytes = useDeflate ? compressedCandidate : entry.bytes;
    const method = useDeflate ? 8 : 0;

    const localHeader = concat([
      writeUInt32(LOCAL_HEADER_SIGNATURE),
      writeUInt16(VERSION_NEEDED),
      writeUInt16(UTF8_FLAG),
      writeUInt16(method),
      writeUInt32(0), // modification date/time
      writeUInt32(checksum),
      writeUInt32(compressedBytes.length),
      writeUInt32(entry.bytes.length),
      writeUInt16(pathBytes.length),
      writeUInt16(0), // extra field length
      pathBytes,
    ]);

    const localOffset = centralOffset;
    localParts.push(localHeader);
    localParts.push(compressedBytes);
    centralOffset += localHeader.length + compressedBytes.length;

    const centralHeader = concat([
      writeUInt32(CENTRAL_DIRECTORY_SIGNATURE),
      writeUInt16(VERSION_NEEDED),
      writeUInt16(VERSION_NEEDED),
      writeUInt16(UTF8_FLAG),
      writeUInt16(method),
      writeUInt32(0),
      writeUInt32(checksum),
      writeUInt32(compressedBytes.length),
      writeUInt32(entry.bytes.length),
      writeUInt16(pathBytes.length),
      writeUInt16(0), // extra length
      writeUInt16(0), // comment length
      writeUInt16(0), // disk number start
      writeUInt16(0), // internal file attributes
      writeUInt32(0), // external file attributes
      writeUInt32(localOffset),
      pathBytes,
    ]);
    centralParts.push(centralHeader);
  }

  const centralDirectory = concat(centralParts);
  const eocd = concat([
    writeUInt32(EOCD_SIGNATURE),
    writeUInt16(0), // disk number
    writeUInt16(0), // disk with central directory
    writeUInt16(entries.length),
    writeUInt16(entries.length),
    writeUInt32(centralDirectory.length),
    writeUInt32(centralOffset),
    writeUInt16(0), // comment length
  ]);

  return concat([concat(localParts), centralDirectory, eocd]);
}

function findEocdOffset(buffer: Uint8Array): number {
  // EOCD comment can be up to 65535 bytes, so scan backwards from end.
  const maxComment = 65535;
  const start = Math.max(0, buffer.length - 22 - maxComment);
  for (let offset = buffer.length - 22; offset >= start; offset -= 1) {
    if (readUInt32(buffer, offset) === EOCD_SIGNATURE) {
      return offset;
    }
  }
  throw new ZipError("CORRUPT", "EOCD not found");
}

/**
 * Parse a minimal ZIP archive. Rejects absolute paths, backslashes, and
 * traversal segments. Only supports STORE (0) and DEFLATE (8).
 */
export function readZip(bytes: Uint8Array): readonly ParsedZipEntry[] {
  if (bytes.length < 22) {
    throw new ZipError("CORRUPT", "buffer too small for ZIP");
  }
  const eocdOffset = findEocdOffset(bytes);
  const totalEntries = readUInt16(bytes, eocdOffset + 8);
  const centralSize = readUInt32(bytes, eocdOffset + 12);
  const centralOffset = readUInt32(bytes, eocdOffset + 16);

  if (centralOffset + centralSize > eocdOffset) {
    throw new ZipError("CORRUPT", "central directory bounds exceed EOCD");
  }

  const entries: ParsedZipEntry[] = [];
  let offset = centralOffset;
  const pathDecoder = new TextDecoder("utf-8");

  for (let index = 0; index < totalEntries; index += 1) {
    if (readUInt32(bytes, offset) !== CENTRAL_DIRECTORY_SIGNATURE) {
      throw new ZipError(
        "CORRUPT",
        `central directory signature mismatch at ${offset}`,
      );
    }
    const method = readUInt16(bytes, offset + 10);
    const checksum = readUInt32(bytes, offset + 16);
    const compressedSize = readUInt32(bytes, offset + 20);
    const uncompressedSize = readUInt32(bytes, offset + 24);
    const pathLength = readUInt16(bytes, offset + 28);
    const extraLength = readUInt16(bytes, offset + 30);
    const commentLength = readUInt16(bytes, offset + 32);
    const localOffset = readUInt32(bytes, offset + 42);
    const pathEnd = offset + 46 + pathLength;
    const path = pathDecoder.decode(bytes.subarray(offset + 46, pathEnd));
    validateEntryPath(path);

    if (localOffset + 30 > bytes.length) {
      throw new ZipError("CORRUPT", `local header offset out of bounds for ${path}`);
    }
    if (readUInt32(bytes, localOffset) !== LOCAL_HEADER_SIGNATURE) {
      throw new ZipError("CORRUPT", `local header signature mismatch for ${path}`);
    }
    const localPathLength = readUInt16(bytes, localOffset + 26);
    const localExtraLength = readUInt16(bytes, localOffset + 28);
    const dataOffset = localOffset + 30 + localPathLength + localExtraLength;
    const dataEnd = dataOffset + compressedSize;
    if (dataEnd > eocdOffset) {
      throw new ZipError("CORRUPT", `file data bounds exceed archive for ${path}`);
    }

    const compressed = bytes.subarray(dataOffset, dataEnd);
    let uncompressed: Uint8Array;
    if (method === 0) {
      uncompressed = compressed;
    } else if (method === 8) {
      uncompressed = inflateRawSync(compressed);
    } else {
      throw new ZipError(
        "UNSUPPORTED",
        `compression method ${method} not supported for ${path}`,
      );
    }
    if (uncompressed.length !== uncompressedSize) {
      throw new ZipError("CORRUPT", `size mismatch for ${path}`);
    }
    if (crc32(uncompressed) !== checksum) {
      throw new ZipError("CORRUPT", `CRC mismatch for ${path}`);
    }

    entries.push({ path, bytes: uncompressed });
    offset = pathEnd + extraLength + commentLength;
  }

  return Object.freeze(entries);
}
