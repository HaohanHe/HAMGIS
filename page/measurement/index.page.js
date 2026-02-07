import { log, px } from "@zos/utils";
import { createWidget, widget, align, prop, text_style, setStatusBarVisible } from '@zos/ui';

import { getDeviceInfo } from "@zos/device";
import { Geolocation } from "@zos/sensor";
import { Vibrator } from "@zos/sensor";
import { localStorage } from '@zos/storage';
import { push, exit } from '@zos/router';
import { getText } from '@zos/i18n';
import { onKey, KEY_HOME, KEY_SELECT, KEY_SHORTCUT, KEY_BACK, KEY_EVENT_CLICK } from '@zos/interaction';
import { getSystemMode } from '@zos/settings';
import { barometerManager } from '../../utils/barometer.js';
import { calculateElevationStats } from '../../utils/elevation.js';

const logger = log.getLogger("hamgis-measurement");

// 测量状态 - 简化为两个状态
const MEASURE_STATE = {
  READY: 'ready',         // 准备采集（GPS就绪）
  COLLECTING: 'collecting' // 采集中（已有点位）
};

// WGS84 椭球体参数 - 用于精确地理计算
const WGS84 = {
  a: 6378137.0,           // 长半轴 (米)
  b: 6356752.314245,      // 短半轴 (米)
  f: 1 / 298.257223563,   // 扁率
  e2: 0.00669437999013,   // 第一偏心率平方
  e2_: 0.00673949674227   // 第二偏心率平方
};

// 基于 WGS84 椭球体的精确地理计算工具
const GeoCalculator = {
  // 将角度转换为弧度
  toRad(deg) {
    return deg * Math.PI / 180;
  },
  
  // 将弧度转换为角度
  toDeg(rad) {
    return rad * 180 / Math.PI;
  },
  
  // 计算子午线曲率半径
  meridianRadius(lat) {
    const latRad = this.toRad(lat);
    const sinLat = Math.sin(latRad);
    const w = Math.sqrt(1 - WGS84.e2 * sinLat * sinLat);
    return WGS84.a * (1 - WGS84.e2) / (w * w * w);
  },
  
  // 计算卯酉圈曲率半径
  primeVerticalRadius(lat) {
    const latRad = this.toRad(lat);
    const sinLat = Math.sin(latRad);
    const w = Math.sqrt(1 - WGS84.e2 * sinLat * sinLat);
    return WGS84.a / w;
  },
  
  // 使用 Vincenty 公式计算两点间的精确大地线距离
  // 这是目前最精确的椭球体距离计算方法
  vincentyDistance(p1, p2) {
    const lat1 = this.toRad(p1.lat);
    const lon1 = this.toRad(p1.lon);
    const lat2 = this.toRad(p2.lat);
    const lon2 = this.toRad(p2.lon);
    
    const U1 = Math.atan((1 - WGS84.f) * Math.tan(lat1));
    const U2 = Math.atan((1 - WGS84.f) * Math.tan(lat2));
    const L = lon2 - lon1;
    
    let lambda = L;
    let lambdaPrev;
    let iterLimit = 100;
    let sinSigma, cosSigma, sigma, sinAlpha, cos2Alpha, cos2SigmaM;
    
    do {
      sinSigma = Math.sqrt(
        Math.pow(Math.cos(U2) * Math.sin(lambda), 2) +
        Math.pow(Math.cos(U1) * Math.sin(U2) - Math.sin(U1) * Math.cos(U2) * Math.cos(lambda), 2)
      );
      
      if (sinSigma === 0) return 0; // 重合点
      
      cosSigma = Math.sin(U1) * Math.sin(U2) + Math.cos(U1) * Math.cos(U2) * Math.cos(lambda);
      sigma = Math.atan2(sinSigma, cosSigma);
      
      sinAlpha = Math.cos(U1) * Math.cos(U2) * Math.sin(lambda) / sinSigma;
      cos2Alpha = 1 - sinAlpha * sinAlpha;
      
      if (cos2Alpha !== 0) {
        cos2SigmaM = cosSigma - 2 * Math.sin(U1) * Math.sin(U2) / cos2Alpha;
      } else {
        cos2SigmaM = 0;
      }
      
      const C = WGS84.f / 16 * cos2Alpha * (4 + WGS84.f * (4 - 3 * cos2Alpha));
      
      lambdaPrev = lambda;
      lambda = L + (1 - C) * WGS84.f * sinAlpha * (
        sigma + C * sinSigma * (cos2SigmaM + C * cosSigma * (-1 + 2 * cos2SigmaM * cos2SigmaM))
      );
    } while (Math.abs(lambda - lambdaPrev) > 1e-12 && --iterLimit > 0);
    
    if (iterLimit === 0) {
      // Vincenty 不收敛，使用 Haversine 作为后备
      return this.haversineDistance(p1, p2);
    }
    
    const u2 = cos2Alpha * (WGS84.a * WGS84.a - WGS84.b * WGS84.b) / (WGS84.b * WGS84.b);
    const A = 1 + u2 / 16384 * (4096 + u2 * (-768 + u2 * (320 - 175 * u2)));
    const B = u2 / 1024 * (256 + u2 * (-128 + u2 * (74 - 47 * u2)));
    
    const deltaSigma = B * sinSigma * (cos2SigmaM + B / 4 * (
      cosSigma * (-1 + 2 * cos2SigmaM * cos2SigmaM) -
      B / 6 * cos2SigmaM * (-3 + 4 * sinSigma * sinSigma) * (-3 + 4 * cos2SigmaM * cos2SigmaM)
    ));
    
    return WGS84.b * A * (sigma - deltaSigma);
  },
  
  // Haversine 公式（作为后备方法）
  haversineDistance(p1, p2) {
    const R = 6371000; // 平均地球半径
    const lat1 = this.toRad(p1.lat);
    const lat2 = this.toRad(p2.lat);
    const deltaLat = this.toRad(p2.lat - p1.lat);
    const deltaLon = this.toRad(p2.lon - p1.lon);
    
    const a = Math.sin(deltaLat / 2) * Math.sin(deltaLat / 2) +
              Math.cos(lat1) * Math.cos(lat2) *
              Math.sin(deltaLon / 2) * Math.sin(deltaLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    
    return R * c;
  },
  
  // 基于 Gauss-Legendre 积分的精确多边形面积计算
  // 使用椭球体上的测地多边形面积公式
  geodesicPolygonArea(points) {
    if (points.length < 3) return 0;
    
    // 使用 L'Huilier 定理的球面 excess 方法
    // 对于小范围测量，使用局部平面近似配合精确距离
    
    let totalArea = 0;
    const n = points.length;
    
    // 计算多边形的质心作为参考点
    let centerLat = 0, centerLon = 0;
    for (const p of points) {
      centerLat += p.lat;
      centerLon += p.lon;
    }
    centerLat /= n;
    centerLon /= n;
    
    // 获取参考点的曲率半径
    const Rm = this.meridianRadius(centerLat);
    const Rn = this.primeVerticalRadius(centerLat);
    
    // 将经纬度转换为局部平面坐标（使用椭球体参数）
    const localPoints = points.map(p => {
      const dLat = this.toRad(p.lat - centerLat);
      const dLon = this.toRad(p.lon - centerLon);
      return {
        x: Rn * Math.cos(this.toRad(centerLat)) * dLon,
        y: Rm * dLat
      };
    });
    
    // 使用 Shoelace 公式计算面积
    let area = 0;
    for (let i = 0; i < n; i++) {
      const j = (i + 1) % n;
      area += localPoints[i].x * localPoints[j].y;
      area -= localPoints[j].x * localPoints[i].y;
    }
    
    return Math.abs(area) / 2;
  },
  
  // 使用测地线三角形分解计算面积（更精确但计算量大）
  triangulatedGeodesicArea(points) {
    if (points.length < 3) return 0;
    
    let totalArea = 0;
    const n = points.length;
    
    // 使用第一个点作为参考，将多边形分解为三角形
    const p0 = points[0];
    
    for (let i = 1; i < n - 1; i++) {
      const p1 = points[i];
      const p2 = points[i + 1];
      
      // 计算三角形的三条边长（使用 Vincenty 公式）
      const a = this.vincentyDistance(p1, p2);
      const b = this.vincentyDistance(p0, p2);
      const c = this.vincentyDistance(p0, p1);
      
      // 使用海伦公式计算三角形面积
      const s = (a + b + c) / 2;
      const triangleArea = Math.sqrt(s * (s - a) * (s - b) * (s - c));
      
      totalArea += triangleArea;
    }
    
    return totalArea;
  }
};

// 面积单位转换 - 使用动态国际化
const getAreaUnits = () => ({
  MU: {
    name: getText('mu') || 'Mu',
    symbol: getText('mu') || 'mu',
    factor: 0.0015  // 1平方米 = 0.0015亩
  },
  HECTARE: {
    name: getText('hectare') || 'Hectare',
    symbol: getText('hectare') || 'ha',
    factor: 0.0001  // 1平方米 = 0.0001公顷
  },
  ACRE: {
    name: getText('acre') || 'Acre',
    symbol: getText('acre') || 'ac',
    factor: 0.000247105  // 1平方米 = 0.000247105英亩
  },
  SQUARE_MILE: {
    name: getText('squareMile') || 'Square Mile',
    symbol: getText('squareMile') || 'mi²',
    factor: 3.861e-7  // 1平方米 = 3.861e-7平方英里
  }
});

// 文本映射 - 使用国际化
const TEXTS = {
  get locating() { return getText('locating') || 'Locating...'; },
  get accuracy() { return getText('accuracy') || 'Accuracy'; },
  get weakSignal() { return getText('weakSignal') || 'Weak Signal'; },
  get points() { return getText('points') || 'Points'; },
  get area() { return getText('area') || 'Area'; },
  get perimeter() { return getText('perimeter') || 'Perimeter'; },
  get history() { return getText('history') || 'History'; },
  get settings() { return getText('settings') || 'Settings'; },
  get noGPS() { return getText('noGPS') || 'Waiting...'; },
  get unnamed() { return getText('unnamed') || 'Unnamed'; }
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
    firstFixDuration: null,
    
    // 海拔数据
    currentAltitude: null,  // 当前海拔
    
    // 测量数据
    measureState: MEASURE_STATE.READY,
    points: [],  // 采集的坐标点 [{lat, lon, altitude, timestamp}]
    currentArea: 0,  // 当前面积(平方米)
    currentPerimeter: 0,  // 当前周长(米)
    currentFieldName: '',  // 当前地块名称（地块A、地块B...）
    todayFieldCount: 0,    // 今天已完成的地块数
    
    // GIS采集模式数据
    currentFeatureType: 'polygon',  // GIS模式当前要素类型 ('point'|'line'|'polygon')
    gisFeatures: [],                // GIS模式已采集要素列表
    gisProjectName: '',             // GIS模式项目名称
    gisFeatureIndex: 0,             // GIS模式当前要素序号
    
    // UI组件
    widgets: {},
    vibrator: null,
    
    // 定时器
    locationTimer: null,
    uiUpdateTimer: null,
    
    // 自动采集
    isAutoCollecting: false,
    autoCollectTimer: null,
    settings: {},
    
    // 缓存单位信息，避免频繁读取localStorage
    cachedUnit: null,
    cachedUnitInfo: null,
    
    // Widget属性值缓存，避免频繁的getProperty和setProperty调用
    widgetPropertyCache: {},
    
    // GPS回调函数引用，用于清理
    enableChangeCallback: null,
    
    // GPS状态追踪
    lastGPSStatus: null,
    isDualBand: false
  },

  // 安全的setProperty包装函数，增强widget存在性检查和错误处理
  safeSetProperty(widgetObj, property, value) {
    try {
      if (!widgetObj) {
        return false;
      }
      
      // 对于 prop.MORE 对象，检查长度是否超过限制
      if (property === prop.MORE && typeof value === 'object') {
        const valueStr = JSON.stringify(value);
        if (valueStr.length > 50) {
          logger.warn(`prop.MORE object length exceeds limit: ${valueStr.length}`);
          return false;
        }
      }
      
      // 更新widget属性
      widgetObj.setProperty(property, value);
      
      return true;
    } catch (e) {
      logger.warn(`setProperty failed: ${property} = ${value}, error: ${e}`);
      return false;
    }
  },

  // 安全的getProperty包装函数，增强widget存在性检查和错误处理
  safeGetProperty(widgetObj, property, defaultValue) {
    try {
      if (!widgetObj) {
        return defaultValue;
      }
      
      // 创建widget的唯一标识符
      const widgetId = widgetObj.toString();
      const cacheKey = `${widgetId}_${property}`;
      
      // 检查缓存
      if (this.data.widgetPropertyCache[cacheKey] !== undefined) {
        return this.data.widgetPropertyCache[cacheKey];
      }
      
      // 获取属性值
      const value = widgetObj.getProperty(property);
      
      // 更新缓存
      this.data.widgetPropertyCache[cacheKey] = value;
      
      return value;
    } catch (e) {
      logger.warn(`getProperty failed: ${property}, error: ${e}`);
      return defaultValue;
    }
  },

  // 清除widget属性缓存
  clearWidgetPropertyCache(widgetObj, property) {
    if (!widgetObj) {
      return;
    }
    
    const widgetId = widgetObj.toString();
    
    if (property) {
      // 清除特定属性的缓存
      const cacheKey = `${widgetId}_${property}`;
      delete this.data.widgetPropertyCache[cacheKey];
    } else {
      // 清除该widget的所有缓存
      Object.keys(this.data.widgetPropertyCache).forEach(key => {
        if (key.startsWith(widgetId)) {
          delete this.data.widgetPropertyCache[key];
        }
      });
    }
  },

  // 获取应用模式 - 使用缓存的设置，避免重复读取 localStorage
  getAppMode() {
    // 优先使用 data 中已加载的设置
    if (this.data.settings && typeof this.data.settings.appMode !== 'undefined') {
      return this.data.settings.appMode;
    }
    // 回退到从 localStorage 读取
    const settings = this.loadSettings();
    return settings.appMode || 0;
  },

  // 判断是否为GIS采集模式
  isGISMode() {
    return this.getAppMode() === 1;
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
          logger.warn('GPS permission denied, please enable location permission in settings');
          return;
        }
      }
      
      this.data.locationCallback = (event) => {
        this.updateGPSLocation(event);
      };
      
      this.data.geolocation.start();
      this.data.geolocation.onChange(this.data.locationCallback);
      this.data.locateStartTime = Date.now();
      this.data.firstFixDuration = null;
      
      // 监听权限变化 (API_LEVEL 4.0+)
      if (typeof this.data.geolocation.onEnableChange === 'function') {
        this.data.enableChangeCallback = () => {
          if (this.data.geolocation.getEnabled()) {
            this.data.geolocation.start();
            this.data.gpsStatus = 'locating';
            logger.log('GPS permission enabled, starting location');
          } else {
            this.data.geolocation.stop();
            this.data.gpsStatus = 'permission_denied';
            logger.warn('GPS permission disabled');
          }
          // 只在GPS状态变化时更新UI，避免频繁调用
          if (this.data.lastGPSStatus !== this.data.gpsStatus) {
            this.data.lastGPSStatus = this.data.gpsStatus;
            this.updateUI();
          }
        };
        this.data.geolocation.onEnableChange(this.data.enableChangeCallback);
      }
      
      // 减少日志输出
    } catch (e) {
      logger.error(`GPS initialization failed: ${e}`);
      this.data.gpsStatus = 'error';
    }
  },

  // 更新GPS位置
  updateGPSLocation(event) {
    try {
      if (!this.data.geolocation) return;
      
      // 检测双频支持 (L1+L5)
      if (event && event.satellite_data) {
        let isDualBand = false;
        if (Array.isArray(event.satellite_data)) {
            event.satellite_data.forEach(system => {
                if (system.is_dualband === 1) isDualBand = true;
            });
        }
        this.data.isDualBand = isDualBand;
      }

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
          // 动态精度: 双频(L1+L5)为1米，否则为5米
          this.data.accuracy = this.data.isDualBand ? 1 : 5;
          
          if (this.data.firstFixDuration === null) {
            this.data.firstFixDuration = Date.now() - this.data.locateStartTime;
            logger.debug(`First fix duration: ${this.data.firstFixDuration}ms`);
          }

          // 减少日志输出，避免性能问题
        } else {
          logger.warn(`Invalid coordinate data: lat=${latitude}, lon=${longitude}`);
          this.data.gpsStatus = 'error';
        }
      } else {
        if (locateDuration >= 15000) {
          this.data.gpsStatus = 'weak';
        } else {
          this.data.gpsStatus = 'locating';
        }
      }
      
      // 只在GPS状态变化时更新UI，避免频繁调用
      if (this.data.lastGPSStatus !== this.data.gpsStatus) {
        this.data.lastGPSStatus = this.data.gpsStatus;
        this.updateUI();
      }
    } catch (e) {
      logger.error(`Failed to update GPS location: ${e}`);
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

    // 减少日志输出
    this.updateUI();
  },

  // 开始自动采集
  startAutoCollect() {
    if (this.data.isAutoCollecting) return;
    
    this.data.isAutoCollecting = true;
    
    // 按钮文本更新已移除，避免prop.MORE长度限制问题
    
    // 立即采集一次
    this.collectPoint();
    
    // 启动定时器
    const interval = (this.data.settings.collectionInterval || 3) * 1000;
    this.data.autoCollectTimer = setInterval(() => {
      this.collectPoint();
    }, interval);
    
    // 减少日志输出
  },
  
  // 停止自动采集
  stopAutoCollect() {
    if (!this.data.isAutoCollecting) return;
    
    this.data.isAutoCollecting = false;
    
    if (this.data.autoCollectTimer) {
      clearInterval(this.data.autoCollectTimer);
      this.data.autoCollectTimer = null;
    }
    
    // 按钮文本更新已移除，避免prop.MORE长度限制问题
    
    // 减少日志输出
  },

  // 采集点 - 简化逻辑，直接采集
  collectPoint() {
    if (this.data.gpsStatus !== 'ready') {
      logger.warn("GPS not ready, cannot collect point");
      // 显示提示
      if (this.data.widgets.statusTip) {
        const weakSignalText = getText('weakSignal') || 'Weak Signal';
      const moveOpenText = getText('moveToOpenArea') || 'Move to open area';
      this.safeSetProperty(this.data.widgets.statusTip, prop.TEXT, `${weakSignalText}, ${moveOpenText}`);
      this.safeSetProperty(this.data.widgets.statusTip, prop.COLOR, 0xff3b30);
      }
      return;
    }
    
    // 点模式：每次采集都是独立的，或者是集合中的一个点
    // 这里我们保持统一逻辑：一个“项目”包含多个点
    // 点模式：不计算面积周长
    // 线模式：计算长度（周长），不计算面积
    // 面模式：计算面积和周长
    
    if (!this.data.currentLat || !this.data.currentLon) {
      logger.warn("GPS position invalid, cannot collect point");
      return;
    }
    
    const point = {
      lat: this.data.currentLat,
      lon: this.data.currentLon,
      altitude: barometerManager.getAltitude(), // 获取海拔数据
      timestamp: Date.now()
    };
    
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
    
    if (this.isGISMode()) {
      // GIS采集模式
      const featureType = this.data.currentFeatureType;
      
      if (featureType === 'point') {
        // 点要素：立即保存到 gisFeatures
        this.data.gisFeatureIndex++;
        const pointFeature = {
          featureId: `f${Date.now()}`,
          featureType: 'point',
          featureName: `${getText('pointFeature') || 'Point Feature'}${this.data.gisFeatureIndex}`,
          coords: point,
          properties: {
            accuracy: this.data.accuracy,
            positioningMode: this.data.isDualBand ? 'dual-band' : 'single-band'
          }
        };
        this.data.gisFeatures.push(pointFeature);
        
        // 显示提示
        if (this.data.widgets.statusTip) {
          this.safeSetProperty(this.data.widgets.statusTip, prop.TEXT, `${getText('featureSaved') || 'Feature Saved'}: ${pointFeature.featureName}`);
          this.safeSetProperty(this.data.widgets.statusTip, prop.COLOR, 0x00ff88);
        }
        
        logger.debug(`GIS point feature saved: ${pointFeature.featureName}`);
      } else {
        // 线/面要素：添加到临时 points 数组
        this.data.points.push(point);
        
        // 更新状态为采集中
        if (this.data.measureState === MEASURE_STATE.READY) {
          this.data.measureState = MEASURE_STATE.COLLECTING;
        }
        
        // 计算周长/长度 (线和面都需要)
        if (this.data.points.length >= 2) {
          this.calculatePerimeter();
        }
        
        // 面要素计算面积
        if (featureType === 'polygon' && this.data.points.length >= 3) {
          this.calculateArea();
        }
        
        logger.debug(`GIS ${featureType} feature collected point ${this.data.points.length}: ${point.lat}, ${point.lon}`);
      }
    } else {
      // 测面积模式（保持原有逻辑）
      this.data.points.push(point);
      
      // 更新状态为采集中
      if (this.data.measureState === MEASURE_STATE.READY) {
        this.data.measureState = MEASURE_STATE.COLLECTING;
      }
      
      // 如果有3个或以上点，计算面积
      if (this.data.points.length >= 3) {
        this.calculateArea();
      }
      
      // 计算周长
      if (this.data.points.length >= 2) {
        this.calculatePerimeter();
      }
      
      logger.debug(`Collected point ${this.data.points.length}: ${point.lat}, ${point.lon}, altitude: ${point.altitude}m`);
    }
    
    this.updateUI();
  },
  
  // 撤销最后一个点
  undoPoint() {
    if (this.data.points.length === 0) {
      logger.warn("No points to undo");
      return;
    }
    
    this.data.points.pop();
    
    // 如果没有点了，回到准备状态
    if (this.data.points.length === 0) {
      this.data.measureState = MEASURE_STATE.READY;
      this.data.currentArea = 0;
      this.data.currentPerimeter = 0;
    } else {
      if (this.isGISMode()) {
        // GIS模式：根据当前要素类型计算
        const featureType = this.data.currentFeatureType;
        if (featureType === 'polygon' && this.data.points.length >= 3) {
          this.calculateArea();
        } else {
          this.data.currentArea = 0;
        }
        if (this.data.points.length >= 2) {
          this.calculatePerimeter();
        } else {
          this.data.currentPerimeter = 0;
        }
      } else {
        // 测面积模式：重新计算面积和周长
        if (this.data.points.length >= 3) {
          this.calculateArea();
        } else {
          this.data.currentArea = 0;
        }
        if (this.data.points.length >= 2) {
          this.calculatePerimeter();
        } else {
          this.data.currentPerimeter = 0;
        }
      }
    }
    
    logger.debug(`Undo point, remaining ${this.data.points.length} points`);
    this.updateUI();
  },

  // 计算多边形面积 (使用Shoelace公式)
  calculateArea() {
    if (this.data.points.length < 3) {
      this.data.currentArea = 0;
      return;
    }
    
    // 使用基于 WGS84 椭球体的精确面积计算
    // 对于小范围测量（<100km），使用 geodesicPolygonArea 方法
    // 对于大范围测量，使用 triangulatedGeodesicArea 方法
    
    const points = this.data.points.map(p => ({ lat: p.lat, lon: p.lon }));
    
    // 估算测量范围（对角线距离）
    let maxDistance = 0;
    for (let i = 0; i < points.length; i++) {
      for (let j = i + 1; j < points.length; j++) {
        const d = GeoCalculator.vincentyDistance(points[i], points[j]);
        if (d > maxDistance) maxDistance = d;
      }
    }
    
    // 根据测量范围选择计算方法
    let area;
    if (maxDistance > 100000) {
      // 大范围测量（>100km），使用三角形分解法
      area = GeoCalculator.triangulatedGeodesicArea(points);
      logger.debug(`Large area measurement, using triangulation method: ${area} sq meters`);
    } else {
      // 小范围测量，使用局部平面近似法（更快）
      area = GeoCalculator.geodesicPolygonArea(points);
      logger.debug(`Small area measurement, using geodesic polygon method: ${area} sq meters`);
    }
    
    this.data.currentArea = area;
  },

  // 计算周长 (线模式时即为长度，不闭合)
  calculatePerimeter() {
    if (this.data.points.length < 2) {
      this.data.currentPerimeter = 0;
      return;
    }
    
    let perimeter = 0;
    const mode = this.data.settings.collectionMode;
    const isPolygon = (mode === 2); // 只有面模式闭合
    
    // 线模式：计算所有线段长度之和
    // 面模式：计算多边形周长（包括最后一点到起点的距离）
    
    const count = this.data.points.length;
    // 如果是线模式，只计算 N-1 段
    // 如果是面模式，计算 N 段（闭合）
    const segments = isPolygon ? count : (count - 1);
    
    for (let i = 0; i < segments; i++) {
      const j = (i + 1) % count;
      const p1 = this.data.points[i];
      const p2 = this.data.points[j];
      
      // 使用 Vincenty 公式计算两点间的精确大地线距离
      const distance = GeoCalculator.vincentyDistance(
        { lat: p1.lat, lon: p1.lon },
        { lat: p2.lat, lon: p2.lon }
      );
      
      perimeter += distance;
    }
    
    this.data.currentPerimeter = perimeter;
    logger.debug(`Calculated perimeter/length: ${perimeter} meters (mode: ${mode}, using Vincenty formula)`);
  },

  // 完成地块/要素 - 保存并自动开始下一个
  finishField() {
    // 如果正在自动采集，先停止
    if (this.data.isAutoCollecting) {
      this.stopAutoCollect();
    }

    if (this.isGISMode()) {
      // GIS模式：完成当前要素
      this.finishGISFeature();
      return;
    }

    // 测面积模式（保持原有逻辑）
    if (this.data.points.length < 3) {
      logger.warn(`Not enough points (need 3), cannot finish field`);
      // 显示提示
      if (this.data.widgets.statusTip) {
        const msg = getText('atLeastNeedPoints') || 'At least %d points needed';
        this.safeSetProperty(this.data.widgets.statusTip, prop.TEXT, msg.replace('%d', '3'));
        this.safeSetProperty(this.data.widgets.statusTip, prop.COLOR, 0xff3b30);
      }
      return;
    }
    
    // 保存当前地块
    this.saveField();
    
    // 显示完成提示
    if (this.data.widgets.statusTip) {
      const savedText = getText('save') || 'Saved';
      const units = getAreaUnits();
      const areaInMu = (this.data.currentArea * units.MU.factor).toFixed(2);
      const unitText = getText('mu') || 'mu';
      const infoText = ` ${areaInMu}${unitText}`;
      
      this.safeSetProperty(this.data.widgets.statusTip, prop.TEXT, `${this.data.currentFieldName}${savedText}${infoText}`);
      this.safeSetProperty(this.data.widgets.statusTip, prop.COLOR, 0x00ff88);
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
    
    logger.debug(`Field completed: ${this.data.currentFieldName}, area: ${this.data.currentArea.toFixed(2)} sq meters`);
    
    // 1.5秒后自动开始下一个地块
    setTimeout(() => {
      this.data.todayFieldCount++;
      this.startNewField();
    }, 1500);
  },

  // GIS模式：完成当前要素
  finishGISFeature() {
    const featureType = this.data.currentFeatureType;
    let minPoints = 1;
    if (featureType === 'line') minPoints = 2;
    if (featureType === 'polygon') minPoints = 3;

    // 点要素在采集时就已保存，这里只处理线/面
    if (featureType === 'point') {
      if (this.data.widgets.statusTip) {
        this.safeSetProperty(this.data.widgets.statusTip, prop.TEXT, getText('pointFeature') || 'Point feature auto-saved');
        this.safeSetProperty(this.data.widgets.statusTip, prop.COLOR, 0x00ff88);
      }
      return;
    }

    if (this.data.points.length < minPoints) {
      logger.warn(`Not enough points (need ${minPoints}), cannot finish feature`);
      if (this.data.widgets.statusTip) {
        const msg = getText('atLeastNeedPoints') || 'At least %d points needed';
        this.safeSetProperty(this.data.widgets.statusTip, prop.TEXT, msg.replace('%d', minPoints));
        this.safeSetProperty(this.data.widgets.statusTip, prop.COLOR, 0xff3b30);
      }
      return;
    }

    // 构建要素对象
    this.data.gisFeatureIndex++;
    const featureNameKey = featureType === 'line' ? 'lineFeature' : 'polygonFeature';
    const fallbackName = featureType === 'line' 
      ? (getText('lineFeature') || 'Line Feature') 
      : (getText('polygonFeature') || 'Polygon Feature');
    const featureName = `${getText(featureNameKey) || fallbackName}${this.data.gisFeatureIndex}`;
    
    const feature = {
      featureId: `f${Date.now()}`,
      featureType: featureType,
      featureName: featureName,
      coords: [...this.data.points],
      pointCount: this.data.points.length,
      properties: {
        accuracy: this.data.accuracy,
        positioningMode: this.data.isDualBand ? 'dual-band' : 'single-band'
      }
    };

    // 添加特定属性
    if (featureType === 'line') {
      feature.length = this.data.currentPerimeter;
    } else if (featureType === 'polygon') {
      const units = getAreaUnits();
      feature.area = {
        squareMeters: this.data.currentArea,
        mu: this.data.currentArea * units.MU.factor,
        hectares: this.data.currentArea * units.HECTARE.factor
      };
      feature.perimeter = this.data.currentPerimeter;
      feature.elevation = calculateElevationStats(this.data.points);
    }

    this.data.gisFeatures.push(feature);

    // 显示提示
    if (this.data.widgets.statusTip) {
      let infoText = '';
      if (featureType === 'polygon') {
        const units = getAreaUnits();
        const areaInMu = (this.data.currentArea * units.MU.factor).toFixed(2);
        infoText = ` ${areaInMu}${getText('mu') || 'mu'}`;
      } else {
        infoText = ` ${this.data.currentPerimeter.toFixed(1)}m`;
      }
      this.safeSetProperty(this.data.widgets.statusTip, prop.TEXT, `${featureName}${getText('save') || 'Saved'}${infoText}`);
      this.safeSetProperty(this.data.widgets.statusTip, prop.COLOR, 0x00ff88);
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

    logger.debug(`GIS feature completed: ${featureName}, type: ${featureType}`);

    // 重置临时数据，准备采集下一个同类型要素
    this.data.points = [];
    this.data.currentArea = 0;
    this.data.currentPerimeter = 0;
    this.data.measureState = MEASURE_STATE.READY;
    
    this.updateUI();
  },

  // GIS模式：导出到Android
  exportToAndroid() {
    if (this.data.gisFeatures.length === 0) {
      logger.warn("No features to export");
      if (this.data.widgets.statusTip) {
        this.safeSetProperty(this.data.widgets.statusTip, prop.TEXT, getText('noFeatures') || 'No features');
        this.safeSetProperty(this.data.widgets.statusTip, prop.COLOR, 0xff3b30);
      }
      return;
    }

    // 如果当前有未完成的线/面要素，先完成它
    if (this.data.points.length > 0) {
      const featureType = this.data.currentFeatureType;
      let minPoints = featureType === 'line' ? 2 : 3;
      if (this.data.points.length >= minPoints) {
        this.finishGISFeature();
      }
    }

    // 统计要素数量
    const gisFeatures = this.data.gisFeatures || [];
    const featureCount = {
      point: gisFeatures.filter(f => f.featureType === 'point').length,
      line: gisFeatures.filter(f => f.featureType === 'line').length,
      polygon: gisFeatures.filter(f => f.featureType === 'polygon').length
    };

    // 计算总点数
    let totalPoints = 0;
    gisFeatures.forEach(f => {
      if (f.featureType === 'point') {
        totalPoints += 1;
      } else {
        totalPoints += f.coords.length;
      }
    });

    // 构建项目数据
    const project = {
      id: Date.now().toString(),
      name: this.data.gisProjectName || `${getText('gisProject') || 'GIS Project'}${this.data.todayFieldCount + 1}`,
      recordType: 'gis_project',
      timestamp: Date.now(),
      date: new Date().toISOString().split('T')[0],
      features: [...this.data.gisFeatures],
      featureCount: featureCount,
      totalPoints: totalPoints,
      status: 'completed'
    };

    // 保存到 localStorage
    try {
      localStorage.setItem('hamgis_export_data', JSON.stringify(project));
      logger.debug(`GIS project ready for export: ${project.name}, features: ${this.data.gisFeatures.length}`);
      
      // 跳转到导出页面
      push({ url: "page/export/index.page" });
    } catch (e) {
      logger.error(`Export preparation failed: ${e}`);
      if (this.data.widgets.statusTip) {
        this.safeSetProperty(this.data.widgets.statusTip, prop.TEXT, getText('exportFailed') || 'Export failed');
        this.safeSetProperty(this.data.widgets.statusTip, prop.COLOR, 0xff3b30);
      }
    }
  },

  // GIS模式：完成整个项目
  finishGISProject() {
    if (this.data.gisFeatures.length === 0) {
      logger.warn("No features to save");
      if (this.data.widgets.statusTip) {
        this.safeSetProperty(this.data.widgets.statusTip, prop.TEXT, getText('noFeatures') || 'No features');
        this.safeSetProperty(this.data.widgets.statusTip, prop.COLOR, 0xff3b30);
      }
      return;
    }

    // 如果当前有未完成的线/面要素，先完成它
    if (this.data.points.length > 0) {
      const featureType = this.data.currentFeatureType;
      let minPoints = featureType === 'line' ? 2 : 3;
      if (this.data.points.length >= minPoints) {
        this.finishGISFeature();
      }
    }

    // 统计要素数量
    const gisFeatures = this.data.gisFeatures || [];
    const featureCount = {
      point: gisFeatures.filter(f => f.featureType === 'point').length,
      line: gisFeatures.filter(f => f.featureType === 'line').length,
      polygon: gisFeatures.filter(f => f.featureType === 'polygon').length
    };

    // 计算总点数
    let totalPoints = 0;
    gisFeatures.forEach(f => {
      if (f.featureType === 'point') {
        totalPoints += 1;
      } else {
        totalPoints += f.coords.length;
      }
    });

    // 构建项目数据
    const project = {
      id: Date.now().toString(),
      name: this.data.gisProjectName || `${getText('gisProject') || 'GIS Project'}${this.data.todayFieldCount + 1}`,
      recordType: 'gis_project',
      timestamp: Date.now(),
      date: new Date().toISOString().split('T')[0],
      features: [...this.data.gisFeatures],
      featureCount: featureCount,
      totalPoints: totalPoints,
      status: 'completed'
    };

    // 保存到 localStorage
    try {
      let measurements = [];
      const stored = localStorage.getItem('hamgis_measurements');
      if (stored) {
        measurements = JSON.parse(stored);
        if (!Array.isArray(measurements)) {
          measurements = [];
        }
      }
      measurements.push(project);
      localStorage.setItem('hamgis_measurements', JSON.stringify(measurements));
      logger.debug(`GIS project saved: ${project.name}, features: ${this.data.gisFeatures.length}`);
    } catch (e) {
      logger.error(`Failed to save GIS project: ${e}`);
    }

    // 显示提示
    if (this.data.widgets.statusTip) {
      const pointText = getText('point') || 'Point';
      const lineText = getText('line') || 'Line';
      const polygonText = getText('polygon') || 'Polygon';
      const countText = `${pointText}×${featureCount.point} ${lineText}×${featureCount.line} ${polygonText}×${featureCount.polygon}`;
      this.safeSetProperty(this.data.widgets.statusTip, prop.TEXT, `${project.name} ${getText('save') || 'Saved'} (${countText})`);
      this.safeSetProperty(this.data.widgets.statusTip, prop.COLOR, 0x00ff88);
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

    // 重置状态，开始新项目
    setTimeout(() => {
      this.data.todayFieldCount++;
      this.startNewGISProject();
    }, 1500);
  },

  // 开始新的GIS项目
  startNewGISProject() {
    this.data.gisFeatures = [];
    this.data.gisFeatureIndex = 0;
    this.data.gisProjectName = `${getText('gisProject') || 'GIS Project'}${this.generateProjectLetter()}`;
    this.data.points = [];
    this.data.currentArea = 0;
    this.data.currentPerimeter = 0;
    this.data.measureState = MEASURE_STATE.READY;
    this.data.currentFeatureType = 'polygon'; // 默认面要素
    
    logger.debug(`Starting new GIS project: ${this.data.gisProjectName}`);
    this.updateUI();
  },

  // 生成项目字母
  generateProjectLetter() {
    try {
      const stored = localStorage.getItem('hamgis_measurements');
      let todayCount = 0;
      
      if (stored) {
        const measurements = JSON.parse(stored);
        if (Array.isArray(measurements)) {
          const today = new Date().toISOString().split('T')[0];
          todayCount = measurements.filter(m => m.date === today && m.recordType === 'gis_project').length;
        }
      }
      
      return this.numberToLetter(todayCount);
    } catch (e) {
      logger.error(`Failed to generate project letter: ${e}`);
      return 'A';
    }
  },

  // 保存地块数据（测面积模式）
  saveField() {
    try {
      // 计算海拔统计
      const elevation = calculateElevationStats(this.data.points);
      
      const units = getAreaUnits();
      const currentUnit = this.getCurrentUnit(); // 获取当前单位设置
      const field = {
        id: Date.now().toString(),
        name: this.data.currentFieldName,
        recordType: 'area_measurement',  // 标识为测面积模式
        timestamp: Date.now(),
        date: new Date().toISOString().split('T')[0], // YYYY-MM-DD
        type: 'polygon',  // 测面积模式固定为面
        points: this.data.points,
        pointCount: this.data.points.length,
        area: {
          squareMeters: this.data.currentArea,
          mu: this.data.currentArea * units.MU.factor,
          hectares: this.data.currentArea * units.HECTARE.factor,
          acres: this.data.currentArea * units.ACRE.factor,
          squareMiles: this.data.currentArea * units.SQUARE_MILE.factor
        },
        primaryUnit: currentUnit, // 保存用户选择的单位
        perimeter: this.data.currentPerimeter,
        accuracy: this.data.accuracy,
        positioningMode: this.data.isDualBand ? 'dual-band' : 'single-band',
        elevation: elevation,  // 添加海拔统计
        status: 'completed'
      };
      
      // 验证数据完整性
      if (!this.data.points || this.data.points.length < 3) {
        logger.warn(`Not enough points (need 3), cannot save`);
        return;
      }
      
      if (this.data.currentArea <= 0) {
        logger.warn('Invalid area, cannot save');
        return;
      }
      
      // 获取现有记录
      let fields = [];
      try {
        const stored = localStorage.getItem('hamgis_measurements');
        if (stored) {
          try {
            fields = JSON.parse(stored);
            if (!Array.isArray(fields)) {
              logger.warn('Invalid data format, resetting');
              fields = [];
            }
          } catch (jsonError) {
             logger.warn('JSON parse failed, resetting data');
             fields = [];
          }
        }
      } catch (e) {
        logger.error(`Failed to read history: ${e}`);
        fields = [];
      }
      
      // 添加新地块
      fields.push(field);
      
      // 保存
      try {
        localStorage.setItem('hamgis_measurements', JSON.stringify(fields));
        logger.debug(`Field saved: ${field.name}, total records: ${fields.length}, type: ${field.type}`);
      } catch (saveError) {
        logger.error(`Failed to write Storage: ${saveError}`);
        // 尝试只保存最后一条，或者提示存储空间不足
        if (fields.length > 1) {
             // 简单的清理策略：如果保存失败，尝试删除最旧的一条再试
             logger.warn('Attempting to clean old data and retry...');
             fields.shift(); // 移除第一条
             fields.push(field); // 重新加入当前
             try {
                localStorage.setItem('hamgis_measurements', JSON.stringify(fields));
                logger.debug('Saved successfully after cleanup');
             } catch (retryError) {
                logger.error(`Still failed to save after cleanup: ${retryError}`);
             }
        }
      }
    } catch (e) {
      logger.error(`Failed to save field: ${e}`);
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
      logger.error(`Failed to generate field name: ${e}`);
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

  // 获取当前单位设置 - 使用缓存避免频繁读取localStorage
  getCurrentUnit() {
    try {
      // 如果缓存存在且有效，直接返回缓存
      if (this.data.cachedUnit) {
        // 减少日志输出，避免性能问题
        return this.data.cachedUnit;
      }
      
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
          logger.debug('Auto-converted square meter setting to mu');
        }
        
        // 缓存单位信息
        this.data.cachedUnit = unit;
        // 只在首次读取时记录日志
        return unit;
      } else {
        logger.debug('Settings not found, using default unit: mu');
        this.data.cachedUnit = 'mu';
        return 'mu';
      }
    } catch (e) {
      logger.error(`Failed to read unit settings: ${e}`);
      this.data.cachedUnit = 'mu';
      return 'mu';
    }
  },

  // 获取当前语言设置
  getLanguage() {
    try {
      const stored = localStorage.getItem('hamgis_settings');
      if (stored) {
        const settings = JSON.parse(stored);
        return settings.language || 'en-US';
      } else {
        return 'en-US';
      }
    } catch (e) {
      logger.error(`Failed to read language settings: ${e}`);
      return 'en-US';
    }
  },

  // 加载所有设置
  loadSettings() {
    try {
      const stored = localStorage.getItem('hamgis_settings');
      if (stored) {
        const settings = JSON.parse(stored);
        return {
          appMode: settings.appMode !== undefined ? settings.appMode : 0, // 0=测面积, 1=GIS采集
          primaryUnit: settings.primaryUnit || 'mu',
          vibrationFeedback: settings.vibrationFeedback !== false,
          autoSave: settings.autoSave !== false,
          keepScreenOn: settings.keepScreenOn !== false,
          autoCollect: settings.autoCollect || false,
          collectionInterval: settings.collectionInterval || 3,
          highContrast: settings.highContrast || false
        };
      }
    } catch (e) {
      logger.error(`Failed to load settings: ${e}`);
    }
    // 返回默认设置
    return {
      appMode: 0,  // 默认测面积模式
      primaryUnit: 'mu',
      vibrationFeedback: true,
      autoSave: true,
      keepScreenOn: true, // 默认开启屏幕常亮
      autoCollect: false,
      collectionInterval: 3,
      highContrast: false
    };
  },

  // 获取单位显示信息
  getUnitInfo(unitKey) {
    const units = getAreaUnits();
    // 支持所有单位类型，如果找不到则默认为亩
    const normalizedKey = unitKey.toUpperCase().replace('SQUAREMILE', 'SQUARE_MILE');
    const unit = units[normalizedKey] || units.MU;
    // 减少日志输出
    return unit;
  },

  // 获取GPS状态文本
  getGPSText() {
    switch (this.data.gpsStatus) {
      case 'locating':
        return TEXTS.locating;
      case 'ready':
        return getText('gpsReady') || 'GPS Ready';
      case 'weak':
        return TEXTS.weakSignal;
      case 'permission_denied':
        return getText('noPermission') || 'No Permission';
      case 'error':
        return getText('error') || 'Error';
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
    if (this.isGISMode()) {
      // GIS模式 - 使用简洁的文本格式
      const featureType = this.data.currentFeatureType;
      const featureCount = this.data.gisFeatures.length;
      const lang = this.getLanguage();
      
      const pointFeatureText = getText('pointFeature') || 'Point Feature';
      const lineFeatureText = getText('lineFeature') || 'Line Feature';
      const polygonFeatureText = getText('polygonFeature') || 'Polygon Feature';
      const collectedText = getText('collected') || 'Collected';
      const currentText = getText('current') || 'Current';
      
      if (featureType === 'point') {
        return `${pointFeatureText} | ${collectedText}: ${featureCount}`;
      } else {
        const minPoints = featureType === 'line' ? 2 : 3;
        const currentPoints = this.data.points.length;
        const featureName = featureType === 'line' ? lineFeatureText : polygonFeatureText;
        
        if (currentPoints === 0) {
          return `${currentText}: ${featureName}`;
        } else if (currentPoints < minPoints) {
          const needCount = minPoints - currentPoints;
          const pointsNeededText = getText('pointsNeeded') || '{0} pts, {1} more needed';
          return pointsNeededText.replace('{0}', currentPoints).replace('{1}', needCount);
        } else {
          return getText('finishFeatureHint') || 'Finish Feature | Long press to finish project';
        }
      }
    } else {
      // 测面积模式
      if (this.data.points.length === 0) {
        return `${getText('startMeasure')}: ${this.data.currentFieldName}`;
      } else if (this.data.points.length < 3) {
        // 使用更简洁的文本，避免混合语言和显示截断问题
        const collectedCount = this.data.points.length;
        const needCount = 3 - collectedCount;
        const collectedPointsText = getText('collectedPoints') || '{0} pts, {1} more needed';
        return collectedPointsText.replace('{0}', collectedCount).replace('{1}', needCount);
      } else {
        return `${getText('finishField')}`;
      }
    }
  },

  // 更新要素类型按钮状态（GIS模式）
  updateFeatureTypeButtons() {
    if (!this.isGISMode()) return;
    
    // 不再动态更新按钮颜色，避免频繁设置属性导致错误
    // 按钮颜色在创建时已设置，点击时会自动更新
    return;
  },

  // 更新UI显示
  updateUI() {
    const isHighContrast = this.data.settings.highContrast;
    const highlightColor = isHighContrast ? 0xffffff : 0x80caff;
    const altColor = isHighContrast ? 0xffffff : 0x88ccff;
    
    // GPS状态更新 - BUTTON类型widget使用prop.MORE更新文本，避免setProperty错误
    if (this.data.widgets.gpsStatus) {
      const gpsText = this.getGPSText();
      const gpsColor = this.getGPSColor();
      // BUTTON类型widget使用prop.MORE更新属性，而不是直接设置prop.TEXT
      try {
        this.data.widgets.gpsStatus.setProperty(prop.MORE, {
          text: gpsText,
          color: gpsColor
        });
      } catch (e) {
        logger.warn(`GPS status button update failed: ${e}`);
      }
    }
    
    // 更新坐标显示
    if (this.data.widgets.coordinates) {
      const coordText = this.data.currentLat && this.data.currentLon
        ? `${this.data.currentLat.toFixed(5)}, ${this.data.currentLon.toFixed(5)}`
        : TEXTS.noGPS;
      
      // 使用safeSetProperty来避免频繁调用
      this.safeSetProperty(this.data.widgets.coordinates, prop.TEXT, coordText);
    }
    
    // 更新海拔显示
    if (this.data.widgets.altitudeDisplay) {
      if (this.data.currentAltitude !== null) {
        const altitudeText = `${getText('altitude')}: ${Math.round(this.data.currentAltitude)}m`;
        
        // 使用safeSetProperty来避免频繁调用
        this.safeSetProperty(this.data.widgets.altitudeDisplay, prop.TEXT, altitudeText);
        this.safeSetProperty(this.data.widgets.altitudeDisplay, prop.COLOR, altColor);
      } else {
        const defaultText = `${getText('altitude')}: --`;
        
        // 使用safeSetProperty来避免频繁调用
        this.safeSetProperty(this.data.widgets.altitudeDisplay, prop.TEXT, defaultText);
        this.safeSetProperty(this.data.widgets.altitudeDisplay, prop.COLOR, 0x666666);
      }
    }
    
    // 更新地块名称
    if (this.data.widgets.fieldName) {
      let name;
      if (this.isGISMode()) {
        name = this.data.gisProjectName || getText('gisProject') || 'GIS Project';
      } else {
        name = this.data.currentFieldName || TEXTS.unnamed;
      }
      
      // 使用safeSetProperty来避免频繁调用
      this.safeSetProperty(this.data.widgets.fieldName, prop.TEXT, name);
      this.safeSetProperty(this.data.widgets.fieldName, prop.COLOR, highlightColor);
    }
    
    // GIS要素类型按钮颜色固定，不需要更新
    
    // 更新点数 - 圆屏需要简化显示
    if (this.data.widgets.pointCount) {
      const deviceInfo = getDeviceInfo();
      const isRoundScreen = deviceInfo.width >= 466;
      
      if (this.isGISMode()) {
        // GIS模式：显示要素统计
        const gisFeatures = this.data.gisFeatures || [];
        const counts = {
          point: gisFeatures.filter(f => f.featureType === 'point').length,
          line: gisFeatures.filter(f => f.featureType === 'line').length,
          polygon: gisFeatures.filter(f => f.featureType === 'polygon').length
        };
        const pointText = getText('point') || 'Point';
        const lineText = getText('line') || 'Line';
        const polygonText = getText('polygon') || 'Polygon';
        const countText = `${pointText}×${counts.point} ${lineText}×${counts.line} ${polygonText}×${counts.polygon}`;
        
        // 使用safeSetProperty来避免频繁调用
        this.safeSetProperty(this.data.widgets.pointCount, prop.TEXT, countText);
      } else {
        // 采集阶段：只显示点数，不计算面积和周长
        const pointText = isRoundScreen 
          ? `${this.data.points.length}` 
          : `${getText('pointCount') || 'Points'}: ${this.data.points.length}`;
        
        // 使用safeSetProperty来避免频繁调用
        this.safeSetProperty(this.data.widgets.pointCount, prop.TEXT, pointText);
      }
    },
    
    // 更新周长/长度 - 根据模式显示不同文本
    if (this.data.widgets.perimeterDisplay) {
      let showPerimeter = true;
      let label = getText('perimeter') || 'Perimeter';
      
      if (this.isGISMode()) {
        // GIS模式：根据当前要素类型
        if (this.data.currentFeatureType === 'point') {
          showPerimeter = false;
        } else if (this.data.currentFeatureType === 'line') {
          label = getText('length') || 'Length';
        }
      }
      
      if (showPerimeter) {
        const perimeter = this.data.currentPerimeter > 0 
          ? `${this.data.currentPerimeter.toFixed(1)}m` 
          : '0.0m';
        const deviceInfo = getDeviceInfo();
        const isRoundScreen = deviceInfo.width >= 466;
        const perimeterText = isRoundScreen ? perimeter : `${label}: ${perimeter}`;
        
        // 使用safeSetProperty来避免频繁调用
        this.safeSetProperty(this.data.widgets.perimeterDisplay, prop.TEXT, perimeterText);
        this.safeSetProperty(this.data.widgets.perimeterDisplay, prop.COLOR, altColor);
        this.safeSetProperty(this.data.widgets.perimeterDisplay, prop.VISIBLE, true);
      } else {
        this.safeSetProperty(this.data.widgets.perimeterDisplay, prop.VISIBLE, false);
      }
    }
    
    // 更新面积显示 - GIS模式下显示要素统计或面积，普通模式显示面积
    if (this.data.widgets.areaDisplay) {
      if (this.isGISMode()) {
        // GIS模式：根据当前要素类型显示不同内容
        const featureType = this.data.currentFeatureType;
        const currentUnit = this.getCurrentUnit();
        const unitInfo = this.getUnitInfo(currentUnit);
        
        let displayText = '';
        
        const gisFeatures = this.data.gisFeatures || [];
        
        if (featureType === 'point') {
          // 点要素：显示已采集的点数
          const pointCount = gisFeatures.filter(f => f.featureType === 'point').length;
          const pointText = getText('point') || 'Point';
          displayText = `${pointCount}${pointText}`;
        } else if (featureType === 'line') {
          // 线要素：显示已采集的线数
          const lineCount = gisFeatures.filter(f => f.featureType === 'line').length;
          const lineText = getText('line') || 'Line';
          displayText = `${lineCount}${lineText}`;
        } else if (featureType === 'polygon') {
          // 面要素：显示面积
          if (this.data.currentArea > 0) {
            const areaValue = (this.data.currentArea * unitInfo.factor).toFixed(2);
            displayText = `${areaValue} ${unitInfo.symbol}`;
          } else {
            displayText = `0.00 ${unitInfo.symbol}`;
          }
        }
        
        // 使用safeSetProperty来避免频繁调用
        this.safeSetProperty(this.data.widgets.areaDisplay, prop.VISIBLE, true);
        this.safeSetProperty(this.data.widgets.areaDisplay, prop.TEXT, displayText);
        this.safeSetProperty(this.data.widgets.areaDisplay, prop.COLOR, highlightColor);
      } else {
        // 普通模式：显示面积
        const currentUnit = this.getCurrentUnit();
        const unitInfo = this.getUnitInfo(currentUnit);
        
        let displayText = '';
        
        if (this.data.currentArea > 0) {
          const areaValue = (this.data.currentArea * unitInfo.factor).toFixed(2);
          displayText = `${areaValue} ${unitInfo.symbol}`;
        } else {
          displayText = `0.00 ${unitInfo.symbol}`;
        }
        
        // 使用safeSetProperty来避免频繁调用
        this.safeSetProperty(this.data.widgets.areaDisplay, prop.VISIBLE, true);
        this.safeSetProperty(this.data.widgets.areaDisplay, prop.TEXT, displayText);
        this.safeSetProperty(this.data.widgets.areaDisplay, prop.COLOR, highlightColor);
      }
    }
    
    // 更新状态提示
    if (this.data.widgets.statusTip) {
      const statusText = this.getMeasureStatusText();
      
      // 使用safeSetProperty来避免频繁调用
      this.safeSetProperty(this.data.widgets.statusTip, prop.TEXT, statusText);
      
      // 根据状态设置颜色
      let statusColor;
      if (this.data.points.length >= 3) {
        statusColor = 0x00ff88; // 绿色
      } else if (this.data.points.length > 0) {
        statusColor = 0xffaa00; // 黄色
      } else {
        statusColor = 0x888888; // 灰色
      }
      
      // 使用safeSetProperty来避免频繁调用
      this.safeSetProperty(this.data.widgets.statusTip, prop.COLOR, statusColor);
    }
    
    // 更新按钮状态
    // 采集点按钮：GPS就绪时可用
    if (this.data.widgets.collectBtn) {
      const canCollect = this.data.gpsStatus === 'ready';
      
      // 点模式下修改按钮文字
      let btnText = this.data.settings.autoCollect
            ? (this.data.isAutoCollecting ? (getText('stopCollect') || "Stop") : (getText('startCollect') || "Start"))
            : (getText('addPoint') || "Collect");
            
      // 如果是点模式且不是自动采集，显示“记录点位”可能更合适，但保持一致性也行
      // 这里不做特殊文字修改，保持“采集点”
      
      // 按钮文本更新已移除，避免prop.MORE长度限制问题
    }
    
    // 完成按钮和撤销按钮的状态更新已移除
  },

  onInit() {
    logger.debug("Measurement page initialized");
    
    // 隐藏状态栏（方形屏幕适配）
    try {
      setStatusBarVisible(false);
      logger.debug("Status bar hidden");
    } catch (e) {
      logger.error(`Failed to hide status bar: ${e}`);
    }
    
    // 加载设置
    this.data.settings = this.loadSettings();
    
    // 屏幕常亮功能已在app.js全局设置，此处不再重复设置
    
    // 初始化震动器
    try {
      this.data.vibrator = new Vibrator();
    } catch (e) {
      logger.error(`Failed to initialize vibrator: ${e}`);
      this.data.vibrator = null;
    }
    
    // 初始化气压计
    try {
      const success = barometerManager.init();
      if (success) {
        logger.info('Barometer initialized successfully');
        // 注册海拔变化监听
        barometerManager.onChange((altitude) => {
          this.data.currentAltitude = altitude;
          this.updateUI();
        });
        // 立即获取一次海拔
        this.data.currentAltitude = barometerManager.getAltitude();
      } else {
        logger.warn('Barometer initialization failed, altitude data unavailable');
      }
    } catch (e) {
      logger.error(`Failed to initialize barometer: ${e}`);
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
      logger.error(`Failed to read today field count: ${e}`);
      this.data.todayFieldCount = 0;
    }
    
    // 根据模式初始化，并清理对方模式的数据
    if (this.isGISMode()) {
      // 清理测面积模式数据
      this.data.currentFieldName = '';
      this.data.todayFieldCount = 0;
      this.data.fields = [];
      // 初始化GIS模式
      this.startNewGISProject();
    } else {
      // 清理GIS模式数据
      this.data.gisFeatures = [];
      this.data.gisFeatureIndex = 0;
      this.data.gisProjectName = '';
      this.data.currentFeatureType = 'polygon';
      // 初始化测面积模式
      this.startNewField();
    }
    
    // 初始化GPS
    this.initGPS();
    
    // 设置定时器 - 减少UI更新频率，避免频繁读取localStorage
    this.data.locationTimer = setInterval(() => {
      this.updateGPSLocation();
    }, 1000); // GPS位置更新频率：1秒
    
    this.data.uiUpdateTimer = setInterval(() => {
      this.updateUI();
    }, 500); // UI更新频率：500ms，避免过于频繁的更新
    
    // 添加设置变化监听 - 每2秒检查一次设置是否变化
    this.data.lastSettingsCheck = JSON.stringify({
      unit: this.getCurrentUnit(),
      hc: this.loadSettings().highContrast,
      appMode: this.loadSettings().appMode // 检查应用模式变化
    });
    this.data.settingsCheckTimer = setInterval(() => {
      const currentSettings = JSON.stringify({
        unit: this.getCurrentUnit(),
        hc: this.loadSettings().highContrast,
        appMode: this.loadSettings().appMode // 检查应用模式变化
      });
      if (currentSettings !== this.data.lastSettingsCheck) {
        // 防呆检查：采集过程中禁止切换模式
        const hasUnsavedData = this.data.points.length > 0 || 
                               (this.data.gisFeatures && this.data.gisFeatures.length > 0) ||
                               this.data.isAutoCollecting;
        
        if (hasUnsavedData) {
          // 有未保存的数据，显示提示但不切换
          if (this.data.widgets.statusTip) {
            const warningText = getText('saveBeforeSwitchMode') || 'Save before switching mode';
            this.safeSetProperty(this.data.widgets.statusTip, prop.TEXT, warningText);
            this.safeSetProperty(this.data.widgets.statusTip, prop.COLOR, 0xffaa00);
          }
          // 更新lastSettingsCheck但不执行切换
          this.data.lastSettingsCheck = currentSettings;
          this.data.settings = this.loadSettings(); // 仍然更新设置（单位等可以改）
          logger.debug('Unsaved data exists, mode switching blocked');
          return;
        }
        
        logger.debug('Settings changed, rebuilding interface');
        this.data.lastSettingsCheck = currentSettings;
        this.data.settings = this.loadSettings(); // Reload settings
        // 重新构建界面
        this.onDestroy();
        this.onInit();
        this.build();
      }
    }, 2000);
  },

  build() {
    logger.debug("Building measurement interface - optimized layout per design doc");
    
    const deviceInfo = getDeviceInfo();
    const { width, height } = deviceInfo;
    const isHighContrast = this.data.settings.highContrast;
    const highlightColor = isHighContrast ? 0xffffff : 0x80caff;
    const altColor = isHighContrast ? 0xffffff : 0x88ccff;
    
    // 检测屏幕类型：466px及以上为圆屏，390px为方屏
    const isRoundScreen = width >= 466;
    
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
    
    // GPS Status Bar Button (Background + Interaction)
    this.data.widgets.gpsStatus = createWidget(widget.BUTTON, {
      x: px(2),
      y: px(2),
      w: width - px(4),
      h: gpsBarHeight - px(4),
      radius: px(24),
      normal_color: 0x1c1b1f,
      press_color: 0x2b2d31,
      text: TEXTS.locating,
      color: 0x00ff88,
      text_size: px(24),
      click_func: () => {
        // Optional: Trigger immediate GPS update or show toast
      },
      longpress_func: () => {
        push({ 
          url: "page/satellite/index.page",
          params: JSON.stringify({
            startTime: this.data.locateStartTime,
            fixDuration: this.data.firstFixDuration
          })
        });
      }
    });

    // ===== 坐标显示区 =====
    const coordY = gpsBarHeight;
    const coordHeight = px(35);
    const coordFontSize = px(22); // 增大字体，提高户外可读性
    
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

    // ===== GIS模式：要素类型切换按钮 =====
    let featureTypeBtnY = coordY + coordHeight;
    const featureTypeBtnHeight = px(42); // 增大按钮高度
    
    if (this.isGISMode()) {
      const pageInstance = this;
      const btnWidth = px(85); // 增大按钮宽度
      const btnSpacing = px(8); // 增大按钮间距
      const totalBtnWidth = btnWidth * 3 + btnSpacing * 2;
      const startX = (width - totalBtnWidth) / 2;
      
      // 点按钮 - 固定颜色，不随选中状态变化
      this.data.widgets.featureTypePoint = createWidget(widget.BUTTON, {
        x: startX,
        y: featureTypeBtnY,
        w: btnWidth,
        h: featureTypeBtnHeight,
        radius: px(21),
        normal_color: 0x2b2d31,
        press_color: 0x0061a4,
        text: getText('mode_point') || 'Point',
        text_size: px(16),
        color: 0xffffff,
        click_func: () => {
          pageInstance.data.currentFeatureType = 'point';
          pageInstance.data.lastFeatureType = 'point';
        }
      });

      // 线按钮 - 固定颜色，不随选中状态变化
      this.data.widgets.featureTypeLine = createWidget(widget.BUTTON, {
        x: startX + btnWidth + btnSpacing,
        y: featureTypeBtnY,
        w: btnWidth,
        h: featureTypeBtnHeight,
        radius: px(21),
        normal_color: 0x2b2d31,
        press_color: 0x0061a4,
        text: getText('mode_line') || 'Line',
        text_size: px(16),
        color: 0xffffff,
        click_func: () => {
          pageInstance.data.currentFeatureType = 'line';
          pageInstance.data.lastFeatureType = 'line';
        }
      });

      // 面按钮 - 固定颜色，不随选中状态变化
      this.data.widgets.featureTypePolygon = createWidget(widget.BUTTON, {
        x: startX + (btnWidth + btnSpacing) * 2,
        y: featureTypeBtnY,
        w: btnWidth,
        h: featureTypeBtnHeight,
        radius: px(21),
        normal_color: 0x2b2d31,
        press_color: 0x0061a4,
        text: getText('mode_polygon') || 'Polygon',
        text_size: px(16),
        color: 0xffffff,
        click_func: () => {
          pageInstance.data.currentFeatureType = 'polygon';
          pageInstance.data.lastFeatureType = 'polygon';
        }
      });
      
      featureTypeBtnY += featureTypeBtnHeight;
    }

    // ===== 海拔显示区 =====
    const altitudeY = featureTypeBtnY;
    const altitudeHeight = px(25);
    const altitudeFontSize = px(18); // 默认大字体
    
    this.data.widgets.altitudeDisplay = createWidget(widget.TEXT, {
      x: 0,
      y: altitudeY,
      w: width,
      h: altitudeHeight,
      color: altColor,
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

    // 统一使用圆屏布局（不分方圆屏）
    
    // 面积显示 (默认大字模式)
    const areaFontSize = px(120);
    const areaY = progressY + px(5);
    const areaHeight = px(110);
    
    this.data.widgets.areaDisplay = createWidget(widget.TEXT, {
      x: 0,
      y: areaY,
      w: width,
      h: areaHeight,
      color: highlightColor,
      text_size: areaFontSize,
      align_h: align.CENTER_H,
      align_v: align.CENTER_V,
      text_style: text_style.BOLD,
      text: `0.00 ${getText('mu') || 'mu'}`
    });

    // 地块名称、点数、周长 - 同一行显示 (默认大字模式)
    const infoRowY = progressY + px(120);
    const infoHeight = px(22);
    const infoFontSize = px(16);
    
    // 计算每个文本框的宽度，避免文字滚动
    const infoBoxWidth = (width - px(80)) / 3; // 平均分配宽度
    
    this.data.widgets.fieldName = createWidget(widget.TEXT, {
      x: px(20),
      y: infoRowY,
      w: infoBoxWidth,
      h: infoHeight,
      color: highlightColor,
      text_size: infoFontSize,
      align_h: align.CENTER_H,
      align_v: align.CENTER_V,
      text_style: text_style.BOLD,
      text: TEXTS.unnamed
    });

    this.data.widgets.pointCount = createWidget(widget.TEXT, {
      x: px(20) + infoBoxWidth + px(20),
      y: infoRowY,
      w: infoBoxWidth,
      h: infoHeight,
      color: 0xcccccc,
      text_size: infoFontSize,
      align_h: align.CENTER_H,
      align_v: align.CENTER_V,
      text: `${TEXTS.points}: 0`
    });

    this.data.widgets.perimeterDisplay = createWidget(widget.TEXT, {
      x: px(20) + infoBoxWidth * 2 + px(40),
      y: infoRowY,
      w: infoBoxWidth,
      h: infoHeight,
      color: altColor,
      text_size: infoFontSize,
      align_h: align.CENTER_H,
      align_v: align.CENTER_V,
      text: `${TEXTS.perimeter}: 0.0m`
    });

    // ===== 状态提示区 =====
    const statusY = progressY + progressHeight;
    const statusHeight = px(30);
    
    const statusFontSize = px(20); // 增大字体，提高户外可读性
    
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
            ? (this.data.isAutoCollecting ? (getText('stopCollect') || "Stop") : (getText('startCollect') || "Start"))
            : (getText('addPoint') || "Collect"),
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
          logger.error(`Collect button click failed: ${e}`);
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
      text: getText('undo') || "Undo",
      text_size: smallButtonFontSize,
      color: highlightColor, // Blue/White Text for Action
      click_func: () => {
        try {
          pageInstance.undoPoint();
        } catch (e) {
          logger.error(`Undo button click failed: ${e}`);
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
      text: this.isGISMode() ? (getText('finishFeature') || "Finish") : (getText('finishField') || "Finish"),
      text_size: smallButtonFontSize,
      color: highlightColor, // Blue/White Text for Action
      click_func: () => {
        try {
          if (pageInstance.isGISMode()) {
            // GIS模式：检查是否有混合要素
            const gisFeatures = pageInstance.data.gisFeatures || [];
            const hasPoint = gisFeatures.some(f => f.featureType === 'point');
            const hasLine = gisFeatures.some(f => f.featureType === 'line');
            const hasPolygon = gisFeatures.some(f => f.featureType === 'polygon');
            const hasMixedFeatures = (hasPoint && hasLine) || (hasPoint && hasPolygon) || (hasLine && hasPolygon);
            
            if (hasMixedFeatures) {
              // 有混合要素时，点击导出到Android
              pageInstance.exportToAndroid();
            } else {
              // 单一要素类型时，完成当前要素
              pageInstance.finishGISFeature();
            }
          } else {
            // 普通模式：完成地块
            pageInstance.finishField();
          }
        } catch (e) {
          logger.error(`Finish button click failed: ${e}`);
        }
      },
      longpress_func: () => {
        // GIS模式下长按完成整个项目
        if (pageInstance.isGISMode()) {
          try {
            pageInstance.finishGISProject();
          } catch (e) {
            logger.error(`Failed to finish project: ${e}`);
          }
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
            logger.error(`History button click failed: ${e}`);
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
            logger.error(`Settings button click failed: ${e}`);
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
            logger.error(`History button click failed: ${e}`);
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
            logger.error(`Settings button click failed: ${e}`);
          }
        }
      });
    }

    // 移除底部提示文字

    // 注册按键监听
    // 上键(Home/Select): 采集点功能 - 在GIS采集模式和测面积模式下都可用
    // 下键(Shortcut/Back): 返回功能 - 全局可用
    // 注意：仅在系统开启按键模式或设备有3个及以上按键时生效
    onKey({
      callback: (key, keyEvent) => {
        // 检查是否满足按键功能开启条件
        try {
          const systemMode = getSystemMode();
          const deviceInfo = getDeviceInfo();
          
          // 条件1：系统开启了按键模式
          const buttonModeEnabled = systemMode.button === true;
          // 条件2：设备有3个及以上按键
          const hasEnoughKeys = deviceInfo.keyNumber >= 3;
          
          if (!buttonModeEnabled && !hasEnoughKeys) {
            // 不满足任何条件，按键不生效
            logger.debug(`按键功能未启用：系统按键模式=${buttonModeEnabled}, 按键数=${deviceInfo.keyNumber}`);
            return false;
          }
          
          logger.debug(`按键功能已启用：系统按键模式=${buttonModeEnabled}, 按键数=${deviceInfo.keyNumber}`);
        } catch (e) {
          logger.error(`检测按键模式失败: ${e}`);
          // 获取失败时，默认不启用按键功能
          return false;
        }
        
        if (keyEvent === KEY_EVENT_CLICK) {
          // 上键：采集点 - 在手动采集模式下可用（包括GIS采集模式和测面积模式）
          if (key === KEY_HOME || key === KEY_SELECT) {
            // 非自动采集模式下，上键触发采集
            if (!this.data.settings.autoCollect) {
              logger.debug(`Home/Select key triggered collection: ${key}, mode: ${this.isGISMode() ? 'GIS' : 'Area'}`);
              this.collectPoint();
              return true; // 拦截按键事件
            } else {
              // 自动采集模式下，上键作为开始/停止自动采集
              logger.debug(`Home/Select key triggered auto collect toggle: ${key}`);
              if (this.data.isAutoCollecting) {
                this.stopAutoCollect();
              } else {
                this.startAutoCollect();
              }
              return true; // 拦截按键事件
            }
          }
          // 下键：结束采集/退出软件
          if (key === KEY_SHORTCUT || key === KEY_BACK) {
            logger.debug(`Shortcut/Back key triggered: ${key}, measureState: ${this.data.measureState}, points: ${this.data.points.length}`);
            
            // 检查是否正在采集中（有采集的点）
            const isCollecting = this.data.points.length > 0;
            
            if (isCollecting) {
              // 正在采集中，先结束当前采集
              logger.debug('Ending current collection');
              this.finishField();
              return true; // 拦截按键事件
            } else {
              // 没有在采集，直接退出软件
              logger.debug('Exiting app');
              exit();
              return true; // 拦截按键事件
            }
          }
        }
        return false;
      }
    });
    
    // 初始化UI状态
    this.updateUI();
  },

  onDestroy() {
    logger.debug("Measurement page destroyed");
    
    // 停止自动采集
    this.stopAutoCollect();
    
    // 恢复抬腕息屏功能
    // 屏幕常亮功能在全局管理，此处不恢复抬腕息屏
    
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
    if (this.data.autoCollectTimer) {
      clearInterval(this.data.autoCollectTimer);
    }
    
    // 停止GPS
    if (this.data.geolocation) {
      try {
        if (this.data.locationCallback) {
          this.data.geolocation.offChange(this.data.locationCallback);
        }
        if (this.data.enableChangeCallback && typeof this.data.geolocation.offEnableChange === 'function') {
          this.data.geolocation.offEnableChange(this.data.enableChangeCallback);
        }
        this.data.geolocation.stop();
      } catch (e) {
        logger.error(`Failed to stop GPS: ${e}`);
      }
    }
    
    // 销毁气压计
    try {
      barometerManager.destroy();
      logger.info('Barometer destroyed');
    } catch (e) {
      logger.error(`Failed to destroy barometer: ${e}`);
    }
    
    // 停止震动
    if (this.data.vibrator) {
      try {
        this.data.vibrator.stop();
      } catch (e) {
        logger.error(`Failed to stop vibration: ${e}`);
      }
    }
  },
  
  // GIS要素类型按钮颜色已固定，此函数不再需要
  rebuildFeatureTypeButtons() {
    // 按钮颜色固定，不需要更新
  }
});
