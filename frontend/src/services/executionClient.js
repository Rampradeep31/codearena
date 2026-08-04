import { codeAPI } from './api';

// The test panel depends only on this adapter. Judge0 can replace it later.
export const executionClient = {
  runCase: async (payload) => (await codeAPI.runCase(payload)).data,
  runAllSamples: async (payload) => (await codeAPI.run(payload)).data,
  submitCode: async (payload) => (await codeAPI.submit(payload)).data,
};

export function getVerdict(result) {
  if (!result) return null;
  const status = result.results?.[0]?.status;
  if (status === 'compiler_not_installed' || (result.compilation_error && result.compilation_error.includes('Compiler Not Installed'))) {
    return 'Compiler Not Installed';
  }
  if (result.compilation_status === 'error') return 'Compilation Error';
  if (status === 'time_limit_exceeded') return 'Time Limit Exceeded';
  if (status === 'runtime_error') return 'Runtime Error';
  return result.passed === result.total && result.total > 0 ? 'Accepted' : 'Wrong Answer';
}
