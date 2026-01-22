/**
 * 云端插件管理器
 *
 * 负责加载、注册、管理云端插件，并处理与云端 AI Agent 的交互
 */

import toast from 'react-hot-toast'
import type { Scene } from 'three'
import { Signal } from '@src/lib/signal'
import type {
  Plugin,
  PluginMetadata,
  CloudPluginDescriptor,
  ModelImporter,
  ModelExporter,
  PluginContext,
  PluginConfig,
  PluginSandboxConfig,
  PluginLoadError,
  PluginValidationError,
  ModelLoadResult,
  ModelConversionOptions,
} from './types'

/**
 * 插件注册表项
 */
interface PluginRegistryEntry {
  plugin: Plugin
  context: PluginContext
  descriptor?: CloudPluginDescriptor
  loaded: boolean
  active: boolean
  loadedAt: Date
}

/**
 * 插件管理器
 * 单例模式，管理所有插件的生命周期
 */
export class PluginManager {
  private static instance: PluginManager | null = null

  /** 已注册的插件 */
  private plugins = new Map<string, PluginRegistryEntry>()

  /** 模型导入器映射 (extension -> importers[]) */
  private importers = new Map<string, ModelImporter[]>()

  /** 模型导出器映射 (formatId -> exporter) */
  private exporters = new Map<string, ModelExporter>()

  /** Three.js 场景引用 */
  private scene?: Scene

  /** 插件加载事件 */
  public readonly onPluginLoaded = new Signal<Plugin>()

  /** 插件卸载事件 */
  public readonly onPluginUnloaded = new Signal<string>()

  /** 插件错误事件 */
  public readonly onPluginError = new Signal<{ pluginId: string; error: Error }>()

  /** 云端插件目录 URL */
  private cloudPluginRegistryUrl =
    'https://zoo.dev/api/plugins/registry' // 示例 URL

  private constructor() {}

  /**
   * 获取插件管理器单例
   */
  static getInstance(): PluginManager {
    if (!PluginManager.instance) {
      PluginManager.instance = new PluginManager()
    }
    return PluginManager.instance
  }

  /**
   * 设置 Three.js 场景引用
   */
  setScene(scene: Scene): void {
    this.scene = scene
  }

  /**
   * 设置云端插件目录 URL
   */
  setCloudPluginRegistryUrl(url: string): void {
    this.cloudPluginRegistryUrl = url
  }

  /**
   * 从云端获取可用插件列表
   */
  async fetchCloudPlugins(): Promise<CloudPluginDescriptor[]> {
    try {
      const response = await fetch(this.cloudPluginRegistryUrl)
      if (!response.ok) {
        throw new Error(`Failed to fetch plugins: ${response.statusText}`)
      }
      const plugins: CloudPluginDescriptor[] = await response.json()
      return plugins
    } catch (error) {
      console.error('Failed to fetch cloud plugins:', error)
      toast.error('Failed to fetch cloud plugins')
      return []
    }
  }

  /**
   * 从云端加载插件
   * @param descriptor 插件描述符
   * @param sandbox 沙箱配置
   */
  async loadCloudPlugin(
    descriptor: CloudPluginDescriptor,
    sandbox?: PluginSandboxConfig
  ): Promise<void> {
    try {
      // 检查插件是否已加载
      if (this.plugins.has(descriptor.id)) {
        console.warn(`Plugin ${descriptor.id} is already loaded`)
        return
      }

      toast.loading(`Loading plugin: ${descriptor.name}...`, {
        id: descriptor.id,
      })

      // 从云端加载插件脚本
      const pluginCode = await this.fetchPluginCode(descriptor.scriptUrl)

      // 在沙箱中执行插件代码
      const plugin = await this.executePluginInSandbox(
        pluginCode,
        descriptor,
        sandbox
      )

      // 验证插件
      this.validatePlugin(plugin)

      // 注册插件
      await this.registerPlugin(plugin, descriptor)

      toast.success(`Plugin loaded: ${descriptor.name}`, { id: descriptor.id })
      this.onPluginLoaded.dispatch(plugin)
    } catch (error) {
      const err =
        error instanceof Error ? error : new Error(String(error))
      toast.error(`Failed to load plugin: ${descriptor.name}`, {
        id: descriptor.id,
      })
      this.onPluginError.dispatch({ pluginId: descriptor.id, error: err })
      throw new PluginLoadError(descriptor.id, err.message, err)
    }
  }

  /**
   * 获取插件代码
   */
  private async fetchPluginCode(url: string): Promise<string> {
    const response = await fetch(url)
    if (!response.ok) {
      throw new Error(`Failed to fetch plugin code: ${response.statusText}`)
    }
    return response.text()
  }

  /**
   * 在沙箱中执行插件代码
   */
  private async executePluginInSandbox(
    code: string,
    descriptor: CloudPluginDescriptor,
    sandbox?: PluginSandboxConfig
  ): Promise<Plugin> {
    // 创建沙箱环境
    const sandboxGlobals = {
      console: console,
      fetch: sandbox?.permissions.network ? fetch : undefined,
      // 限制其他全局对象访问
    }

    // 使用 Function 构造器在受限环境中执行代码
    // 注意：实际生产环境应该使用更安全的沙箱机制（如 iframe + postMessage）
    try {
      const pluginFactory = new Function(
        'globals',
        `
        "use strict";
        ${code}
        return plugin; // 插件代码应该导出 plugin 对象
      `
      )

      const plugin = pluginFactory(sandboxGlobals) as Plugin

      return plugin
    } catch (error) {
      throw new Error(
        `Failed to execute plugin code: ${error instanceof Error ? error.message : String(error)}`
      )
    }
  }

  /**
   * 验证插件结构
   */
  private validatePlugin(plugin: Plugin): void {
    if (!plugin.metadata) {
      throw new PluginValidationError('unknown', 'Missing metadata')
    }

    const { id, name, version } = plugin.metadata

    if (!id || !name || !version) {
      throw new PluginValidationError(
        id || 'unknown',
        'Metadata must include id, name, and version'
      )
    }

    // 验证版本格式 (semver)
    const semverRegex = /^\d+\.\d+\.\d+$/
    if (!semverRegex.test(version)) {
      throw new PluginValidationError(
        id,
        `Invalid version format: ${version}. Expected semver (e.g., 1.0.0)`
      )
    }

    // 验证至少有一个导入器或导出器
    if (!plugin.importers?.length && !plugin.exporters?.length) {
      throw new PluginValidationError(
        id,
        'Plugin must provide at least one importer or exporter'
      )
    }
  }

  /**
   * 注册插件
   */
  async registerPlugin(
    plugin: Plugin,
    descriptor?: CloudPluginDescriptor
  ): Promise<void> {
    const { id } = plugin.metadata

    // 创建插件上下文
    const context = this.createPluginContext(plugin)

    // 保存插件
    this.plugins.set(id, {
      plugin,
      context,
      descriptor,
      loaded: true,
      active: true,
      loadedAt: new Date(),
    })

    // 注册导入器
    if (plugin.importers) {
      for (const importer of plugin.importers) {
        for (const ext of importer.supportedExtensions) {
          const existing = this.importers.get(ext) || []
          existing.push(importer)
          this.importers.set(ext, existing)
        }
      }
    }

    // 注册导出器
    if (plugin.exporters) {
      for (const exporter of plugin.exporters) {
        this.exporters.set(exporter.formatId, exporter)
      }
    }

    // 调用激活钩子
    if (plugin.hooks?.onActivate) {
      await plugin.hooks.onActivate(context)
    }
  }

  /**
   * 创建插件上下文
   */
  private createPluginContext(plugin: Plugin): PluginContext {
    const config = { ...plugin.defaultConfig }

    const context: PluginContext = {
      metadata: plugin.metadata,
      config,
      scene: this.scene,

      showNotification: (message, type = 'info') => {
        switch (type) {
          case 'success':
            toast.success(message)
            break
          case 'error':
            toast.error(message)
            break
          case 'warning':
            toast(message, { icon: '⚠️' })
            break
          default:
            toast(message)
        }
      },

      updateConfig: (newConfig) => {
        Object.assign(config, newConfig)
      },

      getAppState: () => ({
        // 这里应该集成实际的应用状态
        currentFile: undefined,
        projectPath: undefined,
        baseUnit: 'mm',
      }),
    }

    return context
  }

  /**
   * 卸载插件
   */
  async unloadPlugin(pluginId: string): Promise<void> {
    const entry = this.plugins.get(pluginId)
    if (!entry) {
      console.warn(`Plugin ${pluginId} is not loaded`)
      return
    }

    const { plugin } = entry

    // 调用停用钩子
    if (plugin.hooks?.onDeactivate) {
      await plugin.hooks.onDeactivate()
    }

    // 移除导入器
    if (plugin.importers) {
      for (const importer of plugin.importers) {
        for (const ext of importer.supportedExtensions) {
          const importers = this.importers.get(ext)
          if (importers) {
            const filtered = importers.filter((i) => i !== importer)
            if (filtered.length > 0) {
              this.importers.set(ext, filtered)
            } else {
              this.importers.delete(ext)
            }
          }
        }
      }
    }

    // 移除导出器
    if (plugin.exporters) {
      for (const exporter of plugin.exporters) {
        this.exporters.delete(exporter.formatId)
      }
    }

    // 移除插件
    this.plugins.delete(pluginId)

    toast.success(`Plugin unloaded: ${plugin.metadata.name}`)
    this.onPluginUnloaded.dispatch(pluginId)
  }

  /**
   * 获取支持指定扩展名的导入器
   */
  getImportersForExtension(extension: string): ModelImporter[] {
    return this.importers.get(extension.toLowerCase()) || []
  }

  /**
   * 获取导出器
   */
  getExporter(formatId: string): ModelExporter | undefined {
    return this.exporters.get(formatId)
  }

  /**
   * 获取所有已注册的插件
   */
  getPlugins(): Plugin[] {
    return Array.from(this.plugins.values()).map((entry) => entry.plugin)
  }

  /**
   * 获取插件信息
   */
  getPluginInfo(pluginId: string): PluginRegistryEntry | undefined {
    return this.plugins.get(pluginId)
  }

  /**
   * 使用插件加载模型文件
   */
  async loadModelWithPlugin(
    file: ArrayBuffer,
    fileName: string,
    options?: ModelConversionOptions
  ): Promise<ModelLoadResult | null> {
    const extension = fileName.split('.').pop()?.toLowerCase()
    if (!extension) {
      throw new Error('Invalid file name: missing extension')
    }

    const importers = this.getImportersForExtension(extension)
    if (importers.length === 0) {
      console.warn(`No plugin found for extension: ${extension}`)
      return null
    }

    // 尝试每个导入器
    for (const importer of importers) {
      try {
        const canHandle = await importer.canHandle(file, extension)
        if (!canHandle) continue

        // 获取插件上下文以调用钩子
        const plugin = this.findPluginByImporter(importer)
        if (plugin && plugin.hooks?.beforeLoad) {
          const shouldContinue = await plugin.hooks.beforeLoad(
            fileName,
            extension
          )
          if (!shouldContinue) continue
        }

        // 加载模型
        const result = await importer.load(file, extension, options, this.scene)

        // 调用加载后钩子
        if (plugin && plugin.hooks?.afterLoad) {
          await plugin.hooks.afterLoad(result)
        }

        return result
      } catch (error) {
        console.error(`Importer ${importer.name} failed:`, error)
        // 继续尝试下一个导入器
      }
    }

    throw new Error(`All importers failed for extension: ${extension}`)
  }

  /**
   * 查找拥有指定导入器的插件
   */
  private findPluginByImporter(importer: ModelImporter): Plugin | undefined {
    for (const entry of this.plugins.values()) {
      if (entry.plugin.importers?.includes(importer)) {
        return entry.plugin
      }
    }
    return undefined
  }

  /**
   * 获取所有支持的扩展名
   */
  getSupportedExtensions(): string[] {
    return Array.from(this.importers.keys())
  }

  /**
   * 获取所有支持的导出格式
   */
  getSupportedExportFormats(): string[] {
    return Array.from(this.exporters.keys())
  }

  /**
   * 清除所有插件
   */
  async clear(): Promise<void> {
    const pluginIds = Array.from(this.plugins.keys())
    for (const id of pluginIds) {
      await this.unloadPlugin(id)
    }
  }
}

// 导出单例
export const pluginManager = PluginManager.getInstance()
