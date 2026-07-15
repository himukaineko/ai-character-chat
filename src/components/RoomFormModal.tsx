// ルームの新規作成・編集フォーム(モーダル)
//
// 配色メモ(機能修正: フローティングUIのテーマ統一): ルーム画面(ルーム設定)から開いたときは
// CSS変数 var(--chat-*) を継承してテーマに連動する。ホーム画面(ダーク固定)から開いたときは
// テーマ変数が無いため、フォールバック値(従来のダーク配色)でこれまでどおりの見た目になる。
import { useEffect, useRef, useState } from "react";
import type { MouseEvent } from "react";
import type { Character, NarrationLevel, ReplyLength, Room, World } from "../types";
import { resolveCoverFocalPoint, resolveReplyLength } from "../types";
import type { RoomInput } from "../lib/rooms";
import { useBlobUrl } from "../lib/useBlobUrl";
import { ILLUSTRATION_MAX_DIMENSION, resizeImageBlob } from "../lib/imageResize";

interface RoomFormModalProps {
  open: boolean;
  room: Room | null; // nullなら新規作成
  characters: Character[];
  /** 機能追加: ワールド一覧(紐づけ選択用)。省略時はワールド選択欄を表示しない */
  worlds?: World[];
  onClose: () => void;
  onSubmit: (input: RoomInput) => Promise<void>;
}

const narrationLevelOptions: { value: NarrationLevel; label: string }[] = [
  { value: "none", label: "なし(セリフのみ)" },
  { value: "light", label: "軽い地の文" },
  { value: "novel", label: "小説風の地の文" },
  { value: "narrator", label: "ナレーター役あり" },
];

const replyLengthOptions: { value: ReplyLength; label: string }[] = [
  { value: "short", label: "短め" },
  { value: "normal", label: "普通" },
  { value: "long", label: "長め" },
];

function emptyForm(): RoomInput {
  return {
    name: "",
    worldSetting: "",
    narrationLevel: "light",
    useRealTime: false,
    memberIds: [],
    replyLength: "normal",
    worldId: undefined,
    coverImage: undefined,
    coverFocalPoint: undefined,
    narratorStyle: "",
  };
}

/**
 * 表紙イラスト(任意)の編集欄。
 * GalleryImagesFieldと同じくトリミングは行わず、選んだ画像をそのまま1枚保存する
 * (ただし大きすぎる画像は自動で縮小する)。
 * 「削除」でundefinedに戻すと保存時に表紙なしへ更新される。
 * プレビュー画像をクリックすると、その位置を表示の中心(フォーカルポイント)として保存できる。
 */
function CoverImageField({
  coverImage,
  coverFocalPoint,
  onChange,
  onFocalPointChange,
}: {
  coverImage: Blob | undefined;
  coverFocalPoint: { x: number; y: number } | undefined;
  onChange: (blob: Blob | undefined) => void;
  onFocalPointChange: (point: { x: number; y: number }) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const url = useBlobUrl(coverImage);
  const [processing, setProcessing] = useState(false);
  const focal = resolveCoverFocalPoint(coverFocalPoint);

  const handleFile = async (file: File) => {
    setProcessing(true);
    try {
      // 大きすぎる画像だけ縮小してから保存する(容量・動作の圧迫を防ぐため)
      const resized = await resizeImageBlob(file, ILLUSTRATION_MAX_DIMENSION);
      onChange(resized);
      // 画像を変更したらフォーカルポイントは中央にリセットする
      onFocalPointChange({ x: 50, y: 50 });
    } finally {
      setProcessing(false);
    }
  };

  const handlePreviewClick = (e: MouseEvent<HTMLImageElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) return;
    const xRatio = ((e.clientX - rect.left) / rect.width) * 100;
    const yRatio = ((e.clientY - rect.top) / rect.height) * 100;
    onFocalPointChange({
      x: Math.min(100, Math.max(0, xRatio)),
      y: Math.min(100, Math.max(0, yRatio)),
    });
  };

  return (
    <div>
      <label className="mb-1 block text-sm font-medium text-[var(--chat-button-text,#d4d4d8)]">
        表紙イラスト(任意)
      </label>
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) void handleFile(file);
          e.target.value = "";
        }}
      />
      {coverImage ? (
        <div>
          <div className="relative overflow-hidden rounded-md border border-[var(--chat-button-border,#3f3f46)] bg-[var(--chat-input-bg,#27272a)]">
            {url && (
              <img
                src={url}
                alt="表紙イラストのプレビュー(クリックで表示位置を指定)"
                onClick={handlePreviewClick}
                className="h-28 w-full cursor-crosshair object-cover"
                style={{ objectPosition: `${focal.x}% ${focal.y}%` }}
              />
            )}
            {/* 現在のフォーカルポイントを示すマーカー */}
            {url && (
              <span
                aria-hidden="true"
                className="pointer-events-none absolute h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white bg-indigo-500 shadow"
                style={{ left: `${focal.x}%`, top: `${focal.y}%` }}
              />
            )}
          </div>
          <div className="mt-2 flex gap-2">
            <button
              type="button"
              disabled={processing}
              onClick={() => inputRef.current?.click()}
              className="rounded-md border border-[var(--chat-button-border,#3f3f46)] px-2.5 py-1 text-xs text-[var(--chat-button-text,#d4d4d8)] hover:bg-[var(--chat-input-bg,#27272a)] disabled:opacity-50"
            >
              {processing ? "処理中…" : "画像を変更"}
            </button>
            <button
              type="button"
              disabled={processing}
              onClick={() => onChange(undefined)}
              className="rounded-md border border-[var(--chat-button-border,#3f3f46)] px-2.5 py-1 text-xs text-[var(--chat-danger-text,#f87171)] hover:bg-[var(--chat-input-bg,#27272a)] disabled:opacity-50"
            >
              削除
            </button>
          </div>
          <p className="mt-1 text-xs text-[var(--chat-placeholder-text,#71717a)]">
            画像をクリックすると、そこを中心に表示されます。
          </p>
        </div>
      ) : (
        <button
          type="button"
          disabled={processing}
          onClick={() => inputRef.current?.click()}
          className="flex h-20 w-full flex-col items-center justify-center gap-1 rounded-md border border-dashed border-[var(--chat-button-border,#52525b)] text-xs text-[var(--chat-placeholder-text,#a1a1aa)] hover:border-indigo-500 hover:text-[var(--chat-accent-text,#a5b4fc)] disabled:opacity-50"
        >
          <span className="text-lg leading-none">＋</span>
          <span>{processing ? "処理中…" : "画像を追加"}</span>
        </button>
      )}
      <p className="mt-1 text-xs text-[var(--chat-placeholder-text,#71717a)]">
        トリミングせずそのまま登録され(大きすぎる画像は自動で縮小されます)、ホーム画面のルームカードに表紙として表示されます。
      </p>
    </div>
  );
}

export function RoomFormModal({
  open,
  room,
  characters,
  worlds = [],
  onClose,
  onSubmit,
}: RoomFormModalProps) {
  const [form, setForm] = useState<RoomInput>(emptyForm());
  const [saving, setSaving] = useState(false);
  const [nameError, setNameError] = useState<string | null>(null);
  const nameInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) return;
    if (room) {
      setForm({
        name: room.name,
        worldSetting: room.worldSetting,
        narrationLevel: room.narrationLevel,
        useRealTime: room.useRealTime,
        memberIds: room.memberIds,
        // 既存ルームはreplyLengthを持たない場合があるため、undefined → "normal" として扱う
        replyLength: resolveReplyLength(room.replyLength),
        // 既存ルームはworldIdを持たない場合がある(未紐づけ扱い)
        worldId: room.worldId,
        // 既存ルームはcoverImageを持たない場合がある(表紙なし扱い)
        coverImage: room.coverImage,
        // 既存ルームはcoverFocalPointを持たない場合がある(中央=50/50扱い)
        coverFocalPoint: room.coverFocalPoint,
        // 既存ルームはnarratorStyleを持たない場合がある(未設定=空文字扱い)
        narratorStyle: room.narratorStyle ?? "",
      });
    } else {
      setForm(emptyForm());
    }
    setNameError(null);
  }, [open, room]);

  if (!open) return null;

  const toggleMember = (id: string) => {
    setForm((f) => ({
      ...f,
      memberIds: f.memberIds.includes(id)
        ? f.memberIds.filter((m) => m !== id)
        : [...f.memberIds, id],
    }));
  };

  const selectedWorld = form.worldId ? worlds.find((w) => w.id === form.worldId) ?? null : null;

  const addAllWorldMembers = () => {
    if (!selectedWorld) return;
    setForm((f) => ({
      ...f,
      memberIds: Array.from(new Set([...f.memberIds, ...selectedWorld.characterIds])),
    }));
  };

  const handleSubmit = async () => {
    if (!form.name.trim()) {
      setNameError("ルーム名を入力してください。");
      nameInputRef.current?.focus();
      return;
    }
    setNameError(null);
    setSaving(true);
    try {
      await onSubmit(form);
      onClose();
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-lg border border-[var(--chat-button-border,#3f3f46)] bg-[var(--chat-surface,#18181b)] p-5 shadow-xl">
        <h2 className="text-lg font-semibold text-[var(--chat-heading-text,#f4f4f5)]">
          {room ? "ルーム設定を編集" : "新規ルーム作成"}
        </h2>
        <p className="mt-1 text-xs text-[var(--chat-placeholder-text,#71717a)]">
          ルーム名以外はすべて任意です。あとからいつでも編集できます。
        </p>

        <div className="mt-4 space-y-4">
          <div>
            <span className="mb-1 flex items-center gap-1.5">
              <label className="block text-sm font-medium text-[var(--chat-button-text,#d4d4d8)]">
                ルーム名
              </label>
              <span className="rounded bg-red-500/10 px-1.5 py-0.5 text-[10px] font-semibold leading-none text-[var(--chat-danger-text,#f87171)]">
                必須
              </span>
            </span>
            <input
              ref={nameInputRef}
              type="text"
              value={form.name}
              onChange={(e) => {
                setForm((f) => ({ ...f, name: e.target.value }));
                if (nameError) setNameError(null);
              }}
              placeholder="例: 放課後の教室"
              className={`w-full rounded-md border bg-[var(--chat-input-bg,#27272a)] px-3 py-2 text-sm text-[var(--chat-input-text,#f4f4f5)] outline-none placeholder:text-[var(--chat-placeholder-text,#71717a)] focus:border-indigo-500 ${
                nameError ? "border-red-600" : "border-[var(--chat-button-border,#3f3f46)]"
              }`}
            />
            {nameError && (
              <p className="mt-1 text-xs text-[var(--chat-danger-text,#f87171)]">{nameError}</p>
            )}
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium text-[var(--chat-button-text,#d4d4d8)]">
              世界観・舞台設定メモ
            </label>
            <textarea
              value={form.worldSetting}
              onChange={(e) =>
                setForm((f) => ({ ...f, worldSetting: e.target.value }))
              }
              rows={3}
              placeholder="この世界線の舞台や状況を書く"
              className="w-full resize-none rounded-md border border-[var(--chat-button-border,#3f3f46)] bg-[var(--chat-input-bg,#27272a)] px-3 py-2 text-sm text-[var(--chat-input-text,#f4f4f5)] outline-none placeholder:text-[var(--chat-placeholder-text,#71717a)] focus:border-indigo-500"
            />
          </div>

          <CoverImageField
            coverImage={form.coverImage}
            coverFocalPoint={form.coverFocalPoint}
            onChange={(blob) => setForm((f) => ({ ...f, coverImage: blob }))}
            onFocalPointChange={(point) => setForm((f) => ({ ...f, coverFocalPoint: point }))}
          />

          {worlds.length > 0 && (
            <div>
              <label className="mb-1 block text-sm font-medium text-[var(--chat-button-text,#d4d4d8)]">
                ワールド
              </label>
              <select
                value={form.worldId ?? ""}
                onChange={(e) =>
                  setForm((f) => ({
                    ...f,
                    worldId: e.target.value ? e.target.value : undefined,
                  }))
                }
                className="w-full rounded-md border border-[var(--chat-button-border,#3f3f46)] bg-[var(--chat-input-bg,#27272a)] px-3 py-2 text-sm text-[var(--chat-input-text,#f4f4f5)] outline-none focus:border-indigo-500"
              >
                <option value="">なし</option>
                {worlds.map((w) => (
                  <option key={w.id} value={w.id}>
                    {w.name || "(名称未設定)"}
                  </option>
                ))}
              </select>
              <p className="mt-1 text-xs text-[var(--chat-placeholder-text,#71717a)]">
                ワールドを紐づけると、そのワールドのキャラ同士の関係や専用ユーザー設定(設定されている場合)が会話に反映されます。
              </p>
            </div>
          )}

          <div>
            <div className="mb-1 flex items-center justify-between gap-2">
              <label className="block text-sm font-medium text-[var(--chat-button-text,#d4d4d8)]">
                参加メンバー
              </label>
              {selectedWorld && selectedWorld.characterIds.length > 0 && (
                <button
                  type="button"
                  onClick={addAllWorldMembers}
                  className="text-xs text-[var(--chat-accent-text,#818cf8)] hover:underline"
                >
                  ワールドのキャラを全員追加
                </button>
              )}
            </div>
            {characters.length === 0 ? (
              <p className="rounded-md border border-dashed border-[var(--chat-button-border,#3f3f46)] p-3 text-sm text-[var(--chat-placeholder-text,#71717a)]">
                キャラクターがまだいません。先にライブラリでキャラを作成してください。
              </p>
            ) : (
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                {characters.map((c) => {
                  const checked = form.memberIds.includes(c.id);
                  return (
                    <label
                      key={c.id}
                      className={`flex cursor-pointer items-center gap-2 rounded-md border px-2 py-1.5 text-sm ${
                        checked
                          ? "border-indigo-500 bg-indigo-500/10 text-[var(--chat-accent-text,#c7d2fe)]"
                          : "border-[var(--chat-button-border,#3f3f46)] bg-[var(--chat-input-bg,#27272a)] text-[var(--chat-button-text,#d4d4d8)]"
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => toggleMember(c.id)}
                        className="accent-indigo-500"
                      />
                      <span className="truncate">{c.name || "(名称未設定)"}</span>
                    </label>
                  );
                })}
              </div>
            )}
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium text-[var(--chat-button-text,#d4d4d8)]">
              ナレーションレベル
            </label>
            <select
              value={form.narrationLevel}
              onChange={(e) =>
                setForm((f) => ({
                  ...f,
                  narrationLevel: e.target.value as NarrationLevel,
                }))
              }
              className="w-full rounded-md border border-[var(--chat-button-border,#3f3f46)] bg-[var(--chat-input-bg,#27272a)] px-3 py-2 text-sm text-[var(--chat-input-text,#f4f4f5)] outline-none focus:border-indigo-500"
            >
              {narrationLevelOptions.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium text-[var(--chat-button-text,#d4d4d8)]">
              地の文・ナレーターのカスタム(任意)
            </label>
            <textarea
              value={form.narratorStyle ?? ""}
              onChange={(e) =>
                setForm((f) => ({ ...f, narratorStyle: e.target.value }))
              }
              rows={2}
              placeholder="例: 軽快なテンポで/ツッコミ役のように/二人称視点(『あなたは』で語りかける)で"
              className="w-full resize-none rounded-md border border-[var(--chat-button-border,#3f3f46)] bg-[var(--chat-input-bg,#27272a)] px-3 py-2 text-sm text-[var(--chat-input-text,#f4f4f5)] outline-none placeholder:text-[var(--chat-placeholder-text,#71717a)] focus:border-indigo-500"
            />
            <p className="mt-1 text-xs text-[var(--chat-placeholder-text,#71717a)]">
              ナレーションレベルが「なし」以外のときに効果があります。
            </p>
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium text-[var(--chat-button-text,#d4d4d8)]">
              返事の長さ
            </label>
            <select
              value={form.replyLength ?? "normal"}
              onChange={(e) =>
                setForm((f) => ({
                  ...f,
                  replyLength: e.target.value as ReplyLength,
                }))
              }
              className="w-full rounded-md border border-[var(--chat-button-border,#3f3f46)] bg-[var(--chat-input-bg,#27272a)] px-3 py-2 text-sm text-[var(--chat-input-text,#f4f4f5)] outline-none focus:border-indigo-500"
            >
              {replyLengthOptions.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>

          <label className="flex items-center gap-2 text-sm text-[var(--chat-button-text,#d4d4d8)]">
            <input
              type="checkbox"
              checked={form.useRealTime}
              onChange={(e) =>
                setForm((f) => ({ ...f, useRealTime: e.target.checked }))
              }
              className="accent-indigo-500"
            />
            現実の時間帯を会話に反映する
          </label>
        </div>

        <div className="mt-6 flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="rounded-md border border-[var(--chat-button-border,#3f3f46)] px-3 py-1.5 text-sm text-[var(--chat-button-text,#d4d4d8)] hover:bg-[var(--chat-input-bg,#27272a)]"
          >
            キャンセル
          </button>
          <button
            type="button"
            disabled={saving}
            onClick={handleSubmit}
            className="rounded-md bg-indigo-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-indigo-500 disabled:opacity-50"
          >
            {saving ? "保存中…" : "保存"}
          </button>
        </div>
      </div>
    </div>
  );
}
