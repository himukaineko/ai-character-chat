// シーンのスチル(1枚絵)用プロンプト生成モーダル(機能追加)
// 上部バーの「スチル」ボタンから開く。今の会話シーンを画像生成AI用の日本語プロンプトに変換し、
// ユーザーがコピペで画像生成AI(ChatGPT等)に持っていけるようにする。
// 生成結果はDBに保存しない(その場限り。モーダルを閉じたら破棄する)。
import { useState } from "react";
import { generateStillPrompt } from "../../llm/stillPromptService";
import { LLMError, LLM_ERROR_MESSAGES, type LLMErrorKind } from "../../llm/types";
import { copyTextToClipboard } from "../../lib/clipboard";

interface StillPromptModalProps {
  open: boolean;
  roomId: string;
  /** 会話が1件もない場合はボタンを出さず案内文のみ表示する */
  hasMessages: boolean;
  onClose: () => void;
}

export function StillPromptModal({ open, roomId, hasMessages, onClose }: StillPromptModalProps) {
  const [generating, setGenerating] = useState(false);
  const [prompt, setPrompt] = useState("");
  const [error, setError] = useState<{ message: string; kind?: LLMErrorKind } | null>(null);
  const [copied, setCopied] = useState(false);

  if (!open) return null;

  // モーダルを閉じたら生成結果は破棄する(保存しない仕様)
  const handleClose = () => {
    setPrompt("");
    setError(null);
    setCopied(false);
    onClose();
  };

  const handleGenerate = async () => {
    setGenerating(true);
    setError(null);
    setCopied(false);
    try {
      const result = await generateStillPrompt(roomId);
      setPrompt(result);
    } catch (err) {
      if (err instanceof LLMError) {
        setError({ message: err.message || LLM_ERROR_MESSAGES[err.kind], kind: err.kind });
      } else {
        setError({ message: err instanceof Error ? err.message : "予期しないエラーが発生しました。" });
      }
    } finally {
      setGenerating(false);
    }
  };

  const handleCopy = async () => {
    const succeeded = await copyTextToClipboard(prompt);
    if (succeeded) {
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } else {
      setError({ message: "クリップボードへのコピーに失敗しました。テキストを選択して手動でコピーしてください。" });
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={handleClose}>
      {/* テーマ統一(機能修正): 黒固定をやめ、テーマのサーフェス色で表示する */}
      <div
        className="flex max-h-[85vh] w-full max-w-lg flex-col rounded-lg border border-[var(--chat-button-border,#3f3f46)] bg-[var(--chat-surface,#18181b)] p-5 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="text-base font-semibold text-[var(--chat-heading-text,#f4f4f5)]">スチル用プロンプト生成</h2>
            <p className="mt-1 text-xs text-[var(--chat-placeholder-text,#71717a)]">
              今の会話シーンを画像生成AI(ChatGPT等)でイラスト化するためのプロンプトを作成します。キャラクターのイラストは別途ご自身で添付してください。
            </p>
          </div>
          <button
            type="button"
            onClick={handleClose}
            aria-label="閉じる"
            className="shrink-0 rounded-md px-2 py-1 text-[var(--chat-muted-text,#a1a1aa)] hover:bg-[var(--chat-input-bg,#27272a)] hover:text-[var(--chat-heading-text,#e4e4e7)]"
          >
            ×
          </button>
        </div>

        {!hasMessages ? (
          <p className="mt-4 rounded-md border border-[var(--chat-border,#27272a)] bg-[var(--chat-input-bg,#09090b)] px-3 py-2 text-sm text-[var(--chat-placeholder-text,#71717a)]">
            会話がまだありません。まず会話を進めてからお試しください。
          </p>
        ) : (
          <>
            <button
              type="button"
              onClick={() => void handleGenerate()}
              disabled={generating}
              className="mt-4 self-start rounded-md bg-indigo-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-indigo-500 disabled:opacity-50"
            >
              {generating ? "生成中…" : "このシーンのプロンプトを生成"}
            </button>

            {error && (
              // 半透明の赤はどのテーマの背景でも成立する。文字色だけテーマの危険色に連動させる
              <div className="mt-3 rounded-md border border-red-500/40 bg-red-500/10 px-3 py-2 text-sm text-[var(--chat-danger-text,#fecaca)]">
                <p>{error.message}</p>
              </div>
            )}

            {(prompt || generating) && (
              <div className="mt-4 flex min-h-0 flex-1 flex-col">
                <textarea
                  value={prompt}
                  onChange={(e) => setPrompt(e.target.value)}
                  placeholder={generating ? "生成しています…" : ""}
                  rows={10}
                  className="w-full flex-1 resize-none rounded-md border border-[var(--chat-button-border,#3f3f46)] bg-[var(--chat-input-bg,#09090b)] px-3 py-2 text-sm text-[var(--chat-input-text,#f4f4f5)] outline-none focus:border-indigo-500"
                />
                <div className="mt-2 flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => void handleCopy()}
                    disabled={!prompt}
                    className="rounded-md border border-[var(--chat-button-border,#3f3f46)] px-3 py-1.5 text-sm text-[var(--chat-button-text,#d4d4d8)] hover:bg-[var(--chat-input-bg,#27272a)] disabled:opacity-50"
                  >
                    コピー
                  </button>
                  {copied && (
                    <span className="text-xs text-[var(--chat-accent-text,#a5b4fc)]">コピーしました</span>
                  )}
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
