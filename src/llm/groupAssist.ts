// 「AIでグループ作成」の生成サービス
// 関係性のある複数キャラ(同級生3人、ホストクラブのトップキャストと黒服、など)を
// 世界観・キャラ同士の関係込みで一括生成する。characterAssist.ts の命名規則・キャラ立ち指針を
// そのまま再利用し、単体AI補助と矛盾しないトーンで生成する。
// ここで返す値はプレビュー画面に流し込むだけで、DBへの自動保存は一切行わない(呼び出し側の責務)。
import type { RelationDirection, SpeechSample, UserProfile } from "../types";
import { loadAppSettings } from "../lib/settings";
import { createLiteLLMClient } from "./createClient";
import { NAMING_RULES, CHARACTER_DEPTH_GUIDE } from "./characterAssist";

/** グループの人数指定。"auto" のときは説明文からAIが2〜5人の範囲で判断する */
export type GroupMemberCount = "auto" | 2 | 3 | 4 | 5;

/** グループ生成で作られる1キャラ分の下書き(単体AI補助と同じフィールド構成) */
export interface GroupCharacterDraft {
  name: string;
  firstPerson: string;
  secondPerson: string;
  speechStyle: string;
  personality: string;
  conversationStyle: string;
  background: string;
  occupation: string;
  likes: string[];
  dislikes: string[];
  dreamsWorriesSecrets: string;
  appearance: string;
  relationToUser: string;
  speechSamples: SpeechSample[];
}

/** キャラ同士の関係の下書き。a/bIndexは生成結果内のcharacters配列のインデックス(0始まり) */
export interface GroupRelationDraft {
  aIndex: number;
  bIndex: number;
  description: string;
  /** 機能追加: aIndex→bIndex 方向の詳細(呼び方・態度)。AIが生成しなかった場合はundefined */
  aToB?: RelationDirection;
  /** 機能追加: bIndex→aIndex 方向の詳細(呼び方・態度)。AIが生成しなかった場合はundefined */
  bToA?: RelationDirection;
}

/** グループ生成の結果全体 */
export interface GroupAssistResult {
  worldName: string;
  worldDescription: string;
  characters: GroupCharacterDraft[];
  relations: GroupRelationDraft[];
  /**
   * 機能追加: ユーザー(主人公)についての言及があった場合のワールド専用ユーザー設定案。
   * 説明文にユーザーへの言及がなければ undefined(専用設定は提案しない=共通の主人公のまま)。
   * 呼び出し側でワールド作成時に useCustomUserProfile / userProfile へ流し込むかどうかを判断する。
   */
  userProfile?: Partial<UserProfile>;
}

/**
 * AIの応答をJSONとして読み取れなかった/内容が不足していた場合に投げるエラー。
 * APIキー未設定・通信エラー等(LLMError)とは区別し、呼び出し側で「作り直す」への
 * 導線を出し分けられるようにする。
 */
export class GroupAssistParseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "GroupAssistParseError";
  }
}

const CHARACTER_FIELD_SCHEMA = [
  '      "name": "文字列",',
  '      "firstPerson": "文字列",',
  '      "secondPerson": "文字列",',
  '      "speechStyle": "文字列",',
  '      "personality": "文字列",',
  '      "conversationStyle": "文字列",',
  '      "background": "文字列",',
  '      "occupation": "文字列",',
  '      "likes": ["文字列", "文字列", "文字列"],',
  '      "dislikes": ["文字列", "文字列", "文字列"],',
  '      "dreamsWorriesSecrets": "文字列",',
  '      "appearance": "文字列",',
  '      "relationToUser": "文字列(ユーザーとの関係。グループ内での立場から自然なものでよい)",',
  '      "speechSamples": [{ "situation": "状況(例: 照れたとき)", "text": "セリフ" }]',
].join("\n");

/**
 * グループ説明文(hint)から、関係性込みの複数キャラクターを一括生成する。
 * APIキー未設定などの場合は LLMError がそのまま投げられる(呼び出し側でLLM_ERROR_MESSAGESを使う)。
 * AIの応答が読み取れない・内容が不十分な場合は GroupAssistParseError を投げる。
 */
export async function requestGroupAssist(
  hint: string,
  memberCount: GroupMemberCount,
): Promise<GroupAssistResult> {
  const settings = loadAppSettings();
  // APIキー未設定はここでLLMError("missingKey", ...)が投げられる
  const client = createLiteLLMClient(settings);

  const countInstruction =
    memberCount === "auto"
      ? "人数はユーザーの説明文の内容から、グループとして自然な人数(2〜5人)をあなたが判断して決めてください。"
      : `人数はちょうど${memberCount}人にしてください。`;

  const prompt = [
    "あなたはチャットキャラクター創作を手伝うアシスタントです。",
    "以下のユーザーの説明をもとに、互いに関係性を持つ複数のチャットキャラクターをまとめて日本語で作成してください。",
    "",
    "## ユーザーの説明",
    hint.trim() || "(説明なし。関係性のある自然なグループを提案してください)",
    "",
    "## 人数について",
    countInstruction,
    "",
    NAMING_RULES,
    "",
    "## メンバー同士の差別化(重要)",
    "- 名前は音・響き・文字面をはっきり離し、会話ログで誰の発言か混同されないようにする" +
      "(同じ音で始まる名前、似た漢字・カタカナの並びを避ける)",
    "- 性格・口調・立場は互いに被らないよう明確に差別化する。全員が似たテンション・同じ言葉づかいに" +
      "ならないようにし、グループ内での役割(まとめ役、ムードメーカー、しっかり者、問題児など)が" +
      "重複しないようにする",
    "",
    CHARACTER_DEPTH_GUIDE,
    "",
    "## 関係(relations)の書き方(重要)",
    "- 生成した全キャラクターの、あり得るペアすべてについて関係を1つずつ書くこと(省略しない)。" +
      `例えば${memberCount === "auto" ? "4人なら6ペア、5人なら10ペア" : `${memberCount}人ならペアは${(memberCount * (memberCount - 1)) / 2}組`}になる。` +
      "特に接点が思いつかないペアであっても、「同じ場にいるが特に交流はない」" +
      "「存在は知っているが話したことがない」のような薄い関係として、省略せず必ず1件書くこと" +
      "(関係が抜けているペアがあると、そのルームで一緒に会話させたときに不自然になるため)",
    "- descriptionには力関係(上下・対等・片方だけが意識している等)や感情の温度感" +
      "(親密さ・距離感・緊張感・気まずさなど)を含む、2人に共通する関係のラベル・説明を書く",
    "- 「仲が良い」のような抽象的な説明だけで終わらせず、そう言える具体的な経緯やエピソードを匂わせる",
    "- 呼び方と態度は方向ごとに(A→BとB→Aは別々に)書くこと。aToBはaIndexのキャラがbIndexのキャラを" +
      "どう呼び、どう思っているか。bToAはその逆方向。呼び方が思いつかない・特に決まっていない場合は" +
      "callNameを空文字にしてよいが、attitude(内心・態度)はできるだけ埋めること",
    "",
    "## ユーザー(主人公)について(重要)",
    "ユーザーの説明文の中に、主人公(ユーザー)自身についての言及があれば" +
      "(例:「主人公はこの世界の巫女」「ユーザーは転生者で剣が使える」「あなたは新入生」など)、" +
      "そのワールド専用のユーザー設定(userProfile)を提案してください。" +
      "name(呼ばれる名前)/calledAs(呼ばれ方)/treatment(周囲からの扱われ方の希望)/" +
      "background(この世界での背景・立場)/appearance(外見)のうち、説明文から読み取れる範囲でよく、" +
      "無理にすべて埋める必要はありません。ユーザーについての言及が説明文の中に特になければ、" +
      "userProfileはJSONオブジェクトのキーごと省略してください(null・空文字列で埋めて出力しないこと)。",
    "",
    "## 出力形式",
    "次のJSONオブジェクトのみを出力してください。前置き・説明文・コードブロック記号(```)は一切不要です。",
    "relationsのaIndex/bIndexには、characters配列の0始まりのインデックスを指定してください。",
    "{",
    '  "worldName": "グループ全体の世界観・舞台の名前案",',
    '  "worldDescription": "世界観の説明(1〜2文)",',
    '  "characters": [',
    "    {",
    CHARACTER_FIELD_SCHEMA,
    "    }",
    "  ],",
    '  "relations": [',
    "    {",
    '      "aIndex": 0,',
    '      "bIndex": 1,',
    '      "description": "2人に共通する関係の説明",',
    '      "aToB": { "callName": "aIndexのキャラがbIndexのキャラを呼ぶ呼び方", "attitude": "aIndexのキャラのbIndexのキャラへの態度・感情" },',
    '      "bToA": { "callName": "bIndexのキャラがaIndexのキャラを呼ぶ呼び方", "attitude": "bIndexのキャラのaIndexのキャラへの態度・感情" }',
    "    }",
    "  ],",
    '  "userProfile": { "name": "文字列", "calledAs": "文字列", "treatment": "文字列", "background": "文字列", "appearance": "文字列" }' +
      "  (ユーザーへの言及が説明文になければ、このキー自体を省略してよい)",
    "}",
  ].join("\n");

  const raw = await client.generateText(prompt);
  return parseGroupAssistResponse(raw);
}

const PARSE_ERROR_MESSAGE = "AIの応答を正しく読み取れませんでした。もう一度お試しください。";

/** 軽量モデルの応答からJSON部分を取り出し、型安全な GroupAssistResult に変換する */
function parseGroupAssistResponse(raw: string): GroupAssistResult {
  const start = raw.indexOf("{");
  const end = raw.lastIndexOf("}");
  if (start === -1 || end === -1 || end <= start) {
    throw new GroupAssistParseError(PARSE_ERROR_MESSAGE);
  }

  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(raw.slice(start, end + 1)) as Record<string, unknown>;
  } catch {
    throw new GroupAssistParseError(PARSE_ERROR_MESSAGE);
  }

  const charactersRaw = Array.isArray(parsed.characters) ? parsed.characters : [];
  const characters: GroupCharacterDraft[] = charactersRaw
    .filter((v): v is Record<string, unknown> => !!v && typeof v === "object")
    .map(normalizeCharacterDraft)
    .filter((c) => c.name.trim() !== "")
    .slice(0, 5);

  if (characters.length < 2) {
    throw new GroupAssistParseError(
      "AIがキャラクターを2人以上生成できませんでした。説明文を変えてもう一度お試しください。",
    );
  }

  const relationsRaw = Array.isArray(parsed.relations) ? parsed.relations : [];
  const relations: GroupRelationDraft[] = relationsRaw
    .filter((v): v is Record<string, unknown> => !!v && typeof v === "object")
    .map((v) => ({
      aIndex: typeof v.aIndex === "number" ? v.aIndex : Number(v.aIndex),
      bIndex: typeof v.bIndex === "number" ? v.bIndex : Number(v.bIndex),
      description: typeof v.description === "string" ? v.description.trim() : "",
      aToB: normalizeRelationDirection(v.aToB),
      bToA: normalizeRelationDirection(v.bToA),
    }))
    .filter(
      (r) =>
        Number.isInteger(r.aIndex) &&
        Number.isInteger(r.bIndex) &&
        r.aIndex !== r.bIndex &&
        r.aIndex >= 0 &&
        r.aIndex < characters.length &&
        r.bIndex >= 0 &&
        r.bIndex < characters.length &&
        r.description !== "",
    );

  const worldName = typeof parsed.worldName === "string" ? parsed.worldName.trim() : "";
  const worldDescription =
    typeof parsed.worldDescription === "string" ? parsed.worldDescription.trim() : "";
  const userProfile = normalizeUserProfileDraft(parsed.userProfile);

  return { worldName, worldDescription, characters, relations, userProfile };
}

/**
 * AI応答内のuserProfile(ワールド専用ユーザー設定案)を正規化する。
 * オブジェクトでない場合や、全フィールドが空の場合は undefined
 * (=ユーザーへの言及が無かった・専用設定を提案しなかったとみなす)。
 */
function normalizeUserProfileDraft(v: unknown): Partial<UserProfile> | undefined {
  if (!v || typeof v !== "object") return undefined;
  const obj = v as Record<string, unknown>;
  const str = (key: string): string =>
    typeof obj[key] === "string" ? (obj[key] as string).trim() : "";
  const profile: Partial<UserProfile> = {
    name: str("name"),
    calledAs: str("calledAs"),
    treatment: str("treatment"),
    background: str("background"),
    appearance: str("appearance"),
  };
  const hasContent = Object.values(profile).some((s) => s !== "");
  return hasContent ? profile : undefined;
}

/**
 * AI応答内のaToB/bToA(呼び方・態度)を正規化する。
 * オブジェクトでない・両方とも空文字の場合はundefined(方向つき情報なし)にする。
 */
function normalizeRelationDirection(v: unknown): RelationDirection | undefined {
  if (!v || typeof v !== "object") return undefined;
  const obj = v as Record<string, unknown>;
  const callName = typeof obj.callName === "string" ? obj.callName.trim() : "";
  const attitude = typeof obj.attitude === "string" ? obj.attitude.trim() : "";
  if (!callName && !attitude) return undefined;
  return { callName, attitude };
}

function normalizeCharacterDraft(v: Record<string, unknown>): GroupCharacterDraft {
  const str = (key: string): string =>
    typeof v[key] === "string" ? (v[key] as string).trim() : "";
  const arr = (key: string): string[] =>
    Array.isArray(v[key])
      ? (v[key] as unknown[]).filter(
          (x): x is string => typeof x === "string" && x.trim() !== "",
        )
      : [];
  const speechSamples: SpeechSample[] = Array.isArray(v.speechSamples)
    ? (v.speechSamples as unknown[])
        .filter((s): s is Record<string, unknown> => !!s && typeof s === "object")
        .map((s) => ({
          situation: typeof s.situation === "string" ? s.situation : "",
          text: typeof s.text === "string" ? s.text : "",
        }))
        .filter((s) => s.situation.trim() !== "" || s.text.trim() !== "")
    : [];

  return {
    name: str("name"),
    firstPerson: str("firstPerson"),
    secondPerson: str("secondPerson"),
    speechStyle: str("speechStyle"),
    personality: str("personality"),
    conversationStyle: str("conversationStyle"),
    background: str("background"),
    occupation: str("occupation"),
    likes: arr("likes"),
    dislikes: arr("dislikes"),
    dreamsWorriesSecrets: str("dreamsWorriesSecrets"),
    appearance: str("appearance"),
    relationToUser: str("relationToUser"),
    speechSamples,
  };
}
