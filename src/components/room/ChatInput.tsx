// 下部入力エリア(仕様書10.2)
// セグメントコントロールで「トピック」/「発言」を切替。
// 「次の会話を生成」ボタン(観察用)・再生成ボタン(オプション付き)・元に戻すボタンを併設する。
// 自動連続生成(仕様書5.1): 回数上限付きで「次の会話を生成」を連続実行できる。無限生成は禁止。
import { useEffect, useRef, useState, type FormEvent } from "react";
import type { RegenerateOption } from "../../llm/promptBuilder";
import { AUTO_GENERATE_COUNT_OPTIONS, AUTO_GENERATE_DEFAULT_COUNT } from "../../lib/autoGenerate";
import { RegenerateMenu } from "./RegenerateMenu";

export type InputMode = "topic" | "message";

interface ChatInputProps {
  generating: boolean;
  canRegenerate: boolean;
  canUndo: boolean;
  /** 自動連続生成が実行中か(1回ごとのgeneratingとは別に、ループ全体を表す) */
  autoGenerating: boolean;
  onSubmitTopic: (text: string) => void;
  onSubmitMessage: (text: string) => void;
  onGenerateNext: () => void;
  onAutoGenerate: (times: number) => void;
  onStopAutoGenerate: () => void;
  onRegenerate: (options: RegenerateOption[]) => void;
  onUndo: () => void;
}

export function ChatInput({
  generating,
  canRegenerate,
  canUndo,
  autoGenerating,
  onSubmitTopic,
  onSubmitMessage,
  onGenerateNext,
  onAutoGenerate,
  onStopAutoGenerate,
  onRegenerate,
  onUndo,
}: ChatInputProps) {
  const [mode, setMode] = useState<InputMode>("message");
  const [draft, setDraft] = useState("");
  const [autoCount, setAutoCount] = useState<number>(AUTO_GENERATE_DEFAULT_COUNT);
  const busy = generating || autoGenerating;
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

  // 入力内容に応じて1行分の高さから数行まで自動で伸びるようにする(上限はCSSのmax-hで制御)
  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight}px`;
  }, [draft]);

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    const text = draft.trim();
    if (!text || busy) return;
    if (mode === "topic") {
      onSubmitTopic(text);
    } else {
      onSubmitMessage(text);
    }
    setDraft("");
  };

  return (
    <div className="border-t border-zinc-800 bg-zinc-950 pt-3">
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        {/* トピック/発言 切替セグメント */}
        <div className="inline-flex rounded-md border border-zinc-700 p-0.5 text-sm">
          <button
            type="button"
            onClick={() => setMode("topic")}
            className={`rounded px-3 py-1 ${
              mode === "topic" ? "bg-indigo-600 text-white" : "text-zinc-400 hover:text-zinc-200"
            }`}
          >
            トピック
          </button>
          <button
            type="button"
            onClick={() => setMode("message")}
            className={`rounded px-3 py-1 ${
              mode === "message" ? "bg-indigo-600 text-white" : "text-zinc-400 hover:text-zinc-200"
            }`}
          >
            発言
          </button>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            disabled={busy || !canUndo}
            onClick={onUndo}
            title="直前の生成を取り消す"
            className="rounded-md border border-zinc-700 px-3 py-2 text-sm text-zinc-300 hover:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-40"
          >
            元に戻す
          </button>
          <RegenerateMenu disabled={busy || !canRegenerate} onRegenerate={onRegenerate} />
          <button
            type="button"
            disabled={busy}
            onClick={onGenerateNext}
            title="トピックや発言を追加せず、今の流れのままキャラたちに会話を続けさせる"
            className="rounded-md border border-indigo-600 px-3 py-2 text-sm text-indigo-300 hover:bg-indigo-500/10 disabled:cursor-not-allowed disabled:opacity-40"
          >
            会話を続ける
          </button>

          {/* 自動連続生成(仕様書5.1): 回数上限付き。生成中は停止ボタンで中断できる */}
          <div className="flex items-center gap-1 rounded-md border border-zinc-700 pl-1">
            <select
              value={autoCount}
              onChange={(e) => setAutoCount(Number(e.target.value))}
              disabled={busy}
              title="自動連続生成の回数(上限あり)"
              className="rounded-md bg-transparent px-1 py-2 text-xs text-zinc-300 outline-none disabled:cursor-not-allowed disabled:opacity-40"
            >
              {AUTO_GENERATE_COUNT_OPTIONS.map((n) => (
                <option key={n} value={n} className="bg-zinc-900">
                  {n}回連続
                </option>
              ))}
            </select>
            {autoGenerating ? (
              <button
                type="button"
                onClick={onStopAutoGenerate}
                className="rounded-md border border-red-700 px-3 py-2 text-sm text-red-300 hover:bg-red-500/10"
              >
                停止
              </button>
            ) : (
              <button
                type="button"
                disabled={generating}
                onClick={() => onAutoGenerate(autoCount)}
                className="rounded-md px-3 py-2 text-sm text-zinc-300 hover:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-40"
              >
                自動生成
              </button>
            )}
          </div>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="flex items-end gap-2">
        <textarea
          ref={textareaRef}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              handleSubmit(e);
            }
          }}
          rows={1}
          placeholder={
            mode === "topic"
              ? "例: 夕飯を何にするか相談 / ちょっと気まずい空気になっている"
              : "キャラクターたちに向けて発言する(【 】で行動描写。セリフの途中でもOK)"
          }
          className="max-h-32 min-h-[42px] flex-1 resize-none rounded-md border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-zinc-100 outline-none focus:border-indigo-500"
        />
        <button
          type="submit"
          disabled={busy || !draft.trim()}
          className="shrink-0 rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-500 disabled:cursor-not-allowed disabled:opacity-40"
        >
          {mode === "topic" ? "投入" : "送信"}
        </button>
      </form>
      {mode === "message" ? (
        <p className="mt-1 text-xs text-zinc-600">
          【 】で囲むと行動描写になります(セリフの途中でもOK)/ Shift+Enterで改行
        </p>
      ) : (
        <p className="mt-1 text-xs text-zinc-600">
          投入すると、その話題でキャラたちが話し始めます
        </p>
      )}
    </div>
  );
}
