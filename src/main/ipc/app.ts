import * as fs from 'fs';
import * as path from 'path';
import { ipcMain, app, BrowserWindow } from 'electron';
import {
  IPC_APP_GET_WINDOW_STATE,
  IPC_APP_GET_VERSION,
  IPC_APP_QUIT,
  IPC_APP_SET_WINDOW_MODE,
  IPC_APP_WINDOW_STATE_CHANGED,
  IPC_APP_WINDOW_CONTROL,
  IPC_MODEL_GET_STATUS,
  IPC_RUNTIME_GET_CAPABILITIES,
} from '../../shared/ipc-channels';
import { ONNX_DATA_FILENAME, ONNX_MODEL_FILENAME } from '../../shared/constants';
import type { ModelStatus, ViewerWindowLayout, WindowControlAction, WindowMode } from '../../shared/types';
import { BackendManager } from '../backend/manager';
import { getModelCacheDir } from '../utils/paths';
import { controlMainWindow, getMainWindowState, onMainWindowStateChange, setMainWindowMode, setViewerWindowLayout } from '../window';

function fileSize(filePath: string): number {
  try {
    return fs.statSync(filePath).size;
  } catch {
    return 0;
  }
}

function getModelStatus(): ModelStatus {
  const modelDir = getModelCacheDir();
  const modelPath = path.join(modelDir, ONNX_MODEL_FILENAME);
  const dataPath = path.join(modelDir, ONNX_DATA_FILENAME);
  const modelExists = fs.existsSync(modelPath);
  const dataExists = fs.existsSync(dataPath);
  return {
    modelPath,
    dataPath,
    modelExists,
    dataExists,
    ready: modelExists && dataExists,
    modelSize: fileSize(modelPath),
    dataSize: fileSize(dataPath),
  };
}

export function registerAppHandlers(backend: BackendManager): void {
  onMainWindowStateChange((state) => {
    for (const window of BrowserWindow.getAllWindows()) {
      window.webContents.send(IPC_APP_WINDOW_STATE_CHANGED, state);
    }
  });

  ipcMain.handle(IPC_RUNTIME_GET_CAPABILITIES, async () => backend.getCapabilities());
  ipcMain.handle(IPC_MODEL_GET_STATUS, async () => getModelStatus());
  ipcMain.handle(IPC_APP_GET_VERSION, async () => app.getVersion());
  ipcMain.handle(IPC_APP_GET_WINDOW_STATE, async () => getMainWindowState());
  ipcMain.handle(IPC_APP_QUIT, async () => app.quit());
  ipcMain.handle(
    IPC_APP_SET_WINDOW_MODE,
    async (_event, payload: WindowMode | { mode: WindowMode; layout?: ViewerWindowLayout }) => {
      const mode = typeof payload === 'string' ? payload : payload.mode;
      if (mode === 'viewer') {
        setViewerWindowLayout(typeof payload === 'string' ? undefined : payload.layout);
        return;
      }
      setMainWindowMode(mode);
    }
  );
  ipcMain.handle(IPC_APP_WINDOW_CONTROL, async (_event, action: WindowControlAction) => {
    controlMainWindow(action);
  });
}
