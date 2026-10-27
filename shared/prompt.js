/**
 * 学习通 AI 助手 - 提示词工程与构造器 (支持解析开关与省 Token 模式)
 */

export const SYSTEM_PROMPT_WITH_ANALYSIS = `你是一位学识渊博、严谨求实的高校教学助教与学术专家。
你的任务是对学生提供的学术题目给出准确的推荐答案与极简的解题依据。

【输出规范】
你必须严格输出合法的 JSON 对象，绝对不要包含任何前言、后记、Markdown 标记或代码块语法（即不要用 \`\`\`json 开头，直接以 { 开始，以 } 结束）。

JSON 结构规范：
{
  "matched_options": ["选中的选项具体完整文字内容，必须逐字对应上方【选项】列表文字"],
  "answer": ["选中的真实选项标签或完整答案"], // 单选填对应唯一真实字母；多选填所有正确选项真实字母；判断题填选项对应字母或 ["正确"]/["错误"]；填空/简答题填完整文本
  "confidence": 0.95, // 置信度 0.0 ~ 1.0
  "analysis": "一句话核心考点与知识点依据（务必控制在30字以内，禁止冗长废话）"
}

【核心防错准则 - 严防选项序号幻觉、选非题颠倒与判断题盲目选对】
1. 单选题甄别：务必严格逐字比对题干与【选项】列表中 A、B、C、D 等每个选项的具体文字，推导出的正确文字属于哪个字母标签，answer 数组中就必须填写该字母，绝对严禁盲目默认填写！matched_options 必须填入选中的选项完整文字。
2. 选非题/否定设问（题干含“不是”、“不正确”、“不属于”、“错误的是”、“不包含”、“不具有”等）：你的任务是挑选出【不正确/不符合】的那一项，禁止误选正确项！必须在 analysis 中指明“题干问的是非等价项/错误项，[所选选项]不属于...，而其他项均符合”，并在 answer 中填写该不符合项的字母！
3. 多选题甄别：务必严格逐一核对【选项】列表中每个正确观点对应的“真实字母标签”，answer 必须填写所有正确的真实字母，严禁未经核对随手默认填写！matched_options 必须填入选中的选项完整文字。
4. 判断题客观求实：考卷中有大量偷换概念、片面绝对化（如“总是相同”、“任何算法都相同”）或属性捏造（如将认证技术说成保密技术）的错误陈述，严禁盲目全选“对”！陈述有误必须果断选“错”对应的字母！analysis 论述必须与 answer 正误结论严格一致，绝严禁解析说“不正确/不同/不保密”而答案填“对/A”！
5. 简答题/论述题/计算题甄别：若包含多个小问（如 (1)(2)(3)(4)），answer 数组中必须包含所有小问的完整作答内容，绝对严禁只输出第 1 问而截断遗漏后续小问！
6. 反爬生僻字混淆容错：若题干或选项中出现生僻字（如“创娓”实为“创业”），请自动结合全句语境与知识常识还原其真实汉字与考点进行严谨推导。`;

export const SYSTEM_PROMPT_CONCISE = `你是高校学术答题助手。
你的唯一任务是直接给出题目的正确答案，绝对严禁输出任何分析、前置思考、逐步推导、内心独白、解题思路、推理过程、背景知识或废话，以最大程度节约 Token 和网络带宽！

【输出规范】
严格输出标准的极简 JSON 对象，绝对不要包含 Markdown 代码块或多余字符：
{
  "answer": ["正确答案真实字母或文本"], // 单选填选项真实字母如 ["C"]；多选填所有正确字母如 ["B", "C"]；判断填选项字母或 ["正确"]/["错误"]；填空/简答填完整文本
  "confidence": 0.95
}

【核心防错与防纠结准则】
1. 单选题与多选题必须认真仔细推导核对，按【选项】列表中实际对应的字母填写，正确是哪个选项就填哪个字母！遇复合命名（如 SHA256/224），快速选取最具特化针对性的选项（如 224位），切勿纠结论证！
2. 选非题（含“不是”、“不属于”、“不正确”等）必须选择不符合题意的那一项，切勿错选正确项！
3. 判断题看清选项中 A 和 B 哪个是对、哪个是错，有错误陈述必须坚决选错，严禁盲目全选 A！
4. 填空题与简答题按顺序完整提供答案，若包含多个小问全部答齐，严禁截断遗漏！
5. 若含混淆生僻字请自动结合语境还原真实题意。`;

/**
 * 获取系统提示词（根据是否需要解析）
 * @param {boolean} includeAnalysis 
 * @returns {string}
 */
export function getSystemPrompt(includeAnalysis = true) {
  return includeAnalysis ? SYSTEM_PROMPT_WITH_ANALYSIS : SYSTEM_PROMPT_CONCISE;
}

// 兼容旧导出
export const SYSTEM_PROMPT = SYSTEM_PROMPT_WITH_ANALYSIS;

/**
 * 构造题目 User Prompt
 * @param {Object} question
 * @param {string} question.type - 题型 (single, multiple, judge, blank, essay)
 * @param {string} question.title - 题干文本
 * @param {Array<{key: string, text: string}>} question.options - 选项列表
 * @param {boolean} [includeAnalysis=true] - 是否需要输出解析
 * @returns {string}
 */
export function buildUserPrompt(question, includeAnalysis = true) {
  const typeNames = {
    single: '单选题',
    multiple: '多选题',
    judge: '判断题',
    blank: '填空题',
    essay: '简答/论述题',
    unknown: '综合题'
  };

  const typeName = typeNames[question.type] || '题目';
  let prompt = `【题型】${typeName}\n`;
  prompt += `【题干】${question.title}\n`;

  if (question.options && question.options.length > 0) {
    prompt += `【选项】\n`;
    question.options.forEach((opt) => {
      prompt += `${opt.key ? opt.key + '. ' : ''}${opt.text}\n`;
    });
  }

  const isNegative = /不是|不正确|不属于|错误|不包含|不具有|不符合|未包含/.test(question.title || '');

  if (includeAnalysis) {
    if (question.type === 'single') {
      if (isNegative) {
        prompt += `\n【重要提示：选非题】题干为否定设问（含“不是/不正确/不属于/错误”等），题目要求选出【错误/不属于/不具备】的那一项！切勿把正确的项当作答案！必须认真排除 3 个符合的选项，在 answer 中填入那个【不符合/错误】的选项真实字母（A、B、C、D...），matched_options 填入该项完整文字！\n`;
      } else {
        prompt += `\n【重要提示】此题为单选题，必须在 matched_options 中填入正确选项的具体完整文字，并在 answer 中填入对应的真实字母标签（A、B、C、D...），正确是哪个字母就填哪个字母，禁止随意默认！遇到复合命名（如 SHA256/224），请快速选取最具特化针对性的选项，切勿纠结内耗。\n`;
      }
    } else if (question.type === 'multiple') {
      prompt += `\n【重要提示】此题为多选题，必须在 matched_options 中填入所有正确选项的具体完整文字，并在 answer 中填入对应的真实字母标签，禁止随意默认！\n`;
    } else if (question.type === 'judge') {
      prompt += `\n【重要提示：判断题求实】题干中经常包含偷换概念（如认证技术冒充保密技术）、绝对化（如“总是相同”）等错误观点，严禁盲目默认填“对”！请严格依据事实与学术标准判断。若命题错误，务必果断选“错”对应的字母！\n`;
    } else if (question.type === 'blank') {
      prompt += `\n【重要提示：填空题规范与求实】
1. 必须根据题干中的每个下划线或设空（第1空、第2空...），在 answer 数组中严格按顺序提供各个填空的精简、确切的最终答案文本（严禁包含“第1空:”、“第2空:”等冗余前缀标号）。
2. answer 数组长度必须与题干设空数量严格一致（设几个空就给几个独立元素）。
3. 密码学与计算机参数必须准确（区分输入消息上限、分组长度、步数/轮数、输出散列值长度，切勿混淆概念；例如 SM3 输入上限通常为 2^64-1 或 <2^64，分组为 512，输出为 256；若题干包含“输人”等错别字，请自动纠正为“输入”并据此严谨推导）。
4. 规范作答：严禁生成普通键盘无法直接输入的特殊希腊符号（如禁止直接输出“Σ0”、“Σ1”等生僻符号；当题目考查运算名称时优先填写规范中文运算“模加”、“异或”、“循环右移”、“与”，或使用通用键盘可输入的“Sigma0”、“Sigma1”，确保符合在线判分标准）。\n`;
    } else if (question.type === 'essay') {
      prompt += `\n【重要提示】此题为简答/论述/计算题，若题干包含多个小问（如 (1)(2)(3)(4)），请在 answer 数组中按顺序提供所有小问的完整、详细作答语句，切勿只答第一小题，严禁截断遗漏！\n`;
    }
    prompt += `\n请根据题目，给出推荐答案与清晰简要的知识点解析（控制在30字以内，禁止长篇大论，严格输出规范 JSON）。若遇防作弊混淆生僻字请自动结合语境还原真实题意。`;
  } else {
    // 极简省 Token 模式：大幅压缩提示词，不请求 matched_options 与 analysis，严禁思维链废话
    if (question.type === 'single') {
      if (isNegative) {
        prompt += `\n【选非题】选出不正确项，answer 填真实字母。`;
      } else {
        prompt += `\n【单选】answer 严格填选项真实字母。遇复合算法名（如SHA256/224）速选特化项，严禁纠结论证。`;
      }
    } else if (question.type === 'multiple') {
      prompt += `\n【多选】answer 填所有正确选项真实字母数组。`;
    } else if (question.type === 'judge') {
      prompt += `\n【判断】客观求实，有错选错，answer 填对应字母。`;
    } else if (question.type === 'blank') {
      prompt += `\n【填空】answer 按顺序填入规范文本数组，严禁生僻希腊符号（如用Sigma0/模加/异或等通用文本，绝不打Σ0），长度与设空数一致。`;
    } else if (question.type === 'essay') {
      prompt += `\n【简答】answer 填完整文本数组，多小问全部答齐。`;
    }
    prompt += `\n【重要：省 Token 模式】请直接输出推荐答案（严禁包含任何解析文字、思维链或冗长推导），直接以规范 JSON 输出。若有混淆生僻字请自动语境还原。`;
  }

  return prompt;
}
