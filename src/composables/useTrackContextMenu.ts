import { ref } from "vue";
import { Heart, ListPlus, Play } from "lucide-vue-next";
import { usePlayerStore, useFavoriteStore } from "@/stores";
import ContextMenu from "@/components/ContextMenu.vue";
import type { MenuItem } from "@/components/ContextMenu.vue";
import type { Track } from "@/types";

/**
 * 曲目右键菜单 composable
 * - 封装 ContextMenu 的 ref 和菜单项构建逻辑
 * - 自动生成"播放"、"下一首播放"和"收藏/取消收藏"菜单项
 */
export function useTrackContextMenu() {
  const contextMenuRef = ref<InstanceType<typeof ContextMenu> | null>(null);

  const playerStore = usePlayerStore();
  const favoriteStore = useFavoriteStore();

  function open(event: MouseEvent, track: Track) {
    const isLiked = favoriteStore.likedTrackIdSet.has(track.id);
    const isCurrentTrack = track.id === playerStore.currentTrackId;

    const items: MenuItem[] = [
      {
        label: "播放",
        icon: Play,
        action: () => playerStore.playTrackById(track.id, true),
        disabled: isCurrentTrack && playerStore.isPlaying,
      },
      {
        label: "下一首播放",
        icon: ListPlus,
        action: () => playerStore.setNextTrack(track),
        disabled: isCurrentTrack,
      },
      {
        label: isLiked ? "取消收藏" : "收藏",
        icon: Heart,
        action: () => favoriteStore.toggleTrackFavorite(track.id),
      },
    ];

    contextMenuRef.value?.open(event, items);
  }

  return { contextMenuRef, open };
}
