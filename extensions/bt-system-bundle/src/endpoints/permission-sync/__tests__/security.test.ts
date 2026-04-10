import { describe, it, expect, vi } from 'vitest';

vi.mock('../../../../src/shared/services/permission-checker', () => ({
  PermissionChecker: {
    createPermissionMiddleware: vi.fn(() => (req: any, res: any, next: any) => next()),
    extractUserContext: vi.fn(),
    hasPermission: vi.fn().mockReturnValue({ granted: true }),
    hasRoleLevel: vi.fn().mockReturnValue({ granted: true })
  }
}));

import { createSyncPermissionsHandler } from '../routes';
import { PermissionTemplateService } from '../services/permission-template-service';

function createValidRequest() {
  return {
    permissions: [{ user_id: '1', library_id: '1', template: 'editor', enabled: true }]
  };
}

describe('Permission Sync API Security', () => {
  it('应该在数据库不可用时阻止同步', async () => {
    const handler = createSyncPermissionsHandler({
      database: null as any,
      syncServiceFactory: vi.fn()
    });

    const res = {
      status: vi.fn().mockReturnThis(),
      json: vi.fn().mockReturnThis()
    } as any;

    await handler({ body: createValidRequest(), context: {} } as any, res);

    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ error: 'DATABASE_NOT_AVAILABLE' })
    );
  });
});
