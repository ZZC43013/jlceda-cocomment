import type { CommentThread, ThreadAnchor, PageType, BBox } from '../types/comment';
import type { OverlayMessage, OverlayToParentMessage, OverlayThreadView } from '../types/messages';
import type { User } from '../types/user';

export interface AnnotationRendererOptions {
	user: User;
	pageType: PageType;
}

const TIMER_ID = 'cocomment-view-poll';
const POLL_INTERVAL = 250; // ms

/**
 * 批注渲染器 — 只负责：
 *  1. 用 eda.sys_Timer 定时轮询，把 thread 的数据坐标通过 eda.pcb_Document.convertDataOriginToCanvasOrigin
 *     转成画布像素坐标，再通过 onSendToOverlay 回调交给上层（PanelController）转发给 overlay iframe
 *  2. 处理 overlay iframe 回传的绘制/点击消息
 *
 * 重要认知修正（基于 easyeda-api skill 权威文档）:
 *  - pcb_Document.zoomTo() 不存在！不能用来获取当前视图区域
 *  - 主进程没有 window、document、requestAnimationFrame → 用 eda.sys_Timer.setIntervalTimer
 *  - 主进程没有 window.innerWidth → 用 eda.sys_Window.getViewportSize()
 *  - 坐标换算用 eda.pcb_Document.convertDataOriginToCanvasOrigin / convertCanvasOriginToDataOrigin
 *
 * 已知限制（需 PoC 验证）:
 *  - sys_IFrame.openIFrame 打开的是 Dialog 窗口，不是透明画布覆盖层
 *    overlay iframe 中的批注框坐标是"画布像素坐标"，但 overlay 是独立浮窗，
 *    所以批注框不会精确覆盖在画布元素上。要让批注框真正覆盖画布元素，
 *    需要未来 EDA 提供透明覆盖层 API，或改用画布图元（PCB_Primitive）绘制标记。
 */
export class AnnotationRenderer {
	private user: User;
	private pageType: PageType;
	private threads: Map<string, CommentThread> = new Map();
	private visible = false;
	private drawing = false;
	private drawStart: { x: number; y: number } | null = null;
	private drawResolve: ((anchor: ThreadAnchor | null) => void) | null = null;
	private onThreadClickCallbacks: Array<(threadId: string) => void> = [];
	private timerRunning = false;
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
		this.stopViewPolling();
		this.threads.clear();
	}

	/**
	 * 用 eda.sys_Timer.setIntervalTimer 设置循环定时器（主进程没有 requestAnimationFrame）。
	 * 定时把 thread 的数据坐标转成画布像素坐标，推送给 overlay iframe。
	 */
	private setupViewPolling(): void {
		if (this.timerRunning) {
			return;
		}
		try {
			// eda.sys_Timer.setIntervalTimer(id, timeout, callFn, ...args)
			// 如果遇到 ID 重复的定时器，之前设置的将被清除
			eda.sys_Timer.setIntervalTimer(TIMER_ID, POLL_INTERVAL, () => {
				void this.pollOnce();
			});
			this.timerRunning = true;
		}
		catch (e) {
			console.warn('[CoComment] sys_Timer.setIntervalTimer failed:', e);
		}
	}

	private stopViewPolling(): void {
		if (!this.timerRunning) {
			return;
		}
		try {
			eda.sys_Timer.clearIntervalTimer(TIMER_ID);
		}
		catch (e) {
			// ignore
		}
		this.timerRunning = false;
	}

	/**
	 * 一次轮询：把所有 thread 的数据坐标转成画布像素坐标，发给 overlay。
	 * 用 viewKey 去重（坐标没变就不重发）。
	 */
	private async pollOnce(): Promise<void> {
		if (!this.visible || this.threads.size === 0) {
			return;
		}
		try {
			const positions = await this.computeAllPositions();
			if (positions.length === 0) {
				return;
			}
			// 用序列化对比避免无变化时的重复推送
			const viewKey = positions.map(p => `${p.id}:${p.left},${p.top},${p.width},${p.height}`).join('|');
			if (viewKey !== this.lastViewKey) {
				this.lastViewKey = viewKey;
				this.onSendToOverlay({ type: 'update-all', positions });
			}
		}
		catch (e) {
			// 静默失败，下次重试
		}
	}

	/**
	 * 用 eda.pcb_Document.convertDataOriginToCanvasOrigin 把每个 thread 的 bbox 角点
	 * 从数据坐标转成画布像素坐标。EDA 的 Y 轴向上为正，画布像素 Y 轴向下为正。
	 */
	private async computeAllPositions(): Promise<OverlayThreadView[]> {
		const doc = this.pageType === 'pcb' ? eda.pcb_Document : undefined;
		if (!doc || typeof doc.convertDataOriginToCanvasOrigin !== 'function') {
			return [];
		}

		const positions: OverlayThreadView[] = [];
		for (const thread of this.threads.values()) {
			if (!thread.anchor.bbox) {
				continue;
			}
			try {
				const bbox = thread.anchor.bbox;
				// 数据坐标：左下角 (x, y) 和右上角 (x+w, y+h)
				// convertDataOriginToCanvasOrigin 返回画布像素坐标 {x, y}
				const bottomLeft = await doc.convertDataOriginToCanvasOrigin(bbox.x, bbox.y);
				const topRight = await doc.convertDataOriginToCanvasOrigin(bbox.x + bbox.w, bbox.y + bbox.h);

				// 画布像素坐标：左上角取 min，宽高取绝对值
				const left = Math.min(bottomLeft.x, topRight.x);
				const top = Math.min(bottomLeft.y, topRight.y);
				const width = Math.abs(topRight.x - bottomLeft.x);
				const height = Math.abs(topRight.y - bottomLeft.y);

				positions.push({
					id: thread.id,
					status: thread.status,
					color: this.user.color,
					left,
					top,
					width,
					height,
				});
			}
			catch (e) {
				// 单个 thread 转换失败，跳过
			}
		}
		return positions;
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
		// 立即触发一次轮询渲染新 thread，不等下一个定时周期
		void this.pollOnce();
	}

	updateThread(thread: CommentThread): void {
		this.threads.set(thread.id, thread);
		void this.pollOnce();
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
		void this.pollOnce();
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
	 * 处理 overlay iframe 回传的消息。由 PanelController 在 onOverlayMessage 监听里调用。
	 * draw-end 时把 overlay 屏幕坐标（overlay iframe 内的像素坐标）通过
	 * eda.pcb_Document.convertCanvasOriginToDataOrigin 转成数据坐标作为 anchor。
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
						// 把 overlay 屏幕坐标转成数据坐标作为 anchor
						void this.anchorFromScreenBBox(bbox);
					}
					else {
						this.drawResolve(null);
						this.drawResolve = null;
						this.drawStart = null;
						this.drawing = false;
					}
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

	/**
	 * 把 overlay 屏幕坐标的 bbox 转成数据坐标的 anchor。
	 * 用 eda.pcb_Document.convertCanvasOriginToDataOrigin。
	 * 注意：overlay 是独立 Dialog 窗口，其坐标不是画布坐标，这里只是尽力转换。
	 */
	private async anchorFromScreenBBox(bbox: BBox): Promise<void> {
		if (!this.drawResolve) {
			return;
		}
		const doc = this.pageType === 'pcb' ? eda.pcb_Document : undefined;
		if (!doc || typeof doc.convertCanvasOriginToDataOrigin !== 'function') {
			// 无转换 API，直接用屏幕坐标作为 anchor（不可导航）
			const anchor: ThreadAnchor = { type: 'box', bbox };
			this.drawResolve(anchor);
			this.drawResolve = null;
			this.drawStart = null;
			this.drawing = false;
			return;
		}
		try {
			const bl = await doc.convertCanvasOriginToDataOrigin(bbox.x, bbox.y + bbox.h);
			const tr = await doc.convertCanvasOriginToDataOrigin(bbox.x + bbox.w, bbox.y);
			const logicBBox: BBox = {
				x: Math.min(bl.x, tr.x),
				y: Math.min(bl.y, tr.y),
				w: Math.abs(tr.x - bl.x),
				h: Math.abs(tr.y - bl.y),
			};
			const anchor: ThreadAnchor = { type: 'box', bbox: logicBBox };
			this.drawResolve(anchor);
		}
		catch (e) {
			// 转换失败，用屏幕坐标兜底
			const anchor: ThreadAnchor = { type: 'box', bbox };
			this.drawResolve(anchor);
		}
		finally {
			this.drawResolve = null;
			this.drawStart = null;
			this.drawing = false;
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
