// クリップボードコピーの共通ヘルパー
// スマホからhttp(非セキュアコンテキスト)でアクセスした場合、navigator.clipboardが
// 存在しない(undefined)ため、その場合は一時textareaを使ったフォールバックでコピーする。

/**
 * テキストをクリップボードにコピーする。
 * navigator.clipboardが使える場合はそれを使い、使えない場合(非セキュアコンテキスト等)は
 * 一時textareaを作ってselect() + document.execCommand("copy")でコピーする。
 * @returns コピーに成功したかどうか
 */
export async function copyTextToClipboard(text: string): Promise<boolean> {
  if (navigator.clipboard) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      // Clipboard APIがエラーを投げた場合もフォールバックを試す
    }
  }

  // フォールバック: 一時textareaを使ったコピー(非セキュアコンテキストや古いブラウザ向け)
  try {
    const textarea = document.createElement("textarea");
    textarea.value = text;
    // 画面に表示・スクロールされないよう画面外に配置
    textarea.style.position = "fixed";
    textarea.style.top = "0";
    textarea.style.left = "0";
    textarea.style.width = "1px";
    textarea.style.height = "1px";
    textarea.style.padding = "0";
    textarea.style.border = "none";
    textarea.style.outline = "none";
    textarea.style.boxShadow = "none";
    textarea.style.background = "transparent";
    textarea.style.opacity = "0";
    document.body.appendChild(textarea);
    textarea.focus();
    textarea.select();
    const succeeded = document.execCommand("copy");
    document.body.removeChild(textarea);
    return succeeded;
  } catch {
    return false;
  }
}
