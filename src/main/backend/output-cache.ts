import * as crypto from 'crypto';
import * as fs from 'fs';
import * as path from 'path';
import type { InferenceResult, InferenceStartRequest } from '../../shared/types';
import { getOutputDir } from '../utils/paths';
import { logger } from '../utils/logger';

type CacheableInferenceResult = Omit<InferenceResult, 'taskId' | 'plyUrl' | 'referenceImageUrl'>;

const GENERATED_MODEL_PATTERN = /^(sharp_.+|output_\d+)\.ply$/i;

function normalizeInferenceOptions(request: InferenceStartRequest): string {
  return JSON.stringify({
    qualityPreset: request.qualityPreset ?? 'balanced',
    opacityThreshold: request.opacityThreshold ?? null,
    maxGaussians: request.maxGaussians ?? null,
    focalPxOverride: request.focalPxOverride ?? null,
  });
}

export function clearGeneratedOutputFiles(): void {
  const outputDir = getOutputDir();
  let entries: fs.Dirent[];
  try {
    entries = fs.readdirSync(outputDir, { withFileTypes: true });
  } catch (error) {
    logger.warn('读取输出目录失败，跳过旧模型清理', error);
    return;
  }

  for (const entry of entries) {
    if (!entry.isFile() || !GENERATED_MODEL_PATTERN.test(entry.name)) continue;
    const filePath = path.join(outputDir, entry.name);
    try {
      fs.unlinkSync(filePath);
      logger.info(`已清理旧模型文件: ${filePath}`);
    } catch (error) {
      logger.warn(`清理旧模型文件失败: ${filePath}`, error);
    }
  }
}

export class RuntimeOutputCache {
  private readonly results = new Map<string, CacheableInferenceResult>();

  async getKey(request: InferenceStartRequest): Promise<string> {
    const imageHash = await this.hashFile(request.imagePath);
    const optionsHash = crypto
      .createHash('sha256')
      .update(normalizeInferenceOptions(request))
      .digest('hex');
    return `${imageHash}:${optionsHash}`;
  }

  get(key: string): CacheableInferenceResult | null {
    const cached = this.results.get(key);
    if (!cached) return null;
    if (fs.existsSync(cached.plyPath)) return cached;
    this.results.delete(key);
    return null;
  }

  set(key: string, result: CacheableInferenceResult): void {
    this.results.set(key, result);
  }

  clear(): void {
    this.results.clear();
  }

  private hashFile(filePath: string): Promise<string> {
    return new Promise((resolve, reject) => {
      const hash = crypto.createHash('sha256');
      const stream = fs.createReadStream(filePath);
      stream.on('data', (chunk) => hash.update(chunk));
      stream.on('error', reject);
      stream.on('end', () => resolve(hash.digest('hex')));
    });
  }
}
