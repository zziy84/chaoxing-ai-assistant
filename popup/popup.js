/**
 * 学习通 AI 助手 - Popup 控制逻辑
 */

import { PROVIDER_PRESETS, DEFAULT_CONFIG } from '../shared/constants.js';
import { getConfig, saveConfig } from '../shared/storage.js';

document.addEventListener('DOMContentLoaded', async () => {
  const providerSelect = document.getElementById('providerSelect');
  const modelSelect = document.getElementById('modelSelect');
  const customModelInput = document.getElementById('customModelInput');
  const baseUrlGroup = document.getElementById('baseUrlGroup');
  const baseUrlInput = document.getElementById('baseUrlInput');
  const apiKeyInput = document.getElementById('apiKeyInput');
  const btnToggleKey = document.getElementById('btnToggleKey');
  const autoFillSwitch = document.getElementById('autoFillSwitch');
  const includeAnalysisSwitch = document.getElementById('includeAnalysisSwitch');
  const providerDocLink = document.getElementById('providerDocLink');
  const statusAlert = document.getElementById('statusAlert');
  const btnTest = document.getElementById('btnTest');
  const btnSave = document.getElementById('btnSave');
  const btnOpenOptions = document.getElementById('btnOpenOptions');
  const btnStartAnswering = document.getElementById('btnStartAnswering');
  const startBtnText = document.getElementById('startBtnText');
  const detectDot = document.getElementById('detectDot');
  const detectText = document.getElementById('detectText');

  // 1. 初始化服务商下拉列表
  Object.values(PROVIDER_PRESETS).forEach(p => {
    const opt = document.createElement('option');
    opt.value = p.id;
    opt.textContent = p.name;
    providerSelect.appendChild(opt);
  });

  // 2. 加载当前配置
  const currentConfig = await getConfig();

  // 填充厂商与对应模型
  function updateModelOptions(providerId, selectedModel = '', customBaseUrl = '') {
    const preset = PROVIDER_PRESETS[providerId];
    modelSelect.innerHTML = '';

    // 仅当选择了 Custom (自定义) 时，才显示 Base URL 输入框；其他预设厂商直接隐藏
    if (providerId === 'custom') {
      baseUrlGroup.classList.remove('hidden');
      baseUrlInput.value = customBaseUrl || currentConfig.baseUrl || 'https://api.openai.com/v1';
    } else {
      baseUrlGroup.classList.add('hidden');
      baseUrlInput.value = preset?.baseUrl || '';
    }

    if (preset && preset.models && preset.models.length > 0) {
      customModelInput.classList.add('hidden');
      modelSelect.classList.remove('hidden');

      preset.models.forEach(m => {
        const opt = document.createElement('option');
        opt.value = m.id;
        opt.textContent = m.name;
        modelSelect.appendChild(opt);
      });

      // 添加自定义项
      const customOpt = document.createElement('option');
      customOpt.value = '__custom__';
      customOpt.textContent = '✏️ 手动输入模型名...';
      modelSelect.appendChild(customOpt);

      if (selectedModel && preset.models.some(m => m.id === selectedModel)) {
        modelSelect.value = selectedModel;
      } else if (selectedModel) {
        modelSelect.value = '__custom__';
        customModelInput.value = selectedModel;
        customModelInput.classList.remove('hidden');
      } else {
        modelSelect.value = preset.defaultModel;
      }
    } else {
      modelSelect.classList.add('hidden');
      customModelInput.classList.remove('hidden');
      customModelInput.value = selectedModel || '';
    }

    // 更新获取 Key 链接
    if (preset && preset.docsUrl) {
      providerDocLink.href = preset.docsUrl;
      providerDocLink.classList.remove('hidden');
    } else {
      providerDocLink.classList.add('hidden');
    }
  }

  // 渲染已有配置
  providerSelect.value = currentConfig.provider || 'deepseek';
  updateModelOptions(providerSelect.value, currentConfig.model, currentConfig.baseUrl);
  apiKeyInput.value = currentConfig.apiKey || '';
  autoFillSwitch.checked = Boolean(currentConfig.autoFill);
  includeAnalysisSwitch.checked = currentConfig.includeAnalysis !== false;

  // 监听服务商切换
  providerSelect.addEventListener('change', () => {
    const pId = providerSelect.value;
    updateModelOptions(pId);
  });

  // 监听模型选择切换
  modelSelect.addEventListener('change', () => {
    if (modelSelect.value === '__custom__') {
      customModelInput.classList.remove('hidden');
      customModelInput.focus();
    } else {
      customModelInput.classList.add('hidden');
    }
  });

  // 切换 API Key 显示/隐藏
  btnToggleKey.addEventListener('click', () => {
    if (apiKeyInput.type === 'password') {
      apiKeyInput.type = 'text';
      btnToggleKey.textContent = '🔒';
    } else {
      apiKeyInput.type = 'password';
      btnToggleKey.textContent = '👁️';
    }
  });

  // 状态显示辅助函数
  function showAlert(text, type = 'info') {
    statusAlert.textContent = text;
    statusAlert.className = `status-alert ${type}`;
    statusAlert.classList.remove('hidden');
  }

  function hideAlert() {
    statusAlert.classList.add('hidden');
  }

  // 打开完整设置页
  btnOpenOptions.addEventListener('click', (e) => {
    e.preventDefault();
    if (chrome.runtime.openOptionsPage) {
      chrome.runtime.openOptionsPage();
    } else {
      window.open(chrome.runtime.getURL('options/options.html'));
    }
  });

  // 获取当前表单选中的实际 Model 字符串
  function getSelectedModel() {
    if (modelSelect.classList.contains('hidden') || modelSelect.value === '__custom__') {
      return customModelInput.value.trim();
    }
    return modelSelect.value;
  }

  // 获取当前选中的 Base URL
  function getSelectedBaseUrl() {
    const pId = providerSelect.value;
    if (pId === 'custom') {
      return baseUrlInput.value.trim();
    }
    const preset = PROVIDER_PRESETS[pId];
    if (preset && preset.baseUrl) {
      return preset.baseUrl;
    }
    return baseUrlInput.value.trim() || currentConfig.baseUrl || '';
  }

  // 测试连接
  btnTest.addEventListener('click', async () => {
    const apiKey = apiKeyInput.value.trim();
    const model = getSelectedModel();
    const baseUrl = getSelectedBaseUrl();

    if (!baseUrl) {
      showAlert('请在完整设置中填写有效 Base URL', 'error');
      return;
    }

    showAlert('正在向模型发起连通性测试...', 'info');
    btnTest.disabled = true;

    try {
      const res = await chrome.runtime.sendMessage({
        action: 'TEST_CONNECTION',
        payload: { baseUrl, apiKey, model }
      });

      if (res && res.success) {
        showAlert(`✓ 连接成功！响应延时: ${res.latency}ms`, 'success');
      } else {
        showAlert(`❌ 连接失败: ${res?.error || '未知错误'}`, 'error');
      }
    } catch (err) {
      showAlert(`❌ 通信错误: ${err.message}`, 'error');
    } finally {
      btnTest.disabled = false;
    }
  });

  // 保存配置
  btnSave.addEventListener('click', async () => {
    const pId = providerSelect.value;
    const model = getSelectedModel();
    const apiKey = apiKeyInput.value.trim();
    const autoFill = autoFillSwitch.checked;
    const includeAnalysis = includeAnalysisSwitch.checked;
    const baseUrl = getSelectedBaseUrl();

    if (!baseUrl) {
      showAlert('请填写有效的 API Base URL', 'error');
      return;
    }

    const newConfig = {
      provider: pId,
      baseUrl,
      apiKey,
      model,
      autoFill,
      includeAnalysis
    };

    btnSave.textContent = '保存中...';
    btnSave.disabled = true;

    try {
      await saveConfig(newConfig);
      showAlert('✓ 配置已保存，实时生效', 'success');

      // 安全通知所有已打开的学习通 Tab（杜绝未捕获异常与红标）
      if (typeof chrome !== 'undefined' && chrome.tabs?.query) {
        chrome.tabs.query({ url: ['*://*.chaoxing.com/*', '*://*.edu.cn/*'] }, (tabs) => {
          if (chrome.runtime.lastError) return;
          (tabs || []).forEach(tab => {
            try {
              chrome.tabs.sendMessage(tab.id, { action: 'CONFIG_UPDATED', config: newConfig }, () => {
                if (chrome.runtime.lastError) {} // 消费 lastError
              });
            } catch (_) {}
          });
        });
      }

      setTimeout(() => {
        btnSave.textContent = '💾 保存配置';
        btnSave.disabled = false;
      }, 1200);
    } catch (err) {
      showAlert(`保存失败: ${err.message}`, 'error');
      btnSave.disabled = false;
    }
  });

  // -------------------------------------------------------------
  // 核心功能：开始答题 / 停止答题 按钮逻辑
  // -------------------------------------------------------------
  let activeTabId = null;
  let isSolvingOnPage = false;

  function setStartBtnRunning(running) {
    isSolvingOnPage = running;
    if (running) {
      btnStartAnswering.classList.add('running');
      startBtnText.textContent = '⏹️ 停止答题';
    } else {
      btnStartAnswering.classList.remove('running');
      startBtnText.textContent = '开始答题';
    }
  }

  async function checkActiveTabStatus() {
    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (!tab || !tab.id) return;
      activeTabId = tab.id;

      const isXuexitongUrl = tab.url && (
        tab.url.includes('chaoxing.com') ||
        tab.url.includes('edu.cn') ||
        tab.url.includes('xuexitong.com')
      );

      if (!isXuexitongUrl) {
        detectDot.className = 'detect-dot';
        detectText.textContent = '当前未处于学习通网页';
        btnStartAnswering.disabled = true;
        return;
      }

      // 尝试向页面发送探测消息
      chrome.tabs.sendMessage(tab.id, { action: 'GET_PAGE_STATUS' }, (res) => {
        if (chrome.runtime.lastError || !res) {
          detectDot.className = 'detect-dot warning';
          detectText.textContent = '学习通页面 (如未见浮窗请刷新网页)';
          btnStartAnswering.disabled = false;
        } else {
          detectDot.className = 'detect-dot active';
          detectText.textContent = `已就绪做题页面 (共识别 ${res.questionCount} 题)`;
          btnStartAnswering.disabled = false;
          if (res.isSolving) {
            setStartBtnRunning(true);
          }
        }
      });
    } catch {
      detectText.textContent = '无法获取页面状态';
    }
  }

  // 立即探测当前活动标签页
  checkActiveTabStatus();

  // 点击“开始答题 / 停止答题”
  btnStartAnswering.addEventListener('click', async () => {
    if (!activeTabId) return;

    // 先检查是否配置了 API Key
    const cfg = await getConfig();
    if (!cfg.apiKey && cfg.provider !== 'ollama') {
      showAlert('⚠️ 请先填写 API Key 并点击保存配置后再开始答题！', 'error');
      apiKeyInput.focus();
      return;
    }

    if (isSolvingOnPage) {
      // 发送停止指令
      chrome.tabs.sendMessage(activeTabId, { action: 'STOP_ANSWERING' }, () => {
        setStartBtnRunning(false);
        showAlert('已向页面发送中止答题指令。', 'info');
      });
    } else {
      // 发送开始指令
      setStartBtnRunning(true);
      showAlert('🚀 正在启动自动答题流程...', 'info');

      chrome.tabs.sendMessage(activeTabId, { action: 'START_ANSWERING' }, (res) => {
        if (chrome.runtime.lastError || !res) {
          showAlert('❌ 无法连接到页面扩展脚本，请刷新学习通页面后再试。', 'error');
          setStartBtnRunning(false);
        } else {
          showAlert(`✓ 答题已开始！正在作答 (共 ${res.count} 题)`, 'success');
          // 1.2秒后自动关闭 popup 方便用户观察网页作答动效
          setTimeout(() => {
            window.close();
          }, 1200);
        }
      });
    }
  });
});
