
import React, { useRef, useEffect, useCallback, useImperativeHandle, forwardRef, useState } from 'react';
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
  onCursorMove?: (worldX: number, worldY: number) => void;
  remoteCursors?: { userId: string; userName: string; color: string; x: number; y: number }[];
}

interface TextInputState {
    x: number;
    y: number; // World coords
    value: string;
    color: string;
    fontSize: number;
    width: number; // World coords width
}

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
  onCursorMove,
  remoteCursors = []
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
  
  // Selection & Dragging Refs
  const selectedIndicesRef = useRef<Set<number>>(new Set());
  const isDraggingSelectionRef = useRef(false);
  const isResizingTextRef = useRef(false);
  
  // Marquee Selection Refs
  const isSelectingRef = useRef(false);
  const selectionStartRef = useRef<Point | null>(null);
  const selectionCurrentRef = useRef<Point | null>(null);

  // Text Tool State
  const [activeTextInput, setActiveTextInput] = useState<TextInputState | null>(null);

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

  // Shape & Insertion Rotation / Resize Refs
  const isRotatingRef = useRef<{
    strokeIndex: number;
    startMouseAngle: number;
    startRotation: number;
    center: Point;
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
          const maxLineLength = Math.max(...lines.map(l => l.length), 1);
          return { w: maxLineLength * fontSize * 0.6, h: lines.length * fontSize * 1.2 };
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
    const w = block.width;
    const h = block.isMinimized ? 42 : (block.height || 240);
    const r = 12;

    const baseWidth = 480;
    const baseHeight = 250;
    const widthRatio = w / baseWidth;
    const heightRatio = h / baseHeight;
    const dynamicScale = Math.max(0.6, Math.min(3.5, widthRatio * 0.65 + heightRatio * 0.35));

    const codeFontSize = Math.round(12 * dynamicScale);
    const lineH = Math.round(19 * dynamicScale);
    const gutterW = Math.max(28, Math.round(38 * dynamicScale));
    const headerH = Math.max(28, Math.round(36 * dynamicScale));

    ctx.save();
    // Card background
    ctx.beginPath();
    if (typeof (ctx as any).roundRect === 'function') {
      (ctx as any).roundRect(x, y, w, h, r);
    } else {
      ctx.rect(x, y, w, h);
    }
    ctx.fillStyle = isDark ? '#18181b' : '#ffffff';
    ctx.fill();
    ctx.strokeStyle = isDark ? '#3f3f46' : '#cbd5e1';
    ctx.lineWidth = 1.5;
    ctx.stroke();

    // Header background
    ctx.save();
    ctx.beginPath();
    if (typeof (ctx as any).roundRect === 'function') {
      (ctx as any).roundRect(x, y, w, headerH, [r, r, 0, 0]);
    } else {
      ctx.rect(x, y, w, headerH);
    }
    ctx.fillStyle = isDark ? '#202024' : '#f1f5f9';
    ctx.fill();
    ctx.strokeStyle = isDark ? '#323238' : '#e2e8f0';
    ctx.stroke();

    // Header title
    const headerTitleSize = Math.max(10, Math.round(12 * dynamicScale));
    ctx.font = `bold ${headerTitleSize}px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif`;
    ctx.fillStyle = '#387eb8';
    ctx.textBaseline = 'middle';
    ctx.fillText('Python 3', x + 12, y + headerH / 2);

    ctx.font = `${headerTitleSize}px ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace`;
    ctx.fillStyle = isDark ? '#d4d4d8' : '#475569';
    ctx.fillText(block.title || 'script.py', x + 12 + Math.round(55 * dynamicScale), y + headerH / 2);
    ctx.restore();

    if (!block.isMinimized) {
      // Line numbers gutter
      ctx.fillStyle = isDark ? '#1f1f23' : '#f8fafc';
      ctx.fillRect(x + 1, y + headerH, gutterW, h - headerH - 1);
      ctx.strokeStyle = isDark ? '#2e2e33' : '#f1f5f9';
      ctx.beginPath();
      ctx.moveTo(x + 1 + gutterW, y + headerH);
      ctx.lineTo(x + 1 + gutterW, y + h - 1);
      ctx.stroke();

      // Code lines
      const lines = (block.code || '').split('\n');
      ctx.font = `${codeFontSize}px ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace`;
      ctx.textBaseline = 'top';

      lines.forEach((line, i) => {
        const lineY = y + headerH + Math.round(8 * dynamicScale) + i * lineH;
        if (lineY + lineH > y + h - 20) return;

        // Line number
        ctx.fillStyle = isDark ? '#52525b' : '#94a3b8';
        ctx.fillText(String(i + 1), x + Math.max(6, Math.round(8 * dynamicScale)), lineY);

        // Code line syntax styling
        if (line.trim().startsWith('#')) {
          ctx.fillStyle = isDark ? '#71717a' : '#64748b';
        } else if (/\b(def|class|import|return|if|elif|else|for|while|in)\b/.test(line)) {
          ctx.fillStyle = isDark ? '#c084fc' : '#7c3aed';
        } else {
          ctx.fillStyle = isDark ? '#f4f4f5' : '#0f172a';
        }
        ctx.fillText(line, x + gutterW + Math.round(8 * dynamicScale), lineY);
      });

      // Output section if present
      if (block.output) {
        const outLines = block.output.split('\n');
        const outLineH = Math.round(16 * dynamicScale);
        const outH = Math.min(Math.round(80 * dynamicScale), outLines.length * outLineH + 12);
        const outY = y + h - outH - 8;
        ctx.fillStyle = isDark ? '#1e1e24' : '#f8fafc';
        ctx.fillRect(x + gutterW + 6, outY, w - gutterW - 14, outH);
        ctx.strokeStyle = isDark ? '#323238' : '#e2e8f0';
        ctx.strokeRect(x + gutterW + 6, outY, w - gutterW - 14, outH);

        ctx.font = `${Math.max(9, Math.round(11 * dynamicScale))}px ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace`;
        ctx.fillStyle = isDark ? '#a1a1aa' : '#334155';
        outLines.slice(0, 3).forEach((ol, oi) => {
          ctx.fillText(ol, x + gutterW + 12, outY + 6 + oi * outLineH);
        });
      }
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
        historyRef.current = [{ strokes: data.strokes, codeBlocks: blocks }];
        historyStepRef.current = 0;
        selectedIndicesRef.current.clear();
        onHistoryChange(false, false);
        render();
      }
    },
    loadRoomState: (strokes: Stroke[], blocks: CodeBlockItem[]) => {
      strokesRef.current = Array.isArray(strokes) ? strokes : [];
      const codeBlocksList = Array.isArray(blocks) ? blocks : [];
      setCodeBlocks(codeBlocksList);
      strokesRef.current.forEach(s => {
        if (s.tool === 'image' && s.imageUrl && !imageCache.current[s.imageUrl]) {
          const img = new Image();
          img.src = s.imageUrl;
          img.onload = () => render();
          imageCache.current[s.imageUrl] = img;
        }
      });
      historyRef.current = [{ strokes: strokesRef.current, codeBlocks: codeBlocksList }];
      historyStepRef.current = 0;
      selectedIndicesRef.current.clear();
      onHistoryChange(false, false);
      render();
    },
    applyRemoteStroke: (stroke: Stroke) => {
      strokesRef.current = [...strokesRef.current, stroke];
      if (stroke.tool === 'image' && stroke.imageUrl && !imageCache.current[stroke.imageUrl]) {
        const img = new Image();
        img.src = stroke.imageUrl;
        img.onload = () => render();
        imageCache.current[stroke.imageUrl] = img;
      }
      render();
    },
    applyRemoteStrokes: (strokes: Stroke[]) => {
      strokesRef.current = Array.isArray(strokes) ? strokes : [];
      strokesRef.current.forEach(s => {
        if (s.tool === 'image' && s.imageUrl && !imageCache.current[s.imageUrl]) {
          const img = new Image();
          img.src = s.imageUrl;
          img.onload = () => render();
          imageCache.current[s.imageUrl] = img;
        }
      });
      render();
    },
    applyRemoteCodeBlockCreate: (block: CodeBlockItem) => {
      setCodeBlocks(prev => [...prev.filter(b => b.id !== block.id), block]);
    },
    applyRemoteCodeBlockUpdate: (block: CodeBlockItem) => {
      setCodeBlocks(prev => prev.map(b => b.id === block.id ? { ...b, ...block } : b));
    },
    applyRemoteCodeBlockDelete: (blockId: string) => {
      setCodeBlocks(prev => prev.filter(b => b.id !== blockId));
    },
    clearBoard: () => {
      strokesRef.current = [];
      setCodeBlocks([]);
      selectedIndicesRef.current.clear();
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
            const nextBlocks = codeBlocksRef.current.filter(b => b.id !== activeCodeBlockIdRef.current);
            setCodeBlocks(nextBlocks);
            activeCodeBlockIdRef.current = null;
            setActiveCodeBlockId(null);
            changed = true;
        }
        if (selectedIndicesRef.current.size > 0) {
            const newStrokes = strokesRef.current.filter((_, index) => !selectedIndicesRef.current.has(index));
            strokesRef.current = newStrokes;
            selectedIndicesRef.current.clear();
            if (onShapeSelect) onShapeSelect(null);
            isDraggingSelectionRef.current = false;
            isDrawingRef.current = false;
            changed = true;
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
                points: stroke.points.map(p => ({ x: p.x + dx, y: p.y + dy }))
            };
        });
        const startIndex = strokesRef.current.length;
        strokesRef.current = [...strokesRef.current, ...newStrokes];
        selectedIndicesRef.current.clear();
        for (let i = 0; i < newStrokes.length; i++) selectedIndicesRef.current.add(startIndex + i);
        if (onShapeSelect) onShapeSelect(null);
        pushHistory();
        render();
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
            const w = block.width;
            const h = block.isMinimized ? 42 : (block.height || 240);
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
        offCtx.restore();

        return offCanvas.toDataURL('image/png');
    },
    addImage: (imageUrl: string, screenX: number, screenY: number) => {
        const img = new Image();
        img.src = imageUrl;
        img.onload = () => {
            imageCache.current[imageUrl] = img;
            const worldPos = screenToWorld(screenX, screenY);
            const newStroke: Stroke = {
                tool: 'image',
                points: [worldPos],
                color: '#000000',
                width: 400, // Default width for external images
                imageUrl: imageUrl
            };
            strokesRef.current = [...strokesRef.current, newStroke];
            pushHistory();
            render();
        };
    }
  }));

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
    if (selectedIndicesRef.current.size > 0) {
        selectedIndicesRef.current.forEach((idx: number) => {
            const stroke = strokesRef.current[idx];
            if (!stroke) return;
            const isShapeOrInsertion = shapeTools.includes(stroke.tool) || stroke.tool === 'image' || stroke.tool === 'text';
            const { w, h } = getStrokeBounds(stroke);
            const rot = stroke.rotation || 0;
            const center = (shapeTools.includes(stroke.tool) || stroke.tool === 'image')
                ? stroke.points[0]
                : (stroke.tool === 'text'
                    ? { x: (stroke.points[0]?.x || 0) + w / 2, y: (stroke.points[0]?.y || 0) + h / 2 }
                    : { x: (getBoundingBox(stroke).minX + getBoundingBox(stroke).maxX) / 2, y: (getBoundingBox(stroke).minY + getBoundingBox(stroke).maxY) / 2 });

            if (!center) return;

            ctx.save();
            ctx.translate(center.x, center.y);
            ctx.rotate(rot);

            if (isShapeOrInsertion) {
                // Bounding border
                ctx.strokeStyle = '#2563eb';
                ctx.lineWidth = 1.5 / scale;
                ctx.setLineDash([4 / scale, 4 / scale]);
                ctx.strokeRect(-w / 2, -h / 2, w, h);
                ctx.setLineDash([]);

                // Rotation stem and knob
                ctx.beginPath();
                ctx.strokeStyle = '#2563eb';
                ctx.lineWidth = 1.5 / scale;
                ctx.moveTo(0, -h / 2);
                ctx.lineTo(0, -h / 2 - 24 / scale);
                ctx.stroke();

                ctx.beginPath();
                ctx.arc(0, -h / 2 - 24 / scale, 5 / scale, 0, Math.PI * 2);
                ctx.fillStyle = '#ffffff';
                ctx.fill();
                ctx.strokeStyle = '#2563eb';
                ctx.lineWidth = 2 / scale;
                ctx.stroke();

                // 8 resize handles
                const handleSize = 8 / scale;
                const handles = [
                    { x: -w / 2, y: -h / 2 },
                    { x: 0, y: -h / 2 },
                    { x: w / 2, y: -h / 2 },
                    { x: w / 2, y: 0 },
                    { x: w / 2, y: h / 2 },
                    { x: 0, y: h / 2 },
                    { x: -w / 2, y: h / 2 },
                    { x: -w / 2, y: 0 }
                ];
                handles.forEach(pt => {
                    ctx.fillStyle = '#ffffff';
                    ctx.fillRect(pt.x - handleSize / 2, pt.y - handleSize / 2, handleSize, handleSize);
                    ctx.strokeStyle = '#2563eb';
                    ctx.lineWidth = 1.5 / scale;
                    ctx.strokeRect(pt.x - handleSize / 2, pt.y - handleSize / 2, handleSize, handleSize);
                });

                // If actively rotating this stroke, draw rotation angle badge
                if (isRotatingRef.current && isRotatingRef.current.strokeIndex === idx) {
                    let deg = Math.round(rot * (180 / Math.PI)) % 360;
                    if (deg < 0) deg += 360;
                    const text = `${deg}°`;
                    const badgeY = -h / 2 - 44 / scale;
                    ctx.font = `bold ${12 / scale}px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif`;
                    const tw = ctx.measureText(text).width;
                    const padX = 7 / scale;
                    const bw = tw + padX * 2;
                    const bh = 20 / scale;
                    ctx.fillStyle = '#2563eb';
                    ctx.beginPath();
                    if (typeof (ctx as any).roundRect === 'function') {
                        (ctx as any).roundRect(-bw / 2, badgeY - bh / 2, bw, bh, 4 / scale);
                    } else {
                        ctx.rect(-bw / 2, badgeY - bh / 2, bw, bh);
                    }
                    ctx.fill();
                    ctx.fillStyle = '#ffffff';
                    ctx.textAlign = 'center';
                    ctx.textBaseline = 'middle';
                    ctx.fillText(text, 0, badgeY);
                }
            } else {
                const bounds = getBoundingBox(stroke);
                ctx.restore();
                ctx.save();
                ctx.strokeStyle = '#0066ff';
                ctx.lineWidth = 2 / scale;
                ctx.setLineDash([5 / scale, 5 / scale]);
                ctx.strokeRect(bounds.minX, bounds.minY, bounds.maxX - bounds.minX, bounds.maxY - bounds.minY);
            }
            ctx.restore();
        });
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
  }, [showGrid, isDarkMode]);

  // Re-render when dark mode or grid changes
  useEffect(() => {
    render();
  }, [isDarkMode, render]);

  // --- Handlers ---
  const handleFinishText = useCallback(() => {
      if (activeTextInput && activeTextInput.value.trim().length > 0) {
          const newStroke: Stroke = {
              tool: 'text',
              points: [{ x: activeTextInput.x, y: activeTextInput.y }],
              color: activeTextInput.color,
              width: activeTextInput.fontSize,
              text: activeTextInput.value,
              textWidth: activeTextInput.width > 50 ? activeTextInput.width : undefined
          };
          strokesRef.current = [...strokesRef.current, newStroke];
          pushHistory();
          render();
      }
      setActiveTextInput(null);
  }, [activeTextInput, render]);

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
            width: 480,
            height: 250,
            title: 'script.py',
            code: `# Python 3
import math

def solve(x):
    return x**2 - 5*x + 6

val = 5
print(f"solve({val}) =", solve(val))
`,
            output: undefined,
            isMinimized: false
        };
        setCodeBlocks(prev => {
            const next = [...prev, newBlock];
            pushHistory(strokesRef.current, next);
            return next;
        });
        setActiveCodeBlockId(newBlock.id);
        if (onCodeBlockCreated) onCodeBlockCreated(newBlock);
        return;
    }

    if (tool === 'text') {
        if (activeTextInput) handleFinishText();
        else {
            setActiveTextInput({ x: worldPos.x, y: worldPos.y, value: '', color, fontSize: strokeWidth * 4 + 12, width: 0 });
            setTimeout(() => textInputRef.current?.focus(), 10);
        }
        return;
    } else if (activeTextInput) {
        const inputScreenPos = worldToScreen(activeTextInput.x, activeTextInput.y);
        const inputWidth = activeTextInput.width > 0 ? activeTextInput.width * scaleRef.current : (textInputRef.current?.offsetWidth || 0);
        const handleX = inputScreenPos.x + inputWidth;
        const handleY = inputScreenPos.y + (textInputRef.current?.offsetHeight || 0) / 2;
        if (Math.sqrt((coords.x - handleX)**2 + (coords.y - handleY)**2) < 20) {
            isResizingTextRef.current = true;
            return;
        }
        handleFinishText();
    }

    if (tool === 'eraser') {
        isDrawingRef.current = true;
        hasErasedRef.current = false;
        onDrawStart();
        performErase(worldPos);
        return;
    }

    if (tool === 'cursor') {
        // 1. Check if clicking rotation knob or resize handle on ALREADY selected stroke
        if (selectedIndicesRef.current.size === 1) {
            const [selectedIdx] = Array.from(selectedIndicesRef.current);
            const selStroke = strokesRef.current[selectedIdx];
            if (selStroke) {
                const target = getHandleOrBorderAtPoint(worldPos, selStroke);
                if (target) {
                    const { w, h } = getStrokeBounds(selStroke);
                    const center = (shapeTools.includes(selStroke.tool) || selStroke.tool === 'image')
                        ? selStroke.points[0]
                        : { x: (selStroke.points[0]?.x || 0) + w / 2, y: (selStroke.points[0]?.y || 0) + h / 2 };

                    if (target.type === 'rot') {
                        const startAngle = Math.atan2(worldPos.y - center.y, worldPos.x - center.x);
                        isRotatingRef.current = {
                            strokeIndex: selectedIdx,
                            startMouseAngle: startAngle,
                            startRotation: selStroke.rotation || 0,
                            center
                        };
                        render();
                        return;
                    } else if (target.type !== 'body') {
                        isResizingShapeRef.current = {
                            strokeIndex: selectedIdx,
                            handle: target.type,
                            startCenter: center,
                            startWorldPos: worldPos,
                            startWidth: w,
                            startHeight: h,
                            rotation: selStroke.rotation || 0,
                            aspectRatio: h / (w || 1)
                        };
                        render();
                        return;
                    }
                }
            }
        }

        // 2. Check if clicking on ANY shape or image border / handle on the whiteboard
        for (let i = strokesRef.current.length - 1; i >= 0; i--) {
            const s = strokesRef.current[i];
            if (shapeTools.includes(s.tool) || s.tool === 'image' || s.tool === 'text') {
                const target = getHandleOrBorderAtPoint(worldPos, s);
                if (target && target.type !== 'body') {
                    selectedIndicesRef.current.clear();
                    selectedIndicesRef.current.add(i);
                    if (onShapeSelect) {
                        onShapeSelect(Math.round(s.width / PIXELS_PER_PERCENT));
                    }
                    const { w, h } = getStrokeBounds(s);
                    const center = (shapeTools.includes(s.tool) || s.tool === 'image')
                        ? s.points[0]
                        : { x: (s.points[0]?.x || 0) + w / 2, y: (s.points[0]?.y || 0) + h / 2 };

                    if (target.type === 'rot') {
                        const startAngle = Math.atan2(worldPos.y - center.y, worldPos.x - center.x);
                        isRotatingRef.current = {
                            strokeIndex: i,
                            startMouseAngle: startAngle,
                            startRotation: s.rotation || 0,
                            center
                        };
                    } else {
                        isResizingShapeRef.current = {
                            strokeIndex: i,
                            handle: target.type,
                            startCenter: center,
                            startWorldPos: worldPos,
                            startWidth: w,
                            startHeight: h,
                            rotation: s.rotation || 0,
                            aspectRatio: h / (w || 1)
                        };
                    }
                    render();
                    return;
                }
            }
        }

        let foundIndex = -1;
        for (let i = strokesRef.current.length - 1; i >= 0; i--) {
            if (hitTest(worldPos, strokesRef.current[i])) {
                foundIndex = i;
                break;
            }
        }
        if (foundIndex !== -1) {
            if (!selectedIndicesRef.current.has(foundIndex)) {
                selectedIndicesRef.current.clear();
                selectedIndicesRef.current.add(foundIndex);
            }
            if (selectedIndicesRef.current.size === 1 && onShapeSelect) {
                 const stroke = strokesRef.current[foundIndex];
                 if (shapeTools.includes(stroke.tool) || stroke.tool === 'image' || stroke.tool === 'text') {
                    onShapeSelect(Math.round(stroke.width / PIXELS_PER_PERCENT));
                 } else onShapeSelect(null);
            } else if (onShapeSelect) onShapeSelect(null);
            isDraggingSelectionRef.current = true;
            isDrawingRef.current = true; 
            const newStrokes = [...strokesRef.current];
            // FIXED: Explicitly typing idx as number
            selectedIndicesRef.current.forEach((idx: number) => {
                newStrokes[idx] = { ...newStrokes[idx], points: newStrokes[idx].points.map(p => ({...p})) };
            });
            strokesRef.current = newStrokes;
            onDrawStart();
            render();
        } else {
            selectedIndicesRef.current.clear();
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
            points: [worldPos], color, width: shapeSize * PIXELS_PER_PERCENT, tool
        };
        strokesRef.current = [...strokesRef.current, shapeStroke];
        selectedIndicesRef.current.clear();
        selectedIndicesRef.current.add(strokesRef.current.length - 1);
        if (onShapeSelect) onShapeSelect(shapeSize);
        pushHistory();
        render();
        return; 
    }

    isDrawingRef.current = true;
    onDrawStart();
    selectedIndicesRef.current.clear();
    const initialPoints = tool === 'dotted-line' ? [worldPos, worldPos] : [worldPos];
    currentStrokeRef.current = { points: initialPoints, color, width: strokeWidth, tool };
    render();
  };

  const move = (e: React.MouseEvent | React.TouchEvent) => {
    const coords = getCoords(e);
    const worldPos = screenToWorld(coords.x, coords.y);
    if (onCursorMove) onCursorMove(worldPos.x, worldPos.y);

    if (isPanningRef.current && lastMousePosRef.current) {
       cameraRef.current.x += coords.x - lastMousePosRef.current.x;
       cameraRef.current.y += coords.y - lastMousePosRef.current.y;
       lastMousePosRef.current = coords;
       setCamTick(t => t + 1);
       render(); return;
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
            render();
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
            render();
        }
        return;
    }

    if (isResizingTextRef.current && activeTextInput) {
        setActiveTextInput(prev => prev ? { ...prev, width: Math.max(50, screenToWorld(coords.x, coords.y).x - activeTextInput.x) } : null);
        return;
    }
    if (tool === 'eraser' && isDrawingRef.current) {
        performErase(screenToWorld(coords.x, coords.y));
        return;
    }
    if (isSelectingRef.current) {
        selectionCurrentRef.current = screenToWorld(coords.x, coords.y);
        render(); return;
    }
    if (tool === 'cursor' && isDraggingSelectionRef.current && lastMousePosRef.current) {
        const worldPos = screenToWorld(coords.x, coords.y);
        const lastWorldPos = screenToWorld(lastMousePosRef.current.x, lastMousePosRef.current.y);
        const dx = worldPos.x - lastWorldPos.x;
        const dy = worldPos.y - lastWorldPos.y;
        // FIXED: Explicitly typing idx as number
        selectedIndicesRef.current.forEach((idx: number) => {
            const stroke = strokesRef.current[idx];
            if (stroke) stroke.points.forEach(p => { p.x += dx; p.y += dy; });
        });
        render(); lastMousePosRef.current = coords; return;
    }
    if (isDrawingRef.current && currentStrokeRef.current) {
        if (e.cancelable) e.preventDefault();
        const worldPos = screenToWorld(coords.x, coords.y);
        const isShift = (e as React.MouseEvent).shiftKey;
        const startPos = currentStrokeRef.current.points[0];
        if (currentStrokeRef.current.tool === 'dotted-line' || (currentStrokeRef.current.tool === 'pen' && isShift)) {
             const targetPos = isShift ? snapToAngle(startPos, worldPos) : worldPos;
             currentStrokeRef.current.points = [startPos, targetPos];
        } else currentStrokeRef.current.points.push(worldPos);
        render();
    }

    // Hover cursor feedback in cursor mode when not interacting
    if (tool === 'cursor' && !isDraggingSelectionRef.current && !isSelectingRef.current) {
        const worldPos = screenToWorld(coords.x, coords.y);
        let hoveredTarget: { strokeIndex: number; handle: string; cursor: string } | null = null;

        if (selectedIndicesRef.current.size === 1) {
            const [selectedIdx] = Array.from(selectedIndicesRef.current);
            const selStroke = strokesRef.current[selectedIdx];
            if (selStroke) {
                const target = getHandleOrBorderAtPoint(worldPos, selStroke);
                if (target) {
                    hoveredTarget = { strokeIndex: selectedIdx, handle: target.type, cursor: target.cursor };
                }
            }
        }

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
            render();
        }
    }

    if (!isPanningRef.current) lastMousePosRef.current = coords;
  };

  const endDrawing = () => {
    if (isPanningRef.current) { isPanningRef.current = false; return; }
    if (isRotatingRef.current) {
        isRotatingRef.current = null;
        pushHistory();
        render();
        return;
    }
    if (isResizingShapeRef.current) {
        isResizingShapeRef.current = null;
        pushHistory();
        render();
        return;
    }
    if (isResizingTextRef.current) { isResizingTextRef.current = false; return; }
    if (tool === 'eraser' && isDrawingRef.current) {
        isDrawingRef.current = false;
        if (hasErasedRef.current) pushHistory();
        return;
    }
    if (isSelectingRef.current && selectionStartRef.current && selectionCurrentRef.current) {
        isSelectingRef.current = false;
        const start = selectionStartRef.current;
        const curr = selectionCurrentRef.current;
        const selBox = { minX: Math.min(start.x, curr.x), minY: Math.min(start.y, curr.y), maxX: Math.max(start.x, curr.x), maxY: Math.max(start.y, curr.y) };
        selectedIndicesRef.current.clear();
        strokesRef.current.forEach((stroke, index) => { if (checkIntersection(selBox, getBoundingBox(stroke))) selectedIndicesRef.current.add(index); });
        selectionStartRef.current = null; selectionCurrentRef.current = null;
        render(); return;
    }
    if (tool === 'cursor' && isDraggingSelectionRef.current) {
        isDraggingSelectionRef.current = false; isDrawingRef.current = false;
        pushHistory(); return;
    }
    if (isDrawingRef.current && currentStrokeRef.current) {
        isDrawingRef.current = false;
        strokesRef.current = [...strokesRef.current, currentStrokeRef.current];
        currentStrokeRef.current = null;
        pushHistory(); render();
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
      for (let i = strokesRef.current.length - 1; i >= 0; i--) {
          const s = strokesRef.current[i];
          if (s.tool === 'image') continue; 

          const radius = eraserWidth / 2;
          let hit = false;
          if (shapeTools.includes(s.tool) || s.tool === 'text') hit = hitTest(p, s);
          else if (s.tool === 'dotted-line' && s.points.length >= 2) hit = distanceToSegment(p, s.points[0], s.points[s.points.length-1]) < radius + s.width;
          else if (s.tool === 'pen') {
              for (let j = 0; j < s.points.length - 1; j++) if (distanceToSegment(p, s.points[j], s.points[j+1]) < radius + s.width) { hit = true; break; }
          }
          if (hit) { strokesRef.current.splice(i, 1); erased = true; }
      }
      if (erased) { hasErasedRef.current = true; render(); }
  };

  const getCoords = (e: any): Point => {
    const ev = e.touches ? e.touches[0] : e;
    return { x: ev.clientX, y: ev.clientY };
  };

  const pushHistory = (newStrokes: Stroke[] = strokesRef.current, newBlocks: CodeBlockItem[] = codeBlocksRef.current, syncRemote: boolean = true) => {
      const newHistory = historyRef.current.slice(0, historyStepRef.current + 1);
      newHistory.push({
          strokes: [...newStrokes],
          codeBlocks: JSON.parse(JSON.stringify(newBlocks))
      });
      historyRef.current = newHistory; 
      historyStepRef.current += 1;
      onHistoryChange(true, false);
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
        const dx = (e.clientX - startMouseX) / scaleRef.current;
        const dy = (e.clientY - startMouseY) / scaleRef.current;
        pendingDrag = {
          blockId,
          x: Math.round(startBlockX + dx),
          y: Math.round(startBlockY + dy)
        };
        if (animFrameId === null) {
          animFrameId = requestAnimationFrame(() => {
            animFrameId = null;
            if (pendingDrag) {
              const { blockId: bId, x: newX, y: newY } = pendingDrag;
              setCodeBlocks(prev => prev.map(b => b.id === bId ? { ...b, x: newX, y: newY } : b));
              pendingDrag = null;
            }
          });
        }
      } else if (blockResizeRef.current) {
        const { blockId, startMouseX, startMouseY, startWidth, startHeight } = blockResizeRef.current;
        const dw = (e.clientX - startMouseX) / scaleRef.current;
        const dh = (e.clientY - startMouseY) / scaleRef.current;
        pendingResize = {
          blockId,
          width: Math.max(300, Math.round(startWidth + dw)),
          height: Math.max(160, Math.round(startHeight + dh))
        };
        if (animFrameId === null) {
          animFrameId = requestAnimationFrame(() => {
            animFrameId = null;
            if (pendingResize) {
              const { blockId: bId, width: newW, height: newH } = pendingResize;
              setCodeBlocks(prev => prev.map(b => b.id === bId ? { ...b, width: newW, height: newH } : b));
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
        setCodeBlocks(prev => prev.map(b => b.id === bId ? { ...b, x: newX, y: newY } : b));
        pendingDrag = null;
      }
      if (pendingResize) {
        const { blockId: bId, width: newW, height: newH } = pendingResize;
        setCodeBlocks(prev => prev.map(b => b.id === bId ? { ...b, width: newW, height: newH } : b));
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
        const [index] = Array.from(selectedIndicesRef.current);
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
    if (isResizingTextRef.current) return 'cursor-ew-resize';
    if (tool === 'code') return 'cursor-code';
    if (shapeTools.includes(tool) || tool === 'dotted-line' || tool === 'text') return 'cursor-crosshair';
    if (tool === 'pen') return 'cursor-pen';
    if (tool === 'eraser') return 'cursor-eraser';
    return 'cursor-default';
  };

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
      <canvas ref={canvasRef} onMouseDown={startDrawing} onMouseMove={move} onMouseUp={endDrawing} onMouseLeave={endDrawing} onTouchStart={startDrawing} onTouchMove={move} onTouchEnd={endDrawing} className="block touch-none" />
      
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
                return next;
              });
              if (onCodeBlockUpdated) onCodeBlockUpdated(fullUpdated);
            }}
            onDelete={() => {
              setCodeBlocks(prev => {
                const next = prev.filter(b => b.id !== block.id);
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

      {/* Collaborative Remote User Cursors */}
      {remoteCursors?.map((cursor) => {
        const screenPos = worldToScreen(cursor.x, cursor.y);
        return (
          <div
            key={cursor.userId}
            className="absolute pointer-events-none z-40 transition-transform duration-75 ease-out"
            style={{
              transform: `translate(${screenPos.x}px, ${screenPos.y}px)`
            }}
          >
            <svg
              className="w-5 h-5 -translate-x-1 -translate-y-1 drop-shadow-md"
              viewBox="0 0 24 24"
              fill={cursor.color}
            >
              <path
                d="M5.5 3.21V20.8c0 .45.54.67.85.35l4.86-4.86a.5.5 0 0 1 .35-.15h6.87c.45 0 .67-.54.35-.85L6.35 2.86a.5.5 0 0 0-.85.35Z"
                stroke="#ffffff"
                strokeWidth="1.5"
              />
            </svg>
            <div
              className="px-2 py-0.5 rounded-full text-[11px] font-medium text-white shadow-md whitespace-nowrap ml-3 -mt-2"
              style={{ backgroundColor: cursor.color }}
            >
              {cursor.userName}
            </div>
          </div>
        );
      })}

      {activeTextInput && (
          <div className="absolute z-40 pointer-events-none" style={{ left: inputScreenPos.x, top: inputScreenPos.y }}>
              <textarea ref={textInputRef} className="bg-transparent border border-blue-400 outline-none p-0 m-0 overflow-hidden resize-none leading-tight pointer-events-auto" style={{ color: activeTextInput.color, fontSize: `${activeTextInput.fontSize * scaleRef.current}px`, fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif', minWidth: '50px', minHeight: '24px', width: activeTextInput.width > 0 ? `${activeTextInput.width * scaleRef.current}px` : 'auto', height: 'auto' }} value={activeTextInput.value} onChange={(e) => {
                    setActiveTextInput({ ...activeTextInput, value: e.target.value });
                    if (activeTextInput.width <= 0) { e.target.style.width = 'auto'; e.target.style.width = (e.target.scrollWidth) + 'px'; }
                    e.target.style.height = 'auto'; e.target.style.height = (e.target.scrollHeight) + 'px';
                }} onBlur={() => { if (!isResizingTextRef.current) handleFinishText(); }} onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleFinishText(); } if (e.key === 'Escape') setActiveTextInput(null); }} />
              <div className="absolute top-0 bottom-0 -right-2 w-4 cursor-ew-resize flex items-center justify-center pointer-events-auto" onMouseDown={(e) => { e.stopPropagation(); isResizingTextRef.current = true; }}>
                  <div className="w-1.5 h-6 bg-blue-500 rounded-full shadow-sm" />
              </div>
          </div>
      )}
    </div>
  );
});

export default Whiteboard;
