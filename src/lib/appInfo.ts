// アプリ名・バージョン情報(機能追加)
//
// アプリ名はこれまで index.html の <title> とOGPにしか無く、画面内に一度も出ていなかったため、
// 表示用の定数としてここに集約する。バージョンは package.json の値を vite.config.ts の define で
// ビルド時に埋め込んでいる(手書きすると二重管理になり、上げ忘れで実態とズレるため)。

/** 型宣言: vite.config.ts の define で置換されるグローバル定数 */
declare const __APP_VERSION__: string;

/** アプリ名(画面表示用。index.html の <title>・OGPと同じ表記を使う) */
export const APP_NAME = "ChatScope Rooms";

/** アプリのバージョン(package.json の version をビルド時に埋め込んだもの) */
export const APP_VERSION = __APP_VERSION__;
