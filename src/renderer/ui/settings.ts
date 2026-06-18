// ============================================================
// renderer/ui/settings.ts — 重构供应商设置面板
// ============================================================

import {
  DEFAULT_MAX_SCREEN_SPACE_SPLAT_SIZE,
  DEFAULT_OPACITY_THRESHOLD,
  DEFAULT_POINT_CLOUD_MODE,
  DEFAULT_SPLAT_ALPHA_REMOVAL_THRESHOLD,
  DEFAULT_SPLAT_SCALE,
  DEFAULT_VIEWER_BACKGROUND,
  DEFAULT_VIEWER_FOV,
} from '../../shared/constants';
import type { ReconstructionResolution, ViewerSettings } from '../../shared/types';
import { Check, ChevronDown, X } from 'lucide';
import { renderLucideIcon } from './lucide';

const SETTINGS_STORAGE_KEY = 'sharp-viewer:reconstruction-settings';

type PersistedSettings = {
  kieApiKey?: string;
  reconstructionResolution?: ReconstructionResolution;
};

function readPersistedSettings(): PersistedSettings {
  try {
    const raw = localStorage.getItem(SETTINGS_STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as PersistedSettings;
    return {
      kieApiKey: typeof parsed.kieApiKey === 'string' ? parsed.kieApiKey : undefined,
      reconstructionResolution:
        parsed.reconstructionResolution === '4K' || parsed.reconstructionResolution === '2K'
          ? parsed.reconstructionResolution
          : undefined,
    };
  } catch {
    return {};
  }
}

function persistSettings(settings: ViewerSettings): void {
  localStorage.setItem(
    SETTINGS_STORAGE_KEY,
    JSON.stringify({
      kieApiKey: settings.kieApiKey,
      reconstructionResolution: settings.reconstructionResolution,
    } satisfies PersistedSettings)
  );
}

const persisted = readPersistedSettings();

export const defaultViewerSettings: ViewerSettings = {
  qualityPreset: 'full',
  opacityThreshold: DEFAULT_OPACITY_THRESHOLD,
  maxGaussians: 0,
  focalPxOverride: null,
  splatAlphaRemovalThreshold: DEFAULT_SPLAT_ALPHA_REMOVAL_THRESHOLD,
  splatScale: DEFAULT_SPLAT_SCALE,
  maxScreenSpaceSplatSize: DEFAULT_MAX_SCREEN_SPACE_SPLAT_SIZE,
  pointCloudMode: DEFAULT_POINT_CLOUD_MODE,
  backgroundColor: DEFAULT_VIEWER_BACKGROUND,
  fov: DEFAULT_VIEWER_FOV,
  reconstructionProvider: 'kie',
  kieApiKey: persisted.kieApiKey ?? '',
  reconstructionResolution: persisted.reconstructionResolution ?? '2K',
};

type ApplyCallback = (settings: ViewerSettings) => void;

export class SettingsUI {
  private container: HTMLElement;
  private form: HTMLFormElement;
  private settings: ViewerSettings = { ...defaultViewerSettings };
  private applyCallbacks: ApplyCallback[] = [];
  private closeTimer: number | null = null;

  constructor() {
    this.container = this.createContainer();
    this.form = this.container.querySelector('#settings-form') as HTMLFormElement;
    this.mount();
    this.bindEvents();
    this.syncForm();
  }

  getSettings(): ViewerSettings {
    return { ...this.settings };
  }

  onApply(callback: ApplyCallback): void {
    this.applyCallbacks.push(callback);
  }

  open(): void {
    if (this.closeTimer !== null) {
      window.clearTimeout(this.closeTimer);
      this.closeTimer = null;
    }
    this.container.style.display = 'block';
    this.container.classList.remove('is-closing');
    this.container.classList.remove('is-open');
    void this.container.offsetWidth;
    this.container.classList.add('is-open');
    const input = this.form.elements.namedItem('kieApiKey');
    if (input instanceof HTMLInputElement) {
      window.setTimeout(() => input.focus(), 120);
    }
  }

  close(): void {
    if (this.container.style.display === 'none') return;
    this.container.classList.remove('is-open');
    this.container.classList.add('is-closing');
    this.closeTimer = window.setTimeout(() => {
      this.container.style.display = 'none';
      this.container.classList.remove('is-closing');
      this.closeTimer = null;
    }, 220);
  }

  private createContainer(): HTMLElement {
    const existing = document.getElementById('settings-panel');
    if (existing) return existing;
    const el = document.createElement('div');
    el.id = 'settings-panel';
    el.innerHTML = `
      <div class="settings-backdrop" data-settings-close></div>
      <aside class="settings-drawer liquid-surface" aria-label="设置">
        <div class="settings-header">
          <div>
            <div class="settings-title">设置</div>
            <div class="settings-subtitle">当前供应商：KIE · NanoBanana2</div>
          </div>
          <button type="button" class="liquid-button icon-button settings-close" data-settings-close title="关闭" aria-label="关闭设置">
            ${renderLucideIcon('x', X)}
          </button>
        </div>
        <form id="settings-form" class="settings-form">
          <section class="settings-section">
            <h3>图像重构</h3>
            <label class="setting-row setting-row-inline">
              <span>KIE 密钥</span>
              <input name="kieApiKey" type="password" autocomplete="off" placeholder="Bearer API Key" />
            </label>
            <label class="setting-row setting-row-inline">
              <span>分辨率</span>
              <span class="custom-select" data-resolution-select>
                <select name="reconstructionResolution" class="native-select-hidden" aria-hidden="true" tabindex="-1">
                  <option value="2K">2K</option>
                  <option value="4K">4K</option>
                </select>
                <button type="button" class="custom-select-button" data-resolution-toggle aria-haspopup="listbox" aria-expanded="false">
                  <span data-resolution-value>2K</span>
                  ${renderLucideIcon('chevron-down', ChevronDown)}
                </button>
                <span class="custom-select-menu" data-resolution-menu role="listbox">
                  <button type="button" class="custom-select-option is-selected" data-resolution-option="2K" role="option" aria-selected="true">
                    <span>2K</span>
                    ${renderLucideIcon('check', Check)}
                  </button>
                  <button type="button" class="custom-select-option" data-resolution-option="4K" role="option" aria-selected="false">
                    <span>4K</span>
                    ${renderLucideIcon('check', Check)}
                  </button>
                </span>
              </span>
            </label>
            <p class="settings-note">后续可以在这里加入更多模型和供应商；当前只启用 KIE NanoBanana2。</p>
          </section>

          <div class="settings-actions">
            <button type="button" class="liquid-button settings-secondary" data-settings-reset>清空</button>
            <button type="submit" class="liquid-button settings-primary">完成</button>
          </div>
        </form>
      </aside>
    `;
    return el;
  }

  private mount(): void {
    const app = document.getElementById('app');
    if (app) app.appendChild(this.container);
  }

  private bindEvents(): void {
    this.container.querySelectorAll('[data-settings-close]').forEach((button) => {
      button.addEventListener('click', () => this.close());
    });
    this.bindResolutionSelect();
    this.container.querySelector('[data-settings-reset]')?.addEventListener('click', () => {
      this.settings = {
        ...this.settings,
        kieApiKey: '',
        reconstructionResolution: '2K',
      };
      this.syncForm();
      this.emitApply();
    });
    this.form.addEventListener('input', () => this.syncFromForm());
    this.form.addEventListener('change', () => this.syncFromForm());
    this.form.addEventListener('submit', (event) => {
      event.preventDefault();
      this.syncFromForm();
      this.close();
    });
  }

  private syncFromForm(): void {
    this.settings = this.readForm();
    this.emitApply();
  }

  private emitApply(): void {
    persistSettings(this.settings);
    const next = this.getSettings();
    this.applyCallbacks.forEach((callback) => callback(next));
  }

  private syncForm(): void {
    (this.form.elements.namedItem('kieApiKey') as HTMLInputElement).value = this.settings.kieApiKey;
    (this.form.elements.namedItem('reconstructionResolution') as HTMLSelectElement).value =
      this.settings.reconstructionResolution;
    this.syncResolutionSelect();
  }

  private readForm(): ViewerSettings {
    const resolution = (this.form.elements.namedItem('reconstructionResolution') as HTMLSelectElement).value;
    return {
      ...this.settings,
      reconstructionProvider: 'kie',
      kieApiKey: (this.form.elements.namedItem('kieApiKey') as HTMLInputElement).value.trim(),
      reconstructionResolution: resolution === '4K' ? '4K' : '2K',
    };
  }

  private bindResolutionSelect(): void {
    const root = this.container.querySelector<HTMLElement>('[data-resolution-select]');
    const toggle = this.container.querySelector<HTMLButtonElement>('[data-resolution-toggle]');
    const nativeSelect = this.form.elements.namedItem('reconstructionResolution') as HTMLSelectElement | null;
    if (!root || !toggle || !nativeSelect) return;

    toggle.addEventListener('click', () => {
      const open = !root.classList.contains('is-open');
      root.classList.toggle('is-open', open);
      toggle.setAttribute('aria-expanded', String(open));
    });

    this.container.querySelectorAll<HTMLButtonElement>('[data-resolution-option]').forEach((option) => {
      option.addEventListener('click', () => {
        const value = option.dataset.resolutionOption === '4K' ? '4K' : '2K';
        nativeSelect.value = value;
        root.classList.remove('is-open');
        toggle.setAttribute('aria-expanded', 'false');
        this.syncFromForm();
        this.syncResolutionSelect();
      });
    });

    document.addEventListener('pointerdown', (event) => {
      if (!this.container.classList.contains('is-open')) return;
      if (root.contains(event.target as Node)) return;
      root.classList.remove('is-open');
      toggle.setAttribute('aria-expanded', 'false');
    });
  }

  private syncResolutionSelect(): void {
    const value = this.settings.reconstructionResolution;
    const label = this.container.querySelector<HTMLElement>('[data-resolution-value]');
    const nativeSelect = this.form.elements.namedItem('reconstructionResolution') as HTMLSelectElement | null;
    if (nativeSelect) nativeSelect.value = value;
    if (label) label.textContent = value;

    this.container.querySelectorAll<HTMLButtonElement>('[data-resolution-option]').forEach((option) => {
      const selected = option.dataset.resolutionOption === value;
      option.classList.toggle('is-selected', selected);
      option.setAttribute('aria-selected', String(selected));
    });
  }
}
