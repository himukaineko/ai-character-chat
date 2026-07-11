// タグ風の入力コンポーネント(likes/dislikes/ngWords/nicknames等で使う)
import { useState } from "react";

interface TagInputProps {
  label: string;
  values: string[];
  onChange: (values: string[]) => void;
  placeholder?: string;
  /** AI入力補助(仕様書8.1): このフィールドだけ再提案するボタンを添える場合に指定する */
  onAssist?: () => void;
  assisting?: boolean;
}

export function TagInput({
  label,
  values,
  onChange,
  placeholder,
  onAssist,
  assisting,
}: TagInputProps) {
  const [draft, setDraft] = useState("");

  const addTag = () => {
    const trimmed = draft.trim();
    if (!trimmed) return;
    if (values.includes(trimmed)) {
      setDraft("");
      return;
    }
    onChange([...values, trimmed]);
    setDraft("");
  };

  const removeTag = (index: number) => {
    onChange(values.filter((_, i) => i !== index));
  };

  return (
    <div>
      {label && (
        <div className="mb-1 flex items-center justify-between gap-2">
          <label className="block text-sm font-medium text-zinc-300">{label}</label>
          {onAssist && (
            <button
              type="button"
              onClick={onAssist}
              disabled={assisting}
              className="-my-1.5 px-1 py-1.5 text-xs text-indigo-400 hover:text-indigo-300 disabled:cursor-not-allowed disabled:opacity-40"
            >
              {assisting ? "提案中…" : "AIで再提案"}
            </button>
          )}
        </div>
      )}
      <div className="flex flex-wrap gap-1.5 rounded-md border border-zinc-700 bg-zinc-900 p-2">
        {values.map((tag, index) => (
          <span
            key={`${tag}-${index}`}
            className="flex items-center gap-1 rounded-full bg-zinc-700 px-2 py-0.5 text-xs text-zinc-100"
          >
            {tag}
            <button
              type="button"
              onClick={() => removeTag(index)}
              className="text-zinc-400 hover:text-zinc-100"
              aria-label={`${tag}を削除`}
            >
              ×
            </button>
          </span>
        ))}
        <input
          type="text"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === ",") {
              e.preventDefault();
              addTag();
            } else if (e.key === "Backspace" && draft === "" && values.length > 0) {
              removeTag(values.length - 1);
            }
          }}
          onBlur={addTag}
          placeholder={placeholder ?? "入力してEnter"}
          className="min-w-[8rem] flex-1 bg-transparent text-sm text-zinc-100 outline-none placeholder:text-zinc-500"
        />
      </div>
    </div>
  );
}
