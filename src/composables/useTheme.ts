import { withViewTransition } from "@/utils/viewTransition";
import { shallowRef } from "vue";

export type ThemeMode = "light" | "dark" | "system";

const THEME_KEY = "theme-mode";
const DARK_CLASS = "dark-theme";
const LIGHT_CLASS = "light-theme";
const DARK_BG = "#0b0f0c";
const LIGHT_BG = "#ebebeb";

const themeMode = shallowRef<ThemeMode>(loadThemeMode());

let mediaQuerySetup = false;

function loadThemeMode(): ThemeMode {
  const saved = localStorage.getItem(THEME_KEY);
  if (saved === "light" || saved === "dark" || saved === "system") return saved;
  return "dark";
}

function saveThemeMode(mode: ThemeMode) {
  localStorage.setItem(THEME_KEY, mode);
}

function getSystemIsDark(): boolean {
  return window.matchMedia("(prefers-color-scheme: dark)").matches;
}

function resolveThemeClass(mode: ThemeMode): string {
  if (mode === "dark") return DARK_CLASS;
  if (mode === "light") return LIGHT_CLASS;
  return getSystemIsDark() ? DARK_CLASS : LIGHT_CLASS;
}

function resolveThemeColor(mode: ThemeMode): string {
  if (mode === "dark") return DARK_BG;
  if (mode === "light") return LIGHT_BG;
  return getSystemIsDark() ? DARK_BG : LIGHT_BG;
}

function applyTheme(mode: ThemeMode) {
  const html = document.documentElement;
  // 移除旧主题类名
  html.classList.remove(DARK_CLASS, LIGHT_CLASS);
  // 添加新主题类名
  html.classList.add(resolveThemeClass(mode));
}
function applyMetaThemeColor(mode: ThemeMode) {
  // 更新 meta theme-color
  const meta = document.querySelector(
    'meta[name="theme-color"]',
  ) as HTMLMetaElement | null;
  if (meta) {
    meta.content = resolveThemeColor(mode);
  }
}

/** 监听系统主题变化（仅在 system 模式下生效），全局只注册一次 */
function setupMediaListener() {
  if (mediaQuerySetup) return;
  mediaQuerySetup = true;

  const mq = window.matchMedia("(prefers-color-scheme: dark)");
  mq.addEventListener("change", () => {
    if (themeMode.value === "system") {
      applyTheme("system");
    }
  });
}
const triggerTransition = (transition: ViewTransition) => {
  transition.ready.then(() => {
    // 取消默认的 view transition 动画
    document.getAnimations().forEach((anim) => {
      const effect = anim.effect as KeyframeEffect;
      if (
        effect.pseudoElement === "::view-transition-new(root)" ||
        effect.pseudoElement === "::view-transition-old(root)"
      ) {
        anim.cancel();
      }
    });

    // 新视图：clip-path 矩形从左向右展开
    const newEffect = new KeyframeEffect(
      document.documentElement,
      [{ clipPath: "inset(0 100% 0 0)" }, { clipPath: "inset(0 0 0 0)" }],
      {
        duration: 600,
        easing: "ease-in-out",
        fill: "both",
        pseudoElement: "::view-transition-new(root)",
      },
    );
    new Animation(newEffect).play();
  });
};
export function useTheme() {
  // 初始化：应用当前主题
  applyTheme(themeMode.value);
  // 全局监听系统主题变化
  setupMediaListener();

  const setThemeMode = async (mode: ThemeMode) => {
    themeMode.value = mode;
    saveThemeMode(mode);
    const { transition } = withViewTransition(() => {
      applyTheme(mode);
    });
    if (!transition) return;
    triggerTransition(transition);
    await transition.finished;
    // 过渡完成后触发
    applyMetaThemeColor(mode);
  };

  return {
    themeMode,
    setThemeMode,
  };
}
