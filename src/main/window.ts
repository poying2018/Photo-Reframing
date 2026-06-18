// ============================================================
// main/window.ts — 窗口管理
// ============================================================

import * as path from 'path';
import { app, BrowserWindow, screen } from 'electron';
import type { ViewerWindowLayout, WindowControlAction, WindowMode, WindowState } from '../shared/types';

const WINDOW_BOUNDS: Record<WindowMode, Electron.Rectangle> = {
  compact: {
    width: 460,
    height: 360,
    x: 0,
    y: 0,
  },
  viewer: {
    width: 1200,
    height: 675,
    x: 0,
    y: 0,
  },
};

const VIEWER_MIN_WIDTH = 720;
const VIEWER_MAX_WIDTH = 1440;
const VIEWER_MAX_HEIGHT = 940;
const VIEWER_WORK_AREA_MARGIN = 80;

let mainWindow: BrowserWindow | null = null;
let windowStateListener: ((state: WindowState) => void) | null = null;

function getWindowIconPath(): string {
  return app.isPackaged
    ? path.join(process.resourcesPath, 'assets', 'icons', 'icon.png')
    : path.join(__dirname, '../../assets/icons/icon.png');
}

function centerBounds(bounds: Electron.Rectangle): Electron.Rectangle {
  const display = screen.getPrimaryDisplay();
  const area = display.workArea;
  return {
    ...bounds,
    x: Math.round(area.x + (area.width - bounds.width) / 2),
    y: Math.round(area.y + (area.height - bounds.height) / 2),
  };
}

export function setMainWindowMode(mode: WindowMode): void {
  if (!mainWindow || mainWindow.isDestroyed()) return;

  const target = centerBounds(WINDOW_BOUNDS[mode]);
  if (mode === 'compact') {
    mainWindow.setAspectRatio(0);
    mainWindow.setResizable(false);
    mainWindow.setMinimumSize(target.width, target.height);
  } else {
    mainWindow.setResizable(true);
    mainWindow.setMinimumSize(720, 420);
  }
  mainWindow.setBounds(target, false);
}

function getViewerBounds(layout?: ViewerWindowLayout): Electron.Rectangle {
  if (!layout || layout.imageWidth <= 0 || layout.imageHeight <= 0) {
    return centerBounds(WINDOW_BOUNDS.viewer);
  }

  const display = screen.getPrimaryDisplay();
  const workArea = display.workArea;
  const imageAspect = layout.imageWidth / layout.imageHeight;
  const maxWidth = Math.min(VIEWER_MAX_WIDTH, workArea.width - VIEWER_WORK_AREA_MARGIN);
  const maxHeight = Math.min(VIEWER_MAX_HEIGHT, workArea.height - VIEWER_WORK_AREA_MARGIN);

  let width = maxWidth;
  let height = Math.round(width / imageAspect);

  if (height > maxHeight) {
    height = maxHeight;
    width = Math.round(height * imageAspect);
  }

  if (width < VIEWER_MIN_WIDTH) {
    width = Math.min(VIEWER_MIN_WIDTH, maxWidth);
    height = Math.round(width / imageAspect);
  }

  return centerBounds({
    width,
    height,
    x: 0,
    y: 0,
  });
}

export function setViewerWindowLayout(layout?: ViewerWindowLayout): void {
  if (!mainWindow || mainWindow.isDestroyed()) return;

  const target = getViewerBounds(layout);
  mainWindow.setResizable(true);
  mainWindow.setMinimumSize(480, 300);
  if (layout && layout.imageWidth > 0 && layout.imageHeight > 0) {
    mainWindow.setAspectRatio(layout.imageWidth / layout.imageHeight);
  } else {
    mainWindow.setAspectRatio(0);
  }
  mainWindow.setBounds(target, false);
}

export function controlMainWindow(action: WindowControlAction): void {
  if (!mainWindow || mainWindow.isDestroyed()) return;

  if (action === 'minimize') {
    mainWindow.minimize();
    return;
  }

  if (action === 'toggle-maximize') {
    if (mainWindow.isMaximized()) {
      mainWindow.unmaximize();
    } else {
      mainWindow.maximize();
    }
    return;
  }

  mainWindow.close();
}

export function getMainWindowState(): WindowState {
  return {
    isMaximized: Boolean(mainWindow && !mainWindow.isDestroyed() && mainWindow.isMaximized()),
  };
}

export function onMainWindowStateChange(listener: (state: WindowState) => void): void {
  windowStateListener = listener;
}

function emitWindowState(): void {
  windowStateListener?.(getMainWindowState());
}

export async function createMainWindow(): Promise<BrowserWindow> {
  const win = new BrowserWindow({
    ...centerBounds(WINDOW_BOUNDS.compact),
    minWidth: 460,
    minHeight: 360,
    title: '照片重构',
    frame: false,
    titleBarStyle: 'hidden',
    transparent: false,
    backgroundColor: '#ffffff',
    hasShadow: true,
    show: false,
    autoHideMenuBar: true,
    icon: getWindowIconPath(),
    webPreferences: {
      preload: path.join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });
  mainWindow = win;
  setMainWindowMode('compact');
  win.on('maximize', () => emitWindowState());
  win.on('unmaximize', () => emitWindowState());
  win.on('enter-full-screen', () => emitWindowState());
  win.on('leave-full-screen', () => emitWindowState());

  const revealWindow = (): void => {
    if (win.isDestroyed() || win.isVisible()) return;
    win.show();
    emitWindowState();
  };

  win.once('ready-to-show', revealWindow);
  win.webContents.once('did-finish-load', revealWindow);

  const devServerUrl = process.env.ELECTRON_RENDERER_URL;
  if (devServerUrl) {
    await win.loadURL(devServerUrl);
  } else {
    await win.loadFile(path.join(__dirname, '../renderer/index.html'));
  }
  return win;
}
