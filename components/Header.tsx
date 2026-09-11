
import React, { useRef, useState, useEffect } from 'react';
import { Share2, Save, FolderOpen, Image as ImageIcon, Moon, Sun } from 'lucide-react';

interface HeaderProps {
  onClear: () => void;
  onSave: () => void;
  onOpen: (file: File) => void;
  onExportPNG: (boardName: string) => void;
  isDarkMode?: boolean;
  onToggleDarkMode?: () => void;
  isVisible?: boolean;
}

const Header: React.FC<HeaderProps> = ({ 
  onClear, 
  onSave, 
  onOpen, 
  onExportPNG,
  isDarkMode = false,
  onToggleDarkMode,
  isVisible = true
}) => {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const nameInputRef = useRef<HTMLInputElement>(null);
  const [boardName, setBoardName] = useState("Новая доска");
  const [isEditingName, setIsEditingName] = useState(false);

  const handleOpenClick = () => {
    fileInputRef.current?.click();
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      onOpen(file);
    }
    if (e.target) e.target.value = '';
  };

  useEffect(() => {
    if (isEditingName && nameInputRef.current) {
        nameInputRef.current.focus();
        nameInputRef.current.select();
    }
  }, [isEditingName]);

  const handleNameSubmit = () => {
      setIsEditingName(false);
      if (boardName.trim() === '') {
          setBoardName("Новая доска");
      }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
      if (e.key === 'Enter') {
          handleNameSubmit();
      }
  };

  return (
    <div 
      className={`fixed top-0 left-0 right-0 h-16 bg-white border-b border-gray-200 px-4 flex items-center justify-between z-30 shadow-sm select-none ui-smooth-transition ${
        isVisible ? 'opacity-100 translate-y-0 pointer-events-auto' : 'opacity-0 -translate-y-full pointer-events-none'
      }`}
    >
      <div className="flex items-center gap-4 pl-2">
        <div className="flex items-center gap-0 select-none cursor-pointer" onClick={() => window.location.reload()}>
          <span className="text-2xl font-bold text-gray-900 tracking-tight">Mathters</span>
        </div>

        <div className="h-6 w-px bg-gray-300" />

        <div className="flex flex-col justify-center">
            <div className="flex items-center gap-2 text-sm text-gray-900 font-medium h-5">
                {isEditingName ? (
                    <input
                        ref={nameInputRef}
                        type="text"
                        value={boardName}
                        onChange={(e) => setBoardName(e.target.value)}
                        onBlur={handleNameSubmit}
                        onKeyDown={handleKeyDown}
                        maxLength={20}
                        className="bg-white border border-blue-500 rounded px-1 py-0 outline-none text-sm text-gray-900 w-40"
                    />
                ) : (
                    <span 
                        onClick={() => setIsEditingName(true)}
                        className="cursor-pointer hover:bg-gray-100 px-2 py-0.5 rounded transition-colors truncate max-w-[200px]"
                        title="Переименовать"
                    >
                        {boardName}
                    </span>
                )}
            </div>
        </div>
      </div>

      <div className="flex items-center gap-2">
        <button 
          onClick={onSave}
          className="px-3 py-2 text-gray-700 hover:bg-gray-100 rounded-md font-medium text-sm flex items-center gap-2 transition-colors border border-gray-300"
          title="Сохранить проект как JSON"
        >
          <Save className="w-4 h-4" />
          JSON
        </button>

        <button 
          onClick={() => onExportPNG(boardName)}
          className="px-3 py-2 text-gray-700 hover:bg-gray-100 rounded-md font-medium text-sm flex items-center gap-2 transition-colors border border-gray-300"
          title="Экспорт всей доски в PNG"
        >
          <ImageIcon className="w-4 h-4" />
          PNG
        </button>

        {onToggleDarkMode && (
          <button 
            onClick={onToggleDarkMode}
            className={`p-2 rounded-md font-medium text-sm flex items-center justify-center transition-colors border border-gray-300 ${
              isDarkMode ? 'bg-amber-50 text-amber-500 hover:bg-amber-100' : 'text-gray-700 hover:bg-gray-100'
            }`}
            title={isDarkMode ? "Светлая тема доски (D)" : "Тёмная тема доски (D)"}
          >
            {isDarkMode ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
          </button>
        )}

        <div className="h-6 w-px bg-gray-300 mx-1" />

        <button 
          onClick={handleOpenClick}
          className="px-3 py-2 text-gray-700 hover:bg-gray-100 rounded-md font-medium text-sm flex items-center gap-2 transition-colors border border-gray-300"
          title="Импортировать JSON проект"
        >
          <FolderOpen className="w-4 h-4" />
          Импорт
        </button>
        <input 
            type="file" 
            ref={fileInputRef} 
            onChange={handleFileChange} 
            className="hidden" 
            accept=".json,.mathters"
        />

        <button 
          onClick={onClear}
          className="ml-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-md font-medium text-sm flex items-center gap-2 transition-colors"
        >
          <Share2 className="w-4 h-4" />
          Поделиться
        </button>
      </div>
    </div>
  );
};

export default Header;
