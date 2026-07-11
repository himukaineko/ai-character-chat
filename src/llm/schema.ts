// 会話生成の構造化出力スキーマ(仕様書9.3)
// Gemini SDKのSchema形式(Type enumを使う)で定義する。
import { Type } from "@google/genai";

export const CONVERSATION_SCHEMA = {
  type: Type.OBJECT,
  properties: {
    messages: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          speaker: { type: Type.STRING },
          type: { type: Type.STRING, enum: ["dialogue", "narration"] },
          text: { type: Type.STRING },
          action: { type: Type.STRING },
        },
        required: ["speaker", "type", "text"],
      },
    },
  },
  required: ["messages"],
} as const;
