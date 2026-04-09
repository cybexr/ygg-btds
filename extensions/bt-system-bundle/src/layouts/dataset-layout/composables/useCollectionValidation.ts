import { computed, ref, toValue, type MaybeRefOrGetter } from 'vue';

export const COLLECTION_NAME_PATTERN = /^[a-z][a-z0-9_-]{0,63}$/i;

export interface CollectionValidationResult {
	isValid: boolean;
	normalized: string;
	sanitized: string;
	error: string;
}

export interface UseCollectionValidationOptions {
	allowedCollections?: MaybeRefOrGetter<Iterable<string> | null | undefined>;
}

const RESERVED_COLLECTION_PREFIX = 'directus_';

const normalizeAllowedCollections = (
	collections?: Iterable<string> | null
): Set<string> => {
	if (!collections) return new Set();
	return new Set(
		Array.from(collections)
			.map((collection) => collection.trim())
			.filter(Boolean)
	);
};

export const validateCollection = (
	collection: string,
	allowedCollections?: Iterable<string> | null
): CollectionValidationResult => {
	const normalized = collection.trim();

	if (!normalized) {
		return {
			isValid: false,
			normalized,
			sanitized: '',
			error: '集合名称不能为空',
		};
	}

	if (normalized.startsWith(RESERVED_COLLECTION_PREFIX)) {
		return {
			isValid: false,
			normalized,
			sanitized: '',
			error: '不允许访问 Directus 系统集合',
		};
	}

	if (!COLLECTION_NAME_PATTERN.test(normalized)) {
		return {
			isValid: false,
			normalized,
			sanitized: '',
			error: '集合名称格式无效，仅支持字母、数字、下划线和连字符',
		};
	}

	const allowedSet = normalizeAllowedCollections(allowedCollections);
	if (allowedSet.size > 0 && !allowedSet.has(normalized)) {
		return {
			isValid: false,
			normalized,
			sanitized: '',
			error: `集合 "${normalized}" 不在允许访问的列表中`,
		};
	}

	return {
		isValid: true,
		normalized,
		sanitized: encodeURIComponent(normalized),
		error: '',
	};
};

export const isCollectionAccessible = (
	collection: string,
	allowedCollections?: Iterable<string> | null
): boolean => {
	return validateCollection(collection, allowedCollections).isValid;
};

export const getAllowedCollections = (
	collections?: Iterable<string> | null
): string[] => {
	return Array.from(normalizeAllowedCollections(collections)).sort();
};

export const useCollectionValidation = (
	options: UseCollectionValidationOptions = {}
) => {
	const validationError = ref('');

	const allowedCollections = computed(() =>
		getAllowedCollections(toValue(options.allowedCollections))
	);

	const validate = (collection: string): CollectionValidationResult => {
		const result = validateCollection(collection, allowedCollections.value);
		validationError.value = result.error;
		return result;
	};

	const clearValidationError = () => {
		validationError.value = '';
	};

	return {
		allowedCollections,
		validationError,
		validateCollection: validate,
		isCollectionAccessible: (collection: string) =>
			isCollectionAccessible(collection, allowedCollections.value),
		getAllowedCollections: () => allowedCollections.value,
		clearValidationError,
	};
};
