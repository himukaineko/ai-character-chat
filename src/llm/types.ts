// LLMクライアントの抽象化(仕様書9.1)
// GeminiClientのみ実装するが、将来OpenAI等を追加する際はこのインターフェースを実装するだけで済む構造にする。

/** 生成された1発言(構造化出力のitem) */
export interface GeneratedMessage {
  speaker: string;
  type: "dialogue" | "narration";
  text: string;
  action?: string;
}

/** 1回の生成で返るバッチ(仕様書9.3のスキーマに対応) */
export interface GeneratedBatch {
  messages: GeneratedMessage[];
}

/** プロンプトビルダーが組み立てる最終プロンプト */
export interface BuiltPrompt {
  /** システム指示(役割・出力形式・禁止事項など、会話内容に依存しない部分) */
  systemInstruction: string;
  /** 会話生成のための本体コンテンツ(世界観〜今回の指示まで) */
  userContent: string;
}

/**
 * APIエラーの種類。
 * 画面側で日本語の原因別メッセージを出し分けるために判別可能な形にする(仕様書10.3 / 13章)。
 */
export type LLMErrorKind =
  | "missingKey" // APIキー未設定
  | "keyInvalid" // APIキーが無効(status 400/401、またはそれに相当するメッセージ)
  | "permissionDenied" // 権限不足・課金未設定など(status 403)
  | "rateLimit" // レート制限
  | "network" // ネットワークエラー
  | "invalidResponse" // 応答の形式が不正(スキーマ違反・空応答など)
  | "unknown"; // その他

/** LLM呼び出しに関するエラー。kindで原因を判別できる。 */
export class LLMError extends Error {
  readonly kind: LLMErrorKind;

  constructor(kind: LLMErrorKind, message: string) {
    super(message);
    this.name = "LLMError";
    this.kind = kind;
  }
}

/** kindに対応する日本語の既定メッセージ */
export const LLM_ERROR_MESSAGES: Record<LLMErrorKind, string> = {
  missingKey: "APIキーが設定されていません。設定画面でGemini APIキーを入力してください。",
  keyInvalid: "APIキーが正しくありません。設定画面でAPIキーを確認してください。",
  permissionDenied:
    "このAPIキーには権限がありません。課金設定済みのAPIキーが必要なモデルを選んでいないか、設定画面で確認してください。",
  rateLimit: "APIのレート制限に達しました。しばらく待ってから再試行してください。",
  network: "ネットワークエラーが発生しました。接続状況を確認してください。",
  invalidResponse: "AIの応答を正しく読み取れませんでした。もう一度お試しください。",
  unknown: "不明なエラーが発生しました。",
};

/** LLMクライアントインターフェース(仕様書9.1) */
export interface LLMClient {
  /** 会話生成: responseSchemaで構造化出力を強制する */
  generateConversation(prompt: BuiltPrompt, schema: object): Promise<GeneratedBatch>;
  /** プレーンテキスト生成(要約・記憶抽出・入力補助・NGワード再生成など汎用) */
  generateText(prompt: string): Promise<string>;
}
