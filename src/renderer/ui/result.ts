// ============================================================
// renderer/ui/result.ts — 重构结果全屏叠层
// ============================================================

export class ResultUI {
  private container: HTMLElement;
  private image: HTMLImageElement;
  private originalUrl: string | null = null;
  private processedUrl: string | null = null;

  constructor() {
    this.container = this.createContainer();
    this.image = this.container.querySelector('#reconstruction-image') as HTMLImageElement;
    this.mount();
  }

  private createContainer(): HTMLElement {
    const existing = document.getElementById('result-panel');
    if (existing) return existing;
    const el = document.createElement('div');
    el.id = 'result-panel';
    el.className = 'reconstruction-result';
    el.setAttribute('aria-hidden', 'true');
    el.innerHTML = `
      <img id="reconstruction-image" class="reconstruction-image" alt="重构结果" />
    `;
    return el;
  }

  private mount(): void {
    const app = document.getElementById('app');
    if (app) app.appendChild(this.container);
  }

  showReconstruction(original: Blob, processed: Blob): void {
    this.clearObjectUrls();
    this.originalUrl = URL.createObjectURL(original);
    this.processedUrl = URL.createObjectURL(processed);
    this.showProcessed();
    this.container.classList.add('is-visible');
    this.container.setAttribute('aria-hidden', 'false');
  }

  showOriginal(): void {
    if (!this.originalUrl) return;
    this.image.src = this.originalUrl;
    this.container.classList.add('is-comparing');
  }

  showProcessed(): void {
    if (!this.processedUrl) return;
    this.image.src = this.processedUrl;
    this.container.classList.remove('is-comparing');
  }

  saveProcessed(): void {
    if (!this.processedUrl) return;
    const link = document.createElement('a');
    link.href = this.processedUrl;
    link.download = `sharp-viewer-reconstruction-${new Date().toISOString().replace(/[:.]/g, '-')}.jpg`;
    document.body.appendChild(link);
    link.click();
    link.remove();
  }

  showResult(imageBlob: Blob): void {
    this.showReconstruction(imageBlob, imageBlob);
  }

  showComparison(original: Blob, processed: Blob): void {
    this.showReconstruction(original, processed);
  }

  clear(): void {
    this.container.classList.remove('is-visible', 'is-comparing');
    this.container.setAttribute('aria-hidden', 'true');
    this.image.removeAttribute('src');
    this.clearObjectUrls();
  }

  private clearObjectUrls(): void {
    if (this.originalUrl) URL.revokeObjectURL(this.originalUrl);
    if (this.processedUrl && this.processedUrl !== this.originalUrl) URL.revokeObjectURL(this.processedUrl);
    this.originalUrl = null;
    this.processedUrl = null;
  }
}
