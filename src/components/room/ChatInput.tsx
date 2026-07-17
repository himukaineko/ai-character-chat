// 下部入力エリア(仕様書10.2)
// セグメントコントロールで「トピック」/「発言」を切替。
// 「次の会話を生成」ボタン(観察用)・再生成ボタン(オプション付き)・元に戻すボタンを併設する。
// 自動連続生成(仕様書5.1): 回数上限付きで「次の会話を生成」を連続実行できる。無限生成は禁止。
//
// モバイル入力欄のコンパクト化(機能追加): sm未満の画面ではボタンが並びすぎて
// 入力欄が狭くなるため、常時表示は最低限(トピック/発言切替・会話を続ける・入力欄・⋯)に絞り、
// 元に戻す/再生成/自動生成は「⋯」を押したときだけ展開するオプション行に収める。
// 自動連続生成中の停止ボタンだけは、止められなくなることを防ぐため「⋯」の外(常時表示位置)に置く。
// デスクトップ(sm以上)は既存の全ボタン常時表示のまま変更しない。
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
  /**
   * メッセージ編集機能(機能追加): 「編集」で巻き戻したメッセージの元テキストを
   * 入力欄に流し込むための指示。参照が変わるたびに1回だけ反映し、消費後は
   * onPrefillConsumed で親側の状態をnullに戻してもらう(再レンダーでの再流し込みを防ぐため)。
   */
  prefill: { text: string; mode: InputMode } | null;
  onPrefillConsumed: () => void;
  /**
   * キャラのセリフ・地の文の編集中は、送信をユーザー発言ではなく
   * 「元の話者の発言の再投稿+続きの生成」に切り替える。nullなら通常送信。
   * labelは編集中バナーの表示名(キャラ名または「地の文」)。
   */
  editing: { label: string } | null;
  onSubmitEdit: (text: string) => void;
  onCancelEdit: () => void;
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
  prefill,
  onPrefillConsumed,
  editing,
  onSubmitEdit,
  onCancelEdit,
}: ChatInputProps) {
  const [mode, setMode] = useState<InputMode>("message");
  const [draft, setDraft] = useState("");
  const [autoCount, setAutoCount] = useState<number>(AUTO_GENERATE_DEFAULT_COUNT);
  const busy = generating || autoGenerating;
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  // モバイル用「⋯」オプション行の開閉(元に戻す/再生成/自動生成をここにまとめる)
  const [mobileOptionsOpen, setMobileOptionsOpen] = useState(false);

  // 入力内容に応じて1行分の高さから数行まで自動で伸びるようにする(上限はCSSのmax-hで制御)
  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight}px`;
  }, [draft]);

  // メッセージ編集機能: 親から編集対象のテキストが渡されたら、入力欄に流し込んで
  // 続きを打てるようにフォーカスする。1回きりの反映のため消費後は親に通知する。
  useEffect(() => {
    if (!prefill) return;
    setMode(prefill.mode);
    setDraft(prefill.text);
    textareaRef.current?.focus();
    onPrefillConsumed();
  }, [prefill, onPrefillConsumed]);

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    const text = draft.trim();
    if (!text || busy) return;
    if (editing) {
      // キャラのセリフ・地の文の編集中: ユーザー発言ではなく元の話者として再投稿する
      onSubmitEdit(text);
    } else if (mode === "topic") {
      onSubmitTopic(text);
    } else {
      onSubmitMessage(text);
    }
    setDraft("");
  };

  return (
    <div className="border-t border-[var(--chat-border)] bg-[var(--chat-surface)] pt-3">
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        {/* トピック/発言 切替セグメント */}
        <div className="inline-flex rounded-md border border-[var(--chat-button-border)] p-0.5 text-sm">
          <button
            type="button"
            onClick={() => setMode("topic")}
            className={`rounded px-3 py-1 ${
              mode === "topic"
                ? "bg-indigo-600 text-white"
                : "text-[var(--chat-placeholder-text)] hover:text-[var(--chat-button-text)]"
            }`}
          >
            トピック
          </button>
          <button
            type="button"
            onClick={() => setMode("message")}
            className={`rounded px-3 py-1 ${
              mode === "message"
                ? "bg-indigo-600 text-white"
                : "text-[var(--chat-placeholder-text)] hover:text-[var(--chat-button-text)]"
            }`}
          >
            発言
          </button>
        </div>

        {/* デスクトップ(sm以上): 従来どおり全ボタンを常時表示する */}
        <div className="hidden flex-wrap items-center gap-2 sm:flex">
          <button
            type="button"
            disabled={busy || !canUndo}
            onClick={onUndo}
            title="直前の生成を取り消す"
            className="rounded-md border border-[var(--chat-button-border)] px-3 py-2 text-sm text-[var(--chat-button-text)] hover:bg-[var(--chat-input-bg)] disabled:cursor-not-allowed disabled:opacity-40"
          >
            元に戻す
          </button>
          <RegenerateMenu disabled={busy || !canRegenerate} onRegenerate={onRegenerate} />
          <button
            type="button"
            disabled={busy}
            onClick={onGenerateNext}
            title="トピックや発言を追加せず、今の流れのままキャラたちに会話を続けさせる"
            className="rounded-md border border-indigo-600 px-3 py-2 text-sm text-[var(--chat-accent-text)] hover:bg-indigo-500/10 disabled:cursor-not-allowed disabled:opacity-40"
          >
            会話を続ける
          </button>

          {/* 自動連続生成(仕様書5.1): 回数上限付き。生成中は停止ボタンで中断できる */}
          <div className="flex items-center gap-1 rounded-md border border-[var(--chat-button-border)] pl-1">
            <select
              value={autoCount}
              onChange={(e) => setAutoCount(Number(e.target.value))}
              disabled={busy}
              title="自動連続生成の回数(上限あり)"
              className="rounded-md bg-transparent px-1 py-2 text-xs text-[var(--chat-button-text)] outline-none disabled:cursor-not-allowed disabled:opacity-40"
            >
              {AUTO_GENERATE_COUNT_OPTIONS.map((n) => (
                <option
                  key={n}
                  value={n}
                  className="bg-[var(--chat-input-bg)] text-[var(--chat-input-text)]"
                >
                  {n}回連続
                </option>
              ))}
            </select>
            {autoGenerating ? (
              <button
                type="button"
                onClick={onStopAutoGenerate}
                className="rounded-md border border-red-700 px-3 py-2 text-sm text-[var(--chat-danger-text)] hover:bg-red-500/10"
              >
                停止
              </button>
            ) : (
              <button
                type="button"
                disabled={generating}
                onClick={() => onAutoGenerate(autoCount)}
                className="rounded-md px-3 py-2 text-sm text-[var(--chat-button-text)] hover:bg-[var(--chat-input-bg)] disabled:cursor-not-allowed disabled:opacity-40"
              >
                自動生成
              </button>
            )}
          </div>
        </div>

        {/*
          モバイル(sm未満): 常時表示は最低限だけにする。
          「会話を続ける」は常時表示、自動生成中は停止ボタンも⋯の外(常時表示位置)に出す
          (自動生成中に止められなくなることを防ぐため)。それ以外(元に戻す/再生成/自動生成の開始)は
          「⋯」を押したときだけ下に展開する。
        */}
        <div className="flex items-center gap-2 sm:hidden">
          <button
            type="button"
            disabled={busy}
            onClick={onGenerateNext}
            title="トピックや発言を追加せず、今の流れのままキャラたちに会話を続けさせる"
            className="rounded-md border border-indigo-600 px-3 py-2 text-sm text-[var(--chat-accent-text)] hover:bg-indigo-500/10 disabled:cursor-not-allowed disabled:opacity-40"
          >
            会話を続ける
          </button>
          {autoGenerating && (
            <button
              type="button"
              onClick={onStopAutoGenerate}
              className="rounded-md border border-red-700 px-3 py-2 text-sm text-[var(--chat-danger-text)] hover:bg-red-500/10"
            >
              停止
            </button>
          )}
          <button
            type="button"
            onClick={() => setMobileOptionsOpen((v) => !v)}
            aria-expanded={mobileOptionsOpen}
            aria-label="その他の操作(元に戻す・再生成・自動生成)"
            title="その他の操作(元に戻す・再生成・自動生成)"
            className={`rounded-md border px-3 py-2 text-sm ${
              mobileOptionsOpen
                ? "border-indigo-400 text-[var(--chat-accent-text)]"
                : "border-[var(--chat-button-border)] text-[var(--chat-button-text)] hover:bg-[var(--chat-input-bg)]"
            }`}
          >
            ⋯
          </button>
        </div>
      </div>

      {/* モバイル用オプション行(「⋯」で開閉): 元に戻す・再生成・自動生成の開始をここにまとめる */}
      {mobileOptionsOpen && (
        <div className="mb-2 flex flex-wrap items-center gap-2 rounded-md border border-[var(--chat-border)] bg-[var(--chat-input-bg)] p-2 sm:hidden">
          <button
            type="button"
            disabled={busy || !canUndo}
            onClick={onUndo}
            title="直前の生成を取り消す"
            className="rounded-md border border-[var(--chat-button-border)] px-3 py-2 text-sm text-[var(--chat-button-text)] hover:bg-[var(--chat-surface)] disabled:cursor-not-allowed disabled:opacity-40"
          >
            元に戻す
          </button>
          <RegenerateMenu disabled={busy || !canRegenerate} onRegenerate={onRegenerate} />
          {!autoGenerating && (
            <div className="flex items-center gap-1 rounded-md border border-[var(--chat-button-border)] pl-1">
              <select
                value={autoCount}
                onChange={(e) => setAutoCount(Number(e.target.value))}
                disabled={busy}
                title="自動連続生成の回数(上限あり)"
                className="rounded-md bg-transparent px-1 py-2 text-xs text-[var(--chat-button-text)] outline-none disabled:cursor-not-allowed disabled:opacity-40"
              >
                {AUTO_GENERATE_COUNT_OPTIONS.map((n) => (
                  <option
                    key={n}
                    value={n}
                    className="bg-[var(--chat-input-bg)] text-[var(--chat-input-text)]"
                  >
                    {n}回連続
                  </option>
                ))}
              </select>
              <button
                type="button"
                disabled={generating}
                onClick={() => onAutoGenerate(autoCount)}
                className="rounded-md px-3 py-2 text-sm text-[var(--chat-button-text)] hover:bg-[var(--chat-surface)] disabled:cursor-not-allowed disabled:opacity-40"
              >
                自動生成
              </button>
            </div>
          )}
        </div>
      )}

      {/* メッセージ編集機能: キャラのセリフ・地の文の編集中であることを明示するバナー。
          ×で解除すると通常のユーザー発言としての送信に戻る(入力中のテキストは残す)。 */}
      {editing && (
        <div className="mb-2 flex items-center justify-between gap-2 rounded-md border border-indigo-500/50 bg-indigo-500/10 px-3 py-1.5 text-xs text-[var(--chat-accent-text)]">
          <span>
            「{editing.label}」の発言を編集中 — 送信すると元の話者の発言として置き換わり、続きが生成されます
          </span>
          <button
            type="button"
            onClick={onCancelEdit}
            aria-label="編集をやめる(通常の発言として送信する)"
            title="編集をやめる(通常の発言として送信する)"
            className="shrink-0 rounded px-1.5 py-0.5 text-sm hover:bg-indigo-500/20"
          >
            ×
          </button>
        </div>
      )}

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
          className="max-h-32 min-h-[42px] flex-1 resize-none rounded-md border border-[var(--chat-button-border)] bg-[var(--chat-input-bg)] px-3 py-2 text-sm text-[var(--chat-input-text)] outline-none placeholder:text-[var(--chat-placeholder-text)] focus:border-indigo-500"
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
        // モバイル(sm未満)ではヒント行自体を表示しない(機能改善: チャット表示領域の拡大)。
        // プレースホルダーに同内容の説明(【 】で行動描写。セリフの途中でもOK)が
        // 既に含まれているため、ヒント行を消しても情報が失われない。
        <p className="mt-1 hidden text-xs text-[var(--chat-placeholder-text)] sm:block">
          【 】で囲むと行動描写になります(セリフの途中でもOK)/ Shift+Enterで改行
        </p>
      ) : (
        <p className="mt-1 text-xs text-[var(--chat-placeholder-text)]">
          投入すると、その話題でキャラたちが話し始めます
        </p>
      )}
    </div>
  );
}
