import type { CommentThread } from '../types/comment';

/**
 * Navigator — 负责把视图定位到指定 thread 的锚点位置。
 *
 * 真实 API（来自 easyeda-api skill references/classes/PCB_Document.md）:
 *   navigateToCoordinates(x, y): Promise<boolean>
 *     - 定位到画布坐标（数据层面坐标）
 *     - 此处的单位为数据层面单位，在跨度上等同于画布层面的 mil
 *
 * 注：闪烁面板卡片由 PanelController.handleThreadSelect 直接通过
 * bridge.sendToPanel({ type: 'thread:flash' }) 完成。
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
				// navigateToCoordinates：定位到数据层面坐标（不是 zoomTo，zoomTo 不存在）
				if (typeof doc.navigateToCoordinates === 'function') {
					await doc.navigateToCoordinates(centerX, centerY);
				}
			}
		}
		catch (e) {
			console.warn('[CoComment] jumpToThread failed:', e);
		}
	}
}
