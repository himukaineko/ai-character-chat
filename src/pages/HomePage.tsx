// ホーム画面: ルーム一覧
// ワールドごとにセクション分けし、最後の発言プレビュー・「続きから」導線を提供する。
import { useEffect, useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { useAppStore } from "../store";
import { RoomFormModal } from "../components/RoomFormModal";
import { CharacterAvatar } from "../components/CharacterAvatar";
import { getRoomSummaries, type RoomSummary } from "../lib/messages";
import { loadLastRoomId, loadUserProfile } from "../lib/settings";
import type { Character, Message, Room, World } from "../types";

function formatUpdatedAt(timestamp: number): string {
  const date = new Date(timestamp);
  return date.toLocaleString("ja-JP", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/** 最後のメッセージを「話者名: テキスト」の1行プレビューに整形する */
function formatPreview(message: Message | null, userDisplayName: string): string {
  if (!message) return "まだ会話がありません";
  if (message.type === "topic") return `話題: ${message.text}`;
  if (message.type === "user") return `${userDisplayName}: ${message.text}`;
  if (message.type === "narration") return `ナレーション: ${message.text}`;
  return `${message.speaker}: ${message.text}`;
}

interface RoomSection {
  worldId: string | null; // nullは「ワールドなし」
  worldName: string;
  rooms: Room[];
  latestUpdatedAt: number;
}

/** ルームをワールドごとのセクションに分け、各セクション内をupdatedAt降順に並べる */
function buildSections(rooms: Room[], worlds: World[]): RoomSection[] {
  const worldsById = new Map(worlds.map((w) => [w.id, w]));
  const buckets = new Map<string, Room[]>();
  for (const room of rooms) {
    const key = room.worldId && worldsById.has(room.worldId) ? room.worldId : "__none__";
    const list = buckets.get(key);
    if (list) list.push(room);
    else buckets.set(key, [room]);
  }

  const sections: RoomSection[] = [];
  for (const [key, roomList] of buckets) {
    const sorted = [...roomList].sort((a, b) => b.updatedAt - a.updatedAt);
    const worldId = key === "__none__" ? null : key;
    sections.push({
      worldId,
      worldName: worldId ? (worldsById.get(worldId)?.name ?? "ワールドなし") : "ワールドなし",
      rooms: sorted,
      latestUpdatedAt: sorted[0]?.updatedAt ?? 0,
    });
  }
  sections.sort((a, b) => b.latestUpdatedAt - a.latestUpdatedAt);
  return sections;
}

function MemberAvatars({
  memberIds,
  charactersById,
  size,
}: {
  memberIds: string[];
  charactersById: Map<string, Character>;
  size: number;
}) {
  if (memberIds.length === 0) {
    return <span className="text-xs text-zinc-500">メンバー未設定</span>;
  }
  return (
    <div className="flex -space-x-2">
      {memberIds.slice(0, 6).map((id) => (
        <CharacterAvatar
          key={id}
          character={charactersById.get(id)}
          size={size}
          className="ring-2 ring-zinc-900"
        />
      ))}
    </div>
  );
}

function RoomCard({
  room,
  charactersById,
  summary,
  userDisplayName,
  onClick,
}: {
  room: Room;
  charactersById: Map<string, Character>;
  summary: RoomSummary | undefined;
  userDisplayName: string;
  onClick: () => void;
}) {
  const preview = formatPreview(summary?.lastMessage ?? null, userDisplayName);
  const count = summary?.count ?? 0;

  return (
    <button
      type="button"
      onClick={onClick}
      className="flex min-w-0 flex-col gap-3 rounded-lg border border-zinc-800 bg-zinc-900 p-4 text-left transition-colors hover:border-zinc-600"
    >
      <h2 className="min-w-0 truncate text-base font-semibold text-zinc-100">
        {room.name || "(名称未設定)"}
      </h2>
      <MemberAvatars memberIds={room.memberIds} charactersById={charactersById} size={28} />
      <p className="min-w-0 truncate text-xs text-zinc-400">{preview}</p>
      <div className="flex items-center justify-between text-xs text-zinc-500">
        <span>更新: {formatUpdatedAt(room.updatedAt)}</span>
        {count > 0 && <span>{count}件</span>}
      </div>
    </button>
  );
}

function ContinueCard({
  room,
  world,
  charactersById,
  summary,
  userDisplayName,
  onClick,
}: {
  room: Room;
  world: World | null;
  charactersById: Map<string, Character>;
  summary: RoomSummary | undefined;
  userDisplayName: string;
  onClick: () => void;
}) {
  const preview = formatPreview(summary?.lastMessage ?? null, userDisplayName);

  return (
    <div>
      <h2 className="mb-2 text-sm font-semibold text-zinc-400">続きから</h2>
      <button
        type="button"
        onClick={onClick}
        className="flex w-full flex-col gap-3 rounded-xl border border-indigo-700/50 bg-gradient-to-br from-indigo-950/40 to-zinc-900 p-5 text-left transition-colors hover:border-indigo-500 sm:flex-row sm:items-center sm:justify-between sm:gap-4"
      >
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="truncate text-lg font-bold text-zinc-100">
              {room.name || "(名称未設定)"}
            </h3>
            {world && (
              <span className="shrink-0 rounded-full bg-indigo-500/20 px-2 py-0.5 text-[11px] font-medium text-indigo-300">
                {world.name}
              </span>
            )}
          </div>
          <p className="mt-2 truncate text-sm text-zinc-400">{preview}</p>
        </div>
        <div className="shrink-0">
          <MemberAvatars memberIds={room.memberIds} charactersById={charactersById} size={36} />
        </div>
      </button>
    </div>
  );
}

export function HomePage() {
  const rooms = useAppStore((s) => s.rooms);
  const characters = useAppStore((s) => s.characters);
  const worlds = useAppStore((s) => s.worlds);
  const addRoom = useAppStore((s) => s.addRoom);
  const loadAll = useAppStore((s) => s.loadAll);
  const [formOpen, setFormOpen] = useState(false);
  const navigate = useNavigate();

  // 会話でルームのupdatedAtがDB側だけ進んでいる場合があるため、
  // ホームを開くたびにストアを読み直して「更新順ソート」を最新化する
  useEffect(() => {
    void loadAll();
  }, [loadAll]);

  const charactersById = new Map(characters.map((c) => [c.id, c]));
  const worldsById = new Map(worlds.map((w) => [w.id, w]));

  const [summaries, setSummaries] = useState<Map<string, RoomSummary>>(new Map());
  // ユーザー表示名・最後に開いたルームIDはlocalStorage/設定に依存するため初回のみ読み込む
  const [userDisplayName] = useState(() => loadUserProfile().name.trim() || "あなた");
  const [lastRoomId] = useState(() => loadLastRoomId());

  useEffect(() => {
    if (rooms.length === 0) {
      setSummaries(new Map());
      return;
    }
    let cancelled = false;
    getRoomSummaries(rooms.map((r) => r.id)).then((result) => {
      if (!cancelled) setSummaries(result);
    });
    return () => {
      cancelled = true;
    };
  }, [rooms]);

  // ルームが2件以上あるときだけ「続きから」を出す(1件しかない場合は冗長)。
  // 記録されたルームが削除済みなら出さない。
  const continueRoom =
    rooms.length > 1 && lastRoomId ? rooms.find((r) => r.id === lastRoomId) ?? null : null;
  const continueWorld = continueRoom?.worldId ? worldsById.get(continueRoom.worldId) ?? null : null;

  const sections = buildSections(rooms, worlds);

  return (
    <div className="mx-auto max-w-3xl px-4 py-8">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold text-zinc-100">ルーム</h1>
        <button
          type="button"
          onClick={() => setFormOpen(true)}
          className="rounded-md bg-indigo-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-indigo-500"
        >
          + 新規ルーム作成
        </button>
      </div>

      {rooms.length === 0 ? (
        <div className="mt-16 flex flex-col items-center gap-3 text-center">
          <p className="text-zinc-400">まだルームがありません</p>
          <p className="text-lg font-semibold text-zinc-200">
            最初のルームを作ろう
          </p>
          {characters.length === 0 ? (
            <p className="max-w-sm text-sm text-zinc-500">
              ルームにはキャラクターが必要です。先に
              <Link to="/library" className="text-indigo-400 hover:underline">
                キャラクターライブラリ
              </Link>
              で最初のキャラクターを作成してください。
            </p>
          ) : (
            <button
              type="button"
              onClick={() => setFormOpen(true)}
              className="mt-2 rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-500"
            >
              + 新規ルーム作成
            </button>
          )}
          <Link
            to="/help"
            className="mt-1 text-xs text-zinc-500 hover:text-indigo-400 hover:underline"
          >
            使い方を見る
          </Link>
        </div>
      ) : (
        <div className="mt-6 flex flex-col gap-8">
          {continueRoom && (
            <ContinueCard
              room={continueRoom}
              world={continueWorld}
              charactersById={charactersById}
              summary={summaries.get(continueRoom.id)}
              userDisplayName={userDisplayName}
              onClick={() => navigate(`/room/${continueRoom.id}`)}
            />
          )}

          {sections.map((section) => (
            <div key={section.worldId ?? "__none__"}>
              {worlds.length > 0 && (
                <h2 className="mb-3 text-sm font-semibold text-zinc-400">
                  {section.worldName} ({section.rooms.length})
                </h2>
              )}
              <div className="grid gap-3 sm:grid-cols-2">
                {section.rooms.map((room) => (
                  <RoomCard
                    key={room.id}
                    room={room}
                    charactersById={charactersById}
                    summary={summaries.get(room.id)}
                    userDisplayName={userDisplayName}
                    onClick={() => navigate(`/room/${room.id}`)}
                  />
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      <RoomFormModal
        open={formOpen}
        room={null}
        characters={characters}
        worlds={worlds}
        onClose={() => setFormOpen(false)}
        onSubmit={async (input) => {
          const room = await addRoom(input);
          navigate(`/room/${room.id}`);
        }}
      />
    </div>
  );
}
