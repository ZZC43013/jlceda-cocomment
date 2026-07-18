/**
 * MessageBridge — 基于 eda.sys_MessageBus 的跨 context 通信桥。
 *
 * 真实 API（来自 easyeda-api skill references/classes/SYS_MessageBus.md）:
 *   publish(topic, message): void          — 广播给所有订阅者
 *   subscribe(topic, callbackFn): Task     — 持久订阅
 *   task.cancel(): void                    — 取消订阅
 *
 * 架构:
 *   parent（扩展主进程）↔ iframe（panel.html / annotation.html / draw.html）
 *   双方都能直接访问 eda.sys_MessageBus，用 topic 路由消息。
 *
 * Topic 约定:
 *   cocomment:to-panel    parent → panel iframe（状态更新、线程列表、用户变更）
 *   cocomment:to-overlay  parent → overlay iframe（批注位置更新、绘制指令）
 *   cocomment:to-draw     parent → draw iframe（关闭绘制窗口）
 *   cocomment:from-panel  panel iframe → parent（用户操作：发评论、解决、删除等）
 *   cocomment:from-overlay overlay iframe → parent（绘制完成、批注点击）
 *   cocomment:from-draw   draw iframe → parent（绘制完成、取消）
 *
 * 重复订阅防护：
 *   扩展重新导入时模块重载，旧的 subscribe task 引用丢失，但 EDA 的 MessageBus
 *   不会自动清理，导致每条消息触发 N 次（N=导入次数）。用 globalThis 保存 task 列表，
 *   新 MessageBridge 创建时先 cancel 所有旧 task，确保每个 topic 只有一个活跃订阅。
 */
import type { PanelMessage, OverlayMessage, DrawMessage, PanelInboundMessage, OverlayInboundMessage, DrawInboundMessage } from '../types/messages';

const TOPIC_TO_PANEL = 'cocomment:to-panel';
const TOPIC_TO_OVERLAY = 'cocomment:to-overlay';
const TOPIC_TO_DRAW = 'cocomment:to-draw';
const TOPIC_FROM_PANEL = 'cocomment:from-panel';
const TOPIC_FROM_OVERLAY = 'cocomment:from-overlay';
const TOPIC_FROM_DRAW = 'cocomment:from-draw';

/** globalThis 上保存的旧订阅 task 列表 key */
const GLOBAL_TASKS_KEY = '__cocomment_messagebus_tasks__';

/** 取消并清理上一次扩展实例遗留的所有订阅 task（防止重复导入导致消息重复触发） */
function cancelStaleTasks(): void {
	try {
		const tasks = (globalThis as any)[GLOBAL_TASKS_KEY] as Array<{ cancel?: () => void }> | undefined;
		if (Array.isArray(tasks)) {
			for (const t of tasks) {
				try {
					t.cancel?.();
				}
				catch (e) {
					// ignore
				}
			}
		}
	}
	catch (e) {
		// ignore
	}
	(globalThis as any)[GLOBAL_TASKS_KEY] = [];
}

/** 记录新 task 到 globalThis，供下次模块重载时清理 */
function trackTask(task: any): void {
	try {
		if (!Array.isArray((globalThis as any)[GLOBAL_TASKS_KEY])) {
			(globalThis as any)[GLOBAL_TASKS_KEY] = [];
		}
		(globalThis as any)[GLOBAL_TASKS_KEY].push(task);
	}
	catch (e) {
		// ignore
	}
}

export class MessageBridge {
	constructor() {
		// 构造时清理上一次扩展实例遗留的订阅，避免消息重复触发
		cancelStaleTasks();
	}

	/** 向 panel iframe 发消息 */
	sendToPanel(msg: PanelMessage): void {
		try {
			eda.sys_MessageBus.publish(TOPIC_TO_PANEL, msg);
		}
		catch (e) {
			console.warn('[CoComment] publish(to-panel) failed:', e);
		}
	}

	/** 向 overlay iframe 发消息 */
	sendToOverlay(msg: OverlayMessage): void {
		try {
			eda.sys_MessageBus.publish(TOPIC_TO_OVERLAY, msg);
		}
		catch (e) {
			console.warn('[CoComment] publish(to-overlay) failed:', e);
		}
	}

	/** 向 draw iframe 发消息 */
	sendToDraw(msg: DrawMessage): void {
		try {
			eda.sys_MessageBus.publish(TOPIC_TO_DRAW, msg);
		}
		catch (e) {
			console.warn('[CoComment] publish(to-draw) failed:', e);
		}
	}

	/** 监听来自 panel iframe 的用户操作 */
	onPanelMessage(callback: (msg: PanelInboundMessage) => void): () => void {
		try {
			const task = eda.sys_MessageBus.subscribe(TOPIC_FROM_PANEL, (msg: any) => {
				callback(msg as PanelInboundMessage);
			});
			trackTask(task);
			return () => {
				try {
					task.cancel?.();
				}
				catch (e) {
					// ignore
				}
			};
		}
		catch (e) {
			console.warn('[CoComment] subscribe(from-panel) failed:', e);
			return () => {};
		}
	}

	/** 监听来自 overlay iframe 的事件（绘制完成、批注点击） */
	onOverlayMessage(callback: (msg: OverlayInboundMessage) => void): () => void {
		try {
			const task = eda.sys_MessageBus.subscribe(TOPIC_FROM_OVERLAY, (msg: any) => {
				callback(msg as OverlayInboundMessage);
			});
			trackTask(task);
			return () => {
				try {
					task.cancel?.();
				}
				catch (e) {
					// ignore
				}
			};
		}
		catch (e) {
			console.warn('[CoComment] subscribe(from-overlay) failed:', e);
			return () => {};
		}
	}

	/** 监听来自 draw iframe 的事件（绘制完成、取消） */
	onDrawMessage(callback: (msg: DrawInboundMessage) => void): () => void {
		try {
			const task = eda.sys_MessageBus.subscribe(TOPIC_FROM_DRAW, (msg: any) => {
				callback(msg as DrawInboundMessage);
			});
			trackTask(task);
			return () => {
				try {
					task.cancel?.();
				}
				catch (e) {
					// ignore
				}
			};
		}
		catch (e) {
			console.warn('[CoComment] subscribe(from-draw) failed:', e);
			return () => {};
		}
	}

	/**
	 * 在 iframe 内调用：向 parent 发消息。
	 * 提供这个静态方法方便 iframe HTML 内联脚本使用。
	 */
	static sendToParent(msg: PanelInboundMessage | OverlayInboundMessage | DrawInboundMessage, source: 'panel' | 'overlay' | 'draw'): void {
		const topic = source === 'panel' ? TOPIC_FROM_PANEL : source === 'overlay' ? TOPIC_FROM_OVERLAY : TOPIC_FROM_DRAW;
		try {
			eda.sys_MessageBus.publish(topic, msg);
		}
		catch (e) {
			console.warn(`[CoComment] publish(${topic}) failed:`, e);
		}
	}

	/**
	 * 在 iframe 内调用：监听 parent 发来的消息。
	 */
	static onParentMessage(source: 'panel' | 'overlay' | 'draw', callback: (msg: any) => void): () => void {
		const topic = source === 'panel' ? TOPIC_TO_PANEL : source === 'overlay' ? TOPIC_TO_OVERLAY : TOPIC_TO_DRAW;
		try {
			const task = eda.sys_MessageBus.subscribe(topic, callback);
			return () => {
				try {
					task.cancel?.();
				}
				catch (e) {
					// ignore
				}
			};
		}
		catch (e) {
			console.warn(`[CoComment] subscribe(${topic}) failed:`, e);
			return () => {};
		}
	}
}
