/**
 * E2E 测试配置
 * 集中管理测试常量和配置项
 */

/**
 * 测试环境配置
 */
export const TEST_CONFIG = {
  // 基础 URL
  baseURL: (typeof process !== 'undefined' ? process.env.TEST_BASE_URL : '') || 'http://localhost:8080',

  // 超时配置
  timeouts: {
    default: 30000,
    navigation: 15000,
    action: 10000,
    api: 10000,
    login: 10000,
  },

  // 重试配置
  retries: {
    default: 0,
    api: 3,
  },

  // 测试数据路径
  paths: {
    mockData: '../assets/mock_data',
    testScripts: '../scripts',
  },

  // 测试集合
  collections: {
    datasetRegistry: 'bt_dataset_registry',
    userLibraryPermissions: 'bt_user_library_permissions',
    users: 'directus_users',
    roles: 'directus_roles',
    permissions: 'directus_permissions',
  },

  // 权限模板
  permissionTemplates: {
    admin: 'admin',
    editor: 'editor',
    reader: 'reader',
  },

  // 测试数据集类型
  datasetTypes: {
    excel: 'excel',
    csv: 'csv',
    api: 'api',
  },

  // 数据集状态
  datasetStatus: {
    visible: 'visible',
    hidden: 'hidden',
  },
} as const;

/**
 * Mock 数据文件配置
 */
export const MOCK_FILES = {
  perfectSample: 'perfect_sample.xlsx',
  largeDataset: 'large_dataset.xlsx',
  malformedData: 'malformed_data.xlsx',
  mixedTypes: 'mixed_types.xlsx',
} as const;

/**
 * 测试断言消息
 */
export const ASSERTION_MESSAGES = {
  login: {
    success: '用户登录成功',
    failed: '用户登录失败',
    invalidCredentials: '凭据无效',
  },
  dataset: {
    created: '数据集创建成功',
    visible: '数据集应该可见',
    accessible: '数据集应该可访问',
  },
  permission: {
    granted: '权限已授予',
    denied: '权限被拒绝',
    synced: '权限同步成功',
  },
  ui: {
    elementVisible: '元素应该可见',
    elementContainsText: '元素应包含指定文本',
    navigationSuccessful: '导航成功',
  },
} as const;

/**
 * 测试数据生成器
 */
export class TestDataGenerator {
  /**
   * 生成唯一的测试名称
   */
  static generateTestName(prefix: string): string {
    const timestamp = Date.now();
    const random = Math.random().toString(36).substring(2, 8);
    return `${prefix}_${timestamp}_${random}`;
  }

  /**
   * 生成测试数据集数据
   */
  static generateDatasetData(overrides: Partial<any> = {}): any {
    return {
      table_name: this.generateTestName('test_dataset'),
      table_alias: `测试数据集_${Date.now()}`,
      status: TEST_CONFIG.datasetStatus.visible,
      source_type: TEST_CONFIG.datasetTypes.excel,
      description: 'E2E 测试自动生成',
      record_count: 0,
      ...overrides,
    };
  }

  /**
   * 生成用户权限数据
   */
  static generatePermissionData(
    userId: string,
    libraryId: string,
    template: string = TEST_CONFIG.permissionTemplates.reader
  ): any {
    return {
      user_id: userId,
      library_id: libraryId,
      template: template,
      enabled: true,
    };
  }

  /**
   * 生成批量权限数据
   */
  static generateBatchPermissions(
    userIds: string[],
    libraryIds: string[],
    template: string = TEST_CONFIG.permissionTemplates.reader
  ): any[] {
    const permissions: any[] = [];
    for (const userId of userIds) {
      for (const libraryId of libraryIds) {
        permissions.push(
          this.generatePermissionData(userId, libraryId, template)
        );
      }
    }
    return permissions;
  }
}

/**
 * 测试等待条件
 */
export const WAIT_CONDITIONS = {
  /**
   * 等待元素可见
   */
  elementVisible: (selector: string) => async (page: any) => {
    await page.waitForSelector(selector, { state: 'visible' });
  },

  /**
   * 等待元素隐藏
   */
  elementHidden: (selector: string) => async (page: any) => {
    await page.waitForSelector(selector, { state: 'hidden' });
  },

  /**
   * 等待导航完成
   */
  navigation: (urlPattern: string) => async (page: any) => {
    await page.waitForURL(urlPattern);
  },

  /**
   * 等待 API 响应
   */
  apiResponse: (urlPattern: string) => async (page: any) => {
    return page.waitForResponse(
      (response: any) => response.url().includes(urlPattern)
    );
  },

  /**
   * 等待网络空闲
   */
  networkIdle: async (page: any) => {
    await page.waitForLoadState('networkidle');
  },
} as const;

/**
 * 测试清理工具
 */
export class TestCleanup {
  private static cleanupTasks: Array<() => Promise<void>> = [];

  /**
   * 注册清理任务
   */
  static register(task: () => Promise<void>): void {
    this.cleanupTasks.push(task);
  }

  /**
   * 执行所有清理任务
   */
  static async executeAll(): Promise<void> {
    const errors: Error[] = [];

    for (const task of this.cleanupTasks) {
      try {
        await task();
      } catch (error) {
        errors.push(error as Error);
      }
    }

    this.cleanupTasks = [];

    if (errors.length > 0) {
      console.error('清理过程中发生错误:', errors);
      throw new Error(`清理失败: ${errors.length} 个任务失败`);
    }
  }

  /**
   * 清空所有清理任务
   */
  static clear(): void {
    this.cleanupTasks = [];
  }
}

/**
 * 性能监控工具
 */
export class PerformanceMonitor {
  private static metrics: Map<string, number[]> = new Map();

  /**
   * 记录操作耗时
   */
  static record(operation: string, duration: number): void {
    if (!this.metrics.has(operation)) {
      this.metrics.set(operation, []);
    }
    this.metrics.get(operation)!.push(duration);
  }

  /**
   * 获取操作平均耗时
   */
  static getAverage(operation: string): number {
    const durations = this.metrics.get(operation);
    if (!durations || durations.length === 0) return 0;

    const sum = durations.reduce((a, b) => a + b, 0);
    return sum / durations.length;
  }

  /**
   * 获取所有统计信息
   */
  static getStatistics(): Record<string, { avg: number; count: number }> {
    const stats: Record<string, { avg: number; count: number }> = {};

    for (const [operation, durations] of this.metrics.entries()) {
      const sum = durations.reduce((a, b) => a + b, 0);
      stats[operation] = {
        avg: sum / durations.length,
        count: durations.length,
      };
    }

    return stats;
  }

  /**
   * 清空统计数据
   */
  static clear(): void {
    this.metrics.clear();
  }
}
