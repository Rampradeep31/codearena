import { useEffect, useRef, useState } from 'react';
import { HiOutlineCheckCircle, HiOutlineXCircle } from 'react-icons/hi';
import { getVerdict } from '../../services/executionClient';

const TABS = ['Testcase', 'Test Result', 'Console', 'Runtime', 'Memory'];
const value = (item) => item ?? '';

export default function LeetCodeTestPanel({ testCases = [], result, selectedCase, onSelectCase, customInput, onCustomInput, language }) {
  const [tab, setTab] = useState('Testcase');
  const [height, setHeight] = useState(300);
  const dragging = useRef(false);
  const selected = selectedCase === 'custom' ? null : testCases[selectedCase] || testCases[0];
  const resultCase = result?.results?.[0] || null;
  const verdict = getVerdict(result);
  useEffect(() => {
    const move = (event) => dragging.current && setHeight(Math.min(520, Math.max(210, window.innerHeight - event.clientY - 68)));
    const stop = () => { dragging.current = false; };
    window.addEventListener('mousemove', move); window.addEventListener('mouseup', stop);
    return () => { window.removeEventListener('mousemove', move); window.removeEventListener('mouseup', stop); };
  }, []);
  const Block = ({ label, children }) => <div><p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-dark-500">{label}</p><pre className="min-h-12 overflow-x-auto rounded-lg border border-dark-700/60 bg-dark-900 p-3 font-mono text-xs text-dark-200 whitespace-pre-wrap">{children || '—'}</pre></div>;
  const Details = () => <div className="grid gap-3 md:grid-cols-3"><Block label="Input">{value(resultCase?.input ?? selected?.input)}</Block><Block label="Expected Output">{value(resultCase?.expected_output ?? selected?.expected_output)}</Block><Block label="Output">{value(resultCase?.actual_output)}</Block></div>;
  return <section className="relative shrink-0 border-t border-dark-700/70 bg-dark-950" style={{ height }}>
    <div onMouseDown={() => { dragging.current = true; }} className="absolute -top-1.5 left-0 right-0 h-3 cursor-row-resize z-10 group"><div className="mx-auto mt-1 h-1 w-10 rounded-full bg-dark-600 group-hover:bg-brand-500 transition-colors" /></div>
    <div className="h-full flex flex-col"><div className="flex items-center gap-1 px-3 border-b border-dark-700/60 overflow-x-auto">{TABS.map((name) => <button key={name} onClick={() => setTab(name)} className={`px-3 py-3 text-xs font-semibold whitespace-nowrap border-b-2 transition-colors ${tab === name ? 'border-brand-500 text-white' : 'border-transparent text-dark-400 hover:text-dark-200'}`}>{name}</button>)}</div>
      <div className="flex-1 overflow-auto p-4 text-sm animate-fade-in">
        {tab === 'Testcase' && <><div className="flex gap-2 mb-4 overflow-x-auto">{testCases.map((item, index) => <button key={item.id || index} onClick={() => onSelectCase(index)} className={`rounded-lg px-3 py-1.5 text-xs font-medium whitespace-nowrap ${selectedCase === index ? 'bg-dark-700 text-white ring-1 ring-brand-500/70' : 'bg-dark-800 text-dark-400 hover:text-dark-200'}`}>Sample Case {index + 1}</button>)}<button onClick={() => onSelectCase('custom')} className={`rounded-lg px-3 py-1.5 text-xs font-medium whitespace-nowrap ${selectedCase === 'custom' ? 'bg-dark-700 text-white ring-1 ring-brand-500/70' : 'bg-dark-800 text-dark-400 hover:text-dark-200'}`}>Custom Testcase</button></div>{selectedCase === 'custom' ? <div><p className="mb-2 text-xs font-semibold text-dark-300">Custom Input</p><textarea value={customInput} onChange={(e) => onCustomInput(e.target.value)} spellCheck="false" className="min-h-28 w-full resize-y rounded-lg border border-dark-700 bg-dark-900 p-3 font-mono text-xs text-dark-200 outline-none focus:border-brand-500" placeholder={'5\n10'} /></div> : <Details />}</>}
        {tab === 'Test Result' && (result ? <div className="space-y-4"><div className={`flex items-center gap-2 rounded-xl border px-4 py-3 font-bold ${verdict === 'Accepted' ? 'text-emerald-400 bg-emerald-500/10 border-emerald-500/25' : 'text-red-400 bg-red-500/10 border-red-500/25'}`}>{verdict === 'Accepted' ? <HiOutlineCheckCircle className="h-5 w-5" /> : <HiOutlineXCircle className="h-5 w-5" />}{verdict}</div><Details /></div> : <p className="py-8 text-center text-dark-500">Run a testcase or submit all samples to see the result.</p>)}
        {tab === 'Console' && <div className="space-y-3"><Block label="stdout">{value(resultCase?.actual_output)}</Block><Block label="stderr">{value(resultCase?.error)}</Block><Block label="Compiler messages">{value(result?.compilation_error)}</Block></div>}
        {(tab === 'Runtime' || tab === 'Memory') && <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4"><Metric label="Execution Time" text={resultCase ? `${Math.round((resultCase.execution_time || 0) * 1000)} ms` : '—'} /><Metric label="Memory Used" text={resultCase ? `${resultCase.memory_used || 0} KB` : '—'} /><Metric label="Language" text={language || '—'} /><Metric label="Exit Code" text={resultCase ? (resultCase.status === 'accepted' ? '0' : '1') : '—'} /></div>}
      </div></div></section>;
}
function Metric({ label, text }) { return <div className="rounded-lg border border-dark-700/60 bg-dark-900 p-3"><p className="text-[11px] uppercase tracking-wide text-dark-500">{label}</p><p className="mt-1 font-mono text-sm text-dark-200">{text}</p></div>; }
