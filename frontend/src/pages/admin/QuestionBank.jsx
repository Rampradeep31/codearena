import { useState, useEffect } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { adminAPI } from '../../services/api';
import toast from 'react-hot-toast';
import { 
  HiOutlinePlus, HiOutlineSearch, HiOutlinePencil, HiOutlineTrash, 
  HiOutlineArrowLeft, HiOutlineCollection, HiOutlineFolder, HiOutlineCalendar, 
  HiOutlineUser, HiOutlineClock, HiOutlineChevronRight
} from 'react-icons/hi';

const difficultyColors = { 
  easy: 'text-emerald-500 bg-emerald-500/10 border-emerald-500/20', 
  medium: 'text-amber-500 bg-amber-500/10 border-amber-500/20', 
  hard: 'text-red-500 bg-red-500/10 border-red-500/20' 
};

export default function QuestionBank() {
  const [searchParams, setSearchParams] = useSearchParams();
  const viewBankId = searchParams.get('view_bank');

  // Question Banks State
  const [banks, setBanks] = useState([]);
  const [loadingBanks, setLoadingBanks] = useState(true);
  const [search, setSearch] = useState('');
  const [yearFilter, setYearFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [sortBy, setSortBy] = useState('newest');

  // Selected Bank Detail State
  const [selectedBank, setSelectedBank] = useState(null);
  const [bankQuestions, setBankQuestions] = useState([]);
  const [qSearch, setQSearch] = useState('');
  const [qDifficulty, setQDifficulty] = useState('');
  const [loadingQuestions, setLoadingQuestions] = useState(false);

  // Bank Modal State
  const [showModal, setShowModal] = useState(false);
  const [editingBank, setEditingBank] = useState(null);
  const [modalForm, setModalForm] = useState({
    year: 'Second Year',
    title: '',
    description: '',
    status: 'Active'
  });
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    loadBanks();
  }, [search, yearFilter, statusFilter, sortBy]);

  useEffect(() => {
    if (viewBankId) {
      loadBankDetails(viewBankId);
    } else {
      setSelectedBank(null);
      setBankQuestions([]);
    }
  }, [viewBankId, qSearch, qDifficulty]);

  // Load All Banks
  const loadBanks = async () => {
    setLoadingBanks(true);
    try {
      // Question counts come from the backend aggregate (Supabase), never from
      // fetching the full question list in the browser.
      const res = await adminAPI.getQuestionBanks({
        search: search || undefined,
        year: yearFilter || undefined,
        status: statusFilter || undefined
      });

      let list = (res.data || []).map(b => ({
        ...b,
        question_count: b.question_count || 0,
      }));

      // Sorting
      if (sortBy === 'newest') {
        list.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
      } else if (sortBy === 'oldest') {
        list.sort((a, b) => new Date(a.created_at) - new Date(b.created_at));
      } else if (sortBy === 'most_questions') {
        list.sort((a, b) => b.question_count - a.question_count);
      } else if (sortBy === 'least_questions') {
        list.sort((a, b) => a.question_count - b.question_count);
      }

      setBanks(list);
    } catch (err) {
      console.error(err);
      toast.error('Error loading question banks');
    } finally {
      setLoadingBanks(false);
    }
  };

  // Load Specific Bank Details and its Questions
  const loadBankDetails = async (bankId) => {
    setLoadingQuestions(true);
    try {
      const bankRes = await adminAPI.getQuestionBank(bankId);
      if (bankRes.data) {
        setSelectedBank(bankRes.data);
        
        const qRes = await adminAPI.getQuestions({
          question_bank_id: bankId,
          search: qSearch || undefined,
          difficulty: qDifficulty || undefined
        });
        setBankQuestions(qRes.data || []);
      } else {
        toast.error('Question bank not found');
        setSearchParams({});
      }
    } catch (err) {
      console.error(err);
      toast.error('Error loading question bank details');
    } finally {
      setLoadingQuestions(false);
    }
  };

  // Create/Edit Submit
  const handleModalSave = async (e) => {
    e.preventDefault();
    if (!modalForm.title.trim()) {
      toast.error('Title is required');
      return;
    }
    setSubmitting(true);
    try {
      if (editingBank) {
        await adminAPI.updateQuestionBank(editingBank.id, modalForm);
        toast.success('Question bank updated');
      } else {
        await adminAPI.createQuestionBank(modalForm);
        toast.success('Question bank created');
      }
      setShowModal(false);
      loadBanks();
      if (viewBankId && editingBank && editingBank.id === parseInt(viewBankId)) {
        loadBankDetails(viewBankId);
      }
    } catch (err) {
      console.error(err);
      toast.error('Error saving question bank');
    } finally {
      setSubmitting(false);
    }
  };

  // Delete Bank
  const handleDeleteBank = async (bank) => {
    if (!confirm(`Are you sure you want to delete "${bank.title}"? Questions associated with this bank will be unassigned.`)) return;
    try {
      await adminAPI.deleteQuestionBank(bank.id);
      toast.success('Question bank deleted');
      if (viewBankId && parseInt(viewBankId) === bank.id) {
        setSearchParams({});
      } else {
        loadBanks();
      }
    } catch (err) {
      console.error(err);
      toast.error('Error deleting question bank');
    }
  };

  // Delete Question
  const handleDeleteQuestion = async (qid) => {
    if (!confirm('Are you sure you want to delete this question? This will permanently remove the question and all associated test cases.')) return;
    try {
      await adminAPI.deleteQuestion(qid);
      toast.success('Question deleted');
      if (viewBankId) {
        loadBankDetails(viewBankId);
      }
    } catch {
      toast.error('Error deleting question');
    }
  };

  const openCreateModal = () => {
    setEditingBank(null);
    setModalForm({
      year: 'Second Year',
      title: '',
      description: '',
      status: 'Active'
    });
    setShowModal(true);
  };

  const openEditModal = (bank) => {
    setEditingBank(bank);
    setModalForm({
      year: bank.year,
      title: bank.title,
      description: bank.description || '',
      status: bank.status
    });
    setShowModal(true);
  };

  const inputClass = "w-full px-3 py-2 bg-dark-800 border border-dark-600/50 rounded-lg text-sm text-white focus:outline-none focus:border-brand-500 transition-colors";
  const labelClass = "block text-xs font-medium text-dark-400 mb-1";

  // Group banks by year
  const secondYearBanks = banks.filter(b => b.year === 'Second Year');
  const thirdYearBanks = banks.filter(b => b.year === 'Third Year');

  // VIEW DETAILS MODE
  if (selectedBank) {
    return (
      <div className="space-y-6 animate-fade-in">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <button 
              onClick={() => setSearchParams({})} 
              className="p-2 text-dark-400 hover:text-white bg-dark-800 border border-dark-700/30 rounded-lg transition-colors cursor-pointer"
            >
              <HiOutlineArrowLeft className="w-5 h-5" />
            </button>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-2xl font-bold text-white">{selectedBank.title}</h1>
                <span className={`text-[10px] uppercase font-bold px-2 py-0.5 rounded border ${
                  selectedBank.status === 'Active' ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' : 'bg-dark-700/50 text-dark-400 border-dark-600/30'
                }`}>
                  {selectedBank.status}
                </span>
              </div>
              <p className="text-dark-400 text-sm mt-0.5">
                {selectedBank.year} · {selectedBank.description || 'No description provided'}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button 
              onClick={() => openEditModal(selectedBank)} 
              className="px-3 py-2 bg-dark-800 border border-dark-600/50 hover:border-dark-500 text-dark-300 hover:text-white rounded-lg text-sm font-medium transition-colors cursor-pointer"
            >
              Edit Bank Info
            </button>
            <Link 
              to={`/admin/questions/new?bank_id=${selectedBank.id}`} 
              className="flex items-center gap-2 px-4 py-2 bg-brand-500 hover:bg-brand-600 text-white rounded-lg text-sm font-medium transition-colors"
            >
              <HiOutlinePlus className="w-4 h-4" /> Add coding question
            </Link>
          </div>
        </div>

        {/* Filter bar for questions */}
        <div className="bg-dark-800 border border-dark-700/50 rounded-xl p-4 flex flex-col md:flex-row md:items-center justify-between gap-3">
          <div className="relative flex-1 max-w-sm">
            <HiOutlineSearch className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-dark-500" />
            <input 
              type="text" 
              value={qSearch} 
              onChange={(e) => setQSearch(e.target.value)} 
              placeholder="Search questions by title or topic..." 
              className="w-full pl-9 pr-4 py-2 bg-dark-900 border border-dark-700/50 rounded-lg text-sm text-white placeholder-dark-500 focus:outline-none focus:border-brand-500" 
            />
          </div>
          <select 
            value={qDifficulty} 
            onChange={(e) => setQDifficulty(e.target.value)} 
            className="px-3 py-2 bg-dark-900 border border-dark-700/50 rounded-lg text-sm text-white focus:outline-none focus:border-brand-500 cursor-pointer"
          >
            <option value="">All Difficulties</option>
            <option value="easy">Easy</option>
            <option value="medium">Medium</option>
            <option value="hard">Hard</option>
          </select>
        </div>

        {/* Questions inside the Bank */}
        <div className="space-y-3">
          {loadingQuestions ? (
            [...Array(3)].map((_, i) => (
              <div key={i} className="bg-dark-800 border border-dark-700/50 rounded-xl p-5 animate-pulse">
                <div className="h-5 bg-dark-700 rounded w-48 mb-2" />
                <div className="h-3 bg-dark-700 rounded w-32" />
              </div>
            ))
          ) : bankQuestions.length === 0 ? (
            <div className="bg-dark-800 border border-dark-700/50 rounded-xl p-8 text-center text-dark-500">
              <HiOutlineCollection className="w-12 h-12 mx-auto text-dark-600 mb-3" />
              <p className="font-medium text-white mb-1">No coding questions uploaded yet</p>
              <p className="text-sm text-dark-400 mb-4">Add coding challenges to make them selectable for tests</p>
              <Link 
                to={`/admin/questions/new?bank_id=${selectedBank.id}`} 
                className="inline-flex items-center gap-2 px-4 py-2 bg-brand-500/10 hover:bg-brand-500/20 text-brand-400 border border-brand-500/20 rounded-lg text-sm font-medium transition-colors"
              >
                <HiOutlinePlus className="w-4 h-4" /> Create first question
              </Link>
            </div>
          ) : (
            bankQuestions.map(q => (
              <div key={q.id} className="bg-dark-800 border border-dark-700/50 rounded-xl p-5 hover:border-dark-600 transition-colors">
                <div className="flex items-start justify-between">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <Link to={`/admin/questions/${q.id}`} className="text-base font-medium text-white hover:text-brand-400 truncate transition-colors">{q.title}</Link>
                      <span className={`text-xs font-semibold px-2.5 py-0.5 rounded-full border ${difficultyColors[q.difficulty]}`}>{q.difficulty}</span>
                    </div>
                    <div className="flex items-center gap-4 text-xs text-dark-400">
                      <span className="bg-dark-900 px-2 py-1 rounded text-dark-300">{q.topic}</span>
                      <span>Marks: <strong className="text-white">{q.marks}</strong></span>
                      <span>Test Cases: <strong className="text-white">{q.test_cases?.length || 0}</strong></span>
                    </div>
                  </div>
                  <div className="flex items-center gap-1 ml-4">
                    <Link to={`/admin/questions/${q.id}`} className="p-1.5 text-dark-400 hover:text-brand-400 transition-colors" title="Edit Question"><HiOutlinePencil className="w-4.5 h-4.5" /></Link>
                    <button onClick={() => handleDeleteQuestion(q.id)} className="p-1.5 text-dark-400 hover:text-red-400 transition-colors cursor-pointer" title="Delete Question"><HiOutlineTrash className="w-4.5 h-4.5" /></button>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>

        {/* Modal for editing selected bank info */}
        {showModal && renderBankModal()}
      </div>
    );
  }

  // LISTING VIEW MODE
  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Question Banks</h1>
          <p className="text-dark-400 text-sm mt-1">
            Organize assessments by creating academic year question pools
          </p>
        </div>
        <button 
          onClick={openCreateModal} 
          className="flex items-center gap-2 px-4 py-2 bg-brand-500 hover:bg-brand-600 text-white rounded-lg text-sm font-medium transition-colors cursor-pointer"
        >
          <HiOutlinePlus className="w-4 h-4" /> Create Question Bank
        </button>
      </div>

      {/* Filter and Search Bar */}
      <div className="bg-dark-800 border border-dark-700/50 rounded-xl p-4 flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div className="relative flex-1 max-w-md">
          <HiOutlineSearch className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-dark-500" />
          <input 
            type="text" 
            value={search} 
            onChange={(e) => setSearch(e.target.value)} 
            placeholder="Search Question Banks by title..." 
            className="w-full pl-9 pr-4 py-2 bg-dark-900 border border-dark-700/50 rounded-lg text-sm text-white placeholder-dark-500 focus:outline-none focus:border-brand-500" 
          />
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <select 
            value={yearFilter} 
            onChange={(e) => setYearFilter(e.target.value)} 
            className="px-3 py-2 bg-dark-900 border border-dark-700/50 rounded-lg text-sm text-white focus:outline-none focus:border-brand-500 cursor-pointer"
          >
            <option value="">All Academic Years</option>
            <option value="Second Year">Second Year</option>
            <option value="Third Year">Third Year</option>
          </select>

          <select 
            value={statusFilter} 
            onChange={(e) => setStatusFilter(e.target.value)} 
            className="px-3 py-2 bg-dark-900 border border-dark-700/50 rounded-lg text-sm text-white focus:outline-none focus:border-brand-500 cursor-pointer"
          >
            <option value="">All Statuses</option>
            <option value="Active">Active</option>
            <option value="Inactive">Inactive</option>
          </select>

          <select 
            value={sortBy} 
            onChange={(e) => setSortBy(e.target.value)} 
            className="px-3 py-2 bg-dark-900 border border-dark-700/50 rounded-lg text-sm text-white focus:outline-none focus:border-brand-500 cursor-pointer"
          >
            <option value="newest">Newest First</option>
            <option value="oldest">Oldest First</option>
            <option value="most_questions">Most Questions</option>
            <option value="least_questions">Least Questions</option>
          </select>
        </div>
      </div>

      {loadingBanks ? (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="bg-dark-800 border border-dark-700/50 rounded-xl p-5 h-40 animate-pulse" />
          ))}
        </div>
      ) : banks.length === 0 ? (
        <div className="bg-dark-800 border border-dark-700/50 rounded-xl p-8 text-center text-dark-500">
          <HiOutlineCollection className="w-12 h-12 mx-auto text-dark-600 mb-3" />
          <p className="font-medium text-white mb-1">No question banks found</p>
          <p className="text-sm text-dark-400">Try adjusting your filters or create a new bank</p>
        </div>
      ) : (
        <div className="space-y-8">
          {/* Second Year Pools */}
          {(yearFilter === '' || yearFilter === 'Second Year') && (
            <div className="space-y-4">
              <h2 className="text-lg font-bold text-white flex items-center gap-2 border-l-3 border-brand-500 pl-3">
                Second Year <span className="text-xs font-normal text-dark-400">({secondYearBanks.length} banks)</span>
              </h2>
              {secondYearBanks.length === 0 ? (
                <p className="text-sm text-dark-500 italic pl-3">No question banks created for Second Year</p>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {secondYearBanks.map(b => renderBankCard(b))}
                </div>
              )}
            </div>
          )}

          {/* Third Year Pools */}
          {(yearFilter === '' || yearFilter === 'Third Year') && (
            <div className="space-y-4">
              <h2 className="text-lg font-bold text-white flex items-center gap-2 border-l-3 border-purple-500 pl-3">
                Third Year <span className="text-xs font-normal text-dark-400">({thirdYearBanks.length} banks)</span>
              </h2>
              {thirdYearBanks.length === 0 ? (
                <p className="text-sm text-dark-500 italic pl-3">No question banks created for Third Year</p>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {thirdYearBanks.map(b => renderBankCard(b))}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Create / Edit Modal */}
      {showModal && renderBankModal()}
    </div>
  );

  // Bank Card Component
  function renderBankCard(bank) {
    return (
      <div 
        key={bank.id} 
        className="bg-dark-800 border border-dark-700/50 rounded-xl p-5 hover:border-dark-600 transition-all flex flex-col justify-between group h-full"
      >
        <div>
          <div className="flex items-start justify-between mb-2">
            <div>
              <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${
                bank.year === 'Third Year' 
                  ? 'bg-purple-500/10 text-purple-400 border-purple-500/20' 
                  : 'bg-brand-500/10 text-brand-400 border-brand-500/20'
              }`}>
                {bank.year}
              </span>
            </div>
            <span className={`text-[10px] uppercase font-bold px-2 py-0.5 rounded border ${
              bank.status === 'Active' ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' : 'bg-dark-700/50 text-dark-400 border-dark-600/30'
            }`}>
              {bank.status}
            </span>
          </div>

          <h3 className="text-lg font-bold text-white group-hover:text-brand-400 transition-colors">
            {bank.title}
          </h3>
          <p className="text-dark-400 text-xs mt-1 line-clamp-2">
            {bank.description || 'No description provided.'}
          </p>
        </div>

        <div className="mt-4 pt-4 border-t border-dark-700/30 flex items-center justify-between text-xs text-dark-400">
          <div className="flex items-center gap-1.5">
            <HiOutlineCollection className="w-4 h-4 text-dark-500" />
            <span>Questions: <strong className="text-white font-medium">{bank.question_count}</strong></span>
          </div>
          <div className="flex items-center gap-1">
            <button 
              onClick={() => setSearchParams({ view_bank: bank.id })} 
              className="px-2.5 py-1.5 bg-dark-900 border border-dark-750 hover:bg-dark-750 hover:text-white rounded text-xs font-medium flex items-center gap-0.5 transition-colors cursor-pointer"
            >
              View <HiOutlineChevronRight className="w-3.5 h-3.5" />
            </button>
            <button 
              onClick={() => openEditModal(bank)} 
              className="p-1.5 text-dark-500 hover:text-brand-400 hover:bg-dark-700/20 rounded transition-colors cursor-pointer" 
              title="Edit"
            >
              <HiOutlinePencil className="w-4 h-4" />
            </button>
            <button 
              onClick={() => handleDeleteBank(bank)} 
              className="p-1.5 text-dark-500 hover:text-red-400 hover:bg-dark-700/20 rounded transition-colors cursor-pointer" 
              title="Delete"
            >
              <HiOutlineTrash className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Question Bank Creation/Edit Modal
  function renderBankModal() {
    return (
      <div className="fixed inset-0 bg-black/60 flex items-center justify-center p-4 z-50 animate-fade-in backdrop-blur-xs">
        <div className="bg-dark-900 border border-dark-700/50 rounded-xl max-w-md w-full p-6 shadow-2xl relative">
          <h2 className="text-lg font-bold text-white mb-4">
            {editingBank ? 'Edit Question Bank' : 'Create Question Bank'}
          </h2>

          <form onSubmit={handleModalSave} className="space-y-4">
            <div>
              <label className={labelClass}>Select Year</label>
              <select 
                value={modalForm.year} 
                onChange={(e) => setModalForm({ ...modalForm, year: e.target.value })} 
                className={inputClass}
              >
                <option value="Second Year">Second Year</option>
                <option value="Third Year">Third Year</option>
              </select>
            </div>

            <div>
              <label className={labelClass}>Question Bank Title</label>
              <input 
                type="text" 
                value={modalForm.title} 
                onChange={(e) => setModalForm({ ...modalForm, title: e.target.value })} 
                placeholder="e.g. Arrays Practice Set" 
                required 
                className={inputClass} 
              />
              <p className="text-[10px] text-dark-500 mt-1">
                Examples: June Month Question Bank, Week 1 Questions, Internal Assessment Question Bank
              </p>
            </div>

            <div>
              <label className={labelClass}>Description (Optional)</label>
              <textarea 
                value={modalForm.description} 
                onChange={(e) => setModalForm({ ...modalForm, description: e.target.value })} 
                placeholder="Brief summary of question pool..." 
                rows={3} 
                className={inputClass + ' resize-none'} 
              />
            </div>

            <div>
              <label className={labelClass}>Status</label>
              <select 
                value={modalForm.status} 
                onChange={(e) => setModalForm({ ...modalForm, status: e.target.value })} 
                className={inputClass}
              >
                <option value="Active">Active</option>
                <option value="Inactive">Inactive</option>
              </select>
            </div>

            <div className="flex justify-end gap-3 pt-2">
              <button 
                type="button" 
                onClick={() => setShowModal(false)} 
                className="px-4 py-2 text-sm text-dark-400 hover:text-white transition-colors cursor-pointer"
              >
                Cancel
              </button>
              <button 
                type="submit" 
                disabled={submitting} 
                className="px-5 py-2 bg-brand-500 hover:bg-brand-600 disabled:opacity-50 text-white rounded-lg text-sm font-medium transition-colors cursor-pointer"
              >
                {submitting ? 'Saving...' : editingBank ? 'Save Changes' : 'Create Question Bank'}
              </button>
            </div>
          </form>
        </div>
      </div>
    );
  }
}
