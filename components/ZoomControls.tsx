
import React from 'react';
import { Minus, Plus, Grid3x3, Moon, Sun } from 'lucide-react';

interface ZoomControlsProps {
  zoom: number;
  onZoomIn: () => void;
  onZoomOut: () => void;
  onReset: () => void;
  showGrid: boolean;
  toggleGrid: () => void;
  isDarkMode?: boolean;
  toggleDarkMode?: () => void;
  isVisible?: boolean;
}

const ZoomControls: React.FC<ZoomControlsProps> = ({ 
  zoom, 
  onZoomIn, 
  onZoomOut, 
  onReset, 
  showGrid, 
  toggleGrid,
  isDarkMode = false,
  toggleDarkMode,
  isVisible = true
}) => {
  return (
    <div 
      className={`fixed bottom-6 right-6 flex items-center bg-white rounded-lg shadow-lg border border-gray-200 p-1 z-20 select-none ui-smooth-transition ${
        isVisible ? 'opacity-100 translate-y-0 pointer-events-auto' : 'opacity-0 translate-y-24 pointer-events-none'
      }`}
    >
      <button 
          onClick={toggleGrid}
          className={`p-2 hover:bg-gray-100 rounded-md transition-colors ${showGrid ? 'bg-blue-50 text-blue-600' : 'text-gray-600'}`}
          title="Сетка (G)"
      >
          <Grid3x3 className="w-4 h-4" />
      </button>

      {toggleDarkMode && (
        <button 
            onClick={toggleDarkMode}
            className={`p-2 hover:bg-gray-100 rounded-md transition-colors ${isDarkMode ? 'bg-amber-50 text-amber-500' : 'text-gray-600'}`}
            title={isDarkMode ? "Светлая тема доски (D)" : "Тёмная тема доски (D)"}
        >
            {isDarkMode ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
        </button>
      )}
      
      <div className="w-px h-4 bg-gray-300 mx-1" />

      <button 
        onClick={onZoomOut} 
        className="p-2 hover:bg-gray-100 rounded-md text-gray-600 active:bg-gray-200 transition-colors"
        title="Уменьшить (-)"
      >
        <Minus className="w-4 h-4" />
      </button>
      <button 
        onClick={onReset}
        className="px-2 text-xs font-medium text-gray-700 hover:text-blue-600 min-w-[3.5rem] text-center select-none"
        title="Сбросить масштаб (100%)"
      >
        {Math.round(zoom * 100)}%
      </button>
      <button 
        onClick={onZoomIn} 
        className="p-2 hover:bg-gray-100 rounded-md text-gray-600 active:bg-gray-200 transition-colors"
        title="Увеличить (+)"
      >
        <Plus className="w-4 h-4" />
      </button>
    </div>
  );
};

export default ZoomControls;
