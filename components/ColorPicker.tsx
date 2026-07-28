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
    <div className="fixed left-24 top-1/2 -translate-y-1/2 bg-white rounded-lg shadow-2xl border border-gray-200 p-4 w-64 z-20 animate-in fade-in slide-in-from-left-4 duration-200">
      
      {/* Thickness Slider */}
      <div className="mb-6">
        <div className="flex justify-between items-center mb-2">
            <span className="text-sm font-medium text-gray-600">Thickness</span>
            <span className="text-xs text-gray-400">{strokeWidth}px</span>
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

      {/* Brand Colors */}
      <div className="mb-4">
        <div className="flex justify-between items-center mb-2">
            <h3 className="text-sm font-medium text-gray-600">Brand colors</h3>
            <ChevronDown className="w-4 h-4 text-gray-400" />
        </div>
        <button className="flex items-center text-blue-600 text-sm font-medium hover:underline mb-3">
            <Plus className="w-3 h-3 mr-1" /> Add colors
        </button>
      </div>

      {/* All Colors Grid */}
      <div>
        <h3 className="text-sm font-medium text-gray-600 mb-3">All colors</h3>
        <div className="grid grid-cols-4 gap-3">
          {/* Combine brand and all colors for the grid or just use ALL_COLORS */}
          {[...BRAND_COLORS, ...ALL_COLORS].slice(0, 24).map((c, index) => (
            <button
              key={`${c}-${index}`}
              onClick={() => setColor(c)}
              className={`w-10 h-10 rounded-full border border-gray-200 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 transition-transform hover:scale-105 flex items-center justify-center relative`}
              style={{ backgroundColor: c }}
              aria-label={`Select color ${c}`}
            >
              {color === c && (
                <div className={`w-3 h-3 rounded-full ${['#FFFFFF', '#E6E6E6', '#FFF8B5'].includes(c) ? 'bg-black' : 'bg-white'}`} />
              )}
            </button>
          ))}
          
           <button
              className="w-10 h-10 rounded-full bg-gray-800 border border-gray-200 flex items-center justify-center text-white hover:bg-gray-900"
              aria-label="More colors"
            >
               <ChevronDown className="w-4 h-4" />
            </button>
        </div>
      </div>
    </div>
  );
};

export default ColorPicker;
