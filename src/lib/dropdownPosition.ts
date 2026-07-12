// ドロップダウンメニューの画面内配置計算(機能修正: モバイルでのはみ出し対策)
// トリガー基準のabsolute配置(right-0/left-0固定)だと、画面端に近いトリガーから開いた
// メニューが画面外に切れてしまう(例: 375px幅でログ管理メニューの左端が見切れる)。
// トリガーのgetBoundingClientRectからfixed配置用の座標を計算し、
// 左右端を画面内(margin分の余白を確保)にクランプすることで必ず画面内に収める。
import type { CSSProperties } from "react";

interface DropdownStyleOptions {
  /** メニューの希望幅(px)。画面幅に収まらない場合は縮める */
  menuWidth: number;
  /** down=トリガーの下に開く / up=トリガーの上に開く */
  direction: "down" | "up";
  /** トリガーのどちらの端に揃えるか(既定: right=トリガーの右端にメニューの右端を合わせる) */
  align?: "left" | "right";
  /** 画面端から最低限空ける余白(px) */
  margin?: number;
}

/**
 * fixed配置のメニューに適用するstyle(left/top/bottom/width)を計算する。
 * メニューを開く瞬間に呼び出し、結果をstate等に保持してstyle属性に渡す。
 */
export function calcDropdownStyle(
  trigger: HTMLElement,
  options: DropdownStyleOptions,
): CSSProperties {
  const { menuWidth, direction, align = "right", margin = 8 } = options;
  const rect = trigger.getBoundingClientRect();
  const viewportWidth = window.innerWidth;
  const width = Math.min(menuWidth, viewportWidth - margin * 2);
  // トリガーの端に揃えた位置を基本に、画面からはみ出す場合だけ内側に寄せる
  const preferredLeft = align === "right" ? rect.right - width : rect.left;
  const left = Math.min(Math.max(preferredLeft, margin), viewportWidth - width - margin);

  const style: CSSProperties = { left, width };
  if (direction === "down") {
    style.top = rect.bottom + 4;
  } else {
    style.bottom = window.innerHeight - rect.top + 4;
  }
  return style;
}
