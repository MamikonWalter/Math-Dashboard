import React, { useState, useRef, useEffect, useCallback } from 'react';
import { 
  Copy, 
  Check, 
  Trash2, 
  ChevronDown, 
  ChevronUp, 
  Maximize2,
  Minimize2,
  Edit2,
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

// Preset Python examples for math & algorithms
const PYTHON_PRESETS = [
  {
    name: 'Алгоритм Евклида (НОД)',
    code: `# Поиск наибольшего общего делителя (НОД)
def gcd(a: int, b: int) -> int:
    while b != 0:
        a, b = b, a % b
    return a

x, y = 1071, 462
print(f"НОД({x}, {y}) = {gcd(x, y)}")
`
  },
  {
    name: 'Квадратное уравнение',
    code: `import math

def solve_quadratic(a: float, b: float, c: float):
    d = b**2 - 4 * a * c
    if d > 0:
        x1 = (-b + math.sqrt(d)) / (2 * a)
        x2 = (-b - math.sqrt(d)) / (2 * a)
        return x1, x2
    elif d == 0:
        return -b / (2 * a)
    return None

roots = solve_quadratic(1, -5, 6)
print("Корни уравнения:", roots)
`
  },
  {
    name: 'Генерация списков (List Comprehension)',
    code: `# Генераторы списков и срезы в Python
squares = [x**2 for x in range(1, 11)]
evens = [x for x in squares if x % 2 == 0]

matrix = [[i * j for j in range(1, 4)] for i in range(1, 4)]
reversed_list = squares[::-1]
`
  },
  {
    name: 'Числа Фибоначчи с мемоизацией',
    code: `from functools import lru_cache

@lru_cache(maxsize=None)
def fib(n: int) -> int:
    if n < 2:
        return n
    return fib(n - 1) + fib(n - 2)

first_10 = [fib(i) for i in range(10)]
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
  const [isEditingTitle, setIsEditingTitle] = useState(false);
  const [titleInput, setTitleInput] = useState(block.title || 'main.py');
  const [showPresets, setShowPresets] = useState(false);
  const [cursorPos, setCursorPos] = useState({ line: 1, col: 1 });

  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const preRef = useRef<HTMLPreElement>(null);
  const titleInputRef = useRef<HTMLInputElement>(null);

  // Sync title input with block prop
  useEffect(() => {
    setTitleInput(block.title || 'main.py');
  }, [block.title]);

  // Synchronize scrolling between textarea and highlighted syntax overlay
  const handleScroll = () => {
    if (textareaRef.current && preRef.current) {
      preRef.current.scrollTop = textareaRef.current.scrollTop;
      preRef.current.scrollLeft = textareaRef.current.scrollLeft;
    }
  };

  const updateCursorPosition = () => {
    if (!textareaRef.current) return;
    const start = textareaRef.current.selectionStart;
    const textBefore = block.code.substring(0, start);
    const lines = textBefore.split('\n');
    const line = lines.length;
    const col = lines[lines.length - 1].length + 1;
    setCursorPos({ line, col });
  };

  const handleCopy = async (e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      await navigator.clipboard.writeText(block.code);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
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

  const handleTitleSubmit = () => {
    setIsEditingTitle(false);
    const trimmed = titleInput.trim();
    if (trimmed) {
      onUpdate({ title: trimmed });
    } else {
      setTitleInput(block.title || 'main.py');
    }
  };

  // Full Python punctuation, auto-indentation, and typing ergonomics
  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    const target = e.currentTarget;
    const start = target.selectionStart;
    const end = target.selectionEnd;
    const code = block.code;

    // 1. Tab / Shift+Tab handling
    if (e.key === 'Tab') {
      e.preventDefault();
      
      // Multi-line selection indentation or unindentation
      if (start !== end && code.substring(start, end).includes('\n')) {
        const lineStart = code.lastIndexOf('\n', start - 1) + 1;
        let lineEnd = code.indexOf('\n', end);
        if (lineEnd === -1) lineEnd = code.length;

        const selectionBlock = code.substring(lineStart, lineEnd);
        const lines = selectionBlock.split('\n');

        if (e.shiftKey) {
          // Unindent lines
          const unindented = lines.map(line => {
            if (line.startsWith('    ')) return line.substring(4);
            if (line.startsWith('\t')) return line.substring(1);
            return line.replace(/^ {1,3}/, '');
          }).join('\n');

          const newCode = code.substring(0, lineStart) + unindented + code.substring(lineEnd);
          onUpdate({ code: newCode });
          setTimeout(() => {
            if (textareaRef.current) {
              textareaRef.current.selectionStart = lineStart;
              textareaRef.current.selectionEnd = lineStart + unindented.length;
            }
          }, 0);
        } else {
          // Indent lines
          const indented = lines.map(line => '    ' + line).join('\n');
          const newCode = code.substring(0, lineStart) + indented + code.substring(lineEnd);
          onUpdate({ code: newCode });
          setTimeout(() => {
            if (textareaRef.current) {
              textareaRef.current.selectionStart = lineStart;
              textareaRef.current.selectionEnd = lineStart + indented.length;
            }
          }, 0);
        }
        return;
      }

      // Single line Shift+Tab unindent
      if (e.shiftKey) {
        const lineStart = code.lastIndexOf('\n', start - 1) + 1;
        const linePrefix = code.substring(lineStart, start);
        if (linePrefix.endsWith('    ')) {
          const newCode = code.substring(0, start - 4) + code.substring(start);
          onUpdate({ code: newCode });
          setTimeout(() => {
            if (textareaRef.current) {
              textareaRef.current.selectionStart = textareaRef.current.selectionEnd = Math.max(lineStart, start - 4);
            }
          }, 0);
        }
        return;
      }

      // Standard 4-spaces Python Tab indent
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

    // 2. Python Auto-closing Pairs & Selection Wrapping: (), [], {}, "", ''
    const PAIRS: Record<string, string> = {
      '(': ')',
      '[': ']',
      '{': '}',
      '"': '"',
      "'": "'"
    };

    if (PAIRS[e.key] && !e.ctrlKey && !e.metaKey && !e.altKey) {
      const closing = PAIRS[e.key];

      // If text is selected, wrap selection in the pair
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

      // Step over quote if cursor is directly in front of the same quote
      if ((e.key === '"' || e.key === "'") && code[start] === e.key) {
        e.preventDefault();
        setTimeout(() => {
          if (textareaRef.current) {
            textareaRef.current.selectionStart = textareaRef.current.selectionEnd = start + 1;
          }
        }, 0);
        return;
      }

      // Insert pair and keep cursor in middle
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

    // 3. Step over closing bracket if typed directly before existing closing char
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

    // 4. Backspace: delete both characters when between empty pairs
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

    // 5. Enter: Auto-indentation following Python colon and block structure
    if (e.key === 'Enter') {
      e.preventDefault();
      const beforeCursor = code.substring(0, start);
      const afterCursor = code.substring(end);

      // Find current line indent
      const lastLine = beforeCursor.split('\n').pop() || '';
      const match = lastLine.match(/^(\s*)/);
      const baseIndent = match ? match[1] : '';
      let indent = baseIndent;

      // In Python, any line ending with a colon ':' starts a new code block (+4 spaces indent)
      const trimmedLine = lastLine.trim();
      if (trimmedLine.endsWith(':')) {
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

  // Adjust window height to fit code content perfectly (green dot action)
  const handleAutoFitContent = () => {
    const lines = block.code.split('\n').length;
    const calculatedHeight = Math.max(160, Math.min(800, lines * codeLineHeight + 85));
    onUpdate({ height: calculatedHeight, isMinimized: false });
  };

  // Python Syntax Highlighting Engine
  const renderHighlightedCode = (
    code: string, 
    fontSize: number, 
    lineHeight: number, 
    gutterW: number, 
    lineNumFontSize: number,
    gutterPR: number
  ) => {
    const lines = code.split('\n');

    // Python Keywords
    const keywords = /\b(def|class|import|from|as|return|if|elif|else|while|for|in|try|except|finally|raise|with|yield|lambda|pass|break|continue|global|nonlocal|assert|async|await|match|case|del)\b/g;
    const logicOps = /\b(and|or|not|is)\b/g;
    const builtins = /\b(print|len|range|int|float|str|list|dict|set|tuple|bool|sum|min|max|abs|round|enumerate|zip|map|filter|open|input|type|sorted|reversed|any|all|isinstance|issubclass|id|super|help|dir)\b/g;
    const literals = /\b(True|False|None)\b/g;
    const specialVars = /\b(self|cls)\b/g;

    return lines.map((line, lineIdx) => {
      // Check for Python comment: '#' outside of strings
      const commentIdx = line.indexOf('#');
      let codePart = commentIdx !== -1 ? line.substring(0, commentIdx) : line;
      const commentPart = commentIdx !== -1 ? line.substring(commentIdx) : '';

      // Tokenize strings first: single quote, double quote, triple quotes, f-strings, r-strings
      const parts: React.ReactNode[] = [];
      let lastIndex = 0;

      const stringRegex = /(?:f|r|b|fr|rf)?(?:"""[\s\S]*?"""|'''[\s\S]*?'''|"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*')/g;
      let match;

      while ((match = stringRegex.exec(codePart)) !== null) {
        if (match.index > lastIndex) {
          parts.push(highlightTokens(codePart.substring(lastIndex, match.index), `${lineIdx}-${lastIndex}`));
        }
        parts.push(
          <span 
            key={`${lineIdx}-str-${match.index}`} 
            className={isDarkMode ? 'text-emerald-400 font-normal' : 'text-emerald-600 font-normal'}
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
          {/* Line number gutter */}
          <span 
            className={`table-cell text-right select-none font-mono transition-colors ${
              isDarkMode ? 'text-zinc-500/70 border-r border-zinc-800/80 bg-zinc-950/20' : 'text-slate-400 border-r border-slate-200/80 bg-slate-50/60'
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
          {/* Highlighted text line */}
          <span 
            className="table-cell whitespace-pre font-mono pl-3"
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
      // Split into word tokens, numbers, decorators, operators, punctuation
      const tokenRegex = /(@[a-zA-Z_][a-zA-Z0-9_.]*|\b[a-zA-Z_][a-zA-Z0-9_]*\b|\b\d+(?:\.\d+)?\b|[^\s\w]+|\s+)/g;
      const tokens = text.match(tokenRegex) || [text];

      return tokens.map((token, idx) => {
        const key = `${keyPrefix}-${idx}`;

        // Decorators: @property, @staticmethod, etc.
        if (token.startsWith('@')) {
          return (
            <span key={key} className={isDarkMode ? 'text-yellow-400 font-medium' : 'text-amber-600 font-medium'}>
              {token}
            </span>
          );
        }

        // Keywords
        if (keywords.test(token)) {
          keywords.lastIndex = 0;
          return (
            <span key={key} className={isDarkMode ? 'text-purple-400 font-semibold' : 'text-purple-600 font-semibold'}>
              {token}
            </span>
          );
        }

        // Logical operators: and, or, not, is
        if (logicOps.test(token)) {
          logicOps.lastIndex = 0;
          return (
            <span key={key} className={isDarkMode ? 'text-rose-400 font-medium' : 'text-rose-600 font-medium'}>
              {token}
            </span>
          );
        }

        // Built-ins: print, len, range, int, float, str, etc.
        if (builtins.test(token)) {
          builtins.lastIndex = 0;
          return (
            <span key={key} className={isDarkMode ? 'text-sky-400 font-medium' : 'text-sky-600 font-medium'}>
              {token}
            </span>
          );
        }

        // Literals: True, False, None
        if (literals.test(token)) {
          literals.lastIndex = 0;
          return (
            <span key={key} className={isDarkMode ? 'text-amber-300 font-semibold' : 'text-amber-700 font-semibold'}>
              {token}
            </span>
          );
        }

        // self, cls
        if (specialVars.test(token)) {
          specialVars.lastIndex = 0;
          return (
            <span key={key} className={isDarkMode ? 'text-rose-400/90 italic' : 'text-rose-700 italic'}>
              {token}
            </span>
          );
        }

        // Numbers: 42, 3.14
        if (/^\d+(\.\d+)?$/.test(token)) {
          return (
            <span key={key} className={isDarkMode ? 'text-orange-400' : 'text-orange-600'}>
              {token}
            </span>
          );
        }

        // Python punctuation & operators
        if (/^(==|!=|<=|>=|<|>|\+|-|\*|\/|\*\*|\/\/|%|=|->|:|\+=|-=|\*=|\/=)$/.test(token)) {
          return (
            <span key={key} className={isDarkMode ? 'text-indigo-400 font-medium' : 'text-indigo-600 font-medium'}>
              {token}
            </span>
          );
        }

        // Parentheses, brackets, braces
        if (/^[(){}[\]]$/.test(token)) {
          return (
            <span key={key} className={isDarkMode ? 'text-zinc-300' : 'text-slate-700'}>
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

  // Proportional scaling for smooth typography as window resizes
  const baseWidth = 480;
  const baseHeight = 250;
  const currentWidth = block.width;
  const currentHeight = block.height || baseHeight;

  const widthRatio = currentWidth / baseWidth;
  const heightRatio = currentHeight / baseHeight;
  const dimensionRatio = Math.max(0.75, Math.min(1.5, widthRatio * 0.65 + heightRatio * 0.35));
  const dynamicScale = dimensionRatio;

  const codeFontSize = Math.round(13 * dynamicScale);
  const codeLineHeight = Math.round(20 * dynamicScale);
  const gutterWidth = Math.max(34, Math.round(44 * dynamicScale));
  const gutterPadRight = Math.max(4, Math.round(8 * dynamicScale));
  const lineNumberFontSize = Math.max(9, Math.round(11 * dynamicScale));
  const editorPadding = Math.max(8, Math.round(12 * dynamicScale));
  const footerFontSize = Math.max(9, Math.min(13, Math.round(10.5 * dynamicScale)));

  return (
    <div
      id={`python-code-block-${block.id}`}
      onClick={(e) => {
        e.stopPropagation();
        onFocus();
      }}
      className={`absolute rounded-xl overflow-hidden transition-all duration-200 flex flex-col border select-none ${
        isDarkMode 
          ? 'bg-[#141518] border-zinc-700/80 text-zinc-100 shadow-2xl shadow-black/70' 
          : 'bg-white border-slate-300/80 text-slate-900 shadow-xl shadow-slate-300/60'
      } ${isActive ? 'ring-2 ring-blue-500/80 ring-offset-2 ring-offset-transparent' : ''}`}
      style={{
        position: 'absolute',
        transform: `translate3d(${screenPos.x}px, ${screenPos.y}px, 0) scale(${scale})`,
        transformOrigin: '0 0',
        left: 0,
        top: 0,
        width: `${block.width}px`,
        height: isMinimized ? 'auto' : `${block.height || baseHeight}px`,
        zIndex: isActive ? 30 : 15,
        willChange: 'transform'
      }}
    >
      {/* Modern Mac-style Window Header Bar */}
      <div
        onMouseDown={onDragStart}
        onTouchStart={onDragStart}
        className={`px-3 py-2.5 flex items-center justify-between cursor-move touch-none border-b transition-colors flex-shrink-0 ${
          isDarkMode 
            ? 'bg-[#1c1d22] border-zinc-800' 
            : 'bg-slate-100/90 border-slate-200'
        }`}
      >
        {/* Left: Window Control Traffic Light Dots */}
        <div className="flex items-center gap-2" onMouseDown={(e) => e.stopPropagation()}>
          {/* Red: Close / Delete */}
          <button
            onClick={onDelete}
            title="Удалить блок"
            className="group relative w-3 h-3 rounded-full bg-[#ff5f56] border border-[#e0443e] flex items-center justify-center transition-transform active:scale-90 hover:brightness-105"
          >
            <span className="opacity-0 group-hover:opacity-100 text-[8px] font-bold text-black/70 leading-none">×</span>
          </button>

          {/* Yellow: Minimize / Collapse */}
          <button
            onClick={() => onUpdate({ isMinimized: !isMinimized })}
            title={isMinimized ? "Развернуть" : "Свернуть"}
            className="group relative w-3 h-3 rounded-full bg-[#ffbd2e] border border-[#dea123] flex items-center justify-center transition-transform active:scale-90 hover:brightness-105"
          >
            <span className="opacity-0 group-hover:opacity-100 text-[8px] font-bold text-black/70 leading-none">-</span>
          </button>

          {/* Green: Fit to Content */}
          <button
            onClick={handleAutoFitContent}
            title="Подогнать высоту по коду"
            className="group relative w-3 h-3 rounded-full bg-[#27c93f] border border-[#1aab29] flex items-center justify-center transition-transform active:scale-90 hover:brightness-105"
          >
            <span className="opacity-0 group-hover:opacity-100 text-[7px] font-bold text-black/70 leading-none">+</span>
          </button>
        </div>

        {/* Center: File Title with Python Snake Badge */}
        <div 
          className="flex items-center gap-1.5 px-2 py-0.5 rounded cursor-pointer group max-w-[200px]"
          onMouseDown={(e) => e.stopPropagation()}
          onDoubleClick={() => setIsEditingTitle(true)}
          title="Двойной клик для переименования"
        >
          {/* Python Logo */}
          <svg className="w-3.5 h-3.5 flex-shrink-0" viewBox="0 0 110 110" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path d="M54.5 5.5C28.2 5.5 29.8 17 29.8 17L29.9 29.2H55.2V32.9H18.9C18.9 32.9 5.5 31.4 5.5 57.7C5.5 84 17.2 82.5 17.2 82.5H24.3V71.8C24.3 71.8 23.7 58.7 36.8 58.7H62.1C62.1 58.7 74.3 59.3 74.3 47.1V21.8C74.3 21.8 76 5.5 54.5 5.5ZM38.2 14.8C41.6 14.8 44.3 17.5 44.3 20.9C44.3 24.3 41.6 27 38.2 27C34.8 27 32.1 24.3 32.1 20.9C32.1 17.5 34.8 14.8 38.2 14.8Z" fill="#387eb8"/>
            <path d="M55.5 104.5C81.8 104.5 80.2 93 80.2 93L80.1 80.8H54.8V77.1H91.1C91.1 77.1 104.5 78.6 104.5 52.3C104.5 26 92.8 27.5 92.8 27.5H85.7V38.2C85.7 38.2 86.3 51.3 73.2 51.3H47.9C47.9 51.3 35.7 50.7 35.7 62.9V88.2C35.7 88.2 34 104.5 55.5 104.5ZM71.8 95.2C68.4 95.2 65.7 92.5 65.7 89.1C65.7 85.7 68.4 83 71.8 83C75.2 83 77.9 85.7 77.9 89.1C77.9 92.5 75.2 95.2 71.8 95.2Z" fill="#ffe052"/>
          </svg>

          {isEditingTitle ? (
            <input
              ref={titleInputRef}
              type="text"
              value={titleInput}
              autoFocus
              onChange={(e) => setTitleInput(e.target.value)}
              onBlur={handleTitleSubmit}
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleTitleSubmit();
                if (e.key === 'Escape') {
                  setTitleInput(block.title || 'main.py');
                  setIsEditingTitle(false);
                }
              }}
              className={`text-xs font-mono font-medium px-1 py-0.5 rounded outline-none border ${
                isDarkMode 
                  ? 'bg-zinc-800 border-zinc-600 text-white' 
                  : 'bg-white border-blue-400 text-slate-800'
              }`}
            />
          ) : (
            <span className={`text-xs font-mono font-medium truncate ${
              isDarkMode ? 'text-zinc-300 group-hover:text-white' : 'text-slate-700 group-hover:text-slate-900'
            }`}>
              {block.title || 'main.py'}
            </span>
          )}
        </div>

        {/* Right: Actions (Presets, Copy) */}
        <div className="flex items-center gap-1" onMouseDown={(e) => e.stopPropagation()}>
          {/* Examples Preset Menu */}
          <div className="relative">
            <button
              onClick={() => setShowPresets(!showPresets)}
              className={`px-2 py-1 rounded text-xs font-sans flex items-center gap-1 transition-colors ${
                isDarkMode 
                  ? 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800' 
                  : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200'
              }`}
              title="Примеры кода"
            >
              <FileCode2 className="w-3.5 h-3.5" />
              <span className="text-[11px] hidden sm:inline">Примеры</span>
            </button>

            {showPresets && (
              <div 
                className={`absolute right-0 top-full mt-1.5 w-60 rounded-lg shadow-2xl border p-1 z-50 text-xs font-sans select-none backdrop-blur-md ${
                  isDarkMode 
                    ? 'bg-[#1e1f24]/95 border-zinc-700 text-zinc-200' 
                    : 'bg-white/95 border-slate-200 text-slate-800'
                }`}
              >
                <div className={`px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wider border-b mb-1 ${
                  isDarkMode ? 'text-zinc-400 border-zinc-700/60' : 'text-slate-400 border-slate-100'
                }`}>
                  Примеры Python
                </div>
                {PYTHON_PRESETS.map((p, idx) => (
                  <button
                    key={idx}
                    onClick={() => {
                      onUpdate({ code: p.code });
                      setShowPresets(false);
                    }}
                    className={`w-full text-left px-2.5 py-1.5 rounded text-xs transition-colors ${
                      isDarkMode 
                        ? 'hover:bg-zinc-800 hover:text-white' 
                        : 'hover:bg-blue-50 hover:text-blue-600'
                    }`}
                  >
                    {p.name}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Copy Button */}
          <button
            onClick={handleCopy}
            className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-sans transition-all duration-150 ${
              copied
                ? (isDarkMode ? 'bg-emerald-500/20 text-emerald-400' : 'bg-emerald-50 text-emerald-600')
                : (isDarkMode 
                    ? 'text-zinc-300 hover:text-white hover:bg-zinc-800' 
                    : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200')
            }`}
            title="Скопировать код"
          >
            {copied ? (
              <>
                <Check className="w-3.5 h-3.5 text-emerald-500 stroke-[2.5]" />
                <span className="text-[11px] font-medium text-emerald-500">Скопировано</span>
              </>
            ) : (
              <>
                <Copy className="w-3.5 h-3.5" />
                <span className="text-[11px] font-medium hidden sm:inline">Копировать</span>
              </>
            )}
          </button>
        </div>
      </div>

      {/* Editor Body */}
      {!isMinimized && (
        <div className="flex flex-col flex-1 min-h-0 overflow-hidden">
          <div 
            className={`relative flex-1 min-h-[90px] overflow-hidden ${
              isDarkMode ? 'bg-[#141518]' : 'bg-[#fafafa]'
            }`}
          >
            {/* Syntax Highlighted View Underneath */}
            <pre
              ref={preRef}
              aria-hidden="true"
              className="absolute inset-0 m-0 overflow-auto pointer-events-none font-mono whitespace-pre select-none"
              style={{
                tabSize: 4,
                padding: `${editorPadding}px`,
                fontSize: `${codeFontSize}px`,
                lineHeight: `${codeLineHeight}px`,
                fontFamily: 'ui-monospace, SFMono-Regular, "JetBrains Mono", Menlo, Consolas, "Liberation Mono", monospace'
              }}
            >
              {renderHighlightedCode(block.code, codeFontSize, codeLineHeight, gutterWidth, lineNumberFontSize, gutterPadRight)}
            </pre>

            {/* Editable Textarea Layer on Top */}
            <textarea
              ref={textareaRef}
              value={block.code}
              onChange={(e) => {
                onUpdate({ code: e.target.value });
                updateCursorPosition();
              }}
              onKeyUp={updateCursorPosition}
              onClick={updateCursorPosition}
              onScroll={handleScroll}
              onKeyDown={handleKeyDown}
              spellCheck={false}
              autoCapitalize="off"
              autoComplete="off"
              autoCorrect="off"
              className={`absolute inset-0 w-full h-full m-0 bg-transparent text-transparent outline-none resize-none font-mono whitespace-pre overflow-auto z-10 select-text ${
                isDarkMode 
                  ? 'caret-blue-400 placeholder:text-zinc-500/80 selection:bg-blue-600/30' 
                  : 'caret-blue-600 placeholder:text-slate-400 selection:bg-blue-100'
              }`}
              style={{
                tabSize: 4,
                padding: `${editorPadding}px`,
                paddingLeft: `${gutterWidth + editorPadding + 12}px`,
                fontSize: `${codeFontSize}px`,
                lineHeight: `${codeLineHeight}px`,
                fontFamily: 'ui-monospace, SFMono-Regular, "JetBrains Mono", Menlo, Consolas, "Liberation Mono", monospace'
              }}
              placeholder="# Введите Python код..."
            />
          </div>

          {/* Clean Bottom Status Bar */}
          <div 
            className={`px-3 py-1.5 flex items-center justify-between border-t select-none transition-colors flex-shrink-0 ${
              isDarkMode 
                ? 'bg-[#1a1b20] border-zinc-800 text-zinc-400' 
                : 'bg-slate-100/90 border-slate-200 text-slate-500'
            }`}
            style={{ fontSize: `${footerFontSize}px` }}
          >
            <div className="flex items-center gap-3">
              <span className="font-mono">Python 3</span>
              <span className="opacity-40">•</span>
              <span>{lineCount} {lineCount === 1 ? 'строка' : (lineCount < 5 ? 'строки' : 'строк')}</span>
              <span className="opacity-40 hidden sm:inline">•</span>
              <span className="font-mono text-[10px] opacity-75 hidden sm:inline">
                Стр {cursorPos.line}, Кол {cursorPos.col}
              </span>
            </div>

            {/* Resize Grip Handle */}
            <div 
              onMouseDown={onResizeStart}
              onTouchStart={onResizeStart}
              className="cursor-nwse-resize p-1 -mr-1 hover:text-blue-500 touch-none select-none transition-colors"
              title="Изменить размер блока"
            >
              <svg className="w-3 h-3" viewBox="0 0 10 10" fill="currentColor">
                <circle cx="8" cy="8" r="1.2" />
                <circle cx="4.5" cy="8" r="1.2" />
                <circle cx="8" cy="4.5" r="1.2" />
                <circle cx="1" cy="8" r="1.2" />
                <circle cx="4.5" cy="4.5" r="1.2" />
                <circle cx="8" cy="1" r="1.2" />
              </svg>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default React.memo(PythonCodeBlock);
