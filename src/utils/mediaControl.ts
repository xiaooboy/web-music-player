import type { Track } from "@/types";

interface MediaSectionControlOption {
  onPlay: () => void;
  onPause: () => void;
  onPreviousTrack: () => void;
  onNextTrack: () => void;
}

/**
 * 更新原生媒体控件中信息
 */
export function updateMediaSession(track: Track) {
  if (!track || !supportsMediaSession()) return;

  navigator.mediaSession.metadata = new MediaMetadata({
    title: track.title,
    artist: track.artist,
    album: track.album,
    artwork: track.coverUrl
      ? [
          {
            src: track.coverUrl,
            sizes: "512x512",
            type: track.coverBlob?.type || "image/jpeg",
          },
        ]
      : [],
  });
}
/** 设置媒体控件的操作处理函数 */
export function setMediaSectionControls({
  onPlay,
  onPause,
  onPreviousTrack,
  onNextTrack,
}: MediaSectionControlOption) {
  if (!supportsMediaSession()) return;
  navigator.mediaSession.setActionHandler("play", onPlay);
  navigator.mediaSession.setActionHandler("pause", onPause);
  navigator.mediaSession.setActionHandler("previoustrack", onPreviousTrack);
  navigator.mediaSession.setActionHandler("nexttrack", onNextTrack);
}
export function clearMediaSession() {
  if (!supportsMediaSession()) return;
  navigator.mediaSession.metadata = null;
  navigator.mediaSession.setActionHandler("play", null);
  navigator.mediaSession.setActionHandler("pause", null);
  navigator.mediaSession.setActionHandler("previoustrack", null);
  navigator.mediaSession.setActionHandler("nexttrack", null);
}
/** 是否支持媒体会话 */
export function supportsMediaSession() {
  return "mediaSession" in navigator;
}
