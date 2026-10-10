import { useState, useRef, useEffect } from 'react';
import { Info, AlertTriangle, Lightbulb, CheckCircle2, ChevronDown } from 'lucide-react';

const CALLOUT_TYPES = [
  { id: 'info', name: 'Info Note', icon: Info, bg: 'bg-blue-50/70', border: 'border-blue-300', text: 'text-blue-900', iconColor: 'text-blue-600' },
  { id: 'warning', name: 'Warning', icon: AlertTriangle, bg: 'bg-amber-50/70', border: 'border-amber-300', text: 'text-amber-900', iconColor: 'text-amber-600' },
  { id: 'tip', name: 'Pro Tip', icon: Lightbulb, bg: 'bg-emerald-50/70', border: 'border-emerald-300', text: 'text-emerald-900', iconColor: 'text-emerald-600' },
  { id: 'success', name: 'Notice', icon: CheckCircle2, bg: 'bg-purple-50/70', border: 'border-purple-300', text: 'text-purple-900', iconColor: 'text-purple-600' },
];

export default function CalloutBlock({ block, onChange, onFocus, onKeyDown, inputRef, style = {} }) {
  const [calloutType, setCalloutType] = useState(block.calloutType || 'info');
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const menuRef = useRef(null);

  const currentConfig = CALLOUT_TYPES.find((c) => c.id === calloutType) || CALLOUT_TYPES[0];
  const IconComponent = currentConfig.icon;

  useEffect(() => {
    const handleOutsideClick = (e) => {
      if (menuRef.current && !menuRef.current.contains(e.target)) {
        setIsMenuOpen(false);
      }
    };
    if (isMenuOpen) document.addEventListener('mousedown', handleOutsideClick);
    return () => document.removeEventListener('mousedown', handleOutsideClick);
  }, [isMenuOpen]);

  const handleSelectType = (id) => {
    setCalloutType(id);
    setIsMenuOpen(false);
    onChange?.(block.text || '', null, { calloutType: id });
  };

  return (
    <div className={`my-2 p-3.5 rounded-xl border ${currentConfig.bg} ${currentConfig.border} flex items-start gap-3 transition-colors shadow-2xs`}>
      {/* Icon with Type Switcher Popover */}
      <div className="relative shrink-0" ref={menuRef}>
        <button
          type="button"
          onClick={() => setIsMenuOpen(!isMenuOpen)}
          className={`p-1 rounded-lg hover:bg-black/5 transition-colors cursor-pointer flex items-center gap-0.5 ${currentConfig.iconColor}`}
          title="Change Callout Style"
        >
          <IconComponent className="w-5 h-5" />
          <ChevronDown className="w-2.5 h-2.5 opacity-60" />
        </button>

        {isMenuOpen && (
          <div className="absolute top-8 left-0 z-30 bg-white rounded-lg shadow-xl border border-neutral-200 p-1 w-36 animate-in fade-in zoom-in-95 duration-100">
            {CALLOUT_TYPES.map((type) => {
              const ItemIcon = type.icon;
              return (
                <button
                  key={type.id}
                  type="button"
                  onClick={() => handleSelectType(type.id)}
                  className={`w-full flex items-center gap-2 px-2 py-1.5 rounded text-xs text-left transition-colors ${
                    calloutType === type.id ? 'bg-neutral-100 font-semibold' : 'hover:bg-neutral-50'
                  }`}
                >
                  <ItemIcon className={`w-3.5 h-3.5 ${type.iconColor}`} />
                  <span className="text-neutral-700">{type.name}</span>
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* Editable Callout Content */}
      <textarea
        id={`callout-block-${block.id}`}
        name={`callout_${block.id}`}
        aria-label="Callout note content"
        ref={inputRef}
        rows={1}
        value={block.text || ''}
        placeholder="Type callout note or important instructions..."
        onChange={(e) => onChange?.(e.target.value, e.target)}
        onFocus={onFocus}
        onKeyDown={onKeyDown}
        style={style}
        className={`w-full bg-transparent border-none focus:outline-none resize-none overflow-hidden text-sm leading-relaxed ${currentConfig.text}`}
      />
    </div>
  );
}
