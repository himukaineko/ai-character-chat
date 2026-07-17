// チャットログの1メッセージ表示(仕様書10.2)
// キャラ発言=左、ユーザー発言=右、narration=中央寄せ細字、topic=区切り線+ラベル。
// メッセージ操作(ここまで戻る/削除/コピー)は「⋯」ボタンから開くメニューで提供する
// (デスクトップはhoverで目立たせ、モバイルはボタン自体を常時タップ可能にすることで長押し相当の操作性を確保する)。
import { useState, type CSSProperties } from "react";
import { createPortal } from "react-dom";
import type { Character, Message } from "../../types";
import { getCharacterGallery } from "../../types";
import { CharacterAvatar } from "../CharacterAvatar";
import { PortraitLightbox } from "../PortraitLightbox";
import { calcDropdownStyle } from "../../lib/dropdownPosition";
import { buildDisplaySegments, type MessageSegment } from "../../lib/messageSegments";
import { copyTextToClipboard } from "../../lib/clipboard";

interface ChatMessageItemProps {
  message: Message;
  character: Character | undefined;
  onRewind: (messageId: string) => void;
  onEdit: (messageId: string) => void;
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

export function ChatMessageItem({
  message,
  character,
  onRewind,
  onEdit,
  onDelete,
}: ChatMessageItemProps) {
  const [menuOpen, setMenuOpen] = useState(false);
  // はみ出し修正(モバイル対応): メニューはfixed配置+画面内クランプで表示する
  // (短い発言の「⋯」ボタンは画面左寄りに来るため、右端揃えのままだと左に切れることがある)。
  const [menuStyle, setMenuStyle] = useState<CSSProperties>({});
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

  /**
   * 操作メニューの開閉トグル。
   * ⋯ボタンだけでなく、トピック行のラベルなど「大きなタップ対象」からも
   * 同じメニューを開けるように共通化する(トピック行の⋯は小さく気づかれにくく、
   * 「ここまで戻るがトピックには効かない」と誤解される実例があったため)。
   */
  const toggleMenu = (e: { currentTarget: HTMLElement }) => {
    if (!menuOpen) {
      setMenuStyle(calcDropdownStyle(e.currentTarget, { menuWidth: 144, direction: "down" }));
    }
    setMenuOpen((v) => !v);
  };

  const ActionMenuButton = (
    <div className="relative shrink-0 self-start">
      <button
        type="button"
        onClick={toggleMenu}
        // モバイルでのタップ領域確保(仕様外の見た目肥大を避けるため、視覚上のサイズは
        // 変えずflexで中央寄せし、実際のヒット領域を44px近くまで広げる)
        className="flex h-11 w-11 items-center justify-center rounded-full text-xs text-[var(--chat-muted-text)] opacity-60 hover:bg-[var(--chat-input-bg,#27272a)] hover:text-[var(--chat-heading-text,#f4f4f5)] hover:opacity-100"
        aria-label="メッセージ操作"
      >
        ⋯
      </button>
      {menuOpen &&
        // バグ修正: メニューをこの場でfixed配置するだけだと、祖先要素(例:
        // メッセージ出現アニメーションのtransform)がCSS上の新しい包含ブロックに
        // なっている場合、fixedの基準がビューポートではなくその祖先になってしまい、
        // ログが長いほどボタンから大きく離れた位置にメニューが表示されてしまう
        // (index.cssのアニメーションfill-mode修正が本質的な原因対応だが、将来
        // 他の祖先にtransform/filter等が付いても影響を受けないよう、document.body
        // 直下にポータルで描画し、ビューポート基準の座標計算(calcDropdownStyle)が
        // 常にそのまま通用するようにする)。
        createPortal(
          <>
            <div className="fixed inset-0 z-40" onClick={() => setMenuOpen(false)} />
            {/* テーマ統一(機能修正): 黒固定をやめ、テーマのサーフェス色で表示する */}
            <div
              className="fixed z-50 rounded-lg border border-[var(--chat-button-border,#3f3f46)] bg-[var(--chat-surface,#18181b)] p-1 text-sm shadow-xl"
              style={menuStyle}
            >
              <button
                type="button"
                onClick={() => {
                  setMenuOpen(false);
                  onRewind(message.id);
                }}
                className="block w-full rounded-md px-2 py-1.5 text-left text-[var(--chat-button-text,#d4d4d8)] hover:bg-[var(--chat-input-bg,#27272a)]"
              >
                ここまで戻る
              </button>
              <button
                type="button"
                onClick={() => {
                  setMenuOpen(false);
                  onEdit(message.id);
                }}
                className="block w-full rounded-md px-2 py-1.5 text-left text-[var(--chat-button-text,#d4d4d8)] hover:bg-[var(--chat-input-bg,#27272a)]"
              >
                編集
              </button>
              <button
                type="button"
                onClick={handleCopy}
                className="block w-full rounded-md px-2 py-1.5 text-left text-[var(--chat-button-text,#d4d4d8)] hover:bg-[var(--chat-input-bg,#27272a)]"
              >
                コピー
              </button>
              <button
                type="button"
                onClick={() => {
                  setMenuOpen(false);
                  onDelete(message.id);
                }}
                className="block w-full rounded-md px-2 py-1.5 text-left text-[var(--chat-danger-text,#f87171)] hover:bg-red-500/10"
              >
                削除
              </button>
            </div>
          </>,
          document.body,
        )}
    </div>
  );

  if (message.type === "topic") {
    return (
      <div className="animate-message-in group my-3 flex items-center justify-center gap-2">
        <div className="h-px flex-1 bg-[var(--chat-topic-line)]" />
        {/* 発見性の改善: 右端の小さな⋯は気づかれにくいため、ラベル自体のタップでも
            同じ操作メニュー(ここまで戻る/コピー/削除)を開けるようにする */}
        <button
          type="button"
          onClick={toggleMenu}
          title="タップで操作メニュー(ここまで戻る・コピー・削除)"
          className="shrink-0 rounded-md px-1.5 py-1 text-xs text-[var(--chat-topic-text)] hover:bg-[var(--chat-input-bg,#27272a)]"
        >
          場面: {message.text}
        </button>
        <div className="h-px flex-1 bg-[var(--chat-topic-line)]" />
        {ActionMenuButton}
      </div>
    );
  }

  if (message.type === "narration") {
    return (
      <div className="animate-message-in group my-2 flex items-start justify-center gap-1 px-6">
        <p className="max-w-lg whitespace-pre-wrap text-left text-[length:var(--chat-font-size,0.875rem)] italic leading-relaxed text-[var(--chat-narration-text)]">
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
