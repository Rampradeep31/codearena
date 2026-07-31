import { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import { adminAPI } from '../../services/api';
import toast from 'react-hot-toast';
import { HiOutlineArrowLeft, HiOutlineDownload, HiOutlineSearch } from 'react-icons/hi';

export default function Results() {
  const { id } = useParams();
  const [results, setResults] = useState([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => { loadResults(); }, [id]);

  const loadResults = async () => {
    try { const res = await adminAPI.getTestResults(id); setResults(res.data); }
    catch { toast.error('Error loading results'); }
    finally { setLoading(false); }
  };

  const filtered = results.filter(r =>
    r.student_name.toLowerCase().includes(search.toLowerCase()) ||
    r.register_number.toLowerCase().includes(search.toLowerCase())
  );

  const exportCSV = () => {
    const headers = ['Rank', 'Student Name', 'Register Number', 'Department', 'Questions Assigned', 'Questions Attempted', 'Questions Solved', 'Score', 'Total', 'Percentage', 'Violations', 'Submission Type', 'Submitted At'];
    const rows = filtered.map(r => [r.rank, r.student_name, r.register_number, r.department || '', r.questions_assigned, r.questions_attempted, r.questions_solved, r.score, r.total_possible, r.percentage, r.violation_count, r.submission_type || '', r.submitted_at || '']);
    const csv = [headers, ...rows].map(row => row.join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = `results_test_${id}.csv`; a.click();
    URL.revokeObjectURL(url);
    toast.success('CSV exported');
  };

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Link to="/admin/tests" className="p-2 text-dark-400 hover:text-white"><HiOutlineArrowLeft className="w-5 h-5" /></Link>
          <div>
            <h1 className="text-2xl font-bold text-white">Results</h1>
            <p className="text-dark-400 text-sm">{results.length} submissions</p>
          </div>
        </div>
        <button onClick={exportCSV} className="flex items-center gap-2 px-4 py-2 bg-dark-800 border border-dark-600/50 rounded-lg text-sm text-dark-300 hover:text-white hover:border-dark-500">
          <HiOutlineDownload className="w-4 h-4" /> Export CSV
        </button>
      </div>

      <div className="relative max-w-sm">
        <HiOutlineSearch className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-dark-500" />
        <input type="text" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search students..." className="w-full pl-9 pr-4 py-2 bg-dark-800 border border-dark-600/50 rounded-lg text-sm text-white placeholder-dark-500 focus:outline-none focus:border-brand-500" />
      </div>

      <div className="bg-dark-800 border border-dark-700/50 rounded-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-dark-700/50">
                {['#', 'Student', 'Reg. No.', 'Dept', 'Assigned', 'Attempted', 'Solved', 'Score', 'Percentage', 'Violations', 'Type', 'Time'].map(h => (
                  <th key={h} className="px-3 py-3 text-left text-xs font-medium text-dark-400 uppercase tracking-wider whitespace-nowrap">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-dark-700/30">
              {loading ? [...Array(5)].map((_, i) => (
                <tr key={i}><td colSpan={12} className="px-3 py-3"><div className="h-4 bg-dark-700 rounded animate-pulse" /></td></tr>
              )) : filtered.length === 0 ? (
                <tr><td colSpan={12} className="px-3 py-8 text-center text-dark-500 text-sm">No results</td></tr>
              ) : filtered.map(r => (
                <tr key={r.register_number} className="hover:bg-dark-700/20">
                  <td className="px-3 py-3 text-sm font-bold text-brand-400">{r.rank}</td>
                  <td className="px-3 py-3 text-sm text-white font-medium">{r.student_name}</td>
                  <td className="px-3 py-3 text-sm text-dark-300 font-mono">{r.register_number}</td>
                  <td className="px-3 py-3 text-sm text-dark-400">{r.department || '—'}</td>
                  <td className="px-3 py-3 text-sm text-dark-300">{r.questions_assigned}</td>
                  <td className="px-3 py-3 text-sm text-dark-300">{r.questions_attempted}</td>
                  <td className="px-3 py-3 text-sm text-emerald-500">{r.questions_solved}</td>
                  <td className="px-3 py-3 text-sm text-white font-semibold">{r.score}/{r.total_possible}</td>
                  <td className="px-3 py-3 text-sm text-dark-300">{r.percentage}%</td>
                  <td className="px-3 py-3"><span className={`text-sm font-mono ${r.violation_count > 0 ? 'text-amber-500' : 'text-dark-400'}`}>{r.violation_count}</span></td>
                  <td className="px-3 py-3"><span className={`text-xs font-medium px-2 py-0.5 rounded-full ${r.submission_type === 'manual' ? 'bg-brand-500/10 text-brand-400' : r.submission_type === 'violation_limit' ? 'bg-red-500/10 text-red-500' : 'bg-amber-500/10 text-amber-500'}`}>{r.submission_type || '—'}</span></td>
                  <td className="px-3 py-3 text-xs text-dark-400">{r.submitted_at ? new Date(r.submitted_at).toLocaleString() : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
