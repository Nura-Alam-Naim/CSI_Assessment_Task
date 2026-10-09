import { useState, useEffect } from 'react';

function App() {
  const [summary, setSummary] = useState(null);
  const [pending, setPending] = useState([]);
  const [exceptions, setExceptions] = useState([]);
  const [mqttStatus, setMqttStatus] = useState(null);
  const [activeTab, setActiveTab] = useState('pending');
  const [selectedIds, setSelectedIds] = useState(new Set());
  
  const [submitPayload, setSubmitPayload] = useState(JSON.stringify({
    source_id: "LINE-01",
    event_id: "EV-001",
    type: "COUNT",
    quantity: 5,
    event_time: new Date().toISOString()
  }, null, 2));
  const [submitResult, setSubmitResult] = useState(null);

  const fetchData = async () => {
    try {
      const [sumRes, pendRes, excRes, mqttRes] = await Promise.all([
        fetch('/api/state?view=summary').then(r => r.json()),
        fetch('/api/state?view=pending').then(r => r.json()),
        fetch('/api/state?view=exceptions').then(r => r.json()),
        fetch('/api/mqtt/status').then(r => r.json())
      ]);
      setSummary(sumRes);
      setPending(pendRes);
      setExceptions(excRes);
      setMqttStatus(mqttRes);
    } catch (err) {
      console.error("Error fetching data:", err);
    }
  };

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 5000);
    return () => clearInterval(interval);
  }, []);

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

  const handleSubmitEvent = async () => {
    try {
      const body = JSON.parse(submitPayload);
      const res = await fetch('/api/events', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      });
      const data = await res.json();
      setSubmitResult(data);
      fetchData();
    } catch (err) {
      setSubmitResult({ error: err.message });
    }
  };

  return (
    <div className="min-h-screen bg-gray-100 p-6 text-gray-800">
      <div className="max-w-7xl mx-auto space-y-6">
        
        {/* Header */}
        <header className="flex justify-between items-center bg-white p-4 rounded-lg shadow">
          <h1 className="text-2xl font-bold text-gray-900">Production Event Processing</h1>
          <div className="flex items-center space-x-4">
            <span className="flex items-center">
              <span className={`h-3 w-3 rounded-full mr-2 ${mqttStatus?.connected ? 'bg-green-500' : 'bg-red-500'}`}></span>
              MQTT: {mqttStatus?.connected ? 'Online' : 'Offline'}
            </span>
            <button onClick={fetchData} className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700">Refresh</button>
          </div>
        </header>

        {/* Metrics Grid */}
        <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-6 gap-4">
          {[
            { label: 'Net Total', value: summary?.net_total || 0, color: 'text-blue-600' },
            { label: 'Processed', value: summary?.processed_events || 0 },
            { label: 'Pending Ack', value: summary?.pending_ack || 0, color: 'text-orange-600' },
            { label: 'Unresolved', value: summary?.unresolved || 0, color: 'text-red-600' },
            { label: 'Duplicates', value: summary?.duplicates || 0 },
            { label: 'Conflicts', value: summary?.conflicts || 0, color: 'text-red-600' }
          ].map((m, i) => (
            <div key={i} className="bg-white p-4 rounded-lg shadow flex flex-col items-center justify-center">
              <div className="text-sm text-gray-500 mb-1">{m.label}</div>
              <div className={`text-3xl font-bold ${m.color || 'text-gray-900'}`}>{m.value}</div>
            </div>
          ))}
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Left Column: Tables */}
          <div className="col-span-2 space-y-6">
            <div className="bg-white rounded-lg shadow overflow-hidden">
              <div className="border-b border-gray-200">
                <nav className="flex -mb-px">
                  <button onClick={() => setActiveTab('pending')} className={`w-1/2 py-4 px-1 text-center border-b-2 font-medium text-sm ${activeTab === 'pending' ? 'border-blue-500 text-blue-600' : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'}`}>
                    Pending Acknowledgment ({pending.length})
                  </button>
                  <button onClick={() => setActiveTab('exceptions')} className={`w-1/2 py-4 px-1 text-center border-b-2 font-medium text-sm ${activeTab === 'exceptions' ? 'border-blue-500 text-blue-600' : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'}`}>
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
                        className={`px-4 py-2 rounded text-white ${selectedIds.size > 0 ? 'bg-green-600 hover:bg-green-700' : 'bg-gray-400 cursor-not-allowed'}`}>
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
                          <tr key={p.event_id}>
                            <td className="px-4 py-2">
                              <input type="checkbox" checked={selectedIds.has(p.event_id)} onChange={() => handleToggleSelect(p.event_id)} />
                            </td>
                            <td className="px-4 py-2 font-mono text-xs">{p.event_id}</td>
                            <td className="px-4 py-2">{p.source_id}</td>
                            <td className="px-4 py-2">{p.quantity}</td>
                            <td className="px-4 py-2 text-xs">{new Date(p.event_time).toLocaleString()}</td>
                            <td className="px-4 py-2">
                              {p.voided ? <span className="text-xs bg-red-100 text-red-800 px-2 py-1 rounded">VOIDED</span> : <span className="text-xs bg-green-100 text-green-800 px-2 py-1 rounded">ACCEPTED</span>}
                            </td>
                          </tr>
                        ))}
                        {pending.length === 0 && (
                          <tr><td colSpan="6" className="px-4 py-8 text-center text-gray-500">No pending events</td></tr>
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
                        <tr key={idx}>
                          <td className="px-4 py-2"><span className="text-xs bg-red-100 text-red-800 px-2 py-1 rounded font-mono">{e.kind}</span></td>
                          <td className="px-4 py-2 font-mono text-xs">{e.event_id || 'N/A'}</td>
                          <td className="px-4 py-2 text-red-600">{e.reason}</td>
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
            <div className="bg-white rounded-lg shadow p-4">
              <h2 className="text-lg font-bold mb-4">MQTT Worker Status</h2>
              {mqttStatus ? (
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                  <div>
                    <div className="text-gray-500">Candidate ID</div>
                    <div className="font-mono">{mqttStatus.candidate_id}</div>
                  </div>
                  <div>
                    <div className="text-gray-500">Client ID</div>
                    <div className="font-mono text-xs truncate" title={mqttStatus.client_id}>{mqttStatus.client_id}</div>
                  </div>
                  <div>
                    <div className="text-gray-500">Challenges Received</div>
                    <div className="font-bold">{mqttStatus.counts.received}</div>
                  </div>
                  <div>
                    <div className="text-gray-500">Completed / Failed</div>
                    <div className="font-bold">{mqttStatus.counts.completed} / {mqttStatus.counts.failed}</div>
                  </div>
                  {mqttStatus.last_error && (
                    <div className="col-span-full">
                      <div className="text-red-500">Last Error: {mqttStatus.last_error}</div>
                    </div>
                  )}
                  {mqttStatus.last_challenge && (
                    <div className="col-span-full bg-gray-50 p-2 rounded text-xs font-mono">
                      Last Challenge: {mqttStatus.last_challenge.challenge_id} ({mqttStatus.last_challenge.status})
                    </div>
                  )}
                </div>
              ) : (
                <div className="text-gray-500">Loading MQTT status...</div>
              )}
            </div>
          </div>

          {/* Right Column: Submission Panel */}
          <div className="space-y-6">
            <div className="bg-white rounded-lg shadow p-4">
              <h2 className="text-lg font-bold mb-4">Manual Event Submission (REST)</h2>
              <textarea 
                rows="8"
                className="w-full border-gray-300 rounded shadow-sm font-mono text-xs p-2 focus:ring-blue-500 focus:border-blue-500"
                value={submitPayload}
                onChange={e => setSubmitPayload(e.target.value)}
              />
              <div className="mt-4 flex space-x-2">
                <button 
                  onClick={() => setSubmitPayload(JSON.stringify({
                    source_id: "LINE-01",
                    event_id: `EV-${Math.floor(Math.random()*10000)}`,
                    type: "COUNT",
                    quantity: 10,
                    event_time: new Date().toISOString()
                  }, null, 2))}
                  className="px-3 py-1 bg-gray-200 text-gray-700 rounded text-sm hover:bg-gray-300">
                  + COUNT
                </button>
                <button 
                  onClick={() => setSubmitPayload(JSON.stringify({
                    source_id: "LINE-01",
                    event_id: `EV-VOID-${Math.floor(Math.random()*10000)}`,
                    type: "VOID",
                    target_event_id: `EV-${Math.floor(Math.random()*10000)}`,
                    event_time: new Date().toISOString()
                  }, null, 2))}
                  className="px-3 py-1 bg-gray-200 text-gray-700 rounded text-sm hover:bg-gray-300">
                  + VOID
                </button>
                <div className="flex-1"></div>
                <button onClick={handleSubmitEvent} className="px-4 py-2 bg-blue-600 text-white font-medium rounded hover:bg-blue-700 shadow">
                  Submit
                </button>
              </div>
              
              {submitResult && (
                <div className="mt-4 p-3 bg-gray-50 border border-gray-200 rounded text-xs font-mono overflow-auto max-h-48">
                  <h3 className="font-bold text-gray-700 mb-1">Result:</h3>
                  {JSON.stringify(submitResult, null, 2)}
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
