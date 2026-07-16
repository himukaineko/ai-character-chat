// キャラクター(ライブラリ)のDB操作
import { generateId } from "./id";
import { db } from "../db";
import type { Character } from "../types";

/** 新規作成用の入力(id/createdAt/updatedAtはここで採番する) */
export type CharacterInput = Omit<Character, "id" | "createdAt" | "updatedAt">;

/** キャラクター一覧を取得(更新日時の降順) */
export async function listCharacters(): Promise<Character[]> {
  const all = await db.characters.toArray();
  return all.sort((a, b) => b.updatedAt - a.updatedAt);
}

/** キャラクターを新規作成する */
export async function createCharacter(input: CharacterInput): Promise<Character> {
  const now = Date.now();
  const character: Character = {
    ...input,
    id: generateId(),
    createdAt: now,
    updatedAt: now,
  };
  await db.characters.add(character);
  return character;
}

/** キャラクターを更新する */
export async function updateCharacter(
  id: string,
  patch: Partial<CharacterInput>,
): Promise<void> {
  await db.transaction("rw", [db.characters, db.messages], async () => {
    const current = await db.characters.get(id);
    await db.characters.update(id, { ...patch, updatedAt: Date.now() });

    // 名前変更を検知したら、過去の発言(Message.speaker)も新しい名前に追従させる。
    // speakerは発言時点のキャラ名を文字列でそのまま保持しているため、これをしないと
    // 名前変更後にチャット履歴のアイコンが解決できなくなる(表示が「?」になる)。
    // 既に壊れている過去データの救済は対象外(今後の変更にのみ追従させる)。
    const oldName = current?.name.trim();
    const newName = patch.name?.trim();
    if (oldName && newName && oldName !== newName) {
      // type/speakerはインデックスされていないため全件スキャンになるが、
      // 個人利用規模のログ件数であれば実用上問題にならない。
      await db.messages
        .filter((m) => m.type === "dialogue" && m.speaker === oldName)
        .modify({ speaker: newName });
    }
  });
}

/** 記憶の昇格先(仕様書3.4: 好きなもの / 背景 / 自由記述欄) */
export type PromotionTarget = "likes" | "background" | "freeNotes";

export const PROMOTION_TARGET_LABELS: Record<PromotionTarget, string> = {
  likes: "好きなもの",
  background: "背景",
  freeNotes: "自由記述",
};

/**
 * ルームの記憶をキャラ本体の設定に昇格する(仕様書3.4)。
 * これがルーム→キャラ本体への唯一の経路。必ずユーザーの明示的な操作(確認ダイアログ)を経て呼ぶこと。
 * 自動昇格は絶対にしない。
 */
export async function promoteMemoryToCharacter(
  characterId: string,
  target: PromotionTarget,
  content: string,
): Promise<void> {
  const character = await db.characters.get(characterId);
  if (!character) throw new Error("キャラクターが見つかりません");

  const trimmed = content.trim();
  if (!trimmed) return;

  if (target === "likes") {
    // 重複追加を避ける
    if (!character.likes.includes(trimmed)) {
      await db.characters.update(characterId, {
        likes: [...character.likes, trimmed],
        updatedAt: Date.now(),
      });
    }
    return;
  }

  // background / freeNotes は既存テキストの末尾に追記する
  const current = character[target] ?? "";
  const next = current.trim() ? `${current}\n${trimmed}` : trimmed;
  if (target === "background") {
    await db.characters.update(characterId, { background: next, updatedAt: Date.now() });
  } else {
    await db.characters.update(characterId, { freeNotes: next, updatedAt: Date.now() });
  }
}

/**
 * キャラクターを削除する。
 * 参照しているルームのメンバー一覧・ルーム内状態からも取り除く(トランザクション)。
 * 所属しているワールドの所属キャラ一覧・キャラ同士の関係からも取り除く(機能追加: ワールド機能。
 * ワールド自体は削除しない)。
 * メッセージ・記憶・要約はログとして残す(過去の発言は消さない)。
 */
export async function deleteCharacter(id: string): Promise<void> {
  await db.transaction(
    "rw",
    [db.characters, db.rooms, db.roomCharacterStates, db.worlds],
    async () => {
      await db.characters.delete(id);

      // このキャラをメンバーに含むルームからメンバーIDを除去する
      const affectedRooms = await db.rooms
        .filter((room) => room.memberIds.includes(id))
        .toArray();
      for (const room of affectedRooms) {
        await db.rooms.update(room.id, {
          memberIds: room.memberIds.filter((memberId) => memberId !== id),
          updatedAt: Date.now(),
        });
      }

      // ルーム内キャラ状態も削除する
      const states = await db.roomCharacterStates
        .where("characterId")
        .equals(id)
        .toArray();
      for (const state of states) {
        await db.roomCharacterStates.delete([state.roomId, state.characterId]);
      }

      // このキャラを含むワールドから所属キャラ・関係を取り除く(ワールド自体は消さない)
      const affectedWorlds = await db.worlds
        .filter((world) => world.characterIds.includes(id))
        .toArray();
      for (const world of affectedWorlds) {
        await db.worlds.update(world.id, {
          characterIds: world.characterIds.filter((cid) => cid !== id),
          relations: world.relations.filter(
            (r) => r.characterIdA !== id && r.characterIdB !== id,
          ),
          updatedAt: Date.now(),
        });
      }
    },
  );
}
