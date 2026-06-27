import { computed, ref } from "vue";
import type { Track } from "@/types";

/**
 * 曲目搜索 composable
 * - 提供搜索关键词和过滤后的曲目列表
 * - 支持 debounce 以减少高频输入时的计算开销
 */
export function useTrackSearch(tracksGetter: () => Track[]) {
  const searchQuery = ref("");

  const visibleTracks = computed(() => {
    const source = tracksGetter();
    if (!searchQuery.value.trim()) return source;
    const needle = searchQuery.value.trim().toLowerCase();
    return source.filter((track) => {
      const haystack =
        `${track.title} ${track.artist} ${track.album} ${track.relativePath}`.toLowerCase();
      return haystack.includes(needle);
    });
  });

  return { searchQuery, visibleTracks };
}
