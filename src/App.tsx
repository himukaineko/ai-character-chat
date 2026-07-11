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

function App() {
  const loadAll = useAppStore((s) => s.loadAll);
  const loaded = useAppStore((s) => s.loaded);

  // 起動時にIndexedDBから全データを読み込む
  useEffect(() => {
    loadAll();
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
