import type { Track } from "@/types";

const COVERS_DIR = "covers";

async function getCoversDir(): Promise<FileSystemDirectoryHandle> {
  const root = await navigator.storage.getDirectory();
  return root.getDirectoryHandle(COVERS_DIR, { create: true });
}

function coverExtension(blob: Blob): string {
  const type = (blob.type || "").toLowerCase();
  if (type.includes("png")) return "png";
  if (type.includes("gif")) return "gif";
  if (type.includes("webp")) return "webp";
  if (type.includes("avif")) return "avif";
  return "jpg";
}

/**
 * 将封面写入 OPFS（按内容 SHA-256 去重），返回文件名（hash.ext）。
 * 安全上下文不可用或写入失败时返回 null。
 */
export async function saveCover(blob: Blob): Promise<string | null> {
  if (!globalThis.crypto?.subtle) return null;
  try {
    const bytes = await blob.arrayBuffer();
    const digest = await crypto.subtle.digest("SHA-256", bytes);
    const hash = [...new Uint8Array(digest)]
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");
    const name = `${hash}.${coverExtension(blob)}`;

    const dir = await getCoversDir();
    try {
      await dir.getFileHandle(name, { create: false });
      return name; // 已存在，去重跳过写入
    } catch {
      // 不存在，继续写入
    }

    const fileHandle = await dir.getFileHandle(name, { create: true });
    const writable = await fileHandle.createWritable();
    await writable.write(blob);
    await writable.close();
    return name;
  } catch {
    return null;
  }
}

/** 从 OPFS 读取封面文件 */
export async function loadCover(name: string): Promise<File | null> {
  try {
    const dir = await getCoversDir();
    const fileHandle = await dir.getFileHandle(name, { create: false });
    return await fileHandle.getFile();
  } catch {
    return null;
  }
}

/** 为缺少 coverBlob（但有 coverKey）的曲目按需从 OPFS 补齐封面（按 key 去重） */
export async function hydrateCovers(tracks: Track[]): Promise<Track[]> {
  const keys = [
    ...new Set(
      tracks
        .filter((track) => track.coverKey && !track.coverBlob)
        .map((track) => track.coverKey as string),
    ),
  ];
  if (!keys.length) return tracks;

  const fileByKey = new Map<string, File | null>();
  await Promise.all(
    keys.map(async (key) => {
      fileByKey.set(key, await loadCover(key));
    }),
  );

  return tracks.map((track) => {
    if (track.coverKey && !track.coverBlob) {
      const file = fileByKey.get(track.coverKey);
      if (file) return { ...track, coverBlob: file };
    }
    return track;
  });
}
