// APIエラー表示バナー(仕様書10.3): 原因が分かる日本語メッセージで表示する
import { Link } from "react-router-dom";
import type { LLMErrorKind } from "../../llm/types";
import type { ChatTheme } from "../../types";

interface ErrorBannerProps {
  message: string;
  kind?: LLMErrorKind;
  onDismiss: () => void;
  /**
   * 現在の配色テーマ(機能拡張: テーマの上部バー・入力エリアへの適用)。
   * 濃い赤の半透明背景+薄い赤文字は暗い背景専用の配色のため、light/naturalの
   * 明るいサーフェスの上では文字が沈んでほぼ読めなくなる。テーマに応じて
   * 明背景用の配色(赤系だが不透明な淡色背景+濃い赤文字)に切り替える。
   */
  theme?: ChatTheme;
}

export function ErrorBanner({ message, kind, onDismiss, theme = "dark" }: ErrorBannerProps) {
  const showSettingsLink =
    kind === "missingKey" || kind === "keyInvalid" || kind === "permissionDenied";
  const isLightSurface = theme === "light" || theme === "natural";

  const boxClass = isLightSurface
    ? "border-red-300 bg-red-50 text-red-800"
    : "border-red-800 bg-red-950/50 text-red-200";
  const linkClass = isLightSurface
    ? "text-red-700 hover:text-red-900"
    : "text-red-300 hover:text-red-100";
  const closeClass = isLightSurface ? "text-red-600 hover:text-red-800" : "text-red-300 hover:text-red-100";

  return (
    <div className={`mb-2 flex items-start justify-between gap-3 rounded-md border px-3 py-2 text-sm ${boxClass}`}>
      <div className="min-w-0">
        <p className="break-words">{message}</p>
        {showSettingsLink && (
          <Link to="/settings" className={`mt-1 inline-block text-xs underline ${linkClass}`}>
            設定画面を開く
          </Link>
        )}
      </div>
      <button type="button" onClick={onDismiss} className={`shrink-0 ${closeClass}`} aria-label="閉じる">
        ×
      </button>
    </div>
  );
}
