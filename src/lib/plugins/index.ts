/**
 * 云端插件系统
 *
 * 主入口文件，导出所有插件系统的公共 API
 */

export * from './types'
export * from './PluginManager'
export * from './CloudAgentClient'
export * from './integration'

// 导出单例实例
export { pluginManager } from './PluginManager'
export { cloudAgentClient } from './CloudAgentClient'

// 导出示例插件
export { default as objImporterPlugin } from './examples/OBJImporterPlugin'
export { default as cloudProcessorPlugin } from './examples/CloudProcessorPlugin'
