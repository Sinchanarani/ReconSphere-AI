import Configuration from './pages/Configuration'
import { BrowserRouter, Routes, Route, NavLink } from 'react-router-dom'
import Dashboard from './pages/Dashboard'
import MismatchExplorer from './pages/MismatchExplorer'
import History from './pages/History'
import SnapshotDetail from './pages/SnapshotDetail'
import AiAssistant from './pages/AiAssistant';
import { LayoutDashboard, SearchX, History as HistoryIcon, Settings , Sparkles} from 'lucide-react'

export default function App() {
  return (
    <BrowserRouter>
      <div className="min-h-screen bg-gray-950 text-gray-100 flex">

        {/* Sidebar */}
        <aside className="w-64 bg-gray-900 border-r border-gray-800 flex flex-col">
          {/* Logo */}
          <div className="px-6 py-6 border-b border-gray-800">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-lg bg-blue-600 flex items-center justify-center font-bold text-sm">
                FR
              </div>
              <div>
                <div className="font-semibold text-white text-sm">FinRecon</div>
                <div className="text-xs text-gray-500">Reconciliation Engine</div>
              </div>
            </div>
          </div>

          {/* Nav */}
          <nav className="flex-1 px-3 py-4 space-y-1">
            <NavLink to="/" end className={({ isActive }) =>
              `flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-colors ${
                isActive
                  ? 'bg-blue-600 text-white'
                  : 'text-gray-400 hover:bg-gray-800 hover:text-white'
              }`
            }>
              <LayoutDashboard size={16} />
              Dashboard
            </NavLink>
            {/* --- ADD THIS NEW LINK START --- */}
  <NavLink to="/ai-assistant" className={({ isActive }) =>
    `flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-colors ${
      isActive
        ? 'bg-blue-600 text-white'
        : 'text-gray-400 hover:bg-gray-800 hover:text-white'
    }`
  }>
    <Sparkles size={16} className="text-blue-400" />
    AI Assistant
  </NavLink>
  {/* --- ADD THIS NEW LINK END --- */}

            <NavLink to="/mismatch" className={({ isActive }) =>
              `flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-colors ${
                isActive
                  ? 'bg-blue-600 text-white'
                  : 'text-gray-400 hover:bg-gray-800 hover:text-white'
              }`
            }>
              <SearchX size={16} />
              Mismatch Explorer
            </NavLink>

            <NavLink to="/history" className={({ isActive }) =>
              `flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-colors ${
                isActive
                  ? 'bg-blue-600 text-white'
                  : 'text-gray-400 hover:bg-gray-800 hover:text-white'
              }`
            }>
              <HistoryIcon size={16} />
              Run History
            </NavLink>

            <NavLink to="/config" className={({ isActive }) =>
              `flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-colors ${
                isActive
                  ? 'bg-blue-600 text-white'
                  : 'text-gray-400 hover:bg-gray-800 hover:text-white'
              }`
            }>
              <Settings size={16} />
              Configuration
            </NavLink>
          </nav>

          {/* Footer */}
          <div className="px-6 py-4 border-t border-gray-800">
            <div className="text-xs text-gray-600">v1.0.0 · Oracle 19c</div>
          </div>
        </aside>

        {/* Main content */}
        <main className="flex-1 overflow-auto">
          <Routes>
            <Route path="/"         element={<Dashboard />} />
            <Route path="/mismatch" element={<MismatchExplorer />} />
            <Route path="/history"  element={<History />} />
            <Route path="/snapshot/:snapshotName" element={<SnapshotDetail />} />
            <Route path="/config"   element={<Configuration />} />
            <Route path="/ai-assistant" element={<AiAssistant />} />
          </Routes>
        </main>

      </div>
    </BrowserRouter>
  )
}