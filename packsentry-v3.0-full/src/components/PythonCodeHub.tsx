/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { Terminal, Copy, Check, Download, Eye, BookOpen, ShieldAlert, Cpu, Database } from 'lucide-react';
import { AppConfig } from '../types';

interface PythonCodeHubProps {
  config: AppConfig;
  addLog: (type: 'info' | 'success' | 'warning' | 'error', message: string) => void;
}

export default function PythonCodeHub({ config, addLog }: PythonCodeHubProps) {
  const [copied, setCopied] = useState<boolean>(false);
  const [activeTab, setActiveTab] = useState<'code' | 'install' | 'exe' | 'trouble' | 'supabase'>('code');

  const sanitizePath = (path: string) => {
    return path.replace(/\\/g, '\\\\');
  };

  const getPythonCode = () => {
    return `import os
import sys
import time
import datetime
import threading
from pyzbar.pyzbar import decode
import numpy as np
import cv2
import requests

# PyQt5 GUI Imports
from PyQt5.QtWidgets import (QApplication, QMainWindow, QWidget, QVBoxLayout, 
                             QHBoxLayout, QLabel, QLineEdit, QPushButton, 
                             QFileDialog, QCheckBox, QGroupBox, QStatusBar, 
                             QMessageBox, QSpinBox, QComboBox, QTableWidget, 
                             QTableWidgetItem, QHeaderView, QPlainTextEdit, QScrollArea)
from PyQt5.QtCore import QThread, pyqtSignal, Qt, QTimer
from PyQt5.QtGui import QImage, QPixmap, QFont

# Thiết lập Windows Beep âm thanh "Tít" mặc định không cần bộ thư viện ngoài
try:
    import winsound
    def play_beep():
        winsound.Beep(1000, 250) # 1000Hz trong 250ms
except ImportError:
    def play_beep():
        print("\\\a", end="") # Fallback hệ thống bíp âm thanh khác

# =========================================================================
# CẤU HÌNH LIÊN KẾT HỆ THỐNG MẶC ĐỊNH SƠ KHỞI (ĐỒNG BỘ PHÍA WEB)
# =========================================================================
DEFAULT_SAVE_DIR = r"${config.localSaveFolder}"
AUTO_TIMEOUT_SECONDS = ${config.autoTimeoutSeconds}

# Cấu hình kết nối đồng bộ đám mây Supabase ban đầu
INITIAL_SUPABASE_URL = "${config.supabaseUrl || 'https://xxxxxxxxxxxxxxxxxxxx.supabase.co'}"
INITIAL_SUPABASE_KEY = "${config.supabaseKey || ''}"
INITIAL_SUPABASE_BUCKET = "${config.supabaseBucket || 'videos'}"
CLOUD_UPLOAD_ENABLED = ${config.cloudSyncEnabled ? 'True' : 'False'}


class SupabaseUploadThread(QThread):
    """
    Luồng chạy ngầm Upload file video lên Supabase Storage 
    để không gây hiện tượng đơ/lag giao diện đóng gói của nhân viên.
    """
    finished_signal = pyqtSignal(str, bool, str, int) # file_path, success, message, row_idx

    def __init__(self, file_path, barcode, url, key, bucket, row_idx=-1):
        super().__init__()
        self.file_path = file_path
        self.barcode = barcode
        self.url = url
        self.key = key
        self.bucket = bucket
        self.row_idx = row_idx

    def run(self):
        if not self.url or "your-project" in self.url or "xxxxxx" in self.url or not self.key:
            self.finished_signal.emit(self.file_path, False, "Chưa cấu hình Supabase URL/Key chính xác.", self.row_idx)
            return

        try:
            filename = os.path.basename(self.file_path)
            # Endpoint chuẩn RESTful Storage của Supabase
            endpoint = f"{self.url}/storage/v1/object/{self.bucket}/{filename}"
            
            headers = {
                "Authorization": f"Bearer {self.key}",
                "ApiKey": self.key,
                "Content-Type": "video/mp4"
            }

            with open(self.file_path, "rb") as f:
                file_data = f.read()

            response = requests.post(endpoint, headers=headers, data=file_data, timeout=30)
            
            if response.status_code == 200:
                self.finished_signal.emit(self.file_path, True, "Upload đám mây thành công!", self.row_idx)
            else:
                self.finished_signal.emit(
                    self.file_path, 
                    False, 
                    f"HTTP {response.status_code}: {response.text}", 
                    self.row_idx
                )
        except Exception as e:
            self.finished_signal.emit(self.file_path, False, f"Lỗi kết nối mạng: {str(e)}", self.row_idx)


class CameraDaemonThread(QThread):
    """
    Luồng xử lý Camera trực tiếp bóc tách khung hình (Frame Extraction)
    và nhận diện mã vạch Barcode/QR liên tục.
    """
    frame_signal = pyqtSignal(np.ndarray)
    barcode_scanned_signal = pyqtSignal(str)

    def __init__(self, camera_index=0):
        super().__init__()
        self.camera_index = camera_index
        self.running = True
        self.recording = False
        
        # Cấu hình codec & VideoWriter
        self.out_video = None
        self.frame_size = (1280, 720) # Độ phân giải HP Camera 5M chuẩn HD/FHD
        self.fps = 20.0

    def run(self):
        cap = cv2.VideoCapture(self.camera_index, cv2.CAP_DSHOW) # Thêm DSHOW giúp tối ưu mượt trên Windows
        cap.set(cv2.CAP_PROP_FRAME_WIDTH, self.frame_size[0])
        cap.set(cv2.CAP_PROP_FRAME_HEIGHT, self.frame_size[1])

        last_scanned = ""
        last_scan_time = 0

        while self.running:
            ret, frame = cap.read()
            if not ret:
                time.sleep(0.01)
                continue

            # 1. Phát tín hiệu hiển thị khung hình tươi lên GUI
            self.frame_signal.emit(frame)

            # 2. Quét & giải mã mã vạch tự động (giới hạn thời gian cooldown 3 giây)
            current_time = time.time()
            if current_time - last_scan_time > 3.0:
                decoded_codes = decode(frame)
                if decoded_codes:
                    for obj in decoded_codes:
                        barcode_str = obj.data.decode('utf-8').strip()
                        if barcode_str:
                            last_scan_time = current_time
                            self.barcode_scanned_signal.emit(barcode_str)
                            break # Chỉ nhận 1 mã vạch đầu tiên trong frame

            # 3. Tiến hành ghi đè video cục bộ từng frame nếu đang kích hoạt chế độ RECORDING
            if self.recording and self.out_video is not None:
                self.out_video.write(frame)

        # Giải phóng tài nguyên camera khi tắt ứng dụng
        if self.out_video is not None:
            self.out_video.release()
        cap.release()

    def start_recording(self, file_path):
        # Thiết tệp video nén chuẩn MP4V
        fourcc = cv2.VideoWriter_fourcc(*'mp4v')
        self.out_video = cv2.VideoWriter(file_path, fourcc, self.fps, self.frame_size)
        self.recording = True

    def stop_recording(self):
        self.recording = False
        if self.out_video is not None:
            time.sleep(0.1) # Độ trễ nhỏ tránh thiếu frame cuối
            self.out_video.release()
            self.out_video = None


class PackSentryWindow(QMainWindow):
    """
    Giao diện điều khiển trung tâm Modern Dark Slate Theme
    Thiết kế tinh gọn, đẳng cấp, đầy đủ 100% chức năng ngang hàng bản Web.
    """
    def __init__(self):
        super().__init__()
        self.setWindowTitle("PackSentry v3.0 - Đăng ký Kiểm soát & Bằng Chứng Đóng Hàng Tự Động")
        self.setGeometry(50, 50, 1250, 850)
        
        # Các trạng thái hoạt động
        self.current_state = "STANDBY"
        self.current_barcode = ""
        self.recording_start_time = 0
        self.auto_timeout_seconds = AUTO_TIMEOUT_SECONDS
        self.save_directory = DEFAULT_SAVE_DIR
        self.active_file_path = None
        self.history_records = []
        
        # Tạo thư mục lưu trữ cục bộ nếu chưa có sẵn (Cơ chế Fallback an toàn)
        try:
            if not os.path.exists(self.save_directory):
                os.makedirs(self.save_directory)
        except Exception:
            # Fallback sang ổ đĩa C
            self.save_directory = r"C:\\PackSentry_Videos"
            try:
                if not os.path.exists(self.save_directory):
                    os.makedirs(self.save_directory)
            except Exception:
                # Fallback sang thư mục Home User
                self.save_directory = os.path.join(os.path.expanduser("~"), "PackSentry_Videos")
                try:
                    if not os.path.exists(self.save_directory):
                        os.makedirs(self.save_directory)
                except Exception as e:
                    print(f"Không thể tạo thư mục lưu video tự động: {e}")

        # CSS Styling - Premium Dark Sentry Theme phong cách nhà kho hiện đại sắc nét
        self.apply_clean_minimalist_theme()

        # Cấu hình Layout Widget
        self.init_interface_layout()

        # Tạo luồng Camera ngầm định vị camera nguồn 0 mặc định
        self.camera_thread = CameraDaemonThread(camera_index=0)
        self.camera_thread.frame_signal.connect(self.update_image)
        self.camera_thread.barcode_scanned_signal.connect(self.on_barcode_scanned)
        self.camera_thread.start()

        # Khởi tạo bộ đếm thời gian
        self.timer = QTimer()
        self.timer.timeout.connect(self.update_packing_timer)
        self.timer.start(1000)

        self.log_message("Hệ thống PackSentry v3.0 Desktop Client đã sẵn sàng hoạt động.")

    def apply_clean_minimalist_theme(self):
        self.setStyleSheet(\"\"\"
            QMainWindow {
                background-color: #0b0f19;
            }
            QWidget#mainCentral {
                background-color: #0b0f19;
            }
            QGroupBox {
                font-family: 'Segoe UI', Arial, sans-serif;
                font-size: 11px;
                font-weight: bold;
                color: #f1f5f9;
                border: 1.5px solid #1e293b;
                border-radius: 12px;
                margin-top: 10px;
                padding-top: 15px;
                background-color: #0f172a;
            }
            QGroupBox::title {
                subcontrol-origin: margin;
                subcontrol-position: top left;
                left: 15px;
                padding: 2px 8px;
                background-color: #0b0f19;
                color: #38bdf8;
                border-radius: 4px;
            }
            QLabel {
                font-family: 'Segoe UI', sans-serif;
                font-size: 11px;
                color: #94a3b8;
            }
            QLineEdit, QComboBox, QSpinBox {
                font-family: 'Segoe UI', 'Consolas', monospace;
                font-size: 11px;
                background-color: #020617;
                border: 1px solid #1e293b;
                border-radius: 6px;
                padding: 6px 10px;
                color: #38bdf8;
            }
            QLineEdit:focus, QSpinBox:focus {
                border: 1.5px solid #38bdf8;
                background-color: #090d16;
            }
            QPushButton {
                font-family: 'Segoe UI', sans-serif;
                font-size: 11px;
                font-weight: bold;
                color: #f1f5f9;
                background-color: #1e293b;
                border: 1px solid #334155;
                border-radius: 6px;
                padding: 6px 12px;
            }
            QPushButton:hover {
                background-color: #334155;
                border-color: #475569;
            }
            QPushButton:pressed {
                background-color: #0f172a;
            }
            QPushButton#primaryAction {
                color: #ffffff;
                background-color: #3b82f6;
                border: 1px solid #2563eb;
            }
            QPushButton#primaryAction:hover {
                background-color: #2563eb;
            }
            QPushButton#dangerAction {
                color: #ffffff;
                background-color: #ef4444;
                border: 1px solid #dc2626;
            }
            QPushButton#dangerAction:hover {
                background-color: #dc2626;
            }
            QPushButton#quickBtn {
                font-size: 10px;
                padding: 3px 6px;
                background-color: #0f172a;
            }
            QTableWidget {
                background-color: #020617;
                border: 1px solid #1e293b;
                gridline-color: #1e293b;
                border-radius: 8px;
                color: #f1f5f9;
            }
            QHeaderView::section {
                background-color: #0f172a;
                padding: 6px;
                font-weight: bold;
                border: none;
                border-bottom: 2px solid #334155;
                color: #94a3b8;
            }
            QScrollBar:vertical {
                border: none;
                background: #020617;
                width: 8px;
                margin: 0px;
            }
            QScrollBar::handle:vertical {
                background: #1e293b;
                border-radius: 4px;
            }
            QScrollBar::handle:vertical:hover {
                background: #334155;
            }
        \"\"\")

    def init_interface_layout(self):
        # Widget trung tâm
        central_widget = QWidget()
        central_widget.setObjectName("mainCentral")
        self.setCentralWidget(central_widget)

        # Main Layout chia ngang
        main_layout = QHBoxLayout(central_widget)
        main_layout.setContentsMargins(15, 15, 15, 15)
        main_layout.setSpacing(15)

        # =========================================================================
        # CỘT TRÁI: CAMERA MONITOR & BẢNG TRẠNG THÁI REAL-TIME
        # =========================================================================
        left_column = QVBoxLayout()
        left_column.setSpacing(12)

        # 1. Box Camera Live
        camera_box = QGroupBox("MÀN HÌNH GIÁM SÁT SENTRY CAMERA (USB DEVICE)")
        camera_box_layout = QVBoxLayout(camera_box)
        camera_box_layout.setContentsMargins(10, 10, 10, 10)

        self.image_label = QLabel()
        self.image_label.setMinimumSize(640, 440)
        self.image_label.setStyleSheet("background-color: #020617; border-radius: 8px; border: 1px solid #1e293b;")
        self.image_label.setAlignment(Qt.AlignCenter)
        camera_box_layout.addWidget(self.image_label)
        left_column.addWidget(camera_box, stretch=4)

        # 2. Card Trạng Thái Cực Đại (Bảng Sentry Live Monitor)
        status_box = QGroupBox("BẢNG ĐIỀU KHIỂN & TRẠNG THÁI TIẾN TRÌNH ĐÓNG GÓI")
        status_layout = QVBoxLayout(status_box)
        status_layout.setSpacing(8)

        # Hàng mã đơn hàng và Đếm thời gian
        sentry_header_row = QHBoxLayout()
        
        lbl_barcode_tag = QLabel("ĐƠN HÀNG:")
        lbl_barcode_tag.setFont(QFont("Segoe UI", 11, QFont.Bold))
        lbl_barcode_tag.setStyleSheet("color: #64748b;")
        sentry_header_row.addWidget(lbl_barcode_tag)

        self.current_barcode_lbl = QLabel("CHƯA CÓ ĐƠN")
        self.current_barcode_lbl.setFont(QFont("Consolas", 22, QFont.Bold))
        self.current_barcode_lbl.setStyleSheet("color: #38bdf8;") # Xanh dương nổi bật
        sentry_header_row.addWidget(self.current_barcode_lbl, stretch=1)

        self.time_counter_lbl = QLabel("00:00")
        self.time_counter_lbl.setFont(QFont("Consolas", 24, QFont.Bold))
        self.time_counter_lbl.setStyleSheet("color: #ef4444;") # Đỏ báo hiệu
        sentry_header_row.addWidget(self.time_counter_lbl)

        status_layout.addLayout(sentry_header_row)

        # Thanh trạng thái có nền màu cảnh báo trực quan
        self.status_banner_lbl = QLabel("HỆ THỐNG ĐANG STANDBY - SẴN SÀNG QUÉT MÃ VẠCH ĐỂ ĐÓNG HÀNG")
        self.status_banner_lbl.setFont(QFont("Segoe UI", 10, QFont.Bold))
        self.status_banner_lbl.setStyleSheet(\"\"\"
            background-color: #064e3b;
            color: #10b981;
            border: 1px solid #065f46;
            padding: 8px;
            border-radius: 6px;
        \"\"\")
        self.status_banner_lbl.setAlignment(Qt.AlignCenter)
        status_layout.addWidget(self.status_banner_lbl)

        # Nút dứt điểm đóng đơn thủ công dự phòng
        status_btn_row = QHBoxLayout()
        self.force_stop_btn = QPushButton("LƯU THỦ CÔNG / HOÀN TẤT ĐƠN NÀY (Hạ cờ ghi hình)")
        self.force_stop_btn.setObjectName("dangerAction")
        self.force_stop_btn.setFont(QFont("Segoe UI", 10, QFont.Bold))
        self.force_stop_btn.clicked.connect(self.force_finish_current_order)
        status_btn_row.addWidget(self.force_stop_btn)
        status_layout.addLayout(status_btn_row)

        left_column.addWidget(status_box, stretch=1)
        main_layout.addLayout(left_column, stretch=3)

        # =========================================================================
        # CỘT PHẢI: CHI TIẾT CẤU HÌNH, THIẾT BỊ GIẢ LẬP, NHẬT KÝ & LỊCH SỬ VIDEO
        # =========================================================================
        right_column = QVBoxLayout()
        right_column.setSpacing(12)

        # Khởi tạo thanh cuộn cuộn mướt cho bảng cài đặt bên phải nếu quá dài
        scroll_area = QScrollArea()
        scroll_area.setWidgetResizable(True)
        scroll_area.setStyleSheet("QScrollArea { border: none; background-color: transparent; }")
        
        right_container = QWidget()
        right_container.setStyleSheet("background-color: transparent;")
        right_container_layout = QVBoxLayout(right_container)
        right_container_layout.setContentsMargins(0, 0, 0, 0)
        right_container_layout.setSpacing(12)

        # 1. Thẻ Cấu hình hệ thống & Supabase
        config_box = QGroupBox("CẤU HÌNH HỆ THỐNG & ĐỒNG BỘ ĐÁM MÂY")
        config_lay = QVBoxLayout(config_box)
        config_lay.setSpacing(10)

        # Thư mục lưu
        dir_lay = QHBoxLayout()
        dir_lay.addWidget(QLabel("Thư mục lưu PC:"))
        self.dir_input = QLineEdit(self.save_directory)
        self.dir_input.setReadOnly(True)
        dir_lay.addWidget(self.dir_input)
        btn_dir = QPushButton("Duyệt...")
        btn_dir.clicked.connect(self.select_folder)
        dir_lay.addWidget(btn_dir)
        config_lay.addLayout(dir_lay)

        # Cài đặt Timeout gia đoạn tự động lưu
        timeout_lay = QHBoxLayout()
        timeout_lay.addWidget(QLabel("Hạn mức tự động lưu:"))
        self.timeout_spin = QSpinBox()
        self.timeout_spin.setRange(10, 1800)
        self.timeout_spin.setValue(self.auto_timeout_seconds)
        self.timeout_spin.setSuffix(" giây")
        self.timeout_spin.valueChanged.connect(self.on_timeout_changed)
        timeout_lay.addWidget(self.timeout_spin)
        
        # preset buttons
        btn_1m = QPushButton("1M")
        btn_1m.setObjectName("quickBtn")
        btn_1m.clicked.connect(lambda: self.timeout_spin.setValue(60))
        btn_3m = QPushButton("3M")
        btn_3m.setObjectName("quickBtn")
        btn_3m.clicked.connect(lambda: self.timeout_spin.setValue(180))
        btn_5m = QPushButton("5M")
        btn_5m.setObjectName("quickBtn")
        btn_5m.clicked.connect(lambda: self.timeout_spin.setValue(300))
        
        timeout_lay.addWidget(btn_1m)
        timeout_lay.addWidget(btn_3m)
        timeout_lay.addWidget(btn_5m)
        config_lay.addLayout(timeout_lay)

        # Cổng chọn camera thiết bị
        cam_lay = QHBoxLayout()
        cam_lay.addWidget(QLabel("Chọn Camera Intel/HP:"))
        self.camera_combo = QComboBox()
        self.camera_combo.addItem("Camera Smart-Cam (Cổng 0)", 0)
        self.camera_combo.addItem("Camera Ngoài 1 (Cổng 1)", 1)
        self.camera_combo.addItem("Camera Ngoài 2 (Cổng 2)", 2)
        self.camera_combo.currentIndexChanged.connect(self.on_camera_combo_changed)
        cam_lay.addWidget(self.camera_combo, stretch=1)
        config_lay.addLayout(cam_lay)

        # Toggle đồng bộ mây
        self.cloud_check = QCheckBox("Tự động đồng bộ lên Supabase Cloud Storage")
        self.cloud_check.setChecked(CLOUD_UPLOAD_ENABLED)
        config_lay.addWidget(self.cloud_check)

        # Group con: Thông tin Supabase
        sb_group = QWidget()
        sb_group_lay = QVBoxLayout(sb_group)
        sb_group_lay.setContentsMargins(0, 0, 0, 0)
        sb_group_lay.setSpacing(6)

        sb_url_lay = QHBoxLayout()
        sb_url_lay.addWidget(QLabel("URL:") , stretch=1)
        self.sb_url_input = QLineEdit(INITIAL_SUPABASE_URL)
        sb_url_lay.addWidget(self.sb_url_input, stretch=4)
        sb_group_lay.addLayout(sb_url_lay)

        sb_key_lay = QHBoxLayout()
        sb_key_lay.addWidget(QLabel("Key:") , stretch=1)
        self.sb_key_input = QLineEdit(INITIAL_SUPABASE_KEY)
        self.sb_key_input.setEchoMode(QLineEdit.Password)
        sb_key_lay.addWidget(self.sb_key_input, stretch=4)
        sb_group_lay.addLayout(sb_key_lay)

        sb_bucket_lay = QHBoxLayout()
        sb_bucket_lay.addWidget(QLabel("Bucket:") , stretch=1)
        self.sb_bucket_input = QLineEdit(INITIAL_SUPABASE_BUCKET)
        sb_bucket_lay.addWidget(self.sb_bucket_input, stretch=4)
        sb_group_lay.addLayout(sb_bucket_lay)

        config_lay.addWidget(sb_group)
        right_container_layout.addWidget(config_box)

        # 2. Thẻ Bộ giả lập quét mã (Shopee, Lazada, Tiktok)
        sim_box = QGroupBox("BỘ GIẢ LẬP TÍN HIỆU QUÉT MÃ BARCODE (TESTING)")
        sim_lay = QVBoxLayout(sim_box)
        sim_lay.setSpacing(8)

        # Các nhãn nút quét nhanh
        quick_scans_lay = QHBoxLayout()
        btn_sim_shopee = QPushButton("🎯 Shopee SPX")
        btn_sim_shopee.clicked.connect(self.simulate_scan_shopee)
        btn_sim_tiktok = QPushButton("🎯 TikTok Shop")
        btn_sim_tiktok.clicked.connect(self.simulate_scan_tiktok)
        btn_sim_lazada = QPushButton("🎯 Lazada LZD")
        btn_sim_lazada.clicked.connect(self.simulate_scan_lazada)
        
        quick_scans_lay.addWidget(btn_sim_shopee)
        quick_scans_lay.addWidget(btn_sim_tiktok)
        quick_scans_lay.addWidget(btn_sim_lazada)
        sim_lay.addLayout(quick_scans_lay)

        # Nhập thủ công mã bất kỳ
        manual_scan_lay = QHBoxLayout()
        self.sim_input = QLineEdit()
        self.sim_input.setPlaceholderText("Nhập mã vận đơn thủ công...")
        manual_scan_lay.addWidget(self.sim_input, stretch=2)
        btn_sim_custom = QPushButton("GIẢ LẬP QUÉT")
        btn_sim_custom.setObjectName("primaryAction")
        btn_sim_custom.clicked.connect(self.simulate_scan_custom)
        manual_scan_lay.addWidget(btn_sim_custom, stretch=1)
        sim_lay.addLayout(manual_scan_lay)

        right_container_layout.addWidget(sim_box)

        # 3. Lịch sử đóng hàng trong phiên (Table list thiết yếu)
        history_box = QGroupBox("DANH SÁCH VIDEO ĐÃ ĐÓNG GÓI TRONG PHIÊN THỜI GIAN THỰC")
        history_lay = QVBoxLayout(history_box)
        
        self.history_table = QTableWidget()
        self.history_table.setColumnCount(6)
        self.history_table.setHorizontalHeaderLabels(["Mã Vận Đơn", "Thời Gian", "Thời Lượng", "Nặng", "Trạng Thái", "Thao Tác"])
        self.history_table.horizontalHeader().setSectionResizeMode(QHeaderView.Stretch)
        self.history_table.horizontalHeader().setSectionResizeMode(0, QHeaderView.ResizeToContents)
        self.history_table.horizontalHeader().setSectionResizeMode(4, QHeaderView.ResizeToContents)
        self.history_table.setMinimumHeight(180)
        history_lay.addWidget(self.history_table)

        right_container_layout.addWidget(history_box)

        # 4. Nhật ký hoạt động chung dạng textbox scrollable
        log_box = QGroupBox("NHẬT KÝ KIỂM SOÁT HỆ THỐNG TRONG PHIÊN (SYSTEM LOGS)")
        log_box_lay = QVBoxLayout(log_box)
        
        self.log_viewer = QPlainTextEdit()
        self.log_viewer.setReadOnly(True)
        self.log_viewer.setMinimumHeight(120)
        self.log_viewer.setStyleSheet(\"\"\"
            background-color: #020617;
            color: #38bdf8;
            font-family: 'Consolas', monospace;
            font-size: 10px;
            border: 1px solid #1e293b;
            border-radius: 6px;
        \"\"\")
        log_box_lay.addWidget(self.log_viewer)
        right_container_layout.addWidget(log_box)

        scroll_area.setWidget(right_container)
        right_column.addWidget(scroll_area)
        main_layout.addLayout(right_column, stretch=2)

        # Thiết lập Bottom Status Bar
        self.statusBar = QStatusBar()
        self.setStatusBar(self.statusBar)
        self.statusBar.showMessage("Chờ tín hiệu quét vận đơn...")
        self.statusBar.setStyleSheet("color: #64748b; font-family: 'Segoe UI'; font-size: 11px;")

    def select_folder(self):
        selected = QFileDialog.getExistingDirectory(self, "Chọn thư mục lưu trữ Video đóng hàng")
        if selected:
            self.save_directory = selected
            self.dir_input.setText(selected)
            self.log_message(f"Thay đổi thư mục lưu: {selected}")

    def on_timeout_changed(self, value):
        self.auto_timeout_seconds = value
        self.log_message(f"Hạn mức tự động đóng gói điều chỉnh thành: {value} giây")

    def log_message(self, text):
        timestamp = datetime.datetime.now().strftime("%H:%M:%S")
        log_line = f"[{timestamp}] {text}"
        self.log_viewer.appendPlainText(log_line)
        self.statusBar.showMessage(text)

    # ------------------ PHƯƠNG THỨC XỬ LÝ SỰ KIỆN QUÉT MÃ ------------------
    def on_camera_combo_changed(self):
        cam_idx = self.camera_combo.currentData()
        self.log_message(f"Thiết lập nguồn Camera: Cổng {cam_idx}")
        
        # Tắt luồng an toàn rồi mở lại nguồn mới
        self.camera_thread.running = False
        self.camera_thread.wait()
        
        self.camera_thread = CameraDaemonThread(camera_index=cam_idx)
        self.camera_thread.frame_signal.connect(self.update_image)
        self.camera_thread.barcode_scanned_signal.connect(self.on_barcode_scanned)
        self.camera_thread.start()

    def update_image(self, opencv_img):
        h, w, ch = opencv_img.shape
        bytes_per_line = ch * w
        converted_img = cv2.cvtColor(opencv_img, cv2.COLOR_BGR2RGB)
        
        qt_img = QImage(converted_img.data, w, h, bytes_per_line, QImage.Format_RGB888)
        qt_pixmap = QPixmap.fromImage(qt_img)
        
        self.image_label.setPixmap(qt_pixmap.scaled(
            self.image_label.width() - 8, 
            self.image_label.height() - 8, 
            Qt.KeepAspectRatio, 
            Qt.SmoothTransformation
        ))

    # ==========================================
    # LOGIC GIẢ LẬP QUÉT MÃ VẠCH (TEST UTILS)
    # ==========================================
    def simulate_scan_shopee(self):
        fake_code = f"SPX-VN-{np.random.randint(100000, 999999)}"
        self.on_barcode_scanned(fake_code)

    def simulate_scan_tiktok(self):
        fake_code = f"TTS-MX-{np.random.randint(100000, 999999)}"
        self.on_barcode_scanned(fake_code)

    def simulate_scan_lazada(self):
        fake_code = f"LZD-VN-{np.random.randint(100000, 999999)}"
        self.on_barcode_scanned(fake_code)

    def simulate_scan_custom(self):
        custom_code = self.sim_input.text().strip().upper()
        if custom_code:
            self.on_barcode_scanned(custom_code)
            self.sim_input.clear()

    # ==========================================
    # CORE LOGIC CHUYỂN ĐỒI GHI TẬP TIN SENTRY
    # ==========================================
    def on_barcode_scanned(self, barcode):
        if not barcode:
            return

        # 1. Trường hợp trạng thái rảnh rỗi (STANDBY)
        if self.current_state == "STANDBY":
            self.current_state = "RECORDING"
            self.current_barcode = barcode
            self.recording_start_time = time.time()
            
            play_beep()
            self.log_message(f"Phát hiện đơn hàng mới: [ {barcode} ]. Bắt đầu quay hình!")
            self.start_video_recording_flow(barcode)
            
            # Cập nhật thông tin giao diện
            self.current_barcode_lbl.setText(barcode)
            self.status_banner_lbl.setText(f"ĐANG QUAY VIDEO ĐƠN HÀNG: [ {barcode} ]")
            self.status_banner_lbl.setStyleSheet(\"\"\"
                background-color: #7f1d1d;
                color: #ef4444;
                border: 1px solid #991b1b;
                padding: 8px;
                border-radius: 6px;
            \"\"\")
        
        # 2. Đang đóng đơn 1, bất ngờ phát hiện đơn 2 (Mã đơn hàng mới khác mã cũ) -> Đảo đơn rảnh tay!
        elif self.current_state == "RECORDING":
            if barcode != self.current_barcode:
                play_beep()
                self.log_message(f"Đảo đơn tự động sang mã mới: [ {barcode} ].")
                
                # A. Ngắt quay video đơn cũ
                self.camera_thread.stop_recording()
                
                # Tính toán kích thước, thời gian, chèn lịch sử
                now_str = datetime.datetime.now().strftime("%H:%M:%S")
                elapsed_sec = int(time.time() - self.recording_start_time)
                old_filepath = self.active_file_path
                
                if not old_filepath or not os.path.exists(old_filepath):
                    old_filename = f"{self.current_barcode}_{datetime.datetime.now().strftime('%Y%m%d_%H%M%S')}.mp4"
                    old_filepath = os.path.join(self.save_directory, old_filename)
                    if not os.path.exists(old_filepath):
                        open(old_filepath, 'a').close()
                    
                size_mb = os.path.getsize(old_filepath) / (1024 * 1024)
                size_str = f"{size_mb:.2f} MB"
                dur_str = f"{elapsed_sec//60:02d}:{elapsed_sec%60:02d}"
                
                raw_row = self.add_history_record_to_table(self.current_barcode, now_str, dur_str, size_str, "Chỉ lưu PC", old_filepath)

                # B. Tạo luồng ngầm tự động upload lên Supabase Storage nếu bật checkbox
                if self.cloud_check.isChecked():
                    self.dispatch_supabase_sync(old_filepath, self.current_barcode, raw_row)

                # C. Kích hoạt chu kỳ tự động ghi mẫu đơn mới ngay tức khắc
                self.current_barcode = barcode
                self.recording_start_time = time.time()
                self.start_video_recording_flow(barcode)
                
                # Cập nhật kết quả hiển thị GUI
                self.current_barcode_lbl.setText(barcode)
                self.status_banner_lbl.setText(f"ĐANG QUAY VIDEO ĐƠN HÀNG: [ {barcode} ]")

    def start_video_recording_flow(self, barcode):
        now_str = datetime.datetime.now().strftime("%Y%m%d_%H%M%S")
        safe_filename = f"{barcode}_{now_str}.mp4"
        file_path = os.path.join(self.save_directory, safe_filename)
        self.active_file_path = file_path
        
        self.camera_thread.start_recording(file_path)
        self.log_message(f"Bắt đầu ghi đè video tại: {safe_filename}")

    def update_packing_timer(self):
        if self.current_state == "RECORDING":
            elapsed = int(time.time() - self.recording_start_time)
            minutes = elapsed // 60
            seconds = elapsed % 60
            self.time_counter_lbl.setText(f"{minutes:02d}:{seconds:02d}")

            # Cơ chế ngắt lưu tự động nếu vượt quá Timeout
            if elapsed >= self.auto_timeout_seconds:
                self.log_message(f"Phạm hạn mức {self.auto_timeout_seconds}s tự động đóng gói đơn hiện tại.")
                self.force_finish_current_order()

    def force_finish_current_order(self):
        if self.current_state == "RECORDING":
            self.camera_thread.stop_recording()
            
            now_str = datetime.datetime.now().strftime("%H:%M:%S")
            elapsed_sec = int(time.time() - self.recording_start_time)
            filepath = self.active_file_path
            
            if not filepath or not os.path.exists(filepath):
                now_fallback = datetime.datetime.now().strftime("%Y%m%d_%H%M%S")
                filename = f"{self.current_barcode}_{now_fallback}.mp4"
                filepath = os.path.join(self.save_directory, filename)
                if not os.path.exists(filepath):
                    open(filepath, 'a').close()
                
            size_mb = os.path.getsize(filepath) / (1024 * 1024)
            size_str = f"{size_mb:.2f} MB"
            dur_str = f"{elapsed_sec//60:02d}:{elapsed_sec%60:02d}"
            
            raw_row = self.add_history_record_to_table(self.current_barcode, now_str, dur_str, size_str, "Chỉ lưu PC", filepath)

            # Đẩy lên mây tự động
            if self.cloud_check.isChecked():
                self.dispatch_supabase_sync(filepath, self.current_barcode, raw_row)

            self.log_message(f"Đơn hàng {self.current_barcode} hoàn tất ghi âm đóng hàng cục bộ.")
            
            # Reset dữ liệu về hệ STANDBY ban đầu
            self.current_state = "STANDBY"
            self.current_barcode = ""
            self.current_barcode_lbl.setText("CHƯA CÓ ĐƠN")
            self.time_counter_lbl.setText("00:00")
            
            self.status_banner_lbl.setText("HỆ THỐNG ĐANG STANDBY - SẴN SÀNG QUÉT MÃ VẠCH ĐỂ ĐÓNG HÀNG")
            self.status_banner_lbl.setStyleSheet(\"\"s
                background-color: #064e3b;
                color: #10b981;
                border: 1px solid #065f46;
                padding: 8px;
                border-radius: 6px;
            \"\"\")

    def add_history_record_to_table(self, barcode, timestamp, duration_str, size_str, status_txt, file_path):
        row_position = self.history_table.rowCount()
        self.history_table.insertRow(row_position)

        # Cài đặt chi tiết thuộc tính từng ô dữ liệu
        item_code = QTableWidgetItem(barcode)
        item_code.setTextAlignment(Qt.AlignCenter)
        
        item_time = QTableWidgetItem(timestamp)
        item_time.setTextAlignment(Qt.AlignCenter)
        
        item_dur = QTableWidgetItem(duration_str)
        item_dur.setTextAlignment(Qt.AlignCenter)
        
        item_size = QTableWidgetItem(size_str)
        item_size.setTextAlignment(Qt.AlignCenter)

        self.history_table.setItem(row_position, 0, item_code)
        self.history_table.setItem(row_position, 1, item_time)
        self.history_table.setItem(row_position, 2, item_dur)
        self.history_table.setItem(row_position, 3, item_size)

        # Nhãn Trạng thái đồng bộ được CSS gọn mắt
        status_lbl = QLabel(status_txt)
        status_lbl.setAlignment(Qt.AlignCenter)
        status_lbl.setStyleSheet("color: #94a3b8; background-color: #1e293b; font-weight: bold; border-radius: 4px; padding: 2px;")
        self.history_table.setCellWidget(row_position, 4, status_lbl)

        # Widget bảng chứa hàng nút hành động Open File / Sync Cloud
        btn_widget = QWidget()
        btn_layout = QHBoxLayout(btn_widget)
        btn_layout.setContentsMargins(2, 2, 2, 2)
        btn_layout.setSpacing(4)

        btn_open = QPushButton("📂 Mở")
        btn_open.setStyleSheet("padding: 2px 6px; font-weight: bold; font-size: 10px; color: #cbd5e1; background-color: #1e293b; border-radius: 4px; border: 1px solid #334155;")
        btn_open.clicked.connect(lambda checked, path=file_path: self.open_video_file_natively(path))
        
        btn_sync = QPushButton("☁ Đồng bộ")
        btn_sync.setStyleSheet("padding: 2px 6px; font-weight: bold; color: white; font-size: 10px; background-color: #3b82f6; border-radius: 4px; border: 1px solid #2563eb;")
        btn_sync.clicked.connect(lambda checked, path=file_path, code=barcode, row=row_position: self.manual_row_sync(path, code, row))

        btn_layout.addWidget(btn_open)
        btn_layout.addWidget(btn_sync)
        btn_layout.setAlignment(Qt.AlignCenter)
        self.history_table.setCellWidget(row_position, 5, btn_widget)

        return row_position

    def open_video_file_natively(self, file_path):
        if os.path.exists(file_path):
            try:
                os.startfile(file_path)
            except Exception as e:
                self.log_message(f"Không thể mở file trực tiếp: {e}")
        else:
            self.log_message("Video cục bộ không khả dụng hoặc đã bị di dời.")

    def manual_row_sync(self, file_path, barcode, row_idx):
        if not os.path.exists(file_path):
            self.log_message("Lỗi: Không tìm thấy tệp tin chứa video đóng gói cục bộ.")
            return
        
        self.log_message(f"Kích hoạt đồng bộ thủ công đơn hàng: {barcode}")
        self.dispatch_supabase_sync(file_path, barcode, row_idx)

    def dispatch_supabase_sync(self, file_path, barcode, row_idx):
        # Đọc dữ liệu cài đặt Supabase động trực tiếp từ GUI inputs
        sb_url = self.sb_url_input.text().strip()
        sb_key = self.sb_key_input.text().strip()
        sb_bucket = self.sb_bucket_input.text().strip()

        if not sb_url or "your-project" in sb_url or "xxxxxx" in sb_url or not sb_key:
            self.log_message("Bỏ qua đồng bộ. Vui lòng thiết lập cấu hình Supabase URL & Key.")
            return

        # Cập nhật nhãn trạng thái dòng sang "Đang tải..."
        status_lbl = QLabel("Đang tải...")
        status_lbl.setAlignment(Qt.AlignCenter)
        status_lbl.setStyleSheet("color: #f59e0b; background-color: #78350f; font-weight: bold; border-radius: 4px;")
        self.history_table.setCellWidget(row_idx, 4, status_lbl)

        # Star uploader thread
        uploader = SupabaseUploadThread(file_path, barcode, sb_url, sb_key, sb_bucket, row_idx)
        uploader.finished_signal.connect(self.on_cloud_upload_finished)
        uploader.start()

        if not hasattr(self, 'active_uploaders'):
            self.active_uploaders = []
        self.active_uploaders.append(uploader)

    def on_cloud_upload_finished(self, file_path, success, message, row_idx):
        filename = os.path.basename(file_path)
        if success:
            self.log_message(f"✔ ĐỒNG BỘ CLOUD OK: {filename}")
            if row_idx >= 0 and row_idx < self.history_table.rowCount():
                status_lbl = QLabel("Đã đồng bộ")
                status_lbl.setAlignment(Qt.AlignCenter)
                status_lbl.setStyleSheet("color: #10b981; background-color: #064e3b; font-weight: bold; border-radius: 4px;")
                self.history_table.setCellWidget(row_idx, 4, status_lbl)
        else:
            self.log_message(f"❌ CLOUD FAIL: {filename}. Chi tiết: {message}")
            if row_idx >= 0 and row_idx < self.history_table.rowCount():
                status_lbl = QLabel("Lỗi sync")
                status_lbl.setAlignment(Qt.AlignCenter)
                status_lbl.setStyleSheet("color: #ef4444; background-color: #7f1d1d; font-weight: bold; border-radius: 4px;")
                status_lbl.setToolTip(message)
                self.history_table.setCellWidget(row_idx, 4, status_lbl)

    def closeEvent(self, event):
        # Tắt luồng an toàn tránh treo Windows
        self.camera_thread.running = False
        self.camera_thread.wait()
        event.accept()


if __name__ == "__main__":
    app = QApplication(sys.argv)
    window = PackSentryWindow()
    window.show()
    sys.exit(app.exec_())
`;
  };

  const handleCopy = () => {
    navigator.clipboard.writeText(getPythonCode());
    setCopied(true);
    addLog('success', 'Đã sao chép mã nguồn Python PackSentry v3.0 vào Clipboard của bạn.');
    setTimeout(() => setCopied(false), 2000);
  };

  const downloadPythonFile = () => {
    try {
      const element = document.createElement("a");
      const file = new Blob([getPythonCode()], { type: 'text/plain;charset=utf-8' });
      element.href = URL.createObjectURL(file);
      element.download = "pack_sentry_v3.py";
      document.body.appendChild(element);
      element.click();
      document.body.removeChild(element);
      addLog('success', 'Tải tệp pack_sentry_v3.py thành công về ổ đĩa của bạn.');
    } catch (e: any) {
      addLog('error', `Lỗi tải tệp: ${e.message}`);
    }
  };

  return (
    <div className="bg-white border border-slate-200 rounded-3xl overflow-hidden shadow-sm flex flex-col">
      {/* Header section with tabs */}
      <div className="bg-white border-b border-slate-100 p-6 flex flex-col md:flex-row justify-between items-start md:items-center gap-3">
        <div className="flex items-center gap-2">
          <span className="p-1.5 rounded-lg bg-indigo-50 text-indigo-600">
            <Terminal size={18} />
          </span>
          <div>
            <h3 className="font-bold text-slate-800 text-sm">Mã nguồn Python (.py) Đóng gói .exe</h3>
            <p className="text-[10px] text-slate-400 font-bold font-mono uppercase tracking-wider">Tự động đồng bộ cấu hình phía trên</p>
          </div>
        </div>

        <div className="flex gap-2.5 w-full md:w-auto">
          <button 
            onClick={handleCopy}
            className="flex-1 md:flex-initial flex items-center justify-center gap-2 px-3.5 py-2 rounded-xl bg-white hover:bg-slate-50 text-slate-700 border border-slate-200 text-xs font-bold active:scale-95 transition-all shadow-sm"
          >
            {copied ? <Check size={14} className="text-emerald-600" /> : <Copy size={14} />}
            {copied ? 'Đã sao chép' : 'Sao chép nguồn'}
          </button>
          <button 
            onClick={downloadPythonFile}
            className="flex-1 md:flex-initial flex items-center justify-center gap-2 px-3.5 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold active:scale-95 transition-all shadow-sm"
          >
            <Download size={14} />
            Tải File (.py)
          </button>
        </div>
      </div>

      {/* Code / Docs tabs navigation */}
      <div className="flex flex-wrap gap-1 bg-slate-50 p-2 border-b border-slate-200/60">
        <button
          onClick={() => setActiveTab('code')}
          className={`px-4 py-2 text-xs font-bold rounded-xl transition-all flex items-center justify-center gap-1.5 ${
            activeTab === 'code' ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-500 hover:text-slate-800'
          }`}
        >
          <Eye size={13} />
          Source Python
        </button>
        <button
          onClick={() => setActiveTab('install')}
          className={`px-4 py-2 text-xs font-bold rounded-xl transition-all flex items-center justify-center gap-1.5 ${
            activeTab === 'install' ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-500 hover:text-slate-800'
          }`}
        >
          <BookOpen size={13} />
          Hướng dẫn cài đặt
        </button>
        <button
          onClick={() => setActiveTab('exe')}
          className={`px-4 py-2 text-xs font-bold rounded-xl transition-all flex items-center justify-center gap-1.5 ${
            activeTab === 'exe' ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-500 hover:text-slate-800'
          }`}
        >
          <Cpu size={13} />
          Đóng gói .EXE Windows
        </button>
        <button
          onClick={() => setActiveTab('trouble')}
          className={`px-4 py-2 text-xs font-bold rounded-xl transition-all flex items-center justify-center gap-1.5 ${
            activeTab === 'trouble' ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-500 hover:text-slate-800'
          }`}
        >
          <ShieldAlert size={13} />
          Khắc phục lỗi
        </button>
        <button
          onClick={() => setActiveTab('supabase')}
          className={`px-4 py-2 text-xs font-bold rounded-xl transition-all flex items-center justify-center gap-1.5 ${
            activeTab === 'supabase' ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-500 hover:text-slate-205'
          }`}
        >
          <Database size={13} />
          Kết nối CDN Supabase
        </button>
      </div>

      {/* Tab Contents */}
      <div className="p-5 bg-white min-h-[360px] max-h-[500px] overflow-y-auto">
        {activeTab === 'code' && (
          <div className="relative font-mono text-[11px] leading-relaxed text-slate-300">
            <span className="absolute top-2 right-2 bg-slate-800 text-slate-400 px-2.5 py-0.5 rounded-full text-[9px] uppercase font-bold tracking-wider border border-slate-700 select-none z-10 shadow">
              Python 3.8+
            </span>
            <pre className="whitespace-pre overflow-x-auto p-4 bg-slate-950 text-emerald-400 rounded-2xl shadow-inner max-h-[440px]">
              <code>{getPythonCode()}</code>
            </pre>
          </div>
        )}

        {activeTab === 'install' && (
          <div className="space-y-4 text-xs text-slate-600 leading-relaxed font-medium">
            <div>
              <h4 className="font-bold text-sm text-slate-800 mb-2 flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-indigo-500 animate-pulse" />
                Bước 1: Cài đặt Python trên máy tính Windows
              </h4>
              <p className="pl-4 text-slate-500">
                Tải và cài đặt phiên bản <strong>Python 3.10 hoặc 3.11</strong> từ trang chủ chính thức python.org. Khi cài đặt, hãy tích chọn vào ô <code className="text-amber-700 bg-amber-50 px-1.5 py-0.5 rounded font-mono font-bold">"Add Python to PATH"</code> (Bắt buộc để chạy lệnh Terminal).
              </p>
            </div>

            <div className="border-t border-slate-100 pt-4">
              <h4 className="font-bold text-sm text-slate-800 mb-2 flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-indigo-500" />
                Bước 2: Cài đặt các thư viện thiết yếu
              </h4>
              <p className="pl-4 text-slate-500 mb-2">
                Mở lệnh <strong>Command Prompt (cmd)</strong> hoặc <strong>PowerShell</strong> trên Windows và nhập đoạn lệnh cài đặt các thư viện sau:
              </p>
              <div className="ml-4 bg-slate-50 p-3 rounded-2xl border border-slate-200/80 font-mono text-xs text-indigo-700 flex justify-between items-center group">
                <span className="font-bold">pip install PyQt5 opencv-python pyzbar requests numpy</span>
                <button 
                  onClick={() => {
                    navigator.clipboard.writeText("pip install PyQt5 opencv-python pyzbar requests numpy");
                    addLog('success', 'Đã sao chép lệnh cài thư viện Python vào Clipboard.');
                  }}
                  className="px-2.5 py-1.5 rounded-lg bg-white border border-slate-200 text-slate-500 hover:text-slate-800 transition-all font-sans text-[11px] font-bold shadow-sm"
                >
                  Sao chép
                </button>
              </div>
            </div>

            <div className="border-t border-slate-100 pt-4">
              <h4 className="font-bold text-sm text-slate-800 mb-2 flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-indigo-50" />
                Bước 3: Chạy chương trình trực tiếp
              </h4>
              <p className="pl-4 text-slate-500">
                Lưu mã nguồn vào tệp <code className="text-emerald-700 bg-emerald-50 px-1.5 py-0.5 rounded font-mono font-bold">pack_sentry_v3.py</code> trên máy tính của bạn. Sau đó khởi động từ Command Prompt:
              </p>
              <div className="mt-2 ml-4 bg-slate-50 p-3 rounded-2xl border border-slate-200/80 font-mono text-xs text-indigo-600 font-bold">
                python pack_sentry_v3.py
              </div>
            </div>
          </div>
        )}

        {activeTab === 'exe' && (
          <div className="space-y-4 text-xs text-slate-600 leading-relaxed font-medium">
            <p className="text-slate-500">
              Để nhân viên đóng gói nhấp đúp là chạy luôn từ màn hình nền Desktop mà không cần cài đặt Python, bạn hãy đóng gói thành tệp ứng dụng độc lập <strong>.exe</strong>.
            </p>

            <div className="border-t border-slate-100 pt-4">
              <h4 className="font-bold text-sm text-slate-800 mb-2 flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-indigo-500" />
                Lệnh đóng gói chuẩn qua PyInstaller
              </h4>
              <p className="pl-4 text-slate-500 mb-2">
                Cài đặt thư viện đóng gói trước:
              </p>
              <div className="ml-4 bg-slate-50 p-2.5 rounded-xl border border-slate-200 font-mono text-xs text-indigo-700 font-bold w-full max-w-sm">
                pip install pyinstaller
              </div>
              
              <p className="pl-4 text-slate-500 mt-4 mb-2">
                Chạy lệnh đóng gói tối ưu, ẩn cửa sổ cmd đen khi click chạy ứng dụng (<code className="text-indigo-600">--noconsole</code> / <code className="text-indigo-600">--windowed</code>):
              </p>
              <div className="ml-4 bg-slate-50 p-3 rounded-2xl border border-slate-200 font-mono text-xs text-indigo-700 flex justify-between items-center">
                <span className="font-bold">pyinstaller --onefile --windowed pack_sentry_v3.py</span>
                <button 
                  onClick={() => {
                    navigator.clipboard.writeText("pyinstaller --onefile --windowed pack_sentry_v3.py");
                    addLog('success', 'Đã sao chép lệnh đóng gói PyInstaller.');
                  }}
                  className="px-2.5 py-1.5 rounded-lg bg-white border border-slate-200 text-slate-500 hover:text-slate-800 transition-all font-sans text-[11px] font-bold shadow-sm"
                >
                  Sao chép
                </button>
              </div>
            </div>

            <div className="p-4 bg-amber-50 border border-amber-200 rounded-2xl mt-4">
              <span className="font-bold text-amber-800 block mb-1 uppercase tracking-wide text-[10px]">💡 Lưu ý thiết yếu khi đóng gói:</span>
              <p className="text-[11px] text-amber-700 font-medium">
                Sau khi chạy xong, file <strong className="text-slate-800">pack_sentry_v3.exe</strong> sẽ nằm trong thư mục mang tên <strong className="text-indigo-700">"dist"</strong>.
                Nếu máy tính chạy Windows báo lỗi thiếu dll liên quan đến bộ gỡ thư viện mã vạch, hãy tham khảo tab "Sửa Lỗi" để đính kèm tệp DLL của pyzbar vào file exe của bạn.
              </p>
            </div>
          </div>
        )}

        {activeTab === 'trouble' && (
          <div className="space-y-4 text-xs text-slate-600 leading-relaxed font-medium">
            <div className="p-4 bg-rose-50 border border-rose-100 rounded-2xl">
              <h4 className="font-bold text-rose-800 mb-1.5 flex items-center gap-1.5 text-sm">
                1. Lỗi Không Đọc Được Mã Vạch (Thiếu Visual C++ Redistributable)
              </h4>
              <p className="text-rose-700 text-xs">
                Hầu hết các lỗi liên quan đến thư viện <code className="text-rose-800 bg-rose-100 px-1 py-0.5 rounded font-mono">pyzbar</code> trên Windows xảy ra do máy tính thiếu gói thư viện VC++ của Microsoft.
                <br />
                <strong className="text-slate-700">Khắc phục:</strong> Vui lòng tải và cài đặt <strong className="text-indigo-600 underline font-bold">Visual C++ Redistributable 2013</strong> (hoặc bản mới nhất) trực tiếp từ trang web tải về của Microsoft.
              </p>
            </div>

            <div className="p-4 bg-slate-50 border border-slate-200 rounded-2xl">
              <h4 className="font-bold text-slate-800 mb-1.5 flex items-center gap-1.5 text-sm">
                2. Lỗi Camera Bị Đơ Hoặc Nhiễu Sọc
              </h4>
              <p className="text-slate-600 text-xs font-sans">
                Nếu camera không nhận diện được luồng hoặc khi ghim camera ngoài bị giật lag trên Windows:
                <br />
                - Hãy thay đổi tham số <code className="text-indigo-600 font-bold">cv2.CAP_DSHOW</code> thành <code className="text-indigo-600 font-bold">cv2.CAP_MSMF</code> trong hàm khởi tạo CameraDaemonThread.
                <br />
                - Kiểm tra xem camera có đang bị sử dụng bởi một ứng dụng khác như Chrome, Zalo, hay Zoom hay không.
              </p>
            </div>

            <div className="p-4 bg-slate-50 border border-slate-200 rounded-2xl">
              <h4 className="font-bold text-slate-800 mb-1.5 flex items-center gap-1.5 text-sm">
                3. Lệnh Đóng Gói PyInstaller Đính Kèm DLL Pyzbar
              </h4>
              <p className="text-slate-600 text-xs">
                Nếu đóng gói exe chạy lỗi <code className="text-rose-700 font-mono">"FileNotFoundError: Could not find libzbar-64.dll"</code>, hãy sử dụng lệnh đóng gói bao gồm đường dẫn nguyên bản thư viện pyzbar:
              </p>
              <div className="mt-2 bg-slate-950 p-3 rounded-xl font-mono text-[11px] text-indigo-400 overflow-x-auto shadow-inner">
                {"pyinstaller --onefile --windowed --add-binary \"C:\\Users\\<Ten_PC>\\AppData\\Local\\Programs\\Python\\Python310\\Lib\\site-packages\\pyzbar\\*.dll;pyzbar\" pack_sentry_v3.py"}
              </div>
            </div>
          </div>
        )}

        {activeTab === 'supabase' && (
          <div className="space-y-4 text-xs text-slate-600 leading-relaxed font-medium">
            <div className="p-4 bg-indigo-50 border border-indigo-150 rounded-2xl">
              <h4 className="font-bold text-indigo-900 mb-1 flex items-center gap-1.5 text-sm">
                🔌 Kết Nối Supabase Client Qua CDN Trên File HTML
              </h4>
              <p className="text-slate-600 text-xs">
                Để tích hợp cơ sở dữ liệu Supabase trực tiếp vào trang web FRONTEND sử dụng tệp HTML tĩnh mà không cần cài đặt Node.js/NPM, hãy sử dụng liên kết Script CDN chính thức và khởi tạo đối tượng khách hàng như bên dưới:
              </p>
            </div>

            {/* Bước 1: Script tag */}
            <div className="bg-slate-50 border border-slate-200 rounded-2xl p-4">
              <span className="font-bold text-indigo-700 text-[10px] uppercase font-mono tracking-wider block mb-2">Bước 1: Tích hợp thư viện Supabase CDN vào file HTML</span>
              <div className="bg-slate-950 p-4 rounded-xl text-emerald-400 font-mono text-[11px] overflow-x-auto relative">
                <code className="block select-all">{"<script src=\"https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2\"></script>"}</code>
              </div>
            </div>

            {/* Bước 2: Khởi tạo client */}
            <div className="bg-slate-50 border border-slate-200 rounded-2xl p-4">
              <span className="font-bold text-indigo-700 text-[10px] uppercase font-mono tracking-wider block mb-1">Bước 2: Khởi tạo đối tượng Supabase Client động</span>
              <p className="text-slate-500 mb-2 leading-snug text-[10px]">Đoạn mã sau được đồng bộ trực tiếp từ thông tin URL, API Key bạn đã điền ở bảng cấu hình phía trên bản xem trước:</p>
              
              <div className="bg-slate-950 p-4 rounded-xl text-emerald-400 font-mono text-[11px] overflow-x-auto relative">
                <code className="block whitespace-pre select-all">
{`// 1. Khởi tạo hằng số lấy từ cấu hình hệ thống
const SUPABASE_URL = "${config.supabaseUrl || 'https://YOUR_PROJECT_ID.supabase.co'}";
const SUPABASE_KEY = "${config.supabaseKey || 'YOUR_ANON_PUBLIC_KEY'}";
const BUCKET_NAME = "${config.supabaseBucket || 'videos'}";

// 2. Khởi tạo đối tượng Supabase sử dụng thư viện CDN
const supabase = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

console.log("Supabase Client đã sẵn sàng cho bucket:", BUCKET_NAME);`}
                </code>
              </div>
            </div>

            {/* Bước 3: Hàm tải video thử nghiệm */}
            <div className="bg-slate-50 border border-slate-200 rounded-2xl p-4">
              <span className="font-bold text-indigo-700 text-[10px] uppercase font-mono tracking-wider block mb-2">Ví dụ: Hàm tải tệp tin Video lên Bucket</span>
              <div className="bg-slate-950 p-4 rounded-xl text-emerald-400 font-mono text-[11px] overflow-x-auto relative">
                <code className="block whitespace-pre select-all">
{`async function uploadVideoToSupabase(fileBlob, fileName) {
  try {
    const { data, error } = await supabase.storage
      .from('${config.supabaseBucket || 'videos'}')
      .upload('videos/' + fileName, fileBlob, {
        cacheControl: '3600',
        upsert: false,
        contentType: 'video/mp4'
      });
      
    if (error) {
      console.error("Lỗi:", error.message);
      return null;
    }
    
    // Lấy liên kết truy cập công khai
    const { data: publicUl } = supabase.storage
      .from('${config.supabaseBucket || 'videos'}')
      .getPublicUrl('videos/' + fileName);

    console.log("Tải thành công! URL video:", publicUl.publicUrl);
    return publicUl.publicUrl;
  } catch (err) {
    console.error("Thất bại:", err);
  }
}`}
                </code>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
