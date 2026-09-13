import { Stroke, CodeBlockItem } from '../types';

export interface RemoteCursor {
  userId: string;
  userName: string;
  color: string;
  x: number;
  y: number;
  lastUpdated: number;
}

export type CollabEventCallback = (event: {
  type: 'init' | 'stroke_added' | 'strokes_updated' | 'code_block_created' | 'code_block_updated' | 'code_block_deleted' | 'users_count' | 'cursors_updated' | 'connection_status';
  data: any;
}) => void;

class CollaborationService {
  private ws: WebSocket | null = null;
  private bc: BroadcastChannel | null = null;
  private currentRoomId: string | null = null;
  private userId: string = 'u_' + Math.random().toString(36).substring(2, 9);
  private userName: string = 'Гость ' + Math.floor(100 + Math.random() * 900);
  private listeners: Set<CollabEventCallback> = new Set();
  private remoteCursors: Map<string, RemoteCursor> = new Map();
  private reconnectTimer: any = null;
  private retryAttempts: number = 0;
  private maxRetryAttempts: number = 3;
  private isConnected: boolean = false;
  private isLocalMode: boolean = false;
  private userCount: number = 1;
  private lastCursorSend: number = 0;

  // In-memory cache of current room strokes and blocks for local saving
  private currentStrokes: Stroke[] = [];
  private currentBlocks: CodeBlockItem[] = [];

  constructor() {
    // Clean up stale cursors every 3 seconds
    setInterval(() => {
      const now = Date.now();
      let changed = false;
      this.remoteCursors.forEach((c, id) => {
        if (now - c.lastUpdated > 5000) {
          this.remoteCursors.delete(id);
          changed = true;
        }
      });
      if (changed) {
        this.emit({ type: 'cursors_updated', data: Array.from(this.remoteCursors.values()) });
      }
    }, 2000);
  }

  public subscribe(cb: CollabEventCallback): () => void {
    this.listeners.add(cb);
    return () => this.listeners.delete(cb);
  }

  private emit(event: { type: any; data: any }) {
    this.listeners.forEach(cb => {
      try {
        cb(event);
      } catch (err) {
        console.error('Error in collab listener:', err);
      }
    });
  }

  private saveToLocalStorage() {
    if (!this.currentRoomId) return;
    try {
      localStorage.setItem(`mathters_room_${this.currentRoomId}`, JSON.stringify({
        strokes: this.currentStrokes,
        codeBlocks: this.currentBlocks,
        updatedAt: Date.now()
      }));
    } catch (_) {}
  }

  public connect(roomId: string, userName?: string) {
    this.currentRoomId = roomId.toUpperCase();
    if (userName) this.userName = userName;

    // Load any existing local data for this room first as fallback
    try {
      const saved = localStorage.getItem(`mathters_room_${this.currentRoomId}`);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed.strokes)) this.currentStrokes = parsed.strokes;
        if (Array.isArray(parsed.codeBlocks)) this.currentBlocks = parsed.codeBlocks;
      }
    } catch (_) {}

    // Setup BroadcastChannel for zero-server real-time tab-to-tab sync
    if (typeof BroadcastChannel !== 'undefined') {
      try {
        if (this.bc) {
          this.bc.close();
        }
        this.bc = new BroadcastChannel(`mathters_room_channel_${this.currentRoomId}`);
        this.bc.onmessage = (event) => {
          this.handleLocalMessage(event.data);
        };
      } catch (e) {
        console.warn('BroadcastChannel not supported or failed', e);
      }
    }

    // Try WebSocket connection if in browser environment
    this.initWebSocket();
  }

  private initWebSocket() {
    if (this.ws) {
      try {
        this.ws.close();
      } catch (_) {}
      this.ws = null;
    }

    if (this.retryAttempts >= this.maxRetryAttempts) {
      // Switch cleanly to local standalone mode without throwing errors or spamming
      this.isLocalMode = true;
      this.emit({ type: 'connection_status', data: 'local' });
      return;
    }

    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${protocol}//${window.location.host}`;

    try {
      this.ws = new WebSocket(wsUrl);

      this.ws.onopen = () => {
        this.isConnected = true;
        this.isLocalMode = false;
        this.retryAttempts = 0;
        this.emit({ type: 'connection_status', data: 'online' });
        this.send({
          type: 'join_room',
          roomId: this.currentRoomId,
          userId: this.userId,
          userName: this.userName
        });
      };

      this.ws.onmessage = (event) => {
        try {
          const msg = JSON.parse(event.data);
          this.handleServerMessage(msg);
        } catch (e) {
          console.error('Failed to parse WS message:', e);
        }
      };

      this.ws.onclose = () => {
        this.isConnected = false;
        if (this.currentRoomId && this.retryAttempts < this.maxRetryAttempts) {
          this.retryAttempts++;
          clearTimeout(this.reconnectTimer);
          const delay = Math.min(2000 * Math.pow(1.5, this.retryAttempts - 1), 6000);
          this.reconnectTimer = setTimeout(() => {
            if (this.currentRoomId) this.initWebSocket();
          }, delay);
        } else {
          this.isLocalMode = true;
          this.emit({ type: 'connection_status', data: 'local' });
        }
      };

      this.ws.onerror = () => {
        // Silently handle error — no unhandled exceptions in browser
        if (!this.isConnected && this.retryAttempts >= this.maxRetryAttempts) {
          this.isLocalMode = true;
          this.emit({ type: 'connection_status', data: 'local' });
        }
      };
    } catch (err) {
      this.isLocalMode = true;
      this.emit({ type: 'connection_status', data: 'local' });
    }
  }

  private handleLocalMessage(msg: any) {
    if (!msg || msg.senderId === this.userId) return;

    switch (msg.type) {
      case 'stroke_added': {
        this.currentStrokes.push(msg.stroke);
        this.saveToLocalStorage();
        this.emit({ type: 'stroke_added', data: msg.stroke });
        break;
      }
      case 'strokes_updated': {
        this.currentStrokes = msg.strokes;
        this.saveToLocalStorage();
        this.emit({ type: 'strokes_updated', data: msg.strokes });
        break;
      }
      case 'code_block_created': {
        this.currentBlocks = [...this.currentBlocks.filter(b => b.id !== msg.block.id), msg.block];
        this.saveToLocalStorage();
        this.emit({ type: 'code_block_created', data: msg.block });
        break;
      }
      case 'code_block_updated': {
        this.currentBlocks = this.currentBlocks.map(b => b.id === msg.block.id ? { ...b, ...msg.block } : b);
        this.saveToLocalStorage();
        this.emit({ type: 'code_block_updated', data: msg.block });
        break;
      }
      case 'code_block_deleted': {
        this.currentBlocks = this.currentBlocks.filter(b => b.id !== msg.blockId);
        this.saveToLocalStorage();
        this.emit({ type: 'code_block_deleted', data: msg.blockId });
        break;
      }
      case 'cursor_move': {
        this.remoteCursors.set(msg.userId, {
          userId: msg.userId,
          userName: msg.userName || 'Участник',
          color: msg.color || '#3b82f6',
          x: msg.x,
          y: msg.y,
          lastUpdated: Date.now()
        });
        this.emit({ type: 'cursors_updated', data: Array.from(this.remoteCursors.values()) });
        break;
      }
    }
  }

  private handleServerMessage(msg: any) {
    switch (msg.type) {
      case 'room_state': {
        this.userCount = msg.usersCount || 1;
        this.currentStrokes = msg.strokes || [];
        this.currentBlocks = msg.codeBlocks || [];
        this.saveToLocalStorage();
        this.emit({
          type: 'init',
          data: {
            strokes: this.currentStrokes,
            codeBlocks: this.currentBlocks,
            usersCount: this.userCount
          }
        });
        break;
      }
      case 'stroke_added': {
        this.currentStrokes.push(msg.stroke);
        this.saveToLocalStorage();
        this.emit({ type: 'stroke_added', data: msg.stroke });
        break;
      }
      case 'strokes_updated': {
        this.currentStrokes = msg.strokes;
        this.saveToLocalStorage();
        this.emit({ type: 'strokes_updated', data: msg.strokes });
        break;
      }
      case 'code_block_created': {
        this.currentBlocks = [...this.currentBlocks.filter(b => b.id !== msg.block.id), msg.block];
        this.saveToLocalStorage();
        this.emit({ type: 'code_block_created', data: msg.block });
        break;
      }
      case 'code_block_updated': {
        this.currentBlocks = this.currentBlocks.map(b => b.id === msg.block.id ? { ...b, ...msg.block } : b);
        this.saveToLocalStorage();
        this.emit({ type: 'code_block_updated', data: msg.block });
        break;
      }
      case 'code_block_deleted': {
        this.currentBlocks = this.currentBlocks.filter(b => b.id !== msg.blockId);
        this.saveToLocalStorage();
        this.emit({ type: 'code_block_deleted', data: msg.blockId });
        break;
      }
      case 'users_count': {
        this.userCount = msg.count || 1;
        this.emit({ type: 'users_count', data: this.userCount });
        break;
      }
      case 'user_cursor': {
        if (msg.userId !== this.userId) {
          this.remoteCursors.set(msg.userId, {
            userId: msg.userId,
            userName: msg.userName || 'Участник',
            color: msg.color || '#3b82f6',
            x: msg.x,
            y: msg.y,
            lastUpdated: Date.now()
          });
          this.emit({ type: 'cursors_updated', data: Array.from(this.remoteCursors.values()) });
        }
        break;
      }
      case 'cursor_remove': {
        if (this.remoteCursors.has(msg.userId)) {
          this.remoteCursors.delete(msg.userId);
          this.emit({ type: 'cursors_updated', data: Array.from(this.remoteCursors.values()) });
        }
        break;
      }
    }
  }

  private send(msg: any) {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      try {
        this.ws.send(JSON.stringify(msg));
      } catch (err) {
        console.warn('Failed to send WS message:', err);
      }
    }
    // Also broadcast to local tabs
    if (this.bc) {
      try {
        this.bc.postMessage({ ...msg, senderId: this.userId });
      } catch (_) {}
    }
  }

  public sendStroke(stroke: Stroke) {
    if (!this.currentRoomId) return;
    this.currentStrokes.push(stroke);
    this.saveToLocalStorage();
    this.send({
      type: 'stroke_add',
      roomId: this.currentRoomId,
      stroke
    });
  }

  public sendStrokesUpdate(strokes: Stroke[]) {
    if (!this.currentRoomId) return;
    this.currentStrokes = strokes;
    this.saveToLocalStorage();
    this.send({
      type: 'strokes_update',
      roomId: this.currentRoomId,
      strokes
    });
  }

  public sendCodeBlockCreate(block: CodeBlockItem) {
    if (!this.currentRoomId) return;
    this.currentBlocks = [...this.currentBlocks.filter(b => b.id !== block.id), block];
    this.saveToLocalStorage();
    this.send({
      type: 'code_block_create',
      roomId: this.currentRoomId,
      block
    });
  }

  public sendCodeBlockUpdate(block: CodeBlockItem) {
    if (!this.currentRoomId) return;
    this.currentBlocks = this.currentBlocks.map(b => b.id === block.id ? { ...b, ...block } : b);
    this.saveToLocalStorage();
    this.send({
      type: 'code_block_update',
      roomId: this.currentRoomId,
      block
    });
  }

  public sendCodeBlockDelete(blockId: string) {
    if (!this.currentRoomId) return;
    this.currentBlocks = this.currentBlocks.filter(b => b.id !== blockId);
    this.saveToLocalStorage();
    this.send({
      type: 'code_block_delete',
      roomId: this.currentRoomId,
      blockId
    });
  }

  public sendCursor(x: number, y: number) {
    if (!this.currentRoomId) return;
    const now = Date.now();
    if (now - this.lastCursorSend < 33) return;
    this.lastCursorSend = now;

    this.send({
      type: 'cursor_move',
      roomId: this.currentRoomId,
      userId: this.userId,
      userName: this.userName,
      color: '#3b82f6',
      x: Math.round(x),
      y: Math.round(y)
    });
  }

  public getRoomId(): string | null {
    return this.currentRoomId;
  }

  public getUserCount(): number {
    return this.userCount;
  }

  public isLiveOnline(): boolean {
    return this.isConnected;
  }

  public disconnect() {
    this.currentRoomId = null;
    clearTimeout(this.reconnectTimer);
    if (this.ws) {
      try {
        this.ws.close();
      } catch (_) {}
      this.ws = null;
    }
    if (this.bc) {
      try {
        this.bc.close();
      } catch (_) {}
      this.bc = null;
    }
    this.remoteCursors.clear();
  }
}

export const collab = new CollaborationService();
