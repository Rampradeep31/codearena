import { codeAPI } from './api';

// The test panel depends only on this adapter. Judge0 can replace it later.
export const executionClient = {
  runCase: async (payload) => (await codeAPI.runCase(payload)).data,
  runAllSamples: async (payload) => (await codeAPI.run(payload)).data,
};

export function getVerdict(result) {
  if (!result) return null;
  if (result.compilation_status === 'error') return 'Compilation Error';
  const status = result.results?.[0]?.status;
  if (status === 'time_limit_exceeded') return 'Time Limit Exceeded';
  if (status === 'runtime_error') return 'Runtime Error';
  return result.passed === result.total && result.total > 0 ? 'Accepted' : 'Wrong Answer';
}
