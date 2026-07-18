/**
 * 统一的跨 iframe 消息协议类型定义。
 *
 * 通信三方：
 *   Parent (PanelController)  ──sendToPanel──▶  Panel iframe
 *   Parent (PanelController)  ──sendToOverlay──▶  Overlay iframe
 *   Panel iframe   ──postMessage──▶  Parent
 *   Overlay iframe ──postMessage──▶  Parent
 *
 * 每条消息都带 `source` 字段标识来源，Parent 用它路由。
 */

// ============ 消息来源标识 ============
export type MessageSource = 'cocomment-parent' | 'cocomment-panel' | 'cocomment-overlay' | 'cocomment-draw';

// ============ Parent → Panel 的消息 ============
export type PanelMessage =
	| { type: 'threads:update'; threads: import('./comment').CommentThread[]; comments: Record<string, import('./comment').Comment[]>; numbers: Record<string, number> }
	| { type: 'thread:created'; thread: import('./comment').CommentThread }
	| { type: 'thread:flash'; threadId: string }
	| { type: 'user:update'; user: import('./user').User }
	| { type: 'show' }
	| { type: 'hide' }
	| { type: 'request:refresh' };

// ============ Parent → Overlay 的消息 ============
export type OverlayMessage =
	| { type: 'update-thread'; thread: OverlayThreadView }
	| { type: 'update-all'; positions: OverlayThreadView[] }
	| { type: 'update-numbers'; numbers: Record<string, number> }
	| { type: 'remove-thread'; threadId: string }
	| { type: 'clear-all' }
	| { type: 'highlight'; threadId: string }
	| { type: 'flash'; threadId: string }
	| { type: 'show' }
	| { type: 'hide' }
	| { type: 'start-drawing'; drawType: 'box' | 'arrow' }
	| { type: 'cancel-drawing' };

/** Overlay 上单个批注框的视图数据（已转屏幕坐标） */
export interface OverlayThreadView {
	id: string;
	status: string;
	color: string;
	left: number;
	top: number;
	width: number;
	height: number;
}

// ============ Panel → Parent 的消息 ============
export type PanelToParentMessage =
	| { type: 'ready' }
	| { type: 'request:threads' }
	| { type: 'request:refresh' }
	| { type: 'thread-select'; threadId: string }
	| { type: 'action:add-comment' }
	| { type: 'action:add-comment-to-thread'; threadId: string; content: string }
	| { type: 'action:resolve-thread'; threadId: string }
	| { type: 'action:reopen-thread'; threadId: string }
	| { type: 'action:delete-thread'; threadId: string }
	| { type: 'action:delete-comment'; commentId: string }
	| { type: 'action:export' }
	| { type: 'action:import' }
	| { type: 'action:toggle-visible'; visible: boolean }
	| { type: 'action:set-user'; user: import('./user').User }
	| { type: 'action:request-user' };

// ============ Overlay → Parent 的消息 ============
export type OverlayToParentMessage =
	| { type: 'draw-start'; screenX: number; screenY: number }
	| { type: 'draw-move'; screenX: number; screenY: number }
	| { type: 'draw-end'; screenX: number; screenY: number }
	| { type: 'draw-cancel' }
	| { type: 'thread-click'; threadId: string };

// ============ Draw Dialog → Parent 的消息 ============
export type DrawToParentMessage =
	| { type: 'draw:ready' }
	| { type: 'draw:cancel' }
	| { type: 'draw:complete'; image: string; width: number; height: number };

// ============ Parent → Draw Dialog 的消息 ============
export type DrawMessage =
	| { type: 'draw:close' };

// ============ 带来源标识的包装 ============
export interface PanelInboundMessage extends PanelToParentMessage {
	source: 'cocomment-panel';
}

export interface OverlayInboundMessage extends OverlayToParentMessage {
	source: 'cocomment-overlay';
}

export interface DrawInboundMessage extends DrawToParentMessage {
	source: 'cocomment-draw';
}
