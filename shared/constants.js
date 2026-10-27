/**
 * 学习通 AI 助手 - 常量与大模型全景预设配置 (全面同步 2026 最新版本)
 */

export const PROVIDER_PRESETS = {
  deepseek: {
    id: 'deepseek',
    name: 'DeepSeek (深度求索官方)',
    baseUrl: 'https://api.deepseek.com',
    models: [
      { id: 'deepseek-v4.1-flash', name: 'DeepSeek-V4.1-Flash (2026最新·不对称高效MoE·推荐)' },
      { id: 'deepseek-v4-pro', name: 'DeepSeek-V4-Pro (1.6T 参数·顶级学术与Agent推理·1M上下文)' },
      { id: 'deepseek-v4-flash', name: 'DeepSeek-V4-Flash (极速高并发·极低成本)' },
      { id: 'deepseek-reasoner', name: 'DeepSeek-R1 (官方满血深度思考·长思维链)' },
      { id: 'deepseek-chat', name: 'DeepSeek-V3 (官方满血通用旗舰 671B)' }
    ],
    defaultModel: 'deepseek-v4.1-flash',
    docsUrl: 'https://platform.deepseek.com'
  },
  zhipu: {
    id: 'zhipu',
    name: '智谱 AI (GLM 开放平台)',
    baseUrl: 'https://open.bigmodel.cn/api/paas/v4',
    models: [
      { id: 'glm-5.3', name: 'GLM-5.3 (2026最新旗舰·超强逻辑与学术解题·推荐)' },
      { id: 'glm-5.3-flash', name: 'GLM-5.3-Flash (最新原生多模态·线性混合注意力·极速响应)' },
      { id: 'glm-5.2', name: 'GLM-5.2 (1M 超长上下文稳定版)' },
      { id: 'glm-5.1', name: 'GLM-5.1 (长程自主思考版)' },
      { id: 'glm-5', name: 'GLM-5 (744B MoE 旗舰基座)' },
      { id: 'glm-4-plus', name: 'GLM-4-Plus (高智商综合旗舰)' },
      { id: 'glm-4-flash', name: 'GLM-4-Flash (免费快速)' },
      { id: 'glm-zero-preview', name: 'GLM-Zero-Preview (深度推理)' }
    ],
    defaultModel: 'glm-5.3',
    docsUrl: 'https://open.bigmodel.cn'
  },
  qwen: {
    id: 'qwen',
    name: '通义千问 (阿里云百炼官方)',
    baseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
    models: [
      { id: 'qwen3.8-max', name: 'Qwen3.8-Max (2026最新 2.4T 顶级旗舰·1M上下文·推荐)' },
      { id: 'qwen3.8-flash-next', name: 'Qwen3.8-Flash-Next (最新低成本架构预览版)' },
      { id: 'qwen-max-latest', name: 'Qwen-Max-Latest (千问旗舰)' },
      { id: 'qwen-plus-latest', name: 'Qwen-Plus-Latest (高性价比主力旗舰)' },
      { id: 'qwq-32b-preview', name: 'QwQ-32B-Preview (千问深度推理思考模型)' },
      { id: 'qwen2.5-72b-instruct', name: 'Qwen2.5-72B-Instruct (开源旗舰)' },
      { id: 'qwen2.5-32b-instruct', name: 'Qwen2.5-32B-Instruct' },
      { id: 'qwen2.5-7b-instruct', name: 'Qwen2.5-7B-Instruct (轻量极速)' },
      { id: 'qwen-long', name: 'Qwen-Long (超长文档)' }
    ],
    defaultModel: 'qwen3.8-max',
    docsUrl: 'https://bailian.console.aliyun.com'
  },
  moonshot: {
    id: 'moonshot',
    name: 'Moonshot (月之暗面 Kimi)',
    baseUrl: 'https://api.moonshot.cn/v1',
    models: [
      { id: 'kimi-k3', name: 'Kimi-K3 (2026最新 2.8T 顶级推理与Agent旗舰·推荐)' },
      { id: 'kimi-k2.8-preview', name: 'Kimi-K2.8-Preview (最新多模态思考)' },
      { id: 'kimi-latest', name: 'Kimi-Latest (自适应最新版)' },
      { id: 'moonshot-v1-128k', name: 'Moonshot-v1-128k' },
      { id: 'moonshot-v1-32k', name: 'Moonshot-v1-32k' },
      { id: 'moonshot-v1-8k', name: 'Moonshot-v1-8k' }
    ],
    defaultModel: 'kimi-k3',
    docsUrl: 'https://platform.moonshot.cn'
  },
  volcengine: {
    id: 'volcengine',
    name: '火山引擎 (字节跳动豆包)',
    baseUrl: 'https://ark.cn-beijing.volces.com/api/v3',
    models: [
      { id: 'doubao-2.1-pro', name: 'Doubao-2.1-Pro (2026最新豆包专业版·长程规划·推荐)' },
      { id: 'doubao-pro-128k', name: 'Doubao-Pro-128k' },
      { id: 'doubao-pro-32k', name: 'Doubao-Pro-32k' },
      { id: 'doubao-lite-128k', name: 'Doubao-Lite-128k' },
      { id: 'doubao-lite-32k', name: 'Doubao-Lite-32k (极速低成本)' }
    ],
    defaultModel: 'doubao-2.1-pro',
    docsUrl: 'https://console.volcengine.com/ark'
  },
  siliconflow: {
    id: 'siliconflow',
    name: 'SiliconFlow (硅基流动聚合)',
    baseUrl: 'https://api.siliconflow.cn/v1',
    models: [
      { id: 'deepseek-ai/DeepSeek-V4.1-Flash', name: 'DeepSeek-V4.1-Flash (最新架构)' },
      { id: 'deepseek-ai/DeepSeek-V4-Pro', name: 'DeepSeek-V4-Pro (1.6T 推理旗舰)' },
      { id: 'deepseek-ai/DeepSeek-V3', name: 'DeepSeek-V3 (满血 671B)' },
      { id: 'deepseek-ai/DeepSeek-R1', name: 'DeepSeek-R1 (满血推理 671B)' },
      { id: 'THUDM/glm-5.3', name: 'GLM-5.3 (智谱最新旗舰)' },
      { id: 'Qwen/Qwen3.8-Max', name: 'Qwen3.8-Max (千问最新旗舰)' },
      { id: 'deepseek-ai/DeepSeek-R1-Distill-Qwen-32B', name: 'DeepSeek-R1-Distill-Qwen-32B' },
      { id: 'deepseek-ai/DeepSeek-R1-Distill-Qwen-7B', name: 'DeepSeek-R1-Distill-Qwen-7B (免费)' },
      { id: 'deepseek-ai/DeepSeek-R1-Distill-Llama-70B', name: 'DeepSeek-R1-Distill-Llama-70B' },
      { id: 'deepseek-ai/DeepSeek-R1-Distill-Llama-8B', name: 'DeepSeek-R1-Distill-Llama-8B (免费)' },
      { id: 'Qwen/Qwen2.5-72B-Instruct', name: 'Qwen2.5-72B-Instruct' },
      { id: 'Qwen/Qwen2.5-7B-Instruct', name: 'Qwen2.5-7B-Instruct (免费)' },
      { id: 'THUDM/glm-4-9b-chat', name: 'GLM-4-9B-Chat (免费)' }
    ],
    defaultModel: 'deepseek-ai/DeepSeek-V4.1-Flash',
    docsUrl: 'https://cloud.siliconflow.cn'
  },
  openai: {
    id: 'openai',
    name: 'OpenAI (官方)',
    baseUrl: 'https://api.openai.com/v1',
    models: [
      { id: 'o3-mini', name: 'o3-mini (最新高性价比深度推理·推荐)' },
      { id: 'o1', name: 'o1 (顶级深度复杂推理旗舰)' },
      { id: 'o1-mini', name: 'o1-mini (轻量快速推理)' },
      { id: 'gpt-4o', name: 'GPT-4o (全能多模态旗舰)' },
      { id: 'gpt-4o-mini', name: 'GPT-4o-mini (极速经济版)' },
      { id: 'gpt-4-turbo', name: 'GPT-4-Turbo' }
    ],
    defaultModel: 'gpt-4o-mini',
    docsUrl: 'https://platform.openai.com'
  },
  qianfan: {
    id: 'qianfan',
    name: '百度千帆 (文心大模型平台)',
    baseUrl: 'https://qianfan.baidubce.com/v2',
    models: [
      { id: 'ernie-4.5-turbo', name: 'ERNIE-4.5-Turbo (文心2026最新旗舰)' },
      { id: 'ernie-4.0-turbo-8k', name: 'ERNIE-4.0-Turbo-8K' },
      { id: 'deepseek-v4', name: 'DeepSeek-V4 (千帆托管最新版)' },
      { id: 'deepseek-v3', name: 'DeepSeek-V3 (千帆托管版)' },
      { id: 'ernie-speed-128k', name: 'ERNIE-Speed-128K (免费极速)' },
      { id: 'ernie-lite-8k', name: 'ERNIE-Lite-8K (免费)' }
    ],
    defaultModel: 'ernie-4.5-turbo',
    docsUrl: 'https://console.bce.baidu.com/qianfan'
  },
  groq: {
    id: 'groq',
    name: 'Groq (超高速芯片 LPU)',
    baseUrl: 'https://api.groq.com/openai/v1',
    models: [
      { id: 'deepseek-r1-distill-llama-70b', name: 'DeepSeek-R1-Distill-Llama-70B (超高速推理)' },
      { id: 'llama-3.3-70b-versatile', name: 'Llama-3.3-70B-Versatile' },
      { id: 'llama-3.1-8b-instant', name: 'Llama-3.1-8B-Instant (瞬时响应)' }
    ],
    defaultModel: 'deepseek-r1-distill-llama-70b',
    docsUrl: 'https://console.groq.com'
  },
  ollama: {
    id: 'ollama',
    name: 'Ollama (本地私有大模型)',
    baseUrl: 'http://localhost:11434/v1',
    models: [
      { id: 'deepseek-v4:latest', name: 'DeepSeek-V4 (本地最新)' },
      { id: 'deepseek-r1:latest', name: 'DeepSeek-R1 (本地推理最新)' },
      { id: 'deepseek-r1:14b', name: 'DeepSeek-R1:14b' },
      { id: 'deepseek-r1:8b', name: 'DeepSeek-R1:8b' },
      { id: 'deepseek-r1:7b', name: 'DeepSeek-R1:7b' },
      { id: 'deepseek-r1:1.5b', name: 'DeepSeek-R1:1.5b (超轻量)' },
      { id: 'qwen3.8:latest', name: 'Qwen3.8 (本地最新)' },
      { id: 'qwen2.5:latest', name: 'Qwen2.5 (本地稳定版)' },
      { id: 'llama3.3:latest', name: 'Llama3.3:latest' }
    ],
    defaultModel: 'deepseek-v4:latest',
    docsUrl: 'https://ollama.com'
  },
  custom: {
    id: 'custom',
    name: 'Custom (自定义兼容 API)',
    baseUrl: '',
    models: [],
    defaultModel: '',
    docsUrl: ''
  }
};

export const SPEED_PRESETS = {
  turbo: {
    id: 'turbo',
    name: '极速 🚀',
    desc: '极速并发，无缝响应，每题约 0.2s~0.5s',
    delayMin: 10,
    delayMax: 30,
    scrollWait: 0,
    autoFillDelayMin: 0,
    autoFillDelayMax: 10,
    defaultConcurrency: 4
  },
  normal: {
    id: 'normal',
    name: '匀速 ⚡',
    desc: '平稳均衡，兼顾效率与体验，每题约 0.5s~1s',
    delayMin: 150,
    delayMax: 300,
    scrollWait: 100,
    autoFillDelayMin: 50,
    autoFillDelayMax: 150,
    defaultConcurrency: 2
  },
  safe: {
    id: 'safe',
    name: '安全 🛡️',
    desc: '防风控真人模拟，单并发依次作答，每题约 2s~4s',
    delayMin: 1500,
    delayMax: 3500,
    scrollWait: 500,
    autoFillDelayMin: 1000,
    autoFillDelayMax: 2000,
    defaultConcurrency: 1
  }
};

export const DEFAULT_CONFIG = {
  provider: 'deepseek',
  baseUrl: 'https://api.deepseek.com',
  apiKey: '',
  model: 'deepseek-v4.1-flash',
  temperature: 0.1, // 最佳学术答题采样参数（固定 0.1 确保确定性防幻觉）
  maxTokens: 1500,
  includeAnalysis: true, // 是否输出解题解析（关闭则纯输出答案省Token）
  skipAnswered: true, // 检测到题目已存在答案时自动跳过该题
  autoFill: false, // 是否自动辅助填入
  speedMode: 'turbo', // 作答速度模式: 'turbo' (极速), 'normal' (匀速), 'safe' (安全防风控)
  safeDelayMin: 1500, // 最小模拟操作时延 ms (安全模式参考)
  safeDelayMax: 3500, // 最大模拟操作时延 ms (安全模式参考)
  showSidebar: true, // 默认是否展开侧边栏
  autoScan: true, // 页面加载后是否自动提取题目
  concurrency: 3, // 批量解析并发量 (1~8)
  enabledQuestionTypes: ['single', 'multiple', 'judge', 'blank', 'essay'] // 勾选自动作答的题型
};

export const QUESTION_TYPES = {
  SINGLE: 'single', // 单选题
  MULTIPLE: 'multiple', // 多选题
  JUDGE: 'judge', // 判断题
  BLANK: 'blank', // 填空题
  ESSAY: 'essay', // 简答/论述题
  UNKNOWN: 'unknown'
};

