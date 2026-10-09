const fs = require('fs');
const path = require('path');

const appPath = path.join(__dirname, 'frontend/src/App.jsx');
let content = fs.readFileSync(appPath, 'utf8');

// 1. Add processed state
content = content.replace(
  /const \[exceptions, setExceptions\] = useState\(\[\]\);/,
  `const [exceptions, setExceptions] = useState([]);
  const [processed, setProcessed] = useState([]);`
);

// 2. Fetch processed data
content = content.replace(
  /const \[sumRes, pendRes, excRes, mqttRes\] = await Promise\.all\(\[\n\s*fetch\(`\/api\/state\?view=summary\$\{qs\}`.*\n\s*fetch\(`\/api\/state\?view=pending\$\{qs\}`.*\n\s*fetch\(`\/api\/state\?view=exceptions\$\{qs\}`.*\n\s*fetch\('\/api\/mqtt\/status'.*\n\s*\]\);\n\s*setSummary\(sumRes\);\n\s*setPending\(pendRes\);\n\s*setExceptions\(excRes\);\n\s*setMqttStatus\(mqttRes\);/m,
  `const [sumRes, pendRes, excRes, procRes, mqttRes] = await Promise.all([
        fetch(\`/api/state?view=summary\${qs}\`, { signal: abortSignal }).then(r => r.json()),
        fetch(\`/api/state?view=pending\${qs}\`, { signal: abortSignal }).then(r => r.json()),
        fetch(\`/api/state?view=exceptions\${qs}\`, { signal: abortSignal }).then(r => r.json()),
        fetch(\`/api/state?view=processed\${qs}\`, { signal: abortSignal }).then(r => r.json()),
        fetch('/api/mqtt/status', { signal: abortSignal }).then(r => r.json())
      ]);
      setSummary(sumRes);
      setPending(pendRes);
      setExceptions(excRes);
      setProcessed(procRes);
      setMqttStatus(mqttRes);`
);

// 3. Make cards clickable
content = content.replace(
  /\{ label: 'Net Total'([\s\S]*?)label: 'Conflicts', value: summary\?\.conflicts \|\| 0, gradient: 'from-rose-500\/10 to-red-500\/10', border: 'border-rose-500\/30', text: 'text-rose-400' \}/m,
  `{ label: 'Net Total', value: summary?.net_total || 0, gradient: 'from-indigo-500/20 to-purple-500/20', border: 'border-indigo-500/30', text: 'text-white', onClick: () => setActiveTab('processed') },
            { label: 'Processed', value: summary?.processed_events || 0, gradient: 'from-[#131B2F] to-[#131B2F]', border: 'border-[#1E293B]', text: 'text-[#94A3B8]', onClick: () => setActiveTab('processed') },
            { label: 'Pending Ack', value: summary?.pending_ack || 0, gradient: 'from-amber-500/10 to-orange-500/10', border: 'border-amber-500/30', text: 'text-amber-400', onClick: () => setActiveTab('pending') },
            { label: 'Unresolved', value: summary?.unresolved || 0, gradient: 'from-rose-500/10 to-pink-500/10', border: 'border-rose-500/30', text: 'text-rose-400', onClick: () => setActiveTab('exceptions') },
            { label: 'Duplicates', value: summary?.duplicates || 0, gradient: 'from-[#131B2F] to-[#131B2F]', border: 'border-[#1E293B]', text: 'text-[#94A3B8]', onClick: () => setActiveTab('exceptions'), onClear: async () => {
                await fetch(\`/api/state/duplicates\${sourceFilter ? '?source_id=' + sourceFilter : ''}\`, { method: 'DELETE' });
                fetchData();
              }
            },
            { label: 'Conflicts', value: summary?.conflicts || 0, gradient: 'from-rose-500/10 to-red-500/10', border: 'border-rose-500/30', text: 'text-rose-400', onClick: () => setActiveTab('exceptions') }`
);

content = content.replace(
  /className=\{`p-6 rounded-3xl border \$\{m\.border\} bg-gradient-to-br \$\{m\.gradient\} backdrop-blur-xl shadow-lg relative overflow-hidden group hover:scale-\[1\.02\] transition-transform duration-300 flex flex-col justify-between`\}/g,
  `className={\`p-6 rounded-3xl border \${m.border} bg-gradient-to-br \${m.gradient} backdrop-blur-xl shadow-lg relative overflow-hidden group hover:scale-[1.02] transition-transform duration-300 flex flex-col justify-between \${m.onClick ? 'cursor-pointer' : ''}\`} onClick={m.onClick}`
);

// 4. Update the 7th card to be clickable
content = content.replace(
  /<div className="p-6 rounded-3xl border border-amber-500\/50 border-dashed bg-gradient-to-br from-amber-600\/10 to-orange-600\/10 backdrop-blur-xl shadow-lg relative overflow-hidden group transition-transform duration-300 flex flex-col justify-between">/m,
  `<div className="p-6 rounded-3xl border border-amber-500/50 border-dashed bg-gradient-to-br from-amber-600/10 to-orange-600/10 backdrop-blur-xl shadow-lg relative overflow-hidden group hover:scale-[1.02] transition-transform duration-300 flex flex-col justify-between cursor-pointer" onClick={() => setActiveTab('exceptions')}>`
);

// 5. Add Processed Tab and Exceptions Clear button
content = content.replace(
  /<button onClick=\{\(\) => setActiveTab\('exceptions'\)\}.*?\n.*?\n.*?(<\/button>)/m,
  `$&
                <button onClick={() => setActiveTab('processed')} className={\`flex-1 py-3 px-6 rounded-2xl text-sm font-bold transition-all duration-300 \${activeTab === 'processed' ? 'bg-[#1E293B] text-white shadow-md' : 'text-[#64748B] hover:text-[#E2E8F0] hover:bg-[#1E293B]/50'}\`}>
                  Processed <span className={\`ml-2 px-2 py-0.5 rounded-full text-xs \${activeTab === 'processed' ? 'bg-teal-500/20 text-teal-400' : 'bg-[#0B0F19] text-[#64748B]'}\`}>{processed.length}</span>
                </button>`
);

content = content.replace(
  /\{activeTab === 'pending' \? \([\s\S]*?\) : \(\n\s*<div className="p-6">/m,
  `$&
                    <div className="mb-6 flex justify-between items-center bg-[#0B0F19]/80 p-4 rounded-2xl border border-[#1E293B]">
                       <h3 className="text-white font-bold tracking-widest uppercase text-sm">System Exceptions</h3>
                       <button onClick={async () => {
                         await fetch(\`/api/state/exceptions\${sourceFilter ? '?source_id=' + sourceFilter : ''}\`, { method: 'DELETE' });
                         fetchData();
                       }} className="px-6 py-2 rounded-xl text-xs font-bold transition-all duration-300 bg-rose-500/20 text-rose-400 border border-rose-500/30 hover:bg-rose-500 hover:text-white">
                         Solve Exceptions
                       </button>
                    </div>`
);

// 6. Add Processed Table
// The current logic is: {activeTab === 'pending' ? (pending div) : (exceptions div)}
// We need to change it to nested ternaries or an if/else block inside a function.
// Let's replace the block with a switch or just nested ternaries.
// `activeTab === 'pending' ? (...) : activeTab === 'exceptions' ? (...) : (...)`

content = content.replace(
  /\{activeTab === 'pending' \? \([\s\S]*?\) : \([\s\S]*?\}\n\s*<\/div>\n\s*\)\}/m,
  `{activeTab === 'pending' ? (
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
                        className={\`px-6 py-3 rounded-xl text-sm font-bold transition-all duration-300 flex items-center gap-3 \${selectedIds.size > 0 ? 'bg-gradient-to-r from-teal-400 to-emerald-500 text-[#064E3B] shadow-[0_0_20px_rgba(45,212,191,0.4)] hover:shadow-[0_0_30px_rgba(45,212,191,0.6)] hover:-translate-y-1' : 'bg-[#1E293B] text-[#64748B] cursor-not-allowed'}\`}>
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
                            <tr key={p.event_id} className={\`transition-colors duration-200 \${selectedIds.has(p.event_id) ? 'bg-indigo-500/10' : 'hover:bg-[#1E293B]/50'}\`}>
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
                ) : activeTab === 'exceptions' ? (
                  <div className="p-6">
                    <div className="mb-6 flex justify-between items-center bg-[#0B0F19]/80 p-4 rounded-2xl border border-[#1E293B]">
                       <h3 className="text-white font-bold tracking-widest uppercase text-sm">System Exceptions</h3>
                       <button onClick={async () => {
                         await fetch(\`/api/state/exceptions\${sourceFilter ? '?source_id=' + sourceFilter : ''}\`, { method: 'DELETE' });
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
                ) : (
                  <div className="p-6">
                    <div className="rounded-2xl overflow-hidden border border-[#1E293B]">
                      <table className="min-w-full divide-y divide-[#1E293B] text-sm">
                        <thead className="bg-[#0B0F19]">
                          <tr>
                            <th className="px-6 py-5 text-left text-xs font-bold text-[#64748B] uppercase tracking-widest">Event ID</th>
                            <th className="px-6 py-5 text-left text-xs font-bold text-[#64748B] uppercase tracking-widest">Source</th>
                            <th className="px-6 py-5 text-left text-xs font-bold text-[#64748B] uppercase tracking-widest">Type</th>
                            <th className="px-6 py-5 text-left text-xs font-bold text-[#64748B] uppercase tracking-widest">Qty</th>
                            <th className="px-6 py-5 text-left text-xs font-bold text-[#64748B] uppercase tracking-widest">Received At</th>
                            <th className="px-6 py-5 text-left text-xs font-bold text-[#64748B] uppercase tracking-widest">Status</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-[#1E293B] bg-[#131B2F]/50">
                          {processed.map((p, idx) => (
                            <tr key={idx} className="hover:bg-[#1E293B]/50 transition-colors">
                              <td className="px-6 py-5 font-['JetBrains_Mono'] text-xs text-[#94A3B8]">{p.event_id}</td>
                              <td className="px-6 py-5 font-bold text-white">{p.source_id}</td>
                              <td className="px-6 py-5 text-[#94A3B8] font-bold">{p.type}</td>
                              <td className="px-6 py-5 font-['JetBrains_Mono'] font-bold text-teal-400">{p.quantity || '-'}</td>
                              <td className="px-6 py-5 text-xs font-medium text-[#64748B]">{new Date(p.received_at).toLocaleString()}</td>
                              <td className="px-6 py-5">
                                {p.voided ? <span className="inline-flex items-center px-3 py-1 rounded-lg text-[11px] font-bold bg-rose-500/10 text-rose-400 border border-rose-500/30 uppercase tracking-widest">VOIDED</span> : <span className="inline-flex items-center px-3 py-1 rounded-lg text-[11px] font-bold bg-teal-500/10 text-teal-400 border border-teal-500/30 uppercase tracking-widest">ACCEPTED</span>}
                              </td>
                            </tr>
                          ))}
                          {processed.length === 0 && (
                            <tr><td colSpan="6" className="px-6 py-20 text-center text-[#64748B]">
                              <div className="flex flex-col items-center justify-center gap-4">
                                <div className="w-16 h-16 rounded-2xl bg-[#0B0F19] flex items-center justify-center border border-[#1E293B]">
                                  <svg className="w-8 h-8 text-[#334155]" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg>
                                </div>
                                <span className="font-bold tracking-wide">No processed events found</span>
                              </div>
                            </td></tr>
                          )}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}`
);

fs.writeFileSync(appPath, content);
console.log("App.jsx patched with Processed tab and Solve Exceptions button!");
