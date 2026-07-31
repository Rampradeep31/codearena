import { useState, useEffect } from 'react';
import { adminAPI } from '../../services/api';
import { HiOutlineSearch } from 'react-icons/hi';

const typeColors = {
  tab_hidden: 'bg-amber-500/10 text-amber-500',
  window_blur: 'bg-amber-500/10 text-amber-500',
  fullscreen_exit: 'bg-red-500/10 text-red-500',
  copy_attempt: 'bg-purple-500/10 text-purple-500',
  paste_attempt: 'bg-purple-500/10 text-purple-500',
};

export default function Violations() {
  const [violations, setViolations] = useState([]);
  const [tests, setTests] = useState([]);
  const [selectedTest, setSelectedTest] = useState('');
  const [typeFilter, setTypeFilter] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => { loadTests(); }, []);
  useEffect(() => { loadViolations(); }, [selectedTest, typeFilter]);

  const loadTests = async () => {
    try { const res = await adminAPI.getTests(); setTests(res.data); }
    catch { console.error('Error'); }
  };

  const loadViolations = async () => {
    setLoading(true);
    try {
      const params = {};
      if (selectedTest) params.test_id = selectedTest;
      if (typeFilter) params.violation_type = typeFilter;
      const res = await adminAPI.getViolations(params);
      setViolations(res.data);
    } catch { console.error('Error'); }
    finally { setLoading(false); }
  };

  return (
    <div className="space-y-6 animate-fade-in">
      <div>
        <h1 className="text-2xl font-bold text-white">Violations</h1>
        <p className="text-dark-400 text-sm mt-1">Exam proctoring violation history</p>
      </div>

      <div className="flex items-center gap-3">
        <select value={selectedTest} onChange={(e) => setSelectedTest(e.target.value)} className="px-3 py-2 bg-dark-800 border border-dark-600/50 rounded-lg text-sm text-white focus:outline-none focus:border-brand-500">
          <option value="">All Tests</option>
          {tests.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
        </select>
        <select value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)} className="px-3 py-2 bg-dark-800 border border-dark-600/50 rounded-lg text-sm text-white focus:outline-none focus:border-brand-500">
          <option value="">All Types</option>
          {['tab_hidden', 'window_blur', 'fullscreen_exit', 'copy_attempt', 'paste_attempt'].map(t => (
            <option key={t} value={t}>{t.replace('_', ' ')}</option>
          ))}
        </select>
      </div>

      <div className="bg-dark-800 border border-dark-700/50 rounded-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-dark-700/50">
                {['Attempt ID', 'Violation Type', 'Time'].map(h => (
                  <th key={h} className="px-4 py-3 text-left text-xs font-medium text-dark-400 uppercase tracking-wider">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-dark-700/30">
              {loading ? [...Array(5)].map((_, i) => (
                <tr key={i}><td colSpan={3} className="px-4 py-3"><div className="h-4 bg-dark-700 rounded animate-pulse" /></td></tr>
              )) : violations.length === 0 ? (
                <tr><td colSpan={3} className="px-4 py-8 text-center text-dark-500 text-sm">No violations found</td></tr>
              ) : violations.map(v => (
                <tr key={v.id} className="hover:bg-dark-700/20">
                  <td className="px-4 py-3 text-sm text-dark-300 font-mono">#{v.attempt_id}</td>
                  <td className="px-4 py-3"><span className={`text-xs font-medium px-2 py-0.5 rounded-full ${typeColors[v.violation_type] || 'bg-dark-600/30 text-dark-400'}`}>{v.violation_type.replace('_', ' ')}</span></td>
                  <td className="px-4 py-3 text-sm text-dark-400">{new Date(v.created_at).toLocaleString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
