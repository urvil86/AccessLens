import { useState } from 'react';
import { useStore } from './store/useStore';
import { Sidebar } from './layout/Sidebar';
import { TabBar } from './layout/TabBar';
import { DashboardTab } from './pages/Dashboard';
import { AssumptionsPage } from './pages/Assumptions';
import { ResultsPage } from './pages/Results';
import { ScenariosPage } from './pages/Scenarios';
import { PortfolioDashboard } from './components/portfolio/PortfolioDashboard';
import { CustomerForecastPage } from './components/customers/CustomerForecastPage';
import { useKeyboardShortcuts } from './engine/useKeyboardShortcuts';
import chryselysLogo from './assets/chryselys-logo.png';

function App() {
  useKeyboardShortcuts();
  const activeTab = useStore(s => s.activeTab);
  const viewMode = useStore(s => s.viewMode);
  const setViewMode = useStore(s => s.setViewMode);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);

  const viewModes = [
    { key: 'brand' as const, label: 'Brand View' },
    { key: 'portfolio' as const, label: 'Portfolio View' },
    { key: 'customers' as const, label: 'Customers' },
  ];

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
              {viewModes.map(vm => (
                <button key={vm.key} onClick={() => setViewMode(vm.key)}
                  className={`px-3 py-1.5 rounded-md text-xs font-semibold transition-all ${viewMode === vm.key ? 'bg-white text-[#004567]' : 'text-white/70 hover:text-white'}`}>
                  {vm.label}
                </button>
              ))}
            </div>
          </div>

          {viewMode === 'brand' && (
            <>
              <TabBar />
              <div className="mt-2">
                {activeTab === 'dashboard' && <DashboardTab />}
                {activeTab === 'assumptions' && <AssumptionsPage />}
                {activeTab === 'results' && <ResultsPage />}
                {activeTab === 'scenarios' && <ScenariosPage />}
              </div>
            </>
          )}
          {viewMode === 'portfolio' && <PortfolioDashboard />}
          {viewMode === 'customers' && <CustomerForecastPage />}
        </div>
      </main>
    </>
  );
}

export default App;
