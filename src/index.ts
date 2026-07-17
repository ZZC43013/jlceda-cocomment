import * as extensionConfig from '../extension.json';
import { CommentEngine } from './core/CommentEngine';
import { AnnotationRenderer } from './core/AnnotationRenderer';
import { PanelController } from './ui/PanelController';
import { IframeManager } from './ui/IframeManager';

let engine: CommentEngine | null = null;
let renderer: AnnotationRenderer | null = null;
let panel: PanelController | null = null;
let iframes: IframeManager | null = null;
let initialized = false;

async function ensureInitialized(): Promise<void> {
	if (initialized) {
		return;
	}
	initialized = true;

	engine = new CommentEngine();
	await engine.init('local');

	const user = engine.getCurrentUser();
	// AnnotationRenderer 不再依赖 ISyncProvider，改为通过 IframeManager 转发渲染指令
	iframes = new IframeManager();
	renderer = new AnnotationRenderer(
		{ user, pageType: 'pcb' },
		(msg) => iframes!.sendToOverlay(msg),
	);
	await renderer.init();

	panel = new PanelController(engine, renderer, iframes);
	await panel.init();
}

export function activate(status?: 'onStartupFinished', arg?: string): void {
	void ensureInitialized();
	void arg;
	void status;
}

export function about(): void {
	// eda.sys_Dialog 来自脚手架示例，类型定义文件未收录
	const dialog: any = (eda as any).sys_Dialog;
	if (dialog && typeof dialog.showInformationMessage === 'function') {
		dialog.showInformationMessage(
			`CoComment v${extensionConfig.version}`,
			'About',
		);
	}
	else {
		console.log(`[CoComment] v${extensionConfig.version}`);
	}
}

export async function togglePanel(): Promise<void> {
	await ensureInitialized();
	if (panel) {
		panel.togglePanel();
	}
}

export async function addAnnotation(): Promise<void> {
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
	await ensureInitialized();
	if (!panel) {
		return;
	}
	// 统一走 PanelController 的导出逻辑，避免与 panel 按钮导出代码重复
	await panel.exportComments();
}

export async function importComments(): Promise<void> {
	await ensureInitialized();
	if (!panel) {
		return;
	}
	await panel.importComments();
}

export async function toggleAnnotations(): Promise<void> {
	await ensureInitialized();
	if (!panel) {
		return;
	}
	panel.toggleAnnotationVisible();
}
