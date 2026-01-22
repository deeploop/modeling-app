/**
 * 云端插件系统 - 类型定义
 *
 * 这个文件定义了插件系统的核心接口和类型，允许从云端加载插件来扩展模型加载功能。
 */

import type { Scene, Object3D, BufferGeometry, Material } from 'three'
import type ModelingAppFile from '@src/lib/modelingAppFile'

/**
 * 插件元数据
 */
export interface PluginMetadata {
  /** 插件唯一标识符 */
  id: string
  /** 插件名称 */
  name: string
  /** 插件版本 (semver) */
  version: string
  /** 插件描述 */
  description: string
  /** 插件作者 */
  author: string
  /** 插件主页或仓库 URL */
  homepage?: string
  /** 插件许可证 */
  license?: string
  /** 插件图标 URL */
  icon?: string
}

/**
 * 模型加载结果
 */
export interface ModelLoadResult {
  /** 加载的 Three.js 对象 */
  object: Object3D
  /** 几何体数组（如果有） */
  geometries?: BufferGeometry[]
  /** 材质数组（如果有） */
  materials?: Material[]
  /** 附加元数据 */
  metadata?: Record<string, any>
}

/**
 * 模型转换选项
 */
export interface ModelConversionOptions {
  /** 目标单位 (mm, cm, m, in, ft, yd) */
  targetUnit?: 'mm' | 'cm' | 'm' | 'in' | 'ft' | 'yd'
  /** 坐标系转换 */
  coordinateSystem?: {
    forward: { axis: 'x' | 'y' | 'z'; direction: 'positive' | 'negative' }
    up: { axis: 'x' | 'y' | 'z'; direction: 'positive' | 'negative' }
  }
  /** 是否合并几何体 */
  mergeGeometries?: boolean
  /** 是否生成法线 */
  generateNormals?: boolean
  /** 自定义选项 */
  custom?: Record<string, any>
}

/**
 * 模型导入器接口
 * 插件可以实现此接口来支持新的文件格式
 */
export interface ModelImporter {
  /** 支持的文件扩展名（小写，不带点） */
  readonly supportedExtensions: string[]

  /** 导入器名称 */
  readonly name: string

  /** 导入器描述 */
  readonly description?: string

  /**
   * 检查是否可以处理指定的文件
   * @param file 文件数据
   * @param extension 文件扩展名（小写，不带点）
   * @returns 是否可以处理
   */
  canHandle(file: ArrayBuffer, extension: string): boolean | Promise<boolean>

  /**
   * 从文件加载模型
   * @param file 文件数据
   * @param extension 文件扩展名（小写，不带点）
   * @param options 转换选项
   * @param scene Three.js 场景（可选，用于直接添加对象）
   * @returns 加载结果
   */
  load(
    file: ArrayBuffer,
    extension: string,
    options?: ModelConversionOptions,
    scene?: Scene
  ): Promise<ModelLoadResult>

  /**
   * 生成 KCL 包装代码（可选）
   * 如果提供，将自动创建 KCL 文件来导入模型
   * @param fileName 原始文件名
   * @param metadata 模型元数据
   * @returns KCL 代码字符串
   */
  generateKclWrapper?(fileName: string, metadata?: Record<string, any>): string
}

/**
 * 模型导出器接口
 * 插件可以实现此接口来支持新的导出格式
 */
export interface ModelExporter {
  /** 支持的导出格式标识符 */
  readonly formatId: string

  /** 格式名称 */
  readonly name: string

  /** 文件扩展名（小写，不带点） */
  readonly extension: string

  /** 导出器描述 */
  readonly description?: string

  /**
   * 导出场景到文件
   * @param scene Three.js 场景或对象
   * @param options 导出选项
   * @returns 导出的文件数据
   */
  export(
    scene: Scene | Object3D,
    options?: ModelConversionOptions
  ): Promise<ModelingAppFile | ModelingAppFile[]>
}

/**
 * 插件生命周期钩子
 */
export interface PluginHooks {
  /**
   * 插件激活时调用
   * @param context 插件上下文
   */
  onActivate?(context: PluginContext): void | Promise<void>

  /**
   * 插件停用时调用
   */
  onDeactivate?(): void | Promise<void>

  /**
   * 插件加载文件前调用
   * @param fileName 文件名
   * @param extension 扩展名
   * @returns 是否继续加载
   */
  beforeLoad?(fileName: string, extension: string): boolean | Promise<boolean>

  /**
   * 插件加载文件后调用
   * @param result 加载结果
   */
  afterLoad?(result: ModelLoadResult): void | Promise<void>
}

/**
 * 插件配置
 */
export interface PluginConfig {
  /** 配置项 */
  [key: string]: any
}

/**
 * 插件上下文
 * 提供给插件的运行时环境和 API
 */
export interface PluginContext {
  /** 插件元数据 */
  metadata: PluginMetadata

  /** 插件配置 */
  config: PluginConfig

  /** Three.js 场景引用 */
  scene?: Scene

  /**
   * 显示通知
   * @param message 消息内容
   * @param type 消息类型
   */
  showNotification(
    message: string,
    type?: 'success' | 'error' | 'info' | 'warning'
  ): void

  /**
   * 更新插件配置
   * @param config 新配置
   */
  updateConfig(config: Partial<PluginConfig>): void

  /**
   * 获取应用程序状态
   */
  getAppState(): {
    currentFile?: string
    projectPath?: string
    baseUnit?: string
  }
}

/**
 * 插件定义
 * 插件的主入口接口
 */
export interface Plugin {
  /** 插件元数据 */
  metadata: PluginMetadata

  /** 模型导入器（可选） */
  importers?: ModelImporter[]

  /** 模型导出器（可选） */
  exporters?: ModelExporter[]

  /** 生命周期钩子（可选） */
  hooks?: PluginHooks

  /** 默认配置（可选） */
  defaultConfig?: PluginConfig
}

/**
 * 云端插件描述符
 * 用于从云端加载插件
 */
export interface CloudPluginDescriptor {
  /** 插件 ID */
  id: string

  /** 插件名称 */
  name: string

  /** 插件版本 */
  version: string

  /** 插件脚本 URL */
  scriptUrl: string

  /** 插件类型 */
  type: 'importer' | 'exporter' | 'both'

  /** 支持的格式 */
  formats: string[]

  /** 是否已启用 */
  enabled: boolean

  /** 插件标签 */
  tags?: string[]

  /** 插件评分 (0-5) */
  rating?: number

  /** 下载次数 */
  downloads?: number

  /** 最后更新时间 */
  lastUpdated?: string
}

/**
 * 插件加载错误
 */
export class PluginLoadError extends Error {
  constructor(
    public pluginId: string,
    message: string,
    public cause?: Error
  ) {
    super(`Failed to load plugin "${pluginId}": ${message}`)
    this.name = 'PluginLoadError'
  }
}

/**
 * 插件验证错误
 */
export class PluginValidationError extends Error {
  constructor(
    public pluginId: string,
    message: string
  ) {
    super(`Plugin "${pluginId}" validation failed: ${message}`)
    this.name = 'PluginValidationError'
  }
}

/**
 * 插件权限
 */
export interface PluginPermissions {
  /** 是否允许网络访问 */
  network?: boolean

  /** 是否允许文件系统访问 */
  filesystem?: boolean

  /** 是否允许修改场景 */
  modifyScene?: boolean

  /** 是否允许执行代码 */
  executeCode?: boolean
}

/**
 * 插件沙箱配置
 */
export interface PluginSandboxConfig {
  /** 插件权限 */
  permissions: PluginPermissions

  /** 超时时间（毫秒） */
  timeout?: number

  /** 内存限制（字节） */
  memoryLimit?: number
}
