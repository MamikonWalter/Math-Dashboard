import React from 'react';
import { Undo2, Redo2 } from 'lucide-react';

interface HistoryControlsProps {
  onUndo: () => void;
  onRedo: () => void;
  canUndo: boolean;
  canRedo: boolean;
  isVisible?: boolean;
  isDarkMode?: boolean;
}

const HistoryControls: React.FC<HistoryControlsProps> = ({ 
  onUndo, 
  onRedo, 
  canUndo, 
  canRedo,
  isVisible = true,
  isDarkMode = false
}) => {
  return (
    <div 
      className={`fixed bottom-6 left-6 flex rounded-lg shadow-lg border p-1 z-20 select-none ui-smooth-transition transition-colors duration-300 ${
        isDarkMode 
          ? 'bg-[#202024] border-[#323238] shadow-black/40' 
          : 'bg-white border-gray-200 shadow-lg'
      } ${
        isVisible ? 'opacity-100 translate-y-0 pointer-events-auto' : 'opacity-0 translate-y-24 pointer-events-none'
      }`}
    >
      <button
        onClick={onUndo}
        disabled={!canUndo}
        className={`p-3 rounded-md transition-colors ${
          canUndo 
            ? (isDarkMode ? 'text-gray-200 hover:bg-[#2c2c31] hover:text-white' : 'text-gray-700 hover:bg-gray-100') 
            : (isDarkMode ? 'text-zinc-600 cursor-not-allowed' : 'text-gray-300 cursor-not-allowed')
        }`}
        title="Undo (Ctrl+Z)"
      >
        <Undo2 className="w-5 h-5" />
      </button>
      <div className={`w-px my-1 mx-1 transition-colors ${isDarkMode ? 'bg-[#323238]' : 'bg-gray-200'}`} />
      <button
        onClick={onRedo}
        disabled={!canRedo}
        className={`p-3 rounded-md transition-colors ${
          canRedo 
            ? (isDarkMode ? 'text-gray-200 hover:bg-[#2c2c31] hover:text-white' : 'text-gray-700 hover:bg-gray-100') 
            : (isDarkMode ? 'text-zinc-600 cursor-not-allowed' : 'text-gray-300 cursor-not-allowed')
        }`}
        title="Redo (Ctrl+Y)"
      >
        <Redo2 className="w-5 h-5" />
      </button>
    </div>
  );
};

export default HistoryControls;
