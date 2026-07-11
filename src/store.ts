// Zustandによるグローバル状態管理
// キャラ一覧・ルーム一覧・ルーム内キャラ状態一覧をDBからロードして保持する
import { create } from "zustand";
import type { Character, Room, RoomCharacterState, World } from "./types";
import * as characterRepo from "./lib/characters";
import * as roomRepo from "./lib/rooms";
import * as worldRepo from "./lib/worlds";
import type { RoomCharacterOverrides, Presence } from "./types";

interface AppState {
  characters: Character[];
  rooms: Room[];
  roomCharacterStates: RoomCharacterState[];
  worlds: World[];
  /** 初回ロードが完了したか */
  loaded: boolean;

  /** DBから全データを読み直す */
  loadAll: () => Promise<void>;

  /** キャラクターを新規作成してストアに反映する */
  addCharacter: (input: characterRepo.CharacterInput) => Promise<Character>;
  /** キャラクターを更新してストアに反映する */
  editCharacter: (
    id: string,
    patch: Partial<characterRepo.CharacterInput>,
  ) => Promise<void>;
  /** キャラクターを削除してストアに反映する */
  removeCharacter: (id: string) => Promise<void>;

  /** ルームを新規作成してストアに反映する */
  addRoom: (input: roomRepo.RoomInput) => Promise<Room>;
  /** ルームを更新してストアに反映する */
  editRoom: (id: string, patch: Partial<roomRepo.RoomInput>) => Promise<void>;
  /** ルームを削除してストアに反映する */
  removeRoom: (id: string) => Promise<void>;

  /** ワールドを新規作成してストアに反映する */
  addWorld: (input: worldRepo.WorldInput) => Promise<World>;
  /** ワールドを更新してストアに反映する */
  editWorld: (id: string, patch: Partial<worldRepo.WorldInput>) => Promise<void>;
  /** ワールドを削除してストアに反映する */
  removeWorld: (id: string) => Promise<void>;

  /** ルーム内のキャラ参加状態・上書きを更新してストアに反映する(ルーム画面から利用) */
  updateMemberState: (
    roomId: string,
    characterId: string,
    patch: Partial<{ presence: Presence; overrides: RoomCharacterOverrides }>,
  ) => Promise<void>;
}

export const useAppStore = create<AppState>((set, get) => ({
  characters: [],
  rooms: [],
  roomCharacterStates: [],
  worlds: [],
  loaded: false,

  loadAll: async () => {
    const [characters, rooms, roomCharacterStates, worlds] = await Promise.all([
      characterRepo.listCharacters(),
      roomRepo.listRooms(),
      roomRepo.listAllRoomCharacterStates(),
      worldRepo.listWorlds(),
    ]);
    set({ characters, rooms, roomCharacterStates, worlds, loaded: true });
  },

  addCharacter: async (input) => {
    const character = await characterRepo.createCharacter(input);
    await get().loadAll();
    return character;
  },

  editCharacter: async (id, patch) => {
    await characterRepo.updateCharacter(id, patch);
    await get().loadAll();
  },

  removeCharacter: async (id) => {
    await characterRepo.deleteCharacter(id);
    await get().loadAll();
  },

  addRoom: async (input) => {
    const room = await roomRepo.createRoom(input);
    await get().loadAll();
    return room;
  },

  editRoom: async (id, patch) => {
    await roomRepo.updateRoom(id, patch);
    await get().loadAll();
  },

  removeRoom: async (id) => {
    await roomRepo.deleteRoom(id);
    await get().loadAll();
  },

  addWorld: async (input) => {
    const world = await worldRepo.createWorld(input);
    await get().loadAll();
    return world;
  },

  editWorld: async (id, patch) => {
    await worldRepo.updateWorld(id, patch);
    await get().loadAll();
  },

  removeWorld: async (id) => {
    await worldRepo.deleteWorld(id);
    await get().loadAll();
  },

  updateMemberState: async (roomId, characterId, patch) => {
    await roomRepo.updateRoomCharacterState(roomId, characterId, patch);
    await get().loadAll();
  },
}));
