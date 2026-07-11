// キャラクターの新規作成・編集フォーム(モーダル)。仕様書4章のCharacter全フィールドを編集する
// AI入力補助(仕様書8.1): 簡単な説明から一括提案 + フィールド単位の再生成に対応する。
// 提案は自動確定しない。フォームに流し込むだけで、保存するかどうかはユーザーが決める。
import { useEffect, useRef, useState } from "react";
import type { Character } from "../types";
import type { CharacterInput } from "../lib/characters";
import { TagInput } from "./TagInput";
import { SpeechSampleEditor } from "./SpeechSampleEditor";
import { ImageUploadField } from "./ImageUploadField";
import { GalleryImagesField } from "./GalleryImagesField";
import { ImageCropModal } from "./ImageCropModal";
import {
  requestCharacterAssist,
  ALL_ASSIST_FIELDS,
  type CharacterAssistFieldKey,
  type CharacterAssistFields,
} from "../llm/characterAssist";
import { LLMError, LLM_ERROR_MESSAGES } from "../llm/types";

interface CharacterFormModalProps {
  open: boolean;
  character: Character | null; // nullなら新規作成
  onClose: () => void;
  onSubmit: (input: CharacterInput) => Promise<void>;
}

function emptyForm(): CharacterInput {
  return {
    name: "",
    nicknames: [],
    firstPerson: "",
    secondPerson: "",
    speechStyle: "",
    personality: "",
    conversationStyle: "",
    background: "",
    occupation: "",
    likes: [],
    dislikes: [],
    dreamsWorriesSecrets: "",
    appearance: "",
    iconImage: undefined,
    portraitImage: undefined,
    galleryImages: [],
    relationToUser: "",
    hardConstraints: "",
    ngWords: [],
    speechSamples: [],
    freeNotes: "",
  };
}

/** 「必須」バッジ(赤字。未入力だと保存できないフィールドのラベル横に添える) */
function RequiredBadge() {
  return (
    <span className="rounded bg-red-950/60 px-1.5 py-0.5 text-[10px] font-semibold leading-none text-red-400">
      必須
    </span>
  );
}

/**
 * フィールドラベルの右に添える「AIで再提案」ボタン。
 * 見た目のサイズ感は保ちつつ、モバイルでのタップ領域確保のため上下に透明パディングを持たせ、
 * 実際のヒット領域は最低28px程度になるようにする。
 */
function AssistButton({ loading, onClick }: { loading: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={loading}
      className="-my-1.5 px-1 py-1.5 text-xs text-indigo-400 hover:text-indigo-300 disabled:cursor-not-allowed disabled:opacity-40"
    >
      {loading ? "提案中…" : "AIで再提案"}
    </button>
  );
}

function FieldLabelRow({
  label,
  required,
  onAssist,
  assisting,
}: {
  label: string;
  required?: boolean;
  onAssist?: () => void;
  assisting?: boolean;
}) {
  return (
    <div className="mb-1 flex items-center justify-between gap-2">
      <span className="flex items-center gap-1.5">
        <label className="block text-sm font-medium text-zinc-300">{label}</label>
        {required && <RequiredBadge />}
      </span>
      {onAssist && <AssistButton loading={!!assisting} onClick={onAssist} />}
    </div>
  );
}

function TextField({
  label,
  value,
  onChange,
  placeholder,
  required,
  onAssist,
  assisting,
  inputRef,
  error,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  required?: boolean;
  onAssist?: () => void;
  assisting?: boolean;
  inputRef?: React.RefObject<HTMLInputElement | null>;
  error?: string;
}) {
  return (
    <div>
      <FieldLabelRow label={label} required={required} onAssist={onAssist} assisting={assisting} />
      <input
        ref={inputRef}
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className={`w-full rounded-md border bg-zinc-800 px-3 py-2 text-sm text-zinc-100 outline-none focus:border-indigo-500 ${
          error ? "border-red-600" : "border-zinc-700"
        }`}
      />
      {error && <p className="mt-1 text-xs text-red-400">{error}</p>}
    </div>
  );
}

function TextAreaField({
  label,
  value,
  onChange,
  placeholder,
  rows = 3,
  onAssist,
  assisting,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  rows?: number;
  onAssist?: () => void;
  assisting?: boolean;
}) {
  return (
    <div>
      <FieldLabelRow label={label} onAssist={onAssist} assisting={assisting} />
      <textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        rows={rows}
        className="w-full resize-none rounded-md border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm text-zinc-100 outline-none focus:border-indigo-500"
      />
    </div>
  );
}

export function CharacterFormModal({
  open,
  character,
  onClose,
  onSubmit,
}: CharacterFormModalProps) {
  const [form, setForm] = useState<CharacterInput>(emptyForm());
  const [saving, setSaving] = useState(false);
  const [nameError, setNameError] = useState<string | null>(null);
  const nameInputRef = useRef<HTMLInputElement>(null);

  // ---- AI入力補助(仕様書8.1) ----
  const [assistHint, setAssistHint] = useState("");
  const [bulkAssisting, setBulkAssisting] = useState(false);
  const [assistingFields, setAssistingFields] = useState<Set<CharacterAssistFieldKey>>(new Set());
  const [assistError, setAssistError] = useState<string | null>(null);

  // ---- 画像トリミング(仕様書8.2): 1枚の画像からアイコンとイメージイラストの両方を作れるようにする ----
  const [rawImageSrc, setRawImageSrc] = useState<string | null>(null);
  const [showQuickIconCrop, setShowQuickIconCrop] = useState(false);

  useEffect(() => {
    if (!open) return;
    if (character) {
      const { id: _id, createdAt: _c, updatedAt: _u, ...rest } = character;
      setForm(rest);
    } else {
      setForm(emptyForm());
    }
    setAssistHint("");
    setAssistError(null);
    setAssistingFields(new Set());
    setRawImageSrc(null);
    setShowQuickIconCrop(false);
    setNameError(null);
  }, [open, character]);

  if (!open) return null;

  const set = <K extends keyof CharacterInput>(key: K, value: CharacterInput[K]) => {
    setForm((f) => ({ ...f, [key]: value }));
  };

  // ---- イメージイラスト(複数可)の編集: 表示上は1つのギャラリーとして扱い、
  // 保存時に1枚目をportraitImage、2枚目以降をgalleryImagesへ分解する(後方互換維持) ----
  const galleryDisplayImages: Blob[] = [
    ...(form.portraitImage ? [form.portraitImage] : []),
    ...(form.galleryImages ?? []),
  ];

  const applyGalleryImages = (images: Blob[]) => {
    const [first, ...rest] = images;
    setForm((f) => ({
      ...f,
      portraitImage: first,
      galleryImages: rest.length > 0 ? rest : undefined,
    }));
  };

  /** data URL文字列をBlobに変換する(「同じ画像から」の即時追加用) */
  const dataUrlToBlob = async (dataUrl: string): Promise<Blob> => {
    const res = await fetch(dataUrl);
    return res.blob();
  };

  /** 「イメージイラストにも追加」: 選択済みの元画像をトリミングせずそのままギャラリーへ追加する */
  const handleAddRawImageToGallery = async () => {
    if (!rawImageSrc) return;
    const blob = await dataUrlToBlob(rawImageSrc);
    applyGalleryImages([...galleryDisplayImages, blob]);
  };

  const handleSubmit = async () => {
    if (!form.name.trim()) {
      setNameError("名前を入力してください。");
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

  /** AIの提案結果をフォームに流し込む(自動確定はしない。あくまで下書き) */
  const applyAssistResult = (result: CharacterAssistFields) => {
    setForm((f) => ({
      ...f,
      ...(result.name !== undefined ? { name: result.name } : {}),
      ...(result.firstPerson !== undefined ? { firstPerson: result.firstPerson } : {}),
      ...(result.secondPerson !== undefined ? { secondPerson: result.secondPerson } : {}),
      ...(result.speechStyle !== undefined ? { speechStyle: result.speechStyle } : {}),
      ...(result.personality !== undefined ? { personality: result.personality } : {}),
      ...(result.conversationStyle !== undefined
        ? { conversationStyle: result.conversationStyle }
        : {}),
      ...(result.background !== undefined ? { background: result.background } : {}),
      ...(result.occupation !== undefined ? { occupation: result.occupation } : {}),
      ...(result.likes !== undefined ? { likes: result.likes } : {}),
      ...(result.dislikes !== undefined ? { dislikes: result.dislikes } : {}),
      ...(result.dreamsWorriesSecrets !== undefined
        ? { dreamsWorriesSecrets: result.dreamsWorriesSecrets }
        : {}),
      ...(result.appearance !== undefined ? { appearance: result.appearance } : {}),
      ...(result.relationToUser !== undefined ? { relationToUser: result.relationToUser } : {}),
      ...(result.speechSamples !== undefined ? { speechSamples: result.speechSamples } : {}),
    }));
  };

  /** 現在のフォーム内容をAIへの文脈として渡す(他フィールドと矛盾しない提案にするため) */
  const currentContext = (): Partial<CharacterAssistFields> => ({
    name: form.name || undefined,
    firstPerson: form.firstPerson || undefined,
    secondPerson: form.secondPerson || undefined,
    speechStyle: form.speechStyle || undefined,
    personality: form.personality || undefined,
    conversationStyle: form.conversationStyle || undefined,
    background: form.background || undefined,
    occupation: form.occupation || undefined,
    likes: form.likes.length > 0 ? form.likes : undefined,
    dislikes: form.dislikes.length > 0 ? form.dislikes : undefined,
    dreamsWorriesSecrets: form.dreamsWorriesSecrets || undefined,
    appearance: form.appearance || undefined,
    relationToUser: form.relationToUser || undefined,
  });

  const describeAssistError = (err: unknown): string => {
    if (err instanceof LLMError) {
      return err.message || LLM_ERROR_MESSAGES[err.kind];
    }
    return err instanceof Error ? err.message : "AI提案の取得に失敗しました。";
  };

  /** 「AIで一括提案」: 説明文から全フィールドをまとめて提案する */
  const handleBulkAssist = async () => {
    setBulkAssisting(true);
    setAssistError(null);
    try {
      const result = await requestCharacterAssist(assistHint, ALL_ASSIST_FIELDS);
      applyAssistResult(result);
    } catch (err) {
      setAssistError(describeAssistError(err));
    } finally {
      setBulkAssisting(false);
    }
  };

  /** フィールド単位の再生成: そのフィールドだけをAIに提案させ直す */
  const handleFieldAssist = async (field: CharacterAssistFieldKey) => {
    setAssistingFields((prev) => new Set(prev).add(field));
    setAssistError(null);
    try {
      const result = await requestCharacterAssist(assistHint, [field], currentContext());
      applyAssistResult(result);
    } catch (err) {
      setAssistError(describeAssistError(err));
    } finally {
      setAssistingFields((prev) => {
        const next = new Set(prev);
        next.delete(field);
        return next;
      });
    }
  };

  const isFieldAssisting = (field: CharacterAssistFieldKey) => assistingFields.has(field);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-lg border border-zinc-700 bg-zinc-900 p-5 shadow-xl">
        <h2 className="text-lg font-semibold text-zinc-100">
          {character ? "キャラクターを編集" : "新規キャラクター作成"}
        </h2>
        <p className="mt-1 text-xs text-zinc-500">
          名前以外はすべて任意です。あとからいつでも編集できます。
        </p>

        {/* AI入力補助(仕様書8.1) */}
        <div className="mt-4 rounded-md border border-indigo-800/60 bg-indigo-950/20 p-3">
          <label className="mb-1 block text-sm font-medium text-indigo-200">
            AI入力補助: 簡単な説明を書くと設定を一括提案します
          </label>
          <textarea
            value={assistHint}
            onChange={(e) => setAssistHint(e.target.value)}
            rows={2}
            placeholder="例: 明るいけど少し毒舌な幼なじみ。料理が得意で、主人公のことを放っておけないタイプ。"
            className="w-full resize-none rounded-md border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm text-zinc-100 outline-none focus:border-indigo-500"
          />
          <div className="mt-2 flex items-center gap-3">
            <button
              type="button"
              onClick={handleBulkAssist}
              disabled={bulkAssisting}
              className="rounded-md bg-indigo-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-indigo-500 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {bulkAssisting ? "提案を生成中…" : "AIで一括提案"}
            </button>
            <p className="text-xs text-zinc-500">
              提案は各欄に入るだけです。内容を確認・修正してから保存してください。
            </p>
          </div>
          {assistError && <p className="mt-2 text-xs text-red-400">{assistError}</p>}
        </div>

        <div className="mt-4 space-y-4">
          <TextField
            label="名前"
            required
            value={form.name}
            onChange={(v) => {
              set("name", v);
              if (nameError) setNameError(null);
            }}
            onAssist={() => handleFieldAssist("name")}
            assisting={isFieldAssisting("name")}
            inputRef={nameInputRef}
            error={nameError ?? undefined}
          />
          <TagInput
            label="ニックネーム・呼び名"
            values={form.nicknames}
            onChange={(v) => set("nicknames", v)}
          />

          <div className="grid grid-cols-2 gap-3">
            <TextField
              label="一人称"
              value={form.firstPerson}
              onChange={(v) => set("firstPerson", v)}
              placeholder="例: 私、僕、俺"
              onAssist={() => handleFieldAssist("firstPerson")}
              assisting={isFieldAssisting("firstPerson")}
            />
            <TextField
              label="二人称"
              value={form.secondPerson}
              onChange={(v) => set("secondPerson", v)}
              placeholder="例: あなた、君"
              onAssist={() => handleFieldAssist("secondPerson")}
              assisting={isFieldAssisting("secondPerson")}
            />
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <ImageUploadField
              label="アイコン画像(顔絵)"
              image={form.iconImage}
              onChange={(v) => set("iconImage", v)}
              aspect="square"
              onRawImageSelected={setRawImageSrc}
            />
          </div>
          <GalleryImagesField
            label="イメージイラスト(複数可)"
            images={galleryDisplayImages}
            onChange={applyGalleryImages}
            onRawImageSelected={setRawImageSrc}
          />
          {rawImageSrc && (
            <div className="-mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-zinc-500">
              <span>同じ画像から:</span>
              <button
                type="button"
                onClick={() => setShowQuickIconCrop(true)}
                className="text-indigo-400 hover:underline"
              >
                アイコンも作る
              </button>
              <button
                type="button"
                onClick={handleAddRawImageToGallery}
                className="text-indigo-400 hover:underline"
              >
                イメージイラストにも追加
              </button>
            </div>
          )}

          <TextAreaField
            label="口調"
            value={form.speechStyle}
            onChange={(v) => set("speechStyle", v)}
            onAssist={() => handleFieldAssist("speechStyle")}
            assisting={isFieldAssisting("speechStyle")}
          />
          <TextAreaField
            label="性格"
            value={form.personality}
            onChange={(v) => set("personality", v)}
            onAssist={() => handleFieldAssist("personality")}
            assisting={isFieldAssisting("personality")}
          />
          <TextAreaField
            label="会話スタイル"
            value={form.conversationStyle}
            onChange={(v) => set("conversationStyle", v)}
            onAssist={() => handleFieldAssist("conversationStyle")}
            assisting={isFieldAssisting("conversationStyle")}
          />
          <TextAreaField
            label="背景"
            value={form.background}
            onChange={(v) => set("background", v)}
            onAssist={() => handleFieldAssist("background")}
            assisting={isFieldAssisting("background")}
          />
          <TextField
            label="職業・所属・立場"
            value={form.occupation}
            onChange={(v) => set("occupation", v)}
            onAssist={() => handleFieldAssist("occupation")}
            assisting={isFieldAssisting("occupation")}
          />

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <TagInput
              label="好きなもの"
              values={form.likes}
              onChange={(v) => set("likes", v)}
              onAssist={() => handleFieldAssist("likes")}
              assisting={isFieldAssisting("likes")}
            />
            <TagInput
              label="嫌いなもの"
              values={form.dislikes}
              onChange={(v) => set("dislikes", v)}
              onAssist={() => handleFieldAssist("dislikes")}
              assisting={isFieldAssisting("dislikes")}
            />
          </div>

          <TextAreaField
            label="夢・悩み・秘密"
            value={form.dreamsWorriesSecrets}
            onChange={(v) => set("dreamsWorriesSecrets", v)}
            onAssist={() => handleFieldAssist("dreamsWorriesSecrets")}
            assisting={isFieldAssisting("dreamsWorriesSecrets")}
          />
          <TextAreaField
            label="外見"
            value={form.appearance}
            onChange={(v) => set("appearance", v)}
            onAssist={() => handleFieldAssist("appearance")}
            assisting={isFieldAssisting("appearance")}
          />
          <TextField
            label="ユーザーとの関係(デフォルト)"
            value={form.relationToUser}
            onChange={(v) => set("relationToUser", v)}
            placeholder="例: 幼なじみ、後輩"
            onAssist={() => handleFieldAssist("relationToUser")}
            assisting={isFieldAssisting("relationToUser")}
          />
          <TextAreaField
            label="絶対に崩してほしくない設定"
            value={form.hardConstraints}
            onChange={(v) => set("hardConstraints", v)}
          />
          <TagInput
            label="NGワード・避けたい表現"
            values={form.ngWords}
            onChange={(v) => set("ngWords", v)}
          />

          <SpeechSampleEditor
            samples={form.speechSamples}
            onChange={(v) => set("speechSamples", v)}
            onAssist={() => handleFieldAssist("speechSamples")}
            assisting={isFieldAssisting("speechSamples")}
          />

          <TextAreaField
            label="自由記述(昇格記憶の受け皿にもなる)"
            value={form.freeNotes}
            onChange={(v) => set("freeNotes", v)}
            rows={4}
          />
        </div>

        <div className="mt-6 flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="rounded-md border border-zinc-700 px-3 py-1.5 text-sm text-zinc-300 hover:bg-zinc-800"
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

      <ImageCropModal
        open={showQuickIconCrop}
        imageSrc={rawImageSrc}
        aspect="square"
        onCancel={() => setShowQuickIconCrop(false)}
        onConfirm={(blob) => {
          set("iconImage", blob);
          setShowQuickIconCrop(false);
        }}
      />
    </div>
  );
}
