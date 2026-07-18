// Dexie(IndexedDBラッパー)によるDB層定義
// UserProfile と AppSettings はここでは扱わない(localStorage管理。src/lib/settings.ts 参照)
import Dexie, { type EntityTable, type Table } from "dexie";
import type {
  Character,
  Room,
  RoomCharacterState,
  Message,
  Memory,
  Summary,
  World,
  GameStatChange,
} from "./types";

export class AppDatabase extends Dexie {
  // キャラクター(ライブラリ)
  characters!: EntityTable<Character, "id">;
  // ルーム(世界線)
  rooms!: EntityTable<Room, "id">;
  // ルーム内のキャラ状態([roomId+characterId] を複合主キーとする)
  roomCharacterStates!: Table<RoomCharacterState, [string, string]>;
  // 会話ログ
  messages!: EntityTable<Message, "id">;
  // 長期記憶・関係性記憶
  memories!: EntityTable<Memory, "id">;
  // 会話要約
  summaries!: EntityTable<Summary, "id">;
  // ワールド(世界線グループ、機能追加)
  worlds!: EntityTable<World, "id">;
  // ゲームモードのステータス変動ログ(機能追加)。現在値はここから都度計算する(直接保存しない)
  gameStatChanges!: EntityTable<GameStatChange, "id">;

  constructor() {
    super("ai-character-chat");

    this.version(1).stores({
      characters: "id, name, updatedAt",
      rooms: "id, name, updatedAt",
      // 複合主キー [roomId+characterId]。roomIdだけでも検索できるようインデックスも張る
      roomCharacterStates: "[roomId+characterId], roomId, characterId",
      messages: "id, roomId, batchId, createdAt",
      memories: "id, roomId, disabled, pinned, createdAt",
      summaries: "id, roomId, createdAt",
    });

    // v2: ワールド(世界線グループ)テーブルを追加(機能追加)。既存テーブルの定義は変更しない。
    this.version(2).stores({
      characters: "id, name, updatedAt",
      rooms: "id, name, updatedAt",
      roomCharacterStates: "[roomId+characterId], roomId, characterId",
      messages: "id, roomId, batchId, createdAt",
      memories: "id, roomId, disabled, pinned, createdAt",
      summaries: "id, roomId, createdAt",
      worlds: "id, name, updatedAt",
    });

    // v3: ゲームモードのステータス変動ログ(gameStatChanges)テーブルを追加(機能追加)。
    // 既存テーブルの定義は変更しない。batchIdでMessageの生成バッチと連動させるため
    // roomIdだけでなくbatchIdにもインデックスを張る。
    this.version(3).stores({
      characters: "id, name, updatedAt",
      rooms: "id, name, updatedAt",
      roomCharacterStates: "[roomId+characterId], roomId, characterId",
      messages: "id, roomId, batchId, createdAt",
      memories: "id, roomId, disabled, pinned, createdAt",
      summaries: "id, roomId, createdAt",
      worlds: "id, name, updatedAt",
      gameStatChanges: "id, roomId, batchId",
    });
  }
}

// アプリ全体で共有する単一のDBインスタンス
export const db = new AppDatabase();
