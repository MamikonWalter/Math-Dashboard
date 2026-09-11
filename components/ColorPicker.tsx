import React from 'react';
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

const ColorPicker: React.FC<ColorPickerProps> = ({ 
  color, 
  setColor, 
  strokeWidth, 
  setStrokeWidth,
  isVisible,
  isDarkMode = false
}) => {
  return (
    <div 
      className={`fixed left-16 top-1/2 -translate-y-1/2 rounded-xl shadow-xl border p-2.5 w-36 z-20 select-none ui-smooth-transition transition-colors duration-300 ${
        isDarkMode 
          ? 'bg-[#202024] border-[#323238] shadow-black/40' 
          : 'bg-white border-gray-200 shadow-xl'
      } ${
        isVisible 
          ? 'opacity-100 translate-x-0 scale-100 pointer-events-auto' 
          : 'opacity-0 -translate-x-12 scale-95 pointer-events-none'
      }`}
    >
      
      {/* Thickness Slider */}
      <div className="mb-2">
        <div className="flex justify-between items-center mb-1">
          <span className={`text-[11px] font-medium ${isDarkMode ? 'text-gray-300' : 'text-gray-600'}`}>Thickness</span>
          <span className={`text-[10px] font-mono ${isDarkMode ? 'text-gray-500' : 'text-gray-400'}`}>{strokeWidth}px</span>
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

      <div className={`w-full h-px my-1.5 transition-colors ${isDarkMode ? 'bg-[#323238]' : 'bg-gray-100'}`} />

      {/* Brand Colors header/add */}
      <div className="mb-2">
        <div className="flex justify-between items-center mb-0.5">
          <h3 className={`text-[11px] font-medium ${isDarkMode ? 'text-gray-300' : 'text-gray-600'}`}>Brand colors</h3>
          <ChevronDown className={`w-3 h-3 ${isDarkMode ? 'text-gray-500' : 'text-gray-400'}`} />
        </div>
        <button className="flex items-center text-blue-500 text-[10px] font-medium hover:underline">
          <Plus className="w-2.5 h-2.5 mr-0.5" /> Add colors
        </button>
      </div>

      {/* All Colors Grid */}
      <div>
        <h3 className={`text-[11px] font-medium mb-1.5 ${isDarkMode ? 'text-gray-300' : 'text-gray-600'}`}>All colors</h3>
        <div className="grid grid-cols-4 gap-1.5">
          {[...BRAND_COLORS, ...ALL_COLORS].slice(0, 15).map((c, index) => (
            <button
              key={`${c}-${index}`}
              onClick={() => setColor(c)}
              className={`w-6 h-6 rounded-full border focus:outline-none focus:ring-1 focus:ring-offset-1 focus:ring-blue-500 transition-transform hover:scale-110 flex items-center justify-center relative ${
                isDarkMode ? 'border-zinc-700' : 'border-gray-200'
              }`}
              style={{ backgroundColor: c }}
              aria-label={`Select color ${c}`}
            >
              {color === c && (
                <div className={`w-2 h-2 rounded-full ${['#FFFFFF', '#E6E6E6', '#FFF8B5'].includes(c) ? 'bg-black' : 'bg-white'}`} />
              )}
            </button>
          ))}
          
          <button
            className={`w-6 h-6 rounded-full border flex items-center justify-center transition-colors ${
              isDarkMode 
                ? 'bg-zinc-800 border-zinc-700 text-zinc-300 hover:bg-zinc-700' 
                : 'bg-gray-800 border-gray-200 text-white hover:bg-gray-900'
            }`}
            aria-label="More colors"
          >
            <ChevronDown className="w-3 h-3" />
          </button>
        </div>
      </div>
    </div>
  );
};

export default ColorPicker;
