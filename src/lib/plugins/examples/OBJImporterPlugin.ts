/**
 * 示例插件：OBJ 文件导入器
 *
 * 演示如何创建一个云端插件来加载 OBJ 格式的 3D 模型
 */

import type {
  Plugin,
  ModelImporter,
  ModelLoadResult,
  ModelConversionOptions,
} from '../types'
import { OBJLoader } from 'three/examples/jsm/loaders/OBJLoader'
import type { Scene } from 'three'

/**
 * OBJ 导入器实现
 */
class OBJImporter implements ModelImporter {
  readonly supportedExtensions = ['obj']
  readonly name = 'OBJ Importer'
  readonly description = 'Imports Wavefront OBJ 3D models'

  private loader = new OBJLoader()

  async canHandle(file: ArrayBuffer, extension: string): Promise<boolean> {
    if (extension !== 'obj') return false

    // 检查文件头以验证这是一个 OBJ 文件
    const decoder = new TextDecoder('utf-8')
    const header = decoder.decode(file.slice(0, 100))

    // OBJ 文件通常包含 "v ", "vt ", "vn ", "f " 等标记
    return /^(#|v |vt |vn |f |o |g |mtllib |usemtl |s )/m.test(header)
  }

  async load(
    file: ArrayBuffer,
    extension: string,
    options?: ModelConversionOptions,
    scene?: Scene
  ): Promise<ModelLoadResult> {
    return new Promise((resolve, reject) => {
      try {
        // 将 ArrayBuffer 转换为字符串
        const decoder = new TextDecoder('utf-8')
        const objText = decoder.decode(file)

        // 使用 OBJLoader 解析
        const object = this.loader.parse(objText)

        // 应用转换选项
        if (options) {
          this.applyOptions(object, options)
        }

        // 如果提供了场景，直接添加到场景
        if (scene) {
          scene.add(object)
        }

        // 收集几何体和材质
        const geometries: any[] = []
        const materials: any[] = []

        object.traverse((child: any) => {
          if (child.isMesh) {
            if (child.geometry) geometries.push(child.geometry)
            if (child.material) {
              if (Array.isArray(child.material)) {
                materials.push(...child.material)
              } else {
                materials.push(child.material)
              }
            }
          }
        })

        resolve({
          object,
          geometries,
          materials,
          metadata: {
            vertexCount: geometries.reduce(
              (sum, geo) => sum + (geo.attributes?.position?.count || 0),
              0
            ),
            faceCount: geometries.reduce(
              (sum, geo) => sum + (geo.index?.count || 0) / 3,
              0
            ),
          },
        })
      } catch (error) {
        reject(
          new Error(
            `Failed to load OBJ file: ${error instanceof Error ? error.message : String(error)}`
          )
        )
      }
    })
  }

  private applyOptions(
    object: any,
    options: ModelConversionOptions
  ): void {
    // 应用单位转换
    if (options.targetUnit) {
      const scale = this.getUnitScale(options.targetUnit)
      object.scale.multiplyScalar(scale)
    }

    // 应用坐标系转换
    if (options.coordinateSystem) {
      // 实现坐标系转换逻辑
      // 这里简化处理
    }

    // 生成法线
    if (options.generateNormals) {
      object.traverse((child: any) => {
        if (child.isMesh && child.geometry) {
          child.geometry.computeVertexNormals()
        }
      })
    }
  }

  private getUnitScale(targetUnit: string): number {
    // 假设源单位为米
    const scales: Record<string, number> = {
      mm: 1000,
      cm: 100,
      m: 1,
      in: 39.3701,
      ft: 3.28084,
      yd: 1.09361,
    }
    return scales[targetUnit] || 1
  }

  generateKclWrapper(fileName: string, metadata?: Record<string, any>): string {
    const alias = fileName.replace(/\.[^/.]+$/, '').replace(/[^a-zA-Z0-9]/g, '_')

    return `// Auto-generated KCL wrapper for OBJ import
// Imported from: ${fileName}
${metadata ? `// Vertices: ${metadata.vertexCount || 'unknown'}, Faces: ${metadata.faceCount || 'unknown'}` : ''}

import "${fileName}" as ${alias}

// The imported model is available as: ${alias}
// You can now reference it in your KCL code
`
  }
}

/**
 * OBJ 导入插件
 */
export const objImporterPlugin: Plugin = {
  metadata: {
    id: 'obj-importer',
    name: 'OBJ Importer',
    version: '1.0.0',
    description: 'Imports Wavefront OBJ 3D models into Zoo Design Studio',
    author: 'Zoo.dev',
    homepage: 'https://zoo.dev/plugins/obj-importer',
    license: 'MIT',
  },

  importers: [new OBJImporter()],

  hooks: {
    onActivate: async (context) => {
      context.showNotification('OBJ Importer plugin activated', 'success')
      console.log('OBJ Importer plugin activated', context)
    },

    onDeactivate: async () => {
      console.log('OBJ Importer plugin deactivated')
    },

    beforeLoad: async (fileName, extension) => {
      console.log(`About to load: ${fileName} (${extension})`)
      return true // 继续加载
    },

    afterLoad: async (result) => {
      console.log('Model loaded successfully:', result.metadata)
    },
  },

  defaultConfig: {
    autoGenerateNormals: true,
    defaultUnit: 'mm',
  },
}

// 插件工厂函数（用于云端加载）
// 云端插件脚本应该使用这种格式
export function createPlugin(): Plugin {
  return objImporterPlugin
}

// 默认导出（用于直接导入）
export default objImporterPlugin
