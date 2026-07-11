// 会話ログの段階式削除(仕様書7.4)
// ログのみ削除 / ログ+要約を削除 / ルーム完全リセット。いずれも確認ダイアログ必須。
import { useState } from "react";
import { ConfirmDialog } from "../ConfirmDialog";

type DeleteStage = "logOnly" | "logAndSummary" | "resetAll" | null;

interface LogManageMenuProps {
  onDeleteLogOnly: () => Promise<void>;
  onDeleteLogAndSummary: () => Promise<void>;
  onResetAll: () => Promise<void>;
}

export function LogManageMenu({
  onDeleteLogOnly,
  onDeleteLogAndSummary,
  onResetAll,
}: LogManageMenuProps) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [confirmStage, setConfirmStage] = useState<DeleteStage>(null);
  const [running, setRunning] = useState(false);

  const run = async (fn: () => Promise<void>) => {
    setRunning(true);
    try {
      await fn();
    } finally {
      setRunning(false);
      setConfirmStage(null);
    }
  };

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setMenuOpen((v) => !v)}
        className="rounded-md border border-zinc-700 px-3 py-1.5 text-xs text-zinc-300 hover:bg-zinc-800"
      >
        ログ管理
      </button>
      {menuOpen && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setMenuOpen(false)} />
          <div className="absolute right-0 top-full z-50 mt-1 w-56 rounded-lg border border-zinc-700 bg-zinc-900 p-1 shadow-xl">
            <button
              type="button"
              onClick={() => {
                setMenuOpen(false);
                setConfirmStage("logOnly");
              }}
              className="block w-full rounded-md px-2 py-1.5 text-left text-sm text-zinc-300 hover:bg-zinc-800"
            >
              ログのみ削除
            </button>
            <button
              type="button"
              onClick={() => {
                setMenuOpen(false);
                setConfirmStage("logAndSummary");
              }}
              className="block w-full rounded-md px-2 py-1.5 text-left text-sm text-zinc-300 hover:bg-zinc-800"
            >
              ログ+要約を削除
            </button>
            <button
              type="button"
              onClick={() => {
                setMenuOpen(false);
                setConfirmStage("resetAll");
              }}
              className="block w-full rounded-md px-2 py-1.5 text-left text-sm text-red-400 hover:bg-red-500/10"
            >
              ルーム完全リセット
            </button>
          </div>
        </>
      )}

      <ConfirmDialog
        open={confirmStage === "logOnly"}
        title="ログのみ削除しますか?"
        message="会話メッセージだけを削除します。記憶・要約・ルーム設定はそのまま残ります。この操作は取り消せません。"
        confirmLabel="削除する"
        onCancel={() => setConfirmStage(null)}
        onConfirm={() => run(onDeleteLogOnly)}
      />
      <ConfirmDialog
        open={confirmStage === "logAndSummary"}
        title="ログ+要約を削除しますか?"
        message="会話メッセージと会話要約を削除します。長期記憶・関係性記憶は残ります。この操作は取り消せません。"
        confirmLabel="削除する"
        onCancel={() => setConfirmStage(null)}
        onConfirm={() => run(onDeleteLogAndSummary)}
      />
      <ConfirmDialog
        open={confirmStage === "resetAll"}
        title="ルームを完全リセットしますか?"
        message="このルームの会話ログ・要約・長期記憶・関係性記憶をすべて削除します。キャラクター本体やルーム設定には影響しません。この操作は取り消せません。"
        confirmLabel="完全リセットする"
        onCancel={() => setConfirmStage(null)}
        onConfirm={() => run(onResetAll)}
      />
      {running && (
        <span className="pointer-events-none absolute -bottom-6 right-0 text-xs text-zinc-500">実行中…</span>
      )}
    </div>
  );
}
