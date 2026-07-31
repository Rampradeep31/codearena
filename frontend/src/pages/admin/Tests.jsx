import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { adminAPI } from '../../services/api';
import toast from 'react-hot-toast';
import { HiOutlinePlus, HiOutlineEye, HiOutlineChartBar, HiOutlinePencil, HiOutlineTrash } from 'react-icons/hi';

export default function Tests() {
  const [tests, setTests] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => { loadTests(); }, []);

  const loadTests = async () => {
    try { const res = await adminAPI.getTests(); setTests(res.data); }
    catch { console.error('Error loading tests'); }
    finally { setLoading(false); }
  };

  const handleDelete = async (id) => {
    if (!confirm('Delete this test?')) return;
    try { await adminAPI.deleteTest(id); toast.success('Test deleted'); loadTests(); }
    catch { toast.error('Error deleting test'); }
  };

  const getStatus = (t) => {
    const now = new Date();
    if (now < new Date(t.start_time)) return { label: 'Upcoming', color: 'bg-amber-500/10 text-amber-500' };
    if (now > new Date(t.end_time)) return { label: 'Completed', color: 'bg-dark-600/30 text-dark-400' };
    return { label: 'Active', color: 'bg-emerald-500/10 text-emerald-500' };
  };

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Tests</h1>
          <p className="text-dark-400 text-sm mt-1">Manage coding assessments</p>
        </div>
        <Link to="/admin/tests/new" className="flex items-center gap-2 px-4 py-2 bg-brand-500 hover:bg-brand-600 text-white rounded-lg text-sm font-medium transition-colors">
          <HiOutlinePlus className="w-4 h-4" /> Create Test
        </Link>
      </div>

      <div className="space-y-3">
        {loading ? [...Array(3)].map((_, i) => (
          <div key={i} className="bg-dark-800 border border-dark-700/50 rounded-xl p-5 animate-pulse">
            <div className="h-5 bg-dark-700 rounded w-48 mb-2" /><div className="h-3 bg-dark-700 rounded w-64" />
          </div>
        )) : tests.length === 0 ? (
          <div className="bg-dark-800 border border-dark-700/50 rounded-xl p-8 text-center text-dark-500">No tests created yet</div>
        ) : tests.map(t => {
          const { label, color } = getStatus(t);
          return (
            <div key={t.id} className="bg-dark-800 border border-dark-700/50 rounded-xl p-5 hover:border-dark-600 transition-colors">
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-1">
                    <h3 className="text-base font-medium text-white">{t.name}</h3>
                    <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${color}`}>{label}</span>
                  </div>
                  <p className="text-xs text-dark-400 mb-2">{t.description || 'No description'}</p>
                  <div className="flex items-center gap-4 text-xs text-dark-500">
                    <span>{t.duration_minutes} min</span>
                    <span>{t.questions_per_student} questions/student</span>
                    <span>{t.question_count || 0} in pool</span>
                    <span>{t.total_marks} marks</span>
                    <span>{new Date(t.start_time).toLocaleDateString()} – {new Date(t.end_time).toLocaleDateString()}</span>
                  </div>
                </div>
                <div className="flex items-center gap-1 ml-4">
                  {label === 'Active' && (
                    <Link to={`/admin/tests/${t.id}/monitor`} className="p-2 text-dark-400 hover:text-emerald-500 transition-colors" title="Live Monitor"><HiOutlineEye className="w-4 h-4" /></Link>
                  )}
                  <Link to={`/admin/tests/${t.id}/results`} className="p-2 text-dark-400 hover:text-brand-400 transition-colors" title="Results"><HiOutlineChartBar className="w-4 h-4" /></Link>
                  <Link to={`/admin/tests/${t.id}/edit`} className="p-2 text-dark-400 hover:text-brand-400 transition-colors" title="Edit"><HiOutlinePencil className="w-4 h-4" /></Link>
                  <button onClick={() => handleDelete(t.id)} className="p-2 text-dark-400 hover:text-red-400 transition-colors" title="Delete"><HiOutlineTrash className="w-4 h-4" /></button>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
