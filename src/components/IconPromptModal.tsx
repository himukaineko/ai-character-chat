// キャラの顔絵アイコン用プロンプト生成モーダル(機能追加)
// ライブラリのキャラカードの「顔絵プロンプト」ボタンから開く。外見・性格などを画像生成AI用の
// 日本語プロンプトに変換し、ユーザーがコピペで画像生成AI(ChatGPT等)に持っていけるようにする。
// 生成結果はDBに保存しない(その場限り。モーダルを閉じたら破棄する)。
import { useState } from "react";
import type { Character } from "../types";
import { generateIconPrompt } from "../llm/iconPromptService";
import { LLMError, LLM_ERROR_MESSAGES, type LLMErrorKind } from "../llm/types";
import { copyTextToClipboard } from "../lib/clipboard";

interface IconPromptModalProps {
  open: boolean;
  character: Character | null;
  onClose: () => void;
}

export function IconPromptModal({ open, character, onClose }: IconPromptModalProps) {
  const [generating, setGenerating] = useState(false);
  const [prompt, setPrompt] = useState("");
  const [error, setError] = useState<{ message: string; kind?: LLMErrorKind } | null>(null);
  const [copied, setCopied] = useState(false);

  if (!open || !character) return null;

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
      const result = await generateIconPrompt(character);
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
      {/* ライブラリはダーク固定ページのため、既存のライブラリ系モーダルと同じzinc系配色にする */}
      <div
        className="flex max-h-[85vh] w-full max-w-lg flex-col rounded-lg border border-zinc-700 bg-zinc-900 p-5 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="text-base font-semibold text-zinc-100">顔絵アイコン用プロンプト生成</h2>
            <p className="mt-1 text-xs text-zinc-500">
              「{character.name || "(名称未設定)"}」の外見・性格をもとに、画像生成AI(ChatGPT等)で顔アイコンを作るためのプロンプトを作成します。
            </p>
          </div>
          <button
            type="button"
            onClick={handleClose}
            aria-label="閉じる"
            className="shrink-0 rounded-md px-2 py-1 text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200"
          >
            ×
          </button>
        </div>

        {!character.appearance && (
          <p className="mt-3 rounded-md border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-300">
            外見が未入力です。編集画面の「AIで再提案」で外見を埋めると、より正確なプロンプトになります。
          </p>
        )}

        <button
          type="button"
          onClick={() => void handleGenerate()}
          disabled={generating}
          className="mt-4 self-start rounded-md bg-indigo-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-indigo-500 disabled:opacity-50"
        >
          {generating ? "生成中…" : "このキャラの顔絵プロンプトを生成"}
        </button>

        {error && (
          <div className="mt-3 rounded-md border border-red-500/40 bg-red-500/10 px-3 py-2 text-sm text-red-300">
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
              className="w-full flex-1 resize-none rounded-md border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm text-zinc-100 outline-none focus:border-indigo-500"
            />
            <div className="mt-2 flex items-center gap-2">
              <button
                type="button"
                onClick={() => void handleCopy()}
                disabled={!prompt}
                className="rounded-md border border-zinc-700 px-3 py-1.5 text-sm text-zinc-300 hover:bg-zinc-800 disabled:opacity-50"
              >
                コピー
              </button>
              {copied && <span className="text-xs text-indigo-300">コピーしました</span>}
            </div>
          </div>
        )}

        <p className="mt-4 text-xs text-zinc-500">
          生成した画像は、キャラの編集画面からアイコンとしてアップロードできます(トリミング可能)。
        </p>
      </div>
    </div>
  );
}
