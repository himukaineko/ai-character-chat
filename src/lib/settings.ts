// UserProfile と AppSettings は localStorage で管理する(仕様書4章)
// APIキーもここに含まれるが、13章の禁止事項によりエクスポートには絶対に含めない
import type { AppSettings, UserProfile } from "../types";

const APP_SETTINGS_KEY = "ai-character-chat:appSettings";
const USER_PROFILE_KEY = "ai-character-chat:userProfile";
const LAST_ROOM_ID_KEY = "ai-character-chat:lastRoomId";
// 初回起動時オンボーディング(機能追加)のシード投入済みフラグ。
// 「データが空かどうか」ではなく、このフラグの有無だけで判定する
// (ユーザーが後から全データを消してもオンボーディングを復活させないため)。
const ONBOARDING_SEEDED_KEY = "ai-character-chat:onboardingSeeded";

// 提供終了になった旧モデルID → 後継モデルID の対応表
// (gemini-2.5-flash-lite は2026年に新規ユーザーへの提供が終了したため差し替える)
const MODEL_MIGRATIONS: Record<string, string> = {
  "gemini-2.5-flash-lite": "gemini-3.1-flash-lite",
};

/** AppSettings のデフォルト値(仕様書4章) */
export function defaultAppSettings(): AppSettings {
  return {
    apiKey: "",
    mainModelId: "gemini-3.5-flash",
    liteModelId: "gemini-3.1-flash-lite",
    recentMessageCount: 30,
    summaryTriggerCount: 40,
  };
}

/** 会話生成モデルIDのタブ選択肢キー(「カスタム」は自由入力欄を表示する特殊値) */
export type MainModelTabKey = "standard" | "high" | "custom";

/** 会話生成モデルIDのプリセットタブ(設定画面でセグメントコントロールとして表示する) */
export const MAIN_MODEL_TAB_OPTIONS: {
  key: Exclude<MainModelTabKey, "custom">;
  value: string;
  label: string;
  description: string;
  note?: string;
}[] = [
  {
    key: "standard",
    value: "gemini-3.5-flash",
    label: "gemini-3.5-flash",
    description: "バランスの良い標準モデル",
  },
  {
    key: "high",
    value: "gemini-3.1-pro-preview",
    label: "gemini-3.1-pro-preview",
    description: "より高品質な会話",
    note: "※ 課金設定済み(有料)のAPIキーが必要です。課金設定済みのGoogleアカウントでも、無料枠のAPIキーでは使えません。",
  },
];

/** 「カスタム」タブの説明文(プリセット外のモデルIDを直接入力する場合に表示する) */
export const CUSTOM_MODEL_TAB_DESCRIPTION =
  "任意のGeminiモデルIDを直接入力できます(新モデルが出たとき用)。";

/** 保存されているmainModelIdの値から、選択状態にすべきタブを判定する(プリセット外の値は「カスタム」扱い) */
export function resolveMainModelTab(mainModelId: string): MainModelTabKey {
  const matched = MAIN_MODEL_TAB_OPTIONS.find((opt) => opt.value === mainModelId);
  return matched ? matched.key : "custom";
}

/** UserProfile のデフォルト値 */
export function defaultUserProfile(): UserProfile {
  return {
    name: "",
    calledAs: "",
    treatment: "",
    background: "",
    appearance: "",
    dislikedTopics: [],
    preferredMood: "",
  };
}

/** AppSettings を読み込む(未保存ならデフォルト値を返す) */
export function loadAppSettings(): AppSettings {
  try {
    const raw = localStorage.getItem(APP_SETTINGS_KEY);
    if (!raw) return defaultAppSettings();
    const parsed = JSON.parse(raw) as Partial<AppSettings>;
    // 欠けているフィールドはデフォルト値で補完する(将来のフィールド追加にも耐える)
    const settings = { ...defaultAppSettings(), ...parsed };
    // 提供終了モデルが保存されていたら後継モデルに差し替えて保存し直す
    let migrated = false;
    for (const key of ["mainModelId", "liteModelId"] as const) {
      const replacement = MODEL_MIGRATIONS[settings[key]];
      if (replacement) {
        settings[key] = replacement;
        migrated = true;
      }
    }
    if (migrated) saveAppSettings(settings);
    return settings;
  } catch {
    return defaultAppSettings();
  }
}

/** AppSettings を保存する */
export function saveAppSettings(settings: AppSettings): void {
  localStorage.setItem(APP_SETTINGS_KEY, JSON.stringify(settings));
}

/** UserProfile を読み込む(未保存ならデフォルト値を返す) */
export function loadUserProfile(): UserProfile {
  try {
    const raw = localStorage.getItem(USER_PROFILE_KEY);
    if (!raw) return defaultUserProfile();
    const parsed = JSON.parse(raw) as Partial<UserProfile>;
    return { ...defaultUserProfile(), ...parsed };
  } catch {
    return defaultUserProfile();
  }
}

/** UserProfile を保存する */
export function saveUserProfile(profile: UserProfile): void {
  localStorage.setItem(USER_PROFILE_KEY, JSON.stringify(profile));
}

/** 最後に開いたルームIDを取得する(ホーム画面の「続きから」表示用。未記録ならnull) */
export function loadLastRoomId(): string | null {
  try {
    return localStorage.getItem(LAST_ROOM_ID_KEY);
  } catch {
    return null;
  }
}

/** 最後に開いたルームIDを記録する(ルーム画面を開いたときに呼ぶ) */
export function saveLastRoomId(roomId: string): void {
  try {
    localStorage.setItem(LAST_ROOM_ID_KEY, roomId);
  } catch {
    // localStorageが使えない環境では何もしない(致命的ではないため無視する)
  }
}

/**
 * 初回起動時オンボーディング(機能追加)のシードデータを投入済みかどうか。
 * このフラグが立っていなければ、App.tsx側でseedOnboardingData()を実行する。
 */
export function hasSeededOnboarding(): boolean {
  try {
    return localStorage.getItem(ONBOARDING_SEEDED_KEY) === "true";
  } catch {
    // localStorageが使えない環境では「投入済み」として扱い、毎回投入しようとしないようにする
    return true;
  }
}

/** 初回起動時オンボーディングのシードデータを投入済みとして記録する */
export function markOnboardingSeeded(): void {
  try {
    localStorage.setItem(ONBOARDING_SEEDED_KEY, "true");
  } catch {
    // localStorageが使えない環境では何もしない(致命的ではないため無視する)
  }
}
