import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { adminAPI } from '../../services/api';
import toast from 'react-hot-toast';
import { 
  HiOutlinePlus, HiOutlineEye, HiOutlineChartBar, HiOutlinePencil, 
  HiOutlineTrash, HiOutlineDuplicate, HiOutlineCalendar, HiOutlineClock,
  HiOutlineAcademicCap, HiOutlineCollection
} from 'react-icons/hi';

export default function Tests() {
  const [tests, setTests] = useState([]);
  const [banks, setBanks] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    setLoading(true);
    try {
      const [testsRes, banksRes] = await Promise.all([
        adminAPI.getTests(),
        adminAPI.getQuestionBanks()
      ]);
      setTests(testsRes.data || []);
      setBanks(banksRes.data || []);
    } catch {
      toast.error('Error loading tests and question banks');
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (id) => {
    if (!confirm('Are you sure you want to delete this test? This will also remove student attempt histories.')) return;
    try {
      await adminAPI.deleteTest(id);
      toast.success('Test deleted successfully');
      loadData();
    } catch {
      toast.error('Error deleting test');
    }
  };

  const handleDuplicate = async (test) => {
    if (!confirm(`Duplicate "${test.name}"?`)) return;
    try {
      const duplicatedData = {
        name: `${test.name} (Copy)`,
        description: test.description || '',
        year: test.year || 'Second Year',
        question_bank_id: test.question_bank_id || null,
        questions_per_student: test.questions_per_student || 5,
        total_marks: test.total_marks || 50,
        allowed_languages: test.allowed_languages || ['python', 'java', 'c', 'cpp'],
        randomize_questions: !!test.randomize_questions,
        question_ids: test.question_ids || [],
        start_time: test.start_time,
        end_time: test.end_time,
        max_violations: test.max_violations || 3,
        allow_copy_paste: !!test.allow_copy_paste,
        scoring_type: test.scoring_type || 'partial',
        show_results: !!test.show_results,
      };
      await adminAPI.createTest(duplicatedData);
      toast.success('Test duplicated successfully');
      loadData();
    } catch {
      toast.error('Error duplicating test');
    }
  };

  const getStatus = (t) => {
    const now = new Date();
    const start = new Date(t.start_time);
    const end = new Date(t.end_time);
    
    if (now < start) {
      return { label: 'Scheduled', color: 'bg-amber-500/10 text-amber-500 border-amber-500/20' };
    }
    if (now > end) {
      return { label: 'Completed', color: 'bg-dark-600/30 text-dark-400 border-dark-600/20' };
    }
    return { label: 'Active', color: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' };
  };

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Assessments</h1>
          <p className="text-dark-400 text-sm mt-1">Manage tests and view results</p>
        </div>
        <Link 
          to="/admin/tests/new" 
          className="flex items-center gap-2 px-4 py-2 bg-brand-500 hover:bg-brand-600 text-white rounded-lg text-sm font-medium transition-colors cursor-pointer"
        >
          <HiOutlinePlus className="w-4 h-4" /> Create New Test
        </Link>
      </div>

      <div className="space-y-3.5">
        {loading ? (
          [...Array(3)].map((_, i) => (
            <div key={i} className="bg-dark-800 border border-dark-700/50 rounded-xl p-5 animate-pulse">
              <div className="h-5 bg-dark-700 rounded w-48 mb-2" />
              <div className="h-3 bg-dark-700 rounded w-64" />
            </div>
          ))
        ) : tests.length === 0 ? (
          <div className="bg-dark-800 border border-dark-700/50 rounded-xl p-8 text-center text-dark-500">
            No tests created yet
          </div>
        ) : (
          tests.map(t => {
            const { label, color } = getStatus(t);
            const bank = banks.find(b => b.id === t.question_bank_id);
            const bankTitle = bank ? bank.title : 'General Questions';
            
            return (
              <div 
                key={t.id} 
                className="bg-dark-800 border border-dark-700/50 rounded-xl p-5 hover:border-dark-600 transition-colors"
              >
                <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2.5 mb-1.5 flex-wrap">
                      <h3 className="text-base font-bold text-white leading-snug">{t.name}</h3>
                      <span className={`text-[10px] uppercase font-bold px-2 py-0.5 rounded border ${color}`}>
                        {label}
                      </span>
                      <span className={`text-[10px] font-bold px-2 py-0.5 rounded border ${
                        t.year === 'Third Year' 
                          ? 'bg-purple-500/10 text-purple-400 border-purple-500/20' 
                          : 'bg-brand-500/10 text-brand-400 border-brand-500/20'
                      }`}>
                        {t.year}
                      </span>
                    </div>
                    {t.description && (
                      <p className="text-xs text-dark-400 mb-2.5 line-clamp-1">{t.description}</p>
                    )}
                    
                    <div className="flex flex-wrap items-center gap-y-1.5 gap-x-4 text-xs text-dark-500">
                      <div className="flex items-center gap-1">
                        <HiOutlineCollection className="w-3.5 h-3.5 text-dark-500" />
                        <span>Question Bank: <strong className="text-dark-300 font-medium">{bankTitle}</strong></span>
                      </div>
                      <div className="flex items-center gap-1">
                        <HiOutlineAcademicCap className="w-3.5 h-3.5 text-dark-500" />
                        <span>Pool: <strong className="text-dark-300 font-medium">{t.question_count}</strong> ({t.questions_per_student} / student)</span>
                      </div>
                      <div className="flex items-center gap-1">
                        <HiOutlineClock className="w-3.5 h-3.5 text-dark-500" />
                        <span>Duration: <strong className="text-dark-300 font-medium">{t.duration_minutes} Minutes</strong></span>
                      </div>
                      <div className="flex items-center gap-1">
                        <HiOutlineCalendar className="w-3.5 h-3.5 text-dark-500" />
                        <span>
                          {new Date(t.start_time).toLocaleDateString()} {new Date(t.start_time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                          {' – '}
                          {new Date(t.end_time).toLocaleDateString()} {new Date(t.end_time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </span>
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-1 pt-3 lg:pt-0 border-t lg:border-t-0 border-dark-700/30">
                    {label === 'Active' && (
                      <Link 
                        to={`/admin/tests/${t.id}/monitor`} 
                        className="p-2 text-dark-400 hover:text-emerald-500 bg-dark-900 border border-dark-750 hover:border-emerald-500/20 rounded-lg transition-all" 
                        title="Live Monitor"
                      >
                        <HiOutlineEye className="w-4.5 h-4.5" />
                      </Link>
                    )}
                    <Link 
                      to={`/admin/tests/${t.id}/results`} 
                      className="p-2 text-dark-400 hover:text-brand-400 bg-dark-900 border border-dark-750 hover:border-brand-500/20 rounded-lg transition-all" 
                      title="View Results"
                    >
                      <HiOutlineChartBar className="w-4.5 h-4.5" />
                    </Link>
                    <button 
                      onClick={() => handleDuplicate(t)} 
                      className="p-2 text-dark-400 hover:text-purple-400 bg-dark-900 border border-dark-750 hover:border-purple-500/20 rounded-lg transition-all cursor-pointer" 
                      title="Duplicate"
                    >
                      <HiOutlineDuplicate className="w-4.5 h-4.5" />
                    </button>
                    <Link 
                      to={`/admin/tests/${t.id}/edit`} 
                      className="p-2 text-dark-400 hover:text-amber-500 bg-dark-900 border border-dark-750 hover:border-amber-500/20 rounded-lg transition-all" 
                      title="Edit"
                    >
                      <HiOutlinePencil className="w-4.5 h-4.5" />
                    </Link>
                    <button 
                      onClick={() => handleDelete(t.id)} 
                      className="p-2 text-dark-400 hover:text-red-400 bg-dark-900 border border-dark-750 hover:border-red-500/20 rounded-lg transition-all cursor-pointer" 
                      title="Delete"
                    >
                      <HiOutlineTrash className="w-4.5 h-4.5" />
                    </button>
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
