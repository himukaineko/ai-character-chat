// ID(UUID)生成ヘルパー
//
// crypto.randomUUID はセキュアコンテキスト(HTTPS または localhost)でしか使えない。
// スマホ等から http://<PCのIP>:ポート でアクセスすると undefined になり
// 「crypto.randomUUID is not a function」で全ての作成操作が失敗するため、
// どの環境でも動くフォールバック付きのこの関数を必ず経由すること。

/** UUID v4 を生成する(セキュアコンテキストでなくても動く) */
export function generateId(): string {
  if (typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  // フォールバック: crypto.getRandomValues は非セキュアコンテキストでも使える
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  // UUID v4 の規定ビットを立てる(version=4, variant=10xx)
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}
