/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { QrCode, Sparkles, Printer, RefreshCw } from 'lucide-react';

interface BarcodeGeneratorProps {
  onScanCode: (code: string) => void;
  addLog: (type: 'info' | 'success' | 'warning' | 'error', message: string) => void;
}

export default function BarcodeGenerator({ onScanCode, addLog }: BarcodeGeneratorProps) {
  const [text, setText] = useState<string>('SPX-VN-182902');
  const [barcodeType, setBarcodeType] = useState<'CODE128' | 'QR'>('CODE128');

  // Simple determinisic generator for mock visual barcode lines
  const getBarcodeLines = (code: string) => {
    // Generate an array of line widths (1, 2, 3, 4) based on character values
    const hash = code.split('').reduce((acc, char) => acc + char.charCodeAt(0), 17);
    const lines: number[] = [];
    let state = true; // black or white
    
    // Create ~45 zebra lines
    for (let i = 0; i < 48; i++) {
      const width = ((hash * (i + 13)) % 4) + 1; // 1 to 4px
      lines.push(width);
    }
    return lines;
  };

  const handleRandomize = () => {
    const prefixed = ['SPX-VN-', 'TTS-MX-', 'LZD-VN-', 'EMS-VN-'];
    const prefix = prefixed[Math.floor(Math.random() * prefixed.length)];
    const num = Math.floor(100000 + Math.random() * 900000);
    const newCode = `${prefix}${num}`;
    setText(newCode);
    addLog('info', `Đã sinh tự động mã barcode mới để kiểm thử: ${newCode}`);
  };

  const handleGenerateAndScan = () => {
    onScanCode(text);
    addLog('success', `Đã giả lập quét mã đơn hàng: ${text}`);
  };

  return (
    <div className="bg-white border border-slate-200 rounded-3xl p-6 shadow-sm flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="p-1.5 rounded-lg bg-indigo-50 text-indigo-600">
            <QrCode size={18} />
          </span>
          <h3 className="font-bold text-slate-800 text-sm uppercase tracking-wider">Mã đơn hàng thử nghiệm</h3>
        </div>
        <button 
          onClick={handleRandomize}
          className="flex items-center gap-1.5 text-xs text-indigo-600 hover:text-indigo-800 font-bold tracking-wide transition-colors"
        >
          <RefreshCw size={12} className="animate-spin-slow" />
          Sinh ngẫu nhiên
        </button>
      </div>

      <p className="text-xs text-slate-500 leading-relaxed font-medium">
        Bạn muốn kiểm định camera thực? Hãy gõ mã rồi đưa màn hình điện thoại/máy tính có mã vạch bên dưới trước camera thiết bị HP 5M. Hoặc bấm trực tiếp <strong>"Giả Lập Quét Mã Này Ngay"</strong> để gửi tín hiệu thẳng vào luồng xử lý tự động!
      </p>

      <div className="flex gap-2.5">
        <input
          id="input-generator-text"
          type="text"
          value={text}
          onChange={(e) => setText(e.target.value.toUpperCase())}
          className="flex-1 bg-slate-50 border border-slate-200 focus:border-indigo-500 rounded-xl px-3 py-2.5 text-xs text-slate-700 outline-none font-mono focus:bg-white transition-all"
          placeholder="Nhập mã đơn muốn tạo..."
        />
        <div className="flex bg-slate-50 rounded-xl border border-slate-200 p-1 shrink-0">
          <button
            onClick={() => setBarcodeType('CODE128')}
            className={`px-3 py-1 text-xs font-bold rounded-lg transition-all ${barcodeType === 'CODE128' ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-400 hover:text-slate-600'}`}
          >
            Barcode
          </button>
          <button
            onClick={() => setBarcodeType('QR')}
            className={`px-3 py-1 text-xs font-bold rounded-lg transition-all ${barcodeType === 'QR' ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-400 hover:text-slate-600'}`}
          >
            QR Code
          </button>
        </div>
      </div>

      {/* Visual Render Container */}
      <div className="bg-slate-50 p-5 rounded-2xl border border-slate-100 flex flex-col items-center justify-center min-h-[140px] transition-all shadow-inner">
        {barcodeType === 'CODE128' ? (
          <div className="flex flex-col items-center gap-2">
            {/* Visual Barcode bars */}
            <div className="flex items-stretch h-16 bg-white overflow-hidden p-1 rounded-lg border border-slate-100 shadow-sm">
              {/* Left quiet zone */}
              <div className="w-4 bg-white" />
              {/* Dynamically generated bar stripes */}
              {getBarcodeLines(text).map((width, idx) => (
                <div 
                  key={idx} 
                  className={`h-full ${idx % 2 === 0 ? 'bg-black' : 'bg-white'}`} 
                  style={{ width: `${width * 1.5}px` }} 
                />
              ))}
              {/* Right quiet zone */}
              <div className="w-4 bg-white" />
            </div>
            {/* Text caption below */}
            <span className="font-mono text-slate-700 font-bold text-xs tracking-wider uppercase mt-1">
              *{text}*
            </span>
          </div>
        ) : (
          <div className="flex flex-col items-center gap-2">
            {/* Simulated nice looking QR code using grid of dark/light squares */}
            <div className="w-24 h-24 bg-white p-2 flex flex-wrap content-start border border-slate-200 rounded-lg shadow-sm">
              {/* QR Finder squares or pattern blocks */}
              <div className="grid grid-cols-7 gap-0.5 w-full h-full">
                {Array.from({ length: 49 }).map((_, idx) => {
                  // Make top-left, top-right, bottom-left finders black centers
                  const row = Math.floor(idx / 7);
                  const col = idx % 7;
                  
                  // Top-Left Finder
                  if (row < 2 && col < 2) return <div key={idx} className="bg-black" />;
                  if (row === 2 && col < 3) return <div key={idx} className="bg-white" />;
                  
                  // Top-Right Finder
                  if (row < 2 && col > 4) return <div key={idx} className="bg-black" />;
                  if (row === 2 && col > 3) return <div key={idx} className="bg-white" />;
                  
                  // Bottom-Left Finder
                  if (row > 4 && col < 2) return <div key={idx} className="bg-black" />;
                  if (row === 4 && col < 3) return <div key={idx} className="bg-white" />;

                  // Rest is random noise seeded
                  const keyHash = (text.charCodeAt(0) + idx * 11) % 5;
                  return (
                    <div 
                      key={idx} 
                      className={`rounded-sm ${keyHash === 0 || keyHash === 2 ? 'bg-black' : 'bg-white'}`} 
                    />
                  );
                })}
              </div>
            </div>
            <span className="font-mono text-slate-700 font-bold text-xs tracking-wide">
              {text}
            </span>
          </div>
        )}
      </div>

      <div className="flex gap-2">
        <button
          onClick={handleGenerateAndScan}
          className="flex-1 flex items-center justify-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-2.5 px-4 rounded-xl text-xs tracking-wider transition-all active:scale-95 shadow-sm"
        >
          <Sparkles size={14} />
          GIẢ LẬP QUÉT MÃ NÀY NGAY
        </button>
      </div>
    </div>
  );
}
