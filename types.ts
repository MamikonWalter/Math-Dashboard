
export type ToolType =
  | 'cursor'
  | 'pen'
  | 'dotted-line'
  | 'eraser'
  | 'text'
  | 'code'
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

export interface CodeBlockItem {
  id: string;
  x: number; // World coordinates
  y: number;
  width: number;
  height: number;
  title: string;
  code: string;
  output?: string;
  isMinimized?: boolean;
}

export interface Stroke {
  id?: string;
  points: Point[];
  color: string;
  width: number; // For shapes and images, this represents size/width. For text, font size.
  height?: number; // Optional height for non-square shapes or images
  tool: ToolType;
  imageUrl?: string;
  text?: string;
  textWidth?: number; // Optional horizontal width for text boxes
  rotation?: number; // Rotation angle in radians
  updatedAt?: number;
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
  codeBlocks?: CodeBlockItem[];
  camera: { x: number; y: number };
  version: number;
}

export interface WhiteboardHandle {
  getSnapshot: () => WhiteboardData;
  restoreSnapshot: (data: WhiteboardData) => void;
  loadRoomState: (strokes: Stroke[], blocks: CodeBlockItem[]) => void;
  applyRemoteStroke: (stroke: Stroke) => void;
  applyRemoteStrokes: (strokes: Stroke[]) => void;
  applyRemoteLiveStroke: (userId: string, stroke: Stroke) => void;
  clearRemoteLiveStroke: (userId: string) => void;
  applyRemoteCodeBlockCreate: (block: CodeBlockItem) => void;
  applyRemoteCodeBlockUpdate: (block: CodeBlockItem) => void;
  applyRemoteCodeBlockDelete: (blockId: string) => void;
  clearBoard: () => void;
  setZoom: (scale: number) => void;
  deleteSelection: () => void;
  copySelection: () => boolean;
  pasteSelection: () => void;
  getCanvasImage: () => string | null;
  addImage: (imageUrl: string, screenX: number, screenY: number) => void;
  isInteracting: () => boolean;
}
