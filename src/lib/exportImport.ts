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
  GameStatChange,
} from "../types";
import { defaultUserProfile, loadUserProfile, saveUserProfile } from "./settings";

/** Blobフィールドをbase64文字列に変換したキャラクター(エクスポート用) */
type ExportedCharacter = Omit<Character, "iconImage" | "portraitImage" | "galleryImages"> & {
  iconImage?: string;
  portraitImage?: string;
  galleryImages?: string[];
};

/**
 * Blobフィールド(表紙イラスト)をbase64文字列に変換したルーム(エクスポート用)。
 * BlobのままJSON.stringifyすると画像が失われるため、キャラクターと同様にdata URLへ直列化する。
 * 旧形式ファイル(coverImageフィールドを持たない)もこの型のまま読める(undefined扱い)。
 */
type ExportedRoom = Omit<Room, "coverImage"> & {
  coverImage?: string;
};

/** エクスポートファイルの形式(全データ) */
export interface ExportData {
  formatVersion: 1;
  exportedAt: number;
  characters: ExportedCharacter[];
  rooms: ExportedRoom[];
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
  /**
   * ゲームモードのステータス変動ログ(機能追加)。
   * 旧形式ファイル(このフィールドを持たない)のインポートも壊れないよう、
   * 読み込み側は必ず undefined → 空配列として扱うこと。
   */
  gameStatChanges?: GameStatChange[];
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

/**
 * ルームエクスポートに埋め込むワールド情報。
 * スタンドアロンのWorldExportDataから format/version(ファイル種別マーカー)を除いた中身で、
 * ワールド本体+所属キャラを1セットにまとめる。buildWorldExportDataと同様にユーザー個人の
 * ペルソナ情報はサニタイズする(useCustomUserProfile=false、userProfileは空のデフォルト値)。
 */
export interface EmbeddedWorld {
  world: World;
  characters: ExportedCharacter[];
}

/**
 * ルーム単位エクスポートファイルの形式。
 * ルーム設定(ゲームモード含む)・参加キャラ・紐づくワールド(あれば)・記憶を常に含み、
 * includesLog=trueのときのみ会話ログ・要約・ゲーム進行の変動ログも含める。
 * 「設定のみ」(includesLog=false)は共有向け(会話内容を渡さない)、
 * 「ログ込み」(includesLog=true)は続きから遊べる用途を想定する。
 * ユーザープロフィールは含めない(ワールドと同様、共有相手に個人のペルソナ情報を渡さないため)。
 * formatマーカーで他形式と区別する。
 */
export interface RoomExportData {
  format: "room";
  version: 1;
  exportedAt: number;
  includesLog: boolean;
  room: ExportedRoom;
  roomCharacterStates: RoomCharacterState[];
  characters: ExportedCharacter[];
  world?: EmbeddedWorld;
  memories: Memory[];
  messages?: Message[];
  summaries?: Summary[];
  gameStatChanges?: GameStatChange[];
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

/** ルーム配列をエクスポート用(表紙イラストのBlob→data URL変換済み)の配列に変換する */
async function serializeRooms(rooms: Room[]): Promise<ExportedRoom[]> {
  return Promise.all(
    rooms.map(async (room) => {
      const { coverImage, ...rest } = room;
      return {
        ...rest,
        coverImage: coverImage ? await blobToDataUrl(coverImage) : undefined,
      };
    }),
  );
}

/**
 * エクスポート用ルーム配列をDB保存用(data URL→Blob復元済み)の配列に変換する。
 * 旧形式ファイル(coverImageなし)はそのまま表紙なしとして復元する(後方互換)。
 */
async function deserializeRooms(rooms: ExportedRoom[]): Promise<Room[]> {
  return Promise.all(
    rooms.map(async (room) => {
      const { coverImage, ...rest } = room;
      return {
        ...rest,
        coverImage: coverImage ? await dataUrlToBlob(coverImage) : undefined,
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
  const [characters, rooms, roomCharacterStates, messages, memories, summaries, worlds, gameStatChanges] =
    await Promise.all([
      db.characters.toArray(),
      db.rooms.toArray(),
      db.roomCharacterStates.toArray(),
      db.messages.toArray(),
      db.memories.toArray(),
      db.summaries.toArray(),
      db.worlds.toArray(),
      db.gameStatChanges.toArray(),
    ]);

  const exportedCharacters = await serializeCharacters(characters);
  // 表紙イラスト(Blob)はJSONに直接入れられないため、data URLに変換してから書き出す
  const exportedRooms = await serializeRooms(rooms);

  return {
    formatVersion: 1,
    exportedAt: Date.now(),
    characters: exportedCharacters,
    rooms: exportedRooms,
    roomCharacterStates,
    messages,
    memories,
    summaries,
    userProfile: loadUserProfile(),
    worlds,
    gameStatChanges,
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

/**
 * ルーム単体エクスポート用オブジェクトを組み立てる。
 * includeLog=falseの場合は会話ログ(messages/summaries/gameStatChanges)を含めない
 * (共有向け。記憶はルームの前提知識として有用なため、ログの有無にかかわらず常に含める)。
 * 紐づくワールドがあれば、buildWorldExportDataと同様にユーザープロフィールをサニタイズして埋め込む。
 */
export async function buildRoomExportData(
  roomId: string,
  includeLog: boolean,
): Promise<RoomExportData> {
  const room = await db.rooms.get(roomId);
  if (!room) {
    throw new Error("ルームが見つかりません");
  }

  const [allCharacters, roomCharacterStates, memories] = await Promise.all([
    db.characters.toArray(),
    db.roomCharacterStates.where("roomId").equals(roomId).toArray(),
    db.memories.where("roomId").equals(roomId).toArray(),
  ]);

  const memberCharacters = allCharacters.filter((c) => room.memberIds.includes(c.id));

  let world: EmbeddedWorld | undefined;
  if (room.worldId) {
    const w = await db.worlds.get(room.worldId);
    if (w) {
      const worldCharacters = allCharacters.filter((c) => w.characterIds.includes(c.id));
      world = {
        // 共有相手にユーザー個人のペルソナ情報を渡さないため、ワールド専用ユーザー設定は書き出さない
        world: { ...w, useCustomUserProfile: false, userProfile: defaultUserProfile() },
        characters: await serializeCharacters(worldCharacters),
      };
    }
  }

  const [serializedRoom] = await serializeRooms([room]);

  const data: RoomExportData = {
    format: "room",
    version: 1,
    exportedAt: Date.now(),
    includesLog: includeLog,
    room: serializedRoom,
    roomCharacterStates,
    characters: await serializeCharacters(memberCharacters),
    world,
    memories,
  };

  if (includeLog) {
    const [messages, summaries, gameStatChanges] = await Promise.all([
      db.messages.where("roomId").equals(roomId).toArray(),
      db.summaries.where("roomId").equals(roomId).toArray(),
      db.gameStatChanges.where("roomId").equals(roomId).toArray(),
    ]);
    data.messages = messages;
    data.summaries = summaries;
    data.gameStatChanges = gameStatChanges;
  }

  return data;
}

/**
 * ルームをJSONファイルとしてダウンロードさせる(ファイル名にルーム名を含める)。
 * includeLog=trueなら「ログ込み(続きから遊べる)」、falseなら「設定のみ(共有向け)」。
 */
export async function exportRoomToFile(roomId: string, includeLog: boolean): Promise<void> {
  const data = await buildRoomExportData(roomId, includeLog);
  const dateStr = dateOnly(data.exportedAt);
  const name = sanitizeForFilename(data.room.name || "ルーム");
  downloadJson(data, `room_${name}_${dateStr}.json`);
}

/** インポートファイルをパースした結果(形式マーカーで判別する) */
export type ParsedImportFile =
  | { kind: "full"; data: ExportData }
  | { kind: "charactersOnly"; data: CharactersOnlyExportData }
  | { kind: "world"; data: WorldExportData }
  | { kind: "room"; data: RoomExportData };

/**
 * JSON文字列をパースし、全データ形式/キャラのみ形式/ワールド形式/ルーム形式のいずれかを
 * 判別して返す(最低限の形チェック)。キャラのみ形式は format: "characters-only"、
 * ワールド形式は format: "world"、ルーム形式は format: "room" マーカーで判別する。
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

  if (parsed.format === "room") {
    if (!parsed.room || typeof parsed.room !== "object" || !Array.isArray(parsed.characters)) {
      throw new Error("バックアップファイルの形式が正しくありません");
    }
    return { kind: "room", data: parsed as unknown as RoomExportData };
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

  // 表紙イラストのdata URLをBlobに復元する(旧形式ファイル=coverImageなしは表紙なしのまま)
  const rooms: Room[] = await deserializeRooms(data.rooms);

  // 旧形式ファイル(worldsフィールドなし)にも対応する: undefined → 空配列として扱う
  const importedWorlds = data.worlds ?? [];
  // 旧形式ファイル(gameStatChangesフィールドなし)にも対応する: undefined → 空配列として扱う
  const importedGameStatChanges = data.gameStatChanges ?? [];

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
      db.gameStatChanges,
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
          db.gameStatChanges.clear(),
        ]);
        await db.characters.bulkAdd(characters);
        await db.rooms.bulkAdd(rooms);
        await db.roomCharacterStates.bulkAdd(data.roomCharacterStates);
        await db.messages.bulkAdd(data.messages);
        await db.memories.bulkAdd(data.memories);
        await db.summaries.bulkAdd(data.summaries);
        if (importedWorlds.length > 0) await db.worlds.bulkAdd(importedWorlds);
        if (importedGameStatChanges.length > 0) {
          await db.gameStatChanges.bulkAdd(importedGameStatChanges);
        }
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
        const remappedRooms = rooms.map((r) => {
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

        // 変動ログ: roomId/characterIdは付け替え後のIDに追従させる。
        // statIdはRoom.gameMode内のGameStatDefを参照しており、gameModeはRoomオブジェクトの
        // 一部としてそのまま運ばれるため再マッピング不要。batchIdはメッセージ側と同様、
        // 付け替えずそのまま(グルーピング用の値であり、新しいroomIdの下で完結するため)。
        const remappedGameStatChanges = importedGameStatChanges.map((c) => ({
          ...c,
          id: generateId(),
          roomId: roomIdMap.get(c.roomId) ?? c.roomId,
          characterId: characterIdMap.get(c.characterId) ?? c.characterId,
        }));

        await db.characters.bulkAdd(remappedCharacters);
        await db.rooms.bulkAdd(remappedRooms);
        await db.roomCharacterStates.bulkAdd(remappedStates);
        await db.messages.bulkAdd(remappedMessages);
        await db.memories.bulkAdd(remappedMemories);
        await db.summaries.bulkAdd(remappedSummaries);
        if (remappedWorlds.length > 0) await db.worlds.bulkAdd(remappedWorlds);
        if (remappedGameStatChanges.length > 0) {
          await db.gameStatChanges.bulkAdd(remappedGameStatChanges);
        }
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

/**
 * ルーム単体のバックアップを取り込む。常に「追加」として動作する(置き換えは行わない。既存データは消さない)。
 * ルーム・メッセージ・記憶・要約・参加状態・変動ログはすべて新しいIDを採番して追加し、
 * 参照(roomId、メッセージID→記憶のsourceMessageIds、gameStatChangesのcharacterId等)を
 * 一貫して張り替える。
 * キャラの重複扱いはimportWorldと同じ方針(既存キャラとIDが衝突しなければ元IDを維持したまま追加、
 * 衝突する場合のみ新しいIDを振り直す。いずれの場合も必ず新規レコードとして追加される)。
 * ルーム参加キャラと埋め込みワールド所属キャラで元IDが重複する場合は1体として扱う(二重追加防止)。
 * ワールドが含まれていればimportWorldと同じ方針で取り込み、新ルームのworldIdをその新IDに差し替える。
 * 含まれていなければworldIdはundefinedにする。
 * すべてトランザクションで実行し、途中失敗で中途半端なデータが残らないようにする。
 * 戻り値はルーム名・追加したキャラ数・ログを含んだかどうか。
 */
export async function importRoom(
  data: RoomExportData,
): Promise<{ roomName: string; characterCount: number; hasLog: boolean }> {
  const now = Date.now();

  // ルーム参加キャラ・埋め込みワールド所属キャラをまとめ、元IDで重複排除する
  // (同じキャラがルームメンバーかつワールド所属の場合、二重に追加しないため)
  const charSourceMap = new Map<string, ExportedCharacter>();
  for (const c of data.characters) charSourceMap.set(c.id, c);
  if (data.world) {
    for (const c of data.world.characters) {
      if (!charSourceMap.has(c.id)) charSourceMap.set(c.id, c);
    }
  }

  // キャラ取り込み: importWorldと同じ方針(既存IDと衝突しなければ元IDを維持、衝突すれば振り直す)
  const existingCharacterIds = new Set((await db.characters.toArray()).map((c) => c.id));
  const characterIdMap = new Map<string, string>();
  const characters: Character[] = await Promise.all(
    Array.from(charSourceMap.values()).map(async (c) => {
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

  // ワールド取り込み(あれば): importWorldと同じ方針でID振り直し、キャラID付け替えに追従させる
  let world: World | undefined;
  if (data.world) {
    const existingWorldIds = new Set((await db.worlds.toArray()).map((w) => w.id));
    const w = data.world.world;
    const newWorldId = existingWorldIds.has(w.id) ? generateId() : w.id;
    world = {
      ...w,
      id: newWorldId,
      characterIds: w.characterIds.map((cid) => characterIdMap.get(cid) ?? cid),
      relations: w.relations.map((r) => ({
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
  }

  // ルーム本体: 表紙イラストをBlobに復元し、新しいIDを採番。worldIdは取り込んだワールドの新IDに差し替える
  // (ワールドが含まれない場合はundefined)。gameMode(ステータス定義・展開ルール)はRoomの一部として
  // そのまま運ばれる(statIdの再マッピングは不要)。
  const { coverImage, ...roomRest } = data.room;
  const newRoomId = generateId();
  const room: Room = {
    ...roomRest,
    id: newRoomId,
    memberIds: roomRest.memberIds.map((mid) => characterIdMap.get(mid) ?? mid),
    worldId: world ? world.id : undefined,
    coverImage: coverImage ? await dataUrlToBlob(coverImage) : undefined,
    createdAt: now,
    updatedAt: now,
  };

  // 参加状態(presence/overrides)
  const roomCharacterStates: RoomCharacterState[] = data.roomCharacterStates.map((s) => ({
    ...s,
    roomId: newRoomId,
    characterId: characterIdMap.get(s.characterId) ?? s.characterId,
  }));

  // ログ(あれば): メッセージIDを新規採番し、記憶・要約の参照を追従させる。
  // batchIdは全体バックアップのmerge実装と同様、付け替えない(新しいroomIdの下で完結するグルーピング値のため)。
  const messageIdMap = new Map<string, string>();
  const messages: Message[] = (data.messages ?? []).map((m) => {
    const newId = generateId();
    messageIdMap.set(m.id, newId);
    return { ...m, id: newId, roomId: newRoomId };
  });

  // 記憶: ログあり/なしどちらでも含める。sourceMessageIdsはmessageIdMapに無ければ
  // (=ログを含まないインポート)元のIDのまま残す(既存メッセージと衝突しない孤立参照になるだけで実害はない)
  const memories: Memory[] = data.memories.map((mem) => ({
    ...mem,
    id: generateId(),
    roomId: newRoomId,
    subjectIds: mem.subjectIds.map((sid) => characterIdMap.get(sid) ?? sid),
    sourceMessageIds: mem.sourceMessageIds.map((mid) => messageIdMap.get(mid) ?? mid),
  }));

  const summaries: Summary[] = (data.summaries ?? []).map((s) => ({
    ...s,
    id: generateId(),
    roomId: newRoomId,
    presentCharacterIds: s.presentCharacterIds.map((cid) => characterIdMap.get(cid) ?? cid),
    coversUpToMessageId: messageIdMap.get(s.coversUpToMessageId) ?? s.coversUpToMessageId,
  }));

  // 変動ログ: statIdはroom.gameMode内のGameStatDefをそのまま参照するため再マッピング不要
  const gameStatChanges: GameStatChange[] = (data.gameStatChanges ?? []).map((c) => ({
    ...c,
    id: generateId(),
    roomId: newRoomId,
    characterId: characterIdMap.get(c.characterId) ?? c.characterId,
  }));

  await db.transaction(
    "rw",
    [
      db.characters,
      db.worlds,
      db.rooms,
      db.roomCharacterStates,
      db.messages,
      db.memories,
      db.summaries,
      db.gameStatChanges,
    ],
    async () => {
      if (characters.length > 0) await db.characters.bulkAdd(characters);
      if (world) await db.worlds.add(world);
      await db.rooms.add(room);
      if (roomCharacterStates.length > 0) {
        await db.roomCharacterStates.bulkAdd(roomCharacterStates);
      }
      if (messages.length > 0) await db.messages.bulkAdd(messages);
      if (memories.length > 0) await db.memories.bulkAdd(memories);
      if (summaries.length > 0) await db.summaries.bulkAdd(summaries);
      if (gameStatChanges.length > 0) await db.gameStatChanges.bulkAdd(gameStatChanges);
    },
  );

  return { roomName: room.name, characterCount: characters.length, hasLog: messages.length > 0 };
}
