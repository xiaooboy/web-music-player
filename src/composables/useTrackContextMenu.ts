import { nextTick, shallowReactive, shallowRef } from "vue";
import { Heart, ListPlus, Play } from "lucide-vue-next";
import { usePlayerStore, useFavoriteStore } from "@/stores";
import ContextMenu from "@/components/ContextMenu.vue";
import type { MenuItem, EventPosition } from "@/components/ContextMenu.vue";
import type { Track } from "@/types";

/**
 * 曲目右键菜单 composable
 * - 封装 ContextMenu 的 ref 和菜单项构建逻辑
 * - 自动生成"播放"、"下一首播放"和"收藏/取消收藏"菜单项
 */
export function useTrackContextMenu() {
  const playerStore = usePlayerStore();
  const favoriteStore = useFavoriteStore();
  const contextMenuRef = shallowRef<InstanceType<typeof ContextMenu> | null>(
    null,
  );
  const menuProps = shallowReactive({
    title: "",
    menu: [] as MenuItem[],
  });
  let wasOpen = false;
  function handleToggle(event: ToggleEvent) {
    wasOpen = event.newState === "open";
  }
  function updateMenu(track: Track) {
    const isLiked = favoriteStore.likedTrackIdSet.has(track.id);
    const isCurrentTrack = track.id === playerStore.currentTrackId;
    menuProps.menu = [
      {
        label: "播放",
        icon: Play,
        action: () => playerStore.playTrackById(track.id, true),
        disabled: isCurrentTrack && playerStore.isPlaying,
      },
      {
        label: isLiked ? "取消收藏" : "收藏",
        icon: Heart,
        action: () => favoriteStore.toggleTrackFavorite(track.id),
      },
      {
        label: "下一首播放",
        icon: ListPlus,
        action: () => playerStore.setNextTrack(track),
        disabled: isCurrentTrack,
      },
    ];
    menuProps.title = track.title;
  }
  function open(event: EventPosition, track: Track) {
    updateMenu(track);
    nextTick(() => {
      contextMenuRef.value?.open(event);
    });
  }
  function setRef(ref: InstanceType<typeof ContextMenu> | null) {
    contextMenuRef.value = ref;
  }
  function handleClickTrigger(event: MouseEvent, track: Track) {
    if (wasOpen) return;
    updateMenu(track);
    contextMenuRef.value?.open(event);
  }

  return {
    menuProps,
    contextMenuRef,
    open,
    setRef,
    handleClickTrigger,
    handleToggle,
  };
}
