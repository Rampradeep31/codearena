import { backendApi } from './api';

export const gateAdminAPI = {
  // Questions
  listQuestions: (params) => backendApi.get('/gate/admin/questions', { params }),
  createQuestion: (data) => backendApi.post('/gate/admin/questions', data),
  updateQuestion: (id, data) => backendApi.put(`/gate/admin/questions/${id}`, data),
  deleteQuestion: (id) => backendApi.delete(`/gate/admin/questions/${id}`),
  aiGenerateQuestions: (data) => backendApi.post('/gate/admin/questions/ai-generate', data, { timeout: 180000 }),
  uploadPdf: (formData) => backendApi.post('/gate/admin/questions/upload-pdf', formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
    timeout: 180000,
  }),

  // Tests
  listTests: () => backendApi.get('/gate/admin/tests'),
  createTest: (data) => backendApi.post('/gate/admin/tests', data),
  updateTest: (id, data) => backendApi.put(`/gate/admin/tests/${id}`, data),
  deleteTest: (id) => backendApi.delete(`/gate/admin/tests/${id}`),
  getTestQuestions: (id) => backendApi.get(`/gate/admin/tests/${id}/questions`),
  getTestAttempts: (id) => backendApi.get(`/gate/admin/tests/${id}/attempts`),
};

export const gateStudentAPI = {
  listTests: () => backendApi.get('/gate/student/tests'),
  getTestQuestions: (testId) => backendApi.get(`/gate/student/tests/${testId}/questions`),
  startAttempt: (testId) => backendApi.post(`/gate/student/tests/${testId}/start`),
  saveAnswer: (attemptId, data) => backendApi.put(`/gate/student/attempts/${attemptId}/answer`, data),
  submitAttempt: (attemptId) => backendApi.post(`/gate/student/attempts/${attemptId}/submit`),
  getResult: (attemptId) => backendApi.get(`/gate/student/attempts/${attemptId}/result`),
  getResultQuestions: (attemptId) => backendApi.get(`/gate/student/attempts/${attemptId}/result-questions`),
  myAttempts: () => backendApi.get('/gate/student/my-attempts'),
};
