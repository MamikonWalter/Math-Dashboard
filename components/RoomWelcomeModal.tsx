import React, { useState, useEffect, useRef } from 'react';
import { PlusCircle, LogIn, Copy, Check, ArrowRight, Sparkles, Users, X, AlertCircle } from 'lucide-react';

interface RoomWelcomeModalProps {
  isOpen: boolean;
  onClose?: () => void;
  canClose?: boolean;
  currentRoomId?: string | null;
  onCreateRoom: () => Promise<string | void>;
  onJoinRoom: (roomId: string) => Promise<{ success: boolean; error?: string }>;
  isDarkMode?: boolean;
}

const RoomWelcomeModal: React.FC<RoomWelcomeModalProps> = ({
  isOpen,
  onClose,
  canClose = false,
  currentRoomId,
  onCreateRoom,
  onJoinRoom,
  isDarkMode = true,
}) => {
  const [mode, setMode] = useState<'select' | 'join'>('select');
  const [inputCode, setInputCode] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [createdRoomCode, setCreatedRoomCode] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isOpen) {
      setMode('select');
      setInputCode('');
      setErrorMessage(null);
      setCreatedRoomCode(null);
      setCopied(false);
    }
  }, [isOpen]);

  useEffect(() => {
    if (mode === 'join' && inputRef.current) {
      inputRef.current.focus();
    }
  }, [mode]);

  if (!isOpen) return null;

  const handleCreate = async () => {
    setIsSubmitting(true);
    setErrorMessage(null);
    try {
      const code = await onCreateRoom();
      if (typeof code === 'string') {
        setCreatedRoomCode(code);
      }
    } catch (err: any) {
      setErrorMessage(err?.message || 'Не удалось создать доску. Попробуйте еще раз.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleJoinSubmit = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const cleanCode = inputCode.trim().toUpperCase();
    if (!cleanCode) {
      setErrorMessage('Пожалуйста, введите код доступа');
      return;
    }

    setIsSubmitting(true);
    setErrorMessage(null);
    try {
      const res = await onJoinRoom(cleanCode);
      if (!res.success) {
        setErrorMessage(res.error || `Доска с кодом "${cleanCode}" не найдена. Проверьте правильность кода или создайте новую.`);
      }
    } catch (err: any) {
      setErrorMessage(err?.message || 'Ошибка подключения к доске');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleCopyCode = () => {
    if (!createdRoomCode) return;
    navigator.clipboard.writeText(createdRoomCode);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleCopyLink = () => {
    if (!createdRoomCode) return;
    const url = `${window.location.origin}${window.location.pathname}?room=${encodeURIComponent(createdRoomCode)}`;
    navigator.clipboard.writeText(url);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm transition-opacity duration-300 animate-in fade-in">
      <div 
        className={`relative w-full max-w-lg rounded-2xl p-6 sm:p-8 shadow-2xl transition-all transform animate-in zoom-in-95 duration-200 border ${
          isDarkMode 
            ? 'bg-[#202024] border-[#323238] text-white shadow-black/60' 
            : 'bg-white border-gray-200 text-gray-900 shadow-xl'
        }`}
      >
        {canClose && onClose && (
          <button
            onClick={onClose}
            className={`absolute top-4 right-4 p-2 rounded-xl transition-colors ${
              isDarkMode ? 'hover:bg-[#2c2c31] text-gray-400 hover:text-white' : 'hover:bg-gray-100 text-gray-500 hover:text-gray-900'
            }`}
            title="Закрыть"
          >
            <X className="w-5 h-5" />
          </button>
        )}

        {/* Brand & Header */}
        <div className="text-center mb-6">
          <div className="inline-flex items-center justify-center w-12 h-12 rounded-xl bg-blue-600/10 text-blue-500 mb-3">
            <Sparkles className="w-6 h-6" />
          </div>
          <h2 className="text-2xl font-bold tracking-tight">Mathters Whiteboard</h2>
          <p className={`text-sm mt-1.5 ${isDarkMode ? 'text-gray-400' : 'text-gray-500'}`}>
            Интерактивная доска для математики, чертежей и совместной работы в реальном времени
          </p>
        </div>

        {/* Error message */}
        {errorMessage && (
          <div className="mb-5 p-3 rounded-xl bg-red-500/10 border border-red-500/30 flex items-start gap-2.5 text-sm text-red-500 animate-in fade-in">
            <AlertCircle className="w-5 h-5 shrink-0 mt-0.5" />
            <span>{errorMessage}</span>
          </div>
        )}

        {/* Created room success screen */}
        {createdRoomCode ? (
          <div className="space-y-5 animate-in fade-in">
            <div className={`p-4 rounded-xl text-center border ${
              isDarkMode ? 'bg-[#18181b] border-[#2e2e33]' : 'bg-gray-50 border-gray-200'
            }`}>
              <div className="text-xs uppercase tracking-wider font-semibold text-blue-500 mb-1">
                Доска создана! Ваш код доступа:
              </div>
              <div className="text-3xl font-mono font-bold tracking-widest text-blue-500 my-2 select-all">
                {createdRoomCode}
              </div>
              <p className={`text-xs ${isDarkMode ? 'text-gray-400' : 'text-gray-500'}`}>
                Передайте этот код участникам или откройте ссылку на телефоне/планшете — рисование синхронизируется в реальном времени!
              </p>
            </div>

            <div className="flex gap-2">
              <button
                onClick={handleCopyCode}
                className={`flex-1 py-2.5 px-4 rounded-xl text-sm font-medium flex items-center justify-center gap-2 border transition-colors ${
                  isDarkMode 
                    ? 'bg-[#28282e] hover:bg-[#32323a] border-[#3f3f46] text-white' 
                    : 'bg-white hover:bg-gray-50 border-gray-300 text-gray-800'
                }`}
              >
                {copied ? <Check className="w-4 h-4 text-emerald-500" /> : <Copy className="w-4 h-4" />}
                {copied ? 'Скопировано!' : 'Копировать код'}
              </button>

              <button
                onClick={handleCopyLink}
                className={`flex-1 py-2.5 px-4 rounded-xl text-sm font-medium flex items-center justify-center gap-2 border transition-colors ${
                  isDarkMode 
                    ? 'bg-[#28282e] hover:bg-[#32323a] border-[#3f3f46] text-white' 
                    : 'bg-white hover:bg-gray-50 border-gray-300 text-gray-800'
                }`}
              >
                {copied ? <Check className="w-4 h-4 text-emerald-500" /> : <Users className="w-4 h-4" />}
                Копировать ссылку
              </button>
            </div>

            <button
              onClick={() => {
                if (onClose) onClose();
              }}
              className="w-full py-3 px-4 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-medium text-sm flex items-center justify-center gap-2 transition-colors shadow-sm"
            >
              Перейти к доске
              <ArrowRight className="w-4 h-4" />
            </button>
          </div>
        ) : mode === 'select' ? (
          /* Main 2 Buttons */
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
            {/* Create board button */}
            <button
              onClick={handleCreate}
              disabled={isSubmitting}
              className={`group text-left p-5 rounded-xl border transition-all flex flex-col justify-between relative overflow-hidden ${
                isDarkMode 
                  ? 'bg-gradient-to-b from-[#28282e] to-[#222227] hover:border-blue-500/60 border-[#323238]' 
                  : 'bg-gradient-to-b from-white to-gray-50 hover:border-blue-500/60 border-gray-200'
              } hover:shadow-lg hover:-translate-y-0.5 active:translate-y-0`}
            >
              <div className="w-10 h-10 rounded-lg bg-blue-600/10 text-blue-500 flex items-center justify-center mb-3 group-hover:scale-110 transition-transform">
                <PlusCircle className="w-5 h-5" />
              </div>
              <div>
                <div className="font-semibold text-base flex items-center gap-1.5">
                  Создать доску
                  <ArrowRight className="w-4 h-4 opacity-0 group-hover:opacity-100 -translate-x-1 group-hover:translate-x-0 transition-all text-blue-500" />
                </div>
                <div className={`text-xs mt-1 leading-relaxed ${isDarkMode ? 'text-gray-400' : 'text-gray-500'}`}>
                  Новый чистый холст с персональным кодом доступа
                </div>
              </div>
            </button>

            {/* Join board button */}
            <button
              onClick={() => {
                setMode('join');
                setErrorMessage(null);
              }}
              disabled={isSubmitting}
              className={`group text-left p-5 rounded-xl border transition-all flex flex-col justify-between relative overflow-hidden ${
                isDarkMode 
                  ? 'bg-gradient-to-b from-[#28282e] to-[#222227] hover:border-emerald-500/60 border-[#323238]' 
                  : 'bg-gradient-to-b from-white to-gray-50 hover:border-emerald-500/60 border-gray-200'
              } hover:shadow-lg hover:-translate-y-0.5 active:translate-y-0`}
            >
              <div className="w-10 h-10 rounded-lg bg-emerald-600/10 text-emerald-500 flex items-center justify-center mb-3 group-hover:scale-110 transition-transform">
                <LogIn className="w-5 h-5" />
              </div>
              <div>
                <div className="font-semibold text-base flex items-center gap-1.5">
                  Присоединиться к доске
                  <ArrowRight className="w-4 h-4 opacity-0 group-hover:opacity-100 -translate-x-1 group-hover:translate-x-0 transition-all text-emerald-500" />
                </div>
                <div className={`text-xs mt-1 leading-relaxed ${isDarkMode ? 'text-gray-400' : 'text-gray-500'}`}>
                  Войти в существующую доску по коду доступа
                </div>
              </div>
            </button>
          </div>
        ) : (
          /* Join by Code Form */
          <form onSubmit={handleJoinSubmit} className="space-y-4 animate-in fade-in">
            <div>
              <label className={`block text-xs font-semibold mb-2 uppercase tracking-wider ${isDarkMode ? 'text-gray-300' : 'text-gray-700'}`}>
                Введите код доступа к доске:
              </label>
              <div className="relative">
                <input
                  ref={inputRef}
                  type="text"
                  value={inputCode}
                  onChange={(e) => setInputCode(e.target.value.toUpperCase())}
                  placeholder="Например: WB-7492"
                  maxLength={16}
                  disabled={isSubmitting}
                  className={`w-full px-4 py-3 text-lg font-mono tracking-wider rounded-xl outline-none border transition-colors uppercase ${
                    isDarkMode 
                      ? 'bg-[#18181b] border-[#3f3f46] focus:border-blue-500 text-white placeholder-gray-600' 
                      : 'bg-white border-gray-300 focus:border-blue-500 text-gray-900 placeholder-gray-400'
                  }`}
                />
              </div>
            </div>

            <div className="flex gap-2 pt-2">
              <button
                type="button"
                onClick={() => {
                  setMode('select');
                  setErrorMessage(null);
                }}
                disabled={isSubmitting}
                className={`py-3 px-4 rounded-xl text-sm font-medium border transition-colors ${
                  isDarkMode 
                    ? 'bg-[#28282e] hover:bg-[#32323a] border-[#3f3f46] text-gray-300' 
                    : 'bg-white hover:bg-gray-50 border-gray-300 text-gray-700'
                }`}
              >
                Назад
              </button>

              <button
                type="submit"
                disabled={isSubmitting || !inputCode.trim()}
                className="flex-1 py-3 px-4 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white rounded-xl font-medium text-sm flex items-center justify-center gap-2 transition-colors shadow-sm"
              >
                {isSubmitting ? 'Подключение...' : 'Присоединиться'}
                <ArrowRight className="w-4 h-4" />
              </button>
            </div>
          </form>
        )}

        {currentRoomId && !createdRoomCode && (
          <div className={`mt-5 pt-4 border-t text-center text-xs ${isDarkMode ? 'border-[#323238] text-gray-400' : 'border-gray-200 text-gray-500'}`}>
            Текущая активная доска: <span className="font-mono font-bold text-blue-500">{currentRoomId}</span>
          </div>
        )}
      </div>
    </div>
  );
};

export default RoomWelcomeModal;
