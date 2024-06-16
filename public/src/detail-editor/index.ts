import { provideVSCodeDesignSystem, vsCodeButton, vsCodeCheckbox, vsCodeDropdown, vsCodeOption } from '@vscode/webview-ui-toolkit';
provideVSCodeDesignSystem().register(vsCodeButton(), vsCodeCheckbox(), vsCodeDropdown(), vsCodeOption());
import { DetailMessage } from './detail-file.js';
import { EditTable } from './edit-table.js';

onmessage = (event: MessageEvent<DetailMessage>) => {
	const mtype = event.data.type;
	const error = event.data.error!;
	const file = event.data.data!;

	if (mtype === 'load') {
		console.log('LOAD EVENT!');
		return;
	}

	if (mtype === 'save') {
		console.log('SAVE EVENT!');
		return;
	}
};

console.log('Starting up detail editor webview...');
console.log('Starting up detail editor webview...');
console.log('Starting up detail editor webview...');
console.log('Starting up detail editor webview...');
console.log('Starting up detail editor webview...');
EditTable.register();

const sheet_table = document.querySelector<EditTable>('#table-types');
sheet_table.setFormat([
	{ title: 'Name',    property: 'name',    type: 'text',   width: '100%' },
	{ title: 'Density', property: 'density', type: 'float',  width: 'auto', min: 0, max: 1_000_000 },
]);
sheet_table.setModel([
	{ name: 'Helloworld', density: 1000.0 },
	{ name: 'Helloworld2', density: 2.0 },
]);
 
const group_table = document.querySelector<EditTable>('#table-groups');
group_table.setFormat([
	{ title: 'Name',    property: 'name',    type: 'text',   width: '100%' },
	{ title: 'Alpha',   property: 'alpha',   type: 'float',  width: 'auto', min: 0, max: 1 },
]);
group_table.setModel([
	{ name: 'Helloworld', alpha: 1.0 },
	{ name: 'Helloworld2', alpha: 2.0 },
]);

const prop_table = document.querySelector<EditTable>('#table-props');
prop_table.setFormat([
	{ title: 'Name',    property: 'name',    type: 'text',   width: '100%' },
	{ title: 'Amount',  property: 'amount',  type: 'float',  width: 'auto', min: 0, max: 1 },
]);
prop_table.setModel([
	{ name: 'Helloworld', amount: 1.0 },
]);
