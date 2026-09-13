import Peer, { DataConnection } from 'peerjs';
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
  // Transport layers: WebRTC Peer-to-Peer (cross-device on Vercel), WebSocket (when Node is running), BroadcastChannel (same browser)
  private peer: Peer | null = null;
  private peerConnections: Map<string, DataConnection> = new Map();
  private hostConnection: DataConnection | null = null;
  private isPeerHost: boolean = false;
  private p2pConnected: boolean = false;

  private ws: WebSocket | null = null;
  private bc: BroadcastChannel | null = null;

  private currentRoomId: string | null = null;
  private userId: string = 'u_' + Math.random().toString(36).substring(2, 9);
  private userName: string = 'Участник ' + Math.floor(100 + Math.random() * 900);
  private userColor: string = ['#3b82f6', '#10b981', '#f59e0b', '#ec4899', '#8b5cf6', '#06b6d4'][Math.floor(Math.random() * 6)];

  private listeners: Set<CollabEventCallback> = new Set();
  private remoteCursors: Map<string, RemoteCursor> = new Map();
  private reconnectTimer: any = null;
  private retryAttempts: number = 0;
  private maxRetryAttempts: number = 3;
  private isConnected: boolean = false;
  private userCount: number = 1;
  private lastCursorSend: number = 0;

  // In-memory cache of current room strokes and blocks for instant syncing and local persistence
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

    // 1. Load any existing local data for this room first as fallback
    try {
      const saved = localStorage.getItem(`mathters_room_${this.currentRoomId}`);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed.strokes)) this.currentStrokes = parsed.strokes;
        if (Array.isArray(parsed.codeBlocks)) this.currentBlocks = parsed.codeBlocks;
      }
    } catch (_) {}

    // 2. Setup BroadcastChannel for zero-server real-time tab-to-tab sync
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
        console.warn('BroadcastChannel failed', e);
      }
    }

    // 3. Setup WebRTC Peer-to-Peer for Cross-Device Synchronization on Vercel
    this.initPeerToPeer();

    // 4. Try WebSocket connection as fallback/parallel if a Node server is active
    this.initWebSocket();
  }

  // ----------------------------------------------------
  // WebRTC Peer-to-Peer Cross-Device Synchronization
  // ----------------------------------------------------
  private initPeerToPeer() {
    if (!this.currentRoomId) return;

    this.cleanupPeer();

    const normalizedRoom = this.currentRoomId.toLowerCase().replace(/[^a-z0-9]/g, '');
    const hostPeerId = `mathters-host-${normalizedRoom}`;

    const peerConfig = {
      config: {
        iceServers: [
          { urls: 'stun:stun.l.google.com:19302' },
          { urls: 'stun:global.stun.twilio.com:3478' }
        ]
      }
    };

    try {
      // Step A: Attempt to claim Host role with the deterministic room host ID
      const hostPeer = new Peer(hostPeerId, peerConfig);

      hostPeer.on('open', (id) => {
        this.peer = hostPeer;
        this.isPeerHost = true;
        this.p2pConnected = true;
        this.emit({ type: 'connection_status', data: 'online' });
        this.updateP2PUserCount();

        // Listen for incoming peer connections from phones, tablets, or other PCs
        hostPeer.on('connection', (conn) => {
          this.handleIncomingConnection(conn);
        });
      });

      hostPeer.on('error', (err: any) => {
        // If ID is already taken (err.type === 'unavailable-id'), another device is already the Host!
        // Join that existing host as a client peer.
        if (err.type === 'unavailable-id') {
          hostPeer.destroy();
          this.connectAsClientPeer(hostPeerId, peerConfig);
        } else {
          console.warn('P2P Host error:', err);
        }
      });
    } catch (e) {
      console.warn('Failed to initialize Peer:', e);
    }
  }

  private connectAsClientPeer(hostPeerId: string, peerConfig: any) {
    try {
      const clientPeer = new Peer(peerConfig);

      clientPeer.on('open', () => {
        this.peer = clientPeer;
        this.isPeerHost = false;

        const conn = clientPeer.connect(hostPeerId, {
          reliable: true
        });

        conn.on('open', () => {
          this.hostConnection = conn;
          this.p2pConnected = true;
          this.emit({ type: 'connection_status', data: 'online' });

          // Announce presence to host
          conn.send({
            type: 'join_room',
            userId: this.userId,
            userName: this.userName,
            color: this.userColor
          });
        });

        conn.on('data', (data: any) => {
          this.handleIncomingData(data);
        });

        conn.on('close', () => {
          this.hostConnection = null;
          this.p2pConnected = false;
          // If host disconnects, attempt to claim host status
          setTimeout(() => {
            if (this.currentRoomId) this.initPeerToPeer();
          }, 1500);
        });

        conn.on('error', (e) => {
          console.warn('P2P connection error:', e);
        });
      });

      clientPeer.on('error', (err) => {
        console.warn('P2P client error:', err);
      });
    } catch (e) {
      console.warn('Failed to connect as client peer:', e);
    }
  }

  private handleIncomingConnection(conn: DataConnection) {
    const peerId = conn.peer;
    this.peerConnections.set(peerId, conn);

    conn.on('open', () => {
      this.updateP2PUserCount();

      // Send the current whiteboard state (all strokes and Python code blocks) to newly joined device
      conn.send({
        type: 'room_state',
        strokes: this.currentStrokes,
        codeBlocks: this.currentBlocks,
        usersCount: this.peerConnections.size + 1
      });
    });

    conn.on('data', (data: any) => {
      // Process data locally on host
      this.handleIncomingData(data);

      // Relay change to all other connected peers (mesh broadcast)
      this.peerConnections.forEach((otherConn, otherId) => {
        if (otherId !== peerId && otherConn.open) {
          try {
            otherConn.send(data);
          } catch (_) {}
        }
      });
    });

    conn.on('close', () => {
      this.peerConnections.delete(peerId);
      this.updateP2PUserCount();
    });

    conn.on('error', () => {
      this.peerConnections.delete(peerId);
      this.updateP2PUserCount();
    });
  }

  private updateP2PUserCount() {
    const count = this.isPeerHost ? this.peerConnections.size + 1 : 2;
    this.userCount = count;
    this.emit({ type: 'users_count', data: count });

    // Broadcast count to all peers
    if (this.isPeerHost) {
      this.peerConnections.forEach(c => {
        if (c.open) {
          c.send({ type: 'users_count', count });
        }
      });
    }
  }

  private cleanupPeer() {
    this.isPeerHost = false;
    this.p2pConnected = false;
    if (this.hostConnection) {
      try { this.hostConnection.close(); } catch (_) {}
      this.hostConnection = null;
    }
    this.peerConnections.forEach(conn => {
      try { conn.close(); } catch (_) {}
    });
    this.peerConnections.clear();
    if (this.peer) {
      try { this.peer.destroy(); } catch (_) {}
      this.peer = null;
    }
  }

  // ----------------------------------------------------
  // WebSocket Transport Layer (Container / Node.js mode)
  // ----------------------------------------------------
  private initWebSocket() {
    if (this.ws) {
      try { this.ws.close(); } catch (_) {}
      this.ws = null;
    }

    if (this.retryAttempts >= this.maxRetryAttempts) {
      return;
    }

    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${protocol}//${window.location.host}`;

    try {
      this.ws = new WebSocket(wsUrl);

      this.ws.onopen = () => {
        this.isConnected = true;
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
          this.handleIncomingData(msg);
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
        }
      };

      this.ws.onerror = () => {
        // Silently handled - P2P or local channel takes over
      };
    } catch (err) {
      // WS unavailable, no problem
    }
  }

  // ----------------------------------------------------
  // Universal Message Handling
  // ----------------------------------------------------
  private handleLocalMessage(msg: any) {
    if (!msg || msg.senderId === this.userId) return;
    this.handleIncomingData(msg);
  }

  private handleIncomingData(msg: any) {
    if (!msg) return;

    switch (msg.type) {
      case 'room_state': {
        this.userCount = msg.usersCount || this.userCount || 1;
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
      case 'cursor_move':
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

  // ----------------------------------------------------
  // Outgoing Message Dispatch (sends across P2P, WS, BC)
  // ----------------------------------------------------
  private send(msg: any) {
    const payload = { ...msg, senderId: this.userId };

    // 1. Send via WebRTC P2P (Cross-Device on Vercel)
    if (this.isPeerHost) {
      this.peerConnections.forEach(conn => {
        if (conn.open) {
          try { conn.send(payload); } catch (_) {}
        }
      });
    } else if (this.hostConnection && this.hostConnection.open) {
      try { this.hostConnection.send(payload); } catch (_) {}
    }

    // 2. Send via WebSocket (if Node container active)
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      try {
        this.ws.send(JSON.stringify(payload));
      } catch (_) {}
    }

    // 3. Broadcast to other tabs on same machine
    if (this.bc) {
      try {
        this.bc.postMessage(payload);
      } catch (_) {}
    }
  }

  public sendStroke(stroke: Stroke) {
    if (!this.currentRoomId) return;
    this.currentStrokes.push(stroke);
    this.saveToLocalStorage();
    this.send({
      type: 'stroke_added',
      roomId: this.currentRoomId,
      stroke
    });
  }

  public sendStrokesUpdate(strokes: Stroke[]) {
    if (!this.currentRoomId) return;
    this.currentStrokes = strokes;
    this.saveToLocalStorage();
    this.send({
      type: 'strokes_updated',
      roomId: this.currentRoomId,
      strokes
    });
  }

  public sendCodeBlockCreate(block: CodeBlockItem) {
    if (!this.currentRoomId) return;
    this.currentBlocks = [...this.currentBlocks.filter(b => b.id !== block.id), block];
    this.saveToLocalStorage();
    this.send({
      type: 'code_block_created',
      roomId: this.currentRoomId,
      block
    });
  }

  public sendCodeBlockUpdate(block: CodeBlockItem) {
    if (!this.currentRoomId) return;
    this.currentBlocks = this.currentBlocks.map(b => b.id === block.id ? { ...b, ...block } : b);
    this.saveToLocalStorage();
    this.send({
      type: 'code_block_updated',
      roomId: this.currentRoomId,
      block
    });
  }

  public sendCodeBlockDelete(blockId: string) {
    if (!this.currentRoomId) return;
    this.currentBlocks = this.currentBlocks.filter(b => b.id !== blockId);
    this.saveToLocalStorage();
    this.send({
      type: 'code_block_deleted',
      roomId: this.currentRoomId,
      blockId
    });
  }

  public sendCursor(x: number, y: number) {
    if (!this.currentRoomId) return;
    const now = Date.now();
    if (now - this.lastCursorSend < 33) return; // 30 fps
    this.lastCursorSend = now;

    this.send({
      type: 'cursor_move',
      roomId: this.currentRoomId,
      userId: this.userId,
      userName: this.userName,
      color: this.userColor,
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
    return this.isConnected || this.p2pConnected;
  }

  public disconnect() {
    this.currentRoomId = null;
    clearTimeout(this.reconnectTimer);
    this.cleanupPeer();
    if (this.ws) {
      try { this.ws.close(); } catch (_) {}
      this.ws = null;
    }
    if (this.bc) {
      try { this.bc.close(); } catch (_) {}
      this.bc = null;
    }
    this.remoteCursors.clear();
  }
}

export const collab = new CollaborationService();
