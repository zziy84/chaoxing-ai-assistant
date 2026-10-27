/**
 * 学习通 AI 助手 - 后台服务工作者 (Background Service Worker)
 * 职责：代理所有外部大模型 API 请求（规避宿主网页 CSP 跨域拦截），提供连通性测试与题目解析。
 */

// 全局异常防护，杜绝任何未捕获异常上浮为 Chrome 扩展错误
self.addEventListener('error', (event) => {
  console.warn('[SW Error Guard]', event.message);
});
self.addEventListener('unhandledrejection', (event) => {
  console.warn('[SW Rejection Guard]', event.reason);
});

import { getConfig, saveConfig } from '../shared/storage.js';
import { getSystemPrompt, buildUserPrompt } from '../shared/prompt.js';
import { extractStructuredAnswer } from '../shared/json-repair.js';

/**
 * 发起统一的 OpenAI 规范接口请求
 * @param {Object} params
 * @param {string} params.baseUrl
 * @param {string} params.apiKey
 * @param {string} params.model
 * @param {number} params.temperature
 * @param {number} [params.maxTokens]
 * @param {Array<{role: string, content: string}>} params.messages
 * @param {number} [params.timeoutMs=90000]
 * @returns {Promise<string>} 返回模型生成的文本
 */
async function callChatCompletions({ baseUrl, apiKey, model, temperature, maxTokens, messages, timeoutMs = 90000 }) {
  if (!baseUrl) {
    throw new Error('未配置 API Base URL，请前往插件设置进行配置。');
  }

  // 规范化 URL，去除结尾斜杠并确保包含 /chat/completions
  let endpoint = baseUrl.trim().replace(/\/+$/, '');
  if (!endpoint.endsWith('/chat/completions')) {
    endpoint = `${endpoint}/chat/completions`;
  }

  const headers = {
    'Content-Type': 'application/json'
  };

  if (apiKey && apiKey.trim()) {
    headers['Authorization'] = `Bearer ${apiKey.trim()}`;
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  const requestBody = {
    model: model || 'deepseek-chat',
    temperature: 0.1, // 固定最合适的确定性采样参数，确保学术答题客观防幻觉
    messages
  };

  if (maxTokens) {
    requestBody.max_tokens = maxTokens;
  }

  // 针对支持思维链推理开销控制的模型（如 o1, o3-mini, grok, r1 等），默认设置低推理开销以大幅减少前置思考等待与 Token 消耗
  if (model && (model.startsWith('o1') || model.startsWith('o3') || model.includes('grok') || model.includes('reasoner') || model.includes('r1'))) {
    requestBody.reasoning_effort = 'low';
  }

  try {
    const response = await fetch(endpoint, {
      method: 'POST',
      headers,
      body: JSON.stringify(requestBody),
      signal: controller.signal
    });

    clearTimeout(timer);

    if (!response.ok) {
      let errorDetail = '';
      try {
        const errorJson = await response.json();
        errorDetail = errorJson.error?.message || JSON.stringify(errorJson);
      } catch {
        errorDetail = await response.text();
      }

      if (response.status === 401) {
        throw new Error(`[401 身份验证失败] API Key 无效或未授权。详细信息: ${errorDetail}`);
      } else if (response.status === 429) {
        throw new Error(`[429 频率限制/额度不足] 请求超频或账户余额不足。详细信息: ${errorDetail}`);
      } else if (response.status === 404) {
        throw new Error(`[404 路径不存在] 请检查 Base URL 是否正确 (${endpoint})。`);
      } else {
        throw new Error(`[HTTP ${response.status}] 模型接口请求失败: ${errorDetail}`);
      }
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content;
    if (!content) {
      throw new Error('模型未返回有效内容，请检查模型名称或余额。');
    }

    return content;
  } catch (err) {
    clearTimeout(timer);
    if (err.name === 'AbortError') {
      throw new Error(`请求超时 (${timeoutMs / 1000}s)，大模型无响应，请检查网络环境或模型状态。`);
    }
    throw err;
  }
}

/**
 * 具有智能重试机制的接口请求封装
 * @param {Object} params
 * @param {number} [maxRetries=1]
 */
async function callChatCompletionsWithRetry(params, maxRetries = 1) {
  let attempt = 0;
  while (true) {
    try {
      return await callChatCompletions(params);
    } catch (err) {
      attempt++;
      const isRetryable = err.name === 'AbortError' || /超时|timeout|429|502|503|504/i.test(err.message || '');
      if (attempt <= maxRetries && isRetryable) {
        console.warn(`[学习通 AI 助手] 模型请求遇到可重试异常 (${err.message})，正在执行第 ${attempt} 次自动重试...`);
        await new Promise(r => setTimeout(r, 1500));
        continue;
      }
      throw err;
    }
  }
}

/**
 * 监听来自 Content Script、Popup 及 Options 的消息
 */
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  const { action, payload } = message || {};

  // 1. 测试 API 连通性
  if (action === 'TEST_CONNECTION') {
    (async () => {
      try {
        const startTime = Date.now();
        const content = await callChatCompletions({
          baseUrl: payload.baseUrl,
          apiKey: payload.apiKey,
          model: payload.model,
          temperature: 0.1,
          maxTokens: 50,
          messages: [
            { role: 'user', content: '请仅输出两个字：pong' }
          ],
          timeoutMs: 15000
        });
        const latency = Date.now() - startTime;
        sendResponse({
          success: true,
          latency,
          preview: content.trim()
        });
      } catch (err) {
        sendResponse({
          success: false,
          error: err.message || '连接测试异常'
        });
      }
    })();
    return true; // 异步响应
  }

  // 2. 解答单个题目
  if (action === 'SOLVE_QUESTION') {
    (async () => {
      try {
        const config = await getConfig();
        const includeAnalysis = config.includeAnalysis !== false; // 默认输出解析，除非用户显式关闭
        const systemPrompt = getSystemPrompt(includeAnalysis);
        const userPrompt = buildUserPrompt(payload.question, includeAnalysis);

        const qType = payload.question?.type;
        // 动态分配充足且极致精简的 Token 上限：
        // 简答题/论述题/计算题分配 1200+ 保证完整；免解析模式下选择题与判断题仅需 80 Token（答案仅15 Token），极致节省输出开销
        let maxTokens = 400;
        if (qType === 'essay') {
          maxTokens = config.maxTokens ? Math.max(config.maxTokens, 1200) : 1200;
        } else if (qType === 'blank') {
          maxTokens = includeAnalysis ? 600 : 250;
        } else {
          maxTokens = includeAnalysis ? 400 : 80;
        }

        // 动态判定超时裕度：简答题与深度思考模型 (grok, r1, o1, reasoner) 扩展至 120s，普通题目 90s
        const isLongTask = qType === 'essay' || (config.model && /reasoner|r1|o1|o3|grok|thinking/i.test(config.model));
        const timeoutMs = isLongTask ? 120000 : 90000;

        const rawResult = await callChatCompletionsWithRetry({
          baseUrl: config.baseUrl,
          apiKey: config.apiKey,
          model: config.model,
          temperature: 0.1,
          maxTokens,
          timeoutMs,
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userPrompt }
          ]
        }, 1);

        // 强容错解析结构化答案（带题型与选项交叉校对自愈）
        const structured = extractStructuredAnswer(rawResult, payload.question.options, payload.question.type);

        // 如果用户选择了不输出解析，清空或标注免解析
        if (!includeAnalysis) {
          structured.analysis = '';
        }

        sendResponse({
          success: true,
          questionId: payload.question.id,
          raw: rawResult,
          result: structured
        });
      } catch (err) {
        sendResponse({
          success: false,
          questionId: payload.question.id,
          error: err.message || '答题分析失败'
        });
      }
    })();
    return true; // 异步响应
  }

  // 3. 获取配置
  if (action === 'GET_CONFIG') {
    getConfig().then(cfg => sendResponse({ success: true, config: cfg }));
    return true;
  }

  // 4. 保存部分配置
  if (action === 'SAVE_CONFIG') {
    saveConfig(message.config || {}).then(cfg => sendResponse({ success: true, config: cfg }));
    return true;
  }

  // 5. 打开选项设置页（安全处理，杜绝缺少权限或端口泄露）
  if (action === 'OPEN_OPTIONS') {
    try {
      if (chrome.runtime.openOptionsPage) {
        chrome.runtime.openOptionsPage();
      } else if (chrome.tabs && chrome.tabs.create) {
        chrome.tabs.create({ url: chrome.runtime.getURL('options/options.html') });
      }
    } catch (e) {
      console.warn('[SW] 打开设置页异常:', e);
    }
    sendResponse({ success: true });
    return false;
  }

  // 6. 热重载扩展本身（安全处理，同步响应防止端口截断错误）
  if (action === 'RELOAD_EXTENSION') {
    sendResponse({ success: true });
    setTimeout(() => {
      try {
        chrome.runtime.reload();
      } catch (e) {
        console.warn('[SW] 重载异常:', e);
      }
    }, 150);
    return false;
  }
});
