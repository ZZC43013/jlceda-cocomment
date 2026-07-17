const zhHans: Record<string, string> = {
	'app.name': 'CoComment',
	'menu.showPanel': '显示评论面板',
	'menu.hidePanel': '隐藏评论面板',
	'menu.addComment': '添加批注',
	'menu.export': '导出评论',
	'menu.import': '导入评论',
	'menu.settings': '设置',
	'panel.title': 'CoComment 评论',
	'panel.search': '搜索评论...',
	'panel.filterAll': '全部',
	'panel.filterOpen': '未解决',
	'panel.filterResolved': '已解决',
	'panel.empty': '暂无评论，点击工具栏添加批注',
	'panel.threadCount': '共 {count} 条评论线程',
	'comment.placeholder': '输入评论内容，按 Enter 发送...',
	'comment.submit': '发送',
	'comment.resolve': '标记已解决',
	'comment.reopen': '重新打开',
	'comment.delete': '删除',
	'comment.resolved': '已解决',
	'comment.open': '未解决',
	'comment.by': 'by {name}',
	'comment.ago': '刚刚',
	'draw.mode': '批注模式：在画布上拖拽绘制批注框',
	'draw.cancel': '按 ESC 取消',
	'status.exportSuccess': '评论已导出',
	'status.importSuccess': '评论已导入',
	'status.importFailed': '导入失败：文件格式不正确',
};

const langMap: Record<string, Record<string, string>> = {
	'zh-Hans': zhHans,
	en: zhHans,
};

let currentLang = 'zh-Hans';

export function setLanguage(lang: string): void {
	currentLang = lang;
}

/**
 * 翻译。命名占位符成对传入，例如 t('panel.threadCount', 'count', '5')
 * 会把字典里的 {count} 替换为 5。
 *
 * 字典写法：'panel.threadCount': '共 {count} 条评论线程'
 * 调用：t('panel.threadCount', 'count', String(n))
 */
export function t(key: string, ...args: string[]): string {
	const dict = langMap[currentLang] || zhHans;
	let text = dict[key] || key;
	// args 形如 ['count', '5', 'name', 'foo']，成对取出替换 {count}/{name}
	for (let i = 0; i + 1 < args.length; i += 2) {
		text = text.replaceAll(`{${args[i]}}`, args[i + 1]);
	}
	return text;
}
