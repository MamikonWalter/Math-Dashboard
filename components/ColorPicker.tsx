import React, { useState, useRef, useEffect } from 'react';
import { BRAND_COLORS, ALL_COLORS } from '../constants';
import { Plus, ChevronDown } from 'lucide-react';

interface ColorPickerProps {
  color: string;
  setColor: (color: string) => void;
  strokeWidth: number;
  setStrokeWidth: (width: number) => void;
  isVisible: boolean;
  isDarkMode?: boolean;
}

const STORAGE_KEY = 'whiteboard_custom_palette';

// The exact 15 colors originally rendered on screen
const DEFAULT_PALETTE = [...BRAND_COLORS, ...ALL_COLORS].slice(0, 15);

const isLightColor = (hex: string) => {
  if (['#ffffff', '#e6e6e6', '#fff8b5', '#ffd866', '#ffd166', '#f4a261', '#9bf6ff'].includes(hex.toLowerCase())) return true;
  if (hex.startsWith('#') && hex.length >= 7) {
    const r = parseInt(hex.slice(1, 3), 16) || 0;
    const g = parseInt(hex.slice(3, 5), 16) || 0;
    const b = parseInt(hex.slice(5, 7), 16) || 0;
    return (r * 299 + g * 587 + b * 114) / 1000 > 165;
  }
  return false;
};

const ColorPicker: React.FC<ColorPickerProps> = ({ 
  color, 
  setColor, 
  strokeWidth, 
  setStrokeWidth,
  isVisible,
  isDarkMode = false
}) => {
  const [colors, setColors] = useState<string[]>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length > 0) {
          const unique = Array.from(new Set(parsed.map((c: string) => c.toUpperCase())));
          // If corrupted by intermediate dragging bug, reset to clean default palette
          if (unique.length > 18) {
            localStorage.setItem(STORAGE_KEY, JSON.stringify(DEFAULT_PALETTE));
            return DEFAULT_PALETTE;
          }
          return unique;
        }
      }
    } catch {
      // ignore
    }
    return DEFAULT_PALETTE;
  });

  const colorInputRef = useRef<HTMLInputElement>(null);

  const saveColors = (updated: string[]) => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
    } catch {
      // ignore
    }
  };

  // Listen strictly to the native 'change' event on the color input (fired ONLY when color dialog confirms/closes).
  // React's onChange is triggered by 'input' event which fires repeatedly during drag search.
  useEffect(() => {
    const inputEl = colorInputRef.current;
    if (!inputEl) return;

    const handleNativeChange = (e: Event) => {
      const target = e.target as HTMLInputElement;
      const finalColor = target.value.toUpperCase();
      if (finalColor) {
        setColors(prev => {
          if (!prev.some(c => c.toUpperCase() === finalColor)) {
            const next = [...prev, finalColor];
            saveColors(next);
            return next;
          }
          return prev;
        });
        setColor(finalColor);
      }
    };

    inputEl.addEventListener('change', handleNativeChange);
    return () => {
      inputEl.removeEventListener('change', handleNativeChange);
    };
  }, [setColor]);

  const handleDeleteColor = (e: React.MouseEvent, indexToDelete: number) => {
    e.preventDefault();
    e.stopPropagation();
    setColors(prev => {
      const colorToDelete = prev[indexToDelete];
      const updated = prev.filter((_, i) => i !== indexToDelete);
      saveColors(updated);
      if (color.toLowerCase() === colorToDelete?.toLowerCase()) {
        if (updated.length > 0) {
          setColor(updated[0]);
        }
      }
      return updated;
    });
  };

  return (
    <div 
      className={`fixed left-[58px] top-1/2 -translate-y-1/2 rounded-lg shadow-lg border p-2 w-32 z-20 select-none ui-smooth-transition transition-colors duration-300 ${
        isDarkMode 
          ? 'bg-[#202024] border-[#323238] shadow-black/40' 
          : 'bg-white border-gray-200 shadow-lg'
      } ${
        isVisible 
          ? 'opacity-100 translate-x-0 scale-100 pointer-events-auto' 
          : 'opacity-0 -translate-x-4 scale-95 pointer-events-none'
      }`}
    >
      {/* Hidden native color input - handled via native 'change' event listener */}
      <input 
        ref={colorInputRef}
        type="color"
        className="sr-only"
        tabIndex={-1}
      />
      
      {/* Thickness Slider */}
      <div className="mb-1.5">
        <div className="flex justify-between items-center mb-0.5">
          <span className={`text-[10px] font-medium ${isDarkMode ? 'text-gray-300' : 'text-gray-600'}`}>Thickness</span>
          <span className={`text-[9px] font-mono ${isDarkMode ? 'text-gray-500' : 'text-gray-400'}`}>{strokeWidth}px</span>
        </div>
        <input
          type="range"
          min="1"
          max="20"
          value={strokeWidth}
          onChange={(e) => setStrokeWidth(parseInt(e.target.value))}
          className={`w-full h-1 rounded-lg appearance-none cursor-pointer ${
            isDarkMode ? 'bg-[#2c2c31] accent-blue-500' : 'bg-gray-200 accent-gray-800'
          }`}
        />
      </div>

      <div className={`w-full h-px my-1 transition-colors ${isDarkMode ? 'bg-[#323238]' : 'bg-gray-100'}`} />

      {/* Brand Colors header/add */}
      <div className="mb-1.5">
        <div className="flex justify-between items-center mb-0.5">
          <h3 className={`text-[10px] font-medium ${isDarkMode ? 'text-gray-300' : 'text-gray-600'}`}>Brand colors</h3>
          <ChevronDown className={`w-2.5 h-2.5 ${isDarkMode ? 'text-gray-500' : 'text-gray-400'}`} />
        </div>
        <button 
          type="button"
          onClick={() => colorInputRef.current?.click()}
          className="flex items-center text-blue-500 text-[9px] font-medium hover:underline cursor-pointer"
          title="Добавить новый цвет в палитру"
        >
          <Plus className="w-2 h-2 mr-0.5 stroke-[2.5]" /> Add colors
        </button>
      </div>

      {/* All Colors Grid - automatically expands downwards without scrollbars */}
      <div>
        <div className="flex justify-between items-center mb-1">
          <h3 className={`text-[10px] font-medium ${isDarkMode ? 'text-gray-300' : 'text-gray-600'}`}>All colors</h3>
          <span className={`text-[8px] ${isDarkMode ? 'text-gray-500' : 'text-gray-400'}`}>ПКМ — удалить</span>
        </div>
        <div className="grid grid-cols-4 gap-1">
          {colors.map((c, index) => {
            const isSelected = color.toLowerCase() === c.toLowerCase();
            return (
              <button
                key={`${c}-${index}`}
                type="button"
                onClick={() => setColor(c)}
                onContextMenu={(e) => handleDeleteColor(e, index)}
                className={`w-5 h-5 rounded-full border focus:outline-none focus:ring-1 focus:ring-offset-1 focus:ring-blue-500 transition-transform hover:scale-110 active:scale-95 flex items-center justify-center relative cursor-pointer ${
                  isDarkMode ? 'border-zinc-700' : 'border-gray-200'
                }`}
                style={{ backgroundColor: c }}
                title={`${c} (ПКМ для удаления)`}
                aria-label={`Select color ${c}`}
              >
                {isSelected && (
                  <div className={`w-1.5 h-1.5 rounded-full ${isLightColor(c) ? 'bg-black' : 'bg-white'}`} />
                )}
              </button>
            );
          })}
          
          {/* Add color button in grid */}
          <button
            type="button"
            onClick={() => colorInputRef.current?.click()}
            className={`w-5 h-5 rounded-full border border-dashed flex items-center justify-center transition-all hover:scale-110 active:scale-95 cursor-pointer ${
              isDarkMode 
                ? 'border-zinc-600 text-zinc-300 hover:border-blue-400 hover:text-blue-400 hover:bg-zinc-800' 
                : 'border-gray-300 text-gray-500 hover:border-blue-500 hover:text-blue-600 hover:bg-blue-50'
            }`}
            title="Добавить новый цвет"
            aria-label="Add new color"
          >
            <Plus className="w-2.5 h-2.5 stroke-[2.5]" />
          </button>
        </div>
      </div>
    </div>
  );
};

export default ColorPicker;
