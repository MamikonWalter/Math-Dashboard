
export type ToolType =
  | 'cursor'
  | 'pen'
  | 'dotted-line'
  | 'eraser'
  | 'text'
  | 'square'
  | 'circle'
  | 'triangle'
  | 'diamond'
  | 'star'
  | 'arrow'
  | 'speech'
  | 'cube'
  | 'cylinder'
  | 'sphere'
  | 'pyramid'
  | 'prism'
  | 'image';

export interface Point {
  x: number;
  y: number;
}

export interface Stroke {
  points: Point[];
  color: string;
  width: number; // For shapes and images, this represents size/width. For text, font size.
  tool: ToolType;
  imageUrl?: string;
  text?: string;
  textWidth?: number; // Optional horizontal width for text boxes
}

export interface DrawingState {
  isDrawing: boolean;
  tool: ToolType;
  color: string;
  strokeWidth: number;
  eraserWidth: number;
}

export interface HistoryItem {
  imageData: ImageData;
}

export interface WhiteboardData {
  strokes: Stroke[];
  camera: { x: number; y: number };
  version: number;
}

export interface WhiteboardHandle {
  getSnapshot: () => WhiteboardData;
  restoreSnapshot: (data: WhiteboardData) => void;
  setZoom: (scale: number) => void;
  deleteSelection: () => void;
  copySelection: () => void;
  pasteSelection: () => void;
  getCanvasImage: () => string | null;
  addImage: (imageUrl: string, screenX: number, screenY: number) => void;
}
