import type { INodeProperties } from 'n8n-workflow';
import { trackOperationDescription, trackOperationOption } from './track.operation';

const showOnlyForTracking = {
	resource: ['tracking'],
};

// The Tracking resource: a single `track` operation (decision 12.9).
export const trackingDescription: INodeProperties[] = [
	{
		displayName: 'Operation',
		name: 'operation',
		type: 'options',
		noDataExpression: true,
		displayOptions: { show: showOnlyForTracking },
		options: [trackOperationOption],
		default: 'track',
	},
	...trackOperationDescription,
];
