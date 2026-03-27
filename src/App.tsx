import { useState } from 'react';
import { useStore } from './store/useStore';
import { Sidebar } from './layout/Sidebar';
import { TabBar } from './layout/TabBar';
import { DashboardTab } from './pages/Dashboard';
import { AssumptionsPage } from './pages/Assumptions';
import { ResultsPage } from './pages/Results';
import { ScenariosPage } from './pages/Scenarios';
import { useKeyboardShortcuts } from './engine/useKeyboardShortcuts';
import chryselysLogo from './assets/chryselys-logo.svg';

function App() {
  useKeyboardShortcuts();
  const activeTab = useStore(s => s.activeTab);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);

  return (
    <>
      <Sidebar collapsed={sidebarCollapsed} onToggle={() => setSidebarCollapsed(!sidebarCollapsed)} />
      <main className="flex-1 min-h-screen overflow-y-auto">
        <div className="max-w-[1400px] mx-auto px-6 py-4">
          <div className="bg-[#004567] text-white px-5 py-3 rounded-lg mb-4 font-semibold shadow-md flex items-center gap-4 border-b-4 border-[#C98B27]">
            <img src={chryselysLogo} alt="Chryselys" className="h-12 w-auto" />
            <div>
              <div className="text-lg leading-tight">AccessLens</div>
              <div className="text-[10px] text-[#C6B78A] font-normal tracking-wider">Dynamic Multi-Year Gross-to-Net Analyzer</div>
            </div>
          </div>
          <TabBar />
          <div className="mt-2">
            {activeTab === 'dashboard' && <DashboardTab />}
            {activeTab === 'assumptions' && <AssumptionsPage />}
            {activeTab === 'results' && <ResultsPage />}
            {activeTab === 'scenarios' && <ScenariosPage />}
          </div>
        </div>
      </main>
    </>
  );
}

export default App;
