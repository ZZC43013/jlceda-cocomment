import type { PageType } from '../types/comment';

/**
 * 工程上下文工具 — 从 EDA 获取当前工程和文档信息。
 *
 * 真实 API（来自 easyeda-api skill references）:
 *   - eda.sys_DocumentTree.getCurrentProjectInfo(): Promise<IDMT_ProjectItem | undefined>
 *     返回当前打开且拥有最后输入焦点的原理图/PCB/面板所关联的工程
 *   - IDMT_ProjectItem 含 uuid / friendlyName / teamUuid / data（文档列表）
 *
 * 用于为每个工程提供独立的评论区：
 *   - projectId = 工程 UUID（跨设备稳定，唯一标识一个工程）
 *   - pageId = 当前文档 UUID（区分工程内不同 sch/pcb 页面）
 *   - pageType = 当前文档类型（sch / pcb）
 */
export interface ProjectContextInfo {
	/** 工程 UUID，作为 LocalSync 的 projectId */
	projectId: string;
	/** 工程友好名称（用于 UI 展示） */
	projectName: string;
	/** 当前文档 UUID，作为 pageId */
	pageId: string;
	/** 当前文档类型 */
	pageType: PageType;
	/** 所属团队 UUID */
	teamUuid?: string;
}

const FALLBACK_PROJECT_ID = 'default';
const FALLBACK_PROJECT_NAME = '默认工程';
const FALLBACK_PAGE_ID = 'default';

/**
 * 获取当前工程上下文。
 * 如果 EDA 未打开工程或 API 异常，返回 fallback 默认值（保证扩展不崩）。
 */
export async function getCurrentProjectContext(): Promise<ProjectContextInfo> {
	try {
		// 1. 获取当前工程信息
		const projectInfo = await eda.sys_DocumentTree.getCurrentProjectInfo();
		if (!projectInfo || !projectInfo.uuid) {
			console.warn('[CoComment] getCurrentProjectInfo 返回空，使用 fallback');
			return fallbackContext();
		}

		const projectId = projectInfo.uuid;
		const projectName = projectInfo.friendlyName || projectInfo.name || FALLBACK_PROJECT_NAME;
		const teamUuid = projectInfo.teamUuid;

		// 2. 推断当前页面（文档）类型和 ID
		// getCurrentProjectInfo 返回 data 数组，含工程内所有文档
		// 这里简化处理：用工程 UUID 作为 pageId 的一部分（因为无法精确知道当前焦点文档）
		// 后续如果 EDA 暴露 getCurrentDocument 之类的 API 可再细化
		const pageId = projectId; // 暂用工程 UUID 作为 pageId（同一工程内共享评论区）
		const pageType = inferPageType();

		console.log('[CoComment] 工程上下文:', { projectId, projectName, pageId, pageType, teamUuid });

		return {
			projectId,
			projectName,
			pageId,
			pageType,
			teamUuid,
		};
	}
	catch (e) {
		console.warn('[CoComment] getCurrentProjectContext 失败，使用 fallback:', e);
		return fallbackContext();
	}
}

/**
 * 推断当前页面类型（sch / pcb）。
 *
 * 通过检测 eda.sch_Document / eda.pcb_Document 是否可用来判断。
 * 如果都不存在，默认 pcb（保持向后兼容）。
 */
function inferPageType(): PageType {
	try {
		// 优先检测 pcb_Document（当前批注渲染主要支持 PCB）
		if (eda.pcb_Document) {
			return 'pcb';
		}
		if (eda.sch_Document) {
			return 'sch';
		}
	}
	catch (e) {
		void e;
	}
	return 'pcb';
}

function fallbackContext(): ProjectContextInfo {
	return {
		projectId: FALLBACK_PROJECT_ID,
		projectName: FALLBACK_PROJECT_NAME,
		pageId: FALLBACK_PAGE_ID,
		pageType: 'pcb',
	};
}
