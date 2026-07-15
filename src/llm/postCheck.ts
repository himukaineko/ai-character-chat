// 生成後チェック(仕様書9.4)
// スキーマで「形」は保証されるが「中身」は保証されないため、生成結果を必ずここで検証する。
// 純粋関数として実装し、DBアクセスやAPI呼び出しはconversationService側で行う。
import type { NarrationLevel } from "../types";
import type { GeneratedBatch, GeneratedMessage } from "./types";
import { resolveSpeakerName, type NameCandidate } from "./nameResolver";

export interface PostCheckContext {
  narrationLevel: NarrationLevel;
  /** 参加+聞いている(=プロンプトに含めた)キャラの名前解決candidate一覧 */
  includedCandidates: NameCandidate[];
  /** そのうち「聞いている」キャラのcandidate一覧(1バッチ1発言までに間引く対象) */
  listeningCandidates: NameCandidate[];
  /** 不参加キャラのcandidate一覧(混入していないかの明示チェック用) */
  absentCandidates: NameCandidate[];
  /** キャラの正式名 → そのキャラのngWords */
  ngWordsByCharacter: Map<string, string[]>;
  /**
   * 機能追加: 1対1ルームでのユーザー発言時はtrue。
   * このときdialogueが2件以上あれば最初の1件だけを残して間引く(narrationは対象外)。
   */
  singleReplyMode: boolean;
}

export interface NgWordHit {
  index: number;
  words: string[];
}

export interface PostCheckResult {
  /** falseの場合、バッチ全体を破棄して再生成が必要 */
  ok: boolean;
  reason?: string;
  /** ok=trueのときの、間引き・除去を適用済みのメッセージ一覧 */
  messages: GeneratedMessage[];
  /** NGワードを含む発言のインデックス一覧(該当行のみ再生成する対象) */
  ngWordHits: NgWordHit[];
}

/**
 * 生成後チェック本体。
 * 0. speaker をキャラの正式名に解決する(ニックネーム・括弧付き読み仮名などの表記ゆれを吸収する)
 * 1. 不参加キャラ・未知の話者が speaker に含まれていないか → 含まれていたら ok:false(バッチ全体を破棄)
 * 2. narrationLevel が none なら narration を除去
 * 3. 「聞いている」キャラの2発言目以降を間引く
 * 4. 1対1ルームでのユーザー発言時は、dialogueを最初の1件だけに間引く(narrationは対象外)
 * 5. NGワードを含む発言を検出する(除去はせず、呼び出し側で該当行のみ再生成させる)
 */
export function runPostCheck(batch: GeneratedBatch, ctx: PostCheckContext): PostCheckResult {
  const allCandidates = [...ctx.includedCandidates, ...ctx.absentCandidates];
  const includedSet = new Set(ctx.includedCandidates.map((c) => c.canonicalName));
  const absentSet = new Set(ctx.absentCandidates.map((c) => c.canonicalName));
  const listeningSet = new Set(ctx.listeningCandidates.map((c) => c.canonicalName));

  // speakerを正式名に解決してから以降の処理を行う(解決できなければ元の文字列のまま扱う)
  let messages: GeneratedMessage[] = batch.messages.map((m) => {
    if (m.type !== "dialogue") return m;
    const resolved = resolveSpeakerName(m.speaker, allCandidates);
    return resolved ? { ...m, speaker: resolved } : m;
  });

  // バグ対策: プロンプトでdialogue限定と明記していても、AIがnarrationのtextにも
  // セリフ用の【 】(行動描写)記法を紛れ込ませてしまうことがある。
  // narrationはもともと文章全体が地の文なので、この記法は表示上不要な記号でしかない。
  // 中身の文章を失わないよう、括弧の文字だけを取り除き内容はそのまま残す
  // (dialogue側のsplitMessageSegmentsのような「中身を別セグメント化する」処理は、
  // 地の文の途中で表示が分断されてしまい narration の見た目には合わないため採用しない)。
  messages = messages.map((m) =>
    m.type === "narration" && /[【】]/.test(m.text)
      ? { ...m, text: m.text.replace(/[【】]/g, "") }
      : m,
  );

  for (const m of messages) {
    if (m.type !== "dialogue") continue;
    if (absentSet.has(m.speaker)) {
      return {
        ok: false,
        reason: `不参加のキャラクター「${m.speaker}」の発言が含まれていました`,
        messages: [],
        ngWordHits: [],
      };
    }
    if (!includedSet.has(m.speaker)) {
      return {
        ok: false,
        reason: `ルームメンバーに存在しない話者「${m.speaker}」の発言が含まれていました`,
        messages: [],
        ngWordHits: [],
      };
    }
  }

  // narrationLevel: none → narration除去
  if (ctx.narrationLevel === "none") {
    messages = messages.filter((m) => m.type !== "narration");
  }

  // 「聞いている」キャラは1バッチにつき1発言までに間引く
  const spokenCount = new Map<string, number>();
  messages = messages.filter((m) => {
    if (m.type !== "dialogue" || !listeningSet.has(m.speaker)) return true;
    const count = (spokenCount.get(m.speaker) ?? 0) + 1;
    spokenCount.set(m.speaker, count);
    return count <= 1;
  });

  // 機能追加: 1対1ルームでのユーザー発言時は、キャラの連投を防ぐためdialogueを最初の1件だけに間引く
  // (バッチ破棄ではなく間引きでよい。narrationは既存のnarrationLevel処理に任せてここでは触らない)
  if (ctx.singleReplyMode) {
    let dialogueKept = false;
    messages = messages.filter((m) => {
      if (m.type !== "dialogue") return true;
      if (!dialogueKept) {
        dialogueKept = true;
        return true;
      }
      return false;
    });
  }

  // NGワード検出(その発言者自身のngWordsに対してチェックする)
  const ngWordHits: NgWordHit[] = [];
  messages.forEach((m, index) => {
    const ngWords = ctx.ngWordsByCharacter.get(m.speaker) ?? [];
    const hit = ngWords.filter((w) => w.trim().length > 0 && m.text.includes(w));
    if (hit.length > 0) {
      ngWordHits.push({ index, words: hit });
    }
  });

  return { ok: true, messages, ngWordHits };
}

/** 生成された1発言がNGワードを含んでいないか単体で再チェックする(再生成後の確認用) */
export function containsAnyWord(text: string, words: string[]): boolean {
  return words.some((w) => w.trim().length > 0 && text.includes(w));
}
