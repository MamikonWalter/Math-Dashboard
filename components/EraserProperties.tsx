import React from 'react';

interface EraserPropertiesProps {
  size: number;
  setSize: (size: number) => void;
  isVisible: boolean;
}

const EraserProperties: React.FC<EraserPropertiesProps> = ({ size, setSize, isVisible }) => {
  return (
    <div 
      className={`fixed bottom-20 right-6 bg-white rounded-lg shadow-lg border border-gray-200 p-4 z-20 select-none ui-smooth-transition ${
        isVisible ? 'opacity-100 translate-y-0 scale-100 pointer-events-auto' : 'opacity-0 translate-y-6 scale-95 pointer-events-none'
      }`}
    >
      <div className="flex flex-col gap-2 w-48">
        <div className="flex justify-between items-center">
            <span className="text-sm font-medium text-gray-700">Eraser Size</span>
            <span className="text-xs text-gray-500">{size}px</span>
        </div>
        <input
          type="range"
          min="10"
          max="200"
          value={size}
          onChange={(e) => setSize(Number(e.target.value))}
          className="w-full h-1 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-gray-800"
        />
        {/* Visual preview of size */}
        <div className="flex justify-center mt-2 h-12 items-center">
            <div 
                className="rounded-full bg-gray-200 border border-gray-300"
                style={{ width: Math.min(size, 40), height: Math.min(size, 40) }}
            />
        </div>
      </div>
    </div>
  );
};

export default EraserProperties;