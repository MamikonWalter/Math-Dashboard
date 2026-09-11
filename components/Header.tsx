import React, { useRef, useState, useEffect } from 'react';
import { Share2, Save, FolderOpen, Image as ImageIcon, Moon, Sun, Cloud, CloudOff, LogIn, LogOut } from 'lucide-react';
import { User } from 'firebase/auth';

interface HeaderProps {
  onClear: () => void;
  onSave: () => void;
  onOpen: (file: File) => void;
  onExportPNG: (boardName: string) => void;
  onShare: () => void;
  boardName: string;
  onBoardNameChange: (name: string) => void;
  user: User | null;
  onLogin: () => void;
  onLogout: () => void;
  isSyncing?: boolean;
  isDarkMode?: boolean;
  onToggleDarkMode?: () => void;
  isVisible?: boolean;
}

const Header: React.FC<HeaderProps> = ({ 
  onClear, 
  onSave, 
  onOpen, 
  onExportPNG,
  onShare,
  boardName,
  onBoardNameChange,
  user,
  onLogin,
  onLogout,
  isSyncing = false,
  isDarkMode = false,
  onToggleDarkMode,
  isVisible = true
}) => {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const nameInputRef = useRef<HTMLInputElement>(null);
  const [localName, setLocalName] = useState(boardName);
  const [isEditingName, setIsEditingName] = useState(false);

  useEffect(() => {
    setLocalName(boardName);
  }, [boardName]);

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
    const trimmed = localName.trim() || "Новая доска";
    setLocalName(trimmed);
    onBoardNameChange(trimmed);
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
        <div className="flex items-center gap-2 select-none cursor-pointer" onClick={() => window.location.reload()}>
          <span className={`text-2xl font-bold tracking-tight transition-colors ${isDarkMode ? 'text-white' : 'text-gray-900'}`}>
            Mathters
          </span>
        </div>

        <div className={`h-6 w-px transition-colors ${isDarkMode ? 'bg-[#3f3f46]' : 'bg-gray-300'}`} />

        <div className="flex items-center gap-2">
          {isEditingName ? (
            <input
              ref={nameInputRef}
              type="text"
              value={localName}
              onChange={(e) => setLocalName(e.target.value)}
              onBlur={handleNameSubmit}
              onKeyDown={handleKeyDown}
              maxLength={30}
              className={`rounded px-2 py-0.5 outline-none text-sm w-44 border font-medium ${
                isDarkMode 
                  ? 'bg-[#18181b] border-blue-500 text-gray-100' 
                  : 'bg-white border-blue-500 text-gray-900'
              }`}
            />
          ) : (
            <span 
              onClick={() => setIsEditingName(true)}
              className={`cursor-pointer px-2 py-0.5 rounded font-medium text-sm transition-colors truncate max-w-[180px] ${
                isDarkMode 
                  ? 'text-gray-200 hover:bg-[#2c2c31]' 
                  : 'text-gray-900 hover:bg-gray-100'
              }`}
              title="Нажмите, чтобы переименовать доску"
            >
              {localName}
            </span>
          )}

          {/* Sync indicator */}
          <div 
            className="flex items-center gap-1 text-[11px] font-medium text-emerald-500"
            title="Облачная синхронизация Firestore активна"
          >
            <Cloud className={`w-3.5 h-3.5 ${isSyncing ? 'animate-pulse text-blue-500' : 'text-emerald-500'}`} />
            <span className="hidden sm:inline text-[10px] text-gray-400">
              {isSyncing ? 'Сохранение...' : 'В сети'}
            </span>
          </div>
        </div>
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
          <span className="hidden md:inline">JSON</span>
        </button>

        <button 
          onClick={() => onExportPNG(localName)}
          className={`px-3 py-2 rounded-md font-medium text-sm flex items-center gap-2 transition-colors border ${
            isDarkMode 
              ? 'text-gray-200 bg-[#28282e] hover:bg-[#32323a] border-[#3f3f46]' 
              : 'text-gray-700 bg-white hover:bg-gray-100 border-gray-300'
          }`}
          title="Экспорт всей доски в PNG"
        >
          <ImageIcon className="w-4 h-4" />
          <span className="hidden md:inline">PNG</span>
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
          <span className="hidden md:inline">Импорт</span>
        </button>
        <input 
          type="file" 
          ref={fileInputRef} 
          onChange={handleFileChange} 
          className="hidden" 
          accept=".json,.mathters"
        />

        {/* User login / status button */}
        {user ? (
          <div className="flex items-center gap-1.5 pl-1">
            {user.photoURL ? (
              <img 
                src={user.photoURL} 
                alt={user.displayName || 'Пользователь'} 
                className="w-8 h-8 rounded-full border border-blue-500/40 object-cover"
                referrerPolicy="no-referrer"
                title={`Вы вошли как ${user.displayName || user.email}`}
              />
            ) : (
              <div 
                className="w-8 h-8 rounded-full bg-blue-600 text-white font-bold flex items-center justify-center text-xs"
                title={`Вы вошли как ${user.displayName || user.email}`}
              >
                {(user.displayName || user.email || 'U').charAt(0).toUpperCase()}
              </div>
            )}
            <button
              onClick={onLogout}
              className={`p-2 rounded-md text-sm border transition-colors ${
                isDarkMode 
                  ? 'text-gray-400 hover:text-red-400 hover:bg-[#28282e] border-[#3f3f46]' 
                  : 'text-gray-500 hover:text-red-600 hover:bg-gray-100 border-gray-300'
              }`}
              title="Выйти из аккаунта Google"
            >
              <LogOut className="w-4 h-4" />
            </button>
          </div>
        ) : (
          <button
            onClick={onLogin}
            className={`px-3 py-2 rounded-md font-medium text-xs flex items-center gap-1.5 border transition-colors ${
              isDarkMode 
                ? 'bg-blue-600/20 text-blue-400 border-blue-500/40 hover:bg-blue-600/30' 
                : 'bg-blue-50 text-blue-600 border-blue-200 hover:bg-blue-100'
            }`}
            title="Войти через Google для синхронизации"
          >
            <LogIn className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Войти</span>
          </button>
        )}

        <button 
          onClick={onShare}
          className="ml-1 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-md font-medium text-sm flex items-center gap-2 transition-colors shadow-sm"
          title="Открыть доступ к доске для совместной работы"
        >
          <Share2 className="w-4 h-4" />
          <span>Поделиться</span>
        </button>
      </div>
    </div>
  );
};

export default Header;
