const fs = require('fs');
const path = require('path');

const appPath = path.join(__dirname, 'frontend/src/App.jsx');
let content = fs.readFileSync(appPath, 'utf8');

// 1. Initial State
content = content.replace(
  /const \[sourceFilter, setSourceFilter\] = useState\(''\);/,
  `const [sourceFilter, setSourceFilter] = useState(() => new URLSearchParams(window.location.search).get('source') || '');
  const [filterInput, setFilterInput] = useState(() => new URLSearchParams(window.location.search).get('source') || '');`
);

// 2. FetchData and AbortController
content = content.replace(
  /const fetchData = useCallback\(async \(\) => \{\n\s*try \{\n\s*const qs = sourceFilter \? `&source_id=\$\{encodeURIComponent\(sourceFilter\)\}` : '';\n\s*const \[sumRes, pendRes, excRes, mqttRes\] = await Promise\.all\(\[\n\s*fetch\(`\/api\/state\?view=summary\$\{qs\}`\)\.then\(r => r\.json\(\)\),\n\s*fetch\(`\/api\/state\?view=pending\$\{qs\}`\)\.then\(r => r\.json\(\)\),\n\s*fetch\(`\/api\/state\?view=exceptions\$\{qs\}`\)\.then\(r => r\.json\(\)\),\n\s*fetch\('\/api\/mqtt\/status'\)\.then\(r => r\.json\(\)\)\n\s*\]\);\n\s*setSummary\(sumRes\);\n\s*setPending\(pendRes\);\n\s*setExceptions\(excRes\);\n\s*setMqttStatus\(mqttRes\);\n\s*\} catch \(err\) \{\n\s*console\.error\("Error fetching data:", err\);\n\s*\}\n\s*\}, \[sourceFilter\]\);/,
  `const fetchData = useCallback(async (abortSignal) => {
    try {
      const qs = sourceFilter ? \`&source_id=\${encodeURIComponent(sourceFilter)}\` : '';
      const [sumRes, pendRes, excRes, mqttRes] = await Promise.all([
        fetch(\`/api/state?view=summary\${qs}\`, { signal: abortSignal }).then(r => r.json()),
        fetch(\`/api/state?view=pending\${qs}\`, { signal: abortSignal }).then(r => r.json()),
        fetch(\`/api/state?view=exceptions\${qs}\`, { signal: abortSignal }).then(r => r.json()),
        fetch('/api/mqtt/status', { signal: abortSignal }).then(r => r.json())
      ]);
      setSummary(sumRes);
      setPending(pendRes);
      setExceptions(excRes);
      setMqttStatus(mqttRes);
    } catch (err) {
      if (err.name !== 'AbortError') {
        console.error("Error fetching data:", err);
      }
    }
  }, [sourceFilter]);`
);

// 3. useEffect AbortController
content = content.replace(
  /useEffect\(\(\) => \{\n\s*fetchData\(\);\n\s*let interval;\n\s*if \(autoRefresh\) \{\n\s*interval = setInterval\(fetchData, 5000\);\n\s*\}\n\s*return \(\) => clearInterval\(interval\);\n\s*\}, \[fetchData, autoRefresh\]\);/,
  `useEffect(() => {
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
  };`
);

// 4. Source Filter UI
content = content.replace(
  /<div className="flex items-center gap-3 px-3">\s*<label className="text-xs font-bold uppercase tracking-widest text-\[#64748B\]">Source<\/label>\s*<select[\s\S]*?<\/select>\s*<\/div>/,
  `<div className="flex flex-wrap items-center gap-2 px-3">
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
            </div>`
);

// 5. Grid UI
content = content.replace(
  /<div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-5">\s*\{\[\s*\{ label: 'Net Total'[\s\S]*?\}\s*\]\.map\(\(m, i\) => \(\s*<div key=\{i\}[\s\S]*?<\/div>\s*\)\)\s*<\/div>/,
  `<div>
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-5 mb-5">
            {[
              { label: 'Net Total', value: summary?.net_total || 0, gradient: 'from-indigo-500/20 to-purple-500/20', border: 'border-indigo-500/30', text: 'text-white' },
              { label: 'Processed', value: summary?.processed_events || 0, gradient: 'from-[#131B2F] to-[#131B2F]', border: 'border-[#1E293B]', text: 'text-[#94A3B8]' },
              { label: 'Pending Ack', value: summary?.pending_ack || 0, gradient: 'from-amber-500/10 to-orange-500/10', border: 'border-amber-500/30', text: 'text-amber-400' },
              { label: 'Unresolved', value: summary?.unresolved || 0, gradient: 'from-rose-500/10 to-pink-500/10', border: 'border-rose-500/30', text: 'text-rose-400' },
              { label: 'Duplicates', value: summary?.duplicates || 0, gradient: 'from-[#131B2F] to-[#131B2F]', border: 'border-[#1E293B]', text: 'text-[#94A3B8]', onClear: async () => {
                  await fetch(\`/api/state/duplicates\${sourceFilter ? '?source_id=' + sourceFilter : ''}\`, { method: 'DELETE' });
                  fetchData();
                }
              },
              { label: 'Conflicts', value: summary?.conflicts || 0, gradient: 'from-rose-500/10 to-red-500/10', border: 'border-rose-500/30', text: 'text-rose-400' }
            ].map((m, i) => (
              <div key={i} className={\`p-6 rounded-3xl border \${m.border} bg-gradient-to-br \${m.gradient} backdrop-blur-xl shadow-lg relative overflow-hidden group hover:scale-[1.02] transition-transform duration-300 flex flex-col justify-between\`}>
                <div className="absolute top-0 right-0 w-24 h-24 bg-white opacity-[0.02] rounded-full -translate-y-8 translate-x-8 group-hover:scale-150 transition-transform duration-700"></div>
                <div className="flex justify-between items-start mb-3">
                  <div className="text-[10px] font-bold text-[#64748B] uppercase tracking-widest">{m.label}</div>
                  {m.onClear && m.value > 0 && (
                    <button onClick={m.onClear} className="text-[#64748B] hover:text-rose-400 transition-colors z-20" title="Clear">
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"></path></svg>
                    </button>
                  )}
                </div>
                <div className={\`text-4xl font-['Outfit'] font-black tracking-tight \${m.text}\`}>{m.value}</div>
              </div>
            ))}
          </div>

          {/* Submission Quality Group (7th distinct indicator) */}
          <div className="grid grid-cols-1">
            <div className="p-6 rounded-3xl border border-amber-500/50 border-dashed bg-gradient-to-br from-amber-600/10 to-orange-600/10 backdrop-blur-xl shadow-lg relative overflow-hidden group transition-transform duration-300 flex flex-col justify-between">
              <div className="absolute top-0 right-0 w-24 h-24 bg-white opacity-[0.02] rounded-full -translate-y-8 translate-x-8 group-hover:scale-150 transition-transform duration-700"></div>
              <div className="flex justify-between items-start mb-3">
                <div className="flex flex-col">
                  <div className="text-[10px] font-bold text-[#64748B] uppercase tracking-widest text-amber-500/80">Submission Quality</div>
                  <div className="text-sm font-bold text-amber-500 uppercase tracking-widest mt-1 flex items-center gap-2">
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"></path></svg>
                    Rejected Submissions
                  </div>
                  <div className="text-xs text-amber-500/60 font-medium mt-1">Not part of production totals</div>
                </div>
              </div>
              <div className="text-4xl font-['Outfit'] font-black tracking-tight text-amber-400">
                {summary ? (summary.rejected_submissions ?? 0) : '—'}
              </div>
            </div>
          </div>
        </div>`
);

fs.writeFileSync(appPath, content);
console.log("App.jsx patched successfully!");
