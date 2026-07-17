/**
 * IframeManager — 负责所有 iframe 的创建、显隐、销毁和消息发送。
 *
 * 从 PanelController 抽离的职责：
 *  - 运行时探测官方 sys_PanelControl / sys_IFrame 是否存在
 *  - 不存在时降级到浏览器原生 HTMLIFrameElement
 *  - 统一 postMessage 出口（兼容官方句柄和原生 contentWindow）
 *  - 统一显隐控制（兼容 setVisible / show+hide / style.display）
 *
 * 这样 PanelController 只关心业务编排和消息路由，
 * 不再被 iframe 实现细节污染。
 */
import type { PanelMessage, OverlayMessage } from '../types/messages';

export type IframeHandle = HTMLIFrameElement | { postMessage: (msg: any, origin: string) => void; setVisible?: (v: boolean) => void; show?: () => void; hide?: () => void } | any;

export interface IframeCreateOptions {
	url: string;
	width?: number | string;
	height?: string;
	position?: 'right' | 'full';
	transparent?: boolean;
}

export class IframeManager {
	private panelIframe: IframeHandle | null = null;
	private overlayIframe: IframeHandle | null = null;
	private panelVisible = true;

	/**
	 * 创建右侧评论面板 iframe。
	 * 探测顺序：sys_PanelControl.create → sys_IFrame.create → 原生 iframe。
	 */
	async createPanel(url: string, width = 320): Promise<IframeHandle> {
		const edaAny = eda as any;
		const panelControl = edaAny.sys_PanelControl;
		const sysIframe = edaAny.sys_IFrame ?? edaAny.sys_Iframe;

		if (panelControl && typeof panelControl.create === 'function') {
			try {
				this.panelIframe = await panelControl.create({
					url,
					width,
					position: 'right',
				});
				return this.panelIframe;
			}
			catch (e) {
				console.warn('[CoComment] sys_PanelControl.create failed, fallback:', e);
			}
		}

		if (sysIframe && typeof sysIframe.create === 'function') {
			try {
				this.panelIframe = await sysIframe.create({
					url,
					width,
					height: '100%',
					position: 'right',
				});
				return this.panelIframe;
			}
			catch (e) {
				console.warn('[CoComment] sys_IFrame.create failed, fallback:', e);
			}
		}

		this.panelIframe = this.createNativeIframe(url, { width, position: 'right' });
		return this.panelIframe;
	}

	/**
	 * 创建透明批注覆盖层 iframe。
	 */
	async createOverlay(url: string): Promise<IframeHandle> {
		const edaAny = eda as any;
		const sysIframe = edaAny.sys_IFrame ?? edaAny.sys_Iframe;

		if (sysIframe && typeof sysIframe.create === 'function') {
			try {
				this.overlayIframe = await sysIframe.create({
					url,
					width: '100%',
					height: '100%',
					position: 'full',
					transparent: true,
				});
				return this.overlayIframe;
			}
			catch (e) {
				console.warn('[CoComment] sys_IFrame.create(overlay) failed, fallback:', e);
			}
		}

		this.overlayIframe = this.createNativeIframe(url, {
			width: '100%',
			height: '100%',
			position: 'full',
			transparent: true,
		});
		return this.overlayIframe;
	}

	/**
	 * 浏览器原生 iframe 兜底方案。
	 */
	private createNativeIframe(url: string, opts: IframeCreateOptions): HTMLIFrameElement {
		const iframe = document.createElement('iframe');
		iframe.src = url;
		iframe.style.border = 'none';
		iframe.style.position = 'fixed';
		iframe.style.top = '0';
		iframe.style.right = '0';
		iframe.style.zIndex = '9999';
		iframe.style.background = opts.transparent ? 'transparent' : '#fff';

		if (opts.position === 'full') {
			iframe.style.width = '100%';
			iframe.style.height = '100%';
			iframe.style.pointerEvents = 'none';
		}
		else {
			iframe.style.width = typeof opts.width === 'number' ? `${opts.width}px` : (opts.width ?? '320px');
			iframe.style.height = opts.height ?? '100%';
		}

		document.body.appendChild(iframe);
		return iframe;
	}

	/**
	 * 向面板 iframe 发消息。兼容官方句柄和原生 contentWindow。
	 */
	sendToPanel(msg: PanelMessage): void {
		const payload = { ...msg, source: 'cocomment-parent' as const };
		this.postTo(this.panelIframe, payload);
	}

	/**
	 * 向批注覆盖层 iframe 发消息。
	 */
	sendToOverlay(msg: OverlayMessage): void {
		const payload = { ...msg, source: 'cocomment-parent' as const };
		this.postTo(this.overlayIframe, payload);
	}

	private postTo(target: IframeHandle | null, payload: any): void {
		if (!target) {
			return;
		}
		if (typeof target.postMessage === 'function') {
			target.postMessage(payload, '*');
		}
		else if (target instanceof HTMLIFrameElement && target.contentWindow) {
			target.contentWindow.postMessage(payload, '*');
		}
	}

	// ============ 面板显隐 ============
	togglePanel(): void {
		this.panelVisible = !this.panelVisible;
		this.applyPanelVisible();
	}

	setPanelVisible(visible: boolean): void {
		this.panelVisible = visible;
		this.applyPanelVisible();
	}

	isPanelVisible(): boolean {
		return this.panelVisible;
	}

	private applyPanelVisible(): void {
		const target = this.panelIframe;
		if (!target) {
			return;
		}
		if (typeof target.setVisible === 'function') {
			target.setVisible(this.panelVisible);
			return;
		}
		if (typeof target.show === 'function' && typeof target.hide === 'function') {
			this.panelVisible ? target.show() : target.hide();
			return;
		}
		if (target instanceof HTMLIFrameElement) {
			target.style.display = this.panelVisible ? '' : 'none';
		}
	}

	// ============ 销毁 ============
	destroy(): void {
		for (const el of [this.panelIframe, this.overlayIframe]) {
			if (el instanceof HTMLIFrameElement && el.parentNode) {
				el.parentNode.removeChild(el);
			}
		}
		this.panelIframe = null;
		this.overlayIframe = null;
	}
}
