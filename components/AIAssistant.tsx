
import React from 'react';
import { X, Brain, Sparkles, Loader2 } from 'lucide-react';

interface AIAssistantProps {
  isOpen: boolean;
  onClose: () => void;
  isLoading: boolean;
  response: string | null;
}

const AIAssistant: React.FC<AIAssistantProps> = ({ isOpen, onClose, isLoading, response }) => {
  if (!isOpen) return null;

  return (
    <div className="fixed right-6 top-20 bottom-24 w-80 bg-white/90 backdrop-blur-xl rounded-2xl shadow-2xl border border-gray-200 z-30 flex flex-col animate-in slide-in-from-right-8 duration-300 overflow-hidden">
      <div className="p-4 border-b border-gray-100 flex items-center justify-between bg-gradient-to-r from-purple-50 to-white">
        <div className="flex items-center gap-2 text-purple-700">
          <Brain className="w-5 h-5" />
          <span className="font-bold tracking-tight">Помощник Mathters</span>
        </div>
        <button 
          onClick={onClose}
          className="p-1 hover:bg-gray-200 rounded-full transition-colors"
        >
          <X className="w-4 h-4 text-gray-500" />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-4 custom-scrollbar">
        {isLoading ? (
          <div className="flex flex-col items-center justify-center h-full space-y-3">
            <div className="relative">
              <Sparkles className="w-10 h-10 text-purple-400 animate-pulse" />
              <Loader2 className="w-10 h-10 text-purple-600 animate-spin absolute top-0 left-0" />
            </div>
            <p className="text-sm font-medium text-gray-500 animate-pulse">Решаем задачу...</p>
          </div>
        ) : response ? (
          <div className="prose prose-sm text-gray-800 leading-relaxed whitespace-pre-wrap">
            {response}
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center h-full text-center p-6 space-y-2">
            <Sparkles className="w-12 h-12 text-gray-200" />
            <p className="text-gray-400 text-sm">Нарисуйте что-нибудь и нажмите "Магическое решение", чтобы получить помощь!</p>
          </div>
        )}
      </div>

      <div className="p-4 bg-gray-50 text-[10px] text-gray-400 text-center border-t border-gray-100">
        ИИ может ошибаться. Проверяйте важную информацию.
      </div>
    </div>
  );
};

export default AIAssistant;
