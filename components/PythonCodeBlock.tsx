import React, { useState, useRef, useEffect } from 'react';
import { Copy, Check } from 'lucide-react';
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
  const [cursorPos, setCursorPos] = useState({ line: 1, col: 1 });

  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const preRef = useRef<HTMLPreElement>(null);

  // Keep scroll position strictly at 0 (no scrollbars, auto-expanding layout)
  const handleScroll = () => {
    if (textareaRef.current) {
      textareaRef.current.scrollTop = 0;
      textareaRef.current.scrollLeft = 0;
    }
    if (preRef.current) {
      preRef.current.scrollTop = 0;
      preRef.current.scrollLeft = 0;
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

    // 4. Backspace: Smart Un-indent ("Tab" назад) and empty pair deletion
    if (e.key === 'Backspace' && !e.ctrlKey && !e.metaKey && !e.altKey) {
      if (start === end && start > 0) {
        // 4a. Delete both characters when between empty pairs: (), [], {}, "", ''
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
              updateCursorPosition();
            }
          }, 0);
          return;
        }

        // 4b. Smart programming un-indent by Tab stop (4 spaces)
        const lineStart = code.lastIndexOf('\n', start - 1) + 1;
        const beforeInLine = code.substring(lineStart, start);

        // Check if cursor is preceded by spaces on the current line
        const trailingSpacesMatch = beforeInLine.match(/ +$/);
        if (trailingSpacesMatch) {
          const numSpaces = trailingSpacesMatch[0].length;
          const isPureIndentation = beforeInLine.length === numSpaces;
          const col = beforeInLine.length;
          const remainder = col % 4;
          const spacesToDelete = remainder === 0 
            ? Math.min(4, numSpaces) 
            : Math.min(remainder, numSpaces);

          // If line up to cursor is pure indentation, ALWAYS delete to previous tab stop (even 1-4 spaces)
          // If there is code before spaces, delete to previous tab stop if spacesToDelete > 1 or numSpaces >= 4
          if (isPureIndentation || spacesToDelete > 1 || numSpaces >= 4) {
            e.preventDefault();
            const count = (numSpaces >= 4 && spacesToDelete === 0) ? 4 : spacesToDelete;
            const actualCount = count > 0 ? count : (isPureIndentation ? numSpaces : 1);
            const newCode = code.substring(0, start - actualCount) + code.substring(start);
            onUpdate({ code: newCode });
            setTimeout(() => {
              if (textareaRef.current) {
                textareaRef.current.selectionStart = textareaRef.current.selectionEnd = start - actualCount;
                updateCursorPosition();
              }
            }, 0);
            return;
          }
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

  // Python Keywords & Syntax regexes
  const keywords = /\b(def|class|import|from|as|return|if|elif|else|while|for|in|try|except|finally|raise|with|yield|lambda|pass|break|continue|global|nonlocal|assert|async|await|match|case|del)\b/g;
  const logicOps = /\b(and|or|not|is)\b/g;
  const builtins = /\b(print|len|range|int|float|str|list|dict|set|tuple|bool|sum|min|max|abs|round|enumerate|zip|map|filter|open|input|type|sorted|reversed|any|all|isinstance|issubclass|id|super|help|dir)\b/g;
  const literals = /\b(True|False|None)\b/g;
  const specialVars = /\b(self|cls)\b/g;

  function highlightTokens(text: string, keyPrefix: string): React.ReactNode {
    const tokenRegex = /(@[a-zA-Z_][a-zA-Z0-9_.]*|\b[a-zA-Z_][a-zA-Z0-9_]*\b|\b\d+(?:\.\d+)?\b|[^\s\w]+|\s+)/g;
    const tokens = text.match(tokenRegex) || [text];

    return tokens.map((token, idx) => {
      const key = `${keyPrefix}-${idx}`;

      if (token.startsWith('@')) {
        return (
          <span key={key} className={isDarkMode ? 'text-yellow-400 font-medium' : 'text-amber-600 font-medium'}>
            {token}
          </span>
        );
      }

      if (keywords.test(token)) {
        keywords.lastIndex = 0;
        return (
          <span key={key} className={isDarkMode ? 'text-purple-400 font-semibold' : 'text-purple-600 font-semibold'}>
            {token}
          </span>
        );
      }

      if (logicOps.test(token)) {
        logicOps.lastIndex = 0;
        return (
          <span key={key} className={isDarkMode ? 'text-rose-400 font-medium' : 'text-rose-600 font-medium'}>
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
          <span key={key} className={isDarkMode ? 'text-amber-300 font-semibold' : 'text-amber-700 font-semibold'}>
            {token}
          </span>
        );
      }

      if (specialVars.test(token)) {
        specialVars.lastIndex = 0;
        return (
          <span key={key} className={isDarkMode ? 'text-rose-400/90 italic' : 'text-rose-700 italic'}>
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

      if (/^(==|!=|<=|>=|<|>|\+|-|\*|\/|\*\*|\/\/|%|=|->|:|\+=|-=|\*=|\/=)$/.test(token)) {
        return (
          <span key={key} className={isDarkMode ? 'text-indigo-400 font-medium' : 'text-indigo-600 font-medium'}>
            {token}
          </span>
        );
      }

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

  const renderLineTokens = (line: string, lineIdx: number) => {
    const commentIdx = line.indexOf('#');
    let codePart = commentIdx !== -1 ? line.substring(0, commentIdx) : line;
    const commentPart = commentIdx !== -1 ? line.substring(commentIdx) : '';

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
      <>
        {parts}
        {commentPart && (
          <span className={`italic ${isDarkMode ? 'text-zinc-500' : 'text-slate-400'}`}>
            {commentPart}
          </span>
        )}
      </>
    );
  };

  const lines = (block.code || '').split('\n');
  const lineCount = Math.max(1, lines.length);
  const isMinimized = block.isMinimized ?? false;

  // Character and font scale is governed EXCLUSIVELY by userScale (adjusted only by dragging the bottom-right resize handle)
  const scaleRatio = Math.max(0.65, Math.min(3.0, block.userScale ?? 1.0));

  const codeFontSize = Math.round(13 * scaleRatio * 10) / 10;
  const codeLineHeight = Math.round(20 * scaleRatio * 10) / 10;
  const lineNumberFontSize = Math.round(11 * scaleRatio * 10) / 10;
  const gutterWidth = Math.round((lineCount >= 100 ? 46 : 38) * scaleRatio);
  const editorPaddingTop = Math.round(8 * scaleRatio);
  const editorPaddingBottom = Math.round(8 * scaleRatio);
  const editorPaddingLeft = Math.round(12 * scaleRatio);
  const editorPaddingRight = Math.round(20 * scaleRatio);
  const footerFontSize = Math.round(10.5 * Math.min(1.4, Math.max(0.8, scaleRatio)) * 10) / 10;
  const headerHeight = Math.round(28 * Math.min(1.4, Math.max(0.8, scaleRatio)));
  const footerHeight = Math.round(24 * Math.min(1.4, Math.max(0.8, scaleRatio)));

  const charWidth = codeFontSize * 0.605;
  const maxVisualLength = lines.reduce((max, line) => {
    const expanded = line.replace(/\t/g, '    ');
    return Math.max(max, expanded.length);
  }, 0);
  const textContentWidth = Math.ceil(maxVisualLength * charWidth);
  const neededWidth = gutterWidth + editorPaddingLeft + textContentWidth + editorPaddingRight;

  // Manual base width: regulated solely by user corner drag (or default 420px at current scale)
  const baseManualWidth = block.manualWidth || (block.userScale ? Math.round(420 * scaleRatio) : Math.min(block.width || 420, 600));
  // The window automatically expands to the right to fit long code lines without clipping
  const effectiveWidth = Math.max(baseManualWidth, neededWidth);

  const editorContentHeight = lineCount * codeLineHeight + editorPaddingTop + editorPaddingBottom;
  const minBlockHeight = headerHeight + editorContentHeight + footerHeight;
  const baseManualHeight = block.manualHeight || (block.userScale ? Math.round(200 * scaleRatio) : minBlockHeight);
  // The window automatically expands downward to fit all lines
  const effectiveHeight = isMinimized ? headerHeight : Math.max(minBlockHeight, baseManualHeight);

  // Adjust window height to fit code content perfectly (green dot action)
  const handleAutoFitContent = () => {
    const linesCount = block.code.split('\n').length;
    const calculatedHeight = linesCount * codeLineHeight + editorPaddingTop + editorPaddingBottom + headerHeight + footerHeight;
    onUpdate({ height: calculatedHeight, manualHeight: calculatedHeight, isMinimized: false });
  };

  // Synchronize effective dimensions with parent for canvas export & hit-testing
  // Notice: updating width/height does NOT touch userScale or manualWidth!
  useEffect(() => {
    if (Math.abs((block.width || 0) - effectiveWidth) > 2 || Math.abs((block.height || 0) - effectiveHeight) > 2) {
      onUpdate({ width: effectiveWidth, height: effectiveHeight });
    }
  }, [effectiveWidth, effectiveHeight]);

  return (
    <div
      id={`python-code-block-${block.id}`}
      onClick={(e) => {
        e.stopPropagation();
        onFocus();
      }}
      className={`absolute rounded-xl overflow-hidden flex flex-col select-none codeblock-no-scroll transition-[box-shadow,border-color] duration-150 ${
        isDarkMode 
          ? 'bg-[#141518] text-zinc-100 shadow-2xl shadow-black/80' 
          : 'bg-white text-slate-900 shadow-xl shadow-slate-400/30'
      } ${isActive ? 'ring-2 ring-blue-500/80 ring-offset-2 ring-offset-transparent' : ''}`}
      style={{
        position: 'absolute',
        transform: `translate3d(${screenPos.x}px, ${screenPos.y}px, 0) scale(${scale})`,
        transformOrigin: '0 0',
        left: 0,
        top: 0,
        width: `${effectiveWidth}px`,
        height: `${effectiveHeight}px`,
        zIndex: isActive ? 30 : 15,
        willChange: 'transform'
      }}
    >
      {/* Compact Mac-style Window Header Bar without text */}
      <div
        onMouseDown={onDragStart}
        onTouchStart={onDragStart}
        style={{ height: `${headerHeight}px` }}
        className={`px-3 flex items-center justify-between cursor-move touch-none border-b border-black/5 dark:border-white/5 flex-shrink-0 ${
          isDarkMode 
            ? 'bg-[#1c1d22]' 
            : 'bg-slate-100/90'
        }`}
      >
        {/* Left: Window Control Traffic Light Dots */}
        <div className="flex items-center gap-1.5" onMouseDown={(e) => e.stopPropagation()}>
          {/* Red: Close / Delete */}
          <button
            onClick={onDelete}
            title="Удалить блок"
            className="group relative w-2.5 h-2.5 rounded-full bg-[#ff5f56] border border-[#e0443e] flex items-center justify-center transition-transform active:scale-90 hover:brightness-105"
          >
            <span className="opacity-0 group-hover:opacity-100 text-[7px] font-bold text-black/70 leading-none">×</span>
          </button>

          {/* Yellow: Minimize / Collapse */}
          <button
            onClick={() => onUpdate({ isMinimized: !isMinimized })}
            title={isMinimized ? "Развернуть" : "Свернуть"}
            className="group relative w-2.5 h-2.5 rounded-full bg-[#ffbd2e] border border-[#dea123] flex items-center justify-center transition-transform active:scale-90 hover:brightness-105"
          >
            <span className="opacity-0 group-hover:opacity-100 text-[7px] font-bold text-black/70 leading-none">-</span>
          </button>

          {/* Green: Fit to Content */}
          <button
            onClick={handleAutoFitContent}
            title="Подогнать высоту по коду"
            className="group relative w-2.5 h-2.5 rounded-full bg-[#27c93f] border border-[#1aab29] flex items-center justify-center transition-transform active:scale-90 hover:brightness-105"
          >
            <span className="opacity-0 group-hover:opacity-100 text-[6px] font-bold text-black/70 leading-none">+</span>
          </button>
        </div>

        {/* Right: Clean Icon-only Copy Button */}
        <button
          onClick={handleCopy}
          onMouseDown={(e) => e.stopPropagation()}
          className={`p-1 rounded transition-colors ${
            copied
              ? 'text-emerald-500'
              : (isDarkMode ? 'text-zinc-400 hover:text-zinc-200' : 'text-slate-400 hover:text-slate-700')
          }`}
          title="Скопировать код"
        >
          {copied ? (
            <Check className="w-3.5 h-3.5 text-emerald-500 stroke-[2.5]" />
          ) : (
            <Copy className="w-3.5 h-3.5" />
          )}
        </button>
      </div>

      {/* Editor Body */}
      {!isMinimized && (
        <div 
          className="flex flex-1 min-h-0 overflow-hidden relative"
          style={{ height: `${editorContentHeight}px` }}
        >
          {/* Left Column: Gutter Line Numbers */}
          <div
            className={`select-none flex flex-col items-end border-r flex-shrink-0 font-mono transition-colors ${
              isDarkMode 
                ? 'bg-[#18191e]/80 border-white/5 text-zinc-500' 
                : 'bg-slate-50/80 border-black/5 text-slate-400'
            }`}
            style={{
              width: `${gutterWidth}px`,
              paddingTop: `${editorPaddingTop}px`,
              paddingBottom: `${editorPaddingBottom}px`,
              paddingRight: `${Math.round(8 * scaleRatio)}px`,
            }}
          >
            {lines.map((_, i) => (
              <div
                key={i}
                style={{
                  height: `${codeLineHeight}px`,
                  lineHeight: `${codeLineHeight}px`,
                  fontSize: `${lineNumberFontSize}px`,
                  fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace',
                }}
                className="tabular-nums"
              >
                {i + 1}
              </div>
            ))}
          </div>

          {/* Right Column: Code Text Area with Highlighted Background and Transparent Interactive Textarea */}
          <div className="relative flex-1 min-w-0 h-full overflow-hidden">
            {/* Syntax Highlighted View Underneath */}
            <pre
              ref={preRef}
              aria-hidden="true"
              className="absolute inset-0 m-0 overflow-hidden pointer-events-none whitespace-pre select-none font-mono"
              style={{
                tabSize: 4,
                paddingTop: `${editorPaddingTop}px`,
                paddingBottom: `${editorPaddingBottom}px`,
                paddingLeft: `${editorPaddingLeft}px`,
                paddingRight: `${editorPaddingRight}px`,
                fontSize: `${codeFontSize}px`,
                lineHeight: `${codeLineHeight}px`,
                fontFamily: 'ui-monospace, SFMono-Regular, "JetBrains Mono", Menlo, Consolas, monospace',
                boxSizing: 'border-box'
              }}
            >
              {lines.map((line, lineIdx) => (
                <div
                  key={lineIdx}
                  style={{
                    height: `${codeLineHeight}px`,
                    lineHeight: `${codeLineHeight}px`,
                    fontSize: `${codeFontSize}px`,
                  }}
                >
                  {renderLineTokens(line, lineIdx)}
                  {line === '' && '\u00A0'}
                </div>
              ))}
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
              className={`absolute inset-0 w-full h-full m-0 bg-transparent text-transparent outline-none resize-none font-mono whitespace-pre overflow-hidden z-10 select-text ${
                isDarkMode 
                  ? 'caret-blue-400 selection:bg-blue-600/30' 
                  : 'caret-blue-600 selection:bg-blue-100'
              }`}
              style={{
                tabSize: 4,
                paddingTop: `${editorPaddingTop}px`,
                paddingBottom: `${editorPaddingBottom}px`,
                paddingLeft: `${editorPaddingLeft}px`,
                paddingRight: `${editorPaddingRight}px`,
                fontSize: `${codeFontSize}px`,
                lineHeight: `${codeLineHeight}px`,
                fontFamily: 'ui-monospace, SFMono-Regular, "JetBrains Mono", Menlo, Consolas, monospace',
                boxSizing: 'border-box'
              }}
              placeholder="# Введите Python код..."
            />
          </div>
        </div>
      )}

      {/* Clean Compact Bottom Status Bar */}
      {!isMinimized && (
        <div 
          className={`px-2.5 flex items-center justify-between border-t border-black/5 dark:border-white/5 select-none transition-colors flex-shrink-0 ${
            isDarkMode 
              ? 'bg-[#18191e] text-zinc-400' 
              : 'bg-slate-50 text-slate-500'
          }`}
          style={{ height: `${footerHeight}px`, fontSize: `${footerFontSize}px` }}
        >
          <div className="flex items-center gap-2">
            <span>{lineCount} {lineCount === 1 ? 'строка' : (lineCount < 5 ? 'строки' : 'строк')}</span>
            <span className="opacity-30">•</span>
            <span className="font-mono text-[10px] opacity-70">
              {cursorPos.line}:{cursorPos.col}
            </span>
          </div>

          {/* Resize Grip Handle */}
          <div 
            onMouseDown={onResizeStart}
            onTouchStart={onResizeStart}
            className="cursor-nwse-resize p-0.5 hover:text-blue-500 touch-none select-none transition-colors"
            title="Изменить размер блока"
          >
            <svg className="w-2.5 h-2.5 opacity-60" viewBox="0 0 10 10" fill="currentColor">
              <circle cx="8" cy="8" r="1.2" />
              <circle cx="4.5" cy="8" r="1.2" />
              <circle cx="8" cy="4.5" r="1.2" />
            </svg>
          </div>
        </div>
      )}
    </div>
  );
};

export default React.memo(PythonCodeBlock);
