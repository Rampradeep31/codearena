import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { adminAPI } from '../../services/api';
import toast from 'react-hot-toast';
import { HiOutlinePlus, HiOutlineTrash, HiOutlineArrowLeft } from 'react-icons/hi';

const topics = ['Arrays', 'Strings', 'Hashing', 'Two Pointers', 'Sliding Window', 'Sorting', 'Searching', 'Recursion', 'Linked List', 'Stack', 'Queue', 'Trees', 'Graphs', 'Dynamic Programming'];

export default function QuestionEditor() {
  const { id } = useParams();
  const navigate = useNavigate();
  const isEdit = !!id;

  const [form, setForm] = useState({
    title: '', statement: '', difficulty: 'easy', marks: 10, topic: 'Arrays',
    input_format: '', output_format: '', constraints: '', sample_input: '', sample_output: '', explanation: '',
  });
  const [testCases, setTestCases] = useState([{ input: '', expected_output: '', is_hidden: false }]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (isEdit) loadQuestion();
  }, [id]);

  const loadQuestion = async () => {
    try {
      const res = await adminAPI.getQuestion(id);
      const q = res.data;
      setForm({
        title: q.title, statement: q.statement, difficulty: q.difficulty, marks: q.marks, topic: q.topic,
        input_format: q.input_format || '', output_format: q.output_format || '',
        constraints: q.constraints || '', sample_input: q.sample_input || '',
        sample_output: q.sample_output || '', explanation: q.explanation || '',
      });
      if (q.test_cases?.length) setTestCases(q.test_cases);
    } catch { toast.error('Error loading question'); }
  };

  const addTestCase = () => setTestCases([...testCases, { input: '', expected_output: '', is_hidden: false }]);
  const removeTestCase = (i) => setTestCases(testCases.filter((_, idx) => idx !== i));
  const updateTestCase = (i, field, value) => {
    const updated = [...testCases];
    updated[i] = { ...updated[i], [field]: value };
    setTestCases(updated);
  };

  const handleSave = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      if (isEdit) {
        await adminAPI.updateQuestion(id, form);
        // Handle test cases separately for edit
        const existing = testCases.filter(tc => tc.id);
        const newTCs = testCases.filter(tc => !tc.id);
        for (const tc of newTCs) {
          await adminAPI.addTestCase(id, tc);
        }
        toast.success('Question updated');
      } else {
        await adminAPI.createQuestion({ ...form, test_cases: testCases });
        toast.success('Question created');
      }
      navigate('/admin/questions');
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Error saving question');
    } finally { setSaving(false); }
  };

  const handleDeleteTestCase = async (tc, i) => {
    if (tc.id) {
      try { await adminAPI.deleteTestCase(tc.id); toast.success('Test case deleted'); }
      catch { toast.error('Error deleting test case'); return; }
    }
    removeTestCase(i);
  };

  const setField = (key, val) => setForm({ ...form, [key]: val });
  const inputClass = "w-full px-3 py-2 bg-dark-800 border border-dark-600/50 rounded-lg text-sm text-white placeholder-dark-500 focus:outline-none focus:border-brand-500";
  const labelClass = "block text-xs font-medium text-dark-400 mb-1";

  return (
    <div className="space-y-6 animate-fade-in max-w-4xl">
      <div className="flex items-center gap-3">
        <button onClick={() => navigate('/admin/questions')} className="p-2 text-dark-400 hover:text-white transition-colors"><HiOutlineArrowLeft className="w-5 h-5" /></button>
        <div>
          <h1 className="text-2xl font-bold text-white">{isEdit ? 'Edit Question' : 'New Question'}</h1>
          <p className="text-dark-400 text-sm mt-0.5">Fill in the question details and test cases</p>
        </div>
      </div>

      <form onSubmit={handleSave} className="space-y-6">
        {/* Basic Info */}
        <div className="bg-dark-800 border border-dark-700/50 rounded-xl p-5 space-y-4">
          <h3 className="text-sm font-semibold text-white">Basic Information</h3>
          <div>
            <label className={labelClass}>Title</label>
            <input value={form.title} onChange={(e) => setField('title', e.target.value)} required className={inputClass} placeholder="e.g. Two Sum" />
          </div>
          <div>
            <label className={labelClass}>Problem Statement</label>
            <textarea value={form.statement} onChange={(e) => setField('statement', e.target.value)} required rows={6} className={inputClass + ' resize-y'} placeholder="Describe the problem..." />
          </div>
          <div className="grid grid-cols-3 gap-4">
            <div>
              <label className={labelClass}>Difficulty</label>
              <select value={form.difficulty} onChange={(e) => setField('difficulty', e.target.value)} className={inputClass}>
                <option value="easy">Easy</option>
                <option value="medium">Medium</option>
                <option value="hard">Hard</option>
              </select>
            </div>
            <div>
              <label className={labelClass}>Marks</label>
              <input type="number" value={form.marks} onChange={(e) => setField('marks', parseInt(e.target.value) || 0)} required className={inputClass} min={1} />
            </div>
            <div>
              <label className={labelClass}>Topic</label>
              <select value={form.topic} onChange={(e) => setField('topic', e.target.value)} className={inputClass}>
                {topics.map(t => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>
          </div>
        </div>

        {/* Format */}
        <div className="bg-dark-800 border border-dark-700/50 rounded-xl p-5 space-y-4">
          <h3 className="text-sm font-semibold text-white">Input / Output Format</h3>
          <div className="grid grid-cols-2 gap-4">
            <div><label className={labelClass}>Input Format</label><textarea value={form.input_format} onChange={(e) => setField('input_format', e.target.value)} rows={3} className={inputClass + ' resize-y'} /></div>
            <div><label className={labelClass}>Output Format</label><textarea value={form.output_format} onChange={(e) => setField('output_format', e.target.value)} rows={3} className={inputClass + ' resize-y'} /></div>
          </div>
          <div><label className={labelClass}>Constraints</label><textarea value={form.constraints} onChange={(e) => setField('constraints', e.target.value)} rows={2} className={inputClass + ' resize-y'} /></div>
          <div className="grid grid-cols-2 gap-4">
            <div><label className={labelClass}>Sample Input</label><textarea value={form.sample_input} onChange={(e) => setField('sample_input', e.target.value)} rows={3} className={inputClass + ' resize-y font-mono text-xs'} /></div>
            <div><label className={labelClass}>Sample Output</label><textarea value={form.sample_output} onChange={(e) => setField('sample_output', e.target.value)} rows={3} className={inputClass + ' resize-y font-mono text-xs'} /></div>
          </div>
          <div><label className={labelClass}>Explanation</label><textarea value={form.explanation} onChange={(e) => setField('explanation', e.target.value)} rows={3} className={inputClass + ' resize-y'} /></div>
        </div>

        {/* Test Cases */}
        <div className="bg-dark-800 border border-dark-700/50 rounded-xl p-5 space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-white">Test Cases ({testCases.length})</h3>
            <button type="button" onClick={addTestCase} className="flex items-center gap-1 text-xs text-brand-400 hover:text-brand-300 font-medium">
              <HiOutlinePlus className="w-3.5 h-3.5" /> Add Test Case
            </button>
          </div>
          {testCases.map((tc, i) => (
            <div key={i} className="bg-dark-900/50 border border-dark-700/30 rounded-lg p-4 space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium text-dark-400">Test Case #{i + 1}</span>
                <div className="flex items-center gap-3">
                  <label className="flex items-center gap-2 text-xs text-dark-400 cursor-pointer">
                    <input type="checkbox" checked={tc.is_hidden} onChange={(e) => updateTestCase(i, 'is_hidden', e.target.checked)}
                      className="rounded border-dark-600 bg-dark-800 text-brand-500 focus:ring-brand-500" />
                    Hidden
                  </label>
                  {testCases.length > 1 && (
                    <button type="button" onClick={() => handleDeleteTestCase(tc, i)} className="text-dark-500 hover:text-red-400"><HiOutlineTrash className="w-3.5 h-3.5" /></button>
                  )}
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div><label className={labelClass}>Input</label><textarea value={tc.input} onChange={(e) => updateTestCase(i, 'input', e.target.value)} rows={3} className={inputClass + ' font-mono text-xs resize-y'} /></div>
                <div><label className={labelClass}>Expected Output</label><textarea value={tc.expected_output} onChange={(e) => updateTestCase(i, 'expected_output', e.target.value)} rows={3} className={inputClass + ' font-mono text-xs resize-y'} /></div>
              </div>
            </div>
          ))}
        </div>

        <div className="flex justify-end gap-3">
          <button type="button" onClick={() => navigate('/admin/questions')} className="px-4 py-2 text-sm text-dark-400 hover:text-white">Cancel</button>
          <button type="submit" disabled={saving} className="px-6 py-2 bg-brand-500 hover:bg-brand-600 text-white rounded-lg text-sm font-medium disabled:opacity-50">
            {saving ? 'Saving...' : isEdit ? 'Update Question' : 'Create Question'}
          </button>
        </div>
      </form>
    </div>
  );
}
