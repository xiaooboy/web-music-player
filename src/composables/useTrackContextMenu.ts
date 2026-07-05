import { nextTick, shallowReactive, shallowRef } from "vue";
import { Heart, ListPlus, Play, ListMusic, Trash2 } from "lucide-vue-next";
import { usePlayerStore, useFavoriteStore, usePlaylistStore } from "@/stores";
import ContextMenu from "@/components/ContextMenu.vue";
import type { MenuItem, EventPosition } from "@/components/ContextMenu.vue";
import type { Track } from "@/types";

/**
 * 曲目右键菜单 composable
 * - 封装 ContextMenu 的 ref 和菜单项构建逻辑
 * - 自动生成"播放"、"下一首播放"、"收藏/取消收藏"和"加入歌单/从歌单删除"菜单项
 * @param playlistId 当前歌单 ID，提供时进入歌单模式（显示"从歌单删除"而非"加入歌单"）
 */
export function useTrackContextMenu(playlistId?: string) {
  const playerStore = usePlayerStore();
  const favoriteStore = useFavoriteStore();
  const playlistStore = usePlaylistStore();
  const contextMenuRef = shallowRef<InstanceType<typeof ContextMenu> | null>(
    null,
  );
  const menuProps = shallowReactive({
    title: "",
    menu: [] as MenuItem[],
  });

  function updateMenu(track: Track) {
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

    if (playlistId) {
      // 歌单模式：显示"从歌单删除"
      items.push({
        label: "从歌单删除",
        icon: Trash2,
        action: () =>
          playlistStore.removeTrackFromPlaylist(playlistId, track.id),
      });
    } else {
      // 默认模式：显示"加入歌单"子菜单
      let playlistChildren: MenuItem[] = playlistStore.playlists.map(
        (playlist) => ({
          label: playlist.name,
          icon: ListMusic,
          action: () => playlistStore.addTrackToPlaylist(playlist.id, track.id),
          disabled: playlist.trackIds.includes(track.id),
        }),
      );
      playlistChildren = playlistChildren.length
        ? playlistChildren
        : [{ label: "暂无歌单", disabled: true }];

      items.push({
        label: "加入歌单",
        icon: ListMusic,
        children: playlistChildren,
      });
    }

    menuProps.menu = items;
    menuProps.title = track.title;
  }

  /** 打开菜单，已打开时会关闭再打开 */
  function open(event: EventPosition, track: Track) {
    contextMenuRef.value?.open(event, () => {
      updateMenu(track);
    });
  }

  function setRef(ref: InstanceType<typeof ContextMenu> | null) {
    contextMenuRef.value = ref;
  }

  /** 点击触发菜单，已打开时无操作，系统默认关闭 */
  function handleClickTrigger(event: MouseEvent, track: Track) {
    if (contextMenuRef.value!.getWasOpen()) return;
    contextMenuRef.value?.open(event, () => {
      updateMenu(track);
    });
  }

  return {
    menuProps,
    contextMenuRef,
    open,
    setRef,
    handleClickTrigger,
  };
}
