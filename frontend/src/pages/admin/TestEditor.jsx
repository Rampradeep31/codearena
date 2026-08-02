import { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { adminAPI } from '../../services/api';
import toast from 'react-hot-toast';
import { HiOutlineArrowLeft, HiOutlineCalendar, HiOutlineClock } from 'react-icons/hi';

const combineDateAndTime = (d, t) => {
  if (!d || !t) return '';
  return new Date(`${d}T${t}`).toISOString();
};

const splitDateTime = (isoStr) => {
  if (!isoStr) return { date: '', time: '' };
  const d = new Date(isoStr);
  const pad = (n) => String(n).padStart(2, '0');
  const date = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const time = `${pad(d.getHours())}:${pad(d.getMinutes())}`;
  return { date, time };
};

export default function TestEditor() {
  const { id } = useParams();
  const navigate = useNavigate();
  const isEdit = !!id;

  const [form, setForm] = useState({
    name: '', 
    description: '', 
    year: 'Second Year',
    question_bank_id: '',
    questions_per_student: 5,
    duration_minutes: 60,
    start_date: '',
    start_time: '',
    end_date: '',
    end_time: '',
    allowed_languages: ['python', 'java', 'c', 'cpp'], 
    randomize_questions: false,
    question_ids: [],
    total_marks: 50,
    max_violations: 3,
    allow_copy_paste: false,
    scoring_type: 'partial',
    show_results: false,
  });

  const [banks, setBanks] = useState([]);
  const [questions, setQuestions] = useState([]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    loadBanks();
    loadQuestions();
    if (isEdit) loadTest();
  }, [id]);

  const loadBanks = async () => {
    try {
      const res = await adminAPI.getQuestionBanks();
      setBanks(res.data || []);
    } catch {
      toast.error('Error loading question banks');
    }
  };

  const loadQuestions = async () => {
    try {
      const res = await adminAPI.getQuestions();
      setQuestions(res.data || []);
    } catch {
      toast.error('Error loading questions');
    }
  };

  const loadTest = async () => {
    try {
      const res = await adminAPI.getTests();
      const test = res.data.find(t => t.id === parseInt(id));
      if (test) {
        const startSplit = splitDateTime(test.start_time);
        const endSplit = splitDateTime(test.end_time);
        setForm({
          ...test,
          start_date: startSplit.date,
          start_time: startSplit.time,
          end_date: endSplit.date,
          end_time: endSplit.time,
          year: test.year || 'Second Year',
          question_bank_id: test.question_bank_id || '',
          randomize_questions: !!test.randomize_questions
        });
      }
    } catch { 
      toast.error('Error loading test details'); 
    }
  };

  const handleSave = async (e) => {
    e.preventDefault();
    if (!form.year) {
      toast.error('Please select an Academic Year');
      return;
    }
    if (!form.question_bank_id) {
      toast.error('Please select a Question Bank');
      return;
    }
    if (!form.start_date || !form.start_time || !form.end_date || !form.end_time) {
      toast.error('Please fill in all start and end date/time fields');
      return;
    }

    const startIso = combineDateAndTime(form.start_date, form.start_time);
    const endIso = combineDateAndTime(form.end_date, form.end_time);

    if (new Date(startIso) >= new Date(endIso)) {
      toast.error('Start time must be before end time');
      return;
    }

    if (form.allowed_languages.length === 0) {
      toast.error('Please select at least one supported language');
      return;
    }

    const bankQuestionsCount = questions.filter(q => q.question_bank_id === parseInt(form.question_bank_id) || q.question_bank_id === form.question_bank_id).length;
    if (bankQuestionsCount < form.questions_per_student) {
      toast.error(`The selected Question Bank only contains ${bankQuestionsCount} questions. You cannot set questions per student to ${form.questions_per_student}.`);
      return;
    }

    // Validate manual question selection if not randomized
    if (!form.randomize_questions && form.question_ids.length !== form.questions_per_student) {
      toast.error(`Please select exactly ${form.questions_per_student} questions for the test (currently selected: ${form.question_ids.length})`);
      return;
    }

    setSaving(true);
    try {
      const data = {
        ...form,
        start_time: startIso,
        end_time: endIso,
      };

      if (isEdit) { 
        await adminAPI.updateTest(id, data); 
        toast.success('Test updated successfully'); 
      } else { 
        await adminAPI.createTest(data); 
        toast.success('Test created successfully'); 
      }
      navigate('/admin/tests');
    } catch (err) { 
      toast.error(err.response?.data?.detail || 'Error saving test'); 
    } finally { 
      setSaving(false); 
    }
  };

  const handleYearChange = (yearVal) => {
    setForm(f => ({
      ...f,
      year: yearVal,
      question_bank_id: '',
      question_ids: []
    }));
  };

  const handleBankChange = (bankIdVal) => {
    setForm(f => ({
      ...f,
      question_bank_id: bankIdVal,
      question_ids: []
    }));
  };

  const toggleQuestion = (qid) => {
    setForm(f => ({
      ...f,
      question_ids: f.question_ids.includes(qid) 
        ? f.question_ids.filter(id => id !== qid) 
        : f.question_ids.length < f.questions_per_student 
          ? [...f.question_ids, qid] 
          : f.question_ids // cap at questions_per_student
    }));
  };

  const toggleLanguage = (lang) => {
    setForm(f => ({
      ...f,
      allowed_languages: f.allowed_languages.includes(lang) 
        ? f.allowed_languages.filter(l => l !== lang) 
        : [...f.allowed_languages, lang],
    }));
  };

  const setField = (key, val) => setForm({ ...form, [key]: val });
  const inputClass = "w-full px-3 py-2 bg-dark-800 border border-dark-600/50 rounded-lg text-sm text-white focus:outline-none focus:border-brand-500 transition-colors";
  const labelClass = "block text-xs font-medium text-dark-400 mb-1";
  const diffColors = { easy: 'text-emerald-500', medium: 'text-amber-500', hard: 'text-red-500' };

  // Filter banks by year
  const filteredBanks = banks.filter(b => b.year === form.year && b.status === 'Active');

  // Filter questions by selected bank
  const filteredQuestions = questions.filter(q => q.question_bank_id === parseInt(form.question_bank_id) || q.question_bank_id === form.question_bank_id);

  return (
    <div className="space-y-6 animate-fade-in max-w-4xl">
      <div className="flex items-center gap-3">
        <button onClick={() => navigate('/admin/tests')} className="p-2 text-dark-400 hover:text-white bg-dark-800 border border-dark-700/30 rounded-lg transition-colors cursor-pointer"><HiOutlineArrowLeft className="w-5 h-5" /></button>
        <div>
          <h1 className="text-2xl font-bold text-white">{isEdit ? 'Edit Test' : 'Create New Test'}</h1>
          <p className="text-dark-400 text-sm">Configure assessment details, question banks, and constraints</p>
        </div>
      </div>

      <form onSubmit={handleSave} className="space-y-6">
        {/* Basic Info */}
        <div className="bg-dark-800 border border-dark-700/50 rounded-xl p-5 space-y-4">
          <h3 className="text-sm font-semibold text-white">Test Details</h3>
          
          <div>
            <label className={labelClass}>Test Name</label>
            <input 
              value={form.name} 
              onChange={(e) => setField('name', e.target.value)} 
              required 
              placeholder="e.g. Week 1 Coding Test"
              className={inputClass} 
            />
          </div>

          <div>
            <label className={labelClass}>Description</label>
            <textarea 
              value={form.description} 
              onChange={(e) => setField('description', e.target.value)} 
              rows={2} 
              placeholder="Explain the test scope..."
              className={inputClass + ' resize-y'} 
            />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className={labelClass}>Select Year</label>
              <select 
                value={form.year} 
                onChange={(e) => handleYearChange(e.target.value)} 
                required
                className={inputClass + " cursor-pointer"}
              >
                <option value="Second Year">Second Year</option>
                <option value="Third Year">Third Year</option>
              </select>
            </div>

            <div>
              <label className={labelClass}>Select Question Bank</label>
              <select 
                value={form.question_bank_id} 
                onChange={(e) => handleBankChange(e.target.value ? parseInt(e.target.value) : '')} 
                required
                className={inputClass + " cursor-pointer"}
              >
                <option value="">-- Choose a Question Bank --</option>
                {filteredBanks.map(b => (
                  <option key={b.id} value={b.id}>{b.title}</option>
                ))}
              </select>
            </div>
          </div>
        </div>

        {/* Configurations */}
        <div className="bg-dark-800 border border-dark-700/50 rounded-xl p-5 space-y-4">
          <h3 className="text-sm font-semibold text-white">Assessment Parameters</h3>
          
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div>
              <label className={labelClass}>Questions Per Student</label>
              <select 
                value={form.questions_per_student} 
                onChange={(e) => setField('questions_per_student', parseInt(e.target.value))} 
                className={inputClass + " cursor-pointer"}
              >
                <option value={5}>5</option>
                <option value={10}>10</option>
                <option value={15}>15</option>
                <option value={20}>20</option>
              </select>
            </div>

            <div>
              <label className={labelClass}>Duration</label>
              <select 
                value={form.duration_minutes} 
                onChange={(e) => setField('duration_minutes', parseInt(e.target.value))} 
                className={inputClass + " cursor-pointer"}
              >
                <option value={30}>30 Minutes</option>
                <option value={60}>60 Minutes</option>
                <option value={90}>90 Minutes</option>
                <option value={120}>120 Minutes</option>
              </select>
            </div>

            <div>
              <label className={labelClass}>Total Marks</label>
              <input 
                type="number" 
                value={form.total_marks} 
                onChange={(e) => setField('total_marks', parseInt(e.target.value) || 0)} 
                required 
                min={1} 
                className={inputClass} 
              />
            </div>

            <div>
              <label className={labelClass}>Proctor Max Violations</label>
              <input 
                type="number" 
                value={form.max_violations} 
                onChange={(e) => setField('max_violations', parseInt(e.target.value) || 3)} 
                min={1} 
                className={inputClass} 
              />
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2">
            <div>
              <label className={labelClass}>Start Date & Start Time</label>
              <div className="flex gap-2">
                <input 
                  type="date" 
                  value={form.start_date} 
                  onChange={(e) => setField('start_date', e.target.value)} 
                  required 
                  className={inputClass} 
                />
                <input 
                  type="time" 
                  value={form.start_time} 
                  onChange={(e) => setField('start_time', e.target.value)} 
                  required 
                  className={inputClass} 
                />
              </div>
            </div>

            <div>
              <label className={labelClass}>End Date & End Time</label>
              <div className="flex gap-2">
                <input 
                  type="date" 
                  value={form.end_date} 
                  onChange={(e) => setField('end_date', e.target.value)} 
                  required 
                  className={inputClass} 
                />
                <input 
                  type="time" 
                  value={form.end_time} 
                  onChange={(e) => setField('end_time', e.target.value)} 
                  required 
                  className={inputClass} 
                />
              </div>
            </div>
          </div>
        </div>

        {/* Rules & Languages */}
        <div className="bg-dark-800 border border-dark-700/50 rounded-xl p-5 space-y-4">
          <h3 className="text-sm font-semibold text-white">Languages & Rules</h3>

          <div>
            <label className={labelClass}>Supported Languages</label>
            <div className="flex items-center gap-6 mt-2">
              {['java', 'python', 'c', 'cpp'].map(lang => (
                <label key={lang} className="flex items-center gap-2 text-sm text-dark-300 cursor-pointer user-select-none">
                  <input 
                    type="checkbox" 
                    checked={form.allowed_languages.includes(lang)} 
                    onChange={() => toggleLanguage(lang)} 
                    className="rounded border-dark-600 bg-dark-900 text-brand-500 focus:ring-brand-500 w-4 h-4" 
                  />
                  {lang === 'cpp' ? 'C++' : lang.charAt(0).toUpperCase() + lang.slice(1)}
                </label>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2">
            <div>
              <label className={labelClass}>Randomize Questions</label>
              <div className="flex gap-2 mt-1">
                <button 
                  type="button"
                  onClick={() => setField('randomize_questions', true)}
                  className={`flex-1 py-2 text-sm font-medium rounded-lg border transition-all cursor-pointer ${
                    form.randomize_questions 
                      ? 'bg-brand-500/10 text-brand-400 border-brand-500/30 font-semibold' 
                      : 'bg-dark-900 text-dark-400 border-dark-700/50'
                  }`}
                >
                  Yes
                </button>
                <button 
                  type="button"
                  onClick={() => setField('randomize_questions', false)}
                  className={`flex-1 py-2 text-sm font-medium rounded-lg border transition-all cursor-pointer ${
                    !form.randomize_questions 
                      ? 'bg-brand-500/10 text-brand-400 border-brand-500/30 font-semibold' 
                      : 'bg-dark-900 text-dark-400 border-dark-700/50'
                  }`}
                >
                  No
                </button>
              </div>
            </div>

            <div className="space-y-3 pt-4">
              <label className="flex items-center gap-2 text-sm text-dark-300 cursor-pointer user-select-none">
                <input 
                  type="checkbox" 
                  checked={form.allow_copy_paste} 
                  onChange={(e) => setField('allow_copy_paste', e.target.checked)} 
                  className="rounded border-dark-600 bg-dark-900 text-brand-500 focus:ring-brand-500 w-4 h-4" 
                /> 
                Allow Copy / Paste
              </label>

              <label className="flex items-center gap-2 text-sm text-dark-300 cursor-pointer user-select-none">
                <input 
                  type="checkbox" 
                  checked={form.show_results} 
                  onChange={(e) => setField('show_results', e.target.checked)} 
                  className="rounded border-dark-600 bg-dark-900 text-brand-500 focus:ring-brand-500 w-4 h-4" 
                /> 
                Show Results to Students after submission
              </label>
            </div>
          </div>
        </div>

        {/* Question Pool / Manual Selector */}
        {form.question_bank_id && (
          <div className="bg-dark-800 border border-dark-700/50 rounded-xl p-5 space-y-4">
            <div>
              <h3 className="text-sm font-semibold text-white">
                Question Pool Selection 
                {form.randomize_questions 
                  ? ' (Auto-Randomized)' 
                  : ` (Select exactly ${form.questions_per_student} questions)`}
              </h3>
              <p className="text-xs text-dark-400 mt-1">
                {form.randomize_questions 
                  ? `Students will be randomly assigned ${form.questions_per_student} questions from the selected bank.` 
                  : `Choose which ${form.questions_per_student} questions from this bank will be assigned to all students.`}
              </p>
            </div>

            {filteredQuestions.length === 0 ? (
              <div className="text-center py-6 text-dark-500 text-sm">
                No questions found in this Question Bank. Add questions to this bank first.
              </div>
            ) : form.randomize_questions ? (
              <div className="bg-dark-900/30 border border-dark-700/30 rounded-lg p-4 grid grid-cols-1 md:grid-cols-2 gap-3">
                {filteredQuestions.map(q => (
                  <div key={q.id} className="flex items-center justify-between p-2.5 bg-dark-800/40 rounded border border-dark-750">
                    <div className="min-w-0">
                      <p className="text-sm text-white font-medium truncate">{q.title}</p>
                      <p className="text-xs text-dark-500">{q.topic}</p>
                    </div>
                    <span className={`text-[10px] font-bold px-2 py-0.5 rounded border ${difficultyColors[q.difficulty]}`}>{q.difficulty}</span>
                  </div>
                ))}
              </div>
            ) : (
              <div className="max-h-80 overflow-y-auto space-y-1.5 pr-1">
                {filteredQuestions.map(q => {
                  const isChecked = form.question_ids.includes(q.id);
                  const isDisabled = !isChecked && form.question_ids.length >= form.questions_per_student;
                  return (
                    <label 
                      key={q.id} 
                      className={`flex items-center gap-3 px-3 py-2.5 rounded-lg cursor-pointer border transition-all ${
                        isChecked 
                          ? 'bg-brand-500/5 border-brand-500/30 shadow-xs' 
                          : isDisabled
                            ? 'opacity-40 cursor-not-allowed border-transparent'
                            : 'hover:bg-dark-700/30 border-transparent'
                      }`}
                    >
                      <input 
                        type="checkbox" 
                        checked={isChecked} 
                        disabled={isDisabled}
                        onChange={() => toggleQuestion(q.id)} 
                        className="rounded border-dark-600 bg-dark-900 text-brand-500 focus:ring-brand-500 w-4 h-4" 
                      />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm text-white truncate font-medium">{q.title}</p>
                        <p className="text-xs text-dark-500">{q.topic} · {q.marks} marks</p>
                      </div>
                      <span className={`text-xs font-semibold ${diffColors[q.difficulty]}`}>{q.difficulty}</span>
                    </label>
                  );
                })}
              </div>
            )}
            
            {!form.randomize_questions && (
              <div className="text-xs text-dark-400 flex items-center justify-between border-t border-dark-700/30 pt-3">
                <span>Selected: <strong className="text-white">{form.question_ids.length}</strong> / {form.questions_per_student}</span>
                {form.question_ids.length !== form.questions_per_student && (
                  <span className="text-red-400">Must select exactly {form.questions_per_student}</span>
                )}
              </div>
            )}
          </div>
        )}

        <div className="flex justify-end gap-3 pt-2">
          <button 
            type="button" 
            onClick={() => navigate('/admin/tests')} 
            className="px-5 py-2 text-sm text-dark-400 hover:text-white transition-colors cursor-pointer"
          >
            Cancel
          </button>
          <button 
            type="submit" 
            disabled={saving} 
            className="px-6 py-2 bg-brand-500 hover:bg-brand-600 text-white font-semibold rounded-lg text-sm transition-colors cursor-pointer disabled:opacity-50"
          >
            {saving ? 'Saving...' : isEdit ? 'Update Assessment' : 'Create Assessment'}
          </button>
        </div>
      </form>
    </div>
  );
}
