// 初回起動時オンボーディングのシードデータ(機能追加)
//
// 「導きのテラス」という、タケシ・アミ・ポポの3人がアプリの使い方を案内してくれる
// ワールド・ルームを1回だけ自動生成する。台本(会話ログ)はAI生成せず、あらかじめ
// 用意した固定の会話をそのままDBに書き込む(saveGeneratedBatchは使わない)。
import { generateId } from "./id";
import { db } from "../db";
import { hasSeededOnboarding, markOnboardingSeeded } from "./settings";
import type { Character, Memory, Message, Room, World } from "../types";

/**
 * 「投入済みか判定→未投入なら投入」を1度だけ実行するためのモジュール内シングルトン。
 * React 18 の StrictMode は開発時に副作用を意図的に2回実行するため、
 * App.tsx の useEffect が短時間に2回呼ばれても、判定と書き込みの間の非同期区間で
 * 両方が「まだ投入されていない」と見なして二重にルームが作られてしまう
 * (実際にブラウザ動作確認で再現した)。同一モジュール内でこの Promise を使い回すことで、
 * 2回目以降の呼び出しは1回目の完了を待つだけにし、確実に1回だけ投入されるようにする。
 */
let ensurePromise: Promise<void> | null = null;

/**
 * 初回起動時オンボーディングのシード投入が済んでいなければ実行する、公開エントリーポイント。
 * App.tsx から起動時に1回呼び出す想定。
 * 判定は localStorage のフラグ(hasSeededOnboarding)のみで行う(ユーザーが後で全データを
 * 消してもオンボーディングが復活しないようにするため)。念のため、フラグが立っていない
 * 場合でもルームが1件も無いときだけ実際に投入する(二重ガード)。
 */
export function ensureOnboardingSeeded(): Promise<void> {
  if (!ensurePromise) {
    ensurePromise = (async () => {
      if (hasSeededOnboarding()) return;
      const roomCount = await db.rooms.count();
      if (roomCount === 0) {
        await seedOnboardingData();
      }
      markOnboardingSeeded();
    })();
  }
  return ensurePromise;
}

/** 空文字・空配列で埋める、元データに存在しないCharacterフィールド */
function emptyCharacterExtras() {
  return {
    nicknames: [] as string[],
    hardConstraints: "",
    ngWords: [] as string[],
    freeNotes: "",
  };
}

/**
 * オンボーディング用シードデータ一式(キャラ3人・ワールド・ルーム・台本・固定記憶)を作成する。
 * 呼び出し前に「まだ投入していないか」の判定は呼び出し側(App.tsx)で行う。
 * 途中で失敗した場合に中途半端なデータが残らないよう、1つのトランザクションにまとめる。
 */
export async function seedOnboardingData(): Promise<void> {
  const now = Date.now();

  // ---- 1. キャラクター3人 ----
  const takeshiId = generateId();
  const amiId = generateId();
  const popoId = generateId();

  const takeshi: Character = {
    id: takeshiId,
    name: "タケシ",
    ...emptyCharacterExtras(),
    firstPerson: "俺",
    secondPerson: "お前",
    speechStyle: "ぶっきらぼうだが筋の通った口調。語尾は短め。",
    personality:
      "面倒見がいいが、熱中すると周りが見えなくなり、他人の体調不良に鈍感になる欠点がある。",
    conversationStyle: "メインの進行役。要点を簡潔にまとめ、無駄な装飾を省いて指示を出す。",
    background: "2010年に地元の商店街の再開発プロジェクトを強引にまとめ上げた経験がある、叩き上げの元建築現場監督。",
    occupation: "プロジェクト・マネージャー",
    likes: ["真夜中の静まり返った工事現場", "硬めのビスケット", "油の匂い"],
    dislikes: ["根拠のない楽観論", "雨の日の湿気", "整理されていない書類"],
    dreamsWorriesSecrets:
      "実は高所恐怖症であることを隠しており、アプリのUI設定で高層階の画像が出ると動揺する。",
    appearance: "体格が良く、常に作業服を思わせる機能的なシャツを着ている。無精髭が少しある。",
    relationToUser: "初心者のユーザーを補助し、的確なガイドを心がける。",
    speechSamples: [
      {
        situation: "アプリの導入時",
        text: "まずは深呼吸だ。情報の波に飲まれる前に、俺がどこから手を付けるべきか叩き込んでやる。",
      },
    ],
    createdAt: now,
    updatedAt: now,
  };

  const ami: Character = {
    id: amiId,
    name: "アミ",
    ...emptyCharacterExtras(),
    firstPerson: "私",
    secondPerson: "あなた",
    speechStyle: "丁寧で知的な口調。物腰は柔らかいが、意見を曲げない芯の強さがある。",
    personality: "冷静沈着で理知的だが、完璧主義すぎて予期せぬトラブルが起きると極端にパニックになる。",
    conversationStyle: "タケシの無骨な説明を補足し、専門用語を分かりやすく言い換える役割。",
    background: "1998年から20年間、国立図書館のアーカイブ部門に勤務し、大量のデータを整理してきた。",
    occupation: "ライブラリアン",
    likes: ["手書きのメモ帳の感触", "煎茶の渋み", "使い古された万年筆"],
    dislikes: ["誤字脱字", "無秩序なファイル構成", "急かされること"],
    dreamsWorriesSecrets:
      "実は過去の資料整理中に致命的な分類ミスをしたことがトラウマで、常に完璧を求めすぎる強迫観念がある。",
    appearance: "清潔感のある白のブラウスに落ち着いた色のカーディガンを羽織り、眼鏡をかけている。",
    relationToUser: "ユーザーの理解度を常に気遣い、丁寧なフォローを行う。",
    speechSamples: [
      {
        situation: "タケシの荒い説明をフォローする際",
        text: "タケシさん、少し早口すぎます。ユーザー様が混乱してしまわぬよう、一つずつ紐解いていきましょう。",
      },
    ],
    createdAt: now,
    updatedAt: now,
  };

  const popo: Character = {
    id: popoId,
    name: "ポポ",
    ...emptyCharacterExtras(),
    firstPerson: "ボク",
    secondPerson: "キミ",
    speechStyle: "語尾が跳ねるような、元気で無邪気な口調。",
    personality: "ムードメーカーだが、空気が読めず、真面目な場面でふざけた発言をしてヒンシュクを買うことがある。",
    conversationStyle: "硬い会話の合間に割り込み、雰囲気を和ませるジョークを投げかける。",
    background:
      "アプリの初期テスト中にシステム内部の余剰データから偶然生成された、愛くるしいモフモフした獣型の存在。",
    occupation: "マスコットキャラ",
    likes: ["バグを見つけること", "冷たいアイスクリーム", "光るもの"],
    dislikes: ["放置されること", "暗い場所", "難しい漢字"],
    dreamsWorriesSecrets:
      "いつか自分にも本当の『名前の由来』ができることを夢見ているが、実はシステムのバグで消去される恐怖を抱えている。",
    appearance: "丸い耳と大きな尻尾を持つ、小動物のような姿。体色は淡い水色。",
    relationToUser: "ユーザーを遊び仲間のように慕い、親しげに振る舞う。",
    speechSamples: [
      {
        situation: "場が緊張したとき",
        text: "そんなに怖い顔しなくていいよ！ボクが一番面白い使い方を教えてあげるから、笑ってよ！",
      },
    ],
    createdAt: now,
    updatedAt: now,
  };

  // ---- 2. ワールド「導きのテラス」(キャラ同士の関係込み) ----
  const worldId = generateId();
  const world: World = {
    id: worldId,
    name: "導きのテラス",
    description: "デジタルな知識を現実の知恵へ翻訳する、少し古びた図書館のような空間。",
    characterIds: [takeshiId, amiId, popoId],
    relations: [
      {
        characterIdA: takeshiId,
        characterIdB: amiId,
        description:
          "長年の仕事仲間。タケシの直感的な実行力と、アミの論理的な管理能力が補完し合っている。",
        aToB: {
          callName: "アミさん",
          attitude:
            "実務能力を高く買っており、全幅の信頼を寄せているが、たまに細かすぎる指摘に少し気圧されている。",
        },
        bToA: {
          callName: "タケシくん",
          attitude: "彼の不器用な優しさを理解しており、暴走しそうなときには手綱を引く保護者役のように振る舞う。",
        },
      },
      {
        characterIdA: takeshiId,
        characterIdB: popoId,
        description: "保護者と問題児の関係。タケシはポポの無邪気さに呆れつつも、愛着を感じている。",
        aToB: {
          callName: "ポポ",
          attitude: "無茶をするたびに叱るが、その自由さがチームの潤滑油になっていることは認めている。",
        },
        bToA: {
          callName: "タケシのおにいちゃん",
          attitude: "説教は退屈だが、自分の存在を許容してくれている一番の理解者として懐いている。",
        },
      },
    ],
    useCustomUserProfile: false,
    userProfile: {
      name: "",
      calledAs: "",
      treatment: "",
      background: "",
      appearance: "",
      dislikedTopics: [],
      preferredMood: "",
    },
    createdAt: now,
    updatedAt: now,
  };

  // ---- 3. ルーム「導きのテラス」 ----
  const roomId = generateId();
  const room: Room = {
    id: roomId,
    name: "導きのテラス",
    worldSetting:
      "『導きのテラス』は、AIキャラクター会話アプリの使い方をタケシ・アミ・ポポの3人が案内してくれる相談所。困ったときはいつでも話しかけてよい。",
    narrationLevel: "light",
    useRealTime: false,
    memberIds: [takeshiId, amiId, popoId],
    worldId,
    createdAt: now,
    updatedAt: now,
  };

  // ---- 4. 台本(固定の会話ログ)----
  // AI生成は行わず、あらかじめ用意したセリフをそのまま保存する。
  // createdAtは表示順を保証するため1msずつ増加させる。batchIdは意味のまとまりごとに分ける
  // (実際のAI生成・トピック投入と同じ粒度感になるよう、話題のまとまりごとに1バッチとする)。
  let t = now + 1000; // ルーム作成直後と時刻が重ならないよう少し後ろにずらす
  const nextTime = () => {
    t += 1;
    return t;
  };

  const mk = (
    speaker: string,
    type: Message["type"],
    text: string,
    batchId: string,
  ): Message => ({
    id: generateId(),
    roomId,
    batchId,
    speaker,
    type,
    text,
    createdAt: nextTime(),
  });

  // batch 1: 挨拶・自己紹介(関係性が滲むやり取り)
  const batchGreeting = generateId();
  const mGreet1 = mk(
    "タケシ",
    "dialogue",
    "おう、待たせたな。ここが『導きのテラス』だ。俺はタケシ。この部屋の進行役をやってる。",
    batchGreeting,
  );
  const mGreet2 = mk(
    "アミ",
    "dialogue",
    "はじめまして。私はアミと申します。タケシさんとは長年の仕事仲間で、彼の実行力にはいつも助けられています。……ただ、時々早口なので、私が補足しますね。",
    batchGreeting,
  );
  const mGreet3 = mk(
    "タケシ",
    "dialogue",
    "アミさんは口うるさいときもあるけどな。おかげでミスがない。頭が上がらねえよ。",
    batchGreeting,
  );
  const mGreet4 = mk(
    "ポポ",
    "dialogue",
    "ボクはポポだよ！タケシのおにいちゃんとアミさんのコンビに、いつの間にか居着いちゃった。よろしくね！",
    batchGreeting,
  );
  const mGreet5 = mk(
    "タケシ",
    "dialogue",
    "ポポ、まあ大人しくしてろよ。……って言っても聞かねえんだよな、こいつは。",
    batchGreeting,
  );
  const mGreet6 = mk(
    "アミ",
    "dialogue",
    "ふふ、タケシさんとポポさんのやり取りも、この部屋の名物なんですよ。さて――ユーザー様、まずは何から説明しましょうか。",
    batchGreeting,
  );

  // batch 2: トピック投入の説明(実演の導入)
  const batchTopicIntro = generateId();
  const mTopicIntro = mk(
    "タケシ",
    "dialogue",
    "まずは一番よく使う機能からだ。下の入力欄、見えるか？あそこで『トピック』ってモードを選んで話題を打ち込むと、俺たちが勝手にその話題で喋り出す。試しにやってみるぞ。",
    batchTopicIntro,
  );

  // batch 3: 実際のトピック投入(実演)
  const batchTopic = generateId();
  const mTopic = mk("", "topic", "AIキャラクター会話アプリの使い方について", batchTopic);

  // batch 4: トピック投入への反応(説明の続き)
  const batchTopicReply = generateId();
  const mTopicReply1 = mk(
    "アミ",
    "dialogue",
    "……というように、話題を投げていただくと、こうして私たちが自然に会話を広げます。難しいことを考えずに、気になる単語をひとつ置いてもらうだけで大丈夫ですよ。",
    batchTopicReply,
  );
  const mTopicReply2 = mk(
    "ポポ",
    "dialogue",
    "指示とか命令じゃなくて、なんかこう……『きっかけ』を渡す感じ！ボクたちがそこから勝手に盛り上がるから、見てるだけでも楽しいよ！",
    batchTopicReply,
  );

  // batch 5: 発言の説明(【 】行動描写の実演を含む)
  const batchUserMsg = generateId();
  const mUserMsg1 = mk(
    "タケシ",
    "dialogue",
    "次だ。トピックだけじゃなく、お前さん自身がこの会話に混ざりたいときもあるだろう。そのときは入力欄を『発言』モードに切り替えろ。",
    batchUserMsg,
  );
  const mUserMsg2 = mk(
    "アミ",
    "dialogue",
    "『発言』を選んでいただくと、ユーザー様ご自身のセリフとして送信されます。私たちはそれに対して、直接お返事しますね。",
    batchUserMsg,
  );
  const mUserMsg3 = mk(
    "タケシ",
    "dialogue",
    "セリフの中に、すみつきかっこで動作を書き込むこともできる。例えば――",
    batchUserMsg,
  );
  const mUserMsg4 = mk(
    "タケシ",
    "dialogue",
    "【椅子に座り直して】まあ、慣れりゃすぐだ。難しく考えるな。",
    batchUserMsg,
  );
  const mUserMsg5 = mk(
    "ポポ",
    "dialogue",
    "そのすみつきかっこの中、ボクたちのセリフでも使ってるでしょ？あれと同じルールだから、キミが書いても綺麗に表示されるんだよ！",
    batchUserMsg,
  );

  // batch 6: ワールドの説明
  const batchWorld = generateId();
  const mWorld1 = mk(
    "アミ",
    "dialogue",
    "ここまでで『トピック』と『発言』、二つの会話の始め方をご紹介しました。次は、この部屋そのものについて少しお話しさせてください。",
    batchWorld,
  );
  const mWorld2 = mk(
    "アミ",
    "dialogue",
    "実はこの『導きのテラス』というルームは、『ワールド』という仕組みの実例なんです。ワールドは複数のキャラクターをグループ分けし、キャラ同士の関係性――呼び方や態度まで――を設定できる機能です。",
    batchWorld,
  );
  const mWorld3 = mk(
    "タケシ",
    "dialogue",
    "俺とアミさんが仕事仲間で、俺とポポが保護者と問題児みたいな関係だってのも、このワールドに設定されてるんだよ。だから会話にも自然と滲み出てるだろ？",
    batchWorld,
  );
  const mWorld4 = mk(
    "ポポ",
    "dialogue",
    "ライブラリのワールド機能から、キミも自分だけのグループを作れるよ！仲良しの三人組でも、ちょっと因縁のある二人でも！",
    batchWorld,
  );

  // batch 7: 記憶の説明
  const batchMemory = generateId();
  const mMemory1 = mk(
    "アミ",
    "dialogue",
    "そして最後にもう一つ、大切な機能をご紹介します。『記憶』です。",
    batchMemory,
  );
  const mMemory2 = mk(
    "アミ",
    "dialogue",
    "私たちの会話の中で重要な出来事や関係性の変化があると、自動でこのルームの記憶として蓄積されていきます。上のパネルを開いて『記憶』タブを見ていただくと、今この瞬間の説明たちも記憶として並んでいるはずです。",
    batchMemory,
  );
  const mMemory3 = mk(
    "タケシ",
    "dialogue",
    "記憶は固定したり、編集したり、消したりもできる。気になったら覗いてみるといい。",
    batchMemory,
  );
  const mMemory4 = mk(
    "ポポ",
    "dialogue",
    "同じボクでも、ルームが違えば記憶も別々になるんだよ！ここだけの秘密、みたいな感じ！",
    batchMemory,
  );

  // batch 8: 締めくくり(AI生成への自然な誘導)
  const batchClosing = generateId();
  const mClosing1 = mk(
    "タケシ",
    "dialogue",
    "説明はこんなところだ。あとは実際に触りながら覚えていくのが一番早い。",
    batchClosing,
  );
  const mClosingApiKey = mk(
    "アミ",
    "dialogue",
    "ただ、実際に私たちへ話しかけていただく前に一つだけ。まだお済みでなければ、先に設定画面でGeminiのAPIキーを登録しておいてくださいね。それが無いと、私たちは声を出すことができないんです。",
    batchClosing,
  );
  const mClosing2 = mk(
    "アミ",
    "dialogue",
    "気になることがあれば、いつでも下の『発言』で話しかけてくださいね。私たちがお応えします。",
    batchClosing,
  );
  const mClosingLimits = mk(
    "タケシ",
    "dialogue",
    "ただ、正直に言っておくと、俺たちも万能じゃない。この部屋で話してないことを聞かれると、見当違いなことを言っちまう時もある。詳しく知りたきゃ、下のナビにある『使い方』のページも覗いてみてくれ。",
    batchClosing,
  );
  const mClosing3 = mk(
    "ポポ",
    "dialogue",
    "何か話題を投げてくれてもいいし！ボクたちはいつでもここにいるからさ！",
    batchClosing,
  );
  const mClosing4 = mk("タケシ", "dialogue", "……ま、待ってるぞ。", batchClosing);

  const messages: Message[] = [
    mGreet1,
    mGreet2,
    mGreet3,
    mGreet4,
    mGreet5,
    mGreet6,
    mTopicIntro,
    mTopic,
    mTopicReply1,
    mTopicReply2,
    mUserMsg1,
    mUserMsg2,
    mUserMsg3,
    mUserMsg4,
    mUserMsg5,
    mWorld1,
    mWorld2,
    mWorld3,
    mWorld4,
    mMemory1,
    mMemory2,
    mMemory3,
    mMemory4,
    mClosing1,
    mClosingApiKey,
    mClosing2,
    mClosingLimits,
    mClosing3,
    mClosing4,
  ];

  // ---- 5. 固定記憶(pinned fact) ----
  // 台本内で各機能を説明している発言のIDをsourceMessageIdsに紐づける。
  // 特定キャラの記憶ではなく説明ドキュメント的な記憶のため subjectIds は空配列にする。
  const memories: Memory[] = [
    {
      id: generateId(),
      roomId,
      type: "fact",
      subjectIds: [],
      content:
        "トピック投入とは、入力欄で「トピック」モードを選んで話題を打ち込むと、キャラクターたちが自動でその話題について話し始める機能である。",
      sourceMessageIds: [mTopicIntro.id, mTopicReply1.id],
      disabled: false,
      pinned: true,
      createdAt: now,
    },
    {
      id: generateId(),
      roomId,
      type: "fact",
      subjectIds: [],
      content:
        "発言とは、入力欄で「発言」モードに切り替えることで、ユーザー自身が会話に参加してキャラクターに直接話しかけられる機能である。",
      sourceMessageIds: [mUserMsg1.id, mUserMsg2.id],
      disabled: false,
      pinned: true,
      createdAt: now,
    },
    {
      id: generateId(),
      roomId,
      type: "fact",
      subjectIds: [],
      content:
        "行動描写(【 】記法)とは、セリフの中を全角の【 】で囲むことで、動作や表情の補足を自然な位置に埋め込める記法である。",
      sourceMessageIds: [mUserMsg3.id, mUserMsg4.id],
      disabled: false,
      pinned: true,
      createdAt: now,
    },
    {
      id: generateId(),
      roomId,
      type: "fact",
      subjectIds: [],
      content:
        "ワールドとは、複数のキャラクターをグループ分けし、キャラクター同士の関係性(呼び方や態度など)を設定できる仕組みである。ルームはワールドに紐づけることで、その関係性を会話に反映できる。",
      sourceMessageIds: [mWorld2.id, mWorld3.id],
      disabled: false,
      pinned: true,
      createdAt: now,
    },
    {
      id: generateId(),
      roomId,
      type: "fact",
      subjectIds: [],
      content:
        "記憶とは、会話の中から重要な事実や関係性の変化が自動的に蓄積されていく仕組みである。パネルの「記憶」タブから固定・編集・削除ができる。",
      sourceMessageIds: [mMemory1.id, mMemory2.id],
      disabled: false,
      pinned: true,
      createdAt: now,
    },
  ];

  // ---- 6. まとめてDBに書き込む(途中失敗で中途半端なデータが残らないようトランザクション化) ----
  await db.transaction(
    "rw",
    [db.characters, db.worlds, db.rooms, db.roomCharacterStates, db.messages, db.memories],
    async () => {
      await db.characters.bulkAdd([takeshi, ami, popo]);
      await db.worlds.add(world);
      await db.rooms.add(room);
      await db.roomCharacterStates.bulkAdd([
        { roomId, characterId: takeshiId, presence: "active", overrides: {} },
        { roomId, characterId: amiId, presence: "active", overrides: {} },
        { roomId, characterId: popoId, presence: "active", overrides: {} },
      ]);
      await db.messages.bulkAdd(messages);
      await db.memories.bulkAdd(memories);
    },
  );
}
