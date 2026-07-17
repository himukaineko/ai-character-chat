// 会話生成サービス(仕様書9章)
// プロンプト構築 → LLM呼び出し → 生成後チェック(9.4) → DB保存(トランザクション)までを一括で担う。
// ルームのメンバー・記憶・要約・直近ログをDBから集めてプロンプトを組み立て、
// 生成結果を検証してからメッセージとして保存する。
import { db } from "../db";
import type { Message, Room, UserProfile, World } from "../types";
import { loadAppSettings, loadUserProfile } from "../lib/settings";
import {
  addEditedMessage,
  addTopicMessage,
  addUserMessage,
  deleteBatch,
  listMessages,
  saveGeneratedBatch,
} from "../lib/messages";
import { listMemories, listSummaries } from "../lib/memories";
import { createMainLLMClient } from "./createClient";
import {
  buildConversationPrompt,
  filterIncludedMembers,
  isSingleReplyTrigger,
  type ConversationTrigger,
  type RegenerateOption,
  type RoomMemberInfo,
} from "./promptBuilder";
import { containsAnyWord, runPostCheck, type PostCheckContext, type PostCheckResult } from "./postCheck";
import { buildNameCandidate } from "./nameResolver";
import { CONVERSATION_SCHEMA } from "./schema";
import { LLMError, type GeneratedMessage, type LLMClient } from "./types";

export interface GenerateResult {
  batchId: string;
  messages: Message[];
}

/** ルームの生成に必要な文脈をDBからまとめて読み込む */
async function loadRoomContext(roomId: string) {
  const [room, characters, states, memories, summaries, allMessages] = await Promise.all([
    db.rooms.get(roomId),
    db.characters.toArray(),
    db.roomCharacterStates.where("roomId").equals(roomId).toArray(),
    listMemories(roomId),
    listSummaries(roomId),
    listMessages(roomId),
  ]);
  if (!room) {
    throw new Error("ルームが見つかりません");
  }

  // 機能追加: ルームにワールドが紐づいていれば読み込む(未紐づけならundefinedのまま)
  const world: World | undefined = room.worldId ? await db.worlds.get(room.worldId) : undefined;

  const charactersById = new Map(characters.map((c) => [c.id, c]));
  const members: RoomMemberInfo[] = room.memberIds
    .map((id) => {
      const character = charactersById.get(id);
      const state = states.find((s) => s.characterId === id);
      if (!character || !state) return null;
      return { character, state };
    })
    .filter((m): m is RoomMemberInfo => m !== null);

  return { room, members, memories, summaries, allMessages, world };
}

/**
 * 機能追加: このルームで使うユーザー設定を決定する。
 * ワールドが紐づいていて、かつそのワールドが専用ユーザー設定を使う設定なら、そちらを優先する。
 * そうでなければ従来どおりグローバル設定(loadUserProfile)を使う。
 */
function resolveRoomUserProfile(world: World | undefined): UserProfile {
  if (world && world.useCustomUserProfile) {
    return world.userProfile;
  }
  return loadUserProfile();
}

function buildPostCheckContext(
  room: Room,
  members: RoomMemberInfo[],
  trigger: ConversationTrigger,
): PostCheckContext {
  const included = filterIncludedMembers(members);
  const ngWordsByCharacter = new Map<string, string[]>();
  for (const m of included) {
    ngWordsByCharacter.set(m.character.name.trim(), m.character.ngWords);
  }
  return {
    narrationLevel: room.narrationLevel,
    includedCandidates: included.map((m) => buildNameCandidate(m.character)),
    listeningCandidates: included
      .filter((m) => m.state.presence === "listening")
      .map((m) => buildNameCandidate(m.character)),
    absentCandidates: members
      .filter((m) => m.state.presence === "absent")
      .map((m) => buildNameCandidate(m.character)),
    ngWordsByCharacter,
    singleReplyMode: isSingleReplyTrigger(members, trigger),
  };
}

/** NGワードを含む発言だけを1回だけ再生成する。再試行後もNGワードが残る場合はその発言を除去する。 */
async function resolveNgWordHits(
  client: LLMClient,
  check: PostCheckResult,
): Promise<GeneratedMessage[]> {
  if (check.ngWordHits.length === 0) return check.messages;

  const slots: (GeneratedMessage | null)[] = check.messages.slice();
  for (const hit of check.ngWordHits) {
    const original = check.messages[hit.index];
    try {
      const rewritten = await regenerateSingleLine(client, original, hit.words);
      if (rewritten && !containsAnyWord(rewritten.text, hit.words)) {
        slots[hit.index] = rewritten;
      } else {
        // 再試行(1回)後もNGワードを含む場合は、その発言のみ除去する
        slots[hit.index] = null;
      }
    } catch {
      slots[hit.index] = null;
    }
  }
  return slots.filter((m): m is GeneratedMessage => m !== null);
}

async function regenerateSingleLine(
  client: LLMClient,
  original: GeneratedMessage,
  ngWords: string[],
): Promise<GeneratedMessage | null> {
  const text = await client.generateText(
    [
      "以下は会話中の1発言です。話者・意図・トーンを保ったまま、指定した言葉を使わずに書き換えてください。",
      "出力は書き換えた本文のセリフだけを1行で返してください。前置きや説明、記号での装飾は不要です。",
      `話者: ${original.speaker}`,
      `元の発言: ${original.text}`,
      `使ってはいけない言葉: ${ngWords.join("、")}`,
    ].join("\n"),
  );
  const rewrittenText = text.trim();
  if (!rewrittenText) return null;
  return { ...original, text: rewrittenText };
}

/**
 * 会話バッチを1回生成してDBに保存する(内部関数)。
 * 生成後チェック(9.4)で不正なバッチは1回だけ自動リトライし、それでも失敗すればエラーを投げる。
 */
async function generateBatch(
  roomId: string,
  trigger: ConversationTrigger,
  regenerateOptions?: RegenerateOption[],
): Promise<GenerateResult> {
  const settings = loadAppSettings();
  // APIキー未設定はここでLLMErrorが投げられる(GeminiClientのコンストラクタでチェック)
  const client = createMainLLMClient(settings);

  const { room, members, memories, summaries, allMessages, world } = await loadRoomContext(roomId);
  // 機能追加: ワールドが専用ユーザー設定を使う設定ならそちらを、そうでなければグローバル設定を使う
  const userProfile = resolveRoomUserProfile(world);
  const recentCount = Math.max(1, settings.recentMessageCount || 30);
  const recentMessages = allMessages.slice(-recentCount);

  const prompt = buildConversationPrompt({
    room,
    members,
    userProfile,
    memories,
    summaries,
    recentMessages,
    trigger,
    regenerateOptions,
    world,
  });

  const ctx = buildPostCheckContext(room, members, trigger);

  // 1回目の生成
  let generated = await client.generateConversation(prompt, CONVERSATION_SCHEMA);
  let check = runPostCheck(generated, ctx);

  if (!check.ok) {
    // 不参加キャラ混入・未知の話者などはバッチ全体を破棄し、1回だけ自動リトライする(仕様書9.4 / 13章)
    generated = await client.generateConversation(prompt, CONVERSATION_SCHEMA);
    check = runPostCheck(generated, ctx);
    if (!check.ok) {
      throw new LLMError(
        "invalidResponse",
        `会話の生成に失敗しました(${check.reason ?? "不明な理由"})。もう一度お試しください。`,
      );
    }
  }

  const finalMessages = await resolveNgWordHits(client, check);

  if (finalMessages.length === 0) {
    throw new LLMError(
      "invalidResponse",
      "生成結果が0件になってしまいました。もう一度お試しください。",
    );
  }

  const saved = await saveGeneratedBatch(roomId, finalMessages);
  return { batchId: saved[0].batchId, messages: saved };
}

/**
 * トピック投入(仕様書5.2)。トピックをログに保存したうえで、
 * その話題をきっかけに自動で1バッチ生成する(トピック専用トリガーを使う)。
 * 生成に失敗した場合もトピック自体は残る(エラーは呼び出し側でキャッチして表示する)。
 */
export async function submitTopic(
  roomId: string,
  text: string,
): Promise<{ topicMessage: Message; batch: GenerateResult }> {
  const trimmed = text.trim();
  if (!trimmed) throw new Error("トピックが空です");
  const topicMessage = await addTopicMessage(roomId, trimmed);
  const batch = await generateBatch(roomId, { kind: "topic", text: trimmed });
  return { topicMessage, batch };
}

/**
 * ユーザー発言(仕様書5.3)。発言をログに保存したうえで、自動で1バッチ生成しキャラの反応を作る。
 * 生成に失敗した場合もユーザーの発言自体は残る(エラーは呼び出し側でキャッチして表示する)。
 * 位置保持のインライン方式(機能変更: 行動描写ルール): 【 】(全角)で囲んだ行動描写は
 * 分離せず、テキストにそのまま含めて保存・送信する。【】のみの入力(セリフなし)も
 * 通常のテキストとして許容される(空でなければ送信できる)。
 */
export async function submitUserMessage(
  roomId: string,
  text: string,
): Promise<{ userMessage: Message; batch: GenerateResult }> {
  const trimmedText = text.trim();
  if (!trimmedText) throw new Error("発言が空です");
  const userMessage = await addUserMessage(roomId, trimmedText);
  const batch = await generateBatch(roomId, {
    kind: "userMessage",
    text: trimmedText,
  });
  return { userMessage, batch };
}

/** 「次の会話を生成」ボタン(観察モード、仕様書5.1) */
export async function generateNextBatch(roomId: string): Promise<GenerateResult> {
  return generateBatch(roomId, { kind: "continue" });
}

/**
 * メッセージ編集機能: 編集されたキャラのセリフ・地の文を元の話者のまま再投稿し、
 * そこから会話の続きを生成する。生成に失敗しても編集後の発言自体は残る
 * (submitUserMessageと同じ方針。エラーは呼び出し側でキャッチして表示する)。
 */
export async function submitEditedMessage(
  roomId: string,
  speaker: string,
  type: "dialogue" | "narration",
  text: string,
): Promise<{ editedMessage: Message; batch: GenerateResult }> {
  const trimmed = text.trim();
  if (!trimmed) throw new Error("発言が空です");
  const editedMessage = await addEditedMessage(roomId, speaker, type, trimmed);
  const batch = await generateBatch(roomId, { kind: "continue" });
  return { editedMessage, batch };
}

/** 直前の生成を取り消す(仕様書7.1): 同一batchIdのメッセージをまとめて削除する */
export async function undoLastBatch(roomId: string): Promise<void> {
  const messages = await listMessages(roomId);
  if (messages.length === 0) return;
  const lastBatchId = messages[messages.length - 1].batchId;
  await deleteBatch(roomId, lastBatchId);
}

/**
 * 再生成(仕様書7.3): 直前がAI生成バッチ(dialogue/narration)であればそれを削除してから作り直す。
 * 直前がトピック投入・ユーザー発言のみの場合は、それを消さずに新しいバッチを追加生成する。
 */
export async function regenerateLastBatch(
  roomId: string,
  options?: RegenerateOption[],
): Promise<GenerateResult> {
  const messages = await listMessages(roomId);
  const last = messages[messages.length - 1];
  if (last && (last.type === "dialogue" || last.type === "narration")) {
    await deleteBatch(roomId, last.batchId);
  }
  return generateBatch(roomId, { kind: "continue" }, options);
}
