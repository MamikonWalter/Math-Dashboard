import { spawn } from 'child_process';

export default function handler(req: any, res: any) {
  // Allow CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

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

  const MAX_OUTPUT = 65536;

  const timeout = setTimeout(() => {
    isKilled = true;
    try {
      child.kill('SIGKILL');
    } catch (_) {}
  }, 6000);

  child.stdout.on('data', (chunk) => {
    if (stdout.length < MAX_OUTPUT) {
      stdout += chunk.toString('utf-8');
      if (stdout.length >= MAX_OUTPUT) {
        stdout += '\n... [Вывод обрезан]';
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
        error: 'Таймаут выполнения (6 секунд).',
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

  child.on('close', (exitCode) => finish(exitCode));
  child.on('error', (err) => finish(null, `Не удалось запустить процесс Python: ${err.message}`));

  try {
    child.stdin.write(code);
    child.stdin.end();
  } catch (err: any) {
    finish(null, `Ошибка записи: ${err.message}`);
  }
}
