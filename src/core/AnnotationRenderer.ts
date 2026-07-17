import type { CommentThread, ThreadAnchor, PageType, BBox } from '../types/comment';
import type { ViewTransform } from '../utils/coord';
import { logicBBoxToScreen, screenBBoxToLogic, normalizeBBox } from '../utils/coord';
import type { OverlayMessage, OverlayToParentMessage, OverlayThreadView } from '../types/messages';
import type { User } from '../types/user';

export interface AnnotationRendererOptions {
	user: User;
	pageType: PageType;
}

/**
 * 批注渲染器 — 只负责：
 *  1. 轮询 EDA 视图状态（zoom/offset）
 *  2. 把 thread 的逻辑坐标 bbox 换算成屏幕坐标
 *  3. 通过 onSendToOverlay 回调把渲染指令交给上层（PanelController）转发
 *  4. 处理 overlay iframe 回传的绘制/点击消息
 *
 * 不再依赖 ISyncProvider（之前的 sync 字段从未使用，是死依赖）。
 * 不再用 window.dispatchEvent(CustomEvent)，改为显式回调注入。
 */
export class AnnotationRenderer {
	private user: User;
	private pageType: PageType;
	private threads: Map<string, CommentThread> = new Map();
	private view: ViewTransform = { zoom: 1, offsetX: 0, offsetY: 0, canvasWidth: 0, canvasHeight: 0 };
	private visible = false;
	private drawing = false;
	private drawStart: { x: number; y: number } | null = null;
	private drawResolve: ((anchor: ThreadAnchor | null) => void) | null = null;
	private onThreadClickCallbacks: Array<(threadId: string) => void> = [];
	private rafId: number | null = null;
	private lastViewKey = '';

	/** 由 PanelController 注入：把渲染指令发给 overlay iframe */
	private onSendToOverlay: (msg: OverlayMessage) => void;

	constructor(
		options: AnnotationRendererOptions,
		onSendToOverlay: (msg: OverlayMessage) => void,
	) {
		this.user = options.user;
		this.pageType = options.pageType;
		this.onSendToOverlay = onSendToOverlay;
	}

	setPageType(pageType: PageType): void {
		this.pageType = pageType;
	}

	setUser(user: User): void {
		this.user = user;
	}

	async init(): Promise<void> {
		this.setupViewPolling();
	}

	destroy(): void {
		if (this.rafId) {
			cancelAnimationFrame(this.rafId);
			this.rafId = null;
		}
		this.threads.clear();
	}

	private setupViewPolling(): void {
		const poll = async () => {
			try {
				// 仅 PCB 文档支持（SCH_Document 未在类型定义中暴露）
				const doc = this.pageType === 'pcb' ? eda.pcb_Document : undefined;
				if (doc && typeof doc.zoomTo === 'function') {
					// zoomTo() 不传参，返回当前视图区域 {left,right,top,bottom}
					const region = await doc.zoomTo();
					if (region && typeof region === 'object' && 'left' in region) {
						const width = region.right - region.left;
						// 用区域宽度 / 画布像素宽度 推算缩放比
						const zoom = width > 0 ? window.innerWidth / width : 1;
						// 区域左下角对应屏幕原点偏移（EDA Y 轴向上为正）
						const newView: ViewTransform = {
							zoom,
							offsetX: -region.left * zoom,
							offsetY: window.innerHeight + region.bottom * zoom,
							canvasWidth: window.innerWidth,
							canvasHeight: window.innerHeight,
						};
						const viewKey = `${newView.zoom},${newView.offsetX},${newView.offsetY},${newView.canvasWidth},${newView.canvasHeight}`;
						if (viewKey !== this.lastViewKey) {
							this.lastViewKey = viewKey;
							this.view = newView;
							if (this.visible && this.threads.size > 0) {
								this.renderAll();
							}
						}
					}
				}
			}
			catch (e) {
				// 静默失败，使用默认值
			}
			this.rafId = requestAnimationFrame(poll);
		};
		this.rafId = requestAnimationFrame(poll);
	}

	getView(): ViewTransform {
		return { ...this.view };
	}

	show(): void {
		this.visible = true;
		this.onSendToOverlay({ type: 'show' });
	}

	hide(): void {
		this.visible = false;
		this.onSendToOverlay({ type: 'hide' });
	}

	isVisible(): boolean {
		return this.visible;
	}

	addThread(thread: CommentThread): void {
		this.threads.set(thread.id, thread);
		this.renderThread(thread);
	}

	updateThread(thread: CommentThread): void {
		this.threads.set(thread.id, thread);
		this.renderThread(thread);
	}

	removeThread(threadId: string): void {
		this.threads.delete(threadId);
		this.onSendToOverlay({ type: 'remove-thread', threadId });
	}

	clearAll(): void {
		this.threads.clear();
		this.onSendToOverlay({ type: 'clear-all' });
	}

	refreshAll(threads: CommentThread[]): void {
		this.threads.clear();
		for (const t of threads) {
			this.threads.set(t.id, t);
		}
		this.renderAll();
	}

	private threadToView(thread: CommentThread): OverlayThreadView | null {
		if (!thread.anchor.bbox) {
			return null;
		}
		const screen = logicBBoxToScreen(thread.anchor.bbox, this.view);
		return {
			id: thread.id,
			status: thread.status,
			color: this.user.color,
			...screen,
		};
	}

	private renderThread(thread: CommentThread): void {
		const view = this.threadToView(thread);
		if (view) {
			this.onSendToOverlay({ type: 'update-thread', thread: view });
		}
	}

	private renderAll(): void {
		const positions: OverlayThreadView[] = [];
		for (const thread of this.threads.values()) {
			const view = this.threadToView(thread);
			if (view) {
				positions.push(view);
			}
		}
		this.onSendToOverlay({ type: 'update-all', positions });
	}

	startDrawing(type: 'box' | 'arrow' = 'box'): Promise<ThreadAnchor | null> {
		return new Promise((resolve) => {
			this.drawing = true;
			this.drawResolve = resolve;
			this.drawStart = null;
			this.onSendToOverlay({ type: 'start-drawing', drawType: type });
		});
	}

	cancelDrawing(): void {
		this.drawing = false;
		this.drawStart = null;
		if (this.drawResolve) {
			this.drawResolve(null);
			this.drawResolve = null;
		}
		this.onSendToOverlay({ type: 'cancel-drawing' });
	}

	/**
	 * 处理 overlay iframe 回传的消息。由 PanelController 在 message 监听里调用。
	 */
	handleIframeMessage(msg: OverlayToParentMessage): void {
		if (!msg || typeof msg !== 'object') {
			return;
		}

		switch (msg.type) {
			case 'draw-start': {
				this.drawStart = { x: msg.screenX, y: msg.screenY };
				break;
			}
			case 'draw-move': {
				break;
			}
			case 'draw-end': {
				if (this.drawStart && this.drawResolve) {
					const start = this.drawStart;
					const end = { x: msg.screenX, y: msg.screenY };
					const bbox: BBox = {
						x: Math.min(start.x, end.x),
						y: Math.min(start.y, end.y),
						w: Math.abs(end.x - start.x),
						h: Math.abs(end.y - start.y),
					};
					if (bbox.w > 5 && bbox.h > 5) {
						const logicBBox = screenBBoxToLogic(bbox.x, bbox.y, bbox.w, bbox.h, this.view);
						const anchor: ThreadAnchor = {
							type: 'box',
							bbox: normalizeBBox(logicBBox),
						};
						this.drawResolve(anchor);
					}
					else {
						this.drawResolve(null);
					}
					this.drawResolve = null;
					this.drawStart = null;
					this.drawing = false;
				}
				break;
			}
			case 'draw-cancel': {
				this.cancelDrawing();
				break;
			}
			case 'thread-click': {
				for (const cb of this.onThreadClickCallbacks) {
					cb(msg.threadId);
				}
				break;
			}
		}
	}

	onThreadClick(callback: (threadId: string) => void): () => void {
		this.onThreadClickCallbacks.push(callback);
		return () => {
			const idx = this.onThreadClickCallbacks.indexOf(callback);
			if (idx >= 0) {
				this.onThreadClickCallbacks.splice(idx, 1);
			}
		};
	}

	highlightThread(threadId: string): void {
		this.onSendToOverlay({ type: 'highlight', threadId });
	}

	flashThread(threadId: string): void {
		this.onSendToOverlay({ type: 'flash', threadId });
	}
}
