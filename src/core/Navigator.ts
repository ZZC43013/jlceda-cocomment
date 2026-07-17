import type { CommentThread } from '../types/comment';

/**
 * Navigator — 负责把视图定位到指定 thread 的锚点位置。
 *
 * 注：闪烁面板卡片由 PanelController.handleThreadSelect 直接通过
 * IframeManager.sendToPanel({ type: 'thread:flash' }) 完成，
 * Navigator 不再发 CustomEvent（之前的 flashThread 是死代码，无人监听）。
 */
export class Navigator {
	async jumpToThread(thread: CommentThread): Promise<void> {
		if (!thread.anchor.bbox) {
			return;
		}

		const bbox = thread.anchor.bbox;
		const centerX = bbox.x + bbox.w / 2;
		const centerY = bbox.y + bbox.h / 2;

		try {
			// 仅 PCB 文档支持（SCH_Document 未在类型定义中暴露）
			if (thread.pageType === 'pcb') {
				const doc = eda.pcb_Document;
				if (!doc) {
					return;
				}
				// zoomTo 同时完成定位+缩放：scaleRatio 单位 1/100，150 = 150%
				if (typeof doc.zoomTo === 'function') {
					await doc.zoomTo(centerX, centerY, 150);
				}
			}
		}
		catch (e) {
			console.warn('[CoComment] jumpToThread failed:', e);
		}
	}
}
