import { useState } from 'react';
import { useStore } from './store/useStore';
import { Sidebar } from './layout/Sidebar';
import { TabBar } from './layout/TabBar';
import { DashboardTab } from './pages/Dashboard';
import { AssumptionsPage } from './pages/Assumptions';
import { ResultsPage } from './pages/Results';
import { ScenariosPage } from './pages/Scenarios';
import { PortfolioDashboard } from './components/portfolio/PortfolioDashboard';
import { useKeyboardShortcuts } from './engine/useKeyboardShortcuts';
import chryselysLogo from './assets/chryselys-logo.png';

function App() {
  useKeyboardShortcuts();
  const activeTab = useStore(s => s.activeTab);
  const viewMode = useStore(s => s.viewMode);
  const setViewMode = useStore(s => s.setViewMode);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);

  return (
    <>
      <Sidebar collapsed={sidebarCollapsed} onToggle={() => setSidebarCollapsed(!sidebarCollapsed)} />
      <main className="flex-1 min-h-screen overflow-y-auto">
        <div className="max-w-[1400px] mx-auto px-6 py-4">
          <div className="bg-[#004567] text-white px-5 py-3 rounded-lg mb-4 font-semibold shadow-md flex items-center gap-4 border-b-4 border-[#C98B27]">
            <img src={chryselysLogo} alt="Chryselys" className="h-12 w-auto" />
            <div className="flex-1">
              <div className="text-lg leading-tight">AccessLens</div>
              <div className="text-[10px] text-[#C6B78A] font-normal tracking-wider">Dynamic Multi-Year Gross-to-Net Analyzer</div>
            </div>
            {/* View mode toggle */}
            <div className="flex gap-1 bg-white/10 rounded-lg p-0.5">
              <button onClick={() => setViewMode('brand')}
                className={`px-3 py-1.5 rounded-md text-xs font-semibold transition-all ${viewMode === 'brand' ? 'bg-white text-[#004567]' : 'text-white/70 hover:text-white'}`}>
                Brand View
              </button>
              <button onClick={() => setViewMode('portfolio')}
                className={`px-3 py-1.5 rounded-md text-xs font-semibold transition-all ${viewMode === 'portfolio' ? 'bg-white text-[#004567]' : 'text-white/70 hover:text-white'}`}>
                Portfolio View
              </button>
            </div>
          </div>

          {viewMode === 'brand' ? (
            <>
              <TabBar />
              <div className="mt-2">
                {activeTab === 'dashboard' && <DashboardTab />}
                {activeTab === 'assumptions' && <AssumptionsPage />}
                {activeTab === 'results' && <ResultsPage />}
                {activeTab === 'scenarios' && <ScenariosPage />}
              </div>
            </>
          ) : (
            <PortfolioDashboard />
          )}
        </div>
      </main>
    </>
  );
}

export default App;
