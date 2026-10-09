import { useState, useEffect, useCallback } from 'react';

function App() {
  const [summary, setSummary] = useState(null);
  const [pending, setPending] = useState([]);
  const [exceptions, setExceptions] = useState([]);
  const [mqttStatus, setMqttStatus] = useState(null);
  const [activeTab, setActiveTab] = useState('pending');
  const [selectedIds, setSelectedIds] = useState(new Set());
  
  // New features: Auto-refresh toggle and source filter
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [sourceFilter, setSourceFilter] = useState('');
  
  const [submitPayload, setSubmitPayload] = useState(JSON.stringify({
    source_id: "LINE-01",
    event_id: "EV-001",
    type: "COUNT",
    quantity: 5,
    event_time: new Date().toISOString()
  }, null, 2));
  const [submitResult, setSubmitResult] = useState(null);

  const fetchData = useCallback(async () => {
    try {
      const qs = sourceFilter ? `&source_id=${encodeURIComponent(sourceFilter)}` : '';
      const [sumRes, pendRes, excRes, mqttRes] = await Promise.all([
        fetch(`/api/state?view=summary${qs}`).then(r => r.json()),
        fetch(`/api/state?view=pending${qs}`).then(r => r.json()),
        fetch(`/api/state?view=exceptions${qs}`).then(r => r.json()),
        fetch('/api/mqtt/status').then(r => r.json())
      ]);
      setSummary(sumRes);
      setPending(pendRes);
      setExceptions(excRes);
      setMqttStatus(mqttRes);
    } catch (err) {
      console.error("Error fetching data:", err);
    }
  }, [sourceFilter]);

  useEffect(() => {
    fetchData();
    let interval;
    if (autoRefresh) {
      interval = setInterval(fetchData, 5000);
    }
    return () => {
      if (interval) clearInterval(interval);
    };
  }, [fetchData, autoRefresh]);

  const handleAcknowledge = async () => {
    if (selectedIds.size === 0) return;
    try {
      const res = await fetch('/api/ack', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ event_ids: Array.from(selectedIds) })
      });
      const data = await res.json();
      console.log('Ack result:', data);
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
      setSubmitResult(null); // Clear errors
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
      if (!res.ok) {
        setSubmitResult({ error: data.error, message: data.message });
      } else {
        setSubmitResult(data);
      }
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
      quantity: -5, // Invalid
      event_time: new Date().toISOString()
    }
  ], null, 2);

  return (
    <div className="min-h-screen bg-gray-100 p-6 text-gray-800 font-sans">
      <div className="max-w-7xl mx-auto space-y-6">
        
        {/* Header */}
        <header className="flex flex-col md:flex-row justify-between items-center bg-white p-4 rounded-lg shadow space-y-4 md:space-y-0">
          <h1 className="text-2xl font-bold text-gray-900">Production Event Processing</h1>
          <div className="flex flex-wrap items-center space-x-4">
            <div className="flex items-center space-x-2 border-r pr-4">
              <label className="text-sm text-gray-600">Source:</label>
              <select 
                className="border-gray-300 rounded text-sm focus:ring-blue-500 focus:border-blue-500"
                value={sourceFilter}
                onChange={e => setSourceFilter(e.target.value)}
              >
                <option value="">All Sources</option>
                <option value="LINE-01">LINE-01</option>
                <option value="LINE-02">LINE-02</option>
              </select>
            </div>
            <label className="flex items-center space-x-2 text-sm cursor-pointer">
              <input type="checkbox" checked={autoRefresh} onChange={e => setAutoRefresh(e.target.checked)} className="rounded text-blue-600" />
              <span>Auto-refresh (5s)</span>
            </label>
            <span className="flex items-center text-sm font-medium border-l pl-4">
              <span className={`h-3 w-3 rounded-full mr-2 ${mqttStatus?.connected ? 'bg-green-500' : 'bg-red-500'}`}></span>
              MQTT: {mqttStatus?.connected ? 'Online' : 'Offline'}
            </span>
            <button onClick={fetchData} className="px-4 py-2 bg-blue-600 text-white text-sm rounded hover:bg-blue-700 transition">
              Refresh
            </button>
          </div>
        </header>

        {/* Metrics Grid */}
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
          {[
            { label: 'Net Total', value: summary?.net_total || 0, color: 'text-blue-600' },
            { label: 'Processed', value: summary?.processed_events || 0 },
            { label: 'Pending Ack', value: summary?.pending_ack || 0, color: 'text-orange-600' },
            { label: 'Unresolved', value: summary?.unresolved || 0, color: 'text-red-600' },
            { label: 'Duplicates', value: summary?.duplicates || 0 },
            { label: 'Conflicts', value: summary?.conflicts || 0, color: 'text-red-600' }
          ].map((m, i) => (
            <div key={i} className="bg-white p-4 rounded-lg shadow flex flex-col items-center justify-center">
              <div className="text-sm text-gray-500 mb-1 font-medium">{m.label}</div>
              <div className={`text-3xl font-bold ${m.color || 'text-gray-900'}`}>{m.value}</div>
            </div>
          ))}
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Left Column: Tables & MQTT */}
          <div className="col-span-1 lg:col-span-2 space-y-6 flex flex-col">
            
            <div className="bg-white rounded-lg shadow flex-1 overflow-hidden flex flex-col">
              <div className="border-b border-gray-200">
                <nav className="flex -mb-px">
                  <button onClick={() => setActiveTab('pending')} className={`w-1/2 py-4 px-1 text-center border-b-2 font-medium text-sm transition-colors ${activeTab === 'pending' ? 'border-blue-500 text-blue-600' : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'}`}>
                    Pending Acknowledgment ({pending.length})
                  </button>
                  <button onClick={() => setActiveTab('exceptions')} className={`w-1/2 py-4 px-1 text-center border-b-2 font-medium text-sm transition-colors ${activeTab === 'exceptions' ? 'border-blue-500 text-blue-600' : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'}`}>
                    Exceptions ({exceptions.length})
                  </button>
                </nav>
              </div>
              
              <div className="p-4 overflow-x-auto">
                {activeTab === 'pending' ? (
                  <div>
                    <div className="mb-4 flex justify-between items-center">
                      <label className="flex items-center space-x-2">
                        <input type="checkbox" onChange={handleSelectAll} checked={pending.length > 0 && selectedIds.size === pending.length} className="rounded border-gray-300 text-blue-600 focus:ring-blue-500" />
                        <span className="text-sm font-medium">Select All</span>
                      </label>
                      <button 
                        disabled={selectedIds.size === 0}
                        onClick={handleAcknowledge} 
                        className={`px-4 py-2 rounded text-white text-sm font-medium transition-colors ${selectedIds.size > 0 ? 'bg-green-600 hover:bg-green-700 shadow-sm' : 'bg-gray-300 cursor-not-allowed'}`}>
                        Acknowledge Selected ({selectedIds.size})
                      </button>
                    </div>
                    <table className="min-w-full divide-y divide-gray-200 text-sm">
                      <thead className="bg-gray-50 text-left text-gray-500">
                        <tr>
                          <th className="px-4 py-2 w-10"></th>
                          <th className="px-4 py-2">Event ID</th>
                          <th className="px-4 py-2">Source</th>
                          <th className="px-4 py-2">Qty</th>
                          <th className="px-4 py-2">Time</th>
                          <th className="px-4 py-2">Status</th>
                        </tr>
                      </thead>
                      <tbody className="bg-white divide-y divide-gray-200">
                        {pending.map(p => (
                          <tr key={p.event_id} className="hover:bg-gray-50 transition-colors">
                            <td className="px-4 py-2">
                              <input type="checkbox" checked={selectedIds.has(p.event_id)} onChange={() => handleToggleSelect(p.event_id)} className="rounded border-gray-300 text-blue-600 focus:ring-blue-500" />
                            </td>
                            <td className="px-4 py-2 font-mono text-xs">{p.event_id}</td>
                            <td className="px-4 py-2 font-medium">{p.source_id}</td>
                            <td className="px-4 py-2">{p.quantity}</td>
                            <td className="px-4 py-2 text-xs text-gray-500">{new Date(p.event_time).toLocaleString()}</td>
                            <td className="px-4 py-2">
                              {p.voided ? <span className="text-xs font-semibold bg-red-100 text-red-800 px-2 py-1 rounded-full">VOIDED</span> : <span className="text-xs font-semibold bg-green-100 text-green-800 px-2 py-1 rounded-full">ACCEPTED</span>}
                            </td>
                          </tr>
                        ))}
                        {pending.length === 0 && (
                          <tr><td colSpan="6" className="px-4 py-8 text-center text-gray-500">Nothing waiting for review</td></tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <table className="min-w-full divide-y divide-gray-200 text-sm">
                    <thead className="bg-gray-50 text-left text-gray-500">
                      <tr>
                        <th className="px-4 py-2">Kind</th>
                        <th className="px-4 py-2">Event ID</th>
                        <th className="px-4 py-2">Reason</th>
                      </tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-gray-200">
                      {exceptions.map((e, idx) => (
                        <tr key={idx} className="hover:bg-gray-50 transition-colors">
                          <td className="px-4 py-2">
                            <span className="text-xs font-semibold bg-red-100 text-red-800 px-2 py-1 rounded-full font-mono">{e.kind}</span>
                          </td>
                          <td className="px-4 py-2 font-mono text-xs text-gray-600">{e.event_id || 'N/A'}</td>
                          <td className="px-4 py-2 text-red-600 text-xs font-medium">{e.reason}</td>
                        </tr>
                      ))}
                      {exceptions.length === 0 && (
                        <tr><td colSpan="3" className="px-4 py-8 text-center text-gray-500">No exceptions</td></tr>
                      )}
                    </tbody>
                  </table>
                )}
              </div>
            </div>
            
            {/* MQTT Panel */}
            <div className="bg-white rounded-lg shadow p-4 border-l-4 border-blue-500">
              <h2 className="text-lg font-bold mb-4 flex items-center">
                <svg className="w-5 h-5 mr-2 text-blue-500" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 10V3L4 14h7v7l9-11h-7z"></path></svg>
                MQTT Worker Status
              </h2>
              {mqttStatus ? (
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                  <div className="bg-gray-50 p-3 rounded">
                    <div className="text-gray-500 text-xs mb-1 uppercase font-bold tracking-wider">Candidate ID</div>
                    <div className="font-mono font-medium">{mqttStatus.candidate_id}</div>
                  </div>
                  <div className="bg-gray-50 p-3 rounded">
                    <div className="text-gray-500 text-xs mb-1 uppercase font-bold tracking-wider">Client ID</div>
                    <div className="font-mono text-xs truncate" title={mqttStatus.client_id}>{mqttStatus.client_id}</div>
                  </div>
                  <div className="bg-gray-50 p-3 rounded">
                    <div className="text-gray-500 text-xs mb-1 uppercase font-bold tracking-wider">Challenges</div>
                    <div className="font-bold text-gray-800">{mqttStatus.counts.received}</div>
                  </div>
                  <div className="bg-gray-50 p-3 rounded">
                    <div className="text-gray-500 text-xs mb-1 uppercase font-bold tracking-wider">Comp / Fail</div>
                    <div className="font-bold text-gray-800">{mqttStatus.counts.completed} <span className="text-gray-400 font-normal">/</span> {mqttStatus.counts.failed}</div>
                  </div>
                  {mqttStatus.last_error && (
                    <div className="col-span-full">
                      <div className="text-red-600 bg-red-50 p-2 rounded text-xs font-medium border border-red-100 flex items-center">
                        <svg className="w-4 h-4 mr-1 inline" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg>
                        Last Error: {mqttStatus.last_error}
                      </div>
                    </div>
                  )}
                  {mqttStatus.last_challenge && (
                    <div className="col-span-full bg-blue-50 p-3 rounded border border-blue-100 flex justify-between items-center text-xs">
                      <span className="text-blue-800">
                        <span className="font-semibold mr-2">Last Challenge:</span>
                        <span className="font-mono">{mqttStatus.last_challenge.challenge_id}</span>
                      </span>
                      <span className={`font-bold px-2 py-1 rounded-full ${mqttStatus.last_challenge.status === 'COMPLETED' ? 'bg-green-200 text-green-800' : 'bg-red-200 text-red-800'}`}>
                        {mqttStatus.last_challenge.status}
                      </span>
                    </div>
                  )}
                </div>
              ) : (
                <div className="text-gray-500 animate-pulse text-sm">Loading MQTT status...</div>
              )}
            </div>
          </div>

          {/* Right Column: Submission Panel */}
          <div className="col-span-1 space-y-6">
            <div className="bg-white rounded-lg shadow p-4 flex flex-col h-full">
              <h2 className="text-lg font-bold mb-4">Manual Event Submission</h2>
              
              <div className="flex flex-wrap gap-2 mb-3">
                <button 
                  onClick={() => setSubmitPayload(sampleCount())}
                  className="px-2 py-1 bg-gray-100 text-gray-700 rounded text-xs font-medium hover:bg-gray-200 transition-colors border border-gray-200">
                  + COUNT
                </button>
                <button 
                  onClick={() => setSubmitPayload(sampleVoid())}
                  className="px-2 py-1 bg-gray-100 text-gray-700 rounded text-xs font-medium hover:bg-gray-200 transition-colors border border-gray-200">
                  + VOID
                </button>
                <button 
                  onClick={() => setSubmitPayload(sampleMixedBatch())}
                  className="px-2 py-1 bg-gray-100 text-gray-700 rounded text-xs font-medium hover:bg-gray-200 transition-colors border border-gray-200">
                  + BATCH
                </button>
              </div>
              
              <textarea 
                rows="12"
                className="w-full border-gray-300 rounded shadow-sm font-mono text-xs p-3 focus:ring-blue-500 focus:border-blue-500 bg-gray-50"
                value={submitPayload}
                onChange={e => setSubmitPayload(e.target.value)}
              />
              
              <div className="mt-4 flex justify-between items-center">
                <button onClick={formatJson} className="text-sm text-blue-600 hover:text-blue-800 hover:underline font-medium">
                  Format JSON
                </button>
                <button onClick={handleSubmitEvent} className="px-6 py-2 bg-blue-600 text-white font-medium rounded hover:bg-blue-700 shadow-md transition-colors">
                  Submit
                </button>
              </div>
              
              {submitResult && (
                <div className={`mt-6 p-4 rounded text-xs font-mono overflow-auto max-h-64 border shadow-inner ${submitResult.error ? 'bg-red-50 border-red-200 text-red-900' : 'bg-gray-50 border-gray-200'}`}>
                  <h3 className={`font-bold mb-2 flex items-center ${submitResult.error ? 'text-red-700' : 'text-gray-700'}`}>
                    {submitResult.error ? (
                      <><svg className="w-4 h-4 mr-1 inline" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"></path></svg> Error</>
                    ) : 'Result:'}
                  </h3>
                  <pre className="whitespace-pre-wrap">{JSON.stringify(submitResult, null, 2)}</pre>
                </div>
              )}
            </div>
          </div>

        </div>
      </div>
    </div>
  );
}

export default App;
