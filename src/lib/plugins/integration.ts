/**
 * 插件系统集成
 *
 * 将云端插件系统集成到现有的模型导入/导出流程
 */

import { pluginManager } from './PluginManager'
import { cloudAgentClient } from './CloudAgentClient'
import type { Scene } from 'three'
import type ModelingAppFile from '@src/lib/modelingAppFile'
import type { ModelConversionOptions } from './types'
import { importFileExtensions } from '@src/lang/wasmUtils'
import type { ModuleType } from '@src/lib/wasm_lib_wrapper'

/**
 * 扩展的文件扩展名列表
 * 包含 Rust 引擎支持的扩展名 + 插件支持的扩展名
 */
export function getExtendedImportExtensions(
  wasmInstance?: ModuleType
): string[] {
  // 获取 Rust 引擎支持的扩展名
  const rustExtensions = importFileExtensions(wasmInstance)

  // 获取插件支持的扩展名
  const pluginExtensions = pluginManager.getSupportedExtensions()

  // 合并并去重
  return Array.from(new Set([...rustExtensions, ...pluginExtensions]))
}

/**
 * 检查是否应该使用插件加载文件
 */
export function shouldUsePlugin(extension: string): boolean {
  const pluginExtensions = pluginManager.getSupportedExtensions()
  return pluginExtensions.includes(extension.toLowerCase())
}

/**
 * 使用插件或 Rust 引擎加载模型
 */
export async function loadModelWithPluginOrEngine(
  file: ArrayBuffer,
  fileName: string,
  scene?: Scene,
  options?: ModelConversionOptions
): Promise<{
  success: boolean
  usedPlugin: boolean
  pluginName?: string
  result?: any
  error?: Error
}> {
  const extension = fileName.split('.').pop()?.toLowerCase()

  if (!extension) {
    return {
      success: false,
      usedPlugin: false,
      error: new Error('Invalid file name: missing extension'),
    }
  }

  // 检查是否有插件支持此扩展名
  if (shouldUsePlugin(extension)) {
    try {
      const result = await pluginManager.loadModelWithPlugin(
        file,
        fileName,
        options
      )

      if (result) {
        // 找到使用的插件名称
        const importers = pluginManager.getImportersForExtension(extension)
        const pluginName = importers[0]?.name || 'Unknown Plugin'

        return {
          success: true,
          usedPlugin: true,
          pluginName,
          result,
        }
      }

      // 没有插件能处理，回退到 Rust 引擎
      console.log(
        `No plugin could handle ${extension}, falling back to Rust engine`
      )
    } catch (error) {
      console.error('Plugin failed to load model:', error)
      return {
        success: false,
        usedPlugin: true,
        error: error instanceof Error ? error : new Error(String(error)),
      }
    }
  }

  // 使用 Rust 引擎加载（现有流程）
  // 这里应该调用现有的 rustContext 导入逻辑
  return {
    success: false,
    usedPlugin: false,
    error: new Error(
      'Rust engine import not implemented in this integration layer'
    ),
  }
}

/**
 * 发送模型到云端 AI Agent 进行处理
 */
export async function sendModelToCloudAgent(
  modelFile: ModelingAppFile,
  taskType: 'optimize-geometry' | 'generate-variations' | 'auto-fix' | 'convert-format' | 'analyze-model',
  description?: string,
  parameters?: Record<string, any>
): Promise<ModelingAppFile[]> {
  return cloudAgentClient.processModel(
    modelFile,
    taskType,
    description,
    parameters
  )
}

/**
 * 插件系统设置接口
 */
export interface PluginSystemSettings {
  /** 云端插件目录 URL */
  cloudPluginRegistryUrl?: string
  /** AI Agent API URL */
  aiAgentApiUrl?: string
  /** AI Agent 超时时间（毫秒） */
  aiAgentTimeout?: number
  /** 是否启用云端插件 */
  enableCloudPlugins?: boolean
}

/**
 * 初始化插件系统
 * @param scene Three.js 场景（可选）
 * @param settings 插件系统设置（可选）
 */
export async function initializePluginSystem(
  scene?: Scene,
  settings?: PluginSystemSettings
): Promise<void> {
  console.log('Initializing plugin system...')

  // 设置场景
  if (scene) {
    pluginManager.setScene(scene)
  }

  // 设置云端插件目录 URL
  if (settings?.cloudPluginRegistryUrl) {
    pluginManager.setCloudPluginRegistryUrl(settings.cloudPluginRegistryUrl)
  }

  // 设置 AI Agent API URL
  if (settings?.aiAgentApiUrl) {
    cloudAgentClient.setApiUrl(settings.aiAgentApiUrl)
  }

  // 设置 AI Agent 超时
  if (settings?.aiAgentTimeout) {
    cloudAgentClient.setDefaultTimeout(settings.aiAgentTimeout)
  }

  // 加载本地插件（内置插件）
  try {
    // 动态导入示例插件
    const { default: objPlugin } = await import(
      './examples/OBJImporterPlugin'
    )
    await pluginManager.registerPlugin(objPlugin)
    console.log('Registered OBJ Importer plugin')
  } catch (error) {
    console.warn('Failed to register OBJ Importer plugin:', error)
  }

  // 订阅插件事件
  pluginManager.onPluginLoaded.add((plugin) => {
    console.log(`Plugin loaded: ${plugin.metadata.name}`)
  })

  pluginManager.onPluginError.add(({ pluginId, error }) => {
    console.error(`Plugin error (${pluginId}):`, error)
  })

  // 如果启用了云端插件，自动获取插件列表
  if (settings?.enableCloudPlugins) {
    try {
      const cloudPlugins = await pluginManager.fetchCloudPlugins()
      console.log(`Found ${cloudPlugins.length} cloud plugins`)

      // 记录推荐的插件
      const recommended = cloudPlugins.filter(
        (p) => p.enabled && p.rating && p.rating >= 4.0
      )
      if (recommended.length > 0) {
        console.log(
          `Recommended plugins:`,
          recommended.map((p) => p.name).join(', ')
        )
      }
    } catch (error) {
      console.warn('Failed to fetch cloud plugins:', error)
    }
  }

  console.log('Plugin system initialized')
}

/**
 * 从云端加载插件
 */
export async function loadCloudPlugin(pluginId: string): Promise<void> {
  // 获取云端插件列表
  const cloudPlugins = await pluginManager.fetchCloudPlugins()

  // 查找指定的插件
  const pluginDescriptor = cloudPlugins.find((p) => p.id === pluginId)

  if (!pluginDescriptor) {
    throw new Error(`Plugin not found: ${pluginId}`)
  }

  // 加载插件
  await pluginManager.loadCloudPlugin(pluginDescriptor)
}

/**
 * 生成 KCL 包装文件内容
 * 扩展现有的导入包装逻辑以支持插件
 */
export async function generateKclWrapperForImport(
  fileName: string,
  metadata?: Record<string, any>
): Promise<string> {
  const extension = fileName.split('.').pop()?.toLowerCase()

  if (!extension) {
    throw new Error('Invalid file name: missing extension')
  }

  // 检查是否有插件可以生成 KCL 包装代码
  const importers = pluginManager.getImportersForExtension(extension)

  for (const importer of importers) {
    if (importer.generateKclWrapper) {
      return importer.generateKclWrapper(fileName, metadata)
    }
  }

  // 回退到默认的包装代码
  const alias =
    fileName
      .replace(/\.[^/.]+$/, '')
      .replace(/[^a-zA-Z0-9]/g, '_') || 'model'

  return `// This file was automatically generated by the application when you
// double-clicked on the model file.
// You can edit this file to add your own content.
// But we recommend you keep the import statement as it is.
// For more information on the import statement, see the documentation at:
// https://zoo.dev/docs/kcl-lang/modules
import "${fileName}" as ${alias}`
}

/**
 * 导出插件管理器和客户端实例
 */
export { pluginManager, cloudAgentClient }

/**
 * 导出所有类型
 */
export * from './types'
