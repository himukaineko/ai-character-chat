// 破壊的操作(削除・置き換えなど)の前に必ず挟む確認ダイアログ
//
// 配色メモ(機能修正: フローティングUIのテーマ統一): ルーム画面ではCSS変数 var(--chat-*) を
// 継承してテーマ(黒系/濃紺系/白系/ナチュラル系)に連動する。設定・ライブラリ等の
// ダーク固定ページではテーマ変数が定義されていないため、フォールバック値(従来のダーク配色)で
// これまでどおりの見た目になる。
interface ConfirmDialogProps {
  open: boolean;
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  danger?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

export function ConfirmDialog({
  open,
  title,
  message,
  confirmLabel = "実行する",
  cancelLabel = "キャンセル",
  danger = true,
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
      onClick={onCancel}
    >
      <div
        className="w-full max-w-sm rounded-lg border border-[var(--chat-button-border,#3f3f46)] bg-[var(--chat-surface,#18181b)] p-5 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="text-base font-semibold text-[var(--chat-heading-text,#f4f4f5)]">{title}</h2>
        <p className="mt-2 whitespace-pre-wrap text-sm text-[var(--chat-muted-text,#a1a1aa)]">{message}</p>
        <div className="mt-5 flex justify-end gap-2">
          <button
            type="button"
            onClick={onCancel}
            className="rounded-md border border-[var(--chat-button-border,#3f3f46)] px-3 py-1.5 text-sm text-[var(--chat-button-text,#d4d4d8)] hover:bg-[var(--chat-input-bg,#27272a)]"
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            onClick={onConfirm}
            className={`rounded-md px-3 py-1.5 text-sm font-medium text-white ${
              danger ? "bg-red-600 hover:bg-red-500" : "bg-indigo-600 hover:bg-indigo-500"
            }`}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
