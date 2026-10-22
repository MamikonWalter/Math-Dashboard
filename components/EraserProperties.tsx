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
      className={`fixed bottom-16 right-4 rounded-lg shadow-lg border p-3 z-20 select-none ui-smooth-transition transition-colors duration-300 ${
        isDarkMode 
          ? 'bg-[#202024] border-[#323238] shadow-black/40' 
          : 'bg-white border-gray-200 shadow-lg'
      } ${
        isVisible ? 'opacity-100 translate-y-0 scale-100 pointer-events-auto' : 'opacity-0 translate-y-4 scale-95 pointer-events-none'
      }`}
    >
      <div className="flex flex-col gap-1.5 w-40">
        <div className="flex justify-between items-center">
            <span className={`text-xs font-medium ${isDarkMode ? 'text-gray-200' : 'text-gray-700'}`}>Eraser Size</span>
            <span className={`text-[11px] ${isDarkMode ? 'text-gray-400' : 'text-gray-500'}`}>{size}px</span>
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
        <div className="flex justify-center mt-1.5 h-10 items-center">
            <div 
                className={`rounded-full border flex items-center justify-center transition-all ${
                  isDarkMode 
                    ? 'bg-zinc-400/20 border-zinc-400/50' 
                    : 'bg-slate-500/20 border-slate-500/50'
                }`}
                style={{ width: Math.min(size, 34), height: Math.min(size, 34) }}
            >
              <div 
                className={`w-1 h-1 rounded-full ${isDarkMode ? 'bg-zinc-400/70' : 'bg-slate-500/70'}`} 
              />
            </div>
        </div>
      </div>
    </div>
  );
};

export default EraserProperties;