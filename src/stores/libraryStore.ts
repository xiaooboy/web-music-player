import type { FileEntry, RuntimeMusicSource, Track } from "@/types";
import {
  clearPersistedMusicSources,
  clearTrackCache,
  loadLastFolderName,
  loadPersistedMusicSources,
  savePersistedMusicSources,
  saveTrackCache,
} from "@/utils/persistence";
import {
  blobToBase64,
  isAudioFile,
  revokeTrackResources,
  supportsDirectoryPicker,
  urlBlobMap,
} from "@/utils/media";
import {
  buildCacheKeyFromSources,
  checkSourcePermissions,
  entriesToTracks,
  hydrateTrackAndParseSource,
  initTracksFromCache,
  loadSourcesData,
} from "@/utils/libraryBuilder";
import { defineStore } from "pinia";
import { ref, shallowRef, watch } from "vue";
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
  const tracks = shallowRef<Track[]>([]);

  const launchedFilePlaybackActive = ref(false);

  function updateBuildToken() {
    return ++libraryBuildToken;
  }

  async function restoreCachedLibrary() {
    if (!supportsDirectoryPicker() && loadLastFolderName()) return;
    const persistedSources = await loadPersistedMusicSources();
    if (!persistedSources.length) return;
    const cacheKey = buildCacheKeyFromSources(
      persistedSources.map((source) => source.name),
    );
    tracks.value = await initTracksFromCache(cacheKey);
    const restoredSources = await checkSourcePermissions(persistedSources);
    musicSources.value = restoredSources;
    const avaliable = restoredSources.some((source) => source.available);
    if (!avaliable) return;
    await startBuild();
  }

  async function startBuild() {
    const buildToken = updateBuildToken();
    console.log(`startBuild: ${buildToken}`);
    const timeLable = `build-${buildToken}`;
    console.time(timeLable);
    const isStale = () => buildToken !== libraryBuildToken;
    const {
      hydratedTracks,
      allEntries,
      cacheKey: newCacheKey,
    } = await hydrateTrackAndParseSource(musicSources.value, tracks.value);
    console.timeLog(timeLable);
    if (isStale()) return;
    if (!musicSources.value.length || !allEntries.length) {
      loadingDone.value = loadingTotal.value = 0;
      loading.value = false;
      revokeTrackResources(tracks.value);
      updatePlayableTracks([]);
      return;
    }
    if (hydratedTracks.length) updatePlayableTracks(hydratedTracks);
    const finalTracks = await entriesToTracks(allEntries, isStale, {
      onProgress: ({ done, total }) => {
        loading.value = done !== total;
        loadingDone.value = done;
        loadingTotal.value = total;
      },
    });
    if (finalTracks) {
      revokeTrackResources(tracks.value);
      updatePlayableTracks(finalTracks);
      console.timeLog(timeLable);
      persistTracks(newCacheKey).then(() => console.timeLog(timeLable));
    }
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
    if (isRepeat) return;
    musicSources.value = [...musicSources.value, source];
    persistHandleSources();
    startBuild();
  }

  function removeSource(sourceId: string) {
    musicSources.value = musicSources.value.filter(
      (source) => source.id !== sourceId,
    );
    persistHandleSources();
    startBuild();
  }

  async function persistHandleSources() {
    const persistedSources = musicSources.value
      .filter((source) => source.persistent && source.handle)
      .map((source) => ({
        id: source.id,
        name: source.name,
        handle: source.handle!,
      }));

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
    const saveTracks = await Promise.all(
      tracks.value.map(async (track) => {
        let url = track.coverUrl;
        if (urlBlobMap.has(track.coverUrl)) {
          url = await blobToBase64(urlBlobMap.get(track.coverUrl)!);
        }
        return { ...track, coverUrl: url };
      }),
    );
    urlBlobMap.clear();
    await saveTrackCache({
      sourceKey: cacheKey,
      tracks: saveTracks,
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
    const { allEntries } = await loadSourcesData(musicSources.value);
    const finalTracks = await entriesToTracks(allEntries, () => false);
    if (finalTracks) tracks.value = finalTracks;
  }
  /** 更新 tracks，通知其他模块更新 */
  function updatePlayableTracks(updatedTracks: Track[]) {
    tracks.value = updatedTracks;
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
    tracks,
    launchedFilePlaybackActive,
    disposeLibrary,
    restoreCachedLibrary,
    handleLaunchedMusicFiles,
    removeSource,
    addSource,
  };
});
