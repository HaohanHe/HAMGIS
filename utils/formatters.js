/**
 * 数据格式化工具
 * 用于格式化各种数据类型的显示
 */

import { getText } from '@zos/i18n';

/**
 * 格式化面积（支持多单位）
 * @param {Object} area 面积对象 {squareMeters, mu, hectares}
 * @param {string} unit 单位 'mu'|'sqm'|'hectares'|'all'
 * @param {Object} texts 可选的翻译文本对象 {mu, hectare, squareMeter}
 * @returns {string} 格式化后的面积字符串
 */
export function formatArea(area, unit = 'mu', texts = {}) {
  if (!area) return '--';
  
  // 默认翻译文本（支持国际化）
  const defaultTexts = {
    mu: texts.mu || '亩',
    hectare: texts.hectare || '公顷',
    squareMeter: texts.squareMeter || '㎡'
  };
  
  switch (unit) {
    case 'mu':
      return `${area.mu.toFixed(2)}${defaultTexts.mu}`;
    case 'sqm':
      return `${Math.round(area.squareMeters)}${defaultTexts.squareMeter}`;
    case 'hectares':
      return `${area.hectares.toFixed(2)}${defaultTexts.hectare}`;
    case 'all':
      return `${area.mu.toFixed(2)}${defaultTexts.mu} (${Math.round(area.squareMeters)}${defaultTexts.squareMeter})`;
    default:
      return `${area.mu.toFixed(2)}${defaultTexts.mu}`;
  }
}

/**
 * 格式化日期时间
 * @param {number} timestamp 时间戳（毫秒）
 * @param {string} format 格式 'date'|'time'|'datetime'|'short'
 * @returns {string} 格式化后的日期时间字符串
 */
export function formatDate(timestamp, format = 'datetime') {
  if (!timestamp) return '--';
  
  const date = new Date(timestamp);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  const hours = String(date.getHours()).padStart(2, '0');
  const minutes = String(date.getMinutes()).padStart(2, '0');
  const seconds = String(date.getSeconds()).padStart(2, '0');
  
  switch (format) {
    case 'date':
      return `${year}-${month}-${day}`;
    case 'time':
      return `${hours}:${minutes}:${seconds}`;
    case 'datetime':
      return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`;
    case 'short':
      return `${month}/${day} ${hours}:${minutes}`;
    default:
      return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`;
  }
}

/**
 * 格式化坐标
 * @param {number} lat 纬度
 * @param {number} lon 经度
 * @param {number} precision 精度（小数位数），默认6
 * @returns {string} 格式化后的坐标字符串
 */
export function formatCoordinate(lat, lon, precision = 6) {
  if (lat === undefined || lon === undefined) return '--';
  
  return `${lat.toFixed(precision)}, ${lon.toFixed(precision)}`;
}

/**
 * 格式化海拔
 * @param {number|null} altitude 海拔（米）
 * @param {boolean} showUnit 是否显示单位
 * @returns {string} 格式化后的海拔字符串
 */
export function formatAltitude(altitude, showUnit = true) {
  if (altitude === null || altitude === undefined) {
    return '--';
  }
  
  const rounded = Math.round(altitude);
  return showUnit ? `${rounded}m` : `${rounded}`;
}

/**
 * 格式化周长
 * @param {number} perimeter 周长（米）
 * @param {string} unit 单位 'm'|'km'
 * @returns {string} 格式化后的周长字符串
 */
export function formatPerimeter(perimeter, unit = 'm') {
  if (!perimeter) return '--';
  
  if (unit === 'km') {
    return `${(perimeter / 1000).toFixed(2)}km`;
  }
  
  return `${perimeter.toFixed(1)}m`;
}

/**
 * 格式化GPS精度
 * @param {number} accuracy 精度（米）
 * @returns {string} 格式化后的精度字符串
 */
export function formatAccuracy(accuracy) {
  if (!accuracy) return '--';
  
  return `±${Math.round(accuracy)}m`;
}

/**
 * 格式化点数
 * @param {number} count 点数
 * @returns {string} 格式化后的点数字符串
 */
export function formatPointCount(count) {
  if (!count) return `0${getText('individual') || '个点'}`;
  
  return `${count}${getText('individual') || '个点'}`;
}

/**
 * 格式化时间（仅时分秒）
 * @param {number} timestamp 时间戳（毫秒）
 * @returns {string} 格式化后的时间字符串
 */
export function formatTime(timestamp) {
  if (!timestamp) return '--';
  
  const date = new Date(timestamp);
  const hours = String(date.getHours()).padStart(2, '0');
  const minutes = String(date.getMinutes()).padStart(2, '0');
  const seconds = String(date.getSeconds()).padStart(2, '0');
  
  return `${hours}:${minutes}:${seconds}`;
}

/**
 * 格式化距离
 * @param {number} distance 距离（米）
 * @param {string} unit 单位 'm'|'km'|'auto'
 * @returns {string} 格式化后的距离字符串
 */
export function formatDistance(distance, unit = 'auto') {
  if (!distance && distance !== 0) return '--';
  
  if (unit === 'km') {
    return `${(distance / 1000).toFixed(2)}km`;
  }
  
  if (unit === 'auto') {
    // 自动选择单位：大于1000米用km，否则用m
    if (distance >= 1000) {
      return `${(distance / 1000).toFixed(2)}km`;
    }
    return `${distance.toFixed(1)}m`;
  }
  
  return `${distance.toFixed(1)}m`;
}
