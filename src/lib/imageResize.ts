// 画像アップロード時の自動リサイズ(機能追加)。
// トリミングなしで保存する画像(イメージイラスト・表紙イラスト)や、トリミング後のBlobは
// 元画像がそのままのサイズで保存されるため、大きな画像を扱うとIndexedDBの容量・動作を圧迫する。
// 長辺が指定サイズを超える場合だけcanvasで縮小し、超えない場合は再エンコードせず元のBlobを返す。
export const ICON_MAX_DIMENSION = 1200; // アイコン・立ち絵(トリミング後)
export const ILLUSTRATION_MAX_DIMENSION = 1920; // イメージイラスト・表紙イラスト(トリミングなし)

/**
 * 画像Blobの長辺がmaxDimensionを超える場合のみリサイズしたBlobを返す。
 * 超えない場合は元のBlobをそのまま返す(不要な再エンコード・画質劣化を避けるため)。
 * 出力フォーマットは元のMIMEタイプを維持する(透過が必要なPNGはPNGのまま、JPEG系はJPEGのまま)。
 */
export async function resizeImageBlob(
  file: Blob,
  maxDimension: number,
  quality = 0.85,
): Promise<Blob> {
  const objectUrl = URL.createObjectURL(file);
  try {
    const image = await loadImage(objectUrl);
    const { width, height } = image;
    const longSide = Math.max(width, height);

    // 十分小さい画像はそのまま返す(再エンコードによる無駄な劣化・処理時間を避ける)
    if (longSide <= maxDimension || longSide === 0) {
      return file;
    }

    const scale = maxDimension / longSide;
    const targetWidth = Math.max(1, Math.round(width * scale));
    const targetHeight = Math.max(1, Math.round(height * scale));

    const canvas = document.createElement("canvas");
    canvas.width = targetWidth;
    canvas.height = targetHeight;
    const ctx = canvas.getContext("2d");
    if (!ctx) return file; // 取得に失敗したら元画像のまま諦める(致命的エラーにはしない)

    ctx.drawImage(image, 0, 0, targetWidth, targetHeight);

    const mimeType = file.type || "image/png";
    const resized = await new Promise<Blob | null>((resolve) => {
      canvas.toBlob((blob) => resolve(blob), mimeType, quality);
    });

    return resized ?? file;
  } catch {
    // 読み込み・変換に失敗した場合は元の画像をそのまま保存する(アップロード自体は失敗させない)
    return file;
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("画像の読み込みに失敗しました"));
    img.src = src;
  });
}
