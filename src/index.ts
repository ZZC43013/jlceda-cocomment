import * as extensionConfig from '../extension.json';
import { CommentEngine } from './core/CommentEngine';
import { AnnotationRenderer } from './core/AnnotationRenderer';
import { PanelController } from './ui/PanelController';
import { IframeManager } from './ui/IframeManager';
import { MessageBridge } from './ui/MessageBridge';

let engine: CommentEngine | null = null;
let renderer: AnnotationRenderer | null = null;
let panel: PanelController | null = null;
let iframes: IframeManager | null = null;
let bridge: MessageBridge | null = null;
let initialized = false;

async function ensureInitialized(): Promise<void> {
	if (initialized) {
		return;
	}
	initialized = true;

	engine = new CommentEngine();
	await engine.init('local');

	const user = engine.getCurrentUser();

	// MessageBridge：基于 eda.sys_MessageBus 的跨 context 通信桥
	// 主进程 ↔ panel/overlay iframe 都通过它收发消息，不再用 postMessage
	bridge = new MessageBridge();

	// IframeManager：管理 sys_IFrame 窗口（用 id 管理，不返回句柄）
	iframes = new IframeManager();

	// AnnotationRenderer：通过 bridge.sendToOverlay 把渲染指令转发给 overlay iframe
	renderer = new AnnotationRenderer(
		{ user, pageType: 'pcb' },
		(msg) => bridge!.sendToOverlay(msg),
	);
	await renderer.init();

	// PanelController：业务编排 + 消息路由中枢，注入 bridge 让它收发 iframe 消息
	panel = new PanelController(engine, renderer, iframes, bridge);
	await panel.init();
}

export function activate(status?: 'onStartupFinished', arg?: string): void {
	console.log('[CoComment] activate() called, status=', status);
	// 关闭可能存在的旧 iframe（避免旧版本遗留的 overlay/panel 遮挡页面）
	// closeIFrame() 不传 id 会关闭本扩展打开的所有内联框架窗口
	try {
		void eda.sys_IFrame.closeIFrame();
		console.log('[CoComment] closed stale iframes on activate');
	}
	catch (e) {
		console.warn('[CoComment] closeIFrame on activate failed:', e);
	}
	void ensureInitialized().then(() => {
		console.log('[CoComment] ensureInitialized() done');
	}).catch((e) => {
		console.error('[CoComment] ensureInitialized() failed:', e);
	});
	void arg;
	void status;
}

export function about(): void {
	console.log('[CoComment] about() called');
	// eda.sys_Dialog 是真实 API（easyeda-api skill references/classes/SYS_Dialog.md 收录）
	// 之前用 (eda as any).sys_Dialog 是因为 npm 类型定义滞后未收录，现直接调用
	try {
		eda.sys_Dialog.showInformationMessage(
			`CoComment v${extensionConfig.version}`,
			'About',
		);
	}
	catch (e) {
		console.warn('[CoComment] about() failed:', e);
	}
}

export async function togglePanel(): Promise<void> {
	console.log('[CoComment] togglePanel() called');
	await ensureInitialized();
	if (panel) {
		await panel.togglePanel();
	}
}

export async function addAnnotation(): Promise<void> {
	console.log('[CoComment] addAnnotation() called');
	await ensureInitialized();
	if (!panel) {
		return;
	}
	// 委托给面板控制器：绘制 → 创建空 thread → 通知面板 focus 输入框
	try {
		await panel.startDrawing();
	}
	catch (e) {
		console.warn('[CoComment] addAnnotation failed:', e);
	}
}

export async function exportComments(): Promise<void> {
	console.log('[CoComment] exportComments() called');
	await ensureInitialized();
	if (!panel) {
		return;
	}
	// 统一走 PanelController 的导出逻辑，避免与 panel 按钮导出代码重复
	await panel.exportComments();
}

export async function importComments(): Promise<void> {
	console.log('[CoComment] importComments() called');
	await ensureInitialized();
	if (!panel) {
		return;
	}
	await panel.importComments();
}

export async function toggleAnnotations(): Promise<void> {
	console.log('[CoComment] toggleAnnotations() called');
	await ensureInitialized();
	if (!panel) {
		return;
	}
	panel.toggleAnnotationVisible();
}

/**
 * 方案B：把当前工程所有评论写入工程文档源码（标记块注入）。
 * 靠 EDA 自身的工程同步机制传播给团队成员。
 */
export async function syncToProject(): Promise<void> {
	console.log('[CoComment] syncToProject() called');
	await ensureInitialized();
	if (!panel) {
		return;
	}
	try {
		await panel.syncToProject();
	}
	catch (e) {
		console.warn('[CoComment] syncToProject failed:', e);
	}
}

/**
 * 方案B：从工程文档源码读取评论数据并恢复到本地。
 */
export async function syncFromProject(): Promise<void> {
	console.log('[CoComment] syncFromProject() called');
	await ensureInitialized();
	if (!panel) {
		return;
	}
	try {
		await panel.syncFromProject();
	}
	catch (e) {
		console.warn('[CoComment] syncFromProject failed:', e);
	}
}

/**
 * 紧急恢复：用上次 syncToProject 备份的原始源码覆盖当前文档源码。
 */
export async function restoreProjectBackup(): Promise<void> {
	console.log('[CoComment] restoreProjectBackup() called');
	await ensureInitialized();
	if (!panel) {
		return;
	}
	try {
		await panel.restoreProjectBackup();
	}
	catch (e) {
		console.warn('[CoComment] restoreProjectBackup failed:', e);
	}
}
