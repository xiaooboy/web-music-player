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
import { usePlaylistStore } from "./playlistStore";

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

  // ─── 播放队列 ───────────────────────────────────────────────────────────
  const queue = shallowRef<Track[]>([]);
  const playSourceType = shallowRef<
    "all-track" | "favorites" | "albums" | "playlists"
  >("all-track");
  let queueIndexMap = new Map<string, number>();
  let queueSourceInitialized = false;

  // ─── 拉模式：根据 playSourceType 自动拉取对应数据源 ─────────────────────
  const queueSource = computed<Track[]>(() => {
    const libraryStore = useLibraryStore();
    const favoriteStore = useFavoriteStore();
    const albumStore = useAlbumStore();
    const playlistStore = usePlaylistStore();
    switch (playSourceType.value) {
      case "all-track":
        return libraryStore.tracks;
      case "favorites":
        return favoriteStore.favoriteTracks;
      case "albums":
        return albumStore.currentAlbumTracks;
      case "playlists":
        return playlistStore.currentPlaylistTracks;
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
  // ─── 歌词高亮索引（利用播放时索引单调递增的局部性优化） ──────────────
  const activeLyricsIndex = shallowRef(-1);
  let lastLyricsTrackId = "";

  watch(
    [currentTimeSeconds, currentLyricsLines],
    ([targetTime, lines]) => {
      if (!lines.length || !hasTimedLyrics.value) {
        activeLyricsIndex.value = -1;
        return;
      }

      // 切歌时重置起点
      const trackId = currentTrackId.value;
      if (trackId !== lastLyricsTrackId) {
        lastLyricsTrackId = trackId;
        activeLyricsIndex.value = -1;
      }

      const target = targetTime + 0.05;
      let i = activeLyricsIndex.value;

      // 正向：从上次索引向后扫描（正常播放时 O(1)）
      if (i < 0) i = 0;
      while (i + 1 < lines.length) {
        const t = lines[i + 1].time;
        if (t !== null && t <= target) i++;
        else break;
      }

      // 回退：seek 导致当前行已超过 target，向前回溯
      while (i >= 0) {
        const t = lines[i].time;
        if (t !== null && t <= target) break;
        i--;
      }

      activeLyricsIndex.value = i;
    },
    { flush: "sync" },
  )

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

  function setPlaySourceType(
    type: "all-track" | "favorites" | "albums" | "playlists",
  ) {
    playSourceType.value = type;
  }

  function nextPlaybackMode() {
    playbackIndex = (playbackIndex + 1) % playbackConfig.length;
    playbackMode.value = playbackConfig[playbackIndex].mode;
  }

  function setQueue(newTracks: Track[]) {
    queue.value = newTracks;
    queueIndexMap.clear();
    newTracks.forEach((track, index) => {
      queueIndexMap.set(track.id, index);
    });
    if (!currentTrackId.value) {
      if (newTracks.length > 0) queueSourceInitialized = true;
      return;
    }
    if (queueIndexMap.has(currentTrackId.value)) {
      currentTrack.value = newTracks[queueIndexMap.get(currentTrackId.value)!];
      updateMediaSession(currentTrack.value);
    } else if (newTracks.length > 0 || queueSourceInitialized) {
      // 非空队列中找不到，或数据曾加载过但现在被清空 → 暂停并清除
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
    if (newTracks.length > 0) queueSourceInitialized = true;
  }

  // 使用 flush:'sync' 确保在 playTrack 等命令式调用前 queue 已同步
  // 必须放在 setQueue 及其依赖的状态声明之后（immediate:true 会立即执行）
  watch(queueSource, (newTracks) => setQueue(newTracks), {
    flush: "sync",
    immediate: true,
  });

  function getCurrentTrackIndex(): number {
    const find = queueIndexMap.get(currentTrackId.value);
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
    const index = queueIndexMap.get(id);
    if (index !== undefined) playTrack(index, autoplay);
  }

  function playTrack(index: number, autoplay = true) {
    const track = queue.value[index];
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

    updateMediaSession(track);
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
    if (!queue.value.length) return null;
    const currentIndex = getCurrentTrackIndex();
    if (playbackMode.value === "shuffle")
      return Math.floor(Math.random() * queue.value.length);
    let targetIndex = currentIndex + direction;
    if (targetIndex < 0) targetIndex = queue.value.length - 1;
    if (targetIndex >= queue.value.length) targetIndex = 0;
    return targetIndex;
  }

  function playByStep(direction: number) {
    if (!queue.value.length) return;
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
   * - 如果该曲目已在播放队列中，先移除再插入到当前位置下方
   * - 如果该曲目不在播放队列中，直接插入到当前位置下方
   */
  function setNextTrack(track: Track) {
    if (track.id === currentTrackId.value) return;
    if (!currentTrack.value) return;
    const list = [...queue.value];
    const currentIndex = getCurrentTrackIndex();
    // 从队列中移除该曲目（如果存在）
    const existIndex = queueIndexMap.get(track.id);
    if (existIndex !== undefined) {
      list.splice(existIndex, 1);
      // 移除元素在当前曲目之前时，当前曲目的实际索引前移了一位
      if (existIndex < currentIndex) {
        list.splice(currentIndex, 0, track);
      } else {
        list.splice(currentIndex + 1, 0, track);
      }
    } else {
      // 不在队列中，直接插入到当前曲目下方
      list.splice(currentIndex + 1, 0, track);
    }
    setQueue(list);
  }

  /**
   * 从播放队列中移除指定曲目
   * - 如果移除的是当前正在播放的曲目，自动播放下一首
   */
  function removeFromQueue(trackId: string) {
    const list = [...queue.value];
    const index = queueIndexMap.get(trackId);
    if (index === undefined) return;

    list.splice(index, 1);
    setQueue(list);

    // 如果移除的是当前播放的曲目，播放下一首
    if (trackId === currentTrackId.value) {
      playByStep(1);
    }
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
    updateMediaSession(track);
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
    queue,
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
    removeFromQueue,
    playByStep,
    nextPlaybackMode,
    togglePlay,
    setVolume,
    seekToPercent,
    seekToLyricsLine,
    dispose,
  };
});
