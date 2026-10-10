import { useState, useRef, useEffect, useCallback } from 'react';
import { useEditorSettings } from '../../../context/EditorSettingsContext';

export default function DocumentRuler() {
  const { showRuler, rulerMargins = { left: 12, right: 12 }, setRulerMargins, viewMode } = useEditorSettings();
  const rulerRef = useRef(null);
  const [activeDrag, setActiveDrag] = useState(null); // 'left' | 'right' | null
  const [tooltip, setTooltip] = useState(null); // { text: string, x: number }

  const handleDrag = useCallback(
    (clientX) => {
      if (!activeDrag || !rulerRef.current) return;
      const rect = rulerRef.current.getBoundingClientRect();
      const x = clientX - rect.left;
      const percent = Math.min(Math.max((x / rect.width) * 100, 0), 100);

      if (activeDrag === 'left') {
        // Clamp left margin between 2% and 40%
        const clamped = Math.min(Math.max(Math.round(percent), 2), 40);
        setRulerMargins((prev) => ({ ...prev, left: clamped }));
        const inches = ((clamped / 100) * 8.5).toFixed(2);
        setTooltip({ text: `Left Margin: ${inches}" (${((clamped / 100) * 21.59).toFixed(1)} cm)`, x: clientX });
      } else if (activeDrag === 'right') {
        // Clamp right margin between 2% and 40% (represented as 100 - percent)
        const rightPercent = 100 - percent;
        const clamped = Math.min(Math.max(Math.round(rightPercent), 2), 40);
        setRulerMargins((prev) => ({ ...prev, right: clamped }));
        const inches = ((clamped / 100) * 8.5).toFixed(2);
        setTooltip({ text: `Right Margin: ${inches}" (${((clamped / 100) * 21.59).toFixed(1)} cm)`, x: clientX });
      }
    },
    [activeDrag, setRulerMargins]
  );

  useEffect(() => {
    if (!activeDrag) return;

    const onMouseMove = (e) => {
      e.preventDefault();
      handleDrag(e.clientX);
    };

    const onTouchMove = (e) => {
      if (e.touches.length > 0) {
        handleDrag(e.touches[0].clientX);
      }
    };

    const onStopDrag = () => {
      setActiveDrag(null);
      setTooltip(null);
    };

    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onStopDrag);
    window.addEventListener('touchmove', onTouchMove);
    window.addEventListener('touchend', onStopDrag);

    return () => {
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onStopDrag);
      window.removeEventListener('touchmove', onTouchMove);
      window.removeEventListener('touchend', onStopDrag);
    };
  }, [activeDrag, handleDrag]);

  if (!showRuler || viewMode !== 'print') return null;

  const leftMarginPercent = rulerMargins.left;
  const rightMarginPercent = 100 - rulerMargins.right;

  return (
    <div className="w-full bg-[#f8f9fa] border-b border-neutral-300 h-7 select-none flex items-center justify-center shrink-0 overflow-visible relative z-30">
      {/* Floating Measurement Tooltip */}
      {tooltip && (
        <div
          className="fixed top-16 bg-neutral-900 text-white text-xs font-mono font-medium px-2.5 py-1 rounded-md shadow-lg pointer-events-none z-50 -translate-x-1/2 animate-in fade-in zoom-in-95 duration-75"
          style={{ left: `${tooltip.x}px` }}
        >
          {tooltip.text}
        </div>
      )}

      {/* Main Ruler Bar matching Paper Width (816px) */}
      <div
        ref={rulerRef}
        className="w-full max-w-[816px] h-full relative flex items-center px-4 bg-[#e8eaed]"
      >
        {/* Printable Area Background Bar */}
        <div
          className="absolute h-full bg-white border-x border-neutral-300 transition-[left,right] duration-75"
          style={{
            left: `${leftMarginPercent}%`,
            right: `${rulerMargins.right}%`,
          }}
        />

        {/* Ruler Inch Divisions (0 to 8 inches) */}
        <div className="w-full h-full flex justify-between items-end pb-1 text-[9px] font-mono text-neutral-500 relative z-10 px-2 pointer-events-none">
          {Array.from({ length: 9 }).map((_, i) => (
            <div key={i} className="flex flex-col items-center h-full justify-between">
              <span className="text-[8.5px] font-semibold text-neutral-600">{i}</span>
              <div className="flex items-end gap-1">
                <div className="w-[1px] h-1.5 bg-neutral-400" />
                <div className="w-[1px] h-2.5 bg-neutral-600" />
                <div className="w-[1px] h-1.5 bg-neutral-400" />
              </div>
            </div>
          ))}
        </div>

        {/* Left Margin Draggable Handle */}
        <div
          onMouseDown={(e) => {
            e.preventDefault();
            e.stopPropagation();
            setActiveDrag('left');
          }}
          onTouchStart={(e) => {
            e.stopPropagation();
            setActiveDrag('left');
          }}
          className={`absolute top-0 w-3 h-full flex flex-col items-center justify-between cursor-ew-resize z-40 transition-transform ${
            activeDrag === 'left' ? 'scale-110' : 'hover:scale-105'
          }`}
          style={{ left: `${leftMarginPercent}%`, transform: 'translateX(-50%)' }}
          title="Drag to adjust Left Margin"
        >
          {/* First Line Indent (Top Inverted Triangle) */}
          <div className="w-0 h-0 border-l-[4.5px] border-l-transparent border-r-[4.5px] border-r-transparent border-t-[6px] border-t-blue-600 shadow-xs" />
          <div className="w-[1.5px] h-full bg-blue-600 opacity-80" />
          {/* Left Indent (Bottom Triangle) */}
          <div className="w-0 h-0 border-l-[4.5px] border-l-transparent border-r-[4.5px] border-r-transparent border-b-[6px] border-b-blue-600 shadow-xs" />
        </div>

        {/* Right Margin Draggable Handle */}
        <div
          onMouseDown={(e) => {
            e.preventDefault();
            e.stopPropagation();
            setActiveDrag('right');
          }}
          onTouchStart={(e) => {
            e.stopPropagation();
            setActiveDrag('right');
          }}
          className={`absolute top-0 w-3 h-full flex flex-col items-center justify-between cursor-ew-resize z-40 transition-transform ${
            activeDrag === 'right' ? 'scale-110' : 'hover:scale-105'
          }`}
          style={{ left: `${rightMarginPercent}%`, transform: 'translateX(-50%)' }}
          title="Drag to adjust Right Margin"
        >
          {/* Top Inverted Triangle */}
          <div className="w-0 h-0 border-l-[4.5px] border-l-transparent border-r-[4.5px] border-r-transparent border-t-[6px] border-t-blue-600 shadow-xs" />
          <div className="w-[1.5px] h-full bg-blue-600 opacity-80" />
          {/* Bottom Triangle */}
          <div className="w-0 h-0 border-l-[4.5px] border-l-transparent border-r-[4.5px] border-r-transparent border-b-[6px] border-b-blue-600 shadow-xs" />
        </div>
      </div>
    </div>
  );
}
