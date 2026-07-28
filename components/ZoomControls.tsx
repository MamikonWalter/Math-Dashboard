
import React from 'react';
import { Minus, Plus, Grid3x3 } from 'lucide-react';

interface ZoomControlsProps {
  zoom: number;
  onZoomIn: () => void;
  onZoomOut: () => void;
  onReset: () => void;
  showGrid: boolean;
  toggleGrid: () => void;
}

const ZoomControls: React.FC<ZoomControlsProps> = ({ zoom, onZoomIn, onZoomOut, onReset, showGrid, toggleGrid }) => {
  return (
    <div className="fixed bottom-6 right-6 flex items-center bg-white rounded-lg shadow-lg border border-gray-200 p-1 z-20">
      <button 
          onClick={toggleGrid}
          className={`p-2 hover:bg-gray-100 rounded-md transition-colors ${showGrid ? 'bg-blue-50 text-blue-600' : 'text-gray-600'}`}
          title="Toggle Grid (G)"
      >
          <Grid3x3 className="w-4 h-4" />
      </button>
      
      <div className="w-px h-4 bg-gray-300 mx-1" />

      <button 
        onClick={onZoomOut} 
        className="p-2 hover:bg-gray-100 rounded-md text-gray-600 active:bg-gray-200 transition-colors"
        title="Zoom Out"
      >
        <Minus className="w-4 h-4" />
      </button>
      <button 
        onClick={onReset}
        className="px-2 text-xs font-medium text-gray-700 hover:text-blue-600 min-w-[3.5rem] text-center select-none"
        title="Reset to 100%"
      >
        {Math.round(zoom * 100)}%
      </button>
      <button 
        onClick={onZoomIn} 
        className="p-2 hover:bg-gray-100 rounded-md text-gray-600 active:bg-gray-200 transition-colors"
        title="Zoom In"
      >
        <Plus className="w-4 h-4" />
      </button>
    </div>
  );
};

export default ZoomControls;
