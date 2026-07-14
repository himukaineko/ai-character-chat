// キャラの顔絵アイコン用プロンプト生成サービス(機能追加)
//
// 目的: ライブラリのキャラ個人ページから、そのキャラの「顔アイコン」を画像生成AI(ChatGPT等)で
// 作るための日本語プロンプトを、軽量モデル(liteModelId)を使って生成する。
// stillPromptService.ts(シーンのスチル用)と同じ作法に倣う。
// 生成結果はその場限りで、DBには保存しない(呼び出し側=モーダルが状態として保持するだけ)。
import type { Character } from "../types";
import { loadAppSettings } from "../lib/settings";
import { createLiteLLMClient } from "./createClient";
import { LLMError } from "./types";

/**
 * キャラの外見・性格などから、顔アイコン(バストアップ・正方形)用の画像生成AI向け
 * 日本語プロンプトを生成する。
 * APIキー未設定・無効などは createLiteLLMClient / client.generateText 側で LLMError が
 * 投げられ、そのまま呼び出し側(モーダル)に伝播する(既存の日本語エラー文言をそのまま使う)。
 */
export async function generateIconPrompt(character: Character): Promise<string> {
  const settings = loadAppSettings();
  // APIキー未設定はここでLLMErrorが投げられる(GeminiClientのコンストラクタでチェック)
  const client = createLiteLLMClient(settings);

  const prompt = buildIconPromptRequest(character);

  const raw = await client.generateText(prompt);
  const trimmed = raw.trim();
  if (!trimmed) {
    throw new LLMError("invalidResponse", "AIから空の応答が返されました。もう一度お試しください。");
  }
  return trimmed;
}

function buildIconPromptRequest(character: Character): string {
  const infoLines = [
    character.appearance ? `外見: ${character.appearance}` : "",
    character.personality ? `性格: ${character.personality}` : "",
    character.occupation ? `職業・立場: ${character.occupation}` : "",
    character.speechStyle ? `口調(表情の雰囲気の参考): ${character.speechStyle}` : "",
    character.background ? `背景(年齢感・時代感の参考): ${character.background}` : "",
  ].filter(Boolean);

  const lines: string[] = [
    "あなたは、キャラクター設定から画像生成AI向けのアイコンイラスト発注プロンプトを作成する専門家です。",
    "以下のキャラクター設定をもとに、このキャラの「顔アイコン」を1枚作るための、画像生成AI(ChatGPT等)にそのまま貼り付けられる日本語のプロンプトを作成してください。",
    "",
    "## 出力ルール",
    "- 出力はプロンプト本文のみとしてください。前置き・説明文・見出し記号(#や*など)・コードブロックは付けないでください。",
    "- 【重要】バストアップ(胸から上)の1人のキャラクターイラストであることを明記してください。全身像や複数人は不可です。",
    "- 【重要】正方形(1:1)の構図で、チャットアプリの丸いアイコンとして中央付近が切り抜かれる前提のため、顔が画面の中央にくる構図にすることを明記してください。",
    "- 外見の特徴(髪型・髪色・目の色・服装など)を具体的に描写してください。設定に記載がない部分は、性格や職業・立場から自然に想像して補ってください(不自然に断定せず、雰囲気として書く程度でよい)。",
    "- 性格が表情ににじむように描写してください(例: 冷静な性格なら落ち着いた微笑、明るい性格なら屈託のない笑顔、など)。",
    "- 背景はシンプル(単色やぼかしなど)にして、キャラクターが映えるようにすることを明記してください。",
    "- 【重要】プロンプト本文の中でキャラクターを固有名で呼ばないでください。読み手の画像生成AIはキャラの名前を知りません。必ず外見の特徴で指してください(例: 「黒髪に眼鏡をかけた青年」)。",
    "",
    "## キャラクター設定",
    ...(infoLines.length > 0 ? infoLines : ["(詳細な設定はありません。標準的な現代日本の物語に出てきそうな人物として想像で補ってください)"]),
  ];

  return lines.join("\n");
}
