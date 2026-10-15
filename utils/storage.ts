import { Stroke, CodeBlockItem } from '../types';

const STORAGE_KEY = 'mathters_local_board_data';

export interface LocalBoardState {
  strokes: Stroke[];
  codeBlocks: CodeBlockItem[];
  updatedAt: number;
}

export function saveLocalBoardState(strokes: Stroke[], codeBlocks: CodeBlockItem[]): void {
  try {
    const data: LocalBoardState = {
      strokes,
      codeBlocks,
      updatedAt: Date.now()
    };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  } catch (err) {
    console.warn('[Storage] Failed to save local board state to localStorage:', err);
  }
}

export function loadLocalBoardState(): LocalBoardState | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return {
      strokes: Array.isArray(parsed.strokes) ? parsed.strokes : [],
      codeBlocks: Array.isArray(parsed.codeBlocks) ? parsed.codeBlocks : [],
      updatedAt: parsed.updatedAt || 0
    };
  } catch (err) {
    console.warn('[Storage] Failed to load local board state:', err);
    return null;
  }
}

export function clearLocalBoardState(): void {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch (err) {
    console.warn('[Storage] Failed to clear local board state:', err);
  }
}
