# 云端插件系统

这个目录包含 Zoo Design Studio 的云端插件系统实现，允许通过插件扩展 2D/3D 模型加载功能，并支持云端 AI Agent 处理模型。

## 目录结构

```
plugins/
├── types.ts                    # 类型定义和接口
├── PluginManager.ts            # 插件管理器（加载、注册、管理插件）
├── CloudAgentClient.ts         # 云端 AI Agent 客户端
├── integration.ts              # 与现有系统的集成代码
├── index.ts                    # 主入口文件
├── README.md                   # 本文件
└── examples/                   # 示例插件
    ├── OBJImporterPlugin.ts    # OBJ 格式导入器示例
    └── CloudProcessorPlugin.ts # 云端处理器示例
```

## 主要组件

### 1. 类型系统 (types.ts)

定义了插件系统的核心接口：

- `Plugin` - 插件主接口
- `ModelImporter` - 模型导入器接口
- `ModelExporter` - 模型导出器接口
- `PluginContext` - 插件运行时上下文
- `CloudPluginDescriptor` - 云端插件描述符
- `AgentTaskRequest/Response` - AI Agent 任务接口

### 2. 插件管理器 (PluginManager.ts)

管理插件生命周期的单例类：

**功能：**
- 从云端加载插件脚本
- 在沙箱中执行插件代码
- 注册和卸载插件
- 管理导入器/导出器映射
- 提供插件发现和查询 API

**使用示例：**
```typescript
import { pluginManager } from '@src/lib/plugins'

// 加载云端插件
await pluginManager.loadCloudPlugin(descriptor)

// 使用插件加载模型
const result = await pluginManager.loadModelWithPlugin(
  fileBuffer,
  'model.obj',
  { targetUnit: 'mm' }
)
```

### 3. 云端 AI Agent 客户端 (CloudAgentClient.ts)

与云端 AI 服务通信的客户端：

**功能：**
- 提交模型处理任务到云端
- 轮询任务状态直到完成
- 下载处理后的结果
- 任务管理（取消、重试等）

**支持的任务类型：**
- `optimize-geometry` - 几何体优化
- `generate-variations` - 生成模型变体
- `auto-fix` - 自动修复模型问题
- `convert-format` - 格式转换
- `analyze-model` - 模型分析

**使用示例：**
```typescript
import { cloudAgentClient } from '@src/lib/plugins'

// 发送模型到云端优化
const optimizedFiles = await cloudAgentClient.processModel(
  modelFile,
  'optimize-geometry',
  'Reduce polygon count',
  { targetPolyCount: 5000 }
)
```

### 4. 集成层 (integration.ts)

将插件系统集成到现有应用：

**功能：**
- 扩展文件扩展名列表（Rust + 插件）
- 统一的模型加载接口
- KCL 包装文件生成
- 系统初始化

**使用示例：**
```typescript
import {
  initializePluginSystem,
  loadModelWithPluginOrEngine
} from '@src/lib/plugins'

// 初始化系统
await initializePluginSystem(scene)

// 加载模型（自动选择插件或引擎）
const result = await loadModelWithPluginOrEngine(
  buffer,
  'model.obj',
  scene
)
```

## 示例插件

### OBJ 导入器 (examples/OBJImporterPlugin.ts)

展示如何创建一个基本的模型导入器插件：

- 支持 .obj 格式
- 使用 Three.js OBJLoader
- 提供单位转换和坐标系转换
- 自动生成 KCL 包装代码

### 云端处理器 (examples/CloudProcessorPlugin.ts)

展示如何集成云端 AI Agent：

- 自定义 .cloudopt 格式
- 自动发送模型到云端优化
- 等待处理完成并加载结果
- 显示处理进度和结果

## 工作流程

### 本地插件加载流程

```
1. 用户选择文件
   ↓
2. 检查扩展名
   ↓
3. 查找支持的插件
   ↓
4. 插件加载模型
   ↓
5. 添加到 Three.js 场景
   ↓
6. 生成 KCL 包装文件
```

### 云端处理流程

```
1. 用户请求云端处理
   ↓
2. 上传模型到云端
   ↓
3. 云端 AI Agent 处理
   ↓
4. 轮询任务状态
   ↓
5. 下载处理结果
   ↓
6. 加载到本地场景
   ↓
7. 更新 KCL 代码
```

## 集成到现有系统

### 1. 在应用启动时初始化

```typescript
// src/App.tsx 或 src/main.ts
import { initializePluginSystem } from '@src/lib/plugins'
import { sceneInfra } from '@src/clientSideScene/sceneInfra'

useEffect(() => {
  initializePluginSystem(sceneInfra.scene)
}, [])
```

### 2. 扩展导入文件类型

```typescript
// src/lib/getCurrentProjectFile.ts
import { getExtendedImportExtensions } from '@src/lib/plugins'

const allFileImportFormats = getExtendedImportExtensions(wasmInstance)
```

### 3. 在文件导入时使用插件

```typescript
// src/machines/systemIO/systemIOMachine.ts
import { loadModelWithPluginOrEngine } from '@src/lib/plugins'

const result = await loadModelWithPluginOrEngine(
  fileBuffer,
  fileName,
  scene
)
```

### 4. 添加云端优化命令

```typescript
// src/lib/commandBarConfigs/modelingCommandConfig.ts
import { sendModelToCloudAgent } from '@src/lib/plugins'

const optimizeCommand = {
  name: 'optimize',
  onSubmit: async () => {
    await sendModelToCloudAgent(model, 'optimize-geometry')
  }
}
```

## 开发新插件

### 最小插件示例

```typescript
import type { Plugin, ModelImporter } from '@src/lib/plugins'

class MyImporter implements ModelImporter {
  supportedExtensions = ['xyz']
  name = 'XYZ Importer'

  async canHandle(file: ArrayBuffer, ext: string) {
    return ext === 'xyz'
  }

  async load(file: ArrayBuffer) {
    // 解析文件
    const object = parseXYZFile(file)
    return { object }
  }
}

export const myPlugin: Plugin = {
  metadata: {
    id: 'xyz-importer',
    name: 'XYZ Importer',
    version: '1.0.0',
    description: 'Import XYZ files',
    author: 'Me'
  },
  importers: [new MyImporter()]
}
```

### 测试插件

```typescript
import { pluginManager } from '@src/lib/plugins'
import myPlugin from './myPlugin'

// 注册插件
await pluginManager.registerPlugin(myPlugin)

// 测试加载
const result = await pluginManager.loadModelWithPlugin(
  testFileBuffer,
  'test.xyz'
)

console.assert(result !== null, 'Plugin should load the file')
```

## 安全考虑

1. **沙箱执行**：插件代码在受限环境中运行
2. **权限控制**：明确的权限系统
3. **代码签名**：云端插件需要签名验证
4. **网络隔离**：限制插件网络访问
5. **用户确认**：敏感操作需要用户同意

## 性能优化

1. **懒加载**：按需加载插件
2. **Worker 线程**：在 Worker 中处理大文件
3. **缓存**：缓存已加载的插件和结果
4. **批处理**：合并多个小文件请求

## 调试

启用调试日志：

```typescript
localStorage.setItem('DEBUG_PLUGINS', 'true')
```

监听插件事件：

```typescript
pluginManager.onPluginError.add(({ pluginId, error }) => {
  console.error(`Plugin ${pluginId} error:`, error)
})

cloudAgentClient.onTaskUpdate.add((task) => {
  console.log(`Task ${task.taskId}: ${task.progress}%`)
})
```

## 路线图

- [ ] 插件市场 UI
- [ ] 插件版本管理
- [ ] 插件依赖系统
- [ ] 更多内置插件
- [ ] 插件性能监控
- [ ] 插件开发工具包

## 参考

- [插件系统指南](../../../PLUGIN_SYSTEM_GUIDE.md) - 完整的使用文档
- [Three.js Loaders](https://threejs.org/docs/#manual/en/introduction/Loading-3D-models) - Three.js 加载器文档
- [Web Workers](https://developer.mozilla.org/en-US/docs/Web/API/Web_Workers_API) - Worker API 文档

## 维护者

Zoo.dev Team <dev@zoo.dev>

## 许可证

MIT
