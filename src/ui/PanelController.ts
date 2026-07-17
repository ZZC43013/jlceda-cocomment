import type { CommentEngine } from '../core/CommentEngine';
import type { CommentThread, Comment } from '../types/comment';
import type { AnnotationRenderer } from '../core/AnnotationRenderer';
import type { IframeManager } from './IframeManager';
import type { ProjectData } from '../types/sync';
import type { PanelInboundMessage, OverlayInboundMessage } from '../types/messages';

/**
 * PanelController — 业务编排 + 消息路由中枢。
 *
 * 职责（已瘦身）：
 *  - 持有 IframeManager，把渲染指令转发给 overlay iframe
 *  - 监听 panel/overlay iframe 的 message，路由到对应业务方法
 *  - 编排绘制流程（startDrawing → createThread → 通知面板 focus）
 *  - 编排导入导出
 *
 * 已抽离的职责：
 *  - iframe 创建/显隐/销毁 → IframeManager
 *  - 视图轮询/坐标换算 → AnnotationRenderer
 */
export class PanelController {
	private engine: CommentEngine;
	private renderer: AnnotationRenderer;
	private iframes: IframeManager;
	private annotationVisible = true;
	private refreshTimer: number | null = null;

	constructor(engine: CommentEngine, renderer: AnnotationRenderer, iframes: IframeManager) {
		this.engine = engine;
		this.renderer = renderer;
		this.iframes = iframes;
	}

	async init(): Promise<void> {
		await this.iframes.createPanel('./iframe/panel.html', 320);
		await this.iframes.createOverlay('./iframe/annotation.html');
		this.setupMessageListeners();
		await this.refreshThreads();
	}

	destroy(): void {
		this.iframes.destroy();
		this.renderer.destroy();
	}

	private setupMessageListeners(): void {
		window.addEventListener('message', (e: MessageEvent) => {
			const msg = e.data;
			if (!msg || typeof msg !== 'object') {
				return;
			}
			if (msg.source === 'cocomment-panel') {
				this.handlePanelMessage(msg as PanelInboundMessage);
			}
			else if (msg.source === 'cocomment-overlay') {
				this.renderer.handleIframeMessage(msg as OverlayInboundMessage);
			}
		});

		// 数据变更 → 防抖刷新（创建 thread 时会同时触发 thread 变更和 comment 变更，合并为一次刷新）
		const debouncedRefresh = () => {
			if (this.refreshTimer !== null) {
				clearTimeout(this.refreshTimer);
			}
			this.refreshTimer = window.setTimeout(() => {
				this.refreshTimer = null;
				void this.refreshThreads();
			}, 50);
		};

		this.engine.onThreadChange(debouncedRefresh);
		this.engine.onCommentChange(debouncedRefresh);
	}

	private async handlePanelMessage(msg: PanelInboundMessage): Promise<void> {
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
				await this.handleExport();
				break;

			case 'action:import':
				await this.handleImport();
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
				this.iframes.sendToPanel({ type: 'user:update', user: this.engine.getCurrentUser() });
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
		this.iframes.sendToPanel({ type: 'thread:flash', threadId });
	}

	/**
	 * 启动绘制 → 创建空 thread（不带首条评论） → 通知面板 focus 输入框。
	 * 由 index.ts 的 addAnnotation 菜单和面板 + 按钮共同调用。
	 */
	async startDrawing(): Promise<void> {
		const anchor = await this.renderer.startDrawing('box');
		if (!anchor) {
			return;
		}
		const thread = await this.engine.createThread(anchor, '');
		this.renderer.addThread(thread);
		this.iframes.sendToPanel({ type: 'thread:created', thread });
	}

	/**
	 * 导出当前工程的所有评论为 JSON 文件。
	 * 供 index.ts 的菜单和面板导出按钮共用。
	 */
	async exportComments(): Promise<void> {
		try {
			const data = await this.engine.exportProject();
			const jsonStr = JSON.stringify(data, null, 2);
			const blob = new Blob([jsonStr], { type: 'application/json' });
			const url = URL.createObjectURL(blob);
			const a = document.createElement('a');
			a.href = url;
			a.download = `cocomment_${Date.now()}.json`;
			a.click();
			URL.revokeObjectURL(url);
		}
		catch (e) {
			console.warn('[CoComment] Export failed:', e);
		}
	}

	/**
	 * 从 JSON 文件导入评论。
	 * 供 index.ts 的菜单和面板导入按钮共用。
	 */
	async importComments(): Promise<void> {
		try {
			const input = document.createElement('input');
			input.type = 'file';
			input.accept = '.json';
			input.onchange = async () => {
				const file = input.files?.[0];
				if (!file) {
					return;
				}
				try {
					const text = await file.text();
					const data = JSON.parse(text) as ProjectData;
					await this.engine.importProject(data);
					// refreshThreads 内部已调用 renderer.refreshAll，无需重复刷新
					await this.refreshThreads();
				}
				catch (err) {
					console.warn('[CoComment] Import parse failed:', err);
				}
			};
			input.click();
		}
		catch (e) {
			console.warn('[CoComment] Import failed:', e);
		}
	}

	private async handleExport(): Promise<void> {
		await this.exportComments();
	}

	private async handleImport(): Promise<void> {
		await this.importComments();
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

	private async refreshThreads(): Promise<void> {
		const threads = await this.engine.getThreads();
		const comments: Record<string, Comment[]> = {};
		for (const t of threads) {
			comments[t.id] = await this.engine.getComments(t.id);
		}
		const numbers = this.computeThreadNumbers(threads);

		this.iframes.sendToPanel({
			type: 'threads:update',
			threads,
			comments,
			numbers,
		});
		// 同步刷新批注层（同一次拿到的 threads，避免重复 getThreads）
		this.renderer.refreshAll(threads);
		// 把稳定序号发给批注层用于徽章
		this.iframes.sendToOverlay({ type: 'update-numbers', numbers });
	}

	// ============ 对外暴露给 index.ts 的方法 ============
	togglePanel(): void {
		this.iframes.togglePanel();
	}

	setPanelVisible(visible: boolean): void {
		this.iframes.setPanelVisible(visible);
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
