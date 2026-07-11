// シーンのスチル(1枚絵)用プロンプト生成サービス(機能追加)
//
// 目的: 今のチャットのシーンを画像生成AI(ChatGPT等)でイラスト化するための
// 日本語プロンプトを、軽量モデル(liteModelId)を使って生成する。
// キャラのイラストは別途ユーザーが画像生成AI側に貼る前提のため、ここでは文章プロンプトのみを作る。
// 生成結果はその場限りで、DBには保存しない(呼び出し側=モーダルが状態として保持するだけ)。
import { db } from "../db";
import type { Character, Message } from "../types";
import { loadAppSettings, loadUserProfile } from "../lib/settings";
import { listMessages } from "../lib/messages";
import { createLiteLLMClient } from "./createClient";
import { formatMessageLine } from "./promptBuilder";
import { LLMError } from "./types";

/** プロンプトに含める直近ログの最大件数 */
const STILL_RECENT_MESSAGE_COUNT = 15;

/**
 * 今のシーンをスチル(1枚のイラスト)にするための、画像生成AIにそのまま貼り付けられる
 * 日本語プロンプトを生成する。
 * APIキー未設定・無効などは createLiteLLMClient / client.generateText 側で LLMError が
 * 投げられ、そのまま呼び出し側(モーダル)に伝播する(既存の日本語エラー文言をそのまま使う)。
 */
export async function generateStillPrompt(roomId: string): Promise<string> {
  const settings = loadAppSettings();
  // APIキー未設定はここでLLMErrorが投げられる(GeminiClientのコンストラクタでチェック)
  const client = createLiteLLMClient(settings);

  const [room, characters, states, allMessages] = await Promise.all([
    db.rooms.get(roomId),
    db.characters.toArray(),
    db.roomCharacterStates.where("roomId").equals(roomId).toArray(),
    listMessages(roomId),
  ]);
  if (!room) {
    throw new Error("ルームが見つかりません");
  }
  if (allMessages.length === 0) {
    // 呼び出し側(モーダル)でボタンを無効化する想定だが、念のため二重に防御する
    throw new Error("会話がまだありません");
  }

  // 機能追加: ルームにワールドが紐づいていて専用ユーザー設定を使う設定なら、そちらの外見を使う
  const world = room.worldId ? await db.worlds.get(room.worldId) : undefined;
  const userProfile =
    world && world.useCustomUserProfile ? world.userProfile : loadUserProfile();

  const charactersById = new Map(characters.map((c) => [c.id, c]));
  const presentCharacters = room.memberIds
    .map((id) => {
      const character = charactersById.get(id);
      const state = states.find((s) => s.characterId === id);
      if (!character || !state) return null;
      if (state.presence === "absent") return null; // 不参加キャラは情報を一切渡さない
      return character;
    })
    .filter((c): c is Character => c !== null);

  const recentMessages = allMessages.slice(-STILL_RECENT_MESSAGE_COUNT);
  const userSpoke = recentMessages.some((m) => m.type === "user");

  const prompt = buildStillPromptRequest({
    worldSetting: room.worldSetting,
    presentCharacters,
    userAppearance: userSpoke ? userProfile.appearance.trim() : "",
    recentMessages,
  });

  const raw = await client.generateText(prompt);
  const trimmed = raw.trim();
  if (!trimmed) {
    throw new LLMError("invalidResponse", "AIから空の応答が返されました。もう一度お試しください。");
  }
  return trimmed;
}

function buildStillPromptRequest(params: {
  worldSetting: string;
  presentCharacters: Character[];
  userAppearance: string;
  recentMessages: Message[];
}): string {
  const { worldSetting, presentCharacters, userAppearance, recentMessages } = params;

  const characterLines =
    presentCharacters.length > 0
      ? presentCharacters.map((c) => {
          const parts = [
            `- ${c.name}`,
            c.appearance ? `外見: ${c.appearance}` : "",
            c.occupation ? `職業・立場: ${c.occupation}` : "",
          ].filter(Boolean);
          return parts.join(" / ");
        })
      : ["(その場にいるキャラクターがいません)"];

  const logLines = recentMessages.map((m) => formatMessageLine(m));

  const lines: string[] = [
    "あなたは、チャットの会話ログから画像生成AI向けのイラスト発注プロンプトを作成する専門家です。",
    "以下の情報をもとに、今この瞬間のシーンを1枚のスチル(イラスト)にするための、画像生成AI(ChatGPT等)にそのまま貼り付けられる日本語のプロンプトを作成してください。",
    "",
    "## 出力ルール",
    "- 出力はプロンプト本文のみとしてください。前置き・説明文・見出し記号(#や*など)・コードブロックは付けないでください。",
    "- 冒頭に次のような導入文を入れてください: 「以下のシーンをイラスト(1枚のスチル)にしてください。添付のキャラクター画像がある場合は、その人物の顔・髪型・雰囲気を参照してください。」",
    "- 続けて、次の内容を自然な文章で盛り込んでください。",
    "  1. シーン説明: 場所・時間帯・状況(世界観と会話ログから読み取って具体的に)",
    "  2. 登場人物: 各キャラクターの外見・表情・ポーズ・位置関係(直近の会話の感情や行動描写を反映して具体的に)",
    "  3. 雰囲気・光・構図の指定(画作りの参考になるよう具体的に)",
    "- 【重要】プロンプト本文の中でキャラクターを固有名で呼ばないでください。読み手の画像生成AIはキャラの名前を知りません。必ず外見の特徴で指してください(例: 「黒髪に眼鏡の白衣の男性」)。人物が複数いる場合は「黒髪の男性」「銀髪の少女」のように外見で書き分け、必要なら「(添付画像1の人物)」のように添付画像との対応を示してください。",
    "- 会話ログに描かれていない出来事を勝手に創作しすぎないでください。あくまで直近のやり取りから読み取れる範囲で描写してください。",
    "",
    "## 世界観・舞台設定",
    worldSetting.trim() || "(特に指定なし)",
    "",
    "## その場にいる登場人物",
    ...characterLines,
    "",
  ];

  if (userAppearance) {
    lines.push("## ユーザー(会話に参加している人物)の外見", userAppearance, "");
  }

  lines.push(
    "## 直近の会話ログ(この流れの「今」の瞬間を描写してください)",
    "(文中の【 】内は動作・行動描写です)",
    ...logLines,
  );

  return lines.join("\n");
}
