
import React, { useRef, useState, useEffect } from 'react';
import { Share2, Save, FolderOpen, Image as ImageIcon, Moon, Sun, Users, Copy, Check } from 'lucide-react';

interface HeaderProps {
  onClear: () => void;
  onSave: () => void;
  onOpen: (file: File) => void;
  onExportPNG: (boardName: string) => void;
  isDarkMode?: boolean;
  onToggleDarkMode?: () => void;
  isVisible?: boolean;
  roomId?: string | null;
  userCount?: number;
  isServerOnline?: boolean | null;
  cloudStatus?: 'synced' | 'saving' | 'offline';
  onOpenRoomModal?: () => void;
}

const Header: React.FC<HeaderProps> = ({ 
  onClear, 
  onSave, 
  onOpen, 
  onExportPNG,
  isDarkMode = false,
  onToggleDarkMode,
  isVisible = true,
  roomId,
  userCount = 1,
  isServerOnline = null,
  cloudStatus = 'synced',
  onOpenRoomModal
}) => {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const nameInputRef = useRef<HTMLInputElement>(null);
  const [boardName, setBoardName] = useState("Новая доска");
  const [isEditingName, setIsEditingName] = useState(false);
  const [copied, setCopied] = useState(false);

  const handleShareClick = () => {
    if (roomId) {
      const url = `${window.location.origin}${window.location.pathname}?room=${encodeURIComponent(roomId)}`;
      navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } else if (onOpenRoomModal) {
      onOpenRoomModal();
    }
  };

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
      className={`fixed top-0 left-0 right-0 h-16 px-4 flex items-center justify-between z-30 shadow-sm select-none ui-smooth-transition transition-colors duration-300 ${
        isDarkMode 
          ? 'bg-[#202024] border-b border-[#323238] text-gray-100' 
          : 'bg-white border-b border-gray-200 text-gray-900'
      } ${
        isVisible ? 'opacity-100 translate-y-0 pointer-events-auto' : 'opacity-0 -translate-y-full pointer-events-none'
      }`}
    >
      <div className="flex items-center gap-4 pl-2">
        <div className="flex items-center gap-0 select-none cursor-pointer" onClick={() => window.location.reload()}>
          <span className={`text-2xl font-bold tracking-tight transition-colors ${isDarkMode ? 'text-white' : 'text-gray-900'}`}>Mathters</span>
        </div>

        <div className={`h-6 w-px transition-colors ${isDarkMode ? 'bg-[#3f3f46]' : 'bg-gray-300'}`} />

        <div className="flex flex-col justify-center">
            <div className="flex items-center gap-2 text-sm font-medium h-5">
                {isEditingName ? (
                    <input
                        ref={nameInputRef}
                        type="text"
                        value={boardName}
                        onChange={(e) => setBoardName(e.target.value)}
                        onBlur={handleNameSubmit}
                        onKeyDown={handleKeyDown}
                        maxLength={20}
                        className={`rounded px-1.5 py-0.5 outline-none text-sm w-40 border ${
                          isDarkMode 
                            ? 'bg-[#18181b] border-blue-500 text-gray-100' 
                            : 'bg-white border-blue-500 text-gray-900'
                        }`}
                    />
                ) : (
                    <span 
                        onClick={() => setIsEditingName(true)}
                        className={`cursor-pointer px-2 py-0.5 rounded transition-colors truncate max-w-[200px] ${
                          isDarkMode 
                            ? 'text-gray-200 hover:bg-[#2c2c31]' 
                            : 'text-gray-900 hover:bg-gray-100'
                        }`}
                        title="Переименовать"
                    >
                        {boardName}
                    </span>
                )}
            </div>
        </div>
        {roomId && (
          <div className="hidden sm:flex items-center gap-2">
            <button
              onClick={handleShareClick}
              className={`px-2.5 py-1 rounded-lg text-xs font-mono font-medium flex items-center gap-1.5 transition-colors border ${
                isDarkMode ? 'bg-[#18181b] border-[#3f3f46] hover:border-blue-500 text-blue-400' : 'bg-gray-100 border-gray-300 hover:border-blue-500 text-blue-600'
              }`}
              title="Код доступа (нажмите, чтобы скопировать ссылку)"
            >
              <span className="font-sans text-[11px] text-gray-400">Код:</span>
              <span className="font-bold">{roomId}</span>
              {copied ? <Check className="w-3.5 h-3.5 text-emerald-500" /> : <Copy className="w-3.5 h-3.5 opacity-60" />}
            </button>

            <div 
              className={`px-2.5 py-1 rounded-lg text-xs font-medium flex items-center gap-1.5 border transition-colors ${
                userCount > 1
                  ? isDarkMode ? 'bg-emerald-950/40 border-emerald-500/40 text-emerald-400' : 'bg-emerald-50 border-emerald-300 text-emerald-700'
                  : isDarkMode ? 'bg-[#18181b] border-[#3f3f46] text-gray-300' : 'bg-gray-100 border-gray-300 text-gray-700'
              }`}
              title={`Совместное рисование активно (работает на любых устройствах: ПК, планшет, телефон). Сейчас на доске: ${userCount} ${userCount === 1 ? 'участник' : 'участника'}`}
            >
              <span className={`w-2 h-2 rounded-full ${userCount > 1 ? 'bg-emerald-500 animate-pulse' : 'bg-emerald-400'}`} />
              <Users className="w-3.5 h-3.5 opacity-80" />
              <span>{userCount > 1 ? `${userCount} в сети` : '1 в сети'}</span>
            </div>

            {onOpenRoomModal && (
              <button
                onClick={onOpenRoomModal}
                className={`px-2.5 py-1 rounded-lg text-xs font-medium transition-colors border ${
                  isDarkMode ? 'bg-[#28282e] hover:bg-[#32323a] border-[#3f3f46] text-gray-300' : 'bg-white hover:bg-gray-100 border-gray-300 text-gray-700'
                }`}
                title="Сменить доску или войти по другому коду"
              >
                Сменить доску
              </button>
            )}
          </div>
        )}
      </div>

      <div className="flex items-center gap-2">
        <button 
          onClick={onSave}
          className={`px-3 py-2 rounded-md font-medium text-sm flex items-center gap-2 transition-colors border ${
            isDarkMode 
              ? 'text-gray-200 bg-[#28282e] hover:bg-[#32323a] border-[#3f3f46]' 
              : 'text-gray-700 bg-white hover:bg-gray-100 border-gray-300'
          }`}
          title="Сохранить проект как JSON"
        >
          <Save className="w-4 h-4" />
          JSON
        </button>

        <button 
          onClick={() => onExportPNG(boardName)}
          className={`px-3 py-2 rounded-md font-medium text-sm flex items-center gap-2 transition-colors border ${
            isDarkMode 
              ? 'text-gray-200 bg-[#28282e] hover:bg-[#32323a] border-[#3f3f46]' 
              : 'text-gray-700 bg-white hover:bg-gray-100 border-gray-300'
          }`}
          title="Экспорт всей доски в PNG"
        >
          <ImageIcon className="w-4 h-4" />
          PNG
        </button>

        {onToggleDarkMode && (
          <button 
            onClick={onToggleDarkMode}
            className={`p-2 rounded-md font-medium text-sm flex items-center justify-center transition-colors border ${
              isDarkMode 
                ? 'bg-amber-400/15 text-amber-400 hover:bg-amber-400/25 border-[#3f3f46]' 
                : 'text-gray-700 bg-white hover:bg-gray-100 border-gray-300'
            }`}
            title={isDarkMode ? "Светлая тема доски (D)" : "Тёмная тема доски (D)"}
          >
            {isDarkMode ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
          </button>
        )}

        <div className={`h-6 w-px mx-1 transition-colors ${isDarkMode ? 'bg-[#3f3f46]' : 'bg-gray-300'}`} />

        <button 
          onClick={handleOpenClick}
          className={`px-3 py-2 rounded-md font-medium text-sm flex items-center gap-2 transition-colors border ${
            isDarkMode 
              ? 'text-gray-200 bg-[#28282e] hover:bg-[#32323a] border-[#3f3f46]' 
              : 'text-gray-700 bg-white hover:bg-gray-100 border-gray-300'
          }`}
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
          onClick={handleShareClick}
          className="ml-2 px-3.5 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-md font-medium text-sm flex items-center gap-2 transition-colors shadow-sm"
          title="Поделиться доской (скопировать ссылку с кодом доступа)"
        >
          {copied ? <Check className="w-4 h-4 text-emerald-300" /> : <Share2 className="w-4 h-4" />}
          {copied ? 'Скопировано!' : 'Поделиться'}
        </button>
      </div>
    </div>
  );
};

export default Header;
