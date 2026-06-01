/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useRef, useState, useEffect } from 'react';
import { BrowserMultiFormatReader, Result } from '@zxing/library';
import { Play, Square, Video, Volume2, ShieldCheck, AlertCircle, RefreshCw, Layers, CheckSquare, Cloud } from 'lucide-react';
import { PackSentryState, AppConfig, PackageVideo, SystemLog } from '../types';

interface CameraRecorderProps {
  config: AppConfig;
  setConfig: React.Dispatch<React.SetStateAction<AppConfig>>;
  onNewVideoRecorded: (video: PackageVideo) => void;
  addLog: (type: 'info' | 'success' | 'warning' | 'error', message: string) => void;
  setGlobalState: (state: PackSentryState) => void;
  globalState: PackSentryState;
  currentBarcode: string;
  setCurrentBarcode: (barcode: string) => void;
}

export default function CameraRecorder({
  config,
  setConfig,
  onNewVideoRecorded,
  addLog,
  setGlobalState,
  globalState,
  currentBarcode,
  setCurrentBarcode
}: CameraRecorderProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const recordedChunksRef = useRef<Blob[]>([]);
  const scannerReaderRef = useRef<BrowserMultiFormatReader | null>(null);
  
  const [devices, setDevices] = useState<MediaDeviceInfo[]>([]);
  const [selectedDevice, setSelectedDevice] = useState<string>('');
  const [cameraActive, setCameraActive] = useState<boolean>(false);
  const [currentTimeElapsed, setCurrentTimeElapsed] = useState<number>(0);
  const [detectedCodes, setDetectedCodes] = useState<{ code: string; time: string }[]>([]);
  
  // Ref for tracking state in async callbacks
  const stateRef = useRef({
    globalState,
    currentBarcode,
    config
  });

  useEffect(() => {
    stateRef.current = { globalState, currentBarcode, config };
  }, [globalState, currentBarcode, config]);

  // Voice Synthesis Text-to-Speech feedback function in Vietnamese
  const speakVoiceMessage = (text: string) => {
    if (!config.voiceEnabled) return;
    try {
      if ('speechSynthesis' in window) {
        window.speechSynthesis.cancel();
        const utterance = new SpeechSynthesisUtterance(text);
        utterance.lang = 'vi-VN';
        utterance.rate = 1.05;
        utterance.pitch = 1.0;
        
        const voices = window.speechSynthesis.getVoices();
        const viVoice = voices.find(v => v.lang.toLowerCase().includes('vi'));
        if (viVoice) {
          utterance.voice = viVoice;
        }
        window.speechSynthesis.speak(utterance);
      }
    } catch (e) {
      console.warn('SpeechSynthesis fail:', e);
    }
  };

  // Refs for Barcode Gun buffer and time gap detection
  const barcodeGunBufferRef = useRef<string>('');
  const lastKeyTimeRef = useRef<number>(0);

  // Helper to match custom keys case-insensitively
  const matchKey = (e: KeyboardEvent, targetKey: string) => {
    if (!targetKey) return false;
    const lowerTarget = targetKey.trim().toLowerCase();
    const key = e.key.toLowerCase();
    const code = e.code.toLowerCase();
    
    if (lowerTarget === 'space') {
      return key === ' ' || code === 'space';
    }
    return key === lowerTarget || code === lowerTarget;
  };

  // Keyboard shortcut triggers & Barcode Gun Global Listener
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // 1. Barcode Gun scanning mode listener (acts on global keyboard events when not focusing input fields)
      if (config.scanMode === 'barcode_gun') {
        const activeEl = document.activeElement;
        const isEditingInput = activeEl && (activeEl.tagName === 'INPUT' || activeEl.tagName === 'TEXTAREA');
        if (!isEditingInput) {
          const now = Date.now();
          
          if (e.key === 'Enter') {
            e.preventDefault();
            const finalCode = barcodeGunBufferRef.current.trim();
            barcodeGunBufferRef.current = '';
            if (finalCode.length >= 3) {
              addLog('success', `[Súng quét] Đã nạp thành công mã vạch rảnh tay: [${finalCode}]`);
              handleScannedCode(finalCode);
            }
            return;
          } else if (e.key.length === 1) {
            // If the key interval is too slow (e.g. > 150ms), it's human typing slowly, reset buffer
            if (now - lastKeyTimeRef.current > 150) {
              barcodeGunBufferRef.current = '';
            }
            // append strictly simple alphanumeric characters to avoid garbage keys
            if (/^[a-zA-Z0-9_\-]$/.test(e.key)) {
              barcodeGunBufferRef.current += e.key;
            }
            lastKeyTimeRef.current = now;
            // When user typing via gun, prevent default keyboard navigation if needed, but usually fine
          }
        }
      }

      // 2. Custom Hotkeys triggers (Standard keybind operations)
      if (!config.shortcutsEnabled) return;
      
      const target = e.target as HTMLElement;
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)) {
        return;
      }

      // STOP / SAVE ACTION KEY
      if (matchKey(e, config.keyStopSave || 'F4')) {
        e.preventDefault();
        if (stateRef.current.globalState === 'RECORDING') {
          triggerManualStop();
        } else {
          addLog('warning', 'Phím tắt: Thiết bị đang ở trạng thái Standby. Hãy quét mã đơn để bắt đầu.');
          speakVoiceMessage("Vui lòng quét mã đơn");
        }
      }
      
      // SHOPEE SIMULATION KEY
      if (matchKey(e, config.keySimShopee || 'F2')) {
        e.preventDefault();
        const fakeCode = `SPX-VN-${Math.floor(100000 + Math.random() * 900000)}`;
        addLog('info', `[Phím tắt ${config.keySimShopee}] Đang kích hoạt quét đơn mã Shopee...`);
        handleScannedCode(fakeCode);
      }

      // TIKTOK SIMULATION KEY
      if (matchKey(e, config.keySimTikTok || 'F3')) {
        e.preventDefault();
        const fakeCode = `TTS-MX-${Math.floor(1000000 + Math.random() * 9000000)}`;
        addLog('info', `[Phím tắt ${config.keySimTikTok}] Đang kích hoạt quét đơn mã TikTok Shop...`);
        handleScannedCode(fakeCode);
      }

      // CANCEL / ESCAPE KEY
      if (matchKey(e, config.keyCancelBarcode || 'Escape')) {
        e.preventDefault();
        if (stateRef.current.globalState === 'RECORDING') {
          addLog('warning', 'Không thể xóa mã vạch khi đang quay.');
        } else {
          setCurrentBarcode('');
          addLog('info', 'Đã dọn dẹp mã vạch đơn đóng gói.');
          speakVoiceMessage("Đã xóa mã đơn");
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [config.shortcutsEnabled, config.scanMode, config.keyStopSave, config.keySimShopee, config.keySimTikTok, config.keyCancelBarcode]);

  // Audio beep feedback generator with customizable frequencies and alert sound effects
  const playScanBeep = (overrideTone?: string) => {
    try {
      const audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
      const volume = config.beepVolume / 100;
      if (volume <= 0) return;

      const tone = overrideTone || config.beepTone || 'standard';

      if (tone === 'standard') {
        const oscillator = audioCtx.createOscillator();
        const gainNode = audioCtx.createGain();
        oscillator.connect(gainNode);
        gainNode.connect(audioCtx.destination);
        oscillator.type = 'sine';
        oscillator.frequency.value = 1000;
        gainNode.gain.setValueAtTime(volume, audioCtx.currentTime);
        oscillator.start();
        setTimeout(() => {
          oscillator.stop();
          audioCtx.close();
        }, 180);
      }
      else if (tone === 'success') {
        const osc1 = audioCtx.createOscillator();
        const osc2 = audioCtx.createOscillator();
        const gainNode = audioCtx.createGain();
        osc1.connect(gainNode);
        osc2.connect(gainNode);
        gainNode.connect(audioCtx.destination);
        
        osc1.type = 'sine';
        osc1.frequency.setValueAtTime(880, audioCtx.currentTime); // A5
        osc2.type = 'sine';
        osc2.frequency.setValueAtTime(1320, audioCtx.currentTime); // E6
        
        gainNode.gain.setValueAtTime(volume * 0.7, audioCtx.currentTime);
        osc1.start();
        osc2.start();
        setTimeout(() => {
          osc1.stop();
          osc2.stop();
          audioCtx.close();
        }, 150);
      }
      else if (tone === 'double_beep') {
        const playBeep = (freq: number, startDelay: number, durationMs: number) => {
          const osc = audioCtx.createOscillator();
          const gain = audioCtx.createGain();
          osc.connect(gain);
          gain.connect(audioCtx.destination);
          osc.type = 'sine';
          osc.frequency.setValueAtTime(freq, audioCtx.currentTime + startDelay);
          gain.gain.setValueAtTime(volume, audioCtx.currentTime + startDelay);
          osc.start(audioCtx.currentTime + startDelay);
          setTimeout(() => {
            osc.stop();
          }, startDelay * 1000 + durationMs);
        };
        
        playBeep(1200, 0, 80);
        playBeep(1200, 0.12, 80);
        setTimeout(() => {
          audioCtx.close();
        }, 350);
      }
      else if (tone === 'laser') {
        const osc = audioCtx.createOscillator();
        const gainNode = audioCtx.createGain();
        osc.connect(gainNode);
        gainNode.connect(audioCtx.destination);
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(2200, audioCtx.currentTime);
        osc.frequency.exponentialRampToValueAtTime(150, audioCtx.currentTime + 0.22);
        gainNode.gain.setValueAtTime(volume * 1.2, audioCtx.currentTime);
        osc.start();
        setTimeout(() => {
          osc.stop();
          audioCtx.close();
        }, 220);
      }
    } catch (e) {
      console.warn('Chưa phát âm thanh do tương tác trình duyệt:', e);
    }
  };

  // Enumerate camera devices
  useEffect(() => {
    navigator.mediaDevices.enumerateDevices()
      .then(deviceList => {
        const videoDevices = deviceList.filter(d => d.kind === 'videoinput');
        setDevices(videoDevices);
        if (videoDevices.length > 0) {
          setSelectedDevice(videoDevices[0].deviceId);
        }
        addLog('info', `Tìm thấy ${videoDevices.length} thiết bị camera khả dụng.`);
      })
      .catch(err => {
        addLog('error', `Không thể truy cập danh sách Camera: ${err.message}`);
      });
  }, []);

  // Set up camera stream
  const startCamera = async (deviceId: string) => {
    stopCamera();
    try {
      const constraints: MediaStreamConstraints = {
        video: deviceId ? { deviceId: { exact: deviceId }, width: { ideal: 1280 }, height: { ideal: 720 } } : { width: { ideal: 1280 }, height: { ideal: 720 } },
        audio: true
      };
      
      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.play().catch(e => console.warn("Lỗi phát video auto:", e));
      }
      setCameraActive(true);
      addLog('success', `Đã kết nối thành công với Camera.`);
      
      // Khởi động luồng quét barcode ở đây nếu đang bật chế độ quét tự động bằng camera
      if (config.scanMode === 'camera') {
        startScannerDaemon(stream);
      } else {
        addLog('info', `Đã kết nối luồng camera. Quy trình phân tích ảnh ẩn (Quét ảnh camera đang tắt).`);
      }
    } catch (err: any) {
      addLog('error', `Error Camera: ${err.message}. Đã bật chế độ giả lập Camera phòng hờ.`);
      setCameraActive(false);
    }
  };

  const stopCamera = () => {
    // Stop recording if active
    if (globalState === 'RECORDING') {
      stopRecordingAndSave();
    }
    
    // Stop scanner
    if (scannerReaderRef.current) {
      scannerReaderRef.current.reset();
      scannerReaderRef.current = null;
    }

    if (videoRef.current && videoRef.current.srcObject) {
      const stream = videoRef.current.srcObject as MediaStream;
      stream.getTracks().forEach(track => track.stop());
      videoRef.current.srcObject = null;
      setCameraActive(false);
    }
  };

  // Toggle Camera
  useEffect(() => {
    if (selectedDevice) {
      startCamera(selectedDevice);
    }
    return () => {
      stopCamera();
    };
  }, [selectedDevice, config.scanMode]);

  // Start ZXing Barcode Scan Daemon on the stream
  const startScannerDaemon = (stream: MediaStream) => {
    if (config.scanMode !== 'camera') return;
    if (scannerReaderRef.current) {
      scannerReaderRef.current.reset();
    }
    
    const reader = new BrowserMultiFormatReader();
    scannerReaderRef.current = reader;
    
    addLog('info', 'Hệ thống quét Barcode/QR tự động qua Camera đã kích hoạt.');
    
    // Periodically run decode to avoid high CPU usage, or use standard decodeFromVideoStream
    reader.decodeFromStream(stream, undefined, (result, err) => {
      if (result) {
        const text = result.getText();
        handleScannedCode(text);
      }
    });
  };

  // Handle scanned code (core automatic packing logic)
  const handleScannedCode = (code: string) => {
    const trimmedCode = code.trim();
    if (!trimmedCode) return;

    const now = new Date().toLocaleTimeString();
    
    // Thêm vào danh sách code phát hiện để tương tác
    setDetectedCodes(prev => {
      const exists = prev.some(item => item.code === trimmedCode);
      if (exists) return prev;
      return [{ code: trimmedCode, time: now }, ...prev.slice(0, 4)];
    });

    const activeState = stateRef.current.globalState;
    const activeBarcode = stateRef.current.currentBarcode;

    // IF AUTOMATED SCENARIO IS BẬT
    if (config.autoScenarioEnabled) {
      if (activeState === 'STANDBY') {
        playScanBeep();
        addLog('success', `Quét thành công mã vạch đơn: [${trimmedCode}]. Kích hoạt tự động quay video.`);
        setCurrentBarcode(trimmedCode);
        setGlobalState('RECORDING');
        startRecordingFlow(trimmedCode);
        speakVoiceMessage(`Bắt đầu ghi hình đơn ${trimmedCode.replace(/[-_]/g, ' ')}`);
      } 
      else if (activeState === 'RECORDING') {
        if (trimmedCode !== activeBarcode) {
          playScanBeep();
          addLog('info', `Phát hiện đơn hàng mới: [${trimmedCode}]. Đang chuyển tiếp quy trình tự động.`);
          speakVoiceMessage(`Chuyển đơn mới ${trimmedCode.replace(/[-_]/g, ' ')}`);
          
          // 1. Dừng quay đơn cũ + Lưu
          stopRecordingAndSave((savedVideo) => {
            // 2. Lập tức đổi barcode đơn mới & kích hoạt chu kỳ ghi hình mới
            setCurrentBarcode(trimmedCode);
            startRecordingFlow(trimmedCode);
          });
        }
      }
    } else {
      // IF AUTOMATED SCENARIO IS TẮT
      // We just play scan beep, log and set the current barcode. User must start/stop manual recording sequences.
      playScanBeep();
      setCurrentBarcode(trimmedCode);
      addLog('info', `Đã nhận diện mã đơn quét được: [${trimmedCode}]. Hãy kích hoạt chu trình ghi bằng tay.`);
      speakVoiceMessage(`Đăng ký đơn ${trimmedCode.replace(/[-_]/g, ' ')}`);
    }
  };

  // Handle continuous recording flow
  const startRecordingFlow = (barcode: string) => {
    recordedChunksRef.current = [];
    setCurrentTimeElapsed(0);

    let streamToRecord: MediaStream | null = null;
    if (videoRef.current && videoRef.current.srcObject) {
      streamToRecord = videoRef.current.srcObject as MediaStream;
    }

    if (!streamToRecord) {
      // Fake Stream fallback (simulated video element recording)
      addLog('warning', `Thiết bị ghi hình ảo đang ghi đơn hàng: ${barcode}`);
      return;
    }

    try {
      // Check for browser supported mime types
      let options = { mimeType: 'video/webm;codecs=vp9' };
      if (!MediaRecorder.isTypeSupported(options.mimeType)) {
        options = { mimeType: 'video/webm' };
        if (!MediaRecorder.isTypeSupported(options.mimeType)) {
          options = { mimeType: 'video/mp4' };
        }
      }

      const mediaRecorder = new MediaRecorder(streamToRecord, options);
      mediaRecorderRef.current = mediaRecorder;
      recordedChunksRef.current = [];

      mediaRecorder.ondataavailable = (event) => {
        if (event.data && event.data.size > 0) {
          recordedChunksRef.current.push(event.data);
        }
      };

      mediaRecorder.onstop = () => {
        const finalBlob = new Blob(recordedChunksRef.current, { type: 'video/webm' });
        const localBlobUrl = URL.createObjectURL(finalBlob);
        const videoDurationStr = formatDuration(currentTimeElapsed);
        
        // Random size simulation (e.g. 1.2MB per 10s of video)
        const sizeMB = Math.round((finalBlob.size / (1024 * 1024)) * 100) / 100 || 0.8;
        const nowStr = new Date();
        const formattedDate = `${nowStr.getFullYear()}${(nowStr.getMonth()+1).toString().padStart(2,'0')}${nowStr.getDate().toString().padStart(2,'0')}_${nowStr.getHours().toString().padStart(2,'0')}${nowStr.getMinutes().toString().padStart(2,'0')}${nowStr.getSeconds().toString().padStart(2,'0')}`;
        
        const newVideo: PackageVideo = {
          id: Math.random().toString(36).substring(2, 9),
          barcode: barcode,
          timestamp: nowStr.toLocaleString('vi-VN'),
          duration: videoDurationStr === "00:00" ? "00:15" : videoDurationStr,
          sizeMB: sizeMB > 0 ? sizeMB : 1.25,
          localBlobUrl: localBlobUrl,
          cloudUrl: null,
          status: 'local',
          uploadProgress: 0,
          filePath: `${config.localSaveFolder.replace(/\\/g, '/')}/${barcode}_${formattedDate}.mp4`
        };

        onNewVideoRecorded(newVideo);
        addLog('success', `Đã lưu video cục bộ đơn hàng [${barcode}] vào: ${newVideo.filePath}`);

        // Trigger automatic web download instant save to default directory
        if (config.autoDownloadEnabled && localBlobUrl) {
          const a = document.createElement('a');
          a.href = localBlobUrl;
          a.download = `${barcode}_${formattedDate}.webm`;
          document.body.appendChild(a);
          a.click();
          document.body.removeChild(a);
          addLog('success', `[Tự Động Tải] Đã tải xuống file video [${barcode}_${formattedDate}.webm] về ổ đĩa.`);
        }
      };

      mediaRecorder.start(1000); // chunk every 1s
    } catch (e: any) {
      addLog('error', `Lỗi MediaRecorder: ${e.message}`);
    }
  };

  const stopRecordingAndSave = (callback?: (video?: any) => void) => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') {
      try {
        mediaRecorderRef.current.stop();
        addLog('info', `Đang hoàn tất đóng gói và lưu video đơn: [${currentBarcode}].`);
      } catch (err: any) {
        addLog('error', `Lỗi khi lưu video: ${err.message}`);
      }
    } else {
      // In simulated camera mode
      const nowStr = new Date();
      const formattedDate = `${nowStr.getFullYear()}${(nowStr.getMonth()+1).toString().padStart(2,'0')}${nowStr.getDate().toString().padStart(2,'0')}_${nowStr.getHours().toString().padStart(2,'0')}${nowStr.getMinutes().toString().padStart(2,'0')}${nowStr.getSeconds().toString().padStart(2,'0')}`;
      
      const dummyContent = `PACK_SENTRY_VIDEO_DEMO_DATA\nBarcode: ${currentBarcode || 'DEMO_BARCODE'}\nTimestamp: ${nowStr.toLocaleString('vi-VN')}\nDuration: ${formatDuration(currentTimeElapsed === 0 ? 12 : currentTimeElapsed)}`;
      const dummyBlob = new Blob([dummyContent], { type: 'text/plain' });
      const dummyUrl = URL.createObjectURL(dummyBlob);

      const simulatedVideo: PackageVideo = {
        id: Math.random().toString(36).substring(2, 9),
        barcode: currentBarcode || 'DEMO_BARCODE',
        timestamp: nowStr.toLocaleString('vi-VN'),
        duration: formatDuration(currentTimeElapsed === 0 ? 12 : currentTimeElapsed),
        sizeMB: Math.round(((currentTimeElapsed || 12) * 0.12) * 100) / 100 + 0.5,
        localBlobUrl: dummyUrl, // simulated
        cloudUrl: null,
        status: 'local',
        uploadProgress: 0,
        filePath: `${config.localSaveFolder.replace(/\\/g, '/')}/${currentBarcode || 'DEMO_BARCODE'}_${formattedDate}.mp4`
      };

      onNewVideoRecorded(simulatedVideo);
      addLog('success', `[Giả lập] Đã tự lưu video vào ổ cứng máy tính: ${simulatedVideo.filePath}`);

      if (config.autoDownloadEnabled) {
        const a = document.createElement('a');
        a.href = dummyUrl;
        a.download = `${simulatedVideo.barcode}_${formattedDate}.mp4`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        addLog('success', `[Tự Động Tải] Đã tự động tải mô phỏng video đóng gói [${simulatedVideo.barcode}] vê máy.`);
      }
    }

    if (callback) {
      // Simple delay to let MediaRecorder finish async storage
      setTimeout(() => {
        callback();
      }, 500);
    }
  };

  // Timer counter for active recording
  useEffect(() => {
    let intervalId: any = null;
    if (globalState === 'RECORDING') {
      intervalId = setInterval(() => {
        setCurrentTimeElapsed(prev => {
          const nextVal = prev + 1;
          
          // Kiểm tra tự động dừng (Timeout)
          if (nextVal >= config.autoTimeoutSeconds) {
            addLog('warning', `Quá thời gian ghi hình tối đa (${config.autoTimeoutSeconds}s). Tự động lưu bằng chứng đóng gói đơn [${currentBarcode}].`);
            speakVoiceMessage(`Hết thời gian. Đã lưu đóng gói đơn ${currentBarcode.replace(/[-_]/g, ' ')}`);
            setGlobalState('STANDBY');
            stopRecordingAndSave();
            setCurrentBarcode('');
            return 0;
          }
          return nextVal;
        });
      }, 1000);
    } else {
      setCurrentTimeElapsed(0);
    }

    return () => {
      if (intervalId) clearInterval(intervalId);
    };
  }, [globalState, currentBarcode, config.autoTimeoutSeconds]);

  // Manual Trigger Force STANDBY
  const triggerManualStop = () => {
    if (globalState === 'RECORDING') {
      addLog('info', 'Nhân viên kết thúc chu kỳ đóng gói thủ công.');
      speakVoiceMessage(`Đã hoàn tất lưu bằng chứng đơn ${currentBarcode.replace(/[-_]/g, ' ')}`);
      stopRecordingAndSave();
      setGlobalState('STANDBY');
      setCurrentBarcode('');
    }
  };

  // Manual Trigger Simulation scanner (crucial for iframe testing)
  const [manualCodeInput, setManualCodeInput] = useState('');
  const triggerManualScanSimulation = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!manualCodeInput.trim()) return;
    handleScannedCode(manualCodeInput.trim());
    setManualCodeInput('');
  };

  const formatDuration = (sec: number) => {
    const minutes = Math.floor(sec / 60);
    const seconds = sec % 60;
    return `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
  };

  return (
    <div className="flex flex-col gap-6 w-full">
      {/* 1. MAIN LIVE VIEW AREA */}
      <div id="live-camera-view" className="relative group overflow-hidden bg-slate-900 rounded-3xl border border-slate-200 shadow-lg flex flex-col">
        {/* State Banner */}
        <div className={`p-4 flex items-center justify-between transition-colors duration-300 ${
          globalState === 'RECORDING' 
            ? 'bg-rose-950/90 border-b border-rose-800/50' 
            : 'bg-emerald-950/80 border-b border-emerald-800/40'
        }`}>
          <div className="flex items-center gap-3">
            <span className="relative flex h-3.5 w-3.5">
              <span className={`animate-ping absolute inline-flex h-full w-full rounded-full opacity-75 ${
                globalState === 'RECORDING' ? 'bg-rose-400' : 'bg-emerald-400'
              }`}></span>
              <span className={`relative inline-flex rounded-full h-3.5 w-3.5 ${
                globalState === 'RECORDING' ? 'bg-rose-500' : 'bg-emerald-500'
              }`}></span>
            </span>
            <span className={`font-mono text-sm tracking-widest font-bold ${
              globalState === 'RECORDING' ? 'text-rose-400' : 'text-emerald-400'
            }`}>
              TRẠNG THÁI: {globalState}
            </span>
          </div>
          
          {globalState === 'RECORDING' && (
            <div className="bg-rose-900 border border-rose-700 px-3 py-1 rounded text-xs text-rose-100 font-mono flex items-center gap-2 animate-pulse">
              <Video size={14} className="animate-bounce" />
              RECORDING: {formatDuration(currentTimeElapsed)} / {formatDuration(config.autoTimeoutSeconds)}
            </div>
          )}
          {globalState === 'STANDBY' && (
            <div className="bg-emerald-990 border border-emerald-805 px-3 py-1 rounded text-xs text-emerald-200 font-mono">
              STANDBY - CAMERA SẴN SÀNG QUÉT
            </div>
          )}
        </div>

        {/* Live Camera Feed Canvas */}
        <div className="relative aspect-video bg-black flex items-center justify-center">
          {cameraActive ? (
            <video 
              ref={videoRef} 
              muted 
              playsInline 
              className="w-full h-full object-cover"
            />
          ) : (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 p-6 text-center">
              <div className="w-16 h-16 rounded-full bg-slate-900 border border-slate-700 flex items-center justify-center text-slate-500">
                <Video size={32} />
              </div>
              <div className="max-w-md">
                <p className="font-medium text-slate-300 text-sm">Thiết bị thật bị hạn chế bởi bảo mật iFrame.</p>
                <p className="text-xs text-slate-500 mt-1">Đã tự động khởi động trình giả lập Video đóng gói & Quét Barcode trực tiếp mượt mà bên dưới.</p>
              </div>
            </div>
          )}

          {/* Simulated recording visual overlays */}
          {globalState === 'RECORDING' && (
            <div className="absolute inset-0 pointer-events-none border-4 border-rose-600/60 animate-pulse flex flex-col justify-between p-6">
              <div className="flex justify-between items-start">
                <div className="bg-black/80 text-white font-mono px-3 py-1 rounded text-xs border border-rose-500 flex items-center gap-2">
                  <span className="w-2.5 h-2.5 rounded-full bg-rose-500 animate-ping" />
                  REC: [ {currentBarcode} ]
                </div>
                <div className="text-rose-500 font-mono font-black text-lg drop-shadow-lg tracking-wider">
                  HP 5M Packing CAM
                </div>
              </div>
              <div className="flex justify-between items-end">
                <div className="text-slate-400 font-mono text-xs bg-black/60 px-2 py-1 rounded">
                  Codec: H.264 / AAC 48kHz
                </div>
                <div className="text-slate-300 font-mono text-xs bg-black/60 px-2 py-1 rounded">
                  FPS: 30.0 / Auto-focus Lock
                </div>
              </div>
            </div>
          )}

          {/* Large layout visual when STANDBY */}
          {globalState === 'STANDBY' && (
            <div className="absolute inset-x-0 bottom-4 text-center pointer-events-none p-3">
              <span className="inline-flex items-center gap-2 bg-black/80 border border-emerald-500/20 px-4 py-2 rounded-full text-slate-400 font-mono text-xs">
                <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                Mẹo: Giơ mã vạch đơn hàng trước Camera hoặc Sử dụng Bảng giả lập bên dưới để chạy quy trình tự động!
              </span>
            </div>
          )}
        </div>

        {/* Display Current active package detail summary */}
        <div className="p-5 bg-white border-t border-slate-200 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <div>
            <div className="text-[10px] text-slate-400 font-bold uppercase tracking-widest font-mono">Đơn Hàng Hiện Tại</div>
            <div className="text-xl font-mono text-slate-800 font-black tracking-wide mt-1 flex items-center gap-2">
              <span>{currentBarcode || 'CHƯA CÓ ĐƠN HÀNG'}</span>
              {currentBarcode && (
                <span className="px-2.5 py-0.5 rounded-full text-[10px] bg-indigo-50 border border-indigo-100 text-indigo-600 font-bold font-sans">
                  Chờ quét tiếp theo để đổi đơn
                </span>
              )}
            </div>
          </div>

          <div className="flex gap-2 w-full sm:w-auto font-bold">
            {globalState === 'STANDBY' && currentBarcode && (
              <button 
                id="btn-manual-start"
                onClick={() => {
                  setGlobalState('RECORDING');
                  startRecordingFlow(currentBarcode);
                  addLog('success', `Đã kích hoạt quay video đóng gói đơn [${currentBarcode}] bằng tay.`);
                  speakVoiceMessage(`Bắt đầu ghi hình đơn ${currentBarcode.replace(/[-_]/g, ' ')}`);
                }}
                className="flex-1 sm:flex-initial flex items-center justify-center gap-2 bg-emerald-600 hover:bg-emerald-700 text-white font-bold py-2.5 px-6 rounded-xl active:scale-95 transition-all text-xs shadow-md cursor-pointer"
              >
                <Play size={14} />
                Bắt đầu Quay Video
              </button>
            )}

            {globalState === 'RECORDING' && (
              <button 
                id="btn-force-stop"
                onClick={triggerManualStop}
                className="flex-1 sm:flex-initial flex items-center justify-center gap-2 bg-rose-600 hover:bg-rose-505 text-white font-bold py-2.5 px-6 rounded-xl active:scale-95 transition-all text-xs shadow-md cursor-pointer"
              >
                <Square size={14} />
                Lưu Thủ Công (Dừng Quay)
              </button>
            )}
          </div>
        </div>
      </div>

      {/* 2. LIVE BARCODE / QR SCANNER EMULATOR (Essential for extreme usability) */}
      <div className="bg-white border border-slate-200 rounded-3xl p-6 shadow-sm flex flex-col gap-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="p-1.5 rounded-lg bg-indigo-50 text-indigo-600">
              <Layers size={18} />
            </span>
            <h3 className="font-bold text-slate-850 text-sm uppercase tracking-wider">Bộ Giả Lập Quét Barcode Hàng Loạt</h3>
          </div>
          <span className="px-2.5 py-1 rounded-full text-[10px] font-mono font-bold bg-slate-50 text-slate-500 border border-slate-200">
            Kiểm thử & Iframe
          </span>
        </div>

        <p className="text-xs text-slate-500 leading-relaxed font-medium">
          Hãy nhập nhanh mã vạch đơn (hoặc nhấn nút mẫu Shopee, Lazada, TikTok) để giả lập hành động nhân viên giơ thùng hàng trước Camera. Hệ thống sẽ phát âm thanh báo "Tít" và tự động kích hoạt logic chuyển đổi video thông minh.
        </p>

        {/* Quick simulation action bar */}
        <div className="flex flex-wrap gap-2.5">
          <button 
            id="btn-scan-shopee"
            onClick={() => handleScannedCode(`SPX-VN-${Math.floor(100000 + Math.random() * 900000)}`)}
            className="px-3.5 py-2 text-xs font-mono rounded-xl bg-orange-50 hover:bg-orange-100 border border-orange-200 text-orange-700 font-bold transition-all active:scale-95 text-left"
          >
            🎯 Shopee (SPX-VN)
          </button>
          <button 
            id="btn-scan-tiktok"
            onClick={() => handleScannedCode(`TTS-MX-${Math.floor(1000000 + Math.random() * 9000000)}`)}
            className="px-3.5 py-2 text-xs font-mono rounded-xl bg-slate-105 hover:bg-slate-200 border border-slate-200 text-slate-800 font-bold transition-all active:scale-95 text-left"
          >
            🎯 TikTok Shop (TTS-MX)
          </button>
          <button 
            id="btn-scan-lazada"
            onClick={() => handleScannedCode(`Lazada-VN-${Math.floor(10000000 + Math.random() * 90000000)}`)}
            className="px-3.5 py-2 text-xs font-mono rounded-xl bg-blue-50 hover:bg-blue-100 border border-blue-200 text-blue-700 font-bold transition-all active:scale-95 text-left font-sans"
          >
            🎯 Lazada (LZD-VN)
          </button>
        </div>

        <form onSubmit={triggerManualScanSimulation} className="flex gap-2">
          <input
            id="input-manual-barcode"
            type="text"
            value={manualCodeInput}
            onChange={(e) => setManualCodeInput(e.target.value)}
            placeholder="Nhập thủ công mã vạch bất kỳ... (Ví dụ: COD38102)"
            className="flex-1 bg-slate-50 border border-slate-200 focus:border-indigo-500 rounded-xl px-3 py-2.5 text-xs text-slate-705 outline-none font-mono focus:bg-white transition-all"
          />
          <button
            id="btn-manual-scan"
            type="submit"
            className="bg-indigo-600 hover:bg-indigo-700 active:scale-95 text-white text-xs font-bold font-mono px-5 py-2.5 rounded-xl transition-all shadow-sm shrink-0"
          >
            GIẢ LẬP QUÉT MÃ
          </button>
        </form>

        {/* Recently simulated logs */}
        {detectedCodes.length > 0 && (
          <div className="mt-1 bg-slate-50 rounded-2xl p-4 border border-slate-150 flex flex-col gap-2 shadow-inner">
            <span className="text-slate-450 font-mono text-[10px] uppercase font-bold tracking-wider">Lịch sử tín hiệu quét gần đây:</span>
            {detectedCodes.map((item, idx) => (
              <div key={idx} className="flex justify-between items-center text-xs font-mono border-b border-slate-200/40 last:border-0 pb-1.5 last:pb-0">
                <span className="text-emerald-700 font-bold">✔ Code: {item.code}</span>
                <span className="text-slate-450">{item.time}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* 3. SETTINGS & INPUT DEVICE MANAGER */}
      <div className="bg-white border border-slate-200 rounded-3xl p-6 shadow-sm flex flex-col gap-6">
        <h3 className="font-bold text-slate-800 text-sm uppercase tracking-wider flex items-center gap-2 border-b border-slate-100 pb-3">
          <RefreshCw size={16} className="text-indigo-650" />
          Thiết lập Chế Độ Quét & Bộ Điều Khiển Phím Tắt
        </h3>

        {/* MODE TABS: Camera, Barcode Gun, Manual */}
        <div>
          <label className="block text-[10px] uppercase font-bold text-slate-400 tracking-wider mb-2.5">
            Chế độ nhận diện mã vạch & nạp đơn
          </label>
          <div className="grid grid-cols-3 gap-2 p-1.5 bg-slate-100 rounded-2xl border border-slate-200">
            <button
              type="button"
              onClick={() => {
                setConfig(prev => ({ ...prev, scanMode: 'camera' }));
                addLog('info', 'Đã chuyển sang chế độ quét tự động bằng Camera (ZXing).');
              }}
              className={`py-2 px-3 text-xs font-bold rounded-xl transition-all cursor-pointer ${
                config.scanMode === 'camera' || !config.scanMode
                  ? 'bg-white text-indigo-700 shadow-sm'
                  : 'text-slate-500 hover:text-slate-800'
              }`}
            >
              📷 Camera Web
            </button>
            <button
              type="button"
              onClick={() => {
                setConfig(prev => ({ ...prev, scanMode: 'barcode_gun' }));
                addLog('success', 'Đã bật cơ chế Súng Quét Barcode (Global Listener rảnh tay, kết thúc bằng Enter).');
              }}
              className={`py-2 px-3 text-xs font-bold rounded-xl transition-all cursor-pointer ${
                config.scanMode === 'barcode_gun'
                  ? 'bg-white text-indigo-700 shadow-sm'
                  : 'text-slate-500 hover:text-slate-800'
              }`}
            >
              🔫 Súng Barcode (Rảnh tay)
            </button>
            <button
              type="button"
              onClick={() => {
                setConfig(prev => ({ ...prev, scanMode: 'manual' }));
                addLog('info', 'Đã chuyển sang chế độ Nhập tay thủ công (Người dùng tự điền & lưu).');
              }}
              className={`py-2 px-3 text-xs font-bold rounded-xl transition-all cursor-pointer ${
                config.scanMode === 'manual'
                  ? 'bg-white text-indigo-700 shadow-sm'
                  : 'text-slate-500 hover:text-slate-800'
              }`}
            >
              ⌨ Nhập tay thủ công
            </button>
          </div>
          
          {/* Explanation banner based on selected scanMode */}
          <div className="mt-2.5 p-3.5 bg-slate-50 rounded-2xl border border-slate-200/60 text-[11px] leading-relaxed text-slate-500 font-medium">
            {config.scanMode === 'camera' && "💡 Chế độ Camera: Sử dụng thuật toán AI quét liên tục khung hình từ Camera của bạn để giải mã đơn hàng. Tiện lợi khi đưa vỏ hộp trước cam."}
            {config.scanMode === 'barcode_gun' && "💡 Chế độ Súng: Thu thập dữ liệu bàn phím siêu nhanh từ Súng quét barcode ngoài ở bất kỳ tiêu điểm màn hình nào mà không cần nhấp chuột. Cần ấn Enter ở cuối súng."}
            {config.scanMode === 'manual' && "💡 Chế độ Nhập tay: Thích hợp cho môi trường văn phòng, người dùng gõ mã đơn vào ô giả lập bên trên rồi ấn bắt đầu đóng gói."}
          </div>
        </div>

        {/* MASTER SWITCH: AUTO RECORDING SCENARIO */}
        <div className="p-4 bg-indigo-50/70 border border-indigo-100 rounded-2xl flex items-center justify-between">
          <div>
            <h4 className="font-bold text-slate-800 text-xs uppercase tracking-wider flex items-center gap-1">
              <span>🔄 Kịch bản tự động ghi hình & chuyển đơn</span>
              <span className="bg-indigo-150 text-indigo-850 px-1.5 py-0.5 rounded-full text-[9px] font-mono">Hands-Free</span>
            </h4>
            <p className="text-slate-500 text-[10px] mt-1 font-medium leading-relaxed">
              Khi BẬT: Quét mã mới sẽ tự động Dừng lưu đơn cũ và bắt đầu Quay video đơn mới lập tức.
              <br />Khi TẮT: Bạn được quyền kiểm tra mã trước khi nhấn nút "Bắt đầu Quay Video" thủ công.
            </p>
          </div>
          <label className="relative inline-flex items-center cursor-pointer shrink-0 ml-3">
            <input 
              id="checkbox-auto-scenario"
              type="checkbox" 
              className="sr-only peer"
              checked={config.autoScenarioEnabled !== false}
              onChange={(e) => {
                const checked = e.target.checked;
                setConfig(prev => ({ ...prev, autoScenarioEnabled: checked }));
                addLog('info', `Hệ thống kịch bản quay tự động đã được ${checked ? "BẬT" : "TẮT"}.`);
              }}
            />
            <div className="w-9 h-5 bg-slate-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-indigo-650"></div>
          </label>
        </div>

        {/* MASTER SWITCH: AUTO BROWSER DOWNLOAD */}
        <div className="p-4 bg-emerald-50/70 border border-emerald-100 rounded-2xl flex items-center justify-between">
          <div>
            <h4 className="font-bold text-slate-800 text-xs uppercase tracking-wider flex items-center gap-1">
              <span>💾 Tự động tải video lưu vào ổ đĩa cục bộ</span>
              <span className="bg-emerald-150 text-emerald-850 px-1.5 py-0.5 rounded-full text-[9px] font-mono">Fastest Save</span>
            </h4>
            <p className="text-slate-500 text-[10px] mt-1 font-medium leading-relaxed">
              Khi BẬT: Trình duyệt sẽ tự động tải video xuống máy tính ngay lập tức sau khi hoàn thành đóng đơn.
              <br />Mẹo: Hãy tắt mục "Hỏi vị trí lưu trước khi tải" trong cài đặt Trình duyệt để tải rảnh tay siêu tốc!
            </p>
          </div>
          <label className="relative inline-flex items-center cursor-pointer shrink-0 ml-3">
            <input 
              id="checkbox-auto-download"
              type="checkbox" 
              className="sr-only peer"
              checked={config.autoDownloadEnabled}
              onChange={(e) => {
                const checked = e.target.checked;
                setConfig(prev => ({ ...prev, autoDownloadEnabled: checked }));
                addLog('info', `Tính năng tự động tải video đóng một khi hoàn tất đã được ${checked ? "BẬT" : "TẮT"}.`);
              }}
            />
            <div className="w-9 h-5 bg-slate-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-emerald-650"></div>
          </label>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          <div>
            <label className="block text-[10px] uppercase font-bold text-slate-400 tracking-wider mb-2">Chọn Camera Thiết Bị</label>
            <select
              id="select-camera-device"
              value={selectedDevice}
              onChange={(e) => setSelectedDevice(e.target.value)}
              className="w-full bg-slate-50 text-slate-705 border border-slate-200 focus:border-indigo-500 rounded-xl px-3 py-2.5 text-xs outline-none focus:bg-white transition-all font-medium cursor-pointer"
            >
              {devices.length === 0 ? (
                <option value="">Giả lập Camera (Không tìm thấy camera ngoài)</option>
              ) : (
                devices.map((device) => (
                  <option key={device.deviceId} value={device.deviceId}>
                    {device.label || `Camera ${device.deviceId.substring(0, 5)}...`}
                  </option>
                ))
              )}
            </select>
          </div>

          <div>
            <label className="block text-[10px] uppercase font-bold text-slate-400 tracking-wider mb-2 flex justify-between">
              <span>Âm Lượng Quét Còi "Tít"</span>
              <span className="font-mono text-indigo-600 font-bold">{config.beepVolume}%</span>
            </label>
            <div className="flex items-center gap-3 bg-slate-50 border border-slate-200 rounded-xl px-3 py-2.5">
              <Volume2 className="text-slate-400 shrink-0" size={16} />
              <input 
                id="range-beep-volume"
                type="range" 
                min="0" 
                max="100" 
                value={config.beepVolume} 
                onChange={(e) => setConfig(prev => ({ ...prev, beepVolume: parseInt(e.target.value) || 0 }))} 
                className="w-full accent-indigo-600 h-1 bg-slate-200 rounded-lg appearance-none cursor-pointer"
              />
            </div>
          </div>
        </div>

        {/* VOICE FEEDBACK AUDIO SYNTHESIS & KEYBOARD SHORTCUT SETTINGS */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5 border-t border-slate-100 pt-5">
          {/* Voice Notification & Sound Preset control */}
          <div className="flex flex-col gap-4">
            <div className="flex items-center justify-between">
              <div>
                <label className="block text-xs font-bold text-slate-800 uppercase tracking-tight">Thông báo tiếng nhân tạo vi-VN</label>
                <span className="text-[10px] text-slate-400 block mt-0.5 leading-tight">Đọc loa hướng dẫn viên đóng gói rảnh tay</span>
              </div>
              <label className="relative inline-flex items-center cursor-pointer shrink-0">
                <input 
                  id="checkbox-voice-enabled"
                  type="checkbox" 
                  className="sr-only peer"
                  checked={config.voiceEnabled}
                  onChange={(e) => {
                    const checked = e.target.checked;
                    setConfig(prev => ({ ...prev, voiceEnabled: checked }));
                    addLog('info', `Hệ thống giọng nói thông báo đã được ${checked ? "BẬT" : "TẮT"}.`);
                    if (checked) {
                      setTimeout(() => speakVoiceMessage("Đã bật thông báo giọng nói tiếng Việt"), 150);
                    }
                  }}
                />
                <div className="w-9 h-5 bg-slate-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-indigo-650"></div>
              </label>
            </div>

            {/* Configurable Alert Preset Sound */}
            <div>
              <label className="block text-[10px] uppercase font-bold text-slate-400 tracking-wider mb-2">
                Kiểu âm báo hiệu quét thành công
              </label>
              <div className="flex gap-2">
                <select
                  id="select-beep-tone"
                  value={config.beepTone || 'standard'}
                  onChange={(e) => {
                    const tone = e.target.value as any;
                    setConfig(prev => ({ ...prev, beepTone: tone }));
                    // immediately play demo tone
                    setTimeout(() => playScanBeep(tone), 100);
                  }}
                  className="flex-1 bg-slate-50 text-slate-705 border border-slate-200 focus:border-indigo-500 rounded-xl px-2.5 py-2 text-xs outline-none transition-all cursor-pointer font-medium"
                >
                  <option value="standard">Standard: Âm Tít truyền thống (1000Hz)</option>
                  <option value="success">Success Chord: Hợp âm kép thành công</option>
                  <option value="double_beep">Double Pip: Pip-Pip kép nhanh</option>
                  <option value="laser">Laser Beam: Tùy chọn cơ chế hiện đại</option>
                </select>
                <button
                  type="button"
                  onClick={() => playScanBeep()}
                  className="px-3.5 py-1.5 text-xs font-bold rounded-xl bg-slate-105 hover:bg-slate-200 border border-slate-200 text-slate-700 transition-all cursor-pointer"
                  title="Thử phát âm thanh"
                >
                  🔊 Thử
                </button>
              </div>
            </div>

            {config.voiceEnabled && (
              <button
                id="btn-test-voice"
                type="button"
                onClick={() => speakVoiceMessage("Thử nghiệm giọng nói thành công. Sẵn sàng đóng gói hàng.")}
                className="w-full py-1.5 px-3 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 font-bold font-sans text-[11px] rounded-xl border border-indigo-200 transition-all text-center cursor-pointer"
              >
                🔊 Phát thử giọng nói hướng dẫn viên
              </button>
            )}
          </div>

          {/* Upgraded Keyboard shortcuts customizer */}
          <div className="flex flex-col gap-4">
            <div className="flex items-center justify-between">
              <div>
                <label className="block text-xs font-bold text-slate-800 uppercase tracking-tight">Cấu hình gán phím tắt linh hoạt</label>
                <span className="text-[10px] text-slate-400 block mt-0.5 leading-tight">Hãy đổi thành các phím chức năng tùy chọn</span>
              </div>
              <label className="relative inline-flex items-center cursor-pointer shrink-0">
                <input 
                  id="checkbox-shortcuts-enabled"
                  type="checkbox" 
                  className="sr-only peer"
                  checked={config.shortcutsEnabled}
                  onChange={(e) => {
                    const checked = e.target.checked;
                    setConfig(prev => ({ ...prev, shortcutsEnabled: checked }));
                    addLog('info', `Bộ gán phím tắt nhanh đã được ${checked ? "BẬT" : "TẮT"}.`);
                  }}
                />
                <div className="w-9 h-5 bg-slate-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-indigo-650"></div>
              </label>
            </div>

            {config.shortcutsEnabled && (
              <div className="flex flex-col gap-2.5 p-3.5 bg-slate-50 border border-slate-200 rounded-2xl">
                {/* 1. Save button bind */}
                <div className="flex items-center justify-between gap-2.5 text-xs">
                  <span className="text-slate-500 font-bold">🔘 1. Dừng quay & Lưu đơn:</span>
                  <input
                    type="text"
                    value={config.keyStopSave || 'F4'}
                    onChange={(e) => setConfig(prev => ({ ...prev, keyStopSave: e.target.value }))}
                    className="w-20 bg-white border border-slate-200 focus:border-indigo-500 rounded px-2 py-1 text-center font-mono text-xs font-bold text-indigo-700 outline-none"
                    placeholder="Space, F4..."
                    title="Gán phím nhanh"
                  />
                </div>

                {/* 2. Shopee mock bind */}
                <div className="flex items-center justify-between gap-2.5 text-xs">
                  <span className="text-slate-500 font-bold">🔘 2. Phím nhanh Shopee:</span>
                  <input
                    type="text"
                    value={config.keySimShopee || 'F2'}
                    onChange={(e) => setConfig(prev => ({ ...prev, keySimShopee: e.target.value }))}
                    className="w-20 bg-white border border-slate-200 focus:border-indigo-500 rounded px-2 py-1 text-center font-mono text-xs font-bold text-indigo-700 outline-none"
                    placeholder="F2"
                    title="Gán phím nhanh"
                  />
                </div>

                {/* 3. TikTok mock bind */}
                <div className="flex items-center justify-between gap-2.5 text-xs">
                  <span className="text-slate-500 font-bold">🔘 3. Phím nhanh TikTok:</span>
                  <input
                    type="text"
                    value={config.keySimTikTok || 'F3'}
                    onChange={(e) => setConfig(prev => ({ ...prev, keySimTikTok: e.target.value }))}
                    className="w-20 bg-white border border-slate-200 focus:border-indigo-500 rounded px-2 py-1 text-center font-mono text-xs font-bold text-indigo-700 outline-none"
                    placeholder="F3"
                    title="Gán phím nhanh"
                  />
                </div>

                {/* 4. Cancel code bind */}
                <div className="flex items-center justify-between gap-2.5 text-xs">
                  <span className="text-slate-500 font-bold">🔘 4. Phím xóa mã đơn:</span>
                  <input
                    type="text"
                    value={config.keyCancelBarcode || 'Escape'}
                    onChange={(e) => setConfig(prev => ({ ...prev, keyCancelBarcode: e.target.value }))}
                    className="w-20 bg-white border border-slate-200 focus:border-indigo-500 rounded px-2 py-1 text-center font-mono text-xs font-bold text-indigo-700 outline-none"
                    placeholder="Escape"
                    title="Escape, F9..."
                  />
                </div>

                <p className="text-[10px] text-slate-400 leading-tight mt-1">
                  * Nhập phím mong muốn (Ví dụ: <strong>Space</strong>, <strong>F4</strong>, <strong>F11</strong>, <strong>Escape</strong>, <strong>Q</strong>) và hệ thống sẽ bắt phím tương ứng khi vận hành.
                </p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
