
import React from 'react';
import { Box, Cylinder, Globe, Cone, Triangle } from 'lucide-react';
import { ToolType } from '../types';

interface ThreeDShapesPanelProps {
  currentTool: ToolType;
  setTool: (tool: ToolType) => void;
  isVisible: boolean;
}

const ThreeDShapesPanel: React.FC<ThreeDShapesPanelProps> = ({ currentTool, setTool, isVisible }) => {
  if (!isVisible) return null;

  const shapes = [
    { id: 'cube', icon: Box, label: 'Cube' },
    { id: 'cylinder', icon: Cylinder, label: 'Cylinder' },
    { id: 'sphere', icon: Globe, label: 'Sphere' },
    { id: 'pyramid', icon: Cone, label: 'Pyramid' }, // Cone icon as proxy for Pyramid
    { id: 'prism', icon: Triangle, label: 'Prism' }, // Triangle icon as proxy for Prism
  ];

  return (
    <div className="fixed left-24 top-[240px] bg-white rounded-lg shadow-2xl border border-gray-200 p-3 z-20 animate-in fade-in slide-in-from-left-4 duration-200 w-48">
      <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2 px-1">3D Objects</h3>
      <div className="grid grid-cols-2 gap-2">
        {shapes.map((shape) => {
          const isActive = currentTool === shape.id;
          return (
            <button
              key={shape.id}
              onClick={() => setTool(shape.id as ToolType)}
              className={`flex flex-col items-center justify-center p-2 rounded-lg transition-colors text-xs ${
                isActive 
                  ? 'bg-blue-50 text-blue-600 border border-blue-200' 
                  : 'text-gray-600 hover:bg-gray-100 border border-transparent'
              }`}
            >
              <shape.icon className="w-6 h-6 mb-1" strokeWidth={1.5} />
              {shape.label}
            </button>
          );
        })}
      </div>
    </div>
  );
};

export default ThreeDShapesPanel;
