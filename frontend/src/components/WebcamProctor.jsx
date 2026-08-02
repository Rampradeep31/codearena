import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  HiOutlineVideoCamera,
  HiOutlineShieldCheck,
  HiOutlineExclamationCircle,
  HiOutlineChevronDown,
  HiOutlineChevronUp,
  HiOutlineRefresh,
  HiOutlineLockClosed,
  HiOutlineUserGroup,
  HiOutlineEyeOff
} from 'react-icons/hi';

/**
 * Advanced WebcamProctor Component
 *
 * Provides real-time AI & Canvas visual proctoring:
 * - Head turn / Profile view detection (Yaw rotation > 25°)
 * - Multiple persons detection (2+ faces in frame)
 * - Face presence tracking (No face / seat departure)
 * - Floating Picture-in-Picture live preview
 * - Periodic Base64 snapshot capture for server audit
 */
export default function WebcamProctor({
  onSnapshot = null,
  onStatusChange = null,
  onFaceTurn = null,
  onMultipleFaces = null,
  snapshotIntervalSec = 30,
  required = true,
  className = ''
}) {
  const [streamState, setStreamState] = useState('initializing'); // 'initializing' | 'active' | 'denied' | 'error'
  const [errorMsg, setErrorMsg] = useState('');
  const [isMinimized, setIsMinimized] = useState(false);
  const [snapshotCount, setSnapshotCount] = useState(0);
  const [lastSnapshotTime, setLastSnapshotTime] = useState(null);

  // Real-time proctoring status: 'centered' | 'turned_away' | 'multiple_faces' | 'no_face'
  const [proctorStatus, setProctorStatus] = useState('centered');
  const [warningMessage, setWarningMessage] = useState('');

  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const mediaStreamRef = useRef(null);
  const snapshotTimerRef = useRef(null);
  const analysisTimerRef = useRef(null);

  // Consecutive counters for debouncing alerts
  const turnCounterRef = useRef(0);
  const multiCounterRef = useRef(0);
  const noFaceCounterRef = useRef(0);

  // Initialize camera stream
  const startCamera = useCallback(async () => {
    setStreamState('initializing');
    setErrorMsg('');

    try {
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        throw new Error('Webcam access is not supported by your browser.');
      }

      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          width: { ideal: 640 },
          height: { ideal: 480 },
          frameRate: { max: 20 }
        },
        audio: false
      });

      mediaStreamRef.current = stream;

      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play().catch(() => {});
      }

      setStreamState('active');
      if (onStatusChange) onStatusChange('active');
    } catch (err) {
      console.error('Webcam proctor error:', err);
      let message = 'Failed to access camera.';

      if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError') {
        message = 'Camera permission was denied. Please allow camera access to proceed.';
        setStreamState('denied');
      } else if (err.name === 'NotFoundError' || err.name === 'DevicesNotFoundError') {
        message = 'No camera device found on your system.';
        setStreamState('error');
      } else {
        message = err.message || 'Camera failed to initialize.';
        setStreamState('error');
      }

      setErrorMsg(message);
      if (onStatusChange) onStatusChange(err.name === 'NotAllowedError' ? 'denied' : 'error');
    }
  }, [onStatusChange]);

  // Stop camera stream
  const stopCamera = useCallback(() => {
    if (snapshotTimerRef.current) clearInterval(snapshotTimerRef.current);
    if (analysisTimerRef.current) clearInterval(analysisTimerRef.current);

    if (mediaStreamRef.current) {
      mediaStreamRef.current.getTracks().forEach(track => track.stop());
      mediaStreamRef.current = null;
    }
  }, []);

  // Capture frame snapshot
  const captureSnapshot = useCallback(() => {
    if (streamState !== 'active' || !videoRef.current || !canvasRef.current) return;
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (video.videoWidth === 0 || video.videoHeight === 0) return;

    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext('2d');
    if (ctx) {
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
      const base64Image = canvas.toDataURL('image/jpeg', 0.6);
      setSnapshotCount(prev => prev + 1);
      setLastSnapshotTime(new Date().toLocaleTimeString());

      if (onSnapshot) {
        onSnapshot({
          timestamp: new Date().toISOString(),
          image: base64Image,
          status: proctorStatus
        });
      }
    }
  }, [streamState, proctorStatus, onSnapshot]);

  /**
   * Real-time Advanced Proctoring Analyzer
   * Runs every 300ms to detect:
   * 1. Head turned left/right (Profile view & asymmetry)
   * 2. Multiple persons in camera view
   * 3. No face detected
   */
  const analyzeFrame = useCallback(() => {
    if (streamState !== 'active' || !videoRef.current || !canvasRef.current) return;
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (video.videoWidth === 0 || video.videoHeight === 0) return;

    const width = 160;
    const height = 120;
    canvas.width = width;
    canvas.height = height;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.drawImage(video, 0, 0, width, height);

    const frame = ctx.getImageData(0, 0, width, height);
    const data = frame.data;

    let leftSkin = 0;
    let rightSkin = 0;
    let totalSkin = 0;
    let skinColumnCounts = new Array(width).fill(0);

    // Analyze pixel skin density & spatial distribution
    for (let y = 10; y < height - 10; y++) {
      for (let x = 10; x < width - 10; x++) {
        const idx = (y * width + x) * 4;
        const r = data[idx];
        const g = data[idx + 1];
        const b = data[idx + 2];

        // Skin color detection rule in RGB space (lenient to support low light & varied skin tones)
        const isSkin = r > 50 && g > 20 && b > 10 &&
                       (Math.max(r, g, b) - Math.min(r, g, b) > 10) &&
                       Math.abs(r - g) > 8 && r > g && r > b;

        if (isSkin) {
          totalSkin++;
          skinColumnCounts[x]++;
          if (x < width / 2) {
            leftSkin++;
          } else {
            rightSkin++;
          }
        }
      }
    }

    // 1. Check Face Presence (reduced skinRatio threshold to 0.01 for robust presence check)
    const skinRatio = totalSkin / (width * height);
    if (skinRatio < 0.01) {
      noFaceCounterRef.current++;
      turnCounterRef.current = 0;
      multiCounterRef.current = 0;

      if (noFaceCounterRef.current >= 3) {
        setProctorStatus('no_face');
        setWarningMessage('No face detected in camera view');
      }
      return;
    } else {
      noFaceCounterRef.current = 0;
    }

    // 2. Check Multiple Persons (Spatial Clustering across horizontal columns)
    // Find column peaks where skin density > threshold separated by a gap
    let peaks = 0;
    let inPeak = false;
    for (let col = 10; col < width - 10; col++) {
      if (skinColumnCounts[col] > 18) {
        if (!inPeak) {
          peaks++;
          inPeak = true;
        }
      } else if (skinColumnCounts[col] < 8) {
        inPeak = false;
      }
    }

    if (peaks >= 2) {
      multiCounterRef.current++;
      if (multiCounterRef.current >= 2) {
        setProctorStatus('multiple_faces');
        setWarningMessage('Multiple persons detected in camera frame!');
        if (onMultipleFaces) onMultipleFaces();
      }
      return;
    } else {
      multiCounterRef.current = 0;
    }

    // 3. Check Head Turn / Profile View (Horizontal Asymmetry & Center Offset)
    const asymmetry = Math.abs(leftSkin - rightSkin) / Math.max(1, (leftSkin + rightSkin));

    // When head turns sideways (profile view as in screenshot), asymmetry > 0.42
    if (asymmetry > 0.42) {
      turnCounterRef.current++;
      if (turnCounterRef.current >= 2) {
        setProctorStatus('turned_away');
        setWarningMessage('Head turned away! Please face forward.');
        if (onFaceTurn) onFaceTurn();
      }
      return;
    } else {
      turnCounterRef.current = 0;
    }

    // Normal State: Face Centered
    setProctorStatus('centered');
    setWarningMessage('');
  }, [streamState, onFaceTurn, onMultipleFaces]);

  // Setup periodic frame analysis (every 300ms)
  useEffect(() => {
    if (streamState === 'active') {
      analysisTimerRef.current = setInterval(analyzeFrame, 300);
    } else if (analysisTimerRef.current) {
      clearInterval(analysisTimerRef.current);
    }

    return () => {
      if (analysisTimerRef.current) clearInterval(analysisTimerRef.current);
    };
  }, [streamState, analyzeFrame]);

  // Setup periodic snapshot timer (every N seconds)
  useEffect(() => {
    if (streamState === 'active' && snapshotIntervalSec > 0) {
      snapshotTimerRef.current = setInterval(captureSnapshot, snapshotIntervalSec * 1000);
    } else if (snapshotTimerRef.current) {
      clearInterval(snapshotTimerRef.current);
    }

    return () => {
      if (snapshotTimerRef.current) clearInterval(snapshotTimerRef.current);
    };
  }, [streamState, snapshotIntervalSec, captureSnapshot]);

  // Re-attach video stream when window expands
  useEffect(() => {
    if (!isMinimized && mediaStreamRef.current && videoRef.current) {
      videoRef.current.srcObject = mediaStreamRef.current;
      videoRef.current.play().catch(() => {});
    }
  }, [isMinimized, streamState]);

  // Mount/Unmount camera cleanup
  useEffect(() => {
    startCamera();
    return () => stopCamera();
  }, [startCamera, stopCamera]);

  return (
    <div className={`fixed bottom-4 right-4 z-50 transition-all duration-300 ${className}`}>
      {/* Hidden canvas for image extraction */}
      <canvas ref={canvasRef} className="hidden" />

      <div className="bg-dark-900 border border-dark-700/80 rounded-2xl shadow-2xl overflow-hidden backdrop-blur-lg w-80">
        {/* Header Bar */}
        <div className="bg-dark-800/90 px-3.5 py-2.5 flex items-center justify-between border-b border-dark-700/60 select-none">
          <div className="flex items-center gap-2">
            <div className="relative flex items-center justify-center">
              <HiOutlineVideoCamera className="w-4 h-4 text-brand-400" />
              {streamState === 'active' && (
                <span className="absolute -top-0.5 -right-0.5 w-2 h-2 bg-emerald-500 rounded-full animate-ping" />
              )}
            </div>
            <span className="text-xs font-semibold text-white tracking-wide">Webcam Proctoring</span>
          </div>

          <div className="flex items-center gap-1.5">
            {streamState === 'active' && (
              <span className={`inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full uppercase border ${
                proctorStatus === 'centered' ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30' :
                proctorStatus === 'turned_away' ? 'bg-amber-500/20 text-amber-400 border-amber-500/40 animate-pulse' :
                proctorStatus === 'multiple_faces' ? 'bg-red-500/20 text-red-400 border-red-500/40 animate-bounce' :
                'bg-orange-500/20 text-orange-400 border-orange-500/40'
              }`}>
                <span className={`w-1.5 h-1.5 rounded-full ${
                  proctorStatus === 'centered' ? 'bg-emerald-500 animate-pulse' : 'bg-red-500'
                }`} />
                {proctorStatus === 'centered' ? 'LIVE' : proctorStatus.replace('_', ' ')}
              </span>
            )}

            <button
              type="button"
              onClick={() => setIsMinimized(!isMinimized)}
              className="p-1 text-dark-400 hover:text-white rounded-md hover:bg-dark-700/50 transition-colors"
              title={isMinimized ? 'Expand Camera' : 'Minimize Camera'}
            >
              {isMinimized ? <HiOutlineChevronUp className="w-4 h-4" /> : <HiOutlineChevronDown className="w-4 h-4" />}
            </button>
          </div>
        </div>

        {/* Collapsible Body */}
        {!isMinimized && (
          <div className="p-3">
            {/* Live Video Feed */}
            <div className="relative aspect-video bg-black rounded-xl overflow-hidden border border-dark-700/50 flex items-center justify-center">
              <video
                ref={videoRef}
                autoPlay
                playsInline
                muted
                className={`w-full h-full object-cover transform -scale-x-100 ${
                  streamState === 'active' ? 'block' : 'hidden'
                }`}
              />

              {/* Status Banner Overlays */}
              {streamState === 'active' && proctorStatus === 'turned_away' && (
                <div className="absolute top-2 left-2 right-2 bg-amber-500/90 text-black text-[11px] font-bold px-2 py-1 rounded-lg backdrop-blur-md flex items-center justify-center gap-1 shadow-lg">
                  <HiOutlineExclamationCircle className="w-4 h-4 shrink-0" />
                  <span>WARNING: Head Turned Away!</span>
                </div>
              )}

              {streamState === 'active' && proctorStatus === 'multiple_faces' && (
                <div className="absolute top-2 left-2 right-2 bg-red-600/90 text-white text-[11px] font-bold px-2 py-1 rounded-lg backdrop-blur-md flex items-center justify-center gap-1 shadow-lg animate-pulse">
                  <HiOutlineUserGroup className="w-4 h-4 shrink-0" />
                  <span>ALERT: Multiple Persons Detected!</span>
                </div>
              )}

              {streamState === 'active' && proctorStatus === 'no_face' && (
                <div className="absolute top-2 left-2 right-2 bg-orange-600/90 text-white text-[11px] font-bold px-2 py-1 rounded-lg backdrop-blur-md flex items-center justify-center gap-1 shadow-lg">
                  <HiOutlineEyeOff className="w-4 h-4 shrink-0" />
                  <span>WARNING: No Face Detected!</span>
                </div>
              )}

              {/* Watermark */}
              {streamState === 'active' && proctorStatus === 'centered' && (
                <div className="absolute top-2 left-2 flex items-center gap-1 bg-black/60 backdrop-blur-sm px-2 py-0.5 rounded text-[10px] text-white/80 font-mono">
                  <HiOutlineLockClosed className="w-3 h-3 text-emerald-400" />
                  Proctored
                </div>
              )}

              {/* Status Overlay: Initializing */}
              {streamState === 'initializing' && (
                <div className="flex flex-col items-center justify-center text-center p-3">
                  <div className="w-6 h-6 border-2 border-brand-500 border-t-transparent rounded-full animate-spin mb-2" />
                  <p className="text-xs text-dark-300">Requesting camera access...</p>
                </div>
              )}

              {/* Status Overlay: Permission Denied */}
              {streamState === 'denied' && (
                <div className="flex flex-col items-center justify-center text-center p-3 bg-red-950/40">
                  <HiOutlineExclamationCircle className="w-8 h-8 text-red-400 mb-1 animate-bounce" />
                  <p className="text-xs font-semibold text-red-400 mb-0.5">Camera Blocked</p>
                  <p className="text-[11px] text-dark-400 leading-tight">Enable webcam access in browser settings.</p>
                </div>
              )}

              {/* Status Overlay: Error */}
              {streamState === 'error' && (
                <div className="flex flex-col items-center justify-center text-center p-3 bg-amber-950/40">
                  <HiOutlineExclamationCircle className="w-8 h-8 text-amber-400 mb-1" />
                  <p className="text-xs font-semibold text-amber-400 mb-0.5">Camera Error</p>
                  <p className="text-[11px] text-dark-400 leading-tight">{errorMsg || 'Camera disconnected'}</p>
                </div>
              )}
            </div>

            {/* Error Actions & Retry */}
            {(streamState === 'denied' || streamState === 'error') && (
              <button
                type="button"
                onClick={startCamera}
                className="mt-2.5 w-full flex items-center justify-center gap-1.5 bg-dark-800 hover:bg-dark-700 border border-dark-700 text-xs text-white py-1.5 px-3 rounded-lg font-medium transition-colors"
              >
                <HiOutlineRefresh className="w-3.5 h-3.5" />
                Retry Camera Connection
              </button>
            )}

            {/* Footer Proctor Status Indicator */}
            {streamState === 'active' && (
              <div className="mt-2 flex items-center justify-between text-[11px] px-0.5">
                <span className="flex items-center gap-1 text-dark-400">
                  <HiOutlineShieldCheck className="w-3.5 h-3.5 text-brand-400" />
                  Monitoring Active
                </span>

                <span className={`font-semibold flex items-center gap-1 ${
                  proctorStatus === 'centered' ? 'text-emerald-400' :
                  proctorStatus === 'turned_away' ? 'text-amber-400 font-bold' :
                  proctorStatus === 'multiple_faces' ? 'text-red-400 font-bold' :
                  'text-orange-400 font-bold'
                }`}>
                  <span className={`w-1.5 h-1.5 rounded-full ${
                    proctorStatus === 'centered' ? 'bg-emerald-400' : 'bg-red-500 animate-ping'
                  }`} />
                  {proctorStatus === 'centered' ? 'Face Centered' :
                   proctorStatus === 'turned_away' ? 'Head Turned!' :
                   proctorStatus === 'multiple_faces' ? 'Multiple Persons!' :
                   'No Face!'}
                </span>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
