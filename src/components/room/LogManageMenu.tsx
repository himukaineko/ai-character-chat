// 会話ログの段階式削除(仕様書7.4)
// ログのみ削除 / ログ+要約を削除 / ルーム完全リセット。いずれも確認ダイアログ必須。
import { useRef, useState, type CSSProperties } from "react";
import { ConfirmDialog } from "../ConfirmDialog";
import { calcDropdownStyle } from "../../lib/dropdownPosition";
import { ListIcon } from "./RoomBarIcons";

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

  // はみ出し修正(モバイル対応): メニューはトリガー基準のabsoluteではなくfixedで配置し、
  // 開く瞬間にトリガー位置から画面内に収まる座標を計算する(375px幅で左端が見切れる問題の対策)。
  const buttonRef = useRef<HTMLButtonElement | null>(null);
  const [menuStyle, setMenuStyle] = useState<CSSProperties>({});

  const toggleMenu = () => {
    if (!menuOpen && buttonRef.current) {
      setMenuStyle(calcDropdownStyle(buttonRef.current, { menuWidth: 224, direction: "down" }));
    }
    setMenuOpen((v) => !v);
  };

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
        ref={buttonRef}
        type="button"
        onClick={toggleMenu}
        title="ログ管理"
        aria-label="ログ管理"
        className="flex h-10 w-10 items-center justify-center rounded-md border border-[var(--chat-button-border)] text-[var(--chat-button-text)] hover:bg-[var(--chat-input-bg)] sm:h-auto sm:w-auto sm:gap-1.5 sm:px-3 sm:py-1.5 sm:text-xs"
      >
        <ListIcon className="h-5 w-5 shrink-0" />
        <span className="hidden sm:inline">ログ管理</span>
      </button>
      {menuOpen && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setMenuOpen(false)} />
          {/* テーマ統一(機能修正): 黒固定をやめ、テーマのサーフェス色で表示する */}
          <div
            className="fixed z-50 rounded-lg border border-[var(--chat-button-border,#3f3f46)] bg-[var(--chat-surface,#18181b)] p-1 shadow-xl"
            style={menuStyle}
          >
            <button
              type="button"
              onClick={() => {
                setMenuOpen(false);
                setConfirmStage("logOnly");
              }}
              className="block w-full rounded-md px-2 py-1.5 text-left text-sm text-[var(--chat-button-text,#d4d4d8)] hover:bg-[var(--chat-input-bg,#27272a)]"
            >
              ログのみ削除
            </button>
            <button
              type="button"
              onClick={() => {
                setMenuOpen(false);
                setConfirmStage("logAndSummary");
              }}
              className="block w-full rounded-md px-2 py-1.5 text-left text-sm text-[var(--chat-button-text,#d4d4d8)] hover:bg-[var(--chat-input-bg,#27272a)]"
            >
              ログ+要約を削除
            </button>
            <button
              type="button"
              onClick={() => {
                setMenuOpen(false);
                setConfirmStage("resetAll");
              }}
              className="block w-full rounded-md px-2 py-1.5 text-left text-sm text-[var(--chat-danger-text,#f87171)] hover:bg-red-500/10"
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
        <span className="pointer-events-none absolute -bottom-6 right-0 text-xs text-[var(--chat-placeholder-text)]">実行中…</span>
      )}
    </div>
  );
}
