import React, { useState } from 'react';
import WebcamProctor from '../components/WebcamProctor';
import { HiOutlineCamera, HiOutlineShieldCheck, HiOutlinePhotograph } from 'react-icons/hi';

export default function CameraTest() {
  const [snapshots, setSnapshots] = useState([]);
  const [status, setStatus] = useState('initializing');
  const [faceTurnWarnings, setFaceTurnWarnings] = useState(0);

  const handleSnapshot = (data) => {
    setSnapshots(prev => [data, ...prev].slice(0, 6)); // Keep last 6 snapshots
  };

  const handleFaceTurn = () => {
    setFaceTurnWarnings(prev => {
      const next = prev + 1;
      if (next <= 2) alert(`Warning ${next}/2: You turned away from the camera!`);
      return next;
    });
  };

  return (
    <div className="min-h-screen bg-dark-950 text-white p-6 relative font-sans">
      {/* Header */}
      <div className="max-w-4xl mx-auto mb-8">
        <div className="flex items-center gap-3 mb-2">
          <div className="w-10 h-10 bg-brand-500/10 border border-brand-500/20 rounded-xl flex items-center justify-center">
            <HiOutlineCamera className="w-6 h-6 text-brand-400" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-white">Webcam Proctoring Test Playground</h1>
            <p className="text-dark-400 text-sm">Interactive testing page for live camera proctoring & frame capture.</p>
          </div>
        </div>
      </div>

      <div className="max-w-4xl mx-auto grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Panel 1: Status & Info */}
        <div className="bg-dark-900 border border-dark-700/60 rounded-2xl p-6">
          <div className="flex items-center gap-2 mb-4">
            <HiOutlineShieldCheck className="w-5 h-5 text-emerald-400" />
            <h2 className="text-lg font-semibold text-white">Proctoring Status</h2>
          </div>

          <div className="space-y-4 text-sm">
            <div className="bg-dark-800 rounded-xl p-4 flex items-center justify-between">
              <span className="text-dark-300">Camera Stream State</span>
              <span className={`px-2.5 py-1 rounded-full text-xs font-semibold uppercase ${
                status === 'active' ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30' :
                status === 'denied' ? 'bg-red-500/20 text-red-400 border border-red-500/30' :
                'bg-amber-500/20 text-amber-400 border border-amber-500/30'
              }`}>
                {status}
              </span>
            </div>

            <div className="bg-dark-800 rounded-xl p-4">
              <p className="text-xs text-dark-400 mb-1">Instructions for Testing:</p>
              <ul className="list-disc list-inside space-y-1 text-xs text-dark-300">
                <li>Check the bottom-right corner for the floating camera feed widget.</li>
                <li>Allow browser camera permission when prompted.</li>
                <li>Try minimizing and expanding the camera overlay.</li>
                <li>Watch snapshot thumbnails appear on the right in real time every 15 seconds.</li>
                <li>Turn away from the camera (90°) for ~6s to trigger a face-turn warning.</li>
              </ul>
            </div>

            <div className="flex items-center justify-between bg-dark-800 rounded-xl p-4">
              <span className="text-dark-300">Face-Turn Warnings (max 2)</span>
              <span className={`px-2.5 py-1 rounded-full text-xs font-semibold ${
                faceTurnWarnings >= 2 ? 'bg-red-500/20 text-red-400 border border-red-500/30' :
                faceTurnWarnings === 1 ? 'bg-amber-500/20 text-amber-400 border border-amber-500/30' :
                'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
              }`}>
                {faceTurnWarnings} / 2
              </span>
            </div>
          </div>
        </div>

        {/* Panel 2: Live Snapshots Feed */}
        <div className="bg-dark-900 border border-dark-700/60 rounded-2xl p-6">
          <div className="flex items-center gap-2 mb-4">
            <HiOutlinePhotograph className="w-5 h-5 text-brand-400" />
            <h2 className="text-lg font-semibold text-white">Captured Frame Snapshots</h2>
          </div>

          {snapshots.length === 0 ? (
            <div className="h-48 border-2 border-dashed border-dark-700 rounded-xl flex flex-col items-center justify-center text-center p-4 text-dark-500">
              <HiOutlineCamera className="w-8 h-8 mb-2 animate-pulse" />
              <p className="text-xs">Waiting for first snapshot frame...</p>
              <p className="text-[11px] text-dark-600 mt-1">(Captures automatically every 15s)</p>
            </div>
          ) : (
            <div className="grid grid-cols-3 gap-3">
              {snapshots.map((snap, idx) => (
                <div key={idx} className="bg-black rounded-lg overflow-hidden border border-dark-700">
                  <img src={snap.image} alt={`Snapshot ${idx}`} className="w-full aspect-video object-cover transform -scale-x-100" />
                  <div className="p-1.5 text-[10px] text-dark-400 text-center font-mono">
                    {new Date(snap.timestamp).toLocaleTimeString()}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Floating Webcam Proctoring Component */}
      <WebcamProctor
        snapshotIntervalSec={15}
        onSnapshot={handleSnapshot}
        onStatusChange={setStatus}
        onFaceTurn={handleFaceTurn}
      />
    </div>
  );
}
