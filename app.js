import { log } from "@zos/utils";

const logger = log.getLogger("hamgis-app");

App({
  globalData: {
    // 全局应用数据
    appVersion: "1.0.1",
    appName: "HAMGIS测亩",
    
    // 测量相关全局状态
    currentMeasurement: null,
    isGPSReady: false,
    
    // 设置相关全局状态
    settings: {
      primaryUnit: 'mu',        // 主要单位
      gpsAccuracy: 5,           // GPS精度要求
      vibrationFeedback: true,  // 震动反馈
      autoSave: true,           // 自动保存
      keepScreenOn: true        // 保持屏幕常亮
    }
  },

  onCreate() {
    logger.debug("HAMGIS应用启动");
    
    // 初始化应用
    this.initApp();
  },

  onDestroy() {
    logger.debug("HAMGIS应用销毁");
  },

  // 初始化应用
  initApp() {
    try {
      // 加载用户设置
      this.loadSettings();
      
      // 注意: 不需要手动 push 首页,Zepp OS 会自动打开 app.json 中 pages 数组的第一个页面
      
      logger.debug("应用初始化完成");
    } catch (e) {
      logger.error(`应用初始化失败: ${e}`);
    }
  },

  // 加载用户设置
  loadSettings() {
    try {
      const { localStorage } = require('@zos/storage');
      const stored = localStorage.getItem('hamgis_settings');
      
      if (stored) {
        const settings = JSON.parse(stored);
        this.globalData.settings = { ...this.globalData.settings, ...settings };
        logger.debug("用户设置加载完成");
      }
    } catch (e) {
      logger.error(`加载用户设置失败: ${e}`);
    }
  },

  // 保存用户设置
  saveSettings() {
    try {
      const { localStorage } = require('@zos/storage');
      localStorage.setItem('hamgis_settings', JSON.stringify(this.globalData.settings));
      logger.debug("用户设置保存完成");
    } catch (e) {
      logger.error(`保存用户设置失败: ${e}`);
    }
  },

  // 获取全局设置
  getSettings() {
    return this.globalData.settings;
  },

  // 更新全局设置
  updateSettings(newSettings) {
    this.globalData.settings = { ...this.globalData.settings, ...newSettings };
    this.saveSettings();
  }
});