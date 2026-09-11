import React from 'react';

interface EraserPropertiesProps {
  size: number;
  setSize: (size: number) => void;
  isVisible: boolean;
  isDarkMode?: boolean;
}

const EraserProperties: React.FC<EraserPropertiesProps> = ({ size, setSize, isVisible, isDarkMode = false }) => {
  return (
    <div 
      className={`fixed bottom-20 right-6 rounded-lg shadow-lg border p-4 z-20 select-none ui-smooth-transition transition-colors duration-300 ${
        isDarkMode 
          ? 'bg-[#202024] border-[#323238] shadow-black/40' 
          : 'bg-white border-gray-200 shadow-lg'
      } ${
        isVisible ? 'opacity-100 translate-y-0 scale-100 pointer-events-auto' : 'opacity-0 translate-y-6 scale-95 pointer-events-none'
      }`}
    >
      <div className="flex flex-col gap-2 w-48">
        <div className="flex justify-between items-center">
            <span className={`text-sm font-medium ${isDarkMode ? 'text-gray-200' : 'text-gray-700'}`}>Eraser Size</span>
            <span className={`text-xs ${isDarkMode ? 'text-gray-400' : 'text-gray-500'}`}>{size}px</span>
        </div>
        <input
          type="range"
          min="10"
          max="200"
          value={size}
          onChange={(e) => setSize(Number(e.target.value))}
          className={`w-full h-1 rounded-lg appearance-none cursor-pointer ${
            isDarkMode ? 'bg-[#2c2c31] accent-blue-500' : 'bg-gray-200 accent-gray-800'
          }`}
        />
        {/* Visual preview of size */}
        <div className="flex justify-center mt-2 h-12 items-center">
            <div 
                className={`rounded-full border transition-colors ${
                  isDarkMode ? 'bg-zinc-700 border-zinc-600' : 'bg-gray-200 border-gray-300'
                }`}
                style={{ width: Math.min(size, 40), height: Math.min(size, 40) }}
            />
        </div>
      </div>
    </div>
  );
};

export default EraserProperties;