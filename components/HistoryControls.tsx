import React from 'react';
import { Undo2, Redo2 } from 'lucide-react';

interface HistoryControlsProps {
  onUndo: () => void;
  onRedo: () => void;
  canUndo: boolean;
  canRedo: boolean;
  isVisible?: boolean;
}

const HistoryControls: React.FC<HistoryControlsProps> = ({ 
  onUndo, 
  onRedo, 
  canUndo, 
  canRedo,
  isVisible = true
}) => {
  return (
    <div 
      className={`fixed bottom-6 left-6 flex bg-white rounded-lg shadow-lg border border-gray-200 p-1 z-20 select-none ui-smooth-transition ${
        isVisible ? 'opacity-100 translate-y-0 pointer-events-auto' : 'opacity-0 translate-y-24 pointer-events-none'
      }`}
    >
      <button
        onClick={onUndo}
        disabled={!canUndo}
        className={`p-3 rounded-md transition-colors ${
          canUndo ? 'text-gray-700 hover:bg-gray-100' : 'text-gray-300 cursor-not-allowed'
        }`}
        title="Undo (Ctrl+Z)"
      >
        <Undo2 className="w-5 h-5" />
      </button>
      <div className="w-px bg-gray-200 my-1 mx-1" />
      <button
        onClick={onRedo}
        disabled={!canRedo}
        className={`p-3 rounded-md transition-colors ${
          canRedo ? 'text-gray-700 hover:bg-gray-100' : 'text-gray-300 cursor-not-allowed'
        }`}
        title="Redo (Ctrl+Y)"
      >
        <Redo2 className="w-5 h-5" />
      </button>
    </div>
  );
};

export default HistoryControls;
