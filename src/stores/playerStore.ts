import type { PlaybackMode, PlaybackModeLabel, Track } from "@/types";
import { showToast } from "@/composables/useToast";
import { parseLyricsText } from "@/utils/media";
import {
  clearMediaSession,
  setMediaSectionControls,
  updateMediaSession,
} from "@/utils/mediaControl";
import { loadCurrentTrackId, saveCurrentTrackId } from "@/utils/persistence";
import { defineStore } from "pinia";
import { computed, shallowRef, watch } from "vue";
import { useLibraryStore } from "./libraryStore";
import { useFavoriteStore } from "./favoriteStore";
import { useAlbumStore } from "./albumStore";

type PlaybackConfig = Array<{
  mode: PlaybackMode;
  label: PlaybackModeLabel;
}>;

export const usePlayerStore = defineStore("player", () => {
  // ─── 播放模式 ───────────────────────────────────────────────────────────
  let playbackIndex = 0;
  const playbackConfig: PlaybackConfig = [
    { mode: "list", label: "列表播放" },
    { mode: "one", label: "单曲播放" },
    { mode: "shuffle", label: "随机播放" },
  ];
  const playbackMode = shallowRef<PlaybackMode>(playbackConfig[0].mode);
  const playbackModeLabel = computed(
    () =>
      playbackConfig.find((c) => c.mode === playbackMode.value)?.label ?? "",
  );

  // ─── 播放列表 ───────────────────────────────────────────────────────────
  const playlist = shallowRef<Track[]>([]);
  const playSourceType = shallowRef<"all-track" | "favorites" | "albums">(
    "all-track",
  );
  let playlistIndexMap = new Map<string, number>();
  let playlistSourceInitialized = false;

  // ─── 拉模式：根据 playSourceType 自动拉取对应数据源 ─────────────────────
  const playlistSource = computed<Track[]>(() => {
    const libraryStore = useLibraryStore();
    const favoriteStore = useFavoriteStore();
    const albumStore = useAlbumStore();
    switch (playSourceType.value) {
      case "all-track":
        return libraryStore.tracks;
      case "favorites":
        return favoriteStore.favoriteTracks;
      case "albums":
        return albumStore.currentAlbumTracks;
      default:
        return [];
    }
  });

  // ─── 当前曲目 ───────────────────────────────────────────────────────────
  const currentTrackId = shallowRef(loadCurrentTrackId());
  const currentTrack = shallowRef<Track | null>(null);

  // ─── 音频 ───────────────────────────────────────────────────────────────
  const audio = new Audio();
  const currentAudioUrl = shallowRef("");
  const isPlaying = shallowRef(false);

  // ─── 进度 ───────────────────────────────────────────────────────────────
  const progressPercent = shallowRef(0);
  const currentTimeSeconds = shallowRef(0);

  // ─── 音量 ───────────────────────────────────────────────────────────────
  const volumePercent = shallowRef(100);
  const volume = computed(() => volumePercent.value / 100);
  // ─── 歌词 ───────────────────────────────────────────────────────────────
  const currentLyricsLines = computed(() =>
    parseLyricsText(currentTrack.value?.lyricsText || ""),
  );
  const hasTimedLyrics = computed(() =>
    currentLyricsLines.value.some((line) => line.time !== null),
  );
  const activeLyricsIndex = computed(() => {
    if (!currentLyricsLines.value.length || !hasTimedLyrics.value) {
      return -1;
    }
    // 歌词已按 time 升序排列，二分查找最后一个 time <= target 的行
    const lines = currentLyricsLines.value;
    const target = currentTimeSeconds.value + 0.05;
    let lo = 0;
    let hi = lines.length - 1;
    let result = -1;
    while (lo <= hi) {
      const mid = (lo + hi) >>> 1;
      const time = lines[mid].time;
      if (time !== null && time <= target) {
        result = mid;
        lo = mid + 1;
      } else {
        hi = mid - 1;
      }
    }
    return result;
  });

  // ─── 方法 ─────────────────────────────────────────────────────────────
  let mediaSessionInitialized = false;

  function initMediaSession() {
    if (mediaSessionInitialized) return;
    mediaSessionInitialized = true;
    setMediaSectionControls({
      onPlay: togglePlay,
      onPause: togglePlay,
      onPreviousTrack: () => playByStep(-1),
      onNextTrack: () => playByStep(1),
    });
  }

  function setPlaySourceType(type: "all-track" | "favorites" | "albums") {
    playSourceType.value = type;
  }

  function nextPlaybackMode() {
    playbackIndex = (playbackIndex + 1) % playbackConfig.length;
    playbackMode.value = playbackConfig[playbackIndex].mode;
  }

  function setPlaylist(newTracks: Track[]) {
    playlist.value = newTracks;
    playlistIndexMap.clear();
    newTracks.forEach((track, index) => {
      playlistIndexMap.set(track.id, index);
    });
    if (!currentTrackId.value) {
      if (newTracks.length > 0) playlistSourceInitialized = true;
      return;
    }
    if (playlistIndexMap.has(currentTrackId.value)) {
      currentTrack.value =
        newTracks[playlistIndexMap.get(currentTrackId.value)!];
      updateMediaSession(currentTrack.value);
    } else if (newTracks.length > 0 || playlistSourceInitialized) {
      // 非空列表中找不到，或数据曾加载过但现在被清空 → 暂停并清除
      audio.pause();
      audio.src = "";
      URL.revokeObjectURL(currentAudioUrl.value);
      currentAudioUrl.value = "";
      currentTrack.value = null;
      currentTrackId.value = "";
      saveCurrentTrackId("");
      isPlaying.value = false;
      clearMediaSession();
    }
    // 数据尚未加载（首次 immediate 触发空数组），保留 currentTrackId 等待后续更新
    if (newTracks.length > 0) playlistSourceInitialized = true;
  }

  // 使用 flush:'sync' 确保在 playTrack 等命令式调用前 playlist 已同步
  // 必须放在 setPlaylist 及其依赖的状态声明之后（immediate:true 会立即执行）
  watch(playlistSource, (newTracks) => setPlaylist(newTracks), {
    flush: "sync",
    immediate: true,
  });

  function getCurrentTrackIndex(): number {
    const find = playlistIndexMap.get(currentTrackId.value);
    return find ?? -1;
  }

  function togglePlay() {
    const index = getCurrentTrackIndex();
    if (index === -1) return;
    if (!audio.src) {
      playTrack(index, true);
      return;
    }
    if (audio.paused) audio.play();
    else audio.pause();
  }

  function playTrackById(id: string, autoplay = true) {
    const index = playlistIndexMap.get(id);
    if (index !== undefined) playTrack(index, autoplay);
  }

  function playTrack(index: number, autoplay = true) {
    const track = playlist.value[index];
    if (!track) return;
    if (!track.file) {
      showToast("无法播放该曲目，音乐未解析完成，或音乐库缓存失效");
      return;
    }
    const isSameTrack = currentTrackId.value === track.id;
    currentTrackId.value = track.id;

    if (!isSameTrack || !audio.src) {
      if (currentAudioUrl.value) {
        URL.revokeObjectURL(currentAudioUrl.value);
      }
      currentAudioUrl.value = URL.createObjectURL(track.file);
      audio.src = currentAudioUrl.value;
      currentTrack.value = track;
    }

    updateMediaSession(currentTrack.value);
    syncProgress();

    if (!autoplay) {
      audio.load();
      return;
    }

    audio.play();
  }

  function syncProgress() {
    if (!currentTrack.value) {
      currentTimeSeconds.value = 0;
      progressPercent.value = 0;
      return;
    }

    currentTimeSeconds.value = audio.currentTime || 0;
    const duration = currentTrack.value.duration;
    progressPercent.value =
      duration > 0 ? (currentTimeSeconds.value / duration) * 100 : 0;
  }

  function getAdjacentIndex(direction: number) {
    if (!playlist.value.length) return null;
    const currentIndex = getCurrentTrackIndex();
    if (playbackMode.value === "shuffle")
      return Math.floor(Math.random() * playlist.value.length);
    let targetIndex = currentIndex + direction;
    if (targetIndex < 0) targetIndex = playlist.value.length - 1;
    if (targetIndex >= playlist.value.length) targetIndex = 0;
    return targetIndex;
  }

  function playByStep(direction: number) {
    if (!playlist.value.length) return;
    const targetIndex = getAdjacentIndex(direction);
    if (targetIndex !== null) playTrack(targetIndex, true);
  }

  function seekToPercent(percent: number) {
    if (!currentTrack.value) return;
    const duration = currentTrack.value.duration;
    audio.currentTime = (percent / 100) * duration;
    syncProgress();
  }

  function setVolume(percent: number) {
    volumePercent.value = percent;
    audio.volume = volume.value;
  }

  /**
   * 将指定曲目插入到当前播放曲目的下一首位置
   * - 如果该曲目就是当前播放的曲目，则不处理
   * - 如果该曲目已在播放列表中，先移除再插入到当前位置下方
   * - 如果该曲目不在播放列表中，直接插入到当前位置下方
   */
  function setNextTrack(track: Track) {
    if (track.id === currentTrackId.value) return;
    if (!currentTrack.value) return;
    const list = [...playlist.value];
    const currentIndex = getCurrentTrackIndex();
    // 从列表中移除该曲目（如果存在）
    if (playlistIndexMap.has(track.id)) {
      const existIndex = playlistIndexMap.get(track.id);
      list.splice(existIndex, 1);
      // 移除元素在当前曲目之前时，当前曲目的实际索引前移了一位
      if (existIndex < currentIndex) {
        list.splice(currentIndex, 0, track);
      } else {
        list.splice(currentIndex + 1, 0, track);
      }
    } else {
      // 不在列表中，直接插入到当前曲目下方
      list.splice(currentIndex + 1, 0, track);
    }
    setPlaylist(list);
  }

  function seekToLyricsLine(index: number) {
    const line = currentLyricsLines.value[index];
    if (!line || line.time === null) return;
    audio.currentTime = line.time;
  }

  // ─── 音频事件处理（内部） ──────────────────────────────────────────────
  function handleTimeUpdate() {
    syncProgress();
  }

  function handleLoadedMetadata() {
    // build 过程已经使用相同的逻辑获取 duration
    const track = currentTrack.value;
    if (!track || track.duration) return;
    if (!track.duration && Number.isFinite(audio.duration)) {
      track.duration = audio.duration;
    }
    syncProgress();
    updateMediaSession(currentTrack.value);
  }

  function handleAudioPlay() {
    isPlaying.value = true;
    if (currentTrackId.value) {
      saveCurrentTrackId(currentTrackId.value);
    }
  }

  function handleAudioPause() {
    isPlaying.value = false;
  }

  function handleAudioEnded() {
    let step = 1;
    if (playbackMode.value === "one") {
      step = 0;
    }
    playByStep(step);
  }

  // ─── 初始化音频 ─────────────────────────────────────────────────────────
  audio.preload = "metadata";
  audio.addEventListener("timeupdate", handleTimeUpdate);
  audio.addEventListener("loadedmetadata", handleLoadedMetadata);
  audio.addEventListener("play", handleAudioPlay);
  audio.addEventListener("pause", handleAudioPause);
  audio.addEventListener("ended", handleAudioEnded);

  // ─── 资源清理 ─────────────────────────────────────────────────────────────
  function dispose() {
    audio.pause();
    audio.removeEventListener("timeupdate", handleTimeUpdate);
    audio.removeEventListener("loadedmetadata", handleLoadedMetadata);
    audio.removeEventListener("play", handleAudioPlay);
    audio.removeEventListener("pause", handleAudioPause);
    audio.removeEventListener("ended", handleAudioEnded);
    audio.src = "";
    if (currentAudioUrl.value) {
      URL.revokeObjectURL(currentAudioUrl.value);
      currentAudioUrl.value = "";
    }
  }

  return {
    // state
    playbackMode,
    playbackModeLabel,
    playSourceType,
    currentTrack,
    currentTrackId,
    isPlaying,
    progressPercent,
    currentTimeSeconds,
    volumePercent,
    currentLyricsLines,
    hasTimedLyrics,
    activeLyricsIndex,
    // actions
    initMediaSession,
    setPlaySourceType,
    playTrack,
    playTrackById,
    setNextTrack,
    playByStep,
    nextPlaybackMode,
    togglePlay,
    setVolume,
    seekToPercent,
    seekToLyricsLine,
    dispose,
  };
});
