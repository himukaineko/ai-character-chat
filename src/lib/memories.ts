// 記憶(Memory)・要約(Summary)のDB操作。
// 記憶はすべてルーム単位(roomId必須)であり、ルーム間で共有されることは絶対にない(仕様書3.3)。
// 「戻る」「ログ削除」に連動する disabled化・削除処理も仕様書6.5 / 7章の通りここで実装する。
import { generateId } from "./id";
import { db } from "../db";
import type { Memory, MemoryType, Summary } from "../types";

/** 指定ルームの記憶一覧を取得(作成日時の降順) */
export async function listMemories(roomId: string): Promise<Memory[]> {
  const all = await db.memories.where("roomId").equals(roomId).toArray();
  return all.sort((a, b) => b.createdAt - a.createdAt);
}

/** 新規記憶の入力(id/disabled/pinned/createdAtはここで採番・初期化する) */
export interface MemoryInput {
  roomId: string;
  type: MemoryType;
  subjectIds: string[];
  content: string;
  sourceMessageIds: string[];
}

/** 記憶を1件作成する */
export async function createMemory(input: MemoryInput): Promise<Memory> {
  const memory: Memory = {
    ...input,
    id: generateId(),
    disabled: false,
    pinned: false,
    createdAt: Date.now(),
  };
  await db.memories.add(memory);
  return memory;
}

/** 記憶を更新する(内容編集・固定トグル・有効/無効切替) */
export async function updateMemory(
  id: string,
  patch: Partial<Pick<Memory, "content" | "pinned" | "disabled" | "type">>,
): Promise<void> {
  await db.memories.update(id, patch);
}

/** 記憶を1件物理削除する(呼び出し前に確認ダイアログ必須) */
export async function deleteMemory(id: string): Promise<void> {
  await db.memories.delete(id);
}

/**
 * 要約+抽出記憶+矛盾記憶のdisabled化を1トランザクションでまとめて保存する。
 * 途中で失敗した場合は何も残らない(仕様書13章)。
 */
export async function saveSummaryAndMemories(params: {
  roomId: string;
  /**
   * 要約テキストとその到達点(coversUpToMessageId)。
   * 手動整理(記憶抽出のみ・要約範囲が空)の場合は両方省略でき、その場合は要約を保存しない。
   */
  summaryText?: string;
  coversUpToMessageId?: string;
  presentCharacterIds: string[];
  newMemories: MemoryInput[];
  /** 矛盾により無効化する既存記憶のID(pinnedの記憶は呼び出し側で除外しておくこと) */
  disableMemoryIds: string[];
}): Promise<void> {
  const now = Date.now();
  const summary: Summary | null =
    params.summaryText && params.coversUpToMessageId
      ? {
          id: generateId(),
          roomId: params.roomId,
          coversUpToMessageId: params.coversUpToMessageId,
          presentCharacterIds: params.presentCharacterIds,
          text: params.summaryText,
          createdAt: now,
        }
      : null;
  const memories: Memory[] = params.newMemories.map((m, i) => ({
    ...m,
    id: generateId(),
    disabled: false,
    pinned: false,
    createdAt: now + i,
  }));

  await db.transaction("rw", [db.summaries, db.memories], async () => {
    if (summary) {
      await db.summaries.add(summary);
    }
    if (memories.length > 0) {
      await db.memories.bulkAdd(memories);
    }
    for (const id of params.disableMemoryIds) {
      await db.memories.update(id, { disabled: true });
    }
  });
}

/** 指定ルームの要約一覧を取得(作成日時の昇順=古い順) */
export async function listSummaries(roomId: string): Promise<Summary[]> {
  const all = await db.summaries.where("roomId").equals(roomId).toArray();
  return all.sort((a, b) => a.createdAt - b.createdAt);
}

/**
 * 指定した発言ID群を出どころに持つ記憶をすべて disabled にする(物理削除はしない)。
 * 仕様書6.5「ここまで戻る」で発言が削除されたときの連動処理。
 * db.transaction の中から呼ばれる想定(トランザクションはこの関数の外側で開始する)。
 */
export async function disableMemoriesBySourceMessageIds(
  roomId: string,
  deletedMessageIds: Set<string>,
): Promise<void> {
  if (deletedMessageIds.size === 0) return;
  const memories = await db.memories.where("roomId").equals(roomId).toArray();
  for (const memory of memories) {
    if (memory.disabled) continue;
    const affected = memory.sourceMessageIds.some((id) => deletedMessageIds.has(id));
    if (affected) {
      await db.memories.update(memory.id, { disabled: true });
    }
  }
}

/**
 * 削除された発言を coversUpToMessageId として持つ要約を削除する。
 * 仕様書7.2「ここまで戻る」で削除範囲にかかる要約を削除する処理(再要約は将来対応)。
 */
export async function deleteSummariesCoveringMessageIds(
  roomId: string,
  deletedMessageIds: Set<string>,
): Promise<void> {
  if (deletedMessageIds.size === 0) return;
  const summaries = await db.summaries.where("roomId").equals(roomId).toArray();
  for (const summary of summaries) {
    if (deletedMessageIds.has(summary.coversUpToMessageId)) {
      await db.summaries.delete(summary.id);
    }
  }
}

/** ルーム内の記憶をすべて物理削除する(ルーム完全リセット用) */
export async function deleteAllMemories(roomId: string): Promise<void> {
  await db.memories.where("roomId").equals(roomId).delete();
}

/** ルーム内の要約をすべて物理削除する(ログ+要約削除 / ルーム完全リセット用) */
export async function deleteAllSummaries(roomId: string): Promise<void> {
  await db.summaries.where("roomId").equals(roomId).delete();
}
