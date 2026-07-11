// 話者名の名前解決(不具合修正: 「ルームメンバーに存在しない話者」誤判定対策)
//
// キャラ名を「黒檀(こくたん)」のように読み仮名付きで登録した場合、AIはspeakerを
// 括弧を除いた「黒檀」で返してくることがある。従来の完全一致照合(Set.has)では
// これを「ルームメンバーに存在しない話者」と誤判定してしまうため、
// ニックネーム・括弧除去の両方を考慮した名前解決を行う。
import type { Character } from "../types";

/** 半角() / 全角()の両方の括弧とその中身を取り除く */
export function stripParenthetical(name: string): string {
  return name.replace(/[（(][^）)]*[）)]/g, "").trim();
}

/** 1キャラ分の名前解決candidate(正式名+照合対象の別名一覧) */
export interface NameCandidate {
  /** キャラの正式名(Character.name、前後空白trim済み) */
  canonicalName: string;
  /** ニックネーム一覧(前後空白trim済み、空文字は除外) */
  nicknames: string[];
  /** 正式名から括弧部分を除いた文字列(括弧が無ければcanonicalNameと同じ) */
  strippedCanonicalName: string;
}

/** Characterから名前解決candidateを組み立てる */
export function buildNameCandidate(character: Character): NameCandidate {
  const canonicalName = character.name.trim();
  const nicknames = character.nicknames.map((n) => n.trim()).filter((n) => n.length > 0);
  const strippedCanonicalName = stripParenthetical(canonicalName) || canonicalName;
  return { canonicalName, nicknames, strippedCanonicalName };
}

/**
 * 生成されたspeaker文字列を、キャラの正式名に解決する。
 * 前後空白をtrimしたうえで、次の順で照合する:
 *   1. 正式名との完全一致
 *   2. ニックネームとの一致
 *   3. 正式名から括弧部分(読み仮名など)を除いた文字列との一致
 *   4. 逆方向: speakerから括弧部分を除いた文字列と、正式名/括弧除去済み正式名との一致
 * どの候補にも解決できない場合はnullを返す。
 */
export function resolveSpeakerName(speaker: string, candidates: NameCandidate[]): string | null {
  const s = speaker.trim();
  if (!s) return null;

  // 1. 正式名との完全一致
  for (const c of candidates) {
    if (c.canonicalName === s) return c.canonicalName;
  }

  // 2. ニックネームとの一致
  for (const c of candidates) {
    if (c.nicknames.includes(s)) return c.canonicalName;
  }

  // 3. 正式名から括弧部分を除いた文字列との一致(例: 「黒檀(こくたん)」→「黒檀」)
  for (const c of candidates) {
    if (c.strippedCanonicalName !== c.canonicalName && c.strippedCanonicalName === s) {
      return c.canonicalName;
    }
  }

  // 4. 逆方向: speakerから括弧部分を除いた文字列と、正式名/括弧除去済み正式名との一致
  const sStripped = stripParenthetical(s);
  if (sStripped && sStripped !== s) {
    for (const c of candidates) {
      if (c.canonicalName === sStripped || c.strippedCanonicalName === sStripped) {
        return c.canonicalName;
      }
    }
  }

  return null;
}
