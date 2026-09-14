import { initializeApp, getApps, getApp } from 'firebase/app';
import { 
  getFirestore, 
  doc, 
  getDoc, 
  setDoc, 
  onSnapshot,
  Firestore,
  Unsubscribe 
} from 'firebase/firestore';
import firebaseConfig from '../firebase-applet-config.json';
import { Stroke, CodeBlockItem } from '../types';

let db: Firestore | null = null;

export function getFirebaseDb(): Firestore | null {
  if (db) return db;
  try {
    const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApp();
    const dbId = (firebaseConfig as any).firestoreDatabaseId;
    if (dbId && dbId !== '(default)') {
      db = getFirestore(app, dbId);
    } else {
      db = getFirestore(app);
    }
    return db;
  } catch (err) {
    console.error('[Firebase] Failed to initialize Firestore:', err);
    return null;
  }
}

// Deeply sanitize objects to remove undefined values before Firestore writes
function sanitizeForFirestore(obj: any): any {
  if (obj === undefined) return null;
  if (obj === null || typeof obj !== 'object') return obj;
  if (Array.isArray(obj)) {
    return obj.map(sanitizeForFirestore);
  }
  const clean: Record<string, any> = {};
  for (const [key, value] of Object.entries(obj)) {
    if (value !== undefined) {
      clean[key] = sanitizeForFirestore(value);
    }
  }
  return clean;
}

export interface BoardData {
  id: string;
  strokes: Stroke[];
  codeBlocks: CodeBlockItem[];
  updatedAt: number;
}

const LOCAL_STORAGE_PREFIX = 'mathters_board_';
const LAST_ROOM_KEY = 'mathters_last_room_id';

// Local storage helpers
export function getLocalBoard(roomId: string): BoardData | null {
  try {
    const cleanId = roomId.trim().toUpperCase();
    const raw = localStorage.getItem(`${LOCAL_STORAGE_PREFIX}${cleanId}`);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return {
      id: cleanId,
      strokes: Array.isArray(parsed.strokes) ? parsed.strokes : [],
      codeBlocks: Array.isArray(parsed.codeBlocks) ? parsed.codeBlocks : [],
      updatedAt: parsed.updatedAt || 0
    };
  } catch (_) {
    return null;
  }
}

export function saveLocalBoard(roomId: string, strokes: Stroke[], codeBlocks: CodeBlockItem[]): void {
  try {
    const cleanId = roomId.trim().toUpperCase();
    const data: BoardData = {
      id: cleanId,
      strokes,
      codeBlocks,
      updatedAt: Date.now()
    };
    localStorage.setItem(`${LOCAL_STORAGE_PREFIX}${cleanId}`, JSON.stringify(data));
    localStorage.setItem(LAST_ROOM_KEY, cleanId);
  } catch (err) {
    console.warn('[Storage] Could not write to localStorage:', err);
  }
}

export function getLastActiveRoomId(): string | null {
  try {
    return localStorage.getItem(LAST_ROOM_KEY);
  } catch (_) {
    return null;
  }
}

export function setLastActiveRoomId(roomId: string): void {
  try {
    localStorage.setItem(LAST_ROOM_KEY, roomId.trim().toUpperCase());
  } catch (_) {}
}

// Debounced Firestore saving state
let firestoreSaveTimers: Record<string, NodeJS.Timeout> = {};

/**
 * Saves board state to Firestore (with debouncing to avoid excessive writes during drawing)
 * and immediately updates the local storage cache.
 */
export async function saveBoardHybrid(
  roomId: string,
  strokes: Stroke[],
  codeBlocks: CodeBlockItem[],
  immediate: boolean = false
): Promise<void> {
  const cleanId = roomId.trim().toUpperCase();
  if (!cleanId) return;

  // 1. Always save to local cache immediately
  saveLocalBoard(cleanId, strokes, codeBlocks);

  // 2. Clear previous pending debounced Firestore save
  if (firestoreSaveTimers[cleanId]) {
    clearTimeout(firestoreSaveTimers[cleanId]);
    delete firestoreSaveTimers[cleanId];
  }

  const executeFirestoreWrite = async () => {
    try {
      const firestore = getFirebaseDb();
      if (!firestore) return;

      const boardDocRef = doc(firestore, 'boards', cleanId);
      const payload = sanitizeForFirestore({
        id: cleanId,
        strokes,
        codeBlocks,
        updatedAt: Date.now()
      });

      await setDoc(boardDocRef, payload, { merge: true });
    } catch (err) {
      console.warn(`[Firestore] Could not save board ${cleanId}:`, err);
    }
  };

  if (immediate) {
    await executeFirestoreWrite();
  } else {
    // 1000ms debounce ensures smooth drawing while persisting promptly
    firestoreSaveTimers[cleanId] = setTimeout(executeFirestoreWrite, 1000);
  }
}

/**
 * Loads board from Firestore with fallback to LocalStorage.
 * Returns the board data and whether it was retrieved from the cloud.
 */
export async function loadBoardHybrid(roomId: string): Promise<{
  data: BoardData | null;
  source: 'cache' | 'cloud' | 'none';
}> {
  const cleanId = roomId.trim().toUpperCase();
  if (!cleanId) return { data: null, source: 'none' };

  // 1. Check local cache first for instant response
  const cached = getLocalBoard(cleanId);

  // 2. Query Firestore for durable cloud state
  try {
    const firestore = getFirebaseDb();
    if (firestore) {
      const boardDocRef = doc(firestore, 'boards', cleanId);
      const snapshot = await getDoc(boardDocRef);
      if (snapshot.exists()) {
        const cloudData = snapshot.data();
        const boardData: BoardData = {
          id: cleanId,
          strokes: Array.isArray(cloudData.strokes) ? cloudData.strokes : [],
          codeBlocks: Array.isArray(cloudData.codeBlocks) ? cloudData.codeBlocks : [],
          updatedAt: cloudData.updatedAt || 0
        };

        // If cloud data is newer or local is empty, update local cache and return cloud
        if (!cached || boardData.updatedAt >= (cached.updatedAt || 0)) {
          saveLocalBoard(cleanId, boardData.strokes, boardData.codeBlocks);
          return { data: boardData, source: 'cloud' };
        }
      }
    }
  } catch (err) {
    console.warn(`[Firestore] Error loading board ${cleanId} from cloud:`, err);
  }

  // If cloud had nothing or failed, return local cached version if available
  if (cached) {
    return { data: cached, source: 'cache' };
  }

  return { data: null, source: 'none' };
}

/**
 * Subscribes to real-time updates for a board from Firestore (for cross-device synchronization).
 */
export function subscribeToBoardCloud(
  roomId: string,
  onUpdate: (data: BoardData) => void
): Unsubscribe | null {
  const cleanId = roomId.trim().toUpperCase();
  if (!cleanId) return null;

  try {
    const firestore = getFirebaseDb();
    if (!firestore) return null;

    const boardDocRef = doc(firestore, 'boards', cleanId);
    return onSnapshot(
      boardDocRef,
      (snapshot) => {
        if (snapshot.exists()) {
          const cloudData = snapshot.data();
          const boardData: BoardData = {
            id: cleanId,
            strokes: Array.isArray(cloudData.strokes) ? cloudData.strokes : [],
            codeBlocks: Array.isArray(cloudData.codeBlocks) ? cloudData.codeBlocks : [],
            updatedAt: cloudData.updatedAt || 0
          };
          onUpdate(boardData);
        }
      },
      (err) => {
        console.warn(`[Firestore] Real-time listener error for ${cleanId}:`, err);
      }
    );
  } catch (err) {
    console.warn('[Firestore] Could not attach listener:', err);
    return null;
  }
}
