import React, { useState } from 'react';
import {
  HiOutlineCheckCircle, HiOutlineXCircle, HiOutlineExclamationCircle,
  HiOutlineClock, HiOutlineChip, HiOutlineChevronDown, HiOutlineChevronUp,
  HiOutlineTerminal,
} from 'react-icons/hi';

export default function OutputPanel({ result, running, onCollapse, isCollapsed }) {
  const [activeTab, setActiveTab] = useState('testcases');

  if (!result && !running) {
    return (
      <div className="bg-slate-900 border-t border-slate-800 p-4 text-center text-xs text-slate-500 font-mono">
        Click "Run Code" or "Submit" to see compilation output and test results.
      </div>
    );
  }

  const getVerdictBadge = (status) => {
    const norm = (status || '').toLowerCase();

    if (norm === 'accepted') {
      return (
        <span className="inline-flex items-center space-x-1 px-3 py-1 rounded-full text-xs font-bold bg-emerald-950/80 text-emerald-400 border border-emerald-500/40">
          <HiOutlineCheckCircle className="w-4 h-4" />
          <span>Accepted</span>
        </span>
      );
    } else if (norm === 'compilation_error') {
      return (
        <span className="inline-flex items-center space-x-1 px-3 py-1 rounded-full text-xs font-bold bg-rose-950/80 text-rose-400 border border-rose-500/40">
          <HiOutlineXCircle className="w-4 h-4" />
          <span>Compilation Error</span>
        </span>
      );
    } else if (norm === 'time_limit_exceeded') {
      return (
        <span className="inline-flex items-center space-x-1 px-3 py-1 rounded-full text-xs font-bold bg-amber-950/80 text-amber-400 border border-amber-500/40">
          <HiOutlineClock className="w-4 h-4" />
          <span>Time Limit Exceeded</span>
        </span>
      );
    } else if (norm === 'memory_limit_exceeded') {
      return (
        <span className="inline-flex items-center space-x-1 px-3 py-1 rounded-full text-xs font-bold bg-purple-950/80 text-purple-400 border border-purple-500/40">
          <HiOutlineChip className="w-4 h-4" />
          <span>Memory Limit Exceeded</span>
        </span>
      );
    } else if (norm === 'wrong_answer') {
      return (
        <span className="inline-flex items-center space-x-1 px-3 py-1 rounded-full text-xs font-bold bg-orange-950/80 text-orange-400 border border-orange-500/40">
          <HiOutlineExclamationCircle className="w-4 h-4" />
          <span>Wrong Answer</span>
        </span>
      );
    } else {
      return (
        <span className="inline-flex items-center space-x-1 px-3 py-1 rounded-full text-xs font-bold bg-red-950/80 text-red-400 border border-red-500/40">
          <HiOutlineExclamationCircle className="w-4 h-4" />
          <span>Runtime Error</span>
        </span>
      );
    }
  };

  const resultsList = result?.results || [];
  const compilationError = result?.compilation_error || result?.error;

  return (
    <div className="bg-slate-900 border-t border-slate-800 flex flex-col h-full font-mono text-xs select-none">
      {/* Header bar */}
      <div className="bg-slate-950 px-4 py-2 flex items-center justify-between border-b border-slate-800">
        <div className="flex items-center space-x-4">
          <span className="font-bold text-slate-300 flex items-center space-x-1.5">
            <HiOutlineTerminal className="w-4 h-4 text-indigo-400" />
            <span>Console Output</span>
          </span>

          {result && (
            <div className="flex items-center space-x-3">
              {getVerdictBadge(result.compilation_status === 'error' ? 'compilation_error' : result.status || (result.passed === result.total ? 'accepted' : 'wrong_answer'))}

              {result.passed !== undefined && (
                <span className="text-slate-400 font-medium">
                  Passed: <strong className="text-slate-200">{result.passed}</strong> / {result.total}
                </span>
              )}
            </div>
          )}
        </div>

        {onCollapse && (
          <button
            onClick={onCollapse}
            className="text-slate-400 hover:text-slate-200 p-1 rounded hover:bg-slate-800 transition-colors"
          >
            {isCollapsed ? <HiOutlineChevronUp className="w-4 h-4" /> : <HiOutlineChevronDown className="w-4 h-4" />}
          </button>
        )}
      </div>

      {/* Main output content */}
      {!isCollapsed && (
        <div className="p-4 overflow-y-auto flex-1 space-y-3 bg-slate-900 text-slate-200">
          {running ? (
            <div className="flex items-center justify-center py-8 text-indigo-400 space-x-2">
              <HiOutlineClock className="w-5 h-5 animate-spin" />
              <span>Executing test cases on backend judge...</span>
            </div>
          ) : compilationError ? (
            <div className="bg-rose-950/40 border border-rose-900/60 rounded-lg p-3 text-rose-300">
              <div className="font-bold text-rose-400 mb-1 flex items-center space-x-1">
                <HiOutlineXCircle className="w-4 h-4" />
                <span>Compilation Error Details:</span>
              </div>
              <pre className="whitespace-pre-wrap font-mono text-xs overflow-x-auto p-2 bg-slate-950/60 rounded border border-rose-900/40 text-rose-200">
                {compilationError}
              </pre>
            </div>
          ) : resultsList.length > 0 ? (
            <div className="space-y-3">
              {resultsList.map((tc, idx) => (
                <div
                  key={idx}
                  className={`p-3 rounded-lg border transition-all ${
                    tc.passed
                      ? 'bg-emerald-950/20 border-emerald-900/50'
                      : 'bg-rose-950/20 border-rose-900/50'
                  }`}
                >
                  <div className="flex items-center justify-between mb-2">
                    <span className="font-bold flex items-center space-x-2">
                      {tc.passed ? (
                        <HiOutlineCheckCircle className="w-4 h-4 text-emerald-400" />
                      ) : (
                        <HiOutlineXCircle className="w-4 h-4 text-rose-400" />
                      )}
                      <span className={tc.passed ? 'text-emerald-300' : 'text-rose-300'}>
                        Test Case #{idx + 1}
                      </span>
                    </span>

                    <div className="flex items-center space-x-3 text-slate-400 text-[11px]">
                      <span>Time: <strong className="text-slate-200">{tc.execution_time ?? 0}s</strong></span>
                      <span>Memory: <strong className="text-slate-200">{tc.memory_used ?? 0} KB</strong></span>
                    </div>
                  </div>

                  {tc.input === '[Hidden]' ? (
                    <div className="bg-slate-950/70 border border-slate-800/80 rounded-lg p-3 flex items-center justify-between text-slate-400 text-xs">
                      <div className="flex items-center space-x-2">
                        <span className="text-slate-500 font-mono text-sm">🔒</span>
                        <span>Hidden Test Case (Input & output details are confidential)</span>
                      </div>
                      <span className={`font-semibold px-2.5 py-0.5 rounded text-[11px] ${tc.passed ? 'bg-emerald-950/60 text-emerald-400 border border-emerald-800/40' : 'bg-rose-950/60 text-rose-400 border border-rose-800/40'}`}>
                        {tc.status ? tc.status.toUpperCase() : (tc.passed ? 'PASSED' : 'FAILED')}
                      </span>
                    </div>
                  ) : (
                    <>
                      {tc.input && (
                        <div className="mb-2">
                          <span className="text-slate-400 text-[11px] font-semibold block mb-0.5">Input:</span>
                          <pre className="bg-slate-950 p-2 rounded text-slate-200 font-mono text-xs overflow-x-auto border border-slate-800">
                            {tc.input}
                          </pre>
                        </div>
                      )}

                      <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                        <div>
                          <span className="text-slate-400 text-[11px] font-semibold block mb-0.5">Expected Output:</span>
                          <pre className="bg-slate-950 p-2 rounded text-emerald-400 font-mono text-xs overflow-x-auto border border-slate-800">
                            {tc.expected_output || '(Empty)'}
                          </pre>
                        </div>

                        <div>
                          <span className="text-slate-400 text-[11px] font-semibold block mb-0.5">Actual Output:</span>
                          <pre
                            className={`bg-slate-950 p-2 rounded font-mono text-xs overflow-x-auto border border-slate-800 ${
                              tc.passed ? 'text-emerald-400' : 'text-rose-400'
                            }`}
                          >
                            {tc.error ? tc.error : (tc.actual_output || '(Empty)')}
                          </pre>
                        </div>
                      </div>
                    </>
                  )}
                </div>
              ))}
            </div>
          ) : (
            <div className="text-slate-400 text-xs">No output returned.</div>
          )}
        </div>
      )}
    </div>
  );
}
