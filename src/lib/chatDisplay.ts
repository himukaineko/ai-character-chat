// チャット表示カスタム(文字サイズ・配色テーマ)に関する定数
// AppSettings.chatFontSize / chatTheme の実際の見た目への変換をここに集約する。
import type { ChatFontSize, ChatTheme } from "../types";

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

/**
 * チャット配色テーマ1つ分の色定義(機能追加: 配色テーマ方式)。
 * 背景・吹き出し・行動描写・narration・topic区切り・補助文字(⋯ボタンやタイピング表示など)を
 * ひとまとめに定義することで、背景だけ変わって文字が読めなくなる事態を防ぐ。
 */
export interface ChatThemeTokens {
  bg: string; // チャットログ全体の背景色
  charBubbleBg: string; // キャラ発言の吹き出し背景
  charBubbleText: string; // キャラ発言の文字色
  userBubbleBg: string; // ユーザー発言の吹き出し背景
  userBubbleText: string; // ユーザー発言の文字色
  charActionText: string; // キャラ側の行動描写(【 】)の文字色
  userActionText: string; // ユーザー側の行動描写(【 】)の文字色
  narrationText: string; // narration(ナレーション行)の文字色
  topicText: string; // topic区切りのラベル文字色
  topicLine: string; // topic区切りの罫線色
  mutedText: string; // ⋯ボタン・発言者名・タイピングインジケーターなどの補助文字色
}

/**
 * テーマ本体の定義。
 * dark(黒系)は既存の見た目を踏襲する(キャラ吹き出しは実装済みのbg-zinc-800を維持。
 * 「そのまま」であることを優先し、旧仕様書メモにあったzinc-900表記ではなく実装済みの値に合わせた)。
 */
export const CHAT_THEME_TOKENS: Record<ChatTheme, ChatThemeTokens> = {
  dark: {
    bg: "#09090b", // 現状の背景色(zinc-950相当)
    charBubbleBg: "#27272a", // zinc-800(現状の吹き出し色)
    charBubbleText: "#f4f4f5", // zinc-100
    userBubbleBg: "#4f46e5", // indigo-600
    userBubbleText: "#ffffff",
    charActionText: "#a1a1aa", // zinc-400
    userActionText: "#c7d2fe", // indigo-200
    narrationText: "#71717a", // zinc-500
    topicText: "#71717a", // zinc-500
    topicLine: "#27272a", // zinc-800
    mutedText: "#71717a", // zinc-500
  },
  navy: {
    bg: "#0f172a",
    charBubbleBg: "#1e293b",
    charBubbleText: "#e2e8f0",
    userBubbleBg: "#4f46e5",
    userBubbleText: "#ffffff",
    charActionText: "#94a3b8",
    userActionText: "#c7d2fe",
    narrationText: "#64748b",
    topicText: "#64748b",
    topicLine: "#1e293b",
    mutedText: "#64748b",
  },
  light: {
    bg: "#fafafa",
    charBubbleBg: "#e4e4e7",
    charBubbleText: "#18181b",
    userBubbleBg: "#4f46e5",
    userBubbleText: "#ffffff",
    charActionText: "#71717a",
    userActionText: "#e0e7ff",
    narrationText: "#71717a",
    topicText: "#71717a",
    topicLine: "#d4d4d8", // zinc-300(白背景でも視認できる罫線)
    mutedText: "#71717a",
  },
  natural: {
    bg: "#f2ece1",
    charBubbleBg: "#ffffff",
    charBubbleText: "#3f3a34",
    userBubbleBg: "#7c6a58",
    userBubbleText: "#fdf9f2",
    charActionText: "#8a8175",
    userActionText: "#e8ddce",
    narrationText: "#9a9184",
    topicText: "#9a9184",
    topicLine: "#ddd2c0",
    mutedText: "#9a9184",
  },
};

/** 設定画面のテーマ選択カードに表示するラベル */
export const CHAT_THEME_OPTIONS: { value: ChatTheme; label: string }[] = [
  { value: "dark", label: "黒系" },
  { value: "navy", label: "濃紺系" },
  { value: "light", label: "白系" },
  { value: "natural", label: "ナチュラル系" },
];

/**
 * テーマのCSSカスタムプロパティ名。ChatMessageItem等はこの変数名を
 * var(--chat-xxx) で参照し、テーマ本体の値には依存しない。
 */
export const CHAT_THEME_CSS_VAR_NAMES = {
  bg: "--chat-bg",
  charBubbleBg: "--chat-char-bubble-bg",
  charBubbleText: "--chat-char-bubble-text",
  userBubbleBg: "--chat-user-bubble-bg",
  userBubbleText: "--chat-user-bubble-text",
  charActionText: "--chat-char-action-text",
  userActionText: "--chat-user-action-text",
  narrationText: "--chat-narration-text",
  topicText: "--chat-topic-text",
  topicLine: "--chat-topic-line",
  mutedText: "--chat-muted-text",
} as const satisfies Record<keyof ChatThemeTokens, string>;

/** 指定テーマをCSSカスタムプロパティのオブジェクトに変換する(RoomPage/SettingsPageのルートにstyleとして適用する) */
export function chatThemeToCssVars(theme: ChatTheme): Record<string, string> {
  const tokens = CHAT_THEME_TOKENS[theme];
  const vars: Record<string, string> = {};
  for (const key of Object.keys(CHAT_THEME_CSS_VAR_NAMES) as (keyof ChatThemeTokens)[]) {
    vars[CHAT_THEME_CSS_VAR_NAMES[key]] = tokens[key];
  }
  return vars;
}
