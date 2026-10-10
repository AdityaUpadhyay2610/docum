import { useState, useEffect, useCallback } from 'react';
import { useSelector, useDispatch } from 'react-redux';
import {
  setDocuments,
  addDocument,
  removeDocument,
  updateDocumentMeta,
  setActiveDoc,
  updateActiveDoc,
  setBlocks,
  setLoading,
  setError,
  setSaveStatus,
  setActiveBlockId,
} from '../store/slices/documentSlice';
import { setSidebarOpen, toggleSidebar } from '../store/slices/uiSlice';
import Sidebar from '../components/layout/sidebar/sidebar';
import GoogleDocsToolbar from '../features/editor/components/GoogleDocsToolbar';
import DocumentRuler from '../features/editor/components/DocumentRuler';
import DocumentOutline from '../features/editor/components/DocumentOutline';
import FindReplaceModal from '../features/editor/components/FindReplaceModal';
import ShortcutsModal from '../features/editor/components/ShortcutsModal';
import PageFooter from '../features/editor/components/PageFooter';
import EditorCanvas from '../features/editor/editorCanvas';
import documentServices from '../services/documentServices';
import useAutoSave from '../features/editor/hooks/useAutoSave';
import useUndoRedo from '../features/editor/hooks/useUndoRedo';
import { useWordStats } from '../features/editor/hooks/useWordStats';
import GuestRegisterModal from '../components/auth/GuestRegisterModal';
import { useAuth } from '../context/AuthContext';
import {
  EditorSettingsProvider,
  useEditorSettings,
} from '../context/EditorSettingsContext';
import { exportToDocx } from '../services/docxExport';
import { printDocument } from '../services/printService';
import { Loader2, AlertTriangle, Plus, RefreshCw } from 'lucide-react';

const GUEST_STARTER_DOC = {
  _id: 'guest-starter-1',
  id: 'guest-starter-1',
  title: 'Annual Project Proposal & Strategy',
  icon: '📄',
  coverImage: 'bg-gradient-to-r from-violet-600 via-pink-500 to-amber-400',
  content: [
    {
      id: 'b1',
      type: 'h1',
      text: 'Executive Summary & Project Overview',
      style: { bold: true, color: '#0f4c81', fontSize: '28px' },
    },
    {
      id: 'b2',
      type: 'callout',
      calloutType: 'info',
      text: 'Welcome to your Documents document workspace! Use the Word Ribbon above for typography, layout, themes, table inserts, and page settings.',
    },
    {
      id: 'b3',
      type: 'paragraph',
      text: 'This interactive document editor replicates the complete Documents editing experience with rich ribbons, customizable font families, margins, rulers, live tables, and instant .docx file generation.',
      style: { lineHeight: '1.75' },
    },
    {
      id: 'b4',
      type: 'h2',
      text: 'Key Deliverables & Action Items',
      style: { bold: true, color: '#1e293b', fontSize: '22px' },
    },
    {
      id: 'b5',
      type: 'todo',
      text: 'Customize fonts (Calibri, Aptos, Georgia, Inter) and font sizes in the Home tab',
      checked: true,
    },
    {
      id: 'b6',
      type: 'todo',
      text: 'Adjust page margins, orientation (Portrait/Landscape), and page color in the Layout tab',
      checked: true,
    },
    {
      id: 'b7',
      type: 'todo',
      text: 'Insert data tables, Kanban boards, or code snippet blocks from the Insert tab or "/" menu',
      checked: false,
    },
    {
      id: 'b8',
      type: 'todo',
      text: 'Download finished work directly as Documents .docx format or copy clean Markdown',
      checked: false,
    },
    {
      id: 'b9',
      type: 'h2',
      text: 'Feature Matrix & Capability Comparison',
      style: { bold: true, color: '#1e293b', fontSize: '22px' },
    },
    {
      id: 'b10',
      type: 'table',
      headers: ['Word Capability', 'Workspace Status', 'Export Format'],
      rows: [
        ['Ribbon Panels (Home, Insert, Layout, Review, View, Help)', '✅ Complete', 'Full Visual Ribbon'],
        ['Page Setup (Margins, A4/Letter, Page Colors, Rulers)', '✅ Integrated', 'Custom Print Canvas'],
        ['Document Headings & Outline Navigation', '✅ Real-time', 'Click-to-jump Pane'],
        ['DOCX Word File Generation', '✅ Supported', 'Instant .docx Download'],
      ],
    },
    {
      id: 'b11',
      type: 'quote',
      text: '“Simplicity is prerequisite for reliability.” — Edsger W. Dijkstra',
      style: { italic: true, color: '#475569' },
    },
  ],
};

function WorkspaceContent() {
  const {
    user,
    isGuest,
    logout,
    isRegisterModalOpen,
    openRegisterModal,
    closeRegisterModal,
  } = useAuth();

  const {
    setShowFindReplace,
  } = useEditorSettings();

  const dispatch = useDispatch();
  const {
    documents,
    activeDoc,
    loading,
    error,
    saveStatus,
    activeBlockId,
  } = useSelector((state) => state.document);
  const isSidebarOpen = useSelector((state) => state.ui.isSidebarOpen);
  const [pageInfo, setPageInfo] = useState({ pageCount: 1, currentPage: 1 });

  // AutoSave hook
  const { saveStatus: internalSaveStatus, queueAutoSave, saveImmediate } = useAutoSave(
    activeDoc,
    (updatedDoc) => {
      if (updatedDoc) {
        const docId = updatedDoc._id || updatedDoc.id;
        dispatch(
          updateDocumentMeta({
            id: docId,
            changes: {
              title: updatedDoc.title,
              icon: updatedDoc.icon,
              coverImage: updatedDoc.coverImage,
              updatedAt: new Date().toISOString(),
            },
          })
        );
      }
    },
    500,
    isGuest
  );

  useEffect(() => {
    dispatch(setSaveStatus(internalSaveStatus));
  }, [internalSaveStatus, dispatch]);

  // Undo / Redo history hook
  const { undo, redo, canUndo, canRedo, pushState } = useUndoRedo(
    activeDoc?.content || [],
    (restoredBlocks) => {
      if (!activeDoc) return;
      dispatch(setBlocks(restoredBlocks));
      queueAutoSave({ content: restoredBlocks });
    }
  );

  // Load a single document by ID
  const loadDocument = useCallback(
    async (id) => {
      if (!id) return;

      if (isGuest) {
        const found = documents.find((d) => (d._id || d.id) === id);
        if (found) {
          dispatch(setActiveDoc(found));
          dispatch(setError(null));
        }
        return;
      }

      try {
        const doc = await documentServices.getById(id);
        dispatch(setActiveDoc(doc));
        dispatch(setError(null));
      } catch (err) {
        console.error('Failed to load document:', err);
        dispatch(setError('Could not load the requested document.'));
      }
    },
    [isGuest, documents, dispatch]
  );

  // Initial fetch for logged in user
  const fetchAllDocs = useCallback(async () => {
    if (isGuest) {
      dispatch(setLoading(false));
      return;
    }

    dispatch(setError(null));
    try {
      const data = await documentServices.getAll();
      dispatch(setDocuments(data || []));
      if (data && data.length > 0) {
        const firstDoc = await documentServices.getById(data[0]._id);
        dispatch(setActiveDoc(firstDoc));
      } else {
        dispatch(setActiveDoc(null));
      }
    } catch (err) {
      console.error('Failed to fetch user documents:', err);
      dispatch(setError('Unable to load your documents. Please verify your connection.'));
    } finally {
      dispatch(setLoading(false));
    }
  }, [isGuest, dispatch]);

  useEffect(() => {
    if (isGuest) {
      dispatch(setDocuments([GUEST_STARTER_DOC]));
      dispatch(setActiveDoc(GUEST_STARTER_DOC));
      dispatch(setLoading(false));
      return;
    }

    let isMounted = true;
    async function initialize() {
      dispatch(setLoading(true));
      try {
        const data = await documentServices.getAll();
        if (!isMounted) return;
        dispatch(setDocuments(data || []));
        if (data && data.length > 0) {
          const firstDoc = await documentServices.getById(data[0]._id);
          if (isMounted) dispatch(setActiveDoc(firstDoc));
        } else {
          if (isMounted) dispatch(setActiveDoc(null));
        }
      } catch (err) {
        if (isMounted) {
          console.error('Failed to initialize documents:', err);
          dispatch(setError('Unable to load documents from database.'));
        }
      } finally {
        if (isMounted) dispatch(setLoading(false));
      }
    }

    initialize();
    return () => {
      isMounted = false;
    };
  }, [isGuest, dispatch]);

  // Update browser tab title
  useEffect(() => {
    if (activeDoc?.title && activeDoc.title.trim() !== '') {
      document.title = `${activeDoc.title} · Document Workshops Word`;
    } else {
      document.title = 'Document Workshops · Documents';
    }
  }, [activeDoc?.title]);

  // Create new document
  const handleCreateDoc = async () => {
    if (isGuest) {
      const newGuestDoc = {
        _id: `guest-${crypto.randomUUID()}`,
        id: `guest-${crypto.randomUUID()}`,
        title: 'Untitled Document',
        icon: '📝',
        coverImage: '',
        content: [
          { id: crypto.randomUUID(), type: 'h1', text: 'New Document' },
          { id: crypto.randomUUID(), type: 'paragraph', text: 'Start writing or press "/" to insert Word blocks...' },
        ],
      };
      dispatch(addDocument(newGuestDoc));
      dispatch(setActiveDoc(newGuestDoc));
      dispatch(setError(null));
      return;
    }

    try {
      const newDoc = await documentServices.create({
        title: 'Untitled Document',
        icon: '📝',
        coverImage: '',
        content: [
          { id: crypto.randomUUID(), type: 'h1', text: 'New Document' },
          { id: crypto.randomUUID(), type: 'paragraph', text: 'Start typing or use the Word Ribbon above...' },
        ],
      });

      dispatch(addDocument(newDoc));
      dispatch(setActiveDoc(newDoc));
      dispatch(setError(null));
    } catch (err) {
      console.error('Failed to create document:', err);
      dispatch(setError('Failed to create a new document in database.'));
    }
  };

  // Switch document
  const handleSelectDoc = async (id) => {
    const activeId = activeDoc?._id || activeDoc?.id;
    if (activeDoc && activeId === id) return;
    await loadDocument(id);
  };

  // Update title
  const handleTitleChange = (newTitle) => {
    if (!activeDoc) return;
    const docId = activeDoc._id || activeDoc.id;
    dispatch(updateActiveDoc({ title: newTitle }));
    dispatch(updateDocumentMeta({ id: docId, changes: { title: newTitle } }));
    queueAutoSave({ title: newTitle });
  };



  // Update content blocks
  const handleUpdateBlocks = (newBlocks) => {
    if (!activeDoc) return;
    dispatch(setBlocks(newBlocks));
    pushState(newBlocks);
    queueAutoSave({ content: newBlocks });
  };

  // Format change for active block
  const handleFormatChange = (styleUpdates) => {
    if (!activeDoc) return;
    const content = activeDoc.content || [];
    if (content.length === 0) {
      const newBlock = { id: crypto.randomUUID(), type: 'paragraph', text: '', style: styleUpdates };
      handleUpdateBlocks([newBlock]);
      dispatch(setActiveBlockId(newBlock.id));
      return;
    }

    const targetId = activeBlockId || content[0]?.id;
    if (!targetId) return;

    const updatedBlocks = content.map((block) => {
      if (block.id === targetId) {
        return {
          ...block,
          style: {
            ...(block.style || {}),
            ...styleUpdates,
          },
        };
      }
      return block;
    });

    handleUpdateBlocks(updatedBlocks);
  };

  // Transform active block type
  const handleTransformBlockType = (newType) => {
    if (!activeDoc) return;
    const content = activeDoc.content || [];
    if (content.length === 0) {
      const newBlock = {
        id: crypto.randomUUID(),
        type: newType,
        text: '',
        checked: newType === 'todo' ? false : undefined,
        calloutType: newType === 'callout' ? 'info' : undefined,
      };
      handleUpdateBlocks([newBlock]);
      dispatch(setActiveBlockId(newBlock.id));
      return;
    }

    const targetId = activeBlockId || content[0]?.id;
    if (!targetId) return;

    const updatedBlocks = content.map((block) => {
      if (block.id === targetId) {
        let extra = {};
        if (newType === 'callout') extra = { calloutType: block.calloutType || 'info' };
        if (newType === 'todo') extra = { checked: block.checked !== undefined ? block.checked : false };
        if (newType === 'table') {
          extra = {
            headers: block.headers || ['Name', 'Tag', 'Notes'],
            rows: block.rows || [['Task 1', 'Active', 'Initial draft']],
          };
        }
        if (newType === 'board') {
          extra = {
            columns: block.columns || [
              { id: crypto.randomUUID(), title: 'To Do', color: 'amber', cards: [] },
              { id: crypto.randomUUID(), title: 'In Progress', color: 'blue', cards: [] },
              { id: crypto.randomUUID(), title: 'Done', color: 'emerald', cards: [] },
            ],
          };
        }
        return {
          ...block,
          type: newType,
          ...extra,
        };
      }
      return block;
    });

    handleUpdateBlocks(updatedBlocks);
  };

  // Insert block
  const handleInsertBlock = (type, extraFields = {}) => {
    if (!activeDoc) return;
    const newBlock = {
      id: crypto.randomUUID(),
      type,
      text: '',
      checked: type === 'todo' ? false : undefined,
      ...extraFields,
    };

    if (type === 'table' && !extraFields.headers) {
      newBlock.headers = ['Name', 'Tag', 'Notes'];
      newBlock.rows = [['', '', '']];
    }
    if (type === 'board' && !extraFields.columns) {
      newBlock.columns = [
        { id: crypto.randomUUID(), title: 'To Do', color: 'amber', cards: [] },
        { id: crypto.randomUUID(), title: 'In Progress', color: 'blue', cards: [] },
        { id: crypto.randomUUID(), title: 'Done', color: 'emerald', cards: [] },
      ];
    }
    if (type === 'callout') {
      newBlock.calloutType = 'info';
    }

    handleUpdateBlocks([...(activeDoc.content || []), newBlock]);
  };

  // Insert custom table grid
  const handleInsertTableGrid = (rows, cols) => {
    const headers = Array.from({ length: cols }, (_, i) => `Column ${i + 1}`);
    const rowData = Array.from({ length: rows }, () => Array.from({ length: cols }, () => ''));
    handleInsertBlock('table', { headers, rows: rowData });
  };

  // Clean empty blocks
  const handleCleanEmptyBlocks = () => {
    if (!activeDoc || !activeDoc.content) return;
    const cleaned = activeDoc.content.filter(
      (b) => (b.text && b.text.trim() !== '') || b.type === 'table' || b.type === 'board' || b.type === 'divider'
    );
    if (cleaned.length === 0) cleaned.push({ id: crypto.randomUUID(), type: 'paragraph', text: '' });
    handleUpdateBlocks(cleaned);
  };

  // Delete document
  const handleDeleteDoc = async (id) => {
    const activeId = activeDoc?._id || activeDoc?.id;
    const remaining = documents.filter((doc) => (doc._id || doc.id) !== id);
    dispatch(removeDocument(id));

    if (activeDoc && activeId === id) {
      if (remaining.length > 0) {
        loadDocument(remaining[0]._id || remaining[0].id);
      } else {
        dispatch(setActiveDoc(null));
      }
    }

    if (!isGuest) {
      try {
        await documentServices.delete(id);
      } catch (err) {
        console.error('Failed to delete document:', err);
        dispatch(setError('Failed to delete document from database.'));
        fetchAllDocs();
      }
    }
  };

  // Download docx
  const handleDownloadDocx = async () => {
    if (isGuest && openRegisterModal) {
      openRegisterModal();
      return;
    }
    if (!activeDoc) return;
    try {
      await exportToDocx(activeDoc.title, activeDoc.content || []);
    } catch (err) {
      console.error(err);
      alert('Failed to export .docx file.');
    }
  };

  // Print / Save as PDF — isolates only the clean document contents
  const printCanvasAsPDF = () => {
    if (!activeDoc) {
      alert('Nothing to print. Please open a document first.');
      return;
    }
    printDocument(activeDoc);
  };

  useEffect(() => {
    const handleGlobalKeyDown = (e) => {
      const isCtrl = e.ctrlKey || e.metaKey;

      if (isCtrl && e.key.toLowerCase() === 'z' && !e.shiftKey) {
        e.preventDefault();
        undo();
      } else if (isCtrl && (e.key.toLowerCase() === 'y' || (e.key.toLowerCase() === 'z' && e.shiftKey))) {
        e.preventDefault();
        redo();
      } else if (isCtrl && e.key.toLowerCase() === 's') {
        e.preventDefault();
        saveImmediate({});
      } else if (isCtrl && e.key.toLowerCase() === 'f') {
        e.preventDefault();
        setShowFindReplace(true);
      } else if (isCtrl && e.key.toLowerCase() === 'p') {
        e.preventDefault();
        printCanvasAsPDF();
      } else if (isCtrl && e.key.toLowerCase() === 'b') {
        e.preventDefault();
        handleFormatChange({ bold: !activeBlock?.style?.bold });
      } else if (isCtrl && e.key.toLowerCase() === 'i') {
        e.preventDefault();
        handleFormatChange({ italic: !activeBlock?.style?.italic });
      } else if (isCtrl && e.key.toLowerCase() === 'u') {
        e.preventDefault();
        handleFormatChange({ underline: !activeBlock?.style?.underline });
      }
    };

    window.addEventListener('keydown', handleGlobalKeyDown);
    return () => window.removeEventListener('keydown', handleGlobalKeyDown);
  });

  const activeBlock =
    (activeDoc?.content || []).find((b) => b.id === activeBlockId) ||
    (activeDoc?.content && activeDoc.content[0]) ||
    null;
  const wordStats = useWordStats(activeDoc?.title || '', activeDoc?.content || []);

  const handleHighlightBlock = (blockId) => {
    dispatch(setActiveBlockId(blockId));
    const element = document.getElementById(`doc-block-${blockId}`);
    if (element) {
      element.scrollIntoView({ behavior: 'smooth', block: 'center' });
      element.classList.add('ring-2', 'ring-blue-500', 'rounded');
      setTimeout(() => {
        element.classList.remove('ring-2', 'ring-blue-500');
      }, 1500);
    }
  };

  return (
    <div className="flex h-screen w-screen overflow-hidden bg-[#f3f2f1]">
      {/* Guest Register / Save Modal */}
      <GuestRegisterModal
        isOpen={isRegisterModalOpen}
        onClose={closeRegisterModal}
        currentDocTitle={activeDoc?.title || 'Untitled'}
        currentDocContent={activeDoc?.content || []}
      />

      {/* Find & Replace Floating Tool */}
      <FindReplaceModal
        blocks={activeDoc?.content || []}
        onUpdateBlocks={handleUpdateBlocks}
        onHighlightBlock={handleHighlightBlock}
      />

      {/* Keyboard Shortcuts Dialog */}
      <ShortcutsModal />

      {/* Sidebar Navigation */}
      <Sidebar
        documents={documents.map((d) => ({ ...d, id: d._id || d.id }))}
        activeDocId={activeDoc?._id || activeDoc?.id}
        user={user}
        isGuest={isGuest}
        onSelectDoc={handleSelectDoc}
        onCreateDoc={handleCreateDoc}
        onDeleteDoc={handleDeleteDoc}
        onLogout={logout}
        onTriggerAuth={openRegisterModal}
        isOpen={isSidebarOpen}
        onClose={() => dispatch(setSidebarOpen(false))}
        onToggle={() => dispatch(toggleSidebar())}
      />

      {/* Main Documents Workspace */}
      <main className="flex-1 flex flex-col h-screen overflow-hidden bg-[#edebe9] min-w-0">
        {loading ? (
          <div className="flex-1 flex flex-col items-center justify-center text-sm text-neutral-500 gap-3 bg-white">
            <Loader2 className="w-8 h-8 animate-spin text-blue-600" />
            <p className="font-medium">Loading Documents Workspace...</p>
          </div>
        ) : error ? (
          <div className="flex-1 flex flex-col items-center justify-center p-6 text-center bg-white">
            <div className="w-12 h-12 rounded-full bg-red-50 flex items-center justify-center text-red-500 mb-3">
              <AlertTriangle className="w-6 h-6" />
            </div>
            <h3 className="text-base font-semibold text-neutral-800 mb-1">Connection Issue</h3>
            <p className="text-sm text-neutral-500 max-w-md mb-4">{error}</p>
            <button
              type="button"
              onClick={fetchAllDocs}
              className="flex items-center gap-2 px-4 py-2 bg-neutral-900 text-white rounded-lg text-xs font-medium hover:bg-neutral-800 transition-colors shadow-sm cursor-pointer"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              <span>Retry</span>
            </button>
          </div>
        ) : activeDoc ? (
          <>
            {/* Google Docs Toolbar */}
            <GoogleDocsToolbar
              activeDoc={activeDoc}
              saveStatus={saveStatus}
              isGuest={isGuest}
              activeBlock={activeBlock}
              onTitleChange={handleTitleChange}
              onFormatChange={handleFormatChange}
              onTransformBlockType={handleTransformBlockType}
              onInsertBlock={handleInsertBlock}
              onInsertTableGrid={handleInsertTableGrid}
              onCleanEmptyBlocks={handleCleanEmptyBlocks}
              onSaveImmediate={() => saveImmediate({})}
              onDownloadDocx={handleDownloadDocx}
              onToggleSidebar={() => dispatch(toggleSidebar())}
              onGuestSavePrompt={openRegisterModal}
              onCreateDoc={handleCreateDoc}
              onSelectDoc={handleSelectDoc}
              onUndo={undo}
              onRedo={redo}
              canUndo={canUndo}
              canRedo={canRedo}
              onShare={() => {
                navigator.clipboard.writeText(window.location.href);
                alert('Document URL copied to clipboard!');
              }}
              onPrint={printCanvasAsPDF}
              wordCount={wordStats.wordCount}
            />

            {/* Horizontal Document Margin Ruler */}
            <DocumentRuler />

            {/* Middle Container: Document Outline Navigator + Scrollable Paper Canvas */}
            <div className="flex-1 flex overflow-hidden relative">
              {/* Document Outline Pane (Left) */}
              <DocumentOutline
                title={activeDoc.title}
                blocks={activeDoc.content || []}
                onSelectBlock={handleHighlightBlock}
              />

              {/* Scrollable Document Canvas (Paper Desk) */}
              <div className="flex-1 overflow-y-auto overflow-x-auto relative">
                {/* Main Word Paper Page Canvas */}
                <EditorCanvas
                  key={`canvas-${activeDoc._id || activeDoc.id}`}
                  blocks={activeDoc.content || []}
                  onUpdateBlocks={handleUpdateBlocks}
                  title={activeDoc.title}
                  onTitleChange={handleTitleChange}
                  onActiveBlockChange={(id) => dispatch(setActiveBlockId(id))}
                  onPageInfoChange={setPageInfo}
                />
              </div>
            </div>

            {/* Bottom Documents Status Bar & Zoom Slider */}
            <PageFooter
              wordCount={wordStats.wordCount}
              charCount={wordStats.charCount}
              pageCount={pageInfo.pageCount}
              currentPage={pageInfo.currentPage}
              saveStatus={saveStatus}
              onOpenStats={() => {}}
            />
          </>
        ) : (
          /* Empty Workspace State */
          <div className="flex-1 flex flex-col items-center justify-center text-neutral-400 gap-3 p-6 text-center bg-white">
            <div className="w-16 h-16 rounded-2xl bg-blue-50 text-blue-600 flex items-center justify-center text-3xl shadow-xs">
              📄
            </div>
            <div>
              <h3 className="text-base font-semibold text-neutral-800 mb-0.5">No document selected</h3>
              <p className="text-xs text-neutral-500">Create a new page or select one from the sidebar.</p>
            </div>
            <button
              type="button"
              onClick={handleCreateDoc}
              className="flex items-center gap-1.5 text-xs font-semibold text-white bg-blue-600 hover:bg-blue-700 px-4 py-2 rounded-lg transition-all shadow-sm active:scale-95 cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Create New Document</span>
            </button>
          </div>
        )}
      </main>
    </div>
  );
}

export default function WorkspacePage() {
  return (
    <EditorSettingsProvider>
      <WorkspaceContent />
    </EditorSettingsProvider>
  );
}
