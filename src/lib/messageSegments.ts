// メッセージ本文の【 】(全角)行動描写インライン記法(機能変更: 位置保持のインライン方式)
// 旧仕様では送信時に【 】部分を抜き出してMessage.actionに分離保存していたが、
// この方式はやめ、テキストは一切加工せずそのまま保存する。
// 【 】はセリフの前・途中・後どこにあってもよく、表示側(吹き出しの中)で
// この関数を使ってセグメントに分割し、出現順どおりにインライン表示する。

export type MessageSegmentKind = "dialogue" | "action";

export interface MessageSegment {
  kind: MessageSegmentKind;
  text: string;
}

const ACTION_BRACKET_RE = /【([^】]*)】/g;

/**
 * テキストを【 】の外側(dialogue)と内側(action)のセグメントに、出現順を保ったまま分割する純粋関数。
 * 空セグメント(前後空白のみ、または中身が空の【】)は除外する。全角【】のみ対応。入れ子には対応しない。
 * レンダリング・エクスポート等、原文の【】をUI上意味づけして扱いたい箇所から共通で使う。
 */
export function splitMessageSegments(raw: string): MessageSegment[] {
  const segments: MessageSegment[] = [];
  let lastIndex = 0;

  for (const match of raw.matchAll(ACTION_BRACKET_RE)) {
    const matchIndex = match.index ?? 0;
    const before = raw.slice(lastIndex, matchIndex).trim();
    if (before) segments.push({ kind: "dialogue", text: before });

    // AIが行動描写の文末に句点(。)を付けてしまう生成傾向があるため、表示時に除去する。
    // 感嘆符(！)・疑問符(？)・三点リーダー(…)は表現として意図的に使われうるため対象外。
    const inner = match[1].trim().replace(/。+$/, "").trim();
    if (inner) segments.push({ kind: "action", text: inner });

    lastIndex = matchIndex + match[0].length;

    // 【 】の外側(直後)に単独で句点が続くケースも同じ生成傾向の一部のため除去する。
    // 例:「それは【少し笑って】。冗談だよ」→ 】の直後の「。」を読み飛ばす。
    while (raw[lastIndex] === "。") {
      lastIndex += 1;
    }
  }

  const rest = raw.slice(lastIndex).trim();
  if (rest) segments.push({ kind: "dialogue", text: rest });

  return segments;
}

/**
 * 表示用にセグメント一式を組み立てる。
 * text を splitMessageSegments で分割したうえで、旧仕様の分離保存データ(message.action。
 * 過去にactionフィールドへ分離保存されたメッセージや、AI生成のaction補足)が残っている場合は
 * 後方互換として末尾にactionセグメントを追加する。
 */
export function buildDisplaySegments(message: { text: string; action?: string }): MessageSegment[] {
  const segments = splitMessageSegments(message.text);
  const legacyAction = message.action?.trim();
  if (legacyAction) segments.push({ kind: "action", text: legacyAction });
  return segments;
}
