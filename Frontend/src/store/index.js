import { configureStore } from '@reduxjs/toolkit';
import documentReducer from './slices/documentSlice';
import editorSettingsReducer from './slices/editorSettingsSlice';
import uiReducer from './slices/uiSlice';

const store = configureStore({
  reducer: {
    document: documentReducer,
    editorSettings: editorSettingsReducer,
    ui: uiReducer,
  },
  devTools: import.meta.env.DEV,
});

export default store;
