import { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { getSnapshotDetail, exportSnapshot } from '../api/client'
import {
  ArrowLeft, CheckCircle, XCircle, Clock,
  Database, Key, Columns, Filter,
  Download, RefreshCw, TrendingUp
} from 'lucide-react'

// ── Reused from MismatchExplorer ──────────────────────────────────────
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

function StatusBadge({ type }) {
  if (type === 'MISMATCH') return (
    <span className="flex items-center gap-1.5 text-sm bg-red-950 text-red-400
                     border border-red-800 px-3 py-1 rounded-full">
      <XCircle size={14} /> MISMATCH
    </span>
  )
  if (type === 'MATCH') return (
    <span className="flex items-center gap-1.5 text-sm bg-green-950 text-green-400
                     border border-green-800 px-3 py-1 rounded-full">
      <CheckCircle size={14} /> CLEAN
    </span>
  )
  return (
    <span className="flex items-center gap-1.5 text-sm bg-gray-800 text-gray-400
                     border border-gray-700 px-3 py-1 rounded-full">
      <Clock size={14} /> PENDING
    </span>
  )
}

function CategoryBadge({ category }) {
  const style = CATEGORY_STYLE[category] || CATEGORY_STYLE['VALUE_MISMATCH']
  const short = CATEGORY_SHORT[category] || category
  if (category === 'MATCH') return (
    <span className="px-2 py-0.5 rounded-full text-xs font-medium
                     bg-green-900 text-green-300">
      MATCH
    </span>
  )
  return (
    <span className={`px-2 py-0.5 rounded-full text-xs font-medium border
                      ${style.bg} ${style.text} ${style.border}`}>
      {short}
    </span>
  )
}

// ── Config Card ───────────────────────────────────────────────────────
function ConfigCard({ icon: Icon, label, children }) {
  return (
    <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
      <div className="flex items-center gap-2 mb-3">
        <Icon size={14} className="text-blue-400" />
        <span className="text-xs font-semibold text-gray-400 uppercase tracking-wider">
          {label}
        </span>
      </div>
      {children}
    </div>
  )
}

// ── Stat Box ──────────────────────────────────────────────────────────
function StatBox({ label, value, color }) {
  return (
    <div className="bg-gray-900 border border-gray-800 rounded-xl p-5 text-center">
      <div className={`text-3xl font-bold mb-1 ${color}`}>{value ?? '—'}</div>
      <div className="text-xs text-gray-500">{label}</div>
    </div>
  )
}

// ── Field Summary ─────────────────────────────────────────────────────
function FieldSummary({ fieldSummary, totalRows }) {
  if (!fieldSummary || Object.keys(fieldSummary).length === 0) return null
  const fields = Object.entries(fieldSummary).filter(([, cats]) =>
    Object.keys(cats).length > 0
  )
  if (fields.length === 0) return null

  return (
    <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
      <div className="flex items-center gap-2 mb-4">
        <TrendingUp size={14} className="text-blue-400" />
        <span className="text-xs font-semibold text-gray-400 uppercase tracking-wider">
          Field-level Breakdown
        </span>
      </div>
      <div className="space-y-3">
        {fields.map(([field, cats]) => {
          const total = Object.values(cats).reduce((a, b) => a + b, 0)
          const pct   = totalRows ? Math.round((total / totalRows) * 100) : 0
          return (
            <div key={field}>
              <div className="flex items-center justify-between mb-1">
                <span className="text-xs font-mono text-gray-300">
                  {field.toUpperCase()}
                </span>
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
                  <span className="text-xs text-gray-500">{total} rows</span>
                </div>
              </div>
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
export default function SnapshotDetail() {
  const { snapshotName }      = useParams()
  const navigate              = useNavigate()
  const [detail, setDetail]   = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError]     = useState(null)

  const fetchDetail = async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await getSnapshotDetail(snapshotName)
      setDetail(res.data)
    } catch (e) {
      setError(e.response?.data?.detail || 'Failed to load snapshot detail.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { fetchDetail() }, [snapshotName])

  const handleExport = async (fmt) => {
    try {
      const res = await exportSnapshot(snapshotName, fmt)
      const url = window.URL.createObjectURL(new Blob([res.data]))
      const a   = document.createElement('a')
      a.href    = url
      a.download= `FinRecon_${snapshotName}.${fmt === 'csv' ? 'csv' : 'xlsx'}`
      a.click()
      window.URL.revokeObjectURL(url)
    } catch {
      alert('Export failed.')
    }
  }

  if (loading) return (
    <div className="p-8">
      <div className="animate-pulse space-y-4">
        <div className="h-8 bg-gray-800 rounded w-64" />
        <div className="h-32 bg-gray-800 rounded" />
        <div className="h-48 bg-gray-800 rounded" />
      </div>
    </div>
  )

  if (error) return (
    <div className="p-8">
      <button onClick={() => navigate('/')}
        className="flex items-center gap-2 text-gray-400 hover:text-white mb-6 text-sm">
        <ArrowLeft size={16} /> Back to Dashboard
      </button>
      <div className="bg-red-950 border border-red-800 text-red-300 rounded-xl p-6">
        {error}
      </div>
    </div>
  )

  const { config, mismatch_cols, mismatch_rows, field_summary } = detail
  const matchRate = config.total_count
  ? (config.matched_count / config.total_count * 100).toFixed(1)
  : null
  // Visible cols — hide _explanation columns
  const visibleCols = mismatch_cols.filter(c => !c.endsWith('_explanation'))

  return (
    <div className="p-8">

      {/* Back button */}
      <button
        onClick={() => navigate('/')}
        className="flex items-center gap-2 text-gray-400 hover:text-white
                   mb-6 text-sm transition-colors"
      >
        <ArrowLeft size={16} /> Back to Dashboard
      </button>

      {/* Page header */}
      <div className="flex items-start justify-between mb-8">
        <div>
          <div className="flex items-center gap-3 mb-2">
            <h1 className="text-2xl font-bold text-white font-mono">
              {config.snapshot_name}
            </h1>
            <StatusBadge type={config.recon_type} />
          </div>
          <div className="text-sm text-gray-400">
            Interface SK: <span className="text-gray-300">{config.interface_sk}</span>
            <span className="mx-2 text-gray-700">·</span>
            Last run: <span className="text-gray-300">{config.last_run ?? 'Never'}</span>
          </div>
          {config.comments && (
            <div className="text-sm text-gray-500 mt-1 max-w-2xl">
              {config.comments}
            </div>
          )}
        </div>

        {/* Action buttons */}
        <div className="flex items-center gap-2">
          <button
            onClick={fetchDetail}
            className="flex items-center gap-2 px-4 py-2 bg-gray-800 hover:bg-gray-700
                       border border-gray-700 rounded-lg text-sm text-gray-300 transition-colors"
          >
            <RefreshCw size={14} /> Refresh
          </button>
          {config.mismatch_count > 0 && (
            <>
              <button
                onClick={() => handleExport('excel')}
                className="flex items-center gap-2 px-4 py-2 bg-green-700 hover:bg-green-600
                           rounded-lg text-sm text-white transition-colors"
              >
                <Download size={14} /> Excel
              </button>
              <button
                onClick={() => handleExport('csv')}
                className="flex items-center gap-2 px-4 py-2 bg-gray-700 hover:bg-gray-600
                           rounded-lg text-sm text-white transition-colors"
              >
                <Download size={14} /> CSV
              </button>
            </>
          )}
        </div>
      </div>

      {/* Stat boxes */}
      <div className="grid grid-cols-4 gap-4 mb-8">
        <StatBox
          label="Total Source Records"
          value={config.total_count?.toLocaleString()}
          color="text-blue-400"
        />
        <StatBox
          label="Mismatched Rows"
          value={config.mismatch_count}
          color={config.mismatch_count > 0 ? 'text-red-400' : 'text-green-400'}
        />
        <StatBox
          label="Matched Rows"
          value={config.matched_count?.toLocaleString()}
          color="text-green-400"
        />
        <StatBox
          label="Match Rate"
          value={matchRate ? `${matchRate}%` : null}
          color={matchRate >= 99 ? 'text-green-400' : 'text-yellow-400'}
        />
      </div>

      {/* Config grid */}
      <div className="grid grid-cols-2 gap-4 mb-6">

        {/* Source & Target */}
        <ConfigCard icon={Database} label="Tables">
          <div className="space-y-2">
            <div className="flex items-start gap-3">
              <span className="text-xs text-gray-600 w-12 shrink-0 mt-0.5">SRC</span>
              <span className="font-mono text-xs text-blue-300">{config.src_table}</span>
            </div>
            <div className="flex items-start gap-3">
              <span className="text-xs text-gray-600 w-12 shrink-0 mt-0.5">TGT</span>
              <span className="font-mono text-xs text-purple-300">{config.tgt_table}</span>
            </div>
          </div>
        </ConfigCard>

        {/* PK Fields */}
        <ConfigCard icon={Key} label="Primary Key Fields">
          <div className="flex flex-wrap gap-2">
            {config.pk_fields_list.length > 0
              ? config.pk_fields_list.map(f => (
                  <span key={f}
                    className="px-2 py-1 bg-gray-800 border border-gray-700
                               rounded text-xs font-mono text-yellow-300">
                    {f}
                  </span>
                ))
              : <span className="text-xs text-gray-600">None configured</span>
            }
          </div>
        </ConfigCard>

        {/* Comparing Fields */}
        <ConfigCard icon={Columns} label="Comparing Fields">
          <div className="flex flex-wrap gap-2">
            {config.comparing_fields_list.length > 0
              ? config.comparing_fields_list.map((f, idx) => (
                  <span key={f}
                    className="px-2 py-1 bg-gray-800 border border-gray-700
                               rounded text-xs font-mono text-gray-300">
                    {f}
                    {config.field_types_list[idx] && (
                      <span className="text-gray-600 ml-1">
                        ({config.field_types_list[idx]})
                      </span>
                    )}
                  </span>
                ))
              : <span className="text-xs text-gray-600">None configured</span>
            }
          </div>
        </ConfigCard>

        {/* Where Clauses */}
        <ConfigCard icon={Filter} label="Where Clauses">
          <div className="space-y-2">
            {config.src_where_clause ? (
              <div>
                <span className="text-xs text-gray-600">SRC: </span>
                <span className="font-mono text-xs text-gray-300">
                  {config.src_where_clause}
                </span>
              </div>
            ) : null}
            {config.tgt_where_clause ? (
              <div>
                <span className="text-xs text-gray-600">TGT: </span>
                <span className="font-mono text-xs text-gray-300">
                  {config.tgt_where_clause}
                </span>
              </div>
            ) : null}
            {!config.src_where_clause && !config.tgt_where_clause && (
              <span className="text-xs text-gray-600">No filters applied</span>
            )}
          </div>
        </ConfigCard>
      </div>

      {/* Field summary */}
      {field_summary && Object.keys(field_summary).length > 0 && (
        <div className="mb-6">
          <FieldSummary
            fieldSummary={field_summary}
            totalRows={config.mismatch_count || 0}
          />
        </div>
      )}

      {/* Mismatch rows preview */}
      {mismatch_rows && mismatch_rows.length > 0 ? (
        <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden mb-6">
          <div className="flex items-center justify-between px-5 py-4 border-b border-gray-800">
            <div className="text-xs font-semibold text-gray-400 uppercase tracking-wider">
              Mismatch Preview
              <span className="ml-2 text-gray-600 font-normal normal-case">
                (showing top {mismatch_rows.length} of {config.mismatch_count} rows)
              </span>
            </div>
            <button
              onClick={() => navigate('/mismatch', {
                state: { snapshot: config.snapshot_name }
              })}
              className="text-xs text-blue-400 hover:text-blue-300 transition-colors"
            >
              View all in Explorer →
            </button>
          </div>
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
                {mismatch_rows.map((row, i) => (
                  <tr key={i}
                    className="border-b border-gray-800 hover:bg-gray-800/50 transition-colors">
                    <td className="px-3 py-2.5 text-gray-600">{i + 1}</td>
                    {visibleCols.map(col => {
                      if (col.endsWith('_status')) {
                        return (
                          <td key={col} className="px-3 py-2.5">
                            <CategoryBadge category={row[col]} />
                          </td>
                        )
                      }
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
      ) : config.mismatch_count === 0 ? (
        <div className="bg-gray-900 border border-green-800 rounded-xl p-12 text-center mb-6">
          <CheckCircle className="mx-auto mb-3 text-green-400" size={40} />
          <div className="text-green-400 font-medium">No mismatches found</div>
          <div className="text-gray-500 text-sm mt-1">This snapshot is clean</div>
        </div>
      ) : null}

      {/* Run history */}
      {config.run_history && config.run_history.length > 0 && (
        <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
          <div className="px-5 py-4 border-b border-gray-800">
            <span className="text-xs font-semibold text-gray-400 uppercase tracking-wider">
              Recent Run History
            </span>
          </div>
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-gray-800">
                <th className="px-4 py-3 text-left text-gray-400 font-medium">#</th>
                <th className="px-4 py-3 text-left text-gray-400 font-medium">Status</th>
                <th className="px-4 py-3 text-left text-gray-400 font-medium">Result</th>
                <th className="px-4 py-3 text-left text-gray-400 font-medium">Run Time</th>
              </tr>
            </thead>
            <tbody>
              {config.run_history.map((h, i) => (
                <tr key={i}
                  className="border-b border-gray-800 hover:bg-gray-800/50 transition-colors">
                  <td className="px-4 py-3 text-gray-600">{i + 1}</td>
                  <td className="px-4 py-3">
                    <StatusBadge type={h.recon_type} />
                  </td>
                  <td className="px-4 py-3 text-gray-400 max-w-sm truncate">
                    {h.result_data}
                  </td>
                  <td className="px-4 py-3 text-gray-500 whitespace-nowrap">
                    {h.run_time}
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