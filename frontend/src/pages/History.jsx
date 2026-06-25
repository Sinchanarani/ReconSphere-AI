import { useEffect, useState } from 'react'
import { getHistory } from '../api/client'
import { CheckCircle, XCircle, Clock, RefreshCw } from 'lucide-react'

function ReconTypeBadge({ type }) {
  if (type === 'MISMATCH') return (
    <span className="flex items-center gap-1 text-xs bg-red-950 text-red-400 border border-red-800 px-2 py-0.5 rounded-full">
      <XCircle size={10} /> MISMATCH
    </span>
  )
  if (type === 'CLEAN') return (
    <span className="flex items-center gap-1 text-xs bg-green-950 text-green-400 border border-green-800 px-2 py-0.5 rounded-full">
      <CheckCircle size={10} /> CLEAN
    </span>
  )
  return (
    <span className="flex items-center gap-1 text-xs bg-gray-800 text-gray-400 border border-gray-700 px-2 py-0.5 rounded-full">
      <Clock size={10} /> {type}
    </span>
  )
}

export default function History() {
  const [history, setHistory]   = useState([])
  const [loading, setLoading]   = useState(true)
  const [filter, setFilter]     = useState('ALL')

  const fetchHistory = async () => {
    setLoading(true)
    try {
      const res = await getHistory()
      setHistory(res.data.history)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { fetchHistory() }, [])

  const filtered = filter === 'ALL'
    ? history
    : history.filter(h => h.recon_type === filter)

  // Group by snapshot for summary
  const snapSummary = history.reduce((acc, h) => {
    if (!acc[h.snapshot_name]) acc[h.snapshot_name] = { total: 0, mismatches: 0 }
    acc[h.snapshot_name].total++
    if (h.recon_type === 'MISMATCH') acc[h.snapshot_name].mismatches++
    return acc
  }, {})

  return (
    <div className="p-8">
      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold text-white">Run History</h1>
          <p className="text-gray-400 text-sm mt-1">
            All past reconciliation results from FINRECON_RESULT
          </p>
        </div>
        <button
          onClick={fetchHistory}
          disabled={loading}
          className="flex items-center gap-2 px-4 py-2 bg-gray-800 hover:bg-gray-700 border border-gray-700 rounded-lg text-sm text-gray-300 transition-colors"
        >
          <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
          Refresh
        </button>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-4 gap-3 mb-8">
        {Object.entries(snapSummary).map(([name, s]) => (
          <div key={name} className="bg-gray-900 border border-gray-800 rounded-xl p-4">
            <div className="text-xs font-mono text-gray-400 truncate mb-2">{name}</div>
            <div className="flex items-center justify-between">
              <div className="text-lg font-bold text-white">{s.total}</div>
              <div className={`text-xs px-2 py-0.5 rounded-full ${
                s.mismatches > 0
                  ? 'bg-red-950 text-red-400'
                  : 'bg-green-950 text-green-400'
              }`}>
                {s.mismatches > 0 ? `${s.mismatches} mismatch runs` : 'All clean'}
              </div>
            </div>
            <div className="text-xs text-gray-600 mt-1">{s.total} total runs</div>
          </div>
        ))}
      </div>

      {/* Filter tabs */}
      <div className="flex items-center gap-2 mb-4">
        {['ALL', 'MISMATCH', 'CLEAN'].map(f => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`px-4 py-1.5 rounded-lg text-xs font-medium transition-colors ${
              filter === f
                ? 'bg-blue-600 text-white'
                : 'bg-gray-800 text-gray-400 hover:text-white'
            }`}
          >
            {f} {f === 'ALL' ? `(${history.length})` : `(${history.filter(h => h.recon_type === f).length})`}
          </button>
        ))}
      </div>

      {/* History table */}
      {loading ? (
        <div className="space-y-2">
          {[...Array(8)].map((_, i) => (
            <div key={i} className="h-14 bg-gray-900 rounded-lg animate-pulse" />
          ))}
        </div>
      ) : (
        <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-800">
                <th className="px-4 py-3 text-left text-gray-400 font-medium">#</th>
                <th className="px-4 py-3 text-left text-gray-400 font-medium">Snapshot</th>
                <th className="px-4 py-3 text-left text-gray-400 font-medium">Status</th>
                <th className="px-4 py-3 text-left text-gray-400 font-medium">Result</th>
                <th className="px-4 py-3 text-left text-gray-400 font-medium">Run Time</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((row, i) => (
                <tr key={i} className="border-b border-gray-800 hover:bg-gray-800 transition-colors">
                  <td className="px-4 py-3 text-gray-600 text-xs">{i + 1}</td>
                  <td className="px-4 py-3">
                    <span className="font-mono text-xs text-white">{row.snapshot_name}</span>
                  </td>
                  <td className="px-4 py-3">
                    <ReconTypeBadge type={row.recon_type} />
                  </td>
                  <td className="px-4 py-3 text-xs text-gray-400 max-w-sm truncate">
                    {row.result_data}
                  </td>
                  <td className="px-4 py-3 text-xs text-gray-500 whitespace-nowrap">
                    {row.run_time}  
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}


