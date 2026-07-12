// チャットログの1メッセージ表示(仕様書10.2)
// キャラ発言=左、ユーザー発言=右、narration=中央寄せ細字、topic=区切り線+ラベル。
// メッセージ操作(ここまで戻る/削除/コピー)は「⋯」ボタンから開くメニューで提供する
// (デスクトップはhoverで目立たせ、モバイルはボタン自体を常時タップ可能にすることで長押し相当の操作性を確保する)。
import { useState } from "react";
import type { Character, Message } from "../../types";
import { getCharacterGallery } from "../../types";
import { CharacterAvatar } from "../CharacterAvatar";
import { PortraitLightbox } from "../PortraitLightbox";
import { buildDisplaySegments, type MessageSegment } from "../../lib/messageSegments";
import { copyTextToClipboard } from "../../lib/clipboard";

interface ChatMessageItemProps {
  message: Message;
  character: Character | undefined;
  onRewind: (messageId: string) => void;
  onDelete: (messageId: string) => void;
}

/**
 * 位置保持のブロック表示方式(機能変更: 行動描写ルール):
 * dialogueセグメントは通常表示、actionセグメントは明朝体+落ち着いた色で表示する。
 * 【 】括弧自体は表示しない。actionセグメントの前後で改行し、同じ吹き出しの中で
 * 独立した行になるようにする(セグメントをブロック要素にするだけ)。
 * セリフ内の改行(\n)がそのまま反映されるよう whitespace-pre-wrap を適用する。
 */
function SegmentBlocks({
  segments,
  actionClassName,
}: {
  segments: MessageSegment[];
  actionClassName: string;
}) {
  return (
    <div className="flex flex-col gap-0.5">
      {segments.map((seg, i) =>
        seg.kind === "action" ? (
          <p key={i} className={`whitespace-pre-wrap font-mincho ${actionClassName}`}>
            {seg.text}
          </p>
        ) : (
          <p key={i} className="whitespace-pre-wrap">
            {seg.text}
          </p>
        ),
      )}
    </div>
  );
}

export function ChatMessageItem({ message, character, onRewind, onDelete }: ChatMessageItemProps) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [lightboxOpen, setLightboxOpen] = useState(false);
  // 顔アイコン・イメージイラストのいずれも無いキャラはクリックしても開かない
  const hasPortraitAssets = !!(
    character?.iconImage || (character && getCharacterGallery(character).length > 0)
  );

  const handleCopy = async () => {
    // 失敗しても致命的ではないため結果は見ない(非セキュアコンテキストではフォールバックが動く)
    await copyTextToClipboard(message.text);
    setMenuOpen(false);
  };

  const ActionMenuButton = (
    <div className="relative shrink-0 self-start">
      <button
        type="button"
        onClick={() => setMenuOpen((v) => !v)}
        // モバイルでのタップ領域確保(仕様外の見た目肥大を避けるため、視覚上のサイズは
        // 変えずflexで中央寄せし、実際のヒット領域を44px近くまで広げる)
        className="flex h-11 w-11 items-center justify-center rounded-full text-xs text-[var(--chat-muted-text)] opacity-60 hover:bg-zinc-800/40 hover:text-zinc-100 hover:opacity-100"
        aria-label="メッセージ操作"
      >
        ⋯
      </button>
      {menuOpen && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setMenuOpen(false)} />
          <div className="absolute right-0 top-full z-50 mt-1 w-36 rounded-lg border border-zinc-700 bg-zinc-900 p-1 text-sm shadow-xl">
            <button
              type="button"
              onClick={() => {
                setMenuOpen(false);
                onRewind(message.id);
              }}
              className="block w-full rounded-md px-2 py-1.5 text-left text-zinc-300 hover:bg-zinc-800"
            >
              ここまで戻る
            </button>
            <button
              type="button"
              onClick={handleCopy}
              className="block w-full rounded-md px-2 py-1.5 text-left text-zinc-300 hover:bg-zinc-800"
            >
              コピー
            </button>
            <button
              type="button"
              onClick={() => {
                setMenuOpen(false);
                onDelete(message.id);
              }}
              className="block w-full rounded-md px-2 py-1.5 text-left text-red-400 hover:bg-red-500/10"
            >
              削除
            </button>
          </div>
        </>
      )}
    </div>
  );

  if (message.type === "topic") {
    return (
      <div className="animate-message-in group my-3 flex items-center justify-center gap-2">
        <div className="h-px flex-1 bg-[var(--chat-topic-line)]" />
        <span className="shrink-0 text-xs text-[var(--chat-topic-text)]">場面: {message.text}</span>
        <div className="h-px flex-1 bg-[var(--chat-topic-line)]" />
        {ActionMenuButton}
      </div>
    );
  }

  if (message.type === "narration") {
    return (
      <div className="animate-message-in group my-2 flex items-start justify-center gap-1 px-6 text-center">
        <p className="max-w-lg whitespace-pre-wrap text-[length:var(--chat-font-size,0.875rem)] italic leading-relaxed text-[var(--chat-narration-text)]">
          {message.text}
        </p>
        {ActionMenuButton}
      </div>
    );
  }

  if (message.type === "user") {
    const segments = buildDisplaySegments(message);
    return (
      <div className="animate-message-in group my-2 flex items-start justify-end gap-1">
        {ActionMenuButton}
        <div className="flex max-w-[75%] flex-col items-end">
          {segments.length > 0 && (
            <div className="rounded-2xl rounded-tr-sm bg-[var(--chat-user-bubble-bg)] px-3 py-2 text-[length:var(--chat-font-size,0.875rem)] text-[var(--chat-user-bubble-text)]">
              <SegmentBlocks segments={segments} actionClassName="text-[var(--chat-user-action-text)]" />
            </div>
          )}
        </div>
      </div>
    );
  }

  // dialogue
  const dialogueSegments = buildDisplaySegments(message);
  return (
    <div className="animate-message-in group my-2 flex items-start gap-2">
      {hasPortraitAssets ? (
        <button
          type="button"
          onClick={() => setLightboxOpen(true)}
          className="shrink-0 rounded-full"
          aria-label={`${character?.name ?? ""}の画像を表示`}
        >
          <CharacterAvatar character={character} size={32} />
        </button>
      ) : (
        <CharacterAvatar character={character} size={32} />
      )}
      <div className="flex min-w-0 max-w-[75%] flex-col items-start">
        <span className="mb-0.5 text-xs text-[var(--chat-muted-text)]">{message.speaker}</span>
        {dialogueSegments.length > 0 && (
          <div className="rounded-2xl rounded-tl-sm bg-[var(--chat-char-bubble-bg)] px-3 py-2 text-[length:var(--chat-font-size,0.875rem)] text-[var(--chat-char-bubble-text)]">
            <SegmentBlocks
              segments={dialogueSegments}
              actionClassName="text-[var(--chat-char-action-text)]"
            />
          </div>
        )}
      </div>
      {ActionMenuButton}
      {lightboxOpen && character && (
        <PortraitLightbox character={character} onClose={() => setLightboxOpen(false)} />
      )}
    </div>
  );
}
