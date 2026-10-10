import { createSlice } from '@reduxjs/toolkit';

const initialState = {
  pageSize: 'letter',
  orientation: 'portrait',
  margin: 'normal',
  pageTheme: 'white',
  zoomLevel: 100,
  showRuler: true,
  showOutline: false,
  showParagraphMarks: false,
  viewMode: 'print',
  showFindReplace: false,
  showShortcuts: false,
  copiedFormat: null,
  rulerMargins: { left: 12, right: 12 },
};

const editorSettingsSlice = createSlice({
  name: 'editorSettings',
  initialState,
  reducers: {
    setPageSize(state, action) { state.pageSize = action.payload; },
    setOrientation(state, action) { state.orientation = action.payload; },
    setMargin(state, action) {
      state.margin = action.payload;
      // Sync ruler margins
      const m = action.payload;
      if (m === 'narrow') state.rulerMargins = { left: 6, right: 6 };
      else if (m === 'moderate') state.rulerMargins = { left: 9, right: 9 };
      else if (m === 'wide') state.rulerMargins = { left: 18, right: 18 };
      else state.rulerMargins = { left: 12, right: 12 };
    },
    setRulerMargins(state, action) { state.rulerMargins = action.payload; },
    setPageTheme(state, action) { state.pageTheme = action.payload; },
    setZoomLevel(state, action) { state.zoomLevel = action.payload; },
    setShowRuler(state, action) { state.showRuler = action.payload; },
    setShowOutline(state, action) { state.showOutline = action.payload; },
    setShowParagraphMarks(state, action) { state.showParagraphMarks = action.payload; },
    setViewMode(state, action) { state.viewMode = action.payload; },
    setShowFindReplace(state, action) { state.showFindReplace = action.payload; },
    setShowShortcuts(state, action) { state.showShortcuts = action.payload; },
    setCopiedFormat(state, action) { state.copiedFormat = action.payload; },
  },
});

export const {
  setPageSize,
  setOrientation,
  setMargin,
  setRulerMargins,
  setPageTheme,
  setZoomLevel,
  setShowRuler,
  setShowOutline,
  setShowParagraphMarks,
  setViewMode,
  setShowFindReplace,
  setShowShortcuts,
  setCopiedFormat,
} = editorSettingsSlice.actions;

export default editorSettingsSlice.reducer;
