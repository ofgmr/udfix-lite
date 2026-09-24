import React, { useEffect } from 'react';
import MainLayout from './components/layout/MainLayout';
import { useThemeStore } from './stores/useThemeStore';
import { useHeaderFooterStore } from './stores/useHeaderFooterStore';
import { Toaster } from './components/ui/sonner';
import { TelemetryConsentDialog } from './components/telemetry/TelemetryConsentDialog';
import { AppUpdateNotifier } from './components/update/AppUpdateNotifier';
import { UniversalViewer } from './components/viewer/UniversalViewer';

const ThemeInitializer: React.FC = () => {
  const { applyTheme, mode } = useThemeStore();

  useEffect(() => {
    void useHeaderFooterStore.getState().loadAllPresets();
  }, []);

  useEffect(() => {
    applyTheme();

    // Keep in sync with system preference
    if (mode !== 'system') return;
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const handler = () => applyTheme();
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  }, [applyTheme, mode]);

  return null;
};

const App: React.FC = () => {
  const urlParams = new URLSearchParams(window.location.search);
  const viewFilePath = urlParams.get('view-file-path');
  const viewFileName = urlParams.get('view-file-name');

  if (viewFilePath) {
    return (
      <div className="h-screen w-screen overflow-hidden bg-white">
        <ThemeInitializer />
        <UniversalViewer fileUrl={viewFilePath} fileName={viewFileName || ''} />
        <AppUpdateNotifier />
        <Toaster richColors closeButton position="bottom-right" />
      </div>
    );
  }

  return (
    <>
      <ThemeInitializer />
      <MainLayout />
      <TelemetryConsentDialog />
      <AppUpdateNotifier />
      <Toaster richColors closeButton position="bottom-right" />
    </>
  );
};

export default App;
