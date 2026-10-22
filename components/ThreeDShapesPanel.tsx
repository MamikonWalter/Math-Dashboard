import React from 'react';
import { Box, Cylinder, Globe, Cone, Triangle } from 'lucide-react';
import { ToolType } from '../types';

interface ThreeDShapesPanelProps {
  currentTool: ToolType;
  setTool: (tool: ToolType) => void;
  isVisible: boolean;
  isDarkMode?: boolean;
}

const ThreeDShapesPanel: React.FC<ThreeDShapesPanelProps> = ({ currentTool, setTool, isVisible, isDarkMode = false }) => {
  const shapes = [
    { id: 'cube', icon: Box, label: 'Cube' },
    { id: 'cylinder', icon: Cylinder, label: 'Cylinder' },
    { id: 'sphere', icon: Globe, label: 'Sphere' },
    { id: 'pyramid', icon: Cone, label: 'Pyramid' },
    { id: 'prism', icon: Triangle, label: 'Prism' },
  ];

  return (
    <div 
      className={`fixed left-[58px] top-1/2 -translate-y-1/2 rounded-lg shadow-xl border p-2.5 z-20 select-none w-40 ui-smooth-transition transition-colors duration-300 ${
        isDarkMode 
          ? 'bg-[#202024] border-[#323238] shadow-black/40' 
          : 'bg-white border-gray-200 shadow-xl'
      } ${
        isVisible ? 'opacity-100 translate-x-0 scale-100 pointer-events-auto' : 'opacity-0 -translate-x-4 scale-95 pointer-events-none'
      }`}
    >
      <h3 className={`text-[10px] font-semibold uppercase tracking-wider mb-1.5 px-0.5 ${isDarkMode ? 'text-gray-400' : 'text-gray-500'}`}>3D Objects</h3>
      <div className="grid grid-cols-2 gap-1.5">
        {shapes.map((shape) => {
          const isActive = currentTool === shape.id;
          return (
            <button
              key={shape.id}
              onClick={() => setTool(shape.id as ToolType)}
              className={`flex flex-col items-center justify-center p-1.5 rounded-md transition-colors text-[11px] ${
                isActive 
                  ? (isDarkMode ? 'bg-blue-600/25 text-blue-400 border border-blue-500/40' : 'bg-blue-50 text-blue-600 border border-blue-200') 
                  : (isDarkMode ? 'text-gray-300 hover:bg-[#2c2c31] hover:text-white border border-transparent' : 'text-gray-600 hover:bg-gray-100 border border-transparent')
              }`}
            >
              <shape.icon className="w-5 h-5 mb-1" strokeWidth={1.5} />
              {shape.label}
            </button>
          );
        })}
      </div>
    </div>
  );
};

export default ThreeDShapesPanel;
