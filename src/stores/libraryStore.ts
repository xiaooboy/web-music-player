import type { TrackMap, FileEntry, RuntimeMusicSource, Track } from "@/types";
import {
  clearPersistedMusicSources,
  clearTrackCache,
  loadLastFolderName,
  loadPersistedMusicSources,
  PersistedMusicSource,
  savePersistedMusicSources,
  saveTrackCache,
} from "@/utils/persistence";
import {
  isAudioFile,
  revokeTrackResources,
  supportsDirectoryPicker,
  ensureDirectoryPermission,
} from "@/utils/media";
import {
  buildCacheKeyFromSources,
  checkSourcePermissions,
  entriesToTracks,
  parseSource,
  initTracksFromCache,
  sourcesToEntries,
  diffTracks,
} from "@/utils/libraryBuilder";
import { defineStore } from "pinia";
import { ref, shallowRef, watch, computed } from "vue";
import { useFavoriteStore } from "./favoriteStore";
import { useAlbumStore } from "./albumStore";
import { usePlayerStore } from "./playerStore";

export const useLibraryStore = defineStore("library", () => {
  let libraryBuildToken = 0;
  const favoriteStore = useFavoriteStore();
  const albumStore = useAlbumStore();
  const playerStore = usePlayerStore();

  const loading = ref(false);
  const loadingDone = ref(0);
  const loadingTotal = ref(0);
  const libraryStatus = ref("还没有载入音乐");
  const musicSources = shallowRef<RuntimeMusicSource[]>([]);

  const isReauthorizing = shallowRef(false);

  /* Track map for caching*/
  const trackMap: TrackMap = new Map();

  const tracks = shallowRef<Track[]>([]);

  const launchedFilePlaybackActive = ref(false);

  function updateBuildToken() {
    return ++libraryBuildToken;
  }

  async function restoreCachedLibrary() {
    if (!supportsDirectoryPicker() && loadLastFolderName()) return;
    const persistedSources = await loadPersistedMusicSources();
    if (!persistedSources.length) return;
    const cacheKey = buildCacheKeyFromSources(persistedSources);
    console.time();
    tracks.value = await initTracksFromCache(cacheKey);
    console.timeEnd();
    updateTrackMap(tracks.value);
    const restoredSources = await checkSourcePermissions(persistedSources);
    musicSources.value = restoredSources;
    persistHandleSources();
    const avaliable = restoredSources.some((source) => source.available);
    if (!avaliable) return;
    await startBuild();
  }
  function updateTrackMap(tracks: Track[]) {
    for (const track of tracks) {
      trackMap.set(track.id, track);
    }
  }
  async function startBuild() {
    const buildToken = updateBuildToken();
    const buildVersion = `build_verison${buildToken}`;
    console.time(buildVersion);
    const isStale = () => buildToken !== libraryBuildToken;
    const { entries, cacheKey: newCacheKey } = await parseSource(
      musicSources.value,
    );
    console.timeLog(buildVersion, "parseSource");
    if (isStale()) return;
    if (!musicSources.value.length || !entries.length) {
      loadingDone.value = loadingTotal.value = 0;
      loading.value = false;
      revokeTrackResources(tracks.value);
      updatePlayableTracks([]);
      return;
    }
    const finalTracks = await entriesToTracks(entries, isStale, {
      onProgress: ({ done, total }) => {
        loading.value = done !== total;
        loadingDone.value = done;
        loadingTotal.value = total;
      },
      trackMap,
    });
    // build 失效
    if (!finalTracks) return;
    const { removed } = diffTracks(tracks.value, finalTracks);
    revokeTrackResources(removed);
    updatePlayableTracks(finalTracks);
    console.timeLog(buildVersion, "entriesToTracks");
    persistTracks(newCacheKey).then(() => {
      console.timeLog(buildVersion, "persistTracks");
      console.timeEnd(buildVersion);
    });
  }

  function disposeLibrary() {
    revokeTrackResources(tracks.value);
    updatePlayableTracks([]);
    updateBuildToken();
  }

  function addSource(source: RuntimeMusicSource) {
    const key = `${source.kind || "directory"}:${source.name}:${source.persistent ? "persistent" : "temp"}`;
    const isRepeat = musicSources.value.find(
      (source) =>
        `${source.kind || "directory"}:${source.name}:${source.persistent ? "persistent" : "temp"}` ===
        key,
    );
    if (isRepeat || launchedFilePlaybackActive.value) return;
    musicSources.value = [...musicSources.value, source];
    persistHandleSources();
    startBuild();
  }

  function removeSource(sourceId: string) {
    musicSources.value = musicSources.value.filter(
      (source) => source.id !== sourceId,
    );
    if (launchedFilePlaybackActive.value) return;
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

  async function persistTracks(cacheKey: string) {
    if (!tracks.value.length || !cacheKey) {
      await clearTrackCache();
      return;
    }
    await saveTrackCache({
      sourceKey: cacheKey,
      tracks: tracks.value.map(({ coverUrl: _, file: __, ...rest }) => rest),
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
    const entries = await sourcesToEntries(musicSources.value);
    const finalTracks = await entriesToTracks(entries, () => false);
    if (!finalTracks) return;
    tracks.value = finalTracks;
    playerStore.setPlaylist(finalTracks);
    favoriteStore.setFavoriteSources(finalTracks);
    albumStore.updateAlbumWithTracks(finalTracks);
    playerStore.playTrack(0, true);
  }

  async function reauthorizeAll() {
    const pending = musicSources.value.filter(
      (s) => s.persistent && !s.available && s.handle,
    );
    if (!pending.length) {
      alert("没有需要重新授权的音乐源");
      return;
    }
    isReauthorizing.value = true;
    if (
      !confirm(
        `即将为 ${pending.length} 个目录请求权限。浏览器可能会为每个目录弹出授权对话框，是否继续？`,
      )
    )
      return;
    let needRebuild = false;
    try {
      for (const source of pending) {
        const permission = await ensureDirectoryPermission(
          source.handle!,
          true,
        );
        const available = permission === "granted";
        musicSources.value = musicSources.value.map((s) =>
          s.id === source.id ? { ...s, available } : s,
        );
        if (available) needRebuild = true;
        // await persistHandleSources();
        if (permission === "denied") {
          alert(`目录 ${source.name} 的授权被拒绝`);
        }
      }
    } catch (e) {
      // eslint-disable-next-line no-console
      console.warn("reauthorizeAll failed", e);
    } finally {
      isReauthorizing.value = false;
      if (needRebuild) await startBuild();
    }
  }

  /** 更新 tracks，通知其他模块更新 */
  function updatePlayableTracks(updatedTracks: Track[]) {
    tracks.value = updatedTracks;
    updateTrackMap(updatedTracks);
    favoriteStore.setFavoriteSources(updatedTracks);
    albumStore.updateAlbumWithTracks(updatedTracks);
    const type = playerStore.playSourceType;
    if (type === "playlist") {
      playerStore.setPlaylist(updatedTracks);
    }
    // 其他 store 与 player g关联内部处理
  }
  return {
    loading,
    loadingDone,
    loadingTotal,
    libraryStatus,
    musicSources,
    isReauthorizing,
    tracks,
    launchedFilePlaybackActive,
    disposeLibrary,
    restoreCachedLibrary,
    handleLaunchedMusicFiles,
    removeSource,
    addSource,
    reauthorizeAll,
  };
});
