// 「AIでグループ作成」モーダル(機能追加)
// 関係性のある複数キャラクター(例: 同級生3人、ホストクラブのトップキャストと黒服)を、
// 説明文+人数指定から一括生成する。入力ステップ→プレビューステップの2段階で、
// 「この内容で作成」を押すまではDBに一切書き込まない。
import { useState } from "react";
import { useAppStore } from "../store";
import type { CharacterInput } from "../lib/characters";
import type { WorldInput } from "../lib/worlds";
import { defaultUserProfile } from "../lib/settings";
import type { RelationDirection } from "../types";
import {
  requestGroupAssist,
  GroupAssistParseError,
  type GroupAssistResult,
  type GroupCharacterDraft,
  type GroupMemberCount,
} from "../llm/groupAssist";
import { LLMError, LLM_ERROR_MESSAGES } from "../llm/types";

/** 呼び方・態度がどちらも空(または未指定)ならundefined(保存しない)にする */
function directionOrUndefined(d: RelationDirection | undefined): RelationDirection | undefined {
  if (!d) return undefined;
  const callName = d.callName.trim();
  const attitude = d.attitude.trim();
  if (!callName && !attitude) return undefined;
  return { callName, attitude };
}

interface GroupAssistModalProps {
  open: boolean;
  onClose: () => void;
  /** 作成完了時に呼ばれる。ワールドも作成した場合はそのIDを渡す(ライブラリ側でタブ切り替えに使える) */
  onCreated: (worldId: string | null) => void;
}

type Step = "input" | "preview";

function emptyResult(): GroupAssistResult {
  return { worldName: "", worldDescription: "", characters: [], relations: [] };
}

/** 概要表示用の1行(値が空なら表示しない) */
function SummaryRow({ label, value }: { label: string; value: string }) {
  if (!value.trim()) return null;
  return (
    <div className="text-xs text-zinc-400">
      <span className="text-zinc-500">{label}: </span>
      <span className="whitespace-pre-wrap text-zinc-300">{value}</span>
    </div>
  );
}

function SummaryListRow({ label, values }: { label: string; values: string[] }) {
  if (values.length === 0) return null;
  return (
    <div className="text-xs text-zinc-400">
      <span className="text-zinc-500">{label}: </span>
      <span className="text-zinc-300">{values.join(" / ")}</span>
    </div>
  );
}

export function GroupAssistModal({ open, onClose, onCreated }: GroupAssistModalProps) {
  const addCharacter = useAppStore((s) => s.addCharacter);
  const addWorld = useAppStore((s) => s.addWorld);

  const [step, setStep] = useState<Step>("input");

  // ---- 入力ステップ ----
  const [description, setDescription] = useState("");
  const [memberCount, setMemberCount] = useState<GroupMemberCount>("auto");
  const [generating, setGenerating] = useState(false);
  const [generateError, setGenerateError] = useState<string | null>(null);

  // ---- プレビューステップ(その場で編集できるドラフト) ----
  const [result, setResult] = useState<GroupAssistResult>(emptyResult());
  const [createWorldFlag, setCreateWorldFlag] = useState(true);
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  const resetAll = () => {
    setStep("input");
    setDescription("");
    setMemberCount("auto");
    setGenerating(false);
    setGenerateError(null);
    setResult(emptyResult());
    setCreateWorldFlag(true);
    setCreating(false);
    setCreateError(null);
  };

  const handleClose = () => {
    // 生成中・プレビュー中の内容はここで破棄する(DBには一切書いていない)
    resetAll();
    onClose();
  };

  if (!open) return null;

  const describeError = (err: unknown): string => {
    if (err instanceof LLMError) return err.message || LLM_ERROR_MESSAGES[err.kind];
    if (err instanceof GroupAssistParseError) return err.message;
    return err instanceof Error ? err.message : "AIグループ生成に失敗しました。";
  };

  const handleGenerate = async () => {
    setGenerating(true);
    setGenerateError(null);
    try {
      const generated = await requestGroupAssist(description, memberCount);
      setResult(generated);
      setCreateWorldFlag(true);
      setStep("preview");
    } catch (err) {
      setGenerateError(describeError(err));
    } finally {
      setGenerating(false);
    }
  };

  const handleBackToInput = () => {
    setStep("input");
    setResult(emptyResult());
    setCreateError(null);
  };

  const updateCharacter = (index: number, patch: Partial<GroupCharacterDraft>) => {
    setResult((r) => ({
      ...r,
      characters: r.characters.map((c, i) => (i === index ? { ...c, ...patch } : c)),
    }));
  };

  const updateRelationDescription = (index: number, description: string) => {
    setResult((r) => ({
      ...r,
      relations: r.relations.map((rel, i) => (i === index ? { ...rel, description } : rel)),
    }));
  };

  /** 機能追加: プレビューでの方向つき詳細(呼び方・態度)の編集。直接編集ではなくフィールド単位で更新する */
  const updateRelationDirection = (
    index: number,
    dir: "aToB" | "bToA",
    field: "callName" | "attitude",
    value: string,
  ) => {
    setResult((r) => ({
      ...r,
      relations: r.relations.map((rel, i) => {
        if (i !== index) return rel;
        const current = rel[dir] ?? { callName: "", attitude: "" };
        return { ...rel, [dir]: { ...current, [field]: value } };
      }),
    }));
  };

  const charName = (index: number) => result.characters[index]?.name.trim() || "(名称未設定)";

  const characterInputFromDraft = (draft: GroupCharacterDraft): CharacterInput => ({
    name: draft.name.trim(),
    nicknames: [],
    firstPerson: draft.firstPerson,
    secondPerson: draft.secondPerson,
    speechStyle: draft.speechStyle,
    personality: draft.personality,
    conversationStyle: draft.conversationStyle,
    background: draft.background,
    occupation: draft.occupation,
    likes: draft.likes,
    dislikes: draft.dislikes,
    dreamsWorriesSecrets: draft.dreamsWorriesSecrets,
    appearance: draft.appearance,
    iconImage: undefined,
    portraitImage: undefined,
    galleryImages: [],
    relationToUser: draft.relationToUser,
    hardConstraints: "",
    ngWords: [],
    speechSamples: draft.speechSamples,
    freeNotes: "",
  });

  const handleConfirm = async () => {
    if (result.characters.some((c) => !c.name.trim())) {
      setCreateError("すべてのキャラクターに名前を入力してください。");
      return;
    }
    setCreating(true);
    setCreateError(null);

    let createdIds: string[] = [];
    try {
      // 順番を保つため直列に作成する(インデックス=関係の参照先と対応させるため)
      for (const draft of result.characters) {
        const created = await addCharacter(characterInputFromDraft(draft));
        createdIds = [...createdIds, created.id];
      }
    } catch (err) {
      setCreating(false);
      setCreateError(
        `キャラクターの作成中にエラーが発生しました: ${
          err instanceof Error ? err.message : "不明なエラー"
        }`,
      );
      return;
    }

    if (!createWorldFlag) {
      setCreating(false);
      onCreated(null);
      resetAll();
      onClose();
      return;
    }

    try {
      const worldInput: WorldInput = {
        name: result.worldName.trim() || "(名称未設定)",
        description: result.worldDescription.trim(),
        characterIds: createdIds,
        relations: result.relations
          .filter((r) => createdIds[r.aIndex] && createdIds[r.bIndex])
          .map((r) => ({
            characterIdA: createdIds[r.aIndex],
            characterIdB: createdIds[r.bIndex],
            description: r.description,
            aToB: directionOrUndefined(r.aToB),
            bToA: directionOrUndefined(r.bToA),
          })),
        useCustomUserProfile: false,
        userProfile: defaultUserProfile(),
      };
      const world = await addWorld(worldInput);
      setCreating(false);
      onCreated(world.id);
      resetAll();
      onClose();
    } catch (err) {
      setCreating(false);
      setCreateError(
        `キャラクターは作成済みですが、ワールドの作成中にエラーが発生しました: ${
          err instanceof Error ? err.message : "不明なエラー"
        } ライブラリから手動でワールドを作成してください。`,
      );
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-lg border border-zinc-700 bg-zinc-900 p-5 shadow-xl">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold text-zinc-100">AIでグループ作成</h2>
          <button
            type="button"
            onClick={handleClose}
            className="text-sm text-zinc-500 hover:text-zinc-300"
          >
            閉じる
          </button>
        </div>

        {step === "input" && (
          <div className="mt-4 space-y-4">
            <p className="text-xs text-zinc-500">
              関係性のある複数のキャラクターを、世界観・キャラ同士の関係込みでまとめて生成します。
            </p>
            <div>
              <label className="mb-1 block text-sm font-medium text-zinc-300">
                グループの説明
              </label>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={3}
                placeholder="例: 腐れ縁の同級生3人。1人はしっかり者、あとの2人は問題児。&#10;例: ホストクラブのトップキャストと、彼を支える黒服。"
                className="w-full resize-none rounded-md border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm text-zinc-100 outline-none focus:border-indigo-500"
              />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-zinc-300">人数</label>
              <select
                value={String(memberCount)}
                onChange={(e) =>
                  setMemberCount(
                    e.target.value === "auto"
                      ? "auto"
                      : (Number(e.target.value) as GroupMemberCount),
                  )
                }
                className="w-full max-w-[10rem] rounded-md border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm text-zinc-100 outline-none focus:border-indigo-500"
              >
                <option value="auto">自動</option>
                <option value="2">2人</option>
                <option value="3">3人</option>
                <option value="4">4人</option>
                <option value="5">5人</option>
              </select>
            </div>

            {generateError && <p className="text-xs text-red-400">{generateError}</p>}

            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={handleGenerate}
                disabled={generating}
                className="rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-500 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {generating ? (
                  <span className="inline-flex items-center gap-2">
                    <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-white/40 border-t-white" />
                    生成中…
                  </span>
                ) : (
                  "生成"
                )}
              </button>
            </div>
          </div>
        )}

        {step === "preview" && (
          <div className="mt-4 space-y-5">
            <p className="rounded-md border border-indigo-800/60 bg-indigo-950/20 p-2 text-xs text-indigo-200">
              内容を確認してください。名前・関係の説明はその場で編集できます。それ以外の項目は
              作成後にライブラリで自由に編集できます。
            </p>

            <div className="space-y-3">
              <h3 className="text-sm font-semibold text-zinc-200">
                キャラクター({result.characters.length}人)
              </h3>
              {result.characters.map((c, i) => (
                <div
                  key={i}
                  className="rounded-md border border-zinc-700 bg-zinc-800/50 p-3"
                >
                  <label className="mb-1 block text-xs font-medium text-zinc-400">名前</label>
                  <input
                    type="text"
                    value={c.name}
                    onChange={(e) => updateCharacter(i, { name: e.target.value })}
                    className="w-full rounded-md border border-zinc-700 bg-zinc-800 px-3 py-1.5 text-sm text-zinc-100 outline-none focus:border-indigo-500"
                  />
                  <div className="mt-2 space-y-1">
                    <SummaryRow
                      label="一人称・二人称"
                      value={[c.firstPerson, c.secondPerson].filter(Boolean).join(" / ")}
                    />
                    <SummaryRow label="口調" value={c.speechStyle} />
                    <SummaryRow label="性格" value={c.personality} />
                    <SummaryRow label="会話スタイル" value={c.conversationStyle} />
                    <SummaryRow label="背景" value={c.background} />
                    <SummaryRow label="職業・所属・立場" value={c.occupation} />
                    <SummaryListRow label="好きなもの" values={c.likes} />
                    <SummaryListRow label="嫌いなもの" values={c.dislikes} />
                    <SummaryRow label="夢・悩み・秘密" value={c.dreamsWorriesSecrets} />
                    <SummaryRow label="外見" value={c.appearance} />
                    <SummaryRow label="ユーザーとの関係" value={c.relationToUser} />
                  </div>
                </div>
              ))}
            </div>

            <div className="space-y-2">
              <h3 className="text-sm font-semibold text-zinc-200">関係</h3>
              {result.relations.length === 0 ? (
                <p className="text-xs text-zinc-500">関係は生成されませんでした。</p>
              ) : (
                <ul className="space-y-2">
                  {result.relations.map((r, i) => (
                    <li
                      key={i}
                      className="rounded-md border border-zinc-700 bg-zinc-800/50 p-2.5"
                    >
                      <p className="text-xs font-medium text-zinc-300">
                        {charName(r.aIndex)} ↔ {charName(r.bIndex)}
                      </p>
                      <textarea
                        value={r.description}
                        onChange={(e) => updateRelationDescription(i, e.target.value)}
                        rows={2}
                        className="mt-1 w-full resize-none rounded-md border border-zinc-700 bg-zinc-800 px-2.5 py-1.5 text-xs text-zinc-200 outline-none focus:border-indigo-500"
                      />
                      {/* 機能追加: 方向つき詳細(呼び方・態度)のプレビュー編集 */}
                      <div className="mt-2 space-y-1.5">
                        <div className="rounded-md border border-zinc-700 bg-zinc-900/60 p-2">
                          <p className="mb-1 text-[11px] font-medium text-indigo-300">
                            {charName(r.aIndex)} → {charName(r.bIndex)}
                          </p>
                          <div className="grid grid-cols-2 gap-1.5">
                            <input
                              type="text"
                              value={r.aToB?.callName ?? ""}
                              onChange={(e) =>
                                updateRelationDirection(i, "aToB", "callName", e.target.value)
                              }
                              placeholder="呼び方"
                              className="w-full rounded-md border border-zinc-700 bg-zinc-800 px-2 py-1 text-[11px] text-zinc-100 outline-none focus:border-indigo-500"
                            />
                            <input
                              type="text"
                              value={r.aToB?.attitude ?? ""}
                              onChange={(e) =>
                                updateRelationDirection(i, "aToB", "attitude", e.target.value)
                              }
                              placeholder="態度・感情"
                              className="w-full rounded-md border border-zinc-700 bg-zinc-800 px-2 py-1 text-[11px] text-zinc-100 outline-none focus:border-indigo-500"
                            />
                          </div>
                        </div>
                        <div className="rounded-md border border-zinc-700 bg-zinc-900/60 p-2">
                          <p className="mb-1 text-[11px] font-medium text-indigo-300">
                            {charName(r.bIndex)} → {charName(r.aIndex)}
                          </p>
                          <div className="grid grid-cols-2 gap-1.5">
                            <input
                              type="text"
                              value={r.bToA?.callName ?? ""}
                              onChange={(e) =>
                                updateRelationDirection(i, "bToA", "callName", e.target.value)
                              }
                              placeholder="呼び方"
                              className="w-full rounded-md border border-zinc-700 bg-zinc-800 px-2 py-1 text-[11px] text-zinc-100 outline-none focus:border-indigo-500"
                            />
                            <input
                              type="text"
                              value={r.bToA?.attitude ?? ""}
                              onChange={(e) =>
                                updateRelationDirection(i, "bToA", "attitude", e.target.value)
                              }
                              placeholder="態度・感情"
                              className="w-full rounded-md border border-zinc-700 bg-zinc-800 px-2 py-1 text-[11px] text-zinc-100 outline-none focus:border-indigo-500"
                            />
                          </div>
                        </div>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            <div className="space-y-2 rounded-md border border-zinc-700 bg-zinc-800/50 p-3">
              <label className="flex items-center gap-2 text-sm text-zinc-200">
                <input
                  type="checkbox"
                  checked={createWorldFlag}
                  onChange={(e) => setCreateWorldFlag(e.target.checked)}
                  className="accent-indigo-500"
                />
                ワールドも作成する(所属キャラ・関係をまとめてフォルダ分け)
              </label>
              {createWorldFlag && (
                <div className="space-y-2 pt-1">
                  <div>
                    <label className="mb-1 block text-xs font-medium text-zinc-400">
                      ワールド名
                    </label>
                    <input
                      type="text"
                      value={result.worldName}
                      onChange={(e) =>
                        setResult((r) => ({ ...r, worldName: e.target.value }))
                      }
                      className="w-full rounded-md border border-zinc-700 bg-zinc-800 px-3 py-1.5 text-sm text-zinc-100 outline-none focus:border-indigo-500"
                    />
                  </div>
                  <div>
                    <label className="mb-1 block text-xs font-medium text-zinc-400">
                      世界観の説明
                    </label>
                    <textarea
                      value={result.worldDescription}
                      onChange={(e) =>
                        setResult((r) => ({ ...r, worldDescription: e.target.value }))
                      }
                      rows={2}
                      className="w-full resize-none rounded-md border border-zinc-700 bg-zinc-800 px-3 py-1.5 text-sm text-zinc-100 outline-none focus:border-indigo-500"
                    />
                  </div>
                </div>
              )}
            </div>

            {createError && <p className="text-xs text-red-400">{createError}</p>}

            <div className="flex justify-end gap-2 pt-1">
              <button
                type="button"
                onClick={handleBackToInput}
                disabled={creating}
                className="rounded-md border border-zinc-700 px-3 py-1.5 text-sm text-zinc-300 hover:bg-zinc-800 disabled:opacity-50"
              >
                作り直す
              </button>
              <button
                type="button"
                onClick={handleConfirm}
                disabled={creating}
                className="rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-500 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {creating ? "作成中…" : "この内容で作成"}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
