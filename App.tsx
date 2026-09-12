
import React, { useState, useCallback, useEffect, useRef } from 'react';
import Header from './components/Header';
import Toolbar from './components/Toolbar';
import ColorPicker from './components/ColorPicker';
import Whiteboard from './components/Whiteboard';
import HistoryControls from './components/HistoryControls';
import EraserProperties from './components/EraserProperties';
import ShapeProperties from './components/ShapeProperties';
import ThreeDShapesPanel from './components/ThreeDShapesPanel';
import ZoomControls from './components/ZoomControls';
import AIAssistant from './components/AIAssistant';
import { ToolType, WhiteboardHandle } from './types';
import { DEFAULT_COLOR, DEFAULT_STROKE_WIDTH, DEFAULT_ERASER_WIDTH, DEFAULT_SHAPE_SIZE } from './constants';
import { GoogleGenAI } from "@google/genai";
import { jsPDF } from "jspdf";

const App: React.FC = () => {
  const [currentTool, setCurrentTool] = useState<ToolType>('pen');
  const [color, setColor] = useState(DEFAULT_COLOR);
  const [strokeWidth, setStrokeWidth] = useState(DEFAULT_STROKE_WIDTH);
  const [eraserWidth, setEraserWidth] = useState(DEFAULT_ERASER_WIDTH);
  const [shapeSize, setShapeSize] = useState(DEFAULT_SHAPE_SIZE);
  const [zoom, setZoom] = useState(1);
  const [isShapeSelected, setIsShapeSelected] = useState(false);
  const [showGrid, setShowGrid] = useState(false);
  
  // UI Visibility
  const [isUIVisible, setIsUIVisible] = useState(true);
  const [isDarkMode, setIsDarkMode] = useState(false);
  const [isColorPickerOpen, setIsColorPickerOpen] = useState(true);
  const [is3DPanelOpen, setIs3DPanelOpen] = useState(false);

  const handleToggleDarkMode = useCallback(() => {
    setIsDarkMode(prev => {
      const next = !prev;
      setColor(currentColor => {
        if (next && (currentColor.toLowerCase() === '#000000' || currentColor === '#111111')) {
          return '#ffffff';
        } else if (!next && currentColor.toLowerCase() === '#ffffff') {
          return '#000000';
        }
        return currentColor;
      });
      return next;
    });
  }, []);
  
  // AI State
  const [isAIPanelOpen, setIsAIPanelOpen] = useState(false);
  const [isAISolving, setIsAISolving] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [aiResponse, setAIResponse] = useState<string | null>(null);

  // Undo/Redo State
  const [canUndo, setCanUndo] = useState(false);
  const [canRedo, setCanRedo] = useState(false);
  const [undoTrigger, setUndoTrigger] = useState(0);
  const [redoTrigger, setRedoTrigger] = useState(0);

  const whiteboardRef = useRef<WhiteboardHandle>(null);

  const handleUndo = useCallback(() => setUndoTrigger(prev => prev + 1), []);
  const handleRedo = useCallback(() => setRedoTrigger(prev => prev + 1), []);

  const handleHistoryChange = useCallback((undo: boolean, redo: boolean) => {
    setCanUndo(undo);
    setCanRedo(redo);
  }, []);
  
  const is3DShapeTool = ['cube', 'cylinder', 'sphere', 'pyramid', 'prism'].includes(currentTool);
  const is2DShapeTool = ['square', 'circle', 'triangle', 'diamond', 'star', 'speech', 'arrow'].includes(currentTool);
  const isAnyShapeTool = is3DShapeTool || is2DShapeTool;

  const handleZoomIn = useCallback(() => {
    if (whiteboardRef.current) whiteboardRef.current.setZoom(zoom * 1.3);
  }, [zoom]);

  const handleZoomOut = useCallback(() => {
    if (whiteboardRef.current) whiteboardRef.current.setZoom(zoom / 1.3);
  }, [zoom]);

  const handleResetZoom = useCallback(() => {
    if (whiteboardRef.current) whiteboardRef.current.setZoom(1);
  }, []);

  useEffect(() => {
    if (currentTool === 'pen' || currentTool === 'dotted-line' || currentTool === 'text' || is2DShapeTool) {
        setIsColorPickerOpen(true);
        setIs3DPanelOpen(false);
    } else {
        setIsColorPickerOpen(false);
    }
  }, [currentTool, is2DShapeTool]);

  const handleAISolve = async () => {
    if (!whiteboardRef.current) return;
    setIsAIPanelOpen(true);
    setIsAISolving(true);
    setAIResponse(null);
    try {
      const dataUrl = whiteboardRef.current.getCanvasImage();
      if (!dataUrl) throw new Error("Could not capture board");
      const base64Data = dataUrl.split(',')[1];
      const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
      const response = await ai.models.generateContent({
        model: 'gemini-3-flash-preview',
        contents: [{
            parts: [
              { inlineData: { mimeType: 'image/png', data: base64Data } },
              { text: "Вы — 'Mathters Assistant', помощник по математике мирового уровня. Проанализируйте рукописный или печатный текст, уравнения или геометрию на этой доске. Предоставьте четкое, пошаговое решение на русском языке. ВАЖНО: Не используйте символы $ или разметку LaTeX. Используйте стандартные символы Unicode для математики (например, x² + bx + c = 0). Будьте лаконичны, но обстоятельны." },
            ],
          }],
      });
      setAIResponse(response.text || "Я не смог это решить. Попробуйте нарисовать четче.");
    } catch (error) {
      console.error(error);
      setAIResponse("Упс! Что-то пошло не так. Проверьте подключение.");
    } finally {
      setIsAISolving(false);
    }
  };

  const handleExportPNG = (boardName: string) => {
    if (!whiteboardRef.current) return;
    const dataUrl = whiteboardRef.current.getCanvasImage();
    if (!dataUrl) return;
    
    const link = document.createElement('a');
    link.download = `${boardName.replace(/\s+/g, '-').toLowerCase()}-${new Date().getTime()}.png`;
    link.href = dataUrl;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleExport = async (boardName: string) => {
    if (!whiteboardRef.current) return;
    setIsExporting(true);
    try {
      const dataUrl = whiteboardRef.current.getCanvasImage();
      if (!dataUrl) throw new Error("Could not capture board");
      const base64Data = dataUrl.split(',')[1];
      
      const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
      const response = await ai.models.generateContent({
        model: 'gemini-3-flash-preview',
        contents: [{
            parts: [
              { inlineData: { mimeType: 'image/png', data: base64Data } },
              { text: "Проанализируйте это изображение доски Mathters. Ваша задача — ПЕРЕПИСАТЬ (транскрибировать) всё содержимое доски в подробный отчет. \n\nПРАВИЛА:\n1. НЕ РЕШАЙТЕ задачи самостоятельно. Переписывайте только то, что уже есть на доске. Если есть решение — перепишите его. Если только ответ — запишите ответ.\n2. Форматируйте заголовки задач строго так: 'Задача №[Число] ([Название]):'.\n3. Все условия задач пишите с новой строки после слова 'Условие:'.\n4. Используйте Unicode-символы для дробей и формул (например, ½, ⅓, √, π, ², ³, ±, ≠).\n5. КАТЕГОРИЧЕСКИ НЕ используйте символы $ или LaTeX.\n6. НЕ используйте Markdown выделение (никаких ** или *).\n7. Опишите АБСОЛЮТНО ВСЕ задачи и записи на доске, вне зависимости от их количества." },
            ],
          }],
      });

      const summaryText = response.text || "Доска пуста.";
      const doc = new jsPDF();
      
      // Load Cyrillic Fonts (Roboto Regular and Bold)
      try {
          const loadFont = async (url: string, name: string, style: string) => {
              const res = await fetch(url);
              const blob = await res.blob();
              const reader = new FileReader();
              const base64 = await new Promise<string>((resolve) => {
                  reader.onloadend = () => resolve((reader.result as string).split(',')[1]);
                  reader.readAsDataURL(blob);
              });
              doc.addFileToVFS(`${name}-${style}.ttf`, base64);
              doc.addFont(`${name}-${style}.ttf`, name, style);
          };

          await loadFont('https://cdnjs.cloudflare.com/ajax/libs/pdfmake/0.1.66/fonts/Roboto/Roboto-Regular.ttf', 'Roboto', 'normal');
          await loadFont('https://cdnjs.cloudflare.com/ajax/libs/pdfmake/0.1.66/fonts/Roboto/Roboto-Bold.ttf', 'Roboto', 'bold');
          doc.setFont('Roboto', 'normal');
      } catch (e) {
          console.warn("Could not load fonts", e);
      }

      const pageWidth = doc.internal.pageSize.getWidth();
      const pageHeight = doc.internal.pageSize.getHeight();
      const margin = 20;
      let cursorY = 25;

      const checkNewPage = (needed: number) => {
          if (cursorY + needed > pageHeight - 20) {
              doc.addPage();
              cursorY = 20;
              doc.setFont('Roboto', 'normal');
          }
      };

      // Header
      doc.setFontSize(22);
      doc.setTextColor(0, 102, 255);
      doc.setFont('Roboto', 'bold');
      doc.text("Mathters: Отчет", margin, cursorY);
      cursorY += 12;
      
      doc.setFontSize(14);
      doc.setTextColor(50, 50, 50);
      doc.setFont('Roboto', 'normal');
      doc.text(`Доска: ${boardName}`, margin, cursorY);
      cursorY += 8;
      
      doc.setFontSize(10);
      doc.setTextColor(150, 150, 150);
      doc.text(`Экспортировано: ${new Date().toLocaleString('ru-RU')}`, margin, cursorY);
      cursorY += 12;

      doc.setDrawColor(220, 220, 220);
      doc.line(margin, cursorY, pageWidth - margin, cursorY);
      cursorY += 15;

      const lines = summaryText.split('\n');
      const regularFontSize = 12;
      const titleFontSize = 14; // +2pt larger as requested
      
      lines.forEach((line) => {
          // Remove Markdown artifacts
          const cleanLine = line.replace(/\*\*/g, '').replace(/^\*\s*/, '').replace(/^\d+\.\s*/, '').trim();
          if (!cleanLine) {
              cursorY += 5;
              return;
          }

          const isTaskTitle = cleanLine.toLowerCase().startsWith('задача №');
          const isCondition = cleanLine.toLowerCase().startsWith('условие:');

          if (isTaskTitle) {
              checkNewPage(20);
              cursorY += 8;
              doc.setFontSize(titleFontSize);
              doc.setFont('Roboto', 'bold');
              doc.setTextColor(0, 0, 0);
              doc.text(cleanLine, margin, cursorY);
              cursorY += 10;
          } 
          else if (isCondition) {
              checkNewPage(15);
              doc.setFontSize(regularFontSize);
              doc.setFont('Roboto', 'bold');
              doc.setTextColor(80, 80, 80);
              doc.text("Условие:", margin, cursorY);
              cursorY += 8;
              
              const conditionBody = cleanLine.substring(cleanLine.toLowerCase().indexOf('условие:') + 8).trim();
              if (conditionBody) {
                  doc.setFont('Roboto', 'normal');
                  doc.setTextColor(0, 0, 0);
                  const splitBody = doc.splitTextToSize(conditionBody, pageWidth - (margin * 2 + 5));
                  splitBody.forEach((bl: string) => {
                      checkNewPage(8);
                      doc.text(bl, margin + 5, cursorY);
                      cursorY += 8;
                  });
              }
          }
          else {
              doc.setFontSize(regularFontSize);
              doc.setFont('Roboto', 'normal');
              doc.setTextColor(40, 40, 40);
              const splitLines = doc.splitTextToSize(cleanLine, pageWidth - (margin * 2));
              splitLines.forEach((sl: string) => {
                  checkNewPage(8);
                  doc.text(sl, margin, cursorY);
                  cursorY += 7;
              });
          }
      });

      doc.save(`${boardName.replace(/\s+/g, '-').toLowerCase()}-mathters-summary.pdf`);

    } catch (error) {
      console.error("Export failed", error);
      alert("Экспорт не удался. Пожалуйста, попробуйте еще раз.");
    } finally {
      setIsExporting(false);
    }
  };

  const toggle3DPanel = () => {
    setIs3DPanelOpen(!is3DPanelOpen);
    if (!is3DPanelOpen && !is3DShapeTool) setCurrentTool('cube');
  };

  const handleSetTool = useCallback((tool: ToolType) => {
    setCurrentTool(prevTool => {
        const newToolIs3D = ['cube', 'cylinder', 'sphere', 'pyramid', 'prism'].includes(tool);
        const newToolIsColorable = ['pen', 'dotted-line', 'text', 'square', 'circle', 'triangle', 'diamond', 'star', 'speech', 'arrow'].includes(tool);
        
        if (tool === prevTool && newToolIsColorable) {
            setIsColorPickerOpen(true);
        }
        
        if (!newToolIs3D && tool !== prevTool) setIs3DPanelOpen(false);
        return tool;
    });
    setIsShapeSelected(false);
  }, []);

  const handleShapeSelect = useCallback((size: number | null) => {
      if (size !== null) { setIsShapeSelected(true); setShapeSize(size); }
      else setIsShapeSelected(false);
  }, []);

  const handleDrawStart = useCallback(() => {
    setIsColorPickerOpen(false);
    setIs3DPanelOpen(false);
  }, []);

  const lastCopySourceRef = useRef<'board' | 'external'>('external');
  const isBoardCopyingRef = useRef<boolean>(false);

  // Keyboard Shortcuts (Layout-Independent)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Toggle UI visibility with Tab key
      if (e.key === 'Tab' || e.code === 'Tab') {
        if (!(e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement)) {
          e.preventDefault();
          setIsUIVisible(prev => !prev);
          return;
        }
      }

      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      const isCtrlOrCmd = e.metaKey || e.ctrlKey;
      const code = e.code;
      if (code === 'Delete' || code === 'Backspace') {
          e.preventDefault(); whiteboardRef.current?.deleteSelection(); return;
      }
      if (isCtrlOrCmd) {
          switch (code) {
              case 'KeyZ': e.preventDefault(); if (e.shiftKey) handleRedo(); else handleUndo(); break;
              case 'KeyY': e.preventDefault(); handleRedo(); break;
              case 'KeyC': {
                  const copied = whiteboardRef.current?.copySelection();
                  if (copied) {
                      lastCopySourceRef.current = 'board';
                      isBoardCopyingRef.current = true;
                      setTimeout(() => { isBoardCopyingRef.current = false; }, 200);
                  }
                  break;
              }
              // Ctrl/Cmd + V is handled cleanly by the unified paste listener below
          }
      } else {
          switch (code) {
              case 'KeyV': handleSetTool('cursor'); break;
              case 'KeyT': handleSetTool('text'); break;
              case 'KeyC': handleSetTool('code'); break;
              case 'KeyP': handleSetTool('pen'); break;
              case 'KeyM': handleAISolve(); break;
              case 'KeyI': handleSetTool('dotted-line'); break;
              case 'KeyS': handleSetTool('square'); break;
              case 'KeyE': handleSetTool('eraser'); break;
              case 'KeyG': setShowGrid(prev => !prev); break;
              case 'KeyD': handleToggleDarkMode(); break;
              case 'Equal': e.preventDefault(); handleZoomIn(); break;
              case 'Minus': e.preventDefault(); handleZoomOut(); break;
          }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleUndo, handleRedo, handleSetTool, handleZoomIn, handleZoomOut, handleToggleDarkMode]);

  // Handle Global Paste and Copy Source Tracking
  useEffect(() => {
    const handlePaste = (e: ClipboardEvent) => {
        if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;

        const items = e.clipboardData?.items;
        let imageFile: File | null = null;
        if (items) {
            for (const item of items) {
                if (item.type.indexOf('image') !== -1) {
                    const file = item.getAsFile();
                    if (file) {
                        imageFile = file;
                        break;
                    }
                }
            }
        }

        if (imageFile && lastCopySourceRef.current === 'external') {
            e.preventDefault();
            const reader = new FileReader();
            reader.onload = (event) => {
                const dataUrl = event.target?.result as string;
                whiteboardRef.current?.addImage(dataUrl, window.innerWidth / 2, window.innerHeight / 2);
            };
            reader.readAsDataURL(imageFile);
            return;
        }

        if (lastCopySourceRef.current === 'board' || !imageFile) {
            e.preventDefault();
            whiteboardRef.current?.pasteSelection();
        }
    };

    const handleBlur = () => {
        lastCopySourceRef.current = 'external';
    };

    const handleCopy = () => {
        if (!isBoardCopyingRef.current) {
            lastCopySourceRef.current = 'external';
        }
    };

    window.addEventListener('paste', handlePaste);
    window.addEventListener('blur', handleBlur);
    window.addEventListener('copy', handleCopy);

    return () => {
        window.removeEventListener('paste', handlePaste);
        window.removeEventListener('blur', handleBlur);
        window.removeEventListener('copy', handleCopy);
    };
  }, []);

  const handleClear = () => { if(window.confirm("Очистить доску?")) window.location.reload(); };
  const handleSave = () => {
    if (whiteboardRef.current) {
      const data = whiteboardRef.current.getSnapshot();
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a'); a.href = url; a.download = `mathters-${new Date().toISOString().slice(0, 10)}.json`;
      document.body.appendChild(a); a.click(); document.body.removeChild(a); URL.revokeObjectURL(url);
    }
  };

  const handleOpen = (file: File) => {
    const reader = new FileReader();
    reader.onload = (e) => { try { whiteboardRef.current?.restoreSnapshot(JSON.parse(e.target?.result as string)); } catch (err) { alert("Ошибка загрузки"); } };
    reader.readAsText(file);
  };

  return (
    <div className={`relative w-screen h-screen overflow-hidden ${isDarkMode ? 'bg-[#18181b]' : 'bg-[#f0f2f5]'} transition-colors duration-300 select-none`}>
      <Header 
        onClear={handleClear} 
        onSave={handleSave} 
        onOpen={handleOpen} 
        onExportPNG={handleExportPNG}
        isDarkMode={isDarkMode}
        onToggleDarkMode={handleToggleDarkMode}
        isVisible={isUIVisible}
      />
      <Toolbar 
        currentTool={currentTool} 
        setTool={handleSetTool} 
        undo={handleUndo} 
        redo={handleRedo} 
        canUndo={canUndo} 
        canRedo={canRedo} 
        toggle3DPanel={toggle3DPanel} 
        is3DPanelOpen={is3DPanelOpen} 
        onAISolve={handleAISolve} 
        isAISolving={isAISolving} 
        isVisible={isUIVisible}
        isDarkMode={isDarkMode}
      />
      <ColorPicker 
        isVisible={isUIVisible && (currentTool === 'pen' || currentTool === 'dotted-line' || currentTool === 'text' || is2DShapeTool) && isColorPickerOpen} 
        color={color} 
        setColor={setColor} 
        strokeWidth={strokeWidth} 
        setStrokeWidth={setStrokeWidth} 
        isDarkMode={isDarkMode}
      />
      <EraserProperties 
        isVisible={isUIVisible && currentTool === 'eraser'} 
        size={eraserWidth} 
        setSize={setEraserWidth} 
        isDarkMode={isDarkMode}
      />
      <ThreeDShapesPanel 
        isVisible={isUIVisible && is3DPanelOpen} 
        currentTool={currentTool} 
        setTool={handleSetTool} 
        isDarkMode={isDarkMode}
      />
      <ShapeProperties 
        isVisible={isUIVisible && (isAnyShapeTool || (currentTool === 'cursor' && isShapeSelected))} 
        size={shapeSize} 
        setSize={setShapeSize} 
        isDarkMode={isDarkMode}
      />
      <HistoryControls 
        onUndo={handleUndo} 
        onRedo={handleRedo} 
        canUndo={canUndo} 
        canRedo={canRedo} 
        isVisible={isUIVisible}
        isDarkMode={isDarkMode}
      />
      <AIAssistant 
        isOpen={isUIVisible && isAIPanelOpen} 
        onClose={() => setIsAIPanelOpen(false)} 
        isLoading={isAISolving} 
        response={aiResponse} 
        isDarkMode={isDarkMode}
      />
      <ZoomControls 
        zoom={zoom} 
        onZoomIn={handleZoomIn} 
        onZoomOut={handleZoomOut} 
        onReset={handleResetZoom} 
        showGrid={showGrid} 
        toggleGrid={() => setShowGrid(!showGrid)} 
        isDarkMode={isDarkMode}
        toggleDarkMode={handleToggleDarkMode}
        isVisible={isUIVisible}
      />
      <Whiteboard 
        ref={whiteboardRef} 
        tool={currentTool} 
        color={color} 
        strokeWidth={strokeWidth} 
        eraserWidth={eraserWidth} 
        shapeSize={shapeSize} 
        showGrid={showGrid} 
        isDarkMode={isDarkMode}
        onHistoryChange={handleHistoryChange} 
        triggerUndo={undoTrigger} 
        triggerRedo={redoTrigger} 
        onDrawStart={handleDrawStart} 
        onZoomChange={setZoom} 
        onShapeSelect={handleShapeSelect} 
      />
    </div>
  );
};

export default App;
