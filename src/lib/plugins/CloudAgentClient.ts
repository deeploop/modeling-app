/**
 * 云端 AI Agent 客户端
 *
 * 负责与云端 AI Agent 通信，发送模型进行处理，并接收处理后的结果
 */

import toast from 'react-hot-toast'
import type { Object3D, Scene } from 'three'
import { Signal } from '@src/lib/signal'
import type ModelingAppFile from '@src/lib/modelingAppFile'

/**
 * AI Agent 任务类型
 */
export type AgentTaskType =
  | 'optimize-geometry' // 优化几何体
  | 'generate-variations' // 生成变体
  | 'auto-fix' // 自动修复
  | 'convert-format' // 格式转换
  | 'analyze-model' // 模型分析
  | 'custom' // 自定义任务

/**
 * AI Agent 任务请求
 */
export interface AgentTaskRequest {
  /** 任务类型 */
  type: AgentTaskType

  /** 任务描述 */
  description?: string

  /** 模型文件 */
  modelFile: ModelingAppFile

  /** 任务参数 */
  parameters?: Record<string, any>

  /** 回调 URL（可选） */
  callbackUrl?: string

  /** 用户令牌 */
  userToken?: string
}

/**
 * AI Agent 任务状态
 */
export type AgentTaskStatus =
  | 'pending' // 等待处理
  | 'processing' // 处理中
  | 'completed' // 已完成
  | 'failed' // 失败
  | 'cancelled' // 已取消

/**
 * AI Agent 任务响应
 */
export interface AgentTaskResponse {
  /** 任务 ID */
  taskId: string

  /** 任务状态 */
  status: AgentTaskStatus

  /** 进度 (0-100) */
  progress: number

  /** 状态消息 */
  message?: string

  /** 处理后的模型文件（如果已完成） */
  resultFiles?: ModelingAppFile[]

  /** 任务元数据 */
  metadata?: {
    processingTime?: number // 处理时间（毫秒）
    agentVersion?: string // Agent 版本
    changes?: string[] // 变更列表
    warnings?: string[] // 警告列表
  }

  /** 错误信息（如果失败） */
  error?: string

  /** 创建时间 */
  createdAt: string

  /** 完成时间 */
  completedAt?: string
}

/**
 * 模型处理选项
 */
export interface ModelProcessingOptions {
  /** 是否自动应用结果 */
  autoApply?: boolean

  /** 是否创建备份 */
  createBackup?: boolean

  /** 轮询间隔（毫秒） */
  pollingInterval?: number

  /** 超时时间（毫秒） */
  timeout?: number
}

/**
 * 云端 AI Agent 客户端
 */
export class CloudAgentClient {
  private static instance: CloudAgentClient | null = null

  /** 云端 AI Agent API URL */
  private apiUrl = 'https://zoo.dev/api/ai-agent' // 示例 URL

  /** 活动任务 */
  private activeTasks = new Map<string, AgentTaskResponse>()

  /** 任务更新事件 */
  public readonly onTaskUpdate = new Signal<AgentTaskResponse>()

  /** 任务完成事件 */
  public readonly onTaskComplete = new Signal<AgentTaskResponse>()

  /** 任务失败事件 */
  public readonly onTaskFailed = new Signal<AgentTaskResponse>()

  private constructor() {}

  /**
   * 获取客户端单例
   */
  static getInstance(): CloudAgentClient {
    if (!CloudAgentClient.instance) {
      CloudAgentClient.instance = new CloudAgentClient()
    }
    return CloudAgentClient.instance
  }

  /**
   * 设置 API URL
   */
  setApiUrl(url: string): void {
    this.apiUrl = url
  }

  /**
   * 提交任务到云端 AI Agent
   */
  async submitTask(request: AgentTaskRequest): Promise<string> {
    try {
      toast.loading('Submitting task to cloud AI Agent...', {
        id: 'submit-task',
      })

      // 准备请求数据
      const formData = new FormData()
      formData.append('type', request.type)
      if (request.description) {
        formData.append('description', request.description)
      }
      formData.append(
        'file',
        new Blob([new Uint8Array(request.modelFile.contents)]),
        request.modelFile.name
      )
      if (request.parameters) {
        formData.append('parameters', JSON.stringify(request.parameters))
      }
      if (request.callbackUrl) {
        formData.append('callbackUrl', request.callbackUrl)
      }
      if (request.userToken) {
        formData.append('userToken', request.userToken)
      }

      // 发送请求
      const response = await fetch(`${this.apiUrl}/tasks`, {
        method: 'POST',
        body: formData,
      })

      if (!response.ok) {
        throw new Error(`Failed to submit task: ${response.statusText}`)
      }

      const result: AgentTaskResponse = await response.json()

      // 保存任务
      this.activeTasks.set(result.taskId, result)

      toast.success(`Task submitted: ${result.taskId}`, { id: 'submit-task' })

      return result.taskId
    } catch (error) {
      const errorMsg =
        error instanceof Error ? error.message : String(error)
      toast.error(`Failed to submit task: ${errorMsg}`, { id: 'submit-task' })
      throw error
    }
  }

  /**
   * 获取任务状态
   */
  async getTaskStatus(taskId: string): Promise<AgentTaskResponse> {
    try {
      const response = await fetch(`${this.apiUrl}/tasks/${taskId}`)

      if (!response.ok) {
        throw new Error(`Failed to get task status: ${response.statusText}`)
      }

      const result: AgentTaskResponse = await response.json()

      // 更新缓存
      this.activeTasks.set(taskId, result)

      // 触发事件
      this.onTaskUpdate.dispatch(result)

      if (result.status === 'completed') {
        this.onTaskComplete.dispatch(result)
      } else if (result.status === 'failed') {
        this.onTaskFailed.dispatch(result)
      }

      return result
    } catch (error) {
      console.error(`Failed to get task status for ${taskId}:`, error)
      throw error
    }
  }

  /**
   * 轮询任务直到完成
   */
  async waitForTask(
    taskId: string,
    options: ModelProcessingOptions = {}
  ): Promise<AgentTaskResponse> {
    const {
      pollingInterval = 2000,
      timeout = 300000, // 5 分钟默认超时
    } = options

    const startTime = Date.now()
    const toastId = `task-${taskId}`

    toast.loading('Processing model on cloud...', { id: toastId })

    return new Promise((resolve, reject) => {
      const poll = async () => {
        try {
          // 检查超时
          if (Date.now() - startTime > timeout) {
            toast.error('Task timeout', { id: toastId })
            reject(new Error('Task timeout'))
            return
          }

          const status = await this.getTaskStatus(taskId)

          // 更新进度
          if (status.progress > 0) {
            toast.loading(
              `Processing: ${status.progress}% - ${status.message || ''}`,
              { id: toastId }
            )
          }

          if (status.status === 'completed') {
            toast.success('Task completed!', { id: toastId })
            resolve(status)
          } else if (status.status === 'failed') {
            toast.error(`Task failed: ${status.error}`, { id: toastId })
            reject(new Error(status.error || 'Task failed'))
          } else {
            // 继续轮询
            setTimeout(poll, pollingInterval)
          }
        } catch (error) {
          toast.error('Failed to check task status', { id: toastId })
          reject(error)
        }
      }

      poll()
    })
  }

  /**
   * 取消任务
   */
  async cancelTask(taskId: string): Promise<void> {
    try {
      const response = await fetch(`${this.apiUrl}/tasks/${taskId}/cancel`, {
        method: 'POST',
      })

      if (!response.ok) {
        throw new Error(`Failed to cancel task: ${response.statusText}`)
      }

      toast.success('Task cancelled')

      // 更新缓存
      const task = this.activeTasks.get(taskId)
      if (task) {
        task.status = 'cancelled'
        this.activeTasks.set(taskId, task)
        this.onTaskUpdate.dispatch(task)
      }
    } catch (error) {
      const errorMsg =
        error instanceof Error ? error.message : String(error)
      toast.error(`Failed to cancel task: ${errorMsg}`)
      throw error
    }
  }

  /**
   * 下载任务结果
   */
  async downloadTaskResult(taskId: string): Promise<ModelingAppFile[]> {
    try {
      const response = await fetch(`${this.apiUrl}/tasks/${taskId}/result`)

      if (!response.ok) {
        throw new Error(
          `Failed to download task result: ${response.statusText}`
        )
      }

      // 检查是否为 ZIP 文件（多个文件）
      const contentType = response.headers.get('content-type')
      const contentDisposition = response.headers.get('content-disposition')
      const fileName =
        contentDisposition
          ?.match(/filename="(.+)"/)?.[1] ||
        `result-${taskId}`

      const buffer = await response.arrayBuffer()

      if (contentType?.includes('application/zip')) {
        // 解压 ZIP 文件
        return this.unzipFiles(buffer, fileName)
      } else {
        // 单个文件
        return [
          {
            name: fileName,
            contents: buffer,
          },
        ]
      }
    } catch (error) {
      console.error('Failed to download task result:', error)
      throw error
    }
  }

  /**
   * 解压 ZIP 文件
   */
  private async unzipFiles(
    buffer: ArrayBuffer,
    zipName: string
  ): Promise<ModelingAppFile[]> {
    // 需要导入 JSZip
    const JSZip = (await import('jszip')).default
    const zip = new JSZip()
    const zipContent = await zip.loadAsync(buffer)

    const files: ModelingAppFile[] = []

    for (const [fileName, file] of Object.entries(zipContent.files)) {
      if (!file.dir) {
        const contents = await file.async('arraybuffer')
        files.push({
          name: fileName,
          contents,
        })
      }
    }

    return files
  }

  /**
   * 发送模型到云端进行处理并等待结果
   * 这是一个便捷方法，组合了提交任务、等待完成和下载结果
   */
  async processModel(
    modelFile: ModelingAppFile,
    taskType: AgentTaskType,
    description?: string,
    parameters?: Record<string, any>,
    options?: ModelProcessingOptions
  ): Promise<ModelingAppFile[]> {
    // 提交任务
    const taskId = await this.submitTask({
      type: taskType,
      description,
      modelFile,
      parameters,
    })

    // 等待任务完成
    await this.waitForTask(taskId, options)

    // 下载结果
    const resultFiles = await this.downloadTaskResult(taskId)

    return resultFiles
  }

  /**
   * 获取所有活动任务
   */
  getActiveTasks(): AgentTaskResponse[] {
    return Array.from(this.activeTasks.values())
  }

  /**
   * 清除已完成的任务
   */
  clearCompletedTasks(): void {
    for (const [taskId, task] of this.activeTasks.entries()) {
      if (task.status === 'completed' || task.status === 'failed') {
        this.activeTasks.delete(taskId)
      }
    }
  }
}

// 导出单例
export const cloudAgentClient = CloudAgentClient.getInstance()
