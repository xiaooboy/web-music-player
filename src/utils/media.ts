import type { FileEntry, LyricsLine, Track } from "../types";

const AUDIO_EXTENSIONS = new Set([
  "mp3",
  "wav",
  "flac",
  "m4a",
  "aac",
  "ogg",
  "opus",
  "webm",
]);

type WindowWithDirectoryPicker = Window &
  typeof globalThis & {
    showDirectoryPicker?: (options?: {
      mode?: "read" | "readwrite";
    }) => Promise<FileSystemDirectoryHandle>;
  };

type IterableDirectoryHandle = FileSystemDirectoryHandle & {
  entries(): AsyncIterable<[string, FileSystemHandle]>;
};

type DirectoryPermissionDescriptor = {
  mode?: "read" | "readwrite";
};

type PermissionAwareDirectoryHandle = FileSystemDirectoryHandle & {
  queryPermission?: (
    descriptor?: DirectoryPermissionDescriptor,
  ) => Promise<PermissionState>;
  requestPermission?: (
    descriptor?: DirectoryPermissionDescriptor,
  ) => Promise<PermissionState>;
};

export function supportsDirectoryPicker() {
  const pickerWindow = window as WindowWithDirectoryPicker;
  return Boolean(pickerWindow.showDirectoryPicker) && window.isSecureContext;
}

export async function pickDirectory() {
  const pickerWindow = window as WindowWithDirectoryPicker;
  if (!pickerWindow.showDirectoryPicker) {
    throw new Error("showDirectoryPicker is not supported");
  }

  return pickerWindow.showDirectoryPicker({ mode: "read" });
}

export async function ensureDirectoryPermission(
  handle: FileSystemDirectoryHandle,
  requestIfNeeded = false,
) {
  const permissionHandle = handle as PermissionAwareDirectoryHandle;
  const options = { mode: "read" as const };

  if (typeof permissionHandle.queryPermission === "function") {
    const currentPermission = await permissionHandle.queryPermission(options);
    if (currentPermission === "granted" || !requestIfNeeded) {
      return currentPermission;
    }
  }

  if (typeof permissionHandle.requestPermission === "function") {
    return permissionHandle.requestPermission(options);
  }

  return "prompt" as PermissionState;
}

export async function collectAudioFiles(
  handle: FileSystemDirectoryHandle,
  parentPath = "",
): Promise<FileEntry[]> {
  return collectDirectoryFiles(handle, parentPath).then((entries) =>
    entries.filter(({ file }) => isAudioFile(file.name, file.type)),
  );
}

export async function collectDirectoryFiles(
  handle: FileSystemDirectoryHandle,
  parentPath = "",
): Promise<FileEntry[]> {
  const directory = handle as IterableDirectoryHandle;
  const filePromises: Promise<FileEntry>[] = [];
  const dirPromises: Promise<FileEntry[]>[] = [];

  for await (const [, entry] of directory.entries()) {
    const currentPath = parentPath ? `${parentPath}/${entry.name}` : entry.name;
    if (entry.kind === "directory") {
      dirPromises.push(
        collectDirectoryFiles(entry as FileSystemDirectoryHandle, currentPath),
      );
    } else {
      filePromises.push(
        (entry as FileSystemFileHandle)
          .getFile()
          .then((file) => ({ file, relativePath: currentPath })),
      );
    }
  }

  const [fileEntries, ...dirEntries] = await Promise.all([
    Promise.all(filePromises),
    ...dirPromises,
  ]);

  return [...fileEntries, ...dirEntries.flat()];
}

export function entriesFromInput(files: FileList | null) {
  return Array.from(files || []).map((file) => ({
    file,
    relativePath: normalizeSlashes(file.webkitRelativePath || file.name),
  }));
}

export async function buildTrack(
  entry: FileEntry,
  index: number,
  folderName: string,
  externalLyricsText = "",
) {
  const { file, relativePath } = entry;
  const fallback = inferTrackInfoFromFile(file.name, relativePath, folderName);
  const extension = getFileExtension(file.name);
  const format = extension.toUpperCase() || "AUDIO";

  const metadataPromise = (async (): Promise<Partial<Track>> => {
    try {
      if (extension === "mp3") return await parseId3Tags(file);
      if (extension === "flac") return await parseFlacMetadata(file);
      if (extension === "m4a" || extension === "mp4")
        return await parseMp4Metadata(file);
      return {};
    } catch {
      return {};
    }
  })();

  const [metadata, duration] = await Promise.all([
    metadataPromise,
    probeDuration(file),
  ]);

  return {
    id: `${normalizeSlashes(relativePath).toLowerCase()}-${index}`,
    file,
    relativePath,
    title: metadata.title || fallback.title,
    artist: metadata.artist || fallback.artist,
    album: metadata.album || fallback.album,
    coverUrl: metadata.coverUrl || "",
    duration,
    format,
    lyricsText: externalLyricsText || metadata.lyricsText || "",
    isPlayable: true,
  } satisfies Track;
}

export function revokeTrackResources(tracks: Track[]) {
  tracks.forEach((track) => {
    if (track.coverUrl.startsWith("blob:")) {
      URL.revokeObjectURL(track.coverUrl);
    }
  });
}

export function isAudioFile(fileName: string, mimeType = "") {
  if (mimeType.startsWith("audio/")) {
    return true;
  }

  return AUDIO_EXTENSIONS.has(getFileExtension(fileName));
}

export function isLyricsFile(fileName: string) {
  return getFileExtension(fileName) === "lrc";
}

export function getFileExtension(fileName: string) {
  const parts = fileName.toLowerCase().split(".");
  return parts.length > 1 ? parts.pop() || "" : "";
}

export function normalizeSlashes(value: string) {
  return value.replace(/\\/g, "/");
}

export function stripExtension(fileName: string) {
  return fileName.replace(/\.[^.]+$/, "");
}

export function formatTime(seconds: number) {
  if (!Number.isFinite(seconds) || seconds <= 0) {
    return "00:00";
  }

  const safeSeconds = Math.floor(seconds);
  const minutes = Math.floor(safeSeconds / 60);
  const remainSeconds = safeSeconds % 60;
  return `${String(minutes).padStart(2, "0")}:${String(remainSeconds).padStart(2, "0")}`;
}

export function formatLongDuration(seconds: number) {
  if (!Number.isFinite(seconds) || seconds <= 0) {
    return "00:00";
  }

  const totalMinutes = Math.floor(seconds / 60);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return hours > 0
    ? `${String(hours).padStart(2, "0")}h ${String(minutes).padStart(2, "0")}m`
    : formatTime(seconds);
}

export function sliderStyle(value: number) {
  const safeValue = Math.max(0, Math.min(100, value));
  return {
    background: `linear-gradient(90deg, var(--accent) 0%, var(--accent) ${safeValue}%, rgba(211, 58, 49, 0.22) ${safeValue}%, rgba(211, 58, 49, 0.22) 100%)`,
  };
}

export async function coverUrlToDataUrl(coverUrl: string) {
  if (!coverUrl) {
    return "";
  }

  if (coverUrl.startsWith("data:")) {
    return coverUrl;
  }

  try {
    const response = await fetch(coverUrl);
    const blob = await response.blob();
    return await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.addEventListener("load", () =>
        resolve(typeof reader.result === "string" ? reader.result : ""),
      );
      reader.addEventListener("error", () =>
        reject(reader.error || new Error("cover read failed")),
      );
      reader.readAsDataURL(blob);
    });
  } catch {
    return "";
  }
}

export async function buildLyricsLookup(entries: FileEntry[]) {
  const lookup = new Map<string, string>();

  await Promise.all(
    entries
      .filter((entry) => isLyricsFile(entry.file.name))
      .map(async (entry) => {
        const stem = getLyricsLookupKey(entry.relativePath);
        try {
          lookup.set(stem, await entry.file.text());
        } catch {
          lookup.set(stem, "");
        }
      }),
  );

  return lookup;
}

export function getLyricsLookupKey(relativePath: string) {
  return normalizeSlashes(relativePath)
    .replace(/\.[^.]+$/, "")
    .toLowerCase();
}

export function parseLyricsText(lyricsText: string): LyricsLine[] {
  if (!lyricsText.trim()) {
    return [];
  }

  const lines = lyricsText
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  const parsed: LyricsLine[] = [];
  let hasTimestamp = false;

  for (const line of lines) {
    const matches = [
      ...line.matchAll(/\[(\d{1,2}):(\d{1,2})(?:[.:](\d{1,3}))?\]/g),
    ];
    const text = line
      .replace(/\[(\d{1,2}):(\d{1,2})(?:[.:](\d{1,3}))?\]/g, "")
      .trim();

    if (!matches.length) {
      parsed.push({ time: null, text: line });
      continue;
    }

    hasTimestamp = true;
    for (const match of matches) {
      const minutes = Number(match[1]);
      const seconds = Number(match[2]);
      const fractionRaw = match[3] || "0";
      const fraction =
        fractionRaw.length >= 3
          ? Number(fractionRaw) / 1000
          : Number(fractionRaw) / 100;
      parsed.push({
        time: minutes * 60 + seconds + fraction,
        text: text || "…",
      });
    }
  }

  return hasTimestamp
    ? parsed.sort((left, right) => (left.time || 0) - (right.time || 0))
    : parsed.map((line) => ({ ...line, time: null }));
}

function inferTrackInfoFromFile(
  fileName: string,
  relativePath: string,
  folderName: string,
) {
  const rawName = stripExtension(fileName);
  const nameParts = rawName
    .split(" - ")
    .map((part) => part.trim())
    .filter(Boolean);
  const pathParts = normalizeSlashes(relativePath).split("/");
  const albumName =
    pathParts.length > 1 ? pathParts[pathParts.length - 2] : folderName;

  if (nameParts.length >= 2) {
    return {
      artist: nameParts[0],
      title: nameParts.slice(1).join(" - "),
      album: albumName || "本地专辑",
    };
  }

  return {
    artist: "未知艺术家",
    title: rawName,
    album: albumName || "本地专辑",
  };
}

export async function probeDuration(file: File) {
  return new Promise<number>((resolve) => {
    const probe = document.createElement("audio");
    const url = URL.createObjectURL(file);

    const finish = (duration = 0) => {
      URL.revokeObjectURL(url);
      probe.removeAttribute("src");
      resolve(Number.isFinite(duration) ? duration : 0);
    };

    probe.preload = "metadata";
    probe.addEventListener("loadedmetadata", () => finish(probe.duration), {
      once: true,
    });
    probe.addEventListener("error", () => finish(0), { once: true });
    probe.src = url;
  });
}

async function parseId3Tags(file: File) {
  const headerBuffer = await file
    .slice(0, Math.min(file.size, 2 * 1024 * 1024))
    .arrayBuffer();
  let bytes = new Uint8Array(headerBuffer);

  if (decodeLatin1(bytes.slice(0, 3)) !== "ID3") {
    return {};
  }

  const version = bytes[3];
  const flags = bytes[5];
  const declaredSize = readSynchsafe(bytes, 6);
  let offset = 10;

  if (flags & 0x80) {
    bytes = removeUnsynchronization(bytes);
  }

  if (flags & 0x40) {
    const extSize =
      version === 4 ? readSynchsafe(bytes, offset) : readUint32(bytes, offset);
    offset += version === 3 ? extSize + 4 : extSize;
  }

  const tagLimit = Math.min(bytes.length, 10 + declaredSize);
  const metadata: Partial<Track> = {};

  if (version === 2) {
    while (offset + 6 <= tagLimit) {
      const frameId = decodeLatin1(bytes.slice(offset, offset + 3)).replace(
        /\0/g,
        "",
      );
      if (!/^[A-Z0-9]{3}$/.test(frameId)) {
        break;
      }

      const frameSize = readUint24(bytes, offset + 3);
      if (!frameSize) {
        break;
      }

      const frameStart = offset + 6;
      const frameEnd = frameStart + frameSize;
      if (frameEnd > tagLimit) {
        break;
      }

      const frameBytes = bytes.slice(frameStart, frameEnd);

      if (frameId === "TT2") {
        metadata.title = decodeTextFrame(frameBytes);
      }

      if (frameId === "TP1") {
        metadata.artist = decodeTextFrame(frameBytes);
      }

      if (frameId === "TAL") {
        metadata.album = decodeTextFrame(frameBytes);
      }

      if (frameId === "ULT" && !metadata.lyricsText) {
        metadata.lyricsText = decodeLyricsFrame(frameBytes, true);
      }

      if (frameId === "PIC" && !metadata.coverUrl) {
        metadata.coverUrl = decodePicFrame(frameBytes);
      }

      offset = frameEnd;
    }

    return metadata;
  }

  while (offset + 10 <= tagLimit) {
    const frameId = decodeLatin1(bytes.slice(offset, offset + 4)).replace(
      /\0/g,
      "",
    );
    if (!/^[A-Z0-9]{4}$/.test(frameId)) {
      break;
    }

    const frameSize =
      version === 4
        ? readSynchsafe(bytes, offset + 4)
        : readUint32(bytes, offset + 4);
    if (!frameSize) {
      break;
    }

    const frameStart = offset + 10;
    const frameEnd = frameStart + frameSize;
    if (frameEnd > tagLimit) {
      break;
    }

    const frameBytes = bytes.slice(frameStart, frameEnd);

    if (frameId === "TIT2") {
      metadata.title = decodeTextFrame(frameBytes);
    }

    if (frameId === "TPE1") {
      metadata.artist = decodeTextFrame(frameBytes);
    }

    if (frameId === "TALB") {
      metadata.album = decodeTextFrame(frameBytes);
    }

    if (frameId === "USLT" && !metadata.lyricsText) {
      metadata.lyricsText = decodeLyricsFrame(frameBytes);
    }

    if (frameId === "APIC" && !metadata.coverUrl) {
      metadata.coverUrl = decodeApicFrame(frameBytes);
    }

    offset = frameEnd;
  }

  return metadata;
}

async function parseFlacMetadata(file: File) {
  const buffer = await file
    .slice(0, Math.min(file.size, 16 * 1024 * 1024))
    .arrayBuffer();
  const bytes = new Uint8Array(buffer);

  if (decodeLatin1(bytes.slice(0, 4)) !== "fLaC") {
    return {};
  }

  const metadata: Partial<Track> = {};
  let offset = 4;
  let lastBlock = false;

  while (!lastBlock && offset + 4 <= bytes.length) {
    const header = bytes[offset];
    lastBlock = Boolean(header & 0x80);
    const blockType = header & 0x7f;
    const blockLength = readUint24(bytes, offset + 1);
    const blockStart = offset + 4;
    const blockEnd = blockStart + blockLength;

    if (blockEnd > bytes.length) {
      break;
    }

    const blockBytes = bytes.slice(blockStart, blockEnd);
    if (blockType === 4) {
      Object.assign(metadata, decodeVorbisCommentBlock(blockBytes));
    }

    if (blockType === 6 && !metadata.coverUrl) {
      metadata.coverUrl = decodeFlacPictureBlock(blockBytes);
    }

    offset = blockEnd;
  }

  return metadata;
}

async function parseMp4Metadata(file: File) {
  const bytes = new Uint8Array(await file.arrayBuffer());
  const metadata: Partial<Track> = {};

  walkMp4Atoms(bytes, 0, bytes.length, [], metadata);
  return metadata;
}

function decodeApicFrame(frameBytes: Uint8Array) {
  const encoding = frameBytes[0];
  let offset = 1;
  const mimeEnd = frameBytes.indexOf(0, offset);
  if (mimeEnd === -1) {
    return "";
  }

  const mimeType = normalizeMimeType(
    decodeLatin1(frameBytes.slice(offset, mimeEnd)),
  );
  if (mimeType === "-->") {
    return "";
  }

  offset = mimeEnd + 1;
  offset += 1;
  offset = findEncodedTextEnd(frameBytes, offset, encoding);

  const imageBytes = frameBytes.slice(offset);
  if (!imageBytes.length) {
    return "";
  }

  return createObjectUrlFromBytes(imageBytes, mimeType);
}

function decodePicFrame(frameBytes: Uint8Array) {
  const encoding = frameBytes[0];
  const format = decodeLatin1(frameBytes.slice(1, 4)).toUpperCase();
  let offset = 4;

  offset += 1;
  offset = findEncodedTextEnd(frameBytes, offset, encoding);

  const imageBytes = frameBytes.slice(offset);
  if (!imageBytes.length) {
    return "";
  }

  const mimeType = normalizeMimeType(formatToMimeType(format));
  return createObjectUrlFromBytes(imageBytes, mimeType);
}

function decodeVorbisCommentBlock(blockBytes: Uint8Array) {
  if (blockBytes.length < 8) {
    return {};
  }

  const metadata: Partial<Track> = {};
  let offset = 0;
  const vendorLength = readUint32LE(blockBytes, offset);
  offset += 4 + vendorLength;

  if (offset + 4 > blockBytes.length) {
    return metadata;
  }

  const commentCount = readUint32LE(blockBytes, offset);
  offset += 4;

  for (let index = 0; index < commentCount; index += 1) {
    if (offset + 4 > blockBytes.length) {
      break;
    }

    const commentLength = readUint32LE(blockBytes, offset);
    offset += 4;
    if (offset + commentLength > blockBytes.length) {
      break;
    }

    const comment = sanitizeText(
      new TextDecoder("utf-8").decode(
        blockBytes.slice(offset, offset + commentLength),
      ),
    );
    offset += commentLength;

    const separatorIndex = comment.indexOf("=");
    if (separatorIndex === -1) {
      continue;
    }

    const key = comment.slice(0, separatorIndex).toUpperCase();
    const value = comment.slice(separatorIndex + 1).trim();

    if (key === "TITLE" && value && !metadata.title) {
      metadata.title = value;
    }

    if (key === "ARTIST" && value && !metadata.artist) {
      metadata.artist = value;
    }

    if (key === "ALBUM" && value && !metadata.album) {
      metadata.album = value;
    }

    if (
      (key === "LYRICS" || key === "UNSYNCEDLYRICS") &&
      value &&
      !metadata.lyricsText
    ) {
      metadata.lyricsText = value;
    }
  }

  return metadata;
}

function decodeFlacPictureBlock(blockBytes: Uint8Array) {
  let offset = 0;
  if (blockBytes.length < 32) {
    return "";
  }

  offset += 4;
  const mimeLength = readUint32(blockBytes, offset);
  offset += 4;
  if (offset + mimeLength > blockBytes.length) {
    return "";
  }

  const mimeType = normalizeMimeType(
    decodeLatin1(blockBytes.slice(offset, offset + mimeLength)),
  );
  offset += mimeLength;

  const descriptionLength = readUint32(blockBytes, offset);
  offset += 4 + descriptionLength;
  offset += 16;

  if (offset + 4 > blockBytes.length) {
    return "";
  }

  const imageLength = readUint32(blockBytes, offset);
  offset += 4;
  if (offset + imageLength > blockBytes.length) {
    return "";
  }

  const imageBytes = blockBytes.slice(offset, offset + imageLength);
  if (!imageBytes.length) {
    return "";
  }

  return createObjectUrlFromBytes(imageBytes, mimeType);
}

function walkMp4Atoms(
  bytes: Uint8Array,
  start: number,
  end: number,
  path: string[],
  metadata: Partial<Track>,
) {
  let offset = start;

  while (offset + 8 <= end) {
    let atomSize = readUint32(bytes, offset);
    const atomType = decodeLatin1(bytes.slice(offset + 4, offset + 8));
    let headerSize = 8;

    if (atomSize === 1) {
      if (offset + 16 > end) {
        break;
      }

      atomSize = readUint64(bytes, offset + 8);
      headerSize = 16;
    } else if (atomSize === 0) {
      atomSize = end - offset;
    }

    if (atomSize < headerSize) {
      break;
    }

    const atomEnd = offset + atomSize;
    if (atomEnd > end) {
      break;
    }

    const nextPath = [...path, atomType];
    if (isMp4ContainerAtom(atomType)) {
      const childStart =
        atomType === "meta" ? offset + headerSize + 4 : offset + headerSize;
      if (childStart <= atomEnd) {
        walkMp4Atoms(bytes, childStart, atomEnd, nextPath, metadata);
      }
    } else if (path[path.length - 1] === "ilst") {
      parseMp4MetadataAtom(
        atomType,
        bytes,
        offset + headerSize,
        atomEnd,
        metadata,
      );
    }

    offset = atomEnd;
  }
}

function parseMp4MetadataAtom(
  atomType: string,
  bytes: Uint8Array,
  start: number,
  end: number,
  metadata: Partial<Track>,
) {
  let offset = start;

  while (offset + 8 <= end) {
    let atomSize = readUint32(bytes, offset);
    const childType = decodeLatin1(bytes.slice(offset + 4, offset + 8));
    let headerSize = 8;

    if (atomSize === 1) {
      if (offset + 16 > end) {
        break;
      }

      atomSize = readUint64(bytes, offset + 8);
      headerSize = 16;
    } else if (atomSize === 0) {
      atomSize = end - offset;
    }

    if (atomSize < headerSize) {
      break;
    }

    const atomEnd = offset + atomSize;
    if (atomEnd > end) {
      break;
    }

    if (childType === "data" && atomEnd >= offset + headerSize + 8) {
      const payload = bytes.slice(offset + headerSize + 8, atomEnd);
      if (atomType === "covr" && !metadata.coverUrl) {
        metadata.coverUrl = decodeMp4Cover(payload);
      }

      if ((atomType === "\u00a9nam" || atomType === "nam") && !metadata.title) {
        metadata.title = decodeMp4Text(payload);
      }

      if (
        (atomType === "\u00a9ART" || atomType === "aART") &&
        !metadata.artist
      ) {
        metadata.artist = decodeMp4Text(payload);
      }

      if ((atomType === "\u00a9alb" || atomType === "alb") && !metadata.album) {
        metadata.album = decodeMp4Text(payload);
      }

      if (
        (atomType === "\u00a9lyr" || atomType === "lyr") &&
        !metadata.lyricsText
      ) {
        metadata.lyricsText = decodeMp4Text(payload);
      }
    }

    offset = atomEnd;
  }
}

function decodeMp4Cover(payload: Uint8Array) {
  if (!payload.length) {
    return "";
  }

  const mimeType = detectImageMimeType(payload);
  return createObjectUrlFromBytes(payload, mimeType);
}

function decodeMp4Text(payload: Uint8Array) {
  if (!payload.length) {
    return "";
  }

  try {
    return sanitizeText(new TextDecoder("utf-8").decode(payload));
  } catch {
    return sanitizeText(decodeLatin1(payload));
  }
}

function findEncodedTextEnd(
  bytes: Uint8Array,
  start: number,
  encoding: number,
) {
  if (encoding === 0 || encoding === 3) {
    const end = bytes.indexOf(0, start);
    return end === -1 ? bytes.length : end + 1;
  }

  for (let index = start; index + 1 < bytes.length; index += 2) {
    if (bytes[index] === 0 && bytes[index + 1] === 0) {
      return index + 2;
    }
  }

  return bytes.length;
}

function decodeTextFrame(frameBytes: Uint8Array) {
  const encoding = frameBytes[0];
  const content = frameBytes.slice(1);
  return sanitizeText(decodeBytes(content, encoding));
}

function decodeLyricsFrame(frameBytes: Uint8Array, isV22 = false) {
  if (!frameBytes.length) {
    return "";
  }

  const encoding = frameBytes[0];
  let offset = 1;
  offset += 3;
  offset = findEncodedTextEnd(frameBytes, offset, encoding);

  if (isV22) {
    offset = Math.min(offset, frameBytes.length);
  }

  if (offset >= frameBytes.length) {
    return "";
  }

  return sanitizeText(decodeBytes(frameBytes.slice(offset), encoding));
}

function decodeBytes(bytes: Uint8Array, encoding: number) {
  try {
    if (encoding === 0) {
      return new TextDecoder("windows-1252").decode(bytes);
    }

    if (encoding === 1) {
      return new TextDecoder("utf-16").decode(bytes);
    }

    if (encoding === 2) {
      return new TextDecoder("utf-16be").decode(bytes);
    }

    return new TextDecoder("utf-8").decode(bytes);
  } catch {
    return decodeLatin1(bytes);
  }
}

function sanitizeText(value: string) {
  return value
    .replace(/\0/g, "")
    .replace(/^\uFEFF/, "")
    .trim();
}

function decodeLatin1(bytes: Uint8Array) {
  return Array.from(bytes, (byte) => String.fromCharCode(byte)).join("");
}

function readSynchsafe(bytes: Uint8Array, offset: number) {
  return (
    (bytes[offset] << 21) |
    (bytes[offset + 1] << 14) |
    (bytes[offset + 2] << 7) |
    bytes[offset + 3]
  );
}

function readUint32(bytes: Uint8Array, offset: number) {
  return (
    (bytes[offset] << 24) |
    (bytes[offset + 1] << 16) |
    (bytes[offset + 2] << 8) |
    bytes[offset + 3]
  );
}

function readUint24(bytes: Uint8Array, offset: number) {
  return (bytes[offset] << 16) | (bytes[offset + 1] << 8) | bytes[offset + 2];
}

function readUint32LE(bytes: Uint8Array, offset: number) {
  return (
    bytes[offset] |
    (bytes[offset + 1] << 8) |
    (bytes[offset + 2] << 16) |
    (bytes[offset + 3] << 24)
  );
}

function readUint64(bytes: Uint8Array, offset: number) {
  const high = readUint32(bytes, offset);
  const low = readUint32(bytes, offset + 4);
  return high * 2 ** 32 + low;
}

function removeUnsynchronization(bytes: Uint8Array) {
  const result: number[] = [];
  for (let index = 0; index < bytes.length; index += 1) {
    if (bytes[index] === 0xff && bytes[index + 1] === 0x00) {
      result.push(0xff);
      index += 1;
      continue;
    }

    result.push(bytes[index]);
  }

  return new Uint8Array(result);
}

function formatToMimeType(format: string) {
  if (format === "PNG") {
    return "image/png";
  }

  if (format === "GIF") {
    return "image/gif";
  }

  return "image/jpeg";
}

function normalizeMimeType(value: string) {
  const normalized = value.trim().toLowerCase();
  if (!normalized) {
    return "image/jpeg";
  }

  if (
    normalized === "jpg" ||
    normalized === "jpeg" ||
    normalized === "image/jpg"
  ) {
    return "image/jpeg";
  }

  if (normalized === "png" || normalized === "image/png") {
    return "image/png";
  }

  if (normalized === "gif" || normalized === "image/gif") {
    return "image/gif";
  }

  return normalized;
}

function isMp4ContainerAtom(atomType: string) {
  return (
    atomType === "moov" ||
    atomType === "udta" ||
    atomType === "ilst" ||
    atomType === "trak" ||
    atomType === "mdia" ||
    atomType === "minf" ||
    atomType === "stbl" ||
    atomType === "meta"
  );
}

function detectImageMimeType(bytes: Uint8Array) {
  if (
    bytes.length >= 8 &&
    bytes[0] === 0x89 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x4e &&
    bytes[3] === 0x47
  ) {
    return "image/png";
  }

  if (
    bytes.length >= 3 &&
    bytes[0] === 0xff &&
    bytes[1] === 0xd8 &&
    bytes[2] === 0xff
  ) {
    return "image/jpeg";
  }

  if (bytes.length >= 6) {
    const signature = decodeLatin1(bytes.slice(0, 6));
    if (signature === "GIF87a" || signature === "GIF89a") {
      return "image/gif";
    }
  }

  return "image/jpeg";
}

function createObjectUrlFromBytes(bytes: Uint8Array, mimeType: string) {
  const copy = new Uint8Array(bytes.byteLength);
  copy.set(bytes);
  return URL.createObjectURL(new Blob([copy.buffer], { type: mimeType }));
}
