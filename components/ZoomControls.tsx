
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
      className={`fixed bottom-6 right-6 flex items-center rounded-lg shadow-lg border p-1 z-20 select-none ui-smooth-transition transition-colors duration-300 ${
        isDarkMode 
          ? 'bg-[#202024] border-[#323238] shadow-black/40' 
          : 'bg-white border-gray-200 shadow-lg'
      } ${
        isVisible ? 'opacity-100 translate-y-0 pointer-events-auto' : 'opacity-0 translate-y-24 pointer-events-none'
      }`}
    >
      <button 
          onClick={toggleGrid}
          className={`p-2 rounded-md transition-colors ${
            isDarkMode 
              ? (showGrid ? 'bg-blue-600/25 text-blue-400' : 'text-gray-300 hover:bg-[#2c2c31] hover:text-white') 
              : (showGrid ? 'bg-blue-50 text-blue-600' : 'text-gray-600 hover:bg-gray-100')
          }`}
          title="Сетка (G)"
      >
          <Grid3x3 className="w-4 h-4" />
      </button>

      {toggleDarkMode && (
        <button 
            onClick={toggleDarkMode}
            className={`p-2 rounded-md transition-colors ${
              isDarkMode 
                ? 'bg-amber-400/15 text-amber-400 hover:bg-amber-400/25' 
                : 'text-gray-600 hover:bg-gray-100'
            }`}
            title={isDarkMode ? "Светлая тема доски (D)" : "Тёмная тема доски (D)"}
        >
            {isDarkMode ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
        </button>
      )}
      
      <div className={`w-px h-4 mx-1 transition-colors ${isDarkMode ? 'bg-[#3f3f46]' : 'bg-gray-300'}`} />

      <button 
        onClick={onZoomOut} 
        className={`p-2 rounded-md transition-colors ${
          isDarkMode 
            ? 'text-gray-300 hover:bg-[#2c2c31] hover:text-white active:bg-[#383842]' 
            : 'text-gray-600 hover:bg-gray-100 active:bg-gray-200'
        }`}
        title="Уменьшить (-)"
      >
        <Minus className="w-4 h-4" />
      </button>
      <button 
        onClick={onReset}
        className={`px-2 text-xs font-medium min-w-[3.5rem] text-center select-none transition-colors ${
          isDarkMode 
            ? 'text-gray-200 hover:text-blue-400' 
            : 'text-gray-700 hover:text-blue-600'
        }`}
        title="Сбросить масштаб (100%)"
      >
        {Math.round(zoom * 100)}%
      </button>
      <button 
        onClick={onZoomIn} 
        className={`p-2 rounded-md transition-colors ${
          isDarkMode 
            ? 'text-gray-300 hover:bg-[#2c2c31] hover:text-white active:bg-[#383842]' 
            : 'text-gray-600 hover:bg-gray-100 active:bg-gray-200'
        }`}
        title="Увеличить (+)"
      >
        <Plus className="w-4 h-4" />
      </button>
    </div>
  );
};

export default ZoomControls;
