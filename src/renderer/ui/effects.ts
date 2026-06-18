// ============================================================
// renderer/ui/effects.ts — 边缘发光与等待态扰动层
// ============================================================

import { ImageGenerateFxRenderer } from './image-generate-fx';

export class EffectsUI {
  private container: HTMLElement;
  private previewCanvas: HTMLCanvasElement;
  private imageFx: ImageGenerateFxRenderer;
  private ownedPreviewUrl: string | null = null;
  private fadeTimer: number | null = null;
  private previewToken = 0;

  constructor() {
    this.container = this.createContainer();
    this.previewCanvas = this.container.querySelector('#busy-preview-canvas') as HTMLCanvasElement;
    this.imageFx = new ImageGenerateFxRenderer(this.previewCanvas);
    this.mount();
  }

  private createContainer(): HTMLElement {
    const existing = document.getElementById('fx-layer');
    if (existing) return existing;
    const el = document.createElement('div');
    el.id = 'fx-layer';
    el.className = 'fx-layer';
    el.setAttribute('aria-hidden', 'true');
    el.innerHTML = `
      <div class="busy-preview" aria-hidden="true">
        <canvas id="busy-preview-canvas"></canvas>
      </div>
    `;
    return el;
  }

  private mount(): void {
    const app = document.getElementById('app');
    if (app) app.appendChild(this.container);
  }

  showPreviewUrl(url: string | null): void {
    this.cancelFadeTimer();
    this.clearOwnedPreviewUrl();
    this.container.classList.remove('is-fading');
    this.container.classList.add('is-busy');
    void this.setPreviewSource(url);
  }

  showPreviewBlob(blob: Blob): void {
    this.cancelFadeTimer();
    this.clearOwnedPreviewUrl();
    this.ownedPreviewUrl = URL.createObjectURL(blob);
    this.container.classList.remove('is-fading');
    this.container.classList.add('is-busy');
    void this.setPreviewSource(this.ownedPreviewUrl);
  }

  hideBusy(): void {
    if (!this.container.classList.contains('is-busy')) return;
    this.container.classList.add('is-fading');
    this.fadeTimer = window.setTimeout(() => {
      this.container.classList.remove('is-busy', 'is-fading');
      this.previewToken += 1;
      this.imageFx.stop();
      this.imageFx.clear();
      this.clearOwnedPreviewUrl();
      this.fadeTimer = null;
    }, 460);
  }

  clear(): void {
    this.cancelFadeTimer();
    this.container.classList.remove('is-busy', 'is-fading');
    this.previewToken += 1;
    this.imageFx.stop();
    this.imageFx.clear();
    this.clearOwnedPreviewUrl();
  }

  private async setPreviewSource(url: string | null): Promise<void> {
    const token = ++this.previewToken;
    this.imageFx.stop();
    this.imageFx.clear();
    if (!url) return;
    try {
      await this.imageFx.setSourceUrl(url);
      if (token !== this.previewToken) return;
      this.imageFx.start();
    } catch (error) {
      console.warn('图片扰动预览加载失败', error);
    }
  }

  private clearOwnedPreviewUrl(): void {
    if (!this.ownedPreviewUrl) return;
    URL.revokeObjectURL(this.ownedPreviewUrl);
    this.ownedPreviewUrl = null;
  }

  private cancelFadeTimer(): void {
    if (this.fadeTimer === null) return;
    window.clearTimeout(this.fadeTimer);
    this.fadeTimer = null;
  }
}
