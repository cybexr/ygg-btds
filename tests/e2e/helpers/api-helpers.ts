import { APIRequestContext, APIResponse } from '@playwright/test';

/**
 * Directus API 辅助类
 * 提供与 Directus 后端交互的辅助方法
 */
export class DirectusAPI {
  constructor(
    private request: APIRequestContext,
    private baseURL: string
  ) {}

  /**
   * 登录并获取访问令牌
   */
  async login(email: string, password: string): Promise<string> {
    const response = await this.request.post('/auth/login', {
      data: { email, password },
    });

    if (!response.ok()) {
      throw new Error(`Login failed: ${response.status()}`);
    }

    const { data } = await response.json();
    return data.access_token;
  }

  /**
   * 获取当前用户信息
   */
  async getCurrentUser(token: string): Promise<any> {
    const response = await this.request.get('/users/me', {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });

    if (!response.ok()) {
      throw new Error(`Get current user failed: ${response.status()}`);
    }

    const { data } = await response.json();
    return data;
  }

  /**
   * 查询数据集注册表
   */
  async getDatasets(token: string): Promise<any[]> {
    const response = await this.request.get('/items/bt_dataset_registry', {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });

    if (!response.ok()) {
      throw new Error(`Get datasets failed: ${response.status()}`);
    }

    const { data } = await response.json();
    return data;
  }

  /**
   * 创建新的数据集注册
   */
  async createDataset(token: string, datasetData: any): Promise<any> {
    const response = await this.request.post('/items/bt_dataset_registry', {
      headers: {
        Authorization: `Bearer ${token}`,
      },
      data: datasetData,
    });

    if (!response.ok()) {
      throw new Error(`Create dataset failed: ${response.status()}`);
    }

    const { data } = await response.json();
    return data;
  }

  /**
   * 查询用户-库权限
   */
  async getUserLibraryPermissions(token: string): Promise<any[]> {
    const response = await this.request.get('/items/bt_user_library_permissions', {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });

    if (!response.ok()) {
      throw new Error(`Get user library permissions failed: ${response.status()}`);
    }

    const { data } = await response.json();
    return data;
  }

  /**
   * 创建用户-库权限
   */
  async createUserLibraryPermission(token: string, permissionData: any): Promise<any> {
    const response = await this.request.post('/items/bt_user_library_permissions', {
      headers: {
        Authorization: `Bearer ${token}`,
      },
      data: permissionData,
    });

    if (!response.ok()) {
      throw new Error(`Create user library permission failed: ${response.status()}`);
    }

    const { data } = await response.json();
    return data;
  }

  /**
   * 同步权限到 Directus
   */
  async syncPermissions(token: string, permissions: any[]): Promise<any> {
    const response = await this.request.post('/custom/permissions/sync', {
      headers: {
        Authorization: `Bearer ${token}`,
      },
      data: {
        user_library_permissions: permissions,
      },
    });

    if (!response.ok()) {
      throw new Error(`Sync permissions failed: ${response.status()}`);
    }

    return response.json();
  }

  /**
   * 预览权限变更
   */
  async previewPermissions(token: string, permissions: any[]): Promise<any> {
    const response = await this.request.post('/custom/permissions/preview', {
      headers: {
        Authorization: `Bearer ${token}`,
      },
      data: {
        user_library_permissions: permissions,
        preview: true,
      },
    });

    if (!response.ok()) {
      throw new Error(`Preview permissions failed: ${response.status()}`);
    }

    return response.json();
  }

  /**
   * 获取集合字段信息
   */
  async getCollectionFields(token: string, collection: string): Promise<any[]> {
    const response = await this.request.get(`/fields/${collection}`, {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });

    if (!response.ok()) {
      throw new Error(`Get collection fields failed: ${response.status()}`);
    }

    const { data } = await response.json();
    return data;
  }

  /**
   * 查询集合数据
   */
  async getCollectionData(token: string, collection: string, limit = 10): Promise<any[]> {
    const response = await this.request.get(`/items/${collection}`, {
      headers: {
        Authorization: `Bearer ${token}`,
      },
      params: {
        limit: limit.toString(),
      },
    });

    if (!response.ok()) {
      throw new Error(`Get collection data failed: ${response.status()}`);
    }

    const { data } = await response.json();
    return data;
  }

  /**
   * 创建集合数据
   */
  async createCollectionData(token: string, collection: string, data: any): Promise<any> {
    const response = await this.request.post(`/items/${collection}`, {
      headers: {
        Authorization: `Bearer ${token}`,
      },
      data,
    });

    if (!response.ok()) {
      throw new Error(`Create collection data failed: ${response.status()}`);
    }

    return response.json();
  }

  /**
   * 检查权限是否存在
   */
  async checkPermissionExists(
    token: string,
    role: string,
    collection: string,
    action: string
  ): Promise<boolean> {
    const response = await this.request.get('/permissions', {
      headers: {
        Authorization: `Bearer ${token}`,
      },
      params: {
        filter: JSON.stringify({
          role: {
            _eq: role,
          },
          collection: {
            _eq: collection,
          },
          action: {
            _eq: action,
          },
        }),
      },
    });

    if (!response.ok()) {
      return false;
    }

    const { data } = await response.json();
    return data && data.length > 0;
  }
}
