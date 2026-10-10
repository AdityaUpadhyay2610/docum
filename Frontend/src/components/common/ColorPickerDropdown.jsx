import { useState, useRef, useEffect } from 'react';
import { ChevronDown } from 'lucide-react';

const STANDARD_COLORS = [
  '#000000', '#434343', '#666666', '#999999', '#b7b7b7', '#cccccc', '#d9d9d9', '#efefef', '#f3f3f3', '#ffffff',
  '#980000', '#ff0000', '#ff9900', '#ffff00', '#00ff00', '#00ffff', '#4a86e8', '#0000ff', '#9900ff', '#ff00ff',
  '#e6b8af', '#f4cccc', '#fce5cd', '#fff2cc', '#d9ead3', '#d0e0e3', '#c9daf8', '#cfe2f3', '#d9d2e9', '#ead1dc',
  '#dd7e6b', '#ea9999', '#f9cb9c', '#ffe599', '#b6d7a8', '#a2c4c9', '#a4c2f4', '#9fc5e8', '#b4a7d6', '#d5a6bd',
  '#cc4125', '#e06666', '#f6b26b', '#ffd966', '#93c47d', '#76a5af', '#6d9eeb', '#6fa8dc', '#8e7cc3', '#c27ba0',
  '#a61c00', '#cc0000', '#e69138', '#f1c232', '#6aa84f', '#45818e', '#3c78d8', '#3d85c6', '#674ea7', '#a64d79',
  '#5b0f00', '#660000', '#783f04', '#7f6000', '#274e13', '#0c343d', '#1155cc', '#073763', '#20124d', '#4c1130',
];

const HIGHLIGHT_COLORS = [
  { name: 'Yellow', color: '#fef08a' },
  { name: 'Bright Green', color: '#bbf7d0' },
  { name: 'Cyan Blue', color: '#bae6fd' },
  { name: 'Pink Magenta', color: '#fbcfe8' },
  { name: 'Warm Orange', color: '#fed7aa' },
  { name: 'Lavender', color: '#e9d5ff' },
  { name: 'No Color', color: 'transparent' },
];

export default function ColorPickerDropdown({
  type = 'font', // 'font' | 'highlight'
  value = '#000000',
  onChange,
  disabled = false,
  title = 'Color',
  icon: Icon,
}) {
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef(null);

  useEffect(() => {
    const handleOutsideClick = (e) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target)) {
        setIsOpen(false);
      }
    };
    if (isOpen) {
      document.addEventListener('mousedown', handleOutsideClick);
    }
    return () => document.removeEventListener('mousedown', handleOutsideClick);
  }, [isOpen]);

  const handleSelect = (color) => {
    onChange(color);
    setIsOpen(false);
  };

  return (
    <div className="relative inline-flex items-center" ref={dropdownRef}>
      {/* Direct click applies current color */}
      <button
        type="button"
        disabled={disabled}
        onClick={() => setIsOpen(!isOpen)}
        className="flex flex-col items-center justify-center h-8 px-1.5 rounded hover:bg-neutral-100 disabled:opacity-40 disabled:cursor-not-allowed transition-colors text-neutral-700"
        title={title}
      >
        <div className="flex items-center gap-0.5">
          {Icon ? <Icon className="w-3.5 h-3.5" /> : <span className="font-bold text-xs">A</span>}
          <ChevronDown className="w-2.5 h-2.5 opacity-60" />
        </div>
        {/* Color underline indicator bar */}
        <div
          className="w-full h-1 rounded-full mt-0.5 border border-black/10"
          style={{ backgroundColor: value === 'transparent' ? '#ffffff' : value }}
        />
      </button>

      {/* Word Color Palette Dropdown */}
      {isOpen && (
        <div className="absolute top-9 left-0 z-50 bg-white rounded-lg shadow-2xl border border-neutral-200 p-2.5 w-56 animate-in fade-in zoom-in-95 duration-100">
          <div className="text-[10px] font-semibold uppercase tracking-wider text-neutral-400 mb-1.5 px-0.5">
            {type === 'font' ? 'Theme & Standard Colors' : 'Highlight Colors'}
          </div>

          {type === 'highlight' ? (
            <div className="grid grid-cols-4 gap-1.5">
              {HIGHLIGHT_COLORS.map((item) => (
                <button
                  key={item.color}
                  type="button"
                  onClick={() => handleSelect(item.color)}
                  className="flex flex-col items-center gap-1 p-1 rounded hover:bg-neutral-100 border border-neutral-200 transition-transform hover:scale-105"
                  title={item.name}
                >
                  <div
                    className="w-7 h-5 rounded border border-neutral-300 shadow-xs"
                    style={{ backgroundColor: item.color }}
                  />
                  <span className="text-[9px] text-neutral-600 truncate max-w-[45px]">{item.name}</span>
                </button>
              ))}
            </div>
          ) : (
            <>
              {/* Color Grid */}
              <div className="grid grid-cols-10 gap-1 mb-2">
                {STANDARD_COLORS.map((color, idx) => (
                  <button
                    key={`${color}-${idx}`}
                    type="button"
                    onClick={() => handleSelect(color)}
                    style={{ backgroundColor: color }}
                    className="w-4 h-4 rounded-xs border border-neutral-300 hover:scale-125 transition-transform shadow-xs"
                    title={color}
                  />
                ))}
              </div>

              {/* Custom Hex input */}
              <div className="pt-2 border-t border-neutral-100 flex items-center justify-between gap-1 text-xs">
                <span className="text-[11px] text-neutral-500 font-medium">Custom</span>
                <div className="flex items-center gap-1.5">
                  <input
                    type="color"
                    value={value && value !== 'transparent' ? value : '#000000'}
                    onChange={(e) => onChange(e.target.value)}
                    className="w-5 h-5 rounded cursor-pointer border-0 p-0"
                    title="Pick custom color"
                  />
                  <button
                    type="button"
                    onClick={() => handleSelect('inherit')}
                    className="text-[10px] text-blue-600 hover:underline"
                  >
                    Automatic
                  </button>
                </div>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
