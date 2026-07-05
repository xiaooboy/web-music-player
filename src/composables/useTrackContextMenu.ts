import { shallowReactive, shallowRef } from "vue";
import { Heart, ListPlus, Play, ListMusic, Trash2 } from "lucide-vue-next";
import {
  usePlayerStore,
  useFavoriteStore,
  usePlaylistStore,
  useAlbumStore,
  useUIStore,
} from "@/stores";
import ContextMenu from "@/components/ContextMenu.vue";
import type { MenuItem, EventPosition } from "@/components/ContextMenu.vue";
import type { Track } from "@/types";

/**
 * 曲目右键菜单 composable
 * - 封装 ContextMenu 的 ref 和菜单项构建逻辑
 * - 自动生成"播放"、"下一首播放"、"收藏/取消收藏"和"加入歌单/从歌单删除"菜单项
 * - 播放源和歌单模式根据当前视图上下文自动推断
 */
export function useTrackContextMenu() {
  const playerStore = usePlayerStore();
  const favoriteStore = useFavoriteStore();
  const playlistStore = usePlaylistStore();
  const albumStore = useAlbumStore();
  const uiStore = useUIStore();
  const contextMenuRef = shallowRef<InstanceType<typeof ContextMenu> | null>(
    null,
  );
  const menuProps = shallowReactive({
    title: "",
    menu: [] as MenuItem[],
  });

  /** 根据当前视图上下文推断播放源并激活 */
  function activatePlaySource() {
    const section = uiStore.activeSection;
    if (section === "library-management") return;
    // 详情页场景：沿用当前播放源，不做切换
    if (uiStore.currentView === "detail") return;
    playerStore.setPlaySourceType(section);
    if (section === "albums" && albumStore.selectedAlbumName)
      albumStore.updatePlayingAlbum(albumStore.selectedAlbumName);
    if (section === "playlists" && playlistStore.selectedPlaylistId)
      playlistStore.updatePlayingPlaylist(playlistStore.selectedPlaylistId);
  }

  /** 是否处于歌单详情视图 */
  function isInPlaylistDetail() {
    return (
      uiStore.activeSection === "playlists" &&
      !!playlistStore.selectedPlaylistId
    );
  }

  function updateMenu(track: Track) {
    const isLiked = favoriteStore.likedTrackIdSet.has(track.id);
    const isCurrentTrack = track.id === playerStore.currentTrackId;

    const items: MenuItem[] = [
      {
        label: "播放",
        icon: Play,
        action: () => {
          activatePlaySource();
          playerStore.playTrackById(track.id, true);
        },
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

    if (isInPlaylistDetail()) {
      // 歌单详情模式：显示"从歌单删除"
      items.push({
        label: "从歌单删除",
        icon: Trash2,
        action: () =>
          playlistStore.removeTrackFromPlaylist(
            playlistStore.selectedPlaylistId!,
            track.id,
          ),
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
