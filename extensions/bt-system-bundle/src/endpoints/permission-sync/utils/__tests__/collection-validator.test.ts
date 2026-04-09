/**
 * 集合验证器安全测试
 * 测试各种安全攻击向量和边界条件
 */

import { describe, it, expect } from 'vitest';
import {
	validateCollection,
	validateCollections,
	isCollectionAccessible,
	filterValidCollections,
	createCollectionValidator,
	validateCollectionOrThrow,
} from '../collection-validator';

describe('collection-validator 安全测试', () => {
	describe('基础验证', () => {
		it('应该接受有效的集合名称', () => {
			const result = validateCollection('my_data');
			expect(result.isValid).toBe(true);
			expect(result.normalized).toBe('my_data');
			expect(result.error).toBe('');
		});

		it('应该接受带连字符的集合名称', () => {
			const result = validateCollection('my-data');
			expect(result.isValid).toBe(true);
		});

		it('应该接受带数字的集合名称', () => {
			const result = validateCollection('data2024');
			expect(result.isValid).toBe(true);
		});

		it('应该拒绝空字符串', () => {
			const result = validateCollection('');
			expect(result.isValid).toBe(false);
			expect(result.errorCode).toBe('EMPTY_COLLECTION_NAME');
		});

		it('应该拒绝只有空格的字符串', () => {
			const result = validateCollection('   ');
			expect(result.isValid).toBe(false);
			expect(result.errorCode).toBe('EMPTY_COLLECTION_NAME');
		});

		it('应该自动去除首尾空格', () => {
			const result = validateCollection('  my_data  ');
			expect(result.isValid).toBe(true);
			expect(result.normalized).toBe('my_data');
		});
	});

	describe('路径穿越攻击防护', () => {
		it('应该拒绝 ../ 路径穿越', () => {
			const result = validateCollection('../users');
			expect(result.isValid).toBe(false);
			expect(result.errorCode).toBe('PATH_TRAVERSAL_DETECTED');
		});

		it('应该拒绝 ..\\ 路径穿越', () => {
			const result = validateCollection('..\\users');
			expect(result.isValid).toBe(false);
			expect(result.errorCode).toBe('PATH_TRAVERSAL_DETECTED');
		});

		it('应该拒绝 URL 编码的路径穿越 %2e%2e', () => {
			const result = validateCollection('%2e%2e%2fusers');
			expect(result.isValid).toBe(false);
			expect(result.errorCode).toBe('PATH_TRAVERSAL_DETECTED');
		});

		it('应该拒绝 URL 编码的路径穿越 %2e%2e%5c', () => {
			const result = validateCollection('%2e%2e%5cusers');
			expect(result.isValid).toBe(false);
			expect(result.errorCode).toBe('PATH_TRAVERSAL_DETECTED');
		});

		it('应该拒绝混合编码的路径穿越', () => {
			const result = validateCollection('..%2fconfig');
			expect(result.isValid).toBe(false);
			expect(result.errorCode).toBe('PATH_TRAVERSAL_DETECTED');
		});

		it('应该拒绝双重编码的路径穿越', () => {
			const result = validateCollection('..%252fetc');
			expect(result.isValid).toBe(false);
			expect(result.errorCode).toBe('PATH_TRAVERSAL_DETECTED');
		});

		it('应该拒绝 ~ 路径穿越', () => {
			const result = validateCollection('~/../../etc/passwd');
			expect(result.isValid).toBe(false);
			expect(result.errorCode).toBe('PATH_TRAVERSAL_DETECTED');
		});

		it('应该拒绝大小写混淆的路径穿越', () => {
			const result = validateCollection('../Users');
			expect(result.isValid).toBe(false);
			expect(result.errorCode).toBe('PATH_TRAVERSAL_DETECTED');
		});
	});

	describe('SQL 注入防护', () => {
		it('应该拒绝单引号注入', () => {
			const result = validateCollection("users'; DROP TABLE--");
			expect(result.isValid).toBe(false);
			expect(result.errorCode).toBe('SQL_INJECTION_DETECTED');
		});

		it('应该拒绝双引号注入', () => {
			const result = validateCollection('users" OR "1"="1');
			expect(result.isValid).toBe(false);
			expect(result.errorCode).toBe('SQL_INJECTION_DETECTED');
		});

		it('应该拒绝分号注入', () => {
			const result = validateCollection('users; DELETE FROM users');
			expect(result.isValid).toBe(false);
			expect(result.errorCode).toBe('SQL_INJECTION_DETECTED');
		});

		it('应该拒绝注释符注入', () => {
			const result = validateCollection('users--');
			expect(result.isValid).toBe(false);
			expect(result.errorCode).toBe('SQL_INJECTION_DETECTED');
		});

		it('应该拒绝 C 风格注释注入', () => {
			const result = validateCollection('users/* comment */');
			expect(result.isValid).toBe(false);
			expect(result.errorCode).toBe('SQL_INJECTION_DETECTED');
		});

		it('应该拒绝 XP_ 命令注入', () => {
			const result = validateCollection('users; xp_cmdshell');
			expect(result.isValid).toBe(false);
			expect(result.errorCode).toBe('SQL_INJECTION_DETECTED');
		});

		it('应该拒绝 UNION 注入', () => {
			const result = validateCollection('users UNION SELECT');
			expect(result.isValid).toBe(false);
			expect(result.errorCode).toBe('SQL_INJECTION_DETECTED');
		});

		it('应该拒绝 OR 1=1 注入', () => {
			const result = validateCollection('users OR 1=1');
			expect(result.isValid).toBe(false);
			expect(result.errorCode).toBe('SQL_INJECTION_DETECTED');
		});

		it('应该拒绝 DROP 语句', () => {
			const result = validateCollection('users; drop table users');
			expect(result.isValid).toBe(false);
			expect(result.errorCode).toBe('SQL_INJECTION_DETECTED');
		});

		it('应该拒绝 INSERT 语句', () => {
			const result = validateCollection('users; insert into');
			expect(result.isValid).toBe(false);
			expect(result.errorCode).toBe('SQL_INJECTION_DETECTED');
		});
	});

	describe('XSS 防护', () => {
		it('应该拒绝 script 标签', () => {
			const result = validateCollection('<script>alert(1)</script>');
			expect(result.isValid).toBe(false);
			expect(result.errorCode).toBe('XSS_DETECTED');
		});

		it('应该拒绝 javascript: 协议', () => {
			const result = validateCollection('javascript:alert(1)');
			expect(result.isValid).toBe(false);
			expect(result.errorCode).toBe('XSS_DETECTED');
		});

		it('应该拒绝 onerror 事件', () => {
			const result = validateCollection('img onerror=alert(1)');
			expect(result.isValid).toBe(false);
			expect(result.errorCode).toBe('XSS_DETECTED');
		});

		it('应该拒绝 onload 事件', () => {
			const result = validateCollection('img onload=alert(1)');
			expect(result.isValid).toBe(false);
			expect(result.errorCode).toBe('XSS_DETECTED');
		});

		it('应该拒绝 onclick 事件', () => {
			const result = validateCollection('div onclick=alert(1)');
			expect(result.isValid).toBe(false);
			expect(result.errorCode).toBe('XSS_DETECTED');
		});
	});

	describe('Null 字节注入防护', () => {
		it('应该拒绝 null 字节', () => {
			const result = validateCollection('users\0passwd');
			expect(result.isValid).toBe(false);
			expect(result.errorCode).toBe('NULL_BYTE_DETECTED');
		});

		it('应该拒绝中间的 null 字节', () => {
			const result = validateCollection('use\0rs');
			expect(result.isValid).toBe(false);
			expect(result.errorCode).toBe('NULL_BYTE_DETECTED');
		});
	});

	describe('危险字符防护', () => {
		it('应该拒绝包含 < 的字符串', () => {
			const result = validateCollection('users<test');
			expect(result.isValid).toBe(false);
			expect(result.errorCode).toBe('DANGEROUS_CHAR_DETECTED');
		});

		it('应该拒绝包含 > 的字符串', () => {
			const result = validateCollection('users>test');
			expect(result.isValid).toBe(false);
			expect(result.errorCode).toBe('DANGEROUS_CHAR_DETECTED');
		});

		it('应该拒绝包含 & 的字符串', () => {
			const result = validateCollection('users&test');
			expect(result.isValid).toBe(false);
			expect(result.errorCode).toBe('DANGEROUS_CHAR_DETECTED');
		});

		it('应该拒绝包含 | 的字符串', () => {
			const result = validateCollection('users|test');
			expect(result.isValid).toBe(false);
			expect(result.errorCode).toBe('DANGEROUS_CHAR_DETECTED');
		});

		it('应该拒绝包含 $ 的字符串', () => {
			const result = validateCollection('users$test');
			expect(result.isValid).toBe(false);
			expect(result.errorCode).toBe('DANGEROUS_CHAR_DETECTED');
		});

		it('应该拒绝包含反引号的字符串', () => {
			const result = validateCollection('users`test`');
			expect(result.isValid).toBe(false);
			expect(result.errorCode).toBe('DANGEROUS_CHAR_DETECTED');
		});

		it('应该拒绝包含换行符的字符串', () => {
			const result = validateCollection('users\ntest');
			expect(result.isValid).toBe(false);
			expect(result.errorCode).toBe('DANGEROUS_CHAR_DETECTED');
		});

		it('应该拒绝包含回车符的字符串', () => {
			const result = validateCollection('users\rtest');
			expect(result.isValid).toBe(false);
			expect(result.errorCode).toBe('DANGEROUS_CHAR_DETECTED');
		});

		it('应该拒绝包含制表符的字符串', () => {
			const result = validateCollection('users\ttest');
			expect(result.isValid).toBe(false);
			expect(result.errorCode).toBe('DANGEROUS_CHAR_DETECTED');
		});
	});

	describe('系统集合保护', () => {
		it('应该拒绝 directus_users 系统集合', () => {
			const result = validateCollection('directus_users');
			expect(result.isValid).toBe(false);
			expect(result.errorCode).toBe('SYSTEM_COLLECTION_BLOCKED');
		});

		it('应该拒绝 directus_roles 系统集合', () => {
			const result = validateCollection('directus_roles');
			expect(result.isValid).toBe(false);
			expect(result.errorCode).toBe('SYSTEM_COLLECTION_BLOCKED');
		});

		it('应该拒绝 directus_permissions 系统集合', () => {
			const result = validateCollection('directus_permissions');
			expect(result.isValid).toBe(false);
			expect(result.errorCode).toBe('SYSTEM_COLLECTION_BLOCKED');
		});

		it('应该拒绝大小写混淆的系统集合', () => {
			const result = validateCollection('Directus_Users');
			expect(result.isValid).toBe(false);
			expect(result.errorCode).toBe('SYSTEM_COLLECTION_BLOCKED');
		});

		it('应该允许访问系统集合（当选项启用时）', () => {
			const result = validateCollection('directus_users', {
				allowSystemCollections: true,
			});
			expect(result.isValid).toBe(true);
		});
	});

	describe('格式验证', () => {
		it('应该拒绝以数字开头的集合名称', () => {
			const result = validateCollection('123data');
			expect(result.isValid).toBe(false);
			expect(result.errorCode).toBe('INVALID_COLLECTION_FORMAT');
		});

		it('应该拒绝以特殊字符开头的集合名称', () => {
			const result = validateCollection('_data');
			expect(result.isValid).toBe(false);
			expect(result.errorCode).toBe('INVALID_COLLECTION_FORMAT');
		});

		it('应该拒绝包含空格的集合名称', () => {
			const result = validateCollection('my data');
			expect(result.isValid).toBe(false);
			expect(result.errorCode).toBe('INVALID_COLLECTION_FORMAT');
		});

		it('应该拒绝超长的集合名称', () => {
			const longName = 'a'.repeat(65);
			const result = validateCollection(longName);
			expect(result.isValid).toBe(false);
			expect(result.errorCode).toBe('COLLECTION_NAME_TOO_LONG');
		});

		it('应该接受最大长度的集合名称', () => {
			const maxName = 'a'.repeat(64);
			const result = validateCollection(maxName);
			expect(result.isValid).toBe(true);
		});

		it('应该接受单个字母的集合名称', () => {
			const result = validateCollection('a');
			expect(result.isValid).toBe(true);
		});
	});

	describe('白名单验证', () => {
		it('应该拒绝不在白名单中的集合', () => {
			const result = validateCollection('unknown', {
				allowedCollections: new Set(['users', 'posts']),
			});
			expect(result.isValid).toBe(false);
			expect(result.errorCode).toBe('COLLECTION_NOT_IN_WHITELIST');
		});

		it('应该接受在白名单中的集合', () => {
			const result = validateCollection('users', {
				allowedCollections: new Set(['users', 'posts']),
			});
			expect(result.isValid).toBe(true);
		});

		it('应该接受白名单中的所有集合', () => {
			const collections = ['users', 'posts', 'comments'];
			const results = validateCollections(collections, {
				allowedCollections: new Set(collections),
			});
			expect(results.every(r => r.isValid)).toBe(true);
		});

		it('应该在没有白名单时跳过白名单检查', () => {
			const result = validateCollection('any_collection');
			// 没有白名单时，只检查格式
			expect(result.isValid).toBe(true);
		});
	});

	describe('批量验证', () => {
		it('应该批量验证多个集合', () => {
			const collections = ['users', 'posts', '../admin', 'comments'];
			const results = validateCollections(collections);

			expect(results).toHaveLength(4);
			expect(results[0].isValid).toBe(true);
			expect(results[1].isValid).toBe(true);
			expect(results[2].isValid).toBe(false);
			expect(results[3].isValid).toBe(true);
		});

		it('应该过滤出有效的集合', () => {
			const collections = ['users', '../admin', 'posts', '<script>'];
			const valid = filterValidCollections(collections);

			expect(valid).toEqual(['users', 'posts']);
		});
	});

	describe('便捷方法', () => {
		it('isCollectionAccessible 应该返回正确的布尔值', () => {
			expect(isCollectionAccessible('users')).toBe(true);
			expect(isCollectionAccessible('../admin')).toBe(false);
		});

		it('应该创建预配置的验证器', () => {
			const validator = createCollectionValidator({
				allowedCollections: new Set(['users', 'posts']),
			});

			expect(validator('users').isValid).toBe(true);
			expect(validator('comments').isValid).toBe(false);
		});
	});

	describe('错误处理', () => {
		it('validateCollectionOrThrow 应该在验证失败时抛出错误', () => {
			expect(() => validateCollectionOrThrow('../admin')).toThrow();
		});

		it('validateCollectionOrThrow 应该在验证成功时返回规范化名称', () => {
			const result = validateCollectionOrThrow('  my_data  ');
			expect(result).toBe('my_data');
		});

		it('validateCollectionOrThrow 应该包含错误代码', () => {
			try {
				validateCollectionOrThrow('../admin');
				expect.fail('应该抛出错误');
			} catch (error) {
				expect((error as any).errorCode).toBe('PATH_TRAVERSAL_DETECTED');
			}
		});
	});

	describe('安全编码', () => {
		it('应该对有效的集合名称进行 URL 编码', () => {
			const result = validateCollection('my_data');
			expect(result.sanitized).toBe(encodeURIComponent('my_data'));
		});

		it('应该对特殊字符进行 URL 编码', () => {
			const result = validateCollection('my-data_2024');
			expect(result.sanitized).toBe(encodeURIComponent('my-data_2024'));
		});
	});

	describe('边界条件', () => {
		it('应该处理 Unicode 字符', () => {
			const result = validateCollection('数据_2024');
			expect(result.isValid).toBe(false); // 只允许 ASCII 字母
			expect(result.errorCode).toBe('INVALID_COLLECTION_FORMAT');
		});

		it('应该处理全角字符', () => {
			const result = validateCollection('ｕｓｅｒｓ'); // 全角字母
			expect(result.isValid).toBe(false);
		});

		it('应该处理零宽字符', () => {
			const result = validateCollection('users\u200b'); // 零宽空格
			expect(result.isValid).toBe(false);
		});

		it('应该处理控制字符', () => {
			const result = validateCollection('users\x00'); // null 字节
			expect(result.isValid).toBe(false);
		});
	});

	describe('复杂攻击向量', () => {
		it('应该拒绝混合攻击（SQL 注入 + XSS）', () => {
			const result = validateCollection("'<script>alert(1)</script>'");
			expect(result.isValid).toBe(false);
		});

		it('应该拒绝多层编码攻击', () => {
			const result = validateCollection('%252e%252e%252f');
			expect(result.isValid).toBe(false);
			expect(result.errorCode).toBe('PATH_TRAVERSAL_DETECTED');
		});

		it('应该拒绝带注释的 SQL 注入', () => {
			const result = validateCollection('users/* comment */DROP TABLE');
			expect(result.isValid).toBe(false);
		});
	});

	describe('性能测试', () => {
		it('应该快速处理大量验证', () => {
			const collections = Array.from({ length: 1000 }, (_, i) => `collection_${i}`);
			const start = Date.now();
			const results = validateCollections(collections);
			const duration = Date.now() - start;

			expect(results).toHaveLength(1000);
			expect(duration).toBeLessThan(100); // 应该在 100ms 内完成
		});
	});
});
