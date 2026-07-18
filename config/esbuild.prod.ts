import process from 'node:process';
import path from 'node:path';
import fs from 'fs-extra';
import esbuild from 'esbuild';

import common from './esbuild.common';

/**
 * 校验 src/iframe/*.html 中 <script> 标签内的 JS 语法。
 *
 * 必要性：esbuild 只编译 .ts，HTML 文件是 copySync 直接复制到 dist 的，
 * 所以 HTML 内联脚本的语法错误不会被 `npm run compile` 发现。
 * 这里用 esbuild.transformSync 做一次纯语法检查（不执行代码），
 * 让 HTML 脚本错误也能在编译阶段暴露。
 */
function checkIframeScripts(): void {
	const iframeDir = path.join(__dirname, '../src/iframe');
	const htmlFiles = ['panel.html', 'annotation.html', 'draw.html'];
	let hasError = false;

	for (const file of htmlFiles) {
		const fullPath = path.join(iframeDir, file);
		if (!fs.existsSync(fullPath)) {
			continue;
		}
		const html = fs.readFileSync(fullPath, 'utf-8');
		const scriptRegex = /<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g;
		let match: RegExpExecArray | null;
		let scriptIndex = 0;

		while ((match = scriptRegex.exec(html)) !== null) {
			scriptIndex++;
			const code = match[1];
			if (!code.trim()) {
				continue;
			}
			try {
				esbuild.transformSync(code, {
					loader: 'js',
					minify: false,
					target: 'es2020',
				});
			}
			catch (e: any) {
				hasError = true;
				console.error(`[FAIL] ${file} script#${scriptIndex}: syntax error`);
				console.error('       ', e.message?.split('\n').slice(0, 5).join('\n        '));
			}
		}
	}

	if (hasError) {
		console.error('\n✗ HTML script 语法检查未通过，编译终止');
		process.exit(1);
	}
	console.log('[cocomment] HTML script 语法检查通过');
}

function copyIframeAssets(): void {
	const srcDir = path.join(__dirname, '../src/iframe');
	const outDir = path.join(__dirname, '../dist/iframe');
	if (fs.existsSync(srcDir)) {
		fs.copySync(srcDir, outDir, { overwrite: true });
		console.log('[cocomment] Copied iframe assets to dist/iframe');
	}
}

(async () => {
	const ctx = await esbuild.context(common);
	if (process.argv.includes('--watch')) {
		await ctx.watch();
		checkIframeScripts();
		copyIframeAssets();
	}
	else {
		await ctx.rebuild();
		checkIframeScripts();
		copyIframeAssets();
		process.exit();
	}
})();
