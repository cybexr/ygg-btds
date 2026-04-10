/**
 * 权限检查器服务
 * 提供统一的权限验证接口，增强安全性
 */

import {
        SystemRole,
        PermissionAction,
        isValidRole,
        roleHasPermission,
        meetsRoleRequirement,
        ROLE_HIERARCHY,
} from '../constants/roles';

/**
 * 用户上下文接口
 * 定义用户身份和角色信息
 */
export interface UserContext {
        /** 用户 ID */
        userId?: string | number;
        /** 用户角色标识符或 ID */
        role?: string | number;
        /** 用户邮箱 */
        email?: string;
        /** 是否为已认证用户 */
        authenticated?: boolean;
        /** Directus Permissions array (from API) */
        permissions?: any[];
        /** Admin flag from Directus */
        admin?: boolean;
}

/**
 * 权限检查结果接口
 */
export interface PermissionCheckResult {
        /** 是否通过检查 */
        granted: boolean;
        /** 错误码 */
        errorCode?: string;
        /** 错误消息 */
        errorMessage?: string;
        /** 所需角色 */
        requiredRole?: SystemRole;
}

/**
 * 权限检查器类
 */
export class PermissionChecker {
        /**
         * 检查用户是否已认证
         */
        static isAuthorized(user: UserContext): PermissionCheckResult {
                if (!user || !user.authenticated) {
                        return {
                                granted: false,
                                errorCode: 'UNAUTHORIZED',
                                errorMessage: '未授权访问，请先登录',
                        };
                }

                if (!user.userId) {
                        return {
                                granted: false,
                                errorCode: 'INVALID_USER',
                                errorMessage: '无效的用户信息',
                        };
                }

                return { granted: true };
        }

        /**
         * 检查用户角色是否具有执行指定操作的权限
         */
        static hasPermission(
                user: UserContext,
                action: PermissionAction,
                collection?: string
        ): PermissionCheckResult {
                // 首先检查认证状态
                const authResult = this.isAuthorized(user);
                if (!authResult.granted) {
                        return authResult;
                }
                
                if (user.admin) {
                        return { granted: true };
                }

                // 如果有 Directus permissions 对象，进行更严格的检查
                if (user.permissions && Array.isArray(user.permissions)) {
                        // 映射内部 action 到 Directus action (create, read, update, delete)
                        let directusAction = 'read';
                        if (action.startsWith('create_') || action === PermissionAction.UPLOAD_FILE || action === PermissionAction.IMPORT_DATA) directusAction = 'create';
                        else if (action.startsWith('update_')) directusAction = 'update';
                        else if (action.startsWith('delete_') || action === PermissionAction.TRUNCATE_DATASET) directusAction = 'delete';
                        
                        const hasDirectusPermission = user.permissions.some(p => 
                                p.action === directusAction && 
                                (collection ? p.collection === collection : true)
                        );
                        
                        if (!hasDirectusPermission && action !== PermissionAction.PARSE_FILE) {
                                return {
                                        granted: false,
                                        errorCode: 'FORBIDDEN_DIRECTUS',
                                        errorMessage: `Directus 权限拒绝: 缺少 ${directusAction} 权限${collection ? `在集合 ${collection}` : ''}`,
                                };
                        }
                }

                // 解析用户角色
                const userRole = this.parseUserRole(user.role);
                if (!userRole) {
                        return {
                                granted: false,
                                errorCode: 'INVALID_ROLE',
                                errorMessage: '无效的用户角色',
                        };
                }

                // 检查角色是否具有指定权限
                if (!roleHasPermission(userRole, action)) {
                        // 查找具有此权限的最低级别角色
                        const requiredRole = this.findRoleWithPermission(action);

                        return {
                                granted: false,
                                errorCode: 'FORBIDDEN',
                                errorMessage: `权限不足，需要 ${requiredRole} 或更高级别角色`,
                                requiredRole,
                        };
                }

                return { granted: true };
        }

        /**
         * 检查用户角色是否满足最低级别要求
         */
        static hasRoleLevel(user: UserContext, requiredRole: SystemRole): PermissionCheckResult {
                // 首先检查认证状态
                const authResult = this.isAuthorized(user);
                if (!authResult.granted) {
                        return authResult;
                }

                if (user.admin) {
                        return { granted: true };
                }

                // 解析用户角色
                const userRole = this.parseUserRole(user.role);
                if (!userRole) {
                        return {
                                granted: false,
                                errorCode: 'INVALID_ROLE',
                                errorMessage: '无效的用户角色',
                        };
                }

                // 检查角色级别
                if (!meetsRoleRequirement(userRole, requiredRole)) {
                        return {
                                granted: false,
                                errorCode: 'INSUFFICIENT_ROLE_LEVEL',
                                errorMessage: `角色级别不足，需要 ${requiredRole} 或更高级别`,
                                requiredRole,
                        };
                }

                return { granted: true };
        }

        /**
         * 检查是否为管理员
         */
        static isAdmin(user: UserContext): PermissionCheckResult {
                return this.hasRoleLevel(user, SystemRole.ADMIN);
        }

        /**
         * 检查是否为数据集管理员或更高级别
         */
        static isDatasetManager(user: UserContext): PermissionCheckResult {
                return this.hasRoleLevel(user, SystemRole.DS_MANAGER);
        }

        /**
         * 解析用户角色
         * 支持字符串标识符和数字 ID
         */
        private static parseUserRole(role: string | number | undefined): SystemRole | null {
                if (!role) {
                        return null;
                }

                // 处理数字 ID
                if (typeof role === 'number') {
                        if (role === 1) { // 假设1为Admin的UUID
                                return SystemRole.ADMIN;
                        }
                        return null;
                }

                // 处理字符串标识符
                const trimmedRole = String(role).trim().toLowerCase();

                if (trimmedRole === '1' || trimmedRole.includes('admin')) {
                        return SystemRole.ADMIN;
                }

                // 检查是否为有效的系统角色
                if (isValidRole(trimmedRole)) {
                        return trimmedRole;
                }

                return null;
        }

        /**
         * 查找具有指定权限的最低级别角色
         */
        private static findRoleWithPermission(action: PermissionAction): SystemRole {
                // 按级别从低到高排序
                const rolesByLevel = Object.entries(ROLE_HIERARCHY)
                        .sort(([, a], [, b]) => a - b)
                        .map(([role]) => role as SystemRole);

                // 找到第一个具有该权限的角色
                for (const role of rolesByLevel) {
                        if (roleHasPermission(role, action)) {
                                return role;
                        }
                }

                // 如果没有角色具有该权限，返回管理员
                return SystemRole.ADMIN;
        }

        /**
         * 从 Express Request 对象提取用户上下文
         */
        static extractUserContext(req: any): UserContext {
                return {
                        userId: req.accountability?.user,
                        role: req.accountability?.role,
                        email: req.accountability?.user?.email,
                        authenticated: !!req.accountability?.user,
                        permissions: req.accountability?.permissions,
                        admin: req.accountability?.admin === true,
                };
        }

        /**
         * 创建权限检查中间件
         */
        static createPermissionMiddleware(action: PermissionAction, collection?: string) {
                return (req: any, res: any, next: any) => {
                        const user = this.extractUserContext(req);
                        const result = this.hasPermission(user, action, collection);

                        if (!result.granted) {
                                // 审计日志可以在这里添加
                                console.warn(`Permission Denied: User ${user.userId} attempted ${action} on ${collection || 'system'}`);
                                return res.status(result.errorCode === 'UNAUTHORIZED' ? 401 : 403).json({
                                        error: result.errorCode,
                                        message: result.errorMessage,
                                });
                        }

                        next();
                };
        }

        /**
         * 创建角色级别检查中间件
         */
        static createRoleMiddleware(requiredRole: SystemRole) {
                return (req: any, res: any, next: any) => {
                        const user = this.extractUserContext(req);
                        const result = this.hasRoleLevel(user, requiredRole);

                        if (!result.granted) {
                                console.warn(`Role Level Denied: User ${user.userId} lacks ${requiredRole}`);
                                return res.status(result.errorCode === 'UNAUTHORIZED' ? 401 : 403).json({
                                        error: result.errorCode,
                                        message: result.errorMessage,
                                });
                        }

                        next();
                };
        }
}

/**
 * 便捷的权限检查函数
 * 直接抛出错误而不是返回结果对象
 */
export function requirePermission(user: UserContext, action: PermissionAction, collection?: string): void {
        const result = PermissionChecker.hasPermission(user, action, collection);
        if (!result.granted) {
                const error = new Error(result.errorMessage) as any;
                error.code = result.errorCode;
                error.requiredRole = result.requiredRole;
                throw error;
        }
}

/**
 * 便捷的角色检查函数
 */
export function requireRoleLevel(user: UserContext, requiredRole: SystemRole): void {
        const result = PermissionChecker.hasRoleLevel(user, requiredRole);
        if (!result.granted) {
                const error = new Error(result.errorMessage) as any;
                error.code = result.errorCode;
                error.requiredRole = result.requiredRole;
                throw error;
        }
}
