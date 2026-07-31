import { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import { adminAPI } from '../../services/api';
import { HiOutlineArrowLeft, HiOutlineRefresh } from 'react-icons/hi';

const statusColors = {
  not_started: 'bg-dark-600/30 text-dark-400',
  writing: 'bg-emerald-500/10 text-emerald-500',
  submitted: 'bg-brand-500/10 text-brand-400',
  auto_submitted: 'bg-amber-500/10 text-amber-500',
  disconnected: 'bg-red-500/10 text-red-500',
};

export default function LiveMonitor() {
  const { id } = useParams();
  const [students, setStudents] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadData();
    const interval = setInterval(loadData, 5000); // Refresh every 5s
    return () => clearInterval(interval);
  }, [id]);

  const loadData = async () => {
    try { const res = await adminAPI.monitorTest(id); setStudents(res.data); }
    catch { console.error('Monitor error'); }
    finally { setLoading(false); }
  };

  const formatTime = (seconds) => {
    if (!seconds || seconds <= 0) return '—';
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m}:${String(s).padStart(2, '0')}`;
  };

  const stats = {
    total: students.length,
    writing: students.filter(s => s.status === 'writing').length,
    submitted: students.filter(s => ['submitted', 'auto_submitted'].includes(s.status)).length,
    not_started: students.filter(s => s.status === 'not_started').length,
  };

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Link to="/admin/tests" className="p-2 text-dark-400 hover:text-white"><HiOutlineArrowLeft className="w-5 h-5" /></Link>
          <div>
            <h1 className="text-2xl font-bold text-white">Live Monitor</h1>
            <p className="text-dark-400 text-sm">Auto-refreshes every 5 seconds</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-2 h-2 bg-emerald-500 rounded-full animate-pulse" />
          <span className="text-xs text-emerald-500 font-medium">Live</span>
          <button onClick={loadData} className="ml-2 p-2 text-dark-400 hover:text-white"><HiOutlineRefresh className="w-4 h-4" /></button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-4 gap-3">
        {[
          { label: 'Total', value: stats.total, color: 'text-white' },
          { label: 'Writing', value: stats.writing, color: 'text-emerald-500' },
          { label: 'Submitted', value: stats.submitted, color: 'text-brand-400' },
          { label: 'Not Started', value: stats.not_started, color: 'text-dark-400' },
        ].map(({ label, value, color }) => (
          <div key={label} className="bg-dark-800 border border-dark-700/50 rounded-xl px-4 py-3">
            <p className="text-xs text-dark-400 mb-1">{label}</p>
            <p className={`text-2xl font-bold ${color}`}>{value}</p>
          </div>
        ))}
      </div>

      {/* Table */}
      <div className="bg-dark-800 border border-dark-700/50 rounded-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-dark-700/50">
                {['Student', 'Register No.', 'Status', 'Questions', 'Submitted', 'Violations', 'Time Left'].map(h => (
                  <th key={h} className="px-4 py-3 text-left text-xs font-medium text-dark-400 uppercase tracking-wider">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-dark-700/30">
              {loading ? [...Array(5)].map((_, i) => (
                <tr key={i}><td colSpan={7} className="px-4 py-3"><div className="h-4 bg-dark-700 rounded animate-pulse" /></td></tr>
              )) : students.map(s => (
                <tr key={s.student_id} className="hover:bg-dark-700/20">
                  <td className="px-4 py-3 text-sm text-white font-medium">{s.student_name}</td>
                  <td className="px-4 py-3 text-sm text-dark-300 font-mono">{s.register_number}</td>
                  <td className="px-4 py-3"><span className={`text-xs font-medium px-2 py-0.5 rounded-full ${statusColors[s.status] || statusColors.not_started}`}>{s.status.replace('_', ' ')}</span></td>
                  <td className="px-4 py-3 text-sm text-dark-300">{s.questions_attempted}</td>
                  <td className="px-4 py-3 text-sm text-dark-300">{s.questions_submitted}</td>
                  <td className="px-4 py-3">
                    <span className={`text-sm font-mono ${s.violation_count > 0 ? 'text-amber-500' : 'text-dark-400'}`}>{s.violation_count}</span>
                  </td>
                  <td className="px-4 py-3 text-sm text-dark-300 font-mono">{formatTime(s.remaining_seconds)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
