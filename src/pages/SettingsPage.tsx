// 設定画面
// Phase 1: ユーザープロフィール編集 + エクスポート/インポート
// APIキー・モデルIDはPhase 2で実際に使用するが、入力欄自体はここで用意しておく
import { useRef, useState, type ChangeEvent, type CSSProperties } from "react";
import { useAppStore } from "../store";
import type { AppSettings, UserProfile } from "../types";
import { resolveChatFontSize, resolveChatTheme } from "../types";
import {
  CUSTOM_MODEL_TAB_DESCRIPTION,
  loadAppSettings,
  loadUserProfile,
  MAIN_MODEL_TAB_OPTIONS,
  resolveMainModelTab,
  saveAppSettings,
  saveUserProfile,
  type MainModelTabKey,
} from "../lib/settings";
import {
  CHAT_FONT_SIZE_OPTIONS,
  CHAT_FONT_SIZE_VALUES,
  CHAT_THEME_OPTIONS,
  CHAT_THEME_TOKENS,
  chatThemeToCssVars,
} from "../lib/chatDisplay";
import { TagInput } from "../components/TagInput";
import { ConfirmDialog } from "../components/ConfirmDialog";
import {
  exportToFile,
  exportCharactersToFile,
  importFromData,
  importCharactersOnly,
  importWorld,
  importRoom,
  parseImportFile,
  type ExportData,
  type CharactersOnlyExportData,
  type WorldExportData,
  type RoomExportData,
} from "../lib/exportImport";

export function SettingsPage() {
  const loadAll = useAppStore((s) => s.loadAll);

  const [profile, setProfile] = useState<UserProfile>(() => loadUserProfile());
  const [profileSaved, setProfileSaved] = useState(false);

  const [settings, setSettings] = useState<AppSettings>(() => loadAppSettings());
  const [settingsSaved, setSettingsSaved] = useState(false);
  const [showApiKey, setShowApiKey] = useState(false);
  const [mainModelTab, setMainModelTab] = useState<MainModelTabKey>(() =>
    resolveMainModelTab(settings.mainModelId),
  );

  const [exporting, setExporting] = useState(false);
  const [exportingCharacters, setExportingCharacters] = useState(false);
  const [importError, setImportError] = useState<string | null>(null);
  const [pendingImport, setPendingImport] = useState<ExportData | null>(null);
  const [pendingCharactersImport, setPendingCharactersImport] =
    useState<CharactersOnlyExportData | null>(null);
  const [pendingWorldImport, setPendingWorldImport] = useState<WorldExportData | null>(null);
  const [pendingRoomImport, setPendingRoomImport] = useState<RoomExportData | null>(null);
  const [modeDialogOpen, setModeDialogOpen] = useState(false);
  const [replaceConfirmOpen, setReplaceConfirmOpen] = useState(false);
  const [charactersImportConfirmOpen, setCharactersImportConfirmOpen] = useState(false);
  const [worldImportConfirmOpen, setWorldImportConfirmOpen] = useState(false);
  const [roomImportConfirmOpen, setRoomImportConfirmOpen] = useState(false);
  const [importing, setImporting] = useState(false);
  const [importDone, setImportDone] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleSaveProfile = () => {
    saveUserProfile(profile);
    setProfileSaved(true);
    setTimeout(() => setProfileSaved(false), 1500);
  };

  const handleSaveSettings = () => {
    saveAppSettings(settings);
    setSettingsSaved(true);
    setTimeout(() => setSettingsSaved(false), 1500);
  };

  const handleMainModelTabChange = (tab: MainModelTabKey) => {
    setMainModelTab(tab);
    const preset = MAIN_MODEL_TAB_OPTIONS.find((opt) => opt.key === tab);
    if (preset) {
      setSettings((s) => ({ ...s, mainModelId: preset.value }));
    }
    // 「カスタム」を選んだ場合は現在の値をそのまま自由入力欄に引き継ぐ
  };

  const handleExport = async () => {
    setExporting(true);
    try {
      await exportToFile();
    } finally {
      setExporting(false);
    }
  };

  const handleExportCharacters = async () => {
    setExportingCharacters(true);
    try {
      await exportCharactersToFile();
    } finally {
      setExportingCharacters(false);
    }
  };

  const handleFileSelected = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setImportError(null);
    setImportDone(false);
    try {
      const text = await file.text();
      const parsed = parseImportFile(text);
      if (parsed.kind === "charactersOnly") {
        setPendingCharactersImport(parsed.data);
        setCharactersImportConfirmOpen(true);
      } else if (parsed.kind === "world") {
        setPendingWorldImport(parsed.data);
        setWorldImportConfirmOpen(true);
      } else if (parsed.kind === "room") {
        setPendingRoomImport(parsed.data);
        setRoomImportConfirmOpen(true);
      } else {
        setPendingImport(parsed.data);
        setModeDialogOpen(true);
      }
    } catch {
      setImportError("バックアップファイルの読み込みに失敗しました。ファイル形式を確認してください。");
    }
  };

  const runImport = async (mode: "replace" | "merge") => {
    if (!pendingImport) return;
    setImporting(true);
    try {
      await importFromData(pendingImport, mode);
      await loadAll();
      setProfile(loadUserProfile());
      setImportDone(true);
    } catch {
      setImportError("インポート中にエラーが発生しました。");
    } finally {
      setImporting(false);
      setPendingImport(null);
      setModeDialogOpen(false);
      setReplaceConfirmOpen(false);
    }
  };

  const runCharactersImport = async () => {
    if (!pendingCharactersImport) return;
    setImporting(true);
    try {
      await importCharactersOnly(pendingCharactersImport);
      await loadAll();
      setImportDone(true);
    } catch {
      setImportError("インポート中にエラーが発生しました。");
    } finally {
      setImporting(false);
      setPendingCharactersImport(null);
      setCharactersImportConfirmOpen(false);
    }
  };

  const runWorldImport = async () => {
    if (!pendingWorldImport) return;
    setImporting(true);
    try {
      await importWorld(pendingWorldImport);
      await loadAll();
      setImportDone(true);
    } catch {
      setImportError("インポート中にエラーが発生しました。");
    } finally {
      setImporting(false);
      setPendingWorldImport(null);
      setWorldImportConfirmOpen(false);
    }
  };

  const runRoomImport = async () => {
    if (!pendingRoomImport) return;
    setImporting(true);
    try {
      await importRoom(pendingRoomImport);
      await loadAll();
      setImportDone(true);
    } catch {
      setImportError("インポート中にエラーが発生しました。");
    } finally {
      setImporting(false);
      setPendingRoomImport(null);
      setRoomImportConfirmOpen(false);
    }
  };

  return (
    <div className="mx-auto max-w-2xl px-4 py-8">
      <h1 className="text-xl font-bold text-zinc-100">設定</h1>

      {/* ユーザープロフィール */}
      <section className="mt-6 rounded-lg border border-zinc-800 bg-zinc-900 p-4">
        <h2 className="text-base font-semibold text-zinc-100">ユーザープロフィール</h2>
        <p className="mt-1 text-xs text-zinc-500">
          キャラクターがあなたを認識するための設定です。
        </p>
        <div className="mt-4 space-y-3">
          <div>
            <label className="mb-1 block text-sm font-medium text-zinc-300">名前</label>
            <input
              type="text"
              value={profile.name}
              onChange={(e) => setProfile((p) => ({ ...p, name: e.target.value }))}
              className="w-full rounded-md border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm text-zinc-100 outline-none focus:border-indigo-500"
            />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-zinc-300">
              呼ばれ方
            </label>
            <input
              type="text"
              value={profile.calledAs}
              onChange={(e) => setProfile((p) => ({ ...p, calledAs: e.target.value }))}
              placeholder="例: ○○さん、○○くん"
              className="w-full rounded-md border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm text-zinc-100 outline-none focus:border-indigo-500"
            />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-zinc-300">
              キャラからの扱われ方
            </label>
            <textarea
              value={profile.treatment}
              onChange={(e) =>
                setProfile((p) => ({ ...p, treatment: e.target.value }))
              }
              rows={2}
              placeholder="例: 対等な友人として接してほしい / 妹のように扱ってほしい"
              className="w-full resize-none rounded-md border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm text-zinc-100 outline-none focus:border-indigo-500"
            />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-zinc-300">
              背景・プロフィール
            </label>
            <textarea
              value={profile.background}
              onChange={(e) =>
                setProfile((p) => ({ ...p, background: e.target.value }))
              }
              rows={3}
              placeholder="例: 社会人2年目。一人暮らしで、休日はゲームばかりしている"
              className="w-full resize-none rounded-md border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm text-zinc-100 outline-none focus:border-indigo-500"
            />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-zinc-300">外見</label>
            <textarea
              value={profile.appearance}
              onChange={(e) =>
                setProfile((p) => ({ ...p, appearance: e.target.value }))
              }
              rows={2}
              placeholder="例: 黒髪で背は低め。いつもパーカーを着ている"
              className="w-full resize-none rounded-md border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm text-zinc-100 outline-none focus:border-indigo-500"
            />
          </div>
          <TagInput
            label="苦手な話題"
            values={profile.dislikedTopics}
            onChange={(v) => setProfile((p) => ({ ...p, dislikedTopics: v }))}
          />
          <div>
            <label className="mb-1 block text-sm font-medium text-zinc-300">
              会話で重視したい雰囲気
            </label>
            <input
              type="text"
              value={profile.preferredMood}
              onChange={(e) =>
                setProfile((p) => ({ ...p, preferredMood: e.target.value }))
              }
              className="w-full rounded-md border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm text-zinc-100 outline-none focus:border-indigo-500"
            />
          </div>
        </div>
        <div className="mt-4 flex items-center gap-3">
          <button
            type="button"
            onClick={handleSaveProfile}
            className="rounded-md bg-indigo-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-indigo-500"
          >
            保存
          </button>
          {profileSaved && <span className="text-xs text-emerald-400">保存しました</span>}
        </div>
      </section>

      {/* 表示設定(チャット画面の文字サイズ・背景色) */}
      <section className="mt-6 rounded-lg border border-zinc-800 bg-zinc-900 p-4">
        <h2 className="text-base font-semibold text-zinc-100">表示設定</h2>
        <p className="mt-1 text-xs text-zinc-500">
          チャット画面の文字の大きさと配色テーマを好みに合わせて変更できます。目の負担が気になるときに調整してください。
        </p>
        <div className="mt-4 space-y-4">
          <div>
            <label className="mb-1 block text-sm font-medium text-zinc-300">文字サイズ</label>
            <div className="inline-flex rounded-md border border-zinc-700 p-0.5 text-sm">
              {CHAT_FONT_SIZE_OPTIONS.map((opt) => (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => setSettings((s) => ({ ...s, chatFontSize: opt.value }))}
                  className={`rounded px-3 py-1 ${
                    resolveChatFontSize(settings.chatFontSize) === opt.value
                      ? "bg-indigo-600 text-white"
                      : "text-zinc-400 hover:text-zinc-200"
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-zinc-300">配色テーマ</label>
            <p className="mb-2 text-xs text-zinc-500">
              背景・吹き出し・文字色をまとめて切り替えます。自由な色指定はできませんが、どのテーマでも読みやすいように調整済みです。
            </p>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              {CHAT_THEME_OPTIONS.map((opt) => {
                const tokens = CHAT_THEME_TOKENS[opt.value];
                const selected =
                  resolveChatTheme(settings.chatTheme, settings.chatBackground) === opt.value;
                return (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => setSettings((s) => ({ ...s, chatTheme: opt.value }))}
                    aria-pressed={selected}
                    className={`flex flex-col items-center gap-1.5 rounded-lg border-2 p-2 transition-colors ${
                      selected ? "border-indigo-400" : "border-zinc-700 hover:border-zinc-600"
                    }`}
                  >
                    {/* ミニプレビュー: 背景色+キャラ吹き出し+ユーザー吹き出し */}
                    <div
                      className="flex w-full flex-col gap-1 rounded-md p-2"
                      style={{ backgroundColor: tokens.bg }}
                    >
                      <span
                        className="h-3 w-3/4 self-start rounded-full"
                        style={{ backgroundColor: tokens.charBubbleBg }}
                      />
                      <span
                        className="h-3 w-3/5 self-end rounded-full"
                        style={{ backgroundColor: tokens.userBubbleBg }}
                      />
                    </div>
                    <span className="text-xs text-zinc-300">{opt.label}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* その場でプレビュー: 保存前でも見た目を確認できる */}
          <div>
            <label className="mb-1 block text-sm font-medium text-zinc-300">プレビュー</label>
            <div
              className="space-y-1 rounded-md border border-zinc-800 bg-[var(--chat-bg)] p-3"
              style={
                {
                  ...chatThemeToCssVars(resolveChatTheme(settings.chatTheme, settings.chatBackground)),
                  "--chat-font-size":
                    CHAT_FONT_SIZE_VALUES[resolveChatFontSize(settings.chatFontSize)],
                } as CSSProperties
              }
            >
              <div className="flex items-start gap-2">
                <div className="rounded-2xl rounded-tl-sm bg-[var(--chat-char-bubble-bg)] px-3 py-2 text-[length:var(--chat-font-size)] text-[var(--chat-char-bubble-text)]">
                  うん、大丈夫だよ
                </div>
              </div>
              <span className="block font-mincho text-[length:var(--chat-font-size)] text-[var(--chat-char-action-text)]">
                少し困ったように笑う
              </span>
              <div className="flex justify-end">
                <div className="rounded-2xl rounded-tr-sm bg-[var(--chat-user-bubble-bg)] px-3 py-2 text-[length:var(--chat-font-size)] text-[var(--chat-user-bubble-text)]">
                  ありがとう、助かる
                </div>
              </div>
              <span className="block text-right font-mincho text-[length:var(--chat-font-size)] text-[var(--chat-user-action-text)]">
                笑いかける
              </span>
              <p className="text-center text-[length:var(--chat-font-size)] italic leading-relaxed text-[var(--chat-narration-text)]">
                静かな夜だった。
              </p>
            </div>
          </div>
        </div>
        <div className="mt-4 flex items-center gap-3">
          <button
            type="button"
            onClick={handleSaveSettings}
            className="rounded-md bg-indigo-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-indigo-500"
          >
            保存
          </button>
          {settingsSaved && <span className="text-xs text-emerald-400">保存しました</span>}
        </div>
      </section>

      {/* API設定(枠のみ。実際の利用はPhase 2) */}
      <section className="mt-6 rounded-lg border border-zinc-800 bg-zinc-900 p-4">
        <h2 className="text-base font-semibold text-zinc-100">API設定</h2>
        <p className="mt-1 text-xs text-zinc-500">
          Gemini APIキーはこの端末(localStorage)にのみ保存されます。サーバーへの送信・ログ出力・エクスポートには一切含まれません。
        </p>
        <div className="mt-4 space-y-3">
          <div>
            <label className="mb-1 block text-sm font-medium text-zinc-300">
              Gemini APIキー
            </label>
            <div className="flex gap-2">
              <input
                type={showApiKey ? "text" : "password"}
                autoComplete="off"
                value={settings.apiKey}
                onChange={(e) =>
                  setSettings((s) => ({ ...s, apiKey: e.target.value }))
                }
                placeholder="APIキーを入力"
                className="w-full rounded-md border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm text-zinc-100 outline-none focus:border-indigo-500"
              />
              <button
                type="button"
                onClick={() => setShowApiKey((v) => !v)}
                className="shrink-0 rounded-md border border-zinc-700 px-3 py-1.5 text-xs text-zinc-300 hover:bg-zinc-800"
              >
                {showApiKey ? "隠す" : "表示"}
              </button>
            </div>
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <label className="mb-1 block text-sm font-medium text-zinc-300">
                会話生成モデルID
              </label>
              <div className="flex flex-wrap gap-0.5 rounded-md border border-zinc-700 p-0.5 text-sm">
                {MAIN_MODEL_TAB_OPTIONS.map((opt) => (
                  <button
                    key={opt.key}
                    type="button"
                    onClick={() => handleMainModelTabChange(opt.key)}
                    className={`rounded px-3 py-1 ${
                      mainModelTab === opt.key
                        ? "bg-indigo-600 text-white"
                        : "text-zinc-400 hover:text-zinc-200"
                    }`}
                  >
                    {opt.label}
                  </button>
                ))}
                <button
                  type="button"
                  onClick={() => handleMainModelTabChange("custom")}
                  className={`rounded px-3 py-1 ${
                    mainModelTab === "custom"
                      ? "bg-indigo-600 text-white"
                      : "text-zinc-400 hover:text-zinc-200"
                  }`}
                >
                  カスタム
                </button>
              </div>

              {mainModelTab === "custom" ? (
                <input
                  type="text"
                  value={settings.mainModelId}
                  onChange={(e) =>
                    setSettings((s) => ({ ...s, mainModelId: e.target.value }))
                  }
                  placeholder="例: gemini-3.5-flash"
                  className="mt-2 w-full rounded-md border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm text-zinc-100 outline-none focus:border-indigo-500"
                />
              ) : (
                <p className="mt-2 truncate text-xs text-zinc-500" title={settings.mainModelId}>
                  {settings.mainModelId}
                </p>
              )}

              {(() => {
                if (mainModelTab === "custom") {
                  return (
                    <div className="mt-1 space-y-0.5">
                      <p className="text-xs text-zinc-500 break-words">
                        {CUSTOM_MODEL_TAB_DESCRIPTION}
                      </p>
                    </div>
                  );
                }
                const active = MAIN_MODEL_TAB_OPTIONS.find((opt) => opt.key === mainModelTab);
                if (!active) return null;
                return (
                  <div className="mt-1 space-y-0.5">
                    <p className="text-xs text-zinc-500 break-words">{active.description}</p>
                    {active.note && (
                      <p className="text-xs text-amber-400 break-words">{active.note}</p>
                    )}
                  </div>
                );
              })()}
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-zinc-300">
                軽量処理モデルID
              </label>
              <input
                type="text"
                value={settings.liteModelId}
                onChange={(e) =>
                  setSettings((s) => ({ ...s, liteModelId: e.target.value }))
                }
                className="w-full rounded-md border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm text-zinc-100 outline-none focus:border-indigo-500"
              />
            </div>
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <label className="mb-1 block text-sm font-medium text-zinc-300">
                直近発言の参照数
              </label>
              <input
                type="number"
                min={1}
                value={settings.recentMessageCount}
                onChange={(e) =>
                  setSettings((s) => ({
                    ...s,
                    recentMessageCount: Number(e.target.value),
                  }))
                }
                className="w-full rounded-md border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm text-zinc-100 outline-none focus:border-indigo-500"
              />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-zinc-300">
                要約トリガー発言数
              </label>
              <input
                type="number"
                min={1}
                value={settings.summaryTriggerCount}
                onChange={(e) =>
                  setSettings((s) => ({
                    ...s,
                    summaryTriggerCount: Number(e.target.value),
                  }))
                }
                className="w-full rounded-md border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm text-zinc-100 outline-none focus:border-indigo-500"
              />
            </div>
          </div>
        </div>
        <div className="mt-4 flex items-center gap-3">
          <button
            type="button"
            onClick={handleSaveSettings}
            className="rounded-md bg-indigo-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-indigo-500"
          >
            保存
          </button>
          {settingsSaved && <span className="text-xs text-emerald-400">保存しました</span>}
        </div>
      </section>

      {/* データのエクスポート/インポート */}
      <section className="mt-6 rounded-lg border border-zinc-800 bg-zinc-900 p-4">
        <h2 className="text-base font-semibold text-zinc-100">データのバックアップ</h2>
        <p className="mt-1 text-xs text-zinc-500">
          キャラ・ルーム・会話ログ・記憶をすべて1つのJSONファイルに書き出せます。APIキーは含まれません。
        </p>
        <p className="mt-1 text-xs text-zinc-500">
          「キャラのみエクスポート」は、チャット内容やルームを含まず、キャラ設定だけを書き出します。キャラの共有に便利です。
        </p>
        <p className="mt-1 text-xs text-zinc-500">
          ルーム1つだけを共有・バックアップしたいときは、ルーム画面の「ログ管理」から「ルームをエクスポート」を使います。ここでのインポートも、そのファイルを読み込むと自動的に対応します。
        </p>
        <div className="mt-4 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={handleExport}
            disabled={exporting}
            className="rounded-md bg-indigo-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-indigo-500 disabled:opacity-50"
          >
            {exporting ? "書き出し中…" : "エクスポート"}
          </button>
          <button
            type="button"
            onClick={handleExportCharacters}
            disabled={exportingCharacters}
            className="rounded-md border border-zinc-700 px-3 py-1.5 text-sm text-zinc-300 hover:bg-zinc-800 disabled:opacity-50"
          >
            {exportingCharacters ? "書き出し中…" : "キャラのみエクスポート"}
          </button>
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="rounded-md border border-zinc-700 px-3 py-1.5 text-sm text-zinc-300 hover:bg-zinc-800"
          >
            インポート
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept="application/json"
            className="hidden"
            onChange={handleFileSelected}
          />
        </div>
        {importError && <p className="mt-2 text-xs text-red-400">{importError}</p>}
        {importDone && (
          <p className="mt-2 text-xs text-emerald-400">インポートが完了しました</p>
        )}
      </section>

      {/* インポートモード選択ダイアログ */}
      {modeDialogOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
          onClick={() => {
            setModeDialogOpen(false);
            setPendingImport(null);
          }}
        >
          <div
            className="w-full max-w-sm rounded-lg border border-zinc-700 bg-zinc-900 p-5 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="text-base font-semibold text-zinc-100">
              インポート方法を選択
            </h2>
            <p className="mt-2 text-sm text-zinc-400">
              既存のデータをすべて消してから復元しますか?それとも今のデータに追加しますか?
            </p>
            <div className="mt-5 flex flex-col gap-2">
              <button
                type="button"
                disabled={importing}
                onClick={() => runImport("merge")}
                className="rounded-md border border-zinc-700 px-3 py-2 text-sm text-zinc-200 hover:bg-zinc-800 disabled:opacity-50"
              >
                追加する(既存データは残す)
              </button>
              <button
                type="button"
                disabled={importing}
                onClick={() => {
                  setModeDialogOpen(false);
                  setReplaceConfirmOpen(true);
                }}
                className="rounded-md border border-red-700 px-3 py-2 text-sm text-red-400 hover:bg-red-500/10 disabled:opacity-50"
              >
                置き換える(既存データを削除)
              </button>
              <button
                type="button"
                onClick={() => {
                  setModeDialogOpen(false);
                  setPendingImport(null);
                }}
                className="rounded-md px-3 py-2 text-sm text-zinc-500 hover:text-zinc-300"
              >
                キャンセル
              </button>
            </div>
          </div>
        </div>
      )}

      <ConfirmDialog
        open={replaceConfirmOpen}
        title="本当に置き換えますか?"
        message="現在のキャラ・ルーム・会話ログ・記憶はすべて削除され、インポートしたデータに置き換わります。この操作は取り消せません。"
        confirmLabel="置き換える"
        onCancel={() => {
          setReplaceConfirmOpen(false);
          setPendingImport(null);
        }}
        onConfirm={() => runImport("replace")}
      />

      {/* キャラのみインポートの確認ダイアログ(常に「追加」) */}
      <ConfirmDialog
        open={charactersImportConfirmOpen}
        title="キャラクターを追加しますか?"
        message={`キャラクター${pendingCharactersImport?.characters.length ?? 0}体を追加します。既存のキャラクターはそのまま残ります。`}
        confirmLabel="追加する"
        danger={false}
        onCancel={() => {
          setCharactersImportConfirmOpen(false);
          setPendingCharactersImport(null);
        }}
        onConfirm={runCharactersImport}
      />

      {/* ワールドインポートの確認ダイアログ(常に「追加」) */}
      <ConfirmDialog
        open={worldImportConfirmOpen}
        title="ワールドを追加しますか?"
        message={`ワールド「${pendingWorldImport?.world.name ?? ""}」とキャラクター${
          pendingWorldImport?.characters.length ?? 0
        }体を追加します。既存のデータはそのまま残ります。`}
        confirmLabel="追加する"
        danger={false}
        onCancel={() => {
          setWorldImportConfirmOpen(false);
          setPendingWorldImport(null);
        }}
        onConfirm={runWorldImport}
      />

      {/* ルームインポートの確認ダイアログ(常に「追加」) */}
      <ConfirmDialog
        open={roomImportConfirmOpen}
        title="ルームを追加しますか?"
        message={`ルーム「${pendingRoomImport?.room.name ?? ""}」を追加します。参加キャラクター${
          pendingRoomImport?.characters.length ?? 0
        }体、${
          pendingRoomImport?.includesLog
            ? "会話ログ・記憶を含みます(続きから遊べます)。"
            : "会話ログは含まれません(記憶のみ含みます)。"
        }既存のデータはそのまま残ります。`}
        confirmLabel="追加する"
        danger={false}
        onCancel={() => {
          setRoomImportConfirmOpen(false);
          setPendingRoomImport(null);
        }}
        onConfirm={runRoomImport}
      />
    </div>
  );
}
