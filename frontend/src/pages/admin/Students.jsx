import { useState, useEffect, useRef } from 'react';
import { adminAPI } from '../../services/api';
import toast from 'react-hot-toast';
import { HiOutlinePlus, HiOutlineSearch, HiOutlinePencil, HiOutlineTrash, HiOutlineUpload, HiOutlineX } from 'react-icons/hi';

export default function Students() {
  const [students, setStudents] = useState([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editingStudent, setEditingStudent] = useState(null);
  const [form, setForm] = useState({ name: '', register_number: '', email: '', department: '', year: '', section: '', password: '' });
  const [submitting, setSubmitting] = useState(false);
  const fileRef = useRef();

  useEffect(() => { loadStudents(); }, [search]);

  const loadStudents = async () => {
    try {
      const res = await adminAPI.getStudents({ search: search || undefined });
      setStudents(res.data);
    } catch (err) { console.error(err); }
    finally { setLoading(false); }
  };

  const openCreate = () => {
    setEditingStudent(null);
    setForm({ name: '', register_number: '', email: '', department: '', year: '', section: '', password: '' });
    setShowModal(true);
  };

  const openEdit = (s) => {
    setEditingStudent(s);
    setForm({ name: s.name, register_number: s.register_number || '', email: s.email, department: s.department || '', year: s.year || '', section: s.section || '', password: '' });
    setShowModal(true);
  };

  const handleSave = async (e) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      if (editingStudent) {
        const data = { ...form, year: form.year ? parseInt(form.year) : null };
        if (!data.password) delete data.password;
        await adminAPI.updateStudent(editingStudent.id, data);
        toast.success('Student updated');
      } else {
        await adminAPI.createStudent({ ...form, year: form.year ? parseInt(form.year) : null });
        toast.success('Student created');
      }
      setShowModal(false);
      loadStudents();
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Error saving student');
    } finally { setSubmitting(false); }
  };

  const handleDelete = async (id) => {
    if (!confirm('Delete this student?')) return;
    try {
      await adminAPI.deleteStudent(id);
      toast.success('Student deleted');
      loadStudents();
    } catch (err) { toast.error('Error deleting student'); }
  };

  const handleExcelImport = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    try {
      const res = await adminAPI.importStudents(file);
      toast.success(`Imported ${res.data.created} students`);
      if (res.data.errors?.length) toast.error(`${res.data.errors.length} errors`);
      loadStudents();
    } catch (err) { 
      console.error("Excel import failed:", err);
      toast.error('Excel import failed: ' + (err.message || err)); 
    }
    fileRef.current.value = '';
  };

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Students</h1>
          <p className="text-dark-400 text-sm mt-1">Manage student accounts</p>
        </div>
        <div className="flex items-center gap-2">
          <input type="file" ref={fileRef} accept=".xlsx,.xls" onChange={handleExcelImport} className="hidden" />
          <button onClick={() => fileRef.current.click()} className="flex items-center gap-2 px-3 py-2 bg-dark-800 border border-dark-600/50 rounded-lg text-sm text-dark-300 hover:text-white hover:border-dark-500 transition-all">
            <HiOutlineUpload className="w-4 h-4" /> Import Excel
          </button>
          <button onClick={openCreate} className="flex items-center gap-2 px-4 py-2 bg-brand-500 hover:bg-brand-600 text-white rounded-lg text-sm font-medium transition-colors">
            <HiOutlinePlus className="w-4 h-4" /> Add Student
          </button>
        </div>
      </div>

      {/* Search */}
      <div className="relative max-w-sm">
        <HiOutlineSearch className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-dark-500" />
        <input type="text" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search by name, register number, email..." className="w-full pl-9 pr-4 py-2 bg-dark-800 border border-dark-600/50 rounded-lg text-sm text-white placeholder-dark-500 focus:outline-none focus:border-brand-500" />
      </div>

      {/* Table */}
      <div className="bg-dark-800 border border-dark-700/50 rounded-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-dark-700/50">
                {['Name', 'Register No.', 'Email', 'Department', 'Year', 'Section', 'Status', 'Actions'].map(h => (
                  <th key={h} className="px-4 py-3 text-left text-xs font-medium text-dark-400 uppercase tracking-wider">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-dark-700/30">
              {loading ? [...Array(5)].map((_, i) => (
                <tr key={i}><td colSpan={8} className="px-4 py-3"><div className="h-4 bg-dark-700 rounded animate-pulse" /></td></tr>
              )) : students.length === 0 ? (
                <tr><td colSpan={8} className="px-4 py-8 text-center text-dark-500 text-sm">No students found</td></tr>
              ) : students.map(s => (
                <tr key={s.id} className="hover:bg-dark-700/20 transition-colors">
                  <td className="px-4 py-3 text-sm text-white font-medium">{s.name}</td>
                  <td className="px-4 py-3 text-sm text-dark-300 font-mono">{s.register_number}</td>
                  <td className="px-4 py-3 text-sm text-dark-300">{s.email}</td>
                  <td className="px-4 py-3 text-sm text-dark-400">{s.department || '—'}</td>
                  <td className="px-4 py-3 text-sm text-dark-400">
                    {s.year === 2 ? 'Second Year' : s.year === 3 ? 'Third Year' : s.year || '—'}
                  </td>
                  <td className="px-4 py-3 text-sm text-dark-400">{s.section || '—'}</td>
                  <td className="px-4 py-3">
                    <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${s.status === 'active' ? 'bg-emerald-500/10 text-emerald-500' : 'bg-red-500/10 text-red-500'}`}>
                      {s.status}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-1">
                      <button onClick={() => openEdit(s)} className="p-1.5 text-dark-400 hover:text-brand-400 transition-colors"><HiOutlinePencil className="w-4 h-4" /></button>
                      <button onClick={() => handleDelete(s.id)} className="p-1.5 text-dark-400 hover:text-red-400 transition-colors"><HiOutlineTrash className="w-4 h-4" /></button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
          <div className="bg-dark-900 border border-dark-700/50 rounded-2xl w-full max-w-lg p-6 animate-fade-in">
            <div className="flex items-center justify-between mb-5">
              <h3 className="text-lg font-semibold text-white">{editingStudent ? 'Edit Student' : 'Add Student'}</h3>
              <button onClick={() => setShowModal(false)} className="text-dark-400 hover:text-white"><HiOutlineX className="w-5 h-5" /></button>
            </div>
            <form onSubmit={handleSave} className="space-y-3">
              <div>
                <label className="block text-xs font-medium text-dark-400 mb-1">Name</label>
                <input type="text" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required
                  className="w-full px-3 py-2 bg-dark-800 border border-dark-600/50 rounded-lg text-sm text-white placeholder-dark-500 focus:outline-none focus:border-brand-500" />
              </div>
              <div>
                <label className="block text-xs font-medium text-dark-400 mb-1">Register Number</label>
                <input type="text" value={form.register_number} onChange={(e) => setForm({ ...form, register_number: e.target.value })} required disabled={!!editingStudent}
                  className="w-full px-3 py-2 bg-dark-800 border border-dark-600/50 rounded-lg text-sm text-white placeholder-dark-500 focus:outline-none focus:border-brand-500 disabled:opacity-50" />
              </div>
              <div>
                <label className="block text-xs font-medium text-dark-400 mb-1">Email</label>
                <input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} required
                  className="w-full px-3 py-2 bg-dark-800 border border-dark-600/50 rounded-lg text-sm text-white placeholder-dark-500 focus:outline-none focus:border-brand-500" />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-dark-400 mb-1">Year</label>
                  <select value={form.year} onChange={(e) => setForm({ ...form, year: e.target.value })} required
                    className="w-full px-3 py-2 bg-dark-800 border border-dark-600/50 rounded-lg text-sm text-white focus:outline-none focus:border-brand-500 cursor-pointer">
                    <option value="">Select Year</option>
                    <option value="2">Second Year</option>
                    <option value="3">Third Year</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-dark-400 mb-1">Section</label>
                  <select value={form.section} onChange={(e) => setForm({ ...form, section: e.target.value })} required
                    className="w-full px-3 py-2 bg-dark-800 border border-dark-600/50 rounded-lg text-sm text-white focus:outline-none focus:border-brand-500 cursor-pointer">
                    <option value="">Select Section</option>
                    <option value="A">Section A</option>
                    <option value="B">Section B</option>
                    <option value="C">Section C</option>
                    <option value="D">Section D</option>
                  </select>
                </div>
              </div>
              <div>
                <label className="block text-xs font-medium text-dark-400 mb-1">Department</label>
                <input type="text" value={form.department} onChange={(e) => setForm({ ...form, department: e.target.value })}
                  placeholder="e.g. AI & DS"
                  className="w-full px-3 py-2 bg-dark-800 border border-dark-600/50 rounded-lg text-sm text-white placeholder-dark-500 focus:outline-none focus:border-brand-500" />
              </div>
              <div>
                <label className="block text-xs font-medium text-dark-400 mb-1">{editingStudent ? 'New Password (leave blank to keep)' : 'Password'}</label>
                <input type="password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} required={!editingStudent}
                  className="w-full px-3 py-2 bg-dark-800 border border-dark-600/50 rounded-lg text-sm text-white placeholder-dark-500 focus:outline-none focus:border-brand-500" />
              </div>
              <div className="flex justify-end gap-2 pt-3">
                <button type="button" onClick={() => setShowModal(false)} className="px-4 py-2 text-sm text-dark-400 hover:text-white transition-colors">Cancel</button>
                <button type="submit" disabled={submitting} className="px-4 py-2 bg-brand-500 hover:bg-brand-600 text-white rounded-lg text-sm font-medium disabled:opacity-50">
                  {submitting ? 'Saving...' : editingStudent ? 'Update' : 'Create'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
