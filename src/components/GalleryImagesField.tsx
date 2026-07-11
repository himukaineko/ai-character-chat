// イメージイラスト(複数可)の編集欄。
// アイコンと違いトリミングは行わず、選んだ画像をそのままギャラリーに追加する(自由なサイズ・構図でよい)。
// 表示順の先頭が旧仕様の「立ち絵(portraitImage)」に相当する(呼び出し元でCharacter.portraitImage / galleryImagesに分解する)。
import { useRef } from "react";
import { useBlobUrl } from "../lib/useBlobUrl";

interface GalleryImagesFieldProps {
  label: string;
  images: Blob[];
  onChange: (images: Blob[]) => void;
  /** トリミング前の元画像を選んだ通知(仕様書8.2: 同じ画像からアイコンも作れるようにするため) */
  onRawImageSelected?: (dataUrl: string) => void;
}

function GalleryThumb({ blob, onRemove }: { blob: Blob; onRemove: () => void }) {
  const url = useBlobUrl(blob);
  return (
    <div className="relative h-24 w-24 shrink-0 overflow-hidden rounded-md border border-zinc-700 bg-zinc-800">
      {url && <img src={url} alt="" className="h-full w-full object-cover" />}
      <button
        type="button"
        onClick={onRemove}
        aria-label="この画像を削除"
        className="absolute right-1 top-1 rounded-full bg-black/70 px-1.5 py-0.5 text-xs leading-none text-white hover:bg-black/90"
      >
        ×
      </button>
    </div>
  );
}

export function GalleryImagesField({
  label,
  images,
  onChange,
  onRawImageSelected,
}: GalleryImagesFieldProps) {
  const inputRef = useRef<HTMLInputElement>(null);

  const handleFile = (file: File) => {
    // トリミング不要でそのまま追加する(fileそのものがBlob)
    onChange([...images, file]);

    // 「同じ画像からアイコンも作る」導線用に元画像のdata URLも通知しておく
    if (onRawImageSelected) {
      const reader = new FileReader();
      reader.onload = () => {
        const dataUrl = typeof reader.result === "string" ? reader.result : null;
        if (dataUrl) onRawImageSelected(dataUrl);
      };
      reader.readAsDataURL(file);
    }
  };

  return (
    <div>
      <label className="mb-1 block text-sm font-medium text-zinc-300">{label}</label>
      <div className="flex flex-wrap items-center gap-2">
        {images.map((img, i) => (
          <GalleryThumb
            key={i}
            blob={img}
            onRemove={() => onChange(images.filter((_, idx) => idx !== i))}
          />
        ))}
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
          className="flex h-24 w-24 shrink-0 flex-col items-center justify-center gap-1 rounded-md border border-dashed border-zinc-600 text-xs text-zinc-400 hover:border-indigo-500 hover:text-indigo-300"
        >
          <span className="text-lg leading-none">＋</span>
          <span>画像を追加</span>
        </button>
      </div>
      <p className="mt-1 text-xs text-zinc-500">
        トリミングせずそのまま登録されます。複数枚登録すると、チャットで顔アイコンをタップした際に◀▶で切り替えて見られます。
      </p>
    </div>
  );
}
