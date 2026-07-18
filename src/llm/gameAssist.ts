// ゲームモード設定のAI入力補助(機能追加)
// ユーザーが書いた簡単なヒント(例:「幼馴染との恋愛シミュにしたい」)から、
// ステータス定義一式(名前・説明・初期値・min/max)と展開ルール(自由記述)を軽量モデルに提案させる。
// characterAssist.ts(requestCharacterAssist)と同じパターン(createLiteLLMClient、JSON出力、パース関数)で実装する。
// ここで返す値はフォームに流し込むだけで、DBへの自動保存は一切行わない(呼び出し側の責務)。
import type { GameStatDef } from "../types";
import { loadAppSettings } from "../lib/settings";
import { createLiteLLMClient } from "./createClient";

/** AI提案で作られる1ステータス分の下書き(idはフォーム側でgenerateId()により採番する) */
export type GameStatDraft = Omit<GameStatDef, "id">;

/** ゲームモード設定AI提案の結果全体 */
export interface GameAssistResult {
  stats: GameStatDraft[];
  rulesPrompt: string;
}

/**
 * ユーザーの簡単なヒントから、ゲームモードのステータス定義一式+展開ルールをAIに生成させる。
 * characterNames を渡すと、このルームの参加キャラ名に触れた展開ルールを作りやすくなる(空でもよい)。
 *
 * APIキー未設定などの場合は LLMError がそのまま投げられる。呼び出し側で
 * LLM_ERROR_MESSAGES を使って日本語エラーを表示すること。
 */
export async function requestGameAssist(
  hint: string,
  characterNames: string[] = [],
): Promise<GameAssistResult> {
  const settings = loadAppSettings();
  // APIキー未設定はここでLLMError("missingKey", ...)が投げられる
  const client = createLiteLLMClient(settings);

  const characterLine =
    characterNames.length > 0
      ? `このルームの参加キャラクター: ${characterNames.join("、")}`
      : "参加キャラクターは未定です。一般的な形で提案してください。";

  const prompt = [
    "あなたは、AIキャラクター会話アプリの「ゲームモード」設定を考えるアシスタントです。",
    "ゲームモードは、キャラクターに好感度のようなステータスを持たせ、会話の内容に応じてAIがそのステータスを",
    "上下させ、現在値に応じてキャラクターの態度や展開が変わる、という遊び方を提供する機能です。",
    "",
    "## ユーザーのやりたいこと",
    hint.trim() || "(説明なし。恋愛シミュレーションのような一般的な内容で提案してください)",
    "",
    characterLine,
    "",
    "## ステータス定義(stats)の考え方",
    "- 1〜3個程度、少なすぎず多すぎない数を提案する(ユーザーのヒントから読み取れる数があればそれに従う)",
    "- nameは短い日本語の名詞(例: 好感度、警戒度、信頼度)",
    "- descriptionには、会話の中で何をすると上がる/下がるのかを具体的に書く" +
      "(例: 「ユーザーに優しくされると上がる。冷たくされたり約束を破られると下がる」)",
    "- initialは0〜maxの範囲で、物語の始まりにふさわしい値にする(全くのゼロからより、少し余地がある値が望ましいことが多い)",
    "- min/maxは0〜100を基本にしつつ、ユーザーのヒントに合わせて調整してよい",
    "",
    "## 展開ルール(rulesPrompt)の考え方",
    "- ステータスの数値帯ごとに、キャラクターの態度や会話の展開がどう変わるかを自由記述で書く",
    "- 「0〜20: よそよそしい」「21〜50: 徐々に心を開く」「51〜80: 好意を隠さなくなる」" +
      "「81〜100: 特別な展開(告白イベントなど)が起きてもよい」のように、しきい値と具体的な変化を" +
      "セットで書く(ステータスが複数ある場合は、それぞれについて触れる)",
    "- AIが会話生成時にそのまま参照する文章になるので、箇条書きで簡潔にまとめる",
    "",
    "## 出力形式",
    "次のJSONオブジェクトのみを出力してください。前置き・説明文・コードブロック記号(```)は一切不要です。",
    "{",
    '  "stats": [',
    "    {",
    '      "name": "文字列",',
    '      "description": "文字列",',
    '      "initial": 数値,',
    '      "min": 数値,',
    '      "max": 数値',
    "    }",
    "  ],",
    '  "rulesPrompt": "文字列(改行を含む自由記述でよい)"',
    "}",
  ].join("\n");

  const raw = await client.generateText(prompt);
  return parseGameAssistResponse(raw);
}

/**
 * AIの応答をJSONとして読み取れなかった/内容が不足していた場合に投げるエラー。
 * APIキー未設定・通信エラー等(LLMError)とは区別する。
 */
export class GameAssistParseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "GameAssistParseError";
  }
}

const PARSE_ERROR_MESSAGE = "AIの応答を正しく読み取れませんでした。もう一度お試しください。";

/** 軽量モデルの応答からJSON部分を取り出し、型安全な GameAssistResult に変換する */
function parseGameAssistResponse(raw: string): GameAssistResult {
  const start = raw.indexOf("{");
  const end = raw.lastIndexOf("}");
  if (start === -1 || end === -1 || end <= start) {
    throw new GameAssistParseError(PARSE_ERROR_MESSAGE);
  }

  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(raw.slice(start, end + 1)) as Record<string, unknown>;
  } catch {
    throw new GameAssistParseError(PARSE_ERROR_MESSAGE);
  }

  const statsRaw = Array.isArray(parsed.stats) ? parsed.stats : [];
  const stats: GameStatDraft[] = statsRaw
    .filter((v): v is Record<string, unknown> => !!v && typeof v === "object")
    .map(normalizeStatDraft)
    .filter((s) => s.name.trim() !== "");

  if (stats.length === 0) {
    throw new GameAssistParseError(
      "AIがステータスを1つも生成できませんでした。説明文を変えてもう一度お試しください。",
    );
  }

  const rulesPrompt = typeof parsed.rulesPrompt === "string" ? parsed.rulesPrompt.trim() : "";

  return { stats, rulesPrompt };
}

function normalizeStatDraft(v: Record<string, unknown>): GameStatDraft {
  const name = typeof v.name === "string" ? v.name.trim() : "";
  const description = typeof v.description === "string" ? v.description.trim() : "";
  const initial = toFiniteNumber(v.initial, 0);
  const minRaw = toFiniteNumber(v.min, 0);
  const maxRaw = toFiniteNumber(v.max, 100);
  // min > max のような不整合をAIが返した場合に備えて入れ替えておく(フォーム側で破綻させないため)
  const min = Math.min(minRaw, maxRaw);
  const max = Math.max(minRaw, maxRaw);
  return {
    name,
    description,
    initial: Math.min(max, Math.max(min, initial)),
    min,
    max,
  };
}

function toFiniteNumber(v: unknown, fallback: number): number {
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : fallback;
}
