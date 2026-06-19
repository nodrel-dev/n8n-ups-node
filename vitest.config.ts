/* eslint-disable @n8n/community-nodes/no-restricted-imports -- dev-only vitest tests; not part of the shipped node (files: dist only) */
import { defineConfig } from 'vitest/config';

// Pure-core unit tests only (Principle 10). No n8n runtime, no DOM.
// Live behaviour is verified manually through the Docker harness (Principle 12).
export default defineConfig({
	test: {
		environment: 'node',
		include: ['test/**/*.test.ts'],
		globals: false,
	},
});
