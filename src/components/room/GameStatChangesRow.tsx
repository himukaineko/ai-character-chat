// チャット内のステータス変動表示行(機能追加: ゲームモード)
// あるバッチ(1回の会話生成)で発生したステータス変動を、そのバッチの最後のメッセージ直後に
// まとめて表示する。新しいMessageは作らず、gameStatChangesテーブルの内容をbatchId対応づけで
// 表示するだけ(Message型・MessageTypeは変更しない)。
import type { GameModeConfig, GameStatChange } from "../../types";

interface GameStatChangesRowProps {
  changes: GameStatChange[];
  gameMode: GameModeConfig;
  /** characterId → 表示名(既に不参加になった/削除されたキャラは "(不明なキャラ)" 扱い) */
  characterNameById: Map<string, string>;
}

export function GameStatChangesRow({ changes, gameMode, characterNameById }: GameStatChangesRowProps) {
  if (changes.length === 0) return null;
  const statNameById = new Map(gameMode.stats.map((s) => [s.id, s.name]));

  return (
    <div className="my-1 flex flex-col items-center gap-1">
      {changes.map((c) => {
        const statName = statNameById.get(c.statId) ?? "(不明なステータス)";
        const characterName = characterNameById.get(c.characterId) ?? "(不明なキャラ)";
        const sign = c.delta > 0 ? "+" : "";
        return (
          <p
            key={c.id}
            className="max-w-[85%] rounded-full bg-[var(--chat-input-bg,#27272a)] px-2.5 py-1 text-center text-[11px] text-[var(--chat-muted-text,#a1a1aa)]"
          >
            📊 {statName}({characterName}) {sign}
            {c.delta} — {c.reason}
          </p>
        );
      })}
    </div>
  );
}
