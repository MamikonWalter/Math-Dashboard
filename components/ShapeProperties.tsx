
import React from 'react';

interface ShapePropertiesProps {
  size: number;
  setSize: (size: number) => void;
  isVisible: boolean;
}

const ShapeProperties: React.FC<ShapePropertiesProps> = ({ size, setSize, isVisible }) => {
  return (
    <div 
      className={`fixed bottom-6 left-1/2 -translate-x-1/2 bg-white rounded-full shadow-lg border border-gray-200 px-6 py-3 z-30 flex items-center gap-4 select-none ui-smooth-transition ${
        isVisible ? 'opacity-100 translate-y-0 scale-100 pointer-events-auto' : 'opacity-0 translate-y-8 scale-95 pointer-events-none'
      }`}
    >
      <span className="text-sm font-medium text-gray-700 whitespace-nowrap">Shape Scale</span>
      <input
        type="range"
        min="20"
        max="300"
        value={size}
        onChange={(e) => setSize(Number(e.target.value))}
        className="w-48 h-1 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-blue-600"
      />
      <span className="text-xs text-gray-500 w-8">{size}%</span>
    </div>
  );
};

export default ShapeProperties;
