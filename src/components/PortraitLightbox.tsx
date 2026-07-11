// キャラの画像ギャラリー拡大表示ライトボックス(仕様書10.2、機能拡張: ギャラリー方式)
// チャットログの顔アイコンをクリックしたときに開く。
// 表示順は [顔アイコン(iconImage、あれば), ...イメージイラスト(portraitImage→galleryImagesの順)]。
// 最初に表示されるのは常に顔アイコンで、「▶」/「◀」(または←→キー)で他の画像に切り替えられる。
// 画像が1枚しかない場合は矢印を表示しない。
// 背景クリック・×ボタン・Escキーで閉じる。
//
// バグ修正: メッセージリスト内(overflow-y-auto なコンテナ)でそのままレンダリングすると、
// `fixed` が祖先のスタッキングコンテキストの影響を受け、全面モーダルにならずチャットに
// インライン表示されてしまうことがあった。createPortal で document.body 直下に描画することで、
// 常にビューポート全体を覆う独立したレイヤーとして表示されるようにする。
import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import type { Character } from "../types";
import { getCharacterGallery } from "../types";
import { useBlobUrl } from "../lib/useBlobUrl";

interface PortraitLightboxProps {
  character: Character;
  onClose: () => void;
}

export function PortraitLightbox({ character, onClose }: PortraitLightboxProps) {
  // 画像リスト = [顔アイコン(あれば), ...イメージイラスト]
  const images = useMemo(() => {
    const list: Blob[] = [];
    if (character.iconImage) list.push(character.iconImage);
    list.push(...getCharacterGallery(character));
    return list;
  }, [character]);

  const [index, setIndex] = useState(0);

  // キャラが切り替わったら常に先頭(顔アイコン)から表示し直す
  useEffect(() => {
    setIndex(0);
  }, [character.id]);

  const hasMultiple = images.length > 1;
  const currentUrl = useBlobUrl(images[index]);

  const goPrev = () => setIndex((i) => (i - 1 + images.length) % images.length);
  const goNext = () => setIndex((i) => (i + 1) % images.length);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      else if (e.key === "ArrowLeft" && hasMultiple) goPrev();
      else if (e.key === "ArrowRight" && hasMultiple) goNext();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [onClose, hasMultiple, images.length]);

  // モーダル表示中は背面(チャットログ)がスクロールしないようにする
  useEffect(() => {
    const original = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = original;
    };
  }, []);

  // 表示できる画像が1枚も無い場合は何も表示しない
  if (images.length === 0) return null;

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex flex-col items-center justify-center gap-3 bg-black/80 p-4"
      onClick={onClose}
    >
      <button
        type="button"
        onClick={onClose}
        aria-label="閉じる"
        className="absolute right-4 top-4 rounded-full bg-zinc-900/80 px-3 py-1.5 text-lg text-zinc-300 hover:bg-zinc-800 hover:text-zinc-100"
      >
        ×
      </button>

      {hasMultiple && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            goPrev();
          }}
          aria-label="前の画像"
          className="absolute left-1 top-1/2 z-10 -translate-y-1/2 rounded-full bg-zinc-900/70 p-3 text-2xl text-zinc-200 hover:bg-zinc-800 active:bg-zinc-700 sm:left-6"
        >
          ◀
        </button>
      )}

      {currentUrl && (
        <img
          src={currentUrl}
          alt={character.name}
          className="max-h-[75vh] max-w-[90vw] rounded-lg object-contain shadow-2xl"
          onClick={(e) => e.stopPropagation()}
        />
      )}

      {hasMultiple && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            goNext();
          }}
          aria-label="次の画像"
          className="absolute right-1 top-1/2 z-10 -translate-y-1/2 rounded-full bg-zinc-900/70 p-3 text-2xl text-zinc-200 hover:bg-zinc-800 active:bg-zinc-700 sm:right-6"
        >
          ▶
        </button>
      )}

      <div className="flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
        <span className="text-sm font-medium text-zinc-200">{character.name}</span>
        {hasMultiple && (
          <span className="text-xs text-zinc-400">
            {index + 1} / {images.length}
          </span>
        )}
      </div>
    </div>,
    document.body,
  );
}
