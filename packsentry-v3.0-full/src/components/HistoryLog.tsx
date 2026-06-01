/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { Package, Video, Cloud, Trash2, ExternalLink, Download, Clock, HardDrive, Film, X } from 'lucide-react';
import { PackageVideo, AppConfig } from '../types';

interface HistoryLogProps {
  videos: PackageVideo[];
  config: AppConfig;
  onClearVideos: () => void;
  onDeleteVideo: (id: string) => void;
  onRenameVideo: (id: string, newBarcode: string) => void;
  onUploadCloudForce: (video: PackageVideo) => void;
  addLog: (type: 'info' | 'success' | 'warning' | 'error', message: string) => void;
}

export default function HistoryLog({
  videos,
  config,
  onClearVideos,
  onDeleteVideo,
  onRenameVideo,
  onUploadCloudForce,
  addLog
}: HistoryLogProps) {
  const [selectedVideo, setSelectedVideo] = useState<PackageVideo | null>(null);
  const [editingVideoId, setEditingVideoId] = useState<string | null>(null);
  const [editingBarcodeValue, setEditingBarcodeValue] = useState<string>('');

  const saveRename = (id: string) => {
    if (editingBarcodeValue.trim()) {
      onRenameVideo(id, editingBarcodeValue.trim());
    }
    setEditingVideoId(null);
  };

  // Stats & Filters State
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'local' | 'synced' | 'failed'>('all');
  const [platformFilter, setPlatformFilter] = useState<'all' | 'shopee' | 'tiktok' | 'lazada' | 'other'>('all');
  const [sortBy, setSortBy] = useState<'newest' | 'oldest' | 'duration' | 'size'>('newest');

  const getPlatform = (barcode: string): 'shopee' | 'tiktok' | 'lazada' | 'other' => {
    const code = barcode.toUpperCase();
    if (code.includes('SPX') || code.startsWith('SP')) return 'shopee';
    if (code.includes('TTS') || code.includes('TIK')) return 'tiktok';
    if (code.includes('LAZ') || code.includes('LZD') || code.includes('LAZADA')) return 'lazada';
    return 'other';
  };

  const getStatusBadge = (status: PackageVideo['status']) => {
    switch (status) {
      case 'synced':
        return (
          <span className="px-2.5 py-0.5 rounded-full text-[10px] font-mono bg-emerald-50 text-emerald-700 border border-emerald-200 flex items-center gap-1 font-bold">
            <Cloud size={10} />
            Đã Đồng Bộ
          </span>
        );
      case 'uploading':
        return (
          <span className="px-2.5 py-0.5 rounded-full text-[10px] font-mono bg-amber-50 text-amber-700 border border-amber-200 flex items-center gap-1 animate-pulse font-bold">
            <span className="w-1 h-1 rounded-full bg-amber-500 animate-ping" />
            Đang Tải Lên
          </span>
        );
      case 'failed':
        return (
          <span className="px-2.5 py-0.5 rounded-full text-[10px] font-mono bg-rose-50 text-rose-700 border border-rose-200 flex items-center gap-1 font-bold">
            <X size={10} />
            Lỗi đồng bộ
          </span>
        );
      case 'local':
      default:
        return (
          <span className="px-2.5 py-0.5 rounded-full text-[10px] font-mono bg-slate-100 text-slate-600 border border-slate-200 flex items-center gap-1 font-bold">
            <HardDrive size={10} />
            Chỉ lưu Máy tính
          </span>
        );
    }
  };

  // Metric Calculation
  const totalCount = videos.length;
  const syncedCount = videos.filter(v => v.status === 'synced').length;
  const localCount = videos.filter(v => v.status === 'local').length;
  const totalMB = videos.reduce((sum, v) => sum + v.sizeMB, 0).toFixed(1);

  // Filtering / Sorting logic
  const getFilteredAndSortedVideos = () => {
    let result = [...videos];

    // Filter by search query
    if (searchQuery.trim() !== '') {
      const q = searchQuery.toLowerCase().trim();
      result = result.filter(v => v.barcode.toLowerCase().includes(q));
    }

    // Filter by platform
    if (platformFilter !== 'all') {
      result = result.filter(v => getPlatform(v.barcode) === platformFilter);
    }

    // Filter by status
    if (statusFilter !== 'all') {
      result = result.filter(v => v.status === statusFilter);
    }

    // Sort
    result.sort((a, b) => {
      if (sortBy === 'newest') {
        return new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime();
      }
      if (sortBy === 'oldest') {
        return new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime();
      }
      if (sortBy === 'duration') {
        const parseSec = (dStr: string) => {
          const parts = dStr.split(':').map(Number);
          if (parts.length === 2) return parts[0] * 60 + parts[1];
          return 0;
        };
        return parseSec(b.duration) - parseSec(a.duration);
      }
      if (sortBy === 'size') {
        return b.sizeMB - a.sizeMB;
      }
      return 0;
    });

    return result;
  };

  const filteredVideos = getFilteredAndSortedVideos();

  return (
    <div className="bg-white border border-slate-200 rounded-3xl p-6 shadow-sm flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="p-1.5 rounded-lg bg-indigo-50 text-indigo-600">
            <Package size={18} />
          </span>
          <div>
            <h3 className="font-bold text-slate-800 text-sm uppercase tracking-wider">Lịch Sử Video Quay Đóng Hàng</h3>
            <p className="text-slate-400 text-[9px] uppercase font-mono mt-0.5 font-bold tracking-wider">Thống kê &amp; Tra cứu nâng cao (Real-time Audit Logs)</p>
          </div>
        </div>

        {videos.length > 0 && (
          <button
            id="btn-clear-videos"
            onClick={onClearVideos}
            className="text-xs text-rose-600 hover:text-rose-850 font-bold transition-colors cursor-pointer"
          >
            Xóa danh sách
          </button>
        )}
      </div>

      {/* METRICS DASHBOARD BANNER */}
      {videos.length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 bg-slate-50 p-4 border border-slate-150 rounded-2xl">
          <div className="flex flex-col gap-0.5 bg-white p-3 rounded-xl border border-slate-200/60 shadow-sm">
            <span className="text-[10px] text-slate-400 uppercase font-mono font-bold tracking-wider">Tổng Đơn Đã Quay</span>
            <span className="text-sm font-bold text-slate-800 mt-1 leading-none">{totalCount} đơn</span>
          </div>
          <div className="flex flex-col gap-0.5 bg-white p-3 rounded-xl border border-slate-200/60 shadow-sm">
            <span className="text-[10px] text-slate-400 uppercase font-mono font-bold tracking-wider">Đã Lên Cloud ☁</span>
            <span className="text-sm font-bold text-emerald-700 mt-1 leading-none">{syncedCount} đơn</span>
          </div>
          <div className="flex flex-col gap-0.5 bg-white p-3 rounded-xl border border-slate-200/60 shadow-sm">
            <span className="text-[10px] text-slate-400 uppercase font-mono font-bold tracking-wider">Lưu Tại Bộ Nhớ Local</span>
            <span className="text-sm font-bold text-indigo-700 mt-1 leading-none">{localCount} đơn</span>
          </div>
          <div className="flex flex-col gap-0.5 bg-white p-3 rounded-xl border border-slate-200/60 shadow-sm">
            <span className="text-[10px] text-slate-400 uppercase font-mono font-bold tracking-wider">Ước tính Dung Lượng</span>
            <span className="text-sm font-bold text-slate-800 mt-1 leading-none">{totalMB} MB</span>
          </div>
        </div>
      )}

      {/* SEARCH AND FILTERS LAYER */}
      {videos.length > 0 && (
        <div className="flex flex-col gap-2 border-b border-slate-100 pb-3">
          <div className="flex flex-col sm:flex-row gap-2">
            {/* Search input field */}
            <div className="relative flex-1">
              <input
                id="search-orders"
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="🔍 Tìm nhanh mã vận đơn..."
                className="w-full bg-slate-50 text-slate-705 border border-slate-200 focus:border-indigo-500 rounded-xl pl-3 pr-8 py-2 text-xs outline-none focus:bg-white transition-all font-mono font-bold"
              />
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => setSearchQuery('')}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 text-xs font-bold font-mono"
                >
                  ✕
                </button>
              )}
            </div>

            {/* Filter by sales channel */}
            <select
              id="filter-platform"
              value={platformFilter}
              onChange={(e) => setPlatformFilter(e.target.value as any)}
              className="bg-slate-50 text-slate-705 border border-slate-200 focus:border-indigo-500 rounded-xl px-2.5 py-2 text-xs outline-none transition-all font-medium cursor-pointer"
            >
              <option value="all">Sàn: Tất cả</option>
              <option value="shopee">Sàn: Shopee SPX</option>
              <option value="tiktok">Sàn: TikTok Shop</option>
              <option value="lazada">Sàn: Lazada</option>
              <option value="other">Sàn: Khác</option>
            </select>

            {/* Filter by status */}
            <select
              id="filter-status"
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value as any)}
              className="bg-slate-50 text-slate-705 border border-slate-200 focus:border-indigo-500 rounded-xl px-2.5 py-2 text-xs outline-none transition-all font-medium cursor-pointer"
            >
              <option value="all">Trạng thái: Tất cả</option>
              <option value="local">Chỉ lưu cục bộ</option>
              <option value="synced">Đã lên Cloud</option>
              <option value="failed">Lỗi đồng bộ</option>
            </select>

            {/* Sorting criteria */}
            <select
              id="sort-videos"
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as any)}
              className="bg-slate-50 text-slate-705 border border-slate-200 focus:border-indigo-500 rounded-xl px-3 py-2 text-xs outline-none transition-all font-medium cursor-pointer"
            >
              <option value="newest">Xếp: Mới nhất ↑</option>
              <option value="oldest">Xếp: Cũ nhất ↓</option>
              <option value="duration">Xếp: Thời lượng ↑</option>
              <option value="size">Xếp: Dung lượng ↑</option>
            </select>
          </div>
          {filteredVideos.length !== videos.length && (
            <span className="text-[10px] text-slate-400 font-mono font-medium">
              Đang hiện {filteredVideos.length} trên tổng số {videos.length} đơn hàng qua bộ lọc.
            </span>
          )}
        </div>
      )}

      {/* MAIN VIDEO LIST CONTAINER */}
      {videos.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-8 p-4 text-center bg-slate-50 rounded-2xl border border-dashed border-slate-200 min-h-[160px]">
          <div className="w-10 h-10 rounded-full bg-slate-100 flex items-center justify-center text-slate-400 mb-2">
            <Film size={20} />
          </div>
          <p className="text-slate-500 text-xs font-semibold">Chưa ghi nhận video đóng gói nào trong phiên này.</p>
          <p className="text-[11px] text-slate-400 mt-1 max-w-[280px] font-medium leading-relaxed">Quét mã đơn tại camera hoặc sử dụng "Bộ Tạo Mã Thử Nghiệm" để bắt đầu chu kỳ tự động ghi hình.</p>
        </div>
      ) : filteredVideos.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-8 p-4 text-center bg-slate-50 rounded-2xl border border-slate-200 min-h-[150px]">
          <span className="text-slate-400 text-sm">🔍 Không tìm thấy kết quả phù hợp</span>
          <p className="text-[10px] text-slate-400 mt-1">Hủy các bộ lọc tìm kiếm và thử lại.</p>
        </div>
      ) : (
        <div className="flex flex-col gap-3 max-h-[365px] overflow-y-auto pr-1">
          {filteredVideos.map((video) => (
            <div 
              key={video.id} 
              id={`video-${video.id}`}
              className="bg-slate-50 rounded-2xl border border-slate-100 p-4 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 hover:border-slate-300 hover:bg-slate-100/50 transition-all group"
            >
              <div className="flex items-start gap-3">
                {/* Visual Video Thumbnail helper */}
                <div 
                  onClick={() => video.localBlobUrl && setSelectedVideo(video)}
                  className="w-14 h-10 bg-slate-200 hover:bg-indigo-50 rounded-lg border border-slate-300 shrink-0 flex items-center justify-center text-slate-500 group-hover:text-indigo-600 group-hover:border-indigo-200 transition-all cursor-pointer relative overflow-hidden"
                >
                  <Video size={16} />
                  {/* Miniature animation on active preview */}
                  <span className="absolute bottom-0 inset-x-0 h-1 bg-slate-300 group-hover:bg-indigo-600 transition-all" />
                </div>

                <div className="flex flex-col gap-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    {editingVideoId === video.id ? (
                      <div className="flex items-center gap-1.5" onClick={(e) => e.stopPropagation()}>
                        <input
                          type="text"
                          value={editingBarcodeValue}
                          onChange={(e) => setEditingBarcodeValue(e.target.value)}
                          className="bg-white border-2 border-indigo-500 rounded px-1.5 py-0.5 text-xs font-mono font-bold text-slate-800 focus:outline-none"
                          autoFocus
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') {
                              saveRename(video.id);
                            } else if (e.key === 'Escape') {
                              setEditingVideoId(null);
                            }
                          }}
                        />
                        <button
                          onClick={() => saveRename(video.id)}
                          className="p-1 rounded bg-emerald-50 hover:bg-emerald-100 text-emerald-600 border border-emerald-200 cursor-pointer"
                          title="Lưu"
                        >
                          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                          </svg>
                        </button>
                        <button
                          onClick={() => setEditingVideoId(null)}
                          className="p-1 rounded bg-rose-50 hover:bg-rose-100 text-rose-600 border border-rose-200 cursor-pointer"
                          title="Hủy"
                        >
                          <X size={11} />
                        </button>
                      </div>
                    ) : (
                      <div className="flex items-center gap-1.5">
                        <span className="font-mono text-xs font-bold text-slate-700 group-hover:text-slate-900 transition-all truncate max-w-[150px]">
                          {video.barcode}
                        </span>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            setEditingVideoId(video.id);
                            setEditingBarcodeValue(video.barcode);
                          }}
                          className="p-1 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded transition-all cursor-pointer"
                          title="Đổi tên mã đơn hàng"
                        >
                          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                          </svg>
                        </button>
                      </div>
                    )}
                    {getStatusBadge(video.status)}
                  </div>

                  <div className="flex items-center gap-2 text-[10px] text-slate-400 font-mono font-semibold">
                    <div className="flex items-center gap-0.5">
                      <Clock size={11} />
                      <span>{video.duration}</span>
                    </div>
                    <span>•</span>
                    <span>{video.sizeMB} MB</span>
                    <span>•</span>
                    <span className="truncate max-w-[120px]">{video.timestamp}</span>
                  </div>

                  <div className="text-[9px] text-slate-400 font-mono truncate max-w-[260px] mt-0.5">
                    📁 {video.filePath}
                  </div>
                </div>
              </div>

              {/* Action Operations for each item */}
              <div className="flex flex-wrap sm:flex-nowrap gap-1.5 w-full sm:w-auto shrink-0 border-t sm:border-y-0 border-slate-200/60 pt-2 sm:pt-0 justify-end">
                {video.status === 'local' && (
                  <button
                    onClick={() => onUploadCloudForce(video)}
                    className="flex-grow sm:flex-none flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-xl bg-indigo-50 hover:bg-indigo-100 text-indigo-600 text-xs font-bold transition-all border border-indigo-100 cursor-pointer"
                  >
                    <Cloud size={12} />
                    Gửi Cloud
                  </button>
                )}

                {video.status === 'uploading' && (
                  <div className="w-16 h-1 bg-slate-200 rounded-full overflow-hidden self-center mx-2">
                    <div 
                      className="bg-indigo-600 h-full transition-all duration-300"
                      style={{ width: `${video.uploadProgress}%` }}
                    />
                  </div>
                )}

                {video.status === 'synced' && video.cloudUrl && (
                  <a
                    href={video.cloudUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="flex-grow sm:flex-grow-0 flex items-center justify-center gap-1 px-3 py-1.5 rounded-xl bg-slate-105 hover:bg-slate-200 text-slate-700 text-xs font-bold transition-all border border-slate-200"
                  >
                    <ExternalLink size={11} />
                    Link
                  </a>
                )}

                {video.localBlobUrl && (
                  <a
                    href={video.localBlobUrl}
                    download={`${video.barcode}.mp4`}
                    className="p-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-500 hover:text-slate-850 transition-all shrink-0 border border-slate-200"
                    title="Tải video về máy"
                  >
                    <Download size={13} />
                  </a>
                )}

                <button
                  onClick={() => onDeleteVideo(video.id)}
                  className="p-2 rounded-xl bg-slate-100 hover:bg-rose-50 text-slate-400 hover:text-rose-600 transition-all shrink-0 cursor-pointer border border-slate-200 hover:border-rose-100"
                  title="Xóa bản ghi"
                >
                  <Trash2 size={13} />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* 4. PLAYER COLLAPSIBLE MODAL */}
      {selectedVideo && (
        <div className="fixed inset-0 bg-slate-900/40 flex items-center justify-center z-50 p-4 backdrop-blur-sm animate-fade-in">
          <div className="bg-white border border-slate-200 rounded-3xl w-full max-w-2xl overflow-hidden shadow-2xl flex flex-col">
            <div className="p-4.5 bg-white border-b border-slate-100 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Video size={18} className="text-indigo-600" />
                <span className="font-mono text-xs font-extrabold text-slate-850 uppercase tracking-tight">XEM LẠI BẰNG CHỨNG: [ {selectedVideo.barcode} ]</span>
              </div>
              <button 
                onClick={() => setSelectedVideo(null)}
                className="text-slate-400 hover:text-slate-800 transition-all cursor-pointer p-1 rounded-full hover:bg-slate-100 animate-pulse"
              >
                <X size={18} />
              </button>
            </div>

            <div className="aspect-video bg-black flex items-center justify-center p-1 border-b border-slate-100">
              {selectedVideo.localBlobUrl ? (
                <video 
                   src={selectedVideo.localBlobUrl} 
                   controls 
                   autoPlay 
                   className="w-full h-full object-contain"
                />
              ) : (
                <div className="flex flex-col items-center justify-center text-center p-6 text-slate-500">
                  <Film size={40} className="text-slate-300 mb-2 animate-pulse" />
                  <p className="text-xs font-mono">Bản ghi camera ảo không chứa luồng Blob nhị phân thật.</p>
                  <p className="text-[10px] text-slate-400 mt-1 max-w-[280px]">Đang phát mô phỏng hoạt cảnh đóng hàng an toàn thành công...</p>
                </div>
              )}
            </div>

            <div className="p-5 bg-slate-50 text-xs text-slate-500 font-mono flex flex-col gap-2">
              <div className="flex justify-between">
                <span>📁 File cục bộ:</span>
                <span className="text-slate-700 font-bold">{selectedVideo.filePath}</span>
              </div>
              <div className="flex justify-between">
                <span>⏰ Thời gian quay:</span>
                <span className="text-slate-705 font-bold">{selectedVideo.timestamp}</span>
              </div>
              <div className="flex justify-between">
                <span>🎬 Kích thước &amp; Codec:</span>
                <span className="text-slate-705 font-bold">{selectedVideo.sizeMB} MB (H.264 / AAC)</span>
              </div>
              {selectedVideo.cloudUrl && (
                <div className="flex justify-between border-t border-slate-200/80 pt-2 mt-1">
                  <span className="text-indigo-600 font-bold">☁ URL Cloud Sync:</span>
                  <a href={selectedVideo.cloudUrl} target="_blank" rel="noreferrer" className="text-indigo-600 hover:underline flex items-center gap-1 font-bold">
                    Đi tới link công khai <ExternalLink size={12} />
                  </a>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
