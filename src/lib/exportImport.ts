// 全データのJSONエクスポート/インポート(仕様書11章)
// APIキーは絶対に含めない(13章 禁止事項)
import { generateId } from "./id";
import { db } from "../db";
import type {
  Character,
  Room,
  RoomCharacterState,
  Message,
  Memory,
  Summary,
  UserProfile,
  World,
} from "../types";
import { defaultUserProfile, loadUserProfile, saveUserProfile } from "./settings";

/** Blobフィールドをbase64文字列に変換したキャラクター(エクスポート用) */
type ExportedCharacter = Omit<Character, "iconImage" | "portraitImage" | "galleryImages"> & {
  iconImage?: string;
  portraitImage?: string;
  galleryImages?: string[];
};

/** エクスポートファイルの形式(全データ) */
export interface ExportData {
  formatVersion: 1;
  exportedAt: number;
  characters: ExportedCharacter[];
  rooms: Room[];
  roomCharacterStates: RoomCharacterState[];
  messages: Message[];
  memories: Memory[];
  summaries: Summary[];
  userProfile: UserProfile;
  /**
   * ワールド(世界線グループ、機能追加)。
   * 旧形式ファイル(このフィールドを持たない)のインポートも壊れないよう、
   * 読み込み側は必ず undefined → 空配列として扱うこと。
   */
  worlds?: World[];
  // 注意: apiKey等のAppSettingsはここに含めない
}

/**
 * キャラのみエクスポートファイルの形式。
 * チャット内容・ルーム・記憶・要約・ユーザープロフィールは一切含めない(キャラの共有専用)。
 * formatマーカーで全データ形式(ExportData)と区別する。
 */
export interface CharactersOnlyExportData {
  format: "characters-only";
  version: 1;
  exportedAt: number;
  characters: ExportedCharacter[];
}

/**
 * ワールド単位エクスポートファイルの形式。
 * 所属キャラ・キャラ同士の関係(方向つき情報を含む)を1ファイルにまとめて共有する用途。
 * チャット内容・ルーム・記憶・要約・APIキーは一切含めない。
 * ユーザープロフィールも含めない(共有相手にユーザー個人のペルソナ情報を渡さないため。
 * useCustomUserProfileはfalse、userProfileは空のデフォルト値で書き出す)。
 * formatマーカーで他形式と区別する。
 */
export interface WorldExportData {
  format: "world";
  version: 1;
  exportedAt: number;
  world: World;
  characters: ExportedCharacter[];
}

/** BlobをBase64のdata URLに変換する */
function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
}

/** data URL文字列をBlobに変換する */
async function dataUrlToBlob(dataUrl: string): Promise<Blob> {
  const res = await fetch(dataUrl);
  return res.blob();
}

/** キャラクター配列をエクスポート用(Blob→data URL変換済み)の配列に変換する */
async function serializeCharacters(characters: Character[]): Promise<ExportedCharacter[]> {
  return Promise.all(
    characters.map(async (character) => {
      const { iconImage, portraitImage, galleryImages, ...rest } = character;
      return {
        ...rest,
        iconImage: iconImage ? await blobToDataUrl(iconImage) : undefined,
        portraitImage: portraitImage ? await blobToDataUrl(portraitImage) : undefined,
        galleryImages:
          galleryImages && galleryImages.length > 0
            ? await Promise.all(galleryImages.map((blob) => blobToDataUrl(blob)))
            : undefined,
      };
    }),
  );
}

/** JSONオブジェクトをファイルとしてダウンロードさせる */
function downloadJson(data: unknown, filename: string): void {
  const json = JSON.stringify(data, null, 2);
  const blob = new Blob([json], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

/** 全データをエクスポート用オブジェクトに組み立てる */
export async function buildExportData(): Promise<ExportData> {
  const [characters, rooms, roomCharacterStates, messages, memories, summaries, worlds] =
    await Promise.all([
      db.characters.toArray(),
      db.rooms.toArray(),
      db.roomCharacterStates.toArray(),
      db.messages.toArray(),
      db.memories.toArray(),
      db.summaries.toArray(),
      db.worlds.toArray(),
    ]);

  const exportedCharacters = await serializeCharacters(characters);

  return {
    formatVersion: 1,
    exportedAt: Date.now(),
    characters: exportedCharacters,
    rooms,
    roomCharacterStates,
    messages,
    memories,
    summaries,
    userProfile: loadUserProfile(),
    worlds,
  };
}

/** エクスポートデータをJSONファイルとしてダウンロードさせる */
export async function exportToFile(): Promise<void> {
  const data = await buildExportData();
  const timestamp = new Date(data.exportedAt).toISOString().replace(/[:.]/g, "-");
  downloadJson(data, `ai-character-chat-backup-${timestamp}.json`);
}

/**
 * キャラのみのエクスポート用オブジェクトを組み立てる。
 * characterIdsを渡すとそのキャラだけ、省略すると全キャラを対象にする。
 * チャット内容・ルーム・記憶・要約・ユーザープロフィール・APIキーは一切含めない。
 */
export async function buildCharactersOnlyExportData(
  characterIds?: string[],
): Promise<CharactersOnlyExportData> {
  const all = await db.characters.toArray();
  const targets = characterIds
    ? all.filter((c) => characterIds.includes(c.id))
    : all;

  return {
    format: "characters-only",
    version: 1,
    exportedAt: Date.now(),
    characters: await serializeCharacters(targets),
  };
}

/** 日付部分だけの文字列(YYYY-MM-DD)を返す */
function dateOnly(timestamp: number): string {
  return new Date(timestamp).toISOString().slice(0, 10);
}

/** ファイル名に使えない文字を取り除く(簡易サニタイズ) */
function sanitizeForFilename(name: string): string {
  return name.replace(/[\\/:*?"<>|]/g, "").trim();
}

/**
 * キャラのみをJSONファイルとしてダウンロードさせる。
 * characterIdsを渡すとそのキャラだけをエクスポートする(1体ならファイル名にキャラ名を含める)。
 */
export async function exportCharactersToFile(characterIds?: string[]): Promise<void> {
  const data = await buildCharactersOnlyExportData(characterIds);
  const dateStr = dateOnly(data.exportedAt);
  if (data.characters.length === 1) {
    const name = sanitizeForFilename(data.characters[0].name || "キャラクター");
    downloadJson(data, `character_${name}_${dateStr}.json`);
  } else {
    downloadJson(data, `characters_${dateStr}.json`);
  }
}

/**
 * ワールド(所属キャラ・キャラ同士の関係込み)をエクスポート用オブジェクトに組み立てる。
 * ユーザープロフィールは含めない(useCustomUserProfile=false、userProfileは空のデフォルト値)。
 */
export async function buildWorldExportData(worldId: string): Promise<WorldExportData> {
  const world = await db.worlds.get(worldId);
  if (!world) {
    throw new Error("ワールドが見つかりません");
  }
  const allCharacters = await db.characters.toArray();
  const targets = allCharacters.filter((c) => world.characterIds.includes(c.id));

  return {
    format: "world",
    version: 1,
    exportedAt: Date.now(),
    world: {
      ...world,
      // 共有相手にユーザー個人のペルソナ情報を渡さないため、ワールド専用ユーザー設定は書き出さない
      useCustomUserProfile: false,
      userProfile: defaultUserProfile(),
    },
    characters: await serializeCharacters(targets),
  };
}

/** ワールドをJSONファイルとしてダウンロードさせる(ファイル名にワールド名を含める) */
export async function exportWorldToFile(worldId: string): Promise<void> {
  const data = await buildWorldExportData(worldId);
  const dateStr = dateOnly(data.exportedAt);
  const name = sanitizeForFilename(data.world.name || "ワールド");
  downloadJson(data, `world_${name}_${dateStr}.json`);
}

/** インポートファイルをパースした結果(形式マーカーで判別する) */
export type ParsedImportFile =
  | { kind: "full"; data: ExportData }
  | { kind: "charactersOnly"; data: CharactersOnlyExportData }
  | { kind: "world"; data: WorldExportData };

/**
 * JSON文字列をパースし、全データ形式/キャラのみ形式/ワールド形式のいずれかを判別して返す(最低限の形チェック)。
 * キャラのみ形式は format: "characters-only"、ワールド形式は format: "world" マーカーで判別する。
 */
export function parseImportFile(json: string): ParsedImportFile {
  const parsed = JSON.parse(json) as Record<string, unknown>;
  if (!parsed || typeof parsed !== "object") {
    throw new Error("バックアップファイルの形式が正しくありません");
  }

  if (parsed.format === "characters-only") {
    if (!Array.isArray(parsed.characters)) {
      throw new Error("バックアップファイルの形式が正しくありません");
    }
    return { kind: "charactersOnly", data: parsed as unknown as CharactersOnlyExportData };
  }

  if (parsed.format === "world") {
    if (!parsed.world || typeof parsed.world !== "object" || !Array.isArray(parsed.characters)) {
      throw new Error("バックアップファイルの形式が正しくありません");
    }
    return { kind: "world", data: parsed as unknown as WorldExportData };
  }

  if (!Array.isArray(parsed.characters) || !Array.isArray(parsed.rooms)) {
    throw new Error("バックアップファイルの形式が正しくありません");
  }
  return { kind: "full", data: parsed as unknown as ExportData };
}

export type ImportMode = "replace" | "merge";

/**
 * データをインポートする。
 * mode: "replace" は既存の全データを消してから復元する(呼び出し前に確認ダイアログ必須)。
 * mode: "merge" は既存データを残したまま追加する(IDが重複する場合は新しいIDを採番し直す)。
 */
export async function importFromData(data: ExportData, mode: ImportMode): Promise<void> {
  const characters: Character[] = await Promise.all(
    data.characters.map(async (c) => {
      const { iconImage, portraitImage, galleryImages, ...rest } = c;
      return {
        ...rest,
        iconImage: iconImage ? await dataUrlToBlob(iconImage) : undefined,
        portraitImage: portraitImage ? await dataUrlToBlob(portraitImage) : undefined,
        galleryImages:
          galleryImages && galleryImages.length > 0
            ? await Promise.all(galleryImages.map((s) => dataUrlToBlob(s)))
            : undefined,
      } as Character;
    }),
  );

  // 旧形式ファイル(worldsフィールドなし)にも対応する: undefined → 空配列として扱う
  const importedWorlds = data.worlds ?? [];

  await db.transaction(
    "rw",
    [
      db.characters,
      db.rooms,
      db.roomCharacterStates,
      db.messages,
      db.memories,
      db.summaries,
      db.worlds,
    ],
    async () => {
      if (mode === "replace") {
        await Promise.all([
          db.characters.clear(),
          db.rooms.clear(),
          db.roomCharacterStates.clear(),
          db.messages.clear(),
          db.memories.clear(),
          db.summaries.clear(),
          db.worlds.clear(),
        ]);
        await db.characters.bulkAdd(characters);
        await db.rooms.bulkAdd(data.rooms);
        await db.roomCharacterStates.bulkAdd(data.roomCharacterStates);
        await db.messages.bulkAdd(data.messages);
        await db.memories.bulkAdd(data.memories);
        await db.summaries.bulkAdd(data.summaries);
        if (importedWorlds.length > 0) await db.worlds.bulkAdd(importedWorlds);
      } else {
        // merge: IDの衝突を避けるため、キャラ・ルームのIDを振り直し、関連レコードのIDも付け替える
        const characterIdMap = new Map<string, string>();
        const remappedCharacters = characters.map((c) => {
          const newId = generateId();
          characterIdMap.set(c.id, newId);
          return { ...c, id: newId };
        });

        // ワールドのIDも振り直し、所属キャラ・関係のキャラIDは付け替え後のcharacterIdMapに合わせる
        const worldIdMap = new Map<string, string>();
        const remappedWorlds: World[] = importedWorlds.map((w) => {
          const newId = generateId();
          worldIdMap.set(w.id, newId);
          return {
            ...w,
            id: newId,
            characterIds: w.characterIds.map((cid) => characterIdMap.get(cid) ?? cid),
            relations: w.relations.map((r) => ({
              ...r,
              characterIdA: characterIdMap.get(r.characterIdA) ?? r.characterIdA,
              characterIdB: characterIdMap.get(r.characterIdB) ?? r.characterIdB,
            })),
          };
        });

        const roomIdMap = new Map<string, string>();
        const remappedRooms = data.rooms.map((r) => {
          const newId = generateId();
          roomIdMap.set(r.id, newId);
          return {
            ...r,
            id: newId,
            memberIds: r.memberIds.map((mid) => characterIdMap.get(mid) ?? mid),
            // worldIdは付け替え後のワールドIDに対応させる。対応が見つからなければ未紐づけにする
            worldId: r.worldId ? worldIdMap.get(r.worldId) : undefined,
          };
        });

        const remappedStates = data.roomCharacterStates.map((s) => ({
          ...s,
          roomId: roomIdMap.get(s.roomId) ?? s.roomId,
          characterId: characterIdMap.get(s.characterId) ?? s.characterId,
        }));

        const messageIdMap = new Map<string, string>();
        const remappedMessages = data.messages.map((m) => {
          const newId = generateId();
          messageIdMap.set(m.id, newId);
          return { ...m, id: newId, roomId: roomIdMap.get(m.roomId) ?? m.roomId };
        });

        const remappedMemories = data.memories.map((mem) => ({
          ...mem,
          id: generateId(),
          roomId: roomIdMap.get(mem.roomId) ?? mem.roomId,
          subjectIds: mem.subjectIds.map((sid) => characterIdMap.get(sid) ?? sid),
          sourceMessageIds: mem.sourceMessageIds.map(
            (mid) => messageIdMap.get(mid) ?? mid,
          ),
        }));

        const remappedSummaries = data.summaries.map((s) => ({
          ...s,
          id: generateId(),
          roomId: roomIdMap.get(s.roomId) ?? s.roomId,
          presentCharacterIds: s.presentCharacterIds.map(
            (cid) => characterIdMap.get(cid) ?? cid,
          ),
          coversUpToMessageId:
            messageIdMap.get(s.coversUpToMessageId) ?? s.coversUpToMessageId,
        }));

        await db.characters.bulkAdd(remappedCharacters);
        await db.rooms.bulkAdd(remappedRooms);
        await db.roomCharacterStates.bulkAdd(remappedStates);
        await db.messages.bulkAdd(remappedMessages);
        await db.memories.bulkAdd(remappedMemories);
        await db.summaries.bulkAdd(remappedSummaries);
        if (remappedWorlds.length > 0) await db.worlds.bulkAdd(remappedWorlds);
      }
    },
  );

  // ユーザープロフィールはlocalStorageに反映する(置き換え/追加どちらでも上書きでよい)
  if (data.userProfile) {
    saveUserProfile(data.userProfile);
  }
}

/**
 * キャラのみのバックアップを取り込む。常に「追加」として動作する(置き換えは行わない)。
 * 既存キャラとidが重複する場合は新しいuuidを振り直す。createdAt/updatedAtはインポート時刻に更新する。
 * 戻り値は追加したキャラクター数。
 */
export async function importCharactersOnly(
  data: CharactersOnlyExportData,
): Promise<number> {
  const existingIds = new Set((await db.characters.toArray()).map((c) => c.id));
  const now = Date.now();

  const characters: Character[] = await Promise.all(
    data.characters.map(async (c) => {
      const { iconImage, portraitImage, galleryImages, ...rest } = c;
      const newId = existingIds.has(rest.id) ? generateId() : rest.id;
      existingIds.add(newId);
      return {
        ...rest,
        id: newId,
        createdAt: now,
        updatedAt: now,
        iconImage: iconImage ? await dataUrlToBlob(iconImage) : undefined,
        portraitImage: portraitImage ? await dataUrlToBlob(portraitImage) : undefined,
        galleryImages:
          galleryImages && galleryImages.length > 0
            ? await Promise.all(galleryImages.map((s) => dataUrlToBlob(s)))
            : undefined,
      } as Character;
    }),
  );

  await db.characters.bulkAdd(characters);
  return characters.length;
}

/**
 * ワールド(所属キャラ・キャラ同士の関係込み)を取り込む。常に「追加」として動作する(置き換えは行わない)。
 * キャラのIDが既存と衝突する場合は新しいuuidを振り直し、world.characterIds・relationsの
 * characterIdA/Bも振り直し後のIDに必ず追従させる。ワールドのIDが衝突する場合も同様に振り直す。
 * createdAt/updatedAtはインポート時刻に更新する。
 * ユーザープロフィールは取り込まない(念のため、ここでも空のデフォルト値に強制する)。
 * 戻り値は追加したワールド名と追加したキャラクター数。
 */
export async function importWorld(
  data: WorldExportData,
): Promise<{ worldName: string; characterCount: number }> {
  const existingCharacterIds = new Set((await db.characters.toArray()).map((c) => c.id));
  const existingWorldIds = new Set((await db.worlds.toArray()).map((w) => w.id));
  const now = Date.now();

  // キャラのID衝突を振り直し、旧ID→新IDの対応表を作る(world側の追従に使う)
  const characterIdMap = new Map<string, string>();
  const characters: Character[] = await Promise.all(
    data.characters.map(async (c) => {
      const { iconImage, portraitImage, galleryImages, ...rest } = c;
      const newId = existingCharacterIds.has(rest.id) ? generateId() : rest.id;
      existingCharacterIds.add(newId);
      characterIdMap.set(rest.id, newId);
      return {
        ...rest,
        id: newId,
        createdAt: now,
        updatedAt: now,
        iconImage: iconImage ? await dataUrlToBlob(iconImage) : undefined,
        portraitImage: portraitImage ? await dataUrlToBlob(portraitImage) : undefined,
        galleryImages:
          galleryImages && galleryImages.length > 0
            ? await Promise.all(galleryImages.map((s) => dataUrlToBlob(s)))
            : undefined,
      } as Character;
    }),
  );

  const newWorldId = existingWorldIds.has(data.world.id) ? generateId() : data.world.id;
  const world: World = {
    ...data.world,
    id: newWorldId,
    characterIds: data.world.characterIds.map((cid) => characterIdMap.get(cid) ?? cid),
    relations: data.world.relations.map((r) => ({
      ...r,
      characterIdA: characterIdMap.get(r.characterIdA) ?? r.characterIdA,
      characterIdB: characterIdMap.get(r.characterIdB) ?? r.characterIdB,
    })),
    // 念のため、取り込んだファイルにユーザープロフィールが含まれていても無視する
    useCustomUserProfile: false,
    userProfile: defaultUserProfile(),
    createdAt: now,
    updatedAt: now,
  };

  await db.transaction("rw", [db.characters, db.worlds], async () => {
    if (characters.length > 0) await db.characters.bulkAdd(characters);
    await db.worlds.add(world);
  });

  return { worldName: world.name, characterCount: characters.length };
}
