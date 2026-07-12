// 右スライドオーバー(仕様書10.2)
// タブ2つ: 「メンバー」(参加状態一括管理)と「記憶」(fact/relationshipの一覧、編集・削除・固定・キャラ設定に昇格)。
import { useState } from "react";
import { Link } from "react-router-dom";
import type { Character, Memory, Presence, RoomCharacterState } from "../../types";
import { CharacterAvatar } from "../CharacterAvatar";
import { ConfirmDialog } from "../ConfirmDialog";
import {
  PROMOTION_TARGET_LABELS,
  promoteMemoryToCharacter,
  type PromotionTarget,
} from "../../lib/characters";
import { deleteMemory, updateMemory } from "../../lib/memories";
import type { SummarizeOutcome } from "../../llm/memoryService";
import { LLMError, LLM_ERROR_MESSAGES, type LLMErrorKind } from "../../llm/types";

interface SidePanelProps {
  open: boolean;
  onClose: () => void;
  members: { character: Character; state: RoomCharacterState }[];
  memories: Memory[];
  /** 会話が1件でもあるか(手動整理ボタンの有効/無効判定に使う) */
  hasMessages: boolean;
  onChangePresence: (characterId: string, presence: Presence) => void;
  /** 記憶を編集・削除・昇格した後に呼ばれる(親側で再読込する) */
  onMemoriesChanged: () => void;
  /** 上書き編集モーダルを開く(メンバータブから) */
  onEditOverrides: (characterId: string) => void;
  /**
   * 「記憶を整理」ボタンから呼ばれる手動の要約+記憶抽出(仕様書6.2の手動版)。
   * 成功時は呼び出し側(RoomPage)で再読込・pinned矛盾の確認バナー表示まで行う。
   * 失敗時はLLMError等をそのまま投げる(ここで日本語エラー表示に変換する)。
   */
  onManualOrganize: () => Promise<SummarizeOutcome | null>;
}

const presenceOptions: { value: Presence; label: string }[] = [
  { value: "active", label: "参加" },
  { value: "listening", label: "聞いている" },
  { value: "absent", label: "不参加" },
];

export function SidePanel({
  open,
  onClose,
  members,
  memories,
  hasMessages,
  onChangePresence,
  onMemoriesChanged,
  onEditOverrides,
  onManualOrganize,
}: SidePanelProps) {
  const [tab, setTab] = useState<"members" | "memory">("members");
  const [deleteTarget, setDeleteTarget] = useState<Memory | null>(null);
  const [promoteTarget, setPromoteTarget] = useState<Memory | null>(null);

  // 手動整理(「記憶を整理」ボタン)の実行状態・フィードバック
  const [organizing, setOrganizing] = useState(false);
  const [organizeFeedback, setOrganizeFeedback] = useState<string | null>(null);
  const [organizeError, setOrganizeError] = useState<{ message: string; kind?: LLMErrorKind } | null>(
    null,
  );

  if (!open) return null;

  const facts = memories.filter((m) => m.type === "fact");
  const relationships = memories.filter((m) => m.type === "relationship");

  const handleDelete = async () => {
    if (!deleteTarget) return;
    await deleteMemory(deleteTarget.id);
    setDeleteTarget(null);
    onMemoriesChanged();
  };

  /** 「記憶を整理」ボタン: 手動で今すぐ要約+記憶抽出を実行する */
  const handleOrganize = async () => {
    setOrganizing(true);
    setOrganizeFeedback(null);
    setOrganizeError(null);
    try {
      const outcome = await onManualOrganize();
      const count = outcome?.memoriesAdded ?? 0;
      setOrganizeFeedback(count > 0 ? `${count}件の記憶を追加しました` : "新しい記憶はありませんでした");
      window.setTimeout(() => setOrganizeFeedback(null), 4000);
    } catch (err) {
      if (err instanceof LLMError) {
        setOrganizeError({ message: err.message || LLM_ERROR_MESSAGES[err.kind], kind: err.kind });
      } else {
        setOrganizeError({
          message: err instanceof Error ? err.message : "予期しないエラーが発生しました。",
        });
      }
    } finally {
      setOrganizing(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <div className="flex-1 bg-black/50" onClick={onClose} />
      {/* テーマ統一(機能修正): 黒固定をやめ、テーマのサーフェス色で表示する */}
      <div className="flex h-full w-full max-w-sm flex-col border-l border-[var(--chat-border,#27272a)] bg-[var(--chat-surface,#09090b)] shadow-2xl">
        <div className="flex items-center justify-between border-b border-[var(--chat-border,#27272a)] px-4 py-3">
          <div className="flex gap-1 rounded-md border border-[var(--chat-button-border,#3f3f46)] p-0.5 text-sm">
            <button
              type="button"
              onClick={() => setTab("members")}
              className={`rounded px-3 py-1 ${
                tab === "members"
                  ? "bg-indigo-600 text-white"
                  : "text-[var(--chat-muted-text,#a1a1aa)] hover:text-[var(--chat-heading-text,#e4e4e7)]"
              }`}
            >
              メンバー
            </button>
            <button
              type="button"
              onClick={() => setTab("memory")}
              className={`rounded px-3 py-1 ${
                tab === "memory"
                  ? "bg-indigo-600 text-white"
                  : "text-[var(--chat-muted-text,#a1a1aa)] hover:text-[var(--chat-heading-text,#e4e4e7)]"
              }`}
            >
              記憶
            </button>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md px-2 py-1 text-[var(--chat-muted-text,#a1a1aa)] hover:bg-[var(--chat-input-bg,#27272a)] hover:text-[var(--chat-heading-text,#e4e4e7)]"
          >
            閉じる
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-4">
          {tab === "members" && (
            <div className="space-y-3">
              {members.length === 0 && (
                <p className="text-sm text-[var(--chat-placeholder-text,#71717a)]">メンバーがいません。</p>
              )}
              {members.map(({ character, state }) => (
                <div
                  key={character.id}
                  className="rounded-lg border border-[var(--chat-border,#27272a)] bg-[var(--chat-input-bg,#18181b)] p-3"
                >
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <CharacterAvatar character={character} size={32} />
                      <span className="text-sm font-medium text-[var(--chat-heading-text,#f4f4f5)]">
                        {character.name}
                      </span>
                    </div>
                    <button
                      type="button"
                      onClick={() => onEditOverrides(character.id)}
                      className="rounded-md border border-[var(--chat-button-border,#3f3f46)] px-2 py-1 text-xs text-[var(--chat-button-text,#d4d4d8)] hover:bg-[var(--chat-surface,#27272a)]"
                    >
                      上書きを編集
                    </button>
                  </div>
                  <div className="mt-2 flex gap-1">
                    {presenceOptions.map((opt) => (
                      <button
                        key={opt.value}
                        type="button"
                        onClick={() => onChangePresence(character.id, opt.value)}
                        className={`rounded-md px-2 py-1 text-xs ${
                          state.presence === opt.value
                            ? "bg-indigo-500/20 text-[var(--chat-accent-text,#c7d2fe)]"
                            : "border border-[var(--chat-button-border,#3f3f46)] text-[var(--chat-muted-text,#a1a1aa)] hover:bg-[var(--chat-surface,#27272a)]"
                        }`}
                      >
                        {opt.label}
                      </button>
                    ))}
                  </div>
                  {Object.values(state.overrides).some((v) => v) && (
                    <ul className="mt-2 list-inside list-disc text-xs text-[var(--chat-muted-text,#a1a1aa)]">
                      {state.overrides.occupation && <li>職業・立場: {state.overrides.occupation}</li>}
                      {state.overrides.relationToUser && (
                        <li>ユーザーとの関係: {state.overrides.relationToUser}</li>
                      )}
                      {state.overrides.roleInWorld && <li>世界観上の役割: {state.overrides.roleInWorld}</li>}
                      {state.overrides.extraNotes && <li>追加メモ: {state.overrides.extraNotes}</li>}
                    </ul>
                  )}
                </div>
              ))}
            </div>
          )}

          {tab === "memory" && (
            <div className="space-y-4">
              <p className="text-xs text-[var(--chat-placeholder-text,#71717a)]">
                会話から自動抽出された記憶です。固定した記憶は自動整理の対象外になります。「昇格」でキャラ本体の設定に反映できます。
              </p>

              {/* 手動整理: 発言数がトリガーに達していなくても今すぐ要約+記憶抽出を実行する */}
              <div className="rounded-md border border-[var(--chat-border,#27272a)] bg-[var(--chat-input-bg,#18181b)] p-2">
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    disabled={!hasMessages || organizing}
                    onClick={() => void handleOrganize()}
                    className="flex items-center gap-1.5 rounded-md border border-[var(--chat-button-border,#3f3f46)] px-3 py-1.5 text-xs text-[var(--chat-button-text,#d4d4d8)] hover:bg-[var(--chat-surface,#27272a)] disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {organizing && (
                      <span className="h-3 w-3 animate-spin rounded-full border-2 border-[var(--chat-placeholder-text,#71717a)] border-t-transparent" />
                    )}
                    {organizing ? "整理中…" : "記憶を整理"}
                  </button>
                  {organizeFeedback && (
                    <span className="text-xs text-[var(--chat-success-text,#34d399)]">{organizeFeedback}</span>
                  )}
                </div>
                {!hasMessages && (
                  <p className="mt-1 text-[11px] text-[var(--chat-placeholder-text,#52525b)]">
                    会話がまだ無いルームでは実行できません。
                  </p>
                )}
                {organizeError && (
                  // 半透明の赤はどのテーマの背景でも成立する。文字色だけテーマの危険色に連動させる
                  <div className="mt-2 rounded-md border border-red-500/40 bg-red-500/10 px-2 py-1.5 text-[11px] text-[var(--chat-danger-text,#fecaca)]">
                    <p className="break-words">{organizeError.message}</p>
                    {(organizeError.kind === "missingKey" ||
                      organizeError.kind === "keyInvalid" ||
                      organizeError.kind === "permissionDenied") && (
                      <Link
                        to="/settings"
                        className="mt-1 inline-block text-[11px] text-[var(--chat-danger-text,#fca5a5)] underline"
                      >
                        設定画面を開く
                      </Link>
                    )}
                  </div>
                )}
              </div>

              <MemorySection
                title="事実"
                memories={facts}
                members={members}
                onChanged={onMemoriesChanged}
                onDelete={setDeleteTarget}
                onPromote={setPromoteTarget}
              />
              <MemorySection
                title="関係性"
                memories={relationships}
                members={members}
                onChanged={onMemoriesChanged}
                onDelete={setDeleteTarget}
                onPromote={setPromoteTarget}
              />
            </div>
          )}
        </div>
      </div>

      <ConfirmDialog
        open={deleteTarget !== null}
        title="この記憶を削除しますか?"
        message={`「${deleteTarget?.content ?? ""}」を完全に削除します。この操作は取り消せません。`}
        confirmLabel="削除する"
        onCancel={() => setDeleteTarget(null)}
        onConfirm={handleDelete}
      />

      {promoteTarget && (
        <PromoteDialog
          memory={promoteTarget}
          members={members}
          onClose={() => setPromoteTarget(null)}
          onDone={() => {
            setPromoteTarget(null);
            onMemoriesChanged();
          }}
        />
      )}
    </div>
  );
}

/** 記憶一覧のセクション(事実 / 関係性) */
function MemorySection({
  title,
  memories,
  members,
  onChanged,
  onDelete,
  onPromote,
}: {
  title: string;
  memories: Memory[];
  members: { character: Character; state: RoomCharacterState }[];
  onChanged: () => void;
  onDelete: (memory: Memory) => void;
  onPromote: (memory: Memory) => void;
}) {
  return (
    <div>
      <h3 className="mb-1 text-sm font-semibold text-[var(--chat-button-text,#d4d4d8)]">{title}</h3>
      {memories.length === 0 ? (
        <p className="text-xs text-[var(--chat-placeholder-text,#52525b)]">まだありません。</p>
      ) : (
        <ul className="space-y-1.5">
          {memories.map((m) => (
            <MemoryRow
              key={m.id}
              memory={m}
              members={members}
              onChanged={onChanged}
              onDelete={onDelete}
              onPromote={onPromote}
            />
          ))}
        </ul>
      )}
    </div>
  );
}

/** 記憶1件の行(内容表示+編集・固定・昇格・削除) */
function MemoryRow({
  memory,
  members,
  onChanged,
  onDelete,
  onPromote,
}: {
  memory: Memory;
  members: { character: Character; state: RoomCharacterState }[];
  onChanged: () => void;
  onDelete: (memory: Memory) => void;
  onPromote: (memory: Memory) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(memory.content);

  const nameById = new Map(members.map((m) => [m.character.id, m.character.name]));
  const subjectNames = memory.subjectIds
    .map((id) => (id === "user" ? "ユーザー" : nameById.get(id) ?? "(不明)"))
    .join("、");

  // 昇格先にできるキャラ(subjectIdsのうちルームメンバーであるキャラ)が1人以上いる場合のみ昇格可能
  const canPromote = memory.subjectIds.some((id) => id !== "user" && nameById.has(id));

  const handleSaveEdit = async () => {
    const trimmed = draft.trim();
    if (!trimmed) return;
    await updateMemory(memory.id, { content: trimmed });
    setEditing(false);
    onChanged();
  };

  const handleTogglePin = async () => {
    await updateMemory(memory.id, { pinned: !memory.pinned });
    onChanged();
  };

  return (
    <li
      className={`rounded-md border border-[var(--chat-border,#27272a)] bg-[var(--chat-input-bg,#18181b)] px-2 py-1.5 text-xs ${
        memory.disabled ? "opacity-60" : ""
      }`}
    >
      {editing ? (
        <div>
          <textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            rows={2}
            className="w-full resize-none rounded-md border border-[var(--chat-button-border,#3f3f46)] bg-[var(--chat-surface,#27272a)] px-2 py-1 text-xs text-[var(--chat-input-text,#f4f4f5)] outline-none focus:border-indigo-500"
          />
          <div className="mt-1 flex justify-end gap-1">
            <button
              type="button"
              onClick={() => {
                setEditing(false);
                setDraft(memory.content);
              }}
              className="rounded px-2 py-0.5 text-[var(--chat-placeholder-text,#71717a)] hover:text-[var(--chat-button-text,#d4d4d8)]"
            >
              キャンセル
            </button>
            <button
              type="button"
              disabled={!draft.trim()}
              onClick={handleSaveEdit}
              className="rounded bg-indigo-600 px-2 py-0.5 text-white hover:bg-indigo-500 disabled:opacity-50"
            >
              保存
            </button>
          </div>
        </div>
      ) : (
        <>
          <p
            className={
              memory.disabled
                ? "text-[var(--chat-placeholder-text,#52525b)] line-through"
                : "text-[var(--chat-button-text,#d4d4d8)]"
            }
          >
            {memory.content}
          </p>
          <div className="mt-1 flex items-center justify-between gap-1">
            <span className="truncate text-[10px] text-[var(--chat-placeholder-text,#52525b)]">
              関連: {subjectNames || "-"}
            </span>
            <span className="flex shrink-0 items-center gap-0.5">
              {memory.pinned && (
                <span className="rounded bg-amber-500/20 px-1 text-[10px] text-[var(--chat-warning-text,#fcd34d)]">
                  固定
                </span>
              )}
              {memory.disabled && (
                <span className="rounded border border-[var(--chat-border,#27272a)] px-1 text-[10px] text-[var(--chat-placeholder-text,#71717a)]">
                  無効
                </span>
              )}
            </span>
          </div>
          <div className="mt-1 flex flex-wrap gap-1">
            <button
              type="button"
              onClick={() => {
                setDraft(memory.content);
                setEditing(true);
              }}
              className="rounded border border-[var(--chat-button-border,#3f3f46)] px-1.5 py-0.5 text-[10px] text-[var(--chat-muted-text,#a1a1aa)] hover:bg-[var(--chat-surface,#27272a)]"
            >
              編集
            </button>
            <button
              type="button"
              onClick={handleTogglePin}
              className={`rounded border px-1.5 py-0.5 text-[10px] ${
                memory.pinned
                  ? "border-amber-600 text-[var(--chat-warning-text,#fcd34d)] hover:bg-amber-500/10"
                  : "border-[var(--chat-button-border,#3f3f46)] text-[var(--chat-muted-text,#a1a1aa)] hover:bg-[var(--chat-surface,#27272a)]"
              }`}
            >
              {memory.pinned ? "固定解除" : "固定"}
            </button>
            {canPromote && !memory.disabled && (
              <button
                type="button"
                onClick={() => onPromote(memory)}
                className="rounded border border-indigo-700 px-1.5 py-0.5 text-[10px] text-[var(--chat-accent-text,#a5b4fc)] hover:bg-indigo-500/10"
              >
                キャラ設定に昇格
              </button>
            )}
            <button
              type="button"
              onClick={() => onDelete(memory)}
              className="rounded border border-[var(--chat-button-border,#3f3f46)] px-1.5 py-0.5 text-[10px] text-[var(--chat-danger-text,#f87171)] hover:bg-red-500/10"
            >
              削除
            </button>
          </div>
        </>
      )}
    </li>
  );
}

/**
 * 昇格ダイアログ(仕様書3.4)。
 * 昇格先キャラ+昇格先フィールド(好きなもの/背景/自由記述)を選び、確認のうえキャラ本体に追記する。
 * 自動昇格は絶対にしない(必ずこのダイアログを経由する)。
 */
function PromoteDialog({
  memory,
  members,
  onClose,
  onDone,
}: {
  memory: Memory;
  members: { character: Character; state: RoomCharacterState }[];
  onClose: () => void;
  onDone: () => void;
}) {
  // 昇格先候補: subjectIdsに含まれるルームメンバーのキャラ
  const candidates = members.filter((m) => memory.subjectIds.includes(m.character.id));
  const [characterId, setCharacterId] = useState(candidates[0]?.character.id ?? "");
  const [target, setTarget] = useState<PromotionTarget>("freeNotes");
  const [confirming, setConfirming] = useState(false);
  const [running, setRunning] = useState(false);

  const selectedName =
    candidates.find((c) => c.character.id === characterId)?.character.name ?? "";

  const handlePromote = async () => {
    setRunning(true);
    try {
      await promoteMemoryToCharacter(characterId, target, memory.content);
      onDone();
    } finally {
      setRunning(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 p-4" onClick={onClose}>
      {/* テーマ統一(機能修正): 黒固定をやめ、テーマのサーフェス色で表示する */}
      <div
        className="w-full max-w-sm rounded-lg border border-[var(--chat-button-border,#3f3f46)] bg-[var(--chat-surface,#18181b)] p-5 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        {!confirming ? (
          <>
            <h2 className="text-base font-semibold text-[var(--chat-heading-text,#f4f4f5)]">キャラ設定に昇格</h2>
            <p className="mt-2 rounded-md bg-[var(--chat-input-bg,#27272a)] px-2 py-1.5 text-sm text-[var(--chat-button-text,#d4d4d8)]">
              {memory.content}
            </p>
            <div className="mt-4 space-y-3">
              <div>
                <label className="mb-1 block text-sm font-medium text-[var(--chat-button-text,#d4d4d8)]">昇格先キャラクター</label>
                <select
                  value={characterId}
                  onChange={(e) => setCharacterId(e.target.value)}
                  className="w-full rounded-md border border-[var(--chat-button-border,#3f3f46)] bg-[var(--chat-input-bg,#27272a)] px-3 py-2 text-sm text-[var(--chat-input-text,#f4f4f5)] outline-none focus:border-indigo-500"
                >
                  {candidates.map((c) => (
                    <option key={c.character.id} value={c.character.id}>
                      {c.character.name}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-[var(--chat-button-text,#d4d4d8)]">昇格先の項目</label>
                <select
                  value={target}
                  onChange={(e) => setTarget(e.target.value as PromotionTarget)}
                  className="w-full rounded-md border border-[var(--chat-button-border,#3f3f46)] bg-[var(--chat-input-bg,#27272a)] px-3 py-2 text-sm text-[var(--chat-input-text,#f4f4f5)] outline-none focus:border-indigo-500"
                >
                  {(Object.keys(PROMOTION_TARGET_LABELS) as PromotionTarget[]).map((t) => (
                    <option key={t} value={t}>
                      {PROMOTION_TARGET_LABELS[t]}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                onClick={onClose}
                className="rounded-md border border-[var(--chat-button-border,#3f3f46)] px-3 py-1.5 text-sm text-[var(--chat-button-text,#d4d4d8)] hover:bg-[var(--chat-input-bg,#27272a)]"
              >
                キャンセル
              </button>
              <button
                type="button"
                disabled={!characterId}
                onClick={() => setConfirming(true)}
                className="rounded-md bg-indigo-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-indigo-500 disabled:opacity-50"
              >
                次へ
              </button>
            </div>
          </>
        ) : (
          <>
            <h2 className="text-base font-semibold text-[var(--chat-heading-text,#f4f4f5)]">本当に昇格しますか?</h2>
            <p className="mt-2 text-sm text-[var(--chat-muted-text,#a1a1aa)]">
              「{memory.content}」を {selectedName} の「{PROMOTION_TARGET_LABELS[target]}」に追記します。
              昇格した内容はすべてのルーム(世界線)で反映されます。
            </p>
            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setConfirming(false)}
                className="rounded-md border border-[var(--chat-button-border,#3f3f46)] px-3 py-1.5 text-sm text-[var(--chat-button-text,#d4d4d8)] hover:bg-[var(--chat-input-bg,#27272a)]"
              >
                戻る
              </button>
              <button
                type="button"
                disabled={running}
                onClick={handlePromote}
                className="rounded-md bg-indigo-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-indigo-500 disabled:opacity-50"
              >
                {running ? "昇格中…" : "昇格する"}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
