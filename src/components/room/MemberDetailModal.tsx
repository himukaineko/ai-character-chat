// ルーム内キャラの詳細モーダル(仕様書10.2 / 3.5)
// タブ2つ: 「ルーム内上書き」(overridesの編集)と「記憶」(そのキャラがsubjectIdsに含まれる記憶の一覧)。
// 上書きはキャラ本体を変更せず、このルーム内だけ設定を差し替えるレイヤー(プロンプトでは本体設定より優先)。
import { useEffect, useState } from "react";
import type { Character, Memory, RoomCharacterOverrides, RoomCharacterState } from "../../types";
import { CharacterAvatar } from "../CharacterAvatar";

export type MemberDetailTab = "overrides" | "memory";

interface MemberDetailModalProps {
  open: boolean;
  initialTab: MemberDetailTab;
  character: Character | null;
  state: RoomCharacterState | null;
  /** ルーム全体の記憶(このモーダル内でキャラに関するものだけに絞り込む) */
  memories: Memory[];
  onClose: () => void;
  onSaveOverrides: (characterId: string, overrides: RoomCharacterOverrides) => Promise<void>;
}

const emptyOverrides: Required<RoomCharacterOverrides> = {
  occupation: "",
  relationToUser: "",
  roleInWorld: "",
  extraNotes: "",
};

export function MemberDetailModal({
  open,
  initialTab,
  character,
  state,
  memories,
  onClose,
  onSaveOverrides,
}: MemberDetailModalProps) {
  const [tab, setTab] = useState<MemberDetailTab>(initialTab);
  const [form, setForm] = useState<Required<RoomCharacterOverrides>>(emptyOverrides);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  // モーダルを開くたびにタブとフォームを初期化する
  useEffect(() => {
    if (!open) return;
    setTab(initialTab);
    setSaved(false);
    setForm({
      occupation: state?.overrides.occupation ?? "",
      relationToUser: state?.overrides.relationToUser ?? "",
      roleInWorld: state?.overrides.roleInWorld ?? "",
      extraNotes: state?.overrides.extraNotes ?? "",
    });
  }, [open, initialTab, state]);

  if (!open || !character || !state) return null;

  // このキャラが関係する記憶のみ(subjectIdsにキャラIDを含む)
  const characterMemories = memories.filter((m) => m.subjectIds.includes(character.id));

  const handleSave = async () => {
    setSaving(true);
    try {
      // 空文字は「上書きなし」の扱い(仕様書4章のコメント通り)なので、そのまま保存してよい
      await onSaveOverrides(character.id, {
        occupation: form.occupation.trim(),
        relationToUser: form.relationToUser.trim(),
        roleInWorld: form.roleInWorld.trim(),
        extraNotes: form.extraNotes.trim(),
      });
      setSaved(true);
      setTimeout(() => setSaved(false), 1500);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={onClose}>
      <div
        className="max-h-[85vh] w-full max-w-md overflow-y-auto rounded-lg border border-zinc-700 bg-zinc-900 p-5 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <CharacterAvatar character={character} size={32} />
            <h2 className="text-base font-semibold text-zinc-100">{character.name}</h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md px-2 py-1 text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200"
          >
            閉じる
          </button>
        </div>

        <div className="mt-3 flex gap-1 rounded-md border border-zinc-700 p-0.5 text-sm">
          <button
            type="button"
            onClick={() => setTab("overrides")}
            className={`flex-1 rounded px-3 py-1 ${
              tab === "overrides" ? "bg-indigo-600 text-white" : "text-zinc-400 hover:text-zinc-200"
            }`}
          >
            ルーム内上書き
          </button>
          <button
            type="button"
            onClick={() => setTab("memory")}
            className={`flex-1 rounded px-3 py-1 ${
              tab === "memory" ? "bg-indigo-600 text-white" : "text-zinc-400 hover:text-zinc-200"
            }`}
          >
            記憶
          </button>
        </div>

        {tab === "overrides" && (
          <div className="mt-4 space-y-3">
            <p className="text-xs text-zinc-500">
              このルーム内だけキャラ本体の設定を差し替えます(本体設定より優先)。空欄は上書きなしの扱いです。
            </p>
            <div>
              <label className="mb-1 block text-sm font-medium text-zinc-300">職業・立場</label>
              <input
                type="text"
                value={form.occupation}
                onChange={(e) => setForm((f) => ({ ...f, occupation: e.target.value }))}
                placeholder={character.occupation ? `本体設定: ${character.occupation}` : "例: この世界では教師"}
                className="w-full rounded-md border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm text-zinc-100 outline-none focus:border-indigo-500"
              />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-zinc-300">ユーザーとの関係</label>
              <input
                type="text"
                value={form.relationToUser}
                onChange={(e) => setForm((f) => ({ ...f, relationToUser: e.target.value }))}
                placeholder={
                  character.relationToUser ? `本体設定: ${character.relationToUser}` : "例: このルームでは初対面"
                }
                className="w-full rounded-md border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm text-zinc-100 outline-none focus:border-indigo-500"
              />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-zinc-300">世界観上の役割</label>
              <input
                type="text"
                value={form.roleInWorld}
                onChange={(e) => setForm((f) => ({ ...f, roleInWorld: e.target.value }))}
                placeholder="例: 王国の騎士 / 探偵の助手"
                className="w-full rounded-md border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm text-zinc-100 outline-none focus:border-indigo-500"
              />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-zinc-300">追加メモ</label>
              <textarea
                value={form.extraNotes}
                onChange={(e) => setForm((f) => ({ ...f, extraNotes: e.target.value }))}
                rows={3}
                placeholder="このルームでの振る舞いに関する補足など"
                className="w-full resize-none rounded-md border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm text-zinc-100 outline-none focus:border-indigo-500"
              />
            </div>
            <div className="flex items-center gap-3">
              <button
                type="button"
                disabled={saving}
                onClick={handleSave}
                className="rounded-md bg-indigo-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-indigo-500 disabled:opacity-50"
              >
                {saving ? "保存中…" : "保存"}
              </button>
              {saved && <span className="text-xs text-emerald-400">保存しました</span>}
            </div>
          </div>
        )}

        {tab === "memory" && (
          <div className="mt-4 space-y-2">
            <p className="text-xs text-zinc-500">
              {character.name}が関係する、このルームの記憶の一覧です。編集・昇格は右スライドオーバーの「記憶」タブから行えます。
            </p>
            {characterMemories.length === 0 ? (
              <p className="text-xs text-zinc-600">まだありません。</p>
            ) : (
              <ul className="space-y-1">
                {characterMemories.map((m) => (
                  <li
                    key={m.id}
                    className={`rounded-md border border-zinc-800 bg-zinc-950 px-2 py-1.5 text-xs ${
                      m.disabled ? "text-zinc-600 line-through" : "text-zinc-300"
                    }`}
                  >
                    <span className="mr-1 rounded bg-zinc-800 px-1 text-[10px] text-zinc-500">
                      {m.type === "fact" ? "事実" : "関係性"}
                    </span>
                    {m.content}
                    {m.pinned && (
                      <span className="ml-1 rounded bg-amber-500/20 px-1 text-[10px] text-amber-300">固定</span>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
