// Gemini API実装(仕様書9.1)
// @google/genai SDKを使い、ブラウザから直接Gemini APIを呼び出す(BYOK方式)。
// APIキーはコンストラクタ引数として受け取るのみで、ここでは一切ログに出さない・保存しない。
import { GoogleGenAI, ApiError, HarmCategory, HarmBlockThreshold } from "@google/genai";
import type { GenerateContentResponse } from "@google/genai";
import type { BuiltPrompt, GeneratedBatch, LLMClient } from "./types";
import { LLMError, LLM_ERROR_MESSAGES } from "./types";

/**
 * セーフティ設定(改善: 過剰ブロック回避)。
 * キャラクター創作アプリの性質上、通常の会話・行動描写・多少際どい表現までもが
 * 安全性フィルタで過剰にブロックされると体験を大きく損なう。そのため4カテゴリすべてを
 * 「高リスクのみブロック」(BLOCK_ONLY_HIGH)に緩めておく。それでもブロックされた場合は
 * generateConversation/generateText側でblockReason・finishReasonを読み取り、
 * 理由付きのメッセージを表示する(空応答の原因が分かるようにする対応とセットで運用する)。
 */
const SAFETY_SETTINGS = [
  { category: HarmCategory.HARM_CATEGORY_HARASSMENT, threshold: HarmBlockThreshold.BLOCK_ONLY_HIGH },
  { category: HarmCategory.HARM_CATEGORY_HATE_SPEECH, threshold: HarmBlockThreshold.BLOCK_ONLY_HIGH },
  {
    category: HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT,
    threshold: HarmBlockThreshold.BLOCK_ONLY_HIGH,
  },
  {
    category: HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT,
    threshold: HarmBlockThreshold.BLOCK_ONLY_HIGH,
  },
];

/**
 * finishReason / blockReason を日本語の分かりやすい説明に変換するマップ。
 * 一覧にないコードはそのままコード表示にフォールバックする(改善: 空応答時の理由表示)。
 */
const FINISH_REASON_LABELS: Record<string, string> = {
  SAFETY: "安全性フィルタ",
  RECITATION: "既存コンテンツとの類似",
  MAX_TOKENS: "長さ上限",
  PROHIBITED_CONTENT: "禁止コンテンツ",
  BLOCKLIST: "禁止用語の使用",
  SPII: "個人情報の可能性",
  LANGUAGE: "非対応の言語",
  OTHER: "その他の理由",
};

function describeBlockCode(code: string | undefined): string {
  if (!code) return "";
  const label = FINISH_REASON_LABELS[code];
  return label ? `${code}=${label}` : code;
}

/**
 * candidatesが空/テキストが空だった場合に、promptFeedback.blockReasonや
 * candidates[0].finishReasonから理由が読み取れれば日本語メッセージにして返す。
 * 理由が読み取れない場合はnullを返し、呼び出し側で従来のメッセージにフォールバックする。
 */
function describeEmptyResponseReason(response: GenerateContentResponse): string | null {
  const blockReason = response.promptFeedback?.blockReason;
  const finishReason = response.candidates?.[0]?.finishReason;
  const code = blockReason ?? finishReason;
  if (!code) return null;
  return `応答がブロックされました(理由: ${describeBlockCode(code)})。表現を変えて再試行するか、内容を調整してください。`;
}

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
    let response: GenerateContentResponse;
    try {
      response = await this.ai.models.generateContent({
        model: this.modelId,
        contents: prompt.userContent,
        config: {
          systemInstruction: prompt.systemInstruction,
          responseMimeType: "application/json",
          // SDKのSchema型はunknownも受け付けるため、9.3のスキーマ定義をそのまま渡す
          responseSchema: schema as never,
          safetySettings: SAFETY_SETTINGS,
        },
      });
      text = response.text;
    } catch (err) {
      throw toLLMError(err);
    }

    if (!text) {
      // 改善: 空応答時はセーフティブロック等の理由が読み取れれば日本語で表示する
      const reason = describeEmptyResponseReason(response);
      throw new LLMError(
        "invalidResponse",
        reason ?? "AIから空の応答が返されました。もう一度お試しください。",
      );
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
        config: {
          safetySettings: SAFETY_SETTINGS,
        },
      });
      if (!response.text) {
        // 改善: こちらも空応答時はブロック理由が分かれば日本語で表示する
        const reason = describeEmptyResponseReason(response);
        if (reason) {
          throw new LLMError("invalidResponse", reason);
        }
      }
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
