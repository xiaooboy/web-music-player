import { defineConfig } from "vite";
import vue from "@vitejs/plugin-vue";

import { cloudflare } from "@cloudflare/vite-plugin";
import { VitePWA } from "vite-plugin-pwa";
import path from "node:path";

// Determine base for GitHub Pages project site builds.
// When DEPLOY_TO_GH_PAGES=true in CI and GITHUB_REPOSITORY is available,
// set base to /<repo>/ so built assets reference the correct path.
const repo = process.env.GITHUB_REPOSITORY?.split("/")[1];
const isProjectPage = process.env.DEPLOY_TO_GH_PAGES === "true" && !!repo;
const base = isProjectPage ? `/${repo}/` : "/";

export default defineConfig({
  base,
  plugins: [
    vue(),
    ...(!isProjectPage ? [cloudflare()] : []),
    VitePWA({
      registerType: "autoUpdate",
      includeAssets: [
        "favicon.ico",
        "favicon.png",
        "favicon.svg",
        "icons/apple-touch-icon.png",
        "icons/icon-32.png",
        "icons/icon-48.png",
        "icons/icon-64.png",
        "icons/icon-192.png",
        "icons/icon-512.png",
        "icons/maskable-192.png",
        "icons/maskable-512.png",
      ],
      manifest: {
        id: base,
        name: `LocalMusic${process.env.NODE_ENV === "development" ? "Dev" : ""}`,
        short_name: "LocalMusic",
        description:
          "本地音乐播放器，支持导入本地音乐文件夹并离线安装为桌面应用。",
        theme_color: "#0b0f0c",
        background_color: "#0b0f0c",
        display_override: ["window-controls-overlay", "standalone"],
        display: "standalone",
        orientation: "portrait-primary",
        start_url: base,
        scope: base,
        lang: "zh-CN",
        icons: [
          {
            src: "icons/icon-192.png",
            sizes: "192x192",
            type: "image/png",
            purpose: "any",
          },
          {
            src: "icons/icon-512.png",
            sizes: "512x512",
            type: "image/png",
            purpose: "any",
          },
          {
            src: "icons/maskable-192.png",
            sizes: "192x192",
            type: "image/png",
            purpose: "maskable",
          },
          {
            src: "icons/maskable-512.png",
            sizes: "512x512",
            type: "image/png",
            purpose: "maskable",
          },
        ],
        file_handlers: [
          {
            action: base,
            accept: {
              "audio/*": [
                ".mp3",
                ".wav",
                ".flac",
                ".m4a",
                ".aac",
                ".ogg",
                ".opus",
                ".webm",
              ],
            },
          },
        ],
      },
      workbox: {
        globPatterns: ["**/*.{js,css,html,ico,png,svg}"],
        navigateFallbackDenylist: [
          /^\/__/,
          /\/.*\.(?:mp3|wav|flac|m4a|aac|ogg|opus|webm)$/,
        ],
      },
      devOptions: {
        enabled: false,
      },
    }),
  ],
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "src"),
    },
  },
  build: {
    rolldownOptions: {
      output: {
        chunkFileNames: "assets/[name]-[hash].js",
        codeSplitting: {
          groups: [
            {
              name: "vue",
              test: /node_modules[\\/]@?vue[\\/]/,
              priority: 30,
            },
          ],
        },
      },
    },
  },
  server: {
    port: 8080,
  },
});
