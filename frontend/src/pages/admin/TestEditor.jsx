import { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { adminAPI } from '../../services/api';
import toast from 'react-hot-toast';
import { HiOutlineArrowLeft } from 'react-icons/hi';

export default function TestEditor() {
  const { id } = useParams();
  const navigate = useNavigate();
  const isEdit = !!id;

  const [form, setForm] = useState({
    name: '', description: '', start_time: '', end_time: '', duration_minutes: 60,
    total_marks: 50, questions_per_student: 5, easy_count: 2, medium_count: 2, hard_count: 1,
    allowed_languages: ['python', 'java', 'c', 'cpp'], max_violations: 3,
    allow_copy_paste: false, scoring_type: 'partial', show_results: false, question_ids: [],
  });
  const [questions, setQuestions] = useState([]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    loadQuestions();
    if (isEdit) loadTest();
  }, [id]);

  const loadQuestions = async () => {
    try { const res = await adminAPI.getQuestions({}); setQuestions(res.data); }
    catch { console.error('Error loading questions'); }
  };

  const loadTest = async () => {
    try {
      const res = await adminAPI.getTests();
      const test = res.data.find(t => t.id === parseInt(id));
      if (test) {
        setForm({
          ...test,
          start_time: test.start_time.slice(0, 16),
          end_time: test.end_time.slice(0, 16),
          question_ids: test.question_ids || [],
        });
      }
    } catch { toast.error('Error loading test'); }
  };

  const handleSave = async (e) => {
    e.preventDefault();
    if (form.easy_count + form.medium_count + form.hard_count !== form.questions_per_student) {
      toast.error('Difficulty counts must equal questions per student');
      return;
    }
    setSaving(true);
    try {
      const data = {
        ...form,
        start_time: new Date(form.start_time).toISOString(),
        end_time: new Date(form.end_time).toISOString(),
      };
      if (isEdit) { await adminAPI.updateTest(id, data); toast.success('Test updated'); }
      else { await adminAPI.createTest(data); toast.success('Test created'); }
      navigate('/admin/tests');
    } catch (err) { toast.error(err.response?.data?.detail || 'Error saving test'); }
    finally { setSaving(false); }
  };

  const toggleQuestion = (qid) => {
    setForm(f => ({
      ...f,
      question_ids: f.question_ids.includes(qid) ? f.question_ids.filter(id => id !== qid) : [...f.question_ids, qid],
    }));
  };

  const toggleLanguage = (lang) => {
    setForm(f => ({
      ...f,
      allowed_languages: f.allowed_languages.includes(lang) ? f.allowed_languages.filter(l => l !== lang) : [...f.allowed_languages, lang],
    }));
  };

  const setField = (key, val) => setForm({ ...form, [key]: val });
  const inputClass = "w-full px-3 py-2 bg-dark-800 border border-dark-600/50 rounded-lg text-sm text-white focus:outline-none focus:border-brand-500";
  const labelClass = "block text-xs font-medium text-dark-400 mb-1";
  const diffColors = { easy: 'text-emerald-500', medium: 'text-amber-500', hard: 'text-red-500' };

  const poolByDifficulty = { easy: 0, medium: 0, hard: 0 };
  form.question_ids.forEach(qid => {
    const q = questions.find(x => x.id === qid);
    if (q) poolByDifficulty[q.difficulty]++;
  });

  return (
    <div className="space-y-6 animate-fade-in max-w-4xl">
      <div className="flex items-center gap-3">
        <button onClick={() => navigate('/admin/tests')} className="p-2 text-dark-400 hover:text-white"><HiOutlineArrowLeft className="w-5 h-5" /></button>
        <div>
          <h1 className="text-2xl font-bold text-white">{isEdit ? 'Edit Test' : 'Create Test'}</h1>
          <p className="text-dark-400 text-sm">Configure the assessment</p>
        </div>
      </div>

      <form onSubmit={handleSave} className="space-y-6">
        {/* Basic Info */}
        <div className="bg-dark-800 border border-dark-700/50 rounded-xl p-5 space-y-4">
          <h3 className="text-sm font-semibold text-white">Test Details</h3>
          <div><label className={labelClass}>Test Name</label><input value={form.name} onChange={(e) => setField('name', e.target.value)} required className={inputClass} /></div>
          <div><label className={labelClass}>Description</label><textarea value={form.description} onChange={(e) => setField('description', e.target.value)} rows={3} className={inputClass + ' resize-y'} /></div>
          <div className="grid grid-cols-2 gap-4">
            <div><label className={labelClass}>Start Date & Time</label><input type="datetime-local" value={form.start_time} onChange={(e) => setField('start_time', e.target.value)} required className={inputClass} /></div>
            <div><label className={labelClass}>End Date & Time</label><input type="datetime-local" value={form.end_time} onChange={(e) => setField('end_time', e.target.value)} required className={inputClass} /></div>
          </div>
          <div className="grid grid-cols-3 gap-4">
            <div><label className={labelClass}>Duration (minutes)</label><input type="number" value={form.duration_minutes} onChange={(e) => setField('duration_minutes', parseInt(e.target.value) || 0)} required min={1} className={inputClass} /></div>
            <div><label className={labelClass}>Total Marks</label><input type="number" value={form.total_marks} onChange={(e) => setField('total_marks', parseInt(e.target.value) || 0)} required min={1} className={inputClass} /></div>
            <div><label className={labelClass}>Questions Per Student</label><input type="number" value={form.questions_per_student} onChange={(e) => setField('questions_per_student', parseInt(e.target.value) || 0)} required min={1} className={inputClass} /></div>
          </div>
        </div>

        {/* Difficulty Distribution */}
        <div className="bg-dark-800 border border-dark-700/50 rounded-xl p-5 space-y-4">
          <h3 className="text-sm font-semibold text-white">Difficulty Distribution</h3>
          <p className="text-xs text-dark-400">How many questions of each difficulty to assign per student</p>
          <div className="grid grid-cols-3 gap-4">
            <div><label className={labelClass}>Easy Count</label><input type="number" value={form.easy_count} onChange={(e) => setField('easy_count', parseInt(e.target.value) || 0)} min={0} className={inputClass} /><p className="text-xs text-dark-500 mt-1">Pool: {poolByDifficulty.easy} available</p></div>
            <div><label className={labelClass}>Medium Count</label><input type="number" value={form.medium_count} onChange={(e) => setField('medium_count', parseInt(e.target.value) || 0)} min={0} className={inputClass} /><p className="text-xs text-dark-500 mt-1">Pool: {poolByDifficulty.medium} available</p></div>
            <div><label className={labelClass}>Hard Count</label><input type="number" value={form.hard_count} onChange={(e) => setField('hard_count', parseInt(e.target.value) || 0)} min={0} className={inputClass} /><p className="text-xs text-dark-500 mt-1">Pool: {poolByDifficulty.hard} available</p></div>
          </div>
          <p className="text-xs text-dark-400">Total: {form.easy_count + form.medium_count + form.hard_count} / {form.questions_per_student} required</p>
        </div>

        {/* Settings */}
        <div className="bg-dark-800 border border-dark-700/50 rounded-xl p-5 space-y-4">
          <h3 className="text-sm font-semibold text-white">Settings</h3>
          <div className="grid grid-cols-2 gap-4">
            <div><label className={labelClass}>Max Violations</label><input type="number" value={form.max_violations} onChange={(e) => setField('max_violations', parseInt(e.target.value) || 3)} min={1} className={inputClass} /></div>
            <div><label className={labelClass}>Scoring Type</label><select value={form.scoring_type} onChange={(e) => setField('scoring_type', e.target.value)} className={inputClass}><option value="partial">Partial Scoring</option><option value="all_or_nothing">All or Nothing</option></select></div>
          </div>
          <div className="flex items-center gap-6">
            <label className="flex items-center gap-2 text-sm text-dark-300 cursor-pointer">
              <input type="checkbox" checked={form.allow_copy_paste} onChange={(e) => setField('allow_copy_paste', e.target.checked)} className="rounded border-dark-600 bg-dark-800 text-brand-500" /> Allow Copy/Paste
            </label>
            <label className="flex items-center gap-2 text-sm text-dark-300 cursor-pointer">
              <input type="checkbox" checked={form.show_results} onChange={(e) => setField('show_results', e.target.checked)} className="rounded border-dark-600 bg-dark-800 text-brand-500" /> Show Results to Students
            </label>
          </div>
          <div>
            <label className={labelClass}>Allowed Languages</label>
            <div className="flex items-center gap-3 mt-1">
              {['python', 'java', 'c', 'cpp'].map(lang => (
                <label key={lang} className="flex items-center gap-1.5 text-sm text-dark-300 cursor-pointer">
                  <input type="checkbox" checked={form.allowed_languages.includes(lang)} onChange={() => toggleLanguage(lang)} className="rounded border-dark-600 bg-dark-800 text-brand-500" />
                  {lang === 'cpp' ? 'C++' : lang.charAt(0).toUpperCase() + lang.slice(1)}
                </label>
              ))}
            </div>
          </div>
        </div>

        {/* Question Pool */}
        <div className="bg-dark-800 border border-dark-700/50 rounded-xl p-5 space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-white">Question Pool ({form.question_ids.length} selected)</h3>
          </div>
          <div className="max-h-80 overflow-y-auto space-y-1 pr-1">
            {questions.map(q => (
              <label key={q.id} className={`flex items-center gap-3 px-3 py-2.5 rounded-lg cursor-pointer transition-colors ${form.question_ids.includes(q.id) ? 'bg-brand-500/5 border border-brand-500/20' : 'hover:bg-dark-700/30 border border-transparent'}`}>
                <input type="checkbox" checked={form.question_ids.includes(q.id)} onChange={() => toggleQuestion(q.id)} className="rounded border-dark-600 bg-dark-800 text-brand-500" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-white truncate">{q.title}</p>
                  <p className="text-xs text-dark-500">{q.topic} · {q.marks} marks</p>
                </div>
                <span className={`text-xs font-medium ${diffColors[q.difficulty]}`}>{q.difficulty}</span>
              </label>
            ))}
          </div>
        </div>

        <div className="flex justify-end gap-3">
          <button type="button" onClick={() => navigate('/admin/tests')} className="px-4 py-2 text-sm text-dark-400 hover:text-white">Cancel</button>
          <button type="submit" disabled={saving} className="px-6 py-2 bg-brand-500 hover:bg-brand-600 text-white rounded-lg text-sm font-medium disabled:opacity-50">
            {saving ? 'Saving...' : isEdit ? 'Update Test' : 'Create Test'}
          </button>
        </div>
      </form>
    </div>
  );
}
