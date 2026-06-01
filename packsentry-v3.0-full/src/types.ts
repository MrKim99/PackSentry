/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export type PackSentryState = 'STANDBY' | 'RECORDING' | 'SAVING';

export interface AppConfig {
  cameraDevice: string;
  localSaveFolder: string;
  supabaseUrl: string;
  supabaseKey: string;
  supabaseBucket: string;
  cloudSyncEnabled: boolean;
  autoTimeoutSeconds: number;
  beepVolume: number;
  voiceEnabled: boolean;
  shortcutsEnabled: boolean;
  
  // New features: scanMode, autoScenarioEnabled, custom keys, etc.
  scanMode: 'camera' | 'barcode_gun' | 'manual';
  autoScenarioEnabled: boolean;
  
  // Custom Keyboard Shortcuts triggers
  keyStopSave: string;
  keySimShopee: string;
  keySimTikTok: string;
  keyCancelBarcode: string;
  
  // Customized sound type feedback
  beepTone: 'standard' | 'success' | 'double_beep' | 'laser';
  autoDownloadEnabled: boolean;
}

export interface PackageVideo {
  id: string;
  barcode: string;
  timestamp: string;
  duration: string;
  sizeMB: number;
  localBlobUrl: string;
  cloudUrl: string | null;
  status: 'local' | 'uploading' | 'synced' | 'failed';
  uploadProgress: number;
  filePath: string;
}

export interface SystemLog {
  id: string;
  timestamp: string;
  type: 'info' | 'success' | 'warning' | 'error';
  message: string;
}
