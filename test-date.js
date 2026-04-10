function isValidDate(dateStr) {
	const match = dateStr.match(/^(\d{4})-(\d{2})-(\d{2})/);
	if (!match) return false;
	const year = parseInt(match[1], 10);
	const month = parseInt(match[2], 10) - 1;
	const day = parseInt(match[3], 10);
	const date = new Date(Date.UTC(year, month, day));
	return date.getUTCFullYear() === year && date.getUTCMonth() === month && date.getUTCDate() === day;
}
console.log(isValidDate('2023-02-30'));
console.log(isValidDate('2023-02-28'));
console.log(isValidDate('2023-13-45'));
console.log(isValidDate('2023-12-31T23:59:59Z'));
