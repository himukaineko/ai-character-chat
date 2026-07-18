// ゲームモードのステータス変動ログ(GameStatChange)のDB操作。
//
// 現在値は直接保存せず、「初期値(GameStatDef.initial) + 変動ログのdelta合計」を
// 都度計算する方式にする(min/maxでクランプ)。これにより「元に戻す」「ここまで戻る」で
// 対応する変動ログが削除されれば、数値も自動的に元へ戻る(仕様書参照)。
import { generateId } from "./id";
import { db } from "../db";
import type { GameModeConfig, GameStatChange } from "../types";

/** 指定ルームの変動ログ一覧を取得(作成日時の昇順) */
export async function listStatChanges(roomId: string): Promise<GameStatChange[]> {
  const all = await db.gameStatChanges.where("roomId").equals(roomId).toArray();
  return all.sort((a, b) => a.createdAt - b.createdAt);
}

/**
 * 現在値を計算する純粋関数。
 * characterIds(通常はルームメンバー)×gameMode.statsの各組み合わせについて、
 * 該当する変動ログのdeltaを合計し、初期値に加えたうえでmin/maxにクランプする。
 * changesはこの計算に無関係な(他ルーム・他キャラの)ものが混ざっていてもよい
 * (characterId/statIdで絞り込むため)。
 */
export function computeCurrentStats(
  gameMode: GameModeConfig,
  changes: GameStatChange[],
  characterIds: string[],
): Map<string, Map<string, number>> {
  const result = new Map<string, Map<string, number>>();
  for (const characterId of characterIds) {
    const statValues = new Map<string, number>();
    for (const stat of gameMode.stats) {
      const deltaSum = changes
        .filter((c) => c.characterId === characterId && c.statId === stat.id)
        .reduce((sum, c) => sum + c.delta, 0);
      const clamped = Math.min(stat.max, Math.max(stat.min, stat.initial + deltaSum));
      statValues.set(stat.id, clamped);
    }
    result.set(characterId, statValues);
  }
  return result;
}

/** 変動ログをまとめて追加する(1回の会話生成バッチで複数件出ることがある) */
export async function addStatChanges(
  changes: Omit<GameStatChange, "id" | "createdAt">[],
): Promise<void> {
  if (changes.length === 0) return;
  const baseTime = Date.now();
  const records: GameStatChange[] = changes.map((c, index) => ({
    ...c,
    id: generateId(),
    // createdAtの前後関係を保証するため1ms刻みで採番する(saveGeneratedBatchと同じ方式)
    createdAt: baseTime + index,
  }));
  await db.gameStatChanges.bulkAdd(records);
}

/**
 * 指定バッチID群に属する変動ログを削除する(undo・「ここまで戻る」・再生成連動用)。
 * db.transaction の中から呼ばれる想定(トランザクションはこの関数の外側で開始する)。
 */
export async function deleteStatChangesByBatchIds(
  roomId: string,
  batchIds: Set<string>,
): Promise<void> {
  if (batchIds.size === 0) return;
  await db.gameStatChanges.where("roomId").equals(roomId).and((c) => batchIds.has(c.batchId)).delete();
}

/** ルーム内の変動ログをすべて物理削除する(ログ削除・ルーム完全リセット用) */
export async function deleteAllStatChanges(roomId: string): Promise<void> {
  await db.gameStatChanges.where("roomId").equals(roomId).delete();
}
