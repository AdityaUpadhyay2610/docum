import { createSlice } from '@reduxjs/toolkit';

const initialState = {
  documents: [],
  activeDoc: null,
  loading: false,
  error: null,
  saveStatus: 'saved', // 'saved' | 'saving' | 'error'
  activeBlockId: null,
};

const documentSlice = createSlice({
  name: 'document',
  initialState,
  reducers: {
    // --- Document List ---
    setDocuments(state, action) {
      state.documents = action.payload;
    },
    addDocument(state, action) {
      state.documents.unshift(action.payload);
    },
    removeDocument(state, action) {
      state.documents = state.documents.filter(
        (d) => (d._id || d.id) !== action.payload
      );
    },
    updateDocumentMeta(state, action) {
      const { id, changes } = action.payload;
      const idx = state.documents.findIndex((d) => (d._id || d.id) === id);
      if (idx !== -1) {
        state.documents[idx] = { ...state.documents[idx], ...changes };
      }
    },

    // --- Active Document ---
    setActiveDoc(state, action) {
      state.activeDoc = action.payload;
    },
    updateActiveDoc(state, action) {
      if (!state.activeDoc) return;
      state.activeDoc = { ...state.activeDoc, ...action.payload };
    },

    // --- Blocks inside active doc ---
    setBlocks(state, action) {
      if (!state.activeDoc) return;
      state.activeDoc.content = action.payload;
    },
    insertPageBreak(state, action) {
      // Insert a page-break block after given index
      if (!state.activeDoc) return;
      const { afterIndex } = action.payload;
      const pageBreakBlock = {
        id: crypto.randomUUID(),
        type: 'page-break',
        text: '',
      };
      const newContent = [...(state.activeDoc.content || [])];
      newContent.splice(afterIndex + 1, 0, pageBreakBlock);
      state.activeDoc.content = newContent;
    },
    addBlankPage(state) {
      // Append a page-break then an empty paragraph to start a new page
      if (!state.activeDoc) return;
      const newBlocks = [
        {
          id: crypto.randomUUID(),
          type: 'page-break',
          text: '',
        },
        {
          id: crypto.randomUUID(),
          type: 'paragraph',
          text: '',
        },
      ];
      state.activeDoc.content = [
        ...(state.activeDoc.content || []),
        ...newBlocks,
      ];
    },

    // --- UI state ---
    setLoading(state, action) {
      state.loading = action.payload;
    },
    setError(state, action) {
      state.error = action.payload;
    },
    setSaveStatus(state, action) {
      state.saveStatus = action.payload;
    },
    setActiveBlockId(state, action) {
      state.activeBlockId = action.payload;
    },
    clearError(state) {
      state.error = null;
    },
  },
});

export const {
  setDocuments,
  addDocument,
  removeDocument,
  updateDocumentMeta,
  setActiveDoc,
  updateActiveDoc,
  setBlocks,
  insertPageBreak,
  addBlankPage,
  setLoading,
  setError,
  setSaveStatus,
  setActiveBlockId,
  clearError,
} = documentSlice.actions;

export default documentSlice.reducer;
