# LocalMusic 本地音乐播放器

基于 `Vite + Vue 3 + TypeScript` 的本地音乐播放器，支持手动打开本地音乐文件夹，界面风格参考spotify的黑绿视觉语言。

## 技术栈

- Vite
- Vue 3
- TypeScript
- PWA (`vite-plugin-pwa`)
- 原生 File System Access API + `webkitdirectory` 回退

## 功能

- 打开本地音乐文件夹并生成播放列表
- 支持 `MP3 / WAV / FLAC / M4A / AAC / OGG / OPUS / WebM`
- 播放、暂停、上一首、下一首
- 进度拖拽、音量调节、顺序 / 单曲循环 / 列表循环 / 随机播放
- 搜索歌曲、歌手、专辑、路径
- 解析 MP3 的标题、歌手、专辑与封面

## 开发

```bash
npm install
npm run dev
```

局域网访问：

```bash
npm run dev:lan
```

启动后可通过本机局域网 IP 访问，例如 `http://192.168.1.10:5173`。

## 构建

```bash
npm run build
npm run preview
```

## PWA

- 已支持 `PWA` 安装，浏览器满足条件时可直接“安装到桌面”。
- `localhost` 或 `HTTPS` 环境下可注册 `service worker` 并启用离线静态资源缓存。
- `PWA` 不会改变浏览器本地文件访问权限模型；通过局域网 IP 的普通 `http` 访问时，仍然只能走手动文件夹导入。

## 浏览器说明

- 如果页面运行在 `localhost` 或 `HTTPS` 下，Chrome / Edge 会优先使用目录授权接口。
- 如果通过局域网 IP 的 `http` 地址访问，例如 `http://192.168.x.x:5173`，由于不是安全上下文，目录授权接口不可用，会自动回退到手动文件夹导入。
- 如果直接双击打开页面或浏览器不支持目录授权，播放器会自动回退到系统目录选择器。

## 目录结构

- `src/App.vue`: 主状态管理与页面编排
- `src/components/`: 侧栏、主视觉、列表区、底部播放器组件
- `src/utils/media.ts`: 文件导入、元数据解析、格式化工具
- `src/types.ts`: 共享类型定义
