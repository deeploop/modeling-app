# Zoo Design Studio - 云端插件系统指南

## 概述

Zoo Design Studio 的云端插件系统允许您通过插件扩展 2D/3D 模型的加载和处理功能。插件可以：

1. **加载自定义格式**：支持新的 2D/3D 模型文件格式
2. **云端处理**：将模型发送到云端 AI Agent 进行优化和修改
3. **自动返回结果**：处理后的模型自动返回到本地 Zoo Studio

## 架构概览

```
┌─────────────────────────────────────────────────────────┐
│                 Zoo Design Studio                       │
│  ┌───────────────────────────────────────────────────┐  │
│  │          Plugin Manager                           │  │
│  │  ┌─────────────┐  ┌─────────────┐               │  │
│  │  │   本地插件   │  │   云端插件   │               │  │
│  │  └─────────────┘  └─────────────┘               │  │
│  └───────────────────────────────────────────────────┘  │
│                         │                               │
│                         ▼                               │
│  ┌───────────────────────────────────────────────────┐  │
│  │       Model Importers / Exporters                 │  │
│  └───────────────────────────────────────────────────┘  │
│                         │                               │
│                         ▼                               │
│  ┌───────────────────────────────────────────────────┐  │
│  │          Three.js Scene                           │  │
│  └───────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────┘
                          │
                          ▼
         ┌────────────────────────────────┐
         │   Cloud AI Agent API           │
         │  • 模型优化                     │
         │  • 格式转换                     │
         │  • 自动修复                     │
         │  • 生成变体                     │
         └────────────────────────────────┘
```

## 快速开始

### 1. 初始化插件系统

在应用启动时初始化插件系统：

```typescript
import { initializePluginSystem } from '@src/lib/plugins'
import { sceneInfra } from '@src/clientSideScene/sceneInfra'

// 在应用初始化时
await initializePluginSystem(
  sceneInfra.scene,
  'https://zoo.dev/api/plugins'
)
```

### 2. 加载云端插件

从云端插件目录加载插件：

```typescript
import { pluginManager } from '@src/lib/plugins'

// 获取可用插件列表
const availablePlugins = await pluginManager.fetchCloudPlugins()

// 加载特定插件
const plugin = availablePlugins.find(p => p.id === 'obj-importer')
if (plugin) {
  await pluginManager.loadCloudPlugin(plugin)
}
```

### 3. 使用插件加载模型

```typescript
import { loadModelWithPluginOrEngine } from '@src/lib/plugins'

// 读取文件
const fileBuffer = await file.arrayBuffer()

// 使用插件或引擎加载
const result = await loadModelWithPluginOrEngine(
  fileBuffer,
  'model.obj',
  scene,
  {
    targetUnit: 'mm',
    generateNormals: true
  }
)

if (result.success) {
  console.log(`Loaded with ${result.usedPlugin ? 'plugin' : 'engine'}`)
}
```

### 4. 使用云端 AI Agent 处理模型

```typescript
import { sendModelToCloudAgent } from '@src/lib/plugins'

// 准备模型文件
const modelFile = {
  name: 'model.stl',
  contents: fileBuffer
}

// 发送到云端进行优化
const optimizedFiles = await sendModelToCloudAgent(
  modelFile,
  'optimize-geometry',
  'Optimize model for 3D printing',
  {
    targetPolyCount: 5000,
    preserveDetails: true
  }
)

// 使用优化后的模型
console.log('Optimized files:', optimizedFiles)
```

## 创建自定义插件

### 插件结构

```typescript
import type { Plugin, ModelImporter } from '@src/lib/plugins'

// 1. 实现导入器
class MyImporter implements ModelImporter {
  readonly supportedExtensions = ['myformat']
  readonly name = 'My Format Importer'

  async canHandle(file: ArrayBuffer, extension: string): Promise<boolean> {
    // 检查是否能处理此文件
    return extension === 'myformat'
  }

  async load(
    file: ArrayBuffer,
    extension: string,
    options?: ModelConversionOptions,
    scene?: Scene
  ): Promise<ModelLoadResult> {
    // 解析文件并返回 Three.js 对象
    const object = this.parseFile(file)

    if (scene) {
      scene.add(object)
    }

    return {
      object,
      metadata: { /* 元数据 */ }
    }
  }

  generateKclWrapper(fileName: string): string {
    return `import "${fileName}" as model`
  }
}

// 2. 定义插件
export const myPlugin: Plugin = {
  metadata: {
    id: 'my-plugin',
    name: 'My Plugin',
    version: '1.0.0',
    description: 'Loads custom format models',
    author: 'Your Name',
  },

  importers: [new MyImporter()],

  hooks: {
    onActivate: async (context) => {
      context.showNotification('Plugin activated!', 'success')
    }
  }
}
```

### 云端插件格式

云端插件应该导出一个工厂函数：

```javascript
// plugin.js (hosted on cloud)
const plugin = {
  metadata: {
    id: 'cloud-plugin',
    name: 'Cloud Plugin',
    version: '1.0.0',
    // ...
  },

  importers: [/* ... */],
  exporters: [/* ... */]
}

// 导出插件对象
plugin
```

## API 参考

### PluginManager

插件管理器单例，负责管理所有插件。

#### 方法

- `loadCloudPlugin(descriptor, sandbox?)` - 从云端加载插件
- `registerPlugin(plugin, descriptor?)` - 注册插件
- `unloadPlugin(pluginId)` - 卸载插件
- `getImportersForExtension(extension)` - 获取支持指定扩展名的导入器
- `loadModelWithPlugin(file, fileName, options?)` - 使用插件加载模型
- `getSupportedExtensions()` - 获取所有支持的扩展名
- `fetchCloudPlugins()` - 从云端获取可用插件列表

#### 事件

- `onPluginLoaded` - 插件加载完成
- `onPluginUnloaded` - 插件卸载完成
- `onPluginError` - 插件错误

### CloudAgentClient

云端 AI Agent 客户端，负责与云端服务通信。

#### 方法

- `submitTask(request)` - 提交任务到云端
- `getTaskStatus(taskId)` - 获取任务状态
- `waitForTask(taskId, options?)` - 等待任务完成
- `cancelTask(taskId)` - 取消任务
- `downloadTaskResult(taskId)` - 下载任务结果
- `processModel(modelFile, taskType, description?, parameters?, options?)` - 便捷方法：提交并等待任务完成

#### 任务类型

- `'optimize-geometry'` - 优化几何体
- `'generate-variations'` - 生成变体
- `'auto-fix'` - 自动修复
- `'convert-format'` - 格式转换
- `'analyze-model'` - 模型分析
- `'custom'` - 自定义任务

#### 事件

- `onTaskUpdate` - 任务状态更新
- `onTaskComplete` - 任务完成
- `onTaskFailed` - 任务失败

## 集成示例

### 在命令栏中添加"云端优化"命令

```typescript
// src/lib/commandBarConfigs/modelingCommandConfig.ts

import { sendModelToCloudAgent } from '@src/lib/plugins'

const optimizeWithCloud: Command = {
  name: 'optimizeWithCloud',
  displayName: 'Optimize with Cloud AI',
  description: 'Send model to cloud for AI optimization',
  icon: 'cloud',
  needsReview: false,
  args: {},
  onSubmit: async () => {
    // 获取当前模型
    const currentFile = getCurrentModelFile()

    // 发送到云端
    const result = await sendModelToCloudAgent(
      currentFile,
      'optimize-geometry',
      'Optimize for better performance'
    )

    // 应用结果
    applyOptimizedModel(result)
  }
}
```

### 在文件浏览器中支持新格式

```typescript
// src/components/Explorer/utils.ts

import { getExtendedImportExtensions } from '@src/lib/plugins'

export function getSupportedFileExtensions(): string[] {
  // 包含 Rust 引擎和插件支持的所有格式
  return getExtendedImportExtensions()
}
```

## 云端 API 规范

### 插件目录端点

**GET** `/api/plugins/registry`

返回可用插件列表：

```json
[
  {
    "id": "obj-importer",
    "name": "OBJ Importer",
    "version": "1.0.0",
    "scriptUrl": "https://cdn.zoo.dev/plugins/obj-importer-1.0.0.js",
    "type": "importer",
    "formats": ["obj"],
    "enabled": true,
    "rating": 4.5,
    "downloads": 1234
  }
]
```

### AI Agent 任务端点

**POST** `/api/ai-agent/tasks`

提交新任务：

```json
{
  "type": "optimize-geometry",
  "description": "Optimize model",
  "parameters": {
    "targetPolyCount": 5000
  }
}
```

**GET** `/api/ai-agent/tasks/{taskId}`

获取任务状态：

```json
{
  "taskId": "task-123",
  "status": "completed",
  "progress": 100,
  "resultFiles": [...]
}
```

**GET** `/api/ai-agent/tasks/{taskId}/result`

下载任务结果（返回文件或 ZIP）。

## 安全考虑

1. **插件沙箱**：插件在受限环境中执行，限制对敏感 API 的访问
2. **权限系统**：插件需要明确请求权限（网络、文件系统等）
3. **代码审查**：云端插件应经过审查和签名
4. **HTTPS 传输**：所有云端通信使用 HTTPS 加密
5. **用户同意**：上传到云端的数据需要用户明确同意

## 故障排查

### 插件加载失败

```typescript
pluginManager.onPluginError.add(({ pluginId, error }) => {
  console.error(`Plugin ${pluginId} failed:`, error)
  // 显示友好的错误消息
})
```

### 云端任务超时

```typescript
const result = await cloudAgentClient.waitForTask(taskId, {
  timeout: 600000, // 增加到 10 分钟
  pollingInterval: 5000 // 每 5 秒轮询一次
})
```

### 调试模式

```typescript
// 启用详细日志
localStorage.setItem('DEBUG_PLUGINS', 'true')
```

## 下一步

- 查看 `src/lib/plugins/examples/` 中的示例插件
- 阅读 API 文档以了解详细的类型定义
- 探索现有插件以获取灵感
- 加入 Zoo.dev 社区讨论插件开发

## 支持

- 文档：https://zoo.dev/docs/plugins
- 示例：https://github.com/KittyCAD/modeling-app/tree/main/src/lib/plugins/examples
- 社区：https://discord.gg/zoo-dev
- 问题反馈：https://github.com/KittyCAD/modeling-app/issues

---

**版本**: 1.0.0
**最后更新**: 2026-01-22
