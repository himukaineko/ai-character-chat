// ルーム上部バーの参加キャラアイコン列(仕様書10.2)
// 参加=カラー、聞いている=半透明+耳アイコン、不参加=グレーアウト。
// アイコンタップでポップオーバーを出し、参加状態の切替・ルーム内上書きの編集・そのキャラの記憶確認ができる。
import { useState } from "react";
import type { Character, Presence, RoomCharacterState } from "../../types";
import { CharacterAvatar } from "../CharacterAvatar";

export interface MemberBarItem {
  character: Character;
  state: RoomCharacterState;
}

interface MemberBarProps {
  members: MemberBarItem[];
  onChangePresence: (characterId: string, presence: Presence) => void;
  /** ルーム内上書きの編集モーダルを開く */
  onEditOverrides: (characterId: string) => void;
  /** そのキャラの記憶一覧モーダルを開く */
  onShowMemories: (characterId: string) => void;
}

const presenceOptions: { value: Presence; label: string }[] = [
  { value: "active", label: "参加" },
  { value: "listening", label: "聞いている" },
  { value: "absent", label: "不参加" },
];

export function MemberBar({
  members,
  onChangePresence,
  onEditOverrides,
  onShowMemories,
}: MemberBarProps) {
  const [openId, setOpenId] = useState<string | null>(null);

  if (members.length === 0) {
    return <span className="text-xs text-[var(--chat-placeholder-text)]">メンバー未設定</span>;
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      {members.map(({ character, state }) => {
        const isOpen = openId === character.id;
        return (
          <div key={character.id} className="relative shrink-0">
            <button
              type="button"
              onClick={() => setOpenId(isOpen ? null : character.id)}
              // チップの地の色はテーマの入力欄相当(--chat-input-bg)を流用し、上部バーの
              // サーフェス背景から一段沈んだ面として見えるようにする。
              // 参加状態の視覚表現(不参加=グレーアウト+半透明、聞いている=半透明)は
              // opacity/grayscaleフィルターなのでどのテーマでも変わらず機能する。
              // transition-[opacity,filter]に限定(機能拡張の副作用対応): 汎用のtransitionだと
              // background-colorも遷移対象に含まれ、祖先の継承カスタムプロパティ(--chat-input-bg)経由の
              // 変化に対して一部環境で再描画が追従しない(テーマを切り替えてもチップの地の色が
              // 更新されないまま固まる)事象が確認されたため、本来意図していたopacity/grayscaleの
              // フェードだけに遷移対象を絞る。
              className={`flex shrink-0 items-center gap-1.5 rounded-full bg-[var(--chat-input-bg)] py-1 pl-1 pr-2 transition-[opacity,filter] ${
                state.presence === "absent" ? "opacity-40 grayscale" : ""
              } ${state.presence === "listening" ? "opacity-70" : ""}`}
              title={`${character.name}(${presenceOptions.find((p) => p.value === state.presence)?.label ?? ""})`}
            >
              <span className="relative">
                <CharacterAvatar character={character} size={24} />
                {state.presence === "listening" && (
                  <span className="absolute -bottom-1 -right-1 text-[10px] leading-none">👂</span>
                )}
              </span>
              <span className="max-w-[6rem] truncate whitespace-nowrap text-xs text-[var(--chat-button-text)]">
                {character.name}
              </span>
            </button>

            {isOpen && (
              <>
                {/* 背景クリックで閉じる */}
                <div className="fixed inset-0 z-40" onClick={() => setOpenId(null)} />
                <div className="absolute left-0 top-full z-50 mt-1 w-48 rounded-lg border border-zinc-700 bg-zinc-900 p-2 shadow-xl">
                  <p className="px-1 pb-1 text-xs font-medium text-zinc-400">{character.name}の参加状態</p>
                  <div className="flex flex-col">
                    {presenceOptions.map((opt) => (
                      <button
                        key={opt.value}
                        type="button"
                        onClick={() => {
                          onChangePresence(character.id, opt.value);
                          setOpenId(null);
                        }}
                        className={`rounded-md px-2 py-1.5 text-left text-sm ${
                          state.presence === opt.value
                            ? "bg-indigo-500/20 text-indigo-200"
                            : "text-zinc-300 hover:bg-zinc-800"
                        }`}
                      >
                        {opt.label}
                      </button>
                    ))}
                  </div>
                  <div className="mt-1 flex flex-col border-t border-zinc-800 pt-1">
                    <button
                      type="button"
                      onClick={() => {
                        setOpenId(null);
                        onEditOverrides(character.id);
                      }}
                      className="rounded-md px-2 py-1.5 text-left text-sm text-zinc-300 hover:bg-zinc-800"
                    >
                      ルーム内上書きを編集
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setOpenId(null);
                        onShowMemories(character.id);
                      }}
                      className="rounded-md px-2 py-1.5 text-left text-sm text-zinc-300 hover:bg-zinc-800"
                    >
                      記憶を確認
                    </button>
                  </div>
                </div>
              </>
            )}
          </div>
        );
      })}
    </div>
  );
}
