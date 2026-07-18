/**
 * IframeManager — 管理 sys_IFrame 的打开/显示/隐藏/关闭。
 *
 * 真实 API（来自 easyeda-api skill references/classes/SYS_IFrame.md）:
 *   openIFrame(htmlFileName, width?, height?, id?, props?): Promise<boolean>
 *     - htmlFileName: 扩展包内 HTML 路径，从扩展根目录起，如 '/iframe/panel.html'
 *     - 返回 boolean（操作是否成功），不是 iframe 句柄
 *   showIFrame(id?): Promise<boolean>
 *   hideIFrame(id?): Promise<boolean>
 *   closeIFrame(id?): Promise<boolean>
 *
 * 关键认知修正:
 *   1. sys_IFrame 用 id 管理窗口，不返回句柄
 *   2. sys_PanelControl 只控制 EDA 内置面板（左/右/底），不能创建自定义面板，已删除该路径
 *   3. 主进程禁止 document.createElement，原生 iframe 降级已删除
 *   4. 跨 context 通信改用 sys_MessageBus（见 MessageBridge.ts），不再用 postMessage
 */
import type { PanelMessage, OverlayMessage } from '../types/messages';

const PANEL_ID = 'cocomment-panel';
const OVERLAY_ID = 'cocomment-overlay';
const DRAW_ID = 'cocomment-draw';
// 构建产物在 dist/iframe/ 下（copyIframeAssets 把 src/iframe/ 复制到 dist/iframe/）
// openIFrame 路径从扩展包根目录起，所以要用 /dist/iframe/...
const PANEL_HTML = '/dist/iframe/panel.html';
const OVERLAY_HTML = '/dist/iframe/annotation.html';
const DRAW_HTML = '/dist/iframe/draw.html';

export class IframeManager {
	private panelOpened = false;
	private panelVisible = false;
	private overlayOpened = false;
	private overlayVisible = false;
	private drawOpened = false;

	/** 打开右侧评论面板。重复调用幂等（已打开则只切换可见性）。 */
	async openPanel(width = 360, height = 600): Promise<boolean> {
		if (this.panelOpened) {
			console.log('[CoComment] openPanel: already opened, call showPanel');
			return this.showPanel();
		}
		try {
			console.log('[CoComment] openPanel: calling sys_IFrame.openIFrame, path=' + PANEL_HTML);
			const ok = await eda.sys_IFrame.openIFrame(PANEL_HTML, width, height, PANEL_ID, {
				title: 'CoComment',
				minimizeButton: true,
				maximizeButton: false,
				minimizeStyle: 'collapsed',
			});
			console.log('[CoComment] openPanel: openIFrame returned ' + ok);
			if (ok) {
				this.panelOpened = true;
				this.panelVisible = true;
			}
			return ok;
		}
		catch (e) {
			console.warn('[CoComment] sys_IFrame.openIFrame(panel) failed:', e);
			return false;
		}
	}

	/** 打开透明批注覆盖层。 */
	async openOverlay(width = 1920, height = 1080): Promise<boolean> {
		if (this.overlayOpened) {
			return this.showOverlay();
		}
		try {
			const ok = await eda.sys_IFrame.openIFrame(OVERLAY_HTML, width, height, OVERLAY_ID, {
				title: 'CoComment Overlay',
				minimizeButton: false,
				maximizeButton: false,
				grayscaleMask: false,
			});
			if (ok) {
				this.overlayOpened = true;
				this.overlayVisible = true;
			}
			return ok;
		}
		catch (e) {
			console.warn('[CoComment] sys_IFrame.openIFrame(overlay) failed:', e);
			return false;
		}
	}

	async showPanel(): Promise<boolean> {
		if (!this.panelOpened) {
			return this.openPanel();
		}
		try {
			const ok = await eda.sys_IFrame.showIFrame(PANEL_ID);
			if (ok) {
				this.panelVisible = true;
			}
			return ok;
		}
		catch (e) {
			console.warn('[CoComment] showIFrame(panel) failed:', e);
			return false;
		}
	}

	async hidePanel(): Promise<boolean> {
		if (!this.panelOpened) {
			return true;
		}
		try {
			const ok = await eda.sys_IFrame.hideIFrame(PANEL_ID);
			if (ok) {
				this.panelVisible = false;
			}
			return ok;
		}
		catch (e) {
			console.warn('[CoComment] hideIFrame(panel) failed:', e);
			return false;
		}
	}

	async togglePanel(): Promise<boolean> {
		// 基于 panelOpened（而非 panelVisible）判断：
		// panelOpened=false 表示从未打开过，必须 openPanel（不能 showPanel，否则无效）
		// panelOpened=true 时按 panelVisible 切换显隐
		if (!this.panelOpened) {
			return this.openPanel();
		}
		return this.panelVisible ? this.hidePanel() : this.showPanel();
	}

	async showOverlay(): Promise<boolean> {
		if (!this.overlayOpened) {
			return this.openOverlay();
		}
		try {
			const ok = await eda.sys_IFrame.showIFrame(OVERLAY_ID);
			if (ok) {
				this.overlayVisible = true;
			}
			return ok;
		}
		catch (e) {
			console.warn('[CoComment] showIFrame(overlay) failed:', e);
			return false;
		}
	}

	async hideOverlay(): Promise<boolean> {
		if (!this.overlayOpened) {
			return true;
		}
		try {
			const ok = await eda.sys_IFrame.hideIFrame(OVERLAY_ID);
			if (ok) {
				this.overlayVisible = false;
			}
			return ok;
		}
		catch (e) {
			console.warn('[CoComment] hideIFrame(overlay) failed:', e);
			return false;
		}
	}

	async toggleOverlay(): Promise<boolean> {
		// 同 togglePanel：基于 overlayOpened 判断
		if (!this.overlayOpened) {
			return this.openOverlay();
		}
		return this.overlayVisible ? this.hideOverlay() : this.showOverlay();
	}

	isPanelVisible(): boolean {
		return this.panelVisible;
	}

	isOverlayVisible(): boolean {
		return this.overlayVisible;
	}

	/** 打开绘制 Dialog（用于添加批注时截图/绘制） */
	async openDraw(width = 860, height = 620): Promise<boolean> {
		// 如果已打开，先关闭再开（避免复用旧画布）
		if (this.drawOpened) {
			try {
				await eda.sys_IFrame.closeIFrame(DRAW_ID);
			}
			catch (e) {
				// ignore
			}
			this.drawOpened = false;
		}
		try {
			console.log('[CoComment] openDraw: calling sys_IFrame.openIFrame, path=' + DRAW_HTML);
			const ok = await eda.sys_IFrame.openIFrame(DRAW_HTML, width, height, DRAW_ID, {
				title: '绘制批注',
				minimizeButton: false,
				maximizeButton: true,
			});
			console.log('[CoComment] openDraw: openIFrame returned ' + ok);
			if (ok) {
				this.drawOpened = true;
			}
			return ok;
		}
		catch (e) {
			console.warn('[CoComment] sys_IFrame.openIFrame(draw) failed:', e);
			return false;
		}
	}

	/** 关闭绘制 Dialog */
	async closeDraw(): Promise<boolean> {
		if (!this.drawOpened) {
			return true;
		}
		try {
			const ok = await eda.sys_IFrame.closeIFrame(DRAW_ID);
			if (ok) {
				this.drawOpened = false;
			}
			return ok;
		}
		catch (e) {
			console.warn('[CoComment] closeIFrame(draw) failed:', e);
			return false;
		}
	}

	isDrawOpened(): boolean {
		return this.drawOpened;
	}

	async closeAll(): Promise<void> {
		try {
			if (this.panelOpened) {
				await eda.sys_IFrame.closeIFrame(PANEL_ID);
				this.panelOpened = false;
				this.panelVisible = false;
			}
		}
		catch (e) {
			console.warn('[CoComment] closeIFrame(panel) failed:', e);
		}
		try {
			if (this.overlayOpened) {
				await eda.sys_IFrame.closeIFrame(OVERLAY_ID);
				this.overlayOpened = false;
				this.overlayVisible = false;
			}
		}
		catch (e) {
			console.warn('[CoComment] closeIFrame(overlay) failed:', e);
		}
	}

	/**
	 * 重置内部状态（不调用 closeIFrame）。
	 * 用于 activate() 中 closeIFrame() 清理旧窗口后，同步重置本地的 panelOpened/Visible 标志，
	 * 避免后续 togglePanel 误以为 panel 已打开而调用 hidePanel（实际无窗口可隐藏）。
	 */
	resetState(): void {
		this.panelOpened = false;
		this.panelVisible = false;
		this.overlayOpened = false;
		this.overlayVisible = false;
		this.drawOpened = false;
		console.log('[CoComment] IframeManager state reset');
	}
}
