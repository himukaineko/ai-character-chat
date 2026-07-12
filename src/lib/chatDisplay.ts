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
 *
 * 機能拡張(上部バー・入力エリアへのテーマ適用): チャットログ以外の「サーフェス」領域
 * (上部バー・下部入力エリア)専用のトークンを追加。bg/charBubbleBg等はチャットログ内の
 * 吹き出し用に調整された値のため、上部バーや入力欄の背景にそのまま使うと
 * (特にlight/naturalで)白背景に白系吹き出し色が重なってコントラストが崩れることがある。
 * そのためサーフェス系は独立した値として持つ。
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
  // ここから機能拡張(上部バー・入力エリアへのテーマ適用)で追加したサーフェス系トークン
  surfaceBg: string; // 上部バー・下部入力エリア全体の背景色
  surfaceBorder: string; // 上部バー下端・入力エリア上端・通常ボタンなどの境界線色
  headingText: string; // ルーム名などの見出しの文字色
  inputBg: string; // テキスト入力欄・セレクト・メンバーチップなど「一段沈んだ」面の背景色
  inputText: string; // 入力欄の文字色
  placeholderText: string; // プレースホルダー・ヒント文・キャプションの文字色
  buttonText: string; // 枠線タイプの通常ボタンの文字色
  buttonBorder: string; // 枠線タイプの通常ボタンの枠色(surfaceBorderと同値で良ければ流用)
  accentText: string; // 「会話を続ける」等indigoアクセント文字色(明背景でも読める値に調整)
  dangerText: string; // 「削除」等赤文字色(明背景でも読める値に調整)
  // ここから機能修正(フローティングUIのテーマ統一)で追加したトークン
  successText: string; // 「保存しました」等の成功フィードバック文字色(明背景でも読める値に調整)
  warningText: string; // 「固定」バッジ等の注意系文字色(明背景でも読める値に調整)
}

/**
 * テーマ本体の定義。
 * dark(黒系)は既存の見た目を踏襲する(キャラ吹き出しは実装済みのbg-zinc-800を維持。
 * 「そのまま」であることを優先し、旧仕様書メモにあったzinc-900表記ではなく実装済みの値に合わせた)。
 * サーフェス系トークンもdark/navyは既存のChatInput/RoomPageの固定値(zinc-950/zinc-900/zinc-700など)を
 * そのまま踏襲し、見た目が変わらないようにしている。
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
    surfaceBg: "#09090b", // 現状のChatInput(bg-zinc-950)/RoomPage背景と同じ
    surfaceBorder: "#27272a", // zinc-800(現状のborder-zinc-800)
    headingText: "#f4f4f5", // zinc-100(現状のtext-zinc-100)
    inputBg: "#18181b", // zinc-900(現状のbg-zinc-900)
    inputText: "#f4f4f5", // zinc-100
    placeholderText: "#52525b", // zinc-600(現状のtext-zinc-600ヒント文)
    buttonText: "#d4d4d8", // zinc-300(現状のtext-zinc-300)
    buttonBorder: "#3f3f46", // zinc-700(現状のborder-zinc-700)
    accentText: "#a5b4fc", // indigo-300(現状のtext-indigo-300)
    dangerText: "#f87171", // red-400(現状のtext-red-400)
    successText: "#34d399", // emerald-400(現状のtext-emerald-400)
    warningText: "#fcd34d", // amber-300(現状のtext-amber-300)
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
    surfaceBg: "#0f172a", // bgと同じ濃紺
    surfaceBorder: "#1e293b", // slate-800
    headingText: "#e2e8f0", // slate-200
    inputBg: "#1e293b", // slate-800
    inputText: "#e2e8f0", // slate-200
    placeholderText: "#64748b", // slate-500
    buttonText: "#94a3b8", // slate-400
    buttonBorder: "#334155", // slate-700
    accentText: "#a5b4fc", // indigo-300(濃紺背景でも十分なコントラスト)
    dangerText: "#f87171", // red-400
    successText: "#34d399", // emerald-400
    warningText: "#fcd34d", // amber-300
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
    surfaceBg: "#ffffff", // 白系サーフェス(チャットログのbgよりわずかに明るく面を分離)
    surfaceBorder: "#d4d4d8", // zinc-300
    headingText: "#18181b", // zinc-900(濃文字)
    inputBg: "#f4f4f5", // zinc-100(白いサーフェスの上でも入力欄が分かるよう薄グレー)
    inputText: "#18181b", // zinc-900
    placeholderText: "#71717a", // zinc-500
    buttonText: "#3f3f46", // zinc-700(白背景でも読める濃さ)
    buttonBorder: "#d4d4d8", // zinc-300
    accentText: "#4338ca", // indigo-700(白背景でコントラストを保てる濃さまで落とす)
    dangerText: "#b91c1c", // red-700(白背景でコントラストを保てる濃さまで落とす)
    successText: "#047857", // emerald-700(白背景でコントラストを保てる濃さまで落とす)
    warningText: "#b45309", // amber-700(白背景でコントラストを保てる濃さまで落とす)
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
    surfaceBg: "#fbf7ef", // 生成りに合うクリーム系サーフェス(bgよりわずかに明るい)
    surfaceBorder: "#ddd2c0",
    headingText: "#3f3a34", // 焦茶文字
    inputBg: "#ffffff", // 吹き出しと同じ白で入力欄を分離
    inputText: "#3f3a34", // 焦茶文字
    placeholderText: "#9a9184",
    buttonText: "#6b6255", // クリーム面でも読める濃さの焦茶
    buttonBorder: "#ddd2c0",
    accentText: "#4f46e5", // indigo-600(クリーム背景でも十分なコントラスト)
    dangerText: "#b91c1c", // red-700(クリーム背景でコントラストを保てる濃さ)
    successText: "#047857", // emerald-700(クリーム背景でコントラストを保てる濃さ)
    warningText: "#b45309", // amber-700(クリーム背景でコントラストを保てる濃さ)
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
 * アイコンボタンでのテーマ巡回切替(機能追加: ルーム画面のテーマ切替ボタン)で使う順序。
 * dark → navy → light → natural → dark … の順で巡回する。
 */
export const CHAT_THEME_CYCLE_ORDER: ChatTheme[] = ["dark", "navy", "light", "natural"];

/** 現在のテーマから次のテーマを返す(巡回切替用) */
export function nextChatTheme(current: ChatTheme): ChatTheme {
  const index = CHAT_THEME_CYCLE_ORDER.indexOf(current);
  const nextIndex = (index + 1) % CHAT_THEME_CYCLE_ORDER.length;
  return CHAT_THEME_CYCLE_ORDER[nextIndex];
}

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
  surfaceBg: "--chat-surface",
  surfaceBorder: "--chat-border",
  headingText: "--chat-heading-text",
  inputBg: "--chat-input-bg",
  inputText: "--chat-input-text",
  placeholderText: "--chat-placeholder-text",
  buttonText: "--chat-button-text",
  buttonBorder: "--chat-button-border",
  accentText: "--chat-accent-text",
  dangerText: "--chat-danger-text",
  successText: "--chat-success-text",
  warningText: "--chat-warning-text",
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
