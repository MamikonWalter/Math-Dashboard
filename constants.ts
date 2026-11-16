
export const BRAND_COLORS = [
  '#000000', // Black
  '#E63946', // Red
  '#457B9D', // Blue
  '#2A9D8F', // Teal
  '#E9C46A', // Yellow/Gold
];

export const ALL_COLORS = [
  '#FFF8B5', '#FFD866', '#D4A017', '#FFFFFF', // Yellows/Whites
  '#FFD166', '#F4A261', '#9C6644', '#E6E6E6', // Oranges/Browns/Greys
  '#FFADAD', '#FF6B6B', '#C70039', '#A0A0A0', // Reds/Greys
  '#9BF6FF', '#4ECDC4', '#1A535C', '#505050', // Greens/Dark Greys
  '#A0C4FF', '#5E88FC', '#264653', '#111111', // Blues/Blacks
  '#BDB2FF', '#845EC2', '#6A0572', '#D100D1', // Purples/Pinks
];

export const DEFAULT_PALETTE = [...BRAND_COLORS, ...ALL_COLORS].slice(0, 15);
export const PALETTE_STORAGE_KEY = 'whiteboard_custom_palette';

export const isLightColor = (hex: string): boolean => {
  if (['#ffffff', '#e6e6e6', '#fff8b5', '#ffd866', '#ffd166', '#f4a261', '#9bf6ff'].includes(hex.toLowerCase())) return true;
  if (hex.startsWith('#') && hex.length >= 7) {
    const r = parseInt(hex.slice(1, 3), 16) || 0;
    const g = parseInt(hex.slice(3, 5), 16) || 0;
    const b = parseInt(hex.slice(5, 7), 16) || 0;
    return (r * 299 + g * 587 + b * 114) / 1000 > 165;
  }
  return false;
};

export const DEFAULT_STROKE_WIDTH = 3;
export const DEFAULT_ERASER_WIDTH = 10;
export const DEFAULT_SHAPE_SIZE = 20; // 20%
export const PIXELS_PER_PERCENT = 10; // 1% = 10px
export const DEFAULT_COLOR = '#000000';
