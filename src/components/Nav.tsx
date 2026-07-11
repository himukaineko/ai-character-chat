// ナビゲーション: デスクトップは左端の細いレール、モバイルは下部バー
import type { ReactNode } from "react";
import { NavLink } from "react-router-dom";

const navItems = [
  {
    to: "/",
    label: "ホーム",
    icon: (
      <path d="M3 10.5 12 3l9 7.5M5 9.5V21h5v-6h4v6h5V9.5" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
    ),
  },
  {
    to: "/library",
    label: "ライブラリ",
    icon: (
      <path
        d="M4 5h6v6H4zM14 5h6v6h-6zM4 15h6v6H4zM14 15h6v6h-6z"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    ),
  },
  {
    to: "/settings",
    label: "設定",
    icon: (
      <>
        <circle cx="12" cy="12" r="3" strokeWidth="1.6" />
        <path
          d="M19.4 13a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V19a2 2 0 1 1-4 0v-.09a1.65 1.65 0 0 0-1-1.51 1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H4a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 5.6 9.6a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H10a1.65 1.65 0 0 0 1-1.51V4a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V10c.63.14 1.51.5 1.51 1.51V12z"
          strokeWidth="1.2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </>
    ),
  },
  {
    to: "/help",
    label: "使い方",
    icon: (
      <>
        <circle cx="12" cy="12" r="9" strokeWidth="1.6" />
        <path
          d="M9.5 9.3a2.5 2.5 0 0 1 4.87.9c0 1.7-2.37 2.1-2.37 3.6"
          strokeWidth="1.6"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <circle cx="12" cy="17" r="0.9" fill="currentColor" stroke="none" />
      </>
    ),
  },
];

function NavIcon({ children }: { children: ReactNode }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" className="h-5 w-5">
      {children}
    </svg>
  );
}

export function Nav() {
  const linkClass = ({ isActive }: { isActive: boolean }) =>
    `flex flex-col items-center justify-center gap-1 rounded-md px-2 py-2 text-[11px] transition-colors md:w-full md:py-3 ${
      isActive
        ? "text-indigo-400 bg-indigo-500/10"
        : "text-zinc-500 hover:text-zinc-200 hover:bg-zinc-800/60"
    }`;

  return (
    <>
      {/* デスクトップ: 左端の細いレール */}
      <nav className="fixed left-0 top-0 z-40 hidden h-full w-16 flex-col items-center gap-2 border-r border-zinc-800 bg-zinc-950 py-4 md:flex">
        {navItems.map((item) => (
          <NavLink key={item.to} to={item.to} end={item.to === "/"} className={linkClass}>
            <NavIcon>{item.icon}</NavIcon>
            <span>{item.label}</span>
          </NavLink>
        ))}
      </nav>

      {/* モバイル: 下部バー */}
      <nav className="fixed bottom-0 left-0 right-0 z-40 flex border-t border-zinc-800 bg-zinc-950/95 backdrop-blur md:hidden">
        {navItems.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.to === "/"}
            className={linkClass + " flex-1"}
          >
            <NavIcon>{item.icon}</NavIcon>
            <span>{item.label}</span>
          </NavLink>
        ))}
      </nav>
    </>
  );
}
