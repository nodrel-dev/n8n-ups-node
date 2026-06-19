import type { INodeProperties } from 'n8n-workflow';
import { getRatesOperationDescription, getRatesOperationOption } from './getRates.operation';
import { createOperationDescription, createOperationOption } from './create.operation';

const showOnlyForShipping = {
	resource: ['shipping'],
};

// The Shipping resource: getRates (declarative) + create (programmatic execute) — decision 12.9.
export const shippingDescription: INodeProperties[] = [
	{
		displayName: 'Operation',
		name: 'operation',
		type: 'options',
		noDataExpression: true,
		displayOptions: { show: showOnlyForShipping },
		options: [getRatesOperationOption, createOperationOption],
		default: 'getRates',
	},
	...getRatesOperationDescription,
	...createOperationDescription,
];
