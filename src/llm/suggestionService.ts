// 発言・トピックの入力補助(機能追加)
// チャット入力欄の「AIに提案してもらう」ボタンから呼ばれる。世界観・参加キャラ・直近ログを
// 踏まえて、ユーザーが次に打つとよさそうな発言/トピックの候補を軽量モデルに3つ提案させる。
// ここで返す値は入力欄に流し込むだけで、DBへの保存や送信は一切行わない(呼び出し側の責務)。
import { loadAppSettings } from "../lib/settings";
import { createLiteLLMClient } from "./createClient";
import { loadRoomContext, resolveRoomUserProfile } from "./conversationService";
import { filterIncludedMembers, formatMessageLine } from "./promptBuilder";
import type { InputMode } from "../components/room/ChatInput";

/** プロンプトに含める直近ログの件数(会話生成本体より少なくてよい: 提案は直近の流れが分かれば十分) */
const RECENT_MESSAGE_COUNT_FOR_SUGGESTION = 15;

/**
 * ユーザーの簡単なヒントから、発言/トピックの候補を3つAIに生成させる。
 * mode: "topic" なら次に投入すると面白そうな話題、"message" なら次のユーザー発言の候補を提案する。
 *
 * APIキー未設定などの場合は LLMError がそのまま投げられる。呼び出し側で
 * LLM_ERROR_MESSAGES を使って日本語エラーを表示すること。
 */
export async function requestInputSuggestions(
  roomId: string,
  mode: InputMode,
): Promise<string[]> {
  const settings = loadAppSettings();
  // APIキー未設定はここでLLMError("missingKey", ...)が投げられる
  const client = createLiteLLMClient(settings);

  const { room, members, allMessages, world } = await loadRoomContext(roomId);
  const userProfile = resolveRoomUserProfile(world);
  const included = filterIncludedMembers(members);
  const recentMessages = allMessages.slice(-RECENT_MESSAGE_COUNT_FOR_SUGGESTION);

  const characterLines =
    included.length > 0
      ? included.map(({ character }) => {
          const parts = [
            character.personality ? `性格: ${character.personality}` : "",
            character.speechStyle ? `口調: ${character.speechStyle}` : "",
          ].filter(Boolean);
          return `- ${character.name}${parts.length > 0 ? `(${parts.join("、")})` : ""}`;
        })
      : ["(参加中のキャラクターがいません)"];

  const userProfileLine = [
    userProfile.name ? `名前: ${userProfile.name}` : "",
    userProfile.treatment ? `扱われ方の希望: ${userProfile.treatment}` : "",
  ]
    .filter(Boolean)
    .join("、");

  const logLines =
    recentMessages.length > 0
      ? recentMessages.map((m) => formatMessageLine(m))
      : ["(まだ会話がありません。これから最初の一言を送るところです)"];

  const modeInstruction =
    mode === "topic"
      ? "今の流れ・キャラクター設定・世界観を踏まえて、次にユーザーが投入すると会話が広がりそうな" +
        "「話題」を3つ提案してください。1つ15〜30字程度の短い日本語にし、そのままトピック欄に" +
        "入力できる形(体言止めや短いフレーズ)にしてください。"
      : "今の会話の流れを踏まえて、ユーザーが次に言うと自然で会話が広がりそうな「発言」を3パターン" +
        "提案してください。ユーザー本人の一人称視点のセリフとして、そのまま発言欄に入力できる形に" +
        "してください。必要なら【 】で行動描写を含めてもよいですが、必須ではありません。" +
        "3つは方向性を変える(例: 質問する/自分の気持ちを話す/茶化す、など)ようにしてください。";

  const prompt = [
    "あなたは、AIキャラクター会話アプリでユーザーの入力を手伝うアシスタントです。",
    "以下の情報をもとに、ユーザーが次の一手に迷わないよう選択肢を提案してください。",
    "",
    "## 世界観・舞台設定",
    room.worldSetting.trim() || "(特に設定なし)",
    "",
    "## 参加しているキャラクター",
    ...characterLines,
    "",
    "## ユーザーについて",
    userProfileLine || "(特に設定なし)",
    "",
    "## 直近の会話ログ",
    ...logLines,
    "",
    "## やってほしいこと",
    modeInstruction,
    "",
    "## 出力形式",
    "次のJSONオブジェクトのみを出力してください。前置き・説明文・コードブロック記号(```)は一切不要です。",
    '{ "suggestions": ["文字列", "文字列", "文字列"] }',
  ].join("\n");

  const raw = await client.generateText(prompt);
  return parseSuggestions(raw);
}

/** 軽量モデルの応答からJSON部分を取り出し、候補の文字列配列を取り出す */
function parseSuggestions(raw: string): string[] {
  const start = raw.indexOf("{");
  const end = raw.lastIndexOf("}");
  if (start === -1 || end === -1 || end <= start) return [];

  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(raw.slice(start, end + 1)) as Record<string, unknown>;
  } catch {
    return [];
  }

  if (!Array.isArray(parsed.suggestions)) return [];
  return parsed.suggestions
    .filter((v): v is string => typeof v === "string" && v.trim() !== "")
    .map((v) => v.trim())
    .slice(0, 3);
}
