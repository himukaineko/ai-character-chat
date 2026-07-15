// 使い方ページ: 初めてアプリを触る人向けの簡易ガイド
// 上部は常時表示のクイックスタート(3ステップ)、下部は機能別の折りたたみ(アコーディオン)。
// 「文字がずらずら並んで読みづらい」というフィードバックを受け、各項目は箇条書きで要点のみ短く示す。
import type { ReactNode } from "react";
// ルーム画面の上部バーアイコンの凡例(機能追加): 実物と同じSVGを表示して迷いをなくす
import {
  ImageIcon,
  ListIcon,
  PanelIcon,
  SettingsIcon,
  ThemeIcon,
  TrashIcon,
} from "../components/room/RoomBarIcons";

// ボタン名・画面名を目立たせるためのバッジ風インライン表示
function Tag({ children }: { children: ReactNode }) {
  return (
    <span className="rounded bg-zinc-800 px-1.5 py-0.5 text-[0.8em] font-semibold text-indigo-300">
      {children}
    </span>
  );
}

// 箇条書き(・)の1項目
function Bullet({ children }: { children: ReactNode }) {
  return (
    <li className="flex gap-2">
      <span className="mt-px shrink-0 text-zinc-600">・</span>
      <span>{children}</span>
    </li>
  );
}

function BulletList({ children }: { children: ReactNode }) {
  return (
    <ul className="space-y-2 text-sm leading-relaxed text-zinc-300">
      {children}
    </ul>
  );
}

// 見落とされたくない注意事項(記憶の発生条件・バックアップのリスクなど)
function NoteBox({
  label,
  tone = "indigo",
  children,
}: {
  label: string;
  tone?: "indigo" | "amber";
  children: ReactNode;
}) {
  const toneClass =
    tone === "amber"
      ? "border-amber-800/60 bg-amber-950/30 text-amber-200"
      : "border-indigo-800/60 bg-indigo-950/30 text-indigo-200";
  return (
    <p className={`rounded-md border px-3 py-2 text-xs leading-relaxed ${toneClass}`}>
      <span className="font-semibold">【{label}】</span> {children}
    </p>
  );
}

// クイックスタートの1ステップ
function QuickStartStep({
  number,
  title,
  children,
}: {
  number: number;
  title: string;
  children: ReactNode;
}) {
  return (
    <li className="flex gap-3">
      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-indigo-600 text-sm font-bold text-white">
        {number}
      </span>
      <div className="pt-0.5">
        <p className="text-sm font-semibold text-zinc-100">{title}</p>
        <p className="mt-0.5 text-sm leading-relaxed text-zinc-400">{children}</p>
      </div>
    </li>
  );
}

// ルーム画面のボタン凡例の1行(実物のアイコン+名前+一言説明)
function IconLegendRow({
  icon,
  name,
  children,
}: {
  icon: ReactNode;
  name: string;
  children: ReactNode;
}) {
  return (
    <li className="flex items-start gap-3">
      {/* ルーム画面の実際のボタンと同じ「枠付きの角丸」で表示し、画面上での見た目と対応づける */}
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md border border-zinc-700 text-zinc-300">
        {icon}
      </span>
      <div className="min-w-0 pt-0.5">
        <p className="text-sm font-semibold text-zinc-100">{name}</p>
        <p className="mt-0.5 text-xs leading-relaxed text-zinc-400">{children}</p>
      </div>
    </li>
  );
}

// 機能別セクション。ネイティブのdetails/summaryをスタイリングし、デフォルトは閉じた状態。
function AccordionSection({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <details className="group mt-3 rounded-lg border border-zinc-800 bg-zinc-900 open:bg-zinc-900">
      <summary className="flex cursor-pointer list-none items-center justify-between px-4 py-3 text-sm font-semibold text-zinc-100 [&::-webkit-details-marker]:hidden">
        {title}
        <span className="ml-2 shrink-0 text-xs text-zinc-500 transition-transform group-open:rotate-180">
          ▼
        </span>
      </summary>
      <div className="px-4 pb-4">{children}</div>
    </details>
  );
}

export function HelpPage() {
  return (
    <div className="mx-auto max-w-2xl px-4 py-8">
      <h1 className="text-xl font-bold text-zinc-100">使い方</h1>
      <p className="mt-1 text-sm text-zinc-500">
        まずは下の3ステップで最初のルームまで進めます。各機能の詳しい説明は、その下の項目をタップして開いてください。
      </p>

      {/* クイックスタート: 常時表示 */}
      <section className="mt-6 rounded-lg border border-zinc-800 bg-zinc-900 p-4">
        <h2 className="text-base font-semibold text-zinc-100">3ステップで始める</h2>
        <ol className="mt-4 space-y-4">
          <QuickStartStep number={1} title="APIキーを設定">
            <a
              href="https://aistudio.google.com/"
              target="_blank"
              rel="noopener noreferrer"
              className="text-indigo-400 hover:underline"
            >
              Google AI Studio
            </a>
            で無料のGemini APIキーを取得し、<Tag>設定</Tag>の<Tag>API設定</Tag>に入力します。キーはこの端末の中だけに保存されます。
          </QuickStartStep>
          <QuickStartStep number={2} title="キャラを作る">
            <Tag>ライブラリ</Tag>で作成します。<Tag>AIで一括提案</Tag>を使えば、簡単な説明を入力するだけで自動生成できます。
          </QuickStartStep>
          <QuickStartStep number={3} title="ルームを作って話す">
            ホームから<Tag>新規ルーム作成</Tag>。あとは<Tag>トピック</Tag>で話題を振るか、<Tag>発言</Tag>で参加します。
          </QuickStartStep>
        </ol>
      </section>

      {/* 機能別の折りたたみセクション(デフォルト閉) */}
      <div className="mt-8">
        <h2 className="px-1 text-sm font-semibold text-zinc-500">機能別ガイド</h2>

        <AccordionSection title="キャラクター作成">
          <BulletList>
            <Bullet>
              手動入力、または<Tag>AIで一括提案</Tag>で自動生成できます(フィールド単位の再提案も可能)。
            </Bullet>
            <Bullet>
              <Tag>AIでグループ作成</Tag>を使うと、同級生3人・ホストクラブのキャストと黒服のような
              関係性のある複数キャラクターを、キャラ同士の関係込みでまとめて生成できます。
              内容を確認してから作成するので、そのまま自動保存されることはありません。
            </Bullet>
            <Bullet>
              アイコン画像はアップロード後にトリミングして調整。イメージイラストはトリミングせずそのまま複数枚登録できます。
            </Bullet>
            <Bullet>チャット画面で顔アイコンをタップすると、◀▶でイメージイラストを切り替えて見られます。</Bullet>
            <Bullet>
              ライブラリのキャラカードにある<Tag>顔絵プロンプト</Tag>ボタンで、外見・性格をもとにした画像生成AI用のアイコン作成プロンプトを出力できます。
            </Bullet>
          </BulletList>
        </AccordionSection>

        <AccordionSection title="ワールド(世界線グループ)">
          <BulletList>
            <Bullet>
              <Tag>ライブラリ</Tag>の<Tag>ワールド</Tag>機能でキャラをフォルダ分けできます。
            </Bullet>
            <Bullet>キャラ同士の関係(幼なじみ、上司と部下など)を登録でき、会話生成に自動で反映されます。</Bullet>
            <Bullet>ワールドごとに専用のユーザー設定(名前・扱われ方など)も持たせられます。</Bullet>
            <Bullet>ルーム作成・編集時にワールドを選ぶと、そのルームの会話に適用されます。</Bullet>
          </BulletList>
        </AccordionSection>

        <AccordionSection title="会話のしかた">
          <BulletList>
            <Bullet>
              <Tag>トピック</Tag>=話題を投入(その話題でキャラたちが話し始めます)、<Tag>発言</Tag>=自分が参加、<Tag>会話を続ける</Tag>=何も足さずに今の流れの続きを生成。
            </Bullet>
            <Bullet>回数を選んで自動連続生成でき、途中で停止することもできます。</Bullet>
            <Bullet>キャラのアイコンから参加状態(参加・聞いている・不参加)を切り替えられます。</Bullet>
            <Bullet>キャラが1人だけのルームでは、返事は連投を防ぐため1発言だけ生成されます。</Bullet>
            <Bullet>
              ルーム設定の<Tag>返事の長さ</Tag>で、短め〜長めにボリュームを調整できます。
            </Bullet>
            <Bullet>
              ルーム設定の<Tag>地の文・ナレーターのカスタム</Tag>では、軽快さ・ツッコミ役っぽさ・二人称視点(「あなたは」で語りかける)など、地の文やナレーターの文体を自由記述でカスタムできます。
            </Bullet>
            <Bullet>
              ルーム設定の<Tag>表紙イラスト</Tag>で画像を1枚設定すると、ホーム画面のルームカードに本の表紙のように表示されます。
            </Bullet>
          </BulletList>
        </AccordionSection>

        {/* ルーム画面の上部バーはスマホではアイコンのみ表示のため、実物アイコン付きの凡例を用意する(機能追加) */}
        <AccordionSection title="ルーム画面のボタン">
          <p className="text-xs leading-relaxed text-zinc-500">
            ルーム画面の上部バーのボタンは、スマホではアイコンだけで表示されます。それぞれの意味は次のとおりです。
          </p>
          <ul className="mt-3 space-y-3">
            <IconLegendRow icon={<ThemeIcon className="h-5 w-5" />} name="テーマ切替">
              押すたびにチャットの配色テーマが切り替わります(黒系→濃紺系→白系→ナチュラル系の順)。
            </IconLegendRow>
            <IconLegendRow icon={<PanelIcon className="h-5 w-5" />} name="パネル">
              メンバーの参加状態の一括管理と、会話から蓄積された記憶の一覧・編集を開きます。
            </IconLegendRow>
            <IconLegendRow icon={<ImageIcon className="h-5 w-5" />} name="スチル">
              今の会話シーンをイラスト化するための、画像生成AI用プロンプトを作成します。
            </IconLegendRow>
            <IconLegendRow icon={<ListIcon className="h-5 w-5" />} name="ログ管理">
              会話ログの削除を段階別(ログのみ/ログ+要約/ルーム完全リセット)に実行できます。
            </IconLegendRow>
            <IconLegendRow icon={<SettingsIcon className="h-5 w-5" />} name="ルーム設定">
              ルーム名・参加メンバー・世界観メモ・ナレーションレベルなどを変更します。
            </IconLegendRow>
            <IconLegendRow icon={<TrashIcon className="h-5 w-5" />} name="削除">
              ルームそのものを削除します(会話ログや記憶ごと消えます。取り消せません)。
            </IconLegendRow>
            <IconLegendRow icon={<span className="text-base leading-none">⋯</span>} name="その他の操作(入力欄の横)">
              スマホでは入力欄の上の<Tag>⋯</Tag>に、元に戻す・再生成・自動生成がまとまっています。
            </IconLegendRow>
          </ul>
        </AccordionSection>

        <AccordionSection title="行動描写(【 】記法)">
          <BulletList>
            <Bullet>セリフを【 】で囲むと行動描写として扱われます。セリフの前・途中・後どこに入れても構いません。</Bullet>
            <Bullet>入力中はShift+Enterで改行できます。</Bullet>
          </BulletList>

          {/* 実例: 入力とチャット上での表示のされ方を見せる */}
          <div className="mt-3 space-y-2 rounded-lg bg-zinc-800/60 p-3">
            <p className="text-xs text-zinc-500">入力例</p>
            <p className="rounded-md bg-zinc-950/40 px-3 py-2 text-sm text-zinc-200">
              それは<span className="font-semibold text-indigo-300">【少し笑って】</span>
              冗談だよ
            </p>
            <p className="text-xs text-zinc-500">→ チャット上での表示</p>
            <div className="flex max-w-[85%] flex-col gap-0.5 rounded-2xl rounded-tl-sm bg-zinc-900 px-3 py-2">
              <p className="text-sm text-zinc-100">それは</p>
              <p className="font-mincho text-sm text-zinc-400">少し笑って</p>
              <p className="text-sm text-zinc-100">冗談だよ</p>
            </div>
            <p className="text-xs text-zinc-500">
              【 】の括弧自体は表示されず、行動描写の部分だけ別書体(明朝体)・別の色で表示されます。
            </p>
          </div>
        </AccordionSection>

        <AccordionSection title="記憶">
          <BulletList>
            <Bullet>会話の中の重要な出来事や関係性の変化は、自動でキャラクターの記憶として蓄積されます。</Bullet>
            <Bullet>
              パネルの<Tag>記憶</Tag>タブから、固定(消えないようにする)・編集・削除・キャラ本体への昇格ができます。
            </Bullet>
            <Bullet>記憶はルームごとに独立しています。同じキャラでも別のルームでは別の記憶を持ちます。</Bullet>
          </BulletList>
          <div className="mt-3">
            <NoteBox label="重要">
              自動で記憶が増えるのは、未要約の発言が約40件を超えたときです(<Tag>設定</Tag>の
              <Tag>要約トリガー発言数</Tag>で変更可)。すぐ整理したいときは、パネルの<Tag>記憶</Tag>タブにある
              <Tag>記憶を整理</Tag>から手動で実行できます。
            </NoteBox>
          </div>
        </AccordionSection>

        <AccordionSection title="やり直し">
          <BulletList>
            <Bullet>
              メッセージをホバー(PC)または長押し(スマホ)すると<Tag>ここまで戻る</Tag>が表示され、そこまで巻き戻せます。
            </Bullet>
            <Bullet>直近の発言だけをやり直したいときは、再生成ボタン(オプション付き)を使います。</Bullet>
            <Bullet>ログ管理からは、メッセージを段階的に削除することもできます。</Bullet>
          </BulletList>
        </AccordionSection>

        <AccordionSection title="スチル(シーンをイラスト化)">
          <BulletList>
            <Bullet>
              上部の<Tag>スチル</Tag>ボタンから、今の会話シーンの日本語プロンプトを自動生成できます。
            </Bullet>
            <Bullet>生成結果をコピーし、画像生成AI(ChatGPT等)にキャラクター画像と一緒に貼り付けて使います。</Bullet>
          </BulletList>
        </AccordionSection>

        <AccordionSection title="表示カスタマイズ">
          <BulletList>
            <Bullet>
              <Tag>設定</Tag>の<Tag>表示設定</Tag>で、チャット画面の文字サイズ(小/標準/大)を選べます。
            </Bullet>
            <Bullet>背景色はプリセットから選ぶか、カラーピッカーで自由に指定できます。</Bullet>
          </BulletList>
        </AccordionSection>

        <AccordionSection title="バックアップと共有">
          <BulletList>
            <Bullet>
              <Tag>設定</Tag>の<Tag>エクスポート</Tag>で、キャラ・ルーム・会話ログ・記憶をまとめてJSONファイルに保存できます。
            </Bullet>
            <Bullet>
              キャラクターだけを共有したいときは、<Tag>キャラのみエクスポート</Tag>やライブラリの各キャラの
              <Tag>エクスポート</Tag>を使います。
            </Bullet>
            <Bullet>
              ワールドごと共有したいときは、<Tag>ライブラリ</Tag>でワールドを選んで<Tag>エクスポート</Tag>を使うと、所属キャラとキャラ同士の関係性ごとまとめて1つのファイルで共有できます(あなたのユーザー設定は含まれません)。
            </Bullet>
            <Bullet>APIキーは、どのエクスポートにも含まれません。</Bullet>
          </BulletList>
          <div className="mt-3">
            <NoteBox label="注意" tone="amber">
              データはこのブラウザの中だけに保存されています。ブラウザのデータを削除すると消えてしまうため、定期的なエクスポートをおすすめします。
            </NoteBox>
          </div>
        </AccordionSection>

        <AccordionSection title="⚠ 利用上の注意">
          <div className="-mx-4 -mt-4 mb-3 rounded-t-lg border-b border-amber-800/40 bg-amber-950/20 px-4 py-2">
            <p className="text-xs text-amber-300">
              公開・利用の前に、必ず目を通してください。
            </p>
          </div>
          <BulletList>
            <Bullet>
              <span className="font-semibold text-zinc-200">APIキーと料金:</span>{" "}
              APIキーはあなたのブラウザ内にのみ保存され、開発者に送信されることはありません。API利用料が発生する場合(無料枠の超過や有料キーの使用時)は、キーの持ち主であるあなたのGoogleアカウントに請求されます。
            </Bullet>
            <Bullet>
              <span className="font-semibold text-zinc-200">プライバシー:</span>{" "}
              Gemini APIの無料枠では、送信した内容がGoogleのAIモデル改善に使われる場合があります(有料キーは対象外)。キャラ設定や会話に、実在の個人情報(本名・住所・連絡先など)を書かないことをおすすめします。
            </Bullet>
            <Bullet>
              <span className="font-semibold text-zinc-200">AIが生成する内容について:</span>{" "}
              会話はAIが生成するフィクションです。内容の正確性・適切性は保証されず、意図しない表現が出力される可能性があります。GeminiのAPI利用規約(年齢制限や禁止用途を含む)は各利用者がGoogleに対して守る必要があります。
            </Bullet>
            <Bullet>
              <span className="font-semibold text-zinc-200">データについて:</span>{" "}
              データはお使いのブラウザの中だけに保存されます。ブラウザのデータ削除などで消えた場合、復元はできません。大切なデータは設定画面のエクスポートでバックアップしてください。
            </Bullet>
            <Bullet>
              <span className="font-semibold text-zinc-200">免責:</span>{" "}
              本アプリは現状のまま提供され、動作の保証はありません。利用によって生じたいかなる損害についても、開発者は責任を負いません。
            </Bullet>
          </BulletList>
        </AccordionSection>
      </div>
    </div>
  );
}
