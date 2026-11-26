import type {
  FileEntry,
  Track,
  MusicSource,
  RuntimeMusicSource,
  TrackRecord,
} from "../types";
import {
  clearTrackCache,
  loadTrackCache,
  type CachedTrackRecord,
  type PersistedMusicSource,
} from "./persistence";
import {
  buildLyricsFileLookup,
  buildTrack,
  collectAudioFiles,
  ensureDirectoryPermission,
  generateTrackId,
  getLyricsLookupKey,
  isAudioFile,
  revokeTrackResources,
} from "./media";
import { defaultSort, defaultStringCompare } from "./sort";

/**
 * 批量从缓存记录创建 Track 对象数组
 */
export function cachedTrackRecordsToTracks(
  records: CachedTrackRecord[],
): Track[] {
  return records.map((record) => ({
    ...record,
    file: null, // 无 File，entriesToTracks 后再获取
    isPlayable: false,
  }));
}

/**
 * 根据源名称列表生成缓存键
 * 将源名称排序后用双冒号连接并转小写，确保相同源集合生成相同的键
 */
export function buildCacheKeyFromSources(musicSources: MusicSource[]): string {
  const nameArr: string[] = [];
  musicSources.forEach(({ name, available, persistent, kind }) => {
    if (!persistent || !available || kind === "file-launch") return;
    nameArr.push(name);
  });
  return nameArr
    .sort((left, right) => defaultStringCompare(left, right))
    .join("::")
    .toLowerCase();
}

/**
 * 加载音乐源数据，扫描所有可用源的文件条目，返回聚合结果
 */
export async function sourcesToEntries(
  sources: RuntimeMusicSource[],
): Promise<FileEntry[]> {
  const entries: FileEntry[] = [];

  await Promise.all(
    sources.map(async (source) => {
      // webkitdirectory / file-launch 携带内存中的 entries；目录源通过 handle 扫描
      let sourceEntries = source.entries || [];
      if (!sourceEntries.length && source.handle && source.available) {
        sourceEntries = await collectAudioFiles(source.handle, source.name);
      }
      if (!sourceEntries.length) return;
      entries.push(...sourceEntries);
    }),
  );
  return entries;
}

/**
 * 检查源授权状态，并行检查所有持久化源的目录授权，返回可用的音乐源列表
 */
export async function checkSourcePermissions(
  persistedSources: PersistedMusicSource[],
): Promise<MusicSource[]> {
  const restoredSources = await Promise.all(
    persistedSources.map(async (source) => {
      let permission: PermissionState = "prompt";
      try {
        // Do not trigger permission prompt automatically on startup — requesting
        // permission requires a user activation (e.g. click). Just query current
        // permission state and let the UI ask the user to reconnect if needed.
        permission = await ensureDirectoryPermission(source.handle, false);
      } catch (e) {
        console.log(e);
        permission = "prompt";
      }
      return {
        ...source,
        available: permission === "granted",
      };
    }),
  );

  return restoredSources;
}

/** 根据音乐源，解析出 entries，文件启动时只处理文件启动源 */
export async function parseSource(musicSources: RuntimeMusicSource[]) {
  const fileLaunchSources = musicSources.filter(
    (source) => source.kind === "file-launch",
  );
  // 文件启动时只处理此文件
  const sourcesToBuild = fileLaunchSources.length
    ? fileLaunchSources
    : musicSources;
  return sourcesToEntries(sourcesToBuild);
}
/** 文件入口转可播放音乐  FileEntry[] -> Track[] ，过期后解决值为 undefined */
export async function entriesToTracks(
  entries: FileEntry[],
  isStale: () => boolean,
  options?: {
    cache?: Map<string, TrackRecord>;
    onProgress?: (info: { done: number; total: number }) => void;
    revokeOnStale?: boolean;
  },
): Promise<Track[] | undefined> {
  if (isStale()) return;
  const audioEntries = entries.filter(({ file }) =>
    isAudioFile(file.name, file.type),
  );
  if (!audioEntries.length) return;
  /** tracks 可播放 */
  options?.onProgress?.({ done: 0, total: audioEntries.length });
  const lyricsFiles = buildLyricsFileLookup(entries);
  const revokeOnStale = options?.revokeOnStale ?? true;

  const BATCH_SIZE = 8;
  const newTracks: Track[] = [];
  const builtTracks: Track[] = [];

  const abandon = (): undefined => {
    if (revokeOnStale) revokeTrackResources(newTracks);
    return undefined;
  };

  for (
    let batchStart = 0;
    batchStart < audioEntries.length;
    batchStart += BATCH_SIZE
  ) {
    if (isStale()) return abandon();

    const batch = audioEntries.slice(batchStart, batchStart + BATCH_SIZE);
    const results = await Promise.allSettled(
      batch.map(async (entry) => {
        const cachedTrack = options?.cache?.get(
          generateTrackId(entry.relativePath, entry.file),
        );
        const lyricsFile = lyricsFiles.get(
          getLyricsLookupKey(entry.relativePath),
        );

        // 已解析过（含确认无封面的歌曲 coverChecked）且音频未修改时命中缓存
        const isCoverResolved = Boolean(
          cachedTrack?.coverChecked ||
            cachedTrack?.coverKey ||
            cachedTrack?.coverBlob,
        );
        if (
          cachedTrack &&
          entry.file.lastModified === cachedTrack.lastModified &&
          isCoverResolved
        ) {
          const prevLrcTime = cachedTrack.lyricsLastModified;
          const nextLrcTime = lyricsFile?.lastModified;

          // 外部 .lrc 文件未变化：零 I/O 直接复用缓存
          if (prevLrcTime === nextLrcTime) {
            return {
              ...cachedTrack,
              file: entry.file,
              isPlayable: true,
            };
          }

          // 仅新增或修改了外部 .lrc：无需重解析音频，仅读取新歌词
          if (lyricsFile) {
            const externalLyricsText = await lyricsFile.text().catch(() => "");
            return {
              ...cachedTrack,
              file: entry.file,
              lyricsText: externalLyricsText || cachedTrack.lyricsText,
              lyricsLastModified: lyricsFile.lastModified,
              isPlayable: true,
            };
          }
          // 若原本依赖的外部 .lrc 被删除，则走下方完整重解析以恢复内嵌歌词
        }

        const externalLyricsText = lyricsFile
          ? await lyricsFile.text().catch(() => "")
          : "";
        const newTrack = await buildTrack(
          entry,
          externalLyricsText,
          lyricsFile?.lastModified,
        );
        newTracks.push(newTrack);
        return newTrack;
      }),
    );

    if (isStale()) return abandon();

    for (const result of results) {
      if (result.status === "fulfilled") {
        builtTracks.push(result.value);
      } else if (result.reason) {
        console.warn("解析音频文件失败:", result.reason);
      }
    }
    options?.onProgress?.({
      done: Math.min(batchStart + BATCH_SIZE, audioEntries.length),
      total: audioEntries.length,
    });
  }

  if (isStale()) return abandon();
  return defaultSort(builtTracks, "title");
}
/**
 * 从缓存获取初始化 tracks
 */
export async function initTracksFromCache(cacheKey: string) {
  const cachedTrackPayload = await loadTrackCache();
  // 重建缓存音乐列表
  if (
    cachedTrackPayload?.sourceKey === cacheKey &&
    cachedTrackPayload.tracks.length
  ) {
    return cachedTrackRecordsToTracks(cachedTrackPayload.tracks);
  } else {
    clearTrackCache();
  }
  return [];
}
/**
 * 比较新旧Track列表差异
 */
export function diffTracks(oldList: Track[], newList: Track[]) {
  const oldMap = new Map(oldList.map((t) => [t.id, t]));
  const newMap = new Map(newList.map((t) => [t.id, t]));
  const added: Track[] = [];
  const removed: Track[] = [];
  for (const t of newList) {
    if (!oldMap.has(t.id)) {
      added.push(t);
    }
  }
  for (const t of oldList) {
    if (!newMap.has(t.id)) {
      removed.push(t);
    }
  }
  return { added, removed };
}
/** 判断音乐源列表是否包含某一个音乐源*/
export async function includesSource(
  sources: RuntimeMusicSource[],
  source: RuntimeMusicSource,
): Promise<boolean> {
  const handle = source.handle;
  let included = false;
  // 没有文件句柄，无法准确判断
  if (!handle) {
    const key = `${source.kind || "directory"}:${source.name}:${source.persistent ? "persistent" : "temp"}`;
    included = sources.some(
      (s) =>
        `${s.kind || "directory"}:${s.name}:${s.persistent ? "persistent" : "temp"}` ===
        key,
    );
    return included;
  }
  // 文件句柄判断
  for (let item of sources) {
    if (!item.handle) continue;
    const isSame = await handle.isSameEntry(item.handle);
    if (isSame) {
      included = true;
      break;
    }
  }
  return included;
}
