
export let rust: typeof import('./pkg/index.js') = null!;

export async function loadRustLib() {
    if (rust === null) {
        rust = await import('./pkg/index.js');
    }
}
