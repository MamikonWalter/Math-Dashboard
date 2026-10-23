
import React, { useRef, useEffect, useCallback, useImperativeHandle, forwardRef, useState } from 'react';
import { Lock, Unlock } from 'lucide-react';
import { ToolType, Point, Stroke, WhiteboardHandle, WhiteboardData, CodeBlockItem } from '../types';
import { PIXELS_PER_PERCENT } from '../constants';
import PythonCodeBlock from './PythonCodeBlock';

interface WhiteboardProps {
  tool: ToolType;
  color: string;
  strokeWidth: number;
  eraserWidth: number;
  shapeSize: number;
  showGrid: boolean;
  isDarkMode?: boolean;
  onHistoryChange: (canUndo: boolean, canRedo: boolean) => void;
  triggerUndo: number;
  triggerRedo: number;
  onDrawStart: () => void;
  onZoomChange?: (zoom: number) => void;
  onShapeSelect?: (size: number | null) => void;
  onStrokeAdded?: (stroke: Stroke) => void;
  onStrokesChanged?: (strokes: Stroke[]) => void;
  onCodeBlockCreated?: (block: CodeBlockItem) => void;
  onCodeBlockUpdated?: (block: CodeBlockItem) => void;
  onCodeBlockDeleted?: (blockId: string) => void;
  onSelectTool?: (tool: ToolType) => void;
}

let measureCtx: CanvasRenderingContext2D | null = null;

interface TextInputState {
    x: number;
    y: number; // World coords
    value: string;
    color: string;
    fontSize: number;
}

// Maximum undo/redo states to retain in memory (prevents unbounded memory growth)
const MAX_HISTORY_STEPS = 25;

// Fast iterative Ramer-Douglas-Peucker simplification for 2D points to save memory and CPU
const simplifyPoints = (points: Point[], tolerance: number = 0.6): Point[] => {
  const len = points.length;
  if (len <= 2) return points;
  const sqTolerance = tolerance * tolerance;
  const markers = new Uint8Array(len);
  markers[0] = 1;
  markers[len - 1] = 1;

  const stack: [number, number][] = [[0, len - 1]];

  while (stack.length > 0) {
    const [start, end] = stack.pop()!;
    let maxSqDist = 0;
    let maxIdx = start;
    const pStart = points[start];
    const pEnd = points[end];
    const dx = pEnd.x - pStart.x;
    const dy = pEnd.y - pStart.y;
    const lineSq = dx * dx + dy * dy;

    for (let i = start + 1; i < end; i++) {
      const p = points[i];
      let sqDist: number;
      if (lineSq === 0) {
        sqDist = (p.x - pStart.x) ** 2 + (p.y - pStart.y) ** 2;
      } else {
        const t = ((p.x - pStart.x) * dx + (p.y - pStart.y) * dy) / lineSq;
        const clampedT = Math.max(0, Math.min(1, t));
        const projX = pStart.x + clampedT * dx;
        const projY = pStart.y + clampedT * dy;
        sqDist = (p.x - projX) ** 2 + (p.y - projY) ** 2;
      }

      if (sqDist > maxSqDist) {
        maxSqDist = sqDist;
        maxIdx = i;
      }
    }

    if (maxSqDist > sqTolerance) {
      markers[maxIdx] = 1;
      if (maxIdx - start > 1) stack.push([start, maxIdx]);
      if (end - maxIdx > 1) stack.push([maxIdx, end]);
    }
  }

  const result: Point[] = [];
  for (let i = 0; i < len; i++) {
    if (markers[i]) result.push(points[i]);
  }
  return result;
};

const Whiteboard = forwardRef<WhiteboardHandle, WhiteboardProps>(({ 
  tool, 
  color, 
  strokeWidth, 
  eraserWidth,
  shapeSize,
  showGrid,
  isDarkMode = false,
  onHistoryChange,
  triggerUndo,
  triggerRedo,
  onDrawStart,
  onZoomChange,
  onShapeSelect,
  onStrokeAdded,
  onStrokesChanged,
  onCodeBlockCreated,
  onCodeBlockUpdated,
  onCodeBlockDeleted,
  onSelectTool,
}, ref) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const textInputRef = useRef<HTMLTextAreaElement>(null);
  
  // State Refs
  const strokesRef = useRef<Stroke[]>([]);
  const cameraRef = useRef<{x: number, y: number}>({ x: 0, y: 0 });
  const scaleRef = useRef<number>(1);
  const isPanningRef = useRef(false);
  const isDrawingRef = useRef(false);
  const currentStrokeRef = useRef<Stroke | null>(null);
  const lastMousePosRef = useRef<Point | null>(null);
  const hasErasedRef = useRef(false);
  const eraserTrailRef = useRef<Point[]>([]);
  const eraserTrailOpacityRef = useRef<number>(0);
  const eraserCurrentPosRef = useRef<Point | null>(null);
  const eraserFadeAnimRef = useRef<number | null>(null);
  
  // Selection & Dragging Refs
  const selectedIndicesRef = useRef<Set<number>>(new Set());
  const [selectedImageIndex, setSelectedImageIndex] = useState<number | null>(null);
  const isDraggingSelectionRef = useRef(false);
  
  // Marquee Selection Refs
  const isSelectingRef = useRef(false);
  const selectionStartRef = useRef<Point | null>(null);
  const selectionCurrentRef = useRef<Point | null>(null);

  // Text Tool State
  const [activeTextInput, setActiveTextInput] = useState<TextInputState | null>(null);
  const activeTextInputRef = useRef<TextInputState | null>(null);
  activeTextInputRef.current = activeTextInput;
  const textCreationTimeRef = useRef<number>(0);
  const [caretIndex, setCaretIndex] = useState<number>(0);

  // Code Blocks State
  const [codeBlocks, setCodeBlocks] = useState<CodeBlockItem[]>([]);
  const codeBlocksRef = useRef<CodeBlockItem[]>([]);
  codeBlocksRef.current = codeBlocks;
  const [activeCodeBlockId, setActiveCodeBlockId] = useState<string | null>(null);
  const activeCodeBlockIdRef = useRef<string | null>(null);
  activeCodeBlockIdRef.current = activeCodeBlockId;
  const [, setCamTick] = useState(0);

  // Code block drag / resize tracking
  const blockDragRef = useRef<{
    blockId: string;
    startMouseX: number;
    startMouseY: number;
    startBlockX: number;
    startBlockY: number;
  } | null>(null);

  const blockResizeRef = useRef<{
    blockId: string;
    startMouseX: number;
    startMouseY: number;
    startWidth: number;
    startHeight: number;
  } | null>(null);

  const isRotatingRef = useRef<{
    strokeIndex: number;
    startMouseAngle: number;
    startRotation: number;
    center: Point;
  } | null>(null);

  // Group Selection Rotation & Resize Refs
  const isRotatingGroupRef = useRef<{
    startMouseAngle: number;
    center: Point;
    initialStrokes: { index: number; stroke: Stroke }[];
  } | null>(null);

  const isResizingGroupRef = useRef<{
    handle: 'nw' | 'ne' | 'se' | 'sw';
    anchor: Point;
    startBox: { minX: number; minY: number; maxX: number; maxY: number; width: number; height: number; centerX: number; centerY: number };
    initialStrokes: { index: number; stroke: Stroke }[];
  } | null>(null);

  const isResizingShapeRef = useRef<{
    strokeIndex: number;
    handle: string;
    startCenter: Point;
    startWorldPos: Point;
    startWidth: number;
    startHeight: number;
    rotation: number;
    aspectRatio: number;
  } | null>(null);

  const hoveredBorderRef = useRef<{
    strokeIndex: number;
    handle: string;
    cursor: string;
  } | null>(null);

  // Clipboard Ref
  const clipboardRef = useRef<Stroke[]>([]);

  // Image Cache
  const imageCache = useRef<Record<string, HTMLImageElement>>({});

  // History Refs
  interface HistorySnapshot {
    strokes: Stroke[];
    codeBlocks: CodeBlockItem[];
  }
  const historyRef = useRef<HistorySnapshot[]>([{ strokes: [], codeBlocks: [] }]);
  const historyStepRef = useRef<number>(0);
  const prevUndoTrigger = useRef(0);
  const prevRedoTrigger = useRef(0);

  // --- Helpers ---
  const shapeTools = [
      'square', 'circle', 'triangle', 'diamond', 'star', 'speech', 'arrow',
      'cube', 'cylinder', 'sphere', 'pyramid', 'prism'
  ];

  const getStrokeBounds = (stroke: Stroke) => {
      if (stroke.tool === 'image' && stroke.imageUrl) {
          const img = imageCache.current[stroke.imageUrl];
          const ratio = img ? (img.naturalHeight / img.naturalWidth) : 1;
          const h = stroke.height || (stroke.width * ratio);
          return { w: stroke.width, h };
      }
      if (stroke.tool === 'text') {
          const fontSize = stroke.width || 20;
          const lines = (stroke.text || '').split('\n');
          if (stroke.textWidth) {
              return { w: stroke.textWidth, h: lines.length * fontSize * 1.2 };
          }
          let maxW = 0;
          if (typeof document !== 'undefined') {
              if (!measureCtx) {
                  const c = document.createElement('canvas');
                  measureCtx = c.getContext('2d');
              }
              if (measureCtx) {
                  measureCtx.font = `${fontSize}px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif`;
                  maxW = Math.max(...lines.map(l => measureCtx!.measureText(l).width), 10);
              }
          }
          if (!maxW) {
              const maxLineLength = Math.max(...lines.map(l => l.length), 1);
              maxW = maxLineLength * fontSize * 0.6;
          }
          return { w: maxW, h: lines.length * fontSize * 1.2 };
      }
      return { w: stroke.width, h: stroke.height || stroke.width };
  };

  const getBoundingBox = (stroke: Stroke) => {
      const { w, h } = getStrokeBounds(stroke);
      const rot = stroke.rotation || 0;
      if (shapeTools.includes(stroke.tool) || stroke.tool === 'image' || stroke.tool === 'text') {
          const center = (shapeTools.includes(stroke.tool) || stroke.tool === 'image')
              ? stroke.points[0]
              : { x: (stroke.points[0]?.x || 0) + w / 2, y: (stroke.points[0]?.y || 0) + h / 2 };
          if (!center) return { minX: 0, minY: 0, maxX: 0, maxY: 0 };
          if (rot === 0) {
              return { minX: center.x - w / 2, minY: center.y - h / 2, maxX: center.x + w / 2, maxY: center.y + h / 2 };
          }
          const hw = w / 2;
          const hh = h / 2;
          const cos = Math.cos(rot);
          const sin = Math.sin(rot);
          const corners = [
              { x: -hw * cos - -hh * sin, y: -hw * sin + -hh * cos },
              { x:  hw * cos - -hh * sin, y:  hw * sin + -hh * cos },
              { x:  hw * cos -  hh * sin, y:  hw * sin +  hh * cos },
              { x: -hw * cos -  hh * sin, y: -hw * sin +  hh * cos }
          ];
          const xs = corners.map(c => center.x + c.x);
          const ys = corners.map(c => center.y + c.y);
          return {
              minX: Math.min(...xs),
              minY: Math.min(...ys),
              maxX: Math.max(...xs),
              maxY: Math.max(...ys)
          };
      } else {
          let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
          stroke.points.forEach(p => {
              if (p.x < minX) minX = p.x;
              if (p.x > maxX) maxX = p.x;
              if (p.y < minY) minY = p.y;
              if (p.y > maxY) maxY = p.y;
          });
          const padding = stroke.width / 2;
          if (rot === 0 || !isFinite(minX)) {
              return { minX: minX - padding, minY: minY - padding, maxX: maxX + padding, maxY: maxY + padding };
          }
          const cx = (minX + maxX) / 2;
          const cy = (minY + maxY) / 2;
          const hw = (maxX - minX) / 2 + padding;
          const hh = (maxY - minY) / 2 + padding;
          const cos = Math.cos(rot);
          const sin = Math.sin(rot);
          const corners = [
              { x: -hw * cos - -hh * sin, y: -hw * sin + -hh * cos },
              { x:  hw * cos - -hh * sin, y:  hw * sin + -hh * cos },
              { x:  hw * cos -  hh * sin, y:  hw * sin +  hh * cos },
              { x: -hw * cos -  hh * sin, y: -hw * sin +  hh * cos }
          ];
          const xs = corners.map(c => cx + c.x);
          const ys = corners.map(c => cy + c.y);
          return {
              minX: Math.min(...xs),
              minY: Math.min(...ys),
              maxX: Math.max(...xs),
              maxY: Math.max(...ys)
          };
      }
  };

  const getSelectionBounds = () => {
      if (selectedIndicesRef.current.size === 0) return null;
      let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
      let hasValid = false;

      selectedIndicesRef.current.forEach((idx: number) => {
          const s = strokesRef.current[idx];
          if (!s) return;
          const b = getBoundingBox(s);
          if (isFinite(b.minX) && isFinite(b.minY) && isFinite(b.maxX) && isFinite(b.maxY)) {
              minX = Math.min(minX, b.minX);
              minY = Math.min(minY, b.minY);
              maxX = Math.max(maxX, b.maxX);
              maxY = Math.max(maxY, b.maxY);
              hasValid = true;
          }
      });

      if (!hasValid) return null;

      const scale = scaleRef.current || 1;
      const pad = 6 / scale;
      return {
          minX: minX - pad,
          minY: minY - pad,
          maxX: maxX + pad,
          maxY: maxY + pad,
          width: (maxX - minX) + pad * 2,
          height: (maxY - minY) + pad * 2,
          centerX: (minX + maxX) / 2,
          centerY: (minY + maxY) / 2,
      };
  };

  const screenToWorld = (x: number, y: number): Point => {
      const cam = cameraRef.current;
      const scale = scaleRef.current;
      return { x: (x - cam.x) / scale, y: (y - cam.y) / scale };
  };

  const worldToScreen = (x: number, y: number): Point => {
      const cam = cameraRef.current;
      const scale = scaleRef.current;
      return { x: x * scale + cam.x, y: y * scale + cam.y };
  };

  const snapToAngle = (p0: Point, p1: Point): Point => {
      const dx = p1.x - p0.x;
      const dy = p1.y - p0.y;
      if (dx === 0 && dy === 0) return p1;

      // Angle in degrees from -180 to 180
      const deg = Math.atan2(dy, dx) * (180 / Math.PI);
      const absDeg = Math.abs(deg); // 0 to 180

      // Horizontal snapping: within 5 degrees of 0° or 180° (halved from 10°)
      const isHorizontal = absDeg <= 5 || absDeg >= 175;

      // Vertical snapping: within 5 degrees of 90° (85° to 95°) (halved from 10°)
      const isVertical = absDeg >= 85 && absDeg <= 95;

      if (isHorizontal) {
          return { x: p1.x, y: p0.y };
      } else if (isVertical) {
          return { x: p0.x, y: p1.y };
      }

      // Outside horizontal/vertical threshold, keep free cursor angle
      return p1;
  };

  // Cursor rotation helper: maps rotated handle angles to correct CSS cursor
  const getRotatedCursor = (base: string, angle: number = 0): string => {
      let deg = (angle * (180 / Math.PI)) % 180;
      if (deg < 0) deg += 180;
      if (base === 'ns-resize') {
          if (deg >= 45 && deg < 135) return 'ew-resize';
          return 'ns-resize';
      } else if (base === 'ew-resize') {
          if (deg >= 45 && deg < 135) return 'ns-resize';
          return 'ew-resize';
      } else if (base === 'nwse-resize') {
          if (deg >= 45 && deg < 135) return 'nesw-resize';
          return 'nwse-resize';
      } else if (base === 'nesw-resize') {
          if (deg >= 45 && deg < 135) return 'nwse-resize';
          return 'nesw-resize';
      }
      return base;
  };

  // Handle and border hit detection for shapes, images, and text
  const getHandleOrBorderAtPoint = (point: Point, stroke: Stroke): { type: string; cursor: string } | null => {
      const isShape = shapeTools.includes(stroke.tool);
      const isImage = stroke.tool === 'image';
      const isText = stroke.tool === 'text';
      if (!isShape && !isImage && !isText) return null;

      const { w, h } = getStrokeBounds(stroke);
      const hw = w / 2;
      const hh = h / 2;
      const rot = stroke.rotation || 0;
      const center = (isShape || isImage)
          ? stroke.points[0]
          : { x: (stroke.points[0]?.x || 0) + hw, y: (stroke.points[0]?.y || 0) + hh };

      if (!center) return null;

      // Transform world point into stroke's local coordinate system (origin at center, unrotated)
      const dx = point.x - center.x;
      const dy = point.y - center.y;
      const cos = Math.cos(-rot);
      const sin = Math.sin(-rot);
      const lx = dx * cos - dy * sin;
      const ly = dx * sin + dy * cos;

      // If stroke is locked, disable rotation and resize handles completely
      if (stroke.isLocked) {
          if (Math.abs(lx) <= hw && Math.abs(ly) <= hh) {
              return { type: 'body', cursor: 'default' };
          }
          return null;
      }

      const scale = scaleRef.current || 1;
      const cornerRadius = 14 / scale;
      const edgeDist = 9 / scale;
      const rotHandleY = -hh - 24 / scale;
      const rotRadius = 12 / scale;

      // 1. Rotation knob check
      if (Math.hypot(lx, ly - rotHandleY) <= rotRadius) {
          return { type: 'rot', cursor: 'grab' };
      }

      // 2. Corner handles
      if (Math.hypot(lx - (-hw), ly - (-hh)) <= cornerRadius) {
          return { type: 'nw', cursor: getRotatedCursor('nwse-resize', rot) };
      }
      if (Math.hypot(lx - hw, ly - (-hh)) <= cornerRadius) {
          return { type: 'ne', cursor: getRotatedCursor('nesw-resize', rot) };
      }
      if (Math.hypot(lx - hw, ly - hh) <= cornerRadius) {
          return { type: 'se', cursor: getRotatedCursor('nwse-resize', rot) };
      }
      if (Math.hypot(lx - (-hw), ly - hh) <= cornerRadius) {
          return { type: 'sw', cursor: getRotatedCursor('nesw-resize', rot) };
      }

      // 3. Borders / edge handles
      const inXRange = lx >= -hw - edgeDist && lx <= hw + edgeDist;
      const inYRange = ly >= -hh - edgeDist && ly <= hh + edgeDist;

      if (inXRange && Math.abs(ly - (-hh)) <= edgeDist) {
          return { type: 'n', cursor: getRotatedCursor('ns-resize', rot) };
      }
      if (inXRange && Math.abs(ly - hh) <= edgeDist) {
          return { type: 's', cursor: getRotatedCursor('ns-resize', rot) };
      }
      if (inYRange && Math.abs(lx - (-hw)) <= edgeDist) {
          return { type: 'w', cursor: getRotatedCursor('ew-resize', rot) };
      }
      if (inYRange && Math.abs(lx - hw) <= edgeDist) {
          return { type: 'e', cursor: getRotatedCursor('ew-resize', rot) };
      }

      // 4. Inside body
      if (Math.abs(lx) <= hw && Math.abs(ly) <= hh) {
          return { type: 'body', cursor: 'move' };
      }

      return null;
  };

  // --- Internal Rendering for Export/Full Snapshot ---
  const drawStrokeOnCtx = (ctx: CanvasRenderingContext2D, stroke: Stroke) => {
    ctx.save();
    const rot = stroke.rotation || 0;
    if (rot !== 0) {
        const { w, h } = getStrokeBounds(stroke);
        const center = (shapeTools.includes(stroke.tool) || stroke.tool === 'image')
            ? stroke.points[0]
            : (stroke.tool === 'text'
                ? { x: (stroke.points[0]?.x || 0) + w / 2, y: (stroke.points[0]?.y || 0) + h / 2 }
                : { x: (getBoundingBox(stroke).minX + getBoundingBox(stroke).maxX) / 2, y: (getBoundingBox(stroke).minY + getBoundingBox(stroke).maxY) / 2 });
        if (center) {
            ctx.translate(center.x, center.y);
            ctx.rotate(rot);
            ctx.translate(-center.x, -center.y);
        }
    }

    if (stroke.tool === 'image' && stroke.imageUrl) {
        let img = imageCache.current[stroke.imageUrl];
        if (!img) {
            img = new Image();
            img.src = stroke.imageUrl;
            imageCache.current[stroke.imageUrl] = img;
            img.onload = () => render();
        }
        if (img.complete && img.naturalWidth > 0) {
            const ratio = img.naturalHeight / img.naturalWidth;
            const h = stroke.height || (stroke.width * ratio);
            const x = stroke.points[0].x - stroke.width / 2;
            const y = stroke.points[0].y - h / 2;
            ctx.drawImage(img, x, y, stroke.width, h);
        }
        ctx.restore();
        return;
    }

    if (stroke.tool === 'text') {
        const p = stroke.points[0];
        if (!p) { ctx.restore(); return; }
        const fontSize = stroke.width || 20;
        ctx.font = `${fontSize}px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif`;
        ctx.fillStyle = stroke.color;
        ctx.textBaseline = 'top';
        const lines = (stroke.text || '').split('\n');
        const maxWidth = stroke.textWidth;
        lines.forEach((line, i) => {
            if (maxWidth) {
                let currentLine = '';
                let lineCount = 0;
                const words = line.split(' ');
                for (const word of words) {
                    const testLine = currentLine + (currentLine ? ' ' : '') + word;
                    if (ctx.measureText(testLine).width > maxWidth && currentLine) {
                        ctx.fillText(currentLine, p.x, p.y + (i + lineCount) * fontSize * 1.2);
                        currentLine = word;
                        lineCount++;
                    } else currentLine = testLine;
                }
                ctx.fillText(currentLine, p.x, p.y + (i + lineCount) * fontSize * 1.2);
            } else ctx.fillText(line, p.x, p.y + i * fontSize * 1.2);
        });
        ctx.restore();
        return;
    }

    if (shapeTools.includes(stroke.tool)) {
        drawShapeOnCtx(ctx, stroke);
        ctx.restore();
        return;
    }

    if (stroke.points.length < 1) { ctx.restore(); return; }
    ctx.beginPath();
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.lineWidth = stroke.width;

    if (stroke.tool === 'eraser') {
      ctx.globalCompositeOperation = 'destination-out';
      const radius = stroke.width / 2;
      ctx.moveTo(stroke.points[0].x, stroke.points[0].y);
      ctx.arc(stroke.points[0].x, stroke.points[0].y, radius, 0, Math.PI * 2);
      const last = stroke.points[stroke.points.length - 1];
      ctx.arc(last.x, last.y, radius, 0, Math.PI * 2);
    } else if (stroke.tool === 'dotted-line') {
        ctx.globalCompositeOperation = 'source-over';
        ctx.strokeStyle = stroke.color;
        ctx.setLineDash([10, 15]); 
        if (stroke.points.length >= 2) {
            ctx.moveTo(stroke.points[0].x, stroke.points[0].y);
            ctx.lineTo(stroke.points[stroke.points.length - 1].x, stroke.points[stroke.points.length - 1].y);
        } else {
             ctx.moveTo(stroke.points[0].x, stroke.points[0].y);
             ctx.lineTo(stroke.points[0].x, stroke.points[0].y);
        }
    } else {
      ctx.globalCompositeOperation = 'source-over';
      ctx.strokeStyle = stroke.color;
      ctx.setLineDash([]);
      const p = stroke.points;
      if (p.length < 3) {
          ctx.moveTo(p[0].x, p[0].y);
          for (let i = 1; i < p.length; i++) ctx.lineTo(p[i].x, p[i].y);
      } else {
          ctx.moveTo(p[0].x, p[0].y);
          let i = 1;
          for (; i < p.length - 2; i++) {
              const c = (p[i].x + p[i+1].x) / 2;
              const d = (p[i].y + p[i+1].y) / 2;
              ctx.quadraticCurveTo(p[i].x, p[i].y, c, d);
          }
          if (i < p.length - 1) ctx.quadraticCurveTo(p[i].x, p[i].y, p[i+1].x, p[i+1].y);
          else if (i < p.length) ctx.lineTo(p[i].x, p[i].y);
      }
    }
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.globalCompositeOperation = 'source-over';
    ctx.restore();
  };

  const drawShapeOnCtx = (ctx: CanvasRenderingContext2D, stroke: Stroke) => {
      const { points, width: size, tool: shapeType, color } = stroke;
      if (!points[0]) return;
      const { x, y } = points[0];
      const w = stroke.width;
      const h = stroke.height || stroke.width;

      ctx.save();
      ctx.beginPath(); ctx.strokeStyle = color; ctx.lineWidth = 3; ctx.lineJoin = 'round'; ctx.lineCap = 'round';
      const drawLine = (p1: Point, p2: Point, isDashed: boolean = false) => {
          ctx.beginPath(); if (isDashed) ctx.setLineDash([5, 5]); else ctx.setLineDash([]);
          ctx.moveTo(p1.x, p1.y); ctx.lineTo(p2.x, p2.y); ctx.stroke(); ctx.setLineDash([]);
      };

      if (h !== size && size > 0) {
          ctx.translate(x, y);
          ctx.scale(1, h / size);
          ctx.translate(-x, -y);
      }

      switch (shapeType) {
          case 'square': ctx.rect(x - size/2, y - size/2, size, size); ctx.stroke(); break;
          case 'circle': ctx.beginPath(); ctx.arc(x, y, size/2, 0, Math.PI*2); ctx.stroke(); break;
          case 'triangle': { const th = size * (Math.sqrt(3)/2); ctx.beginPath(); ctx.moveTo(x, y - th/2); ctx.lineTo(x - size/2, y + th/2); ctx.lineTo(x + size/2, y + th/2); ctx.closePath(); ctx.stroke(); break; }
          case 'diamond': { ctx.beginPath(); ctx.moveTo(x, y - size/2); ctx.lineTo(x + size/2, y); ctx.lineTo(x, y + size/2); ctx.lineTo(x - size/2, y); ctx.closePath(); ctx.stroke(); break; }
          case 'star': {
              const outerRadius = size / 2, innerRadius = size / 4, spikes = 5;
              let rot = Math.PI/2*3, step = Math.PI/spikes;
              ctx.beginPath(); ctx.moveTo(x, y - outerRadius);
              for (let i = 0; i < spikes; i++) {
                  ctx.lineTo(x + Math.cos(rot) * outerRadius, y + Math.sin(rot) * outerRadius); rot += step;
                  ctx.lineTo(x + Math.cos(rot) * innerRadius, y + Math.sin(rot) * innerRadius); rot += step;
              }
              ctx.closePath(); ctx.stroke(); break;
          }
          case 'speech': {
               const sw = size, sh = size * 0.75, r = 10, tailSize = 10;
               ctx.beginPath(); ctx.moveTo(x - sw/2 + r, y - sh/2); ctx.lineTo(x + sw/2 - r, y - sh/2);
               ctx.quadraticCurveTo(x + sw/2, y - sh/2, x + sw/2, y - sh/2 + r); ctx.lineTo(x + sw/2, y + sh/2 - r);
               ctx.quadraticCurveTo(x + sw/2, y + sh/2, x + sw/2 - r, y + sh/2); ctx.lineTo(x - sw/2 + 20 + tailSize, y + sh/2);
               ctx.lineTo(x - sw/2 + 10, y + sh/2 + tailSize); ctx.lineTo(x - sw/2 + 20, y + sh/2); ctx.lineTo(x - sw/2 + r, y + sh/2);
               ctx.quadraticCurveTo(x - sw/2, y + sh/2, x - sw/2, y + sh/2 - r); ctx.lineTo(x - sw/2, y - sh/2 + r);
               ctx.quadraticCurveTo(x - sw/2, y - sh/2, x - sw/2 + r, y - sh/2); ctx.stroke(); break;
          }
          case 'arrow': {
              const headW = size * 0.4;
              const sw = size, sh = size * 0.5;
              ctx.beginPath(); ctx.moveTo(x - sw/2, y - sh/4); ctx.lineTo(x + sw/2 - headW, y - sh/4); ctx.lineTo(x + sw/2 - headW, y - sh/2);
              ctx.lineTo(x + sw/2, y); ctx.lineTo(x + sw/2 - headW, y + sh/2); ctx.lineTo(x + sw/2 - headW, y + sh/4); ctx.lineTo(x - sw/2, y + sh/4); ctx.closePath(); ctx.stroke(); break;
          }
          case 'cube': {
              const s = size * 0.7, offset = s * 0.4;
              const fTL = { x: x - s/2, y: y - s/2 + offset/2 }, fTR = { x: x + s/2, y: y - s/2 + offset/2 }, fBL = { x: x - s/2, y: y + s/2 + offset/2 }, fBR = { x: x + s/2, y: y + s/2 + offset/2 };
              const bTL = { x: fTL.x + offset, y: fTL.y - offset }, bTR = { x: fTR.x + offset, y: fTR.y - offset }, bBL = { x: fBL.x + offset, y: fBL.y - offset }, bBR = { x: fBR.x + offset, y: fBR.y - offset };
              drawLine(fTL, fTR); drawLine(fTR, fBR); drawLine(fBR, fBL); drawLine(fBL, fTL); drawLine(fTL, bTL); drawLine(fTR, bTR); drawLine(fBR, bBR); drawLine(bTL, bTR); drawLine(bTR, bBR);
              drawLine(fBL, bBL, true); drawLine(bBL, bTL, true); drawLine(bBL, bBR, true); break;
          }
          case 'cylinder': {
              const cw = size * 0.6, ch = size * 0.8, eH = cw * 0.3, tCy = y - ch/2, bCy = y + ch/2;
              ctx.beginPath(); ctx.ellipse(x, tCy, cw, eH, 0, 0, Math.PI * 2); ctx.stroke();
              drawLine({x: x - cw, y: tCy}, {x: x - cw, y: bCy}); drawLine({x: x + cw, y: tCy}, {x: x + cw, y: bCy});
              ctx.beginPath(); ctx.ellipse(x, bCy, cw, eH, 0, 0, Math.PI); ctx.stroke();
              ctx.beginPath(); ctx.setLineDash([5, 5]); ctx.ellipse(x, bCy, cw, eH, 0, Math.PI, Math.PI * 2); ctx.stroke();
              ctx.setLineDash([]); break;
          }
          case 'sphere': {
              const r = size / 2; ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.stroke();
              ctx.beginPath(); ctx.ellipse(x, y, r, r * 0.3, 0, 0, Math.PI); ctx.stroke();
              ctx.beginPath(); ctx.setLineDash([5, 5]); ctx.ellipse(x, y, r, r * 0.3, 0, Math.PI, Math.PI * 2); ctx.stroke(); ctx.setLineDash([]); break;
          }
          case 'pyramid': {
               const pw = size * 0.8, ph = size * 0.8;
               const fl = { x: x - pw/2, y: y + ph/2 }, fr = { x: x + pw/2, y: y + ph/2 }, br = { x: x + pw*0.75, y: y + ph/2 - pw/2 }, bl = { x: x - pw/4, y: y + ph/2 - pw/2 };
               const apex = { x: x + pw/8, y: y - ph/2 };
               drawLine(fl, fr); drawLine(fr, br); drawLine(fl, apex); drawLine(fr, apex); drawLine(br, apex);
               drawLine(fl, bl, true); drawLine(bl, br, true); drawLine(bl, apex, true); break;
          }
          case 'prism': {
              const pw = size * 0.8, ph = size * 0.6, pd = size * 0.5;
              const fT = { x, y: y - ph/2 }, fL = { x: x - pd, y: y + ph/2 }, fR = { x: x + pd, y: y + ph/2 };
              const sX = pw * 0.5, sY = -pw * 0.2, bT = { x: fT.x + sX, y: fT.y + sY }, bL = { x: fL.x + sX, y: fL.y + sY }, bR = { x: fR.x + sX, y: fR.y + sY };
              drawLine(fT, fL); drawLine(fL, fR); drawLine(fR, fT); drawLine(fT, bT); drawLine(fR, bR); drawLine(bT, bR);
              drawLine(fL, bL, true); drawLine(bL, bT, true); drawLine(bL, bR, true); break;
          }
      }
      ctx.restore();
  };

  const drawCodeBlockOnCtx = (ctx: CanvasRenderingContext2D, block: CodeBlockItem, isDark: boolean) => {
    const x = block.x;
    const y = block.y;
    const r = 12;

    const lines = (block.code || '').split('\n');
    const lineCount = Math.max(1, lines.length);
    const maxVisualLen = lines.reduce((max, l) => Math.max(max, l.replace(/\t/g, '    ').length), 0);

    const baseWidth = Math.max(380, block.width || 380);
    const codeFontSize = 13;
    const lineH = 20;
    const gutterW = lineCount >= 100 ? 42 : 36;
    const headerH = 28;
    const footerH = 24;

    const charW = 8.05;
    const textW = Math.ceil(maxVisualLen * charW);
    const neededW = (gutterW + 12) + textW + 28;
    const w = Math.max(baseWidth, neededW);

    const editorContentH = lineCount * lineH + 16;
    const h = block.isMinimized ? headerH : (headerH + editorContentH + footerH);

    ctx.save();
    // Card background (borderless)
    ctx.beginPath();
    if (typeof (ctx as any).roundRect === 'function') {
      (ctx as any).roundRect(x, y, w, h, r);
    } else {
      ctx.rect(x, y, w, h);
    }
    ctx.fillStyle = isDark ? '#141518' : '#ffffff';
    ctx.fill();

    // Header background
    ctx.save();
    ctx.beginPath();
    if (typeof (ctx as any).roundRect === 'function') {
      (ctx as any).roundRect(x, y, w, headerH, [r, r, 0, 0]);
    } else {
      ctx.rect(x, y, w, headerH);
    }
    ctx.fillStyle = isDark ? '#1c1d22' : '#f1f5f9';
    ctx.fill();

    // macOS Window control dots
    const dotRadius = 4;
    const dotY = y + headerH / 2;
    const dotStartX = x + 12;
    const dotGap = 11;

    // Red dot
    ctx.beginPath();
    ctx.arc(dotStartX, dotY, dotRadius, 0, Math.PI * 2);
    ctx.fillStyle = '#ff5f56';
    ctx.fill();

    // Yellow dot
    ctx.beginPath();
    ctx.arc(dotStartX + dotGap, dotY, dotRadius, 0, Math.PI * 2);
    ctx.fillStyle = '#ffbd2e';
    ctx.fill();

    // Green dot
    ctx.beginPath();
    ctx.arc(dotStartX + dotGap * 2, dotY, dotRadius, 0, Math.PI * 2);
    ctx.fillStyle = '#27c93f';
    ctx.fill();
    ctx.restore();

    if (!block.isMinimized) {
      // Line numbers gutter
      ctx.fillStyle = isDark ? '#16171a' : '#f8fafc';
      ctx.fillRect(x + 1, y + headerH, gutterW, h - headerH - footerH);
      ctx.strokeStyle = isDark ? '#27272a' : '#e2e8f0';
      ctx.beginPath();
      ctx.moveTo(x + 1 + gutterW, y + headerH);
      ctx.lineTo(x + 1 + gutterW, y + h - footerH);
      ctx.stroke();

      // Code lines
      ctx.font = `${codeFontSize}px ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace`;
      ctx.textBaseline = 'top';

      lines.forEach((line, i) => {
        const lineY = y + headerH + 8 + i * lineH;
        if (lineY + lineH > y + h - 8) return;

        // Line number
        ctx.fillStyle = isDark ? '#52525b' : '#94a3b8';
        ctx.fillText(String(i + 1), x + 8, lineY);

        // Code line syntax styling
        if (line.trim().startsWith('#')) {
          ctx.fillStyle = isDark ? '#71717a' : '#64748b';
        } else if (/\b(def|class|import|return|if|elif|else|for|while|in)\b/.test(line)) {
          ctx.fillStyle = isDark ? '#c084fc' : '#7c3aed';
        } else {
          ctx.fillStyle = isDark ? '#f4f4f5' : '#0f172a';
        }
        ctx.fillText(line, x + gutterW + 12, lineY);
      });
    }
    ctx.restore();
  };

  // --- Imperative Handle ---
  useImperativeHandle(ref, () => ({
    getSnapshot: (): WhiteboardData => {
      return { 
        strokes: strokesRef.current, 
        codeBlocks: codeBlocksRef.current,
        camera: cameraRef.current, 
        version: 1 
      };
    },
    restoreSnapshot: (data: WhiteboardData) => {
      if (data && Array.isArray(data.strokes)) {
        strokesRef.current = data.strokes;
        const blocks = data.codeBlocks && Array.isArray(data.codeBlocks) ? data.codeBlocks : [];
        setCodeBlocks(blocks);
        if (data.camera) cameraRef.current = data.camera;
        data.strokes.forEach(s => {
            if (s.tool === 'image' && s.imageUrl && !imageCache.current[s.imageUrl]) {
                const img = new Image();
                img.src = s.imageUrl;
                img.onload = () => render();
                imageCache.current[s.imageUrl] = img;
            }
        });
        historyRef.current = [{
          strokes: [...data.strokes],
          codeBlocks: blocks.map(b => ({ ...b }))
        }];
        historyStepRef.current = 0;
        selectedIndicesRef.current.clear();
        onHistoryChange(false, false);
        render();
      }
    },
    loadBoardState: (strokes: Stroke[], blocks: CodeBlockItem[]) => {
      const nextStrokes = (Array.isArray(strokes) ? strokes : []).map(s => ({
        ...s,
        id: s.id || `s_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
        updatedAt: s.updatedAt || Date.now()
      }));
      strokesRef.current = nextStrokes;
      const codeBlocksList = Array.isArray(blocks) ? blocks : [];
      codeBlocksRef.current = codeBlocksList;
      setCodeBlocks(codeBlocksList);
      strokesRef.current.forEach(s => {
        if (s.tool === 'image' && s.imageUrl && !imageCache.current[s.imageUrl]) {
          const img = new Image();
          img.src = s.imageUrl;
          img.onload = () => render();
          imageCache.current[s.imageUrl] = img;
        }
      });
      historyRef.current = [{
        strokes: [...strokesRef.current],
        codeBlocks: codeBlocksList.map(b => ({ ...b }))
      }];
      historyStepRef.current = 0;
      selectedIndicesRef.current.clear();
      onHistoryChange(false, false);
      render();
    },
    loadRoomState: (strokes: Stroke[], blocks: CodeBlockItem[]) => {
      const nextStrokes = (Array.isArray(strokes) ? strokes : []).map(s => ({
        ...s,
        id: s.id || `s_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
        updatedAt: s.updatedAt || Date.now()
      }));
      strokesRef.current = nextStrokes;
      const codeBlocksList = Array.isArray(blocks) ? blocks : [];
      codeBlocksRef.current = codeBlocksList;
      setCodeBlocks(codeBlocksList);
      strokesRef.current.forEach(s => {
        if (s.tool === 'image' && s.imageUrl && !imageCache.current[s.imageUrl]) {
          const img = new Image();
          img.src = s.imageUrl;
          img.onload = () => render();
          imageCache.current[s.imageUrl] = img;
        }
      });
      historyRef.current = [{
        strokes: [...strokesRef.current],
        codeBlocks: codeBlocksList.map(b => ({ ...b }))
      }];
      historyStepRef.current = 0;
      selectedIndicesRef.current.clear();
      onHistoryChange(false, false);
      render();
    },
    clearBoard: () => {
      strokesRef.current = [];
      codeBlocksRef.current = [];
      setCodeBlocks([]);
      selectedIndicesRef.current.clear();
      setSelectedImageIndex(null);
      historyRef.current = [{ strokes: [], codeBlocks: [] }];
      historyStepRef.current = 0;
      onHistoryChange(false, false);
      render();
    },
    setZoom: (targetScale: number) => {
        const constrainedScale = Math.max(0.01, Math.min(targetScale, 4));
        const canvas = canvasRef.current;
        if (canvas) {
            const centerScreenX = canvas.width / 2;
            const centerScreenY = canvas.height / 2;
            const worldCenterX = (centerScreenX - cameraRef.current.x) / scaleRef.current;
            const worldCenterY = (centerScreenY - cameraRef.current.y) / scaleRef.current;
            cameraRef.current.x = centerScreenX - worldCenterX * constrainedScale;
            cameraRef.current.y = centerScreenY - worldCenterY * constrainedScale;
            scaleRef.current = constrainedScale;
            setCamTick(t => t + 1);
            render();
            if (onZoomChange) onZoomChange(constrainedScale);
        }
    },
    deleteSelection: () => {
        let changed = false;
        if (activeCodeBlockIdRef.current) {
            const deletedId = activeCodeBlockIdRef.current;
            const nextBlocks = codeBlocksRef.current.filter(b => b.id !== deletedId);
            codeBlocksRef.current = nextBlocks;
            setCodeBlocks(nextBlocks);
            activeCodeBlockIdRef.current = null;
            setActiveCodeBlockId(null);
            if (onCodeBlockDeleted) onCodeBlockDeleted(deletedId);
            changed = true;
        }
        if (selectedIndicesRef.current.size > 0) {
            let deletedCount = 0;
            const newStrokes = strokesRef.current.filter((stroke, index) => {
                if (selectedIndicesRef.current.has(index)) {
                    if (stroke.isLocked) return true; // Keep locked objects!
                    deletedCount++;
                    return false;
                }
                return true;
            });
            if (deletedCount > 0) {
                strokesRef.current = newStrokes;
                changed = true;
            }
            // Keep selected status only for remaining locked strokes
            const remainingSelected = new Set<number>();
            strokesRef.current.forEach((s, idx) => {
                if (s.isLocked && selectedIndicesRef.current.has(idx)) {
                    remainingSelected.add(idx);
                }
            });
            selectedIndicesRef.current = remainingSelected;
            if (remainingSelected.size === 1) {
                const [remIdx] = Array.from(remainingSelected);
                setSelectedImageIndex(strokesRef.current[remIdx]?.tool === 'image' ? remIdx : null);
            } else {
                setSelectedImageIndex(null);
            }
            if (onShapeSelect) onShapeSelect(null);
            isDraggingSelectionRef.current = false;
            isDrawingRef.current = false;
        }
        if (changed) {
            pushHistory();
            render();
        }
    },
    copySelection: (): boolean => {
        if (selectedIndicesRef.current.size === 0) return false;
        const selectedStrokes = strokesRef.current.filter((_, i) => selectedIndicesRef.current.has(i));
        clipboardRef.current = JSON.parse(JSON.stringify(selectedStrokes));
        return true;
    },
    pasteSelection: () => {
        if (clipboardRef.current.length === 0) return;
        const canvas = canvasRef.current;
        const targetScreenPos = lastMousePosRef.current || (canvas ? { x: canvas.width / 2, y: canvas.height / 2 } : { x: 0, y: 0 });
        const targetWorldPos = screenToWorld(targetScreenPos.x, targetScreenPos.y);
        let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
        clipboardRef.current.forEach(stroke => {
            const bounds = getBoundingBox(stroke);
            minX = Math.min(minX, bounds.minX);
            maxX = Math.max(maxX, bounds.maxX);
            minY = Math.min(minY, bounds.minY);
            maxY = Math.max(maxY, bounds.maxY);
        });
        const centerX = (minX + maxX) / 2;
        const centerY = (minY + maxY) / 2;
        const dx = targetWorldPos.x - centerX;
        const dy = targetWorldPos.y - centerY;
        const newStrokes = JSON.parse(JSON.stringify(clipboardRef.current)).map((stroke: Stroke) => {
            return {
                ...stroke,
                id: `s_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
                points: stroke.points.map(p => ({ x: p.x + dx, y: p.y + dy })),
                isLocked: false,
                updatedAt: Date.now()
            };
        });
        const startIndex = strokesRef.current.length;
        strokesRef.current = [...strokesRef.current, ...newStrokes];
        selectedIndicesRef.current.clear();
        for (let i = 0; i < newStrokes.length; i++) selectedIndicesRef.current.add(startIndex + i);
        if (newStrokes.length === 1 && newStrokes[0].tool === 'image') {
            setSelectedImageIndex(startIndex);
        } else {
            setSelectedImageIndex(null);
        }
        if (onShapeSelect) onShapeSelect(null);
        pushHistory();
        render();
        setCamTick(t => t + 1);
    },
    getCanvasImage: () => {
        const canvas = canvasRef.current;
        if (!canvas) return null;
        if (strokesRef.current.length === 0 && codeBlocksRef.current.length === 0) return canvas.toDataURL('image/png');

        // Capture EVERYTHING on the board by calculating a bounding box for all content
        let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
        strokesRef.current.forEach(stroke => {
            const bounds = getBoundingBox(stroke);
            minX = Math.min(minX, bounds.minX);
            maxX = Math.max(maxX, bounds.maxX);
            minY = Math.min(minY, bounds.minY);
            maxY = Math.max(maxY, bounds.maxY);
        });
        codeBlocksRef.current.forEach(block => {
            const lines = (block.code || '').split('\n');
            const lineCount = Math.max(1, lines.length);
            const maxVisualLen = lines.reduce((max, l) => Math.max(max, l.replace(/\t/g, '    ').length), 0);
            const neededW = 48 + Math.ceil(maxVisualLen * 8.05) + 28;
            const w = Math.max(block.width || 380, neededW);
            const neededH = 28 + (lineCount * 20 + 16) + 24;
            const h = block.isMinimized ? 28 : (block.height || neededH);
            minX = Math.min(minX, block.x);
            maxX = Math.max(maxX, block.x + w);
            minY = Math.min(minY, block.y);
            maxY = Math.max(maxY, block.y + h);
        });

        const padding = 100; // Large padding for AI context
        const width = (maxX - minX) + padding * 2;
        const height = (maxY - minY) + padding * 2;

        // Max canvas size safeguard
        const maxSize = 4096;
        let scaleDown = 1;
        if (width > maxSize || height > maxSize) {
            scaleDown = maxSize / Math.max(width, height);
        }

        const offCanvas = document.createElement('canvas');
        offCanvas.width = width * scaleDown;
        offCanvas.height = height * scaleDown;
        const offCtx = offCanvas.getContext('2d');
        if (!offCtx) return canvas.toDataURL('image/png');

        // Fill background color
        offCtx.fillStyle = isDarkMode ? '#18181b' : '#fbfbfb';
        offCtx.fillRect(0, 0, offCanvas.width, offCanvas.height);

        // Draw content centered in padding area
        offCtx.save();
        offCtx.scale(scaleDown, scaleDown);
        offCtx.translate(-minX + padding, -minY + padding);
        strokesRef.current.forEach(stroke => drawStrokeOnCtx(offCtx, stroke));
        codeBlocksRef.current.forEach(block => drawCodeBlockOnCtx(offCtx, block, isDarkMode));
        const dataUrl = offCanvas.toDataURL('image/png');
        offCanvas.width = 0;
        offCanvas.height = 0;
        return dataUrl;
    },
    addImage: (imageUrl: string, screenX: number, screenY: number) => {
        const img = new Image();
        img.src = imageUrl;
        img.onload = () => {
            imageCache.current[imageUrl] = img;
            const worldPos = screenToWorld(screenX, screenY);
            const newStroke: Stroke = {
                id: `s_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
                tool: 'image',
                points: [worldPos],
                color: '#000000',
                width: 400, // Default width for external images
                imageUrl: imageUrl,
                isLocked: false,
                updatedAt: Date.now()
            };
            const newIndex = strokesRef.current.length;
            strokesRef.current = [...strokesRef.current, newStroke];
            selectedIndicesRef.current.clear();
            selectedIndicesRef.current.add(newIndex);
            setSelectedImageIndex(newIndex);
            if (onSelectTool) onSelectTool('cursor');
            pushHistory();
            render();
            setCamTick(t => t + 1);
        };
    },
    isInteracting: () => {
      return isDrawingRef.current || 
             isDraggingSelectionRef.current || 
             isPanningRef.current || 
             !!isRotatingRef.current || 
             !!isResizingShapeRef.current || 
             !!isRotatingGroupRef.current ||
             !!isResizingGroupRef.current ||
             isSelectingRef.current || 
             eraserTrailOpacityRef.current > 0;
    }
  }));

  // Trims the eraser trail so it never exceeds maxLength.
  // The tail (oldest point) slides forward along its exact recorded trajectory,
  // preventing the trail from growing beyond the maximum length.
  const trimTrailToMaxLength = (trail: Point[], maxLength: number) => {
    if (trail.length < 2) return;

    let totalLength = 0;
    for (let i = 0; i < trail.length - 1; i++) {
      totalLength += Math.hypot(trail[i + 1].x - trail[i].x, trail[i + 1].y - trail[i].y);
    }

    let excess = totalLength - maxLength;
    if (excess <= 0) return;

    while (excess > 0 && trail.length >= 2) {
      const segDist = Math.hypot(trail[1].x - trail[0].x, trail[1].y - trail[0].y);
      if (segDist <= 0.0001) {
        trail.shift();
        continue;
      }
      if (segDist <= excess) {
        excess -= segDist;
        trail.shift();
      } else {
        const ratio = excess / segDist;
        trail[0] = {
          x: trail[0].x + (trail[1].x - trail[0].x) * ratio,
          y: trail[0].y + (trail[1].y - trail[0].y) * ratio
        };
        excess = 0;
        break;
      }
    }
  };

  // Render the uniform semi-transparent gray eraser trail and cursor head
  const drawEraserTrail = (ctx: CanvasRenderingContext2D) => {
    const scale = scaleRef.current || 1;
    const trail = eraserTrailRef.current;
    const opacity = eraserTrailOpacityRef.current;

    // 1. Single-tone uniform semi-transparent gray trail (no extra colors or layered gradients)
    if (trail.length > 0 && opacity > 0.005) {
      ctx.save();
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';

      const grayAlpha = (isDarkMode ? 0.32 : 0.26) * opacity;
      const grayTone = isDarkMode 
        ? `rgba(212, 212, 216, ${grayAlpha})` 
        : `rgba(100, 116, 139, ${grayAlpha})`;

      ctx.strokeStyle = grayTone;
      ctx.fillStyle = grayTone;
      ctx.lineWidth = eraserWidth;

      if (trail.length === 1) {
        ctx.beginPath();
        ctx.arc(trail[0].x, trail[0].y, Math.max(1, eraserWidth / 2), 0, Math.PI * 2);
        ctx.fill();
      } else {
        ctx.beginPath();
        ctx.moveTo(trail[0].x, trail[0].y);
        for (let i = 1; i < trail.length; i++) {
          ctx.lineTo(trail[i].x, trail[i].y);
        }
        ctx.stroke();
      }

      ctx.restore();
    }

    // 2. Active eraser head circle (when tool is eraser and cursor is on canvas)
    if (tool === 'eraser' && eraserCurrentPosRef.current) {
      const pos = eraserCurrentPosRef.current;
      const radius = eraserWidth / 2;
      ctx.save();

      // Translucent circular body matching the single-tone gray
      ctx.beginPath();
      ctx.arc(pos.x, pos.y, radius, 0, Math.PI * 2);
      ctx.fillStyle = isDarkMode
        ? (isDrawingRef.current ? 'rgba(212, 212, 216, 0.15)' : 'rgba(212, 212, 216, 0.08)')
        : (isDrawingRef.current ? 'rgba(100, 116, 139, 0.15)' : 'rgba(100, 116, 139, 0.08)');
      ctx.fill();

      // Perimeter stroke in matching single-tone gray
      ctx.lineWidth = 1.5 / scale;
      const ringColor = isDarkMode ? 'rgba(212, 212, 216, 0.55)' : 'rgba(100, 116, 139, 0.55)';
      ctx.strokeStyle = ringColor;
      if (!isDrawingRef.current) {
        ctx.setLineDash([3 / scale, 3 / scale]);
      }
      ctx.stroke();
      if (!isDrawingRef.current) {
        ctx.setLineDash([]);
      }

      // Center precision point (only while hovering before drawing, in matching gray tone)
      if (!isDrawingRef.current) {
        ctx.beginPath();
        ctx.arc(pos.x, pos.y, 2 / scale, 0, Math.PI * 2);
        ctx.fillStyle = ringColor;
        ctx.fill();
      }

      ctx.restore();
    }
  };

  // --- Standard Rendering Loop ---
  const render = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    const cam = cameraRef.current;
    const scale = scaleRef.current;
    ctx.setTransform(scale, 0, 0, scale, cam.x, cam.y);
    if (showGrid) drawGrid(ctx);
    strokesRef.current.forEach(stroke => drawStrokeOnCtx(ctx, stroke));

    // Draw subtle lock badge on unselected locked images so user clearly sees they are pinned
    strokesRef.current.forEach((stroke, i) => {
        if (stroke.tool === 'image' && stroke.isLocked && !selectedIndicesRef.current.has(i)) {
            const { w, h } = getStrokeBounds(stroke);
            const rot = stroke.rotation || 0;
            const center = stroke.points[0];
            if (!center) return;
            ctx.save();
            ctx.translate(center.x, center.y);
            ctx.rotate(rot);
            const badgeW = 20 / scale;
            const badgeH = 20 / scale;
            const pad = 6 / scale;
            const bx = w / 2 - badgeW - pad;
            const by = -h / 2 + pad;
            ctx.fillStyle = isDarkMode ? 'rgba(24, 24, 27, 0.88)' : 'rgba(255, 255, 255, 0.92)';
            ctx.beginPath();
            if (typeof (ctx as any).roundRect === 'function') {
                (ctx as any).roundRect(bx, by, badgeW, badgeH, 4 / scale);
            } else {
                ctx.rect(bx, by, badgeW, badgeH);
            }
            ctx.fill();
            ctx.strokeStyle = isDarkMode ? 'rgba(245, 158, 11, 0.7)' : 'rgba(217, 119, 6, 0.7)';
            ctx.lineWidth = 1.2 / scale;
            ctx.stroke();

            // Draw miniature padlock shackle & body
            const cx = bx + badgeW / 2;
            const cy = by + badgeH / 2;
            const bodyW = 8 / scale;
            const bodyH = 6 / scale;
            ctx.fillStyle = isDarkMode ? '#f59e0b' : '#d97706';
            ctx.fillRect(cx - bodyW / 2, cy - 0.5 / scale, bodyW, bodyH);
            ctx.beginPath();
            ctx.lineWidth = 1.4 / scale;
            ctx.strokeStyle = isDarkMode ? '#f59e0b' : '#d97706';
            ctx.arc(cx, cy - 0.5 / scale, 2.8 / scale, Math.PI, 0);
            ctx.stroke();
            ctx.restore();
        }
    });

    if (selectedIndicesRef.current.size > 0) {
        // 1. Draw individual bounding box for each stroke when multiple items are selected (matching image.png)
        if (selectedIndicesRef.current.size > 1) {
            selectedIndicesRef.current.forEach((idx: number) => {
                const stroke = strokesRef.current[idx];
                if (!stroke) return;
                const b = getBoundingBox(stroke);
                ctx.save();
                ctx.strokeStyle = 'rgba(59, 130, 246, 0.7)';
                ctx.lineWidth = 1 / scale;
                ctx.setLineDash([]);
                ctx.strokeRect(b.minX, b.minY, b.maxX - b.minX, b.maxY - b.minY);
                ctx.restore();
            });
        }

        // 2. Draw unified common bounding box ("общая рамка") enclosing the entire selection
        const selBox = getSelectionBounds();
        if (selBox) {
            const allLocked = Array.from(selectedIndicesRef.current).every(i => strokesRef.current[i]?.isLocked);
            const frameColor = allLocked ? (isDarkMode ? '#f59e0b' : '#d97706') : '#3b82f6';

            ctx.save();
            // Solid crisp selection border
            ctx.strokeStyle = frameColor;
            ctx.lineWidth = 1.5 / scale;
            ctx.setLineDash([]);
            ctx.strokeRect(selBox.minX, selBox.minY, selBox.width, selBox.height);

            if (!allLocked) {
                // 4 Corner circular handles
                const cornerR = 5 / scale;
                const corners = [
                    { x: selBox.minX, y: selBox.minY },
                    { x: selBox.maxX, y: selBox.minY },
                    { x: selBox.maxX, y: selBox.maxY },
                    { x: selBox.minX, y: selBox.maxY }
                ];
                corners.forEach(c => {
                    ctx.beginPath();
                    ctx.arc(c.x, c.y, cornerR, 0, Math.PI * 2);
                    ctx.fillStyle = '#ffffff';
                    ctx.fill();
                    ctx.strokeStyle = frameColor;
                    ctx.lineWidth = 1.5 / scale;
                    ctx.stroke();
                });

                // Top-right grip handle badge (from image.png)
                const gripX = selBox.maxX + 14 / scale;
                const gripY = selBox.minY - 2 / scale;
                const badgeR = 9.5 / scale;
                ctx.beginPath();
                ctx.arc(gripX, gripY, badgeR, 0, Math.PI * 2);
                ctx.fillStyle = isDarkMode ? '#27272a' : '#f1f5f9';
                ctx.fill();
                ctx.strokeStyle = isDarkMode ? '#3f3f46' : '#cbd5e1';
                ctx.lineWidth = 1 / scale;
                ctx.stroke();

                // 6 dots inside grip badge
                ctx.fillStyle = isDarkMode ? '#a1a1aa' : '#64748b';
                const dotRadius = 1.1 / scale;
                const spacingX = 3.2 / scale;
                const spacingY = 3.2 / scale;
                for (let r = -1; r <= 1; r++) {
                    for (let col = -0.5; col <= 0.5; col += 1) {
                        ctx.beginPath();
                        ctx.arc(gripX + col * spacingX, gripY + r * spacingY, dotRadius, 0, Math.PI * 2);
                        ctx.fill();
                    }
                }

                // Bottom-left curved arrow rotation handle (from image.png)
                const rotX = selBox.minX - 12 / scale;
                const rotY = selBox.maxY + 22 / scale;
                const arrowR = 7.5 / scale;
                ctx.beginPath();
                ctx.arc(rotX, rotY, arrowR, 0.3 * Math.PI, 1.8 * Math.PI);
                ctx.strokeStyle = isDarkMode ? '#e4e4e7' : '#18181b';
                ctx.lineWidth = 1.8 / scale;
                ctx.lineCap = 'round';
                ctx.stroke();

                // Arrowhead
                const endAng = 0.3 * Math.PI;
                const hx = rotX + Math.cos(endAng) * arrowR;
                const hy = rotY + Math.sin(endAng) * arrowR;
                const tangent = endAng + Math.PI / 2;
                const hl = 4.5 / scale;
                ctx.beginPath();
                ctx.moveTo(hx, hy);
                ctx.lineTo(hx - hl * Math.cos(tangent - 0.55), hy - hl * Math.sin(tangent - 0.55));
                ctx.moveTo(hx, hy);
                ctx.lineTo(hx - hl * Math.cos(tangent + 0.55), hy - hl * Math.sin(tangent + 0.55));
                ctx.stroke();

                // If actively rotating the group, show live angle badge
                if (isRotatingGroupRef.current) {
                    const { startMouseAngle, center } = isRotatingGroupRef.current;
                    const lastPos = lastMousePosRef.current ? screenToWorld(lastMousePosRef.current.x, lastMousePosRef.current.y) : { x: rotX, y: rotY };
                    const curAngle = Math.atan2(lastPos.y - center.y, lastPos.x - center.x);
                    let deg = Math.round((curAngle - startMouseAngle) * (180 / Math.PI)) % 360;
                    if (deg < 0) deg += 360;
                    const text = `${deg}°`;
                    const badgeY = selBox.minY - 26 / scale;
                    ctx.font = `bold ${12 / scale}px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif`;
                    const tw = ctx.measureText(text).width;
                    const padX = 7 / scale;
                    const bw = tw + padX * 2;
                    const bh = 20 / scale;
                    ctx.fillStyle = '#2563eb';
                    ctx.beginPath();
                    if (typeof (ctx as any).roundRect === 'function') {
                        (ctx as any).roundRect(selBox.centerX - bw / 2, badgeY - bh / 2, bw, bh, 4 / scale);
                    } else {
                        ctx.rect(selBox.centerX - bw / 2, badgeY - bh / 2, bw, bh);
                    }
                    ctx.fill();
                    ctx.fillStyle = '#ffffff';
                    ctx.textAlign = 'center';
                    ctx.textBaseline = 'middle';
                    ctx.fillText(text, selBox.centerX, badgeY);
                }
            }
            ctx.restore();
        }
    }

    // Hovered border highlight for unselected shapes/images
    if (hoveredBorderRef.current && !selectedIndicesRef.current.has(hoveredBorderRef.current.strokeIndex)) {
        const hStroke = strokesRef.current[hoveredBorderRef.current.strokeIndex];
        if (hStroke) {
            const { w, h } = getStrokeBounds(hStroke);
            const rot = hStroke.rotation || 0;
            const center = (shapeTools.includes(hStroke.tool) || hStroke.tool === 'image')
                ? hStroke.points[0]
                : { x: (hStroke.points[0]?.x || 0) + w / 2, y: (hStroke.points[0]?.y || 0) + h / 2 };
            if (center) {
                ctx.save();
                ctx.translate(center.x, center.y);
                ctx.rotate(rot);
                ctx.strokeStyle = 'rgba(59, 130, 246, 0.75)';
                ctx.lineWidth = 1.5 / scale;
                ctx.setLineDash([4 / scale, 4 / scale]);
                ctx.strokeRect(-w / 2, -h / 2, w, h);
                ctx.restore();
            }
        }
    }
    if (isSelectingRef.current && selectionStartRef.current && selectionCurrentRef.current) {
        const start = selectionStartRef.current;
        const curr = selectionCurrentRef.current;
        const x = Math.min(start.x, curr.x);
        const y = Math.min(start.y, curr.y);
        const w = Math.abs(curr.x - start.x);
        const h = Math.abs(curr.y - start.y);
        ctx.save();
        ctx.fillStyle = 'rgba(0, 102, 255, 0.1)';
        ctx.strokeStyle = '#0066ff';
        ctx.lineWidth = 1 / scale;
        ctx.fillRect(x, y, w, h);
        ctx.strokeRect(x, y, w, h);
        ctx.restore();
    }
    if (currentStrokeRef.current) drawStrokeOnCtx(ctx, currentStrokeRef.current);

    // Draw active eraser trail and circular head
    drawEraserTrail(ctx);
  }, [showGrid, isDarkMode, tool, eraserWidth]);

  // RequestAnimationFrame throttled render to prevent CPU/memory churn on high-frequency pointer moves
  const renderRafRef = useRef<number | null>(null);
  const requestRender = useCallback(() => {
    if (renderRafRef.current === null) {
      renderRafRef.current = requestAnimationFrame(() => {
        renderRafRef.current = null;
        render();
      });
    }
  }, [render]);

  useEffect(() => {
    return () => {
      if (renderRafRef.current !== null) {
        cancelAnimationFrame(renderRafRef.current);
        renderRafRef.current = null;
      }
      if (eraserFadeAnimRef.current !== null) {
        cancelAnimationFrame(eraserFadeAnimRef.current);
        eraserFadeAnimRef.current = null;
      }
    };
  }, []);

  // Smoothly fade out the eraser trail upon release
  const startEraserTrailFade = useCallback(() => {
    if (eraserFadeAnimRef.current) {
      cancelAnimationFrame(eraserFadeAnimRef.current);
      eraserFadeAnimRef.current = null;
    }

    if (eraserTrailRef.current.length === 0) {
      eraserTrailOpacityRef.current = 0;
      return;
    }

    const fadeDuration = 240; // ms
    const startTime = performance.now();
    const initialOpacity = eraserTrailOpacityRef.current || 1;

    const step = (now: number) => {
      const elapsed = now - startTime;
      const progress = Math.min(1, elapsed / fadeDuration);
      // ease-out cubic
      const ease = 1 - Math.pow(1 - progress, 3);
      eraserTrailOpacityRef.current = Math.max(0, initialOpacity * (1 - ease));

      render();

      if (progress < 1 && eraserTrailOpacityRef.current > 0.005) {
        eraserFadeAnimRef.current = requestAnimationFrame(step);
      } else {
        eraserTrailOpacityRef.current = 0;
        eraserTrailRef.current = [];
        eraserFadeAnimRef.current = null;
        render();
      }
    };

    eraserFadeAnimRef.current = requestAnimationFrame(step);
  }, [render]);

  // Cleanup animation frame on unmount
  useEffect(() => {
    return () => {
      if (eraserFadeAnimRef.current) {
        cancelAnimationFrame(eraserFadeAnimRef.current);
      }
    };
  }, []);

  const handleMouseLeave = useCallback(() => {
    eraserCurrentPosRef.current = null;
    if (tool === 'eraser' && isDrawingRef.current) {
      endDrawing();
    } else {
      render();
    }
  }, [tool, render]);

  // Re-render when dark mode or grid changes
  useEffect(() => {
    render();
  }, [isDarkMode, render]);

  // --- Handlers ---
  const handleFinishText = useCallback(() => {
      const currentInput = activeTextInputRef.current;
      if (currentInput && currentInput.value.trim().length > 0) {
          const newStroke: Stroke = {
              id: `s_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
              tool: 'text',
              points: [{ x: currentInput.x, y: currentInput.y }],
              color: currentInput.color,
              width: currentInput.fontSize,
              text: currentInput.value,
              updatedAt: Date.now()
          };
          strokesRef.current = [...strokesRef.current, newStroke];
          if (onStrokeAdded) onStrokeAdded(newStroke);
          pushHistory();
          render();
      }
      setActiveTextInput(null);
      activeTextInputRef.current = null;
      setCaretIndex(0);
  }, [onStrokeAdded, render]);

  const startDrawing = (e: React.MouseEvent | React.TouchEvent) => {
    const coords = getCoords(e);
    lastMousePosRef.current = coords;
    if ('button' in e && (e.button === 1 || e.button === 2)) {
        if (e.button === 1) e.preventDefault();
        isPanningRef.current = true;
        return;
    }
    const worldPos = screenToWorld(coords.x, coords.y);

    if (tool === 'code') {
        onDrawStart();
        const newBlock: CodeBlockItem = {
            id: 'cb_' + Date.now() + '_' + Math.random().toString(36).substring(2, 6),
            x: Math.round(worldPos.x),
            y: Math.round(worldPos.y),
            width: 420,
            height: 180,
            title: '',
            code: '',
            output: undefined,
            isMinimized: false
        };
        const next = [...codeBlocksRef.current.filter(b => b.id !== newBlock.id), newBlock];
        codeBlocksRef.current = next;
        setCodeBlocks(next);
        pushHistory(strokesRef.current, next);
        setActiveCodeBlockId(newBlock.id);
        if (onCodeBlockCreated) onCodeBlockCreated(newBlock);
        if (onSelectTool) onSelectTool('cursor');
        return;
    }

    if (tool === 'text') {
        if ('button' in e && e.button !== 0) return;
        if (e.cancelable) e.preventDefault();

        // If clicking on board while an active text input exists
        if (activeTextInputRef.current) {
            if (activeTextInputRef.current.value.trim().length > 0) {
                handleFinishText();
            }
        }

        const initialTextState: TextInputState = {
            x: worldPos.x,
            y: worldPos.y,
            value: '',
            color,
            fontSize: strokeWidth * 4 + 12
        };
        textCreationTimeRef.current = Date.now();
        setActiveTextInput(initialTextState);
        activeTextInputRef.current = initialTextState;
        setCaretIndex(0);

        requestAnimationFrame(() => {
            textInputRef.current?.focus();
        });
        setTimeout(() => {
            textInputRef.current?.focus();
        }, 30);
        return;
    } else if (activeTextInputRef.current) {
        handleFinishText();
    }

    if (tool === 'eraser') {
        isDrawingRef.current = true;
        hasErasedRef.current = false;
        if (eraserFadeAnimRef.current) {
            cancelAnimationFrame(eraserFadeAnimRef.current);
            eraserFadeAnimRef.current = null;
        }
        eraserTrailOpacityRef.current = 1;
        eraserTrailRef.current = [worldPos];
        eraserCurrentPosRef.current = worldPos;
        onDrawStart();
        performErase(worldPos);
        render();
        return;
    }

    if (tool === 'cursor') {
        const selBox = getSelectionBounds();
        const scale = scaleRef.current || 1;

        // 1. If there is an active selection, test its handles and body FIRST
        if (selectedIndicesRef.current.size > 0 && selBox) {
            const allLocked = Array.from(selectedIndicesRef.current).every(i => strokesRef.current[i]?.isLocked);

            if (!allLocked) {
                // A. Check bottom-left rotation curved arrow
                const rotX = selBox.minX - 12 / scale;
                const rotY = selBox.maxY + 22 / scale;
                if (Math.hypot(worldPos.x - rotX, worldPos.y - rotY) <= 15 / scale) {
                    const startAngle = Math.atan2(worldPos.y - selBox.centerY, worldPos.x - selBox.centerX);
                    isRotatingGroupRef.current = {
                        startMouseAngle: startAngle,
                        center: { x: selBox.centerX, y: selBox.centerY },
                        initialStrokes: Array.from(selectedIndicesRef.current).map(idx => ({
                            index: idx,
                            stroke: {
                                ...strokesRef.current[idx],
                                points: strokesRef.current[idx].points.map(p => ({ ...p }))
                            }
                        }))
                    };
                    render();
                    return;
                }

                // B. Check corner resize handles
                const cornerRadius = 11 / scale;
                const corners: { type: 'nw' | 'ne' | 'se' | 'sw'; x: number; y: number }[] = [
                    { type: 'nw', x: selBox.minX, y: selBox.minY },
                    { type: 'ne', x: selBox.maxX, y: selBox.minY },
                    { type: 'se', x: selBox.maxX, y: selBox.maxY },
                    { type: 'sw', x: selBox.minX, y: selBox.maxY }
                ];
                const hitCorner = corners.find(c => Math.hypot(worldPos.x - c.x, worldPos.y - c.y) <= cornerRadius);
                if (hitCorner) {
                    const anchor = {
                        x: (hitCorner.type === 'nw' || hitCorner.type === 'sw') ? selBox.maxX : selBox.minX,
                        y: (hitCorner.type === 'nw' || hitCorner.type === 'ne') ? selBox.maxY : selBox.minY
                    };
                    isResizingGroupRef.current = {
                        handle: hitCorner.type,
                        anchor,
                        startBox: { ...selBox },
                        initialStrokes: Array.from(selectedIndicesRef.current).map(idx => ({
                            index: idx,
                            stroke: {
                                ...strokesRef.current[idx],
                                points: strokesRef.current[idx].points.map(p => ({ ...p }))
                            }
                        }))
                    };
                    render();
                    return;
                }
            }

            // C. Check top-right grip badge or anywhere inside selection box (core user requirement!)
            const gripX = selBox.maxX + 14 / scale;
            const gripY = selBox.minY - 2 / scale;
            const isOverGrip = Math.hypot(worldPos.x - gripX, worldPos.y - gripY) <= 13 / scale;
            const isInsideBox = worldPos.x >= selBox.minX && worldPos.x <= selBox.maxX &&
                               worldPos.y >= selBox.minY && worldPos.y <= selBox.maxY;

            if (isOverGrip || isInsideBox) {
                // User clicked inside selection frame or on grip badge!
                if (!allLocked) {
                    isDraggingSelectionRef.current = true;
                    isDrawingRef.current = true;
                    const newStrokes = [...strokesRef.current];
                    selectedIndicesRef.current.forEach((idx: number) => {
                        const s = newStrokes[idx];
                        if (s && !s.isLocked) {
                            newStrokes[idx] = { ...s, points: s.points.map(p => ({ ...p })) };
                        }
                    });
                    strokesRef.current = newStrokes;
                } else {
                    isDraggingSelectionRef.current = false;
                    isDrawingRef.current = false;
                }
                lastMousePosRef.current = coords;
                onDrawStart();
                render();
                return;
            }
        }

        // 2. User clicked outside active selection: check if clicking directly on another stroke
        let foundIndex = -1;
        for (let i = strokesRef.current.length - 1; i >= 0; i--) {
            if (hitTest(worldPos, strokesRef.current[i])) {
                foundIndex = i;
                break;
            }
        }

        if (foundIndex !== -1) {
            const isShift = (e as React.MouseEvent).shiftKey;
            if (isShift) {
                if (selectedIndicesRef.current.has(foundIndex)) {
                    selectedIndicesRef.current.delete(foundIndex);
                } else {
                    selectedIndicesRef.current.add(foundIndex);
                }
            } else {
                selectedIndicesRef.current.clear();
                selectedIndicesRef.current.add(foundIndex);
            }

            const stroke = strokesRef.current[foundIndex];
            setSelectedImageIndex(stroke?.tool === 'image' ? foundIndex : null);

            if (selectedIndicesRef.current.size === 1 && onShapeSelect) {
                 if (shapeTools.includes(stroke.tool) || stroke.tool === 'image' || stroke.tool === 'text') {
                    onShapeSelect(Math.round(stroke.width / PIXELS_PER_PERCENT));
                 } else onShapeSelect(null);
            } else if (onShapeSelect) onShapeSelect(null);

            if (stroke && stroke.isLocked) {
                isDraggingSelectionRef.current = false;
                isDrawingRef.current = false;
            } else {
                isDraggingSelectionRef.current = true;
                isDrawingRef.current = true;
                const newStrokes = [...strokesRef.current];
                selectedIndicesRef.current.forEach((idx: number) => {
                    newStrokes[idx] = { ...newStrokes[idx], points: newStrokes[idx].points.map(p => ({...p})) };
                });
                strokesRef.current = newStrokes;
            }
            lastMousePosRef.current = coords;
            onDrawStart();
            render();
        } else {
            // Clicked empty canvas: deselect and start marquee selection
            selectedIndicesRef.current.clear();
            setSelectedImageIndex(null);
            if (onShapeSelect) onShapeSelect(null);
            isSelectingRef.current = true;
            selectionStartRef.current = worldPos;
            selectionCurrentRef.current = worldPos;
            render();
        }
        return;
    }

    if (shapeTools.includes(tool)) {
        onDrawStart(); 
        const shapeStroke: Stroke = {
            id: `s_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
            points: [worldPos],
            color,
            width: shapeSize * PIXELS_PER_PERCENT,
            tool,
            updatedAt: Date.now()
        };
        strokesRef.current = [...strokesRef.current, shapeStroke];
        selectedIndicesRef.current.clear();
        selectedIndicesRef.current.add(strokesRef.current.length - 1);
        if (onShapeSelect) onShapeSelect(shapeSize);
        if (onStrokeAdded) onStrokeAdded(shapeStroke);
        if (onSelectTool) onSelectTool('cursor');
        pushHistory();
        render();
        return; 
    }

    isDrawingRef.current = true;
    onDrawStart();
    selectedIndicesRef.current.clear();
    const initialPoints = tool === 'dotted-line' ? [worldPos, worldPos] : [worldPos];
    currentStrokeRef.current = {
      id: `s_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      points: initialPoints,
      color,
      width: strokeWidth,
      tool,
      updatedAt: Date.now()
    };
    render();
  };

  const move = (e: React.MouseEvent | React.TouchEvent) => {
    const coords = getCoords(e);
    const worldPos = screenToWorld(coords.x, coords.y);

    if (isPanningRef.current && lastMousePosRef.current) {
       cameraRef.current.x += coords.x - lastMousePosRef.current.x;
       cameraRef.current.y += coords.y - lastMousePosRef.current.y;
       lastMousePosRef.current = coords;
       setCamTick(t => t + 1);
       requestRender(); return;
    }

    if (isRotatingGroupRef.current) {
        const { startMouseAngle, center, initialStrokes } = isRotatingGroupRef.current;
        const currentAngle = Math.atan2(worldPos.y - center.y, worldPos.x - center.x);
        let deltaAngle = currentAngle - startMouseAngle;

        const isShift = (e as React.MouseEvent).shiftKey;
        if (isShift) {
            const step = Math.PI / 12; // 15 degrees
            deltaAngle = Math.round(deltaAngle / step) * step;
        }

        const cos = Math.cos(deltaAngle);
        const sin = Math.sin(deltaAngle);

        initialStrokes.forEach(({ index, stroke: origStroke }) => {
            const s = strokesRef.current[index];
            if (!s || s.isLocked) return;

            if (shapeTools.includes(s.tool) || s.tool === 'image' || s.tool === 'text') {
                const origCenter = origStroke.points[0];
                if (origCenter) {
                    const dx = origCenter.x - center.x;
                    const dy = origCenter.y - center.y;
                    s.points = [{
                        x: center.x + (dx * cos - dy * sin),
                        y: center.y + (dx * sin + dy * cos)
                    }];
                }
                s.rotation = (origStroke.rotation || 0) + deltaAngle;
            } else {
                s.points = origStroke.points.map(p => {
                    const dx = p.x - center.x;
                    const dy = p.y - center.y;
                    return {
                        x: center.x + (dx * cos - dy * sin),
                        y: center.y + (dx * sin + dy * cos)
                    };
                });
            }
        });
        requestRender();
        return;
    }

    if (isResizingGroupRef.current) {
        const { handle, anchor, startBox, initialStrokes } = isResizingGroupRef.current;
        const origW = startBox.width || 1;
        const origH = startBox.height || 1;

        const curDistX = Math.abs(worldPos.x - anchor.x);
        const curDistY = Math.abs(worldPos.y - anchor.y);

        const factorX = curDistX / origW;
        const factorY = curDistY / origH;
        const factor = Math.max(0.08, Math.max(factorX, factorY));

        const isShift = (e as React.MouseEvent).shiftKey;
        const effScaleX = Math.max(0.08, isShift ? factorX : factor);
        const effScaleY = Math.max(0.08, isShift ? factorY : factor);

        initialStrokes.forEach(({ index, stroke: origStroke }) => {
            const s = strokesRef.current[index];
            if (!s || s.isLocked) return;

            if (shapeTools.includes(s.tool) || s.tool === 'image' || s.tool === 'text') {
                const origCenter = origStroke.points[0];
                if (origCenter) {
                    s.points = [{
                        x: anchor.x + (origCenter.x - anchor.x) * effScaleX,
                        y: anchor.y + (origCenter.y - anchor.y) * effScaleY
                    }];
                }
                s.width = Math.max(10, Math.round(origStroke.width * effScaleX));
                if (origStroke.height) {
                    s.height = Math.max(10, Math.round(origStroke.height * effScaleY));
                }
            } else {
                s.points = origStroke.points.map(p => ({
                    x: anchor.x + (p.x - anchor.x) * effScaleX,
                    y: anchor.y + (p.y - anchor.y) * effScaleY
                }));
                s.width = Math.max(1, Math.min(60, origStroke.width * ((effScaleX + effScaleY) / 2)));
            }
        });
        requestRender();
        return;
    }

    if (isRotatingRef.current) {
        const { strokeIndex, startMouseAngle, startRotation, center } = isRotatingRef.current;
        const stroke = strokesRef.current[strokeIndex];
        if (stroke) {
            const worldPos = screenToWorld(coords.x, coords.y);
            const currentAngle = Math.atan2(worldPos.y - center.y, worldPos.x - center.x);
            const deltaAngle = currentAngle - startMouseAngle;
            let newRotation = startRotation + deltaAngle;

            const isShift = (e as React.MouseEvent).shiftKey;
            if (isShift) {
                const step = Math.PI / 12; // 15 degrees
                newRotation = Math.round(newRotation / step) * step;
            } else {
                const snapThreshold = 3.5 * (Math.PI / 180);
                const cardinals = [0, Math.PI / 2, Math.PI, -Math.PI / 2, -Math.PI, 2 * Math.PI];
                for (const card of cardinals) {
                    if (Math.abs(newRotation - card) < snapThreshold) {
                        newRotation = card;
                        break;
                    }
                }
            }
            stroke.rotation = newRotation;
            requestRender();
        }
        return;
    }

    if (isResizingShapeRef.current) {
        const { strokeIndex, handle, startCenter, startWidth, startHeight, rotation, aspectRatio } = isResizingShapeRef.current;
        const stroke = strokesRef.current[strokeIndex];
        if (stroke) {
            const worldPos = screenToWorld(coords.x, coords.y);
            const dx = worldPos.x - startCenter.x;
            const dy = worldPos.y - startCenter.y;
            const cos = Math.cos(-rotation);
            const sin = Math.sin(-rotation);
            const lx = dx * cos - dy * sin;
            const ly = dx * sin + dy * cos;

            let newWidth = startWidth;
            let newHeight = startHeight;

            if (handle === 'e' || handle === 'w') {
                newWidth = Math.max(20, Math.round(Math.abs(lx) * 2));
                if (stroke.tool === 'image') {
                    newHeight = Math.round(newWidth * aspectRatio);
                } else {
                    newHeight = newWidth;
                }
            } else if (handle === 'n' || handle === 's') {
                newHeight = Math.max(20, Math.round(Math.abs(ly) * 2));
                if (stroke.tool === 'image') {
                    newWidth = Math.round(newHeight / (aspectRatio || 1));
                } else {
                    newWidth = newHeight;
                }
            } else {
                const currentDist = Math.hypot(lx, ly);
                const startDist = Math.hypot(startWidth / 2, startHeight / 2) || 1;
                const scaleFactor = currentDist / startDist;
                newWidth = Math.max(20, Math.round(startWidth * scaleFactor));
                if (stroke.tool === 'image') {
                    newHeight = Math.round(newWidth * aspectRatio);
                } else {
                    newHeight = newWidth;
                }
            }

            stroke.width = newWidth;
            stroke.height = newHeight;
            if (onShapeSelect && (shapeTools.includes(stroke.tool) || stroke.tool === 'image')) {
                onShapeSelect(Math.round(newWidth / PIXELS_PER_PERCENT));
            }
            requestRender();
        }
        return;
    }


    if (tool === 'eraser') {
        eraserCurrentPosRef.current = worldPos;
        if (isDrawingRef.current) {
            const trail = eraserTrailRef.current;
            const lastPt = trail.length > 0 ? trail[trail.length - 1] : null;
            if (!lastPt || Math.hypot(worldPos.x - lastPt.x, worldPos.y - lastPt.y) >= 2) {
                if (lastPt) {
                    const dist = Math.hypot(worldPos.x - lastPt.x, worldPos.y - lastPt.y);
                    const stepSize = Math.max(6, eraserWidth / 3);
                    const steps = Math.floor(dist / stepSize);
                    for (let s = 1; s <= steps; s++) {
                        const t = s / (steps + 1);
                        performErase({
                            x: lastPt.x + (worldPos.x - lastPt.x) * t,
                            y: lastPt.y + (worldPos.y - lastPt.y) * t
                        });
                    }
                }
                trail.push(worldPos);

                // Enforce maximum length limit: tail follows its exact trajectory
                const scale = scaleRef.current || 1;
                const maxTrailLength = Math.max(180 / scale, eraserWidth * 3.5);
                trimTrailToMaxLength(trail, maxTrailLength);
            }
            performErase(worldPos);
            requestRender();
            return;
        } else {
            requestRender();
            return;
        }
    }
    if (isSelectingRef.current) {
        selectionCurrentRef.current = screenToWorld(coords.x, coords.y);
        requestRender(); return;
    }
    if (tool === 'cursor' && isDraggingSelectionRef.current && lastMousePosRef.current) {
        const worldPos = screenToWorld(coords.x, coords.y);
        const lastWorldPos = screenToWorld(lastMousePosRef.current.x, lastMousePosRef.current.y);
        const dx = worldPos.x - lastWorldPos.x;
        const dy = worldPos.y - lastWorldPos.y;
        selectedIndicesRef.current.forEach((idx: number) => {
            const stroke = strokesRef.current[idx];
            if (stroke && !stroke.isLocked) stroke.points.forEach(p => { p.x += dx; p.y += dy; });
        });
        requestRender(); lastMousePosRef.current = coords; return;
    }
    if (isDrawingRef.current && currentStrokeRef.current) {
        if (e.cancelable) e.preventDefault();
        const worldPos = screenToWorld(coords.x, coords.y);
        const isShift = (e as React.MouseEvent).shiftKey;
        const startPos = currentStrokeRef.current.points[0];
        if (currentStrokeRef.current.tool === 'dotted-line' || (currentStrokeRef.current.tool === 'pen' && isShift)) {
             const targetPos = isShift ? snapToAngle(startPos, worldPos) : worldPos;
             currentStrokeRef.current.points = [startPos, targetPos];
        } else {
             const pts = currentStrokeRef.current.points;
             const lastPt = pts[pts.length - 1];
             const scale = scaleRef.current || 1;
             // Distance threshold in world coordinates (~1 screen pixel) to drop sub-pixel jitter
             const minDistance = 1.0 / scale;
             if ((worldPos.x - lastPt.x) ** 2 + (worldPos.y - lastPt.y) ** 2 >= minDistance * minDistance) {
                 pts.push(worldPos);
             }
        }
        requestRender();
    }

    // Hover cursor feedback in cursor mode when not interacting
    if (tool === 'cursor' && !isDraggingSelectionRef.current && !isSelectingRef.current && !isRotatingGroupRef.current && !isResizingGroupRef.current && !isRotatingRef.current && !isResizingShapeRef.current) {
        const worldPos = screenToWorld(coords.x, coords.y);
        const scale = scaleRef.current || 1;
        let hoveredTarget: { strokeIndex: number; handle: string; cursor: string } | null = null;

        // 1. Check selection frame handles & body first if active
        if (selectedIndicesRef.current.size > 0) {
            const selBox = getSelectionBounds();
            if (selBox) {
                const rotX = selBox.minX - 12 / scale;
                const rotY = selBox.maxY + 22 / scale;
                if (Math.hypot(worldPos.x - rotX, worldPos.y - rotY) <= 15 / scale) {
                    hoveredTarget = { strokeIndex: -1, handle: 'group-rot', cursor: 'grab' };
                } else {
                    const cornerRadius = 11 / scale;
                    if (Math.hypot(worldPos.x - selBox.minX, worldPos.y - selBox.minY) <= cornerRadius) {
                        hoveredTarget = { strokeIndex: -1, handle: 'group-nw', cursor: 'nwse-resize' };
                    } else if (Math.hypot(worldPos.x - selBox.maxX, worldPos.y - selBox.minY) <= cornerRadius) {
                        hoveredTarget = { strokeIndex: -1, handle: 'group-ne', cursor: 'nesw-resize' };
                    } else if (Math.hypot(worldPos.x - selBox.maxX, worldPos.y - selBox.maxY) <= cornerRadius) {
                        hoveredTarget = { strokeIndex: -1, handle: 'group-se', cursor: 'nwse-resize' };
                    } else if (Math.hypot(worldPos.x - selBox.minX, worldPos.y - selBox.maxY) <= cornerRadius) {
                        hoveredTarget = { strokeIndex: -1, handle: 'group-sw', cursor: 'nesw-resize' };
                    } else {
                        const gripX = selBox.maxX + 14 / scale;
                        const gripY = selBox.minY - 2 / scale;
                        if (Math.hypot(worldPos.x - gripX, worldPos.y - gripY) <= 13 / scale) {
                            hoveredTarget = { strokeIndex: -1, handle: 'group-grip', cursor: 'grab' };
                        } else if (worldPos.x >= selBox.minX && worldPos.x <= selBox.maxX &&
                                   worldPos.y >= selBox.minY && worldPos.y <= selBox.maxY) {
                            hoveredTarget = { strokeIndex: -1, handle: 'group-body', cursor: 'move' };
                        }
                    }
                }
            }
        }

        // 2. If not over selection frame, check strokes on canvas
        if (!hoveredTarget) {
            for (let i = strokesRef.current.length - 1; i >= 0; i--) {
                const s = strokesRef.current[i];
                if (shapeTools.includes(s.tool) || s.tool === 'image' || s.tool === 'text') {
                    const target = getHandleOrBorderAtPoint(worldPos, s);
                    if (target) {
                        hoveredTarget = { strokeIndex: i, handle: target.type, cursor: target.cursor };
                        break;
                    }
                } else if (hitTest(worldPos, s)) {
                    hoveredTarget = { strokeIndex: i, handle: 'body', cursor: 'move' };
                    break;
                }
            }
        }

        const prevHovered = hoveredBorderRef.current;
        hoveredBorderRef.current = hoveredTarget;
        if (canvasRef.current) {
            canvasRef.current.style.cursor = hoveredTarget ? hoveredTarget.cursor : 'default';
        }
        if ((prevHovered?.strokeIndex !== hoveredTarget?.strokeIndex) || (prevHovered?.handle !== hoveredTarget?.handle)) {
            requestRender();
        }
    }

    if (!isPanningRef.current) lastMousePosRef.current = coords;
  };

  const endDrawing = () => {
    if (isPanningRef.current) { isPanningRef.current = false; return; }
    if (isRotatingGroupRef.current) {
        selectedIndicesRef.current.forEach((idx: number) => {
            if (strokesRef.current[idx]) strokesRef.current[idx].updatedAt = Date.now();
        });
        isRotatingGroupRef.current = null;
        pushHistory();
        render();
        return;
    }
    if (isResizingGroupRef.current) {
        selectedIndicesRef.current.forEach((idx: number) => {
            if (strokesRef.current[idx]) strokesRef.current[idx].updatedAt = Date.now();
        });
        isResizingGroupRef.current = null;
        pushHistory();
        render();
        return;
    }
    if (isRotatingRef.current) {
        const { strokeIndex } = isRotatingRef.current;
        if (strokesRef.current[strokeIndex]) {
          strokesRef.current[strokeIndex].updatedAt = Date.now();
        }
        isRotatingRef.current = null;
        pushHistory();
        render();
        return;
    }
    if (isResizingShapeRef.current) {
        const { strokeIndex } = isResizingShapeRef.current;
        if (strokesRef.current[strokeIndex]) {
          strokesRef.current[strokeIndex].updatedAt = Date.now();
        }
        isResizingShapeRef.current = null;
        pushHistory();
        render();
        return;
    }

    if (tool === 'eraser' && isDrawingRef.current) {
        isDrawingRef.current = false;
        if (hasErasedRef.current) pushHistory();
        startEraserTrailFade();
        return;
    }
    if (isSelectingRef.current && selectionStartRef.current && selectionCurrentRef.current) {
        isSelectingRef.current = false;
        const start = selectionStartRef.current;
        const curr = selectionCurrentRef.current;
        const selBox = { minX: Math.min(start.x, curr.x), minY: Math.min(start.y, curr.y), maxX: Math.max(start.x, curr.x), maxY: Math.max(start.y, curr.y) };
        selectedIndicesRef.current.clear();
        strokesRef.current.forEach((stroke, index) => { if (checkIntersection(selBox, getBoundingBox(stroke))) selectedIndicesRef.current.add(index); });
        if (selectedIndicesRef.current.size === 1) {
            const [onlyIdx] = Array.from(selectedIndicesRef.current) as number[];
            const s = strokesRef.current[onlyIdx];
            setSelectedImageIndex(s?.tool === 'image' ? onlyIdx : null);
        } else {
            setSelectedImageIndex(null);
        }
        selectionStartRef.current = null; selectionCurrentRef.current = null;
        render(); return;
    }
    if (tool === 'cursor' && isDraggingSelectionRef.current) {
        isDraggingSelectionRef.current = false;
        isDrawingRef.current = false;
        selectedIndicesRef.current.forEach((idx: number) => {
            const stroke = strokesRef.current[idx];
            if (stroke) stroke.updatedAt = Date.now();
        });
        pushHistory();
        render();
        return;
    }
    if (isDrawingRef.current && currentStrokeRef.current) {
        isDrawingRef.current = false;
        let finalPoints = currentStrokeRef.current.points;
        if (currentStrokeRef.current.tool === 'pen' && finalPoints.length > 2) {
            const scale = scaleRef.current || 1;
            const tolerance = Math.max(0.4, 0.7 / scale);
            finalPoints = simplifyPoints(finalPoints, tolerance);
            // Precision rounding to 1 decimal place reduces memory representation & JSON footprint
            finalPoints = finalPoints.map(p => ({
                x: Math.round(p.x * 10) / 10,
                y: Math.round(p.y * 10) / 10
            }));
        }
        const finishedStroke: Stroke = {
          ...currentStrokeRef.current,
          points: finalPoints,
          id: currentStrokeRef.current.id || `s_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
          updatedAt: Date.now()
        };
        strokesRef.current = [...strokesRef.current, finishedStroke];
        currentStrokeRef.current = null;
        if (onStrokeAdded) onStrokeAdded(finishedStroke);
        pushHistory(); 
        render();
    }
  };

  const hitTest = (point: Point, stroke: Stroke): boolean => {
    const rot = stroke.rotation || 0;
    let localPoint = point;
    const { w, h } = getStrokeBounds(stroke);
    const center = (shapeTools.includes(stroke.tool) || stroke.tool === 'image')
      ? stroke.points[0]
      : (stroke.tool === 'text'
        ? { x: (stroke.points[0]?.x || 0) + w / 2, y: (stroke.points[0]?.y || 0) + h / 2 }
        : { x: (getBoundingBox(stroke).minX + getBoundingBox(stroke).maxX) / 2, y: (getBoundingBox(stroke).minY + getBoundingBox(stroke).maxY) / 2 });

    if (rot !== 0 && center) {
      const dx = point.x - center.x;
      const dy = point.y - center.y;
      const cos = Math.cos(-rot);
      const sin = Math.sin(-rot);
      localPoint = {
        x: center.x + (dx * cos - dy * sin),
        y: center.y + (dx * sin + dy * cos)
      };
    }

    if (shapeTools.includes(stroke.tool) || stroke.tool === 'image') {
      if (!stroke.points[0]) return false;
      const scale = scaleRef.current || 1;
      const hw = w / 2 + 5 / scale;
      const hh = h / 2 + 5 / scale;
      return Math.abs(localPoint.x - stroke.points[0].x) <= hw && Math.abs(localPoint.y - stroke.points[0].y) <= hh;
    }
    if (stroke.tool === 'text') {
      const p = stroke.points[0];
      if (!p) return false;
      return localPoint.x >= p.x && localPoint.x <= p.x + w && localPoint.y >= p.y && localPoint.y <= p.y + h;
    }
    if (stroke.tool === 'pen' || stroke.tool === 'dotted-line') {
      const bounds = getBoundingBox(stroke);
      const threshold = Math.max(10, stroke.width / 2 + 5); 
      if (localPoint.x < bounds.minX - threshold || localPoint.x > bounds.maxX + threshold || localPoint.y < bounds.minY - threshold || localPoint.y > bounds.maxY + threshold) return false;
      if (stroke.tool === 'dotted-line' && stroke.points.length >= 2) return distanceToSegment(localPoint, stroke.points[0], stroke.points[stroke.points.length - 1]) <= threshold;
      for (let i = 0; i < stroke.points.length - 1; i++) {
        if (distanceToSegment(localPoint, stroke.points[i], stroke.points[i+1]) <= threshold) return true;
      }
    }
    return false; 
  };

  const drawGrid = (ctx: CanvasRenderingContext2D) => {
    const canvas = canvasRef.current; if (!canvas) return;
    const gridSize = 20, majorGridStep = 5, cam = cameraRef.current, scale = scaleRef.current;
    const left = (0 - cam.x) / scale, top = (0 - cam.y) / scale, right = (canvas.width - cam.x) / scale, bottom = (canvas.height - cam.y) / scale;
    const startX = Math.floor(left / gridSize) * gridSize, startY = Math.floor(top / gridSize) * gridSize;
    ctx.save(); ctx.lineWidth = 1 / scale;
    for (let x = startX; x < right; x += gridSize) {
        ctx.beginPath(); const isMajor = x % (gridSize * majorGridStep) === 0;
        ctx.strokeStyle = isDarkMode 
            ? (isMajor ? '#3f3f46' : '#27272a') 
            : (isMajor ? '#cbd5e1' : '#f1f5f9');
        if (x === 0) ctx.strokeStyle = isDarkMode ? '#71717a' : '#94a3b8';
        ctx.lineWidth = (isMajor || x === 0) ? (2 / scale) : (1 / scale);
        ctx.moveTo(x, top); ctx.lineTo(x, bottom); ctx.stroke();
    }
    for (let y = startY; y < bottom; y += gridSize) {
        ctx.beginPath(); const isMajor = y % (gridSize * majorGridStep) === 0;
        ctx.strokeStyle = isDarkMode 
            ? (isMajor ? '#3f3f46' : '#27272a') 
            : (isMajor ? '#cbd5e1' : '#f1f5f9');
        if (y === 0) ctx.strokeStyle = isDarkMode ? '#71717a' : '#94a3b8';
        ctx.lineWidth = (isMajor || y === 0) ? (2 / scale) : (1 / scale);
        ctx.moveTo(left, y); ctx.lineTo(right, y); ctx.stroke();
    }
    ctx.restore();
  };

  const distanceToSegment = (p: Point, v: Point, w: Point) => {
    const l2 = (v.x - w.x) ** 2 + (v.y - w.y) ** 2;
    if (l2 === 0) return Math.sqrt((p.x - v.x) ** 2 + (p.y - v.y) ** 2);
    let t = Math.max(0, Math.min(1, ((p.x - v.x) * (w.x - v.x) + (p.y - v.y) * (w.y - v.y)) / l2));
    return Math.sqrt((p.x - (v.x + t * (w.x - v.x))) ** 2 + (p.y - (v.y + t * (w.y - v.y))) ** 2);
  };

  const checkIntersection = (b1: any, b2: any) => (b1.minX < b2.maxX && b1.maxX > b2.minX && b1.minY < b2.maxY && b1.maxY > b2.minY);

  const performErase = (p: Point) => {
      let erased = false;
      const radius = eraserWidth / 2;

      for (let i = strokesRef.current.length - 1; i >= 0; i--) {
          const s = strokesRef.current[i];
          if (s.isLocked || s.tool === 'image') continue; // Locked objects and images CANNOT be erased!
          let hit = false;

          if (shapeTools.includes(s.tool) || s.tool === 'text') {
              hit = hitTest(p, s);
          } else if (s.tool === 'dotted-line') {
              if (s.points.length === 0) {
                  hit = false;
              } else if (s.points.length === 1) {
                  hit = Math.hypot(p.x - s.points[0].x, p.y - s.points[0].y) <= radius + Math.max(s.width / 2, 6);
              } else {
                  const rot = s.rotation || 0;
                  let checkP = p;
                  if (rot !== 0) {
                      const bounds = getBoundingBox(s);
                      const center = { x: (bounds.minX + bounds.maxX) / 2, y: (bounds.minY + bounds.maxY) / 2 };
                      const dx = p.x - center.x;
                      const dy = p.y - center.y;
                      const cos = Math.cos(-rot);
                      const sin = Math.sin(-rot);
                      checkP = { x: center.x + (dx * cos - dy * sin), y: center.y + (dx * sin + dy * cos) };
                  }
                  hit = distanceToSegment(checkP, s.points[0], s.points[s.points.length - 1]) <= radius + Math.max(s.width / 2, 6);
              }
          } else if (s.tool === 'pen') {
              if (s.points.length === 0) {
                  hit = false;
              } else if (s.points.length === 1) {
                  hit = Math.hypot(p.x - s.points[0].x, p.y - s.points[0].y) <= radius + Math.max(s.width / 2, 6);
              } else {
                  const rot = s.rotation || 0;
                  let checkP = p;
                  if (rot !== 0) {
                      const bounds = getBoundingBox(s);
                      const center = { x: (bounds.minX + bounds.maxX) / 2, y: (bounds.minY + bounds.maxY) / 2 };
                      const dx = p.x - center.x;
                      const dy = p.y - center.y;
                      const cos = Math.cos(-rot);
                      const sin = Math.sin(-rot);
                      checkP = { x: center.x + (dx * cos - dy * sin), y: center.y + (dx * sin + dy * cos) };
                  }
                  const threshold = radius + Math.max(s.width / 2, 6);
                  for (let j = 0; j < s.points.length - 1; j++) {
                      if (distanceToSegment(checkP, s.points[j], s.points[j + 1]) <= threshold) {
                          hit = true;
                          break;
                      }
                  }
              }
          }

          if (hit) {
              strokesRef.current.splice(i, 1);
              erased = true;
          }
      }

      if (erased) {
          hasErasedRef.current = true;
          render();
      }
  };

  const getCoords = (e: any): Point => {
    const ev = e.touches ? e.touches[0] : e;
    return { x: ev.clientX, y: ev.clientY };
  };

  const pushHistory = (newStrokes: Stroke[] = strokesRef.current, newBlocks: CodeBlockItem[] = codeBlocksRef.current, syncRemote: boolean = true) => {
      const newHistory = historyRef.current.slice(0, historyStepRef.current + 1);
      newHistory.push({
          strokes: [...newStrokes],
          codeBlocks: newBlocks.map(b => ({ ...b }))
      });
      // Cap history to MAX_HISTORY_STEPS to prevent unbounded memory growth over long sessions
      if (newHistory.length > MAX_HISTORY_STEPS) {
          newHistory.splice(0, newHistory.length - MAX_HISTORY_STEPS);
      }
      historyRef.current = newHistory; 
      historyStepRef.current = newHistory.length - 1;
      onHistoryChange(historyStepRef.current > 0, false);
      if (syncRemote && onStrokesChanged) {
        onStrokesChanged(newStrokes);
      }
  };

  // Listen to window pointer movements when dragging/resizing code block
  useEffect(() => {
    let animFrameId: number | null = null;
    let pendingDrag: { blockId: string; x: number; y: number } | null = null;
    let pendingResize: { blockId: string; width: number; height: number } | null = null;

    const handlePointerMove = (e: PointerEvent | MouseEvent) => {
      if (blockDragRef.current) {
        const { blockId, startMouseX, startMouseY, startBlockX, startBlockY } = blockDragRef.current;
        const currentScale = scaleRef.current || 1;
        const dx = (e.clientX - startMouseX) / currentScale;
        const dy = (e.clientY - startMouseY) / currentScale;
        const newX = Math.round(startBlockX + dx);
        const newY = Math.round(startBlockY + dy);

        // Instantaneous direct hardware transform for zero-latency dragging
        const el = document.getElementById(`python-code-block-${blockId}`);
        if (el) {
          const screenPos = worldToScreen(newX, newY);
          el.style.transform = `translate3d(${screenPos.x}px, ${screenPos.y}px, 0) scale(${currentScale})`;
        }

        pendingDrag = { blockId, x: newX, y: newY };
        if (animFrameId === null) {
          animFrameId = requestAnimationFrame(() => {
            animFrameId = null;
            if (pendingDrag) {
              const { blockId: bId, x: finalX, y: finalY } = pendingDrag;
              const next = codeBlocksRef.current.map(b => b.id === bId ? { ...b, x: finalX, y: finalY } : b);
              codeBlocksRef.current = next;
              setCodeBlocks(next);
              pendingDrag = null;
            }
          });
        }
      } else if (blockResizeRef.current) {
        const { blockId, startMouseX, startMouseY, startWidth, startHeight } = blockResizeRef.current;
        const currentScale = scaleRef.current || 1;
        const dw = (e.clientX - startMouseX) / currentScale;
        const dh = (e.clientY - startMouseY) / currentScale;
        const newW = Math.max(260, Math.round(startWidth + dw));
        const newH = Math.max(140, Math.round(startHeight + dh));

        pendingResize = { blockId, width: newW, height: newH };
        if (animFrameId === null) {
          animFrameId = requestAnimationFrame(() => {
            animFrameId = null;
            if (pendingResize) {
              const { blockId: bId, width: finalW, height: finalH } = pendingResize;
              const next = codeBlocksRef.current.map(b => b.id === bId ? { ...b, width: finalW, height: finalH } : b);
              codeBlocksRef.current = next;
              setCodeBlocks(next);
              pendingResize = null;
            }
          });
        }
      }
    };

    const handlePointerUp = () => {
      if (animFrameId !== null) {
        cancelAnimationFrame(animFrameId);
        animFrameId = null;
      }
      if (pendingDrag) {
        const { blockId: bId, x: newX, y: newY } = pendingDrag;
        const next = codeBlocksRef.current.map(b => b.id === bId ? { ...b, x: newX, y: newY } : b);
        codeBlocksRef.current = next;
        setCodeBlocks(next);
        pendingDrag = null;
      }
      if (pendingResize) {
        const { blockId: bId, width: newW, height: newH } = pendingResize;
        const next = codeBlocksRef.current.map(b => b.id === bId ? { ...b, width: newW, height: newH } : b);
        codeBlocksRef.current = next;
        setCodeBlocks(next);
        pendingResize = null;
      }
      if (blockDragRef.current || blockResizeRef.current) {
        blockDragRef.current = null;
        blockResizeRef.current = null;
        pushHistory();
      }
    };

    window.addEventListener('pointermove', handlePointerMove, { passive: true });
    window.addEventListener('pointerup', handlePointerUp);
    return () => {
      if (animFrameId !== null) cancelAnimationFrame(animFrameId);
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('pointerup', handlePointerUp);
    };
  }, []);

  // React to shapeSize changes for selected items
  useEffect(() => {
    if (selectedIndicesRef.current.size === 1) {
        // FIXED: Using array destructuring and checking for defined number to avoid index errors
        const [index] = Array.from(selectedIndicesRef.current) as number[];
        if (typeof index === 'number') {
            const stroke = strokesRef.current[index];
            if (stroke && (shapeTools.includes(stroke.tool) || stroke.tool === 'image' || stroke.tool === 'text')) {
                const newWidth = shapeSize * PIXELS_PER_PERCENT;
                if (stroke.width !== newWidth) {
                    const newStrokes = [...strokesRef.current];
                    newStrokes[index] = { ...stroke, width: newWidth };
                    strokesRef.current = newStrokes;
                    render();
                }
            }
        }
    }
  }, [shapeSize, render]);

  // Handle Resize and Initial Setup
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const handleResize = () => {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
      render();
    };

    window.addEventListener('resize', handleResize);
    handleResize(); // Initial setup

    return () => window.removeEventListener('resize', handleResize);
  }, [render]);

  // Handle Wheel Events
  useEffect(() => {
    const canvas = canvasRef.current;
    if (canvas) {
      const handleWheel = (e: WheelEvent) => {
        e.preventDefault(); const mouseX = e.clientX, mouseY = e.clientY, cam = cameraRef.current, oldScale = scaleRef.current;
        const worldX = (mouseX - cam.x) / oldScale, worldY = (mouseY - cam.y) / oldScale;
        const scaleFactor = Math.pow(1.001, -e.deltaY);
        let newScale = Math.max(0.01, Math.min(oldScale * scaleFactor, 4.0));
        cam.x = mouseX - worldX * newScale; cam.y = mouseY - worldY * newScale;
        scaleRef.current = newScale; 
        setCamTick(t => t + 1);
        render(); 
        if (onZoomChange) onZoomChange(newScale);
      };
      canvas.addEventListener('wheel', handleWheel, { passive: false });
      return () => canvas.removeEventListener('wheel', handleWheel);
    }
  }, [render, onZoomChange]);

  useEffect(() => {
    if (triggerUndo > prevUndoTrigger.current) {
        prevUndoTrigger.current = triggerUndo;
        if (historyStepRef.current > 0) {
            historyStepRef.current -= 1; 
            const step = historyRef.current[historyStepRef.current];
            strokesRef.current = step.strokes;
            setCodeBlocks(step.codeBlocks || []);
            selectedIndicesRef.current.clear(); 
            onHistoryChange(historyStepRef.current > 0, true); 
            render();
            if (onStrokesChanged) onStrokesChanged(step.strokes);
        }
    }
    if (triggerRedo > prevRedoTrigger.current) {
        prevRedoTrigger.current = triggerRedo;
        if (historyStepRef.current < historyRef.current.length - 1) {
            historyStepRef.current += 1; 
            const step = historyRef.current[historyStepRef.current];
            strokesRef.current = step.strokes;
            setCodeBlocks(step.codeBlocks || []);
            selectedIndicesRef.current.clear(); 
            onHistoryChange(true, historyStepRef.current < historyRef.current.length - 1); 
            render();
            if (onStrokesChanged) onStrokesChanged(step.strokes);
        }
    }
  }, [triggerUndo, triggerRedo, render, onHistoryChange]);

  const getCursorStyle = () => {
    if (tool === 'code') return 'cursor-code';
    if (shapeTools.includes(tool) || tool === 'dotted-line' || tool === 'text') return 'cursor-crosshair';
    if (tool === 'pen') return 'cursor-pen';
    if (tool === 'eraser') return 'cursor-eraser';
    return 'cursor-default';
  };

  const handleToggleLock = useCallback(() => {
    if (selectedImageIndex === null) return;
    const stroke = strokesRef.current[selectedImageIndex];
    if (!stroke || stroke.tool !== 'image') return;
    const nextLocked = !stroke.isLocked;

    strokesRef.current = strokesRef.current.map((s, idx) => {
      if (idx === selectedImageIndex) {
        return {
          ...s,
          isLocked: nextLocked,
          updatedAt: Date.now()
        };
      }
      return s;
    });

    if (nextLocked) {
      isDraggingSelectionRef.current = false;
      isDrawingRef.current = false;
    }

    pushHistory();
    render();
    setCamTick(t => t + 1);
  }, [selectedImageIndex, render]);

  let selectedImageOverlay: {
    x: number;
    y: number;
    isLocked: boolean;
  } | null = null;

  if (selectedImageIndex !== null && strokesRef.current[selectedImageIndex]) {
    const stroke = strokesRef.current[selectedImageIndex];
    if (stroke && stroke.tool === 'image') {
      const bounds = getBoundingBox(stroke);
      const topCenterX = (bounds.minX + bounds.maxX) / 2;
      const topCenterY = bounds.minY;
      const screenPos = worldToScreen(topCenterX, topCenterY);
      // Leave space for rotation knob when unlocked
      const offsetY = stroke.isLocked ? 12 : Math.max(38, Math.round(36 * (scaleRef.current || 1)));
      selectedImageOverlay = {
        x: screenPos.x,
        y: screenPos.y - offsetY,
        isLocked: !!stroke.isLocked,
      };
    }
  }

  const inputScreenPos = activeTextInput ? worldToScreen(activeTextInput.x, activeTextInput.y) : { x: 0, y: 0 };

  return (
    <div 
      ref={containerRef} 
      className={`absolute inset-0 z-0 ${isDarkMode ? 'bg-[#18181b]' : 'bg-[#f0f2f5]'} transition-colors duration-300 overflow-hidden ${getCursorStyle()}`} 
      onContextMenu={(e) => e.preventDefault()}
      onClick={() => {
        // Clicking on empty whiteboard canvas area deselects active code block
        if (activeCodeBlockIdRef.current) {
          setActiveCodeBlockId(null);
        }
      }}
    >
      <canvas 
        ref={canvasRef} 
        onMouseDown={startDrawing} 
        onMouseMove={move} 
        onMouseUp={endDrawing} 
        onMouseLeave={handleMouseLeave} 
        onTouchStart={startDrawing} 
        onTouchMove={move} 
        onTouchEnd={() => { 
          eraserCurrentPosRef.current = null; 
          endDrawing(); 
        }} 
        className="block touch-none" 
      />
      
      {/* Code Blocks Overlays */}
      {codeBlocks.map((block) => {
        const screenPos = worldToScreen(block.x, block.y);
        return (
          <PythonCodeBlock
            key={block.id}
            block={block}
            scale={scaleRef.current}
            screenPos={screenPos}
            isDarkMode={isDarkMode}
            isActive={activeCodeBlockId === block.id}
            onFocus={() => setActiveCodeBlockId(block.id)}
            onDragStart={(e) => {
              if ('button' in e && e.button !== 0) return;
              e.stopPropagation();
              const coords = 'touches' in e ? e.touches[0] : e;
              blockDragRef.current = {
                blockId: block.id,
                startMouseX: coords.clientX,
                startMouseY: coords.clientY,
                startBlockX: block.x,
                startBlockY: block.y
              };
              setActiveCodeBlockId(block.id);
            }}
            onResizeStart={(e) => {
              if ('button' in e && e.button !== 0) return;
              e.stopPropagation();
              const coords = 'touches' in e ? e.touches[0] : e;
              blockResizeRef.current = {
                blockId: block.id,
                startMouseX: coords.clientX,
                startMouseY: coords.clientY,
                startWidth: block.width,
                startHeight: block.height || 240
              };
              setActiveCodeBlockId(block.id);
            }}
            onUpdate={(updated) => {
              const fullUpdated = { ...block, ...updated };
              setCodeBlocks(prev => {
                const next = prev.map(b => b.id === block.id ? fullUpdated : b);
                codeBlocksRef.current = next;
                return next;
              });
              if (onCodeBlockUpdated) onCodeBlockUpdated(fullUpdated);
            }}
            onDelete={() => {
              setCodeBlocks(prev => {
                const next = prev.filter(b => b.id !== block.id);
                codeBlocksRef.current = next;
                pushHistory(strokesRef.current, next);
                return next;
              });
              if (onCodeBlockDeleted) onCodeBlockDeleted(block.id);
              if (activeCodeBlockIdRef.current === block.id) {
                setActiveCodeBlockId(null);
              }
            }}
          />
        );
      })}



      {/* Floating Lock/Pin button for selected image */}
      {selectedImageOverlay && (
        <div
          className="absolute z-30 pointer-events-auto flex items-center justify-center transition-all duration-150 animate-in fade-in zoom-in-95"
          style={{
            left: `${selectedImageOverlay.x}px`,
            top: `${selectedImageOverlay.y}px`,
            transform: 'translate(-50%, -100%)',
          }}
          onMouseDown={(e) => e.stopPropagation()}
          onClick={(e) => e.stopPropagation()}
        >
          <button
            type="button"
            onClick={handleToggleLock}
            title={selectedImageOverlay.isLocked ? 'Открепить объект' : 'Закрепить объект'}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg shadow-lg border transition-all duration-150 cursor-pointer select-none backdrop-blur-md active:scale-95 ${
              selectedImageOverlay.isLocked
                ? 'bg-amber-500/15 border-amber-500/40 text-amber-600 dark:text-amber-400 dark:bg-amber-500/20 hover:bg-amber-500/25'
                : isDarkMode
                ? 'bg-zinc-800/95 border-zinc-700 text-zinc-200 hover:bg-zinc-700 hover:text-white'
                : 'bg-white/95 border-slate-200 text-zinc-700 hover:bg-slate-50 hover:text-zinc-950'
            }`}
          >
            {selectedImageOverlay.isLocked ? (
              <>
                <Lock className="w-4 h-4 stroke-[2.2]" />
                <span className="text-xs font-medium">Закреплено</span>
              </>
            ) : (
              <>
                <Unlock className="w-4 h-4 stroke-[2.2]" />
                <span className="text-xs font-medium">Закрепить</span>
              </>
            )}
          </button>
        </div>
      )}

      {activeTextInput && (() => {
          const text = activeTextInput.value || '';
          const currentCaret = Math.min(caretIndex, text.length);
          const textBefore = text.slice(0, currentCaret);
          const linesBefore = textBefore.split('\n');
          const currentLineIndex = linesBefore.length - 1;
          const currentLineTextBefore = linesBefore[currentLineIndex];

          const scaledFontSize = activeTextInput.fontSize * scaleRef.current;
          const fontStr = `${scaledFontSize}px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif`;
          const allLines = text.split('\n');

          let currentLineWidth = 0;
          let charWidth = Math.max(8, scaledFontSize * 0.58);
          let maxLineWidth = 0;

          if (typeof document !== 'undefined') {
              if (!measureCtx) {
                  const c = document.createElement('canvas');
                  measureCtx = c.getContext('2d');
              }
              if (measureCtx) {
                  measureCtx.font = fontStr;
                  currentLineWidth = measureCtx.measureText(currentLineTextBefore).width;
                  charWidth = (measureCtx.measureText('W').width * 0.72) || charWidth;
                  maxLineWidth = Math.max(...allLines.map(l => measureCtx!.measureText(l).width), 0);
              }
          }

          const lineHeight = scaledFontSize * 1.2;
          const cursorUnderlineLeft = currentLineWidth;
          const cursorUnderlineTop = currentLineIndex * lineHeight + scaledFontSize * 1.05;

          const updateCaret = (el: HTMLTextAreaElement) => {
              setCaretIndex(el.selectionStart || 0);
          };

          return (
              <div 
                  className="absolute z-40 pointer-events-none" 
                  style={{ left: `${inputScreenPos.x}px`, top: `${inputScreenPos.y}px` }}
                  onMouseDown={(e) => e.stopPropagation()}
                  onClick={(e) => e.stopPropagation()}
              >
                  <style>{`
                      @keyframes cursorUnderlineBlink {
                          0%, 100% { opacity: 1; }
                          50% { opacity: 0.15; }
                      }
                  `}</style>
                  
                  {/* Thin line the width of one character directly under text cursor */}
                  <div
                      className="absolute pointer-events-none transition-[left,top] duration-75"
                      style={{
                          left: `${cursorUnderlineLeft}px`,
                          top: `${cursorUnderlineTop}px`,
                          width: `${Math.max(10, charWidth)}px`,
                          height: '2.5px',
                          backgroundColor: activeTextInput.color || (isDarkMode ? '#ffffff' : '#000000'),
                          borderRadius: '1px',
                          boxShadow: isDarkMode ? '0 0 3px rgba(255,255,255,0.3)' : '0 0 3px rgba(0,0,0,0.2)',
                          animation: 'cursorUnderlineBlink 1.1s ease-in-out infinite',
                          zIndex: 50
                      }}
                  />

                  {/* Boundless text editor: no borders, unlimited width, Enter for newline */}
                  <textarea
                      ref={textInputRef}
                      className="bg-transparent border-0 outline-none p-0 m-0 overflow-hidden resize-none pointer-events-auto leading-[1.2] shadow-none select-text cursor-text"
                      style={{
                          color: activeTextInput.color || (isDarkMode ? '#ffffff' : '#000000'),
                          fontSize: `${scaledFontSize}px`,
                          lineHeight: 1.2,
                          fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
                          whiteSpace: 'pre',
                          wordBreak: 'normal',
                          width: `${Math.max(maxLineWidth + charWidth * 3, 80)}px`,
                          height: `${Math.max(allLines.length * lineHeight + 12, lineHeight + 12)}px`,
                          minHeight: `${lineHeight}px`,
                          caretColor: activeTextInput.color || (isDarkMode ? '#ffffff' : '#000000'),
                          userSelect: 'text',
                          WebkitUserSelect: 'text',
                      }}
                      value={activeTextInput.value}
                      autoFocus
                      onMouseDown={(e) => e.stopPropagation()}
                      onTouchStart={(e) => e.stopPropagation()}
                      onChange={(e) => {
                          const val = e.target.value;
                          const nextState = { ...activeTextInput, value: val };
                          setActiveTextInput(nextState);
                          activeTextInputRef.current = nextState;
                          updateCaret(e.target);
                      }}
                      onSelect={(e) => updateCaret(e.currentTarget)}
                      onClick={(e) => {
                          e.stopPropagation();
                          updateCaret(e.currentTarget);
                      }}
                      onKeyUp={(e) => updateCaret(e.currentTarget)}
                      onKeyDown={(e) => {
                          e.stopPropagation();
                          if (e.key === 'Escape') {
                              e.preventDefault();
                              handleFinishText();
                          }
                          // Enter produces a newline naturally (multiline text)
                      }}
                      onBlur={() => {
                          // Prevent immediate unmount if blur fired right upon creation
                          if (Date.now() - textCreationTimeRef.current < 350) {
                              textInputRef.current?.focus();
                              return;
                          }
                          handleFinishText();
                      }}
                  />
              </div>
          );
      })()}
    </div>
  );
});

export default Whiteboard;
