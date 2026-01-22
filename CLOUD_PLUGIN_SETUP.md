# 云端插件系统配置指南

## 如何设置 AI Agent URL

Zoo Design Studio 的云端插件系统允许您通过设置来配置 AI Agent 和插件目录的 URL。

### 方法 1：通过设置界面（推荐）

1. 打开 Zoo Design Studio
2. 按 `Ctrl+K` (Windows/Linux) 或 `Cmd+K` (Mac) 打开命令面板
3. 输入 "settings" 并选择 "Open Settings"
4. 在设置中找到 **Plugins** 部分
5. 配置以下选项：

   - **Enable Cloud Plugins**: 启用/禁用云端插件系统
   - **Cloud Plugin Registry URL**: 云端插件目录的 URL（默认: `https://zoo.dev/api/plugins/registry`）
   - **AI Agent API URL**: AI Agent API 的 URL（默认: `https://zoo.dev/api/ai-agent`）
   - **AI Agent Timeout**: AI Agent 任务的超时时间（默认: 5 分钟）

### 方法 2：通过命令面板

1. 按 `Ctrl+K` (Windows/Linux) 或 `Cmd+K` (Mac)
2. 输入 "AI Agent" 或 "Cloud Plugin"
3. 从列表中选择要修改的设置
4. 输入新的值并确认

### 方法 3：通过配置文件

#### 用户级别设置（全局）

编辑配置文件：
- **Windows**: `%APPDATA%/Zoo Design Studio/settings.json`
- **Mac**: `~/Library/Application Support/Zoo Design Studio/settings.json`
- **Linux**: `~/.config/Zoo Design Studio/settings.json`

添加以下内容：

```json
{
  "plugins": {
    "enableCloudPlugins": true,
    "cloudPluginRegistryUrl": "https://your-custom-url.com/api/plugins/registry",
    "aiAgentApiUrl": "https://your-custom-url.com/api/ai-agent",
    "aiAgentTimeout": 300000
  }
}
```

#### 项目级别设置（仅当前项目）

在项目目录中创建 `.zoo/settings.json` 文件：

```json
{
  "plugins": {
    "aiAgentApiUrl": "https://your-project-specific-agent.com/api"
  }
}
```

## 使用云端插件系统

### 1. 启用云端插件

```typescript
// 在应用初始化时（如 App.tsx）
import { initializePluginSystem } from '@src/lib/plugins'
import { settings } from '@src/lib/settings/initialSettings'
import { sceneInfra } from '@src/clientSideScene/sceneInfra'

// 初始化插件系统
await initializePluginSystem(sceneInfra.scene, {
  cloudPluginRegistryUrl: settings.plugins.cloudPluginRegistryUrl.current,
  aiAgentApiUrl: settings.plugins.aiAgentApiUrl.current,
  aiAgentTimeout: settings.plugins.aiAgentTimeout.current,
  enableCloudPlugins: settings.plugins.enableCloudPlugins.current,
})
```

### 2. 加载云端插件

```typescript
import { loadCloudPlugin } from '@src/lib/plugins'

// 加载特定的云端插件
await loadCloudPlugin('obj-importer')
```

### 3. 使用云端 AI Agent 处理模型

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
```

### 4. 使用插件加载模型

```typescript
import { loadModelWithPluginOrEngine } from '@src/lib/plugins'

// 自动选择插件或引擎加载模型
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
  if (result.usedPlugin) {
    console.log(`Plugin: ${result.pluginName}`)
  }
}
```

## 开发自定义插件

### 本地插件开发

1. 在 `src/lib/plugins/examples/` 创建新的插件文件
2. 实现 `Plugin` 接口
3. 在 `initializePluginSystem` 中注册插件

示例：

```typescript
// src/lib/plugins/examples/MyCustomPlugin.ts
import type { Plugin, ModelImporter } from '@src/lib/plugins'

class MyImporter implements ModelImporter {
  readonly supportedExtensions = ['mycustom']
  readonly name = 'My Custom Importer'

  async canHandle(file: ArrayBuffer, extension: string): Promise<boolean> {
    return extension === 'mycustom'
  }

  async load(file: ArrayBuffer, extension: string, options, scene) {
    // 实现加载逻辑
    const object = parseMyCustomFormat(file)
    if (scene) scene.add(object)
    return { object }
  }
}

export const myCustomPlugin: Plugin = {
  metadata: {
    id: 'my-custom-plugin',
    name: 'My Custom Plugin',
    version: '1.0.0',
    description: 'Loads my custom format',
    author: 'Your Name',
  },
  importers: [new MyImporter()],
}

export default myCustomPlugin
```

### 云端插件开发

1. 创建插件 JavaScript 文件
2. 将文件托管到可访问的 URL
3. 在云端插件目录中注册插件

插件文件格式：

```javascript
// plugin.js
const plugin = {
  metadata: {
    id: 'my-cloud-plugin',
    name: 'My Cloud Plugin',
    version: '1.0.0',
    // ...
  },
  importers: [/* ... */],
  exporters: [/* ... */]
}

// 必须导出 plugin 对象
plugin
```

## 故障排查

### 无法连接到云端服务

1. 检查网络连接
2. 验证 URL 是否正确
3. 检查防火墙设置
4. 查看浏览器控制台是否有错误

### 插件加载失败

1. 检查插件 URL 是否可访问
2. 确认插件代码格式正确
3. 查看控制台错误信息
4. 尝试禁用其他插件

### AI Agent 超时

1. 增加超时时间设置
2. 减小模型文件大小
3. 简化处理参数
4. 联系 AI Agent 服务提供商

## 环境变量

您也可以通过环境变量设置这些值：

```bash
# .env 文件
CLOUD_PLUGIN_REGISTRY_URL=https://your-custom-url.com/api/plugins/registry
AI_AGENT_API_URL=https://your-custom-url.com/api/ai-agent
AI_AGENT_TIMEOUT=300000
ENABLE_CLOUD_PLUGINS=true
```

## 安全性

- 只从信任的源加载插件
- 云端插件在沙箱环境中运行
- 上传到 AI Agent 的数据会通过 HTTPS 加密
- 定期检查和更新插件

## 更多资源

- [完整插件系统指南](PLUGIN_SYSTEM_GUIDE.md)
- [技术文档](src/lib/plugins/README.md)
- [示例插件](src/lib/plugins/examples/)
- [API 参考](src/lib/plugins/types.ts)

## 支持

如有问题，请访问：
- 文档: https://zoo.dev/docs/plugins
- 社区: https://discord.gg/zoo-dev
- 问题反馈: https://github.com/KittyCAD/modeling-app/issues
