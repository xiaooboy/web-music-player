# LocalMusic 本地音乐播放器

基于 `Vite + Vue 3 + TypeScript + Pinia` 的本地音乐播放器，支持手动打开本地音乐文件夹，界面风格参考 Spotify 的黑绿视觉语言。

**在线访问：** [GitHub](https://xiaooboy.github.io/web-music-player/) | [Cloudflare](https://web-music-player.xiaooboy.workers.dev/)



## 技术栈

- **构建工具：** Vite 8（Rolldown）
- **框架：** Vue 3（Composition API + `<script setup>`）
- **语言：** TypeScript
- **状态管理：** Pinia
- **虚拟列表：** @tanstack/vue-virtual
- **图标：** @lucide/vue
- **PWA：** vite-plugin-pwa + Workbox
- **部署：** Cloudflare Workers / GitHub Pages
- **视图转场：** ViewTransition API

## 功能

### 音乐导入

- 打开本地音乐文件夹并生成播放列表
- 支持目录授权接口（File System Access API），授权后可持久化访问
- 不支持目录授权时自动回退 `webkitdirectory` 方式导入
- 支持 PWA 文件处理（`file_handlers`），可直接用浏览器打开音频文件
- 支持 `MP3 / WAV / FLAC / M4A / AAC / OGG / OPUS / WebM` 格式

### 播放控制

- 播放、暂停、上一首、下一首
- 进度拖拽、音量调节
- 播放模式：列表播放 / 单曲播放 / 随机播放
- 播放队列管理（下一首播放、从队列移除）
- MediaSession API 支持（系统通知栏/锁屏控制）

### 元数据与歌词

- 解析音频文件的标题、歌手、专辑、封面、歌词
- LRC 格式歌词解析与逐行高亮滚动
- 点击歌词行跳转到对应时间点

### 音乐库管理

- 全部曲目视图，支持搜索歌曲、歌手、专辑、路径
- 专辑视图，按专辑分组展示封面与曲目
- 自定义播放列表（创建、编辑、删除）
- 收藏功能，独立收藏列表
- 曲目右键上下文菜单（播放、下一首播放、添加到播放列表、收藏等）
- 音乐库缓存持久化（IndexedDB），刷新后无需重新扫描

### PWA

- 支持 PWA 安装，浏览器满足条件时可直接"安装到桌面"
- `localhost` 或 `HTTPS` 环境下可注册 Service Worker 并启用离线静态资源缓存
- PWA 不会改变浏览器本地文件访问权限模型；通过局域网 IP 的普通 HTTP 访问时，仍然只能走手动文件夹导入

## 浏览器说明

- 如果页面运行在 `localhost` 或 `HTTPS` 下，Chrome / Edge 会优先使用目录授权接口
- 如果通过局域网 IP 的 HTTP 地址访问（如 `http://192.168.x.x:5173`），由于不是安全上下文，目录授权接口不可用，会自动回退到手动文件夹导入
- 如果直接双击打开页面或浏览器不支持目录授权，播放器会自动回退到系统目录选择器

## 开发

```bash
pnpm install
pnpm dev
```

开发服务器默认端口 `8080`。

## 构建

```bash
pnpm build
pnpm preview    # Cloudflare Workers 本地预览
```

## 部署

项目支持双平台部署：

- **Cloudflare Workers：** `pnpm deploy`（使用 `@cloudflare/vite-plugin`）
- **GitHub Pages：** 通过 CI 设置 `DEPLOY_TO_GH_PAGES=true` 环境变量，自动调整 base 路径
