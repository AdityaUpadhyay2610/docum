import { Suspense, lazy } from 'react';
import { AuthProvider, useAuth } from './context/AuthContext';
import { VaultProvider } from './context/VaultContext';
import ErrorBoundary from './components/common/ErrorBoundary';
import { Loader2 } from 'lucide-react';
import AuthPage from './pages/AuthPage';

const WorkspacePage = lazy(() => import('./pages/WorkspacePage'));
const VerifyEmailPage = lazy(() => import('./pages/VerifyEmailPage'));

function AppContent() {
  const { isAuthenticated, isGuest, loading } = useAuth();
  const isVerifyEmail = typeof window !== 'undefined' && window.location.pathname.startsWith('/verify-email');

  if (isVerifyEmail) {
    return (
      <Suspense fallback={
        <div className="h-screen w-screen flex flex-col items-center justify-center bg-neutral-900 text-neutral-300 gap-3">
          <Loader2 className="w-8 h-8 animate-spin text-blue-500" />
          <p className="text-xs font-medium tracking-wide">Loading Verification...</p>
        </div>
      }>
        <VerifyEmailPage />
      </Suspense>
    );
  }

  if (loading) {
    return (
      <div className="h-screen w-screen flex flex-col items-center justify-center bg-neutral-900 text-neutral-300 gap-3">
        <Loader2 className="w-8 h-8 animate-spin text-blue-500" />
        <p className="text-xs font-medium tracking-wide">Loading Workspace...</p>
      </div>
    );
  }

  return (
    <Suspense fallback={
      <div className="h-screen w-screen flex flex-col items-center justify-center bg-neutral-900 text-neutral-300 gap-3">
        <Loader2 className="w-8 h-8 animate-spin text-blue-500" />
        <p className="text-xs font-medium tracking-wide">Loading Page...</p>
      </div>
    }>
      {isAuthenticated || isGuest ? <WorkspacePage /> : <AuthPage />}
    </Suspense>
  );
}

export default function App() {
  return (
    <ErrorBoundary>
      <AuthProvider>
        <VaultProvider>
          <AppContent />
        </VaultProvider>
      </AuthProvider>
    </ErrorBoundary>
  );
}
