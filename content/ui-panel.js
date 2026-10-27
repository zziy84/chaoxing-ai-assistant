/**
 * 学习通 AI 助手 - Shadow DOM 独立侧边栏与悬浮窗组件
 */

import { applyAnswerToQuestion, randomDelay } from './simulator.js';
import { SPEED_PRESETS } from '../shared/constants.js';

export class AssistantUIPanel {
  constructor({ onRescan, onSolveQuestion, onSolveAll, onStop, config }) {
    this.onRescan = onRescan;
    this.onSolveQuestion = onSolveQuestion;
    this.onSolveAll = onSolveAll;
    this.onStop = onStop;
    this.config = config;

    this.isOpen = false;
    this.questions = [];
    this.results = new Map(); // questionId -> { status, result, error }
    this.isBatchSolving = false;

    this.root = null;
    this.shadow = null;
    this.initDOM();
  }

  initDOM() {
    // 移除已存在的实例
    const existing = document.getElementById('cx-ai-assistant-root');
    if (existing) existing.remove();

    this.root = document.createElement('div');
    this.root.id = 'cx-ai-assistant-root';
    document.body.appendChild(this.root);

    this.shadow = this.root.attachShadow({ mode: 'open' });
    this.shadow.innerHTML = `
      <style>
        :host {
          all: initial;
          font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
          font-size: 14px;
          line-height: 1.5;
          color: #1e293b;
          z-index: 9999999;
          position: fixed;
        }
        * {
          box-sizing: border-box;
        }

        /* 悬浮球按钮 */
        .floating-pill {
          position: fixed;
          bottom: 30px;
          right: 30px;
          display: flex;
          align-items: center;
          gap: 8px;
          background: linear-gradient(135deg, #2563eb, #3b82f6);
          color: #ffffff;
          padding: 10px 18px;
          border-radius: 9999px;
          box-shadow: 0 10px 25px -5px rgba(37, 99, 235, 0.4), 0 8px 10px -6px rgba(37, 99, 235, 0.3);
          cursor: pointer;
          user-select: none;
          transition: transform 0.2s, box-shadow 0.2s;
          z-index: 999999;
        }
        .floating-pill:hover {
          transform: translateY(-2px);
          box-shadow: 0 15px 30px -5px rgba(37, 99, 235, 0.5);
        }
        .floating-pill .badge {
          background: #ef4444;
          color: white;
          font-size: 11px;
          font-weight: 700;
          padding: 2px 7px;
          border-radius: 9999px;
        }

        /* 侧边栏主体 */
        .sidebar {
          position: fixed;
          top: 20px;
          right: 20px;
          width: 420px;
          max-width: calc(100vw - 40px);
          height: calc(100vh - 40px);
          background: #ffffff;
          border-radius: 16px;
          box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.25);
          display: flex;
          flex-direction: column;
          overflow: hidden;
          transition: transform 0.3s cubic-bezier(0.16, 1, 0.3, 1), opacity 0.3s;
          transform: translateX(460px);
          opacity: 0;
          pointer-events: none;
          z-index: 1000000;
          border: 1px solid #e2e8f0;
        }
        .sidebar.active {
          transform: translateX(0);
          opacity: 1;
          pointer-events: auto;
        }

        /* 顶部导航 (支持随意拖拽) */
        .header {
          padding: 14px 20px;
          background: #f8fafc;
          border-bottom: 1px solid #e2e8f0;
          display: flex;
          align-items: center;
          justify-content: space-between;
          cursor: grab;
          user-select: none;
        }
        .header:active {
          cursor: grabbing;
        }
        .title-area {
          display: flex;
          align-items: center;
          gap: 10px;
        }
        .logo-icon {
          font-size: 20px;
        }
        .app-name {
          font-size: 16px;
          font-weight: 700;
          color: #0f172a;
        }
        .model-tag {
          font-size: 11px;
          background: #e0f2fe;
          color: #0369a1;
          padding: 2px 8px;
          border-radius: 6px;
          font-weight: 600;
        }
        .actions-top {
          display: flex;
          gap: 8px;
        }
        .icon-btn {
          background: none;
          border: none;
          cursor: pointer;
          font-size: 16px;
          padding: 6px;
          border-radius: 6px;
          color: #64748b;
          transition: background 0.2s, color 0.2s;
        }
        .icon-btn:hover {
          background: #e2e8f0;
          color: #0f172a;
        }

        /* 工具栏 */
        .toolbar {
          padding: 12px 20px;
          background: #ffffff;
          border-bottom: 1px solid #f1f5f9;
          display: flex;
          flex-wrap: wrap;
          gap: 10px;
          align-items: center;
          justify-content: space-between;
        }
        .btn-primary {
          background: #2563eb;
          color: #ffffff;
          border: none;
          padding: 7px 14px;
          border-radius: 8px;
          font-weight: 600;
          font-size: 13px;
          cursor: pointer;
          transition: all 0.2s;
          display: inline-flex;
          align-items: center;
          gap: 6px;
        }
        .btn-primary:hover:not(:disabled) {
          background: #1d4ed8;
        }
        .btn-primary:disabled {
          background: #94a3b8;
          cursor: not-allowed;
        }
        .btn-primary.start-btn {
          background: linear-gradient(135deg, #10b981, #059669);
          font-weight: 700;
          box-shadow: 0 4px 10px rgba(16, 185, 129, 0.3);
        }
        .btn-primary.start-btn:hover:not(:disabled) {
          background: linear-gradient(135deg, #059669, #047857);
          box-shadow: 0 6px 14px rgba(16, 185, 129, 0.4);
        }
        .btn-primary.start-btn.running {
          background: linear-gradient(135deg, #ef4444, #dc2626);
          box-shadow: 0 4px 10px rgba(239, 68, 68, 0.3);
        }
        .btn-primary.start-btn.running:hover:not(:disabled) {
          background: linear-gradient(135deg, #dc2626, #b91c1c);
        }
        .btn-secondary {
          background: #f1f5f9;
          color: #334155;
          border: 1px solid #e2e8f0;
          padding: 7px 12px;
          border-radius: 8px;
          font-size: 13px;
          cursor: pointer;
          transition: background 0.2s;
        }
        .btn-secondary:hover {
          background: #e2e8f0;
        }
        /* 速度模式切换器 */
        .speed-group {
          display: inline-flex;
          align-items: center;
          background: #f1f5f9;
          border-radius: 8px;
          padding: 2px;
          gap: 2px;
          border: 1px solid #e2e8f0;
        }
        .speed-btn {
          border: none;
          background: transparent;
          padding: 4px 8px;
          font-size: 11px;
          font-weight: 600;
          color: #64748b;
          border-radius: 6px;
          cursor: pointer;
          transition: all 0.2s ease;
        }
        .speed-btn:hover {
          color: #0f172a;
        }
        .speed-btn.active {
          background: #ffffff;
          color: #2563eb;
          box-shadow: 0 1px 3px rgba(0,0,0,0.1);
        }
        /* 并发通道切换器 */
        .concurrency-group {
          display: inline-flex;
          align-items: center;
          background: #f1f5f9;
          border-radius: 8px;
          padding: 2px 4px;
          gap: 2px;
          border: 1px solid #e2e8f0;
        }
        .concurrency-label {
          font-size: 11px;
          color: #64748b;
          font-weight: 600;
          padding-left: 2px;
          padding-right: 2px;
        }
        .concurrency-btn {
          border: none;
          background: transparent;
          padding: 3px 6px;
          font-size: 11px;
          font-weight: 600;
          color: #64748b;
          border-radius: 5px;
          cursor: pointer;
          transition: all 0.2s ease;
        }
        .concurrency-btn:hover {
          color: #0f172a;
        }
        .concurrency-btn.active {
          background: #ffffff;
          color: #2563eb;
          box-shadow: 0 1px 3px rgba(0,0,0,0.1);
        }
        .toggle-switch {
          display: flex;
          align-items: center;
          gap: 6px;
          font-size: 12px;
          color: #475569;
          cursor: pointer;
        }

        /* 题型筛选工具栏 */
        .type-filter-bar {
          display: flex;
          align-items: center;
          gap: 12px;
          padding: 8px 20px;
          background: #f8fafc;
          border-bottom: 1px solid #e2e8f0;
          font-size: 12px;
          flex-wrap: wrap;
        }
        .type-filter-title {
          font-weight: 600;
          color: #475569;
          display: inline-flex;
          align-items: center;
          gap: 4px;
        }
        .type-filter-item {
          display: inline-flex;
          align-items: center;
          gap: 4px;
          color: #334155;
          cursor: pointer;
          user-select: none;
        }
        .type-filter-item input {
          cursor: pointer;
          accent-color: #2563eb;
        }

        /* 题目列表卡片流 */
        .content-body {
          flex: 1;
          overflow-y: auto;
          padding: 16px 20px;
          display: flex;
          flex-direction: column;
          gap: 14px;
        }
        .question-card {
          background: #ffffff;
          border: 1px solid #e2e8f0;
          border-radius: 12px;
          padding: 14px;
          box-shadow: 0 1px 3px rgba(0,0,0,0.05);
          transition: border-color 0.2s, box-shadow 0.2s;
        }
        .question-card:hover {
          border-color: #cbd5e1;
          box-shadow: 0 4px 6px -1px rgba(0,0,0,0.08);
        }
        .card-header {
          display: flex;
          justify-content: space-between;
          align-items: flex-start;
          margin-bottom: 8px;
        }
        .q-meta {
          display: flex;
          align-items: center;
          gap: 8px;
        }
        .q-index {
          font-weight: 700;
          color: #2563eb;
        }
        .q-type {
          font-size: 11px;
          padding: 1px 6px;
          border-radius: 4px;
          background: #f1f5f9;
          color: #64748b;
        }
        .q-title {
          font-size: 13px;
          font-weight: 500;
          color: #1e293b;
          margin-bottom: 10px;
          line-height: 1.4;
        }

        /* 状态指示 */
        .status-badge {
          font-size: 11px;
          padding: 2px 8px;
          border-radius: 9999px;
          font-weight: 600;
        }
        .status-idle { background: #f1f5f9; color: #64748b; }
        .status-loading { background: #dbeafe; color: #1d4ed8; }
        .status-success { background: #dcfce7; color: #15803d; }
        .status-error { background: #fee2e2; color: #b91c1c; }
        .status-skipped { background: #fef3c7; color: #b45309; }

        /* 答案高亮盒 */
        .answer-box {
          background: #f0fdf4;
          border: 1px solid #bbf7d0;
          border-radius: 8px;
          padding: 10px 12px;
          margin-top: 10px;
        }
        .answer-main {
          display: flex;
          align-items: center;
          justify-content: space-between;
          font-weight: 700;
          color: #166534;
          font-size: 15px;
        }
        .confidence-tag {
          font-size: 11px;
          background: #bbf7d0;
          padding: 2px 6px;
          border-radius: 4px;
          color: #14532d;
        }
        .analysis-text {
          font-size: 12px;
          color: #374151;
          margin-top: 8px;
          padding-top: 8px;
          border-top: 1px dashed #dcfce7;
          line-height: 1.5;
          word-break: break-word;
        }

        /* 单题操作栏 */
        .card-footer {
          margin-top: 10px;
          display: flex;
          justify-content: flex-end;
          gap: 8px;
        }
        .btn-mini {
          padding: 4px 10px;
          font-size: 12px;
          border-radius: 6px;
          cursor: pointer;
          border: 1px solid #e2e8f0;
          background: #ffffff;
          color: #334155;
          transition: all 0.2s;
        }
        .btn-mini:hover {
          background: #f8fafc;
          border-color: #cbd5e1;
        }
        .btn-mini.apply {
          background: #10b981;
          color: #ffffff;
          border: none;
        }
        .btn-mini.apply:hover {
          background: #059669;
        }

        /* 空状态 */
        .empty-state {
          text-align: center;
          padding: 40px 20px;
          color: #94a3b8;
        }

        /* 底部合规声明 */
        .footer-bar {
          padding: 10px 20px;
          background: #f8fafc;
          border-top: 1px solid #e2e8f0;
          font-size: 11px;
          color: #94a3b8;
          text-align: center;
        }
      </style>

      <!-- 悬浮胶囊 -->
      <div class="floating-pill" id="pillBtn">
        <span>🤖 学习通 AI 助手</span>
        <span class="badge" id="pillBadge">0 题</span>
      </div>

      <!-- 侧边抽屉 -->
      <div class="sidebar" id="sidebar">
        <!-- 头部 (可随意拖动) -->
        <div class="header" id="sidebarHeader" title="按住鼠标左键可随意拖动此窗口">
          <div class="title-area">
            <span style="color: #94a3b8; font-size: 14px; margin-right: 2px; cursor: grab;" title="按住拖拽">⠿</span>
            <span class="logo-icon">🎓</span>
            <span class="app-name">AI 答题辅助</span>
            <span class="model-tag" id="headerModelTag">${this.config.model || '未选模型'}</span>
          </div>
          <div class="actions-top">
            <button class="icon-btn" id="openOptionsBtn" title="插件配置">⚙️</button>
            <button class="icon-btn" id="closeSidebarBtn" title="收起">✕</button>
          </div>
        </div>

        <!-- 工具栏 -->
        <div class="toolbar">
          <button class="btn-primary start-btn" id="startAnswerBtn">▶️ 开始答题</button>
          <button class="btn-secondary" id="rescanBtn">🔄 重新扫描</button>
          
          <div class="speed-group" title="作答速度控制 (极速模式推荐，零等待)">
            <button type="button" class="speed-btn ${(!this.config.speedMode || this.config.speedMode === 'turbo') ? 'active' : ''}" data-speed="turbo">🚀 极速</button>
            <button type="button" class="speed-btn ${this.config.speedMode === 'normal' ? 'active' : ''}" data-speed="normal">⚡ 匀速</button>
            <button type="button" class="speed-btn ${this.config.speedMode === 'safe' ? 'active' : ''}" data-speed="safe">🛡️ 安全</button>
          </div>

          <div class="concurrency-group" title="并发解析通道数 (多通道并行答题，整卷速度倍增，建议 2~4)">
            <span class="concurrency-label">并发:</span>
            <button type="button" class="concurrency-btn ${(this.config.concurrency || 3) === 1 ? 'active' : ''}" data-concurrency="1">1</button>
            <button type="button" class="concurrency-btn ${(this.config.concurrency || 3) === 2 ? 'active' : ''}" data-concurrency="2">2</button>
            <button type="button" class="concurrency-btn ${(this.config.concurrency || 3) === 3 ? 'active' : ''}" data-concurrency="3">3</button>
            <button type="button" class="concurrency-btn ${(this.config.concurrency || 3) >= 4 ? 'active' : ''}" data-concurrency="4">4</button>
          </div>

          <label class="toggle-switch" title="开启显示知识点与解题过程；关闭仅输出纯答案省Token">
            <input type="checkbox" id="includeAnalysisToggle" ${this.config.includeAnalysis !== false ? 'checked' : ''}>
            <span>输出解析</span>
          </label>
          <label class="toggle-switch" title="检测到页面题目已作答时自动跳过">
            <input type="checkbox" id="skipAnsweredToggle" ${this.config.skipAnswered !== false ? 'checked' : ''}>
            <span>跳过已答</span>
          </label>
          <label class="toggle-switch" title="解析完成后自动辅助在页面勾选填入">
            <input type="checkbox" id="autoFillToggle" ${this.config.autoFill ? 'checked' : ''}>
            <span>自动填选</span>
          </label>
        </div>

        <!-- 自动解答题型勾选 -->
        <div class="type-filter-bar" title="勾选自动作答题型，未勾选的题型在点击“开始答题”时将自动跳过">
          <span class="type-filter-title">自动解答题型:</span>
          <label class="type-filter-item" title="单选与多选">
            <input type="checkbox" id="qTypeChoice" ${this.isTypeEnabled('choice') ? 'checked' : ''}>
            <span>选择题</span>
          </label>
          <label class="type-filter-item">
            <input type="checkbox" id="qTypeJudge" ${this.isTypeEnabled('judge') ? 'checked' : ''}>
            <span>判断题</span>
          </label>
          <label class="type-filter-item">
            <input type="checkbox" id="qTypeBlank" ${this.isTypeEnabled('blank') ? 'checked' : ''}>
            <span>填空题</span>
          </label>
          <label class="type-filter-item">
            <input type="checkbox" id="qTypeEssay" ${this.isTypeEnabled('essay') ? 'checked' : ''}>
            <span>简答题</span>
          </label>
        </div>

        <!-- 题目卡片列表 -->
        <div class="content-body" id="questionsList">
          <div class="empty-state">
            <p>正在检测页面题目...</p>
          </div>
        </div>

        <!-- 底部 -->
        <div class="footer-bar">
          ⚠️ 仅供学术思考与学习辅助，请自觉遵守学术诚信规范。
        </div>
      </div>
    `;

    this.bindEvents();
  }

  bindEvents() {
    const pillBtn = this.shadow.getElementById('pillBtn');
    const closeBtn = this.shadow.getElementById('closeSidebarBtn');
    const openOptionsBtn = this.shadow.getElementById('openOptionsBtn');
    const rescanBtn = this.shadow.getElementById('rescanBtn');
    const startAnswerBtn = this.shadow.getElementById('startAnswerBtn');
    const autoFillToggle = this.shadow.getElementById('autoFillToggle');
    const includeAnalysisToggle = this.shadow.getElementById('includeAnalysisToggle');
    const skipAnsweredToggle = this.shadow.getElementById('skipAnsweredToggle');

    pillBtn.addEventListener('click', () => this.toggleSidebar());
    closeBtn.addEventListener('click', () => this.toggleSidebar(false));

    openOptionsBtn.addEventListener('click', () => {
      try {
        chrome.runtime.sendMessage({ action: 'OPEN_OPTIONS' }, () => {
          if (chrome.runtime.lastError) {
            // 访问 lastError 即标记为已处理，防止 Chrome 记录未捕获异常
          }
        });
      } catch (_) {}
    });

    rescanBtn.addEventListener('click', () => {
      try {
        chrome.runtime.sendMessage({ action: 'RELOAD_EXTENSION' }, () => {
          if (chrome.runtime.lastError) {
            // 访问 lastError 即标记为已处理，防止 Chrome 记录未捕获异常
          }
        });
      } catch (_) {}
      if (this.onRescan) this.onRescan();
    });

    startAnswerBtn.addEventListener('click', () => {
      if (this.isBatchSolving) {
        if (this.onStop) this.onStop();
        this.setSolvingState(false);
      } else {
        if (this.onSolveAll) this.onSolveAll();
      }
    });

    autoFillToggle.addEventListener('change', (e) => {
      this.config.autoFill = e.target.checked;
      chrome.runtime.sendMessage({ action: 'SAVE_CONFIG', config: { autoFill: e.target.checked } });
    });

    if (includeAnalysisToggle) {
      includeAnalysisToggle.addEventListener('change', (e) => {
        this.config.includeAnalysis = e.target.checked;
        chrome.runtime.sendMessage({ action: 'SAVE_CONFIG', config: { includeAnalysis: e.target.checked } });
      });
    }

    if (skipAnsweredToggle) {
      skipAnsweredToggle.addEventListener('change', (e) => {
        this.config.skipAnswered = e.target.checked;
        chrome.runtime.sendMessage({ action: 'SAVE_CONFIG', config: { skipAnswered: e.target.checked } });
      });
    }

    const speedBtns = this.shadow.querySelectorAll('.speed-btn');
    const concurrencyBtns = this.shadow.querySelectorAll('.concurrency-btn');

    const qTypeChoice = this.shadow.getElementById('qTypeChoice');
    const qTypeJudge = this.shadow.getElementById('qTypeJudge');
    const qTypeBlank = this.shadow.getElementById('qTypeBlank');
    const qTypeEssay = this.shadow.getElementById('qTypeEssay');
    [qTypeChoice, qTypeJudge, qTypeBlank, qTypeEssay].forEach(input => {
      input?.addEventListener('change', () => this.updateEnabledTypes());
    });

    speedBtns.forEach(btn => {
      btn.addEventListener('click', () => {
        const speed = btn.getAttribute('data-speed');
        this.config.speedMode = speed;
        speedBtns.forEach(b => b.classList.remove('active'));
        btn.classList.add('active');

        // 切换速度预设时，自动联动匹配最佳推荐并发
        const speedPreset = SPEED_PRESETS[speed];
        if (speedPreset && speedPreset.defaultConcurrency) {
          this.config.concurrency = speedPreset.defaultConcurrency;
          concurrencyBtns.forEach(b => {
            const val = parseInt(b.getAttribute('data-concurrency'), 10);
            b.classList.toggle('active', val === this.config.concurrency);
          });
        }

        chrome.runtime.sendMessage({
          action: 'SAVE_CONFIG',
          config: { speedMode: speed, concurrency: this.config.concurrency }
        });
      });
    });

    concurrencyBtns.forEach(btn => {
      btn.addEventListener('click', () => {
        const val = parseInt(btn.getAttribute('data-concurrency'), 10) || 1;
        this.config.concurrency = val;
        concurrencyBtns.forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        chrome.runtime.sendMessage({
          action: 'SAVE_CONFIG',
          config: { concurrency: val }
        });
      });
    });

    // 窗口随意拖动功能实现
    const header = this.shadow.getElementById('sidebarHeader') || this.shadow.querySelector('.header');
    const sidebar = this.shadow.getElementById('sidebar');
    let isDragging = false;
    let startX = 0, startY = 0;
    let initialLeft = 0, initialTop = 0;

    if (header && sidebar) {
      header.addEventListener('mousedown', (e) => {
        // 排除头部按钮和配置标签的点击，防止误触发拖拽
        if (e.target.closest('button, .icon-btn, input, a, .model-tag')) return;

        isDragging = true;
        startX = e.clientX;
        startY = e.clientY;

        const rect = sidebar.getBoundingClientRect();
        initialLeft = rect.left;
        initialTop = rect.top;

        sidebar.style.transition = 'none';
        sidebar.style.left = `${initialLeft}px`;
        sidebar.style.top = `${initialTop}px`;
        sidebar.style.right = 'auto';
        sidebar.style.bottom = 'auto';
        sidebar.style.transform = 'none';

        const onMouseMove = (moveEvent) => {
          if (!isDragging) return;
          const dx = moveEvent.clientX - startX;
          const dy = moveEvent.clientY - startY;

          let newLeft = initialLeft + dx;
          let newTop = initialTop + dy;

          const maxLeft = Math.max(0, window.innerWidth - sidebar.offsetWidth);
          const maxTop = Math.max(0, window.innerHeight - sidebar.offsetHeight);

          newLeft = Math.max(0, Math.min(newLeft, maxLeft));
          newTop = Math.max(0, Math.min(newTop, maxTop));

          sidebar.style.left = `${newLeft}px`;
          sidebar.style.top = `${newTop}px`;
        };

        const onMouseUp = () => {
          if (!isDragging) return;
          isDragging = false;
          sidebar.style.transition = 'opacity 0.3s ease';
          document.removeEventListener('mousemove', onMouseMove);
          document.removeEventListener('mouseup', onMouseUp);
        };

        document.addEventListener('mousemove', onMouseMove);
        document.addEventListener('mouseup', onMouseUp);
        e.preventDefault();
      });
    }
  }

  toggleSidebar(show = null) {
    const sidebar = this.shadow.getElementById('sidebar');
    this.isOpen = show !== null ? show : !this.isOpen;
    if (this.isOpen) {
      sidebar.classList.add('active');
    } else {
      sidebar.classList.remove('active');
    }
  }

  setSolvingState(isSolving, progressText = '') {
    this.isBatchSolving = isSolving;
    const btn = this.shadow.getElementById('startAnswerBtn');
    if (!btn) return;

    if (isSolving) {
      btn.classList.add('running');
      btn.textContent = `⏹️ 停止答题 ${progressText}`;
    } else {
      btn.classList.remove('running');
      btn.textContent = '▶️ 开始答题';
    }
  }

  updateConfig(newConfig) {
    this.config = { ...this.config, ...newConfig };
    const tag = this.shadow.getElementById('headerModelTag');
    if (tag) tag.textContent = this.config.model || '未选模型';

    if (this.config.speedMode) {
      const speedBtns = this.shadow.querySelectorAll('.speed-btn');
      speedBtns.forEach(b => {
        b.classList.toggle('active', b.getAttribute('data-speed') === this.config.speedMode);
      });
    }

    if (this.config.concurrency) {
      const concurrencyBtns = this.shadow.querySelectorAll('.concurrency-btn');
      concurrencyBtns.forEach(b => {
        const val = parseInt(b.getAttribute('data-concurrency'), 10);
        b.classList.toggle('active', val === this.config.concurrency || (val === 4 && this.config.concurrency >= 4));
      });
    }

    if (this.config.enabledQuestionTypes) {
      const qChoice = this.shadow.getElementById('qTypeChoice');
      const qJudge = this.shadow.getElementById('qTypeJudge');
      const qBlank = this.shadow.getElementById('qTypeBlank');
      const qEssay = this.shadow.getElementById('qTypeEssay');
      if (qChoice) qChoice.checked = this.isTypeEnabled('choice');
      if (qJudge) qJudge.checked = this.isTypeEnabled('judge');
      if (qBlank) qBlank.checked = this.isTypeEnabled('blank');
      if (qEssay) qEssay.checked = this.isTypeEnabled('essay');
    }
  }

  isTypeEnabled(typeCategory) {
    const list = this.config?.enabledQuestionTypes || ['single', 'multiple', 'judge', 'blank', 'essay'];
    if (typeCategory === 'choice') {
      return list.includes('single') || list.includes('multiple') || list.includes('choice');
    }
    return list.includes(typeCategory);
  }

  updateEnabledTypes() {
    const choiceChecked = this.shadow.getElementById('qTypeChoice')?.checked ?? true;
    const judgeChecked = this.shadow.getElementById('qTypeJudge')?.checked ?? true;
    const blankChecked = this.shadow.getElementById('qTypeBlank')?.checked ?? true;
    const essayChecked = this.shadow.getElementById('qTypeEssay')?.checked ?? true;

    const enabled = [];
    if (choiceChecked) {
      enabled.push('single', 'multiple');
    }
    if (judgeChecked) {
      enabled.push('judge');
    }
    if (blankChecked) {
      enabled.push('blank');
    }
    if (essayChecked) {
      enabled.push('essay');
    }

    this.config.enabledQuestionTypes = enabled;
    if (typeof chrome !== 'undefined' && chrome.runtime?.sendMessage) {
      chrome.runtime.sendMessage({
        action: 'SAVE_CONFIG',
        config: { enabledQuestionTypes: enabled }
      });
    }
  }

  getSpeedConfig() {
    return SPEED_PRESETS[this.config.speedMode] || SPEED_PRESETS.turbo;
  }

  setQuestions(questions) {
    this.questions = questions;
    const badge = this.shadow.getElementById('pillBadge');
    if (badge) badge.textContent = `${questions.length} 题`;

    this.renderQuestionsList();
  }

  setQuestionStatus(questionId, status, payload = null) {
    this.results.set(questionId, { status, payload });
    this.updateQuestionCard(questionId);
  }

  renderQuestionsList() {
    const container = this.shadow.getElementById('questionsList');
    if (!container) return;

    if (this.questions.length === 0) {
      container.innerHTML = `
        <div class="empty-state">
          <p style="font-size: 24px; margin-bottom: 8px;">📑</p>
          <p>当前页面暂未识别到题目。</p>
          <p style="font-size: 12px; margin-top: 4px;">如已在做题页面，请点击上方的“重新扫描”。</p>
        </div>
      `;
      return;
    }

    container.innerHTML = '';
    this.questions.forEach((q) => {
      const card = document.createElement('div');
      card.className = 'question-card';
      card.id = `card_${q.id}`;
      card.innerHTML = this.buildCardHTML(q);
      container.appendChild(card);
      this.bindCardEvents(card, q);
    });
  }

  buildCardHTML(q) {
    const data = this.results.get(q.id) || { status: 'idle' };
    const typeMap = {
      single: '单选',
      multiple: '多选',
      judge: '判断',
      blank: '填空',
      essay: '简答',
      unknown: '综合'
    };

    let statusBadge = q.isAnswered ? `<span class="status-badge status-skipped" title="页面上已填写此题">已作答</span>` : `<span class="status-badge status-idle">待解析</span>`;
    let resultSection = '';

    if (data.status === 'loading') {
      statusBadge = `<span class="status-badge status-loading">⏳ 思考中...</span>`;
    } else if (data.status === 'skipped') {
      statusBadge = `<span class="status-badge status-skipped">⏩ 已跳过</span>`;
      const skipReason = data.payload?.reason || '已自动跳过该题以节省 Token';
      resultSection = `<div style="color: #b45309; font-size: 12px; margin-top: 8px; background: #fef3c7; padding: 6px 10px; border-radius: 6px; border: 1px dashed #fde68a;">ℹ️ ${skipReason}。</div>`;
    } else if (data.status === 'error') {
      statusBadge = `<span class="status-badge status-error">❌ 出错</span>`;
      resultSection = `<div style="color: #ef4444; font-size: 12px; margin-top: 8px;">${data.payload?.error || '请求失败'}</div>`;
    } else if (data.status === 'success') {
      statusBadge = `<span class="status-badge status-success">✓ 完成</span>`;
      const res = data.payload?.result;
      if (res) {
        let answerText = res.displayAnswer || (res.answer || []).join(', ') || '无法确定';
        if (!res.displayAnswer && q.type === 'judge' && res.answer && res.answer.length > 0) {
          const ansKey = res.answer[0];
          const matchedOpt = (q.options || []).find(o => (o.key || '').toUpperCase() === ansKey.toUpperCase());
          if (matchedOpt && matchedOpt.text) {
            answerText = `${ansKey} (${matchedOpt.text})`;
          }
        }
        const isMultiline = String(answerText).includes('\n');
        resultSection = `
          <div class="answer-box">
            <div class="answer-main">
              <span>推荐答案: <strong style="color: #15803d; font-size: 16px; margin-left: 4px;">${isMultiline ? '' : answerText}</strong></span>
              <span class="confidence-tag">置信度: ${Math.round((res.confidence || 0.9) * 100)}%</span>
            </div>
            ${isMultiline ? `<div style="margin-top: 6px; white-space: pre-wrap; font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace; font-size: 12px; background: #f0fdf4; padding: 6px 8px; border-radius: 4px; border: 1px dashed #bbf7d0; line-height: 1.5; color: #166534;">${answerText}</div>` : ''}
            ${res.analysis ? `<div class="analysis-text">${res.analysis}</div>` : ''}
          </div>
        `;
      }
    }

    return `
      <div class="card-header">
        <div class="q-meta">
          <span class="q-index">#${q.index}</span>
          <span class="q-type">${typeMap[q.type] || '题'}</span>
        </div>
        ${statusBadge}
      </div>
      <div class="q-title">${q.title}</div>
      ${resultSection}
      <div class="card-footer">
        <button class="btn-mini locate-btn">📍 定位</button>
        <button class="btn-mini solve-single-btn" ${data.status === 'loading' ? 'disabled' : ''}>
          ${data.status === 'success' ? '🔄 重新分析' : '🚀 解析此题'}
        </button>
        ${data.status === 'success' ? '<button class="btn-mini apply apply-btn">✍️ 辅助填入</button>' : ''}
      </div>
    `;
  }

  bindCardEvents(card, q) {
    const locateBtn = card.querySelector('.locate-btn');
    const solveBtn = card.querySelector('.solve-single-btn');
    const applyBtn = card.querySelector('.apply-btn');

    if (locateBtn) {
      locateBtn.addEventListener('click', () => {
        if (q.element) {
          q.element.scrollIntoView({ behavior: 'smooth', block: 'center' });
          q.element.style.transition = 'box-shadow 0.3s';
          q.element.style.boxShadow = '0 0 0 3px #3b82f6';
          setTimeout(() => {
            q.element.style.boxShadow = '';
          }, 1500);
        }
      });
    }

    if (solveBtn) {
      solveBtn.addEventListener('click', () => {
        if (this.onSolveQuestion) this.onSolveQuestion(q);
      });
    }

    if (applyBtn) {
      applyBtn.addEventListener('click', async () => {
        const data = this.results.get(q.id);
        if (data && data.payload?.result) {
          applyBtn.textContent = '填入中...';
          applyBtn.disabled = true;
          await applyAnswerToQuestion(q, data.payload.result, true, this.getSpeedConfig());
          applyBtn.textContent = '✓ 已填入';
          setTimeout(() => {
            applyBtn.textContent = '✍️ 辅助填入';
            applyBtn.disabled = false;
          }, 2000);
        }
      });
    }
  }

  updateQuestionCard(questionId) {
    const q = this.questions.find(item => item.id === questionId);
    if (!q) return;

    const card = this.shadow.getElementById(`card_${questionId}`);
    if (card) {
      card.innerHTML = this.buildCardHTML(q);
      this.bindCardEvents(card, q);
    }
  }
}
