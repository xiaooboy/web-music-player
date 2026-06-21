import type {
  FileEntry,
  Track,
  MusicSource,
  RuntimeMusicSource,
} from "../types";
import {
  loadTrackCache,
  type CachedTrackRecord,
  type PersistedMusicSource,
} from "./persistence";
import {
  buildLyricsLookup,
  buildTrack,
  collectAudioFiles,
  ensureDirectoryPermission,
  getLyricsLookupKey,
  isAudioFile,
  revokeTrackResources,
} from "./media";
import { defaultNameSort } from "./nameSort";

/**
 * 批量从缓存记录创建 Track 对象数组
 */
export function createTracksFromCache(records: CachedTrackRecord[]): Track[] {
  return records.map((record) => {
    let coverUrl = "";
    let coverBlob = record.coverBlob;
    // 从 coverBlob 重建 blob: URL
    if (coverBlob) {
      coverUrl = URL.createObjectURL(coverBlob);
    }
    return {
      ...record,
      // 非真实文件，水和后拿到真实 File
      coverUrl,
      isPlayable: false,
    };
  });
}

/**
 * 根据源名称列表生成缓存键
 * 将源名称排序后用双冒号连接并转小写，确保相同源集合生成相同的键
 */
export function buildCacheKeyFromSources(sourceNames: string[]): string {
  return [...sourceNames]
    .sort((left, right) => left.localeCompare(right, "zh-Hans-CN"))
    .join("::")
    .toLowerCase();
}

/**
 * 激活缓存曲目，将缓存的曲目元数据与实际文件条目关联，生成可播放的 Track 对象
 */
export function hydrateTracks(
  entries: FileEntry[],
  records: CachedTrackRecord[],
): Track[] {
  const entryMap = new Map(
    entries
      .filter(({ file }) => isAudioFile(file.name, file.type))
      .map((entry) => [entry.relativePath.toLowerCase(), entry] as const),
  );

  return records.reduce<Track[]>((result, record) => {
    const entry = entryMap.get(record.relativePath.toLowerCase());
    if (!entry) return result;
    result.push({
      ...record,
      file: entry.file,
      coverUrl: record.coverBlob ? URL.createObjectURL(record.coverBlob) : "",
      isPlayable: true,
    });

    return result;
  }, []);
}

/**
 * 加载音乐源数据，扫描所有可用源的文件条目，返回聚合结果
 */
export async function loadSourcesData(sources: RuntimeMusicSource[]): Promise<{
  allEntries: FileEntry[];
  activeSourceNames: string[];
  activePersistentSourceNames: string[];
}> {
  const allEntries: FileEntry[] = [];
  const activeSourceNames: string[] = [];
  const activePersistentSourceNames: string[] = [];

  const sourcesToBuild = sources.some((s) => s.entries?.length)
    ? sources.filter((s) => s.entries?.length)
    : sources;

  await Promise.all(
    sourcesToBuild.map(async (source) => {
      // webkitdirectory path 携带文件夹前缀
      let sourceEntries = source.entries || [];
      // handle 需要添加文件夹前缀
      if (source.handle && source.available) {
        sourceEntries = await collectAudioFiles(source.handle, source.name);
      }
      if (!sourceEntries.length) return;
      activeSourceNames.push(source.name);
      if (source.persistent && source.available)
        activePersistentSourceNames.push(source.name);
      allEntries.push(...sourceEntries);
    }),
  );
  return { allEntries, activeSourceNames, activePersistentSourceNames };
}

/**
 * 检查源授权状态
 * 并行检查所有持久化源的目录授权，返回可用的音乐源列表
 */
export async function checkSourcePermissions(
  persistedSources: PersistedMusicSource[],
): Promise<MusicSource[]> {
  const restoredSources = await Promise.all(
    persistedSources.map(async (source) => {
      let permission: PermissionState = "prompt";
      try {
        permission = await ensureDirectoryPermission(source.handle, false);
      } catch {
        permission = "prompt";
      }

      return {
        id: source.id,
        name: source.name,
        persistent: true,
        available: permission === "granted",
        kind: "directory" as const,
        handle: source.handle,
      };
    }),
  );

  return restoredSources;
}

/**
 * 计算缓存键
 * 当所有活动源都是持久化源时返回缓存键，否则返回 null
 */
export function computeCacheKey(
  activeSourceNames: string[],
  activePersistentSourceNames: string[],
): string | null {
  if (
    activeSourceNames.length &&
    activeSourceNames.length === activePersistentSourceNames.length
  ) {
    return buildCacheKeyFromSources(activePersistentSourceNames);
  }
  return null;
}

/** 根据音乐源，给音乐列表缓存添加 File 使其可播放，同时分析音乐源 */
export async function hydrateTrackAndParseSource(
  musicSources: RuntimeMusicSource[],
  tracks: Track[],
) {
  let hydratedTracks: Track[] = [];
  // 文件启动时只处理此文件
  const sourcesToBuild = musicSources.some(
    (source) => source.kind === "file-launch",
  )
    ? musicSources.filter((source) => source.kind === "file-launch")
    : musicSources;
  const { allEntries, activeSourceNames, activePersistentSourceNames } =
    await loadSourcesData(sourcesToBuild);
  if (!allEntries.length) revokeTrackResources(tracks);
  // 启动阶段处理缓存，其他阶段跳过
  const cachedVisibleTracks = tracks.filter((track) => !track.isPlayable);
  if (cachedVisibleTracks.length && allEntries.length) {
    // 水和，给缓存设置真实 File
    hydratedTracks = hydrateTracks(allEntries, cachedVisibleTracks);
  }
  return {
    hydratedTracks,
    allEntries,
    cacheKey: computeCacheKey(activeSourceNames, activePersistentSourceNames),
  };
}
/** 文件入口转可播放音乐  FileEntry[] -> Track[] */
export async function entriesToTracks(
  entries: FileEntry[],
  isStale: () => boolean,
  options?: {
    onProgress?: (info: { done: number; total: number }) => void;
  },
): Promise<Track[] | undefined> {
  if (isStale()) return;
  const audioEntries = entries.filter(({ file }) =>
    isAudioFile(file.name, file.type),
  );
  if (!audioEntries.length) return;
  /** tracks 可播放 */
  options?.onProgress?.({ done: 0, total: audioEntries.length });
  const lyricsLookup = await buildLyricsLookup(entries);

  const BATCH_SIZE = 8;
  const parsedTracks: Track[] = [];

  for (
    let batchStart = 0;
    batchStart < audioEntries.length;
    batchStart += BATCH_SIZE
  ) {
    if (isStale()) {
      revokeTrackResources(parsedTracks);
      return;
    }

    const batch = audioEntries.slice(batchStart, batchStart + BATCH_SIZE);
    const results = await Promise.allSettled(
      batch.map((entry) =>
        buildTrack(
          entry,
          lyricsLookup.get(getLyricsLookupKey(entry.relativePath)) || "",
        ),
      ),
    );

    if (isStale()) {
      const builtTracks = results
        .filter((r) => r.status === "fulfilled")
        .map((r) => r.value);
      revokeTrackResources([...parsedTracks, ...builtTracks]);
      return;
    }

    for (const result of results) {
      if (result.status === "fulfilled") {
        parsedTracks.push(result.value);
      }
    }
    options?.onProgress?.({
      done: Math.min(batchStart + BATCH_SIZE, audioEntries.length),
      total: audioEntries.length,
    });
  }

  if (isStale()) {
    revokeTrackResources(parsedTracks);
    return;
  }
  return parsedTracks.sort((a, b) => defaultNameSort(a.title, b.title));
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
    return createTracksFromCache(cachedTrackPayload.tracks);
  }
  return [];
}
