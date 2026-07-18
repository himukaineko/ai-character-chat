// ルーム画面(チャット、仕様書10.2)
// 会話コア(Phase 2): トピック投入 / 発言 / 次の会話を生成 / 再生成 / 戻る / 削除
// 記憶システム(Phase 3): 会話生成後のバックグラウンド要約+記憶抽出、記憶一覧、上書き編集
import { Fragment, useCallback, useEffect, useRef, useState, type CSSProperties } from "react";
import { useNavigate, useParams, Link } from "react-router-dom";
import { useAppStore } from "../store";
import { RoomFormModal } from "../components/RoomFormModal";
import { ConfirmDialog } from "../components/ConfirmDialog";
import { MemberBar } from "../components/room/MemberBar";
import { ChatMessageItem } from "../components/room/ChatMessageItem";
import { GameStatChangesRow } from "../components/room/GameStatChangesRow";
import { TypingIndicator } from "../components/room/TypingIndicator";
import { ChatInput, type InputMode } from "../components/room/ChatInput";
import { AUTO_GENERATE_MAX_COUNT } from "../lib/autoGenerate";
import { SidePanel } from "../components/room/SidePanel";
import { LogManageMenu } from "../components/room/LogManageMenu";
import {
  ExitImmersiveIcon,
  ImageIcon,
  ImmersiveIcon,
  PanelIcon,
  SettingsIcon,
  ThemeIcon,
  TrashIcon,
} from "../components/room/RoomBarIcons";
import { ErrorBanner } from "../components/room/ErrorBanner";
import { StillPromptModal } from "../components/room/StillPromptModal";
import {
  MemberDetailModal,
  type MemberDetailTab,
} from "../components/room/MemberDetailModal";
import type { GameStatChange, Memory, Message, Presence, RoomCharacterOverrides } from "../types";
import { resolveChatFontSize, resolveChatTheme, resolveGameMode } from "../types";
import {
  deleteLogAndSummary,
  deleteLogOnly,
  deleteSingleMessage,
  listMessages,
  resetRoomConversationData,
  rewindTo,
} from "../lib/messages";
import { listMemories, updateMemory } from "../lib/memories";
import { computeCurrentStats, listStatChanges } from "../lib/gameStats";
import { loadAppSettings, saveAppSettings, saveLastRoomId } from "../lib/settings";
import {
  CHAT_FONT_SIZE_VALUES,
  CHAT_THEME_OPTIONS,
  chatThemeToCssVars,
  nextChatTheme,
} from "../lib/chatDisplay";
import {
  generateNextBatch,
  regenerateLastBatch,
  submitEditedMessage,
  submitTopic,
  submitUserMessage,
  undoLastBatch,
} from "../llm/conversationService";
import {
  forceSummarizeAndExtract,
  maybeSummarizeAndExtract,
  type PinnedConflict,
  type SummarizeOutcome,
} from "../llm/memoryService";
import type { RegenerateOption } from "../llm/promptBuilder";
import { LLMError, LLM_ERROR_MESSAGES, type LLMErrorKind } from "../llm/types";

export function RoomPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const rooms = useAppStore((s) => s.rooms);
  const characters = useAppStore((s) => s.characters);
  const worlds = useAppStore((s) => s.worlds);
  const roomCharacterStates = useAppStore((s) => s.roomCharacterStates);
  const editRoom = useAppStore((s) => s.editRoom);
  const removeRoom = useAppStore((s) => s.removeRoom);
  const updateMemberState = useAppStore((s) => s.updateMemberState);
  // 没入モード(機能追加: チャットのみ表示): 上部バー・ナビを隠してチャット領域を広げる
  const immersiveMode = useAppStore((s) => s.immersiveMode);
  const setImmersiveMode = useAppStore((s) => s.setImmersiveMode);

  const [settingsOpen, setSettingsOpen] = useState(false);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [sidePanelOpen, setSidePanelOpen] = useState(false);
  const [stillPromptOpen, setStillPromptOpen] = useState(false);
  const [rewindTarget, setRewindTarget] = useState<Message | null>(null);
  const [editTarget, setEditTarget] = useState<Message | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Message | null>(null);
  // メッセージ編集機能: 「編集」確定後、巻き戻した元テキストを入力欄に1回だけ流し込む指示
  const [inputPrefill, setInputPrefill] = useState<{ text: string; mode: InputMode } | null>(null);
  // キャラのセリフ・地の文の編集中は元の話者を保持し、送信時にユーザー発言ではなく
  // その話者の発言として再投稿する(そこから会話の続きを生成する)
  const [editContext, setEditContext] = useState<{
    speaker: string;
    type: "dialogue" | "narration";
  } | null>(null);

  const [messages, setMessages] = useState<Message[]>([]);
  const [memories, setMemories] = useState<Memory[]>([]);
  // ゲームモードのステータス変動ログ(機能追加)。gameStatChangesテーブルから読み込み、
  // チャット内の変動行・サイドパネルのゲージ表示に使う。
  const [statChanges, setStatChanges] = useState<GameStatChange[]>([]);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<{ message: string; kind?: LLMErrorKind } | null>(null);

  // 自動連続生成(仕様書5.1): 上限付きで「次の会話を生成」を連続実行する。無限生成は禁止。
  const [autoGenerating, setAutoGenerating] = useState(false);
  const [autoProgress, setAutoProgress] = useState<{ current: number; total: number } | null>(
    null,
  );
  const autoStopRef = useRef(false);

  // メンバー詳細モーダル(ルーム内上書き編集 / そのキャラの記憶確認)
  const [memberDetail, setMemberDetail] = useState<{
    characterId: string;
    tab: MemberDetailTab;
  } | null>(null);
  // pinned記憶と新記憶の矛盾(自動では無効化せず、ユーザーに確認を出す。仕様書6.3)
  const [pinnedConflicts, setPinnedConflicts] = useState<PinnedConflict[]>([]);

  const logEndRef = useRef<HTMLDivElement>(null);

  // チャット表示カスタム(文字サイズ・配色テーマ): 設定画面で保存された値をこのルーム画面に適用する
  // 機能追加(ルーム内テーマ切替アイコン): 初回読み込みだけのuseState(() => ...)のままだと
  // アイコンボタンで切り替えても再レンダリングされないため、setterを持つ通常のstateにしておく。
  const [appSettings, setAppSettings] = useState(() => loadAppSettings());
  const chatFontSize = resolveChatFontSize(appSettings.chatFontSize);
  const chatTheme = resolveChatTheme(appSettings.chatTheme, appSettings.chatBackground);
  // light/naturalは明るいサーフェスのため、暗背景専用の半透明バナー配色(amber/red)は
  // そのままだと文字が読みにくくなる。バナー類の配色分岐に使う判定フラグ。
  const isLightSurfaceTheme = chatTheme === "light" || chatTheme === "natural";

  // テーマ切替トースト(機能追加): アイコンボタンでテーマを切り替えた瞬間、テーマ名を短時間表示する
  const [themeToast, setThemeToast] = useState<string | null>(null);
  const themeToastTimerRef = useRef<number | null>(null);
  // 初回マウント時のchatTheme確定はユーザー操作による切替ではないため、トースト表示・保存対象外にする
  const isFirstThemeRenderRef = useRef(true);

  useEffect(() => {
    return () => {
      if (themeToastTimerRef.current !== null) {
        window.clearTimeout(themeToastTimerRef.current);
      }
    };
  }, []);

  /**
   * 配色テーマが変わった後の副作用(保存・トースト表示)。
   * chatThemeの変化そのものをトリガーにすることで、handleCycleThemeを連打したときに
   * 古いレンダー時点のchatThemeを閉じ込めたまま二重に「1つ先」へ計算してしまう
   * (setState内でsetAppSettingsに渡す値をローカル変数chatThemeから作ると、
   * 再レンダーが挟まらないうちに連続実行された場合に同じ値から2回計算されてしまう)
   * 古典的な stale closure 問題を避けている。
   */
  useEffect(() => {
    if (isFirstThemeRenderRef.current) {
      isFirstThemeRenderRef.current = false;
      return;
    }
    const label = CHAT_THEME_OPTIONS.find((opt) => opt.value === chatTheme)?.label ?? chatTheme;
    setThemeToast(label);
    if (themeToastTimerRef.current !== null) {
      window.clearTimeout(themeToastTimerRef.current);
    }
    themeToastTimerRef.current = window.setTimeout(() => {
      setThemeToast(null);
      themeToastTimerRef.current = null;
    }, 1000);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chatTheme]);

  /**
   * 配色テーマのアイコンボタン巡回切替(機能追加)。
   * dark → navy → light → natural → dark … の順で即時反映し、設定画面と同じ保存先
   * (saveAppSettings)に永続化する。切替直後にテーマ名を短時間トースト表示する(上のuseEffectで処理)。
   * setAppSettingsを関数形式で呼び、更新関数の内側でprevから現在テーマ・次テーマを計算することで、
   * 再レンダーが挟まらないまま連打された場合でも取りこぼしなく1段階ずつ進む。
   */
  const handleCycleTheme = () => {
    setAppSettings((prev) => {
      const currentTheme = resolveChatTheme(prev.chatTheme, prev.chatBackground);
      const next = nextChatTheme(currentTheme);
      const updated = { ...prev, chatTheme: next };
      saveAppSettings(updated);
      return updated;
    });
  };

  const room = rooms.find((r) => r.id === id);

  const reload = useCallback(async () => {
    if (!id) return;
    const [msgs, mems, changes] = await Promise.all([
      listMessages(id),
      listMemories(id),
      listStatChanges(id),
    ]);
    setMessages(msgs);
    setMemories(mems);
    setStatChanges(changes);
  }, [id]);

  useEffect(() => {
    reload();
  }, [reload]);

  useEffect(() => {
    logEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, generating]);

  // ホーム画面の「続きから」表示用: このルームを開いたことをlocalStorageに記録する
  useEffect(() => {
    if (room) {
      saveLastRoomId(room.id);
    }
  }, [room?.id]);

  // 没入モード解除(機能追加): ルーム画面を離れるときは必ず通常表示に戻す。
  // そうしないと、没入モードのままホームやライブラリに遷移した際にナビが消えたままになる。
  useEffect(() => {
    return () => {
      setImmersiveMode(false);
    };
  }, [setImmersiveMode]);

  if (!room || !id) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-8">
        <p className="text-zinc-400">ルームが見つかりませんでした。</p>
        <Link to="/" className="mt-2 inline-block text-sm text-indigo-400 hover:underline">
          ホームに戻る
        </Link>
      </div>
    );
  }

  const members = room.memberIds
    .map((mid) => {
      const character = characters.find((c) => c.id === mid);
      const state = roomCharacterStates.find((s) => s.roomId === room.id && s.characterId === mid);
      if (!character || !state) return null;
      return { character, state };
    })
    .filter((m): m is { character: (typeof characters)[number]; state: (typeof roomCharacterStates)[number] } =>
      m !== null,
    );

  const charactersByName = new Map(members.map((m) => [m.character.name, m.character]));

  const activeMemberNames = members
    .filter((m) => m.state.presence === "active")
    .map((m) => m.character.name);

  // ゲームモード(機能追加): 常にresolveGameMode()経由で解決した値を使う(未設定=OFF)
  const gameMode = resolveGameMode(room.gameMode);
  const gameStats = computeCurrentStats(gameMode, statChanges, room.memberIds);
  const characterNameById = new Map(members.map((m) => [m.character.id, m.character.name]));

  // チャット内の変動表示(機能追加): バッチIDごとの変動一覧と、そのバッチの最後のメッセージIDを
  // 求めておき、メッセージ描画時に「このメッセージが該当バッチの最後なら直後に変動行を出す」
  // という形で対応づける(新しいMessageは作らない)。
  const changesByBatch = new Map<string, GameStatChange[]>();
  for (const c of statChanges) {
    const list = changesByBatch.get(c.batchId);
    if (list) list.push(c);
    else changesByBatch.set(c.batchId, [c]);
  }
  const lastMessageIdByBatch = new Map<string, string>();
  for (const m of messages) {
    lastMessageIdByBatch.set(m.batchId, m.id);
  }

  const lastMessage = messages[messages.length - 1];
  const canRegenerate = !!lastMessage && (lastMessage.type === "dialogue" || lastMessage.type === "narration");
  const canUndo = messages.length > 0;

  const handleChangePresence = async (characterId: string, presence: Presence) => {
    await updateMemberState(room.id, characterId, { presence });
  };

  const handleSaveOverrides = async (
    characterId: string,
    overrides: RoomCharacterOverrides,
  ) => {
    await updateMemberState(room.id, characterId, { overrides });
  };

  /**
   * 要約+記憶抽出をバックグラウンドで実行する(仕様書6.2)。
   * 生成UIをブロックせず、失敗しても何も表示しない(次回の生成後に再試行される)。
   * pinned記憶との矛盾が見つかった場合のみ確認バナーを出す。
   */
  const triggerBackgroundSummarize = (roomId: string) => {
    void maybeSummarizeAndExtract(roomId).then((outcome) => {
      if (!outcome) return;
      void reload();
      if (outcome.pinnedConflicts.length > 0) {
        setPinnedConflicts((prev) => [...prev, ...outcome.pinnedConflicts]);
      }
    });
  };

  /**
   * SidePanelの「記憶を整理」ボタンから呼ばれる手動実行(仕様書6.2の手動版)。
   * 失敗時は例外をそのまま投げ、SidePanel側で日本語エラー表示に変換する。
   * 成功時は自動実行と同じくpinned矛盾の確認バナーをここで出す(既存の仕組みに乗せる)。
   */
  const handleManualOrganize = async (): Promise<SummarizeOutcome | null> => {
    const outcome = await forceSummarizeAndExtract(room.id);
    if (outcome) {
      await reload();
      if (outcome.pinnedConflicts.length > 0) {
        setPinnedConflicts((prev) => [...prev, ...outcome.pinnedConflicts]);
      }
    }
    return outcome;
  };

  /** 1回分の生成を実行する。成功したかどうかを返す(自動連続生成のループ制御に使う)。 */
  const runSingleGeneration = async (task: () => Promise<unknown>): Promise<boolean> => {
    setGenerating(true);
    setError(null);
    try {
      await task();
      await reload();
      // 生成が成功したら、要約トリガーの判定をバックグラウンドで行う
      triggerBackgroundSummarize(room.id);
      return true;
    } catch (err) {
      if (err instanceof LLMError) {
        setError({ message: err.message || LLM_ERROR_MESSAGES[err.kind], kind: err.kind });
      } else {
        setError({ message: err instanceof Error ? err.message : "予期しないエラーが発生しました。" });
      }
      await reload();
      return false;
    } finally {
      setGenerating(false);
    }
  };

  const runGeneration = (task: () => Promise<unknown>) => runSingleGeneration(task);

  /**
   * 自動連続生成(仕様書5.1)。「次の会話を生成」を指定回数まで連続実行する。
   * 回数には上限があり(AUTO_GENERATE_MAX_COUNT)、途中で停止ボタンが押されたら中断する。
   * APIコスト暴走防止のため、エラーが起きた場合もそこでループを止める。
   */
  const handleAutoGenerate = async (times: number) => {
    const total = Math.min(Math.max(1, Math.floor(times)), AUTO_GENERATE_MAX_COUNT);
    autoStopRef.current = false;
    setAutoGenerating(true);
    try {
      for (let i = 0; i < total; i++) {
        if (autoStopRef.current) break;
        setAutoProgress({ current: i + 1, total });
        const ok = await runSingleGeneration(() => generateNextBatch(room.id));
        if (!ok || autoStopRef.current) break;
      }
    } finally {
      setAutoGenerating(false);
      setAutoProgress(null);
    }
  };

  const handleStopAutoGenerate = () => {
    autoStopRef.current = true;
  };

  /** pinned記憶の矛盾に対するユーザーの決定(無効化する / 残す) */
  const resolvePinnedConflict = async (conflict: PinnedConflict, disable: boolean) => {
    if (disable) {
      await updateMemory(conflict.pinnedMemoryId, { disabled: true });
      await reload();
    }
    setPinnedConflicts((prev) => prev.filter((c) => c !== conflict));
  };

  const handleSubmitTopic = (text: string) => {
    void runGeneration(() => submitTopic(room.id, text));
  };

  const handleSubmitMessage = (text: string) => {
    // 位置保持のインライン方式(機能変更: 行動描写ルール): 【 】を分離せず、
    // 入力テキストをそのまま送信する(表示側でセグメント分割してインライン表示する)。
    void runGeneration(() => submitUserMessage(room.id, text));
  };

  const handleGenerateNext = () => {
    void runGeneration(() => generateNextBatch(room.id));
  };

  const handleRegenerate = (options: RegenerateOption[]) => {
    void runGeneration(() => regenerateLastBatch(room.id, options));
  };

  const handleUndo = () => {
    void runGeneration(() => undoLastBatch(room.id));
  };

  const handleRewindConfirm = async () => {
    if (!rewindTarget) return;
    await rewindTo(room.id, rewindTarget.id);
    setRewindTarget(null);
    await reload();
  };

  const handleEditConfirm = async () => {
    if (!editTarget) return;
    // 「ここまで戻る」と同じくeditTarget自身も含めて以降を削除したうえで、
    // 削除前のテキストを入力欄に流し込み、そのまま書き直して送信し直せるようにする。
    // キャラのセリフ・地の文の場合は元の話者を保持し、送信時にその話者として
    // 再投稿する(ユーザー発言に化けないようにする)。
    const mode: InputMode = editTarget.type === "topic" ? "topic" : "message";
    const text = editTarget.text;
    if (editTarget.type === "dialogue" || editTarget.type === "narration") {
      setEditContext({ speaker: editTarget.speaker, type: editTarget.type });
    } else {
      setEditContext(null);
    }
    await rewindTo(room.id, editTarget.id);
    setEditTarget(null);
    setInputPrefill({ text, mode });
    await reload();
  };

  const handleSubmitEdit = (text: string) => {
    if (!editContext) return;
    const ctx = editContext;
    setEditContext(null);
    void runGeneration(() => submitEditedMessage(room.id, ctx.speaker, ctx.type, text));
  };

  const handleDeleteConfirm = async () => {
    if (!deleteTarget) return;
    await deleteSingleMessage(room.id, deleteTarget.id);
    setDeleteTarget(null);
    await reload();
  };

  const typingLabelBase =
    activeMemberNames.length === 0
      ? "会話を生成しています…"
      : activeMemberNames.length === 1
        ? `${activeMemberNames[0]}が入力中…`
        : `${activeMemberNames.slice(0, 2).join("・")}たちが入力中…`;
  const typingLabel = autoProgress
    ? `${typingLabelBase}(自動生成 ${autoProgress.current}/${autoProgress.total})`
    : typingLabelBase;

  return (
    <div
      className={`mx-auto flex h-screen max-w-3xl flex-col bg-[var(--chat-bg)] ${
        immersiveMode ? "px-2 py-2" : "px-4 py-4"
      }`}
      style={
        {
          ...chatThemeToCssVars(chatTheme),
          "--chat-font-size": CHAT_FONT_SIZE_VALUES[chatFontSize],
        } as CSSProperties
      }
    >
      {/* 上部バー: 没入モード中は非表示にしてチャット領域を広げる */}
      {!immersiveMode && (
      <div className="relative border-b border-[var(--chat-border)] bg-[var(--chat-surface)] pb-3">
        {/* 1行目: ルーム名+ボタン列。メンバーチップは2行目に全幅で置く。
            以前は「左=名前+メンバー / 右=ボタン列(縮まない)」の横並びだったため、
            中間幅のウィンドウではボタン列に幅を奪われてチップが1〜2個ごとに縦積みになっていた。 */}
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between sm:gap-3">
        <h1 className="min-w-0 truncate text-lg font-bold text-[var(--chat-heading-text)] sm:flex-1">
          {room.name}
        </h1>
        <div className="flex flex-nowrap items-center gap-1 sm:shrink-0 sm:gap-2 sm:justify-end">
          <button
            type="button"
            onClick={handleCycleTheme}
            title="配色テーマを切り替え"
            aria-label="配色テーマを切り替え"
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md border border-[var(--chat-button-border)] text-[var(--chat-button-text)] hover:bg-[var(--chat-input-bg)]"
          >
            <ThemeIcon className="h-5 w-5" />
          </button>
          <button
            type="button"
            onClick={() => setImmersiveMode(true)}
            title="没入モード(チャットのみ表示)"
            aria-label="没入モード(チャットのみ表示)"
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md border border-[var(--chat-button-border)] text-[var(--chat-button-text)] hover:bg-[var(--chat-input-bg)]"
          >
            <ImmersiveIcon className="h-5 w-5" />
          </button>
          <button
            type="button"
            onClick={() => setSidePanelOpen(true)}
            title="パネル"
            aria-label="パネル"
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md border border-[var(--chat-button-border)] text-[var(--chat-button-text)] hover:bg-[var(--chat-input-bg)] sm:h-auto sm:w-auto sm:gap-1.5 sm:px-3 sm:py-1.5 sm:text-xs"
          >
            <PanelIcon className="h-5 w-5 shrink-0" />
            <span className="hidden sm:inline">パネル</span>
          </button>
          <button
            type="button"
            onClick={() => setStillPromptOpen(true)}
            title="スチル"
            aria-label="スチル"
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md border border-[var(--chat-button-border)] text-[var(--chat-button-text)] hover:bg-[var(--chat-input-bg)] sm:h-auto sm:w-auto sm:gap-1.5 sm:px-3 sm:py-1.5 sm:text-xs"
          >
            <ImageIcon className="h-5 w-5 shrink-0" />
            <span className="hidden sm:inline">スチル</span>
          </button>
          <LogManageMenu
            onDeleteLogOnly={async () => {
              await deleteLogOnly(room.id);
              await reload();
            }}
            onDeleteLogAndSummary={async () => {
              await deleteLogAndSummary(room.id);
              await reload();
            }}
            onResetAll={async () => {
              await resetRoomConversationData(room.id);
              await reload();
            }}
          />
          <button
            type="button"
            onClick={() => setSettingsOpen(true)}
            title="ルーム設定"
            aria-label="ルーム設定"
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md border border-[var(--chat-button-border)] text-[var(--chat-button-text)] hover:bg-[var(--chat-input-bg)] sm:h-auto sm:w-auto sm:gap-1.5 sm:px-3 sm:py-1.5 sm:text-xs"
          >
            <SettingsIcon className="h-5 w-5 shrink-0" />
            <span className="hidden sm:inline">ルーム設定</span>
          </button>
          <button
            type="button"
            onClick={() => setDeleteConfirmOpen(true)}
            title="削除"
            aria-label="削除"
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md border border-[var(--chat-button-border)] text-[var(--chat-danger-text)] hover:bg-red-500/10 sm:h-auto sm:w-auto sm:gap-1.5 sm:px-3 sm:py-1.5 sm:text-xs"
          >
            <TrashIcon className="h-5 w-5 shrink-0" />
            <span className="hidden sm:inline">削除</span>
          </button>
        </div>
        </div>

        {/* 2行目: メンバーチップ。ボタン列と幅を取り合わず全幅を使えるため、
            人数が多くても横に並びやすい(足りない場合のみ折り返す) */}
        <div className="mt-2">
          <MemberBar
            members={members}
            onChangePresence={handleChangePresence}
            onEditOverrides={(characterId) =>
              setMemberDetail({ characterId, tab: "overrides" })
            }
            onShowMemories={(characterId) =>
              setMemberDetail({ characterId, tab: "memory" })
            }
          />
        </div>

        {/* テーマ切替トースト(機能追加): 切り替えた瞬間だけ現在のテーマ名を短時間表示する */}
        {themeToast && (
          <div
            role="status"
            className="pointer-events-none absolute right-0 top-full z-50 mt-1 rounded-md border border-[var(--chat-border)] bg-[var(--chat-surface)] px-2.5 py-1 text-xs text-[var(--chat-heading-text)] shadow-lg"
          >
            配色テーマ: {themeToast}
          </div>
        )}
      </div>
      )}

      {/* 没入モード解除ボタン(機能追加): 没入モード中のみ右上に半透明で固定表示する */}
      {immersiveMode && (
        <button
          type="button"
          onClick={() => setImmersiveMode(false)}
          title="没入モードを終了"
          aria-label="没入モードを終了"
          className="fixed right-3 top-3 z-50 flex h-10 w-10 items-center justify-center rounded-full border border-[var(--chat-button-border)] bg-[var(--chat-surface)]/85 text-[var(--chat-button-text)] shadow-lg backdrop-blur hover:bg-[var(--chat-input-bg)]"
        >
          <ExitImmersiveIcon className="h-5 w-5" />
        </button>
      )}

      {/* 中央: チャットログ */}
      <div className="flex-1 overflow-y-auto py-3">
        {/* pinned記憶と新記憶の矛盾: 自動では無効化せず、ユーザーに確認を出す(仕様書6.3) */}
        {/* light/naturalの明るいサーフェスでも読めるよう、暗背景専用の半透明amberを避けてテーマごとに配色を分ける */}
        {pinnedConflicts.map((conflict, index) => (
          <div
            key={`${conflict.pinnedMemoryId}-${index}`}
            className={`mb-2 rounded-md border px-3 py-2 text-sm ${
              isLightSurfaceTheme
                ? "border-amber-300 bg-amber-50 text-amber-900"
                : "border-amber-800 bg-amber-950/40 text-amber-100"
            }`}
          >
            <p className="font-medium">固定された記憶と矛盾する新しい情報が見つかりました</p>
            <p className={`mt-1 text-xs ${isLightSurfaceTheme ? "text-amber-800/80" : "text-amber-200/80"}`}>
              固定中: {conflict.pinnedContent}
            </p>
            <p className={`text-xs ${isLightSurfaceTheme ? "text-amber-800/80" : "text-amber-200/80"}`}>
              新情報: {conflict.newContent}
            </p>
            <div className="mt-2 flex gap-2">
              <button
                type="button"
                onClick={() => resolvePinnedConflict(conflict, true)}
                className={`rounded-md border px-2 py-1 text-xs ${
                  isLightSurfaceTheme
                    ? "border-amber-400 text-amber-900 hover:bg-amber-500/10"
                    : "border-amber-700 text-amber-200 hover:bg-amber-500/10"
                }`}
              >
                固定記憶を無効化する
              </button>
              <button
                type="button"
                onClick={() => resolvePinnedConflict(conflict, false)}
                className={`rounded-md px-2 py-1 text-xs ${
                  isLightSurfaceTheme ? "text-amber-700/80 hover:text-amber-900" : "text-amber-300/70 hover:text-amber-100"
                }`}
              >
                固定記憶をそのまま残す
              </button>
            </div>
          </div>
        ))}

        {messages.length === 0 && !generating && !autoGenerating && (
          <div className="flex flex-col items-center justify-center gap-2 py-16 text-center">
            <p className="text-[var(--chat-muted-text)]">まだ会話がありません。</p>
            <p className="max-w-sm text-sm text-[var(--chat-placeholder-text)]">
              下の入力欄からトピックを投入するか発言してみましょう。トピックを投入すると、その話題でキャラたちが話し始めます。
            </p>
            {room.worldSetting && (
              <p className="mt-2 max-w-md whitespace-pre-wrap text-xs text-[var(--chat-placeholder-text)]">
                世界観メモ: {room.worldSetting}
              </p>
            )}
            {members.length === 0 && (
              <p className="mt-2 text-xs text-amber-400">
                このルームにはまだメンバーがいません。ルーム設定からキャラクターを追加してください。
              </p>
            )}
          </div>
        )}

        {messages.map((m) => {
          // ゲームモード(機能追加): このメッセージがそのバッチの最後のメッセージなら、
          // showChangesInChatが有効な場合に限り直後へ変動行を表示する。
          const isLastOfBatch = lastMessageIdByBatch.get(m.batchId) === m.id;
          const batchChanges = isLastOfBatch ? changesByBatch.get(m.batchId) ?? [] : [];
          return (
            <Fragment key={m.id}>
              <ChatMessageItem
                message={m}
                character={charactersByName.get(m.speaker)}
                onRewind={(messageId) => setRewindTarget(messages.find((mm) => mm.id === messageId) ?? null)}
                onEdit={(messageId) => setEditTarget(messages.find((mm) => mm.id === messageId) ?? null)}
                onDelete={(messageId) => setDeleteTarget(messages.find((mm) => mm.id === messageId) ?? null)}
              />
              {(gameMode.showChangesInChat ?? true) && batchChanges.length > 0 && (
                <GameStatChangesRow
                  changes={batchChanges}
                  gameMode={gameMode}
                  characterNameById={characterNameById}
                />
              )}
            </Fragment>
          );
        })}

        {(generating || autoGenerating) && <TypingIndicator label={typingLabel} />}

        <div ref={logEndRef} />
      </div>

      {/* エラーバナー(バグ修正): チャットログ内(スクロール領域の先頭)に出すと、
          ログが伸びている最中はスクロール位置によって画面外に隠れてしまい、
          エラーに気づけないという報告があった。スクロール位置に関係なく必ず
          目に入るよう、スクロール領域の外(入力エリアの直上)に固定で表示する。
          没入モード中も上部バーが消えるだけでこの位置は変わらないため、引き続き見える。 */}
      {error && (
        <ErrorBanner
          message={error.message}
          kind={error.kind}
          onDismiss={() => setError(null)}
          theme={chatTheme}
        />
      )}

      {/* 下部入力エリア */}
      <ChatInput
        generating={generating}
        canRegenerate={canRegenerate}
        canUndo={canUndo}
        autoGenerating={autoGenerating}
        onSubmitTopic={handleSubmitTopic}
        onSubmitMessage={handleSubmitMessage}
        onGenerateNext={handleGenerateNext}
        onAutoGenerate={(times) => void handleAutoGenerate(times)}
        onStopAutoGenerate={handleStopAutoGenerate}
        onRegenerate={handleRegenerate}
        onUndo={handleUndo}
        prefill={inputPrefill}
        onPrefillConsumed={() => setInputPrefill(null)}
        editing={
          editContext
            ? { label: editContext.type === "narration" ? "地の文" : editContext.speaker }
            : null
        }
        onSubmitEdit={handleSubmitEdit}
        onCancelEdit={() => setEditContext(null)}
      />

      <StillPromptModal
        open={stillPromptOpen}
        roomId={room.id}
        hasMessages={messages.length > 0}
        onClose={() => setStillPromptOpen(false)}
      />

      <SidePanel
        open={sidePanelOpen}
        onClose={() => setSidePanelOpen(false)}
        roomId={room.id}
        members={members}
        memories={memories}
        hasMessages={messages.length > 0}
        gameMode={gameMode}
        gameStats={gameStats}
        onChangePresence={handleChangePresence}
        onMemoriesChanged={() => void reload()}
        onEditOverrides={(characterId) => setMemberDetail({ characterId, tab: "overrides" })}
        onManualOrganize={handleManualOrganize}
      />

      <MemberDetailModal
        open={memberDetail !== null}
        initialTab={memberDetail?.tab ?? "overrides"}
        character={
          memberDetail
            ? members.find((m) => m.character.id === memberDetail.characterId)?.character ?? null
            : null
        }
        state={
          memberDetail
            ? members.find((m) => m.character.id === memberDetail.characterId)?.state ?? null
            : null
        }
        memories={memories}
        onClose={() => setMemberDetail(null)}
        onSaveOverrides={handleSaveOverrides}
      />

      <RoomFormModal
        open={settingsOpen}
        room={room}
        characters={characters}
        worlds={worlds}
        onClose={() => setSettingsOpen(false)}
        onSubmit={(input) => editRoom(room.id, input)}
      />

      <ConfirmDialog
        open={deleteConfirmOpen}
        title="ルームを削除しますか?"
        message="このルームの会話ログ・記憶・要約もすべて削除されます。キャラクター本体には影響しません。この操作は取り消せません。"
        confirmLabel="削除する"
        onCancel={() => setDeleteConfirmOpen(false)}
        onConfirm={async () => {
          await removeRoom(room.id);
          setDeleteConfirmOpen(false);
          navigate("/");
        }}
      />

      <ConfirmDialog
        open={rewindTarget !== null}
        title="ここまで戻りますか?"
        message="選択した発言以降のメッセージをすべて削除します。関連する記憶は無効化され、かかる要約は削除されます。この操作は取り消せません。"
        confirmLabel="ここまで戻る"
        onCancel={() => setRewindTarget(null)}
        onConfirm={handleRewindConfirm}
      />

      <ConfirmDialog
        open={editTarget !== null}
        title="この発言を編集しますか?"
        message="選択した発言以降のメッセージをすべて削除し、元の内容を入力欄にコピーします。関連する記憶は無効化され、かかる要約は削除されます。この操作は取り消せません。"
        confirmLabel="編集する"
        onCancel={() => setEditTarget(null)}
        onConfirm={handleEditConfirm}
      />

      <ConfirmDialog
        open={deleteTarget !== null}
        title="この発言を削除しますか?"
        message="このメッセージのみを削除します。関連する記憶は無効化されます。この操作は取り消せません。"
        confirmLabel="削除する"
        onCancel={() => setDeleteTarget(null)}
        onConfirm={handleDeleteConfirm}
      />
    </div>
  );
}
