import { revokeCoverUrls } from "./coverCache";
import { parseId3Tags, parseFlacMetadata, parseMp4Metadata, parseOggMetadata, parseOpusMetadata } from "./parsers";

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
export type DirectoryPickerOptions = {
  id?: string;
  mode?: "read" | "readwrite";
  startIn?: string;
};

type WindowWithDirectoryPicker = Window &
  typeof globalThis & {
    showDirectoryPicker?: (
      options?: DirectoryPickerOptions,
    ) => Promise<FileSystemDirectoryHandle>;
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

export async function pickDirectory(options?: DirectoryPickerOptions) {
  const pickerWindow = window as WindowWithDirectoryPicker;
  if (!pickerWindow.showDirectoryPicker) {
    throw new Error("showDirectoryPicker is not supported");
  }

  return pickerWindow.showDirectoryPicker(options);
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
    try {
      // requestPermission must be called during a user activation (e.g., click).
      // If it's invoked without activation some browsers throw a SecurityError.
      const requested = await permissionHandle.requestPermission(options);
      return requested;
    } catch (e) {
      // Treat failures (like SecurityError due to missing user activation) as "prompt"
      // so callers can retry from a user gesture instead of crashing.
      // eslint-disable-next-line no-console
      console.warn("ensureDirectoryPermission: requestPermission failed", e);
      return "prompt" as PermissionState;
    }
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
/**
 * FileList -> FileEntry[]
 */
export function entriesFromInput(files: FileList | null) {
  return Array.from(files || []).map((file) => ({
    file,
    relativePath: normalizeSlashes(file.webkitRelativePath || file.name),
  }));
}

export function generateTrackId(path: string, file: File) {
  return `${normalizeSlashes(path)}::${file.lastModified}`;
}

export async function buildTrack(
  entry: FileEntry,
  externalLyricsText = "",
): Promise<Track> {
  const { file, relativePath } = entry;
  const fallback = inferTrackInfoFromFile(file.name);
  const extension = getFileExtension(file.name);
  const format = extension.toUpperCase() || "AUDIO";

  let metadata: Partial<Track> = {};
  try {
    if (extension === "mp3") metadata = await parseId3Tags(file);
    else if (extension === "flac") metadata = await parseFlacMetadata(file);
    else if (extension === "m4a" || extension === "mp4")
      metadata = await parseMp4Metadata(file);
    else if (extension === "ogg") metadata = await parseOggMetadata(file);
    else if (extension === "opus") metadata = await parseOpusMetadata(file);
  } catch {
    // 解析失败时使用空元信息
  }
  const duration = metadata.duration || (await probeDuration(file));

  return {
    id: generateTrackId(relativePath, file),
    file,
    lastModified: file.lastModified,
    relativePath: normalizeSlashes(relativePath),
    title: metadata.title || fallback.title,
    artist: metadata.artist || fallback.artist,
    album: metadata.album || fallback.album,
    coverBlob: metadata.coverBlob,
    duration,
    format,
    lyricsText: externalLyricsText || metadata.lyricsText || "",
    isPlayable: true,
  };
}

export function revokeTrackResources(tracks: Track[]) {
  revokeCoverUrls(tracks.map((t) => t.id));
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
      .replace(/\[[a-zA-Z]+:[^\]]*\]/g, "")
      .trim();

    if (!matches.length) {
      if (text) {
        parsed.push({ time: null, text });
      }
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

function inferTrackInfoFromFile(fileName: string) {
  const rawName = stripExtension(fileName);
  const nameParts = rawName
    .split(" - ")
    .map((part) => part.trim())
    .filter(Boolean);

  if (nameParts.length >= 2) {
    return {
      artist: nameParts[0],
      title: nameParts.slice(1).join(" - "),
      album: "未知专辑",
    };
  }

  return {
    artist: "未知艺术家",
    title: rawName,
    album: "未知专辑",
  };
}

export async function probeDuration(file: File) {
  return new Promise<number>((resolve) => {
    const probe = document.createElement("audio");
    const url = URL.createObjectURL(file);
    let settled = false;

    const finish = (duration = 0) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      URL.revokeObjectURL(url);
      probe.removeAttribute("src");
      resolve(Number.isFinite(duration) ? duration : 0);
    };

    const timeout = setTimeout(() => finish(0), 10_000);

    probe.preload = "metadata";
    probe.addEventListener("loadedmetadata", () => finish(probe.duration), {
      once: true,
    });
    probe.addEventListener("error", () => finish(0), { once: true });
    probe.src = url;
  });
}
