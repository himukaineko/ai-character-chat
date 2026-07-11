// AppSettingsからLLMClientを組み立てるファクトリ。
// モデルIDをハードコードせず、常にAppSettingsの値を使う。
// 将来OpenAI等を追加する場合はここの分岐を増やすだけでよい。
import type { AppSettings } from "../types";
import type { LLMClient } from "./types";
import { GeminiClient } from "./gemini";

/** 会話生成(メインモデル)用のLLMClientを作る */
export function createMainLLMClient(settings: AppSettings): LLMClient {
  return new GeminiClient(settings.apiKey, settings.mainModelId);
}

/** 要約・記憶抽出・入力補助(軽量モデル)用のLLMClientを作る(Phase 3以降で利用) */
export function createLiteLLMClient(settings: AppSettings): LLMClient {
  return new GeminiClient(settings.apiKey, settings.liteModelId);
}
