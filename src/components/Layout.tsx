// 全画面共通のレイアウト(ナビゲーション+コンテンツ領域)
import { Outlet } from "react-router-dom";
import { Nav } from "./Nav";
import { useAppStore } from "../store";

export function Layout() {
  // 没入モード(機能追加: ルーム画面のチャットのみ表示)中はナビ自体を隠し、
  // ナビ分のpadding/margin(pb-20・md:ml-16)も外してコンテンツが全域を使えるようにする。
  const immersiveMode = useAppStore((s) => s.immersiveMode);

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100">
      {!immersiveMode && <Nav />}
      <main
        className={
          immersiveMode ? "min-h-screen" : "min-h-screen pb-20 md:ml-16 md:pb-0"
        }
      >
        <Outlet />
      </main>
    </div>
  );
}
