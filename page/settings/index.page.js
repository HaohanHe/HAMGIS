import { log, px } from "@zos/utils";
import { createWidget, widget, align, prop, text_style } from '@zos/ui';
import { getDeviceInfo } from "@zos/device";
import { getText } from '@zos/i18n';
import { localStorage } from '@zos/storage';

const logger = log.getLogger("hamgis-settings");

Page({
  data: {
    settings: {
      primaryUnit: 'mu',        // 主要单位: 'mu', 'hectare', 'squareMeter'
      vibrationFeedback: true,  // 震动反馈
      autoSave: true,           // 自动保存
      keepScreenOn: true,       // 保持屏幕常亮
      largeFont: true           // 大字模式 - 默认开启
    },
    widgets: {},
    currentSettingIndex: 0,   // 当前设置项索引
    settingItems: [
      { key: 'primaryUnit', type: 'select', options: ['mu', 'hectare'] },
      { key: 'vibrationFeedback', type: 'boolean' },
      { key: 'autoSave', type: 'boolean' },
      { key: 'keepScreenOn', type: 'boolean' },
      { key: 'largeFont', type: 'boolean' }
    ]
  },

  // 加载设置
  loadSettings() {
    try {
      const stored = localStorage.getItem('hamgis_settings');
      if (stored) {
        const settings = JSON.parse(stored);
        // 验证数据格式
        if (typeof settings === 'object' && settings !== null) {
          this.data.settings = { ...this.data.settings, ...settings };
        } else {
          logger.warn('设置数据格式无效，使用默认值');
        }
      }
      logger.debug("设置加载完成:", this.data.settings);
    } catch (e) {
      logger.error(`加载设置失败: ${e}`);
    }
  },

  // 保存设置
  saveSettings() {
    try {
      localStorage.setItem('hamgis_settings', JSON.stringify(this.data.settings));
      logger.debug("设置保存完成");
    } catch (e) {
      logger.error(`保存设置失败: ${e}`);
    }
  },

  // 获取当前设置项
  getCurrentSetting() {
    return this.data.settingItems[this.data.currentSettingIndex];
  },

  // 获取设置值的显示文本
  getSettingDisplayValue(setting) {
    const value = this.data.settings[setting.key];
    
    switch (setting.type) {
      case 'select':
        // 单位映射：内部值 -> 显示文本
        const unitTextMap = {
          'mu': getText('mu') || '亩',
          'hectare': getText('hectare') || '公顷'
        };
        const displayValue = unitTextMap[value] || value;
        logger.debug(`单位显示: ${value} -> ${displayValue}`);
        return displayValue;
        
      case 'number':
        return `${value} ${setting.unit || ''}`;
        
      case 'boolean':
        return value ? (getText('enabled') || '开启') : (getText('disabled') || '关闭');
        
      default:
        return String(value);
    }
  },

  // 获取设置项名称
  getSettingName(setting) {
    const nameMap = {
      'primaryUnit': getText('primaryUnit') || '面积单位',
      'vibrationFeedback': getText('vibrationFeedback') || '震动反馈',
      'autoSave': getText('autoSave') || '自动保存',
      'keepScreenOn': getText('keepScreenOn') || '屏幕常亮',
      'largeFont': getText('largeFont') || '大字模式'
    };
    return nameMap[setting.key] || setting.key;
  },

  // 上一个设置项
  previousSetting() {
    this.data.currentSettingIndex = Math.max(0, this.data.currentSettingIndex - 1);
    this.updateUI();
  },

  // 下一个设置项
  nextSetting() {
    this.data.currentSettingIndex = Math.min(
      this.data.settingItems.length - 1, 
      this.data.currentSettingIndex + 1
    );
    this.updateUI();
  },

  // 修改当前设置值
  modifyCurrentSetting(increase = true) {
    const setting = this.getCurrentSetting();
    const currentValue = this.data.settings[setting.key];
    
    switch (setting.type) {
      case 'select':
        const unitMap = { 'mu': 0, 'hectare': 1 };
        const reverseMap = ['mu', 'hectare'];
        let currentIndex = unitMap[currentValue] || 0;
        
        if (increase) {
          currentIndex = (currentIndex + 1) % setting.options.length;
        } else {
          currentIndex = (currentIndex - 1 + setting.options.length) % setting.options.length;
        }
        
        const newValue = reverseMap[currentIndex];
        this.data.settings[setting.key] = newValue;
        logger.debug(`单位修改: ${currentValue} -> ${newValue} (索引: ${currentIndex})`);
        break;
        
      case 'number':
        let newNumberValue = currentValue;
        if (increase) {
          newNumberValue = Math.min(setting.max, currentValue + 1);
        } else {
          newNumberValue = Math.max(setting.min, currentValue - 1);
        }
        this.data.settings[setting.key] = newNumberValue;
        break;
        
      case 'boolean':
        this.data.settings[setting.key] = !currentValue;
        break;
    }
    
    this.saveSettings();
    this.updateUI();
  },

  // 重置所有设置
  resetSettings() {
    this.data.settings = {
      primaryUnit: 'mu',
      vibrationFeedback: true,
      autoSave: true,
      keepScreenOn: true,
      largeFont: true  // 默认开启大字模式
    };
    
    this.saveSettings();
    this.updateUI();
    
    logger.debug("设置已重置为默认值");
  },

  // 获取存储使用情况
  getStorageInfo() {
    try {
      const measurements = localStorage.getItem('hamgis_measurements');
      const settings = localStorage.getItem('hamgis_settings');
      
      let measurementCount = 0;
      let totalSize = 0;
      
      if (measurements) {
        try {
          const data = JSON.parse(measurements);
          if (Array.isArray(data)) {
            measurementCount = data.length;
          }
        } catch (e) {
          logger.error('解析测量数据失败:', e);
        }
        totalSize += measurements.length;
      }
      
      if (settings) {
        totalSize += settings.length;
      }
      
      return {
        measurementCount,
        totalSize: (totalSize / 1024).toFixed(1) // KB
      };
    } catch (e) {
      logger.error(`获取存储信息失败: ${e}`);
      return { measurementCount: 0, totalSize: '0.0' };
    }
  },

  // 更新UI显示
  updateUI() {
    const setting = this.getCurrentSetting();
    
    // 更新设置名称
    if (this.data.widgets.settingName) {
      const settingName = this.getSettingName(setting);
      this.data.widgets.settingName.setProperty(prop.TEXT, settingName);
    }
    
    // 更新设置值
    if (this.data.widgets.settingValue) {
      const displayValue = this.getSettingDisplayValue(setting);
      this.data.widgets.settingValue.setProperty(prop.TEXT, displayValue);
      logger.debug(`更新设置值显示: ${setting.key} = ${displayValue}`);
    }
    
    // 更新索引显示
    if (this.data.widgets.settingIndex) {
      const indexText = `${this.data.currentSettingIndex + 1}/${this.data.settingItems.length}`;
      this.data.widgets.settingIndex.setProperty(prop.TEXT, indexText);
    }
    
    // 更新存储信息
    if (this.data.widgets.storageInfo) {
      const info = this.getStorageInfo();
      const recordsText = getText('recordsCount') || '条记录';
      const storageText = `${getText('storageInfo') || '存储信息'}: ${info.measurementCount} ${recordsText.replace('%d', '')}, ${info.totalSize} KB`;
      this.data.widgets.storageInfo.setProperty(prop.TEXT, storageText);
    }
  },

  onInit() {
    logger.debug("设置页面初始化");
    try {
      this.loadSettings();
    } catch (e) {
      logger.error(`设置页面初始化失败: ${e}`);
    }
  },

  build() {
    logger.debug("构建设置页面UI");
    
    const deviceInfo = getDeviceInfo();
    const { width, height } = deviceInfo;
    
    // 检测屏幕类型：390px为方屏，480px为圆屏
    const isSquareScreen = width <= 390;
    
    // 背景
    createWidget(widget.FILL_RECT, {
      x: 0,
      y: 0,
      w: width,
      h: height,
      color: 0x000000
    });
    
    // 标题
    createWidget(widget.TEXT, {
      x: 0,
      y: px(40),
      w: width,
      h: px(40),
      color: 0xffffff,
      text_size: px(28),
      align_h: align.CENTER_H,
      align_v: align.CENTER_V,
      text_style: text_style.BOLD,
      text: getText('settings') || '设置'
    });
    
    // 设置项名称
    this.data.widgets.settingName = createWidget(widget.TEXT, {
      x: 0,
      y: px(120),
      w: width,
      h: px(40),
      color: 0xffffff,
      text_size: px(24),
      align_h: align.CENTER_H,
      align_v: align.CENTER_V,
      text: "设置项"
    });
    
    // 设置值显示 (大字体)
    this.data.widgets.settingValue = createWidget(widget.TEXT, {
      x: 0,
      y: px(180),
      w: width,
      h: px(80),
      color: 0x00ff00,
      text_size: px(36),
      align_h: align.CENTER_H,
      align_v: align.CENTER_V,
      text_style: text_style.BOLD,
      text: "设置值"
    });
    
    // 按钮配置
    const buttonW = px(80);
    const buttonH = px(50);
    
    if (isSquareScreen) {
      // 方屏布局：重新排列按钮避免重叠
      const firstRowY = px(280);
      const secondRowY = px(340);
      const resetButtonY = px(400);
      
      // 第一行：▲ ▼ (灰色按钮水平排列)
      createWidget(widget.BUTTON, {
        x: (width - px(180)) / 2,  // 两个按钮居中，间距20px
        y: firstRowY,
        w: buttonW,
        h: buttonH,
        radius: px(25),
        normal_color: 0x333333,
        press_color: 0x555555,
        text: "▲",
        text_size: px(24),
        click_func: () => {
          this.previousSetting();
        }
      });
      
      createWidget(widget.BUTTON, {
        x: (width - px(180)) / 2 + px(100),  // 右侧按钮
        y: firstRowY,
        w: buttonW,
        h: buttonH,
        radius: px(25),
        normal_color: 0x333333,
        press_color: 0x555555,
        text: "▼",
        text_size: px(24),
        click_func: () => {
          this.nextSetting();
        }
      });
      
      // 第二行：◀ ▶ (橙色按钮下移)
      createWidget(widget.BUTTON, {
        x: (width - px(180)) / 2,
        y: secondRowY,
        w: buttonW,
        h: buttonH,
        radius: px(25),
        normal_color: 0xff8800,
        press_color: 0xcc6600,
        text: "◀",
        text_size: px(24),
        click_func: () => {
          this.modifyCurrentSetting(false);
        }
      });
      
      createWidget(widget.BUTTON, {
        x: (width - px(180)) / 2 + px(100),
        y: secondRowY,
        w: buttonW,
        h: buttonH,
        radius: px(25),
        normal_color: 0xff8800,
        press_color: 0xcc6600,
        text: "▶",
        text_size: px(24),
        click_func: () => {
          this.modifyCurrentSetting(true);
        }
      });
      
      // 重置按钮
      createWidget(widget.BUTTON, {
        x: (width - px(120)) / 2,
        y: resetButtonY,
        w: px(120),
        h: px(50),
        radius: px(25),
        normal_color: 0xff3333,
        press_color: 0xcc2222,
        text: getText('resetSettings'),
        text_size: px(18),
        click_func: () => {
          this.resetSettings();
        }
      });
      
    } else {
      // 圆屏布局：保持原有的垂直排列
      const buttonY = px(280);
      
      // 上一项按钮
      createWidget(widget.BUTTON, {
        x: px(40),
        y: buttonY,
        w: buttonW,
        h: buttonH,
        radius: px(25),
        normal_color: 0x333333,
        press_color: 0x555555,
        text: "▲",
        text_size: px(24),
        click_func: () => {
          this.previousSetting();
        }
      });
      
      // 减少值按钮
      createWidget(widget.BUTTON, {
        x: px(140),
        y: buttonY,
        w: buttonW,
        h: buttonH,
        radius: px(25),
        normal_color: 0xff8800,
        press_color: 0xcc6600,
        text: "◀",
        text_size: px(24),
        click_func: () => {
          this.modifyCurrentSetting(false);
        }
      });
      
      // 增加值按钮
      createWidget(widget.BUTTON, {
        x: width - px(140) - buttonW,
        y: buttonY,
        w: buttonW,
        h: buttonH,
        radius: px(25),
        normal_color: 0xff8800,
        press_color: 0xcc6600,
        text: "▶",
        text_size: px(24),
        click_func: () => {
          this.modifyCurrentSetting(true);
        }
      });
      
      // 下一项按钮
      createWidget(widget.BUTTON, {
        x: width - px(40) - buttonW,
        y: buttonY,
        w: buttonW,
        h: buttonH,
        radius: px(25),
        normal_color: 0x333333,
        press_color: 0x555555,
        text: "▼",
        text_size: px(24),
        click_func: () => {
          this.nextSetting();
        }
      });
      
      // 重置按钮
      createWidget(widget.BUTTON, {
        x: (width - px(120)) / 2,
        y: px(360),
        w: px(120),
        h: px(50),
        radius: px(25),
        normal_color: 0xff3333,
        press_color: 0xcc2222,
        text: getText('resetSettings'),
        text_size: px(18),
        click_func: () => {
          this.resetSettings();
        }
      });
    }
    
    // 设置索引显示 - 根据屏幕类型调整位置
    const indexY = isSquareScreen ? px(470) : px(430);
    this.data.widgets.settingIndex = createWidget(widget.TEXT, {
      x: 0,
      y: indexY,
      w: width,
      h: px(30),
      color: 0x666666,
      text_size: px(18),
      align_h: align.CENTER_H,
      align_v: align.CENTER_V,
      text: "1/4"
    });
    
    // 存储信息 - 根据屏幕类型调整位置
    const storageY = isSquareScreen ? px(500) : px(470);
    this.data.widgets.storageInfo = createWidget(widget.TEXT, {
      x: 0,
      y: storageY,
      w: width,
      h: px(30),
      color: 0x999999,
      text_size: px(16),
      align_h: align.CENTER_H,
      align_v: align.CENTER_V,
      text: `${getText('storageInfo') || '存储信息'}: 0 ${(getText('recordsCount') || '条记录').replace('%d', '')}, 0.0 KB`
    });
    
    // 版本信息 - 根据屏幕类型调整位置
    const versionY = isSquareScreen ? px(530) : px(510);
    createWidget(widget.TEXT, {
      x: 0,
      y: versionY,
      w: width,
      h: px(30),
      color: 0x666666,
      text_size: px(14),
      align_h: align.CENTER_H,
      align_v: align.CENTER_V,
      text: `HAMGIS v1.0.1`
    });
    
    // 初始化UI
    this.updateUI();
  },

  onDestroy() {
    logger.debug("设置页面销毁");
  }
});