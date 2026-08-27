import { useState, useEffect } from 'react';
import { gateAdminAPI } from '../../../services/gateApi';
import toast from 'react-hot-toast';
import { HiOutlinePlus, HiOutlineTrash, HiOutlinePencil, HiOutlineX, HiOutlineCheckCircle, HiOutlineClock, HiOutlineClipboardList } from 'react-icons/hi';

const SUBJECTS = ['Mathematics', 'General Aptitude', 'Algorithms', 'Operating Systems', 'DBMS', 'Computer Networks', 'Digital Logic', 'Programming & DS', 'Theory of Computation', 'Compiler Design', 'Software Engineering'];

function TestModal({ test, onClose, onSave }) {
  const [questions, setQuestions] = useState([]);
  const [allQuestions, setAllQuestions] = useState([]);
  const [loadingQs, setLoadingQs] = useState(true);
  const [form, setForm] = useState(test || {
    title: '', description: '', duration_minutes: 180, total_marks: 100,
    is_active: true, start_time: '', end_time: '', instructions: '', question_ids: [],
  });
  const [saving, setSaving] = useState(false);

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  useEffect(() => {
    gateAdminAPI.listQuestions({}).then(r => setAllQuestions(r.data)).finally(() => setLoadingQs(false));
    if (test?.id) {
      gateAdminAPI.getTestQuestions(test.id).then(r => {
        setQuestions(r.data);
        setForm(f => ({ ...f, question_ids: r.data.map(q => q.id) }));
      });
    }
  }, [test?.id]);

  const toggleQuestion = (id) => {
    setForm(f => {
      const ids = f.question_ids || [];
      return { ...f, question_ids: ids.includes(id) ? ids.filter(x => x !== id) : [...ids, id] };
    });
  };

  const handleSave = async () => {
    if (!form.title.trim()) { toast.error('Title is required'); return; }
    setSaving(true);
    try {
      const payload = {
        title: form.title, description: form.description, duration_minutes: parseInt(form.duration_minutes),
        total_marks: parseFloat(form.total_marks), is_active: form.is_active,
        start_time: form.start_time || null, end_time: form.end_time || null,
        instructions: form.instructions, question_ids: form.question_ids || [],
      };
      let res;
      if (test?.id) res = await gateAdminAPI.updateTest(test.id, payload);
      else res = await gateAdminAPI.createTest(payload);
      toast.success(test?.id ? 'Test updated' : 'Test created');
      onSave(res.data);
    } catch (e) { toast.error(e.message || 'Failed to save'); }
    finally { setSaving(false); }
  };

  const selectedIds = new Set(form.question_ids || []);
  const totalMarks = allQuestions.filter(q => selectedIds.has(q.id)).reduce((s, q) => s + q.marks, 0);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
      <div className="bg-dark-900 border border-dark-700/60 rounded-2xl w-full max-w-3xl max-h-[90vh] overflow-y-auto shadow-2xl">
        <div className="flex items-center justify-between p-5 border-b border-dark-700/50">
          <h3 className="text-white font-bold text-lg">{test?.id ? 'Edit Test' : 'Create GATE Test'}</h3>
          <button onClick={onClose} className="p-2 rounded-lg hover:bg-dark-800 text-dark-400 hover:text-white transition-colors"><HiOutlineX className="w-5 h-5" /></button>
        </div>
        <div className="p-5 space-y-4">
          <div>
            <label className="text-dark-400 text-xs font-semibold block mb-1">Test Title *</label>
            <input value={form.title} onChange={e => set('title', e.target.value)} className="w-full bg-dark-800 border border-dark-600 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-amber-500" placeholder="e.g. GATE 2025 Mock Test 1" />
          </div>
          <div>
            <label className="text-dark-400 text-xs font-semibold block mb-1">Description</label>
            <textarea value={form.description || ''} onChange={e => set('description', e.target.value)} rows={2} className="w-full bg-dark-800 border border-dark-600 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-amber-500 resize-none" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-dark-400 text-xs font-semibold block mb-1">Duration (minutes)</label>
              <input type="number" value={form.duration_minutes} onChange={e => set('duration_minutes', e.target.value)} className="w-full bg-dark-800 border border-dark-600 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-amber-500" />
            </div>
            <div>
              <label className="text-dark-400 text-xs font-semibold block mb-1">Status</label>
              <select value={form.is_active ? 'true' : 'false'} onChange={e => set('is_active', e.target.value === 'true')} className="w-full bg-dark-800 border border-dark-600 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-amber-500">
                <option value="false">Draft</option>
                <option value="true">Active (Visible to students)</option>
              </select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-dark-400 text-xs font-semibold block mb-1">Start Time (optional)</label>
              <input type="datetime-local" value={form.start_time || ''} onChange={e => set('start_time', e.target.value)} className="w-full bg-dark-800 border border-dark-600 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-amber-500" />
            </div>
            <div>
              <label className="text-dark-400 text-xs font-semibold block mb-1">End Time (optional)</label>
              <input type="datetime-local" value={form.end_time || ''} onChange={e => set('end_time', e.target.value)} className="w-full bg-dark-800 border border-dark-600 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-amber-500" />
            </div>
          </div>
          <div>
            <label className="text-dark-400 text-xs font-semibold block mb-1">Instructions</label>
            <textarea value={form.instructions || ''} onChange={e => set('instructions', e.target.value)} rows={3} className="w-full bg-dark-800 border border-dark-600 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-amber-500 resize-none" placeholder="Exam instructions shown to students before starting..." />
          </div>

          {/* Question Selector */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-dark-400 text-xs font-semibold">Questions ({selectedIds.size} selected · {totalMarks} marks)</label>
            </div>
            <div className="max-h-48 overflow-y-auto space-y-1 border border-dark-700/50 rounded-xl p-2 bg-dark-800/30">
              {loadingQs ? (
                <p className="text-dark-500 text-xs text-center py-4">Loading questions...</p>
              ) : allQuestions.length === 0 ? (
                <p className="text-dark-500 text-xs text-center py-4">No questions in bank yet.</p>
              ) : allQuestions.map(q => (
                <label key={q.id} className={`flex items-center gap-2 p-2 rounded-lg cursor-pointer transition-all ${selectedIds.has(q.id) ? 'bg-amber-500/10 border border-amber-500/20' : 'hover:bg-dark-800'}`}>
                  <input type="checkbox" checked={selectedIds.has(q.id)} onChange={() => toggleQuestion(q.id)} className="accent-amber-500 w-3.5 h-3.5" />
                  <span className={`text-xs font-bold px-1.5 py-0.5 rounded ${q.question_type === 'MCQ' ? 'bg-blue-500/15 text-blue-400' : 'bg-purple-500/15 text-purple-400'}`}>{q.question_type}</span>
                  <span className="text-dark-300 text-xs flex-1 truncate">{q.statement.slice(0, 80)}...</span>
                  <span className="text-amber-400 text-xs font-bold flex-shrink-0">{q.marks}M</span>
                </label>
              ))}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-3 p-5 border-t border-dark-700/50">
          <button onClick={onClose} className="flex-1 px-4 py-2 rounded-xl border border-dark-600 text-dark-300 hover:text-white hover:bg-dark-800 transition-all text-sm font-semibold">Cancel</button>
          <button onClick={handleSave} disabled={saving} className="flex-1 px-4 py-2 rounded-xl bg-gradient-to-r from-amber-500 to-orange-500 text-white font-bold text-sm hover:opacity-90 disabled:opacity-50 transition-all">
            {saving ? 'Saving...' : test?.id ? 'Update Test' : 'Create Test'}
          </button>
        </div>
      </div>
    </div>
  );
}

export default function GateTests() {
  const [tests, setTests] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editTest, setEditTest] = useState(null);
  const [showCreate, setShowCreate] = useState(false);
  const [deletingId, setDeletingId] = useState(null);

  const load = async () => {
    setLoading(true);
    try { const res = await gateAdminAPI.listTests(); setTests(res.data); }
    catch { toast.error('Failed to load tests'); }
    finally { setLoading(false); }
  };

  useEffect(() => { load(); }, []);

  const handleSave = (t) => {
    setTests(ts => {
      const idx = ts.findIndex(x => x.id === t.id);
      if (idx >= 0) { const n = [...ts]; n[idx] = t; return n; }
      return [t, ...ts];
    });
    setEditTest(null);
    setShowCreate(false);
  };

  const handleDelete = async (id) => {
    if (!window.confirm('Delete this test?')) return;
    setDeletingId(id);
    try { await gateAdminAPI.deleteTest(id); setTests(ts => ts.filter(t => t.id !== id)); toast.success('Test deleted'); }
    catch { toast.error('Failed to delete'); }
    finally { setDeletingId(null); }
  };

  const handleToggleActive = async (t) => {
    try {
      const updatedStatus = !t.is_active;
      const res = await gateAdminAPI.updateTest(t.id, { is_active: updatedStatus });
      setTests(ts => ts.map(x => x.id === t.id ? res.data : x));
      toast.success(`Test is now ${updatedStatus ? 'Active (Visible to all students)' : 'Draft'}`);
    } catch {
      toast.error('Failed to update status');
    }
  };

  return (
    <div className="space-y-5">
      {(showCreate || editTest) && <TestModal test={editTest} onClose={() => { setEditTest(null); setShowCreate(false); }} onSave={handleSave} />}

      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-black text-white">Tests</h1>
          <p className="text-dark-400 text-sm mt-0.5">{tests.length} tests</p>
        </div>
        <button onClick={() => setShowCreate(true)} className="flex items-center gap-2 px-4 py-2 rounded-xl bg-gradient-to-r from-amber-500 to-orange-500 text-white font-bold text-sm hover:opacity-90 transition-all shadow-lg shadow-amber-500/20">
          <HiOutlinePlus className="w-4 h-4" /> Create Test
        </button>
      </div>

      {loading ? (
        <div className="space-y-3">{[...Array(3)].map((_, i) => <div key={i} className="h-24 bg-dark-800/50 rounded-2xl animate-pulse" />)}</div>
      ) : tests.length === 0 ? (
        <div className="text-center py-20 text-dark-500">
          <HiOutlineClipboardList className="w-12 h-12 mx-auto mb-3 opacity-40" />
          <p className="text-base font-semibold">No tests yet</p>
          <p className="text-sm mt-1">Create your first GATE test.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {tests.map(t => (
            <div key={t.id} className="bg-dark-900/60 border border-dark-700/50 rounded-2xl p-5 hover:border-dark-600/80 transition-all">
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1">
                  <div className="flex items-center gap-2 flex-wrap mb-1">
                    <h3 className="text-white font-bold">{t.title}</h3>
                    <button
                      onClick={() => handleToggleActive(t)}
                      title="Click to toggle Active / Draft status"
                      className={`text-xs px-2.5 py-0.5 rounded-full border font-semibold transition-all hover:scale-105 cursor-pointer ${
                        t.is_active
                          ? 'bg-emerald-500/15 text-emerald-400 border-emerald-500/25 hover:bg-emerald-500/25'
                          : 'bg-amber-500/15 text-amber-400 border-amber-500/25 hover:bg-amber-500/25'
                      }`}
                    >
                      {t.is_active ? '● Active (All Years)' : '○ Draft (Click to Publish)'}
                    </button>
                  </div>
                  {t.description && <p className="text-dark-400 text-sm mb-2">{t.description}</p>}
                  <div className="flex flex-wrap gap-4 text-xs text-dark-400">
                    <span className="flex items-center gap-1"><HiOutlineClock className="w-3.5 h-3.5" />{t.duration_minutes} min</span>
                    <span>{t.question_count} questions</span>
                    <span>{t.total_marks} marks</span>
                    {t.start_time && <span>Starts: {new Date(t.start_time).toLocaleString()}</span>}
                  </div>
                </div>
                <div className="flex items-center gap-1">
                  <button onClick={() => setEditTest(t)} className="p-2 rounded-lg text-dark-400 hover:text-blue-400 hover:bg-blue-500/10 transition-all"><HiOutlinePencil className="w-4 h-4" /></button>
                  <button onClick={() => handleDelete(t.id)} disabled={deletingId === t.id} className="p-2 rounded-lg text-dark-400 hover:text-red-400 hover:bg-red-500/10 transition-all"><HiOutlineTrash className="w-4 h-4" /></button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
