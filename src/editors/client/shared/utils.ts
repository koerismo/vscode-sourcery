class AssertionError extends Error {
	name = 'AssertionError';
}

export function assert(x: any, message: string='Assertion failed!'): asserts x {
	if (!x) throw new AssertionError(message);
}

export function assertExists<T>(x: T|null|undefined, message: string='Assertion failed!'): T {
	if (x === null || x === undefined) throw new AssertionError(message);
	return x;
}

export function mod(a: number, b: number): number {
    return (a + b) % b;
}
