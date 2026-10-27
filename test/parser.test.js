import test from 'node:test';
import assert from 'node:assert/strict';
import { extractQuestionsFromPage, isQuestionAnswered } from '../content/parser.js';

// 简易的 Mock DOM 节点结构，用于验证 parser 提取逻辑
class MockNode {
  constructor(tag, classes = [], text = '') {
    this.tagName = tag.toUpperCase();
    this.classList = new Set(classes);
    this.className = classes.join(' ');
    this._text = text || undefined;
    this.children = [];
    this.type = '';
    this.value = '';
    this.checked = false;
    this.style = {};
    this.id = '';
    this.attrs = {};
  }

  get innerText() {
    if (this._text !== undefined) return this._text;
    if (this.children.length === 0) return '';
    return this.children.map(c => c.innerText).filter(Boolean).join(' ');
  }

  set innerText(val) {
    this._text = val;
  }

  get textContent() {
    return this.innerText;
  }

  set textContent(val) {
    this.innerText = val;
  }

  getAttribute(name) {
    if (name === 'id') return this.id || null;
    if (name === 'class') return this.className || null;
    return this.attrs[name] || null;
  }

  setAttribute(name, val) {
    this.attrs[name] = val;
    if (name === 'id') this.id = val;
  }

  appendChild(node) {
    this.children.push(node);
    return node;
  }

  contains(other) {
    if (this === other) return true;
    for (const ch of this.children) {
      if (ch.contains(other)) return true;
    }
    return false;
  }

  matches(selector) {
    if (selector.startsWith('.')) {
      const cls = selector.slice(1);
      return this.classList.has(cls) || this.className.includes(cls);
    }
    if (selector.startsWith('#')) {
      return this.id === selector.slice(1);
    }
    if (selector === 'input[type="radio"]:checked') {
      return this.tagName === 'INPUT' && this.type === 'radio' && this.checked === true;
    }
    if (selector === 'input[type="checkbox"]:checked') {
      return this.tagName === 'INPUT' && this.type === 'checkbox' && this.checked === true;
    }
    if (selector.startsWith('input[')) {
      return this.tagName === 'INPUT';
    }
    if (selector.startsWith('[data]')) {
      return Boolean(this.attrs['data']);
    }
    if (selector.startsWith('[role=')) {
      return this.attrs['role'] === selector.replace(/\[role=["']?|["']?\]/g, '');
    }
    return this.tagName.toLowerCase() === selector.toLowerCase();
  }

  querySelector(selector) {
    const all = this.querySelectorAll(selector);
    return all.length > 0 ? all[0] : null;
  }

  querySelectorAll(selector) {
    const results = [];
    const parts = selector.split(',').map(s => s.trim());

    function traverse(curr) {
      for (const child of curr.children) {
        for (const p of parts) {
          const subParts = p.split(/\s+/);
          const targetClass = subParts[subParts.length - 1];
          if (child.matches(targetClass)) {
            results.push(child);
            break;
          }
        }
        traverse(child);
      }
    }

    traverse(this);
    return results;
  }
}

test('extractQuestionsFromPage - 提取学习通典型单选题结构', () => {
  const root = new MockNode('div');
  const questionBox = new MockNode('div', ['TiMu']);
  
  // 标题
  const titleBox = new MockNode('div', ['Zy_TItle']);
  titleBox.innerText = '1. 【单选题】下列哪个属于操作系统管理的核心资源？';
  questionBox.appendChild(titleBox);

  // 选项列表
  const ul = new MockNode('ul', ['Zy_ulTop']);
  
  const liA = new MockNode('li');
  liA.innerText = 'A. CPU与内存资源';
  const radioA = new MockNode('input');
  radioA.type = 'radio';
  liA.appendChild(radioA);
  ul.appendChild(liA);

  const liB = new MockNode('li');
  liB.innerText = 'B. 机箱与电源线缆';
  const radioB = new MockNode('input');
  radioB.type = 'radio';
  liB.appendChild(radioB);
  ul.appendChild(liB);

  questionBox.appendChild(ul);
  root.appendChild(questionBox);

  const questions = extractQuestionsFromPage(root);
  assert.equal(questions.length, 1);
  assert.equal(questions[0].type, 'single');
  assert.match(questions[0].title, /下列哪个属于操作系统管理的核心资源/);
  assert.equal(questions[0].options.length, 2);
  assert.equal(questions[0].options[0].key, 'A');
  assert.match(questions[0].options[0].text, /CPU与内存/);
  assert.equal(questions[0].isAnswered, false);
});

test('isQuestionAnswered - 检测未作答与已作答题目', () => {
  // 1. 未作答情况
  const qUnanswered = {
    element: new MockNode('div'),
    options: [
      { element: new MockNode('input'), container: new MockNode('li') }
    ],
    blankInputs: []
  };
  assert.equal(isQuestionAnswered(qUnanswered), false);

  // 2. 原生 radio 勾选情况
  const radioChecked = new MockNode('input');
  radioChecked.type = 'radio';
  radioChecked.checked = true;
  const qAnsweredRadio = {
    element: new MockNode('div'),
    options: [
      { element: radioChecked, container: new MockNode('li') }
    ],
    blankInputs: []
  };
  assert.equal(isQuestionAnswered(qAnsweredRadio), true);

  // 3. 学习通特定的 check_answer class 选中情况
  const liSelected = new MockNode('li', ['check_answer']);
  const qAnsweredClass = {
    element: new MockNode('div'),
    options: [
      { element: new MockNode('a'), container: liSelected }
    ],
    blankInputs: []
  };
  assert.equal(isQuestionAnswered(qAnsweredClass), true);

  // 4. 填空题已有内容情况
  const filledInput = new MockNode('input');
  filledInput.value = '牛顿第一定律';
  const qAnsweredBlank = {
    element: new MockNode('div'),
    options: [],
    blankInputs: [filledInput]
  };
  assert.equal(isQuestionAnswered(qAnsweredBlank), true);

  // 5. 关键防误判：超星题目的 answertype 隐藏域（例如 value="1" 或 "3"）绝不能误判为已作答！
  const containerWithAnswertype = new MockNode('div');
  const typeHidden = new MockNode('input');
  typeHidden.setAttribute('name', 'answertype405921390');
  typeHidden.setAttribute('type', 'hidden');
  typeHidden.value = '1'; // 1 代表多选题，非 0
  containerWithAnswertype.appendChild(typeHidden);

  const qWithAnswertype = {
    element: containerWithAnswertype,
    options: [
      { element: new MockNode('div'), container: new MockNode('div') }
    ],
    blankInputs: []
  };
  assert.equal(isQuestionAnswered(qWithAnswertype), false, 'answertype 隐藏域绝不能被误判为已作答');
});

test('extractQuestionsFromPage - 提取超星新版 Fanya 2.0 (singleQuesId, answerBg, h3.mark_name) 题目结构', () => {
  // 模拟整页大外壳 <div class="fanyaMarking TiMu" id="fanyaMarking">
  const root = new MockNode('div', ['fanyaMarking', 'TiMu']);
  root.id = 'fanyaMarking';

  // 内部的第 1 题容器 <div class="padBom50 questionLi fontLabel singleQuesId">
  const qBox = new MockNode('div', ['padBom50', 'questionLi', 'fontLabel', 'singleQuesId']);

  // 题干 <h3 class="mark_name colorDeep fontLabel workTextWrap">
  const h3 = new MockNode('h3', ['mark_name', 'colorDeep', 'fontLabel', 'workTextWrap']);
  h3.innerText = '1. (单选题) 1949年，( )发表了题为《保密系统的通信理论》的论文，该论';
  qBox.appendChild(h3);

  // 选项区域 <div class="stem_answer qtDetail">
  const stemAnswer = new MockNode('div', ['stem_answer', 'qtDetail']);

  // 选项 A <div class="clearfix answerBg workTextWrap" ...>
  const optA = new MockNode('div', ['clearfix', 'answerBg', 'workTextWrap']);
  const spanA = new MockNode('span', ['choice405921390', 'num_option', 'fl']);
  spanA.setAttribute('data', 'A');
  spanA.innerText = 'A';
  optA.appendChild(spanA);
  const pA = new MockNode('div', ['answer_p']);
  pA.innerText = 'Shannon';
  optA.appendChild(pA);
  stemAnswer.appendChild(optA);

  // 选项 B
  const optB = new MockNode('div', ['clearfix', 'answerBg', 'workTextWrap']);
  const spanB = new MockNode('span', ['choice405921390', 'num_option', 'fl']);
  spanB.setAttribute('data', 'B');
  spanB.innerText = 'B';
  optB.appendChild(spanB);
  const pB = new MockNode('div', ['answer_p']);
  pB.innerText = 'Diffie';
  optB.appendChild(pB);
  stemAnswer.appendChild(optB);

  qBox.appendChild(stemAnswer);
  root.appendChild(qBox);

  // 执行提取
  const questions = extractQuestionsFromPage(root);

  assert.equal(questions.length, 1, '应精准提取出 1 道题目，而不是将 fanyaMarking 误当成大题目');
  assert.equal(questions[0].type, 'single');
  assert.match(questions[0].title, /保密系统的通信理论/);
  assert.equal(questions[0].options.length, 2);
  assert.equal(questions[0].options[0].key, 'A');
  assert.equal(questions[0].options[0].text, 'Shannon');
  assert.equal(questions[0].options[1].key, 'B');
  assert.equal(questions[0].options[1].text, 'Diffie');
  assert.equal(questions[0].isAnswered, false);

  // 测试选中状态判断：当选项 A 被添加 check_answer 时
  optA.classList.add('check_answer');
  optA.className += ' check_answer';
  assert.equal(isQuestionAnswered(questions[0]), true, '检测到 check_answer 时应判定为已作答');
});

test('extractQuestionsFromPage - 提取超星填空题结构 (typename=填空题, .Answer, .divText, cxId)', () => {
  const root = new MockNode('div');
  const qBox = new MockNode('div', ['padBom50', 'questionLi', 'fontLabel', 'singleQuesId']);
  qBox.setAttribute('typename', '填空题');
  qBox.setAttribute('id', 'question405921397');
  qBox.setAttribute('data', '405921397');

  const h3 = new MockNode('h3', ['mark_name', 'colorDeep', 'fontLabel']);
  h3.innerText = '2. (填空题) 计算机由运算器、控制器、存储器、输入设备和___组成。';
  qBox.appendChild(h3);

  const sizeInput = new MockNode('input');
  sizeInput.setAttribute('type', 'hidden');
  sizeInput.setAttribute('name', 'tiankongsize405921397');
  sizeInput.value = '2';
  qBox.appendChild(sizeInput);

  // 空 1
  const ans1 = new MockNode('div', ['Answer']);
  const divText1 = new MockNode('div', ['divText']);
  const text1 = new MockNode('textarea');
  text1.setAttribute('name', 'answer405921397_0');
  divText1.appendChild(text1);
  ans1.appendChild(divText1);
  qBox.appendChild(ans1);

  // 空 2
  const ans2 = new MockNode('div', ['Answer']);
  const divText2 = new MockNode('div', ['divText']);
  const text2 = new MockNode('textarea');
  text2.setAttribute('name', 'answer405921397_1');
  divText2.appendChild(text2);
  ans2.appendChild(divText2);
  qBox.appendChild(ans2);

  root.appendChild(qBox);

  const questions = extractQuestionsFromPage(root);
  assert.equal(questions.length, 1, '应成功提取 1 道填空题');
  assert.equal(questions[0].type, 'blank', '题型应为 blank 填空题');
  assert.equal(questions[0].cxId, '405921397', '应正确提取原生 cxId');
  assert.equal(questions[0].blankInputs.length, 2, '应成功识别出 2 个填空输入区域');
  assert.equal(questions[0].isAnswered, false, '未作答状态应为 false');

  // 作答后测试
  text1.value = '输出设备';
  assert.equal(isQuestionAnswered(questions[0]), true, '填入答案后检测应为 true');
});

test('extractQuestionsFromPage - 提取超星多选题结构 (typename=多选题, qtype=1, .num_option_dx, check_answer_dx)', () => {
  const root = new MockNode('div');
  const qBox = new MockNode('div', ['padBom50', 'questionLi', 'fontLabel', 'singleQuesId']);
  qBox.setAttribute('typename', '多选题');
  qBox.setAttribute('qtype', '1');
  qBox.setAttribute('id', 'question405686862');
  qBox.setAttribute('data', '405686862');

  const h3 = new MockNode('h3', ['mark_name', 'colorDeep', 'fontLabel', 'workTextWrap']);
  h3.innerText = '19. (多选题) 密码体制从原理上可以分为哪几类？';
  qBox.appendChild(h3);

  const stemAnswer = new MockNode('div', ['stem_answer', 'qtDetail']);

  // 选项 A
  const optA = new MockNode('div', ['clearfix', 'answerBg', 'workTextWrap']);
  optA.setAttribute('onclick', 'addMultipleChoice(this);');
  optA.setAttribute('qid', '405686862');
  const spanA = new MockNode('span', ['choice405686862', 'num_option_dx', 'fl']);
  spanA.setAttribute('data', 'A');
  spanA.innerText = 'A';
  optA.appendChild(spanA);
  const pA = new MockNode('div', ['answer_p']);
  pA.innerText = '单钥密码体制（对称密码体制）';
  optA.appendChild(pA);
  stemAnswer.appendChild(optA);

  // 选项 B
  const optB = new MockNode('div', ['clearfix', 'answerBg', 'workTextWrap']);
  optB.setAttribute('onclick', 'addMultipleChoice(this);');
  optB.setAttribute('qid', '405686862');
  const spanB = new MockNode('span', ['choice405686862', 'num_option_dx', 'fl']);
  spanB.setAttribute('data', 'B');
  spanB.innerText = 'B';
  optB.appendChild(spanB);
  const pB = new MockNode('div', ['answer_p']);
  pB.innerText = '双钥密码体制（非对称密码体制）';
  optB.appendChild(pB);
  stemAnswer.appendChild(optB);

  // 选项 C
  const optC = new MockNode('div', ['clearfix', 'answerBg', 'workTextWrap']);
  optC.setAttribute('onclick', 'addMultipleChoice(this);');
  optC.setAttribute('qid', '405686862');
  const spanC = new MockNode('span', ['choice405686862', 'num_option_dx', 'fl']);
  spanC.setAttribute('data', 'C');
  spanC.innerText = 'C';
  optC.appendChild(spanC);
  const pC = new MockNode('div', ['answer_p']);
  pC.innerText = '混合密码体制';
  optC.appendChild(pC);
  stemAnswer.appendChild(optC);

  qBox.appendChild(stemAnswer);
  root.appendChild(qBox);

  const questions = extractQuestionsFromPage(root);
  assert.equal(questions.length, 1);
  assert.equal(questions[0].type, 'multiple', '多选题题型识别应为 multiple');
  assert.equal(questions[0].cxId, '405686862');
  assert.equal(questions[0].options.length, 3);
  assert.equal(questions[0].options[0].key, 'A');
  assert.equal(questions[0].options[1].key, 'B');
  assert.equal(questions[0].options[2].key, 'C');
  assert.equal(questions[0].isAnswered, false);

  // 模拟选项 A 被选中 (.check_answer_dx)
  spanA.classList.add('check_answer_dx');
  spanA.className += ' check_answer_dx';
  assert.equal(isQuestionAnswered(questions[0]), true, '多选项带有 check_answer_dx 时应被判定为已作答');
});

test('extractQuestionsFromPage - 提取超星选项防作弊乱序打乱题型（原生视觉标签优先，兼顾 cxDataKey）', () => {
  const root = new MockNode('div');
  const qBox = new MockNode('div', ['singleQuesId', 'padBom50']);
  qBox.setAttribute('data', '405686911');
  qBox.setAttribute('typename', '单选题');

  const h3 = new MockNode('h3', ['mark_name']);
  h3.innerText = '1. (单选题) 在一个关系中，能够惟一确定一个元组的属性或属性组合的叫做()。';
  qBox.appendChild(h3);

  // 选项 0: 视觉 A, data="C", "域"
  const opt0 = new MockNode('div', ['clearfix', 'answerBg', 'workTextWrap']);
  opt0.setAttribute('data', 'C');
  opt0.setAttribute('aria-label', 'C 域选择');
  const span0 = new MockNode('span', ['num_option', 'fl']);
  span0.innerText = 'A';
  opt0.appendChild(span0);
  const p0 = new MockNode('div', ['answer_p']);
  p0.innerText = '域';
  opt0.appendChild(p0);
  qBox.appendChild(opt0);

  // 选项 1: 视觉 B, data="A", "索引码"
  const opt1 = new MockNode('div', ['clearfix', 'answerBg', 'workTextWrap']);
  opt1.setAttribute('data', 'A');
  opt1.setAttribute('aria-label', 'A 索引码选择');
  const span1 = new MockNode('span', ['num_option', 'fl']);
  span1.innerText = 'B';
  opt1.appendChild(span1);
  const p1 = new MockNode('div', ['answer_p']);
  p1.innerText = '索引码';
  opt1.appendChild(p1);
  qBox.appendChild(opt1);

  // 选项 2: 视觉 C, data="B", "关键字"
  const opt2 = new MockNode('div', ['clearfix', 'answerBg', 'workTextWrap']);
  opt2.setAttribute('data', 'B');
  opt2.setAttribute('aria-label', 'B 关键字选择');
  const span2 = new MockNode('span', ['num_option', 'fl']);
  span2.innerText = 'C';
  opt2.appendChild(span2);
  const p2 = new MockNode('div', ['answer_p']);
  p2.innerText = '关键字';
  opt2.appendChild(p2);
  qBox.appendChild(opt2);

  // 选项 3: 视觉 D, data="D", "排序码"
  const opt3 = new MockNode('div', ['clearfix', 'answerBg', 'workTextWrap']);
  opt3.setAttribute('data', 'D');
  opt3.setAttribute('aria-label', 'D 排序码选择');
  const span3 = new MockNode('span', ['num_option', 'fl']);
  span3.innerText = 'D';
  opt3.appendChild(span3);
  const p3 = new MockNode('div', ['answer_p']);
  p3.innerText = '排序码';
  opt3.appendChild(p3);
  qBox.appendChild(opt3);

  root.appendChild(qBox);

  const questions = extractQuestionsFromPage(root);
  assert.equal(questions.length, 1);
  assert.equal(questions[0].options[0].key, 'A');
  assert.equal(questions[0].options[0].cxDataKey, 'C');
  assert.equal(questions[0].options[1].key, 'B');
  assert.equal(questions[0].options[1].cxDataKey, 'A');
  assert.equal(questions[0].options[2].key, 'C');
  assert.equal(questions[0].options[2].cxDataKey, 'B');
  assert.equal(questions[0].options[3].key, 'D');
  assert.equal(questions[0].options[3].cxDataKey, 'D');
});



