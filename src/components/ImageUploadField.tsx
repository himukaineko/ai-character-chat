// 画像アップロード欄(選択→トリミングモーダル→Blobとして保持→プレビュー表示、仕様書8.2)
import { useRef, useState } from "react";
import { useBlobUrl } from "../lib/useBlobUrl";
import { ImageCropModal, type CropAspect } from "./ImageCropModal";

interface ImageUploadFieldProps {
  label: string;
  image: Blob | undefined;
  onChange: (blob: Blob | undefined) => void;
  aspect?: CropAspect;
  /** トリミング前の元画像を選んだ通知(仕様書8.2: 1枚の画像からアイコンと立ち絵の両方を作れるようにするため) */
  onRawImageSelected?: (dataUrl: string) => void;
}

export function ImageUploadField({
  label,
  image,
  onChange,
  aspect = "square",
  onRawImageSelected,
}: ImageUploadFieldProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const url = useBlobUrl(image);
  const [pendingSrc, setPendingSrc] = useState<string | null>(null);

  const shapeClass = aspect === "square" ? "h-24 w-24 rounded-full" : "h-40 w-28 rounded-md";

  const handleFile = (file: File) => {
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = typeof reader.result === "string" ? reader.result : null;
      if (!dataUrl) return;
      setPendingSrc(dataUrl);
      onRawImageSelected?.(dataUrl);
    };
    reader.readAsDataURL(file);
  };

  return (
    <div>
      <label className="mb-1 block text-sm font-medium text-zinc-300">{label}</label>
      <div className="flex items-center gap-3">
        <div
          className={`flex shrink-0 items-center justify-center overflow-hidden border border-zinc-700 bg-zinc-800 text-xs text-zinc-500 ${shapeClass}`}
        >
          {url ? (
            <img src={url} alt={label} className="h-full w-full object-cover" />
          ) : (
            <span>未設定</span>
          )}
        </div>
        <div className="flex flex-col gap-2">
          <input
            ref={inputRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) handleFile(file);
              e.target.value = "";
            }}
          />
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            className="rounded-md border border-zinc-700 px-3 py-1.5 text-xs text-zinc-300 hover:bg-zinc-800"
          >
            画像を選ぶ
          </button>
          {image && (
            <button
              type="button"
              onClick={() => onChange(undefined)}
              className="rounded-md border border-zinc-700 px-3 py-1.5 text-xs text-zinc-400 hover:bg-zinc-800"
            >
              削除
            </button>
          )}
        </div>
      </div>

      <ImageCropModal
        open={pendingSrc !== null}
        imageSrc={pendingSrc}
        aspect={aspect}
        onCancel={() => setPendingSrc(null)}
        onConfirm={(blob) => {
          onChange(blob);
          setPendingSrc(null);
        }}
      />
    </div>
  );
}
