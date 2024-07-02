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

// Sourced from:
// https://gist.github.com/tommyettinger/46a874533244883189143505d203312c?permalink_comment_id=4854318#gistcomment-4854318
export function splitmix32(s: number) {
    return (t?: number) => (
        s = s + 0x9e3779b9 | 0, // |0 is an optimization; prevents VM from leaving 32-bit mode via addition
        t = Math.imul(s ^ s >>> 16, 0x21f0aaad),
        t = Math.imul(t ^ t >>> 15, 0x735a2d97),
        (t = t ^ t >>> 15) & 0xFF // >>> 0 is better, can't you just: splitmix32() & 0xFF?
    );
}
