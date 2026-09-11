import React, { useState } from 'react';
import { Share2, Copy, Check, X, Users, Globe, Lock, LogIn, Sparkles } from 'lucide-react';
import { User } from 'firebase/auth';

interface ShareModalProps {
  isOpen: boolean;
  onClose: () => void;
  boardId: string;
  boardName: string;
  user: User | null;
  onLogin: () => void;
  isDarkMode?: boolean;
}

export const ShareModal: React.FC<ShareModalProps> = ({
  isOpen,
  onClose,
  boardId,
  boardName,
  user,
  onLogin,
  isDarkMode = false,
}) => {
  const [copied, setCopied] = useState(false);

  if (!isOpen) return null;

  const shareUrl = `${window.location.origin}${window.location.pathname}?board=${encodeURIComponent(boardId)}`;

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch (err) {
      console.error('Failed to copy', err);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm animate-in fade-in duration-200">
      <div 
        className={`w-full max-w-md rounded-2xl p-6 shadow-2xl border transition-all ${
          isDarkMode 
            ? 'bg-[#202024] border-[#323238] text-gray-100 shadow-black/60' 
            : 'bg-white border-gray-200 text-gray-800 shadow-xl'
        }`}
      >
        {/* Header */}
        <div className="flex items-center justify-between pb-4 border-b border-gray-200 dark:border-zinc-800">
          <div className="flex items-center gap-2.5">
            <div className="p-2 bg-blue-600/10 text-blue-500 rounded-xl">
              <Share2 className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-semibold leading-none">Поделиться доской</h2>
              <p className={`text-xs mt-1 ${isDarkMode ? 'text-gray-400' : 'text-gray-500'}`}>
                Совместное рисование в реальном времени
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className={`p-1.5 rounded-lg transition-colors ${
              isDarkMode ? 'hover:bg-[#2c2c31] text-gray-400' : 'hover:bg-gray-100 text-gray-500'
            }`}
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Board Info & Room ID */}
        <div className="my-5 space-y-4">
          <div className={`p-3.5 rounded-xl border flex items-center justify-between ${
            isDarkMode ? 'bg-[#18181b] border-[#323238]' : 'bg-gray-50 border-gray-100'
          }`}>
            <div>
              <span className={`text-[11px] block uppercase font-mono tracking-wider ${isDarkMode ? 'text-gray-500' : 'text-gray-400'}`}>
                Комната
              </span>
              <span className="font-semibold text-sm">{boardName}</span>
            </div>
            <span className="px-2.5 py-1 text-xs font-mono font-medium rounded-md bg-blue-500/15 text-blue-400 border border-blue-500/20">
              {boardId}
            </span>
          </div>

          {/* Share Link */}
          <div>
            <label className={`block text-xs font-medium mb-1.5 ${isDarkMode ? 'text-gray-300' : 'text-gray-600'}`}>
              Ссылка для подключения с другого компьютера:
            </label>
            <div className="flex items-center gap-2">
              <input
                type="text"
                readOnly
                value={shareUrl}
                className={`flex-1 text-xs font-mono px-3 py-2.5 rounded-xl border select-all outline-none transition-colors ${
                  isDarkMode 
                    ? 'bg-[#18181b] border-[#323238] text-gray-300 focus:border-blue-500' 
                    : 'bg-gray-50 border-gray-200 text-gray-700 focus:border-blue-500'
                }`}
              />
              <button
                onClick={handleCopy}
                className={`px-4 py-2.5 rounded-xl font-medium text-xs flex items-center gap-1.5 transition-all shadow-sm ${
                  copied 
                    ? 'bg-emerald-600 text-white' 
                    : 'bg-blue-600 hover:bg-blue-700 text-white active:scale-95'
                }`}
              >
                {copied ? (
                  <>
                    <Check className="w-4 h-4" />
                    <span>Скопировано</span>
                  </>
                ) : (
                  <>
                    <Copy className="w-4 h-4" />
                    <span>Копировать</span>
                  </>
                )}
              </button>
            </div>
          </div>

          {/* Realtime Status */}
          <div className={`p-3.5 rounded-xl border flex items-center gap-3 ${
            isDarkMode ? 'bg-[#18181b]/70 border-[#323238]' : 'bg-blue-50/50 border-blue-100'
          }`}>
            <span className="relative flex h-2.5 w-2.5">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-emerald-500"></span>
            </span>
            <div className="text-xs">
              <span className="font-medium text-emerald-500 mr-1.5">Облачная синхронизация Firestore:</span>
              <span className={isDarkMode ? 'text-gray-400' : 'text-gray-600'}>
                все изменения мгновенно отображаются на всех устройствах
              </span>
            </div>
          </div>

          {/* User Auth Status */}
          <div className={`p-3.5 rounded-xl border ${
            isDarkMode ? 'bg-[#18181b] border-[#323238]' : 'bg-gray-50 border-gray-100'
          }`}>
            {user ? (
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2.5">
                  {user.photoURL ? (
                    <img 
                      src={user.photoURL} 
                      alt={user.displayName || 'Пользователь'} 
                      className="w-8 h-8 rounded-full border border-blue-500/30 object-cover"
                      referrerPolicy="no-referrer"
                    />
                  ) : (
                    <div className="w-8 h-8 rounded-full bg-blue-600 text-white font-bold flex items-center justify-center text-xs">
                      {(user.displayName || user.email || 'U').charAt(0).toUpperCase()}
                    </div>
                  )}
                  <div>
                    <div className="text-xs font-semibold">{user.displayName || user.email}</div>
                    <div className="text-[10px] text-emerald-500 font-medium flex items-center gap-1">
                      <Check className="w-3 h-3" />
                      Синхронизация с правами автора
                    </div>
                  </div>
                </div>
              </div>
            ) : (
              <div className="flex items-center justify-between gap-3">
                <div className="text-xs">
                  <span className="font-semibold block mb-0.5">Вход через Google</span>
                  <span className={isDarkMode ? 'text-gray-400' : 'text-gray-500'}>
                    Войдите, чтобы вносить изменения с обоих компьютеров
                  </span>
                </div>
                <button
                  onClick={onLogin}
                  className="px-3.5 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-xs font-medium flex items-center gap-1.5 transition-colors whitespace-nowrap"
                >
                  <LogIn className="w-3.5 h-3.5" />
                  Войти
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Instructions */}
        <div className={`text-[11px] space-y-1 ${isDarkMode ? 'text-gray-400' : 'text-gray-500'}`}>
          <p>💡 <strong>Как подключиться:</strong></p>
          <p>1. Скопируйте ссылку выше и откройте её в браузере на втором компьютере.</p>
          <p>2. Всё, что вы рисуете на одном устройстве, синхронно появится на другом!</p>
        </div>
      </div>
    </div>
  );
};
