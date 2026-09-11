
import React from 'react';
import { X, Brain, Sparkles, Loader2 } from 'lucide-react';

interface AIAssistantProps {
  isOpen: boolean;
  onClose: () => void;
  isLoading: boolean;
  response: string | null;
  isDarkMode?: boolean;
}

const AIAssistant: React.FC<AIAssistantProps> = ({ isOpen, onClose, isLoading, response, isDarkMode = false }) => {
  if (!isOpen) return null;

  return (
    <div className={`fixed right-6 top-20 bottom-24 w-80 rounded-2xl shadow-2xl border z-30 flex flex-col animate-in slide-in-from-right-8 duration-300 overflow-hidden backdrop-blur-xl transition-colors duration-300 ${
      isDarkMode 
        ? 'bg-[#202024]/95 border-[#323238] shadow-black/50 text-gray-200' 
        : 'bg-white/90 border-gray-200 text-gray-800'
    }`}>
      <div className={`p-4 border-b flex items-center justify-between transition-colors ${
        isDarkMode 
          ? 'bg-gradient-to-r from-purple-950/40 to-[#202024] border-[#323238]' 
          : 'bg-gradient-to-r from-purple-50 to-white border-gray-100'
      }`}>
        <div className={`flex items-center gap-2 ${isDarkMode ? 'text-purple-300' : 'text-purple-700'}`}>
          <Brain className="w-5 h-5" />
          <span className="font-bold tracking-tight">Помощник Mathters</span>
        </div>
        <button 
          onClick={onClose}
          className={`p-1 rounded-full transition-colors ${
            isDarkMode ? 'hover:bg-[#2c2c31] text-gray-400' : 'hover:bg-gray-200 text-gray-500'
          }`}
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-4 custom-scrollbar">
        {isLoading ? (
          <div className="flex flex-col items-center justify-center h-full space-y-3">
            <div className="relative">
              <Sparkles className="w-10 h-10 text-purple-400 animate-pulse" />
              <Loader2 className="w-10 h-10 text-purple-500 animate-spin absolute top-0 left-0" />
            </div>
            <p className="text-sm font-medium text-purple-400 animate-pulse">Решаем задачу...</p>
          </div>
        ) : response ? (
          <div className={`prose prose-sm leading-relaxed whitespace-pre-wrap ${isDarkMode ? 'text-gray-200' : 'text-gray-800'}`}>
            {response}
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center h-full text-center p-6 space-y-2">
            <Sparkles className={`w-12 h-12 ${isDarkMode ? 'text-zinc-700' : 'text-gray-200'}`} />
            <p className={`text-sm ${isDarkMode ? 'text-gray-400' : 'text-gray-400'}`}>Нарисуйте что-нибудь и нажмите "Магическое решение", чтобы получить помощь!</p>
          </div>
        )}
      </div>

      <div className={`p-4 text-[10px] text-center border-t transition-colors ${
        isDarkMode 
          ? 'bg-[#18181b] border-[#323238] text-gray-500' 
          : 'bg-gray-50 border-gray-100 text-gray-400'
      }`}>
        ИИ может ошибаться. Проверяйте важную информацию.
      </div>
    </div>
  );
};

export default AIAssistant;
