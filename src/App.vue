<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watchEffect } from "vue";
import { Search } from "lucide-vue-next";
import AlbumPanel from "./components/AlbumPanel.vue";
import LibraryPanel from "./components/LibraryPanel.vue";
import LibraryManagementPanel from "./components/LibraryManagementPanel.vue";
import MusicDetailPanel from "./components/MusicDetailPanel.vue";
import PlayerDock from "./components/PlayerDock.vue";
import SidebarPanel from "./components/SidebarPanel.vue";
import type { FileEntry, MusicSource, RepeatMode, Track } from "./types";
import {
  buildTrack,
  buildLyricsLookup,
  collectDirectoryFiles,
  coverUrlToDataUrl,
  ensureDirectoryPermission,
  entriesFromInput,
  formatTime,
  getLyricsLookupKey,
  isAudioFile,
  parseLyricsText,
  pickDirectory,
  revokeTrackResources,
  supportsDirectoryPicker,
} from "./utils/media";
import {
  clearTrackCache,
  loadLikedTrackIds,
  clearPersistedMusicSources,
  loadTrackCache,
  loadLastFolderName,
  loadPersistedMusicSources,
  saveLikedTrackIds,
  saveLastFolderName,
  savePersistedMusicSources,
  saveTrackCache,
  type CachedTrackRecord,
} from "./utils/persistence";

const audioRef = ref<HTMLAudioElement | null>(null);
const folderInputRef = ref<HTMLInputElement | null>(null);
const playlistScrollRef = ref<HTMLElement | null>(null);
type RuntimeMusicSource = MusicSource & {
  handle?: FileSystemDirectoryHandle;
  entries?: FileEntry[];
};
type PlaybackScope =
  | { type: "all" }
  | { type: "favorites" }
  | { type: "album"; albumName: string };

const tracks = ref<Track[]>([]);
const musicSources = ref<RuntimeMusicSource[]>([]);
const currentTrackIndex = ref(-1);
const activeTrackPath = ref("");
const currentAudioUrl = ref("");
const isShuffle = ref(false);
const repeatMode = ref<RepeatMode>("off");
const volume = ref(0.82);
const searchQuery = ref("");
const folderName = ref("");
const loading = ref(false);
const loadingDone = ref(0);
const loadingTotal = ref(0);
const libraryStatus = ref("还没有载入音乐");
const isPlaying = ref(false);
const progressPercent = ref(0);
const currentTimeSeconds = ref(0);
const currentView = ref<"library" | "detail">("library");
const activeSection = ref<"playlist" | "favorites" | "albums" | "library-management">("playlist");
const selectedAlbumName = ref("");
const playbackScope = ref<PlaybackScope>({ type: "all" });
const likedTrackIds = ref<string[]>(loadLikedTrackIds());
const isPlaylistScrolling = ref(false);
let lastManualTrackChangeAt = 0;
let libraryBuildToken = 0;
let playlistScrollHideTimer: ReturnType<typeof setTimeout> | null = null;

const currentTrack = computed(() => tracks.value[currentTrackIndex.value] || null);
const albums = computed(() => {
  const albumMap = new Map<
    string,
    {
      name: string;
      artistSet: Set<string>;
      duration: number;
      coverUrl: string;
      tracks: Array<{ track: Track; index: number }>;
    }
  >();

  tracks.value.forEach((track, index) => {
    const albumName = track.album.trim() || "未知专辑";
    const artistName = track.artist.trim() || "未知歌手";
    const existingAlbum = albumMap.get(albumName);

    if (existingAlbum) {
      existingAlbum.artistSet.add(artistName);
      existingAlbum.duration += track.duration;
      if (!existingAlbum.coverUrl && track.coverUrl) {
        existingAlbum.coverUrl = track.coverUrl;
      }
      existingAlbum.tracks.push({ track, index });
      return;
    }

    albumMap.set(albumName, {
      name: albumName,
      artistSet: new Set([artistName]),
      duration: track.duration,
      coverUrl: track.coverUrl,
      tracks: [{ track, index }],
    });
  });

  return [...albumMap.values()]
    .map((album) => ({
      name: album.name,
      artistLabel: [...album.artistSet].join(" / "),
      trackCount: album.tracks.length,
      duration: album.duration,
      coverUrl: album.coverUrl,
      tracks: album.tracks,
    }))
    .sort((left, right) => left.name.localeCompare(right.name, "zh-Hans-CN"));
});
const scopedTrackIndexes = computed(() => {
  const scope = playbackScope.value;
  if (scope.type === "favorites") {
    return favoriteTracks.value.map(({ index }) => index);
  }

  if (scope.type !== "album") {
    return tracks.value.map((_, index) => index);
  }

  const activeAlbum = albums.value.find((album) => album.name === scope.albumName);
  return activeAlbum ? activeAlbum.tracks.map(({ index }) => index) : tracks.value.map((_, index) => index);
});
const likedTrackIdSet = computed(() => new Set(likedTrackIds.value));
const favoriteTracks = computed(() =>
  tracks.value
    .map((track, index) => ({ track, index }))
    .filter(({ track }) => likedTrackIdSet.value.has(track.id)),
);
const visibleFavoriteTracks = computed(() => {
  if (!searchQuery.value.trim()) {
    return favoriteTracks.value;
  }

  const needle = searchQuery.value.trim().toLowerCase();
  return favoriteTracks.value.filter(({ track }) => {
    const haystack = `${track.title} ${track.artist} ${track.album} ${track.relativePath}`.toLowerCase();
    return haystack.includes(needle);
  });
});
const isCurrentTrackLiked = computed(() => (currentTrack.value ? likedTrackIdSet.value.has(currentTrack.value.id) : false));
const visibleTracks = computed(() => {
  if (!searchQuery.value.trim()) {
    return tracks.value.map((track, index) => ({ track, index }));
  }

  const needle = searchQuery.value.trim().toLowerCase();
  return tracks.value
    .map((track, index) => ({ track, index }))
    .filter(({ track }) => {
      const haystack = `${track.title} ${track.artist} ${track.album} ${track.relativePath}`.toLowerCase();
      return haystack.includes(needle);
    });
});
const playlistStatus = computed(() => {
  if (tracks.value.length) {
    return `共 ${tracks.value.length} 首歌曲`;
  }

  return libraryStatus.value;
});

const repeatLabel = computed(() => {
  if (repeatMode.value === "one") {
    return "单曲循环";
  }

  return "顺序播放";
});

const playbackMode = computed<"off" | "one" | "shuffle">(() => {
  if (isShuffle.value) {
    return "shuffle";
  }

  return repeatMode.value;
});
const playbackModeLabel = computed(() => {
  if (isShuffle.value) {
    return "随机播放";
  }

  return repeatLabel.value;
});
const libraryHint = computed(() =>
  supportsDirectoryPicker()
    ? musicSources.value.some((source) => source.persistent)
      ? "已支持多个音乐源；缓存目录下次会自动恢复，失效目录会提示重新授权。"
      : "当前浏览器支持目录授权，添加后会把多个音乐源一起缓存。"
    : "当前环境将使用系统目录选择器导入；若要直接目录授权并自动恢复，请在 Chrome 或 Edge 的 localhost / HTTPS 环境打开。",
);
const sourceNamesLabel = computed(() =>
  musicSources.value.length ? musicSources.value.map((source) => source.name).join(" · ") : "",
);
const currentTimeLabel = computed(() => formatTime(currentTimeSeconds.value));
const totalTimeLabel = computed(() => {
  const audio = audioRef.value;
  if (audio && Number.isFinite(audio.duration) && audio.duration > 0) {
    return formatTime(audio.duration);
  }

  return formatTime(currentTrack.value?.duration || 0);
});
const volumePercent = computed(() => Math.round(volume.value * 100));
const currentLyricsLines = computed(() => parseLyricsText(currentTrack.value?.lyricsText || ""));
const hasTimedLyrics = computed(() => currentLyricsLines.value.some((line) => line.time !== null));
const activeLyricsIndex = computed(() => {
  if (!currentLyricsLines.value.length || !hasTimedLyrics.value) {
    return -1;
  }

  let activeIndex = -1;
  for (let index = 0; index < currentLyricsLines.value.length; index += 1) {
    const time = currentLyricsLines.value[index].time;
    if (time !== null && time <= currentTimeSeconds.value + 0.05) {
      activeIndex = index;
    }
  }

  return activeIndex;
});

watchEffect(() => {
  const availableAlbums = albums.value;
  if (!availableAlbums.length) {
    selectedAlbumName.value = "";
    return;
  }

  if (selectedAlbumName.value && availableAlbums.some((album) => album.name === selectedAlbumName.value)) {
    return;
  }

  const currentAlbumName = currentTrack.value?.album.trim() || "未知专辑";
  selectedAlbumName.value = availableAlbums.some((album) => album.name === currentAlbumName)
    ? currentAlbumName
    : availableAlbums[0].name;
});

watchEffect(() => {
  const scope = playbackScope.value;
  if (scope.type === "favorites") {
    if (!favoriteTracks.value.length) {
      playbackScope.value = { type: "all" };
    }
    return;
  }

  if (scope.type !== "album") {
    return;
  }

  if (!albums.value.some((album) => album.name === scope.albumName)) {
    playbackScope.value = { type: "all" };
  }
});

function buildSourceCacheKey(sourceNames: string[]) {
  return [...sourceNames].sort((left, right) => left.localeCompare(right, "zh-Hans-CN")).join("::").toLowerCase();
}

function createCachedTrack(record: CachedTrackRecord): Track {
  return {
    ...record,
    file: new File([], record.title || record.relativePath || "cached-track"),
    coverUrl: record.coverUrl || "",
    isPlayable: false,
  };
}

async function serializeTrackCache(records: Track[]) {
  return Promise.all(
    records.map(async (track) => ({
      id: track.id,
      relativePath: track.relativePath,
      title: track.title,
      artist: track.artist,
      album: track.album,
      coverUrl: await coverUrlToDataUrl(track.coverUrl),
      duration: track.duration,
      format: track.format,
      lyricsText: track.lyricsText,
    })),
  );
}

function hydrateCachedTracks(entries: FileEntry[], records: CachedTrackRecord[]): Track[] {
  const entryMap = new Map(
    entries
      .filter(({ file }) => isAudioFile(file.name, file.type))
      .map((entry) => [entry.relativePath.toLowerCase(), entry] as const),
  );

  return records.reduce<Track[]>((result, record) => {
    const entry = entryMap.get(record.relativePath.toLowerCase());
    if (!entry) {
      return result;
    }

    result.push({
        ...record,
        file: entry.file,
        coverUrl: record.coverUrl || "",
        isPlayable: true,
      });

    return result;
  }, []);
}

watchEffect(() => {
  if (audioRef.value) {
    audioRef.value.volume = volume.value;
  }
});

async function openFolder() {
  if (loading.value) {
    return;
  }

  if (supportsDirectoryPicker()) {
    try {
      const handle = await pickDirectory();
      const nextSource: RuntimeMusicSource = {
        id: crypto.randomUUID(),
        name: handle.name,
        persistent: true,
        available: true,
        handle,
      };
      musicSources.value = dedupeSources([...musicSources.value, nextSource]);
      await persistHandleSources();
      saveLastFolderName(nextSource.name);
      await rebuildLibrary();
      return;
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") {
        return;
      }

      setStatus("目录授权不可用，已回退到系统文件选择器。");
    }
  }

  openFallbackPicker();
}

function openFallbackPicker() {
  if (loading.value) {
    return;
  }

  folderInputRef.value?.click();
}

async function handleFolderInput(event: Event) {
  const input = event.target as HTMLInputElement;
  const entries = entriesFromInput(input.files);
  input.value = "";

  if (!entries.length) {
    setStatus("没有检测到可播放的音频文件。");
    return;
  }

  const nextFolderName = entries[0].relativePath.split("/")[0] || "本地音乐";
  const nextSource: RuntimeMusicSource = {
    id: crypto.randomUUID(),
    name: nextFolderName,
    persistent: false,
    available: true,
    entries,
  };
  musicSources.value = dedupeSources([...musicSources.value, nextSource]);
  saveLastFolderName(nextFolderName);
  await rebuildLibrary();
  setStatus(`已添加临时音乐源“${nextFolderName}”；关闭后需要重新导入该来源。`);
}

async function loadLibrary(
  entries: FileEntry[],
  nextFolderName: string,
  buildToken: number,
  options?: { preserveVisibleTracks?: boolean; cacheKey?: string | null },
) {
  if (buildToken !== libraryBuildToken) {
    return;
  }

  const preserveVisibleTracks = Boolean(options?.preserveVisibleTracks);
  const previousTracks = preserveVisibleTracks ? [...tracks.value] : [];

  if (!preserveVisibleTracks) {
    disposeLibrary();
  }

  const audioEntries = entries.filter(({ file }) => isAudioFile(file.name, file.type));
  if (!audioEntries.length) {
    if (buildToken === libraryBuildToken) {
      setStatus("没有检测到可播放的音频文件。");
    }
    return;
  }

  loading.value = true;
  loadingDone.value = 0;
  loadingTotal.value = entries.length;
  folderName.value = nextFolderName;
  searchQuery.value = "";

  const lyricsLookup = await buildLyricsLookup(entries);
  const sortedEntries = [...audioEntries].sort((a, b) =>
    a.relativePath.localeCompare(b.relativePath, "zh-Hans-CN", { numeric: true }),
  );

  setStatus(`正在扫描 ${sortedEntries.length} 首歌曲...`);

  const parsedTracks: Track[] = [];
  for (let index = 0; index < sortedEntries.length; index += 1) {
    if (buildToken !== libraryBuildToken) {
      return;
    }

    const track = await buildTrack(
      sortedEntries[index],
      index,
      nextFolderName,
      lyricsLookup.get(getLyricsLookupKey(sortedEntries[index].relativePath)) || "",
    );
    parsedTracks.push(track);

    if (!preserveVisibleTracks) {
      tracks.value = [...parsedTracks];
      if (currentTrackIndex.value === -1) {
        currentTrackIndex.value = 0;
        activeTrackPath.value = parsedTracks[0]?.relativePath || "";
      }
    }

    loadingDone.value = index + 1;
    setStatus(`正在解析 ${loadingDone.value} / ${loadingTotal.value} 首歌曲...`);
  }

  if (buildToken !== libraryBuildToken) {
    return;
  }

  loading.value = false;
  loadingDone.value = 0;
  loadingTotal.value = 0;

  if (preserveVisibleTracks) {
    const targetTrackPath = activeTrackPath.value || currentTrack.value?.relativePath || "";
    revokeTrackResources(previousTracks);
    tracks.value = [...parsedTracks];

    if (!tracks.value.length) {
      currentTrackIndex.value = -1;
      activeTrackPath.value = "";
    } else {
      const preservedIndex = targetTrackPath
        ? tracks.value.findIndex((track) => track.relativePath === targetTrackPath)
        : -1;

      if (preservedIndex !== -1) {
        currentTrackIndex.value = preservedIndex;
        activeTrackPath.value = tracks.value[preservedIndex]?.relativePath || "";
      } else if (currentTrackIndex.value === -1) {
        currentTrackIndex.value = 0;
        activeTrackPath.value = tracks.value[0]?.relativePath || "";
      } else if (currentTrackIndex.value >= tracks.value.length) {
        currentTrackIndex.value = tracks.value.length - 1;
        activeTrackPath.value = tracks.value[currentTrackIndex.value]?.relativePath || "";
      }
    }
  }

  if (!tracks.value.length) {
    currentTrackIndex.value = -1;
    activeTrackPath.value = "";
  } else if (currentTrackIndex.value === -1) {
    currentTrackIndex.value = 0;
    activeTrackPath.value = tracks.value[0]?.relativePath || "";
  } else if (currentTrackIndex.value >= tracks.value.length) {
    currentTrackIndex.value = tracks.value.length - 1;
    activeTrackPath.value = tracks.value[currentTrackIndex.value]?.relativePath || "";
  }

  if (tracks.value.length) {
    if (options?.cacheKey) {
      await saveTrackCache({
        sourceKey: options.cacheKey,
        tracks: await serializeTrackCache(tracks.value),
      });
    }

    setStatus(`已导入 ${tracks.value.length} 首歌曲`);
    updateMediaSession();
  } else {
    setStatus("没有导入到任何歌曲。");
  }
}

async function rebuildLibrary(options?: { preserveVisibleTracks?: boolean }) {
  const buildToken = ++libraryBuildToken;
  const allEntries: FileEntry[] = [];
  const activeSourceNames: string[] = [];
  const activePersistentSourceNames: string[] = [];

  setStatus("正在刷新音乐源...");

  for (const source of musicSources.value) {
    let sourceEntries = source.entries || [];
    if (source.handle && source.available) {
      sourceEntries = await collectDirectoryFiles(source.handle);
      source.entries = sourceEntries;
    }

    if (buildToken !== libraryBuildToken) {
      return;
    }

    if (!sourceEntries.length) {
      continue;
    }

    activeSourceNames.push(source.name);
    if (source.persistent && source.available) {
      activePersistentSourceNames.push(source.name);
    }
    allEntries.push(
      ...sourceEntries.map((entry) => ({
        file: entry.file,
        relativePath: `${source.name}/${entry.relativePath}`,
      })),
    );
  }

  if (options?.preserveVisibleTracks && tracks.value.some((track) => !track.isPlayable) && allEntries.length) {
    const cachedVisibleTracks = tracks.value.filter((track) => !track.isPlayable) as CachedTrackRecord[];
    const hydratedTracks = hydrateCachedTracks(allEntries, cachedVisibleTracks);

    if (hydratedTracks.length) {
      const previousTrackPath = activeTrackPath.value || currentTrack.value?.relativePath || "";
      revokeTrackResources(tracks.value);
      tracks.value = hydratedTracks;
      const preservedIndex = previousTrackPath
        ? hydratedTracks.findIndex((track) => track.relativePath === previousTrackPath)
        : -1;
      currentTrackIndex.value = preservedIndex !== -1 ? preservedIndex : hydratedTracks.length ? 0 : -1;
      activeTrackPath.value = currentTrackIndex.value !== -1 ? hydratedTracks[currentTrackIndex.value]?.relativePath || "" : "";
      setStatus(`已恢复可播放曲库，后台正在刷新 ${hydratedTracks.length} 首歌曲...`);
    }
  }

  if (!allEntries.length) {
    if (buildToken !== libraryBuildToken) {
      return;
    }

    disposeLibrary();
    folderName.value = "";
    setStatus("当前没有可播放的音乐源。");
    return;
  }

  await loadLibrary(allEntries, activeSourceNames.join(" · "), buildToken, {
    preserveVisibleTracks: options?.preserveVisibleTracks,
    cacheKey:
      activeSourceNames.length && activeSourceNames.length === activePersistentSourceNames.length
        ? buildSourceCacheKey(activePersistentSourceNames)
        : null,
  });
}

function dedupeSources(sources: RuntimeMusicSource[]) {
  const lookup = new Map<string, RuntimeMusicSource>();
  for (const source of sources) {
    const key = `${source.name}:${source.persistent ? "persistent" : "temp"}`;
    lookup.set(key, source);
  }

  return [...lookup.values()];
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

function togglePlay() {
  if (!tracks.value.length) {
    void openFolder();
    return;
  }

  const audio = audioRef.value;
  if (!audio) {
    return;
  }

  if (currentTrackIndex.value === -1) {
    playTrack(scopedTrackIndexes.value[0] ?? 0, true);
    return;
  }

  if (!currentTrack.value?.isPlayable) {
    setStatus("已显示缓存曲库，后台仍在刷新真实文件，请稍候。");
    return;
  }

  if (!audio.src) {
    playTrack(currentTrackIndex.value, true);
    return;
  }

  if (audio.paused) {
    audio.play().catch(() => {
      setStatus("浏览器阻止了自动播放，请再点击一次播放。");
    });
    return;
  }

  audio.pause();
}

function playTrack(index: number, autoplay = true) {
  const audio = audioRef.value;
  const track = tracks.value[index];
  if (!audio || !track) {
    return;
  }

  if (!track.isPlayable) {
    currentTrackIndex.value = index;
    activeTrackPath.value = track.relativePath;
    setStatus("已显示缓存曲库，后台仍在刷新真实文件，请稍候。");
    return;
  }

  const isSameTrack = currentTrackIndex.value === index;
  currentTrackIndex.value = index;
  activeTrackPath.value = track.relativePath;

  if (!isSameTrack || !audio.src) {
    if (currentAudioUrl.value) {
      URL.revokeObjectURL(currentAudioUrl.value);
    }

    currentAudioUrl.value = URL.createObjectURL(track.file);
    audio.src = currentAudioUrl.value;
  }

  updateMediaSession();
  syncProgress();

  if (!autoplay) {
    audio.load();
    return;
  }

  audio.play().catch(() => {
    setStatus("浏览器阻止了自动播放，请手动点击播放。");
  });
}

function handleSelectTrack(index: number) {
  playbackScope.value = { type: "all" };
  playTrack(index, true);
}

function handleFavoriteTrackSelect(index: number) {
  playbackScope.value = { type: "favorites" };
  playTrack(index, true);
}

function handleAlbumTrackSelect(index: number, albumName: string) {
  playbackScope.value = { type: "album", albumName };
  playTrack(index, true);
}

function handlePlayAlbum(albumName: string) {
  const targetAlbum = albums.value.find((album) => album.name === albumName);
  if (!targetAlbum?.tracks.length) {
    return;
  }

  selectedAlbumName.value = albumName;
  playbackScope.value = { type: "album", albumName };
  playTrack(targetAlbum.tracks[0].index, true);
}

function setCurrentView(nextView: "library" | "detail") {
  if (currentView.value === nextView) {
    return;
  }

  currentView.value = nextView;
}

function handlePrevious() {
  const audio = audioRef.value;
  if (!audio || !tracks.value.length) {
    return;
  }

  if (audio.currentTime > 3) {
    audio.currentTime = 0;
    syncProgress();
    return;
  }

  if (repeatMode.value === "one" && currentTrackIndex.value !== -1) {
    playTrack(currentTrackIndex.value, true);
    return;
  }

  const targetIndex = getAdjacentIndex(-1);
  if (targetIndex !== null) {
    playTrack(targetIndex, true);
  }
}

function goToPreviousTrack() {
  if (!tracks.value.length) {
    return;
  }

  const targetIndex = getAdjacentIndex(-1);
  if (targetIndex !== null) {
    playTrack(targetIndex, true);
  }
}

function canTriggerManualTrackChange() {
  const now = Date.now();
  if (now - lastManualTrackChangeAt < 280) {
    return false;
  }

  lastManualTrackChangeAt = now;
  return true;
}

function handlePreviousControl() {
  if (!canTriggerManualTrackChange()) {
    return;
  }

  goToPreviousTrack();
}

function advanceTrack(step: number) {
  const audio = audioRef.value;
  if (!audio || !tracks.value.length) {
    return;
  }

  const targetIndex = getAdjacentIndex(step);
  if (targetIndex === null) {
    audio.pause();
    audio.currentTime = 0;
    syncProgress();
    return;
  }

  playTrack(targetIndex, true);
}

function handleNextControl() {
  if (!canTriggerManualTrackChange()) {
    return;
  }

  advanceTrack(1);
}

function getAdjacentIndex(step: number) {
  const trackIndexes = scopedTrackIndexes.value;
  if (!trackIndexes.length) {
    return null;
  }

  if (isShuffle.value) {
    if (trackIndexes.length === 1) {
      return currentTrackIndex.value === -1 ? trackIndexes[0] : currentTrackIndex.value;
    }

    let nextIndex = currentTrackIndex.value;
    while (nextIndex === currentTrackIndex.value) {
      nextIndex = trackIndexes[Math.floor(Math.random() * trackIndexes.length)];
    }

    return nextIndex;
  }

  const currentScopedIndex = currentTrackIndex.value === -1 ? -1 : trackIndexes.indexOf(currentTrackIndex.value);
  const baseIndex = currentScopedIndex === -1 ? (step > 0 ? -1 : 0) : currentScopedIndex;
  const nextIndex = baseIndex + step;

  if (nextIndex >= trackIndexes.length) {
    return trackIndexes[0];
  }

  if (nextIndex < 0) {
    return trackIndexes[trackIndexes.length - 1];
  }

  return trackIndexes[nextIndex];
}

function cycleRepeatMode() {
  repeatMode.value = repeatMode.value === "one" ? "off" : "one";
}

function cyclePlaybackMode() {
  if (isShuffle.value) {
    isShuffle.value = false;
    repeatMode.value = "off";
    return;
  }

  if (repeatMode.value === "off") {
    repeatMode.value = "one";
    return;
  }

  repeatMode.value = "off";
  isShuffle.value = true;
}

function seekToPercent(percent: number) {
  const audio = audioRef.value;
  if (!audio || !Number.isFinite(audio.duration) || audio.duration <= 0) {
    return;
  }

  audio.currentTime = (percent / 100) * audio.duration;
  syncProgress();
}

function setVolume(percent: number) {
  volume.value = percent / 100;
}

function handleTimeUpdate() {
  syncProgress();
}

function handleLoadedMetadata() {
  const audio = audioRef.value;
  const track = currentTrack.value;
  if (!audio || !track) {
    return;
  }

  if (!track.duration && Number.isFinite(audio.duration)) {
    track.duration = audio.duration;
  }

  syncProgress();
  updateMediaSession();
}

function handleAudioPlay() {
  isPlaying.value = true;
}

function handleAudioPause() {
  isPlaying.value = false;
}

function handleAudioEnded() {
  if (repeatMode.value === "one" && currentTrackIndex.value !== -1) {
    playTrack(currentTrackIndex.value, true);
    return;
  }

  advanceTrack(1);
}

function syncProgress() {
  const audio = audioRef.value;
  if (!audio) {
    currentTimeSeconds.value = 0;
    progressPercent.value = 0;
    return;
  }

  currentTimeSeconds.value = audio.currentTime || 0;
  const duration = Number.isFinite(audio.duration) && audio.duration > 0 ? audio.duration : currentTrack.value?.duration || 0;
  progressPercent.value = duration > 0 ? (currentTimeSeconds.value / duration) * 100 : 0;
}

function updateMediaSession() {
  const track = currentTrack.value;
  if (!track || !audioRef.value || !("mediaSession" in navigator) || typeof MediaMetadata === "undefined") {
    return;
  }

  navigator.mediaSession.metadata = new MediaMetadata({
    title: track.title,
    artist: track.artist,
    album: track.album,
    artwork: track.coverUrl ? [{ src: track.coverUrl, sizes: "512x512", type: "image/jpeg" }] : [],
  });

  navigator.mediaSession.setActionHandler("play", () => {
    if (audioRef.value?.paused) {
      togglePlay();
    }
  });
  navigator.mediaSession.setActionHandler("pause", () => {
    if (audioRef.value && !audioRef.value.paused) {
      audioRef.value.pause();
    }
  });
  navigator.mediaSession.setActionHandler("previoustrack", handlePrevious);
  navigator.mediaSession.setActionHandler("nexttrack", () => advanceTrack(1));
}

function disposeLibrary() {
  const audio = audioRef.value;
  if (audio) {
    audio.pause();
    audio.removeAttribute("src");
    audio.load();
  }

  if (currentAudioUrl.value) {
    URL.revokeObjectURL(currentAudioUrl.value);
  }

  revokeTrackResources(tracks.value);
  tracks.value = [];
  currentAudioUrl.value = "";
  currentTrackIndex.value = -1;
  activeTrackPath.value = "";
  isPlaying.value = false;
  currentTimeSeconds.value = 0;
  progressPercent.value = 0;
  currentView.value = "library";
}

function openDetail() {
  if (!currentTrack.value) {
    return;
  }

  setCurrentView("detail");
}

function closeDetail() {
  setCurrentView("library");
}

function seekToLyricsLine(index: number) {
  const line = currentLyricsLines.value[index];
  if (!line || line.time === null) {
    return;
  }

  const audio = audioRef.value;
  if (!audio) {
    return;
  }

  audio.currentTime = line.time;
  syncProgress();
}

function setStatus(message: string) {
  libraryStatus.value = message;
}

async function clearCachedSource() {
  musicSources.value = musicSources.value.filter((source) => !source.persistent);
  try {
    await clearPersistedMusicSources();
    await clearTrackCache();
  } catch {
    // Ignore persistence cleanup failures and keep runtime usable.
  }
}

async function removeSource(sourceId: string) {
  musicSources.value = musicSources.value.filter((source) => source.id !== sourceId);
  await persistHandleSources();
  await rebuildLibrary();
}

async function restoreCachedLibrary() {
  if (!supportsDirectoryPicker()) {
    const lastFolderName = loadLastFolderName();
    if (lastFolderName) {
      folderName.value = lastFolderName;
      setStatus("检测到上次的音乐源名称，但当前环境不支持目录授权恢复。");
    }
    return;
  }

  try {
    const persistedSources = await loadPersistedMusicSources();
    const lastFolderName = persistedSources[0]?.name || loadLastFolderName();

    if (lastFolderName) {
      folderName.value = persistedSources.map((source) => source.name).join(" · ") || lastFolderName;
    }

    if (!persistedSources.length) {
      return;
    }

    const persistentSourceNames = persistedSources.map((source) => source.name);
    const cachedTrackPayload = await loadTrackCache();
    const cacheKey = buildSourceCacheKey(persistentSourceNames);

    if (cachedTrackPayload?.sourceKey === cacheKey && cachedTrackPayload.tracks.length) {
      revokeTrackResources(tracks.value);
      tracks.value = cachedTrackPayload.tracks.map(createCachedTrack);
      currentTrackIndex.value = tracks.value.length ? 0 : -1;
      activeTrackPath.value = tracks.value[0]?.relativePath || "";
      setStatus(`已载入缓存曲库，后台正在刷新 ${tracks.value.length} 首歌曲...`);
    }

    const restoredSources: RuntimeMusicSource[] = [];
    for (const source of persistedSources) {
      let permission: PermissionState = "prompt";
      try {
        permission = await ensureDirectoryPermission(source.handle, false);
      } catch {
        permission = "prompt";
      }

      restoredSources.push({
        id: source.id,
        name: source.name,
        persistent: true,
        available: permission === "granted",
        handle: source.handle,
      });
    }

    musicSources.value = restoredSources;
    if (restoredSources.some((source) => source.available)) {
      await rebuildLibrary({ preserveVisibleTracks: tracks.value.some((track) => !track.isPlayable) });
      setStatus(`已恢复 ${restoredSources.filter((source) => source.available).length} 个音乐源`);
      return;
    }

    setStatus("检测到上次缓存的音乐源，点击“添加音乐源”重新授权后即可恢复。");
  } catch {
    const lastFolderName = loadLastFolderName();
    if (lastFolderName) {
      folderName.value = lastFolderName;
    }
    setStatus("已检测到缓存记录，但自动恢复失败；缓存不会被清除，可重新添加同一目录恢复授权。");
  }
}

onBeforeUnmount(() => {
  disposeLibrary();
  window.removeEventListener("keydown", handleEscapeClose);
  window.removeEventListener("contextmenu", handleContextMenuBlock);
  window.removeEventListener("resize", handleWindowResize);
  if (playlistScrollHideTimer) {
    clearTimeout(playlistScrollHideTimer);
  }
});

onMounted(() => {
  void restoreCachedLibrary();
  window.addEventListener("contextmenu", handleContextMenuBlock);
  window.addEventListener("resize", handleWindowResize);
});

window.addEventListener("keydown", handleEscapeClose);

function handleEscapeClose(event: KeyboardEvent) {
  if (event.key === "Escape" && currentView.value === "detail") {
    closeDetail();
  }
}

function handlePlaylistScroll() {
  isPlaylistScrolling.value = true;
  if (playlistScrollHideTimer) {
    clearTimeout(playlistScrollHideTimer);
  }

  playlistScrollHideTimer = setTimeout(() => {
    isPlaylistScrolling.value = false;
  }, 700);
}

function handleWindowResize() {
}

function handleSwitchSection(section: "playlist" | "favorites" | "albums" | "library-management") {
  activeSection.value = section;
  if (section === "albums" && !selectedAlbumName.value && albums.value.length) {
    selectedAlbumName.value = currentTrack.value?.album.trim() || albums.value[0].name;
  }
}

function handleContextMenuBlock(event: MouseEvent) {
  event.preventDefault();
}

function toggleTrackFavorite(index: number) {
  const track = tracks.value[index];
  if (!track) {
    return;
  }

  const nextLikedTrackIds = likedTrackIdSet.value.has(track.id)
    ? likedTrackIds.value.filter((id) => id !== track.id)
    : [...likedTrackIds.value, track.id];

  likedTrackIds.value = nextLikedTrackIds;
  saveLikedTrackIds(nextLikedTrackIds);
}

function toggleCurrentTrackFavorite() {
  if (currentTrackIndex.value === -1) {
    return;
  }

  toggleTrackFavorite(currentTrackIndex.value);
}
</script>

<template>
  <div class="app-shell">
    <SidebarPanel
      :active-section="activeSection"
      @switch-section="handleSwitchSection"
    />

    <main class="main-stage">
      <div v-if="activeSection === 'playlist'" class="playlist-stage">
        <header class="playlist-searchbar">
          <label class="search-field">
            <Search :size="18" aria-hidden="true" />
            <input v-model="searchQuery" type="search" placeholder="搜索歌曲、歌手、专辑" autocomplete="off" />
          </label>
        </header>

        <div
          ref="playlistScrollRef"
          class="playlist-scroll"
          :class="{ 'is-scrolling': isPlaylistScrolling }"
          @scroll.passive="handlePlaylistScroll"
        >
          <LibraryPanel
            :tracks="visibleTracks"
            :has-tracks="tracks.length > 0"
            :loading="loading"
            :loading-done="loadingDone"
            :loading-total="loadingTotal"
            :current-track-index="currentTrackIndex"
            :is-playing="isPlaying"
            :status="playlistStatus"
            :liked-track-ids="likedTrackIds"
            @play="handleSelectTrack"
            @toggle-favorite="toggleTrackFavorite"
          />
        </div>
      </div>

      <div v-else-if="activeSection === 'favorites'" class="page-content">
        <div class="playlist-stage">
          <header class="playlist-searchbar">
            <label class="search-field">
              <Search :size="18" aria-hidden="true" />
              <input v-model="searchQuery" type="search" placeholder="搜索喜欢的歌曲、歌手、专辑" autocomplete="off" />
            </label>
          </header>

          <div
            ref="playlistScrollRef"
            class="playlist-scroll"
            :class="{ 'is-scrolling': isPlaylistScrolling }"
            @scroll.passive="handlePlaylistScroll"
          >
            <LibraryPanel
              :tracks="visibleFavoriteTracks"
              :has-tracks="favoriteTracks.length > 0"
              :loading="false"
              :loading-done="0"
              :loading-total="0"
              :current-track-index="currentTrackIndex"
              :is-playing="isPlaying"
              :status="favoriteTracks.length ? `共 ${favoriteTracks.length} 首喜欢的歌曲` : '还没有喜欢的歌曲'"
              :liked-track-ids="likedTrackIds"
              title="喜欢的音乐"
              empty-title="还没有喜欢的歌曲"
              empty-description="在播放列表或播放器里点亮心形按钮，这里会自动收集你喜欢的音乐。"
              @play="handleFavoriteTrackSelect"
              @toggle-favorite="toggleTrackFavorite"
            />
          </div>
        </div>
      </div>

      <div v-else-if="activeSection === 'albums'" class="page-content">
        <AlbumPanel
          :albums="albums"
          :selected-album-name="selectedAlbumName"
          :current-track-index="currentTrackIndex"
          :is-playing="isPlaying"
          @select-album="selectedAlbumName = $event"
          @play-track="handleAlbumTrackSelect($event, selectedAlbumName)"
          @play-album="handlePlayAlbum"
        />
      </div>

      <div v-else class="page-content">
        <LibraryManagementPanel
          :source-names-label="sourceNamesLabel"
          :library-hint="libraryHint"
          :sources="musicSources"
          @open-folder="openFolder"
          @open-fallback="openFallbackPicker"
          @remove-source="removeSource"
        />
      </div>
    </main>

    <PlayerDock
      :current-track="currentTrack"
      :is-playing="isPlaying"
      :current-time-label="currentTimeLabel"
      :total-time-label="totalTimeLabel"
      :progress-percent="progressPercent"
      :volume-percent="volumePercent"
      :playback-mode="playbackMode"
      :playback-mode-label="playbackModeLabel"
      :is-current-track-liked="isCurrentTrackLiked"
      @open-detail="openDetail"
      @prev="handlePreviousControl"
      @next="handleNextControl"
      @toggle-play="togglePlay"
      @cycle-playback-mode="cyclePlaybackMode"
      @seek="seekToPercent"
      @set-volume="setVolume"
      @toggle-favorite="toggleCurrentTrackFavorite"
    />
  </div>

  <transition name="detail-overlay">
    <div v-if="currentView === 'detail'" class="detail-shell">
      <main class="detail-stage">
        <MusicDetailPanel
          :current-track="currentTrack"
          :is-playing="isPlaying"
          :current-time-label="currentTimeLabel"
          :total-time-label="totalTimeLabel"
          :progress-percent="progressPercent"
          :volume-percent="volumePercent"
          :playback-mode="playbackMode"
          :playback-mode-label="playbackModeLabel"
          :is-current-track-liked="isCurrentTrackLiked"
          :lyrics-lines="currentLyricsLines"
          :active-lyrics-index="activeLyricsIndex"
          :has-timed-lyrics="hasTimedLyrics"
          @close="closeDetail"
          @prev="handlePreviousControl"
          @next="handleNextControl"
          @toggle-play="togglePlay"
          @cycle-playback-mode="cyclePlaybackMode"
          @seek="seekToPercent"
          @set-volume="setVolume"
          @toggle-favorite="toggleCurrentTrackFavorite"
          @seek-line="seekToLyricsLine"
        />
      </main>
    </div>
  </transition>

  <input
    ref="folderInputRef"
    type="file"
    webkitdirectory
    directory
    multiple
    accept="audio/*,.mp3,.wav,.flac,.m4a,.aac,.ogg,.lrc"
    hidden
    @change="handleFolderInput"
  />

  <audio
    ref="audioRef"
    preload="metadata"
    @timeupdate="handleTimeUpdate"
    @loadedmetadata="handleLoadedMetadata"
    @play="handleAudioPlay"
    @pause="handleAudioPause"
    @ended="handleAudioEnded"
  ></audio>
</template>

