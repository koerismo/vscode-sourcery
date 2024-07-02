export function clamp(v: number, a: number, b: number) {
	return v >= b ? b : v <= a ? a : v;
}

export function checkV(
	v: number | undefined,
	def: number,
	min?: number,
	max?: number
) {
	v ??= def;
	if (typeof v === 'string') v = (<string>v).length ? +v : NaN;
	if (isNaN(v)) v = def;
	if (min !== undefined) v = Math.max(min, v);
	if (max !== undefined) v = Math.min(max, v);
	return v;
}
