"use client"

import { useState, useRef, useCallback, useEffect } from "react"
import type { Point } from "@/lib/game-types"
import { polygonToSvgPath } from "@/lib/geometry"
import { cn } from "@/lib/utils"

export type EditorMode = "select" | "draw" | "edit"

interface PolygonEditorProps {
  /** Current polygon points (normalized 0-1). */
  points: Point[]
  /** Called when points change; `live` is true for every step of a drag. */
  onChange: (points: Point[], live?: boolean) => void
  /** @deprecated drags now commit once on release (one undo step); kept for compatibility. */
  onDragStart?: () => void
  /** Allow dragging the whole polygon in select mode. */
  draggable?: boolean
  /** Stage dimensions for coordinate conversion. */
  stageWidth: number
  stageHeight: number
  /** Current editor mode. */
  mode: EditorMode
  /** Fill color of the polygon. */
  fillColor?: string
  /** Stroke color of the polygon. */
  strokeColor?: string
  /** Whether this polygon is selected. */
  selected?: boolean
  /** Called when polygon is clicked. */
  onSelect?: () => void
  /** Label to show in center. */
  label?: string
  /** Whether to show vertices. */
  showVertices?: boolean
  /** Optional z-index for stacking overlay instances. */
  zIndex?: number
  /** Stroke width of the polygon border. */
  strokeWidth?: number
  /** faded (30%) and click-through, e.g. while another tool is active */
  dimmed?: boolean
}

export function PolygonEditor({
  points: committedPoints,
  onChange,
  onDragStart,
  stageWidth,
  stageHeight,
  mode,
  fillColor = "rgba(255, 200, 0, 0.3)",
  strokeColor = "rgba(255, 200, 0, 0.9)",
  selected = false,
  onSelect,
  label,
  showVertices = true,
  draggable = false,
  zIndex,
  strokeWidth,
  dimmed = false,
}: PolygonEditorProps) {
  const strokeWidthFinal = strokeWidth ?? (selected ? 3 : 2)
  const svgRef = useRef<SVGSVGElement>(null)
  const [dragIndex, setDragIndex] = useState<number | null>(null)
  const [hoverIndex, setHoverIndex] = useState<number | null>(null)
  const [dragWhole, setDragWhole] = useState<{ start: Point; origin: Point[] } | null>(null)
  // While dragging, the polygon moves in a local draft (only this SVG re-renders);
  // the project is updated once on release, as a single undo step.
  const [draft, setDraft] = useState<Point[] | null>(null)
  const draftRef = useRef<Point[] | null>(null)
  draftRef.current = draft
  const points = draft ?? committedPoints
  const pointsRef = useRef(points)
  pointsRef.current = points
  const onChangeRef = useRef(onChange)
  onChangeRef.current = onChange

  // Convert normalized point to SVG coordinates
  const toSvg = useCallback(
    (p: Point) => ({ x: p.x * stageWidth, y: p.y * stageHeight }),
    [stageWidth, stageHeight]
  )

  // Convert SVG coordinates to normalized point
  const toNorm = useCallback(
    (x: number, y: number): Point => ({
      x: Math.max(0, Math.min(1, x / stageWidth)),
      y: Math.max(0, Math.min(1, y / stageHeight)),
    }),
    [stageWidth, stageHeight]
  )

  // Get mouse position relative to SVG
  const getMousePos = useCallback(
    (e: React.MouseEvent | MouseEvent): Point | null => {
      if (!svgRef.current) return null
      // Normalize by the size actually on screen (the stage size prop can lag behind a resize).
      const rect = svgRef.current.getBoundingClientRect()
      return {
        x: Math.max(0, Math.min(1, (e.clientX - rect.left) / Math.max(1, rect.width))),
        y: Math.max(0, Math.min(1, (e.clientY - rect.top) / Math.max(1, rect.height))),
      }
    },
    []
  )

  // Handle vertex drag
  const handleVertexMouseDown = (index: number, e: React.MouseEvent) => {
    if (mode !== "edit") return
    e.stopPropagation()
    setDragIndex(index)
  }

  // Handle adding new point (click on edge in draw mode)
  const handleEdgeClick = (index: number, e: React.MouseEvent) => {
    if (mode !== "draw" && mode !== "edit") return
    e.stopPropagation()

    const pos = getMousePos(e)
    if (!pos) return

    const newPoints = [...points]
    newPoints.splice(index + 1, 0, pos)
    onChange(newPoints)
  }

  // Handle removing a point (right-click vertex in edit mode)
  const handleVertexContextMenu = (index: number, e: React.MouseEvent) => {
    e.preventDefault()
    if (mode !== "edit" || points.length <= 3) return

    const newPoints = points.filter((_, i) => i !== index)
    onChange(newPoints)
  }

  // Handle polygon click for selection
  const handlePolygonClick = (e: React.MouseEvent) => {
    if (mode === "select" && onSelect) {
      e.stopPropagation()
      onSelect()
    }
  }

  const handlePolygonMouseDown = (e: React.MouseEvent) => {
    if (!draggable || mode !== "select") return
    const pos = getMousePos(e)
    if (!pos) return
    e.stopPropagation()
    setDragWhole({ start: pos, origin: points.map((p) => ({ ...p })) })
  }

  // Handle global mouse move/up for dragging
  useEffect(() => {
    if (dragIndex === null && !dragWhole) return

    const handleMouseMove = (e: MouseEvent) => {
      const pos = getMousePos(e)
      if (!pos) return

      if (dragIndex !== null) {
        const newPoints = [...pointsRef.current]
        newPoints[dragIndex] = pos
        setDraft(newPoints)
        return
      }

      if (dragWhole) {
        const dx = pos.x - dragWhole.start.x
        const dy = pos.y - dragWhole.start.y
        const moved = dragWhole.origin.map((p) => ({ x: p.x + dx, y: p.y + dy }))
        const minX = Math.min(...moved.map((p) => p.x))
        const minY = Math.min(...moved.map((p) => p.y))
        const maxX = Math.max(...moved.map((p) => p.x))
        const maxY = Math.max(...moved.map((p) => p.y))
        const shiftX = minX < 0 ? -minX : maxX > 1 ? 1 - maxX : 0
        const shiftY = minY < 0 ? -minY : maxY > 1 ? 1 - maxY : 0
        setDraft(moved.map((p) => ({ x: p.x + shiftX, y: p.y + shiftY })))
      }
    }

    const handleMouseUp = () => {
      if (draftRef.current) onChangeRef.current(draftRef.current)
      setDraft(null)
      setDragIndex(null)
      setDragWhole(null)
    }

    window.addEventListener("mousemove", handleMouseMove)
    window.addEventListener("mouseup", handleMouseUp)

    return () => {
      window.removeEventListener("mousemove", handleMouseMove)
      window.removeEventListener("mouseup", handleMouseUp)
    }
  }, [dragIndex, dragWhole, getMousePos])

  if (points.length < 2) return null

  const pathData = polygonToSvgPath(points, stageWidth, stageHeight)
  const center = points.reduce(
    (acc, p) => ({ x: acc.x + p.x / points.length, y: acc.y + p.y / points.length }),
    { x: 0, y: 0 }
  )
  const centerSvg = toSvg(center)

  return (
    <svg
      ref={svgRef}
      className={dimmed ? "absolute inset-0 pointer-events-none [&_*]:pointer-events-none!" : "absolute inset-0 pointer-events-none"}
      style={{ width: "100%", height: "100%", zIndex, opacity: dimmed ? 0.3 : undefined }}
      viewBox={`0 0 ${stageWidth} ${stageHeight}`}
      preserveAspectRatio="xMidYMid meet"
    >
      {/* Polygon fill */}
      <path
        d={pathData}
        fill={fillColor}
        stroke={strokeColor}
        strokeWidth={strokeWidthFinal}
        strokeDasharray={mode === "draw" ? "5,5" : undefined}
        className={cn(
          "pointer-events-auto",
          mode === "select" && (draggable ? "cursor-move hover:brightness-125" : "cursor-pointer hover:brightness-125")
        )}
        onMouseDown={handlePolygonMouseDown}
        onClick={handlePolygonClick}
      />

      {/* Edge click areas (for adding points) */}
      {(mode === "draw" || mode === "edit") &&
        points.map((p, i) => {
          const next = points[(i + 1) % points.length]
          const a = toSvg(p)
          const b = toSvg(next)
          return (
            <line
              key={`edge-${i}`}
              x1={a.x}
              y1={a.y}
              x2={b.x}
              y2={b.y}
              stroke="transparent"
              strokeWidth={16}
              className="pointer-events-auto cursor-crosshair"
              onClick={(e) => handleEdgeClick(i, e)}
            />
          )
        })}

      {/* Vertices */}
      {showVertices &&
        (mode === "edit" || mode === "draw") &&
        points.map((p, i) => {
          const svgP = toSvg(p)
          const isDragging = dragIndex === i
          const isHovered = hoverIndex === i

          return (
            <g key={`vertex-${i}`}>
              {/* Larger hit area */}
              <circle
                cx={svgP.x}
                cy={svgP.y}
                r={16}
                fill="transparent"
                className="pointer-events-auto cursor-move"
                onMouseDown={(e) => handleVertexMouseDown(i, e)}
                onMouseEnter={() => setHoverIndex(i)}
                onMouseLeave={() => setHoverIndex(null)}
                onContextMenu={(e) => handleVertexContextMenu(i, e)}
              />
              {/* Visible vertex */}
              <circle
                cx={svgP.x}
                cy={svgP.y}
                r={isDragging || isHovered ? 8 : 6}
                fill={isDragging ? "#fff" : isHovered ? "#ffd700" : strokeColor}
                stroke="#000"
                strokeWidth={2}
                className="pointer-events-none transition-[r,fill] duration-100"
              />
              {/* Index label */}
              <text
                x={svgP.x}
                y={svgP.y - 12}
                textAnchor="middle"
                fill="#fff"
                fontSize={10}
                className="pointer-events-none select-none"
                style={{ textShadow: "0 1px 2px rgba(0,0,0,0.8)" }}
              >
                {i + 1}
              </text>
            </g>
          )
        })}

      {/* Label in center */}
      {label && (
        <text
          x={centerSvg.x}
          y={centerSvg.y}
          textAnchor="middle"
          dominantBaseline="middle"
          fill="#fff"
          fontSize={12}
          fontWeight="bold"
          className="pointer-events-none select-none"
          style={{ textShadow: "0 1px 3px rgba(0,0,0,0.9)" }}
        >
          {label}
        </text>
      )}
    </svg>
  )
}

interface PolygonDrawerProps {
  /** Called when polygon drawing is complete (at least 3 points + close). */
  onComplete: (points: Point[]) => void
  /** Called when drawing is cancelled. */
  onCancel: () => void
  /** Stage dimensions for coordinate conversion. */
  stageWidth: number
  stageHeight: number
  /** Fill color while drawing. */
  fillColor?: string
  /** Stroke color while drawing. */
  strokeColor?: string
}

/**
 * Component for drawing a new polygon from scratch.
 * Click to add points, click first point or press Enter to close.
 */
export function PolygonDrawer({
  onComplete,
  onCancel,
  stageWidth,
  stageHeight,
  fillColor = "rgba(255, 200, 0, 0.2)",
  strokeColor = "rgba(255, 200, 0, 0.9)",
}: PolygonDrawerProps) {
  const svgRef = useRef<SVGSVGElement>(null)
  const [points, setPoints] = useState<Point[]>([])
  const [mousePos, setMousePos] = useState<Point | null>(null)

  // Convert normalized point to SVG coordinates
  const toSvg = useCallback(
    (p: Point) => ({ x: p.x * stageWidth, y: p.y * stageHeight }),
    [stageWidth, stageHeight]
  )

  // Convert SVG coordinates to normalized point
  const toNorm = useCallback(
    (x: number, y: number): Point => ({
      x: Math.max(0, Math.min(1, x / stageWidth)),
      y: Math.max(0, Math.min(1, y / stageHeight)),
    }),
    [stageWidth, stageHeight]
  )

  // Get mouse position relative to SVG
  const getMousePos = useCallback(
    (e: React.MouseEvent | MouseEvent): Point | null => {
      if (!svgRef.current) return null
      // Normalize by the size actually on screen (the stage size prop can lag behind a resize).
      const rect = svgRef.current.getBoundingClientRect()
      return {
        x: Math.max(0, Math.min(1, (e.clientX - rect.left) / Math.max(1, rect.width))),
        y: Math.max(0, Math.min(1, (e.clientY - rect.top) / Math.max(1, rect.height))),
      }
    },
    []
  )

  // Check if mouse is near first point (to close polygon)
  const isNearFirstPoint = useCallback(() => {
    if (points.length < 3 || !mousePos) return false
    const first = points[0]
    const dist = Math.sqrt(
      Math.pow((mousePos.x - first.x) * stageWidth, 2) +
        Math.pow((mousePos.y - first.y) * stageHeight, 2)
    )
    return dist < 20
  }, [points, mousePos, stageWidth, stageHeight])

  // Handle click to add point
  const handleClick = (e: React.MouseEvent) => {
    const pos = getMousePos(e)
    if (!pos) return

    // Check if clicking near first point to close
    if (isNearFirstPoint()) {
      onComplete(points)
      return
    }

    setPoints([...points, pos])
  }

  // Handle mouse move for preview
  const handleMouseMove = (e: React.MouseEvent) => {
    setMousePos(getMousePos(e))
  }

  // Handle keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onCancel()
      } else if (e.key === "Enter" && points.length >= 3) {
        onComplete(points)
      } else if (e.key === "Backspace" && points.length > 0) {
        setPoints(points.slice(0, -1))
      }
    }

    window.addEventListener("keydown", handleKeyDown)
    return () => window.removeEventListener("keydown", handleKeyDown)
  }, [points, onComplete, onCancel])

  // Build preview path
  const allPoints = mousePos ? [...points, mousePos] : points
  const pathData =
    allPoints.length >= 2
      ? allPoints.map((p, i) => {
          const svgP = toSvg(p)
          return `${i === 0 ? "M" : "L"} ${svgP.x} ${svgP.y}`
        }).join(" ") + (points.length >= 3 ? " Z" : "")
      : ""

  return (
    <svg
      ref={svgRef}
      className="absolute inset-0 cursor-crosshair"
      style={{ width: "100%", height: "100%" }}
      viewBox={`0 0 ${stageWidth} ${stageHeight}`}
      preserveAspectRatio="xMidYMid meet"
      onClick={handleClick}
      onMouseMove={handleMouseMove}
    >
      {/* Preview polygon */}
      {pathData && (
        <path
          d={pathData}
          fill={points.length >= 3 ? fillColor : "none"}
          stroke={strokeColor}
          strokeWidth={2}
          strokeDasharray="5,5"
          className="pointer-events-none"
        />
      )}

      {/* Placed vertices */}
      {points.map((p, i) => {
        const svgP = toSvg(p)
        const isFirst = i === 0 && points.length >= 3 && isNearFirstPoint()
        return (
          <circle
            key={i}
            cx={svgP.x}
            cy={svgP.y}
            r={isFirst ? 10 : 6}
            fill={isFirst ? "#00ff00" : strokeColor}
            stroke="#000"
            strokeWidth={2}
            className="pointer-events-none"
          />
        )
      })}

      {/* Instructions */}
      <text
        x={10}
        y={20}
        fill="#fff"
        fontSize={12}
        className="pointer-events-none select-none"
        style={{ textShadow: "0 1px 2px rgba(0,0,0,0.8)" }}
      >
        Click to add points • Click first point or Enter to close • Esc to cancel • Backspace to undo
      </text>
    </svg>
  )
}
