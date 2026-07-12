// 再生成ボタン(オプション付きドロップダウン、仕様書7.3)
import { useState } from "react";
import { REGENERATE_OPTION_LABELS, type RegenerateOption } from "../../llm/promptBuilder";

interface RegenerateMenuProps {
  disabled: boolean;
  onRegenerate: (options: RegenerateOption[]) => void;
}

const allOptions = Object.keys(REGENERATE_OPTION_LABELS) as RegenerateOption[];

export function RegenerateMenu({ disabled, onRegenerate }: RegenerateMenuProps) {
  const [open, setOpen] = useState(false);

  return (
    <div className="relative">
      <button
        type="button"
        disabled={disabled}
        onClick={() => setOpen((v) => !v)}
        className="rounded-md border border-[var(--chat-button-border)] px-3 py-2 text-sm text-[var(--chat-button-text)] hover:bg-[var(--chat-input-bg)] disabled:cursor-not-allowed disabled:opacity-40"
      >
        再生成 ▾
      </button>
      {open && !disabled && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="absolute bottom-full right-0 z-50 mb-1 w-56 rounded-lg border border-zinc-700 bg-zinc-900 p-1 shadow-xl">
            <button
              type="button"
              onClick={() => {
                setOpen(false);
                onRegenerate([]);
              }}
              className="block w-full rounded-md px-2 py-1.5 text-left text-sm text-zinc-100 hover:bg-zinc-800"
            >
              そのまま再生成
            </button>
            <div className="my-1 h-px bg-zinc-800" />
            {allOptions.map((opt) => (
              <button
                key={opt}
                type="button"
                onClick={() => {
                  setOpen(false);
                  onRegenerate([opt]);
                }}
                className="block w-full rounded-md px-2 py-1.5 text-left text-sm text-zinc-300 hover:bg-zinc-800"
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
