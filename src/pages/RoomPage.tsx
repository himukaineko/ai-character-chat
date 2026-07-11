// ルーム画面(チャット、仕様書10.2)
// 会話コア(Phase 2): トピック投入 / 発言 / 次の会話を生成 / 再生成 / 戻る / 削除
// 記憶システム(Phase 3): 会話生成後のバックグラウンド要約+記憶抽出、記憶一覧、上書き編集
import { useCallback, useEffect, useRef, useState, type CSSProperties } from "react";
import { useNavigate, useParams, Link } from "react-router-dom";
import { useAppStore } from "../store";
import { RoomFormModal } from "../components/RoomFormModal";
import { ConfirmDialog } from "../components/ConfirmDialog";
import { MemberBar } from "../components/room/MemberBar";
import { ChatMessageItem } from "../components/room/ChatMessageItem";
import { TypingIndicator } from "../components/room/TypingIndicator";
import { ChatInput } from "../components/room/ChatInput";
import { AUTO_GENERATE_MAX_COUNT } from "../lib/autoGenerate";
import { SidePanel } from "../components/room/SidePanel";
import { LogManageMenu } from "../components/room/LogManageMenu";
import { ErrorBanner } from "../components/room/ErrorBanner";
import { StillPromptModal } from "../components/room/StillPromptModal";
import {
  MemberDetailModal,
  type MemberDetailTab,
} from "../components/room/MemberDetailModal";
import type { Memory, Message, Presence, RoomCharacterOverrides } from "../types";
import { resolveChatBackground, resolveChatFontSize } from "../types";
import {
  deleteLogAndSummary,
  deleteLogOnly,
  deleteSingleMessage,
  listMessages,
  resetRoomConversationData,
  rewindTo,
} from "../lib/messages";
import { listMemories, updateMemory } from "../lib/memories";
import { loadAppSettings, saveLastRoomId } from "../lib/settings";
import { CHAT_FONT_SIZE_VALUES } from "../lib/chatDisplay";
import {
  generateNextBatch,
  regenerateLastBatch,
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

  const [settingsOpen, setSettingsOpen] = useState(false);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [sidePanelOpen, setSidePanelOpen] = useState(false);
  const [stillPromptOpen, setStillPromptOpen] = useState(false);
  const [rewindTarget, setRewindTarget] = useState<Message | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Message | null>(null);

  const [messages, setMessages] = useState<Message[]>([]);
  const [memories, setMemories] = useState<Memory[]>([]);
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

  // チャット表示カスタム(文字サイズ・背景色): 設定画面で保存された値をこのルーム画面に適用する
  const [appSettings] = useState(() => loadAppSettings());
  const chatFontSize = resolveChatFontSize(appSettings.chatFontSize);
  const chatBackground = resolveChatBackground(appSettings.chatBackground);

  const room = rooms.find((r) => r.id === id);

  const reload = useCallback(async () => {
    if (!id) return;
    const [msgs, mems] = await Promise.all([listMessages(id), listMemories(id)]);
    setMessages(msgs);
    setMemories(mems);
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
      className="mx-auto flex h-screen max-w-3xl flex-col px-4 py-4"
      style={
        {
          backgroundColor: chatBackground,
          "--chat-font-size": CHAT_FONT_SIZE_VALUES[chatFontSize],
        } as CSSProperties
      }
    >
      {/* 上部バー */}
      <div className="flex items-start justify-between gap-3 border-b border-zinc-800 pb-3">
        <div className="min-w-0">
          <h1 className="truncate text-lg font-bold text-zinc-100">{room.name}</h1>
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
        </div>
        <div className="flex shrink-0 flex-wrap items-center justify-end gap-2">
          <button
            type="button"
            onClick={() => setSidePanelOpen(true)}
            className="rounded-md border border-zinc-700 px-3 py-1.5 text-xs text-zinc-300 hover:bg-zinc-800"
          >
            パネル
          </button>
          <button
            type="button"
            onClick={() => setStillPromptOpen(true)}
            className="rounded-md border border-zinc-700 px-3 py-1.5 text-xs text-zinc-300 hover:bg-zinc-800"
          >
            スチル
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
            className="rounded-md border border-zinc-700 px-3 py-1.5 text-xs text-zinc-300 hover:bg-zinc-800"
          >
            ルーム設定
          </button>
          <button
            type="button"
            onClick={() => setDeleteConfirmOpen(true)}
            className="rounded-md border border-zinc-700 px-3 py-1.5 text-xs text-red-400 hover:bg-red-500/10"
          >
            削除
          </button>
        </div>
      </div>

      {/* 中央: チャットログ */}
      <div className="flex-1 overflow-y-auto py-3">
        {error && (
          <ErrorBanner message={error.message} kind={error.kind} onDismiss={() => setError(null)} />
        )}

        {/* pinned記憶と新記憶の矛盾: 自動では無効化せず、ユーザーに確認を出す(仕様書6.3) */}
        {pinnedConflicts.map((conflict, index) => (
          <div
            key={`${conflict.pinnedMemoryId}-${index}`}
            className="mb-2 rounded-md border border-amber-800 bg-amber-950/40 px-3 py-2 text-sm text-amber-100"
          >
            <p className="font-medium">固定された記憶と矛盾する新しい情報が見つかりました</p>
            <p className="mt-1 text-xs text-amber-200/80">固定中: {conflict.pinnedContent}</p>
            <p className="text-xs text-amber-200/80">新情報: {conflict.newContent}</p>
            <div className="mt-2 flex gap-2">
              <button
                type="button"
                onClick={() => resolvePinnedConflict(conflict, true)}
                className="rounded-md border border-amber-700 px-2 py-1 text-xs text-amber-200 hover:bg-amber-500/10"
              >
                固定記憶を無効化する
              </button>
              <button
                type="button"
                onClick={() => resolvePinnedConflict(conflict, false)}
                className="rounded-md px-2 py-1 text-xs text-amber-300/70 hover:text-amber-100"
              >
                固定記憶をそのまま残す
              </button>
            </div>
          </div>
        ))}

        {messages.length === 0 && !generating && !autoGenerating && (
          <div className="flex flex-col items-center justify-center gap-2 py-16 text-center">
            <p className="text-zinc-500">まだ会話がありません。</p>
            <p className="max-w-sm text-sm text-zinc-600">
              下の入力欄からトピックを投入するか発言してみましょう。トピックを投入すると、その話題でキャラたちが話し始めます。
            </p>
            {room.worldSetting && (
              <p className="mt-2 max-w-md whitespace-pre-wrap text-xs text-zinc-600">
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

        {messages.map((m) => (
          <ChatMessageItem
            key={m.id}
            message={m}
            character={charactersByName.get(m.speaker)}
            onRewind={(messageId) => setRewindTarget(messages.find((mm) => mm.id === messageId) ?? null)}
            onDelete={(messageId) => setDeleteTarget(messages.find((mm) => mm.id === messageId) ?? null)}
          />
        ))}

        {(generating || autoGenerating) && <TypingIndicator label={typingLabel} />}

        <div ref={logEndRef} />
      </div>

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
        members={members}
        memories={memories}
        hasMessages={messages.length > 0}
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
