// メッセージ(会話ログ)のDB操作。
// 生成結果の保存・undo・「ここまで戻る」・段階式ログ削除(仕様書7章)をここに集約する。
import { generateId } from "./id";
import { db } from "../db";
import type { Message, MessageType } from "../types";
import type { GeneratedMessage } from "../llm/types";
import {
  deleteAllMemories,
  deleteAllSummaries,
  deleteSummariesCoveringMessageIds,
  disableMemoriesBySourceMessageIds,
} from "./memories";

/** 指定ルームの会話ログを取得(作成日時の昇順) */
export async function listMessages(roomId: string): Promise<Message[]> {
  const all = await db.messages.where("roomId").equals(roomId).toArray();
  return all.sort((a, b) => a.createdAt - b.createdAt);
}

/** ルームごとの「最後のメッセージ」と「発言数」(ホーム画面のプレビュー表示用) */
export interface RoomSummary {
  lastMessage: Message | null;
  count: number;
}

/**
 * 複数ルーム分の最後のメッセージ+発言数をまとめて取得する(ホーム画面用)。
 * messagesのroomIdインデックスを使った一括クエリ1回で完結させる
 * (ルームごとに個別クエリを発行しない)。
 */
export async function getRoomSummaries(roomIds: string[]): Promise<Map<string, RoomSummary>> {
  const result = new Map<string, RoomSummary>();
  if (roomIds.length === 0) return result;

  const all = await db.messages.where("roomId").anyOf(roomIds).toArray();
  const byRoom = new Map<string, Message[]>();
  for (const m of all) {
    const list = byRoom.get(m.roomId);
    if (list) list.push(m);
    else byRoom.set(m.roomId, [m]);
  }

  for (const roomId of roomIds) {
    const list = byRoom.get(roomId);
    if (!list || list.length === 0) {
      result.set(roomId, { lastMessage: null, count: 0 });
      continue;
    }
    list.sort((a, b) => a.createdAt - b.createdAt);
    result.set(roomId, { lastMessage: list[list.length - 1], count: list.length });
  }
  return result;
}

/**
 * ルームの更新日時を現在時刻に進める。
 * メッセージが増えたときに呼ぶことで、ホーム画面の「更新順ソート」が
 * 「会話の新しさ」を反映するようにする(設定編集時はeditRoom側で更新される)。
 */
async function touchRoom(roomId: string): Promise<void> {
  await db.rooms.update(roomId, { updatedAt: Date.now() });
}

/** トピック投入(仕様書5.2)。1件で1バッチ扱いにする。生成はしない(呼び出し側で別途トリガーする)。 */
export async function addTopicMessage(roomId: string, text: string): Promise<Message> {
  const message: Message = {
    id: generateId(),
    roomId,
    batchId: generateId(),
    speaker: "",
    type: "topic",
    text: text.trim(),
    createdAt: Date.now(),
  };
  await db.messages.add(message);
  await touchRoom(roomId);
  return message;
}

/**
 * ユーザー発言(仕様書5.3)。1件で1バッチ扱いにする。
 * 位置保持のインライン方式(機能変更: 行動描写ルール): 【 】(全角)による行動描写は
 * テキストから分離せず、原文のまま text に保存する。表示側でセグメント分割してインライン表示する。
 */
export async function addUserMessage(roomId: string, text: string): Promise<Message> {
  const message: Message = {
    id: generateId(),
    roomId,
    batchId: generateId(),
    speaker: "user",
    type: "user",
    text: text.trim(),
    createdAt: Date.now(),
  };
  await db.messages.add(message);
  await touchRoom(roomId);
  return message;
}

/**
 * AI生成結果をまとめて1つのbatchIdでDB保存する(仕様書9.5 / 13章「トランザクションで書き込む」)。
 * 途中で失敗した場合は何も残らない。
 */
export async function saveGeneratedBatch(
  roomId: string,
  generated: GeneratedMessage[],
): Promise<Message[]> {
  const batchId = generateId();
  const baseTime = Date.now();
  const messages: Message[] = generated.map((g, index) => ({
    id: generateId(),
    roomId,
    batchId,
    // narration発言は speaker を "narration" に統一する(Message.speakerの仕様に合わせる)
    speaker: g.type === "narration" ? "narration" : g.speaker,
    type: g.type as MessageType,
    text: g.text,
    action: g.action && g.action.trim() ? g.action.trim() : undefined,
    // createdAtの前後関係で表示順を保証するため1ms刻みで採番する
    createdAt: baseTime + index,
  }));

  await db.transaction("rw", [db.messages, db.rooms], async () => {
    await db.messages.bulkAdd(messages);
    await db.rooms.update(roomId, { updatedAt: baseTime });
  });

  return messages;
}

/** 直前の生成を取り消す(仕様書7.1): 同一batchIdのメッセージをまとめて削除する */
export async function deleteBatch(roomId: string, batchId: string): Promise<void> {
  await db.transaction("rw", db.messages, async () => {
    await db.messages.where({ roomId, batchId }).delete();
  });
}

/** ルームの最後のbatchIdを取得する(undo・再生成用) */
export async function getLastBatchId(roomId: string): Promise<string | null> {
  const messages = await listMessages(roomId);
  if (messages.length === 0) return null;
  return messages[messages.length - 1].batchId;
}

/**
 * 1件だけメッセージを削除する(メッセージ操作メニューの「削除」)。
 * 出どころに持つ記憶はdisabled化する(仕様書6.5)。
 */
export async function deleteSingleMessage(roomId: string, messageId: string): Promise<void> {
  await db.transaction("rw", [db.messages, db.memories, db.summaries], async () => {
    const deletedIds = new Set([messageId]);
    await db.messages.delete(messageId);
    await disableMemoriesBySourceMessageIds(roomId, deletedIds);
    await deleteSummariesCoveringMessageIds(roomId, deletedIds);
  });
}

/**
 * 「ここまで戻る」(仕様書7.2): 選択した発言以降(選択した発言を含む)をすべて削除する。
 * 削除範囲の発言を出どころに持つ記憶はdisabled化し、削除範囲にかかる要約も削除する。
 */
export async function rewindTo(roomId: string, messageId: string): Promise<void> {
  await db.transaction("rw", [db.messages, db.memories, db.summaries], async () => {
    const all = (await db.messages.where("roomId").equals(roomId).toArray()).sort(
      (a, b) => a.createdAt - b.createdAt,
    );
    const targetIndex = all.findIndex((m) => m.id === messageId);
    if (targetIndex === -1) return;

    const toDelete = all.slice(targetIndex);
    const deletedIds = new Set(toDelete.map((m) => m.id));

    for (const id of deletedIds) {
      await db.messages.delete(id);
    }
    await disableMemoriesBySourceMessageIds(roomId, deletedIds);
    await deleteSummariesCoveringMessageIds(roomId, deletedIds);
  });
}

/** ログ削除(段階1): メッセージのみ削除。記憶・要約・ルーム設定は残す(仕様書7.4) */
export async function deleteLogOnly(roomId: string): Promise<void> {
  await db.transaction("rw", db.messages, async () => {
    await db.messages.where("roomId").equals(roomId).delete();
  });
}

/** ログ削除(段階2): メッセージ+要約を削除。記憶は残す(仕様書7.4) */
export async function deleteLogAndSummary(roomId: string): Promise<void> {
  await db.transaction("rw", [db.messages, db.summaries], async () => {
    await db.messages.where("roomId").equals(roomId).delete();
    await deleteAllSummaries(roomId);
  });
}

/**
 * ルーム完全リセット(段階3): メッセージ・要約・記憶をすべて削除する。
 * キャラ本体・ルーム設定・参加状態(presence/overrides)は無傷のまま残す(仕様書7.4)。
 */
export async function resetRoomConversationData(roomId: string): Promise<void> {
  await db.transaction("rw", [db.messages, db.memories, db.summaries], async () => {
    await db.messages.where("roomId").equals(roomId).delete();
    await deleteAllMemories(roomId);
    await deleteAllSummaries(roomId);
  });
}
