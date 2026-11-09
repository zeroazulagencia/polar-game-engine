import type { CSSProperties } from "react"

/**
 * Soft shadows cast on the ground from the character's feet, as if lit by several lights:
 * four elongated gradients stretching right, left, towards the back and towards the camera.
 * The right one is slightly visible; the other three are very faint.
 *
 * The container is centered on the feet and measures 4 × 1 "units", where a unit is about the
 * width of the figure; every shadow is positioned in % of that box, so callers only size it.
 */
const SHADOWS: CSSProperties[] = [
  // right: the main one
  {
    left: "50%",
    top: "50%",
    width: "42%",
    height: "24%",
    transform: "translateY(-50%)",
    background: "radial-gradient(ellipse at 0% 50%, rgba(0,0,0,0.38) 0%, rgba(0,0,0,0.16) 40%, rgba(0,0,0,0) 72%)",
  },
  // left
  {
    right: "50%",
    top: "50%",
    width: "28%",
    height: "18%",
    transform: "translateY(-50%)",
    background: "radial-gradient(ellipse at 100% 50%, rgba(0,0,0,0.15) 0%, rgba(0,0,0,0.06) 40%, rgba(0,0,0,0) 72%)",
  },
  // towards the camera (in front of the feet)
  {
    left: "50%",
    top: "50%",
    width: "13%",
    height: "40%",
    transform: "translateX(-50%)",
    background: "radial-gradient(ellipse at 50% 0%, rgba(0,0,0,0.13) 0%, rgba(0,0,0,0.05) 45%, rgba(0,0,0,0) 72%)",
  },
  // towards the back (behind the feet)
  {
    left: "50%",
    bottom: "50%",
    width: "11%",
    height: "28%",
    transform: "translateX(-50%)",
    background: "radial-gradient(ellipse at 50% 100%, rgba(0,0,0,0.13) 0%, rgba(0,0,0,0.05) 45%, rgba(0,0,0,0) 72%)",
  },
]

export function CharacterShadow({ style, className }: { style?: CSSProperties; className?: string }) {
  return (
    <div className={className} style={{ position: "absolute", pointerEvents: "none", ...style }}>
      {SHADOWS.map((s, i) => (
        <div key={i} style={{ position: "absolute", borderRadius: "50%", ...s }} />
      ))}
    </div>
  )
}
