import { useEffect } from 'react';
import { useStore } from '../store/useStore';
import type { TabId } from '../types';

const TAB_MAP: Record<string, TabId> = {
  '1': 'dashboard',
  '2': 'assumptions',
  '3': 'results',
  '4': 'scenarios',
};

export function useKeyboardShortcuts() {
  const setActiveTab = useStore(s => s.setActiveTab);
  const saveScenario = useStore(s => s.saveScenario);
  const activeScenarioId = useStore(s => s.activeScenarioId);
  const scenarios = useStore(s => s.scenarios);
  const dirty = useStore(s => s.dirty);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const mod = e.metaKey || e.ctrlKey;
      if (!mod) return;

      // Ctrl+S: save scenario
      if (e.key === 's') {
        e.preventDefault();
        if (dirty && activeScenarioId && scenarios[activeScenarioId]) {
          const sc = scenarios[activeScenarioId];
          if (!sc.locked) {
            saveScenario(sc.name, sc.description, sc.tags);
          }
        }
        return;
      }

      // Ctrl+1-4: navigate
      const tab = TAB_MAP[e.key];
      if (tab) {
        e.preventDefault();
        setActiveTab(tab);
      }
    };

    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [setActiveTab, saveScenario, activeScenarioId, scenarios, dirty]);
}
