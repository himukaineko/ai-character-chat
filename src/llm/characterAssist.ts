// キャラクター作成のAI入力補助(仕様書8.1)
// ユーザーが書いた簡単な説明から、Character型の各フィールドを軽量モデルに提案させる。
// ここで返す値はフォームに流し込むだけで、DBへの自動保存は一切行わない(呼び出し側の責務)。
import type { SpeechSample } from "../types";
import { loadAppSettings } from "../lib/settings";
import { createLiteLLMClient } from "./createClient";

/** AI提案の対象になるフィールド(仕様書8.1: 名前案・一人称・二人称・口調・性格・会話スタイル・
 * 背景・職業・好き嫌い・夢悩み秘密・外見・ユーザーとの関係・口調サンプル) */
export interface CharacterAssistFields {
  name?: string;
  firstPerson?: string;
  secondPerson?: string;
  speechStyle?: string;
  personality?: string;
  conversationStyle?: string;
  background?: string;
  occupation?: string;
  likes?: string[];
  dislikes?: string[];
  dreamsWorriesSecrets?: string;
  appearance?: string;
  relationToUser?: string;
  speechSamples?: SpeechSample[];
}

export type CharacterAssistFieldKey = keyof CharacterAssistFields;

/** フィールドごとの日本語ラベル(プロンプトにもUIにも使う) */
export const ASSIST_FIELD_LABELS: Record<CharacterAssistFieldKey, string> = {
  name: "名前案",
  firstPerson: "一人称",
  secondPerson: "二人称",
  speechStyle: "口調",
  personality: "性格",
  conversationStyle: "会話スタイル",
  background: "背景",
  occupation: "職業・所属・立場",
  likes: "好きなもの",
  dislikes: "嫌いなもの",
  dreamsWorriesSecrets: "夢・悩み・秘密",
  appearance: "外見(見た目の特徴。テキストで)",
  relationToUser: "ユーザーとの関係",
  speechSamples: "口調サンプル(状況とセリフのペアを3つ程度)",
};

/** 一括提案の対象になる全フィールド */
export const ALL_ASSIST_FIELDS: CharacterAssistFieldKey[] = Object.keys(
  ASSIST_FIELD_LABELS,
) as CharacterAssistFieldKey[];

/**
 * 命名規則(name フィールドが提案対象のときだけプロンプトに載せる)。
 * 「AIあるあるネーム」(頻出テンプレ名)への偏りを防ぐための禁止リストと生成原則。
 * groupAssist.ts(AIでグループ作成)でもそのまま再利用する。
 */
export const NAMING_RULES = [
  "## 命名ルール(nameを考えるとき)",
  "- 最初に、説明文・世界観からそのキャラの文化圏を判断し、名前の様式を必ずそれに合わせる。" +
    "和名(日本人名)を付けてよいのは、キャラが現代日本人または和風世界の住人である場合だけ。" +
    "天使・悪魔・精霊・神・エルフ・ロボットなどの人外や、ファンタジー・西洋・SF世界の住人には" +
    "和名を付けず、その世界観に合った名前(カタカナ名など)を付ける。迷ったときのデフォルトを和名にしない",
  "- 和名は次を使用禁止(派生・組み合わせも避ける): 下の名前=蒼/蓮/律/颯/湊/悠/陽/玲/奏/晴/" +
    "健(健吾・健介・健太・健一・健二等の「健」を軸にした定番男性名も禁止)" +
    "(蒼真・悠斗・陽翔・晴也等の派生も禁止)、苗字=桐生/一条/神宮寺/九条/西園寺/東雲/鷹宮/鳳/月城/久我/" +
    "雨宮/早乙女/佐伯/瀬尾/成瀬/相沢/高瀬/黒川/黒崎/橘/野村",
  "- 和名の生成原則: キャラの生年相応の名前らしさで選ぶ(30代なら今どきの流行ネームにしない)/" +
    "一文字の綺麗系・中性的ネームに安易に寄らず二〜三文字・武骨・古風だが現役の名前も候補にする/" +
    "姓名を並べて「ラノベ主役っぽいできすぎた響き」にしない(片方が華やかならもう片方は地味に)/" +
    "命名理由を1行で言えるようにする",
  "- 和名の苗字: 全国上位のありふれすぎる姓(佐藤/鈴木/高橋/田中/伊藤/渡辺/山本/中村/小林/加藤/" +
    "吉田/山田/佐々木/山口/松本)は使わない。実在するが上位すぎず、印象的すぎもしない中頻度の姓から選ぶ" +
    "(例: 三浦/内田/杉本/平野/大西/永井/荒木/落合/柴田/横山など。ただしこれは範囲を示す例示であり、" +
    "毎回この例の中から選ばず、同じ頻度帯の幅広い姓に散らすこと)。" +
    "例外として、貴族・財閥・旧家・名家などの設定があるキャラには、使用禁止リスト以外から" +
    "その出自にふさわしい格のある姓を付けてよい(設定に合う名前を最優先する)",
  "- 重要: 最初に思い浮かんだ1つの姓・名にすぐ決めない。使用禁止リストを避けた結果、" +
    "別の特定の姓・名(「次に多い定番」)に無意識に偏りやすいという傾向があるため、" +
    "頭の中で頻度帯の異なる複数の候補を挙げてから、その中で最も設定に合うものを選ぶこと。" +
    "同じような説明文に対して毎回同じ姓・名を選ぶ状態は避ける",
  "- ファンタジー・西洋風の名前の生成原則: ヴ/ズ/グ等の濁音過多クリシェ(強キャラ=濁音の安易な連想)を" +
    "避ける/カタカナ4音前後を基本に読みやすさを優先し、長い名前には愛称を添える/" +
    "同じ文化圏のキャラ同士は音の体系(音数・語尾・子音の傾向)を揃え、文化圏が違うキャラは体系をずらして" +
    "出自を音で示す/既存有名作品の主要キャラ名と衝突させない",
].join("\n");

/** フィールドキー→命名ルールが関わるか */
const NAME_RELATED_FIELDS: ReadonlySet<CharacterAssistFieldKey> = new Set(["name"]);

/**
 * キャラ立ち強化の指針(背景・性格・好き嫌い・夢悩み秘密・口調サンプルのいずれかが
 * 提案対象のときだけプロンプトに載せる)。
 * groupAssist.ts(AIでグループ作成)でもそのまま再利用する。
 */
export const CHARACTER_DEPTH_GUIDE = [
  "## キャラ立ちの指針",
  "- background: 経歴の抽象的な羅列でなく、いつ・どこで・何があったかが分かる具体的なエピソードを" +
    "1つ以上入れる(地名・年数・固有の出来事など)",
  "- personality: 長所だけでなく欠点・弱さ・矛盾も必ず含める" +
    "(例: 面倒見がいいが自分のことは後回しにして共倒れする)。「優しい」「明るい」だけの平板な説明で終わらせない",
  "- likes/dislikes: 「音楽」「読書」のような一般名詞でなく、具体的で少し変わった項目を混ぜる" +
    "(例: 雨の日の図書館の匂い、炭酸の抜けたコーラ)",
  "- dreamsWorriesSecrets: 背景・性格と因果でつながる内容にする(取ってつけた秘密にしない)",
  "- speechSamples: そのキャラにしか言えなさそうな、性格と背景がにじむセリフにする(誰でも言える挨拶にしない)",
  "- 共通: ユーザーの説明文の内容は必ず尊重し、矛盾しない範囲で肉付けする",
].join("\n");

/** フィールドキー→キャラ立ち指針が関わるか */
const DEPTH_RELATED_FIELDS: ReadonlySet<CharacterAssistFieldKey> = new Set([
  "background",
  "personality",
  "likes",
  "dislikes",
  "dreamsWorriesSecrets",
  "speechSamples",
]);

function fieldSchemaLine(field: CharacterAssistFieldKey): string {
  switch (field) {
    case "likes":
    case "dislikes":
      return `  "${field}": ["文字列", "文字列", "文字列"]`;
    case "speechSamples":
      return `  "${field}": [{ "situation": "状況(例: 照れたとき)", "text": "セリフ" }]`;
    default:
      return `  "${field}": "文字列"`;
  }
}

/**
 * ユーザーの簡単な説明(hint)から、指定フィールドの提案をAIに生成させる。
 * context を渡すと、既に決まっている他フィールドと矛盾しないよう配慮した提案になる
 * (フィールド単位の再生成で、他の欄の内容を壊さないために使う)。
 *
 * APIキー未設定などの場合は LLMError がそのまま投げられる。呼び出し側で
 * LLM_ERROR_MESSAGES を使って日本語エラーを表示すること。
 */
export async function requestCharacterAssist(
  hint: string,
  fields: CharacterAssistFieldKey[],
  context?: Partial<CharacterAssistFields>,
): Promise<CharacterAssistFields> {
  if (fields.length === 0) return {};

  const settings = loadAppSettings();
  // APIキー未設定はここでLLMError("missingKey", ...)が投げられる
  const client = createLiteLLMClient(settings);

  const fieldLines = fields.map((f) => `- ${f}: ${ASSIST_FIELD_LABELS[f]}`);
  const contextEntries = context
    ? Object.entries(context).filter(([, v]) => (Array.isArray(v) ? v.length > 0 : !!v))
    : [];
  const contextLines =
    contextEntries.length > 0
      ? [
          "",
          "## すでに決まっている設定(矛盾しないように提案すること)",
          JSON.stringify(Object.fromEntries(contextEntries)),
        ]
      : [];

  // 該当フィールドが含まれるときだけ命名ルール/キャラ立ち指針を載せ、プロンプトの肥大化を防ぐ
  const needsNamingRules = fields.some((f) => NAME_RELATED_FIELDS.has(f));
  const needsDepthGuide = fields.some((f) => DEPTH_RELATED_FIELDS.has(f));
  const ruleLines = [
    ...(needsNamingRules ? ["", NAMING_RULES] : []),
    ...(needsDepthGuide ? ["", CHARACTER_DEPTH_GUIDE] : []),
  ];

  const prompt = [
    "あなたはキャラクター創作を手伝うアシスタントです。",
    "以下のユーザーの説明をもとに、チャットキャラクターの設定項目を日本語で提案してください。",
    "",
    "## ユーザーの説明",
    hint.trim() || "(説明なし。すでに決まっている設定があればそこから自然に補ってください)",
    ...contextLines,
    ...ruleLines,
    "",
    "## 提案してほしい項目",
    ...fieldLines,
    "",
    "## 出力形式",
    "次のJSONオブジェクトのみを出力してください。前置き・説明文・コードブロック記号(```)は一切不要です。",
    "{",
    fields.map(fieldSchemaLine).join(",\n"),
    "}",
  ].join("\n");

  const raw = await client.generateText(prompt);
  return parseAssistResponse(raw, fields);
}

/** 軽量モデルの応答からJSON部分を取り出し、要求したフィールドだけを型安全に取り出す */
function parseAssistResponse(
  raw: string,
  fields: CharacterAssistFieldKey[],
): CharacterAssistFields {
  const start = raw.indexOf("{");
  const end = raw.lastIndexOf("}");
  if (start === -1 || end === -1 || end <= start) return {};

  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(raw.slice(start, end + 1)) as Record<string, unknown>;
  } catch {
    return {};
  }

  const result: CharacterAssistFields = {};
  for (const field of fields) {
    const value = parsed[field];
    if (value === undefined || value === null) continue;

    if (field === "likes" || field === "dislikes") {
      if (Array.isArray(value)) {
        const strings = value.filter(
          (v): v is string => typeof v === "string" && v.trim() !== "",
        );
        if (strings.length > 0) result[field] = strings;
      }
      continue;
    }

    if (field === "speechSamples") {
      if (Array.isArray(value)) {
        const samples: SpeechSample[] = value
          .filter((v): v is Record<string, unknown> => !!v && typeof v === "object")
          .map((v) => ({
            situation: typeof v.situation === "string" ? v.situation : "",
            text: typeof v.text === "string" ? v.text : "",
          }))
          .filter((s) => s.situation.trim() !== "" || s.text.trim() !== "");
        if (samples.length > 0) result.speechSamples = samples;
      }
      continue;
    }

    if (typeof value === "string" && value.trim() !== "") {
      // name/firstPerson/... はすべて string 型フィールドなのでここで代入できる
      (result as Record<string, string>)[field] = value;
    }
  }
  return result;
}
