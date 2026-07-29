import React from 'react';
import { BRAND_COLORS, ALL_COLORS } from '../constants';
import { Plus, ChevronDown } from 'lucide-react';

interface ColorPickerProps {
  color: string;
  setColor: (color: string) => void;
  strokeWidth: number;
  setStrokeWidth: (width: number) => void;
  isVisible: boolean;
}

const ColorPicker: React.FC<ColorPickerProps> = ({ 
  color, 
  setColor, 
  strokeWidth, 
  setStrokeWidth,
  isVisible 
}) => {
  if (!isVisible) return null;

  return (
    <div className="fixed left-16 top-1/2 -translate-y-1/2 bg-white rounded-xl shadow-xl border border-gray-200 p-2.5 w-36 z-20 animate-in fade-in slide-in-from-left-4 duration-200 select-none">
      
      {/* Thickness Slider */}
      <div className="mb-2">
        <div className="flex justify-between items-center mb-1">
          <span className="text-[11px] font-medium text-gray-600">Thickness</span>
          <span className="text-[10px] text-gray-400 font-mono">{strokeWidth}px</span>
        </div>
        <input
          type="range"
          min="1"
          max="20"
          value={strokeWidth}
          onChange={(e) => setStrokeWidth(parseInt(e.target.value))}
          className="w-full h-1 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-gray-800"
        />
      </div>

      <div className="w-full h-px bg-gray-100 my-1.5" />

      {/* Brand Colors header/add */}
      <div className="mb-2">
        <div className="flex justify-between items-center mb-0.5">
          <h3 className="text-[11px] font-medium text-gray-600">Brand colors</h3>
          <ChevronDown className="w-3 h-3 text-gray-400" />
        </div>
        <button className="flex items-center text-blue-600 text-[10px] font-medium hover:underline">
          <Plus className="w-2.5 h-2.5 mr-0.5" /> Add colors
        </button>
      </div>

      {/* All Colors Grid */}
      <div>
        <h3 className="text-[11px] font-medium text-gray-600 mb-1.5">All colors</h3>
        <div className="grid grid-cols-4 gap-1.5">
          {[...BRAND_COLORS, ...ALL_COLORS].slice(0, 15).map((c, index) => (
            <button
              key={`${c}-${index}`}
              onClick={() => setColor(c)}
              className={`w-6 h-6 rounded-full border border-gray-200 focus:outline-none focus:ring-1 focus:ring-offset-1 focus:ring-blue-500 transition-transform hover:scale-110 flex items-center justify-center relative`}
              style={{ backgroundColor: c }}
              aria-label={`Select color ${c}`}
            >
              {color === c && (
                <div className={`w-2 h-2 rounded-full ${['#FFFFFF', '#E6E6E6', '#FFF8B5'].includes(c) ? 'bg-black' : 'bg-white'}`} />
              )}
            </button>
          ))}
          
          <button
            className="w-6 h-6 rounded-full bg-gray-800 border border-gray-200 flex items-center justify-center text-white hover:bg-gray-900"
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
