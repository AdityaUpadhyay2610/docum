import { useAutoSave } from '../features/editor/hooks/useAutoSave';
import { useUndoRedo } from '../features/editor/hooks/useUndoRedo';
import { useWordStats } from '../features/editor/hooks/useWordStats';
import documentServices from '../services/documentServices';

export { useAutoSave, useUndoRedo, useWordStats, documentServices };
export default documentServices;
