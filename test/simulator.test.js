import test from 'node:test';
import assert from 'node:assert/strict';
import { applyAnswerToQuestion } from '../content/simulator.js';

class MockDocument {
  constructor() {
    this.allNodes = [];
    this.head = {
      appendChild: () => {
        for (const el of this.allNodes) {
          for (const key of Object.keys(el.attrs)) {
            if (key.startsWith('cx-sel-') && el.attrs[key] === 'true') {
              el.clicked++;
              delete el.attrs[key];
            }
          }
        }
      }
    };
    this.body = this.head;
  }

  createElement(tag) {
    return {
      tagName: tag.toUpperCase(),
      textContent: '',
      remove() {}
    };
  }
}

class MockElement {
  constructor(tag, classes = [], text = '', doc = null) {
    this.tagName = tag.toUpperCase();
    this.classList = new Set(classes);
    this.className = classes.join(' ');
    this.text = text;
    this.clicked = 0;
    this.checked = false;
    this.attrs = {};
    this.style = {};
    this.children = [];
    this.ownerDocument = doc;
    if (doc) {
      doc.allNodes.push(this);
    }
  }

  get innerText() {
    return this.text;
  }

  getAttribute(name) {
    return this.attrs[name] || null;
  }

  setAttribute(name, val) {
    this.attrs[name] = val;
  }

  removeAttribute(name) {
    delete this.attrs[name];
  }

  dispatchEvent() {}

  click() {
    this.clicked++;
  }

  querySelector() {
    return null;
  }

  querySelectorAll() {
    return [];
  }

  closest() {
    return this;
  }

  scrollIntoView() {}
}

test('applyAnswerToQuestion - 多选题仅点击匹配的选项 (B, C 关系代数与关系演算)', async () => {
  const doc = new MockDocument();
  const optA = new MockElement('div', ['answerBg'], '代数计算', doc);
  const optB = new MockElement('div', ['answerBg'], '关系代数', doc);
  const optC = new MockElement('div', ['answerBg'], '关系演算', doc);
  const optD = new MockElement('div', ['answerBg'], '关系运算', doc);

  const question = {
    type: 'multiple',
    options: [
      { key: 'A', text: '代数计算', element: optA, container: optA },
      { key: 'B', text: '关系代数', element: optB, container: optB },
      { key: 'C', text: '关系演算', element: optC, container: optC },
      { key: 'D', text: '关系运算', element: optD, container: optD }
    ]
  };

  const result = {
    answer: ['B', 'C'],
    matched_options: ['关系代数', '关系演算']
  };

  const speedConfig = { delayMin: 0, delayMax: 0, scrollWait: 0 };
  const res = await applyAnswerToQuestion(question, result, false, speedConfig);

  assert.equal(res, true);
  assert.equal(optA.clicked, 0, 'A 不应被点击');
  assert.equal(optB.clicked, 1, 'B 应该被点击');
  assert.equal(optC.clicked, 1, 'C 应该被点击');
  assert.equal(optD.clicked, 0, 'D 不应被点击');
});

test('applyAnswerToQuestion - 判断题选项逆序（A. 错误 / B. 正确）且答案为“正确”', async () => {
  const doc = new MockDocument();
  const optA = new MockElement('div', ['answerBg'], '错误', doc);
  const optB = new MockElement('div', ['answerBg'], '正确', doc);

  const question = {
    type: 'judge',
    options: [
      { key: 'A', text: '错误', element: optA, container: optA },
      { key: 'B', text: '正确', element: optB, container: optB }
    ]
  };

  const result = {
    answer: ['正确']
  };

  const speedConfig = { delayMin: 0, delayMax: 0, scrollWait: 0 };
  const res = await applyAnswerToQuestion(question, result, false, speedConfig);

  assert.equal(res, true);
  assert.equal(optA.clicked, 0, '错误选项 A 严禁被点击');
  assert.equal(optB.clicked, 1, '正确选项 B 必须被点击');
});

test('applyAnswerToQuestion - 判断题选项逆序（A. 错误 / B. 正确）且答案为“错误”', async () => {
  const doc = new MockDocument();
  const optA = new MockElement('div', ['answerBg'], '错误', doc);
  const optB = new MockElement('div', ['answerBg'], '正确', doc);

  const question = {
    type: 'judge',
    options: [
      { key: 'A', text: '错误', element: optA, container: optA },
      { key: 'B', text: '正确', element: optB, container: optB }
    ]
  };

  const result = {
    answer: ['错误']
  };

  const speedConfig = { delayMin: 0, delayMax: 0, scrollWait: 0 };
  const res = await applyAnswerToQuestion(question, result, false, speedConfig);

  assert.equal(res, true);
  assert.equal(optA.clicked, 1, '错误选项 A 必须被点击');
  assert.equal(optB.clicked, 0, '正确选项 B 严禁被点击');
});

test('applyAnswerToQuestion - 简答题多小问答案完整合并填入单一输入框 (Question 22 场景)', async () => {
  const doc = new MockDocument();
  const textareaEl = new MockElement('textarea', ['Answer'], '', doc);

  const question = {
    type: 'essay',
    blankInputs: [textareaEl]
  };

  const result = {
    answer: [
      "SELECT * FROM worker WHERE 性别 = '女'",
      "SELECT worker.职工号 FROM worker WHERE worker.职工号 NOT IN (SELECT salary.职工号 FROM salary)",
      "SELECT worker.姓名, worker.参加工作 FROM worker WHERE YEAR(worker.出生日期) > 1980",
      "SELECT worker.姓名, depart.部门名, salary.工资 FROM worker JOIN depart ON worker.部门号 = depart.部门号 JOIN salary ON worker.职工号 = salary.职工号 WHERE salary.工资 > 2000"
    ]
  };

  const speedConfig = { delayMin: 0, delayMax: 0, scrollWait: 0 };
  const res = await applyAnswerToQuestion(question, result, false, speedConfig);

  assert.equal(res, true);
  assert.match(textareaEl.value, /\(1\) SELECT \* FROM worker WHERE 性别 = '女'/);
  assert.match(textareaEl.value, /\(2\) SELECT worker\.职工号/);
  assert.match(textareaEl.value, /\(3\) SELECT worker\.姓名/);
  assert.match(textareaEl.value, /\(4\) SELECT worker\.姓名, depart\.部门名/);
});

test('applyAnswerToQuestion - 填空题 5 个独立输入框精准对应不串位 (Question 19 场景)', async () => {
  const doc = new MockDocument();
  const input1 = new MockElement('textarea', ['Answer'], '', doc);
  const input2 = new MockElement('textarea', ['Answer'], '', doc);
  const input3 = new MockElement('textarea', ['Answer'], '', doc);
  const input4 = new MockElement('textarea', ['Answer'], '', doc);
  const input5 = new MockElement('textarea', ['Answer'], '', doc);

  const question = {
    type: 'blank',
    blankInputs: [input1, input2, input3, input4, input5]
  };

  const result = {
    answer: ['256', '512', '80', '64', '256']
  };

  const speedConfig = { delayMin: 0, delayMax: 0, scrollWait: 0 };
  const res = await applyAnswerToQuestion(question, result, false, speedConfig);

  assert.equal(res, true);
  assert.equal(input1.value, '256', '第1空应为 256');
  assert.equal(input2.value, '512', '第2空应为 512');
  assert.equal(input3.value, '80', '第3空应为 80');
  assert.equal(input4.value, '64', '第4空应为 64');
  assert.equal(input5.value, '256', '第5空应为 256');
});

