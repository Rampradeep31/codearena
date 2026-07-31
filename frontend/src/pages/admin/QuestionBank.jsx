import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { adminAPI } from '../../services/api';
import toast from 'react-hot-toast';
import { HiOutlinePlus, HiOutlineSearch, HiOutlinePencil, HiOutlineTrash } from 'react-icons/hi';

const difficultyColors = { easy: 'text-emerald-500 bg-emerald-500/10', medium: 'text-amber-500 bg-amber-500/10', hard: 'text-red-500 bg-red-500/10' };

export default function QuestionBank() {
  const [questions, setQuestions] = useState([]);
  const [search, setSearch] = useState('');
  const [difficulty, setDifficulty] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => { loadQuestions(); }, [search, difficulty]);

  const loadQuestions = async () => {
    try {
      const res = await adminAPI.getQuestions({ search: search || undefined, difficulty: difficulty || undefined });
      setQuestions(res.data);
    } catch (err) { console.error(err); }
    finally { setLoading(false); }
  };

  const handleDelete = async (id) => {
    if (!confirm('Delete this question?')) return;
    try { await adminAPI.deleteQuestion(id); toast.success('Question deleted'); loadQuestions(); }
    catch { toast.error('Error deleting question'); }
  };

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Question Bank</h1>
          <p className="text-dark-400 text-sm mt-1">{questions.length} questions</p>
        </div>
        <Link to="/admin/questions/new" className="flex items-center gap-2 px-4 py-2 bg-brand-500 hover:bg-brand-600 text-white rounded-lg text-sm font-medium transition-colors">
          <HiOutlinePlus className="w-4 h-4" /> New Question
        </Link>
      </div>

      <div className="flex items-center gap-3">
        <div className="relative flex-1 max-w-sm">
          <HiOutlineSearch className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-dark-500" />
          <input type="text" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search questions..." className="w-full pl-9 pr-4 py-2 bg-dark-800 border border-dark-600/50 rounded-lg text-sm text-white placeholder-dark-500 focus:outline-none focus:border-brand-500" />
        </div>
        <select value={difficulty} onChange={(e) => setDifficulty(e.target.value)} className="px-3 py-2 bg-dark-800 border border-dark-600/50 rounded-lg text-sm text-white focus:outline-none focus:border-brand-500">
          <option value="">All Difficulties</option>
          <option value="easy">Easy</option>
          <option value="medium">Medium</option>
          <option value="hard">Hard</option>
        </select>
      </div>

      <div className="space-y-3">
        {loading ? [...Array(5)].map((_, i) => (
          <div key={i} className="bg-dark-800 border border-dark-700/50 rounded-xl p-5 animate-pulse">
            <div className="h-5 bg-dark-700 rounded w-48 mb-2" />
            <div className="h-3 bg-dark-700 rounded w-32" />
          </div>
        )) : questions.length === 0 ? (
          <div className="bg-dark-800 border border-dark-700/50 rounded-xl p-8 text-center text-dark-500">No questions found</div>
        ) : questions.map(q => (
          <div key={q.id} className="bg-dark-800 border border-dark-700/50 rounded-xl p-5 hover:border-dark-600 transition-colors">
            <div className="flex items-start justify-between">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  <Link to={`/admin/questions/${q.id}`} className="text-base font-medium text-white hover:text-brand-400 truncate transition-colors">{q.title}</Link>
                  <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${difficultyColors[q.difficulty]}`}>{q.difficulty}</span>
                </div>
                <div className="flex items-center gap-4 text-xs text-dark-400">
                  <span>{q.topic}</span>
                  <span>{q.marks} marks</span>
                  <span>{q.test_cases?.length || 0} test cases</span>
                </div>
              </div>
              <div className="flex items-center gap-1 ml-4">
                <Link to={`/admin/questions/${q.id}`} className="p-1.5 text-dark-400 hover:text-brand-400 transition-colors"><HiOutlinePencil className="w-4 h-4" /></Link>
                <button onClick={() => handleDelete(q.id)} className="p-1.5 text-dark-400 hover:text-red-400 transition-colors"><HiOutlineTrash className="w-4 h-4" /></button>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
