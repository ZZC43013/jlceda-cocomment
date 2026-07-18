import type { CommentEngine } from '../core/CommentEngine';
import type { CommentThread, Comment, ThreadAnchor } from '../types/comment';
import type { AnnotationRenderer } from '../core/AnnotationRenderer';
import type { IframeManager } from './IframeManager';
import type { MessageBridge } from './MessageBridge';
import type { ProjectData } from '../types/sync';
import type { PanelInboundMessage, DrawInboundMessage } from '../types/messages';
import { getCurrentProjectContext } from '../utils/ProjectContext';

/**
 * PanelController — 业务编排 + 消息路由中枢。
 *
 * 职责:
 *  - 持有 IframeManager（管理 sys_IFrame 窗口）和 MessageBridge（sys_MessageBus 通信）
 *  - 监听 iframe 通过 MessageBus 发来的用户操作，路由到 CommentEngine
 *  - 数据变更后通过 MessageBridge 推送更新到 panel/overlay iframe
 *  - 编排绘制流程、导入导出
 */
export class PanelController {
	private engine: CommentEngine;
	private renderer: AnnotationRenderer;
	private iframes: IframeManager;
	private bridge: MessageBridge;
	private annotationVisible = true;
	private refreshTimer: number | null = null;
	/** draw:complete 的回调，由 startDrawing 设置，handleDrawMessage 触发 */
	private drawResolve: ((result: { image: string; width: number; height: number } | null) => void) | null = null;

	constructor(engine: CommentEngine, renderer: AnnotationRenderer, iframes: IframeManager, bridge: MessageBridge) {
		this.engine = engine;
		this.renderer = renderer;
		this.iframes = iframes;
		this.bridge = bridge;
	}

	async init(): Promise<void> {
		// 只设置消息监听和数据初始化，不自动打开 iframe
		// sys_IFrame.openIFrame 创建的是 Dialog 窗口（模态），自动打开会遮挡画布
		// panel 由用户点击"显示评论面板"菜单时打开
		// overlay 由用户点击"添加批注"菜单时按需打开
		this.setupMessageListeners();
		await this.refreshThreads();
	}

	/** 当前工程 ID（用于检测工程切换） */
	private currentProjectId: string | null = null;

	/**
	 * 检查工程上下文是否变化（用户切换了工程）。
	 * 如果切换了，重新设置 engine 的 projectContext 并刷新面板。
	 * 在 togglePanel / addAnnotation 入口调用，保证显示的是当前工程的评论。
	 */
	private async checkProjectSwitched(): Promise<boolean> {
		try {
			const ctx = await getCurrentProjectContext();
			const engineProjectId = this.engine.getThreadManager().getProjectId();
			// 如果 engine 持有的 projectId 与当前 EDA 工程不一致，说明工程已切换
			if (ctx.projectId !== engineProjectId) {
				console.log(`[CoComment] 检测到工程切换: ${engineProjectId} → ${ctx.projectId} (${ctx.projectName})`);
				this.engine.setProjectContext(ctx.projectId, ctx.pageId, ctx.pageType);
				this.currentProjectId = ctx.projectId;
				await this.refreshThreads();
				return true;
			}
			this.currentProjectId = ctx.projectId;
		}
		catch (e) {
			console.warn('[CoComment] checkProjectSwitched 失败:', e);
		}
		return false;
	}

	destroy(): void {
		void this.iframes.closeAll();
		this.renderer.destroy();
	}

	private setupMessageListeners(): void {
		// 监听来自 panel iframe 的用户操作
		this.bridge.onPanelMessage((msg) => {
			void this.handlePanelMessage(msg);
		});

		// 监听来自 overlay iframe 的事件（绘制完成、批注点击）
		this.bridge.onOverlayMessage((msg) => {
			this.renderer.handleIframeMessage(msg);
		});

		// 监听来自 draw iframe 的事件（绘制完成/取消）
		this.bridge.onDrawMessage((msg) => {
			this.handleDrawMessage(msg);
		});

		// 数据变更 → 防抖刷新（创建 thread 时会同时触发 thread 变更和 comment 变更，合并为一次刷新）
		// 注：主进程没有 window，但 setTimeout/clearTimeout 是 JS 全局函数，可直接使用
		const debouncedRefresh = () => {
			if (this.refreshTimer !== null) {
				clearTimeout(this.refreshTimer);
			}
			this.refreshTimer = setTimeout(() => {
				this.refreshTimer = null;
				void this.refreshThreads();
			}, 50) as unknown as number;
		};

		this.engine.onThreadChange(debouncedRefresh);
		this.engine.onCommentChange(debouncedRefresh);
	}

	private async handlePanelMessage(msg: PanelInboundMessage): Promise<void> {
		console.log('[CoComment] panel→main msg:', msg.type);
		switch (msg.type) {
			case 'ready':
			case 'request:threads':
			case 'request:refresh':
				await this.refreshThreads();
				break;

			case 'thread-select':
				await this.handleThreadSelect(msg.threadId);
				break;

			case 'action:add-comment':
				await this.startDrawing();
				break;

			case 'action:add-comment-to-thread':
				await this.engine.addComment(msg.threadId, msg.content);
				break;

			case 'action:resolve-thread':
				await this.engine.resolveThread(msg.threadId);
				break;

			case 'action:reopen-thread':
				await this.engine.reopenThread(msg.threadId);
				break;

			case 'action:delete-thread':
				await this.engine.deleteThread(msg.threadId);
				this.renderer.removeThread(msg.threadId);
				break;

			case 'action:delete-comment':
				await this.engine.deleteComment(msg.commentId);
				break;

			case 'action:export':
				await this.exportComments();
				break;

			case 'action:import':
				await this.importComments();
				break;

			case 'action:toggle-visible':
				this.toggleAnnotationVisible(msg.visible);
				break;

			case 'action:set-user':
				if (msg.user) {
					await this.engine.setCurrentUser(msg.user);
					this.renderer.setUser(msg.user);
					await this.refreshThreads();
				}
				break;

			case 'action:request-user':
				this.bridge.sendToPanel({ type: 'user:update', user: this.engine.getCurrentUser() });
				break;
		}
	}

	private async handleThreadSelect(threadId: string): Promise<void> {
		const thread = await this.engine.getThread(threadId);
		if (!thread) {
			return;
		}
		const { Navigator } = await import('../core/Navigator');
		const navigator = new Navigator();
		await navigator.jumpToThread(thread);
		this.renderer.highlightThread(threadId);
		this.bridge.sendToPanel({ type: 'thread:flash', threadId });
	}

	/**
	 * 处理 draw iframe 通过 MessageBus 发来的消息。
	 */
	private handleDrawMessage(msg: DrawInboundMessage): void {
		console.log('[CoComment] draw→main msg:', msg.type);
		switch (msg.type) {
			case 'draw:ready':
				// draw dialog 已就绪
				break;
			case 'draw:cancel':
				// 用户取消绘制
				if (this.drawResolve) {
					this.drawResolve(null);
					this.drawResolve = null;
				}
				void this.iframes.closeDraw();
				break;
			case 'draw:complete':
				// 用户确认批注，返回 base64 图像
				if (this.drawResolve) {
					this.drawResolve({ image: msg.image, width: msg.width, height: msg.height });
					this.drawResolve = null;
				}
				void this.iframes.closeDraw();
				break;
		}
	}

	/**
	 * 添加批注 — 打开绘制 Dialog，用户手绘/粘贴截图/上传图片，
	 * 确认后用图像作为 thread 的 anchor.image。
	 *
	 * 架构说明：
	 *   原设计是通过 overlay iframe 在画布上框选矩形作为 anchor。
	 *   但 sys_IFrame.openIFrame 创建的是模态 Dialog 窗口，不是透明覆盖层，
	 *   无法在画布上直接绘制。改为打开独立的绘制 Dialog，用户可以：
	 *   1. 手绘（画笔、矩形、箭头、文字标注）
	 *   2. Ctrl+V 粘贴截图（配合系统截图工具 Win+Shift+S）
	 *   3. 上传本地图片
	 *   确认后画布内容保存为 base64 PNG 图像，作为 thread 的锚点图像。
	 *
	 * 由 index.ts 的 addAnnotation 菜单和面板 + 按钮共同调用。
	 */
	async startDrawing(): Promise<void> {
		console.log('[CoComment] startDrawing begin');
		// 检查工程是否切换，保证新批注挂在当前工程下
		await this.checkProjectSwitched();
		// 打开绘制 Dialog，等待用户完成或取消
		const opened = await this.iframes.openDraw();
		if (!opened) {
			console.warn('[CoComment] startDrawing: openDraw failed');
			return;
		}
		const result = await new Promise<{ image: string; width: number; height: number } | null>((resolve) => {
			this.drawResolve = resolve;
		});
		console.log('[CoComment] startDrawing result=', result ? 'got image' : 'cancelled');
		if (!result) {
			return;
		}
		// 用图像作为 anchor
		const anchor: ThreadAnchor = {
			type: 'box',
			image: result.image,
			imageWidth: result.width,
			imageHeight: result.height,
		};
		const thread = await this.engine.createThread(anchor, '');
		console.log('[CoComment] startDrawing thread created id=' + thread.id);
		this.renderer.addThread(thread);
		this.bridge.sendToPanel({ type: 'thread:created', thread });
	}

	/**
	 * 导出当前工程的所有评论为 JSON 文件。
	 * 用 eda.sys_FileSystem.saveFile(fileData: Blob, fileName?: string)。
	 * 注意：saveFile 第一个参数是 Blob/File，不是字符串。
	 */
	async exportComments(): Promise<void> {
		try {
			const data = await this.engine.exportProject();
			const jsonStr = JSON.stringify(data, null, 2);
			// 主进程没有 document.createElement('a')，用 Blob + sys_FileSystem.saveFile
			const blob = new Blob([jsonStr], { type: 'application/json' });
			await eda.sys_FileSystem.saveFile(blob, `cocomment_${Date.now()}.json`);
		}
		catch (e) {
			console.warn('[CoComment] Export failed:', e);
		}
	}

	/**
	 * 从 JSON 文件导入评论。
	 * eda.sys_FileSystem.openReadFileDialog 返回 Promise<Array<File> | undefined>。
	 */
	async importComments(): Promise<void> {
		try {
			const files = await eda.sys_FileSystem.openReadFileDialog(['.json']);
			if (!files || files.length === 0) {
				return;
			}
			const text = await files[0].text();
			const data = JSON.parse(text) as ProjectData;
			await this.engine.importProject(data);
			await this.refreshThreads();
		}
		catch (e) {
			console.warn('[CoComment] Import failed:', e);
		}
	}

	/**
	 * 计算每个 thread 的稳定序号（按 createdAt 升序，从 1 开始）。
	 * 用于 annotation.html 的徽章和 panel.html 的卡片标题保持一致。
	 */
	private computeThreadNumbers(threads: CommentThread[]): Record<string, number> {
		const sorted = [...threads].sort((a, b) => a.createdAt - b.createdAt);
		const map: Record<string, number> = {};
		sorted.forEach((t, i) => {
			map[t.id] = i + 1;
		});
		return map;
	}

	private refreshLock = false;

	private async refreshThreads(): Promise<void> {
		// 简易去重：避免多个 panel 实例同时 request:threads 导致重复刷新
		if (this.refreshLock) {
			return;
		}
		this.refreshLock = true;
		try {
			const threads = await this.engine.getThreads();
			const comments: Record<string, Comment[]> = {};
			for (const t of threads) {
				comments[t.id] = await this.engine.getComments(t.id);
			}
			const numbers = this.computeThreadNumbers(threads);

			console.log('[CoComment] refreshThreads → panel: threads=' + threads.length);
			this.bridge.sendToPanel({
				type: 'threads:update',
				threads,
				comments,
			numbers,
		});
			// 同步刷新批注层（同一次拿到的 threads，避免重复 getThreads）
			this.renderer.refreshAll(threads);
			// 把稳定序号发给批注层用于徽章
			this.bridge.sendToOverlay({ type: 'update-numbers', numbers });
		}
		finally {
			this.refreshLock = false;
		}
	}

	// ============ 对外暴露给 index.ts 的方法 ============
	async togglePanel(): Promise<void> {
		console.log('[CoComment] PanelController.togglePanel, panelOpened=' + this.iframes.isPanelVisible());
		// 检查工程是否切换（用户可能切到另一个工程），切换了则重载评论
		await this.checkProjectSwitched();
		await this.iframes.togglePanel();
		console.log('[CoComment] PanelController.togglePanel done, panelVisible=' + this.iframes.isPanelVisible());
	}

	async setPanelVisible(visible: boolean): Promise<void> {
		if (visible) {
			await this.iframes.showPanel();
		}
		else {
			await this.iframes.hidePanel();
		}
	}

	isPanelVisible(): boolean {
		return this.iframes.isPanelVisible();
	}

	toggleAnnotationVisible(visible?: boolean): void {
		this.annotationVisible = visible ?? !this.annotationVisible;
		if (this.annotationVisible) {
			this.renderer.show();
		}
		else {
			this.renderer.hide();
		}
	}

	isAnnotationVisible(): boolean {
		return this.annotationVisible;
	}
}
