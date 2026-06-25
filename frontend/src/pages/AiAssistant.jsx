import React, { useState } from 'react';
import { Sparkles, Database, CheckCircle, AlertCircle, RefreshCw, Terminal, Code } from 'lucide-react';

const AiAssistant = () => {
    // --- State Management ---
    const [prompt, setPrompt] = useState("");
    const [loading, setLoading] = useState(false);
    const [executing, setExecuting] = useState(false);
    const [scripts, setScripts] = useState([]);
    const [metadata, setMetadata] = useState(null);
    const [executionSteps, setExecutionSteps] = useState([]);
    const [sk, setSk] = useState(null);

    // --- API Endpoints ---
    const BASE_URL = "http://localhost:8000/ai";

    // 1. Generate SQL from Natural Language
    const handleGenerate = async () => {
        if (!prompt.trim()) return alert("Please describe your reconciliation task.");
        
        setLoading(true);
        setScripts([]);
        setMetadata(null);
        setExecutionSteps([]);
        setSk(null);

        try {
            const response = await fetch(`${BASE_URL}/generate`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ user_prompt: prompt })
            });
            
            if (!response.ok) throw new Error("Backend failed to respond (500)");
            
            const data = await response.json();
            
            if (data.success) {
                setScripts(data.scripts || []);
                setMetadata(data.parsed || null);
            } else {
                alert(`AI Generation Failed: ${data.detail || "Check Ollama status"}`);
            }
        } catch (error) {
            console.error("Error:", error);
            alert("Backend unreachable. Ensure uvicorn is running on port 8000.");
        } finally {
            setLoading(false);
        }
    };

    // 2. Execute SQL and Register in Master Table
    const handleExecute = async () => {
        // Validation: Ensure we have a valid snapshot name to enable deployment
        if (!scripts.length || !metadata?.snapshot_name) {
            return alert("No valid metadata found. Please generate logic first.");
        }

        setExecuting(true);
        setExecutionSteps([]);

        try {
            // Filter executable blocks (DDL, DML, CONFIG)
            const executableScripts = scripts
                .filter(s => ["DDL", "DML", "CONFIG"].includes(s.tag))
                .map(s => s.code);

            const response = await fetch(`${BASE_URL}/execute`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ 
                    sql_scripts: executableScripts, 
                    snapshot_name: metadata.snapshot_name,
                    metadata: metadata // Crucial for backend mapping to FINRECON_MASTER
                })
            });

            const data = await response.json();
            
            // Populate logs regardless of total success/failure to see individual step results
            setExecutionSteps(data.steps || []);
            
            if (data.success) {
                setSk(data.sk);
                alert(`Deployment Successful! Registered with SK: ${data.sk}`);
            } else {
                alert(`Deployment Error: ${data.detail || "Check Oracle execution logs below"}`);
            }
        } catch (error) {
            console.error("Execution Error:", error);
            alert("Network error: Deployment process interrupted.");
        } finally {
            setExecuting(false);
        }
    };

    return (
        <div className="p-8 bg-[#0d0f14] min-h-screen text-gray-200">
            {/* Header */}
            <div className="flex items-center justify-between mb-8">
                <div>
                    <h1 className="text-2xl font-bold text-white flex items-center gap-2">
                        <Sparkles className="text-blue-400" size={24} /> 
                        AI Reconciliation Assistant
                    </h1>
                    <p className="text-gray-400 text-sm mt-1">Direct deployment to {metadata?.snapshot_name || "Oracle Master Table"}</p>
                </div>
            </div>

            {/* Input Section */}
            <div className="bg-[#13161e] border border-[#2a2f3e] rounded-xl p-6 mb-8 shadow-xl">
                <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">
                    Reconciliation Requirements
                </label>
                <textarea 
                    className="w-full h-32 bg-[#1a1e28] border border-[#2a2f3e] rounded-lg p-4 text-sm focus:border-blue-500 outline-none transition-all placeholder:text-gray-600"
                    placeholder="e.g. Compare NAME and AMOUNT between FINRECON.TEST_SRC_1 and FINRECON.TEST_TGT_1 using ID. Snapshot: RECON_PROD_01"
                    value={prompt}
                    onChange={(e) => setPrompt(e.target.value)}
                />
                
                <div className="flex gap-4 mt-4">
                    <button 
                        onClick={handleGenerate} 
                        disabled={loading}
                        className="flex-1 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white font-bold py-3 rounded-lg flex items-center justify-center gap-2 transition-all shadow-lg shadow-blue-900/20"
                    >
                        {loading ? <RefreshCw className="animate-spin" size={18} /> : <Code size={18} />}
                        {loading ? "AI Architecting..." : "1. Generate Logic"}
                    </button>
                    
                    <button 
                        onClick={handleExecute} 
                        disabled={!scripts.length || executing || !metadata?.snapshot_name}
                        className="flex-1 bg-green-600 hover:bg-green-500 disabled:opacity-30 text-white font-bold py-3 rounded-lg flex items-center justify-center gap-2 transition-all shadow-lg shadow-green-900/20"
                    >
                        {executing ? <RefreshCw className="animate-spin" size={18} /> : <Database size={18} />}
                        {executing ? "Deploying to Oracle..." : "2. Deploy to Oracle"}
                    </button>
                </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                {/* Script Pipeline column */}
                <div className="space-y-4">
                    <h2 className="text-sm font-semibold text-gray-400 uppercase tracking-widest flex items-center gap-2 text-[11px]">
                        <Terminal size={14} /> Generated Execution Pipeline
                    </h2>
                    {scripts.length === 0 && !loading && (
                        <div className="border border-dashed border-[#2a2f3e] rounded-xl p-12 text-center text-gray-600 text-sm italic">
                            No logic generated. Describe your tables above.
                        </div>
                    )}
                    {scripts.map((s, i) => (
                        <div key={i} className="bg-[#13161e] border border-[#2a2f3e] rounded-xl overflow-hidden shadow-sm">
                            <div className="px-4 py-2 bg-[#1a1e28] border-b border-[#2a2f3e] flex justify-between items-center">
                                <span className="text-[10px] font-bold text-blue-400 font-mono uppercase tracking-tighter">{s.tag}</span>
                                <span className="text-[10px] text-gray-500 font-mono">{s.title}</span>
                            </div>
                            <pre className="p-4 text-[11px] font-mono text-gray-300 overflow-x-auto whitespace-pre-wrap leading-relaxed">
                                {s.code}
                            </pre>
                        </div>
                    ))}
                </div>

                {/* Status and Metadata Column */}
                <div className="space-y-6">
                    <h2 className="text-sm font-semibold text-gray-400 uppercase tracking-widest flex items-center gap-2 text-[11px]">
                        <CheckCircle size={14} /> Configuration Registry
                    </h2>

                    {metadata && (
                        <div className="bg-blue-900/10 border border-blue-800/30 rounded-xl p-5 shadow-inner">
                            <div className="text-[10px] font-bold text-blue-400 mb-4 uppercase tracking-widest">Extracted Metadata</div>
                            <div className="grid grid-cols-2 gap-y-4 text-xs">
                                <div>
                                    <div className="text-gray-500 mb-0.5">Target Snapshot</div>
                                    <div className="font-mono text-white font-semibold uppercase">{metadata.snapshot_name}</div>
                                </div>
                                <div>
                                    <div className="text-gray-500 mb-0.5">Database SK</div>
                                    <div className="font-mono text-white">{sk || "Waiting for Deployment..."}</div>
                                </div>
                                <div className="col-span-2">
                                    <div className="text-gray-500 mb-0.5">Data Flow Direction</div>
                                    <div className="font-mono text-gray-300 break-all bg-black/30 p-2 rounded">
                                        {metadata.src_table || "???"} <span className="text-blue-400 mx-2">→</span> {metadata.tgt_table || "???"}
                                    </div>
                                </div>
                            </div>
                        </div>
                    )}

                    {executionSteps.length > 0 && (
                        <div className="bg-[#13161e] border border-[#2a2f3e] rounded-xl overflow-hidden shadow-2xl">
                            <div className="px-4 py-3 bg-[#1a1e28] border-b border-[#2a2f3e] text-[10px] font-bold text-gray-400 uppercase tracking-widest">Oracle Transaction Log</div>
                            <div className="p-4 space-y-4 max-h-[450px] overflow-y-auto scrollbar-thin scrollbar-thumb-gray-800">
                                {executionSteps.map((step, idx) => (
                                    <div key={idx} className="flex items-start gap-3 border-b border-gray-800/40 pb-3 last:border-0">
                                        {step.status === 'success' ? 
                                            <CheckCircle className="text-green-500 shrink-0 mt-0.5" size={14} /> : 
                                            <AlertCircle className="text-red-500 shrink-0 mt-0.5" size={14} />
                                        }
                                        <div className="flex-1 min-w-0">
                                            <div className="text-[10px] font-mono text-gray-500 italic truncate mb-1">
                                                {step.sql_preview ? `${step.sql_preview}...` : "System Task"}
                                            </div>
                                            <div className={`text-[11px] leading-snug ${step.status === 'success' ? 'text-gray-300' : 'text-red-400 font-semibold'}`}>
                                                {step.msg}
                                            </div>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};

export default AiAssistant;