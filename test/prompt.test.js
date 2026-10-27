import test from 'node:test';
import assert from 'node:assert/strict';
import { buildUserPrompt, getSystemPrompt, SYSTEM_PROMPT } from '../shared/prompt.js';

test('buildUserPrompt - 单选题格式化 (包含详细解析模式)', () => {
  const q = {
    type: 'single',
    title: '下列关于光合作用的叙述，正确的是？',
    options: [
      { key: 'A', text: '光反应在叶绿体基质中进行' },
      { key: 'B', text: '暗反应需要光直接提供能量' },
      { key: 'C', text: '光合产物主要为有机物和氧气' },
      { key: 'D', text: '植物所有细胞均能进行光合作用' }
    ]
  };

  const prompt = buildUserPrompt(q, true);
  assert.match(prompt, /【题型】单选题/);
  assert.match(prompt, /光合作用/);
  assert.match(prompt, /A\. 光反应/);
  assert.match(prompt, /D\. 植物所有细胞/);
  assert.match(prompt, /知识点解析/);
});

test('buildUserPrompt - 省 Token 模式 (严禁输出解析)', () => {
  const q = {
    type: 'single',
    title: '计算机网络中，HTTP 协议默认端口号为？',
    options: [
      { key: 'A', text: '80' },
      { key: 'B', text: '443' },
      { key: 'C', text: '22' },
      { key: 'D', text: '8080' }
    ]
  };

  const prompt = buildUserPrompt(q, false);
  assert.match(prompt, /省 Token 模式/);
  assert.match(prompt, /严禁包含任何解析文字/);
});

test('getSystemPrompt - 模式切换与 Token 约束校验', () => {
  // 1. 详细解析模式
  const promptFull = getSystemPrompt(true);
  assert.match(promptFull, /"analysis"/);
  assert.match(promptFull, /知识点依据/);

  // 2. 省 Token 模式
  const promptConcise = getSystemPrompt(false);
  assert.doesNotMatch(promptConcise, /"analysis"/);
  assert.match(promptConcise, /严禁输出任何分析/);
  assert.match(promptConcise, /节约 Token/);
});
