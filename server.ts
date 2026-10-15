import express from 'express';
import http from 'http';
import path from 'path';
import { spawn } from 'child_process';
import { createServer as createViteServer } from 'vite';

async function startServer() {
  const app = express();
  const server = http.createServer(app);
  const PORT = 3000;

  app.use(express.json({ limit: '20mb' }));

  // Health check
  app.get('/api/health', (_req, res) => {
    res.json({ status: 'ok' });
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
    app.use((_req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  server.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
