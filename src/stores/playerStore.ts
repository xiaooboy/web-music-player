import type { PlaybackMode, PlaybackModeLabel, Track } from "@/types";
import { parseLyricsText } from "@/utils/media";
import {
  clearMediaSession,
  setMediaSectionControls,
  updateMediaSession,
} from "@/utils/mediaControl";
import { loadCurrentTrackId, saveCurrentTrackId } from "@/utils/persistence";
import { defineStore } from "pinia";
import { computed, shallowRef } from "vue";

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
  const playbackModeLabel = shallowRef<string>(playbackConfig[0].label);

  // ─── 播放列表 ───────────────────────────────────────────────────────────
  const playlist = shallowRef<Track[]>([]);
  const playSourceType = shallowRef<"playlist" | "favorites" | "albums">(
    "playlist",
  );
  let playlistIndexMap = new Map<string, number>();

  // ─── 当前曲目 ───────────────────────────────────────────────────────────
  const currentTrackId = shallowRef(loadCurrentTrackId());
  const currentTrack = shallowRef<Track | null>(null);

  // ─── 音频 ───────────────────────────────────────────────────────────────
  const audioRef = shallowRef<HTMLAudioElement | null>(null);
  const currentAudioUrl = shallowRef("");
  const isPlaying = shallowRef(false);

  // ─── 进度 ───────────────────────────────────────────────────────────────
  const progressPercent = shallowRef(0);
  const currentTimeSeconds = shallowRef(0);

  // ─── 音量 ───────────────────────────────────────────────────────────────
  const volume = shallowRef(1);
  const volumePercent = shallowRef(100);
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
    let activeIndex = -1;
    for (let index = 0; index < currentLyricsLines.value.length; index += 1) {
      const time = currentLyricsLines.value[index].time;
      if (time !== null && time <= currentTimeSeconds.value + 0.05) {
        activeIndex = index;
      }
    }
    return activeIndex;
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

  function setPlaySourceType(type: "playlist" | "favorites" | "albums") {
    playSourceType.value = type;
  }

  function setAudioRef(ref: HTMLAudioElement | null) {
    audioRef.value = ref;
  }

  function nextPlaybackMode() {
    playbackIndex = (playbackIndex + 1) % playbackConfig.length;
    playbackMode.value = playbackConfig[playbackIndex].mode;
    playbackModeLabel.value = playbackConfig[playbackIndex].label;
  }

  function setPlaylist(newTracks: Track[]) {
    playlist.value = newTracks;
    playlistIndexMap.clear();
    newTracks.forEach((track, index) => {
      playlistIndexMap.set(track.id, index);
    });
    if (!currentTrackId.value) return;
    if (playlistIndexMap.has(currentTrackId.value)) {
      currentTrack.value =
        newTracks[playlistIndexMap.get(currentTrackId.value)!];
      updateMediaSession(currentTrack.value);
    } else {
      // 当前播放的曲目不在新的播放列表中，暂停并清除
      const audio = audioRef.value;
      if (audio) {
        audio.pause();
        audio.src = "";
      }
      URL.revokeObjectURL(currentAudioUrl.value);
      currentAudioUrl.value = "";
      currentTrack.value = null;
      currentTrackId.value = "";
      isPlaying.value = false;
      clearMediaSession();
    }
  }

  function togglePlay() {
    const audio = audioRef.value;
    const index = getCurrentTrackIndex();
    if (!audio || index === -1) return;
    if (!audio.src) {
      playTrack(index, true);
      return;
    }
    if (audio.paused) audio.play();
    else audio.pause();
  }

  function getCurrentTrackIndex(): number {
    const find = playlistIndexMap.get(currentTrackId.value);
    return find ?? -1;
  }

  function playTrackById(id: string, autoplay = true) {
    const index = playlistIndexMap.get(id);
    if (index !== undefined) playTrack(index, autoplay);
  }

  function playTrack(index: number, autoplay = true) {
    const audio = audioRef.value;
    const track = playlist.value[index];
    if (!audio || !track) return;
    if (!track.file) {
      alert("无法播放该曲目，音乐未解析完成，或音乐库缓存失效");
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
    const audio = audioRef.value;
    if (!audio || !currentTrack.value) {
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
    const audio = audioRef.value;
    if (!audio || !playlist.value.length) return;
    const targetIndex = getAdjacentIndex(direction);
    if (targetIndex !== null) playTrack(targetIndex, true);
  }

  function seekToPercent(percent: number) {
    const audio = audioRef.value;
    if (!audio || !currentTrack.value) return;
    const duration = currentTrack.value.duration;
    audio.currentTime = (percent / 100) * duration;
    syncProgress();
  }

  function setVolume(percent: number) {
    volume.value = percent / 100;
    volumePercent.value = percent;
    if (audioRef.value) audioRef.value.volume = volume.value;
  }

  function handleTimeUpdate() {
    syncProgress();
  }

  function handleLoadedMetadata() {
    // build 过程已经使用相同的逻辑获取 duration
    const audio = audioRef.value;
    const track = currentTrack.value;
    if (!audio || !track || track.duration) {
      return;
    }
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

  function seekToLyricsLine(index: number) {
    const line = currentLyricsLines.value[index];
    if (!line || line.time === null) return;
    const audio = audioRef.value;
    if (!audio) return;
    audio.currentTime = line.time;
  }

  return {
    // state
    audioRef,
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
    setAudioRef,
    setPlaylist,
    playTrack,
    playTrackById,
    playByStep,
    nextPlaybackMode,
    togglePlay,
    setVolume,
    seekToPercent,
    seekToLyricsLine,
    handleTimeUpdate,
    handleLoadedMetadata,
    handleAudioPlay,
    handleAudioPause,
    handleAudioEnded,
  };
});
