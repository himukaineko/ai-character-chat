// 口調サンプル(状況+セリフのペア)の追加・削除リスト
import type { SpeechSample } from "../types";

interface SpeechSampleEditorProps {
  samples: SpeechSample[];
  onChange: (samples: SpeechSample[]) => void;
  /** AI入力補助(仕様書8.1): このフィールドだけ再提案するボタンを添える場合に指定する */
  onAssist?: () => void;
  assisting?: boolean;
}

export function SpeechSampleEditor({
  samples,
  onChange,
  onAssist,
  assisting,
}: SpeechSampleEditorProps) {
  const update = (index: number, patch: Partial<SpeechSample>) => {
    onChange(samples.map((s, i) => (i === index ? { ...s, ...patch } : s)));
  };

  const remove = (index: number) => {
    onChange(samples.filter((_, i) => i !== index));
  };

  const add = () => {
    onChange([...samples, { situation: "", text: "" }]);
  };

  return (
    <div>
      <div className="mb-1 flex items-center justify-between gap-2">
        <label className="block text-sm font-medium text-zinc-300">口調サンプル</label>
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
      <div className="space-y-2">
        {samples.map((sample, index) => (
          <div
            key={index}
            className="flex flex-col gap-2 rounded-md border border-zinc-700 bg-zinc-800 p-2 sm:flex-row"
          >
            <input
              type="text"
              value={sample.situation}
              onChange={(e) => update(index, { situation: e.target.value })}
              placeholder="状況(例: 照れたとき)"
              className="w-full rounded-md border border-zinc-700 bg-zinc-900 px-2 py-1.5 text-sm text-zinc-100 outline-none focus:border-indigo-500 sm:w-40"
            />
            <input
              type="text"
              value={sample.text}
              onChange={(e) => update(index, { text: e.target.value })}
              placeholder="セリフ"
              className="w-full flex-1 rounded-md border border-zinc-700 bg-zinc-900 px-2 py-1.5 text-sm text-zinc-100 outline-none focus:border-indigo-500"
            />
            <button
              type="button"
              onClick={() => remove(index)}
              className="shrink-0 rounded-md border border-zinc-700 px-2 py-1.5 text-xs text-zinc-400 hover:bg-zinc-700 hover:text-zinc-100"
            >
              削除
            </button>
          </div>
        ))}
      </div>
      <button
        type="button"
        onClick={add}
        className="mt-2 rounded-md border border-dashed border-zinc-600 px-3 py-1.5 text-xs text-zinc-400 hover:border-zinc-400 hover:text-zinc-200"
      >
        + 口調サンプルを追加
      </button>
    </div>
  );
}
