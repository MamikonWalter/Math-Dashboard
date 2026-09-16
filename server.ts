import express from 'express';
import http from 'http';
import path from 'path';
import fs from 'fs';
import { spawn } from 'child_process';
import { WebSocketServer, WebSocket } from 'ws';
import { createServer as createViteServer } from 'vite';

interface Stroke {
  points: { x: number; y: number }[];
  color: string;
  width: number;
  height?: number;
  tool: string;
  imageUrl?: string;
  text?: string;
  textWidth?: number;
  rotation?: number;
}

interface CodeBlockItem {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
  title: string;
  code: string;
  output?: string;
  isMinimized?: boolean;
}

interface RoomState {
  id: string;
  createdAt: number;
  updatedAt: number;
  strokes: Stroke[];
  codeBlocks: CodeBlockItem[];
}

interface ClientMeta {
  ws: WebSocket;
  roomId?: string;
  userId: string;
  userName: string;
  color: string;
}

const DATA_DIR = path.join(process.cwd(), 'data');
const DATA_FILE = path.join(DATA_DIR, 'rooms.json');

// Ensure data directory exists
if (!fs.existsSync(DATA_DIR)) {
  try {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  } catch (err) {
    console.error('Failed to create data dir:', err);
  }
}

// In-memory rooms cache
const rooms = new Map<string, RoomState>();

// Load rooms from disk if available
function loadRoomsFromDisk() {
  try {
    if (fs.existsSync(DATA_FILE)) {
      const content = fs.readFileSync(DATA_FILE, 'utf-8');
      const parsed: Record<string, RoomState> = JSON.parse(content);
      Object.entries(parsed).forEach(([id, r]) => {
        rooms.set(id.toUpperCase(), r);
      });
      console.log(`[Server] Loaded ${rooms.size} rooms from disk.`);
    }
  } catch (e) {
    console.error('[Server] Could not load rooms from disk:', e);
  }
}

// Debounced save to disk
let saveTimeout: NodeJS.Timeout | null = null;
function scheduleSave() {
  if (saveTimeout) clearTimeout(saveTimeout);
  saveTimeout = setTimeout(() => {
    try {
      const obj: Record<string, RoomState> = {};
      rooms.forEach((r, id) => {
        obj[id] = r;
      });
      fs.writeFileSync(DATA_FILE, JSON.stringify(obj, null, 2), 'utf-8');
    } catch (e) {
      console.error('[Server] Could not save rooms to disk:', e);
    }
  }, 2000);
}

loadRoomsFromDisk();

function generateRoomCode(): string {
  const chars = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';
  let code = 'WB-';
  for (let i = 0; i < 4; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  if (rooms.has(code)) {
    return generateRoomCode();
  }
  return code;
}

async function startServer() {
  const app = express();
  const server = http.createServer(app);
  const PORT = 3000;

  app.use(express.json({ limit: '20mb' }));

  // API Routes
  app.get('/api/health', (req, res) => {
    res.json({ status: 'ok', activeRooms: rooms.size });
  });

  // Check if room exists
  app.get('/api/rooms/:id', (req, res) => {
    const rawId = (req.params.id || '').trim().toUpperCase();
    const room = rooms.get(rawId);
    if (!room) {
      return res.json({ exists: false, error: 'Доска с таким кодом не найдена' });
    }
    return res.json({
      exists: true,
      room: {
        id: room.id,
        createdAt: room.createdAt,
        updatedAt: room.updatedAt,
        strokesCount: room.strokes.length,
        codeBlocksCount: room.codeBlocks.length,
      }
    });
  });

  // Create new room
  app.post('/api/rooms', (req, res) => {
    const customCode = req.body?.code ? String(req.body.code).trim().toUpperCase() : null;
    let roomId = customCode || generateRoomCode();

    // If custom code requested and already exists (unless reset is requested)
    if (customCode && rooms.has(customCode) && !req.body?.reset) {
      return res.json({ id: customCode, existed: true });
    }

    const newRoom: RoomState = {
      id: roomId,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      strokes: [],
      codeBlocks: [],
    };
    rooms.set(roomId, newRoom);
    scheduleSave();
    return res.json({ id: roomId, created: true });
  });

  // Execute Python Code via native Python 3 with timeout and output limit
  app.post('/api/run-python', (req, res) => {
    const code = typeof req.body?.code === 'string' ? req.body.code : '';
    if (!code.trim()) {
      return res.json({ success: true, stdout: '', stderr: '', executionTimeMs: 0 });
    }

    const startTime = Date.now();
    let stdout = '';
    let stderr = '';
    let isKilled = false;
    let responded = false;

    const child = spawn('python3', ['-u', '-'], {
      env: {
        ...process.env,
        PYTHONIOENCODING: 'utf-8',
        PYTHONUNBUFFERED: '1',
        LC_ALL: 'C.UTF-8'
      }
    });

    const MAX_OUTPUT = 65536; // 64 KB limit

    const timeout = setTimeout(() => {
      isKilled = true;
      try {
        child.kill('SIGKILL');
      } catch (_) {}
    }, 6000); // 6 sec timeout

    child.stdout.on('data', (chunk) => {
      if (stdout.length < MAX_OUTPUT) {
        stdout += chunk.toString('utf-8');
        if (stdout.length >= MAX_OUTPUT) {
          stdout += '\n... [Вывод превысил лимит 64КБ и был обрезан]';
          try { child.kill('SIGTERM'); } catch (_) {}
        }
      }
    });

    child.stderr.on('data', (chunk) => {
      if (stderr.length < MAX_OUTPUT) {
        stderr += chunk.toString('utf-8');
      }
    });

    const finish = (codeNum: number | null, errMsg?: string) => {
      if (responded) return;
      responded = true;
      clearTimeout(timeout);
      const elapsed = Date.now() - startTime;
      if (isKilled) {
        return res.json({
          success: false,
          error: 'Таймаут выполнения (6 секунд). Возможно, в коде бесконечный цикл.',
          stdout,
          stderr: stderr || 'Execution timed out',
          executionTimeMs: elapsed
        });
      }
      if (errMsg) {
        return res.json({
          success: false,
          error: errMsg,
          stdout,
          stderr: stderr || errMsg,
          executionTimeMs: elapsed
        });
      }
      return res.json({
        success: codeNum === 0,
        exitCode: codeNum,
        stdout,
        stderr,
        executionTimeMs: elapsed
      });
    };

    child.on('close', (exitCode) => {
      finish(exitCode);
    });

    child.on('error', (err) => {
      finish(null, `Не удалось запустить процесс Python 3: ${err.message}`);
    });

    try {
      child.stdin.write(code);
      child.stdin.end();
    } catch (writeErr: any) {
      finish(null, `Ошибка записи в процесс: ${writeErr.message}`);
    }
  });

  // WebSocket Server with explicit upgrade routing for /ws, /api/ws, and /
  const wss = new WebSocketServer({ noServer: true });
  const clients = new Map<WebSocket, ClientMeta>();

  server.on('upgrade', (request, socket, head) => {
    try {
      const host = request.headers.host || 'localhost';
      const parsedUrl = new URL(request.url || '/', `http://${host}`);
      const pathname = parsedUrl.pathname;

      if (pathname === '/ws' || pathname === '/api/ws' || pathname === '/' || pathname.startsWith('/ws/')) {
        wss.handleUpgrade(request, socket, head, (ws) => {
          wss.emit('connection', ws, request);
        });
      } else {
        socket.destroy();
      }
    } catch (err) {
      socket.destroy();
    }
  });

  // Heartbeat keep-alive every 20s to prevent Cloud Run proxy disconnects
  const heartbeatInterval = setInterval(() => {
    wss.clients.forEach((ws: any) => {
      if (ws.isAlive === false) {
        return ws.terminate();
      }
      ws.isAlive = false;
      try {
        ws.ping();
      } catch (_) {}
    });
  }, 20000);

  const AVATAR_COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#ec4899', '#8b5cf6', '#06b6d4', '#f97316'];

  function getRoomClients(roomId: string): WebSocket[] {
    const roomClients: WebSocket[] = [];
    clients.forEach((meta, ws) => {
      if (meta.roomId === roomId && ws.readyState === WebSocket.OPEN) {
        roomClients.push(ws);
      }
    });
    return roomClients;
  }

  function broadcastToRoom(roomId: string, message: any, excludeWs?: WebSocket) {
    const data = JSON.stringify(message);
    clients.forEach((meta, ws) => {
      if (meta.roomId === roomId && ws !== excludeWs && ws.readyState === WebSocket.OPEN) {
        try {
          ws.send(data);
        } catch (err) {
          console.error('[WS] Broadcast error:', err);
        }
      }
    });
  }

  function notifyUserCount(roomId: string) {
    const count = getRoomClients(roomId).length;
    broadcastToRoom(roomId, { type: 'users_count', count });
  }

  wss.on('connection', (ws) => {
    const randomColor = AVATAR_COLORS[Math.floor(Math.random() * AVATAR_COLORS.length)];
    const meta: ClientMeta = {
      ws,
      userId: 'u_' + Math.random().toString(36).substring(2, 9),
      userName: 'Гость ' + Math.floor(100 + Math.random() * 900),
      color: randomColor,
    };
    clients.set(ws, meta);

    ws.on('message', (rawData) => {
      try {
        const msg = JSON.parse(rawData.toString());
        if (!msg || typeof msg !== 'object') return;

        switch (msg.type) {
          case 'join_room': {
            const rawRoomId = String(msg.roomId || '').trim().toUpperCase();
            if (!rawRoomId) {
              ws.send(JSON.stringify({ type: 'error', message: 'Код комнаты не указан' }));
              return;
            }

            let room = rooms.get(rawRoomId);
            if (!room) {
              // Auto-create room if user specified it
              room = {
                id: rawRoomId,
                createdAt: Date.now(),
                updatedAt: Date.now(),
                strokes: [],
                codeBlocks: []
              };
              rooms.set(rawRoomId, room);
              scheduleSave();
            }

            // If the room on the server is currently empty (e.g. server restarted or room is fresh),
            // and the client joined with existing strokes/codeBlocks from Firestore/localStorage,
            // populate the server room state!
            if (room.strokes.length === 0 && Array.isArray(msg.strokes) && msg.strokes.length > 0) {
              room.strokes = msg.strokes;
              if (Array.isArray(msg.codeBlocks) && msg.codeBlocks.length > 0) {
                room.codeBlocks = msg.codeBlocks;
              }
              room.updatedAt = Date.now();
              scheduleSave();
            }

            meta.roomId = rawRoomId;
            if (msg.userName) meta.userName = String(msg.userName).slice(0, 30);
            if (msg.userId) meta.userId = String(msg.userId);

            // Send full room state to the newly joined client
            ws.send(JSON.stringify({
              type: 'room_state',
              roomId: room.id,
              strokes: room.strokes,
              codeBlocks: room.codeBlocks,
              userId: meta.userId,
              userColor: meta.color,
              userName: meta.userName,
              usersCount: getRoomClients(rawRoomId).length
            }));

            // Notify everyone in the room about updated user count
            notifyUserCount(rawRoomId);
            break;
          }

          case 'ping': {
            ws.send(JSON.stringify({ type: 'pong' }));
            break;
          }

          case 'stroke_add':
          case 'stroke_added': {
            if (!meta.roomId) return;
            const room = rooms.get(meta.roomId);
            if (!room || !msg.stroke) return;

            room.strokes.push(msg.stroke);
            room.updatedAt = Date.now();
            scheduleSave();

            // Broadcast to other peers in the room immediately
            broadcastToRoom(meta.roomId, {
              type: 'stroke_added',
              stroke: msg.stroke,
              senderId: meta.userId
            }, ws);
            break;
          }

          case 'live_stroke': {
            if (!meta.roomId || !msg.stroke) return;
            broadcastToRoom(meta.roomId, {
              type: 'live_stroke',
              userId: meta.userId,
              userName: meta.userName,
              color: meta.color,
              stroke: msg.stroke
            }, ws);
            break;
          }

          case 'live_stroke_end': {
            if (!meta.roomId) return;
            broadcastToRoom(meta.roomId, {
              type: 'live_stroke_end',
              userId: meta.userId
            }, ws);
            break;
          }

          case 'strokes_update':
          case 'strokes_updated': {
            if (!meta.roomId) return;
            const room = rooms.get(meta.roomId);
            if (!room || !Array.isArray(msg.strokes)) return;

            room.strokes = msg.strokes;
            room.updatedAt = Date.now();
            scheduleSave();

            broadcastToRoom(meta.roomId, {
              type: 'strokes_updated',
              strokes: room.strokes,
              senderId: meta.userId
            }, ws);
            break;
          }

          case 'code_block_create':
          case 'code_block_created': {
            if (!meta.roomId) return;
            const room = rooms.get(meta.roomId);
            if (!room || !msg.block) return;

            // Remove existing block with same id if any (idempotency)
            room.codeBlocks = room.codeBlocks.filter(b => b.id !== msg.block.id);
            room.codeBlocks.push(msg.block);
            room.updatedAt = Date.now();
            scheduleSave();

            broadcastToRoom(meta.roomId, {
              type: 'code_block_created',
              block: msg.block,
              senderId: meta.userId
            }, ws);
            break;
          }

          case 'code_block_update':
          case 'code_block_updated': {
            if (!meta.roomId) return;
            const room = rooms.get(meta.roomId);
            if (!room || !msg.block) return;

            room.codeBlocks = room.codeBlocks.map(b => b.id === msg.block.id ? { ...b, ...msg.block } : b);
            room.updatedAt = Date.now();
            scheduleSave();

            broadcastToRoom(meta.roomId, {
              type: 'code_block_updated',
              block: msg.block,
              senderId: meta.userId
            }, ws);
            break;
          }

          case 'code_block_delete':
          case 'code_block_deleted': {
            if (!meta.roomId) return;
            const room = rooms.get(meta.roomId);
            if (!room || !msg.blockId) return;

            room.codeBlocks = room.codeBlocks.filter(b => b.id !== msg.blockId);
            room.updatedAt = Date.now();
            scheduleSave();

            broadcastToRoom(meta.roomId, {
              type: 'code_block_deleted',
              blockId: msg.blockId,
              senderId: meta.userId
            }, ws);
            break;
          }

          case 'cursor_move': {
            if (!meta.roomId) return;
            broadcastToRoom(meta.roomId, {
              type: 'user_cursor',
              userId: meta.userId,
              userName: meta.userName,
              color: meta.color,
              x: msg.x,
              y: msg.y
            }, ws);
            break;
          }
        }
      } catch (err) {
        console.error('[WS] Error processing message:', err);
      }
    });

    ws.on('close', () => {
      const rId = meta.roomId;
      clients.delete(ws);
      if (rId) {
        notifyUserCount(rId);
        broadcastToRoom(rId, {
          type: 'cursor_remove',
          userId: meta.userId
        });
      }
    });
  });

  // Vite middleware in dev, static files in prod
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.use((req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  server.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
