import type { MedPhoto } from "@/lib/pirulica/types";
import { colorDot } from "./capsule";

function visible(src: string) {
  return src.startsWith("data:image/") || /^https?:\/\//i.test(src);
}

export function PhotoStrip({
  photos,
  color,
  size = "md",
}: {
  photos: MedPhoto[];
  color?: string;
  size?: "sm" | "md";
}) {
  const srcs = photos.map((p) => p.src).filter(visible);
  const box = size === "sm" ? "size-8 rounded-[8px]" : "size-11 rounded-[12px]";
  if (!srcs.length) {
    return (
      <span className={`mt-1.5 size-2.5 shrink-0 rounded-full ${colorDot[color ?? "pine"]}`} />
    );
  }
  return (
    <span className="flex max-w-[7.5rem] gap-1 overflow-x-auto">
      {srcs.map((src, i) => (
        <img
          key={`${i}-${src.slice(-16)}`}
          src={src}
          alt=""
          className={`${box} shrink-0 object-cover`}
        />
      ))}
    </span>
  );
}
