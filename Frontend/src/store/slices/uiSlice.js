import { createSlice } from '@reduxjs/toolkit';

const initialState = {
  isSidebarOpen: true,
  isGuestRegisterModalOpen: false,
};

const uiSlice = createSlice({
  name: 'ui',
  initialState,
  reducers: {
    setSidebarOpen(state, action) { state.isSidebarOpen = action.payload; },
    toggleSidebar(state) { state.isSidebarOpen = !state.isSidebarOpen; },
    setGuestRegisterModalOpen(state, action) { state.isGuestRegisterModalOpen = action.payload; },
  },
});

export const { setSidebarOpen, toggleSidebar, setGuestRegisterModalOpen } = uiSlice.actions;
export default uiSlice.reducer;
