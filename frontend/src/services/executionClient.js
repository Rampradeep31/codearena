import { codeAPI } from './api';

// The test panel depends only on this adapter. Judge0 can replace it later.
export const executionClient = {
  runCase: async (payload) => (await codeAPI.runCase(payload)).data,
  runAllSamples: async (payload) => (await codeAPI.run(payload)).data,
  submitCode: async (payload) => (await codeAPI.submit(payload)).data,
};

const VERDICT_LABELS = {
  accepted: 'Accepted',
  wrong_answer: 'Wrong Answer',
  compilation_error: 'Compilation Error',
  compiler_not_installed: 'Compiler Not Installed',
  runtime_error: 'Runtime Error',
  time_limit_exceeded: 'Time Limit Exceeded',
  memory_limit_exceeded: 'Memory Limit Exceeded',
  presentation_error: 'Presentation Error',
  internal_error: 'Internal Error',
  no_results: 'No Test Cases',
};

export function getVerdict(result) {
  if (!result) return null;

  // Compilation errors reported at the response level (run/submit)
  if (result.compilation_status === 'error' || result.compilation_error) {
    const msg = String(result.compilation_error || '').toLowerCase();
    if (msg.includes('not installed') || msg.includes('not installed on this system')) {
      return VERDICT_LABELS.compiler_not_installed;
    }
    return VERDICT_LABELS.compilation_error;
  }

  const first = result.results?.[0] || {};
  const status = first.status || result.status;

  // Pick the "worst" verdict across all test cases so a single failure is
  // never hidden behind a passing first case.
  if (Array.isArray(result.results) && result.results.length > 0) {
    const rank = [
      'compiler_not_installed', 'compilation_error', 'time_limit_exceeded',
      'memory_limit_exceeded', 'runtime_error', 'internal_error',
      'presentation_error', 'wrong_answer', 'accepted',
    ];
    const worst = result.results.reduce((w, r) => {
      const ri = rank.indexOf(r.status || 'accepted');
      const wi = rank.indexOf(w);
      return ri >= 0 && wi >= 0 && ri < wi ? (r.status || 'accepted') : w;
    }, 'accepted');
    if (worst !== 'accepted') return VERDICT_LABELS[worst] || worst;
  }

  if (VERDICT_LABELS[status]) return VERDICT_LABELS[status];

  if (result.passed === result.total && result.total > 0) return VERDICT_LABELS.accepted;
  if (result.total > 0) return VERDICT_LABELS.wrong_answer;
  return status || 'Accepted';
}
