import type { DepthLook } from "@/lib/depth-look"

/**
 * The character image with the depth lighting applied: brightness as a CSS filter and the
 * tint as a color layer masked to the sprite's own shape (so it never colors the scene).
 */
export function CharacterSprite({ src, look, className, alt = "character" }: { src: string; look: DepthLook; className?: string; alt?: string }) {
  const filter = look.brightness !== 1 ? `brightness(${look.brightness})` : undefined
  return (
    <div className="relative h-full w-max" style={{ isolation: "isolate" }}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={src} alt={alt} className={className ?? "block h-full w-auto max-w-none"} style={{ filter }} draggable={false} />
      {look.tint && look.tintStrength > 0 && (
        <div
          className="pointer-events-none absolute inset-0"
          style={{
            background: look.tint,
            opacity: look.tintStrength,
            mixBlendMode: "color",
            WebkitMaskImage: `url(${src})`,
            maskImage: `url(${src})`,
            WebkitMaskSize: "100% 100%",
            maskSize: "100% 100%",
          }}
        />
      )}
    </div>
  )
}
