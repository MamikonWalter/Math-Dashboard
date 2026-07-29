
import React from 'react';
import { 
  MousePointer2, 
  Pen, 
  Eraser, 
  Square, 
  Circle, 
  Triangle, 
  Diamond, 
  Star, 
  MessageSquare, 
  ArrowRight,
  Box,
  Minus,
  Type,
  Sparkles
} from 'lucide-react';
import { ToolType } from '../types';

interface ToolbarProps {
  currentTool: ToolType;
  setTool: (tool: ToolType) => void;
  undo: () => void;
  redo: () => void;
  canUndo: boolean;
  canRedo: boolean;
  toggle3DPanel: () => void;
  is3DPanelOpen: boolean;
  onAISolve: () => void;
  isAISolving: boolean;
}

const Toolbar: React.FC<ToolbarProps> = ({ 
  currentTool, 
  setTool, 
  toggle3DPanel,
  is3DPanelOpen,
  onAISolve,
  isAISolving
}) => {
  
  const mainTools = [
    { id: 'cursor', icon: MousePointer2, label: 'Select (V)' },
    { id: 'pen', icon: Pen, label: 'Pen (P)' },
    { id: 'text', icon: Type, label: 'Text (T)' },
    { id: 'dotted-line', icon: Minus, label: 'Dotted Line (I)' },
    { id: 'eraser', icon: Eraser, label: 'Eraser (E)' },
  ];

  const shapeTools = [
    { id: 'square', icon: Square, label: 'Square (S)' },
    { id: 'circle', icon: Circle, label: 'Circle' },
    { id: 'diamond', icon: Diamond, label: 'Diamond' },
    { id: 'triangle', icon: Triangle, label: 'Triangle' },
    { id: 'star', icon: Star, label: 'Star' },
    { id: 'speech', icon: MessageSquare, label: 'Speech Bubble' },
    { id: 'arrow', icon: ArrowRight, label: 'Arrow' },
  ];

  const is3DActive = ['cube', 'cylinder', 'sphere', 'pyramid', 'prism'].includes(currentTool);

  return (
    <div className="fixed left-4 top-1/2 -translate-y-1/2 flex flex-col gap-2 z-20">
      <div className="bg-white p-1.5 rounded-xl shadow-xl border border-gray-200 flex flex-col gap-0.5 items-center select-none">
        {mainTools.map((tool) => {
          const isActive = currentTool === tool.id;
          return (
            <button
              key={tool.id}
              onClick={() => setTool(tool.id as ToolType)}
              className={`p-2 rounded-lg transition-all duration-200 group relative
                ${isActive ? 'bg-blue-50 text-blue-600' : 'text-gray-700 hover:bg-gray-100'}`}
              title={tool.label}
            >
              <tool.icon 
                className={`w-4 h-4 ${isActive && (tool.id === 'pen' || tool.id === 'dotted-line' || tool.id === 'text') ? 'fill-current' : ''}`} 
                strokeWidth={2}
              />
              {isActive && <div className="absolute left-0 top-1/2 -translate-y-1/2 -ml-1 w-0.5 h-5 bg-blue-600 rounded-r-full" />}
            </button>
          );
        })}

        <button
          onClick={onAISolve}
          disabled={isAISolving}
          className={`p-2 rounded-lg transition-all duration-200 group relative
            ${isAISolving ? 'bg-purple-100 text-purple-600 animate-pulse' : 'text-purple-600 hover:bg-purple-50'}`}
          title="Magic AI Solve (M)"
        >
          <Sparkles className="w-4 h-4 fill-current" strokeWidth={2} />
        </button>

        <div className="w-5 h-px bg-gray-200 my-0.5" />

        <button
          onClick={toggle3DPanel}
          className={`p-2 rounded-lg transition-all duration-200 group relative
            ${is3DActive || is3DPanelOpen ? 'bg-blue-50 text-blue-600' : 'text-gray-700 hover:bg-gray-100'}`}
          title="3D Objects"
        >
          <Box className="w-4 h-4" strokeWidth={2} />
          {(is3DActive || is3DPanelOpen) && <div className="absolute left-0 top-1/2 -translate-y-1/2 -ml-1 w-0.5 h-5 bg-blue-600 rounded-r-full" />}
        </button>

        <div className="w-5 h-px bg-gray-200 my-0.5" />

        <div className="grid grid-cols-2 gap-0.5 px-0.5">
          {shapeTools.map((tool) => {
            const isActive = currentTool === tool.id;
             return (
              <button
                key={tool.id}
                onClick={() => setTool(tool.id as ToolType)}
                className={`p-1.5 rounded-lg transition-colors ${isActive ? 'bg-blue-50 text-blue-600' : 'text-gray-700 hover:bg-gray-100'}`}
                title={tool.label}
              >
                <tool.icon className="w-3.5 h-3.5" strokeWidth={2} />
              </button>
            )
          })}
        </div>
      </div>
    </div>
  );
};

export default Toolbar;
