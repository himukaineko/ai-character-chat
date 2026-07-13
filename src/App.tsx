// アプリのルートコンポーネント
// 静的ホスティング対応のためHashRouterを使用する
import { useEffect } from "react";
import { HashRouter, Routes, Route } from "react-router-dom";
import { Layout } from "./components/Layout";
import { HomePage } from "./pages/HomePage";
import { LibraryPage } from "./pages/LibraryPage";
import { RoomPage } from "./pages/RoomPage";
import { SettingsPage } from "./pages/SettingsPage";
import { HelpPage } from "./pages/HelpPage";
import { useAppStore } from "./store";
import { ensureOnboardingSeeded } from "./lib/onboardingSeed";

function App() {
  const loadAll = useAppStore((s) => s.loadAll);
  const loaded = useAppStore((s) => s.loaded);

  // 起動時にIndexedDBから全データを読み込む。
  // 初回起動時オンボーディング(機能追加): まだシード投入していなければ、
  // 読み込みの前に「導きのテラス」ルーム一式を投入する
  // (判定・二重実行防止のロジックは lib/onboardingSeed.ts 側に集約している)。
  useEffect(() => {
    (async () => {
      await ensureOnboardingSeeded();
      await loadAll();
    })();
  }, [loadAll]);

  if (!loaded) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-zinc-950 text-zinc-400">
        読み込み中…
      </div>
    );
  }

  return (
    <HashRouter>
      <Routes>
        <Route element={<Layout />}>
          <Route path="/" element={<HomePage />} />
          <Route path="/library" element={<LibraryPage />} />
          <Route path="/room/:id" element={<RoomPage />} />
          <Route path="/settings" element={<SettingsPage />} />
          <Route path="/help" element={<HelpPage />} />
        </Route>
      </Routes>
    </HashRouter>
  );
}

export default App;
