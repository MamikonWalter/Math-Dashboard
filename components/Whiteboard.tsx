
import React, { useRef, useEffect, useCallback, useImperativeHandle, forwardRef, useState } from 'react';
import { ToolType, Point, Stroke, WhiteboardHandle, WhiteboardData } from '../types';
import { PIXELS_PER_PERCENT } from '../constants';

interface WhiteboardProps {
  tool: ToolType;
  color: string;
  strokeWidth: number;
  eraserWidth: number;
  shapeSize: number;
  showGrid: boolean;
  onHistoryChange: (canUndo: boolean, canRedo: boolean) => void;
  triggerUndo: number;
  triggerRedo: number;
  onDrawStart: () => void;
  onZoomChange?: (zoom: number) => void;
  onShapeSelect?: (size: number | null) => void;
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
  onHistoryChange,
  triggerUndo,
  triggerRedo,
  onDrawStart,
  onZoomChange,
  onShapeSelect
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

  // Clipboard Ref
  const clipboardRef = useRef<Stroke[]>([]);

  // Image Cache
  const imageCache = useRef<Record<string, HTMLImageElement>>({});

  // History Refs
  const historyRef = useRef<Stroke[][]>([[]]);
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
          const h = stroke.width * ratio;
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
      return { w: stroke.width, h: stroke.width };
  };

  const getBoundingBox = (stroke: Stroke) => {
      if (shapeTools.includes(stroke.tool) || stroke.tool === 'image' || stroke.tool === 'text') {
          const center = stroke.points[0];
          const { w, h } = getStrokeBounds(stroke);
          if (stroke.tool === 'text') {
              return { minX: center.x, minY: center.y, maxX: center.x + w, maxY: center.y + h };
          }
          return { minX: center.x - w / 2, minY: center.y - h / 2, maxX: center.x + w / 2, maxY: center.y + h / 2 };
      } else {
          let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
          stroke.points.forEach(p => {
              if (p.x < minX) minX = p.x;
              if (p.x > maxX) maxX = p.x;
              if (p.y < minY) minY = p.y;
              if (p.y > maxY) maxY = p.y;
          });
          const padding = stroke.width / 2;
          return { minX: minX - padding, minY: minY - padding, maxX: maxX + padding, maxY: maxY + padding };
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

      // Horizontal snapping: within 10 degrees of 0° or 180°
      const isHorizontal = absDeg <= 10 || absDeg >= 170;

      // Vertical snapping: within 10 degrees of 90° (80° to 100°)
      const isVertical = absDeg >= 80 && absDeg <= 100;

      if (isHorizontal) {
          return { x: p1.x, y: p0.y };
      } else if (isVertical) {
          return { x: p0.x, y: p1.y };
      }

      // Outside horizontal/vertical threshold, keep free cursor angle
      return p1;
  };

  // --- Internal Rendering for Export/Full Snapshot ---
  const drawStrokeOnCtx = (ctx: CanvasRenderingContext2D, stroke: Stroke) => {
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
            const h = stroke.width * ratio;
            const x = stroke.points[0].x - stroke.width / 2;
            const y = stroke.points[0].y - h / 2;
            ctx.drawImage(img, x, y, stroke.width, h);
        }
        return;
    }

    if (stroke.tool === 'text') {
        const p = stroke.points[0];
        if (!p) return;
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
        return;
    }

    if (shapeTools.includes(stroke.tool)) {
        drawShapeOnCtx(ctx, stroke);
        return;
    }

    if (stroke.points.length < 1) return;
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
  };

  const drawShapeOnCtx = (ctx: CanvasRenderingContext2D, stroke: Stroke) => {
      const { points, width: size, tool: shapeType, color } = stroke;
      if (!points[0]) return;
      const { x, y } = points[0];
      ctx.beginPath(); ctx.strokeStyle = color; ctx.lineWidth = 3; ctx.lineJoin = 'round'; ctx.lineCap = 'round';
      const drawLine = (p1: Point, p2: Point, isDashed: boolean = false) => {
          ctx.beginPath(); if (isDashed) ctx.setLineDash([5, 5]); else ctx.setLineDash([]);
          ctx.moveTo(p1.x, p1.y); ctx.lineTo(p2.x, p2.y); ctx.stroke(); ctx.setLineDash([]);
      };
      switch (shapeType) {
          case 'square': ctx.rect(x - size/2, y - size/2, size, size); ctx.stroke(); break;
          case 'circle': ctx.beginPath(); ctx.arc(x, y, size/2, 0, Math.PI*2); ctx.stroke(); break;
          case 'triangle': { const h = size * (Math.sqrt(3)/2); ctx.beginPath(); ctx.moveTo(x, y - h/2); ctx.lineTo(x - size/2, y + h/2); ctx.lineTo(x + size/2, y + h/2); ctx.closePath(); ctx.stroke(); break; }
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
               const w = size, h = size * 0.75, r = 10, tailSize = 10;
               ctx.beginPath(); ctx.moveTo(x - w/2 + r, y - h/2); ctx.lineTo(x + w/2 - r, y - h/2);
               ctx.quadraticCurveTo(x + w/2, y - h/2, x + w/2, y - h/2 + r); ctx.lineTo(x + w/2, y + h/2 - r);
               ctx.quadraticCurveTo(x + w/2, y + h/2, x + w/2 - r, y + h/2); ctx.lineTo(x - w/2 + 20 + tailSize, y + h/2);
               ctx.lineTo(x - w/2 + 10, y + h/2 + tailSize); ctx.lineTo(x - w/2 + 20, y + h/2); ctx.lineTo(x - w/2 + r, y + h/2);
               ctx.quadraticCurveTo(x - w/2, y + h/2, x - w/2, y + h/2 - r); ctx.lineTo(x - w/2, y - h/2 + r);
               ctx.quadraticCurveTo(x - w/2, y - h/2, x - w/2 + r, y - h/2); ctx.stroke(); break;
          }
          case 'arrow': {
              const headW = size * 0.4;
              const w = size, h = size * 0.5;
              ctx.beginPath(); ctx.moveTo(x - w/2, y - h/4); ctx.lineTo(x + w/2 - headW, y - h/4); ctx.lineTo(x + w/2 - headW, y - h/2);
              ctx.lineTo(x + w/2, y); ctx.lineTo(x + w/2 - headW, y + h/2); ctx.lineTo(x + w/2 - headW, y + h/4); ctx.lineTo(x - w/2, y + h/4); ctx.closePath(); ctx.stroke(); break;
          }
          case 'cube': {
              const s = size * 0.7, offset = s * 0.4;
              const fTL = { x: x - s/2, y: y - s/2 + offset/2 }, fTR = { x: x + s/2, y: y - s/2 + offset/2 }, fBL = { x: x - s/2, y: y + s/2 + offset/2 }, fBR = { x: x + s/2, y: y + s/2 + offset/2 };
              const bTL = { x: fTL.x + offset, y: fTL.y - offset }, bTR = { x: fTR.x + offset, y: fTR.y - offset }, bBL = { x: fBL.x + offset, y: fBL.y - offset }, bBR = { x: fBR.x + offset, y: fBR.y - offset };
              drawLine(fTL, fTR); drawLine(fTR, fBR); drawLine(fBR, fBL); drawLine(fBL, fTL); drawLine(fTL, bTL); drawLine(fTR, bTR); drawLine(fBR, bBR); drawLine(bTL, bTR); drawLine(bTR, bBR);
              drawLine(fBL, bBL, true); drawLine(bBL, bTL, true); drawLine(bBL, bBR, true); break;
          }
          case 'cylinder': {
              const w = size * 0.6, h = size * 0.8, eH = w * 0.3, tCy = y - h/2, bCy = y + h/2;
              ctx.beginPath(); ctx.ellipse(x, tCy, w, eH, 0, 0, Math.PI * 2); ctx.stroke();
              drawLine({x: x - w, y: tCy}, {x: x - w, y: bCy}); drawLine({x: x + w, y: tCy}, {x: x + w, y: bCy});
              ctx.beginPath(); ctx.ellipse(x, bCy, w, eH, 0, 0, Math.PI); ctx.stroke();
              ctx.beginPath(); ctx.setLineDash([5, 5]); ctx.ellipse(x, bCy, w, eH, 0, Math.PI, Math.PI * 2); ctx.stroke();
              ctx.setLineDash([]); break;
          }
          case 'sphere': {
              const r = size / 2; ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.stroke();
              ctx.beginPath(); ctx.ellipse(x, y, r, r * 0.3, 0, 0, Math.PI); ctx.stroke();
              ctx.beginPath(); ctx.setLineDash([5, 5]); ctx.ellipse(x, y, r, r * 0.3, 0, Math.PI, Math.PI * 2); ctx.stroke(); ctx.setLineDash([]); break;
          }
          case 'pyramid': {
               const w = size * 0.8, h = size * 0.8;
               const fl = { x: x - w/2, y: y + h/2 }, fr = { x: x + w/2, y: y + h/2 }, br = { x: x + w*0.75, y: y + h/2 - w/2 }, bl = { x: x - w/4, y: y + h/2 - w/2 };
               const apex = { x: x + w/8, y: y - h/2 };
               drawLine(fl, fr); drawLine(fr, br); drawLine(fl, apex); drawLine(fr, apex); drawLine(br, apex);
               drawLine(fl, bl, true); drawLine(bl, br, true); drawLine(bl, apex, true); break;
          }
          case 'prism': {
              const w = size * 0.8, h = size * 0.6, d = size * 0.5;
              const fT = { x, y: y - h/2 }, fL = { x: x - d, y: y + h/2 }, fR = { x: x + d, y: y + h/2 };
              const sX = w * 0.5, sY = -w * 0.2, bT = { x: fT.x + sX, y: fT.y + sY }, bL = { x: fL.x + sX, y: fL.y + sY }, bR = { x: fR.x + sX, y: fR.y + sY };
              drawLine(fT, fL); drawLine(fL, fR); drawLine(fR, fT); drawLine(fT, bT); drawLine(fR, bR); drawLine(bT, bR);
              drawLine(fL, bL, true); drawLine(bL, bT, true); drawLine(bL, bR, true); break;
          }
      }
  };

  // --- Imperative Handle ---
  useImperativeHandle(ref, () => ({
    getSnapshot: (): WhiteboardData => {
      return { strokes: strokesRef.current, camera: cameraRef.current, version: 1 };
    },
    restoreSnapshot: (data: WhiteboardData) => {
      if (data && Array.isArray(data.strokes)) {
        strokesRef.current = data.strokes;
        if (data.camera) cameraRef.current = data.camera;
        data.strokes.forEach(s => {
            if (s.tool === 'image' && s.imageUrl && !imageCache.current[s.imageUrl]) {
                const img = new Image();
                img.src = s.imageUrl;
                img.onload = () => render();
                imageCache.current[s.imageUrl] = img;
            }
        });
        historyRef.current = [data.strokes];
        historyStepRef.current = 0;
        selectedIndicesRef.current.clear();
        onHistoryChange(false, false);
        render();
      }
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
            render();
            if (onZoomChange) onZoomChange(constrainedScale);
        }
    },
    deleteSelection: () => {
        if (selectedIndicesRef.current.size > 0) {
            const newStrokes = strokesRef.current.filter((_, index) => !selectedIndicesRef.current.has(index));
            strokesRef.current = newStrokes;
            selectedIndicesRef.current.clear();
            if (onShapeSelect) onShapeSelect(null);
            isDraggingSelectionRef.current = false;
            isDrawingRef.current = false;
            pushHistory();
            render();
        }
    },
    copySelection: () => {
        if (selectedIndicesRef.current.size === 0) return;
        const selectedStrokes = strokesRef.current.filter((_, i) => selectedIndicesRef.current.has(i));
        clipboardRef.current = JSON.parse(JSON.stringify(selectedStrokes));
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
        if (strokesRef.current.length === 0) return canvas.toDataURL('image/png');

        // Capture EVERYTHING on the board by calculating a bounding box for all content
        let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
        strokesRef.current.forEach(stroke => {
            const bounds = getBoundingBox(stroke);
            minX = Math.min(minX, bounds.minX);
            maxX = Math.max(maxX, bounds.maxX);
            minY = Math.min(minY, bounds.minY);
            maxY = Math.max(maxY, bounds.maxY);
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
        offCtx.fillStyle = '#fbfbfb';
        offCtx.fillRect(0, 0, offCanvas.width, offCanvas.height);

        // Draw content centered in padding area
        offCtx.save();
        offCtx.scale(scaleDown, scaleDown);
        offCtx.translate(-minX + padding, -minY + padding);
        strokesRef.current.forEach(stroke => drawStrokeOnCtx(offCtx, stroke));
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
        ctx.save();
        ctx.strokeStyle = '#0066ff';
        ctx.lineWidth = 2 / scale;
        ctx.setLineDash([5 / scale, 5 / scale]);
        // FIXED: Explicitly typing idx as number to avoid 'unknown' index errors
        selectedIndicesRef.current.forEach((idx: number) => {
            const stroke = strokesRef.current[idx];
            if (stroke) {
                const bounds = getBoundingBox(stroke);
                ctx.strokeRect(bounds.minX, bounds.minY, bounds.maxX - bounds.minX, bounds.maxY - bounds.minY);
            }
        });
        ctx.restore();
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
  }, [showGrid]);

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
    if (isPanningRef.current && lastMousePosRef.current) {
       cameraRef.current.x += coords.x - lastMousePosRef.current.x;
       cameraRef.current.y += coords.y - lastMousePosRef.current.y;
       lastMousePosRef.current = coords;
       render(); return;
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
    if (!isPanningRef.current) lastMousePosRef.current = coords;
  };

  const endDrawing = () => {
    if (isPanningRef.current) { isPanningRef.current = false; return; }
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
    const bounds = getBoundingBox(stroke);
    if (stroke.tool === 'text') return point.x >= bounds.minX && point.x <= bounds.maxX && point.y >= bounds.minY && point.y <= bounds.maxY;
    if (shapeTools.includes(stroke.tool) || stroke.tool === 'image') return Math.abs(point.x - stroke.points[0].x) <= (bounds.maxX - bounds.minX)/2 && Math.abs(point.y - stroke.points[0].y) <= (bounds.maxY - bounds.minY)/2;
    if (stroke.tool === 'pen' || stroke.tool === 'dotted-line') {
        const threshold = Math.max(10, stroke.width / 2 + 5); 
        if (point.x < bounds.minX - threshold || point.x > bounds.maxX + threshold || point.y < bounds.minY - threshold || point.y > bounds.maxY + threshold) return false;
        if (stroke.tool === 'dotted-line' && stroke.points.length >= 2) return distanceToSegment(point, stroke.points[0], stroke.points[stroke.points.length - 1]) <= threshold;
        for (let i = 0; i < stroke.points.length - 1; i++) if (distanceToSegment(point, stroke.points[i], stroke.points[i+1]) <= threshold) return true;
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
        ctx.strokeStyle = isMajor ? '#cbd5e1' : '#f1f5f9';
        if (x === 0) ctx.strokeStyle = '#94a3b8';
        ctx.lineWidth = (isMajor || x === 0) ? (2 / scale) : (1 / scale);
        ctx.moveTo(x, top); ctx.lineTo(x, bottom); ctx.stroke();
    }
    for (let y = startY; y < bottom; y += gridSize) {
        ctx.beginPath(); const isMajor = y % (gridSize * majorGridStep) === 0;
        ctx.strokeStyle = isMajor ? '#cbd5e1' : '#f1f5f9';
        if (y === 0) ctx.strokeStyle = '#94a3b8';
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

  const pushHistory = () => {
      const newHistory = historyRef.current.slice(0, historyStepRef.current + 1);
      newHistory.push([...strokesRef.current]);
      historyRef.current = newHistory; historyStepRef.current += 1;
      onHistoryChange(true, false);
  };

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
        scaleRef.current = newScale; render(); if (onZoomChange) onZoomChange(newScale);
      };
      canvas.addEventListener('wheel', handleWheel, { passive: false });
      return () => canvas.removeEventListener('wheel', handleWheel);
    }
  }, [render, onZoomChange]);

  useEffect(() => {
    if (triggerUndo > prevUndoTrigger.current) {
        prevUndoTrigger.current = triggerUndo;
        if (historyStepRef.current > 0) {
            historyStepRef.current -= 1; strokesRef.current = historyRef.current[historyStepRef.current];
            selectedIndicesRef.current.clear(); onHistoryChange(historyStepRef.current > 0, true); render();
        }
    }
    if (triggerRedo > prevRedoTrigger.current) {
        prevRedoTrigger.current = triggerRedo;
        if (historyStepRef.current < historyRef.current.length - 1) {
            historyStepRef.current += 1; strokesRef.current = historyRef.current[historyStepRef.current];
            selectedIndicesRef.current.clear(); onHistoryChange(true, historyStepRef.current < historyRef.current.length - 1); render();
        }
    }
  }, [triggerUndo, triggerRedo, render, onHistoryChange]);

  const getCursorStyle = () => {
    if (isResizingTextRef.current) return 'cursor-ew-resize';
    if (shapeTools.includes(tool) || tool === 'dotted-line' || tool === 'text') return 'cursor-crosshair';
    if (tool === 'pen') return 'cursor-pen';
    if (tool === 'eraser') return 'cursor-eraser';
    return 'cursor-default';
  };

  const inputScreenPos = activeTextInput ? worldToScreen(activeTextInput.x, activeTextInput.y) : { x: 0, y: 0 };

  return (
    <div ref={containerRef} className={`absolute inset-0 z-0 bg-[#f0f2f5] overflow-hidden ${getCursorStyle()}`} onContextMenu={(e) => e.preventDefault()}>
      <canvas ref={canvasRef} onMouseDown={startDrawing} onMouseMove={move} onMouseUp={endDrawing} onMouseLeave={endDrawing} onTouchStart={startDrawing} onTouchMove={move} onTouchEnd={endDrawing} className="block touch-none" />
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
