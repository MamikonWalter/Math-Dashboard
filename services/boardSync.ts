import {
  collection,
  doc,
  getDoc,
  setDoc,
  updateDoc,
  deleteDoc,
  onSnapshot,
  query,
  orderBy,
  serverTimestamp,
  writeBatch
} from 'firebase/firestore';
import { User } from 'firebase/auth';
import { db, handleFirestoreError, OperationType } from '../firebase';
import { Stroke } from '../types';

export interface BoardMetadata {
  id: string;
  name: string;
  ownerId: string;
  createdAt?: any;
  updatedAt?: any;
}

export function generateBoardId(): string {
  const chars = 'abcdefghijkmnpqrstuvwxyz23456789';
  let result = 'room-';
  for (let i = 0; i < 6; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}

export function generateStrokeId(): string {
  return `s_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
}

export async function ensureBoardExists(
  boardId: string,
  initialName: string,
  user: User
): Promise<BoardMetadata | null> {
  const boardRef = doc(db, 'boards', boardId);
  try {
    const snap = await getDoc(boardRef);
    if (snap.exists()) {
      return snap.data() as BoardMetadata;
    }

    const newBoard: BoardMetadata = {
      id: boardId,
      name: initialName || 'Новая доска',
      ownerId: user.uid,
    };

    await setDoc(boardRef, {
      ...newBoard,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });

    return newBoard;
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, `boards/${boardId}`);
    return null;
  }
}

export async function updateBoardTitle(boardId: string, newName: string): Promise<void> {
  const boardRef = doc(db, 'boards', boardId);
  try {
    await updateDoc(boardRef, {
      name: newName.trim() || 'Новая доска',
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, `boards/${boardId}`);
  }
}

export function subscribeToBoard(
  boardId: string,
  onUpdate: (board: BoardMetadata | null) => void,
  onError?: (error: any) => void
) {
  const boardRef = doc(db, 'boards', boardId);
  return onSnapshot(
    boardRef,
    (docSnap) => {
      if (docSnap.exists()) {
        onUpdate(docSnap.data() as BoardMetadata);
      } else {
        onUpdate(null);
      }
    },
    (error) => {
      handleFirestoreError(error, OperationType.GET, `boards/${boardId}`);
      if (onError) onError(error);
    }
  );
}

export function subscribeToStrokes(
  boardId: string,
  onStrokes: (strokes: Stroke[]) => void,
  onError?: (error: any) => void
) {
  const strokesCol = collection(db, 'boards', boardId, 'strokes');
  const q = query(strokesCol, orderBy('order', 'asc'));

  return onSnapshot(
    q,
    (snapshot) => {
      const strokes: Stroke[] = [];
      snapshot.forEach((docSnap) => {
        const data = docSnap.data();
        strokes.push({
          id: data.id || docSnap.id,
          points: data.points || [],
          color: data.color || '#000000',
          width: Number(data.width) || 2,
          tool: data.tool || 'pen',
          text: data.text,
          textWidth: data.textWidth,
          imageUrl: data.imageUrl,
        });
      });
      onStrokes(strokes);
    },
    (error) => {
      handleFirestoreError(error, OperationType.LIST, `boards/${boardId}/strokes`);
      if (onError) onError(error);
    }
  );
}

export async function saveSingleStroke(
  boardId: string,
  stroke: Stroke,
  order: number,
  user: User
): Promise<string> {
  const strokeId = stroke.id || generateStrokeId();
  const strokeRef = doc(db, 'boards', boardId, 'strokes', strokeId);

  const payload: any = {
    id: strokeId,
    boardId,
    authorId: user.uid,
    tool: stroke.tool,
    color: stroke.color,
    width: stroke.width,
    points: stroke.points.map((p) => ({ x: Math.round(p.x * 10) / 10, y: Math.round(p.y * 10) / 10 })),
    order,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  };

  if (stroke.text !== undefined) payload.text = stroke.text;
  if (stroke.textWidth !== undefined) payload.textWidth = stroke.textWidth;
  if (stroke.imageUrl !== undefined) payload.imageUrl = stroke.imageUrl;

  try {
    await setDoc(strokeRef, payload);
    return strokeId;
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, `boards/${boardId}/strokes/${strokeId}`);
    return strokeId;
  }
}

export async function deleteStrokeFromFirestore(boardId: string, strokeId: string): Promise<void> {
  const strokeRef = doc(db, 'boards', boardId, 'strokes', strokeId);
  try {
    await deleteDoc(strokeRef);
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, `boards/${boardId}/strokes/${strokeId}`);
  }
}

export async function syncFullStrokesList(
  boardId: string,
  strokes: Stroke[],
  user: User
): Promise<void> {
  try {
    const batch = writeBatch(db);
    strokes.forEach((stroke, index) => {
      const strokeId = stroke.id || generateStrokeId();
      stroke.id = strokeId;
      const ref = doc(db, 'boards', boardId, 'strokes', strokeId);
      const payload: any = {
        id: strokeId,
        boardId,
        authorId: user.uid,
        tool: stroke.tool,
        color: stroke.color,
        width: stroke.width,
        points: stroke.points.map((p) => ({ x: Math.round(p.x * 10) / 10, y: Math.round(p.y * 10) / 10 })),
        order: index,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      };
      if (stroke.text !== undefined) payload.text = stroke.text;
      if (stroke.textWidth !== undefined) payload.textWidth = stroke.textWidth;
      if (stroke.imageUrl !== undefined) payload.imageUrl = stroke.imageUrl;
      batch.set(ref, payload);
    });
    await batch.commit();
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, `boards/${boardId}/strokes`);
  }
}
