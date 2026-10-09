import { useState, useEffect, useCallback } from 'react';

function App() {
  const [summary, setSummary] = useState(null);
  const [pending, setPending] = useState([]);
  const [exceptions, setExceptions] = useState([]);
  const [processed, setProcessed] = useState([]);
  const [mqttStatus, setMqttStatus] = useState(null);
  const [activeTab, setActiveTab] = useState('pending');
  const [selectedIds, setSelectedIds] = useState(new Set());
  
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [sourceFilter, setSourceFilter] = useState(() => new URLSearchParams(window.location.search).get('source') || '');
  const [filterInput, setFilterInput] = useState(() => new URLSearchParams(window.location.search).get('source') || '');
  const [submissionHistory, setSubmissionHistory] = useState([]);
  
  const generateValidPayload = () => JSON.stringify({
    source_id: "LINE-01",
    event_id: `EV-${Math.floor(Math.random()*100000)}`,
    type: "COUNT",
    quantity: Math.floor(Math.random() * 20) + 1,
    event_time: new Date().toISOString()
  }, null, 2);

  const [submitPayload, setSubmitPayload] = useState(generateValidPayload());
  const [submitResult, setSubmitResult] = useState(null);

  const fetchData = useCallback(async (abortSignal) => {
    try {
      const qs = sourceFilter ? `&source_id=${encodeURIComponent(sourceFilter)}` : '';
      const [sumRes, pendRes, excRes, procRes, mqttRes] = await Promise.all([
        fetch(`/api/state?view=summary${qs}`, { signal: abortSignal }).then(r => r.json()),
        fetch(`/api/state?view=pending${qs}`, { signal: abortSignal }).then(r => r.json()),
        fetch(`/api/state?view=exceptions${qs}`, { signal: abortSignal }).then(r => r.json()),
        fetch(`/api/state?view=processed${qs}`, { signal: abortSignal }).then(r => r.json()),
        fetch('/api/mqtt/status', { signal: abortSignal }).then(r => r.json())
      ]);
      setSummary(sumRes);
      setPending(pendRes);
      setExceptions(excRes);
      setProcessed(procRes);
      setMqttStatus(mqttRes);
    } catch (err) {
      if (err.name !== 'AbortError') {
        console.error("Error fetching data:", err);
      }
    }
  }, [sourceFilter]);

  useEffect(() => {
    const controller = new AbortController();
    fetchData(controller.signal);
    let interval;
    if (autoRefresh) {
      interval = setInterval(() => fetchData(controller.signal), 5000);
    }
    return () => {
      controller.abort();
      clearInterval(interval);
    };
  }, [fetchData, autoRefresh]);

  const knownSources = Array.from(new Set([
    ...pending.map(p => p.source_id),
    ...exceptions.map(e => e.source_id).filter(Boolean),
    ...submissionHistory.map(s => {
       const req = s.payload;
       if (Array.isArray(req)) return req.map(r => r.source_id);
       return req.source_id;
    }).flat().filter(Boolean)
  ])).sort();

  const applyFilter = (val) => {
    const trimmed = val.trim();
    setSourceFilter(trimmed);
    setSelectedIds(new Set());
    const url = new URL(window.location.href);
    if (trimmed) {
      url.searchParams.set('source', trimmed);
    } else {
      url.searchParams.delete('source');
    }
    window.history.replaceState({}, '', url);
  };

  const handleAcknowledge = async () => {
    if (selectedIds.size === 0) return;
    try {
      const res = await fetch('/api/ack', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ event_ids: Array.from(selectedIds) })
      });
      await res.json();
      setSelectedIds(new Set());
      fetchData();
    } catch (err) {
      console.error("Ack error", err);
    }
  };

  const handleToggleSelect = (id) => {
    const next = new Set(selectedIds);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelectedIds(next);
  };

  const handleSelectAll = (e) => {
    if (e.target.checked) {
      setSelectedIds(new Set(pending.map(p => p.event_id)));
    } else {
      setSelectedIds(new Set());
    }
  };

  const formatJson = () => {
    try {
      const obj = JSON.parse(submitPayload);
      setSubmitPayload(JSON.stringify(obj, null, 2));
      setSubmitResult(null);
    } catch (err) {
      setSubmitResult({ error: "Invalid JSON format" });
    }
  };

  const handleSubmitEvent = async () => {
    let body;
    try {
      body = JSON.parse(submitPayload);
    } catch (err) {
      setSubmitResult({ error: "Invalid JSON format" });
      return;
    }

    try {
      const res = await fetch('/api/events', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      });
      const data = await res.json();
      
      const newEntry = {
        timestamp: new Date().toLocaleTimeString(),
        payload: body,
        response: res.ok ? data : { error: data.error, message: data.message },
        ok: res.ok
      };
      
      setSubmitResult(newEntry.response);
      setSubmissionHistory(prev => [newEntry, ...prev].slice(0, 15));
      fetchData();
    } catch (err) {
      setSubmitResult({ error: "Network Error", message: err.message });
    }
  };

  // Sample Generators
  const sampleCount = () => JSON.stringify({
    source_id: "LINE-01",
    event_id: `EV-${Math.floor(Math.random()*10000)}`,
    type: "COUNT",
    quantity: 10,
    event_time: new Date().toISOString()
  }, null, 2);

  const sampleVoid = () => JSON.stringify({
    source_id: "LINE-01",
    event_id: `EV-VOID-${Math.floor(Math.random()*10000)}`,
    type: "VOID",
    target_event_id: `EV-${Math.floor(Math.random()*10000)}`,
    event_time: new Date().toISOString()
  }, null, 2);

  const sampleMixedBatch = () => JSON.stringify([
    {
      source_id: "LINE-01",
      event_id: `EV-${Math.floor(Math.random()*10000)}`,
      type: "COUNT",
      quantity: 5,
      event_time: new Date().toISOString()
    },
    {
      source_id: "LINE-01",
      event_id: `EV-INVALID-${Math.floor(Math.random()*10000)}`,
      type: "COUNT",
      quantity: -5,
      event_time: new Date().toISOString()
    }
  ], null, 2);

  return (
    <div className="min-h-screen bg-[#0B0F19] text-[#E2E8F0] font-['Inter'] selection:bg-indigo-500/30 overflow-x-hidden">
      
      {/* Background glowing orbs */}
      <div className="fixed top-[-20%] left-[-10%] w-[50%] h-[50%] rounded-full bg-indigo-600/10 blur-[120px] pointer-events-none"></div>
      <div className="fixed bottom-[-20%] right-[-10%] w-[50%] h-[50%] rounded-full bg-teal-500/10 blur-[120px] pointer-events-none"></div>

      <div className="max-w-[1400px] mx-auto p-4 md:p-8 space-y-8 relative z-10">
        
        {/* Modern Header */}
        <header className="flex flex-col lg:flex-row justify-between items-center bg-[#131B2F]/80 backdrop-blur-2xl border border-[#1E293B] p-5 rounded-3xl shadow-[0_8px_30px_rgb(0,0,0,0.4)]">
          <div className="flex items-center gap-4 mb-4 lg:mb-0">
            <div className="w-12 h-12 flex items-center justify-center rounded-2xl bg-gradient-to-br from-indigo-500 to-teal-400 shadow-[0_0_20px_rgba(99,102,241,0.4)] transform hover:rotate-12 transition-transform duration-500">
              <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2.5"><path strokeLinecap="round" strokeLinejoin="round" d="M13 10V3L4 14h7v7l9-11h-7z"></path></svg>
            </div>
            <div>
              <h1 className="text-2xl font-['Outfit'] font-extrabold tracking-tight text-white">NEXUS<span className="text-indigo-400 font-light">CORE</span></h1>
              <p className="text-xs font-medium text-[#64748B] tracking-widest uppercase">Production Telemetry</p>
            </div>
          </div>
          
          <div className="flex flex-wrap items-center gap-4 lg:gap-6 bg-[#0B0F19]/50 p-2 lg:p-3 rounded-2xl border border-[#1E293B]">
            <div className="flex flex-wrap items-center gap-2 px-3">
              <label className="text-xs font-bold uppercase tracking-widest text-[#64748B]">Source</label>
              <input 
                list="known-sources"
                className="bg-[#131B2F] border border-[#2D3748] text-[#E2E8F0] rounded-xl text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 py-1.5 px-3 transition-all font-medium outline-none w-32"
                placeholder="ALL"
                value={filterInput}
                onChange={e => setFilterInput(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && applyFilter(filterInput)}
              />
              <datalist id="known-sources">
                {knownSources.map(s => <option key={s} value={s} />)}
              </datalist>
              <button onClick={() => applyFilter(filterInput)} className="text-xs px-3 py-1.5 bg-[#1E293B] hover:bg-indigo-500 text-white rounded-lg transition-colors font-bold">Apply</button>
              {sourceFilter && (
                <button onClick={() => { setFilterInput(''); applyFilter(''); }} className="text-xs flex items-center gap-1 px-2.5 py-1.5 bg-indigo-500/20 text-indigo-400 border border-indigo-500/30 rounded-lg hover:bg-indigo-500/30 transition-colors font-bold">
                  {sourceFilter}
                  <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12"></path></svg>
                </button>
              )}
            </div>
            
            <div className="h-8 w-px bg-[#2D3748]"></div>
            
            <label className="flex items-center gap-3 cursor-pointer group px-3">
              <div className="relative">
                <input type="checkbox" checked={autoRefresh} onChange={e => setAutoRefresh(e.target.checked)} className="sr-only" />
                <div className={`w-11 h-6 rounded-full transition-colors duration-300 ${autoRefresh ? 'bg-indigo-500' : 'bg-[#2D3748]'}`}></div>
                <div className={`absolute left-1 top-1 bg-white w-4 h-4 rounded-full transition-transform duration-300 shadow-sm ${autoRefresh ? 'translate-x-5' : 'translate-x-0'}`}></div>
              </div>
              <span className="text-[#94A3B8] group-hover:text-white transition-colors text-xs font-bold uppercase tracking-widest">Auto-Sync</span>
            </label>
            
            <div className="h-8 w-px bg-[#2D3748]"></div>
            
            <div className="flex items-center gap-3 px-3">
              <span className="relative flex h-3.5 w-3.5">
                {mqttStatus?.connected && <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-teal-400 opacity-75"></span>}
                <span className={`relative inline-flex rounded-full h-3.5 w-3.5 ${mqttStatus?.connected ? 'bg-teal-400 shadow-[0_0_10px_rgba(45,212,191,0.8)]' : 'bg-rose-500'}`}></span>
              </span>
              <span className={`text-xs font-bold uppercase tracking-widest ${mqttStatus?.connected ? 'text-teal-400' : 'text-rose-400'}`}>
                {mqttStatus?.connected ? 'Broker Online' : 'Broker Offline'}
              </span>
            </div>
            
            <button onClick={fetchData} className="p-2.5 bg-[#1E293B] hover:bg-indigo-500 rounded-xl transition-colors duration-300 group ml-2">
              <svg className="w-5 h-5 text-[#94A3B8] group-hover:text-white transition-colors" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"></path></svg>
            </button>
          </div>
        </header>

        {/* Premium Metrics Grid */}
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-5">
          {[
            { label: 'Net Total', value: summary?.net_total || 0, gradient: 'from-indigo-500/20 to-purple-500/20', border: 'border-indigo-500/30', text: 'text-white', onClick: () => setActiveTab('processed') },
            { label: 'Processed', value: summary?.processed_events || 0, gradient: 'from-[#131B2F] to-[#131B2F]', border: 'border-[#1E293B]', text: 'text-[#94A3B8]', onClick: () => setActiveTab('processed') },
            { label: 'Pending Ack', value: summary?.pending_ack || 0, gradient: 'from-amber-500/10 to-orange-500/10', border: 'border-amber-500/30', text: 'text-amber-400', onClick: () => setActiveTab('pending') },
            { label: 'Unresolved', value: summary?.unresolved || 0, gradient: 'from-rose-500/10 to-pink-500/10', border: 'border-rose-500/30', text: 'text-rose-400', onClick: () => setActiveTab('exceptions') },
            { label: 'Duplicates', value: summary?.duplicates || 0, gradient: 'from-[#131B2F] to-[#131B2F]', border: 'border-[#1E293B]', text: 'text-[#94A3B8]', onClick: () => setActiveTab('exceptions'), onClear: async () => {
                await fetch(`/api/state/duplicates${sourceFilter ? '?source_id=' + sourceFilter : ''}`, { method: 'DELETE' });
                fetchData();
              }
            },
            { label: 'Conflicts', value: summary?.conflicts || 0, gradient: 'from-rose-500/10 to-red-500/10', border: 'border-rose-500/30', text: 'text-rose-400', onClick: () => setActiveTab('exceptions') }
          ].map((m, i) => (
            <div key={i} className={`p-6 rounded-3xl border ${m.border} bg-gradient-to-br ${m.gradient} backdrop-blur-xl shadow-lg relative overflow-hidden group hover:scale-[1.02] transition-transform duration-300 flex flex-col justify-between ${m.onClick ? 'cursor-pointer' : ''}`} onClick={m.onClick}>
              <div className="absolute top-0 right-0 w-24 h-24 bg-white opacity-[0.02] rounded-full -translate-y-8 translate-x-8 group-hover:scale-150 transition-transform duration-700"></div>
              <div className="flex justify-between items-start mb-3">
                <div className="text-[10px] font-bold text-[#64748B] uppercase tracking-widest">{m.label}</div>
                {m.onClear && m.value > 0 && (
                  <button onClick={m.onClear} className="text-[#64748B] hover:text-rose-400 transition-colors z-20" title="Clear">
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"></path></svg>
                  </button>
                )}
              </div>
              <div className={`text-4xl font-['Outfit'] font-black tracking-tight ${m.text}`}>{m.value}</div>
            </div>
          ))}
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
          
          {/* Left Column: Tables & MQTT (Span 8) */}
          <div className="lg:col-span-8 space-y-8 flex flex-col">
            
            {/* Main Tabs Container */}
            <div className="bg-[#131B2F]/80 backdrop-blur-2xl border border-[#1E293B] rounded-3xl shadow-xl flex-1 flex flex-col overflow-hidden">
              <div className="flex border-b border-[#1E293B] bg-[#0B0F19]/50 p-3 gap-2">
                <button onClick={() => setActiveTab('pending')} className={`flex-1 py-3 px-6 rounded-2xl text-sm font-bold transition-all duration-300 ${activeTab === 'pending' ? 'bg-[#1E293B] text-white shadow-md' : 'text-[#64748B] hover:text-[#E2E8F0] hover:bg-[#1E293B]/50'}`}>
                  Queue <span className={`ml-2 px-2 py-0.5 rounded-full text-xs ${activeTab === 'pending' ? 'bg-indigo-500/20 text-indigo-400' : 'bg-[#0B0F19] text-[#64748B]'}`}>{pending.length}</span>
                </button>
                <button onClick={() => setActiveTab('exceptions')} className={`flex-1 py-3 px-6 rounded-2xl text-sm font-bold transition-all duration-300 ${activeTab === 'exceptions' ? 'bg-[#1E293B] text-white shadow-md' : 'text-[#64748B] hover:text-[#E2E8F0] hover:bg-[#1E293B]/50'}`}>
                  Exceptions <span className={`ml-2 px-2 py-0.5 rounded-full text-xs ${activeTab === 'exceptions' ? 'bg-rose-500/20 text-rose-400' : 'bg-[#0B0F19] text-[#64748B]'}`}>{exceptions.length}</span>
                </button>
                <button onClick={() => setActiveTab('processed')} className={`flex-1 py-3 px-6 rounded-2xl text-sm font-bold transition-all duration-300 ${activeTab === 'processed' ? 'bg-[#1E293B] text-white shadow-md' : 'text-[#64748B] hover:text-[#E2E8F0] hover:bg-[#1E293B]/50'}`}>
                  Processed <span className={`ml-2 px-2 py-0.5 rounded-full text-xs ${activeTab === 'processed' ? 'bg-teal-500/20 text-teal-400' : 'bg-[#0B0F19] text-[#64748B]'}`}>{processed.length}</span>
                </button>
              </div>
              
              <div className="p-0 overflow-x-auto">
                {activeTab === 'pending' ? (
                  <div className="p-6">
                    <div className="mb-6 flex justify-between items-center bg-[#0B0F19]/80 p-4 rounded-2xl border border-[#1E293B]">
                      <label className="flex items-center gap-4 cursor-pointer group">
                        <div className="relative flex items-center justify-center">
                          <input type="checkbox" onChange={handleSelectAll} checked={pending.length > 0 && selectedIds.size === pending.length} className="appearance-none w-6 h-6 border-2 border-[#334155] rounded-lg checked:bg-indigo-500 checked:border-indigo-500 transition-all cursor-pointer" />
                          {(pending.length > 0 && selectedIds.size === pending.length) && (
                            <svg className="w-4 h-4 text-white absolute pointer-events-none" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="3"><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7"></path></svg>
                          )}
                        </div>
                        <span className="text-sm font-bold text-[#94A3B8] group-hover:text-white transition-colors">Select All</span>
                      </label>
                      <button 
                        disabled={selectedIds.size === 0}
                        onClick={handleAcknowledge} 
                        className={`px-6 py-3 rounded-xl text-sm font-bold transition-all duration-300 flex items-center gap-3 ${selectedIds.size > 0 ? 'bg-gradient-to-r from-teal-400 to-emerald-500 text-[#064E3B] shadow-[0_0_20px_rgba(45,212,191,0.4)] hover:shadow-[0_0_30px_rgba(45,212,191,0.6)] hover:-translate-y-1' : 'bg-[#1E293B] text-[#64748B] cursor-not-allowed'}`}>
                        <span>Acknowledge</span>
                        {selectedIds.size > 0 && <span className="bg-[#064E3B]/20 px-2.5 py-1 rounded-lg">{selectedIds.size}</span>}
                      </button>
                    </div>
                    
                    <div className="rounded-2xl overflow-hidden border border-[#1E293B]">
                      <table className="min-w-full divide-y divide-[#1E293B] text-sm">
                        <thead className="bg-[#0B0F19]">
                          <tr>
                            <th className="px-6 py-5 w-14"></th>
                            <th className="px-6 py-5 text-left text-xs font-bold text-[#64748B] uppercase tracking-widest">Event ID</th>
                            <th className="px-6 py-5 text-left text-xs font-bold text-[#64748B] uppercase tracking-widest">Source</th>
                            <th className="px-6 py-5 text-left text-xs font-bold text-[#64748B] uppercase tracking-widest">Qty</th>
                            <th className="px-6 py-5 text-left text-xs font-bold text-[#64748B] uppercase tracking-widest">Timestamp</th>
                            <th className="px-6 py-5 text-left text-xs font-bold text-[#64748B] uppercase tracking-widest">Status</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-[#1E293B] bg-[#131B2F]/50">
                          {pending.map(p => (
                            <tr key={p.event_id} className={`transition-colors duration-200 ${selectedIds.has(p.event_id) ? 'bg-indigo-500/10' : 'hover:bg-[#1E293B]/50'}`}>
                              <td className="px-6 py-5">
                                <div className="relative flex items-center justify-center">
                                  <input type="checkbox" checked={selectedIds.has(p.event_id)} onChange={() => handleToggleSelect(p.event_id)} className="appearance-none w-6 h-6 border-2 border-[#334155] rounded-lg checked:bg-indigo-500 checked:border-indigo-500 transition-all cursor-pointer" />
                                  {selectedIds.has(p.event_id) && (
                                    <svg className="w-4 h-4 text-white absolute pointer-events-none" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="3"><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7"></path></svg>
                                  )}
                                </div>
                              </td>
                              <td className="px-6 py-5 font-['JetBrains_Mono'] text-xs text-[#94A3B8]">{p.event_id}</td>
                              <td className="px-6 py-5 font-bold text-white">{p.source_id}</td>
                              <td className="px-6 py-5 font-['JetBrains_Mono'] font-bold text-teal-400">{p.quantity}</td>
                              <td className="px-6 py-5 text-xs font-medium text-[#64748B]">{new Date(p.event_time).toLocaleString()}</td>
                              <td className="px-6 py-5">
                                {p.voided ? <span className="inline-flex items-center px-3 py-1 rounded-lg text-[11px] font-bold bg-rose-500/10 text-rose-400 border border-rose-500/30 uppercase tracking-widest">VOIDED</span> : <span className="inline-flex items-center px-3 py-1 rounded-lg text-[11px] font-bold bg-teal-500/10 text-teal-400 border border-teal-500/30 uppercase tracking-widest">ACCEPTED</span>}
                              </td>
                            </tr>
                          ))}
                          {pending.length === 0 && (
                            <tr><td colSpan="6" className="px-6 py-20 text-center text-[#64748B]">
                              <div className="flex flex-col items-center justify-center gap-4">
                                <div className="w-16 h-16 rounded-2xl bg-[#0B0F19] flex items-center justify-center border border-[#1E293B]">
                                  <svg className="w-8 h-8 text-[#334155]" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M5 13l4 4L19 7"></path></svg>
                                </div>
                                <span className="font-bold tracking-wide">Queue is empty</span>
                              </div>
                            </td></tr>
                          )}
                        </tbody>
                      </table>
                    </div>
                  </div>
                ) : (
                  <div className="p-6">
                    <div className="mb-6 flex justify-between items-center bg-[#0B0F19]/80 p-4 rounded-2xl border border-[#1E293B]">
                       <h3 className="text-white font-bold tracking-widest uppercase text-sm">System Exceptions</h3>
                       <button onClick={async () => {
                         await fetch(`/api/state/exceptions${sourceFilter ? '?source_id=' + sourceFilter : ''}`, { method: 'DELETE' });
                         fetchData();
                       }} className="px-6 py-2 rounded-xl text-xs font-bold transition-all duration-300 bg-rose-500/20 text-rose-400 border border-rose-500/30 hover:bg-rose-500 hover:text-white">
                         Solve Exceptions
                       </button>
                    </div>
                    <div className="rounded-2xl overflow-hidden border border-[#1E293B]">
                      <table className="min-w-full divide-y divide-[#1E293B] text-sm">
                        <thead className="bg-[#0B0F19]">
                          <tr>
                            <th className="px-6 py-5 text-left text-xs font-bold text-[#64748B] uppercase tracking-widest">Class</th>
                            <th className="px-6 py-5 text-left text-xs font-bold text-[#64748B] uppercase tracking-widest">Event ID</th>
                            <th className="px-6 py-5 text-left text-xs font-bold text-[#64748B] uppercase tracking-widest">Diagnostics</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-[#1E293B] bg-[#131B2F]/50">
                          {exceptions.map((e, idx) => (
                            <tr key={idx} className="hover:bg-[#1E293B]/50 transition-colors">
                              <td className="px-6 py-5">
                                <span className="inline-flex items-center px-3 py-1.5 rounded-lg text-[10px] font-bold bg-rose-500/10 text-rose-400 border border-rose-500/20 font-['JetBrains_Mono'] tracking-wider">{e.kind}</span>
                              </td>
                              <td className="px-6 py-5 font-['JetBrains_Mono'] text-xs text-[#94A3B8]">{e.event_id || 'N/A'}</td>
                              <td className="px-6 py-5 text-rose-300 font-medium">{e.reason}</td>
                            </tr>
                          ))}
                          {exceptions.length === 0 && (
                            <tr><td colSpan="3" className="px-6 py-20 text-center text-[#64748B]">
                              <div className="flex flex-col items-center justify-center gap-4">
                                <div className="w-16 h-16 rounded-2xl bg-[#0B0F19] flex items-center justify-center border border-[#1E293B]">
                                  <svg className="w-8 h-8 text-[#334155]" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg>
                                </div>
                                <span className="font-bold tracking-wide">No exceptions recorded</span>
                              </div>
                            </td></tr>
                          )}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}
              </div>
            </div>
            
            {/* Ultra-Premium MQTT Panel */}
            <div className="bg-[#131B2F]/80 backdrop-blur-2xl border border-[#1E293B] rounded-3xl shadow-xl p-8 relative overflow-hidden group">
              {/* Animated glowing border effect */}
              <div className="absolute top-0 left-0 w-[200%] h-1 bg-gradient-to-r from-transparent via-teal-400 to-transparent opacity-50 transform -translate-x-1/2 animate-[shimmer_3s_infinite]"></div>
              
              <div className="flex items-center justify-between mb-8">
                <h2 className="text-xl font-['Outfit'] font-black flex items-center text-white">
                  <div className="w-10 h-10 flex items-center justify-center bg-[#0B0F19] border border-[#1E293B] rounded-xl mr-4 text-teal-400 shadow-[0_0_15px_rgba(45,212,191,0.15)]">
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8.111 16.404a5.5 5.5 0 017.778 0M12 20h.01m-7.08-7.071c3.904-3.905 10.236-3.905 14.141 0M1.394 9.393c5.857-5.857 15.355-5.857 21.213 0"></path></svg>
                  </div>
                  MQTT Telemetry
                </h2>
                {mqttStatus && (
                  <div className="bg-[#0B0F19] px-4 py-2 rounded-xl border border-[#1E293B] flex items-center gap-2">
                    <div className="w-2 h-2 rounded-full bg-teal-400 animate-pulse"></div>
                    <span className="text-xs font-bold text-teal-400 tracking-widest uppercase">Connected</span>
                  </div>
                )}
              </div>
              
              {mqttStatus ? (
                <div className="grid grid-cols-2 xl:grid-cols-4 gap-5">
                  <div className="bg-[#0B0F19]/80 p-5 rounded-2xl border border-[#1E293B] hover:border-indigo-500/30 transition-colors">
                    <div className="flex items-center gap-2 text-[#64748B] text-[10px] uppercase font-bold tracking-widest mb-2">
                      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4"></path></svg>
                      Candidate ID
                    </div>
                    <div className="font-['JetBrains_Mono'] font-bold text-white text-xl">{mqttStatus.candidate_id}</div>
                  </div>
                  
                  <div className="bg-[#0B0F19]/80 p-5 rounded-2xl border border-[#1E293B] hover:border-indigo-500/30 transition-colors">
                    <div className="flex items-center gap-2 text-[#64748B] text-[10px] uppercase font-bold tracking-widest mb-2">
                      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5.121 17.804A13.937 13.937 0 0112 16c2.5 0 4.847.655 6.879 1.804M15 10a3 3 0 11-6 0 3 3 0 016 0zm6 2a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg>
                      Client ID
                    </div>
                    <div className="font-['JetBrains_Mono'] text-sm text-[#94A3B8] truncate" title={mqttStatus.client_id}>{mqttStatus.client_id}</div>
                  </div>
                  
                  <div className="bg-[#0B0F19]/80 p-5 rounded-2xl border border-[#1E293B] hover:border-indigo-500/30 transition-colors relative overflow-hidden">
                    <div className="absolute right-[-10px] top-[-10px] w-20 h-20 bg-indigo-500/10 rounded-full blur-xl pointer-events-none"></div>
                    <div className="flex items-center gap-2 text-[#64748B] text-[10px] uppercase font-bold tracking-widest mb-2">
                      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6"></path></svg>
                      Received
                    </div>
                    <div className="font-['Outfit'] font-black text-white text-3xl">{mqttStatus.counts.received}</div>
                  </div>
                  
                  <div className="bg-[#0B0F19]/80 p-5 rounded-2xl border border-[#1E293B] hover:border-indigo-500/30 transition-colors">
                    <div className="flex items-center gap-2 text-[#64748B] text-[10px] uppercase font-bold tracking-widest mb-2">
                      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg>
                      Resolution
                    </div>
                    <div className="font-['Outfit'] font-black text-2xl flex items-center gap-3">
                      <span className="text-teal-400 drop-shadow-[0_0_8px_rgba(45,212,191,0.5)]">{mqttStatus.counts.completed}</span> 
                      <span className="text-[#334155] text-lg font-light">/</span> 
                      <span className="text-rose-400">{mqttStatus.counts.failed}</span>
                    </div>
                  </div>
                  
                  {mqttStatus.last_error && (
                    <div className="col-span-full mt-4">
                      <div className="bg-gradient-to-r from-rose-900/30 to-[#0B0F19] p-4 rounded-xl border-l-4 border-rose-500 text-sm font-medium flex items-center">
                        <svg className="w-5 h-5 text-rose-500 mr-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg>
                        <span className="text-rose-200">System Fault: {mqttStatus.last_error}</span>
                      </div>
                    </div>
                  )}
                  
                  {mqttStatus.last_challenge && (
                    <div className="col-span-full bg-gradient-to-r from-indigo-900/20 to-teal-900/10 p-5 rounded-2xl border border-[#1E293B] flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mt-4 relative overflow-hidden">
                      <div className="absolute top-0 right-0 w-32 h-32 bg-teal-500/5 rounded-full blur-3xl"></div>
                      <div className="flex flex-col z-10">
                        <span className="text-[10px] uppercase font-bold tracking-widest text-indigo-400 mb-1.5 flex items-center gap-2">
                          <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4"></path></svg>
                          Last Intercepted Challenge
                        </span>
                        <span className="font-['JetBrains_Mono'] text-sm text-[#E2E8F0] bg-[#0B0F19] px-3 py-1.5 rounded-lg border border-[#1E293B]">{mqttStatus.last_challenge.challenge_id}</span>
                      </div>
                      <span className={`z-10 font-bold px-4 py-2 rounded-xl text-xs tracking-widest uppercase border shadow-lg ${mqttStatus.last_challenge.status === 'COMPLETED' ? 'bg-teal-500/20 text-teal-300 border-teal-500/40 shadow-[0_0_15px_rgba(45,212,191,0.2)]' : 'bg-rose-500/20 text-rose-300 border-rose-500/40 shadow-[0_0_15px_rgba(244,63,94,0.2)]'}`}>
                        {mqttStatus.last_challenge.status}
                      </span>
                    </div>
                  )}
                </div>
              ) : (
                <div className="flex flex-col items-center justify-center py-12 text-[#64748B] gap-4">
                  <div className="w-8 h-8 border-2 border-[#1E293B] border-t-teal-500 rounded-full animate-spin"></div>
                  <span className="font-bold tracking-widest uppercase text-xs">Establishing Broker Link...</span>
                </div>
              )}
            </div>
          </div>

          {/* Right Column: Submission & History Panel (Span 4) */}
          <div className="lg:col-span-4 flex flex-col gap-8 h-full">
            
            {/* Manual Control */}
            <div className="bg-[#131B2F]/80 backdrop-blur-2xl border border-[#1E293B] rounded-3xl shadow-xl p-6 flex flex-col shrink-0">
              <h2 className="text-lg font-['Outfit'] font-black mb-6 text-white flex items-center gap-3">
                <div className="w-8 h-8 flex items-center justify-center bg-indigo-500/20 border border-indigo-500/30 rounded-xl text-indigo-400">
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4"></path></svg>
                </div>
                Manual Override
              </h2>
              
              <div className="flex flex-wrap gap-2 mb-4">
                <button onClick={() => setSubmitPayload(generateValidPayload())} className="flex-1 py-2 bg-[#0B0F19] text-teal-400 rounded-xl text-xs font-bold hover:bg-teal-500 hover:text-[#0B0F19] transition-all border border-[#1E293B] hover:border-teal-500 shadow-sm" title="Generates a perfectly valid payload that will succeed">
                  + NEW VALID EVENT
                </button>
                <button onClick={() => setSubmitPayload(sampleVoid())} className="flex-1 py-2 bg-[#0B0F19] text-rose-400 rounded-xl text-xs font-bold hover:bg-rose-500 hover:text-[#0B0F19] transition-all border border-[#1E293B] hover:border-rose-500 shadow-sm" title="Generates an orphaned VOID that will become UNRESOLVED">
                  + ORPHANED VOID
                </button>
                <button onClick={() => setSubmitPayload(sampleMixedBatch())} className="flex-1 py-2 bg-[#0B0F19] text-indigo-400 rounded-xl text-xs font-bold hover:bg-indigo-500 hover:text-white transition-all border border-[#1E293B] hover:border-indigo-500 shadow-sm" title="Generates a batch with both valid and invalid events to test rejection">
                  + MIXED / INVALID BATCH
                </button>
              </div>
              
              <div className="relative group mt-2 flex-1">
                <textarea 
                  rows="12"
                  className="w-full h-full bg-[#0B0F19] border border-[#1E293B] rounded-2xl font-['JetBrains_Mono'] text-[12px] p-5 text-teal-300 focus:ring-2 focus:ring-indigo-500/50 focus:border-indigo-500 transition-all outline-none resize-none shadow-inner leading-relaxed"
                  value={submitPayload}
                  onChange={e => setSubmitPayload(e.target.value)}
                  spellCheck="false"
                />
                <button onClick={formatJson} className="absolute top-4 right-4 p-2 bg-[#1E293B] rounded-lg text-[#94A3B8] hover:text-white opacity-0 group-hover:opacity-100 transition-all shadow-md hover:bg-indigo-500" title="Format JSON">
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 6h16M4 12h16M4 18h7"></path></svg>
                </button>
              </div>
              
              <div className="mt-6">
                <button onClick={handleSubmitEvent} className="w-full py-4 bg-gradient-to-r from-indigo-500 to-indigo-600 text-white font-bold rounded-2xl hover:shadow-[0_0_25px_rgba(99,102,241,0.5)] hover:-translate-y-1 transition-all flex items-center justify-center gap-3">
                  <span>DISPATCH PAYLOAD</span>
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M14 5l7 7m0 0l-7 7m7-7H3"></path></svg>
                </button>
              </div>
            </div>

            {/* Submission History Log */}
            <div className="bg-[#131B2F]/80 backdrop-blur-2xl border border-[#1E293B] rounded-3xl shadow-xl p-6 flex flex-col flex-1 overflow-hidden">
              <h2 className="text-xs font-bold text-[#64748B] uppercase tracking-widest mb-4 flex items-center justify-between pb-4 border-b border-[#1E293B]">
                <span className="flex items-center gap-2">
                  <svg className="w-4 h-4 text-indigo-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg>
                  Session Log
                </span>
                <span className="bg-[#1E293B] text-white px-2.5 py-1 rounded-full text-[10px]">{submissionHistory.length}</span>
              </h2>
              
              <div className="flex-1 overflow-y-auto space-y-4 pr-2 scrollbar-thin scrollbar-thumb-[#1E293B] scrollbar-track-transparent">
                {submissionHistory.length === 0 ? (
                  <div className="h-full flex flex-col items-center justify-center text-[#475569] space-y-3">
                    <div className="w-12 h-12 rounded-full border border-[#1E293B] border-dashed flex items-center justify-center">
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M13 10V3L4 14h7v7l9-11h-7z"></path></svg>
                    </div>
                    <p className="text-xs font-medium uppercase tracking-widest">Awaiting Transmissions</p>
                  </div>
                ) : (
                  submissionHistory.map((item, idx) => (
                    <div key={idx} className="bg-[#0B0F19] border border-[#1E293B] rounded-2xl p-4 flex flex-col gap-3 relative overflow-hidden hover:border-indigo-500/50 transition-colors">
                      <div className={`absolute top-0 left-0 w-1.5 h-full ${item.ok ? 'bg-gradient-to-b from-teal-400 to-emerald-500' : 'bg-gradient-to-b from-rose-500 to-red-600'}`}></div>
                      <div className="flex justify-between items-center pl-2">
                        <span className="text-[10px] font-['JetBrains_Mono'] text-[#64748B] flex items-center gap-2">
                          <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg>
                          {item.timestamp}
                        </span>
                        <span className={`text-[10px] font-bold px-2.5 py-1 rounded-lg ${item.ok ? 'bg-teal-500/10 text-teal-400' : 'bg-rose-500/10 text-rose-400'}`}>
                          {item.ok ? 'SUCCESS' : 'FAULT'}
                        </span>
                      </div>
                      <div className="bg-[#131B2F] rounded-xl p-3 font-['JetBrains_Mono'] text-[11px] text-[#94A3B8] overflow-x-auto border border-[#1E293B]">
                        <pre className="text-indigo-200">{JSON.stringify(item.response, null, 2)}</pre>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>

          </div>
        </div>
      </div>
    </div>
  );
}

export default App;
