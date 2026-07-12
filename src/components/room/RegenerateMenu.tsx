// 再生成ボタン(オプション付きドロップダウン、仕様書7.3)
import { useRef, useState, type CSSProperties } from "react";
import { REGENERATE_OPTION_LABELS, type RegenerateOption } from "../../llm/promptBuilder";
import { calcDropdownStyle } from "../../lib/dropdownPosition";

interface RegenerateMenuProps {
  disabled: boolean;
  onRegenerate: (options: RegenerateOption[]) => void;
}

const allOptions = Object.keys(REGENERATE_OPTION_LABELS) as RegenerateOption[];

export function RegenerateMenu({ disabled, onRegenerate }: RegenerateMenuProps) {
  const [open, setOpen] = useState(false);

  // はみ出し修正(モバイル対応): トリガー基準のabsolute(right-0)だと、モバイルの
  // 「⋯」オプション行(画面左寄り)から開いたときメニューの左端が画面外に切れるため、
  // fixed配置+画面内クランプで必ず収める。
  const buttonRef = useRef<HTMLButtonElement | null>(null);
  const [menuStyle, setMenuStyle] = useState<CSSProperties>({});

  const toggleMenu = () => {
    if (!open && buttonRef.current) {
      setMenuStyle(calcDropdownStyle(buttonRef.current, { menuWidth: 224, direction: "up" }));
    }
    setOpen((v) => !v);
  };

  return (
    <div className="relative">
      <button
        ref={buttonRef}
        type="button"
        disabled={disabled}
        onClick={toggleMenu}
        className="rounded-md border border-[var(--chat-button-border)] px-3 py-2 text-sm text-[var(--chat-button-text)] hover:bg-[var(--chat-input-bg)] disabled:cursor-not-allowed disabled:opacity-40"
      >
        再生成 ▾
      </button>
      {open && !disabled && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          {/* テーマ統一(機能修正): 黒固定をやめ、テーマのサーフェス色で表示する */}
          <div
            className="fixed z-50 rounded-lg border border-[var(--chat-button-border,#3f3f46)] bg-[var(--chat-surface,#18181b)] p-1 shadow-xl"
            style={menuStyle}
          >
            <button
              type="button"
              onClick={() => {
                setOpen(false);
                onRegenerate([]);
              }}
              className="block w-full rounded-md px-2 py-1.5 text-left text-sm text-[var(--chat-heading-text,#f4f4f5)] hover:bg-[var(--chat-input-bg,#27272a)]"
            >
              そのまま再生成
            </button>
            <div className="my-1 h-px bg-[var(--chat-border,#27272a)]" />
            {allOptions.map((opt) => (
              <button
                key={opt}
                type="button"
                onClick={() => {
                  setOpen(false);
                  onRegenerate([opt]);
                }}
                className="block w-full rounded-md px-2 py-1.5 text-left text-sm text-[var(--chat-button-text,#d4d4d8)] hover:bg-[var(--chat-input-bg,#27272a)]"
              >
                {REGENERATE_OPTION_LABELS[opt]}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
