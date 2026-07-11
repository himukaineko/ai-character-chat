// 会話要約+記憶抽出サービス(仕様書6.2 / 6.3 / 6.4)
//
// コスト削減のため、要約と記憶候補の抽出を「同じ1回の軽量モデル呼び出し」で行う(仕様書6.3)。
// プロンプトで要約と記憶候補を1つのJSONにまとめて出力させ、アプリ側でパースして両方を保存する。
//
// トリガー: 会話生成の完了後にバックグラウンドで呼ばれる(UIをブロックしない)。
// 失敗時は静かにスキップする(次回の生成後に再試行される)。自動リトライはしない。
import { db } from "../db";
import type { Memory, Message } from "../types";
import { loadAppSettings } from "../lib/settings";
import { listMemories, listSummaries, saveSummaryAndMemories, type MemoryInput } from "../lib/memories";
import { listMessages } from "../lib/messages";
import { createLiteLLMClient } from "./createClient";
import { formatMessageLine } from "./promptBuilder";
import { LLMError } from "./types";

/** pinned記憶と新記憶が矛盾した場合の確認要求(自動では無効化しない。仕様書6.3) */
export interface PinnedConflict {
  /** 矛盾している固定記憶のID */
  pinnedMemoryId: string;
  /** 固定記憶の内容 */
  pinnedContent: string;
  /** 新しく追加された記憶の内容 */
  newContent: string;
}

/** 要約+記憶抽出の実行結果 */
export interface SummarizeOutcome {
  summaryCreated: boolean;
  memoriesAdded: number;
  /** ユーザーの確認が必要な固定記憶の矛盾一覧 */
  pinnedConflicts: PinnedConflict[];
}

/** 軽量モデルに出力させるJSONの形 */
interface ExtractionResponse {
  summary: string;
  memories: {
    type: string;
    subjects: string[];
    content: string;
    sources: number[];
    contradicts: string[];
  }[];
}

// 同じルームで多重実行しないためのガード(バックグラウンド実行のため)
const inFlightRooms = new Set<string>();

/**
 * 未要約の発言数が summaryTriggerCount を超えていれば、
 * 古い部分(直近 recentMessageCount 件より前)を要約+記憶抽出して保存する。
 * 条件を満たさない・失敗した場合は null を返す(呼び出し側は何もしなくてよい)。
 * 生成後にバックグラウンドで自動的に呼ばれる想定のため、失敗は静かにスキップする。
 */
export async function maybeSummarizeAndExtract(roomId: string): Promise<SummarizeOutcome | null> {
  if (inFlightRooms.has(roomId)) return null;
  inFlightRooms.add(roomId);
  try {
    return await runSummarizeAndExtract(roomId, false);
  } catch {
    // 要約失敗は静かにスキップする(仕様: 次回の生成後に再試行される)
    return null;
  } finally {
    inFlightRooms.delete(roomId);
  }
}

/**
 * ユーザー操作(「記憶を整理」ボタン)による手動実行。
 * summaryTriggerCount の条件を無視し、未要約の発言が1件でもあれば実行する。
 * 自動実行との違い:
 * - トリガー件数チェックをスキップする
 * - 記憶抽出の対象は未要約の全発言(直近 recentMessageCount 件も含む)
 * - Summary の保存範囲は自動実行と同じ(直近分より古い部分のみ。無ければ要約は保存しない)
 * 失敗時は例外をそのまま投げる(呼び出し側でAPIキー未設定などの日本語エラーを表示するため)。
 * 自動実行と同じ inFlightRooms ガードを使うため、同時実行は起きない
 * (既に実行中の場合はエラーを投げて呼び出し側に伝える)。
 */
export async function forceSummarizeAndExtract(roomId: string): Promise<SummarizeOutcome | null> {
  if (inFlightRooms.has(roomId)) {
    throw new LLMError(
      "unknown",
      "自動整理が実行中のため、少し待ってから再試行してください。",
    );
  }
  inFlightRooms.add(roomId);
  try {
    return await runSummarizeAndExtract(roomId, true);
  } finally {
    inFlightRooms.delete(roomId);
  }
}

async function runSummarizeAndExtract(roomId: string, force: boolean): Promise<SummarizeOutcome | null> {
  const settings = loadAppSettings();
  // APIキー未設定ならここで例外(自動実行では静かにスキップ、手動実行では呼び出し側に伝播する)
  const client = createLiteLLMClient(settings);

  const [room, allMessages, summaries, allMemories, states, characters] = await Promise.all([
    db.rooms.get(roomId),
    listMessages(roomId),
    listSummaries(roomId),
    listMemories(roomId),
    db.roomCharacterStates.where("roomId").equals(roomId).toArray(),
    db.characters.toArray(),
  ]);
  if (!room) return null;

  // ---- 未要約範囲の特定 ----
  // 最新の要約の coversUpToMessageId 以降が未要約。要約が無ければ全発言が未要約。
  const lastSummary = summaries[summaries.length - 1];
  let unsummarizedStart = 0;
  if (lastSummary) {
    const idx = allMessages.findIndex((m) => m.id === lastSummary.coversUpToMessageId);
    // coversUpToMessageId の発言が見つからない場合(異常系)は全体を未要約として扱う
    unsummarizedStart = idx === -1 ? 0 : idx + 1;
  }
  const unsummarized = allMessages.slice(unsummarizedStart);

  const triggerCount = Math.max(1, settings.summaryTriggerCount || 40);
  const recentCount = Math.max(1, settings.recentMessageCount || 30);

  if (!force) {
    // 自動実行: 未要約発言数がトリガーを超えていなければ何もしない
    if (unsummarized.length <= triggerCount) return null;
  } else if (unsummarized.length === 0) {
    // 手動実行: 未要約の発言が1件も無ければ何も抽出しない(「新しい記憶はありませんでした」相当)
    return { summaryCreated: false, memoriesAdded: 0, pinnedConflicts: [] };
  }

  // 直近 recentMessageCount 件はプロンプトに生ログとして入るため残し、それより古い部分を要約する
  // (Summaryとして保存する範囲。手動実行でもここは自動実行と同じにする)
  const toSummarize = unsummarized.slice(0, Math.max(0, unsummarized.length - recentCount));
  if (!force && toSummarize.length === 0) return null;

  // 記憶抽出の対象範囲: 自動実行は要約対象と同じ(toSummarize)。
  // 手動実行は未要約の全発言(直近 recentMessageCount 件も含む)を対象にする。
  const extractionTarget = force ? unsummarized : toSummarize;

  // ---- 名前⇔ID対応(subjects のマッピング用) ----
  const memberCharacters = characters.filter((c) => room.memberIds.includes(c.id));
  const idByName = new Map(memberCharacters.map((c) => [c.name, c.id]));
  const nameById = new Map(memberCharacters.map((c) => [c.id, c.name]));

  // ---- 既存の有効な記憶(矛盾検出用) ----
  const enabledMemories = allMemories.filter((m) => !m.disabled);

  // ---- 兼用プロンプトを組み立てて1回だけ呼ぶ ----
  // summarizeCount: 抽出対象のうち先頭何件が「要約対象の範囲」か(手動実行で直近分まで含む場合、
  // 直近分は要約には含めず記憶抽出のみ行う。プロンプト側で範囲を書き分ける)
  const prompt = buildExtractionPrompt(extractionTarget, enabledMemories, nameById, toSummarize.length);
  const raw = await client.generateText(prompt);
  const parsed = parseExtractionResponse(raw);
  if (!parsed) return null;
  // 要約対象の範囲が無い場合(手動実行で直近分しか未要約が無いケース)は summary は空でよい
  const expectSummary = toSummarize.length > 0;
  if (expectSummary && !parsed.summary.trim()) return null;

  // ---- 記憶候補をMemoryInputへ変換 ----
  const newMemories: MemoryInput[] = [];
  const contradictedIds = new Set<string>();
  const pinnedConflicts: PinnedConflict[] = [];

  for (const candidate of parsed.memories) {
    const type = candidate.type === "relationship" ? "relationship" : "fact";
    const content = (candidate.content ?? "").trim();
    if (!content) continue;

    // subjects(名前)→ subjectIds(キャラID / "user")。ルームメンバーに解決できない名前は捨てる
    const subjectIds = (candidate.subjects ?? [])
      .map((name) => (name === "ユーザー" || name === "user" ? "user" : idByName.get(name)))
      .filter((id): id is string => !!id);
    if (subjectIds.length === 0) continue;

    // sources(発言番号・1始まり)→ sourceMessageIds。不正な番号は無視し、1件も無ければ抽出範囲全体を出どころとする
    const sourceMessageIds = (candidate.sources ?? [])
      .filter((n) => Number.isInteger(n) && n >= 1 && n <= extractionTarget.length)
      .map((n) => extractionTarget[n - 1].id);
    if (sourceMessageIds.length === 0) {
      sourceMessageIds.push(extractionTarget[extractionTarget.length - 1].id);
    }

    // contradicts("M番号")→ 既存記憶ID。pinnedの記憶は自動無効化せず確認要求に回す(仕様書6.3)
    for (const label of candidate.contradicts ?? []) {
      const match = /^M(\d+)$/.exec(String(label).trim());
      if (!match) continue;
      const index = Number(match[1]) - 1;
      const target = enabledMemories[index];
      if (!target) continue;
      if (target.pinned) {
        pinnedConflicts.push({
          pinnedMemoryId: target.id,
          pinnedContent: target.content,
          newContent: content,
        });
      } else {
        contradictedIds.add(target.id);
      }
    }

    newMemories.push({
      roomId,
      type,
      subjectIds,
      content,
      sourceMessageIds,
    });
  }

  // ---- 現在その場にいる(active/listening)キャラを presentCharacterIds として記録 ----
  const presentCharacterIds = states
    .filter((s) => s.presence !== "absent")
    .map((s) => s.characterId);

  // ---- 1トランザクションで保存 ----
  // 要約対象の範囲が無い場合(手動実行で直近分しか未要約が無いケース)は要約を保存しない
  await saveSummaryAndMemories({
    roomId,
    summaryText: expectSummary ? parsed.summary.trim() : undefined,
    coversUpToMessageId: expectSummary ? toSummarize[toSummarize.length - 1].id : undefined,
    presentCharacterIds,
    newMemories,
    disableMemoryIds: Array.from(contradictedIds),
  });

  return {
    summaryCreated: expectSummary,
    memoriesAdded: newMemories.length,
    pinnedConflicts,
  };
}

/**
 * 要約と記憶抽出を1つのJSONで出力させる兼用プロンプト。
 * 既存記憶には「M1」形式の番号を振り、矛盾があればその番号を返させる。
 *
 * @param logMessages 記憶抽出の対象となる会話ログ全体(自動実行では要約対象と同じ範囲、
 *   手動実行では未要約の全発言=直近分も含む)
 * @param summarizeCount logMessages のうち先頭何件が「要約対象の範囲」か。
 *   自動実行では常に logMessages.length と等しい(全体を要約する)。
 *   手動実行で直近分まで抽出対象に含めた場合はそれより小さくなり、
 *   直近分は要約には含めず記憶抽出のみ行う(要約に直近分まで含めると、
 *   会話プロンプト側で生ログと要約が二重になるため)。0の場合は要約自体を作らない。
 */
function buildExtractionPrompt(
  logMessages: Message[],
  enabledMemories: Memory[],
  nameById: Map<string, string>,
  summarizeCount: number,
): string {
  const logLines = logMessages.map((m, i) => `${i + 1}. ${formatMessageLine(m)}`);

  const memoryLines =
    enabledMemories.length === 0
      ? ["(なし)"]
      : enabledMemories.map((m, i) => {
          const subjects = m.subjectIds
            .map((id) => (id === "user" ? "ユーザー" : nameById.get(id) ?? "(不明)"))
            .join("、");
          return `M${i + 1}. [${m.type === "fact" ? "事実" : "関係性"}] ${m.content}(関連: ${subjects})${m.pinned ? "(固定)" : ""}`;
        });

  // 要約対象の範囲と記憶抽出の対象範囲が食い違う場合(手動実行で直近分も含めた場合)の補足指示
  const rangeNote: string[] =
    summarizeCount === 0
      ? [
          "",
          "## 範囲についての注意",
          "この会話ログはすべて直近の会話であり、要約の対象ではありません(この内容は別の形で既に保持されています)。",
          '"summary" フィールドは空文字("")にしてください。"memories"(記憶候補)の抽出のみ会話ログ全体を対象に行ってください。',
        ]
      : summarizeCount < logMessages.length
        ? [
            "",
            "## 範囲についての注意",
            `会話ログのうち 1〜${summarizeCount} 番目が「要約対象の範囲」、${summarizeCount + 1}〜${logMessages.length} 番目は「直近の会話(既に別の形で保持されているため要約には含めない範囲)」です。`,
            `"summary" フィールドには要約対象の範囲(1〜${summarizeCount} 番目)の内容のみを反映し、直近の会話の内容は含めないでください。`,
            '"memories"(記憶候補)の抽出は会話ログ全体を対象にしてかまいません。',
          ]
        : [];

  return [
    "あなたはチャットルームの会話ログを整理するアシスタントです。",
    "以下の会話ログを読み、(1)要約 と (2)長期記憶の候補の抽出 を同時に行ってください。",
    "",
    "## 出力形式",
    "次のJSONオブジェクトのみを出力してください。前置き・説明文・コードブロック記号は不要です。",
    "{",
    '  "summary": "会話の流れと重要な出来事が分かる3〜6文程度の要約",',
    '  "memories": [',
    "    {",
    '      "type": "fact または relationship",',
    '      "subjects": ["関係する人物の名前。ユーザーの場合は \\"ユーザー\\""],',
    '      "content": "記憶の内容を1文で",',
    '      "sources": [根拠となる発言の番号(数値)],',
    '      "contradicts": ["矛盾する既存記憶の番号(例 \\"M1\\")。なければ空配列"]',
    "    }",
    "  ]",
    "}",
    ...rangeNote,
    "",
    "## 記憶候補の基準",
    "- fact: 今後の会話でも参照すべき重要な事実(好み・苦手・予定・出来事の結果・判明した設定など)",
    "- relationship: 人物同士(またはユーザーとの)関係や感情の変化",
    "- 一時的な話題や些細な内容は含めないでください。該当がなければ空配列でかまいません。",
    "- 既存の記憶(上記「## 既存の記憶」)と重複する内容(表現を変えただけの言い換えを含む)は出力しないでください。",
    "",
    "## 既存の記憶",
    ...memoryLines,
    "",
    "## 会話ログ(番号付き)",
    ...logLines,
  ].join("\n");
}

/** 軽量モデルの応答からJSONを取り出してパースする(コードフェンス等の揺れに耐える) */
function parseExtractionResponse(raw: string): ExtractionResponse | null {
  const start = raw.indexOf("{");
  const end = raw.lastIndexOf("}");
  if (start === -1 || end === -1 || end <= start) return null;
  try {
    const parsed = JSON.parse(raw.slice(start, end + 1)) as Partial<ExtractionResponse>;
    if (typeof parsed.summary !== "string") return null;
    return {
      summary: parsed.summary,
      memories: Array.isArray(parsed.memories)
        ? parsed.memories.filter((m) => m && typeof m === "object")
        : [],
    };
  } catch {
    return null;
  }
}
