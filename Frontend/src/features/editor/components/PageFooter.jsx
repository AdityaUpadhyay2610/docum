import {
  FileText,
  CheckCircle2,
  Globe,
  Eye,
  ZoomIn,
  ZoomOut,
} from 'lucide-react';
import { useEditorSettings } from '../../../context/EditorSettingsContext';

export default function PageFooter({
  wordCount = 0,
  pageCount = 1,
  currentPage = 1,
  onOpenStats,
}) {
  const {
    viewMode,
    setViewMode,
    zoomLevel,
    setZoomLevel,
  } = useEditorSettings();

  return (
    <footer className="h-7 bg-[#f3f2f1] border-t border-[#e1dfdd] px-3 flex items-center justify-between text-neutral-600 text-[11px] select-none shrink-0 shadow-2xs">
      {/* Left info: Page count, Word count, Status */}
      <div className="flex items-center gap-3">
        <span className="font-medium text-neutral-700">
          Page {currentPage || 1} of {Math.max(1, pageCount || 1)}
        </span>

        <button
          type="button"
          onClick={onOpenStats}
          className="hover:bg-neutral-200/70 px-1.5 py-0.5 rounded text-neutral-700 font-medium cursor-pointer transition-colors"
          title="Click to view detailed Word Count statistics"
        >
          {wordCount} {wordCount === 1 ? 'word' : 'words'}
        </button>

        <span className="hidden sm:inline text-neutral-400">·</span>

        <div className="hidden sm:flex items-center gap-1 text-neutral-500">
          <CheckCircle2 className="w-3 h-3 text-emerald-600" />
          <span>English (US)</span>
        </div>
      </div>

      {/* Right controls: View modes & Zoom slider */}
      <div className="flex items-center gap-2.5">
        {/* Layout Mode Icons */}
        <div className="flex items-center gap-0.5 border-r border-neutral-300 pr-2">
          <button
            type="button"
            onClick={() => setViewMode('print')}
            className={`p-1 rounded transition-colors ${
              viewMode === 'print' ? 'bg-neutral-300 text-blue-700 font-bold' : 'hover:bg-neutral-200 text-neutral-600'
            }`}
            title="Print Layout"
          >
            <FileText className="w-3.5 h-3.5" />
          </button>
          <button
            type="button"
            onClick={() => setViewMode('web')}
            className={`p-1 rounded transition-colors ${
              viewMode === 'web' ? 'bg-neutral-300 text-blue-700 font-bold' : 'hover:bg-neutral-200 text-neutral-600'
            }`}
            title="Web Layout"
          >
            <Globe className="w-3.5 h-3.5" />
          </button>
          <button
            type="button"
            onClick={() => setViewMode(viewMode === 'focus' ? 'print' : 'focus')}
            className={`p-1 rounded transition-colors ${
              viewMode === 'focus' ? 'bg-neutral-300 text-purple-700 font-bold' : 'hover:bg-neutral-200 text-neutral-600'
            }`}
            title="Focus Mode"
          >
            <Eye className="w-3.5 h-3.5" />
          </button>
        </div>

        {/* Zoom Slider */}
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={() => setZoomLevel((prev) => Math.max(prev - 10, 50))}
            className="p-0.5 hover:bg-neutral-200 rounded text-neutral-600"
            title="Zoom Out"
          >
            <ZoomOut className="w-3 h-3" />
          </button>

          <input
            id="editor-zoom-slider"
            name="zoom_level"
            aria-label="Editor zoom level"
            type="range"
            min="50"
            max="200"
            step="5"
            value={zoomLevel}
            onChange={(e) => setZoomLevel(Number(e.target.value))}
            className="w-16 sm:w-24 h-1 bg-neutral-300 rounded-lg appearance-none cursor-pointer accent-blue-600"
            title={`Zoom: ${zoomLevel}%`}
          />

          <button
            type="button"
            onClick={() => setZoomLevel((prev) => Math.min(prev + 10, 200))}
            className="p-0.5 hover:bg-neutral-200 rounded text-neutral-600"
            title="Zoom In"
          >
            <ZoomIn className="w-3 h-3" />
          </button>

          <span className="font-mono text-[10px] text-neutral-700 font-semibold w-8 text-right">
            {zoomLevel}%
          </span>
        </div>
      </div>
    </footer>
  );
}
