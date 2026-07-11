// キャラクターのアイコン表示(画像未設定なら頭文字を表示)
import type { Character } from "../types";
import { useBlobUrl } from "../lib/useBlobUrl";

interface CharacterAvatarProps {
  character: Character | undefined;
  size?: number;
  className?: string;
}

export function CharacterAvatar({
  character,
  size = 40,
  className = "",
}: CharacterAvatarProps) {
  const url = useBlobUrl(character?.iconImage);
  const initial = character?.name ? character.name.charAt(0) : "?";

  return (
    <div
      className={`flex shrink-0 items-center justify-center overflow-hidden rounded-full bg-zinc-700 text-zinc-200 ${className}`}
      style={{ width: size, height: size, fontSize: size * 0.4 }}
      title={character?.name}
    >
      {url ? (
        <img src={url} alt={character?.name ?? ""} className="h-full w-full object-cover" />
      ) : (
        <span>{initial}</span>
      )}
    </div>
  );
}
