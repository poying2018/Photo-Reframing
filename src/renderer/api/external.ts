// ============================================================
// renderer/api/external.ts — 图像重构供应商适配层
// ============================================================

import type {
  ReconstructionProvider,
  ReconstructionResolution,
} from '../../shared/types';

const KIE_API_BASE_URL = 'https://api.kie.ai';
const KIE_FILE_BASE_URL = 'https://kieai.redpandaai.co';
const KIE_MODEL = 'nano-banana-2';
const KIE_MAX_POLL_MS = 15 * 60 * 1000;

export const RECONSTRUCTION_PROMPT =
  '修复图片边缘的模糊和瑕疵，恢复丢失的细节，适当矫正畸变扭曲，保持总体的角度构图不变';

type KieAspectRatio =
  | 'auto'
  | '1:1'
  | '1:4'
  | '16:9'
  | '1:8'
  | '21:9'
  | '2:3'
  | '3:2'
  | '3:4'
  | '4:1'
  | '4:3'
  | '4:5'
  | '5:4'
  | '8:1'
  | '9:16';

type ReconstructionRequest = {
  provider: ReconstructionProvider;
  apiKey: string;
  gaussianBlob: Blob;
  referenceBlob: Blob;
  resolution: ReconstructionResolution;
};

type ProviderAdapter = {
  id: ReconstructionProvider;
  reconstruct: (request: ReconstructionRequest) => Promise<Blob>;
};

type KieUploadResponse = {
  code?: number;
  msg?: string;
  message?: string;
  success?: boolean;
  data?: {
    fileUrl?: string;
    downloadUrl?: string;
    url?: string;
  };
};

type KieCreateTaskResponse = {
  code?: number;
  msg?: string;
  message?: string;
  data?: {
    taskId?: string;
  };
};

type KieTaskResponse = {
  code?: number;
  msg?: string;
  message?: string;
  data?: {
    state?: 'waiting' | 'queuing' | 'generating' | 'success' | 'fail';
    resultJson?: string;
    failMsg?: string;
    failCode?: string;
  };
};

const KIE_ASPECT_RATIOS: Array<{ value: Exclude<KieAspectRatio, 'auto'>; ratio: number }> = [
  { value: '1:1', ratio: 1 },
  { value: '1:4', ratio: 1 / 4 },
  { value: '16:9', ratio: 16 / 9 },
  { value: '1:8', ratio: 1 / 8 },
  { value: '21:9', ratio: 21 / 9 },
  { value: '2:3', ratio: 2 / 3 },
  { value: '3:2', ratio: 3 / 2 },
  { value: '3:4', ratio: 3 / 4 },
  { value: '4:1', ratio: 4 },
  { value: '4:3', ratio: 4 / 3 },
  { value: '4:5', ratio: 4 / 5 },
  { value: '5:4', ratio: 5 / 4 },
  { value: '8:1', ratio: 8 },
  { value: '9:16', ratio: 9 / 16 },
];

const kieAdapter: ProviderAdapter = {
  id: 'kie',
  reconstruct: reconstructWithKie,
};

const providers: Record<ReconstructionProvider, ProviderAdapter> = {
  kie: kieAdapter,
};

export async function runImageReconstruction(request: ReconstructionRequest): Promise<Blob> {
  const adapter = providers[request.provider];
  if (!adapter) {
    throw new Error(`暂不支持的重构供应商: ${request.provider}`);
  }
  return adapter.reconstruct(request);
}

async function reconstructWithKie(request: ReconstructionRequest): Promise<Blob> {
  const apiKey = request.apiKey.trim();
  if (!apiKey) {
    throw new Error('请先在设置里填写 KIE API Key');
  }

  const gaussianInput = await normalizeUploadImage(request.gaussianBlob, 'sharp-viewer-gaussian.png');

  const [gaussianUrl, aspectRatio] = await Promise.all([
    uploadKieFile(gaussianInput.blob, gaussianInput.fileName, apiKey),
    pickClosestAspectRatio(gaussianInput.blob),
  ]);

  const taskId = await createKieTask({
    apiKey,
    gaussianUrl,
    aspectRatio,
    resolution: request.resolution,
  });
  const resultUrl = await pollKieTask(taskId, apiKey);
  const response = await fetch(resultUrl);
  if (!response.ok) {
    throw new Error(`重构结果下载失败: ${response.status}`);
  }
  return response.blob();
}

async function normalizeUploadImage(blob: Blob, fallbackName: string): Promise<{ blob: Blob; fileName: string }> {
  if (['image/jpeg', 'image/png', 'image/webp'].includes(blob.type)) {
    return {
      blob,
      fileName: fallbackName.replace(/\.png$/, blob.type === 'image/jpeg' ? '.jpg' : blob.type === 'image/webp' ? '.webp' : '.png'),
    };
  }

  const converted = await convertImageBlob(blob, 'image/png');
  return {
    blob: converted,
    fileName: fallbackName,
  };
}

async function convertImageBlob(blob: Blob, type: 'image/png' | 'image/jpeg'): Promise<Blob> {
  const image = await loadImageFromBlob(blob);
  const canvas = document.createElement('canvas');
  canvas.width = image.naturalWidth;
  canvas.height = image.naturalHeight;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('无法创建图片转换画布');
  ctx.drawImage(image, 0, 0);

  return new Promise((resolve, reject) => {
    canvas.toBlob((converted) => {
      if (converted) resolve(converted);
      else reject(new Error('图片格式转换失败'));
    }, type, 0.96);
  });
}

async function uploadKieFile(blob: Blob, fileName: string, apiKey: string): Promise<string> {
  const formData = new FormData();
  formData.append('file', blob, fileName);
  formData.append('uploadPath', 'sharp-viewer/reconstruction');
  formData.append('fileName', `${Date.now()}-${fileName}`);

  const response = await fetch(`${KIE_FILE_BASE_URL}/api/file-stream-upload`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
    },
    body: formData,
  });
  const data = await readJson<KieUploadResponse>(response);
  const fileUrl = data.data?.fileUrl ?? data.data?.downloadUrl ?? data.data?.url;
  if (!response.ok || (data.code !== undefined && data.code !== 200) || !fileUrl) {
    throw new Error(data.msg ?? data.message ?? `KIE 文件上传失败: ${response.status}`);
  }
  return fileUrl;
}

async function createKieTask(input: {
  apiKey: string;
  gaussianUrl: string;
  aspectRatio: KieAspectRatio;
  resolution: ReconstructionResolution;
}): Promise<string> {
  const response = await fetch(`${KIE_API_BASE_URL}/api/v1/jobs/createTask`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${input.apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: KIE_MODEL,
      input: {
        prompt: RECONSTRUCTION_PROMPT,
        aspect_ratio: input.aspectRatio,
        resolution: input.resolution,
        output_format: 'jpg',
        google_search: false,
        image_input: [input.gaussianUrl],
      },
    }),
  });
  const data = await readJson<KieCreateTaskResponse>(response);
  const taskId = data.data?.taskId;
  if (!response.ok || data.code !== 200 || !taskId) {
    throw new Error(data.msg ?? data.message ?? `KIE 创建任务失败: ${response.status}`);
  }
  return taskId;
}

async function pollKieTask(taskId: string, apiKey: string): Promise<string> {
  const deadline = Date.now() + KIE_MAX_POLL_MS;
  let delayMs = 2500;

  while (Date.now() < deadline) {
    await sleep(delayMs);
    const response = await fetch(`${KIE_API_BASE_URL}/api/v1/jobs/recordInfo?taskId=${encodeURIComponent(taskId)}`, {
      headers: {
        Authorization: `Bearer ${apiKey}`,
      },
    });
    const data = await readJson<KieTaskResponse>(response);
    if (!response.ok || data.code !== 200) {
      throw new Error(data.msg ?? data.message ?? `KIE 查询任务失败: ${response.status}`);
    }

    const state = data.data?.state;
    if (state === 'success') {
      const resultUrl = parseKieResultUrl(data.data?.resultJson);
      if (!resultUrl) throw new Error('KIE 任务已完成，但没有返回图片 URL');
      return resultUrl;
    }

    if (state === 'fail') {
      throw new Error(data.data?.failMsg || data.data?.failCode || 'KIE 任务失败');
    }

    delayMs = Math.min(15000, Math.round(delayMs * 1.2));
  }

  throw new Error('KIE 任务超时，请稍后再试');
}

function parseKieResultUrl(resultJson: string | undefined): string | null {
  if (!resultJson) return null;
  try {
    const parsed = JSON.parse(resultJson) as {
      resultUrls?: string[];
      resultUrl?: string;
      urls?: string[];
    };
    return parsed.resultUrls?.[0] ?? parsed.urls?.[0] ?? parsed.resultUrl ?? null;
  } catch {
    return null;
  }
}

async function pickClosestAspectRatio(blob: Blob): Promise<KieAspectRatio> {
  const size = await getImageSize(blob);
  if (!size) return 'auto';
  const ratio = size.width / size.height;
  let best = KIE_ASPECT_RATIOS[0];
  let bestScore = Infinity;

  for (const candidate of KIE_ASPECT_RATIOS) {
    const score = Math.abs(Math.log(ratio / candidate.ratio));
    if (score < bestScore) {
      best = candidate;
      bestScore = score;
    }
  }

  return best.value;
}

async function getImageSize(blob: Blob): Promise<{ width: number; height: number } | null> {
  if ('createImageBitmap' in window) {
    try {
      const bitmap = await createImageBitmap(blob);
      const size = { width: bitmap.width, height: bitmap.height };
      bitmap.close();
      return size;
    } catch {
      // Fall back to HTMLImageElement below.
    }
  }

  try {
    const image = await loadImageFromBlob(blob);
    return { width: image.naturalWidth, height: image.naturalHeight };
  } catch {
    return null;
  }
}

function loadImageFromBlob(blob: Blob): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(blob);
    const image = new Image();
    image.onload = () => {
      URL.revokeObjectURL(url);
      resolve(image);
    };
    image.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('图片读取失败'));
    };
    image.src = url;
  });
}

async function readJson<T>(response: Response): Promise<T> {
  const text = await response.text();
  try {
    return JSON.parse(text) as T;
  } catch {
    throw new Error(text || `API 返回非 JSON 响应: ${response.status}`);
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}
