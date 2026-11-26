import React, { useCallback, useEffect, useRef, useState } from 'react';
import { BrowserMultiFormatReader, IScannerControls } from '@zxing/browser';
import {
  AlertCircle,
  Camera,
  CheckCircle2,
  Flashlight,
  RefreshCw,
  Repeat,
  ScanLine,
  SwitchCamera,
  X,
} from 'lucide-react';

const PREFERRED_CAMERA_STORAGE_KEY = 'ela_pos_preferred_camera_id';

export interface BarcodeScanOutcome {
  matched: boolean;
  message?: string;
}

interface BarcodeScannerModalProps {
  open: boolean;
  title?: string;
  subtitle?: string;
  allowContinuousMode?: boolean;
  onClose: () => void;
  onScan: (code: string) => BarcodeScanOutcome | void;
}

interface CameraOption {
  deviceId: string;
  label: string;
}

function playScanBeep(success: boolean) {
  try {
    const AudioCtx =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AudioCtx) return;
    const ctx = new AudioCtx();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(success ? 1046.5 : 330, ctx.currentTime);
    gain.gain.setValueAtTime(0.08, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + (success ? 0.12 : 0.18));
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + (success ? 0.13 : 0.19));
    window.setTimeout(() => {
      ctx.close().catch(() => {});
    }, 300);
  } catch {
    // Audio feedback is optional; ignore browser autoplay restrictions
  }
}

export const BarcodeScannerModal: React.FC<BarcodeScannerModalProps> = ({
  open,
  title = 'Scan Product Barcode',
  subtitle = 'Point your chosen camera at an ELA hang tag or manufacturer barcode',
  allowContinuousMode = false,
  onClose,
  onScan,
}) => {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const controlsRef = useRef<IScannerControls | null>(null);
  const onScanRef = useRef(onScan);
  const onCloseRef = useRef(onClose);
  const continuousRef = useRef(false);
  const lastScanRef = useRef<{ code: string; at: number }>({ code: '', at: 0 });

  const [cameras, setCameras] = useState<CameraOption[]>([]);
  const [selectedDeviceId, setSelectedDeviceId] = useState<string>(() => {
    try {
      return localStorage.getItem(PREFERRED_CAMERA_STORAGE_KEY) || '';
    } catch {
      return '';
    }
  });
  const [continuousMode, setContinuousMode] = useState(false);
  const [starting, setStarting] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [torchSupported, setTorchSupported] = useState(false);
  const [torchEnabled, setTorchEnabled] = useState(false);
  const [scanFeedback, setScanFeedback] = useState<{
    type: 'success' | 'warning';
    code: string;
    message: string;
  } | null>(null);
  const [manualCode, setManualCode] = useState('');
  const [restartNonce, setRestartNonce] = useState(0);

  useEffect(() => {
    onScanRef.current = onScan;
  }, [onScan]);

  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  useEffect(() => {
    continuousRef.current = continuousMode;
  }, [continuousMode]);

  const stopActiveScanner = useCallback(() => {
    if (controlsRef.current) {
      try {
        controlsRef.current.stop();
      } catch {
        // Ignore cleanup errors
      }
      controlsRef.current = null;
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => {
        try {
          track.stop();
        } catch {
          // Ignore track stop errors
        }
      });
      streamRef.current = null;
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
    setTorchSupported(false);
    setTorchEnabled(false);
  }, []);

  const refreshCameraList = useCallback(async (activeDeviceId?: string) => {
    if (!navigator.mediaDevices?.enumerateDevices) return;
    try {
      const devices = await navigator.mediaDevices.enumerateDevices();
      const videoInputs = devices
        .filter((d) => d.kind === 'videoinput')
        .map((d, idx) => ({
          deviceId: d.deviceId,
          label: d.label?.trim() || `Camera ${idx + 1}`,
        }));
      setCameras(videoInputs);
      if (activeDeviceId && videoInputs.some((c) => c.deviceId === activeDeviceId)) {
        setSelectedDeviceId(activeDeviceId);
      } else if (videoInputs.length > 0) {
        setSelectedDeviceId((prev) =>
          prev && videoInputs.some((c) => c.deviceId === prev) ? prev : videoInputs[0].deviceId
        );
      }
    } catch {
      // Enumeration failures are handled via main camera error state
    }
  }, []);

  useEffect(() => {
    if (!open) {
      stopActiveScanner();
      setScanFeedback(null);
      setCameraError(null);
      setManualCode('');
      return;
    }

    let cancelled = false;

    const startScanner = async () => {
      if (!navigator.mediaDevices?.getUserMedia) {
        setCameraError(
          'Camera access is not supported in this browser or requires a secure HTTPS connection.'
        );
        return;
      }

      stopActiveScanner();
      setStarting(true);
      setCameraError(null);

      try {
        let stream: MediaStream | null = null;

        if (selectedDeviceId) {
          try {
            stream = await navigator.mediaDevices.getUserMedia({
              video: {
                deviceId: { exact: selectedDeviceId },
                width: { ideal: 1280 },
                height: { ideal: 720 },
              },
              audio: false,
            });
          } catch {
            // Saved or chosen deviceId might have been disconnected; fall back cleanly
            stream = null;
          }
        }

        if (!stream) {
          try {
            stream = await navigator.mediaDevices.getUserMedia({
              video: {
                facingMode: { ideal: 'environment' },
                width: { ideal: 1280 },
                height: { ideal: 720 },
              },
              audio: false,
            });
          } catch {
            stream = await navigator.mediaDevices.getUserMedia({
              video: true,
              audio: false,
            });
          }
        }

        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }

        streamRef.current = stream;
        const activeTrack = stream.getVideoTracks()[0];
        const activeDeviceId = activeTrack?.getSettings?.().deviceId;

        if (activeTrack && typeof activeTrack.getCapabilities === 'function') {
          const caps = activeTrack.getCapabilities() as MediaTrackCapabilities & {
            torch?: boolean;
          };
          setTorchSupported(Boolean(caps?.torch));
        }

        await refreshCameraList(activeDeviceId);

        if (!videoRef.current || cancelled) return;

        const reader = new BrowserMultiFormatReader();
        const controls = await reader.decodeFromStream(stream, videoRef.current, (result) => {
          if (!result || cancelled) return;
          const rawCode = result.getText().trim();
          if (!rawCode) return;

          const now = Date.now();
          if (
            lastScanRef.current.code === rawCode &&
            now - lastScanRef.current.at < 1600
          ) {
            return;
          }
          lastScanRef.current = { code: rawCode, at: now };

          const outcome = onScanRef.current(rawCode);
          const matched = outcome ? outcome.matched : true;
          playScanBeep(matched);

          if (matched && !continuousRef.current) {
            stopActiveScanner();
            onCloseRef.current();
            return;
          }

          setScanFeedback({
            type: matched ? 'success' : 'warning',
            code: rawCode,
            message:
              outcome?.message ||
              (matched ? `Scanned ${rawCode}` : `No item found for barcode "${rawCode}"`),
          });
        });

        if (cancelled) {
          controls.stop();
          return;
        }
        controlsRef.current = controls;
      } catch (err) {
        if (cancelled) return;
        const msg =
          err instanceof Error ? err.message : 'Unable to access the selected camera.';
        if (msg.toLowerCase().includes('permission') || msg.toLowerCase().includes('notallowed')) {
          setCameraError(
            'Camera permission was denied. Allow camera access in your browser settings and tap Retry.'
          );
        } else if (msg.toLowerCase().includes('notfound') || msg.toLowerCase().includes('device')) {
          setCameraError('No camera device was detected on this terminal.');
        } else {
          setCameraError(msg);
        }
      } finally {
        if (!cancelled) {
          setStarting(false);
        }
      }
    };

    startScanner();

    return () => {
      cancelled = true;
      stopActiveScanner();
    };
  }, [open, selectedDeviceId, restartNonce, refreshCameraList, stopActiveScanner]);

  if (!open) return null;

  const handleSelectCamera = (nextDeviceId: string) => {
    setSelectedDeviceId(nextDeviceId);
    try {
      localStorage.setItem(PREFERRED_CAMERA_STORAGE_KEY, nextDeviceId);
    } catch {
      // Ignore storage failures
    }
  };

  const handleCycleCamera = () => {
    if (cameras.length < 2) return;
    const currentIdx = cameras.findIndex((c) => c.deviceId === selectedDeviceId);
    const nextCamera = cameras[(currentIdx + 1) % cameras.length];
    if (nextCamera) {
      handleSelectCamera(nextCamera.deviceId);
    }
  };

  const handleToggleTorch = async () => {
    const track = streamRef.current?.getVideoTracks()[0];
    if (!track || !torchSupported) return;
    const next = !torchEnabled;
    try {
      await track.applyConstraints({
        advanced: [{ torch: next } as MediaTrackConstraintSet],
      });
      setTorchEnabled(next);
    } catch {
      // Torch constraint rejected on this hardware
      setTorchSupported(false);
    }
  };

  const handleManualSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const code = manualCode.trim();
    if (!code) return;
    const outcome = onScan(code);
    const matched = outcome ? outcome.matched : true;
    playScanBeep(matched);
    setManualCode('');
    if (matched && !continuousMode) {
      stopActiveScanner();
      onClose();
      return;
    }
    setScanFeedback({
      type: matched ? 'success' : 'warning',
      code,
      message:
        outcome?.message ||
        (matched ? `Scanned ${code}` : `No item found for barcode "${code}"`),
    });
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="barcode-scanner-title"
      className="fixed inset-0 z-[60] bg-black/65 flex items-end sm:items-center justify-center p-0 sm:p-4 no-print"
    >
      <div className="bg-white border border-[#E8DFD3] rounded-t-2xl sm:rounded-2xl max-w-lg w-full p-4 sm:p-5 space-y-4 max-h-[92dvh] overflow-y-auto pb-safe shadow-2xl">
        {/* Header */}
        <div className="flex items-start justify-between gap-3 border-b border-[#E8DFD3] pb-3">
          <div className="min-w-0">
            <h2
              id="barcode-scanner-title"
              className="font-display text-lg sm:text-xl font-semibold text-[#231712] flex items-center gap-2"
            >
              <Camera className="w-5 h-5 text-[#BE1A1A] shrink-0" aria-hidden="true" />
              <span className="truncate">{title}</span>
            </h2>
            <p className="text-xs text-[#766257] mt-0.5">{subtitle}</p>
          </div>
          <button
            type="button"
            onClick={() => {
              stopActiveScanner();
              onClose();
            }}
            aria-label="Close barcode scanner"
            className="min-w-[40px] min-h-[40px] flex items-center justify-center rounded-lg text-[#766257] hover:bg-[#FAF8F5] cursor-pointer shrink-0"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Camera Selection Bar */}
        <div className="space-y-1.5">
          <label
            htmlFor="scanner-camera-select"
            className="block text-xs font-semibold text-[#231712]"
          >
            Camera Source {cameras.length > 0 ? `(${cameras.length} available)` : ''}
          </label>
          <div className="flex items-center gap-2">
            <select
              id="scanner-camera-select"
              value={selectedDeviceId}
              onChange={(e) => handleSelectCamera(e.target.value)}
              disabled={cameras.length === 0}
              className="flex-1 min-w-0 min-h-[42px] px-3 py-2 text-base sm:text-xs bg-[#FAF8F5] border border-[#E8DFD3] rounded-lg text-[#231712] focus:outline-none focus:border-[#BE1A1A] disabled:opacity-60"
            >
              {cameras.length === 0 ? (
                <option value="">Detecting cameras...</option>
              ) : (
                cameras.map((cam) => (
                  <option key={cam.deviceId} value={cam.deviceId}>
                    {cam.label}
                  </option>
                ))
              )}
            </select>

            {cameras.length > 1 && (
              <button
                type="button"
                onClick={handleCycleCamera}
                title="Switch Camera"
                aria-label="Switch to next camera"
                className="min-w-[42px] min-h-[42px] px-3 inline-flex items-center justify-center gap-1.5 rounded-lg border border-[#E8DFD3] bg-[#FAF8F5] hover:bg-[#F8EBAB]/50 text-[#231712] text-xs font-semibold cursor-pointer shrink-0"
              >
                <SwitchCamera className="w-4 h-4 text-[#BE1A1A]" aria-hidden="true" />
                <span className="hidden sm:inline">Switch</span>
              </button>
            )}

            {torchSupported && (
              <button
                type="button"
                onClick={handleToggleTorch}
                title={torchEnabled ? 'Turn Off Flash' : 'Turn On Flash'}
                aria-label={torchEnabled ? 'Turn off flashlight' : 'Turn on flashlight'}
                aria-pressed={torchEnabled}
                className={`min-w-[42px] min-h-[42px] px-3 inline-flex items-center justify-center rounded-lg border text-xs font-semibold cursor-pointer shrink-0 transition-colors ${
                  torchEnabled
                    ? 'bg-[#231712] border-[#231712] text-[#F7D87F]'
                    : 'bg-[#FAF8F5] border-[#E8DFD3] text-[#231712] hover:bg-[#F8EBAB]/50'
                }`}
              >
                <Flashlight className="w-4 h-4" aria-hidden="true" />
              </button>
            )}
          </div>
        </div>

        {/* Live Camera Viewfinder */}
        <div className="relative w-full aspect-[4/3] sm:aspect-video rounded-xl overflow-hidden bg-[#140D0A] border border-[#3A2A22]">
          <video
            ref={videoRef}
            muted
            playsInline
            autoPlay
            className="w-full h-full object-cover"
          />

          {/* Aiming Reticle Overlay */}
          {!cameraError && (
            <div className="absolute inset-0 pointer-events-none flex items-center justify-center p-6">
              <div className="relative w-full max-w-[260px] h-32 sm:h-36">
                <span className="absolute top-0 left-0 w-6 h-6 border-t-2 border-l-2 border-[#F7D87F] rounded-tl-md" />
                <span className="absolute top-0 right-0 w-6 h-6 border-t-2 border-r-2 border-[#F7D87F] rounded-tr-md" />
                <span className="absolute bottom-0 left-0 w-6 h-6 border-b-2 border-l-2 border-[#F7D87F] rounded-bl-md" />
                <span className="absolute bottom-0 right-0 w-6 h-6 border-b-2 border-r-2 border-[#F7D87F] rounded-br-md" />
                <div className="absolute inset-x-3 top-1/2 -translate-y-1/2 h-0.5 bg-[#BE1A1A]/85 shadow-[0_0_8px_rgba(190,26,26,0.9)]" />
              </div>
            </div>
          )}

          {starting && !cameraError && (
            <div className="absolute inset-0 bg-[#140D0A]/70 flex flex-col items-center justify-center gap-2 text-[#F8EBAB] text-xs">
              <RefreshCw className="w-5 h-5 animate-spin text-[#F7D87F]" aria-hidden="true" />
              <span>Starting camera feed...</span>
            </div>
          )}

          {cameraError && (
            <div className="absolute inset-0 bg-[#140D0A]/95 flex flex-col items-center justify-center text-center p-5 gap-3">
              <AlertCircle className="w-8 h-8 text-[#FF8A7E]" aria-hidden="true" />
              <p className="text-xs text-[#FAF8F5] max-w-xs leading-relaxed">{cameraError}</p>
              <button
                type="button"
                onClick={() => setRestartNonce((n) => n + 1)}
                className="min-h-[40px] inline-flex items-center gap-1.5 px-4 py-2 bg-[#BE1A1A] hover:bg-[#D0311E] text-white text-xs font-semibold rounded-lg cursor-pointer"
              >
                <RefreshCw className="w-3.5 h-3.5" aria-hidden="true" />
                <span>Retry Camera</span>
              </button>
            </div>
          )}
        </div>

        {/* Live Scan Outcome Feedback */}
        {scanFeedback && (
          <div
            role="status"
            className={`flex items-start gap-2.5 rounded-xl px-3.5 py-2.5 text-xs border ${
              scanFeedback.type === 'success'
                ? 'bg-[#E9F7EF] border-[#16A34A]/35 text-[#14532D]'
                : 'bg-[#FFF7E6] border-[#D97706]/35 text-[#78350F]'
            }`}
          >
            {scanFeedback.type === 'success' ? (
              <CheckCircle2 className="w-4 h-4 text-[#16A34A] shrink-0 mt-0.5" aria-hidden="true" />
            ) : (
              <AlertCircle className="w-4 h-4 text-[#D97706] shrink-0 mt-0.5" aria-hidden="true" />
            )}
            <div className="min-w-0 flex-1">
              <p className="font-semibold">{scanFeedback.message}</p>
              <p className="font-mono text-[11px] opacity-80 mt-0.5">Code: {scanFeedback.code}</p>
            </div>
          </div>
        )}

        {/* Continuous Scan Option (POS Register) & Manual Code Fallback */}
        <div className="space-y-3 pt-1 border-t border-[#E8DFD3]">
          {allowContinuousMode && (
            <label className="flex items-center justify-between gap-3 py-1 cursor-pointer select-none">
              <div className="flex items-center gap-2 text-xs text-[#231712]">
                <Repeat className="w-4 h-4 text-[#BE1A1A] shrink-0" aria-hidden="true" />
                <div>
                  <p className="font-semibold">Continuous Multi-Item Scan</p>
                  <p className="text-[11px] text-[#766257]">
                    Keep camera open to scan multiple tags directly into the cart
                  </p>
                </div>
              </div>
              <input
                type="checkbox"
                checked={continuousMode}
                onChange={(e) => setContinuousMode(e.target.checked)}
                className="w-4 h-4 accent-[#BE1A1A] shrink-0 cursor-pointer"
              />
            </label>
          )}

          <form onSubmit={handleManualSubmit} className="flex items-center gap-2">
            <div className="relative flex-1">
              <ScanLine
                className="w-4 h-4 text-[#766257] absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none"
                aria-hidden="true"
              />
              <label htmlFor="manual-barcode-entry" className="sr-only">
                Type or enter barcode manually
              </label>
              <input
                id="manual-barcode-entry"
                type="text"
                value={manualCode}
                onChange={(e) => setManualCode(e.target.value)}
                placeholder="Or enter barcode / SKU manually..."
                className="w-full pl-9 pr-3 py-2 text-base sm:text-xs font-mono bg-[#FAF8F5] border border-[#E8DFD3] rounded-lg focus:outline-none focus:border-[#BE1A1A]"
              />
            </div>
            <button
              type="submit"
              className="min-h-[40px] px-3.5 py-2 bg-[#231712] hover:bg-[#3A271F] text-[#F7D87F] text-xs font-semibold rounded-lg cursor-pointer whitespace-nowrap"
            >
              Submit
            </button>
          </form>
        </div>
      </div>
    </div>
  );
};
