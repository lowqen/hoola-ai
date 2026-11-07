// material-color-utilities 0.4.0에 확장자 없는 상대 import가 있어(번들러는 괜찮지만 Node ESM은 실패)
// 생성 스크립트에서만 `.js`를 붙여 다시 찾는다.
import { registerHooks } from 'node:module';

registerHooks({
	resolve(specifier, context, next) {
		try {
			return next(specifier, context);
		} catch (err) {
			const code = (err as { code?: string }).code;
			if (
				code === 'ERR_MODULE_NOT_FOUND' &&
				specifier.startsWith('.') &&
				!/\.[cm]?[jt]s$/.test(specifier)
			) {
				return next(`${specifier}.js`, context);
			}
			throw err;
		}
	}
});
