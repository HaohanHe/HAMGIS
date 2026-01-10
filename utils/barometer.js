/**
 * Barometer 气压计管理器
 * 用于获取海拔数据
 */

import { Barometer } from '@zos/sensor';
import { log } from '@zos/utils';

const logger = log.getLogger('barometer');

/**
 * 气压计管理类
 */
class BarometerManager {
  constructor() {
    this.barometer = null;
    this.isAvailable = false;
    this.currentAltitude = null;
  }
  
  /**
   * 初始化气压计
   * @returns {boolean} 初始化是否成功
   */
  init() {
    try {
      this.barometer = new Barometer();
      this.isAvailable = true;
      logger.info('Barometer initialized successfully');
      return true;
    } catch (e) {
      logger.error(`Failed to initialize Barometer: ${e}`);
      this.isAvailable = false;
      return false;
    }
  }
  
  /**
   * 获取当前海拔
   * @returns {number|null} 海拔（米），失败返回null
   */
  getAltitude() {
    if (!this.isAvailable || !this.barometer) {
      return null;
    }
    
    try {
      const altitude = this.barometer.getAltitude();
      
      // 验证数据有效性
      if (typeof altitude === 'number' && !isNaN(altitude)) {
        this.currentAltitude = altitude;
        return altitude;
      }
      
      return null;
    } catch (e) {
      logger.error(`Failed to get altitude: ${e}`);
      return null;
    }
  }
  
  /**
   * 获取气压值
   * @returns {number|null} 气压（百帕），失败返回null
   */
  getAirPressure() {
    if (!this.isAvailable || !this.barometer) {
      return null;
    }
    
    try {
      return this.barometer.getAirPressure();
    } catch (e) {
      logger.error(`Failed to get air pressure: ${e}`);
      return null;
    }
  }
  
  /**
   * 注册变化监听
   * @param {Function} callback 回调函数，接收海拔值参数
   */
  onChange(callback) {
    if (!this.isAvailable || !this.barometer) {
      return;
    }
    
    try {
      this.barometer.onChange(() => {
        const altitude = this.getAltitude();
        if (altitude !== null) {
          callback(altitude);
        }
      });
    } catch (e) {
      logger.error(`Failed to register onChange: ${e}`);
    }
  }
  
  /**
   * 移除变化监听
   */
  offChange() {
    if (!this.isAvailable || !this.barometer) {
      return;
    }
    
    try {
      this.barometer.offChange();
    } catch (e) {
      logger.error(`Failed to unregister onChange: ${e}`);
    }
  }
  
  /**
   * 销毁气压计
   */
  destroy() {
    this.offChange();
    this.barometer = null;
    this.isAvailable = false;
    this.currentAltitude = null;
  }
}

// 导出单例
export const barometerManager = new BarometerManager();
