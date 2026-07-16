// 作者への応援・SNS誘導リンク(機能追加)
// 使い方ページの常時表示カードと、ホーム画面最下部のさりげないリンク行の両方から
// 同じデータ(URL・説明文)を参照させ、表記のズレが起きないようにする。
// アイコンはNav.tsx / RoomBarIcons.tsxの線画テイスト(viewBox 0 0 24 24, stroke=currentColor, strokeWidth 1.6)に合わせる。
import type { ReactNode, SVGProps } from "react";

type IconProps = SVGProps<SVGSVGElement>;

function IconBase({ children, ...props }: IconProps & { children: ReactNode }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.6}
      strokeLinecap="round"
      strokeLinejoin="round"
      {...props}
    >
      {children}
    </svg>
  );
}

/** note: 角が折れたメモ用紙+本文の線(記事投稿サービスの雰囲気を簡易な線画で表現) */
export function NoteIcon(props: IconProps) {
  return (
    <IconBase {...props}>
      <path d="M6 3h7l5 5v13H6z" />
      <path d="M13 3v5h5" />
      <path d="M9 12h6M9 16h4" />
    </IconBase>
  );
}

/** X: 交差する2本の線でロゴの雰囲気のみを表現(正式ロゴの再現はしない) */
export function XIcon(props: IconProps) {
  return (
    <IconBase {...props}>
      <path d="M5 5l14 14M19 5 5 19" />
    </IconBase>
  );
}

/** Ko-fi: 取っ手付きのカップと湯気 */
export function KofiIcon(props: IconProps) {
  return (
    <IconBase {...props}>
      <path d="M5 9h12v6.5A4.5 4.5 0 0 1 12.5 20h-3A4.5 4.5 0 0 1 5 15.5z" />
      <path d="M17 10.5h1.5a2.5 2.5 0 0 1 0 5H17" />
      <path d="M9 4.5c0 1-1.2 1-1.2 2M13 4.5c0 1-1.2 1-1.2 2" />
    </IconBase>
  );
}

export interface SupportLink {
  key: "note" | "x" | "kofi";
  name: string;
  href: string;
  description: string;
  icon: (props: IconProps) => ReactNode;
}

// 依頼者提供のURL。正確な値をそのまま使用する。
export const SUPPORT_LINKS: SupportLink[] = [
  {
    key: "note",
    name: "note",
    href: "https://note.com/himukai_an",
    description: "キャラ配布や開発の話はこちら。チップでの応援もできます",
    icon: NoteIcon,
  },
  {
    key: "x",
    name: "X",
    href: "https://x.com/himukai_an",
    description: "更新情報をお知らせします",
    icon: XIcon,
  },
  {
    key: "kofi",
    name: "Ko-fi",
    href: "https://ko-fi.com/nyanvas",
    description: "コーヒー1杯分から支援できます ☕",
    icon: KofiIcon,
  },
];
