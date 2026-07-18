// ルーム(世界線)のDB操作
import { generateId } from "./id";
import { db } from "../db";
import type { Room, RoomCharacterState } from "../types";
import { deleteAllStatChanges } from "./gameStats";

/** 新規作成用の入力(id/createdAt/updatedAtはここで採番する) */
export type RoomInput = Omit<Room, "id" | "createdAt" | "updatedAt">;

/** ルーム一覧を取得(更新日時の降順) */
export async function listRooms(): Promise<Room[]> {
  const all = await db.rooms.toArray();
  return all.sort((a, b) => b.updatedAt - a.updatedAt);
}

/** 指定ルームのキャラ状態一覧を取得 */
export async function listRoomCharacterStates(
  roomId: string,
): Promise<RoomCharacterState[]> {
  return db.roomCharacterStates.where("roomId").equals(roomId).toArray();
}

/** 全ルームのキャラ状態一覧を取得(ストア初期ロード用) */
export async function listAllRoomCharacterStates(): Promise<RoomCharacterState[]> {
  return db.roomCharacterStates.toArray();
}

/**
 * ルームを新規作成する。
 * メンバーに選ばれた各キャラの RoomCharacterState を presence: "active" / overrides 空で作成する。
 */
export async function createRoom(input: RoomInput): Promise<Room> {
  const now = Date.now();
  const room: Room = {
    ...input,
    id: generateId(),
    createdAt: now,
    updatedAt: now,
  };

  await db.transaction("rw", [db.rooms, db.roomCharacterStates], async () => {
    await db.rooms.add(room);
    for (const characterId of room.memberIds) {
      const state: RoomCharacterState = {
        roomId: room.id,
        characterId,
        presence: "active",
        overrides: {},
      };
      await db.roomCharacterStates.add(state);
    }
  });

  return room;
}

/**
 * ルームを更新する。
 * メンバー構成が変わった場合は RoomCharacterState を追従させる
 * (追加されたキャラは presence: "active" で新規作成、外れたキャラの状態は削除)。
 */
export async function updateRoom(
  id: string,
  patch: Partial<RoomInput>,
): Promise<void> {
  await db.transaction("rw", [db.rooms, db.roomCharacterStates], async () => {
    const current = await db.rooms.get(id);
    if (!current) return;

    const nextMemberIds = patch.memberIds ?? current.memberIds;

    await db.rooms.update(id, { ...patch, updatedAt: Date.now() });

    if (patch.memberIds) {
      const existingStates = await db.roomCharacterStates
        .where("roomId")
        .equals(id)
        .toArray();
      const existingIds = new Set(existingStates.map((s) => s.characterId));

      // 新しく追加されたメンバーの状態を作成
      for (const characterId of nextMemberIds) {
        if (!existingIds.has(characterId)) {
          const state: RoomCharacterState = {
            roomId: id,
            characterId,
            presence: "active",
            overrides: {},
          };
          await db.roomCharacterStates.add(state);
        }
      }

      // 外れたメンバーの状態を削除
      const nextIdSet = new Set(nextMemberIds);
      for (const state of existingStates) {
        if (!nextIdSet.has(state.characterId)) {
          await db.roomCharacterStates.delete([state.roomId, state.characterId]);
        }
      }
    }
  });
}

/** ルーム内のキャラ状態を更新する(presence切替・上書き編集用) */
export async function updateRoomCharacterState(
  roomId: string,
  characterId: string,
  patch: Partial<Pick<RoomCharacterState, "presence" | "overrides">>,
): Promise<void> {
  await db.roomCharacterStates.update([roomId, characterId], patch);
}

/**
 * ルームを削除する。
 * ルームに紐づく messages / memories / summaries / roomCharacterStates もすべて削除する(トランザクション)。
 * 機能追加(ゲームモード): gameStatChanges(ステータス変動ログ)もここで削除し、孤立レコードを残さない。
 * キャラ本体は無傷のまま。
 */
export async function deleteRoom(id: string): Promise<void> {
  await db.transaction(
    "rw",
    [db.rooms, db.messages, db.memories, db.summaries, db.roomCharacterStates, db.gameStatChanges],
    async () => {
      await db.rooms.delete(id);
      await db.messages.where("roomId").equals(id).delete();
      await db.memories.where("roomId").equals(id).delete();
      await db.summaries.where("roomId").equals(id).delete();
      await db.roomCharacterStates.where("roomId").equals(id).delete();
      await deleteAllStatChanges(id);
    },
  );
}
