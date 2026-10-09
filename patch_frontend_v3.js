const fs = require('fs');
const path = require('path');

const appPath = path.join(__dirname, 'frontend/src/App.jsx');
let content = fs.readFileSync(appPath, 'utf8');

// 1. Add autoSimulate state
content = content.replace(
  /const \[autoRefresh, setAutoRefresh\] = useState\(true\);/,
  `const [autoRefresh, setAutoRefresh] = useState(true);
  const [autoSimulate, setAutoSimulate] = useState(false);`
);

// 2. Add useEffect for autoSimulate
content = content.replace(
  /useEffect\(\(\) => \{\n\s*const controller = new AbortController\(\);[\s\S]*?\}, \[fetchData, autoRefresh\]\);/,
  `$&
  
  useEffect(() => {
    let interval;
    if (autoSimulate) {
      interval = setInterval(() => {
        const payload = [
          {
            source_id: Math.random() > 0.5 ? "LINE-01" : "LINE-02",
            event_id: \`EV-SIM-\${Math.floor(Math.random()*1000000)}\`,
            type: "COUNT",
            quantity: Math.floor(Math.random() * 20) + 1,
            event_time: new Date().toISOString()
          }
        ];
        fetch('/api/events', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        }).then(() => fetchData());
      }, 3000);
    }
    return () => clearInterval(interval);
  }, [autoSimulate, fetchData]);`
);

// 3. Add toggle UI for autoSimulate
content = content.replace(
  /<label className="flex items-center gap-3 cursor-pointer group px-3">\n\s*<div className="relative">\n\s*<input type="checkbox" checked=\{autoRefresh\} onChange=\{e => setAutoRefresh\(e\.target\.checked\)\} className="sr-only" \/>\n\s*<div className=\{`w-11 h-6 rounded-full transition-colors duration-300 \$\{autoRefresh \? 'bg-indigo-500' : 'bg-\[#2D3748\]'\}`\}><\/div>\n\s*<div className=\{`absolute left-1 top-1 bg-white w-4 h-4 rounded-full transition-transform duration-300 shadow-sm \$\{autoRefresh \? 'translate-x-5' : 'translate-x-0'\}`\}><\/div>\n\s*<\/div>\n\s*<span className="text-\[#94A3B8\] group-hover:text-white transition-colors text-xs font-bold uppercase tracking-widest">Auto-Sync<\/span>\n\s*<\/label>\n\s*<div className="h-8 w-px bg-\[#2D3748\]"><\/div>/m,
  `$&
            <label className="flex items-center gap-3 cursor-pointer group px-3">
              <div className="relative">
                <input type="checkbox" checked={autoSimulate} onChange={e => setAutoSimulate(e.target.checked)} className="sr-only" />
                <div className={\`w-11 h-6 rounded-full transition-colors duration-300 \${autoSimulate ? 'bg-teal-500' : 'bg-[#2D3748]'}\`}></div>
                <div className={\`absolute left-1 top-1 bg-white w-4 h-4 rounded-full transition-transform duration-300 shadow-sm \${autoSimulate ? 'translate-x-5' : 'translate-x-0'}\`}></div>
              </div>
              <span className="text-[#94A3B8] group-hover:text-white transition-colors text-xs font-bold uppercase tracking-widest">Simulate Traffic</span>
            </label>
            <div className="h-8 w-px bg-[#2D3748]"></div>`
);

fs.writeFileSync(appPath, content);
console.log("App.jsx patched with autoSimulate feature");
