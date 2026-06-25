import { useState, useEffect } from 'react'
import {
  getSchemas, getTables, getColumns, getPrimaryKeys,
  createConfig
} from '../api/client'

const EMPTY_FORM = {
  snapshot_name: '',
  src_schema: '',
  src_table_name: '',
  tgt_schema: '',
  tgt_table_name: '',
  src_pk_fields: '',
  tgt_pk_fields: '',
  src_comparing_fields: '',
  tgt_comparing_fields: '',
  src_comparing_field_type: '',
  tgt_comparing_field_type: '',

  // ✅ ADDED
  src_where_clause: '',
  tgt_where_clause: ''
}

export default function Configuration() {
  const [form, setForm] = useState(EMPTY_FORM)

  const [schemas, setSchemas] = useState([])
  const [srcTables, setSrcTables] = useState([])
  const [tgtTables, setTgtTables] = useState([])

  const [columns, setColumns] = useState([])
  const [tgtColumns, setTgtColumns] = useState([])

  const [selectedCols, setSelectedCols] = useState([])
  const [mapping, setMapping] = useState({})

  // ───────── LOAD SCHEMAS ─────────
  useEffect(() => {
    getSchemas().then(res => setSchemas(res.data.schemas))
  }, [])

  // ───────── LOAD TABLES ─────────
  useEffect(() => {
    if (form.src_schema) {
      getTables(form.src_schema).then(res => setSrcTables(res.data.tables))
    }
  }, [form.src_schema])

  useEffect(() => {
    if (form.tgt_schema) {
      getTables(form.tgt_schema).then(res => setTgtTables(res.data.tables))
    }
  }, [form.tgt_schema])

  // ───────── LOAD SRC COLUMNS + PK ─────────
  useEffect(() => {
    if (form.src_schema && form.src_table_name) {

      getColumns(form.src_schema, form.src_table_name)
        .then(res => setColumns(res.data.columns))

      getPrimaryKeys(form.src_schema, form.src_table_name)
        .then(res => {
          const pk = res.data.primary_keys?.join('~') || ''
          setForm(f => ({
            ...f,
            src_pk_fields: pk,
            //tgt_pk_fields: f.tgt_pk_fields || pk   // ✅ FIX
          }))
        })
    }
  }, [form.src_schema, form.src_table_name])

  useEffect(() => {
  if (form.tgt_schema && form.tgt_table_name) {
    getPrimaryKeys(form.tgt_schema, form.tgt_table_name)
      .then(res => {
        const pk = res.data.primary_keys.join('~')

        setForm(f => ({
          ...f,
          tgt_pk_fields: pk
        }))
      })
  }
}, [form.tgt_schema, form.tgt_table_name])

useEffect(() => {
  if (!form.tgt_table_name) {
    setForm(f => ({
      ...f,
      tgt_pk_fields: ''
    }))
  }
}, [form.tgt_table_name])
  // ───────── LOAD TARGET COLUMNS ─────────
  useEffect(() => {
    if (form.tgt_schema && form.tgt_table_name) {
      getColumns(form.tgt_schema, form.tgt_table_name)
        .then(res => setTgtColumns(res.data.columns))
    }
  }, [form.tgt_schema, form.tgt_table_name])

  const handleChange = (k, v) => {
    setForm(f => ({ ...f, [k]: v }))
  }

  // ───────── MATCHING LOGIC ─────────
  const suggestMatch = (srcCol) => {
    if (!tgtColumns.length) return ''

    const src = srcCol.toLowerCase()

    let match = tgtColumns.find(c => c.column.toLowerCase() === src)
    if (match) return match.column

    match = tgtColumns.find(c =>
      c.column.toLowerCase().includes(src)
    )
    if (match) return match.column

    return ''
  }

  // ───────── COLUMN SELECTION ─────────
  const toggleColumn = (col) => {
    setSelectedCols(prev => {
      const exists = prev.find(c => c.column === col.column)

      if (exists) {
        setMapping(m => {
          const newMap = { ...m }
          delete newMap[col.column]
          return newMap
        })
        return prev.filter(c => c.column !== col.column)
      } else {
        const suggestion = suggestMatch(col.column)

        setMapping(m => ({
          ...m,
          [col.column]: suggestion
        }))

        return [...prev, col]
      }
    })
  }

  // ───────── SUBMIT ─────────
  const handleSubmit = async () => {
    if (!form.snapshot_name) {
      alert("Snapshot name required")
      return
    }

    if (selectedCols.length === 0) {
      alert("Select at least one column")
      return
    }

    const srcFields = selectedCols.map(c => c.column).join('~')
    const tgtFields = selectedCols.map(c => mapping[c.column] || c.column).join('~')

    const srcTypes = selectedCols.map(c => c.type).join('~')
    const tgtTypes = selectedCols.map(c => {
      const tgt = tgtColumns.find(tc => tc.column === mapping[c.column])
      return tgt ? tgt.type : c.type
    }).join('~')

    const payload = {
      snapshot_name: form.snapshot_name,

      src_schema: form.src_schema,
      src_table_name: form.src_table_name,
      tgt_schema: form.tgt_schema,
      tgt_table_name: form.tgt_table_name,

      src_pk_fields: form.src_pk_fields,
      tgt_pk_fields: form.tgt_pk_fields,

      src_comparing_fields: srcFields,
      tgt_comparing_fields: tgtFields,

      src_comparing_field_type: srcTypes,
      tgt_comparing_field_type: tgtTypes,

      // ✅ ADDED (NO LOGIC CHANGE)
      src_where_clause: form.src_where_clause || null,
      tgt_where_clause: form.tgt_where_clause || null,

      comments: 'Guided Mapping UI'
    }

    try {
      await createConfig(payload)
      alert("✅ Snapshot created successfully")
      setForm(EMPTY_FORM)
      setSelectedCols([])
      setMapping({})
    } catch (e) {
      alert(e.response?.data?.detail || "Error creating snapshot")
    }
  }

  return (
    <div className="p-6 text-white space-y-6">

      <h1 className="text-xl font-bold">Create Configuration</h1>

      {/* SNAPSHOT NAME */}
      <input
        placeholder="Snapshot Name"
        value={form.snapshot_name}
        onChange={e => handleChange('snapshot_name', e.target.value)}
        className="w-full bg-gray-900 border border-gray-700 px-3 py-2 rounded"
      />

      {/* SOURCE */}
      <div className="grid grid-cols-2 gap-4">
        

        <div>
  <label className="block text-sm text-gray-400 mb-1">
    Source Schema
  </label>

  <select
    value={form.src_schema}
    onChange={(e) => handleChange('src_schema', e.target.value)}
    className="w-full bg-gray-900 border border-gray-700 text-sm rounded-lg px-3 py-2"
  >
    <option value="">Select Source Schema</option>
    {schemas.map(s => (
      <option key={s} value={s}>{s}</option>
    ))}
  </select>
</div>

        <div>
  <label className="block text-sm text-gray-400 mb-1">
    Source Table
  </label>

  <select
    value={form.src_table_name}
    onChange={(e) => handleChange('src_table_name', e.target.value)}
    className="w-full bg-gray-900 border border-gray-700 text-sm rounded-lg px-3 py-2"
  >
    <option value="">Select Source Table</option>
    {srcTables.map(t => (
      <option key={t} value={t}>{t}</option>
    ))}
  </select>
</div>

        <div>
  <label className="block text-sm text-gray-400 mb-1">
    Primary Key (auto/manual)
  </label>

  <input
    value={form.src_pk_fields}
    onChange={(e) => handleChange('src_pk_fields', e.target.value)}
    className="w-full bg-gray-900 border border-gray-700 text-sm rounded-lg px-3 py-2"
  />
</div>

        <div>
  <label className="block text-sm text-gray-400 mb-1">
    Source WHERE clause (optional)
  </label>

  <input
    placeholder="e.g. ID = 10"
    value={form.src_where_clause}
    onChange={(e) => handleChange('src_where_clause', e.target.value)}
    className="w-full bg-gray-900 border border-gray-700 text-sm rounded-lg px-3 py-2"
  />
</div>
      </div>

      {/* TARGET */}
      <div className="grid grid-cols-2 gap-4">

        <div>
  <label className="block text-sm text-gray-400 mb-1">
    Target Schema
  </label>

  <select
    value={form.tgt_schema}
    onChange={(e) => handleChange('tgt_schema', e.target.value)}
    className="w-full bg-gray-900 border border-gray-700 text-sm rounded-lg px-3 py-2"
  >
    <option value="">Select Target Schema</option>
    {schemas.map(s => (
      <option key={s} value={s}>{s}</option>
    ))}
  </select>
</div>

        <div>
  <label className="block text-sm text-gray-400 mb-1">
    Target Table
  </label>

  <select
    value={form.tgt_table_name}
    onChange={(e) => handleChange('tgt_table_name', e.target.value)}
    className="w-full bg-gray-900 border border-gray-700 text-sm rounded-lg px-3 py-2"
  >
    <option value="">Select Target Table</option>
    {tgtTables.map(t => (
      <option key={t} value={t}>{t}</option>
    ))}
  </select>
</div>
<div>
  <label className="block text-sm text-gray-400 mb-1">
    Primary Key (target)
  </label>

  <input
    value={form.tgt_pk_fields || ''}
    onChange={(e) => handleChange('tgt_pk_fields', e.target.value)}
    className="w-full bg-gray-900 border border-gray-700 text-sm rounded-lg px-3 py-2"
  />
</div>
        {/* ✅ WHERE CLAUSE (TARGET) */}
        <div>
  <label className="block text-sm text-gray-400 mb-1">
    Target WHERE clause (optional)
  </label>

  <input
    placeholder="e.g. ID = 10"
    value={form.tgt_where_clause}
    onChange={(e) => handleChange('tgt_where_clause', e.target.value)}
    className="w-full bg-gray-900 border border-gray-700 text-sm rounded-lg px-3 py-2"
  />
</div>
      </div>

      {/* COLUMN SELECTION */}
      <div className="border p-4 rounded bg-gray-950">
        <h2 className="text-sm mb-2">Select Comparing Columns (Order Matters)</h2>

        {columns.map(col => {
          const index = selectedCols.findIndex(c => c.column === col.column)

          return (
            <div key={col.column} className="flex items-center gap-3 py-1">
              <input
                type="checkbox"
                checked={index !== -1}
                onChange={() => toggleColumn(col)}
              />
              <span className="w-32">{col.column}</span>

              {index !== -1 && (
                <span className="text-green-400">({index + 1})</span>
              )}
            </div>
          )
        })}
      </div>

      {/* MAPPING UI */}
      {selectedCols.length > 0 && (
        <div className="border p-4 rounded bg-gray-950">
          <h2 className="text-sm mb-3">Column Mapping (SRC → TGT)</h2>

          {selectedCols.map((col, index) => (
            <div key={col.column} className="grid grid-cols-3 gap-4 mb-2 items-center">

              <div>{col.column} <span className="text-green-400">({index + 1})</span></div>

              <div className="text-center">→</div>

              <select
                value={mapping[col.column] || ''}
                onChange={(e) =>
                  setMapping(m => ({
                    ...m,
                    [col.column]: e.target.value
                  }))
                }
                className="bg-gray-900 border px-2 py-1 rounded"
              >
                <option value="">Select target column</option>
                {tgtColumns.map(c => (
                  <option key={c.column} value={c.column}>
                    {c.column}
                  </option>
                ))}
              </select>

            </div>
          ))}
        </div>
      )}

      {/* PREVIEW */}
      <div className="text-sm text-gray-400">
        SRC: {selectedCols.map(c => c.column).join(' ~ ')} <br/>
        TGT: {selectedCols.map(c => mapping[c.column] || c.column).join(' ~ ')}
      </div>

      {/* SUBMIT */}
      <button
        onClick={handleSubmit}
        className="bg-blue-600 px-4 py-2 rounded"
      >
        Create Snapshot
      </button>

    </div>
  )
}