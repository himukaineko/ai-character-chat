// アプリ全体で使うデータモデルの型定義
// 仕様書4章「データモデル」を基準とする。フィールドの削除・意味変更は禁止。

/** 口調サンプル(状況+セリフのペア) */
export interface SpeechSample {
  situation: string; // 例: 朝の挨拶 / 怒ったとき / 照れたとき
  text: string;
}

/** キャラクター(グローバル / ライブラリ) */
export interface Character {
  id: string; // uuid
  name: string;
  nicknames: string[]; // 呼び名・ニックネーム
  firstPerson: string; // 一人称
  secondPerson: string; // 二人称
  speechStyle: string; // 口調
  personality: string; // 性格
  conversationStyle: string; // 会話スタイル
  background: string; // 背景
  occupation: string; // 職業・所属・立場
  likes: string[];
  dislikes: string[];
  dreamsWorriesSecrets: string; // 夢・悩み・秘密
  appearance: string; // 外見(テキスト)
  iconImage?: Blob; // アイコン画像(顔絵)
  portraitImage?: Blob; // イメージイラスト1枚目(旧仕様の「立ち絵」。後方互換のため残す)
  /**
   * イメージイラスト2枚目以降(機能追加: ギャラリー方式)。
   * 追加前に作成された既存キャラはこのフィールドを持たない(DBマイグレーションは行わない)ため、
   * 読み込み側は必ず undefined → 空配列として扱うこと。表示・保存では直接参照せず
   * getCharacterGallery() を経由すること。
   */
  galleryImages?: Blob[];
  relationToUser: string; // ユーザーとの関係(デフォルト)
  hardConstraints: string; // 絶対に崩してほしくない設定
  ngWords: string[]; // 言わせたくない言葉・避けたい表現
  speechSamples: SpeechSample[]; // 口調サンプル
  freeNotes: string; // 自由記述(昇格記憶の受け皿にもなる)
  createdAt: number;
  updatedAt: number;
}

/**
 * キャラの画像ギャラリーを「イメージイラスト」として1つの配列にまとめて返す表示用ヘルパー。
 * 表示順は 旧仕様のportraitImage(あれば1枚目) → galleryImages の順とする(後方互換)。
 * iconImage(顔アイコン)はここには含めない。呼び出し側で必要に応じて別途扱うこと。
 */
export function getCharacterGallery(
  character: Pick<Character, "portraitImage" | "galleryImages">,
): Blob[] {
  const images: Blob[] = [];
  if (character.portraitImage) images.push(character.portraitImage);
  if (character.galleryImages) images.push(...character.galleryImages);
  return images;
}

/** ナレーションレベル */
export type NarrationLevel = "none" | "light" | "novel" | "narrator";

/** 返事の長さ */
export type ReplyLength = "short" | "normal" | "long";

/** ルーム(= 世界線) */
export interface Room {
  id: string;
  name: string;
  worldSetting: string; // 世界観・舞台設定メモ
  narrationLevel: NarrationLevel;
  useRealTime: boolean; // 現実の時間帯を反映するか
  memberIds: string[]; // 参加キャラのCharacter.id
  /**
   * 返事の長さ(機能追加)。
   * 追加前に作成された既存ルームはこのフィールドを持たない(DBマイグレーションは行わない)ため、
   * 読み込み側は必ず undefined → "normal" として扱うこと。直接 room.replyLength を参照せず
   * resolveReplyLength() を経由すること。
   */
  replyLength?: ReplyLength;
  /**
   * 紐づくワールド(機能追加: ワールド機能)。
   * 追加前に作成された既存ルームはこのフィールドを持たない。未紐づけの場合は undefined。
   * ワールドが削除された場合もここが undefined に戻されるだけで、ルームやログは無傷のまま残る。
   */
  worldId?: string;
  /**
   * 表紙イラスト(機能追加: ルームの表紙)。
   * ホーム画面のカードに「本の表紙」として表示する任意の画像1枚。トリミングは行わない。
   * 追加前に作成された既存ルームはこのフィールドを持たない(DBマイグレーションは行わない)ため、
   * 読み込み側は必ず undefined → 表紙なしとして扱うこと。ルーム画面(チャット)では使用しない。
   */
  coverImage?: Blob;
  /**
   * 表紙イラストのフォーカルポイント(機能追加: 表示位置選択)。
   * x/yは0〜100のパーセンテージで、CSSのobject-positionにそのまま使える値。
   * 追加前に作成された既存ルーム・coverFocalPoint未設定のルームはこのフィールドを持たないため、
   * 読み込み側は必ず undefined → 中央(50/50)として扱うこと。直接参照せず
   * resolveCoverFocalPoint() を経由すること。
   */
  coverFocalPoint?: { x: number; y: number };
  /**
   * ナレーター・地の文のカスタム文体設定(機能追加)。
   * 「軽快なテンポで」「ツッコミ役のように」「二人称視点で」のような自由記述で、
   * narrationLevel(地の文の"量")とは別に文体・語り口を指定できるようにする。
   * 追加前に作成された既存ルームはこのフィールドを持たない(DBマイグレーションは行わない)ため、
   * 読み込み側は必ず undefined → 未設定(指定なし)として扱うこと。空文字・undefinedのどちらも
   * 「カスタム指定なし」を意味し、プロンプトには何も追加しない。
   */
  narratorStyle?: string;
  createdAt: number;
  updatedAt: number;
}

/** replyLength未設定(既存ルーム)の場合は "normal" 扱いにする防御的デフォルト */
export function resolveReplyLength(replyLength: ReplyLength | undefined): ReplyLength {
  return replyLength ?? "normal";
}

/** coverFocalPoint未設定の場合は中央(50/50)扱いにする防御的デフォルト */
export function resolveCoverFocalPoint(
  coverFocalPoint: { x: number; y: number } | undefined,
): { x: number; y: number } {
  return coverFocalPoint ?? { x: 50, y: 50 };
}

/** キャラの参加状態 */
export type Presence = "active" | "listening" | "absent"; // 参加 / 聞いている / 不参加

/** ルーム内上書き(空文字は上書きなし) */
export interface RoomCharacterOverrides {
  occupation?: string;
  relationToUser?: string;
  roleInWorld?: string;
  extraNotes?: string;
}

/** ルーム内のキャラ状態(Room × Character ごとに1つ) */
export interface RoomCharacterState {
  roomId: string;
  characterId: string;
  presence: Presence;
  overrides: RoomCharacterOverrides;
}

/** メッセージの種別 */
export type MessageType = "dialogue" | "narration" | "user" | "topic";

/** メッセージ */
export interface Message {
  id: string;
  roomId: string;
  batchId: string; // 同じAI生成で出たものは同じbatchId(undo単位)
  speaker: string; // キャラ名 / "user" / "narration"
  type: MessageType;
  text: string;
  action?: string; // 動作・表情の補足(旧仕様の分離保存フィールド。新規のユーザー発言では使わずtext内に【】でインライン保存する。AI生成の構造化出力では引き続き使われることがある)
  createdAt: number;
}

/** 記憶の種別 */
export type MemoryType = "fact" | "relationship";

/** 記憶(すべてルーム所属) */
export interface Memory {
  id: string;
  roomId: string;
  type: MemoryType;
  subjectIds: string[]; // 関係するキャラID(ユーザーは "user")
  content: string; // 例: 「美花は辛いものが苦手」
  sourceMessageIds: string[]; // 出どころの発言ID
  disabled: boolean; // 巻き戻しで無効化されたらtrue(ソフトデリート)
  pinned: boolean; // ユーザーが手動固定した記憶は自動整理の対象外
  createdAt: number;
}

/** 会話要約(ルーム所属) */
export interface Summary {
  id: string;
  roomId: string;
  coversUpToMessageId: string; // どこまでの会話を要約したか
  presentCharacterIds: string[]; // 要約対象期間にその場にいたキャラ
  text: string;
  createdAt: number;
}

/**
 * ユーザー設定
 * ユーザー自身は自分で発言するため口調・性格は持たず、
 * キャラ側が参照する情報(扱われ方・背景・外見)を持つ
 */
export interface UserProfile {
  name: string;
  calledAs: string; // 呼ばれ方
  treatment: string; // キャラからどう扱われたいか(例: 対等な友人として)
  background: string; // 背景・プロフィール
  appearance: string; // 外見
  dislikedTopics: string[];
  preferredMood: string; // 会話で重視したい雰囲気
}

/**
 * 一方向ぶんの関係詳細(機能追加: 関係の方向性)。
 * A→BとB→Aで別々に持つことで、「AはBを何と呼ぶか」「AはBをどう思っているか」を
 * 逆方向と混同せずAIに伝えられるようにする。
 */
export interface RelationDirection {
  callName: string; // 呼び方(例: 「ボブ」「先輩」「あんた」)
  attitude: string; // 態度・感情(例: 「頭が上がらない。恩がある」)
}

/**
 * ワールド内のキャラ同士の関係(機能追加: ワールド機能)。
 * 1ペアにつき1つ。characterIdA/Bの順序に意味はない(A-BとB-Aは同一ペア扱い)。
 */
export interface WorldRelation {
  characterIdA: string;
  characterIdB: string;
  description: string; // 関係の共通ラベル・説明。例: 「幼なじみ。AはBに頭が上がらない」
  /**
   * 機能追加: characterIdA→characterIdB 方向の詳細(呼び方・態度)。
   * 追加前に作成された既存の関係はこのフィールドを持たない。読み込み側は必ず
   * undefined → 「方向つき情報なし」として扱うこと(descriptionのみで従来どおり表示・出力する)。
   */
  aToB?: RelationDirection;
  /** 機能追加: characterIdB→characterIdA 方向の詳細(呼び方・態度)。上記と同様に任意。 */
  bToA?: RelationDirection;
}

/**
 * ワールド(世界線グループ、機能追加)。
 * 「このキャラたちは同じ世界線」というフォルダ分けと、キャラ同士の関係・
 * ワールド専用のユーザー設定を持つ。ルームは worldId で任意に紐づけられる。
 */
export interface World {
  id: string; // uuid
  name: string;
  description: string; // 世界観の説明メモ(空可)
  characterIds: string[]; // 所属キャラ(同じキャラが複数ワールドに入ってもよい)
  relations: WorldRelation[]; // キャラ同士の関係
  useCustomUserProfile: boolean; // trueならこのワールド専用のユーザー設定を使う
  userProfile: UserProfile; // ワールド専用ユーザー設定(useCustomUserProfile=falseなら未使用)
  createdAt: number;
  updatedAt: number;
}


/** チャット画面の文字サイズ(表示カスタム機能) */
export type ChatFontSize = "small" | "normal" | "large";

/** chatBackground未設定時のデフォルト背景色(現状の背景色 zinc-950 相当) */
export const DEFAULT_CHAT_BACKGROUND = "#09090b";

/**
 * チャット配色テーマ(機能追加: 配色テーマ方式)。
 * 背景色だけでなく吹き出し・文字色・行動描写・narrationの色をひとまとめに切り替える。
 * 実際の色定義は lib/chatDisplay.ts の CHAT_THEME_TOKENS を参照すること。
 */
export type ChatTheme = "dark" | "navy" | "light" | "natural";

/** アプリ設定 */
export interface AppSettings {
  apiKey: string; // localStorageに保存(IndexedDBではなく)
  mainModelId: string; // デフォルト "gemini-3.5-flash"
  liteModelId: string; // デフォルト "gemini-3.1-flash-lite"
  recentMessageCount: number; // プロンプトに入れる直近発言数(デフォルト30)
  summaryTriggerCount: number; // 要約を走らせる発言数間隔(デフォルト40)
  /**
   * チャット表示カスタム(機能追加)。
   * 追加前に保存された既存設定はこれらのフィールドを持たない(localStorageのマイグレーションは行わない)ため、
   * 読み込み側は必ず undefined → デフォルト値として扱うこと。直接 settings.chatFontSize / chatBackground / chatTheme を
   * 参照せず resolveChatFontSize() / resolveChatTheme() を経由すること。
   */
  chatFontSize?: ChatFontSize; // デフォルト "normal"
  /**
   * 旧仕様の自由指定背景色(機能変更: 配色テーマ方式に置き換え済み)。
   * 新規保存はもう行わないが、既存ユーザーの保存値からテーマへ移行するために型としては残す。
   * 表示には直接使わず、resolveChatTheme() の移行ロジックの入力としてのみ参照すること。
   */
  chatBackground?: string;
  /**
   * チャット配色テーマ(機能追加)。
   * 追加前に保存された既存設定はこのフィールドを持たない。読み込み側は必ず
   * resolveChatTheme() を経由すること(旧chatBackgroundからの移行を含む)。
   */
  chatTheme?: ChatTheme; // デフォルト "dark"
}

/** chatFontSize未設定の場合は "normal" 扱いにする防御的デフォルト */
export function resolveChatFontSize(chatFontSize: ChatFontSize | undefined): ChatFontSize {
  return chatFontSize ?? "normal";
}

/** chatBackground未設定(または空文字)の場合は現状の背景色扱いにする防御的デフォルト(旧仕様。移行判定にのみ使用) */
export function resolveChatBackground(chatBackground: string | undefined): string {
  return chatBackground && chatBackground.trim() !== "" ? chatBackground : DEFAULT_CHAT_BACKGROUND;
}

/**
 * chatTheme未設定の場合の防御的デフォルト。
 * chatThemeが保存されていればそれを優先し、無ければ旧chatBackgroundの値から近いテーマへ移行する
 * (#0f172a→navy、それ以外の指定値→dark)。どちらも未設定なら"dark"(現状の見た目)を返す。
 */
export function resolveChatTheme(
  chatTheme: ChatTheme | undefined,
  chatBackground: string | undefined,
): ChatTheme {
  if (chatTheme) return chatTheme;
  if (chatBackground && chatBackground.trim() !== "") {
    return chatBackground === "#0f172a" ? "navy" : "dark";
  }
  return "dark";
}
