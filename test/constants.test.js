import test from 'node:test';
import assert from 'node:assert/strict';
import { PROVIDER_PRESETS, DEFAULT_CONFIG, SPEED_PRESETS } from '../shared/constants.js';

test('PROVIDER_PRESETS 预设完整性校验与 2026 最新前沿模型覆盖', () => {
  const expectedProviders = [
    'deepseek',
    'zhipu',
    'qwen',
    'moonshot',
    'volcengine',
    'siliconflow',
    'openai',
    'qianfan',
    'groq',
    'ollama',
    'custom'
  ];

  expectedProviders.forEach(pid => {
    assert.ok(PROVIDER_PRESETS[pid], `缺少预设提供商: ${pid}`);
    assert.ok(PROVIDER_PRESETS[pid].name, `${pid} 缺少 name 字段`);
  });

  // 1. 验证 DeepSeek 包含 V4 系列与 R1 推理
  const deepseek = PROVIDER_PRESETS.deepseek;
  assert.equal(deepseek.baseUrl, 'https://api.deepseek.com');
  const dsModels = deepseek.models.map(m => m.id);
  assert.ok(dsModels.includes('deepseek-v4.1-flash'), 'DeepSeek 需包含 V4.1-Flash');
  assert.ok(dsModels.includes('deepseek-v4-pro'), 'DeepSeek 需包含 V4-Pro');
  assert.ok(dsModels.includes('deepseek-reasoner'), 'DeepSeek 需包含 R1');

  // 2. 验证智谱包含 GLM-5.3 旗舰与多模态极速版
  const zhipuModels = PROVIDER_PRESETS.zhipu.models.map(m => m.id);
  assert.ok(zhipuModels.includes('glm-5.3'), '智谱需包含 GLM-5.3');
  assert.ok(zhipuModels.includes('glm-5.3-flash'), '智谱需包含 GLM-5.3-Flash');

  // 3. 验证通义千问包含 Qwen3.8 系列
  const qwenModels = PROVIDER_PRESETS.qwen.models.map(m => m.id);
  assert.ok(qwenModels.includes('qwen3.8-max'), '通义千问需包含 Qwen3.8-Max');
  assert.ok(qwenModels.includes('qwen3.8-flash-next'), '通义千问需包含 Qwen3.8-Flash-Next');

  // 4. 验证 Kimi 包含 K3 系列
  const moonshotModels = PROVIDER_PRESETS.moonshot.models.map(m => m.id);
  assert.ok(moonshotModels.includes('kimi-k3'), 'Moonshot 需包含 Kimi-K3');

  // 5. 验证火山引擎豆包包含 2.1-Pro
  const doubaoModels = PROVIDER_PRESETS.volcengine.models.map(m => m.id);
  assert.ok(doubaoModels.includes('doubao-2.1-pro'), '豆包需包含 2.1-Pro');

  // 6. 验证 OpenAI 包含最新 o3-mini 与 o1
  const openaiModels = PROVIDER_PRESETS.openai.models.map(m => m.id);
  assert.ok(openaiModels.includes('o3-mini'));
  assert.ok(openaiModels.includes('o1'));
});

test('DEFAULT_CONFIG 默认配置规范与 SPEED_PRESETS 速度模式', () => {
  assert.equal(DEFAULT_CONFIG.provider, 'deepseek');
  assert.equal(DEFAULT_CONFIG.model, 'deepseek-v4.1-flash');
  assert.equal(DEFAULT_CONFIG.includeAnalysis, true);
  assert.equal(DEFAULT_CONFIG.speedMode, 'turbo');
  assert.equal(typeof DEFAULT_CONFIG.safeDelayMin, 'number');
  assert.equal(typeof DEFAULT_CONFIG.safeDelayMax, 'number');
  assert.ok(DEFAULT_CONFIG.safeDelayMin < DEFAULT_CONFIG.safeDelayMax);
  assert.ok(Array.isArray(DEFAULT_CONFIG.enabledQuestionTypes), '需包含默认勾选题型');

  // SPEED_PRESETS 校验
  assert.ok(SPEED_PRESETS.turbo, '需支持极速模式');
  assert.ok(SPEED_PRESETS.normal, '需支持匀速模式');
  assert.ok(SPEED_PRESETS.safe, '需支持安全模式');
  assert.ok(SPEED_PRESETS.turbo.delayMin <= 100, '极速模式延时需低于100ms');
});
