import { defineEndpoint } from '@directus/extensions-sdk';
import { Router } from 'express';
import { registerRoutes } from './routes';

export default defineEndpoint((router: Router) => {
	registerRoutes(router);
});
