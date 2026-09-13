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
  type: 'init' | 'stroke_added' | 'strokes_updated' | 'code_block_created' | 'code_block_updated' | 'code_block_deleted' | 'users_count' | 'cursors_updated';
  data: any;
}) => void;

class CollaborationService {
  private ws: WebSocket | null = null;
  private currentRoomId: string | null = null;
  private userId: string = 'u_' + Math.random().toString(36).substring(2, 9);
  private userName: string = 'Гость ' + Math.floor(100 + Math.random() * 900);
  private listeners: Set<CollabEventCallback> = new Set();
  private remoteCursors: Map<string, RemoteCursor> = new Map();
  private reconnectTimer: any = null;
  private isConnected: boolean = false;
  private userCount: number = 1;
  private lastCursorSend: number = 0;

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

  public connect(roomId: string, userName?: string) {
    this.currentRoomId = roomId.toUpperCase();
    if (userName) this.userName = userName;

    if (this.ws) {
      try {
        this.ws.close();
      } catch (_) {}
      this.ws = null;
    }

    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${protocol}//${window.location.host}`;

    try {
      this.ws = new WebSocket(wsUrl);

      this.ws.onopen = () => {
        this.isConnected = true;
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
        // Schedule auto-reconnect if we are still in a room
        if (this.currentRoomId) {
          clearTimeout(this.reconnectTimer);
          this.reconnectTimer = setTimeout(() => {
            if (this.currentRoomId) this.connect(this.currentRoomId, this.userName);
          }, 2000);
        }
      };

      this.ws.onerror = (err) => {
        console.warn('Collab WS Error:', err);
      };
    } catch (err) {
      console.error('Failed to create WebSocket:', err);
    }
  }

  private handleServerMessage(msg: any) {
    switch (msg.type) {
      case 'room_state': {
        this.userCount = msg.usersCount || 1;
        this.emit({
          type: 'init',
          data: {
            strokes: msg.strokes || [],
            codeBlocks: msg.codeBlocks || [],
            usersCount: this.userCount
          }
        });
        break;
      }
      case 'stroke_added': {
        this.emit({ type: 'stroke_added', data: msg.stroke });
        break;
      }
      case 'strokes_updated': {
        this.emit({ type: 'strokes_updated', data: msg.strokes });
        break;
      }
      case 'code_block_created': {
        this.emit({ type: 'code_block_created', data: msg.block });
        break;
      }
      case 'code_block_updated': {
        this.emit({ type: 'code_block_updated', data: msg.block });
        break;
      }
      case 'code_block_deleted': {
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
        console.error('Failed to send WS message:', err);
      }
    }
  }

  public sendStroke(stroke: Stroke) {
    if (!this.currentRoomId) return;
    this.send({
      type: 'stroke_add',
      roomId: this.currentRoomId,
      stroke
    });
  }

  public sendStrokesUpdate(strokes: Stroke[]) {
    if (!this.currentRoomId) return;
    this.send({
      type: 'strokes_update',
      roomId: this.currentRoomId,
      strokes
    });
  }

  public sendCodeBlockCreate(block: CodeBlockItem) {
    if (!this.currentRoomId) return;
    this.send({
      type: 'code_block_create',
      roomId: this.currentRoomId,
      block
    });
  }

  public sendCodeBlockUpdate(block: CodeBlockItem) {
    if (!this.currentRoomId) return;
    this.send({
      type: 'code_block_update',
      roomId: this.currentRoomId,
      block
    });
  }

  public sendCodeBlockDelete(blockId: string) {
    if (!this.currentRoomId) return;
    this.send({
      type: 'code_block_delete',
      roomId: this.currentRoomId,
      blockId
    });
  }

  public sendCursor(x: number, y: number) {
    if (!this.currentRoomId || !this.isConnected) return;
    const now = Date.now();
    // Throttle to 30fps
    if (now - this.lastCursorSend < 33) return;
    this.lastCursorSend = now;

    this.send({
      type: 'cursor_move',
      roomId: this.currentRoomId,
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

  public disconnect() {
    this.currentRoomId = null;
    clearTimeout(this.reconnectTimer);
    if (this.ws) {
      try {
        this.ws.close();
      } catch (_) {}
      this.ws = null;
    }
    this.remoteCursors.clear();
  }
}

export const collab = new CollaborationService();
