import axios from 'axios';

// Single-service deployment: the backend serves this frontend build, so API
// calls are same-origin by default (empty base URL). Set VITE_API_URL only
// if the frontend is ever deployed separately from the backend again.
const API_BASE_URL =
  import.meta.env.VITE_API_URL ||
  (import.meta.env.PROD ? '' : '/api');

// The FastAPI backend is the only data source. It reads/writes Supabase.
// There is no direct frontend-to-Supabase access.

const backendApi = axios.create({
  baseURL: API_BASE_URL,
  headers: { 'Content-Type': 'application/json' },
  timeout: 180000,
});

// Extract the real backend error message from any axios error so the UI
// never shows a generic "service unavailable" message.
export function getErrorMessage(error, fallback = 'Request failed') {
  if (!error) return fallback;
  if (error?.response?.data?.detail) return String(error.response.data.detail);
  if (Array.isArray(error?.response?.data?.detail)) {
    return error.response.data.detail.map((d) => d.msg || String(d)).join('; ');
  }
  if (error?.response?.data?.message) return String(error.response.data.message);
  if (error?.response?.status) {
    return `Backend returned status ${error.response.status} (${error.response.statusText || 'error'}).`;
  }
  if (error?.message === 'Network Error' || error?.code === 'ERR_NETWORK' || !error?.response) {
    return 'Unable to connect to backend server. Please check your internet connection or verify the backend API service is running.';
  }
  if (error?.message) return String(error.message);
  return fallback;
}

// Reject with an Error that carries the real server detail AND the HTTP
// status, so callers can distinguish auth failures (401/403) from execution
// failures (500) instead of turning everything into "Compilation Error".
function rejectWithDetail(error) {
  const status = error?.response?.status;
  if (status === 401 || status === 403) {
    error.status = status;
    error.message = getErrorMessage(error, 'Session expired. Please log in again.');
    return Promise.reject(error);
  }
  error.status = status;
  error.message = getErrorMessage(error, error?.message || 'Request failed');
  return Promise.reject(error);
}

// Add auth token dynamically to requests (Tasks 3 & 4)
backendApi.interceptors.request.use((config) => {
  const token = localStorage.getItem('token') || localStorage.getItem('codearena_token');
  if (token) {
    if (config.headers && typeof config.headers.set === 'function') {
      config.headers.set('Authorization', `Bearer ${token}`);
    } else {
      config.headers = config.headers || {};
      config.headers['Authorization'] = `Bearer ${token}`;
    }
  }
  return config;
});

// Response Interceptor for auth + backend errors.
backendApi.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error?.response?.status === 401) {
      localStorage.removeItem('token');
      localStorage.removeItem('user');
      if (typeof window !== 'undefined' && window.location.pathname !== '/login') {
        window.location.href = '/login';
      }
    }
    return rejectWithDetail(error);
  }
);

// â”€â”€â”€ Auth API (Student Entry & Registration) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
export const authAPI = {
  // Both admin and students authenticate against the FastAPI backend only.
  login: async (email, password) => {
    const res = await backendApi.post('/auth/login', { email, password });
    if (res.data && res.data.user) return res;
    throw new Error('Invalid credentials');
  },

  studentEntry: async (studentData) => {
    // Registration is backend-only. A real error (duplicate register number,
    // invalid year, backend down) is surfaced to the student.
    const res = await backendApi.post('/auth/student-entry', studentData);
    if (res.data && res.data.user) return res;
    throw new Error('Registration failed');
  }
};

// â”€â”€â”€ Student API (Tests & Attempts) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// The FastAPI backend is the single source of truth for the student flow.
// Exam state (windows, attempts, expiry, submissions) lives ONLY server-side,
// so a refresh can never resurrect an exam or move it between dashboard
// buckets: the backend applies the same expiry rule on every read.
export const studentAPI = {
  getTests: async () => {
    const res = await backendApi.get('/student/tests');
    return res;
  },

  getAttempt: async (attemptId) => {
    const res = await backendApi.get(`/student/attempts/${attemptId}`);
    return res;
  },

  getAttemptQuestions: async (attemptId) => {
    // Assigned questions are decided by the backend at start time. Only public
    // test cases are returned; hidden cases stay server-side.
    const res = await backendApi.get(`/student/attempts/${attemptId}/questions`);
    return res;
  },

  startTest: async (testId) => {
    // Idempotent: resumes an existing in_progress attempt on repeat calls.
    const res = await backendApi.post(`/student/tests/${testId}/start`);
    return res;
  },

  saveCode: async (attemptId, data) => {
    const res = await backendApi.put(`/student/attempts/${attemptId}/code`, data);
    return res;
  },

  recordViolation: async (attemptId, data) => {
    const res = await backendApi.post(`/student/attempts/${attemptId}/violations`, {
      violation_type: data.violation_type
    });
    return {
      data: {
        violation_count: res.data.violation_count,
        max_violations: res.data.max_violations,
        auto_submitted: res.data.auto_submitted
      }
    };
  },

  finishTest: async (attemptId) => {
    // No status is sent â€” the backend determines submitted vs auto_submitted
    // from the server-side timer exclusively. Sending an empty body means
    // FinishAttemptRequest uses its default 'submitted', which the server will
    // upgrade to 'auto_submitted' if the timer has expired on the server.
    const res = await backendApi.post(`/student/attempts/${attemptId}/finish`, {});
    return res;
  }
};

export const codeAPI = {
  runCase: async (data) => {
    const res = await backendApi.post('/code/run-case', data);
    return res;
  },

  run: async (data) => {
    const res = await backendApi.post('/code/run', data);
    return res;
  },

  submit: async (data) => {
    // Submission persistence + score calculation are handled by the backend;
    // there are no client-side submission inserts or score recomputes.
    const res = await backendApi.post('/code/submit', data);
    return res;
  }
};

export const adminAPI = {
  // ─── Dashboard ─────────────────────────────────────────────
  // All data comes exclusively from FastAPI (Supabase), the single source of
  // truth for attempts, submissions, and exam state.
  getDashboard: async () => {
    const res = await backendApi.get('/admin/dashboard');
    const d = res.data;
    return {
      data: {
        total_students: d.total_students || 0,
        second_year_students: (d.students || []).filter(s => s.year === 2).length,
        third_year_students: (d.students || []).filter(s => s.year === 3).length,
        total_tests: d.total_tests || 0,
        active_tests: d.active_tests || 0,
        completed_tests: d.completed_tests || 0,
        total_banks: (d.banks || []).length,
        total_questions: d.total_questions || 0,
        average_score: (() => {
          const done = (d.attempts || []).filter(
            a => a.status === 'submitted' || a.status === 'auto_submitted'
          );
          if (!done.length) return 0;
          return Math.round(
            (done.reduce((s, a) => s + (a.total_score || 0), 0) / done.length) * 10
          ) / 10;
        })(),
        pass_percentage: (() => {
          const done = (d.attempts || []).filter(
            a => a.status === 'submitted' || a.status === 'auto_submitted'
          );
          if (!done.length) return 0;
          const tests = d.tests || [];
          const pass = done.filter(a => {
            const t = tests.find(t => t.id === a.test_id);
            return (a.total_score || 0) >= (t ? t.total_marks * 0.5 : 25);
          }).length;
          return Math.round((pass / done.length) * 100);
        })(),
        completed_attempts_count: (d.attempts || []).filter(
          a => a.status === 'submitted' || a.status === 'auto_submitted'
        ).length,
        students: d.students || [],
        tests: (d.tests || []).map(t => ({
          ...t,
          question_ids: t.question_ids || [],
          question_count: t.question_count || 0,
        })),
        questions: d.questions || [],
        attempts: d.attempts || [],
        submissions: d.submissions || [],
        banks: d.banks || [],
      }
    };
  },

  // ─── Student Management ─────────────────────────────────────
  getStudents: async (params) => {
    const query = new URLSearchParams();
    if (params?.search) query.set('search', params.search);
    if (params?.department) query.set('department', params.department);
    if (params?.year) query.set('year', String(params.year));
    const res = await backendApi.get(`/admin/students?${query.toString()}`);
    return res;
  },

  createStudent: async (data) => {
    const res = await backendApi.post('/admin/students', data);
    return res;
  },

  updateStudent: async (id, data) => {
    const res = await backendApi.put(`/admin/students/${id}`, data);
    return res;
  },

  deleteStudent: async (id) => {
    const res = await backendApi.delete(`/admin/students/${id}`);
    return res;
  },

  importStudents: async (file) => {
    const formData = new FormData();
    formData.append('file', file);
    const res = await backendApi.post('/admin/students/import', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
    return res;
  },

  // ─── Question Banks ─────────────────────────────────────────
  getQuestionBanks: async (params) => {
    const res = await backendApi.get('/admin/question-banks');
    let list = res.data || [];
    if (params?.year) list = list.filter(b => b.year === params.year);
    if (params?.status) list = list.filter(b => b.status === params.status);
    if (params?.search) {
      const s = params.search.toLowerCase();
      list = list.filter(b => b.title.toLowerCase().includes(s));
    }
    return { data: list };
  },

  getQuestionBank: async (id) => {
    const res = await backendApi.get(`/admin/question-banks/${id}`);
    return res;
  },

  createQuestionBank: async (data) => {
    const res = await backendApi.post('/admin/question-banks', data);
    return res;
  },

  updateQuestionBank: async (id, data) => {
    const res = await backendApi.put(`/admin/question-banks/${id}`, data);
    return res;
  },

  deleteQuestionBank: async (id) => {
    const res = await backendApi.delete(`/admin/question-banks/${id}`);
    return res;
  },

  // ─── Questions ──────────────────────────────────────────────
  getQuestions: async (params) => {
    const query = new URLSearchParams();
    if (params?.difficulty) query.set('difficulty', params.difficulty);
    if (params?.topic) query.set('topic', params.topic);
    if (params?.search) query.set('search', params.search);
    const res = await backendApi.get(`/admin/questions?${query.toString()}`);
    let list = res.data || [];
    if (params?.question_bank_id) {
      const targetId = parseInt(params.question_bank_id);
      list = list.filter(q => q.question_bank_id === targetId);
    }
    return { data: list };
  },

  getQuestion: async (id) => {
    const res = await backendApi.get(`/admin/questions/${id}`);
    return res;
  },

  createQuestion: async (data) => {
    const res = await backendApi.post('/admin/questions', data);
    return res;
  },

  updateQuestion: async (id, data) => {
    const res = await backendApi.put(`/admin/questions/${id}`, data);
    return res;
  },

  deleteQuestion: async (id) => {
    const res = await backendApi.delete(`/admin/questions/${id}`);
    return res;
  },

  aiGenerateQuestion: async (data) => {
    const res = await backendApi.post('/admin/questions/ai-generate', data);
    return res;
  },

  aiStandardizeTestCases: async (questionId) => {
    const res = await backendApi.post(`/admin/questions/${questionId}/ai-standardize-testcases`, {});
    return res;
  },

  addTestCase: async (questionId, data) => {
    const res = await backendApi.post(`/admin/questions/${questionId}/test-cases`, data);
    return res;
  },

  deleteTestCase: async (id) => {
    const res = await backendApi.delete(`/admin/test-cases/${id}`);
    return res;
  },

  // ─── Tests ──────────────────────────────────────────────────
  getTests: async () => {
    const res = await backendApi.get('/admin/tests');
    return res;
  },

  createTest: async (data) => {
    // When randomize_questions is true and no specific question_ids were
    // manually chosen, auto-populate the pool from the selected bank so the
    // backend has questions to draw from.
    const payload = { ...data };
    if (payload.randomize_questions && (!payload.question_ids || payload.question_ids.length === 0)) {
      try {
        const qRes = await backendApi.get('/admin/questions');
        const bankId = parseInt(payload.question_bank_id);
        payload.question_ids = (qRes.data || [])
          .filter(q => q.question_bank_id === bankId)
          .map(q => q.id);
      } catch (e) {
        console.warn('Could not auto-populate question_ids for randomized test:', e);
      }
    }
    const res = await backendApi.post('/admin/tests', payload);
    return res;
  },

  updateTest: async (id, data) => {
    const payload = { ...data };
    if (payload.randomize_questions && (!payload.question_ids || payload.question_ids.length === 0)) {
      try {
        const qRes = await backendApi.get('/admin/questions');
        const bankId = parseInt(payload.question_bank_id);
        payload.question_ids = (qRes.data || [])
          .filter(q => q.question_bank_id === bankId)
          .map(q => q.id);
      } catch (e) {
        console.warn('Could not auto-populate question_ids for test update:', e);
      }
    }
    const res = await backendApi.put(`/admin/tests/${id}`, payload);
    return res;
  },

  deleteTest: async (id) => {
    const res = await backendApi.delete(`/admin/tests/${id}`);
    return res;
  },

  // ─── Live Monitoring ────────────────────────────────────────
  monitorTest: async (testId) => {
    const res = await backendApi.get(`/admin/tests/${testId}/monitor`);
    return res;
  },

  // ─── Results ────────────────────────────────────────────────
  getTestResults: async (testId) => {
    const res = await backendApi.get(`/admin/tests/${testId}/results`);
    return res;
  },

  // ─── Violations ─────────────────────────────────────────────
  getViolations: async (params) => {
    const query = new URLSearchParams();
    if (params?.test_id) query.set('test_id', String(params.test_id));
    if (params?.student_id) query.set('student_id', String(params.student_id));
    if (params?.violation_type) query.set('violation_type', params.violation_type);
    const res = await backendApi.get(`/admin/violations?${query.toString()}`);
    return res;
  },
};

export { backendApi };
