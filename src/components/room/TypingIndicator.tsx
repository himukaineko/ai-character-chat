// 生成中のタイピングインジケーター(仕様書10.3)
interface TypingIndicatorProps {
  label: string;
}

export function TypingIndicator({ label }: TypingIndicatorProps) {
  return (
    <div className="my-2 flex items-center gap-2 px-1 text-xs text-[var(--chat-muted-text)]">
      <span className="flex gap-0.5">
        <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-[var(--chat-muted-text)] [animation-delay:-0.3s]" />
        <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-[var(--chat-muted-text)] [animation-delay:-0.15s]" />
        <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-[var(--chat-muted-text)]" />
      </span>
      <span>{label}</span>
    </div>
  );
}
