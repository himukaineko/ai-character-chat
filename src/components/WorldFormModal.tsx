// ワールド(世界線グループ)の新規作成・編集フォーム(モーダル)
// フォルダ分け(所属キャラ)・キャラ同士の関係・ワールド専用ユーザー設定をここでまとめて編集する
import { useEffect, useState } from "react";
import type { Character, RelationDirection, UserProfile, World, WorldRelation } from "../types";
import type { WorldInput } from "../lib/worlds";
import { relationPairKey } from "../lib/worlds";
import { defaultUserProfile } from "../lib/settings";
import { TagInput } from "./TagInput";

/** 方向つき関係欄のドラフト(空文字なら未入力扱い) */
function emptyDirectionDraft(): RelationDirection {
  return { callName: "", attitude: "" };
}

/** 呼び方・態度がどちらも空ならundefined(保存しない)にする */
function directionOrUndefined(d: RelationDirection): RelationDirection | undefined {
  const callName = d.callName.trim();
  const attitude = d.attitude.trim();
  if (!callName && !attitude) return undefined;
  return { callName, attitude };
}

interface WorldFormModalProps {
  open: boolean;
  world: World | null; // nullなら新規作成
  characters: Character[];
  onClose: () => void;
  onSubmit: (input: WorldInput) => Promise<void>;
}

function emptyForm(): WorldInput {
  return {
    name: "",
    description: "",
    characterIds: [],
    relations: [],
    useCustomUserProfile: false,
    userProfile: defaultUserProfile(),
  };
}

export function WorldFormModal({
  open,
  world,
  characters,
  onClose,
  onSubmit,
}: WorldFormModalProps) {
  const [form, setForm] = useState<WorldInput>(emptyForm());
  const [saving, setSaving] = useState(false);

  // 関係エディタのドラフト状態(追加・編集で共用)
  const [relDraftA, setRelDraftA] = useState("");
  const [relDraftB, setRelDraftB] = useState("");
  const [relDraftText, setRelDraftText] = useState("");
  // 機能追加: 方向つき詳細(A→B / B→A)のドラフト。任意入力(空なら保存時にundefinedにする)
  const [relDraftAToB, setRelDraftAToB] = useState<RelationDirection>(emptyDirectionDraft());
  const [relDraftBToA, setRelDraftBToA] = useState<RelationDirection>(emptyDirectionDraft());
  const [relEditIndex, setRelEditIndex] = useState<number | null>(null);
  const [relError, setRelError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    if (world) {
      setForm({
        name: world.name,
        description: world.description,
        characterIds: world.characterIds,
        relations: world.relations,
        useCustomUserProfile: world.useCustomUserProfile,
        userProfile: world.userProfile,
      });
    } else {
      setForm(emptyForm());
    }
    setRelDraftA("");
    setRelDraftB("");
    setRelDraftText("");
    setRelDraftAToB(emptyDirectionDraft());
    setRelDraftBToA(emptyDirectionDraft());
    setRelEditIndex(null);
    setRelError(null);
  }, [open, world]);

  if (!open) return null;

  const memberCharacters = characters.filter((c) => form.characterIds.includes(c.id));
  const charName = (id: string) =>
    characters.find((c) => c.id === id)?.name || "(名称未設定)";

  const toggleCharacter = (id: string) => {
    setForm((f) => {
      const included = f.characterIds.includes(id);
      const nextIds = included
        ? f.characterIds.filter((cid) => cid !== id)
        : [...f.characterIds, id];
      // 所属から外したキャラが関わる関係は一緒に取り除く(片方だけの関係を残さない)
      const nextRelations = included
        ? f.relations.filter((r) => r.characterIdA !== id && r.characterIdB !== id)
        : f.relations;
      return { ...f, characterIds: nextIds, relations: nextRelations };
    });
  };

  const resetRelDraft = () => {
    setRelDraftA("");
    setRelDraftB("");
    setRelDraftText("");
    setRelDraftAToB(emptyDirectionDraft());
    setRelDraftBToA(emptyDirectionDraft());
    setRelEditIndex(null);
    setRelError(null);
  };

  const startEditRelation = (index: number) => {
    const r = form.relations[index];
    setRelDraftA(r.characterIdA);
    setRelDraftB(r.characterIdB);
    setRelDraftText(r.description);
    // 旧データ(方向つき情報なし)は空欄で表示される。そのまま追記できる
    setRelDraftAToB(r.aToB ? { ...r.aToB } : emptyDirectionDraft());
    setRelDraftBToA(r.bToA ? { ...r.bToA } : emptyDirectionDraft());
    setRelEditIndex(index);
    setRelError(null);
  };

  const removeRelation = (index: number) => {
    setForm((f) => ({ ...f, relations: f.relations.filter((_, i) => i !== index) }));
    if (relEditIndex === index) resetRelDraft();
  };

  const submitRelation = () => {
    setRelError(null);
    if (!relDraftA || !relDraftB) {
      setRelError("2人のキャラクターを選んでください");
      return;
    }
    if (relDraftA === relDraftB) {
      setRelError("異なる2人のキャラクターを選んでください");
      return;
    }
    if (!relDraftText.trim()) {
      setRelError("関係の説明を入力してください");
      return;
    }
    // 同じペアの重複追加を防ぐ(A-BとB-Aは同一ペア扱い)。編集中の行自身は除外して判定する
    const key = relationPairKey(relDraftA, relDraftB);
    const duplicateIndex = form.relations.findIndex(
      (r, i) => relationPairKey(r.characterIdA, r.characterIdB) === key && i !== relEditIndex,
    );
    if (duplicateIndex !== -1) {
      setRelError("このペアの関係はすでに追加されています。既存の関係を編集してください。");
      return;
    }

    const newRelation: WorldRelation = {
      characterIdA: relDraftA,
      characterIdB: relDraftB,
      description: relDraftText.trim(),
      aToB: directionOrUndefined(relDraftAToB),
      bToA: directionOrUndefined(relDraftBToA),
    };
    setForm((f) => {
      const relations = f.relations.slice();
      if (relEditIndex !== null) {
        relations[relEditIndex] = newRelation;
      } else {
        relations.push(newRelation);
      }
      return { ...f, relations };
    });
    resetRelDraft();
  };

  const handleSubmit = async () => {
    if (!form.name.trim()) return;
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
      <div className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-lg border border-zinc-700 bg-zinc-900 p-5 shadow-xl">
        <h2 className="text-lg font-semibold text-zinc-100">
          {world ? "ワールド設定を編集" : "新規ワールド作成"}
        </h2>

        <div className="mt-4 space-y-4">
          <div>
            <label className="mb-1 block text-sm font-medium text-zinc-300">
              ワールド名
            </label>
            <input
              type="text"
              value={form.name}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              placeholder="例: 異世界学園編"
              className="w-full rounded-md border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm text-zinc-100 outline-none focus:border-indigo-500"
            />
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium text-zinc-300">
              説明メモ
            </label>
            <textarea
              value={form.description}
              onChange={(e) =>
                setForm((f) => ({ ...f, description: e.target.value }))
              }
              rows={2}
              placeholder="この世界線についてのメモ(任意)"
              className="w-full resize-none rounded-md border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm text-zinc-100 outline-none focus:border-indigo-500"
            />
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium text-zinc-300">
              所属キャラクター
            </label>
            {characters.length === 0 ? (
              <p className="rounded-md border border-dashed border-zinc-700 p-3 text-sm text-zinc-500">
                キャラクターがまだいません。先にライブラリでキャラを作成してください。
              </p>
            ) : (
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                {characters.map((c) => {
                  const checked = form.characterIds.includes(c.id);
                  return (
                    <label
                      key={c.id}
                      className={`flex cursor-pointer items-center gap-2 rounded-md border px-2 py-1.5 text-sm ${
                        checked
                          ? "border-indigo-500 bg-indigo-500/10 text-indigo-200"
                          : "border-zinc-700 bg-zinc-800 text-zinc-300"
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => toggleCharacter(c.id)}
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
            <label className="mb-1 block text-sm font-medium text-zinc-300">
              キャラクター同士の関係
            </label>
            {memberCharacters.length < 2 ? (
              <p className="rounded-md border border-dashed border-zinc-700 p-3 text-sm text-zinc-500">
                所属キャラクターを2人以上選ぶと、関係を登録できます。
              </p>
            ) : (
              <div className="space-y-2">
                {form.relations.length > 0 && (
                  <ul className="space-y-1.5">
                    {form.relations.map((r, i) => (
                      <li
                        key={`${r.characterIdA}-${r.characterIdB}-${i}`}
                        className="flex items-start justify-between gap-2 rounded-md border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm"
                      >
                        <div className="min-w-0">
                          <p className="text-zinc-200">
                            {charName(r.characterIdA)} と {charName(r.characterIdB)}
                          </p>
                          <p className="mt-0.5 whitespace-pre-wrap text-xs text-zinc-400">
                            {r.description}
                          </p>
                          {r.aToB && (
                            <p className="mt-0.5 whitespace-pre-wrap text-xs text-zinc-500">
                              {charName(r.characterIdA)}→{charName(r.characterIdB)}:
                              {r.aToB.callName && ` 「${r.aToB.callName}」と呼ぶ。`}
                              {r.aToB.attitude}
                            </p>
                          )}
                          {r.bToA && (
                            <p className="mt-0.5 whitespace-pre-wrap text-xs text-zinc-500">
                              {charName(r.characterIdB)}→{charName(r.characterIdA)}:
                              {r.bToA.callName && ` 「${r.bToA.callName}」と呼ぶ。`}
                              {r.bToA.attitude}
                            </p>
                          )}
                        </div>
                        <div className="flex shrink-0 gap-1">
                          <button
                            type="button"
                            onClick={() => startEditRelation(i)}
                            className="rounded border border-zinc-600 px-2 py-0.5 text-xs text-zinc-300 hover:bg-zinc-700"
                          >
                            編集
                          </button>
                          <button
                            type="button"
                            onClick={() => removeRelation(i)}
                            className="rounded border border-zinc-600 px-2 py-0.5 text-xs text-red-400 hover:bg-red-500/10"
                          >
                            削除
                          </button>
                        </div>
                      </li>
                    ))}
                  </ul>
                )}

                <div className="rounded-md border border-zinc-700 bg-zinc-800/50 p-3">
                  <div className="grid grid-cols-2 gap-2">
                    <select
                      value={relDraftA}
                      onChange={(e) => setRelDraftA(e.target.value)}
                      className="w-full rounded-md border border-zinc-700 bg-zinc-800 px-2 py-1.5 text-sm text-zinc-100 outline-none focus:border-indigo-500"
                    >
                      <option value="">キャラA</option>
                      {memberCharacters.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.name || "(名称未設定)"}
                        </option>
                      ))}
                    </select>
                    <select
                      value={relDraftB}
                      onChange={(e) => setRelDraftB(e.target.value)}
                      className="w-full rounded-md border border-zinc-700 bg-zinc-800 px-2 py-1.5 text-sm text-zinc-100 outline-none focus:border-indigo-500"
                    >
                      <option value="">キャラB</option>
                      {memberCharacters.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.name || "(名称未設定)"}
                        </option>
                      ))}
                    </select>
                  </div>
                  <textarea
                    value={relDraftText}
                    onChange={(e) => setRelDraftText(e.target.value)}
                    rows={2}
                    placeholder="例: 幼なじみ / 上司と部下 / 犬猿の仲"
                    className="mt-2 w-full resize-none rounded-md border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm text-zinc-100 outline-none focus:border-indigo-500"
                  />

                  {/* 機能追加: 方向つき詳細(任意入力)。AIが呼び方・態度を方向ごとに把握できるようにする */}
                  {relDraftA && relDraftB && relDraftA !== relDraftB && (
                    <div className="mt-3 space-y-2">
                      <RelationDirectionFields
                        label={`${charName(relDraftA)} → ${charName(relDraftB)}`}
                        value={relDraftAToB}
                        onChange={setRelDraftAToB}
                      />
                      <RelationDirectionFields
                        label={`${charName(relDraftB)} → ${charName(relDraftA)}`}
                        value={relDraftBToA}
                        onChange={setRelDraftBToA}
                      />
                    </div>
                  )}

                  {relError && <p className="mt-1 text-xs text-red-400">{relError}</p>}
                  <div className="mt-2 flex justify-end gap-2">
                    {relEditIndex !== null && (
                      <button
                        type="button"
                        onClick={resetRelDraft}
                        className="rounded-md border border-zinc-700 px-2 py-1 text-xs text-zinc-300 hover:bg-zinc-700"
                      >
                        キャンセル
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={submitRelation}
                      className="rounded-md bg-indigo-600 px-3 py-1 text-xs font-medium text-white hover:bg-indigo-500"
                    >
                      {relEditIndex !== null ? "この関係を更新" : "関係を追加"}
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium text-zinc-300">
              ユーザー設定
            </label>
            <div className="inline-flex rounded-md border border-zinc-700 p-0.5 text-sm">
              <button
                type="button"
                onClick={() => setForm((f) => ({ ...f, useCustomUserProfile: false }))}
                className={`rounded px-3 py-1 ${
                  !form.useCustomUserProfile
                    ? "bg-indigo-600 text-white"
                    : "text-zinc-400 hover:text-zinc-200"
                }`}
              >
                共通のユーザー設定を使う
              </button>
              <button
                type="button"
                onClick={() => setForm((f) => ({ ...f, useCustomUserProfile: true }))}
                className={`rounded px-3 py-1 ${
                  form.useCustomUserProfile
                    ? "bg-indigo-600 text-white"
                    : "text-zinc-400 hover:text-zinc-200"
                }`}
              >
                このワールド専用の設定を使う
              </button>
            </div>
            <p className="mt-1 text-xs text-zinc-500">
              専用の設定にすると、このワールドに紐づくルームでは設定画面のユーザープロフィールの代わりにここで入力した内容が使われます。
            </p>

            {form.useCustomUserProfile && (
              <div className="mt-3 space-y-3 rounded-md border border-zinc-700 bg-zinc-800/50 p-3">
                <WorldUserProfileFields
                  profile={form.userProfile}
                  onChange={(p) => setForm((f) => ({ ...f, userProfile: p }))}
                />
              </div>
            )}
          </div>
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
            disabled={saving || !form.name.trim()}
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

/** ワールド専用ユーザー設定の入力欄。SettingsPageのユーザープロフィールと同じ項目構成 */
function WorldUserProfileFields({
  profile,
  onChange,
}: {
  profile: UserProfile;
  onChange: (p: UserProfile) => void;
}) {
  return (
    <>
      <div>
        <label className="mb-1 block text-sm font-medium text-zinc-300">名前</label>
        <input
          type="text"
          value={profile.name}
          onChange={(e) => onChange({ ...profile, name: e.target.value })}
          className="w-full rounded-md border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm text-zinc-100 outline-none focus:border-indigo-500"
        />
      </div>
      <div>
        <label className="mb-1 block text-sm font-medium text-zinc-300">呼ばれ方</label>
        <input
          type="text"
          value={profile.calledAs}
          onChange={(e) => onChange({ ...profile, calledAs: e.target.value })}
          placeholder="例: ○○さん、○○くん"
          className="w-full rounded-md border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm text-zinc-100 outline-none focus:border-indigo-500"
        />
      </div>
      <div>
        <label className="mb-1 block text-sm font-medium text-zinc-300">
          キャラからの扱われ方
        </label>
        <textarea
          value={profile.treatment}
          onChange={(e) => onChange({ ...profile, treatment: e.target.value })}
          rows={2}
          placeholder="例: 対等な友人として接してほしい / 妹のように扱ってほしい"
          className="w-full resize-none rounded-md border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm text-zinc-100 outline-none focus:border-indigo-500"
        />
      </div>
      <div>
        <label className="mb-1 block text-sm font-medium text-zinc-300">
          背景・プロフィール
        </label>
        <textarea
          value={profile.background}
          onChange={(e) => onChange({ ...profile, background: e.target.value })}
          rows={3}
          placeholder="例: 社会人2年目。一人暮らしで、休日はゲームばかりしている"
          className="w-full resize-none rounded-md border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm text-zinc-100 outline-none focus:border-indigo-500"
        />
      </div>
      <div>
        <label className="mb-1 block text-sm font-medium text-zinc-300">外見</label>
        <textarea
          value={profile.appearance}
          onChange={(e) => onChange({ ...profile, appearance: e.target.value })}
          rows={2}
          placeholder="例: 黒髪で背は低め。いつもパーカーを着ている"
          className="w-full resize-none rounded-md border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm text-zinc-100 outline-none focus:border-indigo-500"
        />
      </div>
      <TagInput
        label="苦手な話題"
        values={profile.dislikedTopics}
        onChange={(v) => onChange({ ...profile, dislikedTopics: v })}
      />
      <div>
        <label className="mb-1 block text-sm font-medium text-zinc-300">
          会話で重視したい雰囲気
        </label>
        <input
          type="text"
          value={profile.preferredMood}
          onChange={(e) => onChange({ ...profile, preferredMood: e.target.value })}
          className="w-full rounded-md border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm text-zinc-100 outline-none focus:border-indigo-500"
        />
      </div>
    </>
  );
}

/**
 * 機能追加: 関係の方向つき詳細(呼び方・態度)の入力欄1ブロック分。
 * 「A→B」のような向きラベルを表示し、呼び方・態度をそれぞれ入力する。両方とも任意入力。
 */
function RelationDirectionFields({
  label,
  value,
  onChange,
}: {
  label: string;
  value: RelationDirection;
  onChange: (v: RelationDirection) => void;
}) {
  return (
    <div className="rounded-md border border-zinc-700 bg-zinc-900/60 p-2">
      <p className="mb-1.5 text-xs font-medium text-indigo-300">{label}</p>
      <div className="grid grid-cols-2 gap-2">
        <input
          type="text"
          value={value.callName}
          onChange={(e) => onChange({ ...value, callName: e.target.value })}
          placeholder="呼び方(例: ボブ、先輩、あんた)"
          className="w-full rounded-md border border-zinc-700 bg-zinc-800 px-2 py-1.5 text-xs text-zinc-100 outline-none focus:border-indigo-500"
        />
        <input
          type="text"
          value={value.attitude}
          onChange={(e) => onChange({ ...value, attitude: e.target.value })}
          placeholder="態度・感情(例: 頭が上がらない。恩がある)"
          className="w-full rounded-md border border-zinc-700 bg-zinc-800 px-2 py-1.5 text-xs text-zinc-100 outline-none focus:border-indigo-500"
        />
      </div>
    </div>
  );
}
