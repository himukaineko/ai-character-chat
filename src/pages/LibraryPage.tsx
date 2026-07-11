// キャラクターライブラリ画面: グリッド一覧、新規作成・編集・削除
// 機能追加: ワールド(世界線グループ)によるフォルダ分けタブ
import { useState } from "react";
import { useAppStore } from "../store";
import type { Character, World } from "../types";
import { CharacterFormModal } from "../components/CharacterFormModal";
import { CharacterAvatar } from "../components/CharacterAvatar";
import { ConfirmDialog } from "../components/ConfirmDialog";
import { WorldFormModal } from "../components/WorldFormModal";
import { GroupAssistModal } from "../components/GroupAssistModal";
import { exportCharactersToFile } from "../lib/exportImport";

export function LibraryPage() {
  const characters = useAppStore((s) => s.characters);
  const worlds = useAppStore((s) => s.worlds);
  const addCharacter = useAppStore((s) => s.addCharacter);
  const editCharacter = useAppStore((s) => s.editCharacter);
  const removeCharacter = useAppStore((s) => s.removeCharacter);
  const addWorld = useAppStore((s) => s.addWorld);
  const editWorld = useAppStore((s) => s.editWorld);
  const removeWorld = useAppStore((s) => s.removeWorld);

  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Character | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Character | null>(null);
  const [exportingId, setExportingId] = useState<string | null>(null);
  const [groupAssistOpen, setGroupAssistOpen] = useState(false);

  // ワールドタブによるフォルダ分け("all"ならすべてのキャラを表示)
  const [selectedWorldId, setSelectedWorldId] = useState<string | "all">("all");
  const [worldFormOpen, setWorldFormOpen] = useState(false);
  const [editingWorld, setEditingWorld] = useState<World | null>(null);
  const [deleteWorldTarget, setDeleteWorldTarget] = useState<World | null>(null);

  const selectedWorld =
    selectedWorldId === "all" ? null : worlds.find((w) => w.id === selectedWorldId) ?? null;
  const visibleCharacters = selectedWorld
    ? characters.filter((c) => selectedWorld.characterIds.includes(c.id))
    : characters;

  const openCreate = () => {
    setEditing(null);
    setFormOpen(true);
  };

  const openEdit = (c: Character) => {
    setEditing(c);
    setFormOpen(true);
  };

  const openCreateWorld = () => {
    setEditingWorld(null);
    setWorldFormOpen(true);
  };

  const openEditWorld = (w: World) => {
    setEditingWorld(w);
    setWorldFormOpen(true);
  };

  const handleExportOne = async (c: Character) => {
    setExportingId(c.id);
    try {
      await exportCharactersToFile([c.id]);
    } finally {
      setExportingId(null);
    }
  };

  return (
    <div className="mx-auto max-w-4xl px-4 py-8">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold text-zinc-100">キャラクターライブラリ</h1>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => setGroupAssistOpen(true)}
            className="rounded-md border border-indigo-500 px-3 py-1.5 text-sm font-medium text-indigo-300 hover:bg-indigo-500/10"
          >
            AIでグループ作成
          </button>
          <button
            type="button"
            onClick={openCreate}
            className="rounded-md bg-indigo-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-indigo-500"
          >
            + 新規キャラクター作成
          </button>
        </div>
      </div>

      {/* ワールド(世界線グループ)によるフォルダ分けタブ */}
      <div className="mt-5 flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => setSelectedWorldId("all")}
          className={`rounded-full border px-3 py-1 text-xs font-medium ${
            selectedWorldId === "all"
              ? "border-indigo-500 bg-indigo-500/10 text-indigo-200"
              : "border-zinc-700 text-zinc-400 hover:border-zinc-500 hover:text-zinc-200"
          }`}
        >
          すべて
        </button>
        {worlds.map((w) => (
          <button
            key={w.id}
            type="button"
            onClick={() => setSelectedWorldId(w.id)}
            className={`max-w-[10rem] truncate rounded-full border px-3 py-1 text-xs font-medium ${
              selectedWorldId === w.id
                ? "border-indigo-500 bg-indigo-500/10 text-indigo-200"
                : "border-zinc-700 text-zinc-400 hover:border-zinc-500 hover:text-zinc-200"
            }`}
            title={w.name || "(名称未設定)"}
          >
            {w.name || "(名称未設定)"}
          </button>
        ))}
        <button
          type="button"
          onClick={openCreateWorld}
          className="rounded-full border border-dashed border-zinc-600 px-3 py-1 text-xs text-zinc-400 hover:border-indigo-500 hover:text-indigo-300"
        >
          + ワールド
        </button>
      </div>

      {selectedWorld && (
        <div className="mt-2 flex flex-wrap items-center gap-3">
          {selectedWorld.description && (
            <p className="max-w-md truncate text-xs text-zinc-500" title={selectedWorld.description}>
              {selectedWorld.description}
            </p>
          )}
          <button
            type="button"
            onClick={() => openEditWorld(selectedWorld)}
            className="text-xs text-indigo-400 hover:underline"
          >
            ワールドを編集
          </button>
          <button
            type="button"
            onClick={() => setDeleteWorldTarget(selectedWorld)}
            className="text-xs text-red-400 hover:underline"
          >
            ワールドを削除
          </button>
        </div>
      )}

      {visibleCharacters.length === 0 ? (
        <div className="mt-16 flex flex-col items-center gap-3 text-center">
          {selectedWorld ? (
            <>
              <p className="text-zinc-400">このワールドにはまだキャラクターがいません</p>
              <button
                type="button"
                onClick={() => openEditWorld(selectedWorld)}
                className="mt-2 rounded-md border border-zinc-700 px-4 py-2 text-sm text-zinc-300 hover:bg-zinc-800"
              >
                ワールドにキャラクターを追加
              </button>
            </>
          ) : (
            <>
              <p className="text-zinc-400">まだキャラクターがいません</p>
              <p className="text-lg font-semibold text-zinc-200">
                最初のキャラクターを作ろう
              </p>
              <button
                type="button"
                onClick={openCreate}
                className="mt-2 rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-500"
              >
                + 新規キャラクター作成
              </button>
            </>
          )}
        </div>
      ) : (
        <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
          {visibleCharacters.map((c) => (
            <div
              key={c.id}
              className="flex flex-col items-center gap-2 rounded-lg border border-zinc-800 bg-zinc-900 p-4"
            >
              <CharacterAvatar character={c} size={64} />
              <p className="w-full truncate text-center text-sm font-medium text-zinc-100">
                {c.name || "(名称未設定)"}
              </p>
              <p className="line-clamp-2 min-h-[2rem] text-center text-xs text-zinc-500">
                {c.personality}
              </p>
              <div className="mt-1 flex w-full flex-col gap-1.5">
                <div className="flex w-full gap-2">
                  <button
                    type="button"
                    onClick={() => openEdit(c)}
                    className="flex-1 rounded-md border border-zinc-700 px-2 py-1 text-xs text-zinc-300 hover:bg-zinc-800"
                  >
                    編集
                  </button>
                  <button
                    type="button"
                    onClick={() => handleExportOne(c)}
                    disabled={exportingId === c.id}
                    title="このキャラだけをファイルに書き出します(チャット内容やルームは含みません)"
                    className="flex-1 rounded-md border border-zinc-700 px-2 py-1 text-xs text-zinc-300 hover:bg-zinc-800 disabled:opacity-50"
                  >
                    {exportingId === c.id ? "書き出し中…" : "エクスポート"}
                  </button>
                </div>
                <button
                  type="button"
                  onClick={() => setDeleteTarget(c)}
                  className="w-full rounded-md border border-zinc-700 px-2 py-1 text-xs text-red-400 hover:bg-red-500/10"
                >
                  削除
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      <CharacterFormModal
        open={formOpen}
        character={editing}
        onClose={() => setFormOpen(false)}
        onSubmit={async (input) => {
          if (editing) {
            await editCharacter(editing.id, input);
          } else {
            await addCharacter(input);
          }
        }}
      />

      <ConfirmDialog
        open={deleteTarget !== null}
        title="キャラクターを削除しますか?"
        message={`「${deleteTarget?.name ?? ""}」を削除します。参加しているルームやワールドからも取り除かれます。この操作は取り消せません。`}
        confirmLabel="削除する"
        onCancel={() => setDeleteTarget(null)}
        onConfirm={async () => {
          if (deleteTarget) {
            await removeCharacter(deleteTarget.id);
          }
          setDeleteTarget(null);
        }}
      />

      <GroupAssistModal
        open={groupAssistOpen}
        onClose={() => setGroupAssistOpen(false)}
        onCreated={(worldId) => {
          setSelectedWorldId(worldId ?? "all");
        }}
      />

      <WorldFormModal
        open={worldFormOpen}
        world={editingWorld}
        characters={characters}
        onClose={() => setWorldFormOpen(false)}
        onSubmit={async (input) => {
          if (editingWorld) {
            await editWorld(editingWorld.id, input);
          } else {
            await addWorld(input);
          }
        }}
      />

      <ConfirmDialog
        open={deleteWorldTarget !== null}
        title="ワールドを削除しますか?"
        message={`「${deleteWorldTarget?.name ?? ""}」を削除します。キャラクター本体は消えません。このワールドに紐づいているルームは紐づけが外れるだけで、会話ログ等はそのまま残ります。この操作は取り消せません。`}
        confirmLabel="削除する"
        onCancel={() => setDeleteWorldTarget(null)}
        onConfirm={async () => {
          if (deleteWorldTarget) {
            await removeWorld(deleteWorldTarget.id);
            if (selectedWorldId === deleteWorldTarget.id) {
              setSelectedWorldId("all");
            }
          }
          setDeleteWorldTarget(null);
        }}
      />
    </div>
  );
}
