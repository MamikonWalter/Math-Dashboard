import React, { useState, useRef, useEffect, useCallback } from 'react';
import { 
  Play, 
  Copy, 
  Check, 
  Trash2, 
  ChevronDown, 
  ChevronUp, 
  Terminal, 
  RotateCcw,
  Sparkles,
  GripHorizontal,
  FileCode2
} from 'lucide-react';
import { CodeBlockItem } from '../types';

interface PythonCodeBlockProps {
  block: CodeBlockItem;
  scale: number;
  screenPos: { x: number; y: number };
  isDarkMode: boolean;
  onUpdate: (updated: Partial<CodeBlockItem>) => void;
  onDelete: () => void;
  onDragStart: (e: React.MouseEvent | React.TouchEvent) => void;
  onResizeStart: (e: React.MouseEvent | React.TouchEvent) => void;
  isActive: boolean;
  onFocus: () => void;
}

// Preset examples for quick math & algorithm experimentation
const PYTHON_PRESETS = [
  {
    name: 'Квадратное уравнение',
    code: `# Решение квадратного уравнения: ax² + bx + c = 0
import math

a, b, c = 1, -5, 6
d = b**2 - 4*a*c

print(f"Уравнение: {a}x² + ({b})x + ({c}) = 0")
print(f"Дискриминант D = {d}")

if d > 0:
    x1 = (-b + math.sqrt(d)) / (2*a)
    x2 = (-b - math.sqrt(d)) / (2*a)
    print(f"Два корня: x₁ = {x1}, x₂ = {x2}")
elif d == 0:
    x = -b / (2*a)
    print(f"Один корень: x = {x}")
else:
    print("Действительных корней нет")
`
  },
  {
    name: 'Тригонометрия и функции',
    code: `# Расчет значений тригонометрических функций
import math

angles_deg = [0, 30, 45, 60, 90, 180]

print("Угол (°) |   sin(x)  |   cos(x)")
print("-" * 32)
for deg in angles_deg:
    rad = math.radians(deg)
    s = round(math.sin(rad), 4)
    c = round(math.cos(rad), 4)
    print(f"{deg:7d}° | {s:9.4f} | {c:8.4f}")
`
  },
  {
    name: 'Числа Фибоначчи',
    code: `# Генерация первых N чисел Фибоначчи
def fibonacci(n):
    seq = [0, 1]
    while len(seq) < n:
        seq.append(seq[-1] + seq[-2])
    return seq

n = 12
fibs = fibonacci(n)
print(f"Первые {n} чисел Фибоначчи:")
print(fibs)
print(f"Сумма: {sum(fibs)}")
`
  },
  {
    name: 'Простые числа (Решето)',
    code: `# Поиск простых чисел до N
def find_primes(limit):
    primes = []
    for num in range(2, limit + 1):
        is_prime = True
        for i in range(2, int(num**0.5) + 1):
            if num % i == 0:
                is_prime = False
                break
        if is_prime:
            primes.append(num)
    return primes

primes = find_primes(50)
print("Простые числа до 50:")
print(primes)
print(f"Количество: {len(primes)}")
`
  }
];

export const PythonCodeBlock: React.FC<PythonCodeBlockProps> = ({
  block,
  scale,
  screenPos,
  isDarkMode,
  onUpdate,
  onDelete,
  onDragStart,
  onResizeStart,
  isActive,
  onFocus
}) => {
  const [copied, setCopied] = useState(false);
  const [isRunning, setIsRunning] = useState(false);
  const [showPresets, setShowPresets] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const preRef = useRef<HTMLPreElement>(null);

  // Sync scroll between textarea and highlighted code overlay
  const handleScroll = () => {
    if (textareaRef.current && preRef.current) {
      preRef.current.scrollTop = textareaRef.current.scrollTop;
      preRef.current.scrollLeft = textareaRef.current.scrollLeft;
    }
  };

  const handleCopy = async (e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      await navigator.clipboard.writeText(block.code);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Fallback
      const el = document.createElement('textarea');
      el.value = block.code;
      document.body.appendChild(el);
      el.select();
      document.execCommand('copy');
      document.body.removeChild(el);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  // Keyboard ergonomics: Tab indentation, Enter auto-indent, Auto-closing brackets & quotes
  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    // Run on Ctrl+Enter / Cmd+Enter
    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
      e.preventDefault();
      runPythonCode();
      return;
    }

    const target = e.currentTarget;
    const start = target.selectionStart;
    const end = target.selectionEnd;
    const code = block.code;

    // Tab indentation
    if (e.key === 'Tab') {
      e.preventDefault();
      const spaces = '    ';
      const newCode = code.substring(0, start) + spaces + code.substring(end);
      onUpdate({ code: newCode });

      setTimeout(() => {
        if (textareaRef.current) {
          textareaRef.current.selectionStart = textareaRef.current.selectionEnd = start + 4;
        }
      }, 0);
      return;
    }

    // Auto-closing brackets and quotes pairs
    const PAIRS: Record<string, string> = {
      '(': ')',
      '[': ']',
      '{': '}',
      '"': '"',
      "'": "'"
    };

    // If an opening bracket or quote is typed
    if (PAIRS[e.key] && !e.ctrlKey && !e.metaKey && !e.altKey) {
      const closing = PAIRS[e.key];

      // If text is selected, wrap the selection in the pair
      if (start !== end) {
        e.preventDefault();
        const selectedText = code.substring(start, end);
        const newCode = code.substring(0, start) + e.key + selectedText + closing + code.substring(end);
        onUpdate({ code: newCode });
        setTimeout(() => {
          if (textareaRef.current) {
            textareaRef.current.selectionStart = start + 1;
            textareaRef.current.selectionEnd = end + 1;
          }
        }, 0);
        return;
      }

      // If quote typed and the next character is already that same quote, just step over it
      if ((e.key === '"' || e.key === "'") && code[start] === e.key) {
        e.preventDefault();
        setTimeout(() => {
          if (textareaRef.current) {
            textareaRef.current.selectionStart = textareaRef.current.selectionEnd = start + 1;
          }
        }, 0);
        return;
      }

      // Otherwise insert pair and place cursor in between
      e.preventDefault();
      const newCode = code.substring(0, start) + e.key + closing + code.substring(start);
      onUpdate({ code: newCode });
      setTimeout(() => {
        if (textareaRef.current) {
          textareaRef.current.selectionStart = textareaRef.current.selectionEnd = start + 1;
        }
      }, 0);
      return;
    }

    // Overtype / step over closing bracket when typed directly before existing closing char
    const CLOSING_CHARS = new Set([')', ']', '}', '"', "'"]);
    if (CLOSING_CHARS.has(e.key) && !e.ctrlKey && !e.metaKey && !e.altKey) {
      if (start === end && code[start] === e.key) {
        e.preventDefault();
        setTimeout(() => {
          if (textareaRef.current) {
            textareaRef.current.selectionStart = textareaRef.current.selectionEnd = start + 1;
          }
        }, 0);
        return;
      }
    }

    // Auto-delete pair on Backspace between empty pair
    if (e.key === 'Backspace' && !e.ctrlKey && !e.metaKey && !e.altKey) {
      if (start === end && start > 0) {
        const charBefore = code[start - 1];
        const charAfter = code[start];
        if (
          (charBefore === '(' && charAfter === ')') ||
          (charBefore === '[' && charAfter === ']') ||
          (charBefore === '{' && charAfter === '}') ||
          (charBefore === '"' && charAfter === '"') ||
          (charBefore === "'" && charAfter === "'")
        ) {
          e.preventDefault();
          const newCode = code.substring(0, start - 1) + code.substring(start + 1);
          onUpdate({ code: newCode });
          setTimeout(() => {
            if (textareaRef.current) {
              textareaRef.current.selectionStart = textareaRef.current.selectionEnd = start - 1;
            }
          }, 0);
          return;
        }
      }
    }

    // Enter auto-indent
    if (e.key === 'Enter') {
      e.preventDefault();
      const beforeCursor = code.substring(0, start);
      const afterCursor = code.substring(end);

      // Find current line indent
      const lastLine = beforeCursor.split('\n').pop() || '';
      const match = lastLine.match(/^(\s*)/);
      const baseIndent = match ? match[1] : '';
      let indent = baseIndent;

      // If line ends with colon, increase indentation by 4 spaces
      if (lastLine.trim().endsWith(':')) {
        indent += '    ';
      }

      // Check if cursor is between matching pairs: { and }, ( and ), [ and ]
      const charBefore = beforeCursor.slice(-1);
      const charAfter = afterCursor.slice(0, 1);
      if (
        (charBefore === '{' && charAfter === '}') ||
        (charBefore === '[' && charAfter === ']') ||
        (charBefore === '(' && charAfter === ')')
      ) {
        const innerIndent = baseIndent + '    ';
        const insertion = '\n' + innerIndent;
        const endInsertion = '\n' + baseIndent;
        const newCode = beforeCursor + insertion + endInsertion + afterCursor;
        onUpdate({ code: newCode });

        setTimeout(() => {
          if (textareaRef.current) {
            textareaRef.current.selectionStart = textareaRef.current.selectionEnd = start + insertion.length;
          }
        }, 0);
        return;
      }

      const insertion = '\n' + indent;
      const newCode = beforeCursor + insertion + afterCursor;
      onUpdate({ code: newCode });

      setTimeout(() => {
        if (textareaRef.current) {
          textareaRef.current.selectionStart = textareaRef.current.selectionEnd = start + insertion.length;
        }
      }, 0);
      return;
    }
  };

  // Safe client-side Python execution engine
  const runPythonCode = () => {
    setIsRunning(true);
    const startTime = performance.now();
    const outputLines: string[] = [];

    setTimeout(() => {
      try {
        const rawCode = block.code;
        
        // Custom print implementation
        const customPrint = (...args: any[]) => {
          const str = args.map(a => {
            if (typeof a === 'object' && a !== null) {
              try {
                return JSON.stringify(a);
              } catch {
                return String(a);
              }
            }
            return String(a);
          }).join(' ');
          outputLines.push(str);
        };

        // Math module simulation
        const mathModule = {
          pi: Math.PI,
          e: Math.E,
          tau: Math.PI * 2,
          sqrt: Math.sqrt,
          sin: Math.sin,
          cos: Math.cos,
          tan: Math.tan,
          asin: Math.asin,
          acos: Math.acos,
          atan: Math.atan,
          atan2: Math.atan2,
          degrees: (rad: number) => (rad * 180) / Math.PI,
          radians: (deg: number) => (deg * Math.PI) / 180,
          exp: Math.exp,
          log: Math.log,
          log10: Math.log10,
          log2: Math.log2,
          pow: Math.pow,
          floor: Math.floor,
          ceil: Math.ceil,
          factorial: (n: number) => {
            let res = 1;
            for (let i = 2; i <= n; i++) res *= i;
            return res;
          },
          gcd: (a: number, b: number): number => (!b ? a : mathModule.gcd(b, a % b)),
          comb: (n: number, k: number) => {
            if (k < 0 || k > n) return 0;
            if (k === 0 || k === n) return 1;
            let c = 1;
            for (let i = 1; i <= k; i++) c = (c * (n - (k - i))) / i;
            return c;
          }
        };

        // Helper built-ins
        const pyRange = (...args: number[]) => {
          let start = 0, stop = 0, step = 1;
          if (args.length === 1) stop = args[0];
          else if (args.length === 2) { start = args[0]; stop = args[1]; }
          else if (args.length >= 3) { start = args[0]; stop = args[1]; step = args[2]; }
          const res: number[] = [];
          if (step > 0) {
            for (let i = start; i < stop; i += step) res.push(i);
          } else if (step < 0) {
            for (let i = start; i > stop; i += step) res.push(i);
          }
          return res;
        };

        const pyLen = (obj: any) => (obj && typeof obj.length === 'number' ? obj.length : Object.keys(obj || {}).length);
        const pySum = (arr: number[]) => (Array.isArray(arr) ? arr.reduce((acc, v) => acc + v, 0) : 0);
        const pyMin = (...args: any[]) => {
          const list = args.length === 1 && Array.isArray(args[0]) ? args[0] : args;
          return Math.min(...list);
        };
        const pyMax = (...args: any[]) => {
          const list = args.length === 1 && Array.isArray(args[0]) ? args[0] : args;
          return Math.max(...list);
        };
        const pyRound = (num: number, ndigits: number = 0) => {
          const factor = Math.pow(10, ndigits);
          return Math.round(num * factor) / factor;
        };
        const pyAbs = Math.abs;

        // Transform simple Python syntax to JS for execution:
        // 1. Remove comments for execution
        // 2. Handle simple imports (e.g. import math)
        // 3. f-strings: f"hello {x}" -> `hello ${x}`
        // 4. Exponential operator: ** is supported in JS
        // 5. Integer division: // -> Math.floor(a / b) or ~~
        // 6. elif -> else if
        // 7. and / or / not -> && / || / !
        // 8. True / False / None -> true / false / null
        // 9. def name(args): -> function name(args) {
        // 10. print(...) -> print(...)
        
        // Split into lines to convert Python indentation blocks into braces
        const lines = rawCode.split('\n');
        const jsLines: string[] = [];
        const indentStack: number[] = [0];

        lines.forEach((line) => {
          const trimmed = line.trim();
          if (!trimmed || trimmed.startsWith('#')) return;

          // Detect line indentation
          const indent = line.search(/\S|$/);
          
          while (indentStack.length > 1 && indent < indentStack[indentStack.length - 1]) {
            indentStack.pop();
            jsLines.push('}');
          }

          let converted = trimmed;

          // Replace python keywords / operators
          // Handle f-strings: f"..." or f'...'
          converted = converted.replace(/f"([^"]*)"/g, (_, content) => {
            const parsed = content.replace(/\{([^}]+)\}/g, '${$1}');
            return '`' + parsed + '`';
          });
          converted = converted.replace(/f'([^']*)'/g, (_, content) => {
            const parsed = content.replace(/\{([^}]+)\}/g, '${$1}');
            return '`' + parsed + '`';
          });

          // Boolean / None literals
          converted = converted.replace(/\bTrue\b/g, 'true')
                               .replace(/\bFalse\b/g, 'false')
                               .replace(/\bNone\b/g, 'null');

          // Logic keywords
          converted = converted.replace(/\band\b/g, '&&')
                               .replace(/\bor\b/g, '||')
                               .replace(/\bnot\s+/g, '!');

          // Comments at end of line
          converted = converted.replace(/(?<!["'`])#.*$/, '');

          // Replace // with integer division Math.floor(a / b)
          converted = converted.replace(/([a-zA-Z0-9_\(\)]+)\s*\/\/\s*([a-zA-Z0-9_\(\)]+)/g, 'Math.floor($1 / $2)');

          // Imports
          if (converted.startsWith('import math') || converted.startsWith('from math import')) {
            return; // math is already available in scope
          }

          // Handle def function
          if (converted.startsWith('def ') && converted.endsWith(':')) {
            const header = converted.slice(4, -1).trim();
            jsLines.push(`function ${header} {`);
            indentStack.push(indent + 4);
            return;
          }

          // Handle if / elif / else
          if (converted.startsWith('if ') && converted.endsWith(':')) {
            const cond = converted.slice(3, -1).trim();
            jsLines.push(`if (${cond}) {`);
            indentStack.push(indent + 4);
            return;
          }
          if (converted.startsWith('elif ') && converted.endsWith(':')) {
            const cond = converted.slice(5, -1).trim();
            jsLines.push(`} else if (${cond}) {`);
            return;
          }
          if (converted === 'else:') {
            jsLines.push(`} else {`);
            return;
          }

          // Handle for loop: for x in iterable:
          if (converted.startsWith('for ') && converted.endsWith(':')) {
            const matchFor = converted.match(/^for\s+([a-zA-Z0-9_,\s]+)\s+in\s+(.+):$/);
            if (matchFor) {
              const varName = matchFor[1].trim();
              const iterable = matchFor[2].trim();
              jsLines.push(`for (let ${varName} of ${iterable}) {`);
              indentStack.push(indent + 4);
              return;
            }
          }

          // Handle while loop
          if (converted.startsWith('while ') && converted.endsWith(':')) {
            const cond = converted.slice(6, -1).trim();
            jsLines.push(`while (${cond}) {`);
            indentStack.push(indent + 4);
            return;
          }

          // Multiple assignments: a, b = 1, 2
          const multiAssign = converted.match(/^([a-zA-Z0-9_]+)\s*,\s*([a-zA-Z0-9_]+)(?:\s*,\s*([a-zA-Z0-9_]+))?\s*=\s*(.+)$/);
          if (multiAssign && !converted.startsWith('if') && !converted.startsWith('return')) {
            const targets = [multiAssign[1], multiAssign[2], multiAssign[3]].filter(Boolean);
            const values = multiAssign[4];
            jsLines.push(`let [${targets.join(', ')}] = [${values}];`);
            return;
          }

          // Variable assignment or declaration
          if (/^[a-zA-Z_][a-zA-Z0-9_]*\s*=[^=]/.test(converted)) {
            const varName = converted.split('=')[0].trim();
            jsLines.push(`var ${converted};`);
            return;
          }

          jsLines.push(`${converted};`);
        });

        // Close remaining open blocks
        while (indentStack.length > 1) {
          indentStack.pop();
          jsLines.push('}');
        }

        const compiledJS = jsLines.join('\n');

        // Create execution sandbox
        const runFn = new Function(
          'print', 'math', 'range', 'len', 'sum', 'min', 'max', 'abs', 'round',
          `"use strict";\n${compiledJS}`
        );

        runFn(customPrint, mathModule, pyRange, pyLen, pySum, pyMin, pyMax, pyAbs, pyRound);

        const elapsed = (performance.now() - startTime).toFixed(1);
        const finalOutput = outputLines.length > 0 
          ? outputLines.join('\n') 
          : '(Программа выполнена без вывода)';
        
        onUpdate({ 
          output: `✓ Выполнено за ${elapsed}мс\n${finalOutput}` 
        });
      } catch (err: any) {
        onUpdate({ 
          output: `❌ Ошибка выполнения:\n${err.message || String(err)}` 
        });
      } finally {
        setIsRunning(false);
      }
    }, 50);
  };

  // Syntax highlighting parser
  const renderHighlightedCode = (
    code: string, 
    fontSize: number, 
    lineHeight: number, 
    gutterW: number, 
    lineNumFontSize: number,
    gutterPR: number
  ) => {
    const lines = code.split('\n');
    
    // Keyword matchers
    const keywords = /\b(def|class|import|from|as|return|if|elif|else|while|for|in|try|except|finally|raise|with|yield|lambda|pass|break|continue|global|nonlocal|assert|async|await)\b/g;
    const builtins = /\b(print|len|range|int|float|str|list|dict|set|tuple|bool|sum|min|max|abs|round|enumerate|zip|map|filter|open|input|type|sorted|reversed)\b/g;
    const literals = /\b(True|False|None)\b/g;

    return lines.map((line, lineIdx) => {
      // Check for comment
      const commentIdx = line.indexOf('#');
      let codePart = commentIdx !== -1 ? line.substring(0, commentIdx) : line;
      const commentPart = commentIdx !== -1 ? line.substring(commentIdx) : '';

      // Highlight strings first
      // Tokenize strings and other tokens
      const parts: React.ReactNode[] = [];
      let lastIndex = 0;

      // Regex for strings: "...", '...', f"...", f'...'
      const stringRegex = /(f?["'])(?:(?=(\\?))\2[\s\S])*?\1/g;
      let match;

      while ((match = stringRegex.exec(codePart)) !== null) {
        // Text before string
        if (match.index > lastIndex) {
          parts.push(highlightTokens(codePart.substring(lastIndex, match.index), `${lineIdx}-${lastIndex}`));
        }
        // The string itself
        parts.push(
          <span 
            key={`${lineIdx}-str-${match.index}`} 
            className={isDarkMode ? 'text-emerald-400 font-medium' : 'text-emerald-600 font-medium'}
          >
            {match[0]}
          </span>
        );
        lastIndex = match.index + match[0].length;
      }

      if (lastIndex < codePart.length) {
        parts.push(highlightTokens(codePart.substring(lastIndex), `${lineIdx}-${lastIndex}`));
      }

      return (
        <div key={lineIdx} className="table-row" style={{ height: `${lineHeight}px`, lineHeight: `${lineHeight}px` }}>
          <span 
            className={`table-cell text-right select-none font-mono transition-colors ${
              isDarkMode ? 'text-zinc-600' : 'text-slate-400'
            }`}
            style={{ 
              width: `${gutterW}px`, 
              fontSize: `${lineNumFontSize}px`,
              paddingRight: `${gutterPR}px`,
              lineHeight: `${lineHeight}px`
            }}
          >
            {lineIdx + 1}
          </span>
          <span 
            className="table-cell whitespace-pre font-mono"
            style={{ fontSize: `${fontSize}px`, lineHeight: `${lineHeight}px` }}
          >
            {parts}
            {commentPart && (
              <span className={`italic ${isDarkMode ? 'text-zinc-500' : 'text-slate-400'}`}>
                {commentPart}
              </span>
            )}
            {line === '' && ' '}
          </span>
        </div>
      );
    });

    function highlightTokens(text: string, keyPrefix: string): React.ReactNode {
      // Split text into word / non-word tokens
      const tokenRegex = /(\b[a-zA-Z_][a-zA-Z0-9_]*\b|\b\d+(?:\.\d+)?\b|[^\s\w]+|\s+)/g;
      const tokens = text.match(tokenRegex) || [text];

      return tokens.map((token, idx) => {
        const key = `${keyPrefix}-${idx}`;
        if (keywords.test(token)) {
          keywords.lastIndex = 0;
          return (
            <span key={key} className={isDarkMode ? 'text-purple-400 font-semibold' : 'text-purple-600 font-semibold'}>
              {token}
            </span>
          );
        }
        if (builtins.test(token)) {
          builtins.lastIndex = 0;
          return (
            <span key={key} className={isDarkMode ? 'text-sky-400 font-medium' : 'text-sky-600 font-medium'}>
              {token}
            </span>
          );
        }
        if (literals.test(token)) {
          literals.lastIndex = 0;
          return (
            <span key={key} className={isDarkMode ? 'text-amber-400 font-semibold' : 'text-amber-600 font-semibold'}>
              {token}
            </span>
          );
        }
        if (/^\d+(\.\d+)?$/.test(token)) {
          return (
            <span key={key} className={isDarkMode ? 'text-orange-400' : 'text-orange-600'}>
              {token}
            </span>
          );
        }
        if (/^(==|!=|<=|>=|<|>|\+|-|\*|\/|\*\*|\/\/|%|=)$/.test(token)) {
          return (
            <span key={key} className={isDarkMode ? 'text-cyan-400' : 'text-blue-600'}>
              {token}
            </span>
          );
        }
        return <span key={key}>{token}</span>;
      });
    }
  };

  const lineCount = block.code.split('\n').length;
  const isMinimized = block.isMinimized ?? false;

  // Proportional font & UI scaling based on code block window dimensions
  const baseWidth = 480;
  const baseHeight = 250;
  const currentWidth = block.width;
  const currentHeight = block.height || baseHeight;

  // Resizing horizontally or vertically smoothly adjusts font size proportionally
  const widthRatio = currentWidth / baseWidth;
  const heightRatio = currentHeight / baseHeight;
  const dimensionRatio = widthRatio * 0.65 + heightRatio * 0.35;

  // Synchronize text size with code block window size and zoom level
  const dynamicScale = Math.max(0.6, Math.min(3.5, dimensionRatio * scale));

  // Typography & layout metrics synchronized with window dimensions
  const codeFontSize = Math.round(13 * dynamicScale);
  const codeLineHeight = Math.round(20 * dynamicScale);
  const gutterWidth = Math.max(28, Math.round(42 * dynamicScale));
  const gutterPadRight = Math.max(4, Math.round(8 * dynamicScale));
  const lineNumberFontSize = Math.max(8, Math.round(11 * dynamicScale));
  const editorPadding = Math.max(6, Math.round(12 * dynamicScale));

  const headerTitleFontSize = Math.max(10, Math.min(18, Math.round(12 * dynamicScale)));
  const outputFontSize = Math.max(9, Math.min(18, Math.round(11.5 * dynamicScale)));
  const outputLineHeight = Math.round(16 * dynamicScale);
  const footerFontSize = Math.max(8, Math.min(14, Math.round(10 * dynamicScale)));

  return (
    <div
      id={`python-code-block-${block.id}`}
      onClick={(e) => {
        e.stopPropagation();
        onFocus();
      }}
      className={`absolute rounded-xl shadow-2xl overflow-hidden transition-colors duration-200 flex flex-col border ${
        isDarkMode 
          ? 'bg-[#18181b] border-[#3f3f46] text-zinc-100 shadow-black/70' 
          : 'bg-white border-slate-300 text-slate-900 shadow-slate-300/50'
      } ${isActive ? 'ring-2 ring-blue-500 ring-offset-2' : ''}`}
      style={{
        transform: `translate3d(${screenPos.x}px, ${screenPos.y}px, 0)`,
        left: 0,
        top: 0,
        width: `${block.width * scale}px`,
        height: isMinimized ? 'auto' : (block.height ? `${block.height * scale}px` : 'auto'),
        minWidth: '240px',
        maxWidth: '90vw',
        zIndex: isActive ? 25 : 15,
        willChange: 'transform'
      }}
    >
      {/* Header Bar with Python Branding & Controls */}
      <div
        onMouseDown={onDragStart}
        onTouchStart={onDragStart}
        className={`px-3 py-2 flex items-center justify-between select-none cursor-move touch-none border-b transition-colors flex-shrink-0 ${
          isDarkMode 
            ? 'bg-[#202024] border-[#323238]' 
            : 'bg-slate-100 border-slate-200'
        }`}
      >
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1.5 px-2 py-0.5 rounded-md bg-blue-600/15 text-blue-500 font-semibold text-xs tracking-wide">
            {/* Python Snake Icon */}
            <svg className="w-4 h-4" viewBox="0 0 110 110" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path d="M54.5 5.5C28.2 5.5 29.8 17 29.8 17L29.9 29.2H55.2V32.9H18.9C18.9 32.9 5.5 31.4 5.5 57.7C5.5 84 17.2 82.5 17.2 82.5H24.3V71.8C24.3 71.8 23.7 58.7 36.8 58.7H62.1C62.1 58.7 74.3 59.3 74.3 47.1V21.8C74.3 21.8 76 5.5 54.5 5.5ZM38.2 14.8C41.6 14.8 44.3 17.5 44.3 20.9C44.3 24.3 41.6 27 38.2 27C34.8 27 32.1 24.3 32.1 20.9C32.1 17.5 34.8 14.8 38.2 14.8Z" fill="#387eb8"/>
              <path d="M55.5 104.5C81.8 104.5 80.2 93 80.2 93L80.1 80.8H54.8V77.1H91.1C91.1 77.1 104.5 78.6 104.5 52.3C104.5 26 92.8 27.5 92.8 27.5H85.7V38.2C85.7 38.2 86.3 51.3 73.2 51.3H47.9C47.9 51.3 35.7 50.7 35.7 62.9V88.2C35.7 88.2 34 104.5 55.5 104.5ZM71.8 95.2C68.4 95.2 65.7 92.5 65.7 89.1C65.7 85.7 68.4 83 71.8 83C75.2 83 77.9 85.7 77.9 89.1C77.9 92.5 75.2 95.2 71.8 95.2Z" fill="#ffe052"/>
            </svg>
            <span>Python 3</span>
          </div>

          <span className={`text-xs font-mono font-medium truncate max-w-[130px] ${
            isDarkMode ? 'text-zinc-300' : 'text-slate-700'
          }`}>
            {block.title || 'script.py'}
          </span>
        </div>

        <div className="flex items-center gap-1" onMouseDown={(e) => e.stopPropagation()}>
          {/* Quick Presets Dropdown */}
          <div className="relative">
            <button
              onClick={() => setShowPresets(!showPresets)}
              className={`p-1 rounded text-xs flex items-center gap-1 transition-colors ${
                isDarkMode 
                  ? 'text-zinc-400 hover:text-white hover:bg-zinc-700/60' 
                  : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200'
              }`}
              title="Примеры математического кода"
            >
              <Sparkles className="w-3.5 h-3.5 text-amber-500" />
              <span className="text-[11px] hidden sm:inline font-sans">Примеры</span>
            </button>

            {showPresets && (
              <div 
                className={`absolute right-0 top-full mt-1.5 w-56 rounded-lg shadow-xl border p-1 z-50 text-xs font-sans select-none ${
                  isDarkMode 
                    ? 'bg-[#202024] border-[#3f3f46] text-zinc-200' 
                    : 'bg-white border-slate-200 text-slate-800'
                }`}
              >
                <div className={`px-2 py-1 text-[11px] font-semibold border-b ${
                  isDarkMode ? 'text-zinc-400 border-zinc-700' : 'text-slate-500 border-slate-100'
                }`}>
                  Выберите шаблон:
                </div>
                {PYTHON_PRESETS.map((p, idx) => (
                  <button
                    key={idx}
                    onClick={() => {
                      onUpdate({ code: p.code, output: undefined });
                      setShowPresets(false);
                    }}
                    className={`w-full text-left px-2 py-1.5 rounded text-xs transition-colors ${
                      isDarkMode 
                        ? 'hover:bg-zinc-700/60 hover:text-white' 
                        : 'hover:bg-blue-50 hover:text-blue-600'
                    }`}
                  >
                    {p.name}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Copy Code */}
          <button
            onClick={handleCopy}
            className={`p-1.5 rounded transition-colors ${
              isDarkMode 
                ? 'text-zinc-400 hover:text-white hover:bg-zinc-700/60' 
                : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200'
            }`}
            title="Скопировать код"
          >
            {copied ? <Check className="w-3.5 h-3.5 text-emerald-500" /> : <Copy className="w-3.5 h-3.5" />}
          </button>

          {/* Run Code Button */}
          <button
            onClick={runPythonCode}
            disabled={isRunning}
            className={`px-2.5 py-1 rounded text-xs font-medium flex items-center gap-1.5 transition-all shadow-sm ${
              isRunning
                ? 'bg-blue-500/50 text-white cursor-wait'
                : 'bg-blue-600 hover:bg-blue-700 text-white active:scale-95'
            }`}
            title="Запустить код (Ctrl+Enter)"
          >
            <Play className={`w-3 h-3 fill-current ${isRunning ? 'animate-spin' : ''}`} />
            <span>{isRunning ? '...' : 'Запуск'}</span>
          </button>

          {/* Minimize toggle */}
          <button
            onClick={() => onUpdate({ isMinimized: !isMinimized })}
            className={`p-1.5 rounded transition-colors ${
              isDarkMode 
                ? 'text-zinc-400 hover:text-white hover:bg-zinc-700/60' 
                : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200'
            }`}
            title={isMinimized ? "Развернуть" : "Свернуть"}
          >
            {isMinimized ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronUp className="w-3.5 h-3.5" />}
          </button>

          {/* Delete Block */}
          <button
            onClick={onDelete}
            className={`p-1.5 rounded transition-colors ${
              isDarkMode 
                ? 'text-red-400/80 hover:text-red-400 hover:bg-red-950/40' 
                : 'text-red-600/80 hover:text-red-600 hover:bg-red-50'
            }`}
            title="Удалить блок кода"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Editor Body */}
      {!isMinimized && (
        <div className="flex flex-col flex-1 min-h-0 overflow-hidden">
          <div 
            className={`relative flex-1 min-h-[90px] overflow-hidden ${
              isDarkMode ? 'bg-[#18181b]' : 'bg-white'
            }`}
          >
            {/* Syntax Highlighted View Underneath */}
            <pre
              ref={preRef}
              aria-hidden="true"
              className="absolute inset-0 m-0 overflow-auto pointer-events-none font-mono whitespace-pre"
              style={{
                tabSize: 4,
                padding: `${editorPadding}px`,
                fontSize: `${codeFontSize}px`,
                lineHeight: `${codeLineHeight}px`,
                fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace'
              }}
            >
              {renderHighlightedCode(block.code, codeFontSize, codeLineHeight, gutterWidth, lineNumberFontSize, gutterPadRight)}
            </pre>

            {/* Editable Textarea Layer on Top */}
            <textarea
              ref={textareaRef}
              value={block.code}
              onChange={(e) => onUpdate({ code: e.target.value })}
              onScroll={handleScroll}
              onKeyDown={handleKeyDown}
              spellCheck={false}
              autoCapitalize="off"
              autoComplete="off"
              autoCorrect="off"
              className="absolute inset-0 w-full h-full m-0 bg-transparent text-transparent caret-blue-500 outline-none resize-none font-mono whitespace-pre overflow-auto z-10 select-text"
              style={{
                tabSize: 4,
                padding: `${editorPadding}px`,
                paddingLeft: `${gutterWidth + editorPadding}px`,
                fontSize: `${codeFontSize}px`,
                lineHeight: `${codeLineHeight}px`,
                fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace'
              }}
              placeholder="# Напишите Python код здесь..."
            />
          </div>

          {/* Console / Output Area */}
          {block.output && (
            <div 
              className={`border-t p-2.5 font-mono overflow-y-auto transition-colors flex-shrink-0 ${
                isDarkMode 
                  ? 'bg-[#1e1e24] border-[#323238] text-zinc-200' 
                  : 'bg-slate-50 border-slate-200 text-slate-800'
              }`}
              style={{ maxHeight: `${Math.round(140 * dynamicScale)}px` }}
            >
              <div className="flex items-center justify-between pb-1 mb-1 border-b border-current/10">
                <div 
                  className="flex items-center gap-1.5 font-sans font-semibold opacity-75"
                  style={{ fontSize: `${Math.max(10, Math.round(11 * dynamicScale))}px` }}
                >
                  <Terminal className="w-3.5 h-3.5 text-blue-500" />
                  <span>Вывод консоли:</span>
                </div>
                <button
                  onClick={() => onUpdate({ output: undefined })}
                  className="font-sans opacity-60 hover:opacity-100 underline"
                  style={{ fontSize: `${Math.max(9, Math.round(10 * dynamicScale))}px` }}
                >
                  Очистить
                </button>
              </div>
              <pre 
                className="whitespace-pre-wrap font-mono leading-relaxed"
                style={{
                  fontSize: `${outputFontSize}px`,
                  lineHeight: `${outputLineHeight}px`
                }}
              >
                {block.output}
              </pre>
            </div>
          )}

          {/* Footer Bar with Resize Grip */}
          <div 
            className={`px-3 py-1 flex items-center justify-between border-t select-none transition-colors flex-shrink-0 ${
              isDarkMode 
                ? 'bg-[#1f1f23] border-[#2e2e33] text-zinc-500' 
                : 'bg-slate-100 border-slate-200 text-slate-400'
            }`}
            style={{ fontSize: `${footerFontSize}px` }}
          >
            <div className="flex items-center gap-2">
              <span>{lineCount} {lineCount === 1 ? 'строка' : (lineCount < 5 ? 'строки' : 'строк')}</span>
              <span>•</span>
              <span>Ctrl+Enter для запуска</span>
            </div>

            {/* Resize Handle */}
            <div 
              onMouseDown={onResizeStart}
              onTouchStart={onResizeStart}
              className="cursor-nwse-resize p-1 -mr-1 hover:text-blue-500 touch-none select-none"
              title="Изменить размер"
            >
              <svg className="w-3 h-3" viewBox="0 0 10 10" fill="currentColor">
                <circle cx="8" cy="8" r="1" />
                <circle cx="5" cy="8" r="1" />
                <circle cx="8" cy="5" r="1" />
                <circle cx="2" cy="8" r="1" />
                <circle cx="5" cy="5" r="1" />
                <circle cx="8" cy="2" r="1" />
              </svg>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default React.memo(PythonCodeBlock);
