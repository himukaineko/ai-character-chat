// ルーム上部バーの参加キャラアイコン列(仕様書10.2)
// 参加=カラー、聞いている=半透明+耳アイコン、不参加=グレーアウト。
// アイコンタップでポップオーバーを出し、参加状態の切替・ルーム内上書きの編集・そのキャラの記憶確認ができる。
import { useState, type CSSProperties } from "react";
import type { Character, Presence, RoomCharacterState } from "../../types";
import { calcDropdownStyle } from "../../lib/dropdownPosition";
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
  // はみ出し修正(モバイル対応): ポップオーバーはfixed配置+画面内クランプで表示する
  // (画面右端近くのチップから開いても画面外に切れないようにする)。
  const [popoverStyle, setPopoverStyle] = useState<CSSProperties>({});

  const togglePopover = (characterId: string, trigger: HTMLElement) => {
    if (openId !== characterId) {
      setPopoverStyle(
        calcDropdownStyle(trigger, { menuWidth: 192, direction: "down", align: "left" }),
      );
      setOpenId(characterId);
    } else {
      setOpenId(null);
    }
  };

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
              onClick={(e) => togglePopover(character.id, e.currentTarget)}
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
                {/* テーマ統一(機能修正): 黒固定をやめ、テーマのサーフェス色で表示する */}
                <div
                  className="fixed z-50 rounded-lg border border-[var(--chat-button-border,#3f3f46)] bg-[var(--chat-surface,#18181b)] p-2 shadow-xl"
                  style={popoverStyle}
                >
                  <p className="px-1 pb-1 text-xs font-medium text-[var(--chat-muted-text,#a1a1aa)]">
                    {character.name}の参加状態
                  </p>
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
                            ? "bg-indigo-500/20 text-[var(--chat-accent-text,#c7d2fe)]"
                            : "text-[var(--chat-button-text,#d4d4d8)] hover:bg-[var(--chat-input-bg,#27272a)]"
                        }`}
                      >
                        {opt.label}
                      </button>
                    ))}
                  </div>
                  <div className="mt-1 flex flex-col border-t border-[var(--chat-border,#27272a)] pt-1">
                    <button
                      type="button"
                      onClick={() => {
                        setOpenId(null);
                        onEditOverrides(character.id);
                      }}
                      className="rounded-md px-2 py-1.5 text-left text-sm text-[var(--chat-button-text,#d4d4d8)] hover:bg-[var(--chat-input-bg,#27272a)]"
                    >
                      ルーム内上書きを編集
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setOpenId(null);
                        onShowMemories(character.id);
                      }}
                      className="rounded-md px-2 py-1.5 text-left text-sm text-[var(--chat-button-text,#d4d4d8)] hover:bg-[var(--chat-input-bg,#27272a)]"
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
