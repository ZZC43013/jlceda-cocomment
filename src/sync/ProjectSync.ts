import type { ProjectData } from '../types/sync';

/**
 * ProjectSync — 方案B：把评论数据序列化进工程文档源码，靠 EDA 自身的工程同步机制传播。
 *
 * 核心思路：
 *   1. 调用 eda.sys_FileManager.getDocumentSource() 读取当前文档（sch/pcb）源码
 *   2. 在源码末尾追加一个独特的标记块，内含 base64 编码的评论数据 JSON
 *   3. 调用 eda.sys_FileManager.setDocumentSource() 写回
 *   4. 团队成员打开同一工程时，文档源码会随 EDA 工程同步机制传播，
 *      调用 syncFromProject() 即可从源码中提取评论数据并恢复
 *
 * 标记块格式：
 *   \n%%COCOMMENT_V1:<base64-json>%%\n
 *
 * 安全设计：
 *   - 标记块只追加在源码末尾，不修改原始设计数据
 *   - base64 内容仅含 [A-Za-z0-9+/=]，不会破坏源码中的字符串
 *   - syncToProject 前会把原始源码备份到 sys_Storage，万一出问题可恢复
 *   - 写入前先删除旧标记块，再追加新标记块，避免重复
 *
 * ⚠️ 已知风险：
 *   - setDocumentSource 是 BETA API，行为可能不稳定
 *   - 若 EDA 文档源码是严格 JSON，末尾追加非 JSON 内容可能导致解析失败
 *   - 调用前必须由上层（PanelController）弹窗让用户确认
 *
 * 真实 API（来自 easyeda-api skill references/classes/SYS_FileManager.md）:
 *   - getDocumentSource(): Promise<string | undefined>  (BETA)
 *   - setDocumentSource(source: string): Promise<boolean>  (BETA)
 *   - 需要「工程设计图 > 文件导出」权限
 */

const MARKER_BEGIN = '%%COCOMMENT_V1:';
const MARKER_END = '%%';
/** 匹配标记块（base64 内容仅含 A-Za-z0-9+/=）。% 在正则中非特殊字符，可直接拼接 */
const MARKER_REGEX = new RegExp(
	'\\n?' + MARKER_BEGIN + '([A-Za-z0-9+/=]*)' + MARKER_END + '\\n?',
	'g',
);

/** 备份原始源码用的 storage key */
const BACKUP_KEY = 'cocomment_source_backup_v1';

export interface SyncResult {
	success: boolean;
	message: string;
	/** 写入的标记块字节数（仅 syncToProject 成功时有效） */
	payloadSize?: number;
	/** 提取到的评论数据（仅 syncFromProject 成功时有效） */
	data?: ProjectData | null;
}

export class ProjectSync {
	/**
	 * 把评论数据序列化注入当前文档源码。
	 *
	 * 流程：
	 *   1. getDocumentSource 读取原始源码
	 *   2. 备份原始源码到 sys_Storage（用于恢复）
	 *   3. 删除旧标记块（若有）
	 *   4. 追加新标记块（base64 编码的 JSON）
	 *   5. setDocumentSource 写回
	 *
	 * @param data 当前工程的评论数据
	 */
	async syncToProject(data: ProjectData): Promise<SyncResult> {
		try {
			// 1. 读取当前文档源码
			const originalSource = await this.getDocumentSourceSafe();
			if (originalSource === null) {
				return {
					success: false,
					message: '无法获取当前文档源码（可能未打开 sch/pcb 文档，或缺少「工程设计图 > 文件导出」权限）',
				};
			}

			// 2. 备份原始源码（用于异常恢复）
			this.backupOriginalSource(originalSource);

			// 3. 删除旧标记块，追加新标记块
			const cleanSource = this.stripMarker(originalSource);
			const payload = this.encodeData(data);
			const newSource = cleanSource + '\n' + MARKER_BEGIN + payload + MARKER_END + '\n';

			// 4. 写回
			const ok = await this.setDocumentSourceSafe(newSource);
			if (!ok) {
				return {
					success: false,
					message: 'setDocumentSource 返回 false（源码格式可能被 EDA 拒绝，已保留备份可手动恢复）',
				};
			}

			return {
				success: true,
				message: `评论已写入工程文档（${payload.length} 字节 base64 数据），团队成员打开本工程后可「从工程读取」恢复`,
				payloadSize: payload.length,
			};
		}
		catch (e) {
			return {
				success: false,
				message: 'syncToProject 异常: ' + (e instanceof Error ? e.message : String(e)),
			};
		}
	}

	/**
	 * 从当前文档源码读取并反序列化评论数据。
	 *
	 * 流程：
	 *   1. getDocumentSource 读取源码
	 *   2. 用正则提取标记块
	 *   3. base64 解码 + JSON.parse 还原 ProjectData
	 *
	 * @returns 评论数据；若源码中无标记块或解析失败，返回 null
	 */
	async syncFromProject(): Promise<SyncResult> {
		try {
			const source = await this.getDocumentSourceSafe();
			if (source === null) {
				return {
					success: false,
					message: '无法获取当前文档源码（可能未打开 sch/pcb 文档）',
				};
			}

			const payload = this.extractMarker(source);
			if (payload === null) {
				return {
					success: false,
					message: '当前文档源码中未发现 CoComment 评论数据标记块（可能是尚未同步，或文档已被他人重新保存覆盖）',
					data: null,
				};
			}

			const data = this.decodeData(payload);
			if (data === null) {
				return {
					success: false,
					message: '标记块数据反序列化失败（base64 或 JSON 解析出错）',
					data: null,
				};
			}

			return {
				success: true,
				message: `已从工程文档读取评论数据（${data.threads.length} 个线程）`,
				data,
			};
		}
		catch (e) {
			return {
				success: false,
				message: 'syncFromProject 异常: ' + (e instanceof Error ? e.message : String(e)),
			};
		}
	}

	/**
	 * 检查当前文档源码中是否含 CoComment 标记块（不解析，只判断存在性）。
	 */
	async peekFromProject(): Promise<boolean> {
		const source = await this.getDocumentSourceSafe();
		if (source === null) {
			return false;
		}
		return this.extractMarker(source) !== null;
	}

	/**
	 * 恢复上次 syncToProject 备份的原始源码（紧急恢复用）。
	 * 注意：恢复后当前评论数据标记块会丢失，但设计数据回到写入前状态。
	 */
	async restoreBackup(): Promise<SyncResult> {
		try {
			const backup = this.loadBackup();
			if (backup === null) {
				return {
					success: false,
					message: '没有可恢复的源码备份（可能从未执行过 syncToProject，或备份已被清除）',
				};
			}
			const ok = await this.setDocumentSourceSafe(backup);
			if (!ok) {
				return {
					success: false,
					message: '恢复备份时 setDocumentSource 返回 false',
				};
			}
			// 恢复成功后清除备份
			this.clearBackup();
			return {
				success: true,
				message: '已恢复到 syncToProject 之前的源码状态',
			};
		}
		catch (e) {
			return {
				success: false,
				message: 'restoreBackup 异常: ' + (e instanceof Error ? e.message : String(e)),
			};
		}
	}

	// ============ 内部工具方法 ============

	/**
	 * 安全调用 getDocumentSource。
	 * 返回 null 表示获取失败或无文档。
	 */
	private async getDocumentSourceSafe(): Promise<string | null> {
		try {
			const fm = (eda as any).sys_FileManager;
			if (!fm || typeof fm.getDocumentSource !== 'function') {
				console.warn('[CoComment] eda.sys_FileManager.getDocumentSource 不可用');
				return null;
			}
			const source = await fm.getDocumentSource();
			if (source === undefined || source === null || source === '') {
				return null;
			}
			return source;
		}
		catch (e) {
			console.warn('[CoComment] getDocumentSource 调用异常:', e);
			return null;
		}
	}

	/**
	 * 安全调用 setDocumentSource。
	 */
	private async setDocumentSourceSafe(source: string): Promise<boolean> {
		try {
			const fm = (eda as any).sys_FileManager;
			if (!fm || typeof fm.setDocumentSource !== 'function') {
				console.warn('[CoComment] eda.sys_FileManager.setDocumentSource 不可用');
				return false;
			}
			const ok = await fm.setDocumentSource(source);
			return ok === true;
		}
		catch (e) {
			console.warn('[CoComment] setDocumentSource 调用异常:', e);
			return false;
		}
	}

	/**
	 * 删除源码中的 CoComment 标记块（用于写入前清理旧数据）。
	 */
	private stripMarker(source: string): string {
		return source.replace(MARKER_REGEX, '');
	}

	/**
	 * 从源码中提取标记块的 base64 payload。
	 * 返回 null 表示未找到。
	 */
	private extractMarker(source: string): string | null {
		const match = new RegExp(MARKER_REGEX.source).exec(source);
		if (!match || !match[1]) {
			return null;
		}
		return match[1];
	}

	/**
	 * 把 ProjectData 序列化为 base64 字符串。
	 * 优先用 Buffer（Node 主进程），降级到 btoa（iframe/浏览器环境），
	 * 再降级到 hex（纯 JS 实现，不依赖任何宿主 API）。
	 */
	private encodeData(data: ProjectData): string {
		const json = JSON.stringify(data);
		// 1. 优先 Buffer（Node 主进程）
		try {
			if (typeof Buffer !== 'undefined') {
				return Buffer.from(json, 'utf8').toString('base64');
			}
		}
		catch (e) { void e; }
		// 2. 降级 btoa（浏览器/iframe）
		try {
			if (typeof btoa === 'function') {
				return btoa(unescape(encodeURIComponent(json)));
			}
		}
		catch (e) { void e; }
		// 3. 最终降级 hex（纯 JS）
		return 'hex:' + this.stringToHex(json);
	}

	/**
	 * 把 base64 字符串反序列化为 ProjectData。
	 * 自动识别 'hex:' 前缀走 hex 解码，否则走 base64。
	 */
	private decodeData(payload: string): ProjectData | null {
		try {
			let json: string;
			if (payload.startsWith('hex:')) {
				json = this.hexToString(payload.slice(5));
			}
			else {
				// 优先 Buffer
				try {
					if (typeof Buffer !== 'undefined') {
						json = Buffer.from(payload, 'base64').toString('utf8');
					}
					else if (typeof atob === 'function') {
						json = decodeURIComponent(escape(atob(payload)));
					}
					else {
						json = this.hexToString(this.base64ToHex(payload));
					}
				}
				catch (e) {
					return null;
				}
			}
			const data = JSON.parse(json) as ProjectData;
			// 基本结构校验
			if (!data || !Array.isArray(data.threads) || typeof data.comments !== 'object') {
				return null;
			}
			return data;
		}
		catch (e) {
			return null;
		}
	}

	private stringToHex(str: string): string {
		let hex = '';
		for (let i = 0; i < str.length; i++) {
			const code = str.charCodeAt(i);
			if (code < 0x80) {
				hex += code.toString(16).padStart(2, '0');
			}
			else {
				// 非 ASCII 用 encodeURIComponent 转 UTF-8 字节序列再转 hex
				const encoded = encodeURIComponent(str.charAt(i));
				for (let j = 0; j < encoded.length; j++) {
					if (encoded.charAt(j) === '%') {
						hex += encoded.substr(j + 1, 2).toLowerCase();
						j += 2;
					}
					else {
						hex += encoded.charCodeAt(j).toString(16).padStart(2, '0');
					}
				}
			}
		}
		return hex;
	}

	private hexToString(hex: string): string {
		let str = '';
		for (let i = 0; i < hex.length; i += 2) {
			str += String.fromCharCode(parseInt(hex.substr(i, 2), 16));
		}
		try {
			return decodeURIComponent(escape(str));
		}
		catch (e) {
			return str;
		}
	}

	private base64ToHex(b64: string): string {
		// 简易 base64 → hex（仅作为无 Buffer/atob 时的兜底）
		const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
		let hex = '';
		let buffer = 0;
		let bits = 0;
		for (let i = 0; i < b64.length; i++) {
			const c = b64.charAt(i);
			if (c === '=') { break; }
			const val = chars.indexOf(c);
			if (val < 0) { continue; }
			buffer = (buffer << 6) | val;
			bits += 6;
			if (bits >= 8) {
				bits -= 8;
				hex += ((buffer >> bits) & 0xff).toString(16).padStart(2, '0');
			}
		}
		return hex;
	}

	// ============ 源码备份（sys_Storage） ============

	private backupOriginalSource(source: string): void {
		try {
			eda.sys_Storage.setExtensionUserConfig(BACKUP_KEY, {
				source,
				timestamp: Date.now(),
			});
		}
		catch (e) {
			console.warn('[CoComment] 备份原始源码失败:', e);
		}
	}

	private loadBackup(): string | null {
		try {
			const raw = eda.sys_Storage.getExtensionUserConfig(BACKUP_KEY);
			if (raw && typeof raw === 'object' && typeof raw.source === 'string') {
				return raw.source;
			}
		}
		catch (e) {
			console.warn('[CoComment] 读取源码备份失败:', e);
		}
		return null;
	}

	private clearBackup(): void {
		try {
			void eda.sys_Storage.setExtensionUserConfig(BACKUP_KEY, null);
		}
		catch (e) {
			void e;
		}
	}
}
