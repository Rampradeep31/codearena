import axios from 'axios';

/**
 * CodeArena API service — talks to the FastAPI backend.
 * Dev: vite proxies /api -> http://127.0.0.1:8000
 * Prod: set VITE_API_BASE to the backend URL.
 */
const API_BASE = (import.meta.env.VITE_API_BASE || '/api').replace(/\/+$/, '');

const api = axios.create({
  baseURL: API_BASE,
  timeout: 120000,
});

api.interceptors.request.use((config) => {
  const token = localStorage.getItem('token');
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

api.interceptors.response.use(
  (res) => res,
  (err) => {
    if (err.response?.status === 401) {
      localStorage.removeItem('token');
      localStorage.removeItem('user');
      if (!window.location.pathname.startsWith('/login')) {
        window.location.href = '/login';
      }
    }
    return Promise.reject(err);
  }
);

// ─── Auth ─────────────────────────────────────────────
export const authAPI = {
  login: (email, password) => api.post('/auth/login', { email, password }),
  studentEntry: (studentData) => api.post('/auth/student-entry', studentData),
};

// ─── Student ──────────────────────────────────────────
export const studentAPI = {
  getTests: () => api.get('/student/tests'),
  getAttempt: (attemptId) => api.get(`/student/attempts/${attemptId}`),
  getAttemptQuestions: (attemptId) => api.get(`/student/attempts/${attemptId}/questions`),
  startTest: (testId) => api.post(`/student/tests/${testId}/start`),
  saveCode: (attemptId, data) => api.put(`/student/attempts/${attemptId}/code`, data),
  recordViolation: (attemptId, data) => api.post(`/student/attempts/${attemptId}/violations`, data),
  finishTest: (attemptId) => api.post(`/student/attempts/${attemptId}/finish`),
};

// ─── Code Execution ───────────────────────────────────
export const codeAPI = {
  run: (data) => api.post('/code/run', data),
  submit: (data) => api.post('/code/submit', data),
};

// ─── Admin ────────────────────────────────────────────
export const adminAPI = {
  // Dashboard
  getDashboard: () => api.get('/admin/dashboard'),

  // Students
  getStudents: (params = {}) => api.get('/admin/students', { params }),
  createStudent: (data) => api.post('/admin/students', data),
  updateStudent: (id, data) => api.put(`/admin/students/${id}`, data),
  deleteStudent: (id) => api.delete(`/admin/students/${id}`),
  importStudents: (file) => {
    const formData = new FormData();
    formData.append('file', file);
    return api.post('/admin/students/import', formData);
  },

  // Questions
  getQuestions: (params = {}) => api.get('/admin/questions', { params }),
  getQuestion: (id) => api.get(`/admin/questions/${id}`),
  createQuestion: (data) => api.post('/admin/questions', data),
  updateQuestion: (id, data) => api.put(`/admin/questions/${id}`, data),
  deleteQuestion: (id) => api.delete(`/admin/questions/${id}`),
  addTestCase: (questionId, data) => api.post(`/admin/questions/${questionId}/test-cases`, data),
  deleteTestCase: (testCaseId) => api.delete(`/admin/test-cases/${testCaseId}`),

  // Tests
  getTests: () => api.get('/admin/tests'),
  createTest: (data) => api.post('/admin/tests', data),
  updateTest: (id, data) => api.put(`/admin/tests/${id}`, data),
  deleteTest: (id) => api.delete(`/admin/tests/${id}`),

  // Monitoring & Results
  monitorTest: (testId) => api.get(`/admin/tests/${testId}/monitor`),
  getTestResults: (testId) => api.get(`/admin/tests/${testId}/results`),

  // Violations
  getViolations: (params = {}) => api.get('/admin/violations', { params }),
};
