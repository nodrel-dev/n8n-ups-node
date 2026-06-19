import type { INodeProperties } from 'n8n-workflow';
import { validateOperationDescription, validateOperationOption } from './validate.operation';

const showOnlyForAddress = {
	resource: ['address'],
};

// The Address resource: a single `validate` operation (decision 12.9 — Validate is standalone).
export const addressDescription: INodeProperties[] = [
	{
		displayName: 'Operation',
		name: 'operation',
		type: 'options',
		noDataExpression: true,
		displayOptions: { show: showOnlyForAddress },
		options: [validateOperationOption],
		default: 'validate',
	},
	...validateOperationDescription,
];
