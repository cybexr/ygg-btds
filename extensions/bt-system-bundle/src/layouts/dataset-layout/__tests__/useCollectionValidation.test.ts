import { describe, expect, it } from 'vitest';
import {
	COLLECTION_NAME_PATTERN,
	getAllowedCollections,
	isCollectionAccessible,
	useCollectionValidation,
	validateCollection,
} from '../composables/useCollectionValidation';

describe('useCollectionValidation', () => {
	it('接受合法集合名称并返回编码后的路径片段', () => {
		const result = validateCollection('bt_datasets');

		expect(result.isValid).toBe(true);
		expect(result.normalized).toBe('bt_datasets');
		expect(result.sanitized).toBe('bt_datasets');
		expect(result.error).toBe('');
	});

	it('拒绝路径穿越和特殊字符', () => {
		for (const collection of ['../users', '..%2Fusers', '....//users', 'test|data']) {
			const result = validateCollection(collection);
			expect(result.isValid).toBe(false);
			expect(result.error).toContain('集合名称');
		}
	});

	it('拒绝 Directus 系统集合前缀', () => {
		const result = validateCollection('directus_users');

		expect(result.isValid).toBe(false);
		expect(result.error).toContain('Directus 系统集合');
	});

	it('在提供白名单时只允许白名单内集合', () => {
		expect(isCollectionAccessible('orders', ['orders', 'products'])).toBe(true);
		expect(isCollectionAccessible('users', ['orders', 'products'])).toBe(false);
	});

	it('对允许集合列表去重并排序', () => {
		expect(getAllowedCollections(['products', 'orders', 'orders'])).toEqual([
			'orders',
			'products',
		]);
	});

	it('composable 会暴露最新错误状态并支持清空', () => {
		const validation = useCollectionValidation({
			allowedCollections: ['orders'],
		});

		const invalid = validation.validateCollection('users');
		expect(invalid.isValid).toBe(false);
		expect(validation.validationError.value).toContain('不在允许访问的列表中');

		validation.clearValidationError();
		expect(validation.validationError.value).toBe('');

		const valid = validation.validateCollection('orders');
		expect(valid.isValid).toBe(true);
		expect(validation.validationError.value).toBe('');
	});

	it('沿用统一集合名称格式规则', () => {
		expect(COLLECTION_NAME_PATTERN.test('user_data-2026')).toBe(true);
		expect(COLLECTION_NAME_PATTERN.test('1invalid')).toBe(false);
	});
});
