// ワールド(世界線グループ)のDB操作
import { generateId } from "./id";
import { db } from "../db";
import type { World } from "../types";

/** 新規作成用の入力(id/createdAt/updatedAtはここで採番する) */
export type WorldInput = Omit<World, "id" | "createdAt" | "updatedAt">;

/** ワールド一覧を取得(更新日時の降順) */
export async function listWorlds(): Promise<World[]> {
  const all = await db.worlds.toArray();
  return all.sort((a, b) => b.updatedAt - a.updatedAt);
}

/** ワールドを新規作成する */
export async function createWorld(input: WorldInput): Promise<World> {
  const now = Date.now();
  const world: World = {
    ...input,
    id: generateId(),
    createdAt: now,
    updatedAt: now,
  };
  await db.worlds.add(world);
  return world;
}

/** ワールドを更新する */
export async function updateWorld(
  id: string,
  patch: Partial<WorldInput>,
): Promise<void> {
  await db.worlds.update(id, { ...patch, updatedAt: Date.now() });
}

/**
 * ワールドを削除する。
 * このワールドを参照しているルームは worldId を外すだけにする(ルーム自体・会話ログ・記憶等は無傷)。
 * キャラ本体も一切変更しない。
 */
export async function deleteWorld(id: string): Promise<void> {
  await db.transaction("rw", [db.worlds, db.rooms], async () => {
    await db.worlds.delete(id);

    const affectedRooms = await db.rooms.filter((room) => room.worldId === id).toArray();
    for (const room of affectedRooms) {
      await db.rooms.update(room.id, { worldId: undefined, updatedAt: Date.now() });
    }
  });
}

/**
 * 関係のペアキー(A-BとB-Aを同一視するために順序を正規化したキー)。
 * 重複追加の防止と、既存関係の検索に使う。
 */
export function relationPairKey(characterIdA: string, characterIdB: string): string {
  return [characterIdA, characterIdB].sort().join("::");
}
