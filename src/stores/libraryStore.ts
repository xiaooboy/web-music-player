import type { TrackMap, FileEntry, RuntimeMusicSource, Track } from "@/types";
import { showToast } from "@/composables/useToast";
import {
  clearPersistedMusicSources,
  clearTrackCache,
  loadPersistedMusicSources,
  PersistedMusicSource,
  savePersistedMusicSources,
  saveTrackCache,
} from "@/utils/persistence";
import {
  isAudioFile,
  revokeTrackResources,
  ensureDirectoryPermission,
} from "@/utils/media";
import {
  buildCacheKeyFromSources,
  checkSourcePermissions,
  initTracksFromCache,
  diffTracks,
  includesSource,
} from "@/utils/libraryBuilder";
import { libraryWorker } from "@/workers/libraryWorkerClient";
import { defineStore } from "pinia";
import { shallowRef } from "vue";
import { usePlayerStore } from "./playerStore";

export const useLibraryStore = defineStore("library", () => {
  /** id 与 Track 对应关系 */
  const trackMap: TrackMap = new Map();
  const playerStore = usePlayerStore();

  /** 是否文件启动 */
  const isFileLaunch = shallowRef(false);
  const isReauthorizing = shallowRef(false);

  const loading = shallowRef(false);
  const loadingDone = shallowRef(0);
  const loadingTotal = shallowRef(0);
  const musicSources = shallowRef<RuntimeMusicSource[]>([]);

  const tracks = shallowRef<Track[]>([]);

  /**
   * 恢复缓存的库，流程：恢复 sources->计算cacheKey->恢复tracks->启动构建
   */
  async function restoreCachedLibrary() {
    const persistedSources = await loadPersistedMusicSources();
    if (!persistedSources.length) {
      persistTracks("");
      return;
    }
    const cacheKey = buildCacheKeyFromSources(persistedSources);
    console.time("restoreTracks");
    setTracks(await initTracksFromCache(cacheKey));
    console.timeEnd("restoreTracks");
    musicSources.value = await checkSourcePermissions(persistedSources);
    persistHandleSources();
    if (musicSources.value.some((source) => source.available))
      startBuild();
  }
  function updateTrackMap(tracks: Track[]) {
    for (const track of tracks) {
      trackMap.set(track.id, track);
    }
  }
  /**
   * 构建开始：sources -> worker（扫描 + 解析）-> tracks
   */
  function startBuild() {
    loading.value = true;
    const cachedTracks = [...trackMap.values()].map(({ file: _, ...rest }) => rest);

    libraryWorker.startBuild(musicSources.value, cachedTracks, {
      onProgress: ({ done, total }) => {
        loading.value = done !== total;
        loadingDone.value = done;
        loadingTotal.value = total;
      },
      onResult: (result) => {
        loading.value = false;
        if (!result.length) {
          loadingDone.value = loadingTotal.value = 0;
        }
        setTracks(result, true);
      },
      onError: (message) => {
        loading.value = false;
        // eslint-disable-next-line no-console
        console.warn("音乐库构建失败:", message);
      },
    });
  }

  function disposeLibrary() {
    libraryWorker.cancelActive();
    setTracks([]);
  }

  async function addSource(source: RuntimeMusicSource) {
    const isRepeat = await includesSource(musicSources.value, source);
    if (isRepeat || isFileLaunch.value) return;
    musicSources.value = [...musicSources.value, source];
    persistHandleSources();
    startBuild();
  }

  function removeSource(sourceId: string) {
    musicSources.value = musicSources.value.filter(
      (source) => source.id !== sourceId,
    );
    if (isFileLaunch.value) return;
    persistHandleSources();
    startBuild();
  }

  async function persistHandleSources() {
    const persistedSources = musicSources.value
      .filter((source) => source.persistent && source.handle)
      .map(({ entries: _, ...rest }) => rest as PersistedMusicSource);

    if (!persistedSources.length) {
      await clearPersistedMusicSources();
      return;
    }
    await savePersistedMusicSources(persistedSources);
  }

  /** 持久化 Tracks：清空 | 存储 */
  async function persistTracks(cacheKey: string) {
    if (!tracks.value.length || !cacheKey) {
      await clearTrackCache();
      return;
    }
    await saveTrackCache({
      sourceKey: cacheKey,
      tracks: tracks.value.map(({ file: _, ...rest }) => rest),
    });
  }

  async function handleLaunchedMusicFiles(fileHandles: FileSystemFileHandle[]) {
    const audioEntries: FileEntry[] = [];
    for (const handle of fileHandles) {
      const file = await handle.getFile();
      if (isAudioFile(file.name, file.type))
        audioEntries.push({ file, relativePath: file.name });
    }
    if (!audioEntries.length) return;
    // 使用虚假音乐源
    const launchSource: RuntimeMusicSource = {
      id: crypto.randomUUID(),
      name:
        audioEntries.length === 1
          ? audioEntries[0].file.name
          : `打开的文件 (${audioEntries.length})`,
      persistent: false,
      available: true,
      kind: "file-launch",
      entries: audioEntries,
    };
    musicSources.value = [launchSource];

    libraryWorker.startBuild([launchSource], [], {
      onProgress: () => {},
      onResult: (result) => {
        setTracks(result);
        if (result.length) playerStore.playTrack(0, true);
      },
      onError: (message) => {
        // eslint-disable-next-line no-console
        console.warn("解析文件失败:", message);
      },
    });
  }

  async function reauthorizeAll() {
    const pending = musicSources.value.filter(
      (s) => s.persistent && !s.available && s.handle,
    );
    if (!pending.length) {
      showToast("没有需要重新授权的音乐源");
      return;
    }
    if (
      !confirm(
        `即将为 ${pending.length} 个目录请求权限。浏览器可能会为每个目录弹出授权对话框，是否继续？`,
      )
    )
      return;
    isReauthorizing.value = true;
    let needRebuild = false;
    try {
      const availabilityMap = new Map<string, boolean>();
      for (const source of pending) {
        if (!source.handle) continue;
        const permission = await ensureDirectoryPermission(source.handle, true);
        const available = permission === "granted";
        availabilityMap.set(source.id, available);
        if (available) needRebuild = true;
        if (permission === "denied") {
          showToast(`目录 ${source.name} 的授权被拒绝`);
        }
      }
      musicSources.value = musicSources.value.map((s) => {
        const available = availabilityMap.get(s.id);
        return available !== undefined ? { ...s, available } : s;
      });
    } catch (e) {
      // eslint-disable-next-line no-console
      console.warn("reauthorizeAll failed", e);
    } finally {
      isReauthorizing.value = false;
      if (needRebuild) startBuild();
    }
  }

  /**
   * 设置 tracks 并执行副作用
   * @param persist 是否持久化缓存
   */
  function setTracks(data: Track[], persist?: boolean) {
    const { removed } = diffTracks(tracks.value, data);
    tracks.value = data;
    trackMap.clear();
    updateTrackMap(data);
    revokeTrackResources(removed);
    if (persist) persistTracks(buildCacheKeyFromSources(musicSources.value));
  }
  return {
    loading,
    loadingDone,
    loadingTotal,
    musicSources,
    isReauthorizing,
    tracks,
    trackMap,
    isFileLaunch,
    disposeLibrary,
    restoreCachedLibrary,
    handleLaunchedMusicFiles,
    removeSource,
    addSource,
    reauthorizeAll,
  };
});
