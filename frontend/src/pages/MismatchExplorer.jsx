import { useEffect, useState, useRef } from 'react'
import { getSnapshots, getMismatch, exportSnapshot } from '../api/client'
import { Download, Search, AlertTriangle, CheckCircle, ChevronDown, X } from 'lucide-react'

// ── Category config ───────────────────────────────────────────────────
const CATEGORY_STYLE = {
  VALUE_MISMATCH:  { bg: 'bg-red-900',    text: 'text-red-300',    border: 'border-red-700'    },
  NULL_MISMATCH:   { bg: 'bg-orange-900', text: 'text-orange-300', border: 'border-orange-700' },
  CASE_MISMATCH:   { bg: 'bg-yellow-900', text: 'text-yellow-300', border: 'border-yellow-700' },
  TRIM_MISMATCH:   { bg: 'bg-yellow-900', text: 'text-yellow-300', border: 'border-yellow-700' },
  FORMAT_MISMATCH: { bg: 'bg-blue-900',   text: 'text-blue-300',   border: 'border-blue-700'   },
  MATCH:           { bg: 'bg-green-900',  text: 'text-green-300',  border: 'border-green-700'  },
}

const CATEGORY_SHORT = {
  VALUE_MISMATCH:  'VALUE',
  NULL_MISMATCH:   'NULL',
  CASE_MISMATCH:   'CASE',
  TRIM_MISMATCH:   'TRIM',
  FORMAT_MISMATCH: 'FORMAT',
  MATCH:           'MATCH',
}

// ── Popover (fixed position, never overlaps) ──────────────────────
function Popover({ explanation, position, onClose }) {
  return (
    <div
      className="fixed z-50 w-72 bg-gray-800 border border-gray-600
                 rounded-xl shadow-2xl p-3"
      style={{ top: position.y + 12, left: position.x }}
    >
      <div className="flex items-start justify-between gap-2">
        <p className="text-xs text-gray-200 leading-relaxed">{explanation}</p>
        <button
          onClick={onClose}
          className="text-gray-500 hover:text-white mt-0.5 shrink-0"
        >
          <X size={12} />
        </button>
      </div>
      {/* Arrow pointing up */}
      <div className="absolute bottom-full left-6
                      border-4 border-transparent border-b-gray-600" />
    </div>
  )
}


// ── Category Badge ────────────────────────────────────────────────
function CategoryBadge({ category, explanation }) {
  const [popover, setPopover] = useState(null)
  const style = CATEGORY_STYLE[category] || CATEGORY_STYLE['VALUE_MISMATCH']
  const short = CATEGORY_SHORT[category] || category

  if (category === 'MATCH') {
    return (
      <span className="px-2 py-0.5 rounded-full text-xs font-medium
                       bg-green-900 text-green-300">
        MATCH
      </span>
    )
  }

  const handleClick = (e) => {
    if (popover) {
      setPopover(null)
      return
    }
    const rect = e.currentTarget.getBoundingClientRect()
    setPopover({
      x: Math.min(rect.left, window.innerWidth - 300),
      y: rect.bottom
    })
  }

  return (
    <div className="relative inline-block">
      <button
        onClick={handleClick}
        className={`px-2 py-0.5 rounded-full text-xs font-medium border
                    cursor-pointer hover:opacity-80 transition-opacity
                    ${style.bg} ${style.text} ${style.border}`}
      >
        {short} ⓘ
      </button>
      {popover && (
        <Popover
          explanation={explanation}
          position={popover}
          onClose={() => setPopover(null)}
        />
      )}
    </div>
  )
}

// ── Field Summary Bar ─────────────────────────────────────────────────
function FieldSummary({ fieldSummary, totalRows }) {
  if (!fieldSummary || Object.keys(fieldSummary).length === 0) return null

  const fields = Object.entries(fieldSummary).filter(([, cats]) =>
    Object.keys(cats).length > 0
  )
  if (fields.length === 0) return null

  return (
    <div className="bg-gray-900 border border-gray-800 rounded-xl p-5 mb-5">
      <div className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-4">
        Field-level Breakdown
      </div>
      <div className="space-y-3">
        {fields.map(([field, cats]) => {
          const total = Object.values(cats).reduce((a, b) => a + b, 0)
          const pct   = Math.round((total / totalRows) * 100)

          return (
            <div key={field}>
              <div className="flex items-center justify-between mb-1">
                <span className="text-xs font-mono text-gray-300">{field.toUpperCase()}</span>
                <div className="flex items-center gap-2">
                  {Object.entries(cats).map(([cat, count]) => {
                    const s = CATEGORY_STYLE[cat] || CATEGORY_STYLE['VALUE_MISMATCH']
                    return (
                      <span key={cat}
                        className={`text-xs px-1.5 py-0.5 rounded ${s.bg} ${s.text}`}>
                        {CATEGORY_SHORT[cat]}: {count}
                      </span>
                    )
                  })}
                  <span className="text-xs text-gray-500">{total} row{total > 1 ? 's' : ''}</span>
                </div>
              </div>
              {/* Progress bar */}
              <div className="h-1.5 bg-gray-800 rounded-full overflow-hidden">
                <div
                  className="h-full bg-red-500 rounded-full transition-all"
                  style={{ width: `${pct}%` }}
                />
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ── Main Page ─────────────────────────────────────────────────────────
export default function MismatchExplorer() {
  const [snapshots, setSnapshots] = useState([])
  const [selected, setSelected]   = useState('')
  const [data, setData]           = useState(null)
  const [loading, setLoading]     = useState(false)
  const [search, setSearch]       = useState('')
  const [error, setError]         = useState(null)

  useEffect(() => {
    getSnapshots().then(res => {
      const all         = res.data.snapshots
      const mismatched  = all.filter(s => s.recon_type === 'MISMATCH')
      setSnapshots(all)
      if (mismatched.length > 0) setSelected(mismatched[0].snapshot_name)
    })
  }, [])

  useEffect(() => {
    if (!selected) return
    setLoading(true)
    setError(null)
    setData(null)
    getMismatch(selected)
      .then(res => setData(res.data))
      .catch(e  => setError(e.response?.data?.detail || 'Failed to load mismatch data.'))
      .finally(() => setLoading(false))
  }, [selected])

  const handleExport = async (fmt) => {
    try {
      const res = await exportSnapshot(selected, fmt)
      const url = window.URL.createObjectURL(new Blob([res.data]))
      const a   = document.createElement('a')
      a.href    = url
      a.download= `FinRecon_${selected}.${fmt === 'csv' ? 'csv' : 'xlsx'}`
      a.click()
      window.URL.revokeObjectURL(url)
    } catch {
      alert('Export failed.')
    }
  }

  // Columns to show in table — hide _explanation columns (used in badge only)
  const visibleCols = data?.columns?.filter(c => !c.endsWith('_explanation')) ?? []

  // Filter rows by search
  const filteredRows = data?.rows?.filter(row =>
    Object.values(row).some(v =>
      String(v ?? '').toLowerCase().includes(search.toLowerCase())
    )
  ) ?? []

  return (
    <div className="p-8">
      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold text-white">Mismatch Explorer</h1>
          <p className="text-gray-400 text-sm mt-1">
            Drill into mismatched rows — click any category badge for details
          </p>
        </div>
        {data && data.total > 0 && (
          <div className="flex items-center gap-2">
            <button onClick={() => handleExport('excel')}
              className="flex items-center gap-2 px-4 py-2 bg-green-700 hover:bg-green-600 rounded-lg text-sm text-white transition-colors">
              <Download size={14} /> Export Excel
            </button>
            <button onClick={() => handleExport('csv')}
              className="flex items-center gap-2 px-4 py-2 bg-gray-700 hover:bg-gray-600 rounded-lg text-sm text-white transition-colors">
              <Download size={14} /> Export CSV
            </button>
          </div>
        )}
      </div>

      {/* Controls */}
      <div className="flex items-center gap-4 mb-5">
        <div className="relative">
          <select
            value={selected}
            onChange={e => setSelected(e.target.value)}
            className="appearance-none bg-gray-900 border border-gray-700 text-white text-sm
                       rounded-lg px-4 py-2.5 pr-10 focus:outline-none focus:border-blue-500"
          >
            <option value="">Select snapshot...</option>
            {snapshots.map(s => (
              <option key={s.snapshot_name} value={s.snapshot_name}>
                {s.snapshot_name} ({s.recon_type})
              </option>
            ))}
          </select>
          <ChevronDown size={14} className="absolute right-3 top-3.5 text-gray-400 pointer-events-none" />
        </div>

        <div className="relative flex-1 max-w-sm">
          <Search size={14} className="absolute left-3 top-3 text-gray-500" />
          <input
            type="text"
            placeholder="Search rows..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="w-full bg-gray-900 border border-gray-700 text-white text-sm
                       rounded-lg pl-9 pr-4 py-2.5 focus:outline-none focus:border-blue-500"
          />
        </div>

        {data && (
          <div className="text-sm text-gray-400">
            Showing <span className="text-white font-medium">{filteredRows.length}</span> of{' '}
            <span className="text-white font-medium">{data.total}</span> mismatched rows
          </div>
        )}
      </div>

      {/* Error */}
      {error && (
        <div className="mb-4 px-4 py-3 rounded-lg text-sm bg-red-950 border border-red-800
                        text-red-300 flex items-center gap-2">
          <AlertTriangle size={16} /> {error}
        </div>
      )}

      {/* Field summary */}
      {data && (
        <FieldSummary
          fieldSummary={data.field_summary}
          totalRows={data.total}
        />
      )}

      {/* Table */}
      {loading ? (
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-12 text-center text-gray-500">
          Loading mismatch data...
        </div>
      ) : data && data.total === 0 ? (
        <div className="bg-gray-900 border border-green-800 rounded-xl p-12 text-center">
          <CheckCircle className="mx-auto mb-3 text-green-400" size={40} />
          <div className="text-green-400 font-medium">No mismatches found</div>
          <div className="text-gray-500 text-sm mt-1">This snapshot is clean</div>
        </div>
      ) : data ? (
        <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-gray-800">
                  <th className="px-3 py-3 text-left text-gray-400 font-medium">#</th>
                  {visibleCols.map(col => (
                    <th key={col}
                      className={`px-3 py-3 text-left font-medium whitespace-nowrap ${
                        col.endsWith('_status') ? 'text-blue-400' : 'text-gray-400'
                      }`}>
                      {col.toUpperCase()}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filteredRows.map((row, i) => (
                  <tr key={i}
                    className="border-b border-gray-800 hover:bg-gray-800/50 transition-colors">
                    <td className="px-3 py-2.5 text-gray-600">{i + 1}</td>
                    {visibleCols.map(col => {
                      // Render category badge for _status columns
                      if (col.endsWith('_status')) {
                        const base        = col.slice(0, -7)
                        const explanation = row[`${base}_explanation`] ?? ''
                        return (
                          <td key={col} className="px-3 py-2.5">
                            <CategoryBadge
                              category={row[col]}
                              explanation={explanation}
                            />
                          </td>
                        )
                      }
                      // Regular value cell
                      const isNull = row[col] === null || row[col] === 'None'
                      return (
                        <td key={col} className="px-3 py-2.5 whitespace-nowrap">
                          <span className={isNull ? 'text-gray-600 italic' : 'text-gray-300'}>
                            {isNull ? 'null' : row[col]}
                          </span>
                        </td>
                      )
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : null}
    </div>
  )
}