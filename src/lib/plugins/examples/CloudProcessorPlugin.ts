/**
 * 示例插件：云端模型处理器
 *
 * 演示如何创建一个插件，将模型发送到云端 AI Agent 进行处理
 */

import type {
  Plugin,
  ModelImporter,
  ModelLoadResult,
  ModelConversionOptions,
} from '../types'
import { cloudAgentClient } from '../CloudAgentClient'
import type ModelingAppFile from '@src/lib/modelingAppFile'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader'
import type { Scene } from 'three'

/**
 * 云端处理导入器
 * 在加载模型时，自动将其发送到云端进行优化
 */
class CloudProcessingImporter implements ModelImporter {
  readonly supportedExtensions = ['cloudopt'] // 自定义扩展名
  readonly name = 'Cloud Processing Importer'
  readonly description =
    'Imports models and optimizes them using cloud AI Agent'

  private gltfLoader = new GLTFLoader()

  async canHandle(file: ArrayBuffer, extension: string): Promise<boolean> {
    return extension === 'cloudopt'
  }

  async load(
    file: ArrayBuffer,
    extension: string,
    options?: ModelConversionOptions,
    scene?: Scene
  ): Promise<ModelLoadResult> {
    // 创建临时文件对象
    const modelFile: ModelingAppFile = {
      name: `model.${extension}`,
      contents: file,
    }

    // 发送到云端进行优化
    const optimizedFiles = await cloudAgentClient.processModel(
      modelFile,
      'optimize-geometry',
      'Optimize model geometry for better performance',
      {
        targetPolyCount: options?.custom?.targetPolyCount || 10000,
        preserveUVs: true,
        generateLODs: true,
      }
    )

    // 假设返回的是 GLTF 格式
    if (optimizedFiles.length === 0) {
      throw new Error('No optimized files returned from cloud agent')
    }

    const optimizedFile = optimizedFiles[0]

    // 加载优化后的模型
    return new Promise((resolve, reject) => {
      this.gltfLoader.parse(
        optimizedFile.contents,
        '',
        (gltf) => {
          const object = gltf.scene

          if (scene) {
            scene.add(object)
          }

          resolve({
            object,
            geometries: [],
            materials: [],
            metadata: {
              optimized: true,
              cloudProcessed: true,
              originalSize: file.byteLength,
              optimizedSize: optimizedFile.contents.byteLength,
            },
          })
        },
        (error) => {
          reject(
            new Error(
              `Failed to load optimized model: ${error instanceof Error ? error.message : String(error)}`
            )
          )
        }
      )
    })
  }

  generateKclWrapper(fileName: string, metadata?: Record<string, any>): string {
    const alias = fileName.replace(/\.[^/.]+$/, '').replace(/[^a-zA-Z0-9]/g, '_')

    return `// Cloud-optimized model import
// Original file: ${fileName}
${metadata ? `// Optimization: ${metadata.originalSize} -> ${metadata.optimizedSize} bytes` : ''}

import "${fileName}" as ${alias}

// This model has been optimized by cloud AI Agent
`
  }
}

/**
 * 云端处理插件
 */
export const cloudProcessorPlugin: Plugin = {
  metadata: {
    id: 'cloud-processor',
    name: 'Cloud AI Processor',
    version: '1.0.0',
    description:
      'Sends models to cloud AI Agent for optimization and processing',
    author: 'Zoo.dev',
    homepage: 'https://zoo.dev/plugins/cloud-processor',
    license: 'MIT',
    icon: '☁️',
  },

  importers: [new CloudProcessingImporter()],

  hooks: {
    onActivate: async (context) => {
      context.showNotification(
        'Cloud AI Processor plugin activated',
        'success'
      )

      // 订阅云端任务事件
      cloudAgentClient.onTaskComplete.add((task) => {
        context.showNotification(
          `Cloud task completed: ${task.taskId}`,
          'success'
        )
      })

      cloudAgentClient.onTaskFailed.add((task) => {
        context.showNotification(
          `Cloud task failed: ${task.error || 'Unknown error'}`,
          'error'
        )
      })
    },

    onDeactivate: async () => {
      console.log('Cloud AI Processor plugin deactivated')
    },

    beforeLoad: async (fileName, extension) => {
      // 显示警告，因为会发送数据到云端
      console.warn(
        `File ${fileName} will be sent to cloud for processing. This may take a few moments.`
      )
      return true
    },

    afterLoad: async (result) => {
      if (result.metadata?.cloudProcessed) {
        console.log('Model successfully processed by cloud AI:', result.metadata)
      }
    },
  },

  defaultConfig: {
    apiUrl: 'https://zoo.dev/api/ai-agent',
    autoOptimize: true,
    targetPolyCount: 10000,
    timeout: 300000, // 5 分钟
  },
}

export default cloudProcessorPlugin
