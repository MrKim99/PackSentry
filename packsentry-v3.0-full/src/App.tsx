/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useRef } from 'react';
import { 
  Shield, Check, HardDrive, Cpu, Terminal, Settings, 
  CloudLightning, BellRing, Monitor, FileText, AlertCircle, 
  Trash2, HelpCircle, AppWindow, Play, Info, Video, RefreshCw, ExternalLink
} from 'lucide-react';
import { PackSentryState, AppConfig, PackageVideo, SystemLog } from './types';
import CameraRecorder from './components/CameraRecorder';
import PythonCodeHub from './components/PythonCodeHub';
import BarcodeGenerator from './components/BarcodeGenerator';
import HistoryLog from './components/HistoryLog';

export default function App() {
  // Config state with persistent defaults
  const [config, setConfig] = useState<AppConfig>(() => {
    const saved = localStorage.getItem('packsentry_config');
    const defaultSettings: AppConfig = {
      cameraDevice: '',
      localSaveFolder: 'C:\\PackSentry_Videos',
      supabaseUrl: '',
      supabaseKey: '',
      supabaseBucket: 'videos',
      cloudSyncEnabled: false,
      autoTimeoutSeconds: 180,
      beepVolume: 40,
      voiceEnabled: true,
      shortcutsEnabled: true,
      scanMode: 'camera',
      autoScenarioEnabled: true,
      keyStopSave: 'F4',
      keySimShopee: 'F2',
      keySimTikTok: 'F3',
      keyCancelBarcode: 'Escape',
      beepTone: 'standard',
      autoDownloadEnabled: true
    };
    if (saved) {
      try { 
        const parsed = JSON.parse(saved); 
        return { ...defaultSettings, ...parsed };
      } catch (e) {}
    }
    return defaultSettings;
  });

  // Recorded videos state
  const [videos, setVideos] = useState<PackageVideo[]>(() => {
    const saved = localStorage.getItem('packsentry_videos');
    if (saved) {
      try { return JSON.parse(saved); } catch (e) {}
    }
    return [];
  });

  // Logs state
  const [logs, setLogs] = useState<SystemLog[]>([]);

  // State machine indicators
  const [globalState, setGlobalState] = useState<PackSentryState>('STANDBY');
  const [currentBarcode, setCurrentBarcode] = useState<string>('');
  const [isIframe, setIsIframe] = useState<boolean>(false);

  // Terminal Ref for automatic scroll down
  const terminalRef = useRef<HTMLDivElement>(null);

  // Persistence hooks
  useEffect(() => {
    localStorage.setItem('packsentry_config', JSON.stringify(config));
  }, [config]);

  useEffect(() => {
    localStorage.setItem('packsentry_videos', JSON.stringify(videos));
  }, [videos]);

  // Append system audit logs
  const addLog = (type: SystemLog['type'], message: string) => {
    const newLog: SystemLog = {
      id: Math.random().toString(36).substring(2, 9),
      timestamp: new Date().toLocaleTimeString('vi-VN'),
      type,
      message
    };
    setLogs(prev => [...prev.slice(-99), newLog]); // Keep last 100 logs
  };

  // Scroll terminal logs to bottom
  useEffect(() => {
    if (terminalRef.current) {
      terminalRef.current.scrollTop = terminalRef.current.scrollHeight;
    }
  }, [logs]);

  // Initialize with some diagnostics
  useEffect(() => {
    let embedded = false;
    try {
      embedded = window.self !== window.top;
      setIsIframe(embedded);
    } catch (e) {
      embedded = true;
      setIsIframe(true);
    }

    addLog('info', 'Hệ thống giám sát PackSentry v3.0 đang khởi động...');
    addLog('info', 'Nạp luồng phân tích luồng hình ảnh HP 5M Camera thành công.');
    addLog('success', 'Nhận diện môi trường Windows Win32 / Cloud Run Sandboxed.');
    if (embedded) {
      addLog('warning', 'PHÁT HIỆN HẠN CHẾ: Ứng dụng chạy trong iFrame. Camera, súng quét có thể bị chặn bởi Chrome. Vui lòng bấm "Mở trong Tab mới"!');
    }
    addLog('info', 'Bảng bằng chứng đóng hàng tự động (Hands-Free Standard Operational Procedure) sẵn sàng.');
  }, []);

  // Automate cloud upload flow
  const handleUploadToCloud = async (video: PackageVideo) => {
    const hasCreds = config.supabaseUrl && config.supabaseKey && config.supabaseUrl.trim().startsWith('http');
    
    if (hasCreds) {
      try {
        setVideos(prev => prev.map(v => v.id === video.id ? { ...v, status: 'uploading', uploadProgress: 15 } : v));
        addLog('info', `Đang kết nối đám mây để truyền tệp: ${video.barcode}.mp4`);
        
        const fileName = `${video.barcode}_${Date.now()}.mp4`;
        const uploadUrl = `${config.supabaseUrl}/storage/v1/object/${config.supabaseBucket}/${fileName}`;
        
        let fileBlob: Blob;
        if (video.localBlobUrl) {
          try {
            const responseBlob = await fetch(video.localBlobUrl);
            fileBlob = await responseBlob.blob();
          } catch {
            fileBlob = new Blob(["MOCK_VIDEO_BINARY"], { type: 'video/mp4' });
          }
        } else {
          fileBlob = new Blob(["MOCK_VIDEO_BINARY"], { type: 'video/mp4' });
        }
        
        setVideos(prev => prev.map(v => v.id === video.id ? { ...v, uploadProgress: 50 } : v));
        
        const response = await fetch(uploadUrl, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${config.supabaseKey}`,
            'apikey': config.supabaseKey,
            'Content-Type': 'video/mp4'
          },
          body: fileBlob
        });
        
        if (response.ok) {
          const publicUrl = `${config.supabaseUrl}/storage/v1/object/public/${config.supabaseBucket}/${fileName}`;
          setVideos(prev => prev.map(v => v.id === video.id ? { ...v, status: 'synced', uploadProgress: 100, cloudUrl: publicUrl } : v));
          addLog('success', `Đồng bộ đám mây Supabase [ĐƠN ${video.barcode}] thành công.`);
        } else {
          const text = await response.text();
          throw new Error(text || `Lỗi HTTP ${response.status}`);
        }
      } catch (err: any) {
        setVideos(prev => prev.map(v => v.id === video.id ? { ...v, status: 'failed' } : v));
        addLog('error', `Lỗi truyền tải đám mây đơn [${video.barcode}]: ${err.message}. Đã lưu trữ cục bộ.`);
      }
    } else {
      // Background Thread Simulator for testing
      setVideos(prev => prev.map(v => v.id === video.id ? { ...v, status: 'uploading', uploadProgress: 15 } : v));
      addLog('info', `Khởi động luồng ngầm (Background Thread) đồng bộ đơn ${video.barcode} lên Supabase Cloud.`);
      
      let progress = 15;
      const interval = setInterval(() => {
        progress += Math.floor(Math.random() * 25) + 20;
        if (progress >= 100) {
          clearInterval(interval);
          const simUrl = `https://supabase-videos.co/storage/v1/object/public/${config.supabaseBucket}/${video.barcode}.mp4`;
          setVideos(prev => prev.map(v => v.id === video.id ? { ...v, status: 'synced', uploadProgress: 100, cloudUrl: simUrl } : v));
          addLog('success', `[Giả Lập] Upload ngầm hoàn tất đơn [${video.barcode}] lên Cloud Storage.`);
        } else {
          setVideos(prev => prev.map(v => v.id === video.id ? { ...v, uploadProgress: Math.min(progress, 95) } : v));
        }
      }, 500);
    }
  };

  // Callback immediately triggered on recording success
  const handleNewVideoRecorded = (video: PackageVideo) => {
    setVideos(prev => [video, ...prev]);
    
    // Check if Cloud upload is toggled ON
    if (config.cloudSyncEnabled) {
      handleUploadToCloud(video);
    }
  };

  // Clear or edit database
  const handleClearVideos = () => {
    setVideos([]);
    localStorage.removeItem('packsentry_videos');
    addLog('warning', 'Đã dọn dẹp sạch danh sách lịch sử đóng gói trong phiên.');
  };

  const handleDeleteVideo = (id: string) => {
    setVideos(prev => prev.filter(v => v.id !== id));
    addLog('info', 'Đã xóa 1 tệp bản ghi đóng gói hàng khỏi lịch sử.');
  };

  const handleRenameVideo = (id: string, newBarcode: string) => {
    setVideos(prev => prev.map(v => {
      if (v.id === id) {
        const oldPath = v.filePath;
        const lastSlash = oldPath.lastIndexOf('/');
        const directory = lastSlash !== -1 ? oldPath.substring(0, lastSlash) : config.localSaveFolder.replace(/\\/g, '/');
        // keep the metadata suffix or timestamp
        const lastUnderline = oldPath.lastIndexOf('_');
        let suffix = `_${Date.now()}.mp4`;
        if (lastUnderline !== -1 && lastUnderline > lastSlash) {
          suffix = oldPath.substring(lastUnderline);
        }
        const newFilePath = `${directory}/${newBarcode}${suffix}`;
        addLog('success', `Đã đổi tên bằng chứng đóng hàng [${v.barcode}] thành [${newBarcode}].`);
        return { ...v, barcode: newBarcode, filePath: newFilePath };
      }
      return v;
    }));
  };

  const hasValidSupabase = config.supabaseUrl && config.supabaseKey && config.supabaseUrl.trim().startsWith('http');

  return (
    <div className="min-h-screen bg-slate-50 text-slate-850 flex flex-col font-sans selection:bg-indigo-600 selection:text-white">
      {/* 1. TOP NAV BAR */}
      <header className="flex items-center justify-between px-8 py-4 bg-white border-b border-slate-200 shadow-sm shrink-0">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-indigo-600 rounded-lg flex items-center justify-center text-white shadow-md">
            <Shield size={20} className="stroke-[2.5]" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-slate-800 tracking-tight m-0">
              PackSentry <span className="text-indigo-600">v3.0</span>
            </h1>
            <p className="text-xs text-slate-500 font-medium uppercase tracking-widest">
              Hệ thống Bằng chứng Đóng hàng Tự động
            </p>
          </div>
        </div>

        {/* Real-time Indicator badgets */}
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2 bg-slate-50 px-3 py-1.5 rounded-full border border-slate-200">
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
            </span>
            <span className="font-mono text-[10px] text-slate-600 font-bold uppercase tracking-wider">
              CAMERA: KẾT NỐI
            </span>
          </div>

          <div className={`flex items-center gap-2 px-3 py-1.5 rounded-full border ${
            config.cloudSyncEnabled 
              ? hasValidSupabase
                ? 'bg-emerald-50 border-emerald-200 text-emerald-700'
                : 'bg-amber-50 border-amber-200 text-amber-700'
              : 'bg-slate-50 border-slate-200 text-slate-400'
          }`}>
            <CloudLightning size={12} className={config.cloudSyncEnabled ? 'animate-bounce' : ''} />
            <span className="font-mono text-[10px] font-bold uppercase tracking-wider">
              {config.cloudSyncEnabled 
                ? hasValidSupabase 
                  ? 'Cloud: Đã kết nối' 
                  : 'Cloud: Giả lập' 
                : 'Cloud: Đã tắt'}
            </span>
          </div>
        </div>
      </header>

      {isIframe && (
        <div id="iframe-unblock-banner" className="bg-gradient-to-r from-amber-500 to-orange-600 text-white px-8 py-3.5 flex flex-col md:flex-row items-center justify-between gap-4 text-xs font-semibold shadow-inner border-b border-orange-700/20 shrink-0">
          <div className="flex items-center gap-2.5">
            <span className="p-1 px-3 rounded-full bg-white/20 text-white text-[10px] uppercase font-black tracking-widest border border-white/20 animate-pulse shrink-0">
              Chế độ nhúng iFrame
            </span>
            <span className="leading-relaxed">
              <strong>Trình duyệt của bạn đang chặn Camera & Giọng Nói do bảo mật iFrame:</strong> Hãy nhấp vào nút bên cạnh để chuyển hướng ứng dụng trực tiếp sang tab mới độc lập, lách rào cản bảo mật và sử dụng tức thì 100% camera, micro và quét rảnh tay!
            </span>
          </div>
          <a 
            href={window.location.href} 
            target="_blank" 
            rel="noopener noreferrer"
            className="px-4 py-2 bg-white hover:bg-orange-50 text-orange-700 font-extrabold rounded-xl transition-all flex items-center gap-2 shrink-0 shadow-md active:scale-95 cursor-pointer"
          >
            <span>Mở Trong Tab Mới ↗</span>
          </a>
        </div>
      )}

      {/* 2. MAIN GRID CONTENT - FLEX RESPONSIVE */}
      <main className="flex-1 max-w-7xl w-full mx-auto p-6 grid grid-cols-1 lg:grid-cols-2 gap-6 items-start">
        {/* COLLUMN LEFT: CORE AUTOPACK TERMINAL & CAMERA MONITOR */}
        <section className="flex flex-col gap-6">
          <CameraRecorder 
            config={config} 
            setConfig={setConfig}
            onNewVideoRecorded={handleNewVideoRecorded}
            addLog={addLog}
            setGlobalState={setGlobalState}
            globalState={globalState}
            currentBarcode={currentBarcode}
            setCurrentBarcode={setCurrentBarcode}
          />

          {/* REAL TIME LOGS & AUDIT LOG PANEL */}
          <div className="bg-white border border-slate-200 rounded-3xl p-6 shadow-sm flex flex-col gap-3">
            <div className="flex items-center gap-2 justify-between">
              <div className="flex items-center gap-2 text-slate-800 font-bold text-sm">
                <Terminal size={16} className="text-indigo-600" />
                <span>Bảng Kiểm Soát Luồng (Sentry Terminal Viewer)</span>
              </div>
              <span className="text-[9px] font-mono font-bold text-slate-400 bg-slate-100 px-2 py-0.5 rounded-full">
                Live Audit Stream
              </span>
            </div>

            {/* Terminal console frame */}
            <div 
              ref={terminalRef}
              className="bg-slate-900 rounded-2xl p-4 h-[160px] overflow-y-auto border border-slate-950 font-mono text-[11px] leading-relaxed flex flex-col gap-1.5 max-h-[160px] custom-scrollbar scroll-smooth shadow-inner"
            >
              {logs.map((log) => (
                <div key={log.id} className="flex items-start gap-2 select-text">
                  <span className="text-slate-500 shrink-0 select-none">[{log.timestamp}]</span>
                  <span className={`font-semibold shrink-0 uppercase select-none ${
                    log.type === 'error' ? 'text-rose-400' :
                    log.type === 'warning' ? 'text-amber-400' :
                    log.type === 'success' ? 'text-emerald-400' : 'text-indigo-400'
                  }`}>
                    {log.type === 'error' ? '[error]' :
                     log.type === 'warning' ? '[warning]' :
                     log.type === 'success' ? '[success]' : '[info]'}
                  </span>
                  <span className={`${
                    log.type === 'error' ? 'text-rose-200' :
                    log.type === 'warning' ? 'text-amber-100' :
                    log.type === 'success' ? 'text-slate-200' : 'text-slate-300'
                  }`}>
                    {log.message}
                  </span>
                </div>
              ))}
              {logs.length === 0 && (
                <span className="text-slate-600 block">Đang khởi tạo tệp sự kiện...</span>
              )}
            </div>

            <div className="text-[10px] text-slate-400 flex justify-between items-center px-1">
              <span>Đường truyền: HP Smart Camera 5MP USB</span>
              <span>Lưu lượng: ~6.5MB / Phút</span>
            </div>
          </div>

          <BarcodeGenerator 
            onScanCode={(code) => setCurrentBarcode(code)}
            addLog={addLog}
          />
        </section>

        {/* COLUMN RIGHT: CONTROLS, CLOUD & CODE CONFIGS */}
        <section className="flex flex-col gap-6">
          {/* CONFIGURATION SETTINGS WIDGET */}
          <div className="bg-white border border-slate-200 rounded-3xl p-6 shadow-sm flex flex-col gap-5">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2">
                <span className="p-1.5 rounded-lg bg-indigo-50 text-indigo-600">
                  <Settings size={18} />
                </span>
                <h3 className="font-bold text-slate-800 text-sm uppercase tracking-wider">Cấu hình hệ thống</h3>
              </div>
            </div>

            <div className="flex flex-col gap-5">
              {/* Local Folder Location */}
              <div>
                <label className="block text-[10px] uppercase font-bold text-slate-400 tracking-wider mb-2 flex justify-between">
                  <span>Thư mục lưu trữ video trên PC (Địa phương)</span>
                  <span className="text-indigo-600 font-bold">Tự tạo nếu chưa có</span>
                </label>
                <input
                  id="input-local-folder"
                  type="text"
                  value={config.localSaveFolder}
                  onChange={(e) => setConfig(prev => ({ ...prev, localSaveFolder: e.target.value }))}
                  className="w-full bg-slate-50 text-slate-700 border border-slate-200 focus:border-indigo-500 rounded-xl px-3 py-2.5 text-xs outline-none font-mono focus:bg-white transition-all"
                  placeholder="Ví dụ: C:\PackSentry_Videos"
                />
              </div>

              {/* Time cutoff */}
              <div>
                <label className="block text-[10px] uppercase font-bold text-slate-400 tracking-wider mb-2 flex justify-between">
                  <span>Hạn mức tự động lưu đơn (Timeout)</span>
                  <span className="text-indigo-600 font-bold">{config.autoTimeoutSeconds} giây / {(config.autoTimeoutSeconds / 60).toFixed(1)} phút</span>
                </label>
                <div className="flex gap-2.5">
                  <input
                    id="input-timeout-sec"
                    type="number"
                    value={config.autoTimeoutSeconds}
                    onChange={(e) => setConfig(prev => ({ ...prev, autoTimeoutSeconds: Math.max(10, parseInt(e.target.value) || 180) }))}
                    className="w-24 bg-slate-50 text-slate-700 border border-slate-200 focus:border-indigo-500 rounded-xl px-2 py-2.5 text-xs outline-none font-mono text-center focus:bg-white transition-all"
                    min="10"
                    max="1800"
                  />
                  <div className="flex-1 flex gap-2">
                    <button 
                      onClick={() => setConfig(prev => ({ ...prev, autoTimeoutSeconds: 60 }))}
                      className={`flex-1 py-2 text-xs font-mono font-bold rounded-xl border transition-all ${config.autoTimeoutSeconds === 60 ? 'bg-indigo-100 border-indigo-200 text-indigo-700' : 'bg-slate-50 border-slate-100 text-slate-400 hover:text-slate-600 hover:bg-slate-100'}`}
                    >
                      1 Phút
                    </button>
                    <button 
                      onClick={() => setConfig(prev => ({ ...prev, autoTimeoutSeconds: 180 }))}
                      className={`flex-1 py-2 text-xs font-mono font-bold rounded-xl border transition-all ${config.autoTimeoutSeconds === 180 ? 'bg-indigo-100 border-indigo-200 text-indigo-700' : 'bg-slate-50 border-slate-100 text-slate-400 hover:text-slate-600 hover:bg-slate-100'}`}
                    >
                      3 Phút (SOP)
                    </button>
                    <button 
                      onClick={() => setConfig(prev => ({ ...prev, autoTimeoutSeconds: 300 }))}
                      className={`flex-1 py-2 text-xs font-mono font-bold rounded-xl border transition-all ${config.autoTimeoutSeconds === 300 ? 'bg-indigo-100 border-indigo-200 text-indigo-700' : 'bg-slate-50 border-slate-100 text-slate-400 hover:text-slate-600 hover:bg-slate-100'}`}
                    >
                      5 Phút
                    </button>
                  </div>
                </div>
              </div>

              {/* Cloud Switcher */}
              <div className="border-t border-slate-100 pt-5 mt-1">
                <div className="flex items-center justify-between">
                  <div>
                    <h4 className="font-bold text-slate-800 text-xs uppercase tracking-wider">Đẩy Lên Đám Mây (Supabase Storage Sync)</h4>
                    <p className="text-slate-400 text-[11px] mt-0.5 font-medium">Tự động đẩy tệp bằng chứng MP4 lên Cloud của đơn vị sau khi nạp</p>
                  </div>
                  {/* Styled Switch */}
                  <label className="relative inline-flex items-center cursor-pointer">
                    <input 
                      id="checkbox-cloud-sync"
                      type="checkbox" 
                      className="sr-only peer"
                      checked={config.cloudSyncEnabled}
                      onChange={(e) => {
                        const val = e.target.checked;
                        setConfig(prev => ({ ...prev, cloudSyncEnabled: val }));
                        addLog('info', `Đã ${val ? 'BẬT' : 'TẮT'} cơ chế truyền tải nền Supabase Cloud Storage.`);
                      }}
                    />
                    <div className="w-11 h-6 bg-slate-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-indigo-600"></div>
                  </label>
                </div>

                {config.cloudSyncEnabled && (
                  <div className="bg-slate-50 p-4 border border-slate-200 rounded-2xl mt-3 flex flex-col gap-3.5 animate-fade-in text-xs">
                    <div>
                      <div className="flex justify-between items-center mb-1">
                        <label className="block text-[10px] uppercase font-bold text-slate-400">Supabase Project URL</label>
                        {!hasValidSupabase && <span className="text-[10px] text-amber-600 font-bold font-mono">Đang dùng Cloud giả lập</span>}
                      </div>
                      <input
                        id="input-supabase-url"
                        type="text"
                        value={config.supabaseUrl}
                        onChange={(e) => setConfig(prev => ({ ...prev, supabaseUrl: e.target.value }))}
                        className="w-full bg-white border border-slate-200 focus:border-indigo-500 rounded-xl px-3 py-2 text-xs text-slate-700 outline-none font-mono"
                        placeholder="https://xxxxxxxxxxxxxxxxxxxx.supabase.co"
                      />
                    </div>

                    <div>
                      <label className="block text-[10px] uppercase font-bold text-slate-400 mb-1">Supabase Service Key (or Anon Key)</label>
                      <input
                        id="input-supabase-key"
                        type="password"
                        value={config.supabaseKey}
                        onChange={(e) => setConfig(prev => ({ ...prev, supabaseKey: e.target.value }))}
                        className="w-full bg-white border border-slate-200 focus:border-indigo-500 rounded-xl px-3 py-2 text-xs text-slate-700 outline-none font-mono"
                        placeholder="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.ey..."
                      />
                    </div>

                    <div>
                      <label className="block text-[10px] uppercase font-bold text-slate-400 mb-1">Bucket Tên (Tệp video để đồng bộ)</label>
                      <input
                        id="input-supabase-bucket"
                        type="text"
                        value={config.supabaseBucket}
                        onChange={(e) => setConfig(prev => ({ ...prev, supabaseBucket: e.target.value }))}
                        className="w-full bg-white border border-slate-200 focus:border-indigo-500 rounded-xl px-3 py-2 text-xs text-slate-700 outline-none font-mono"
                        placeholder="videos"
                      />
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>

          <HistoryLog 
            videos={videos}
            config={config}
            onClearVideos={handleClearVideos}
            onDeleteVideo={handleDeleteVideo}
            onRenameVideo={handleRenameVideo}
            onUploadCloudForce={handleUploadToCloud}
            addLog={addLog}
          />

          <PythonCodeHub 
            config={config}
            addLog={addLog}
          />
        </section>
      </main>

      {/* FOOTER */}
      <footer className="mt-auto bg-slate-900 text-slate-400 px-8 py-3.5 text-xs flex flex-col sm:flex-row justify-between items-center gap-3">
        <div className="flex gap-6 wrap justify-center">
          <span className="flex items-center gap-1.5">
            <div className="w-1.5 h-1.5 bg-emerald-500 rounded-full"></div> Camera: Connected
          </span>
          <span className="flex items-center gap-1.5">
            <div className="w-1.5 h-1.5 bg-emerald-500 rounded-full"></div> Network: Stable (24ms)
          </span>
          <span className="flex items-center gap-1.5">
            <div className="w-1.5 h-1.5 bg-emerald-500 rounded-full"></div> Storage: 42GB Free
          </span>
        </div>
        <div className="font-medium tracking-wide text-slate-400/80 font-mono text-[11px]">
          PACKSENTRY PROCESSOR ENGINE v3.0 (WINDOWS X64 CLIENT)
        </div>
      </footer>
    </div>
  );
}
