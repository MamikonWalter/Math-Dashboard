
import React from 'react';

interface ShapePropertiesProps {
  size: number;
  setSize: (size: number) => void;
  isVisible: boolean;
  isDarkMode?: boolean;
}

const ShapeProperties: React.FC<ShapePropertiesProps> = ({ size, setSize, isVisible, isDarkMode = false }) => {
  return (
    <div 
      className={`fixed bottom-6 left-1/2 -translate-x-1/2 rounded-full shadow-lg border px-6 py-3 z-30 flex items-center gap-4 select-none ui-smooth-transition transition-colors duration-300 ${
        isDarkMode 
          ? 'bg-[#202024] border-[#323238] shadow-black/40' 
          : 'bg-white border-gray-200 shadow-lg'
      } ${
        isVisible ? 'opacity-100 translate-y-0 scale-100 pointer-events-auto' : 'opacity-0 translate-y-8 scale-95 pointer-events-none'
      }`}
    >
      <span className={`text-sm font-medium whitespace-nowrap ${isDarkMode ? 'text-gray-200' : 'text-gray-700'}`}>Shape Scale</span>
      <input
        type="range"
        min="20"
        max="300"
        value={size}
        onChange={(e) => setSize(Number(e.target.value))}
        className={`w-48 h-1 rounded-lg appearance-none cursor-pointer ${
          isDarkMode ? 'bg-[#2c2c31] accent-blue-500' : 'bg-gray-200 accent-blue-600'
        }`}
      />
      <span className={`text-xs w-8 ${isDarkMode ? 'text-gray-400' : 'text-gray-500'}`}>{size}%</span>
    </div>
  );
};

export default ShapeProperties;
