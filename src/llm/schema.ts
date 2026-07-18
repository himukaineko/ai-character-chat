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

/**
 * ゲームモードON時に追加する statChanges 配列のスキーマ片(機能追加)。
 * 「変動なしが普通」であることを前提にオプショナル配列として定義する。
 * character/statはAI出力の文字列名で、conversationService側でキャラID/ステータスIDに解決する。
 */
const GAME_STAT_CHANGES_PROPERTY = {
  statChanges: {
    type: Type.ARRAY,
    items: {
      type: Type.OBJECT,
      properties: {
        character: { type: Type.STRING },
        stat: { type: Type.STRING },
        delta: { type: Type.NUMBER },
        reason: { type: Type.STRING },
      },
      required: ["character", "stat", "delta", "reason"],
    },
  },
} as const;

/**
 * 会話生成スキーマを組み立てる(機能追加: ゲームモード)。
 * gameModeEnabled が true のときだけ statChanges 配列を追加したバリアントを返す。
 * 通常モード(false)は既存の CONVERSATION_SCHEMA をそのまま返すため、既存ルームの動作に
 * 一切影響しない。
 */
export function buildConversationSchema(gameModeEnabled: boolean) {
  if (!gameModeEnabled) return CONVERSATION_SCHEMA;
  return {
    type: Type.OBJECT,
    properties: {
      ...CONVERSATION_SCHEMA.properties,
      ...GAME_STAT_CHANGES_PROPERTY,
    },
    required: ["messages"],
  } as const;
}
