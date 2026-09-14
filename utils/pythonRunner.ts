export interface PythonRunResult {
  success: boolean;
  output: string;
  executionTimeMs: number;
  engine: 'server' | 'pyodide';
  error?: string;
}

let pyodidePromise: Promise<any> | null = null;

/**
 * Lazily loads and initializes Pyodide WebAssembly in the browser as client-side fallback
 */
async function getPyodide(): Promise<any> {
  if (typeof window === 'undefined') {
    throw new Error('Pyodide can only run in browser environment');
  }

  if ((window as any)._pyodideInstance) {
    return (window as any)._pyodideInstance;
  }

  if (!pyodidePromise) {
    pyodidePromise = (async () => {
      if (!(window as any).loadPyodide) {
        await new Promise<void>((resolve, reject) => {
          const script = document.createElement('script');
          script.src = 'https://cdn.jsdelivr.net/pyodide/v0.26.2/full/pyodide.js';
          script.async = true;
          script.onload = () => resolve();
          script.onerror = () => reject(new Error('Не удалось загрузить Pyodide WebAssembly'));
          document.head.appendChild(script);
        });
      }

      const pyodide = await (window as any).loadPyodide({
        indexURL: 'https://cdn.jsdelivr.net/pyodide/v0.26.2/full/'
      });

      (window as any)._pyodideInstance = pyodide;
      return pyodide;
    })();
  }

  return pyodidePromise;
}

/**
 * Executes Python code using native Python 3 on the backend server,
 * with automatic seamless fallback to Pyodide WebAssembly if the server is offline.
 */
export async function executePythonCode(
  code: string,
  onStatusUpdate?: (status: string) => void
): Promise<PythonRunResult> {
  const startTime = performance.now();

  if (!code || !code.trim()) {
    return {
      success: true,
      output: '(Код пуст)',
      executionTimeMs: 0,
      engine: 'server'
    };
  }

  // 1. Primary: Run on backend server via Python 3.10
  try {
    if (onStatusUpdate) onStatusUpdate('Выполнение на сервере Python 3...');

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 8000);

    const res = await fetch('/api/run-python', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code }),
      signal: controller.signal
    });

    clearTimeout(timeoutId);

    if (res.ok) {
      const data = await res.json();
      const elapsed = Math.round(data.executionTimeMs ?? (performance.now() - startTime));

      const stdout = (data.stdout || '').trimEnd();
      const stderr = (data.stderr || '').trimEnd();
      const isSuccess = data.success !== false;

      let resultText = '';
      if (stdout && stderr) {
        resultText = `${stdout}\n\n[Предупреждения/Ошибки]:\n${stderr}`;
      } else if (stdout) {
        resultText = stdout;
      } else if (stderr) {
        resultText = stderr;
      } else if (data.error) {
        resultText = data.error;
      } else {
        resultText = '(Программа успешно выполнена без вывода)';
      }

      const header = isSuccess 
        ? `✓ Выполнено [Python 3] за ${elapsed}мс` 
        : `❌ Ошибка выполнения [Python 3] (${elapsed}мс)`;

      return {
        success: isSuccess,
        output: `${header}\n${resultText}`,
        executionTimeMs: elapsed,
        engine: 'server',
        error: isSuccess ? undefined : (stderr || data.error)
      };
    }
  } catch (err: any) {
    console.warn('[Python Runner] Backend execution failed or offline, falling back to Pyodide:', err.message);
  }

  // 2. Fallback: Run in-browser via Pyodide WebAssembly
  try {
    if (onStatusUpdate) onStatusUpdate('Запуск Pyodide WebAssembly Python...');
    const pyodide = await getPyodide();

    let stdout = '';
    let stderr = '';

    pyodide.setStdout({
      batched: (msg: string) => {
        stdout += (stdout ? '\n' : '') + msg;
      }
    });

    pyodide.setStderr({
      batched: (msg: string) => {
        stderr += (stderr ? '\n' : '') + msg;
      }
    });

    const pyStartTime = performance.now();
    await pyodide.runPythonAsync(code);
    const elapsed = Math.round(performance.now() - pyStartTime);

    const outStr = stdout.trimEnd();
    const errStr = stderr.trimEnd();

    let resultText = '';
    if (outStr && errStr) {
      resultText = `${outStr}\n\n[stderr]:\n${errStr}`;
    } else if (outStr) {
      resultText = outStr;
    } else if (errStr) {
      resultText = errStr;
    } else {
      resultText = '(Программа успешно выполнена без вывода)';
    }

    return {
      success: true,
      output: `✓ Выполнено [Pyodide WebAssembly] за ${elapsed}мс\n${resultText}`,
      executionTimeMs: elapsed,
      engine: 'pyodide'
    };
  } catch (err: any) {
    const elapsed = Math.round(performance.now() - startTime);
    const errMsg = err.message || String(err);
    return {
      success: false,
      output: `❌ Ошибка выполнения:\n${errMsg}`,
      executionTimeMs: elapsed,
      engine: 'pyodide',
      error: errMsg
    };
  }
}
