// チャット表示カスタム(文字サイズ・背景色)に関する定数
// AppSettings.chatFontSize / chatBackground の実際の見た目への変換をここに集約する。
import type { ChatFontSize } from "../types";
import { DEFAULT_CHAT_BACKGROUND } from "../types";

/** 文字サイズ選択肢に対応するCSS値(remベース。normalは現状のtext-smと同じ) */
export const CHAT_FONT_SIZE_VALUES: Record<ChatFontSize, string> = {
  small: "0.75rem", // text-xs相当
  normal: "0.875rem", // text-sm相当(現状の表示)
  large: "1.125rem", // text-lg相当
};

export const CHAT_FONT_SIZE_OPTIONS: { value: ChatFontSize; label: string }[] = [
  { value: "small", label: "小" },
  { value: "normal", label: "標準" },
  { value: "large", label: "大" },
];

/** 背景色プリセット(目に優しいダーク系。文字は明色のままなので暗めの色のみを用意する) */
export const CHAT_BACKGROUND_PRESETS: { value: string; label: string }[] = [
  { value: DEFAULT_CHAT_BACKGROUND, label: "ブラック" }, // zinc-950(現状の背景色)
  { value: "#27272a", label: "ダークグレー" }, // zinc-800寄り
  { value: "#0f172a", label: "濃紺" }, // slate-900寄り
  { value: "#10201a", label: "深緑" },
  { value: "#241c14", label: "セピア" },
];
