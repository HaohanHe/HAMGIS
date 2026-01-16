import { log, px } from "@zos/utils";
import { createWidget, widget, align, prop, text_style } from '@zos/ui';
import { setPageBrightTime, setWakeUpRelaunch, pauseDropWristScreenOff, resumeDropWristScreenOff } from "@zos/display";
import { getDeviceInfo } from "@zos/device";
import { Geolocation } from "@zos/sensor";
import { Vibrator } from "@zos/sensor";
import { localStorage } from '@zos/storage';
import { push } from '@zos/router';
import { getText } from '@zos/i18n';
import { onKey, KEY_SHORTCUT, KEY_BACK, KEY_EVENT_CLICK } from '@zos/interaction';
import { barometerManager } from '../../utils/barometer.js';
import { calculateElevationStats } from '../../utils/elevation.js';

const logger = log.getLogger("hamgis-measurement");

// 测量状态 - 简化为两个状态
const MEASURE_STATE = {
  READY: 'ready',         // 准备采集（GPS就绪）
  COLLECTING: 'collecting' // 采集中（已有点位）
};

// 面积单位转换 - 使用动态国际化
const getAreaUnits = () => ({
  MU: {
    name: getText('mu') || '亩',
    symbol: getText('mu') || '亩',
    factor: 0.0015  // 1平方米 = 0.0015亩
  },
  HECTARE: {
    name: getText('hectare') || '公顷',
    symbol: getText('hectare') || '公顷',
    factor: 0.0001  // 1平方米 = 0.0001公顷
  }
});

// 文本映射 - 使用国际化
const TEXTS = {
  get locating() { return getText('locating') || '定位中...'; },
  get accuracy() { return getText('accuracy') || '精度'; },
  get weakSignal() { return getText('weakSignal') || '信号弱'; },
  get points() { return getText('points') || '点位'; },
  get area() { return getText('area') || '面积'; },
  get perimeter() { return getText('perimeter') || '周长'; },
  get history() { return getText('history') || '历史'; },
  get settings() { return getText('settings') || '设置'; },
  get noGPS() { return getText('noGPS') || '等待定位...'; },
  get unnamed() { return getText('unnamed') || '未命名地块'; }
};

Page({
  data: {
    // GPS定位
    geolocation: null,
    locationCallback: null,
    currentLat: null,
    currentLon: null,
    accuracy: 0,
    gpsStatus: 'locating',
    locateStartTime: 0,
    
    // 海拔数据
    currentAltitude: null,  // 当前海拔
    
    // 测量数据
    measureState: MEASURE_STATE.READY,
    points: [],  // 采集的坐标点 [{lat, lon, altitude, timestamp}]
    currentArea: 0,  // 当前面积(平方米)
    currentPerimeter: 0,  // 当前周长(米)
    currentFieldName: '',  // 当前地块名称（地块A、地块B...）
    todayFieldCount: 0,    // 今天已完成的地块数
    
    // UI组件
    widgets: {},
    vibrator: null,
    
    // 定时器
    locationTimer: null,
    uiUpdateTimer: null,
    
    // 自动采集
    isAutoCollecting: false,
    autoCollectTimer: null,
    settings: {}
  },

  // 初始化GPS定位
  initGPS() {
    try {
      this.data.geolocation = new Geolocation();
      
      // 检查权限是否可用 (API_LEVEL 4.0+)
      if (typeof this.data.geolocation.getEnabled === 'function') {
        const enabled = this.data.geolocation.getEnabled();
        if (!enabled) {
          this.data.gpsStatus = 'permission_denied';
          logger.warn('GPS权限被拒绝，请在设置中开启定位权限');
          return;
        }
      }
      
      this.data.locationCallback = () => {
        this.updateGPSLocation();
      };
      
      this.data.geolocation.start();
      this.data.geolocation.onChange(this.data.locationCallback);
      this.data.locateStartTime = Date.now();
      
      // 监听权限变化 (API_LEVEL 4.0+)
      if (typeof this.data.geolocation.onEnableChange === 'function') {
        this.data.geolocation.onEnableChange(() => {
          if (this.data.geolocation.getEnabled()) {
            this.data.geolocation.start();
            this.data.gpsStatus = 'locating';
            logger.log('GPS权限已开启，开始定位');
          } else {
            this.data.geolocation.stop();
            this.data.gpsStatus = 'permission_denied';
            logger.warn('GPS权限被关闭');
          }
          this.updateUI();
        });
      }
      
      logger.debug("GPS定位初始化成功");
    } catch (e) {
      logger.error(`GPS定位初始化失败: ${e}`);
      this.data.gpsStatus = 'error';
    }
  },

  // 更新GPS位置
  updateGPSLocation() {
    try {
      if (!this.data.geolocation) return;
      
      const status = this.data.geolocation.getStatus();
      const now = Date.now();
      const locateDuration = now - this.data.locateStartTime;
      
      if (status === 'A') {
        const latitude = this.data.geolocation.getLatitude();
        const longitude = this.data.geolocation.getLongitude();
        
        // 验证坐标数据的有效性
        if (latitude && longitude &&
            typeof latitude === 'number' &&
            typeof longitude === 'number' &&
            Math.abs(latitude) <= 90 &&
            Math.abs(longitude) <= 180) {
          
          this.data.currentLat = latitude;
          this.data.currentLon = longitude;
          this.data.gpsStatus = 'ready';
          this.data.accuracy = 5;  // 假设精度为5米
          
          logger.debug(`GPS位置更新: ${latitude.toFixed(6)}, ${longitude.toFixed(6)}`);
        } else {
          logger.warn(`无效的坐标数据: lat=${latitude}, lon=${longitude}`);
          this.data.gpsStatus = 'error';
        }
      } else {
        if (locateDuration >= 15000) {
          this.data.gpsStatus = 'weak';
        } else {
          this.data.gpsStatus = 'locating';
        }
      }
      
      this.updateUI();
    } catch (e) {
      logger.error(`更新GPS位置失败: ${e}`);
      this.data.gpsStatus = 'error';
    }
  },

  // 开始新地块 - 自动调用，无需用户手动触发
  startNewField() {
    this.data.measureState = MEASURE_STATE.READY;
    this.data.points = [];
    this.data.currentArea = 0;
    this.data.currentPerimeter = 0;
    // 自动生成地块名：Field A, Field B, Field C...
    this.data.currentFieldName = this.generateFieldName();

    logger.debug(`开始新地块: ${this.data.currentFieldName}`);
    this.updateUI();
  },

  // 开始自动采集
  startAutoCollect() {
    if (this.data.isAutoCollecting) return;
    
    this.data.isAutoCollecting = true;
    
    // 更新按钮状态
    if (this.data.widgets.collectBtn) {
      this.data.widgets.collectBtn.setProperty(prop.TEXT, getText('stopCollect') || "停止采集");
      this.data.widgets.collectBtn.setProperty(prop.MORE, {
        ...this.data.widgets.collectBtn.getProperty(prop.MORE),
        normal_color: 0xb3261e, // Red
        press_color: 0x8c1d18
      });
    }
    
    // 立即采集一次
    this.collectPoint();
    
    // 启动定时器
    const interval = (this.data.settings.collectionInterval || 3) * 1000;
    this.data.autoCollectTimer = setInterval(() => {
      this.collectPoint();
    }, interval);
    
    logger.debug(`开始自动采集，间隔: ${interval}ms`);
  },
  
  // 停止自动采集
  stopAutoCollect() {
    if (!this.data.isAutoCollecting) return;
    
    this.data.isAutoCollecting = false;
    
    if (this.data.autoCollectTimer) {
      clearInterval(this.data.autoCollectTimer);
      this.data.autoCollectTimer = null;
    }
    
    // 更新按钮状态
    if (this.data.widgets.collectBtn) {
      this.data.widgets.collectBtn.setProperty(prop.TEXT, getText('startCollect') || "开始采集");
      this.data.widgets.collectBtn.setProperty(prop.MORE, {
        ...this.data.widgets.collectBtn.getProperty(prop.MORE),
        normal_color: 0x0986d4, // Blue
        press_color: 0x0061a4
      });
    }
    
    logger.debug("停止自动采集");
  },

  // 采集点 - 简化逻辑，直接采集
  collectPoint() {
    if (this.data.gpsStatus !== 'ready') {
      logger.warn("GPS未就绪，无法采集点");
      // 显示提示
      if (this.data.widgets.statusTip) {
        const weakSignalText = getText('weakSignal') || '信号弱';
        const moveOpenText = getText('moveToOpenArea') || '请移动到开阔地带';
        this.data.widgets.statusTip.setProperty(prop.TEXT, `${weakSignalText}，${moveOpenText}`);
        this.data.widgets.statusTip.setProperty(prop.COLOR, 0xff3b30);
      }
      return;
    }
    
    if (!this.data.currentLat || !this.data.currentLon) {
      logger.warn("GPS位置无效，无法采集点");
      return;
    }
    
    const point = {
      lat: this.data.currentLat,
      lon: this.data.currentLon,
      altitude: barometerManager.getAltitude(), // 获取海拔数据
      timestamp: Date.now()
    };
    
    this.data.points.push(point);
    
    // 更新状态为采集中
    if (this.data.measureState === MEASURE_STATE.READY) {
      this.data.measureState = MEASURE_STATE.COLLECTING;
    }
    
    // 震动反馈
    if (this.data.vibrator) {
      this.data.vibrator.stop();
      this.data.vibrator.start();
      setTimeout(() => {
        if (this.data.vibrator) {
          this.data.vibrator.stop();
        }
      }, 100);
    }
    
    // 如果有3个或以上点，计算面积
    if (this.data.points.length >= 3) {
      this.calculateArea();
    }
    
    // 计算周长
    this.calculatePerimeter();
    
    logger.debug(`采集点${this.data.points.length}: ${point.lat}, ${point.lon}, 海拔: ${point.altitude}m`);
    this.updateUI();
  },
  
  // 撤销最后一个点
  undoPoint() {
    if (this.data.points.length === 0) {
      logger.warn("没有点可以撤销");
      return;
    }
    
    this.data.points.pop();
    
    // 如果没有点了，回到准备状态
    if (this.data.points.length === 0) {
      this.data.measureState = MEASURE_STATE.READY;
      this.data.currentArea = 0;
      this.data.currentPerimeter = 0;
    } else {
      // 重新计算面积和周长
      if (this.data.points.length >= 3) {
        this.calculateArea();
      } else {
        this.data.currentArea = 0;
      }
      this.calculatePerimeter();
    }
    
    logger.debug(`撤销点，剩余${this.data.points.length}个点`);
    this.updateUI();
  },

  // 计算多边形面积 (使用Shoelace公式)
  calculateArea() {
    if (this.data.points.length < 3) {
      this.data.currentArea = 0;
      return;
    }
    
    // 转换为平面坐标 (简化版，适用于小范围测量)
    const R = 6371000; // 地球半径(米)
    const points = this.data.points.map(p => {
      const lat = p.lat * Math.PI / 180;
      const lon = p.lon * Math.PI / 180;
      return {
        x: R * lon * Math.cos(lat),
        y: R * lat
      };
    });
    
    // Shoelace公式计算面积
    let area = 0;
    for (let i = 0; i < points.length; i++) {
      const j = (i + 1) % points.length;
      area += points[i].x * points[j].y;
      area -= points[j].x * points[i].y;
    }
    area = Math.abs(area) / 2;
    
    this.data.currentArea = area;
    logger.debug(`计算面积: ${area} 平方米`);
  },

  // 计算周长
  calculatePerimeter() {
    if (this.data.points.length < 2) {
      this.data.currentPerimeter = 0;
      return;
    }
    
    let perimeter = 0;
    const R = 6371000; // 地球半径(米)
    
    for (let i = 0; i < this.data.points.length; i++) {
      const j = (i + 1) % this.data.points.length;
      const p1 = this.data.points[i];
      const p2 = this.data.points[j];
      
      // 使用Haversine公式计算两点间距离
      const lat1 = p1.lat * Math.PI / 180;
      const lat2 = p2.lat * Math.PI / 180;
      const deltaLat = (p2.lat - p1.lat) * Math.PI / 180;
      const deltaLon = (p2.lon - p1.lon) * Math.PI / 180;
      
      const a = Math.sin(deltaLat / 2) * Math.sin(deltaLat / 2) +
                Math.cos(lat1) * Math.cos(lat2) *
                Math.sin(deltaLon / 2) * Math.sin(deltaLon / 2);
      const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
      const distance = R * c;
      
      perimeter += distance;
    }
    
    this.data.currentPerimeter = perimeter;
    logger.debug(`计算周长: ${perimeter} 米`);
  },

  // 完成地块 - 保存并自动开始下一个
  finishField() {
    // 如果正在自动采集，先停止
    if (this.data.isAutoCollecting) {
      this.stopAutoCollect();
    }

    if (this.data.points.length < 3) {
      logger.warn("点数不足3个，无法完成地块");
      // 显示提示
      if (this.data.widgets.statusTip) {
        this.data.widgets.statusTip.setProperty(prop.TEXT, getText('msg_points_insufficient'));
        this.data.widgets.statusTip.setProperty(prop.COLOR, 0xff3b30);
      }
      return;
    }
    
    // 保存当前地块
    this.saveField();
    
    // 显示完成提示
    const units = getAreaUnits();
    const areaInMu = (this.data.currentArea * units.MU.factor).toFixed(2);
    if (this.data.widgets.statusTip) {
      const savedText = getText('save') || '已保存';
      const unitText = getText('mu') || '亩';
      this.data.widgets.statusTip.setProperty(prop.TEXT, `${this.data.currentFieldName}${savedText} ${areaInMu}${unitText}`);
      this.data.widgets.statusTip.setProperty(prop.COLOR, 0x00ff88);
    }
    
    // 震动反馈（长震动表示完成）
    if (this.data.vibrator) {
      this.data.vibrator.stop();
      this.data.vibrator.start();
      setTimeout(() => {
        if (this.data.vibrator) {
          this.data.vibrator.stop();
          setTimeout(() => {
            this.data.vibrator.start();
            setTimeout(() => {
              if (this.data.vibrator) {
                this.data.vibrator.stop();
              }
            }, 100);
          }, 50);
        }
      }, 100);
    }
    
    logger.debug(`地块完成: ${this.data.currentFieldName}, 面积: ${areaInMu}${getText('mu')}`);
    
    // 1.5秒后自动开始下一个地块
    setTimeout(() => {
      this.data.todayFieldCount++;
      this.startNewField();
    }, 1500);
  },

  // 保存地块数据
  saveField() {
    try {
      // 计算海拔统计
      const elevation = calculateElevationStats(this.data.points);
      
      const units = getAreaUnits();
      const field = {
        id: Date.now().toString(),
        name: this.data.currentFieldName,
        timestamp: Date.now(),
        date: new Date().toISOString().split('T')[0], // YYYY-MM-DD
        points: this.data.points,
        pointCount: this.data.points.length,
        area: {
          squareMeters: this.data.currentArea,
          mu: this.data.currentArea * units.MU.factor,
          hectares: this.data.currentArea * units.HECTARE.factor
        },
        perimeter: this.data.currentPerimeter,
        accuracy: this.data.accuracy,
        elevation: elevation,  // 添加海拔统计
        status: 'completed'
      };
      
      // 验证数据完整性
      if (!this.data.points || this.data.points.length < 3) {
        logger.warn('点数不足，无法保存');
        return;
      }
      
      if (this.data.currentArea <= 0) {
        logger.warn('面积无效，无法保存');
        return;
      }
      
      // 获取现有记录
      let fields = [];
      try {
        const stored = localStorage.getItem('hamgis_measurements');
        if (stored) {
          fields = JSON.parse(stored);
          if (!Array.isArray(fields)) {
            logger.warn('数据格式无效，重置');
            fields = [];
          }
        }
      } catch (e) {
        logger.error(`读取历史记录失败: ${e}`);
        fields = [];
      }
      
      // 添加新地块
      fields.push(field);
      
      // 保存
      localStorage.setItem('hamgis_measurements', JSON.stringify(fields));
      
      logger.debug(`地块已保存: ${field.name}, 总记录: ${fields.length}, 海拔: ${elevation ? elevation.average + 'm' : getText('noData')}`);
    } catch (e) {
      logger.error(`保存地块失败: ${e}`);
    }
  },

  // 生成地块名称 - Field A, Field B, Field C...
  generateFieldName() {
    try {
      // 获取今天已完成的地块数
      const stored = localStorage.getItem('hamgis_measurements');
      let todayCount = 0;
      
      if (stored) {
        const fields = JSON.parse(stored);
        if (Array.isArray(fields)) {
          const today = new Date().toISOString().split('T')[0];
          todayCount = fields.filter(f => f.date === today).length;
        }
      }
      
      // 生成字母：A, B, C, ..., Z, AA, AB, ...
      const letter = this.numberToLetter(todayCount);
      return `${getText('field')}${letter}`;
    } catch (e) {
      logger.error(`生成地块名称失败: ${e}`);
      return `${getText('field')}${this.data.todayFieldCount + 1}`;
    }
  },
  
  // 数字转字母：0->A, 1->B, ..., 25->Z, 26->AA, 27->AB, ...
  numberToLetter(num) {
    let result = '';
    while (num >= 0) {
      result = String.fromCharCode(65 + (num % 26)) + result;
      num = Math.floor(num / 26) - 1;
      if (num < 0) break;
    }
    return result || 'A';
  },

  // 获取当前单位设置
  getCurrentUnit() {
    try {
      const stored = localStorage.getItem('hamgis_settings');
      if (stored) {
        const settings = JSON.parse(stored);
        let unit = settings.primaryUnit || 'mu';
        
        // 如果是旧的平方米设置，自动转换为亩
        if (unit === 'squareMeter') {
          unit = 'mu';
          // 更新设置
          settings.primaryUnit = 'mu';
          localStorage.setItem('hamgis_settings', JSON.stringify(settings));
          logger.debug('自动将平方米设置转换为亩');
        }
        
        logger.debug(`读取单位设置: ${JSON.stringify(settings)} -> ${unit}`);
        return unit;
      } else {
        logger.debug('未找到设置，使用默认单位: mu');
      }
    } catch (e) {
      logger.error(`读取单位设置失败: ${e}`);
    }
    return 'mu'; // 默认亩
  },

  // 加载所有设置
  loadSettings() {
    try {
      const stored = localStorage.getItem('hamgis_settings');
      if (stored) {
        const settings = JSON.parse(stored);
        return {
          primaryUnit: settings.primaryUnit || 'mu',
          vibrationFeedback: settings.vibrationFeedback !== false,
          autoSave: settings.autoSave !== false,
          keepScreenOn: settings.keepScreenOn !== false,
          autoCollect: settings.autoCollect || false,
          collectionInterval: settings.collectionInterval || 3
        };
      }
    } catch (e) {
      logger.error(`加载设置失败: ${e}`);
    }
    // 返回默认设置
    return {
      primaryUnit: 'mu',
      vibrationFeedback: true,
      autoSave: true,
      keepScreenOn: true, // 默认开启屏幕常亮
      autoCollect: false,
      collectionInterval: 3
    };
  },

  // 获取单位显示信息
  getUnitInfo(unitKey) {
    const units = getAreaUnits();
    // 只支持亩和公顷，如果是其他单位则默认为亩
    const unit = units[unitKey.toUpperCase()] || units.MU;
    logger.debug(`单位信息: ${unitKey} -> ${unit.name} (${unit.symbol})`);
    return unit;
  },

  // 获取GPS状态文本
  getGPSText() {
    switch (this.data.gpsStatus) {
      case 'locating':
        return TEXTS.locating;
      case 'ready':
        return getText('gpsReady') || 'GPS就绪';
      case 'weak':
        return TEXTS.weakSignal;
      case 'permission_denied':
        return getText('noPermission') || '无权限';
      case 'error':
        return getText('error') || '错误';
      default:
        return 'GPS';
    }
  },

  // 获取GPS状态颜色
  getGPSColor() {
    switch (this.data.gpsStatus) {
      case 'ready':
        return 0x00ff88;
      case 'locating':
        return 0xffaa00;
      case 'weak':
      case 'error':
      case 'permission_denied':
        return 0xff3b30;
      default:
        return 0xcccccc;
    }
  },

  // 获取测量状态文本
  getMeasureStatusText() {
    if (this.data.points.length === 0) {
      return `${getText('startMeasure')}: ${this.data.currentFieldName}`;
    } else if (this.data.points.length < 3) {
      const individualText = getText('individual') || '个点';
      const needPointsText = getText('atLeastNeedPoints') || '至少需要%d个点';
      return `${getText('addPoint')}${this.data.points.length}${individualText}，${needPointsText.replace('%d', '3')}`;
    } else {
      return `${getText('finishField')}`;
    }
  },

  // 更新UI显示
  updateUI() {
    // 更新GPS状态
    if (this.data.widgets.gpsStatus) {
      const statusText = this.getGPSText();
      const statusColor = this.getGPSColor();
      
      this.data.widgets.gpsStatus.setProperty(prop.TEXT, statusText);
      this.data.widgets.gpsStatus.setProperty(prop.COLOR, statusColor);
    }
    
    // 更新坐标显示
    if (this.data.widgets.coordinates) {
      const coordText = this.data.currentLat && this.data.currentLon
        ? `${this.data.currentLat.toFixed(5)}, ${this.data.currentLon.toFixed(5)}`
        : TEXTS.noGPS;
      this.data.widgets.coordinates.setProperty(prop.TEXT, coordText);
    }
    
    // 更新海拔显示
    if (this.data.widgets.altitudeDisplay) {
      if (this.data.currentAltitude !== null) {
        const altitudeText = `${getText('altitude')}: ${Math.round(this.data.currentAltitude)}m`;
        this.data.widgets.altitudeDisplay.setProperty(prop.TEXT, altitudeText);
        this.data.widgets.altitudeDisplay.setProperty(prop.COLOR, 0x88ccff);
      } else {
        this.data.widgets.altitudeDisplay.setProperty(prop.TEXT, `${getText('altitude')}: --`);
        this.data.widgets.altitudeDisplay.setProperty(prop.COLOR, 0x666666);
      }
    }
    
    // 更新地块名称
    if (this.data.widgets.fieldName) {
      const name = this.data.currentFieldName || TEXTS.unnamed;
      this.data.widgets.fieldName.setProperty(prop.TEXT, name);
    }
    
    // 更新点数 - 圆屏需要简化显示
    if (this.data.widgets.pointCount) {
      const deviceInfo = getDeviceInfo();
      const isRoundScreen = deviceInfo.width >= 480;
      const pointText = isRoundScreen ? `${this.data.points.length}` : `${TEXTS.points}: ${this.data.points.length}`;
      this.data.widgets.pointCount.setProperty(prop.TEXT, pointText);
    }
    
    // 更新周长 - 圆屏需要简化显示
    if (this.data.widgets.perimeterDisplay) {
      const perimeter = this.data.currentPerimeter > 0 
        ? `${this.data.currentPerimeter.toFixed(1)}m` 
        : '0.0m';
      // 圆屏显示简化版本
      const deviceInfo = getDeviceInfo();
      const isRoundScreen = deviceInfo.width >= 480;
      const perimeterText = isRoundScreen ? perimeter : `${TEXTS.perimeter}: ${perimeter}`;
      this.data.widgets.perimeterDisplay.setProperty(prop.TEXT, perimeterText);
    }
    
    // 更新面积显示 - 使用当前设置的单位
    if (this.data.widgets.areaDisplay) {
      const currentUnit = this.getCurrentUnit();
      const unitInfo = this.getUnitInfo(currentUnit);
      
      if (this.data.currentArea > 0) {
        const areaValue = (this.data.currentArea * unitInfo.factor).toFixed(2);
        const displayText = `${areaValue} ${unitInfo.symbol}`;
        this.data.widgets.areaDisplay.setProperty(prop.TEXT, displayText);
        logger.debug(`面积显示更新: 单位=${currentUnit}, 因子=${unitInfo.factor}, 符号=${unitInfo.symbol}, 原始=${this.data.currentArea}m² -> ${displayText}`);
      } else {
        this.data.widgets.areaDisplay.setProperty(prop.TEXT, `0.00 ${unitInfo.symbol}`);
      }
    }
    
    // 更新状态提示
    if (this.data.widgets.statusTip) {
      const statusText = this.getMeasureStatusText();
      this.data.widgets.statusTip.setProperty(prop.TEXT, statusText);
      // 根据状态设置颜色
      if (this.data.points.length >= 3) {
        this.data.widgets.statusTip.setProperty(prop.COLOR, 0x00ff88); // 绿色
      } else if (this.data.points.length > 0) {
        this.data.widgets.statusTip.setProperty(prop.COLOR, 0xffaa00); // 黄色
      } else {
        this.data.widgets.statusTip.setProperty(prop.COLOR, 0x888888); // 灰色
      }
    }
    
    // 更新按钮状态
    // 采集点按钮：GPS就绪时可用
    if (this.data.widgets.collectBtn) {
      const canCollect = this.data.gpsStatus === 'ready';
      this.data.widgets.collectBtn.setProperty(prop.MORE, {
        ...this.data.widgets.collectBtn.getProperty(prop.MORE),
        normal_color: canCollect ? 0x00aaff : 0x333333,
        press_color: canCollect ? 0x0066cc : 0x222222
      });
    }
    
    // 完成地块按钮：3点以上可用
    if (this.data.widgets.finishBtn) {
      const canFinish = this.data.points.length >= 3;
      try {
        this.data.widgets.finishBtn.setEnable(canFinish);
      } catch (e) {
        // 降级方案：通过颜色变化表示状态
        this.data.widgets.finishBtn.setProperty(prop.MORE, {
          ...this.data.widgets.finishBtn.getProperty(prop.MORE),
          normal_color: canFinish ? 0x30d158 : 0x333333,
          press_color: canFinish ? 0x2daf4d : 0x222222
        });
      }
    }
    
    // 撤销按钮：有点时可用
    if (this.data.widgets.undoBtn) {
      const canUndo = this.data.points.length > 0;
      try {
        this.data.widgets.undoBtn.setEnable(canUndo);
      } catch (e) {
        // 降级方案：通过颜色变化表示状态
        this.data.widgets.undoBtn.setProperty(prop.MORE, {
          ...this.data.widgets.undoBtn.getProperty(prop.MORE),
          normal_color: canUndo ? 0xff5e57 : 0x333333,
          press_color: canUndo ? 0xcc0000 : 0x222222
        });
      }
    }
  },

  onInit() {
    logger.debug("测量页面初始化");
    
    // 加载设置
    this.data.settings = this.loadSettings();
    
    // 设置屏幕常亮和息屏后重启 - 根据设置决定是否启用
    try {
      if (this.data.settings.keepScreenOn) {
        setPageBrightTime({ brightTime: 1200000 }); // 20分钟屏幕常亮（20 * 60 * 1000）
        setWakeUpRelaunch(true); // 息屏后自动重启应用，防止测量失效
        pauseDropWristScreenOff(); // 暂停抬腕息屏，保持屏幕常亮
        logger.debug("已启用屏幕常亮功能：20分钟");
      } else {
        logger.debug("屏幕常亮功能已关闭");
      }
    } catch (e) {
      logger.error(`设置屏幕常亮/息屏重启失败: ${e}`);
    }
    
    // 初始化震动器
    try {
      this.data.vibrator = new Vibrator();
    } catch (e) {
      logger.error(`初始化震动器失败: ${e}`);
      this.data.vibrator = null;
    }
    
    // 初始化气压计
    try {
      const success = barometerManager.init();
      if (success) {
        logger.info('气压计初始化成功');
        // 注册海拔变化监听
        barometerManager.onChange((altitude) => {
          this.data.currentAltitude = altitude;
          this.updateUI();
        });
        // 立即获取一次海拔
        this.data.currentAltitude = barometerManager.getAltitude();
      } else {
        logger.warn('气压计初始化失败，海拔数据不可用');
      }
    } catch (e) {
      logger.error(`初始化气压计失败: ${e}`);
    }
    
    // 计算今天已完成的地块数
    try {
      const stored = localStorage.getItem('hamgis_measurements');
      if (stored) {
        const fields = JSON.parse(stored);
        if (Array.isArray(fields)) {
          const today = new Date().toISOString().split('T')[0];
          this.data.todayFieldCount = fields.filter(f => f.date === today).length;
        }
      }
    } catch (e) {
      logger.error(`读取今日地块数失败: ${e}`);
      this.data.todayFieldCount = 0;
    }
    
    // 自动开始第一个地块
    this.startNewField();
    
    // 初始化GPS
    this.initGPS();
    
    // 设置定时器
    this.data.locationTimer = setInterval(() => {
      this.updateGPSLocation();
    }, 3000);
    
    this.data.uiUpdateTimer = setInterval(() => {
      this.updateUI();
    }, 1000);
    
    // 立即更新一次UI，确保单位显示正确
    setTimeout(() => {
      this.updateUI();
    }, 100);
    
    // 添加设置变化监听 - 每2秒检查一次设置是否变化
    this.data.lastSettingsCheck = JSON.stringify({
      unit: this.getCurrentUnit()
    });
    this.data.settingsCheckTimer = setInterval(() => {
      const currentSettings = JSON.stringify({
        unit: this.getCurrentUnit()
      });
      if (currentSettings !== this.data.lastSettingsCheck) {
        logger.debug('检测到设置变化，重新构建界面');
        this.data.lastSettingsCheck = currentSettings;
        // 重新构建界面
        this.onDestroy();
        this.onInit();
        this.build();
      }
    }, 2000);
  },

  build() {
    logger.debug("构建测量界面 - 根据设计文档优化布局");
    
    const deviceInfo = getDeviceInfo();
    const { width, height } = deviceInfo;
    
    // 检测屏幕类型：480px为圆屏，390px为方屏
    const isRoundScreen = width >= 480;
    
    // 背景 - 深色主题，适合户外使用
    createWidget(widget.FILL_RECT, {
      x: 0,
      y: 0,
      w: width,
      h: height,
      color: 0x0a0a0a
    });

    // ===== GPS状态栏 (顶部固定) =====
    // 设计文档：GPS状态栏 (信号强度、精度)
    const gpsBarHeight = px(50);
    
    // GPS状态栏背景 - 液态玻璃效果 (Material 3 Expressive Shape)
    createWidget(widget.FILL_RECT, {
      x: 0,
      y: 0,
      w: width,
      h: gpsBarHeight,
      color: 0x000000 // Keep background black for blend
    });
    
    createWidget(widget.FILL_RECT, {
      x: px(2),
      y: px(2),
      w: width - px(4),
      h: gpsBarHeight - px(4),
      radius: px(24), // Increased radius for Expressive look
      color: 0x1c1b1f // M3 Surface color
    });

    // GPS状态文本 (默认大字体)
    const gpsStatusFontSize = px(22);

    this.data.widgets.gpsStatus = createWidget(widget.TEXT, {
      x: 0,
      y: 0,
      w: width,
      h: gpsBarHeight,
      color: 0x00ff88,
      text_size: gpsStatusFontSize,
      align_h: align.CENTER_H,
      align_v: align.CENTER_V,
      text_style: text_style.BOLD,
      text: TEXTS.locating
    });

    // ===== 坐标显示区 =====
    const coordY = gpsBarHeight;
    const coordHeight = px(35);
    const coordFontSize = px(20); // 默认大字体
    
    this.data.widgets.coordinates = createWidget(widget.TEXT, {
      x: 0,
      y: coordY,
      w: width,
      h: coordHeight,
      color: 0x888888,
      text_size: coordFontSize,
      align_h: align.CENTER_H,
      align_v: align.CENTER_V,
      text: TEXTS.noGPS
    });

    // ===== 海拔显示区 =====
    const altitudeY = coordY + coordHeight;
    const altitudeHeight = px(25);
    const altitudeFontSize = px(18); // 默认大字体
    
    this.data.widgets.altitudeDisplay = createWidget(widget.TEXT, {
      x: 0,
      y: altitudeY,
      w: width,
      h: altitudeHeight,
      color: 0x88ccff,
      text_size: altitudeFontSize,
      align_h: align.CENTER_H,
      align_v: align.CENTER_V,
      text: `${getText('altitude')}: --`
    });

    // ===== 测量进度区 (中间主要区域) =====
    // 设计文档：点数、面积
    const progressY = altitudeY + altitudeHeight;
    const progressHeight = px(180);
    
    // 进度区域背景 - 多层玻璃效果 (Material 3 Expressive Card)
    createWidget(widget.FILL_RECT, {
      x: px(10),
      y: progressY,
      w: width - px(20),
      h: progressHeight,
      radius: px(32), // Large radius for Expressive Card
      color: 0x1c1b1f // M3 Surface
    });
    
    createWidget(widget.FILL_RECT, {
      x: px(12),
      y: progressY + px(2),
      w: width - px(24),
      h: progressHeight - px(4),
      radius: px(30),
      color: 0x25232a // Slightly lighter surface container
    });

    if (isRoundScreen) {
      // 圆屏优化布局：面积放大，信息同行
      
      // 面积显示 (默认大字模式)
      const areaFontSize = px(120);
      const areaY = progressY + px(5);
      const areaHeight = px(110);
      
      this.data.widgets.areaDisplay = createWidget(widget.TEXT, {
        x: 0,
        y: areaY,
        w: width,
        h: areaHeight,
        color: 0x80caff, // M3 Blue Accent
        text_size: areaFontSize,
        align_h: align.CENTER_H,
        align_v: align.CENTER_V,
        text_style: text_style.BOLD,
        text: `0.00 ${getText('mu')}`
      });

      // 地块名称、点数、周长 - 同一行显示 (默认大字模式)
      const infoRowY = progressY + px(120);
      const infoHeight = px(22);
      const infoFontSize = px(16);
      
      this.data.widgets.fieldName = createWidget(widget.TEXT, {
        x: px(40),
        y: infoRowY,
        w: px(60),
        h: infoHeight,
        color: 0x80caff, // M3 Blue Accent
        text_size: infoFontSize,
        align_h: align.CENTER_H,
        align_v: align.CENTER_V,
        text_style: text_style.BOLD,
        text: TEXTS.unnamed
      });

      this.data.widgets.pointCount = createWidget(widget.TEXT, {
        x: (width - px(60)) / 2,
        y: infoRowY,
        w: px(60),
        h: infoHeight,
        color: 0xcccccc,
        text_size: infoFontSize,
        align_h: align.CENTER_H,
        align_v: align.CENTER_V,
        text: `${TEXTS.points}: 0`
      });

      this.data.widgets.perimeterDisplay = createWidget(widget.TEXT, {
        x: width - px(100),
        y: infoRowY,
        w: px(60),
        h: infoHeight,
        color: 0x88ccff,
        text_size: infoFontSize,
        align_h: align.CENTER_H,
        align_v: align.CENTER_V,
        text: `${TEXTS.perimeter}: 0.0m`
      });
      
    } else {
      // 方屏优化布局 (默认大字模式)
      
      // 地块名称
      const fieldNameFontSize = px(18);
      const fieldNameHeight = px(25);
      
      this.data.widgets.fieldName = createWidget(widget.TEXT, {
        x: 0,
        y: progressY + px(5),
        w: width,
        h: fieldNameHeight,
        color: 0x80caff, // M3 Blue Accent
        text_size: fieldNameFontSize,
        align_h: align.CENTER_H,
        align_v: align.CENTER_V,
        text_style: text_style.BOLD,
        text: TEXTS.unnamed
      });

      // 点数显示
      const pointsFontSize = px(18);
      const pointsHeight = px(25);
      const pointsY = progressY + px(30);
      
      this.data.widgets.pointCount = createWidget(widget.TEXT, {
        x: 0,
        y: pointsY,
        w: width,
        h: pointsHeight,
        color: 0xcccccc,
        text_size: pointsFontSize,
        align_h: align.CENTER_H,
        align_v: align.CENTER_V,
        text: `${TEXTS.points}: 0`
      });

      // 面积显示
      const areaFontSize = px(72);
      const areaY = progressY + px(55);
      const areaHeight = px(80);
      
      this.data.widgets.areaDisplay = createWidget(widget.TEXT, {
        x: 0,
        y: areaY,
        w: width,
        h: areaHeight,
        color: 0x80caff, // M3 Blue Accent
        text_size: areaFontSize,
        align_h: align.CENTER_H,
        align_v: align.CENTER_V,
        text_style: text_style.BOLD,
        text: `0.00 ${getText('mu')}`
      });

      // 周长显示
      const perimeterY = progressY + px(140);
      const perimeterFontSize = px(18);
      const perimeterHeight = px(25);
      
      this.data.widgets.perimeterDisplay = createWidget(widget.TEXT, {
        x: 0,
        y: perimeterY,
        w: width,
        h: perimeterHeight,
        color: 0x88ccff,
        text_size: perimeterFontSize,
        align_h: align.CENTER_H,
        align_v: align.CENTER_V,
        text: `${TEXTS.perimeter}: 0.0m`
      });
    }

    // ===== 状态提示区 =====
    const statusY = progressY + progressHeight;
    const statusHeight = px(30);
    
    const statusFontSize = px(18); // 默认大字模式
    
    this.data.widgets.statusTip = createWidget(widget.TEXT, {
      x: 0,
      y: statusY,
      w: width,
      h: statusHeight,
      color: 0xffaa00,
      text_size: statusFontSize,
      align_h: align.CENTER_H,
      align_v: align.CENTER_V,
      text: ''
    });

    // ===== 操作按钮区 (底部固定) =====
    // 设计文档：采集点（大按钮）、撤销、完成地块
    const buttonAreaY = statusY + statusHeight;
    
    // 按钮间距和尺寸 - 根据屏幕类型调整
    const btnWidth = width - px(20);
    const btnHeight = px(60); // 统一按钮高度 (Increased for Material 3 Large Touch Target)
    const btnSpacing = px(10); // Increased spacing
    const btnStartY = buttonAreaY + px(5);

    // 采集点按钮 - 蓝色大按钮，始终可见 (Material 3 High Emphasis)
    createWidget(widget.FILL_RECT, {
      x: (width - btnWidth) / 2,
      y: btnStartY,
      w: btnWidth,
      h: btnHeight,
      radius: px(30), // Pill Shape (Height/2)
      color: 0x0986d4 // User specified Blue
    });
    
    // 使用闭包保存页面实例引用
    const pageInstance = this;
    
    const buttonFontSize = px(24); // 默认大字模式
    
    this.data.widgets.collectBtn = createWidget(widget.BUTTON, {
      x: (width - btnWidth) / 2 + px(2),
      y: btnStartY + px(2),
      w: btnWidth - px(4),
      h: btnHeight - px(4),
      radius: px(28),
      normal_color: this.data.settings.autoCollect && this.data.isAutoCollecting ? 0xb3261e : 0x0986d4,
      press_color: this.data.settings.autoCollect && this.data.isAutoCollecting ? 0x8c1d18 : 0x0061a4,
      text: this.data.settings.autoCollect 
            ? (this.data.isAutoCollecting ? (getText('stopCollect') || "停止采集") : (getText('startCollect') || "开始采集"))
            : (getText('addPoint') || "采集点"),
      text_size: buttonFontSize,
      color: 0xffffff,
      click_func: () => {
        try {
          if (pageInstance.data.settings.autoCollect) {
            if (pageInstance.data.isAutoCollecting) {
              pageInstance.stopAutoCollect();
            } else {
              pageInstance.startAutoCollect();
            }
          } else {
            pageInstance.collectPoint();
          }
        } catch (e) {
          logger.error(`采集点按钮点击失败: ${e}`);
        }
      }
    });

    // 第二行按钮容器 - 撤销和完成地块
    const secondRowY = btnStartY + btnHeight + btnSpacing;
    const secondBtnWidth = (btnWidth - px(10)) / 2;

    // 撤销按钮 (M3 Tonal Button - Unified Blue/Grey)
    createWidget(widget.FILL_RECT, {
      x: (width - btnWidth) / 2,
      y: secondRowY,
      w: secondBtnWidth,
      h: btnHeight,
      radius: px(30),
      color: 0x2b2d31 // Dark Surface Container
    });
    
    const smallButtonFontSize = px(20); // 默认大字模式
    
    this.data.widgets.undoBtn = createWidget(widget.BUTTON, {
      x: (width - btnWidth) / 2 + px(2),
      y: secondRowY + px(2),
      w: secondBtnWidth - px(4),
      h: btnHeight - px(4),
      radius: px(28),
      normal_color: 0x2b2d31, // M3 Surface Container
      press_color: 0x3e4248,
      text: getText('undo') || "撤销",
      text_size: smallButtonFontSize,
      color: 0x80caff, // Blue Text for Action
      click_func: () => {
        try {
          pageInstance.undoPoint();
        } catch (e) {
          logger.error(`撤销按钮点击失败: ${e}`);
        }
      }
    });

    // 完成地块按钮 (M3 Tonal Button - Unified Blue/Grey)
    createWidget(widget.FILL_RECT, {
      x: (width - btnWidth) / 2 + secondBtnWidth + px(10),
      y: secondRowY,
      w: secondBtnWidth,
      h: btnHeight,
      radius: px(30),
      color: 0x2b2d31 // Dark Surface Container
    });
    
    this.data.widgets.finishBtn = createWidget(widget.BUTTON, {
      x: (width - btnWidth) / 2 + secondBtnWidth + px(10) + px(2),
      y: secondRowY + px(2),
      w: secondBtnWidth - px(4),
      h: btnHeight - px(4),
      radius: px(28),
      normal_color: 0x2b2d31, // M3 Surface Container
      press_color: 0x3e4248,
      text: getText('finishField') || "完成地块",
      text_size: smallButtonFontSize,
      color: 0x80caff, // Blue Text for Action
      click_func: () => {
        try {
          pageInstance.finishField();
        } catch (e) {
          logger.error(`完成地块按钮点击失败: ${e}`);
        }
      }
    });

    if (isRoundScreen) {
      // 圆屏：历史和设置各占一行
      const thirdRowY = secondRowY + btnHeight + btnSpacing;
      const fourthRowY = thirdRowY + btnHeight + btnSpacing;
      
      const navButtonFontSize = px(18); // 默认大字模式
      
      // 历史按钮 - 独占一行
      createWidget(widget.FILL_RECT, {
        x: (width - btnWidth) / 2,
        y: thirdRowY,
        w: btnWidth,
        h: btnHeight,
        radius: px(19),
        color: 0x2b2d31 // Material 3 Surface Container (Dark Grey)
      });
      
      createWidget(widget.BUTTON, {
        x: (width - btnWidth) / 2 + px(2),
        y: thirdRowY + px(2),
        w: btnWidth - px(4),
        h: btnHeight - px(4),
        radius: px(17),
        normal_color: 0x2b2d31, // Material 3 Surface Container
        press_color: 0x3e4248,  // Slightly lighter on press
        text: TEXTS.history,
        text_size: navButtonFontSize,
        color: 0xffffff,
        click_func: () => {
          try {
            push({ url: "page/history/index.page" });
          } catch (e) {
            logger.error(`历史按钮点击失败: ${e}`);
          }
        }
      });

      // 设置按钮 - 独占一行
      createWidget(widget.FILL_RECT, {
        x: (width - btnWidth) / 2,
        y: fourthRowY,
        w: btnWidth,
        h: btnHeight,
        radius: px(19),
        color: 0x2b2d31 // Material 3 Surface Container
      });
      
      createWidget(widget.BUTTON, {
        x: (width - btnWidth) / 2 + px(2),
        y: fourthRowY + px(2),
        w: btnWidth - px(4),
        h: btnHeight - px(4),
        radius: px(17),
        normal_color: 0x2b2d31, // Material 3 Surface Container
        press_color: 0x3e4248,
        text: TEXTS.settings,
        text_size: navButtonFontSize,
        color: 0xffffff,
        click_func: () => {
          try {
            push({ url: "page/settings/index.page" });
          } catch (e) {
            logger.error(`设置按钮点击失败: ${e}`);
          }
        }
      });
      
      // 圆屏额外：在设置按钮下方增加空白区域，方便向上滑动
      const extraSpaceY = fourthRowY + btnHeight + px(20);
      createWidget(widget.FILL_RECT, {
        x: 0,
        y: extraSpaceY,
        w: width,
        h: px(80), // 额外80px空白
        color: 0x0a0a0a // 与背景同色
      });
    } else {
      // 方屏：历史和设置共用一行
      const thirdRowY = secondRowY + btnHeight + btnSpacing;
      
      const navButtonFontSize = px(18); // 默认大字模式
      
      // 历史按钮
      createWidget(widget.FILL_RECT, {
        x: (width - btnWidth) / 2,
        y: thirdRowY,
        w: secondBtnWidth,
        h: btnHeight,
        radius: px(19),
        color: 0x2b2d31 // Material 3 Surface Container
      });
      
      createWidget(widget.BUTTON, {
        x: (width - btnWidth) / 2 + px(2),
        y: thirdRowY + px(2),
        w: secondBtnWidth - px(4),
        h: btnHeight - px(4),
        radius: px(17),
        normal_color: 0x2b2d31,
        press_color: 0x3e4248,
        text: TEXTS.history,
        text_size: navButtonFontSize,
        color: 0xffffff,
        click_func: () => {
          try {
            push({ url: "page/history/index.page" });
          } catch (e) {
            logger.error(`历史按钮点击失败: ${e}`);
          }
        }
      });

      // 设置按钮
      createWidget(widget.FILL_RECT, {
        x: (width - btnWidth) / 2 + secondBtnWidth + px(10),
        y: thirdRowY,
        w: secondBtnWidth,
        h: btnHeight,
        radius: px(19),
        color: 0x2b2d31 // Material 3 Surface Container
      });
      
      createWidget(widget.BUTTON, {
        x: (width - btnWidth) / 2 + secondBtnWidth + px(10) + px(2),
        y: thirdRowY + px(2),
        w: secondBtnWidth - px(4),
        h: btnHeight - px(4),
        radius: px(17),
        normal_color: 0x2b2d31,
        press_color: 0x3e4248,
        text: TEXTS.settings,
        text_size: navButtonFontSize,
        color: 0xffffff,
        click_func: () => {
          try {
            push({ url: "page/settings/index.page" });
          } catch (e) {
            logger.error(`设置按钮点击失败: ${e}`);
          }
        }
      });
    }

    // 移除底部提示文字

    // 注册按键监听
    onKey({
      callback: (key, keyEvent) => {
        if (keyEvent === KEY_EVENT_CLICK) {
          if (key === KEY_SHORTCUT || key === KEY_BACK) {
            // 如果是手动采集模式，则将按键作为采集触发
            if (!this.data.settings.autoCollect) {
              logger.debug(`按键触发采集: ${key}`);
              this.collectPoint();
              return true; // 拦截按键事件
            }
          }
        }
        return false;
      }
    });
  },

  onDestroy() {
    logger.debug("测量页面销毁");
    
    // 停止自动采集
    this.stopAutoCollect();
    
    // 恢复抬腕息屏功能
    try {
      resumeDropWristScreenOff();
      logger.debug("已恢复抬腕息屏功能");
    } catch (e) {
      logger.error(`恢复抬腕息屏失败: ${e}`);
    }
    
    // 清除定时器
    if (this.data.locationTimer) {
      clearInterval(this.data.locationTimer);
    }
    if (this.data.uiUpdateTimer) {
      clearInterval(this.data.uiUpdateTimer);
    }
    if (this.data.settingsCheckTimer) {
      clearInterval(this.data.settingsCheckTimer);
    }
    
    // 停止GPS
    if (this.data.geolocation) {
      try {
        if (this.data.locationCallback) {
          this.data.geolocation.offChange(this.data.locationCallback);
        }
        this.data.geolocation.stop();
      } catch (e) {
        logger.error(`停止GPS失败: ${e}`);
      }
    }
    
    // 销毁气压计
    try {
      barometerManager.destroy();
      logger.info('气压计已销毁');
    } catch (e) {
      logger.error(`销毁气压计失败: ${e}`);
    }
    
    // 停止震动
    if (this.data.vibrator) {
      try {
        this.data.vibrator.stop();
      } catch (e) {
        logger.error(`停止震动失败: ${e}`);
      }
    }
  }
});
