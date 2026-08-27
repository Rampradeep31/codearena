import { useState, useEffect, useRef } from 'react';
import { gateAdminAPI } from '../../../services/gateApi';
import toast from 'react-hot-toast';
import {
  HiOutlinePlus, HiOutlineTrash, HiOutlinePencil, HiOutlineX,
  HiOutlineSearch, HiOutlineFilter, HiOutlineSparkles, HiOutlineUpload,
  HiOutlineDocumentText, HiOutlineCheckCircle, HiOutlineCollection,
} from 'react-icons/hi';

const SUBJECTS = ['Mathematics', 'General Aptitude', 'Algorithms', 'Operating Systems', 'DBMS', 'Computer Networks', 'Digital Logic', 'Programming & DS', 'Theory of Computation', 'Compiler Design', 'Software Engineering'];
const TYPES = ['MCQ', 'FITB'];
const DIFFICULTIES = ['easy', 'medium', 'hard'];

function QuestionModal({ question, onClose, onSave }) {
  const [form, setForm] = useState(question || {
    question_type: 'MCQ', subject: SUBJECTS[0], statement: '',
    option_a: '', option_b: '', option_c: '', option_d: '',
    correct_answer: '', marks: 1, negative_marks: 0.33,
    explanation: '', difficulty: 'medium',
  });
  const [saving, setSaving] = useState(false);

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const handleSave = async () => {
    if (!form.statement.trim() || !form.correct_answer.trim()) {
      toast.error('Statement and correct answer are required'); return;
    }
    setSaving(true);
    try {
      const payload = {
        question_type: form.question_type, subject: form.subject, statement: form.statement,
        option_a: form.option_a || null, option_b: form.option_b || null,
        option_c: form.option_c || null, option_d: form.option_d || null,
        correct_answer: form.correct_answer, marks: parseFloat(form.marks) || 1,
        negative_marks: parseFloat(form.negative_marks) ?? 0.33,
        explanation: form.explanation || null, difficulty: form.difficulty,
      };
      let res;
      if (question?.id) res = await gateAdminAPI.updateQuestion(question.id, payload);
      else res = await gateAdminAPI.createQuestion(payload);
      toast.success(question?.id ? 'Question updated' : 'Question created');
      onSave(res.data);
    } catch (e) { toast.error(e.message || 'Failed to save'); }
    finally { setSaving(false); }
  };

  const isMcq = form.question_type === 'MCQ';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
      <div className="bg-dark-900 border border-dark-700/60 rounded-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto shadow-2xl">
        <div className="flex items-center justify-between p-5 border-b border-dark-700/50">
          <h3 className="text-white font-bold text-lg">{question?.id ? 'Edit Question' : 'New Question'}</h3>
          <button onClick={onClose} className="p-2 rounded-lg hover:bg-dark-800 text-dark-400 hover:text-white transition-colors"><HiOutlineX className="w-5 h-5" /></button>
        </div>
        <div className="p-5 space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-dark-400 text-xs font-semibold block mb-1">Type</label>
              <select value={form.question_type} onChange={e => set('question_type', e.target.value)} className="w-full bg-dark-800 border border-dark-600 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-amber-500">
                {TYPES.map(t => <option key={t} value={t}>{t === 'MCQ' ? 'MCQ (Multiple Choice)' : 'FITB (Fill in the Blank)'}</option>)}
              </select>
            </div>
            <div>
              <label className="text-dark-400 text-xs font-semibold block mb-1">Subject</label>
              <select value={form.subject} onChange={e => set('subject', e.target.value)} className="w-full bg-dark-800 border border-dark-600 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-amber-500">
                {SUBJECTS.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
          </div>

          <div>
            <label className="text-dark-400 text-xs font-semibold block mb-1">Question Statement *</label>
            <textarea value={form.statement} onChange={e => set('statement', e.target.value)} rows={4} className="w-full bg-dark-800 border border-dark-600 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-amber-500 resize-none" placeholder="Enter full question text..." />
          </div>

          {isMcq && (
            <div className="grid grid-cols-2 gap-3">
              {['a', 'b', 'c', 'd'].map(opt => (
                <div key={opt}>
                  <label className="text-dark-400 text-xs font-semibold block mb-1">Option {opt.toUpperCase()}</label>
                  <input value={form[`option_${opt}`] || ''} onChange={e => set(`option_${opt}`, e.target.value)} className="w-full bg-dark-800 border border-dark-600 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-amber-500" placeholder={`Option ${opt.toUpperCase()}...`} />
                </div>
              ))}
            </div>
          )}

          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="text-dark-400 text-xs font-semibold block mb-1">Correct Answer *</label>
              {isMcq ? (
                <select value={form.correct_answer} onChange={e => set('correct_answer', e.target.value)} className="w-full bg-dark-800 border border-dark-600 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-amber-500">
                  <option value="">Select</option>
                  {['A', 'B', 'C', 'D'].map(o => <option key={o} value={o}>{o}</option>)}
                </select>
              ) : (
                <input value={form.correct_answer} onChange={e => set('correct_answer', e.target.value)} className="w-full bg-dark-800 border border-dark-600 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-amber-500" placeholder="Numeric answer..." />
              )}
            </div>
            <div>
              <label className="text-dark-400 text-xs font-semibold block mb-1">Marks</label>
              <select value={form.marks} onChange={e => set('marks', e.target.value)} className="w-full bg-dark-800 border border-dark-600 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-amber-500">
                <option value={1}>1 Mark</option>
                <option value={2}>2 Marks</option>
              </select>
            </div>
            <div>
              <label className="text-dark-400 text-xs font-semibold block mb-1">Difficulty</label>
              <select value={form.difficulty} onChange={e => set('difficulty', e.target.value)} className="w-full bg-dark-800 border border-dark-600 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-amber-500">
                {DIFFICULTIES.map(d => <option key={d} value={d}>{d.charAt(0).toUpperCase() + d.slice(1)}</option>)}
              </select>
            </div>
          </div>

          <div>
            <label className="text-dark-400 text-xs font-semibold block mb-1">Explanation (optional)</label>
            <textarea value={form.explanation || ''} onChange={e => set('explanation', e.target.value)} rows={2} className="w-full bg-dark-800 border border-dark-600 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-amber-500 resize-none" placeholder="Step-by-step solution..." />
          </div>
        </div>
        <div className="flex items-center gap-3 p-5 border-t border-dark-700/50">
          <button onClick={onClose} className="flex-1 px-4 py-2 rounded-xl border border-dark-600 text-dark-300 hover:text-white hover:bg-dark-800 transition-all text-sm font-semibold">Cancel</button>
          <button onClick={handleSave} disabled={saving} className="flex-1 px-4 py-2 rounded-xl bg-gradient-to-r from-amber-500 to-orange-500 text-white font-bold text-sm hover:opacity-90 disabled:opacity-50 transition-all">
            {saving ? 'Saving...' : 'Save Question'}
          </button>
        </div>
      </div>
    </div>
  );
}

function AiModal({ onClose, onDone }) {
  const [prompt, setPrompt] = useState('');
  const [subject, setSubject] = useState('');
  const [count, setCount] = useState(5);
  const [loading, setLoading] = useState(false);

  const handleGenerate = async () => {
    if (!prompt.trim()) { toast.error('Enter a prompt'); return; }
    setLoading(true);
    try {
      const res = await gateAdminAPI.aiGenerateQuestions({ prompt, subject: subject || null, count });
      toast.success(`Generated ${res.data.length} questions!`);
      onDone(res.data);
    } catch (e) { toast.error(e.message || 'AI generation failed'); }
    finally { setLoading(false); }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
      <div className="bg-dark-900 border border-dark-700/60 rounded-2xl w-full max-w-lg shadow-2xl">
        <div className="flex items-center justify-between p-5 border-b border-dark-700/50">
          <div className="flex items-center gap-2">
            <HiOutlineSparkles className="w-5 h-5 text-amber-400" />
            <h3 className="text-white font-bold text-lg">AI Generate GATE Questions</h3>
          </div>
          <button onClick={onClose} className="p-2 rounded-lg hover:bg-dark-800 text-dark-400 hover:text-white transition-colors"><HiOutlineX className="w-5 h-5" /></button>
        </div>
        <div className="p-5 space-y-4">
          <div>
            <label className="text-dark-400 text-xs font-semibold block mb-1">Prompt *</label>
            <textarea value={prompt} onChange={e => setPrompt(e.target.value)} rows={3} className="w-full bg-dark-800 border border-dark-600 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-amber-500 resize-none" placeholder="e.g. 5 GATE questions on Binary Trees with numerical answers, or OS scheduling algorithms" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-dark-400 text-xs font-semibold block mb-1">Subject (optional)</label>
              <select value={subject} onChange={e => setSubject(e.target.value)} className="w-full bg-dark-800 border border-dark-600 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-amber-500">
                <option value="">Auto-detect</option>
                {SUBJECTS.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
            <div>
              <label className="text-dark-400 text-xs font-semibold block mb-1">Number of Questions</label>
              <input type="number" min={1} max={20} value={count} onChange={e => setCount(parseInt(e.target.value))} className="w-full bg-dark-800 border border-dark-600 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-amber-500" />
            </div>
          </div>
        </div>
        <div className="flex items-center gap-3 p-5 border-t border-dark-700/50">
          <button onClick={onClose} className="flex-1 px-4 py-2 rounded-xl border border-dark-600 text-dark-300 hover:text-white hover:bg-dark-800 transition-all text-sm font-semibold">Cancel</button>
          <button onClick={handleGenerate} disabled={loading} className="flex-1 px-4 py-2 rounded-xl bg-gradient-to-r from-amber-500 to-orange-500 text-white font-bold text-sm hover:opacity-90 disabled:opacity-50 transition-all flex items-center justify-center gap-2">
            <HiOutlineSparkles className="w-4 h-4" />
            {loading ? 'Generating...' : 'Generate'}
          </button>
        </div>
      </div>
    </div>
  );
}

function PdfModal({ onClose, onDone }) {
  const [subject, setSubject] = useState('');
  const [file, setFile] = useState(null);
  const [loading, setLoading] = useState(false);
  const fileRef = useRef();

  const handleUpload = async () => {
    if (!file) { toast.error('Select a PDF file'); return; }
    setLoading(true);
    try {
      const formData = new FormData();
      formData.append('file', file);
      if (subject) formData.append('subject', subject);
      const res = await gateAdminAPI.uploadPdf(formData);
      toast.success(`Extracted ${res.data.length} questions from PDF!`);
      onDone(res.data);
    } catch (e) { toast.error(e.message || 'PDF extraction failed'); }
    finally { setLoading(false); }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
      <div className="bg-dark-900 border border-dark-700/60 rounded-2xl w-full max-w-md shadow-2xl">
        <div className="flex items-center justify-between p-5 border-b border-dark-700/50">
          <div className="flex items-center gap-2">
            <HiOutlineUpload className="w-5 h-5 text-amber-400" />
            <h3 className="text-white font-bold text-lg">Upload PDF Question Paper</h3>
          </div>
          <button onClick={onClose} className="p-2 rounded-lg hover:bg-dark-800 text-dark-400 hover:text-white transition-colors"><HiOutlineX className="w-5 h-5" /></button>
        </div>
        <div className="p-5 space-y-4">
          <div
            onClick={() => fileRef.current?.click()}
            className="border-2 border-dashed border-dark-600 hover:border-amber-500/50 rounded-xl p-8 text-center cursor-pointer transition-colors"
          >
            <HiOutlineDocumentText className="w-10 h-10 text-dark-500 mx-auto mb-2" />
            {file ? (
              <div className="flex items-center justify-center gap-2 text-emerald-400 text-sm font-semibold">
                <HiOutlineCheckCircle className="w-5 h-5" />
                {file.name}
              </div>
            ) : (
              <>
                <p className="text-dark-300 text-sm font-semibold">Click to select PDF</p>
                <p className="text-dark-500 text-xs mt-1">Questions and answers will be extracted via AI</p>
              </>
            )}
            <input ref={fileRef} type="file" accept=".pdf,.txt" className="hidden" onChange={e => setFile(e.target.files[0])} />
          </div>
          <div>
            <label className="text-dark-400 text-xs font-semibold block mb-1">Override Subject (optional)</label>
            <select value={subject} onChange={e => setSubject(e.target.value)} className="w-full bg-dark-800 border border-dark-600 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-amber-500">
              <option value="">Auto-detect from content</option>
              {SUBJECTS.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>
        </div>
        <div className="flex items-center gap-3 p-5 border-t border-dark-700/50">
          <button onClick={onClose} className="flex-1 px-4 py-2 rounded-xl border border-dark-600 text-dark-300 hover:text-white hover:bg-dark-800 transition-all text-sm font-semibold">Cancel</button>
          <button onClick={handleUpload} disabled={loading || !file} className="flex-1 px-4 py-2 rounded-xl bg-gradient-to-r from-amber-500 to-orange-500 text-white font-bold text-sm hover:opacity-90 disabled:opacity-50 transition-all flex items-center justify-center gap-2">
            <HiOutlineUpload className="w-4 h-4" />
            {loading ? 'Extracting...' : 'Extract Questions'}
          </button>
        </div>
      </div>
    </div>
  );
}

export default function GateQuestionBank() {
  const [questions, setQuestions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [subjectFilter, setSubjectFilter] = useState('');
  const [typeFilter, setTypeFilter] = useState('');
  const [editQ, setEditQ] = useState(null);
  const [showCreate, setShowCreate] = useState(false);
  const [showAi, setShowAi] = useState(false);
  const [showPdf, setShowPdf] = useState(false);
  const [deletingId, setDeletingId] = useState(null);

  const load = async () => {
    setLoading(true);
    try {
      const res = await gateAdminAPI.listQuestions({ subject: subjectFilter || undefined, type: typeFilter || undefined, search: search || undefined });
      setQuestions(res.data);
    } catch { toast.error('Failed to load questions'); }
    finally { setLoading(false); }
  };

  useEffect(() => { load(); }, [subjectFilter, typeFilter]);

  const handleSearch = (e) => {
    e.preventDefault();
    load();
  };

  const handleDelete = async (id) => {
    if (!window.confirm('Delete this question?')) return;
    setDeletingId(id);
    try {
      await gateAdminAPI.deleteQuestion(id);
      setQuestions(qs => qs.filter(q => q.id !== id));
      toast.success('Question deleted');
    } catch { toast.error('Failed to delete'); }
    finally { setDeletingId(null); }
  };

  const handleSave = (q) => {
    setQuestions(qs => {
      const idx = qs.findIndex(x => x.id === q.id);
      if (idx >= 0) { const n = [...qs]; n[idx] = q; return n; }
      return [q, ...qs];
    });
    setEditQ(null);
    setShowCreate(false);
  };

  const handleAiDone = (newQs) => { setQuestions(qs => [...newQs, ...qs]); setShowAi(false); };
  const handlePdfDone = (newQs) => { setQuestions(qs => [...newQs, ...qs]); setShowPdf(false); };

  const diffColor = { easy: 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20', medium: 'text-amber-400 bg-amber-500/10 border-amber-500/20', hard: 'text-red-400 bg-red-500/10 border-red-500/20' };

  return (
    <div className="space-y-5">
      {(showCreate || editQ) && <QuestionModal question={editQ} onClose={() => { setEditQ(null); setShowCreate(false); }} onSave={handleSave} />}
      {showAi && <AiModal onClose={() => setShowAi(false)} onDone={handleAiDone} />}
      {showPdf && <PdfModal onClose={() => setShowPdf(false)} onDone={handlePdfDone} />}

      {/* Header */}
      <div className="flex flex-wrap items-center gap-3 justify-between">
        <div>
          <h1 className="text-2xl font-black text-white">Question Bank</h1>
          <p className="text-dark-400 text-sm mt-0.5">{questions.length} questions</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <button onClick={() => setShowPdf(true)} className="flex items-center gap-2 px-4 py-2 rounded-xl border border-dark-600 text-dark-300 hover:text-white hover:bg-dark-800 transition-all text-sm font-semibold">
            <HiOutlineUpload className="w-4 h-4" /> Upload PDF
          </button>
          <button onClick={() => setShowAi(true)} className="flex items-center gap-2 px-4 py-2 rounded-xl border border-amber-500/30 bg-amber-500/10 text-amber-300 hover:bg-amber-500/20 transition-all text-sm font-semibold">
            <HiOutlineSparkles className="w-4 h-4" /> Generate with AI
          </button>
          <button onClick={() => setShowCreate(true)} className="flex items-center gap-2 px-4 py-2 rounded-xl bg-gradient-to-r from-amber-500 to-orange-500 text-white font-bold text-sm hover:opacity-90 transition-all shadow-lg shadow-amber-500/20">
            <HiOutlinePlus className="w-4 h-4" /> Add Question
          </button>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3 items-center">
        <form onSubmit={handleSearch} className="flex items-center gap-2 flex-1 min-w-48">
          <div className="relative flex-1">
            <HiOutlineSearch className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-dark-500" />
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search questions..." className="w-full bg-dark-800 border border-dark-700/50 rounded-xl pl-9 pr-3 py-2 text-white text-sm focus:outline-none focus:border-amber-500 placeholder-dark-500" />
          </div>
          <button type="submit" className="px-4 py-2 rounded-xl bg-amber-500/20 border border-amber-500/30 text-amber-300 text-sm font-semibold hover:bg-amber-500/30 transition-all">Search</button>
        </form>
        <select value={subjectFilter} onChange={e => setSubjectFilter(e.target.value)} className="bg-dark-800 border border-dark-700/50 rounded-xl px-3 py-2 text-white text-sm focus:outline-none focus:border-amber-500">
          <option value="">All Subjects</option>
          {SUBJECTS.map(s => <option key={s} value={s}>{s}</option>)}
        </select>
        <select value={typeFilter} onChange={e => setTypeFilter(e.target.value)} className="bg-dark-800 border border-dark-700/50 rounded-xl px-3 py-2 text-white text-sm focus:outline-none focus:border-amber-500">
          <option value="">All Types</option>
          {TYPES.map(t => <option key={t} value={t}>{t}</option>)}
        </select>
      </div>

      {/* Questions List */}
      {loading ? (
        <div className="space-y-3">{[...Array(5)].map((_, i) => <div key={i} className="h-20 bg-dark-800/50 rounded-2xl animate-pulse" />)}</div>
      ) : questions.length === 0 ? (
        <div className="text-center py-20 text-dark-500">
          <HiOutlineCollection className="w-12 h-12 mx-auto mb-3 opacity-40" />
          <p className="text-base font-semibold">No questions found</p>
          <p className="text-sm mt-1">Add questions manually, use AI generation, or upload a PDF.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {questions.map(q => (
            <div key={q.id} className="bg-dark-900/60 border border-dark-700/50 rounded-2xl p-4 hover:border-dark-600/80 transition-all">
              <div className="flex items-start gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex flex-wrap items-center gap-2 mb-2">
                    <span className={`text-xs px-2 py-0.5 rounded-full border font-bold ${q.question_type === 'MCQ' ? 'text-blue-400 bg-blue-500/10 border-blue-500/20' : 'text-purple-400 bg-purple-500/10 border-purple-500/20'}`}>
                      {q.question_type}
                    </span>
                    <span className="text-xs px-2 py-0.5 rounded-full bg-amber-500/10 border border-amber-500/20 text-amber-300 font-semibold">{q.subject}</span>
                    <span className={`text-xs px-2 py-0.5 rounded-full border font-semibold ${diffColor[q.difficulty] || 'text-dark-400'}`}>{q.difficulty}</span>
                    <span className="text-xs text-dark-400 ml-auto">{q.marks} mark{q.marks !== 1 ? 's' : ''} · -{q.negative_marks} neg</span>
                  </div>
                  <p className="text-white text-sm leading-relaxed line-clamp-2">{q.statement}</p>
                  {q.question_type === 'MCQ' && (
                    <div className="mt-2 grid grid-cols-2 gap-1">
                      {['A', 'B', 'C', 'D'].map(opt => (
                        <div key={opt} className={`text-xs px-2 py-1 rounded-lg ${q.correct_answer === opt ? 'bg-emerald-500/15 text-emerald-300 border border-emerald-500/20 font-bold' : 'text-dark-400'}`}>
                          {opt}. {q[`option_${opt.toLowerCase()}`] || '—'}
                        </div>
                      ))}
                    </div>
                  )}
                  {q.question_type === 'FITB' && (
                    <p className="text-xs mt-2 text-emerald-400 font-semibold">Answer: {q.correct_answer}</p>
                  )}
                </div>
                <div className="flex items-center gap-1 flex-shrink-0">
                  <button onClick={() => setEditQ(q)} className="p-2 rounded-lg text-dark-400 hover:text-blue-400 hover:bg-blue-500/10 transition-all"><HiOutlinePencil className="w-4 h-4" /></button>
                  <button onClick={() => handleDelete(q.id)} disabled={deletingId === q.id} className="p-2 rounded-lg text-dark-400 hover:text-red-400 hover:bg-red-500/10 transition-all"><HiOutlineTrash className="w-4 h-4" /></button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
