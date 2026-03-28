import type { ImageDataLike, ClientMessage, ServerMessage } from './types.js';
const vscode = acquireVsCodeApi();

function stringifyColor(c: number): string {
	return '#' + c.toString(16).padStart(6, '0');
}

function vec3ToInt(r: ArrayLike<number>): number {
	const px = (n: number) => Math.round(Math.max(0, Math.min(1, n)) * 255);
	return (px(r[0]) << 16)
		| (px(r[1]) << 8)
		| (px(r[2]));
}

export class MatBrowserClientPage {
	public tints?: Uint32Array;
	public thumbs?: (ImageData | undefined)[];
	protected loaded = false;

	constructor(
		public idx: number,
		public paths: string[],
	) {}

	setData(thumbs: (ImageDataLike | undefined)[], tints: Uint32Array) {
		this.loaded = true;
		this.tints = tints;
		this.thumbs = thumbs.map(t => {
			if (!t) return;
			return new ImageData(new Uint8ClampedArray(t.data), t.width, t.height);
		});
	}

	unsetData() {
		delete this.thumbs;
		this.loaded = false;
	}

	isLoaded() {
		return this.loaded;
	}

	getSize() {
		return this.paths.length;
	}

	setFilter(filter: string) {
		throw 'not implemented';
	}
}

export class MatBrowserClient {
	items: string[] = [];
	pageList: MatBrowserClientPage[] = [];
	pageSize: number = 0;

	itemSize: number = 64;
	columnCount: number = 4;
	scrollPosition: number = 0;
	maxScrollPosition: number = 0;

	container: HTMLElement;
	innerScroll: HTMLDivElement;
	canvas: HTMLCanvasElement;
	ctx: CanvasRenderingContext2D;

	scrollBias: number = 0.0;
	pageColumns: number[] = [];
	pageLoadStates: Record<number, boolean> = {};

	constructor(container: HTMLElement) {
		this.container = container;

		this.canvas = document.createElement('canvas');
		this.innerScroll = document.createElement('div');
		this.innerScroll.id = 'scroller';
		this.container.replaceChildren(this.canvas, this.innerScroll);
		this.ctx = this.canvas.getContext('2d')!;

		window.addEventListener('message', ev => this.onMessage(ev.data));
		window.addEventListener('resize', () => this.onResize());
		this.container.addEventListener('scroll', () => this.onScroll());
		this.onResize();
	}

	onResize() {
		this.canvas.width = this.container.clientWidth;
		this.canvas.height = this.container.clientHeight;
		this.calcCanvasBounds();
		this.onScroll(false);
		this.render();
	}

	onScroll(doBias=true) {
		if (doBias) {
			const currentBias = this.scrollPosition - this.container.scrollTop;
			this.scrollBias = currentBias * 0.1 + this.scrollBias * 0.9;
		}
		this.scrollPosition = this.container.scrollTop;
	}

	getPageCount() {
		return this.pageList.length;
	}

	getPageImportance(n: number) {
		const focalPoint = this.scrollPosition + this.scrollBias * 2.0;
	}

	sendMessage(message: ClientMessage) {
		vscode.postMessage(message);
	}

	onMessage(msg: ServerMessage) {
		if (msg.type === 'indexed') {
			this.items = msg.items;
			this.pageSize = msg.pageSize;
			this.pageList = new Array(msg.pageCount);

			console.log('Creating pages from', this.items.length, 'items...');
			console.time('client-page-creation');

			for (let i=0, p=0; i<msg.pageCount; i++, p+=this.pageSize) {
				this.pageList[i] = new MatBrowserClientPage(
					i,
					msg.items.slice(p, p+this.pageSize),
				);
			}

			console.timeEnd('client-page-creation');
			this.calcCanvasBounds();

			return;
		}

		if (msg.type === 'loaded') {
			const page = this.pageList[msg.page];
			page.setData(msg.thumbs, msg.tints);
			this.onPageSetState(msg.page, true);
			return;
		}

		if (msg.type === 'unloaded') {
			this.onPageSetState(msg.page, false);
		}
	}

	calcCanvasBounds() {
		// TODO: Account for filtering by accumulating page sizes!
		if (this.itemSize < 1) return;
		this.columnCount = Math.floor(this.canvas.width / this.itemSize);
		this.maxScrollPosition = Math.ceil(this.items.length / this.columnCount) * this.itemSize;
		this.scrollPosition = Math.min(this.scrollPosition, this.maxScrollPosition);
		this.innerScroll.style.height = (this.maxScrollPosition + this.canvas.height * 0.5) + 'px';
		this.calcPageColumns();
	}

	lastDataHandled = 0;

	animate() {
		this.render();
		this.scrollBias *= 0.98;

		const curTime = Date.now();
		if (curTime > this.lastDataHandled + 50) {
			this.lastDataHandled = curTime;
			this.handleDataLoading();
		}

		// console.log((this.scrollBias).toFixed(3));
		requestAnimationFrame(this.animate.bind(this));
	}

	calcPageColumns() {
		let rowIdx = 0;
		let itemIdx = 0;

		this.pageColumns.length = this.pageList.length;
		const boundsList = this.pageColumns;

		// Figure out starting page/idx
		for (let i=0; i<this.pageList.length; i++) {
			itemIdx += this.pageList[i].getSize();
			rowIdx = Math.floor(itemIdx / this.columnCount);
			boundsList[i] = rowIdx;
		}
	}

	handleDataLoading() {
		const viewMin = this.scrollPosition;
		const viewMax = this.canvas.height + viewMin;

		let viewOffsetTop = 0; //-this.itemSize;
		let viewOffsetBottom = 0; //+this.itemSize;

		const maxScrollBias = this.itemSize * 8;
		const scrollBiasOffset = Math.min(maxScrollBias, this.scrollBias * -8);
		// viewOffsetTop += scrollBiasOffset;
		// viewOffsetBottom += scrollBiasOffset;
		// console.log(scrollBiasOffset.toFixed(3));
		if (this.scrollBias < 0) {
			viewOffsetBottom += scrollBiasOffset;	
		} else {
			viewOffsetTop += scrollBiasOffset;	
		}

		let pageMin: number = 0, pageMax: number;

		for (let i=0; i<this.pageList.length; i++) {
			const page = this.pageList[i];
			pageMax = this.pageColumns[i] * this.itemSize;

			const pageVisible = (pageMax > viewMin + viewOffsetTop) && (pageMin < viewMax + viewOffsetBottom);
			if (pageVisible !== page.isLoaded()) {
				this.requestPageSetState(i, pageVisible);
			}

			pageMin = pageMax;
		}
	}

	requestPageSetState(idx: number, loaded: boolean) {
		const page = this.pageList[idx];
		if (this.pageLoadStates[idx] === loaded) return;
		this.pageLoadStates[idx] = loaded;
		// if (page.isLoaded() === loaded) return;
		console.log('Setting page', idx, 'to', loaded);
		if (loaded) {
			this.sendMessage({
				type: 'load',
				page: idx,
			});
		} else {
			page.unsetData();
		}
	}

	onPageSetState(idx: number, loaded: boolean) {
		this.pageLoadStates[idx] = loaded;
	}

	render() {
		if (this.itemSize < 1 || this.pageList.length === 0) return;
		this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
		this.ctx.fillStyle = '#fff2';

		const viewStartIdx = Math.floor(this.scrollPosition / this.itemSize) * this.columnCount;
		const viewOffset = this.scrollPosition % this.itemSize;
		const viewRowCount = Math.ceil(this.canvas.height / this.columnCount);

		let pageIdx = -1;
		let itemIdx = viewStartIdx;
		let currentPageSize = 0;

		fullrender: if (true) {

		// Figure out starting page/idx
		while (itemIdx >= currentPageSize) {
			itemIdx -= currentPageSize;
			pageIdx ++;
			if (pageIdx >= this.pageList.length) break fullrender;
			currentPageSize = this.pageList[pageIdx].getSize();
		}
		
		// Render grid!!!
		for (let y=0; y<viewRowCount; y++) {
			const yPos = y * this.itemSize - viewOffset;
			for (let x=0; x<this.columnCount; x++) {

				const page = this.pageList[pageIdx];
				if (page.thumbs && page.thumbs[itemIdx]) {
					const thumb = page.thumbs[itemIdx]!;
					this.ctx.putImageData(
						thumb,
						x * this.itemSize,
						yPos,
						// 0,
						// 0,
						// this.itemSize - 2,
						// this.itemSize - 2,
					);
				} else {
					if (page.tints) {
						this.ctx.fillStyle = stringifyColor(page.tints[itemIdx]);
					} else {
						this.ctx.fillStyle = '#222';
					}
					this.ctx.fillRect(x * this.itemSize, yPos, this.itemSize - 2, this.itemSize - 2);
				}


				itemIdx++;
				if (itemIdx >= currentPageSize) {
					itemIdx = 0;
					pageIdx++;
					if (pageIdx >= this.pageList.length) break fullrender;
					currentPageSize = this.pageList[pageIdx].getSize();
				}
			}
		}

		} // fullrender
	}
}
