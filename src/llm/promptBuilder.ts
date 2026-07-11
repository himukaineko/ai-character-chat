// プロンプトビルダー(仕様書9.2の順序で組み立てる)
//
// 最重要ルール(仕様書5.4 / 13章):
// presence が "absent" のキャラは、ここで一度フィルタしたら以降のどのセクションにも
// 絶対に登場させない(本体設定・上書き・記憶・発言者候補のすべてから除外する)。
// 「プロンプトに書かない」ことで情報遮断を保証する。プロンプト内の指示文で
// 「absentのキャラについて話すな」と伝える方式は採らない(漏れのリスクがあるため)。
import type {
  Character,
  Memory,
  Message,
  NarrationLevel,
  ReplyLength,
  Room,
  RoomCharacterState,
  Summary,
  UserProfile,
  World,
} from "../types";
import { resolveReplyLength } from "../types";
import type { BuiltPrompt } from "./types";

export interface RoomMemberInfo {
  character: Character;
  state: RoomCharacterState;
}

/** 今回の生成のきっかけ(仕様書5.1〜5.3) */
export type ConversationTrigger =
  | { kind: "topic"; text: string }
  // 位置保持のインライン方式(機能変更: 行動描写ルール): 【 】で囲んだ行動描写は
  // 分離せず text にそのまま含まれる。
  | { kind: "userMessage"; text: string }
  | { kind: "continue" };

/** 再生成オプション(仕様書7.3) */
export type RegenerateOption =
  | "more_natural"
  | "shorter"
  | "more_emotional"
  | "less_narration"
  | "more_character";

export const REGENERATE_OPTION_LABELS: Record<RegenerateOption, string> = {
  more_natural: "もっと自然に",
  shorter: "短く",
  more_emotional: "感情多めに",
  less_narration: "ナレーション少なめに",
  more_character: "キャラらしさを強める",
};

const REGENERATE_OPTION_INSTRUCTIONS: Record<RegenerateOption, string> = {
  more_natural: "より自然な会話のテンポ・言い回しになるよう調整してください。",
  shorter: "全体的にセリフをもう少し短く、簡潔にしてください。",
  more_emotional: "感情の動きや表情がより伝わるようにしてください。",
  less_narration: "地の文・ナレーションを減らし、セリフ中心の構成にしてください。",
  more_character: "各キャラクターの口調・性格らしさがより強く出るようにしてください。",
};

const NARRATION_INSTRUCTIONS: Record<NarrationLevel, string> = {
  none: "地の文・ナレーションは一切出力しないでください。type: \"dialogue\" のセリフのみを出力してください。",
  light:
    "セリフ中心に、文中の【 】または action フィールドで軽い動作・表情の補足を添えてください。narration発言は使っても最小限にしてください。",
  novel: "小説のような地の文(type: \"narration\")を、セリフの合間に適度に織り交ぜてください。",
  narrator:
    "ナレーター役(speaker: \"narration\", type: \"narration\")の発話も積極的に使い、場面の状況を説明してください。",
};

/**
 * 返事の長さの指示。セリフ・ナレーション両方の長さに効くよう文面を調整する。
 * "normal" は現状どおり(指示なし)。
 */
const REPLY_LENGTH_INSTRUCTIONS: Record<ReplyLength, string> = {
  short: "各発言は1〜2文程度の短いテンポにしてください。セリフは簡潔に、地の文も最小限に留めてください。",
  normal: "",
  long: "各発言はやや長めに、感情や思考の描写も含めてじっくり書いてください。セリフも地の文も丁寧に描写してください。",
};

export interface PromptBuildParams {
  room: Room;
  /** ルームの全メンバー(absentも含めて渡してよい。フィルタはこの関数の中で行う) */
  members: RoomMemberInfo[];
  userProfile: UserProfile;
  /** このルームの記憶(disabledも含めて渡してよい。フィルタはこの関数の中で行う) */
  memories: Memory[];
  /** このルームの要約(順不同で渡してよい) */
  summaries: Summary[];
  /** 直近ログ(呼び出し側で recentMessageCount 件にスライス済みのものを渡す。古い→新しい順) */
  recentMessages: Message[];
  trigger: ConversationTrigger;
  regenerateOptions?: RegenerateOption[];
  /**
   * 機能追加: ルームに紐づくワールド(未紐づけなら渡さなくてよい)。
   * relations のうち、両方のキャラが今回のプロンプトに含まれる(absentでない)ペアのみを
   * 「キャラクター同士の関係」セクションとして出力する。片方でも不参加なら絶対に含めない。
   */
  world?: World;
}

/** presence !== "absent" のメンバーのみを返す(データレベルの除外フィルタ本体) */
export function filterIncludedMembers(members: RoomMemberInfo[]): RoomMemberInfo[] {
  return members.filter((m) => m.state.presence !== "absent");
}

/**
 * 機能追加: 1対1ルーム判定。
 * 参加+聞いているキャラがちょうど1人、かつ生成トリガーがユーザー発言のときに true。
 * プロンプト側(発言数指示の切り替え)と生成後チェック側(dialogueの間引き)で
 * 同じ条件を共有するためにここで公開する。
 */
export function isSingleReplyTrigger(
  members: RoomMemberInfo[],
  trigger: ConversationTrigger,
): boolean {
  return filterIncludedMembers(members).length === 1 && trigger.kind === "userMessage";
}

export function buildConversationPrompt(params: PromptBuildParams): BuiltPrompt {
  const {
    room,
    members,
    userProfile,
    memories,
    summaries,
    recentMessages,
    trigger,
    regenerateOptions,
    world,
  } = params;

  // ここで absent を除外する。以降のコードは includedMembers 以外のキャラ情報に触れない。
  const includedMembers = filterIncludedMembers(members);
  const includedNames = new Set(includedMembers.map((m) => m.character.name));
  const includedIds = new Set(includedMembers.map((m) => m.character.id));
  const absentNames = members
    .filter((m) => m.state.presence === "absent")
    .map((m) => m.character.name);

  // 機能追加: 1対1ルーム(参加+聞いているキャラがちょうど1人)でのユーザー発言への応答は、
  // 同じキャラの連投を防ぐため1発言だけに絞る(仕様: ユーザー発言トリガー時のみ。
  // 観察用の「次の会話を生成」・自動連続生成・トピック投入は対象外)。
  const isSingleReplyMode = isSingleReplyTrigger(members, trigger);

  // ---- 1. システム指示(役割・出力形式・禁止事項。会話内容には依存しない) ----
  const systemInstruction = buildSystemInstruction(includedNames, absentNames, isSingleReplyMode);

  const sections: string[] = [];

  // ---- 2. 世界観・舞台設定 ----
  sections.push(
    ["## 世界観・舞台設定", room.worldSetting.trim() || "(特に指定なし)"].join("\n"),
  );

  // ---- 3. 参加キャラの本体設定(不参加キャラは含めない) ----
  sections.push(buildCharacterSection(includedMembers));

  // ---- 4. ルーム内上書き(本体設定より優先) ----
  const overridesText = buildOverridesSection(includedMembers);
  if (overridesText) sections.push(overridesText);

  // ---- 4.5 キャラクター同士の関係(機能追加: ワールド機能。不参加キャラが絡む関係は絶対に含めない) ----
  const relationsText = buildWorldRelationsSection(world, includedIds, includedMembers);
  if (relationsText) sections.push(relationsText);

  // ---- 5. 参加状態の指示 ----
  sections.push(buildPresenceSection(includedMembers));

  // ---- 6. ユーザー設定 ----
  sections.push(buildUserProfileSection(userProfile));

  // ---- 7. 有効な長期記憶・関係性記憶(このルームのもののみ。absentキャラ関連は除外) ----
  const memoryText = buildMemorySection(memories, includedIds, includedMembers);
  if (memoryText) sections.push(memoryText);

  // ---- 8. 会話要約(古い順。現在のメンバーに関係ない期間は除外) ----
  const summaryText = buildSummarySection(summaries, includedIds);
  if (summaryText) sections.push(summaryText);

  // ---- 9. 直近ログ ----
  sections.push(buildRecentLogSection(recentMessages));

  // ---- 10. リアル時間情報(オンのときのみ) ----
  if (room.useRealTime) {
    sections.push(["## 現在の実時間", buildRealTimeLine()].join("\n"));
  }

  // ---- 11. 現在のトピック / ユーザー発言 ----
  sections.push(buildTriggerSection(trigger));

  // ---- 12. ナレーションレベル指示 + 返事の長さ指示 ----
  const replyLength = resolveReplyLength(room.replyLength);
  const narrationLines = [
    "## 出力方針(ナレーションレベル: " + narrationLevelLabel(room.narrationLevel) + ")",
    NARRATION_INSTRUCTIONS[room.narrationLevel],
  ];
  const replyLengthInstruction = REPLY_LENGTH_INSTRUCTIONS[replyLength];
  if (replyLengthInstruction) {
    narrationLines.push(replyLengthInstruction);
  }
  if (regenerateOptions && regenerateOptions.length > 0) {
    narrationLines.push("### 再生成の追加指示");
    for (const opt of regenerateOptions) {
      narrationLines.push("- " + REGENERATE_OPTION_INSTRUCTIONS[opt]);
    }
  }
  sections.push(narrationLines.join("\n"));

  return {
    systemInstruction,
    userContent: sections.join("\n\n"),
  };
}

function narrationLevelLabel(level: NarrationLevel): string {
  switch (level) {
    case "none":
      return "なし";
    case "light":
      return "軽い地の文";
    case "novel":
      return "小説風";
    case "narrator":
      return "ナレーターあり";
  }
}

function buildSystemInstruction(
  includedNames: Set<string>,
  absentNames: string[],
  isSingleReplyMode: boolean,
): string {
  const roster = Array.from(includedNames);
  const batchSizeInstruction = isSingleReplyMode
    ? "今回はユーザーへの返事として、そのキャラクターの発言を1つだけ生成してください。複数の発言を出力しないでください。"
    : "1回の出力につき、2〜6発言程度の複数キャラの発言をまとめて生成してください。";
  const lines = [
    "あなたは、複数のAIキャラクターが登場する会話生成アプリのバックエンドです。",
    "与えられたキャラクター設定・世界観・記憶・会話ログに基づき、キャラクターたちの自然な会話の続きを生成してください。",
    "出力は必ず指定された構造化スキーマ(JSON)で返し、それ以外の説明文・前置き・後書きは一切出力しないでください。",
    batchSizeInstruction,
    roster.length > 0
      ? `speaker には次の名前のみを使用できます: ${roster.join("、")}(narration発言の場合のみ speaker は "narration" としてください)。`
      : "",
    roster.length > 0
      ? `speaker には各キャラクターの登録名を一字一句そのまま使ってください(表記の省略・言い換え・ふりがなの追加/削除などをしないこと)。登録名一覧: ${roster.join("、")}`
      : "",
    "この一覧にない名前や、存在しないキャラクターの発言を絶対に生成しないでください。",
    absentNames.length > 0
      ? `次のキャラクターは今この場にいません。名前を出す・発言させることは絶対にしないでください: ${absentNames.join("、")}`
      : "",
    "セリフの中に動作・表情の描写を入れたい場合は、text フィールドの中で【 】(全角)で囲んで自然な位置に埋め込んでかまいません(例: それは【少し笑って】冗談だよ)。action フィールドは使わなくても構いません。",
    "各キャラクターは、与えられた性格・口調・関係性を一貫して守ってください。ハード制約(hardConstraints)は絶対に破らないでください。",
    "キャラクター同士の関係に呼び方の指定がある場合は、セリフの中でその呼び方に従ってください。",
    "ユーザーに対して過度に迎合したり、キャラクター性を無視した説明口調にならないようにしてください。",
  ];
  return lines.filter(Boolean).join("\n");
}

function buildCharacterSection(members: RoomMemberInfo[]): string {
  const blocks = members.map(({ character }) => {
    const lines = [
      `### ${character.name}`,
      character.nicknames.length > 0 ? `呼び名: ${character.nicknames.join("、")}` : "",
      `一人称: ${character.firstPerson || "(未設定)"} / 二人称: ${character.secondPerson || "(未設定)"}`,
      character.speechStyle ? `口調: ${character.speechStyle}` : "",
      character.personality ? `性格: ${character.personality}` : "",
      character.conversationStyle ? `会話スタイル: ${character.conversationStyle}` : "",
      character.background ? `背景: ${character.background}` : "",
      character.occupation ? `職業・立場: ${character.occupation}` : "",
      character.likes.length > 0 ? `好きなもの: ${character.likes.join("、")}` : "",
      character.dislikes.length > 0 ? `苦手なもの: ${character.dislikes.join("、")}` : "",
      character.dreamsWorriesSecrets ? `夢・悩み・秘密: ${character.dreamsWorriesSecrets}` : "",
      character.appearance ? `外見: ${character.appearance}` : "",
      character.relationToUser ? `ユーザーとの関係(基本): ${character.relationToUser}` : "",
      character.hardConstraints ? `絶対に崩してはいけない設定: ${character.hardConstraints}` : "",
      character.ngWords.length > 0 ? `言わせてはいけない言葉・表現: ${character.ngWords.join("、")}` : "",
      character.speechSamples.length > 0
        ? "口調サンプル:\n" +
          character.speechSamples.map((s) => `  - (${s.situation}) ${s.text}`).join("\n")
        : "",
    ];
    return lines.filter(Boolean).join("\n");
  });
  return ["## 登場キャラクター(本体設定)", ...blocks].join("\n\n");
}

function buildOverridesSection(members: RoomMemberInfo[]): string | null {
  const blocks = members
    .map(({ character, state }) => {
      const o = state.overrides;
      const lines = [
        o.occupation ? `職業・立場: ${o.occupation}` : "",
        o.relationToUser ? `ユーザーとの関係: ${o.relationToUser}` : "",
        o.roleInWorld ? `世界観上の役割: ${o.roleInWorld}` : "",
        o.extraNotes ? `追加メモ: ${o.extraNotes}` : "",
      ].filter(Boolean);
      if (lines.length === 0) return null;
      return [`### ${character.name}`, ...lines].join("\n");
    })
    .filter((b): b is string => b !== null);

  if (blocks.length === 0) return null;
  return [
    "## このルームだけの上書き設定(本体設定より優先されます)",
    ...blocks,
  ].join("\n\n");
}

/**
 * 機能追加: ワールドのキャラ同士の関係セクション。
 * ルームにワールドが紐づいていない場合は null。
 * relations のうち、両方のキャラが includedIds に含まれる(= 今回absentでない)ペアのみを列挙する。
 * 片方でも不参加なら情報遮断の原則に従い絶対に含めない。
 */
function buildWorldRelationsSection(
  world: World | undefined,
  includedIds: Set<string>,
  includedMembers: RoomMemberInfo[],
): string | null {
  if (!world) return null;

  const nameById = new Map(includedMembers.map((m) => [m.character.id, m.character.name]));
  const relevant = world.relations.filter(
    (r) => includedIds.has(r.characterIdA) && includedIds.has(r.characterIdB),
  );
  if (relevant.length === 0) return null;

  const lines = relevant.flatMap((r) => {
    const nameA = nameById.get(r.characterIdA);
    const nameB = nameById.get(r.characterIdB);
    // includedIdsに含まれることを確認済みなので基本的に見つかるはずだが、念のため防御する
    if (!nameA || !nameB) return [];
    const out = [`- ${nameA} と ${nameB}: ${r.description}`];
    // 機能追加: 方向つき詳細(呼び方・態度)。旧形式(方向データなし)は従来どおり1行のまま
    if (r.aToB) {
      out.push(`  - ${nameA}→${nameB}: ${formatRelationDirection(r.aToB)}`);
    }
    if (r.bToA) {
      out.push(`  - ${nameB}→${nameA}: ${formatRelationDirection(r.bToA)}`);
    }
    return out;
  });

  if (lines.length === 0) return null;
  return ["## キャラクター同士の関係(基本設定)", ...lines].join("\n");
}

/** RelationDirection(呼び方・態度)を1行の説明文に整形する。片方だけ入力されていてもよい */
function formatRelationDirection(d: { callName: string; attitude: string }): string {
  const parts: string[] = [];
  if (d.callName.trim()) parts.push(`「${d.callName.trim()}」と呼ぶ`);
  if (d.attitude.trim()) parts.push(d.attitude.trim());
  return parts.join("。");
}

function buildPresenceSection(members: RoomMemberInfo[]): string {
  const lines = members.map(({ character, state }) => {
    if (state.presence === "listening") {
      return `- ${character.name}: 聞いている(その場にいるが基本的には話さない。名前を呼ばれた時や自分に強く関わる話題のときだけ短く反応してよい。発言頻度は低くすること)`;
    }
    return `- ${character.name}: 参加(通常どおり会話に参加してよい)`;
  });
  return ["## 参加状態", ...lines].join("\n");
}

function buildUserProfileSection(profile: UserProfile): string {
  const lines = [
    profile.name ? `名前: ${profile.name}` : "",
    profile.calledAs ? `呼ばれ方: ${profile.calledAs}` : "",
    profile.treatment
      ? `扱われ方の希望: ${profile.treatment}(各キャラの性格や関係性の範囲内で、この扱い方を尊重すること)`
      : "",
    profile.background ? `背景: ${profile.background}` : "",
    profile.appearance ? `外見: ${profile.appearance}` : "",
    profile.dislikedTopics.length > 0 ? `苦手な話題(触れないよう配慮): ${profile.dislikedTopics.join("、")}` : "",
    profile.preferredMood ? `会話で重視したい雰囲気: ${profile.preferredMood}` : "",
  ].filter(Boolean);
  if (lines.length === 0) {
    return ["## ユーザー(会話に参加する可能性がある人物)", "(プロフィール未設定)"].join("\n");
  }
  return ["## ユーザー(会話に参加する可能性がある人物)", ...lines].join("\n");
}

/**
 * 有効な記憶のみを渡す。
 * 不参加キャラに関する記憶(subjectIdsに不参加キャラのIDを含むもの)はここで除外する。
 * これにより「不参加キャラの情報はプロンプトのどこにも出さない」という原則を記憶にも適用する。
 */
function buildMemorySection(
  memories: Memory[],
  includedIds: Set<string>,
  includedMembers: RoomMemberInfo[],
): string | null {
  const nameById = new Map(includedMembers.map((m) => [m.character.id, m.character.name]));
  const nameOf = (id: string) => (id === "user" ? "ユーザー" : nameById.get(id) ?? "(不明)");

  const enabled = memories.filter((m) => !m.disabled);
  // subjectIdsが「絶対に含めない」キャラを指していないか("user"以外で includedIds に無いID)を確認する
  const visible = enabled.filter((m) =>
    m.subjectIds.every((id) => id === "user" || includedIds.has(id)),
  );

  const facts = visible.filter((m) => m.type === "fact");
  const relationships = visible.filter((m) => m.type === "relationship");

  if (facts.length === 0 && relationships.length === 0) return null;

  const lines = ["## 記憶(このルームでこれまでに積み重なった情報)"];
  if (facts.length > 0) {
    lines.push("### 事実");
    for (const f of facts) {
      lines.push(`- ${f.content}(関連: ${f.subjectIds.map(nameOf).join("、") || "-"})`);
    }
  }
  if (relationships.length > 0) {
    lines.push("### 関係性");
    for (const r of relationships) {
      lines.push(`- ${r.content}(関連: ${r.subjectIds.map(nameOf).join("、") || "-"})`);
    }
  }
  return lines.join("\n");
}

/**
 * 要約を古い順に並べて渡す。
 * presentCharacterIds が現在の参加/聞いているメンバーと1人も重ならない要約
 * (今のメンバー構成に無関係な過去の期間)は除外する(仕様書5.4)。
 */
function buildSummarySection(summaries: Summary[], includedIds: Set<string>): string | null {
  const relevant = summaries
    .filter(
      (s) => s.presentCharacterIds.length === 0 || s.presentCharacterIds.some((id) => includedIds.has(id)),
    )
    .slice()
    .sort((a, b) => a.createdAt - b.createdAt);

  if (relevant.length === 0) return null;

  const lines = ["## これまでの会話の要約(古い順)"];
  relevant.forEach((s, i) => {
    lines.push(`${i + 1}. ${s.text}`);
  });
  return lines.join("\n");
}

function buildRecentLogSection(messages: Message[]): string {
  if (messages.length === 0) {
    return ["## 直近の会話ログ", "(まだ会話がありません。これが最初の会話です)"].join("\n");
  }
  const lines = messages.map((m) => formatMessageLine(m));
  return ["## 直近の会話ログ", "(文中の【 】内は動作・行動描写です)", ...lines].join("\n");
}

/** チャットログ1行分のプロンプト向けフォーマット(会話生成プロンプトのログ整形にのみ使う) */
export function formatMessageLine(m: Message): string {
  switch (m.type) {
    case "topic":
      return `--- 場面: ${m.text} ---`;
    case "narration":
      return `[ナレーション] ${m.text}`;
    case "user":
      // 位置保持のインライン方式: ユーザーのtextには【 】が原文のまま含まれる。
      // m.action は旧仕様の分離保存データ(後方互換)が残っている場合のみ付記する。
      return `ユーザー${m.text ? `「${m.text}」` : ""}${m.action ? `(${m.action})` : ""}`;
    case "dialogue":
    default:
      // キャラのaction(構造化出力のactionフィールド)は従来どおり末尾に付記する
      return `${m.speaker}「${m.text}」${m.action ? `(${m.action})` : ""}`;
  }
}

function buildTriggerSection(trigger: ConversationTrigger): string {
  switch (trigger.kind) {
    case "topic":
      return [
        "## 今回の生成指示",
        `今、キャラクターたちは${trigger.text}という流れになっている。この場面を自然な会話として描写してください。`,
        "ユーザーからの直接の指示・命令としてではなく、自然に発生した状況として扱ってください。",
      ].join("\n");
    case "userMessage": {
      // 位置保持のインライン方式: trigger.text には【 】が原文のまま含まれる
      const detail = trigger.text
        ? `ユーザーの発言:「${trigger.text}」`
        : "ユーザーが行動のみを示しました。";
      return [
        "## 今回の生成指示",
        `ユーザーが会話に参加しました。${detail}`,
        "キャラクターたちは、ユーザーが会話に加わったことに自然に反応し、これまでの会話の流れを踏まえて応答してください。",
      ].join("\n");
    }
    case "continue":
    default:
      return [
        "## 今回の生成指示",
        "直近の会話の流れを踏まえ、キャラクターたちの会話を自然に続けてください。",
      ].join("\n");
  }
}

/** Room.useRealTime がオンのときに1行添える実時間情報(仕様書8.3) */
function buildRealTimeLine(): string {
  const now = new Date();
  const weekdays = ["日", "月", "火", "水", "木", "金", "土"];
  const hour = now.getHours();

  let timeOfDay: string;
  if (hour < 5) timeOfDay = "深夜";
  else if (hour < 10) timeOfDay = "朝";
  else if (hour < 12) timeOfDay = "昼前";
  else if (hour < 15) timeOfDay = "昼過ぎ";
  else if (hour < 18) timeOfDay = "夕方";
  else if (hour < 22) timeOfDay = "夜";
  else timeOfDay = "深夜";

  const month = now.getMonth() + 1;
  let season: string;
  if (month >= 3 && month <= 5) season = "春";
  else if (month >= 6 && month <= 8) season = "夏";
  else if (month >= 9 && month <= 11) season = "秋";
  else season = "冬";

  return `現在は${season}、${month}月${now.getDate()}日(${weekdays[now.getDay()]})の${timeOfDay}(${hour}時台)です。季節感や時間帯の空気感を会話に自然に反映してください。`;
}
