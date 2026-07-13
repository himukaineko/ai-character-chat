// 画像トリミングモーダル(仕様書8.2)
// 正方形(アイコン用)・縦長(立ち絵用)の2種のトリミングに対応する。
// react-easy-cropでクロップ範囲を選び、canvasでBlob化して呼び出し元に返す。
import { useCallback, useState } from "react";
import Cropper from "react-easy-crop";
import type { Area, Point } from "react-easy-crop";
import { ICON_MAX_DIMENSION, resizeImageBlob } from "../lib/imageResize";

export type CropAspect = "square" | "portrait";

interface ImageCropModalProps {
  open: boolean;
  /** トリミング対象の元画像(データURLなど)。openがtrueでもnullなら何も表示しない */
  imageSrc: string | null;
  aspect: CropAspect;
  onCancel: () => void;
  onConfirm: (blob: Blob) => void;
}

/** 幅:高さの比率(width / height) */
const ASPECT_RATIO: Record<CropAspect, number> = {
  square: 1,
  portrait: 3 / 4, // 縦長の立ち絵用
};

const ASPECT_LABEL: Record<CropAspect, string> = {
  square: "アイコン用にトリミング(正方形)",
  portrait: "立ち絵用にトリミング(縦長)",
};

export function ImageCropModal({
  open,
  imageSrc,
  aspect,
  onCancel,
  onConfirm,
}: ImageCropModalProps) {
  const [crop, setCrop] = useState<Point>({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [croppedAreaPixels, setCroppedAreaPixels] = useState<Area | null>(null);
  const [processing, setProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleCropComplete = useCallback((_area: Area, areaPixels: Area) => {
    setCroppedAreaPixels(areaPixels);
  }, []);

  if (!open || !imageSrc) return null;

  const handleConfirm = async () => {
    if (!croppedAreaPixels) return;
    setProcessing(true);
    setError(null);
    try {
      const blob = await cropImageToBlob(imageSrc, croppedAreaPixels);
      // 大きな元画像からトリミングした場合でも肥大化しないよう、必要な場合だけ縮小する
      const resized = await resizeImageBlob(blob, ICON_MAX_DIMENSION);
      onConfirm(resized);
      // 次回オープン時に初期状態から始められるようリセットしておく
      setCrop({ x: 0, y: 0 });
      setZoom(1);
      setCroppedAreaPixels(null);
    } catch {
      setError("画像の切り出しに失敗しました。もう一度お試しください。");
    } finally {
      setProcessing(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/70 p-4">
      <div className="flex w-full max-w-md flex-col gap-3 rounded-lg border border-zinc-700 bg-zinc-900 p-4 shadow-xl">
        <h3 className="text-sm font-semibold text-zinc-100">{ASPECT_LABEL[aspect]}</h3>

        <div className="relative h-72 w-full overflow-hidden rounded-md bg-zinc-950">
          <Cropper
            image={imageSrc}
            crop={crop}
            zoom={zoom}
            aspect={ASPECT_RATIO[aspect]}
            cropShape={aspect === "square" ? "round" : "rect"}
            onCropChange={setCrop}
            onZoomChange={setZoom}
            onCropComplete={handleCropComplete}
          />
        </div>

        <div className="flex items-center gap-2">
          <span className="w-12 shrink-0 text-xs text-zinc-400">ズーム</span>
          <input
            type="range"
            min={1}
            max={3}
            step={0.01}
            value={zoom}
            onChange={(e) => setZoom(Number(e.target.value))}
            className="flex-1 accent-indigo-500"
          />
        </div>

        {error && <p className="text-xs text-red-400">{error}</p>}

        <div className="mt-1 flex justify-end gap-2">
          <button
            type="button"
            onClick={onCancel}
            className="rounded-md border border-zinc-700 px-3 py-1.5 text-sm text-zinc-300 hover:bg-zinc-800"
          >
            キャンセル
          </button>
          <button
            type="button"
            disabled={processing || !croppedAreaPixels}
            onClick={handleConfirm}
            className="rounded-md bg-indigo-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-indigo-500 disabled:opacity-50"
          >
            {processing ? "処理中…" : "この範囲で確定"}
          </button>
        </div>
      </div>
    </div>
  );
}

/** 画像URLとトリミング範囲(px)から、canvas経由でBlobを作る */
async function cropImageToBlob(imageSrc: string, area: Area): Promise<Blob> {
  const image = await loadImage(imageSrc);
  const width = Math.max(1, Math.round(area.width));
  const height = Math.max(1, Math.round(area.height));

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("キャンバスの取得に失敗しました");

  ctx.drawImage(image, area.x, area.y, area.width, area.height, 0, 0, width, height);

  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) resolve(blob);
      else reject(new Error("画像の書き出しに失敗しました"));
    }, "image/png");
  });
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("画像の読み込みに失敗しました"));
    img.src = src;
  });
}
