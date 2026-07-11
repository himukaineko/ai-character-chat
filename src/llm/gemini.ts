// Gemini API実装(仕様書9.1)
// @google/genai SDKを使い、ブラウザから直接Gemini APIを呼び出す(BYOK方式)。
// APIキーはコンストラクタ引数として受け取るのみで、ここでは一切ログに出さない・保存しない。
import { GoogleGenAI, ApiError } from "@google/genai";
import type { BuiltPrompt, GeneratedBatch, LLMClient } from "./types";
import { LLMError, LLM_ERROR_MESSAGES } from "./types";

export class GeminiClient implements LLMClient {
  private readonly ai: GoogleGenAI;
  private readonly modelId: string;

  constructor(apiKey: string, modelId: string) {
    // 空文字・空白のみのキーはどちらも「未設定」として扱う(空文字を保存しただけのケースも含む)
    if (!apiKey || !apiKey.trim()) {
      throw new LLMError("missingKey", LLM_ERROR_MESSAGES.missingKey);
    }
    if (!modelId) {
      throw new LLMError("unknown", "モデルIDが設定されていません。設定画面で確認してください。");
    }
    this.ai = new GoogleGenAI({ apiKey });
    this.modelId = modelId;
  }

  /** 会話生成: responseSchemaで構造化出力(仕様書9.3)を強制する */
  async generateConversation(prompt: BuiltPrompt, schema: object): Promise<GeneratedBatch> {
    let text: string | undefined;
    try {
      const response = await this.ai.models.generateContent({
        model: this.modelId,
        contents: prompt.userContent,
        config: {
          systemInstruction: prompt.systemInstruction,
          responseMimeType: "application/json",
          // SDKのSchema型はunknownも受け付けるため、9.3のスキーマ定義をそのまま渡す
          responseSchema: schema as never,
        },
      });
      text = response.text;
    } catch (err) {
      throw toLLMError(err);
    }

    if (!text) {
      throw new LLMError("invalidResponse", "AIから空の応答が返されました。もう一度お試しください。");
    }

    try {
      const parsed = JSON.parse(text) as GeneratedBatch;
      if (!parsed || !Array.isArray(parsed.messages)) {
        throw new Error("messages配列がありません");
      }
      return parsed;
    } catch {
      throw new LLMError(
        "invalidResponse",
        "AIの応答をJSONとして解釈できませんでした。もう一度お試しください。",
      );
    }
  }

  /** プレーンテキスト生成(要約・記憶抽出・入力補助・NGワード単発再生成などに汎用利用) */
  async generateText(prompt: string): Promise<string> {
    try {
      const response = await this.ai.models.generateContent({
        model: this.modelId,
        contents: prompt,
      });
      return response.text ?? "";
    } catch (err) {
      throw toLLMError(err);
    }
  }
}

// APIキーが無効・存在しないことを示すメッセージパターン(Geminiのエラー文言に依存するため複数パターンを見る)
const KEY_INVALID_PATTERN = /api key not valid|api_key_invalid|invalid.*api.?key|api key.*invalid/i;

/**
 * SDK/ネットワークの例外を、原因が分かる LLMError に変換する。
 * 注意: APIキーは絶対にログ出力・画面表示しない。生のエラーJSON(err.messageなど)も
 * ユーザー向けメッセージには含めない(何が含まれているか保証できないため)。
 */
function toLLMError(err: unknown): LLMError {
  if (err instanceof LLMError) return err;

  if (err instanceof ApiError) {
    const status = err.status;
    const rawMessage = typeof err.message === "string" ? err.message : "";

    // Geminiは無効なAPIキーをstatus 400で返すことが多い(401ではない)。
    // メッセージに"API key not valid"等が含まれる場合はキー不正として扱う。
    if (status === 400 && KEY_INVALID_PATTERN.test(rawMessage)) {
      return new LLMError("keyInvalid", LLM_ERROR_MESSAGES.keyInvalid);
    }
    if (status === 401) {
      return new LLMError("keyInvalid", LLM_ERROR_MESSAGES.keyInvalid);
    }
    if (status === 403) {
      return new LLMError("permissionDenied", LLM_ERROR_MESSAGES.permissionDenied);
    }
    if (status === 429) {
      return new LLMError("rateLimit", LLM_ERROR_MESSAGES.rateLimit);
    }
    if (status >= 500) {
      return new LLMError(
        "network",
        `Gemini APIサーバー側でエラーが発生しました(コード: ${status})。しばらくしてから再試行してください。`,
      );
    }
    // その他のエラー: 生のレスポンス(JSON)はAPIキー等を含む可能性があるため画面にもコンソールにも出さない
    return new LLMError("unknown", `APIエラーが発生しました(コード: ${status})。`);
  }

  if (typeof err === "object" && err !== null && "message" in err) {
    const message = String((err as { message: unknown }).message);
    if (KEY_INVALID_PATTERN.test(message) || /api key/i.test(message)) {
      return new LLMError("keyInvalid", LLM_ERROR_MESSAGES.keyInvalid);
    }
    if (/permission|unauthorized|forbidden/i.test(message)) {
      return new LLMError("permissionDenied", LLM_ERROR_MESSAGES.permissionDenied);
    }
    if (/network|fetch|failed to fetch|timeout|offline/i.test(message)) {
      return new LLMError("network", LLM_ERROR_MESSAGES.network);
    }
  }

  if (err instanceof TypeError) {
    // fetch自体が失敗した場合(オフライン等)は TypeError になることが多い
    return new LLMError("network", LLM_ERROR_MESSAGES.network);
  }

  return new LLMError("unknown", LLM_ERROR_MESSAGES.unknown);
}
