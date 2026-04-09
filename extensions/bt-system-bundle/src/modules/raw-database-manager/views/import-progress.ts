export interface ProgressSnapshot {
	status?: 'pending' | 'processing' | 'completed' | 'failed';
	progress?: number;
	total?: number;
	processed?: number;
}

export interface NormalizedProgressMetrics {
	processed: number;
	total: number;
	hasMetrics: boolean;
}

export const normalizeProgressMetrics = (
	total = 0,
	processed = 0,
): NormalizedProgressMetrics => {
	if (total <= 0 || processed < 0) {
		return { processed: 0, total: 0, hasMetrics: false };
	}

	return {
		processed: Math.min(processed, total),
		total,
		hasMetrics: true,
	};
};

export const formatPercentage = (value: number): string => {
	return Number.isInteger(value) ? `${value}%` : `${value.toFixed(1)}%`;
};

export const getProgressPercentage = (snapshot: ProgressSnapshot | null | undefined): string => {
	if (!snapshot) {
		return '0%';
	}

	if (typeof snapshot.progress === 'number' && Number.isFinite(snapshot.progress)) {
		const boundedProgress = Math.min(Math.max(snapshot.progress, 0), 100);
		return formatPercentage(boundedProgress);
	}

	const metrics = normalizeProgressMetrics(snapshot.total, snapshot.processed);
	if (!metrics.hasMetrics) {
		return '0%';
	}

	const calculatedProgress = (metrics.processed / metrics.total) * 100;
	return formatPercentage(Math.min(Math.max(calculatedProgress, 0), 100));
};

export const getProgressValue = (snapshot: ProgressSnapshot | null | undefined): number => {
	return parseFloat(getProgressPercentage(snapshot));
};

export const getProgressText = (snapshot: ProgressSnapshot | null | undefined): string => {
	const metrics = normalizeProgressMetrics(snapshot?.total, snapshot?.processed);

	if (!metrics.total) {
		return '正在等待导入统计信息...';
	}

	return `已处理 ${metrics.processed} / ${metrics.total} 条记录`;
};

export const isProgressIndeterminate = (snapshot: ProgressSnapshot | null | undefined): boolean => {
	return snapshot?.status === 'processing' && !normalizeProgressMetrics(snapshot.total, snapshot.processed).hasMetrics;
};

export const shouldEstimateTime = (
	snapshot: ProgressSnapshot | null | undefined,
	taskStartTime: number | null,
	lastProgressUpdateAt: number | null,
): boolean => {
	if (!snapshot || snapshot.status !== 'processing') {
		return false;
	}

	const metrics = normalizeProgressMetrics(snapshot.total, snapshot.processed);
	if (!metrics.hasMetrics || metrics.processed < 10) {
		return false;
	}

	if (!taskStartTime || !lastProgressUpdateAt) {
		return false;
	}

	return lastProgressUpdateAt - taskStartTime >= 5000;
};

export const formatRemainingTime = (milliseconds: number): string => {
	if (milliseconds <= 0) {
		return '0秒';
	}

	const totalSeconds = Math.ceil(milliseconds / 1000);
	const hours = Math.floor(totalSeconds / 3600);
	const minutes = Math.floor((totalSeconds % 3600) / 60);
	const seconds = totalSeconds % 60;

	if (hours > 0) {
		return `${hours}小时${minutes}分钟`;
	}

	if (minutes > 0) {
		return `${minutes}分${seconds}秒`;
	}

	return `${seconds}秒`;
};

export const getEstimatedTimeRemaining = (
	snapshot: ProgressSnapshot | null | undefined,
	taskStartTime: number | null,
	lastProgressUpdateAt: number | null,
): string => {
	if (!snapshot || snapshot.status !== 'processing') {
		return '--';
	}

	if (!shouldEstimateTime(snapshot, taskStartTime, lastProgressUpdateAt) || !taskStartTime || !lastProgressUpdateAt) {
		return '计算中...';
	}

	const metrics = normalizeProgressMetrics(snapshot.total, snapshot.processed);
	const elapsed = lastProgressUpdateAt - taskStartTime;

	if (elapsed <= 0 || metrics.processed <= 0) {
		return '计算中...';
	}

	if (metrics.total <= metrics.processed) {
		return '0秒';
	}

	const speed = metrics.processed / elapsed;
	if (!Number.isFinite(speed) || speed <= 0) {
		return '计算中...';
	}

	const remainingMilliseconds = Math.max(0, Math.round((metrics.total - metrics.processed) / speed));
	return formatRemainingTime(remainingMilliseconds);
};
