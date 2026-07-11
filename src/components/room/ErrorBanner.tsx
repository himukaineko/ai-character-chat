// APIエラー表示バナー(仕様書10.3): 原因が分かる日本語メッセージで表示する
import { Link } from "react-router-dom";
import type { LLMErrorKind } from "../../llm/types";

interface ErrorBannerProps {
  message: string;
  kind?: LLMErrorKind;
  onDismiss: () => void;
}

export function ErrorBanner({ message, kind, onDismiss }: ErrorBannerProps) {
  const showSettingsLink =
    kind === "missingKey" || kind === "keyInvalid" || kind === "permissionDenied";

  return (
    <div className="mb-2 flex items-start justify-between gap-3 rounded-md border border-red-800 bg-red-950/50 px-3 py-2 text-sm text-red-200">
      <div className="min-w-0">
        <p className="break-words">{message}</p>
        {showSettingsLink && (
          <Link to="/settings" className="mt-1 inline-block text-xs text-red-300 underline hover:text-red-100">
            設定画面を開く
          </Link>
        )}
      </div>
      <button
        type="button"
        onClick={onDismiss}
        className="shrink-0 text-red-300 hover:text-red-100"
        aria-label="閉じる"
      >
        ×
      </button>
    </div>
  );
}
