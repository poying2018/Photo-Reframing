import sharp from 'sharp';
import { ipcMain, dialog } from 'electron';
import { IPC_FILE_GET_IMAGE_METADATA, IPC_FILE_OPEN_IMAGE, IPC_FILE_REGISTER_LOCAL } from '../../shared/ipc-channels';
import { registerLocalFile } from '../protocol/output';

export function registerFileHandlers(): void {
  ipcMain.handle(IPC_FILE_OPEN_IMAGE, async () => {
    const result = await dialog.showOpenDialog({
      properties: ['openFile'],
      filters: [{ name: 'Images', extensions: ['jpg', 'jpeg', 'png', 'heic', 'heif', 'webp'] }],
    });
    const filePath = result.filePaths[0];
    return {
      ...result,
      referenceImageUrl: !result.canceled && filePath ? registerLocalFile(filePath) : undefined,
    };
  });

  ipcMain.handle(IPC_FILE_REGISTER_LOCAL, async (_event, filePath: string) => {
    return registerLocalFile(filePath);
  });

  ipcMain.handle(IPC_FILE_GET_IMAGE_METADATA, async (_event, filePath: string) => {
    const metadata = await sharp(filePath).metadata();
    if (!metadata.width || !metadata.height) {
      throw new Error('无法读取图片尺寸');
    }
    return {
      width: metadata.width,
      height: metadata.height,
    };
  });
}
