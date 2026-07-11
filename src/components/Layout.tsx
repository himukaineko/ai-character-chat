// 全画面共通のレイアウト(ナビゲーション+コンテンツ領域)
import { Outlet } from "react-router-dom";
import { Nav } from "./Nav";

export function Layout() {
  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100">
      <Nav />
      <main className="min-h-screen pb-20 md:ml-16 md:pb-0">
        <Outlet />
      </main>
    </div>
  );
}
