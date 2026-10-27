import test from 'node:test';
import assert from 'node:assert/strict';
import { extractStructuredAnswer } from '../shared/json-repair.js';

test('extractStructuredAnswer - 标准纯 JSON 解析', () => {
  const input = JSON.stringify({
    answer: ['A'],
    matched_options: ['选项文字'],
    confidence: 0.98,
    analysis: '依据知识点分析得出答案为A'
  });

  const res = extractStructuredAnswer(input);
  assert.deepEqual(res.answer, ['A']);
  assert.equal(res.confidence, 0.98);
  assert.equal(res.analysis, '依据知识点分析得出答案为A');
});

test('extractStructuredAnswer - Markdown 代码块包裹的 JSON', () => {
  const input = `\`\`\`json\n{\n  "answer": ["B", "D"],\n  "confidence": 0.9,\n  "analysis": "多选题解析"\n}\n\`\`\``;
  const res = extractStructuredAnswer(input);
  assert.deepEqual(res.answer, ['B', 'D']);
  assert.equal(res.confidence, 0.9);
});

test('extractStructuredAnswer - 带有前后闲聊文本的 JSON', () => {
  const input = `同学你好！根据题干分析，这道题的答案如下：
{"answer": ["A"], "confidence": 0.95, "analysis": "核心考点是热力学第一定律"}
祝你学习进步！`;

  const res = extractStructuredAnswer(input);
  assert.deepEqual(res.answer, ['A']);
  assert.equal(res.confidence, 0.95);
  assert.match(res.analysis, /热力学/);
});

test('extractStructuredAnswer - 带有尾随逗号和中文引号的微瑕疵 JSON', () => {
  const input = `{"answer": [“C”], "confidence": 0.85, "analysis": "解析内容",}`;
  const res = extractStructuredAnswer(input);
  assert.deepEqual(res.answer, ['C']);
  assert.equal(res.confidence, 0.85);
});

test('extractStructuredAnswer - 模型未输出 JSON 时的正则兜底提取', () => {
  const input = `根据题目分析，正确答案是：B。解析过程如下：此题主要考查马克思主义基本原理...`;
  const res = extractStructuredAnswer(input);
  assert.deepEqual(res.answer, ['B']);
  assert.ok(res.confidence > 0);
});

test('extractStructuredAnswer - 判断题对错提取', () => {
  const input = `本题表述存在明显事实错误。正确答案：错误。`;
  const res = extractStructuredAnswer(input);
  assert.deepEqual(res.answer, ['错误']);
});

test('extractStructuredAnswer - 多选题序号幻觉自愈（典型场景：模型输出 A, B，但 matched_options 为 B, C 关系代数与关系演算）', () => {
  const input = JSON.stringify({
    answer: ['A', 'B'],
    matched_options: ['关系代数', '关系演算'],
    confidence: 0.95,
    analysis: '在数学理论中，关系操作主要分为关系演算和关系代数。关系演算法是一种基于逻辑的方法...因此，正确答案是关系演算和关系代数。'
  });
  const options = [
    { key: 'A', text: '代数计算' },
    { key: 'B', text: '关系代数' },
    { key: 'C', text: '关系演算' },
    { key: 'D', text: '关系运算' }
  ];
  const res = extractStructuredAnswer(input, options, 'multiple');
  assert.deepEqual(res.answer, ['B', 'C']);
  assert.equal(res.displayAnswer, 'B, C');
});

test('extractStructuredAnswer - 多选题序号幻觉自愈（matched_options 为空，通过 analysis 选项提及自动纠偏）', () => {
  const input = JSON.stringify({
    answer: ['A', 'B'],
    matched_options: [],
    confidence: 0.95,
    analysis: '根据数学理论，关系操作通常包括关系代数和关系演算两类。'
  });
  const options = [
    { key: 'A', text: '代数计算' },
    { key: 'B', text: '关系代数' },
    { key: 'C', text: '关系演算' },
    { key: 'D', text: '关系运算' }
  ];
  const res = extractStructuredAnswer(input, options, 'multiple');
  assert.deepEqual(res.answer, ['B', 'C']);
  assert.equal(res.displayAnswer, 'B, C');
});

test('extractStructuredAnswer - 多选题简写关键词自愈（模型分析仅写“关系操作分为代数和演算”，自动锁定 B 关系代数 和 C 关系演算）', () => {
  const input = JSON.stringify({
    answer: ['A', 'B'],
    matched_options: [],
    confidence: 0.95,
    analysis: '关系操作分为代数和演算'
  });
  const options = [
    { key: 'A', text: '代数计算' },
    { key: 'B', text: '关系代数' },
    { key: 'C', text: '关系演算' },
    { key: 'D', text: '关系运算' }
  ];
  const res = extractStructuredAnswer(input, options, 'multiple');
  assert.deepEqual(res.answer, ['B', 'C']);
  assert.equal(res.displayAnswer, 'B, C');
});

test('extractStructuredAnswer - 简答题多小问输出合并与排版格式化', () => {
  const input = JSON.stringify({
    answer: [
      "SELECT * FROM worker WHERE 性别 = '女'",
      "SELECT worker.职工号 FROM worker WHERE worker.职工号 NOT IN (SELECT salary.职工号 FROM salary)",
      "SELECT worker.姓名, worker.参加工作 FROM worker WHERE YEAR(worker.出生日期) > 1980",
      "SELECT worker.姓名, depart.部门名, salary.工资 FROM worker JOIN depart ON worker.部门号 = depart.部门号 JOIN salary ON worker.职工号 = salary.职工号 WHERE salary.工资 > 2000"
    ],
    confidence: 0.95,
    analysis: '关系代数查询语句编写'
  });
  const res = extractStructuredAnswer(input, [], 'essay');
  assert.equal(res.answer.length, 4);
  assert.match(res.displayAnswer, /\(1\) SELECT \* FROM worker/);
  assert.match(res.displayAnswer, /\(4\) SELECT worker\.姓名/);
});

test('extractStructuredAnswer - 判断题逆序（A. 错误 / B. 正确）且模型输出“正确”', () => {
  const input = JSON.stringify({
    answer: ['正确'],
    confidence: 0.95,
    analysis: '关系模型中一个关系对应一张二维表，该结论正确。'
  });
  const options = [
    { key: 'A', text: '错误' },
    { key: 'B', text: '正确' }
  ];
  const res = extractStructuredAnswer(input, options, 'judge');
  assert.deepEqual(res.answer, ['B']);
  assert.equal(res.displayAnswer, 'B (正确)');
});

test('extractStructuredAnswer - 判断题逆序（A. 错误 / B. 正确）且模型误出 ["A"] 但 analysis 明确判定正确', () => {
  const input = JSON.stringify({
    answer: ['A'],
    confidence: 0.95,
    analysis: '此命题表述完全正确，关系模型是一张二维表。'
  });
  const options = [
    { key: 'A', text: '错误' },
    { key: 'B', text: '正确' }
  ];
  const res = extractStructuredAnswer(input, options, 'judge');
  assert.deepEqual(res.answer, ['B']);
  assert.equal(res.displayAnswer, 'B (正确)');
});

test('extractStructuredAnswer - 判断题常规顺序（A. 对 / B. 错）且模型输出“错误”', () => {
  const input = JSON.stringify({
    answer: ['错误'],
    confidence: 0.95,
    analysis: '该命题错误，关系代数不是基于谓词逻辑的。'
  });
  const options = [
    { key: 'A', text: '对' },
    { key: 'B', text: '错' }
  ];
  const res = extractStructuredAnswer(input, options, 'judge');
  assert.deepEqual(res.answer, ['B']);
  assert.equal(res.displayAnswer, 'B (错)');
});

test('extractStructuredAnswer - 答案直接返回文字内容自动对齐选项字母', () => {
  const input = JSON.stringify({
    answer: ['关系代数', '关系演算'],
    confidence: 0.95,
    analysis: '关系操作主要包含关系代数和关系演算'
  });
  const options = [
    { key: 'A', text: '代数计算' },
    { key: 'B', text: '关系代数' },
    { key: 'C', text: '关系演算' },
    { key: 'D', text: '关系运算' }
  ];
  const res = extractStructuredAnswer(input, options, 'multiple');
  assert.deepEqual(res.answer, ['B', 'C']);
  assert.equal(res.displayAnswer, 'B, C');
});

test('extractStructuredAnswer - 单选题序号幻觉自愈（典型场景：模型回答 B，但 analysis 为“关键字定义”，选项 C 为“关键字”，自动纠偏为 C）', () => {
  const input = JSON.stringify({
    answer: ['B'],
    confidence: 0.95,
    analysis: '关键字定义'
  });
  const options = [
    { key: 'A', text: '域' },
    { key: 'B', text: '索引码' },
    { key: 'C', text: '关键字' },
    { key: 'D', text: '排序码' }
  ];
  const res = extractStructuredAnswer(input, options, 'single');
  assert.deepEqual(res.answer, ['C']);
  assert.equal(res.displayAnswer, 'C');
  assert.deepEqual(res.matched_options, ['关键字']);
});

test('extractStructuredAnswer - 选非题/否定设问自愈（解析指出“不包括压缩信息函数”，自动纠偏为 A）', () => {
  const input = JSON.stringify({
    answer: ['D'],
    confidence: 0.95,
    analysis: 'Hash函数的常见中文等价提法包括散列函数、杂凑函数、哈希函数等，不包括压缩信息函数，因此不属于等价提法。'
  });
  const options = [
    { key: 'A', text: '压缩信息函数' },
    { key: 'B', text: '散列函数' },
    { key: 'C', text: '哈希函数' },
    { key: 'D', text: '杂凑函数' }
  ];
  const res = extractStructuredAnswer(input, options, 'single');
  assert.deepEqual(res.answer, ['A']);
  assert.equal(res.displayAnswer, 'A');
  assert.deepEqual(res.matched_options, ['压缩信息函数']);
});

test('extractStructuredAnswer - 判断题解析明确指出否定（“用于完整性校验，非病毒检测”），自动纠偏为 错', () => {
  const input = JSON.stringify({
    answer: ['A'],
    confidence: 0.95,
    analysis: '哈希函数用于数据完整性校验，无法直接用于病毒检测，因此该说法错误。'
  });
  const options = [
    { key: 'A', text: '对' },
    { key: 'B', text: '错' }
  ];
  const res = extractStructuredAnswer(input, options, 'judge');
  assert.deepEqual(res.answer, ['B']);
  assert.equal(res.displayAnswer, 'B (错)');
});

test('extractStructuredAnswer - 填空题多空合并逗号分隔单字符串拆分自愈 (Question 19 场景)', () => {
  const input = JSON.stringify({
    answer: ['256, 512, 80, 64, 256'],
    confidence: 1.0,
    analysis: 'SM3算法参数规定'
  });
  const res = extractStructuredAnswer(input, [], 'blank');
  assert.deepEqual(res.answer, ['256', '512', '80', '64', '256']);
  assert.equal(res.displayAnswer, '256, 512, 80, 64, 256');
});

test('extractStructuredAnswer - 填空题带“第N空”或序号前缀自动清洗 (Question 19 场景)', () => {
  const input = JSON.stringify({
    answer: [
      '第1空: 256',
      '第2空: 512',
      '(3) 80',
      '4. 64',
      '第5空：256'
    ],
    confidence: 1.0,
    analysis: 'SM3算法参数规定'
  });
  const res = extractStructuredAnswer(input, [], 'blank');
  assert.deepEqual(res.answer, ['256', '512', '80', '64', '256']);
  assert.equal(res.displayAnswer, '256, 512, 80, 64, 256');
});

test('extractStructuredAnswer - 简答题 Token 耗尽导致 JSON 截断自动修复自愈 (Question 40 场景)', () => {
  // 模拟大模型输出被 80 Token 截断，未输出引号、反括号和大括号
  const truncatedInput = '{"answer":["生日攻击基于生日悖论：对输出长度为n位的Hash函数，随机选取约2^(n/2)个不同消息并计算其Hash值，破坏抗';
  const res = extractStructuredAnswer(truncatedInput, [], 'essay');
  assert.ok(res.answer.length > 0, '截断的简答题必须自愈出非空答案');
  assert.match(res.displayAnswer, /生日攻击基于生日悖论/);
  assert.ok(!res.displayAnswer.includes('无法确定'), '严禁输出“无法确定”');
  assert.ok(res.confidence >= 0.8, '置信度应保持在较高水平');
});

test('extractStructuredAnswer - 简答题纯文本非 JSON 输出正则智能提取 (Question 41 场景)', () => {
  // 模拟大模型直接输出回答文本而非严格 JSON
  const rawText = '利用 HMAC 消息认证码可以实现消息完整性校验与身份认证，发送方与接收方共享秘密密钥 K，通过内层与外层哈希生成 MAC。';
  const res = extractStructuredAnswer(rawText, [], 'essay');
  assert.ok(res.answer.length > 0, '非JSON简答题必须提取出答案');
  assert.match(res.displayAnswer, /利用 HMAC 消息认证码/);
  assert.ok(!res.displayAnswer.includes('无法确定'), '严禁输出“无法确定”');
  assert.ok(res.confidence >= 0.8, '置信度应保持在较高水平');
});





