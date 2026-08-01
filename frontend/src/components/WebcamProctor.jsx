import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  HiOutlineCamera,
  HiOutlineVideoCamera,
  HiOutlineShieldCheck,
  HiOutlineExclamationCircle,
  HiOutlineChevronDown,
  HiOutlineChevronUp,
  HiOutlineRefresh,
  HiOutlineLockClosed
} from 'react-icons/hi';

/**
 * WebcamProctor Component
 *
 * Provides a self-contained webcam proctoring widget for online exams.
 * Features:
 * - Webcam stream initialization & active tracking
 * - Floating, collapsible Picture-in-Picture live camera feed
 * - Status indicators (Live recording, Permission Denied, Connecting)
 * - Periodic Base64 snapshot extraction for backend proctoring log/verification
 * - Graceful permission error handling and reconnection retries
 */
export default function WebcamProctor({
  onSnapshot = null,
  onStatusChange = null,
  onFaceTurn = null,
  snapshotIntervalSec = 30,
  enableFaceTurnDetection = true,
  faceTurnIntervalMs = 2000,
  faceTurnMissesToConfirm = 3,
  required = true,
  className = ''
}) {
  const [streamState, setStreamState] = useState('initializing'); // 'initializing' | 'active' | 'denied' | 'error'
  const [errorMsg, setErrorMsg] = useState('');
  const [isMinimized, setIsMinimized] = useState(false);
  const [snapshotCount, setSnapshotCount] = useState(0);
  const [lastSnapshotTime, setLastSnapshotTime] = useState(null);

  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const mediaStreamRef = useRef(null);
  const snapshotTimerRef = useRef(null);
  const faceTurnMissesRef = useRef(0);
  const faceTurnFiredRef = useRef(false);

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
          frameRate: { max: 15 }
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
        message = 'Camera permission was denied. Please allow camera access to proceed with proctoring.';
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
    if (snapshotTimerRef.current) {
      clearInterval(snapshotTimerRef.current);
      snapshotTimerRef.current = null;
    }
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
      const base64Image = canvas.toDataURL('image/jpeg', 0.7);

      setSnapshotCount(prev => prev + 1);
      setLastSnapshotTime(new Date().toLocaleTimeString());

      if (onSnapshot) {
        onSnapshot({
          timestamp: new Date().toISOString(),
          image: base64Image
        });
      }
    }
  }, [streamState, onSnapshot]);

  // Setup stream and snapshot timer on mount
  useEffect(() => {
    startCamera();

    return () => {
      stopCamera();
    };
  }, [startCamera, stopCamera]);

  // Detect when the user turns away from the camera (~90° side profile).
  // Uses a skin-tone presence heuristic on downscaled frames:
  // when facing the camera, the upper part of the frame has many skin pixels;
  // when turned away, skin ratio drops sharply. Requires N consecutive misses
  // to fire, so momentary movements/lighting changes don't trigger warnings.
  const detectFaceTurn = useCallback(() => {
    if (streamState !== 'active' || !videoRef.current || !canvasRef.current) return;
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (video.videoWidth === 0 || video.videoHeight === 0) return;

    canvas.width = 160;
    canvas.height = 120;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.drawImage(video, 0, 0, 160, 120);
    const { data } = ctx.getImageData(0, 0, 160, 120);

    // Analyze the upper 2/3 of the frame (where the face is when facing camera)
    let skin = 0;
    let total = 0;
    let brightness = 0;
    for (let y = 0; y < 80; y++) {
      for (let x = 0; x < 160; x++) {
        const i = (y * 160 + x) * 4;
        const r = data[i], g = data[i + 1], b = data[i + 2];
        total++;
        brightness += (r + g + b) / 3;
        // Skin-tone heuristic (RGB)
        if (r > 95 && g > 40 && b > 20 && r > g && r > b && Math.abs(r - g) > 15) skin++;
      }
    }
    if (total === 0) return;
    const avgBrightness = brightness / total;
    const skinRatio = skin / total;

    // Too dark to judge — ignore this frame
    if (avgBrightness < 30) return;

    if (skinRatio < 0.05) {
      faceTurnMissesRef.current += 1;
      if (faceTurnMissesRef.current >= faceTurnMissesToConfirm && !faceTurnFiredRef.current) {
        faceTurnFiredRef.current = true;
        if (onFaceTurn) onFaceTurn();
      }
    } else if (skinRatio > 0.10) {
      // Face is clearly back — reset so the next turn-away fires again
      faceTurnMissesRef.current = 0;
      faceTurnFiredRef.current = false;
    }
  }, [streamState, faceTurnMissesToConfirm, onFaceTurn]);

  // Re-attach stream when the video element is recreated (e.g. after minimize/expand)
  useEffect(() => {
    if (!isMinimized && mediaStreamRef.current && videoRef.current) {
      videoRef.current.srcObject = mediaStreamRef.current;
      videoRef.current.play().catch(() => {});
    }
  }, [isMinimized, streamState]);

  // Setup periodic snapshot timer when stream is active
  useEffect(() => {
    if (streamState === 'active' && snapshotIntervalSec > 0) {
      snapshotTimerRef.current = setInterval(() => {
        captureSnapshot();
      }, snapshotIntervalSec * 1000);
    } else if (snapshotTimerRef.current) {
      clearInterval(snapshotTimerRef.current);
    }

    return () => {
      if (snapshotTimerRef.current) clearInterval(snapshotTimerRef.current);
    };
  }, [streamState, snapshotIntervalSec, captureSnapshot]);

  // Periodic face-turn detection while stream is active
  useEffect(() => {
    if (streamState === 'active' && enableFaceTurnDetection && faceTurnIntervalMs > 0) {
      const id = setInterval(detectFaceTurn, faceTurnIntervalMs);
      return () => clearInterval(id);
    }
  }, [streamState, enableFaceTurnDetection, faceTurnIntervalMs, detectFaceTurn]);

  return (
    <div className={`fixed bottom-4 right-4 z-50 transition-all duration-300 ${className}`}>
      {/* Hidden canvas for image extraction */}
      <canvas ref={canvasRef} className="hidden" />

      <div className="bg-dark-900 border border-dark-700/80 rounded-2xl shadow-2xl overflow-hidden backdrop-blur-lg w-72">
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
              <span className="inline-flex items-center gap-1 bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 text-[10px] font-medium px-2 py-0.5 rounded-full">
                <span className="w-1.5 h-1.5 bg-emerald-500 rounded-full animate-pulse" />
                LIVE
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

        {/* Collapsible Content Body */}
        {!isMinimized && (
          <div className="p-3">
            {/* Video Viewport Area */}
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
                  <p className="text-[11px] text-dark-400 leading-tight">Please enable webcam access in browser settings.</p>
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

              {/* Corner Watermark */}
              {streamState === 'active' && (
                <div className="absolute top-2 left-2 flex items-center gap-1 bg-black/60 backdrop-blur-sm px-2 py-0.5 rounded text-[10px] text-white/80 font-mono">
                  <HiOutlineLockClosed className="w-3 h-3 text-emerald-400" />
                  Proctored
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

            {/* Status Footer */}
            {streamState === 'active' && (
              <div className="mt-2 flex items-center justify-between text-[11px] text-dark-400 px-0.5">
                <span className="flex items-center gap-1">
                  <HiOutlineShieldCheck className="w-3.5 h-3.5 text-brand-400" />
                  Monitoring Active
                </span>
                {lastSnapshotTime && (
                  <span className="font-mono text-[10px] text-dark-500">
                    Snapshots: {snapshotCount}
                  </span>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
