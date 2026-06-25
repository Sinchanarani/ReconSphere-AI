import { useEffect, useState } from 'react'
import { getSnapshots, runFullRecon, runReconBySk } from '../api/client'
import {
  CheckCircle, XCircle, Clock, Play, RefreshCw,
  Database, AlertTriangle, Zap
} from 'lucide-react'
import { useNavigate } from 'react-router-dom'

function StatCard({ label, value, icon: Icon, color }) {
  return (
    <div className="bg-gray-900 border border-gray-800 rounded-xl p-5 flex items-center gap-4">
      <div className={`w-12 h-12 rounded-lg flex items-center justify-center ${color}`}>
        <Icon size={22} />
      </div>
      <div>
        <div className="text-2xl font-bold text-white">{value}</div>
        <div className="text-sm text-gray-400">{label}</div>
      </div>
    </div>
  )
}

function SnapshotCard({ snap, onRunSingle }) {
  const navigate   = useNavigate()
  const isMismatch = snap.recon_type === 'MISMATCH'
  const isClean    = snap.recon_type === 'MATCH'

  return (
    <div
      onClick={() => navigate(`/snapshot/${snap.snapshot_name}`)}
      className={`bg-gray-900 border rounded-xl p-5 transition-all cursor-pointer
                  hover:border-gray-500 hover:scale-[1.01] ${
        isMismatch ? 'border-red-800' :
        isClean    ? 'border-green-800' :
                     'border-gray-800'
      }`}
    >
      {/* Header */}
      <div className="flex items-start justify-between mb-3">
        <div>
          <div className="font-semibold text-white text-sm">{snap.snapshot_name}</div>
          <div className="text-xs text-gray-500 mt-0.5">SK: {snap.interface_sk}</div>
        </div>
        <StatusBadge type={snap.recon_type} />
      </div>

      {/* Tables */}
      <div className="space-y-1 mb-3">
        <div className="flex items-center gap-2 text-xs text-gray-400">
          <span className="text-gray-600">SRC</span>
          <span className="font-mono truncate">{snap.src_table}</span>
        </div>
        <div className="flex items-center gap-2 text-xs text-gray-400">
          <span className="text-gray-600">TGT</span>
          <span className="font-mono truncate">{snap.tgt_table}</span>
        </div>
      </div>

      {/* Result */}
      <div className="text-xs text-gray-400 bg-gray-800 rounded-lg px-3 py-2 mb-3 min-h-8">
        {snap.result_data}
      </div>

      {/* Footer */}
      <div className="flex items-center justify-between">
        <div className="text-xs text-gray-600">
          {snap.last_run ? `Last run: ${snap.last_run}` : 'Never run'}
        </div>
        <button
          onClick={(e) => {
            e.stopPropagation() // prevent card click when clicking Run
            onRunSingle(snap.interface_sk, snap.snapshot_name)
          }}
          className="text-xs text-blue-400 hover:text-blue-300
                     flex items-center gap-1 transition-colors"
        >
          <Zap size={12} />
          Run
        </button>
      </div>
    </div>
  )
}

function StatusBadge({ type }) {
  if (type === 'MISMATCH') return (
    <span className="flex items-center gap-1 text-xs bg-red-950 text-red-400 border border-red-800 px-2 py-0.5 rounded-full">
      <XCircle size={11} /> MISMATCH
    </span>
  )
  if (type === 'MATCH') return (
    <span className="flex items-center gap-1 text-xs bg-green-950 text-green-400 border border-green-800 px-2 py-0.5 rounded-full">
      <CheckCircle size={11} /> CLEAN
    </span>
  )
  return (
    <span className="flex items-center gap-1 text-xs bg-gray-800 text-gray-400 border border-gray-700 px-2 py-0.5 rounded-full">
      <Clock size={11} /> PENDING
    </span>
  )
}

export default function Dashboard() {
  const [snapshots, setSnapshots]   = useState([])
  const [loading, setLoading]       = useState(true)
  const [running, setRunning]       = useState(false)
  const [runMsg, setRunMsg]         = useState(null)
  const [error, setError]           = useState(null)

  const fetchSnapshots = async () => {
    try {
      setLoading(true)
      const res = await getSnapshots()
      setSnapshots(res.data.snapshots)
      setError(null)
    } catch (e) {
      setError('Failed to load snapshots. Is the backend running?')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { fetchSnapshots() }, [])

  const handleFullRun = async () => {
    setRunning(true)
    setRunMsg(null)
    try {
      const res = await runFullRecon()
      setRunMsg({ type: 'success', text: res.data.message })
      await fetchSnapshots()
    } catch (e) {
      setRunMsg({ type: 'error', text: e.response?.data?.detail || 'Reconciliation failed.' })
    } finally {
      setRunning(false)
    }
  }

  const handleSingleRun = async (sk, name) => {
    setRunning(true)
    setRunMsg(null)
    try {
      const res = await runReconBySk(sk)
      setRunMsg({ type: 'success', text: res.data.message })
      await fetchSnapshots()
    } catch (e) {
      setRunMsg({ type: 'error', text: e.response?.data?.detail || `Failed to run ${name}.` })
    } finally {
      setRunning(false)
    }
  }

  // Stats
  const total    = snapshots.length
  const mismatches = snapshots.filter(s => s.recon_type === 'MISMATCH').length
  const clean    = snapshots.filter(s => s.recon_type === 'MATCH').length
  const pending  = snapshots.filter(s => s.recon_type === 'PENDING').length

  return (
    <div className="p-8">
      {/* Page header */}
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold text-white">Dashboard</h1>
          <p className="text-gray-400 text-sm mt-1">
            Overview of all reconciliation snapshots
          </p>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={fetchSnapshots}
            disabled={loading}
            className="flex items-center gap-2 px-4 py-2 bg-gray-800 hover:bg-gray-700 border border-gray-700 rounded-lg text-sm text-gray-300 transition-colors disabled:opacity-50"
          >
            <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
            Refresh
          </button>
          <button
            onClick={handleFullRun}
            disabled={running}
            className="flex items-center gap-2 px-5 py-2 bg-blue-600 hover:bg-blue-500 rounded-lg text-sm text-white font-medium transition-colors disabled:opacity-50"
          >
            <Play size={14} className={running ? 'animate-pulse' : ''} />
            {running ? 'Running...' : 'Run Full Recon'}
          </button>
        </div>
      </div>

      {/* Run message */}
      {runMsg && (
        <div className={`mb-6 px-4 py-3 rounded-lg text-sm flex items-center gap-2 ${
          runMsg.type === 'success'
            ? 'bg-green-950 border border-green-800 text-green-300'
            : 'bg-red-950 border border-red-800 text-red-300'
        }`}>
          {runMsg.type === 'success' ? <CheckCircle size={16} /> : <AlertTriangle size={16} />}
          {runMsg.text}
        </div>
      )}

      {/* Error */}
      {error && (
        <div className="mb-6 px-4 py-3 rounded-lg text-sm bg-red-950 border border-red-800 text-red-300">
          {error}
        </div>
      )}

      {/* Stat cards */}
      <div className="grid grid-cols-4 gap-4 mb-8">
        <StatCard label="Total Snapshots"  value={total}     icon={Database}      color="bg-blue-900 text-blue-400" />
        <StatCard label="Mismatches Found" value={mismatches} icon={XCircle}      color="bg-red-900 text-red-400" />
        <StatCard label="Clean"            value={clean}      icon={CheckCircle}  color="bg-green-900 text-green-400" />
        <StatCard label="Pending"          value={pending}    icon={Clock}        color="bg-yellow-900 text-yellow-400" />
      </div>

      {/* Snapshot grid */}
      {loading ? (
        <div className="grid grid-cols-3 gap-4">
          {[...Array(6)].map((_, i) => (
            <div key={i} className="bg-gray-900 border border-gray-800 rounded-xl p-5 animate-pulse h-48" />
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-3 gap-4">
          {snapshots.map(snap => (
            <SnapshotCard
              key={snap.snapshot_name}
              snap={snap}
              onRunSingle={handleSingleRun}
            />
          ))}
        </div>
      )}
    </div>
  )
}