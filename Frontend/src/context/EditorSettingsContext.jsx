/* eslint-disable react-refresh/only-export-components */
import { createContext, useContext, useState } from 'react';

const EditorSettingsContext = createContext(null);

export const PAGE_SIZES = {
  a4: { name: 'A4 (210 × 297 mm)', width: '816px', minHeight: '1056px', class: 'max-w-[816px]' },
  letter: { name: 'Letter (8.5 × 11 in)', width: '816px', minHeight: '1056px', class: 'max-w-[816px]' },
  legal: { name: 'Legal (8.5 × 14 in)', width: '816px', minHeight: '1344px', class: 'max-w-[816px]' },
  wide: { name: 'Full Width (Fluid)', width: '100%', minHeight: 'auto', class: 'max-w-5xl' },
};

export const MARGINS = {
  normal: { name: 'Normal (1 in)', px: 'px-12 py-12', label: '1 inch (2.54 cm)' },
  narrow: { name: 'Narrow (0.5 in)', px: 'px-6 py-8', label: '0.5 inch (1.27 cm)' },
  moderate: { name: 'Moderate (0.75 in)', px: 'px-9 py-10', label: '0.75 inch (1.9 cm)' },
  wide: { name: 'Wide (1.5 in)', px: 'px-16 py-14', label: '1.5 inch (3.81 cm)' },
};

export const PAGE_THEMES = {
  white: { name: 'Classic Word (White)', bg: 'bg-white', pageBg: 'bg-white', text: 'text-neutral-800', border: 'border-neutral-200' },
  parchment: { name: 'Warm Sepia', bg: 'bg-[#f4efe6]', pageBg: 'bg-[#faf6ee]', text: 'text-[#3c342a]', border: 'border-[#e4dcce]' },
  dark: { name: 'Dark Office', bg: 'bg-[#1e1e1e]', pageBg: 'bg-[#252526]', text: 'text-[#e0e0e0]', border: 'border-[#3c3c3c]' },
  softBlue: { name: 'Soft Blue', bg: 'bg-[#eef4fb]', pageBg: 'bg-[#f8fbfe]', text: 'text-[#1e2d42]', border: 'border-[#d0e0f2]' },
  cream: { name: 'Pastel Cream', bg: 'bg-[#fcfaf2]', pageBg: 'bg-[#fffef7]', text: 'text-[#2e2b24]', border: 'border-[#ede7d3]' },
};

export function EditorSettingsProvider({ children }) {
  const [pageSize, setPageSize] = useState('letter');
  const [orientation, setOrientation] = useState('portrait'); // 'portrait' | 'landscape'
  const [margin, setMargin] = useState('normal');
  const [pageTheme, setPageTheme] = useState('white');
  const [zoomLevel, setZoomLevel] = useState(100);
  const [showRuler, setShowRuler] = useState(true);
  const [showOutline, setShowOutline] = useState(false);
  const [showParagraphMarks, setShowParagraphMarks] = useState(false);
  const [viewMode, setViewMode] = useState('print'); // 'print' | 'web' | 'focus'
  const [showFindReplace, setShowFindReplace] = useState(false);
  const [showShortcuts, setShowShortcuts] = useState(false);
  const [copiedFormat, setCopiedFormat] = useState(null);
  const [rulerMargins, setRulerMargins] = useState({ left: 12, right: 12 });
  const [prevMargin, setPrevMargin] = useState('normal');

  if (margin !== prevMargin) {
    setPrevMargin(margin);
    if (margin === 'narrow') setRulerMargins({ left: 6, right: 6 });
    else if (margin === 'moderate') setRulerMargins({ left: 9, right: 9 });
    else if (margin === 'wide') setRulerMargins({ left: 18, right: 18 });
    else setRulerMargins({ left: 12, right: 12 });
  }

  return (
    <EditorSettingsContext.Provider
      value={{
        pageSize,
        setPageSize,
        orientation,
        setOrientation,
        margin,
        setMargin,
        rulerMargins,
        setRulerMargins,
        pageTheme,
        setPageTheme,
        zoomLevel,
        setZoomLevel,
        showRuler,
        setShowRuler,
        showOutline,
        setShowOutline,
        showParagraphMarks,
        setShowParagraphMarks,
        viewMode,
        setViewMode,
        showFindReplace,
        setShowFindReplace,
        showShortcuts,
        setShowShortcuts,
        copiedFormat,
        setCopiedFormat,
      }}
    >
      {children}
    </EditorSettingsContext.Provider>
  );
}

export function useEditorSettings() {
  const context = useContext(EditorSettingsContext);
  if (!context) {
    throw new Error('useEditorSettings must be used within an EditorSettingsProvider');
  }
  return context;
}
