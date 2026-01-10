/**
 * 海拔统计计算工具
 * 用于计算海拔相关的统计数据
 */

/**
 * 计算海拔统计
 * @param {Array} points 点数组 [{altitude, ...}, ...]
 * @returns {Object|null} 海拔统计 {average, max, min, range} 或 null
 */
export function calculateElevationStats(points) {
  if (!points || points.length === 0) {
    return null;
  }
  
  // 过滤出有效的海拔数据
  const altitudes = points
    .map(p => p.altitude)
    .filter(a => a !== null && a !== undefined && !isNaN(a));
  
  // 如果没有有效的海拔数据
  if (altitudes.length === 0) {
    return null;
  }
  
  // 计算统计值
  const sum = altitudes.reduce((a, b) => a + b, 0);
  const max = Math.max(...altitudes);
  const min = Math.min(...altitudes);
  
  return {
    average: Math.round(sum / altitudes.length),
    max: Math.round(max),
    min: Math.round(min),
    range: Math.round(max - min)
  };
}

/**
 * 检查是否有海拔数据
 * @param {Array} points 点数组
 * @returns {boolean} 是否有海拔数据
 */
export function hasElevationData(points) {
  if (!points || points.length === 0) {
    return false;
  }
  
  return points.some(p => 
    p.altitude !== null && 
    p.altitude !== undefined && 
    !isNaN(p.altitude)
  );
}

/**
 * 获取海拔数据点数量
 * @param {Array} points 点数组
 * @returns {number} 有海拔数据的点数量
 */
export function getElevationDataCount(points) {
  if (!points || points.length === 0) {
    return 0;
  }
  
  return points.filter(p => 
    p.altitude !== null && 
    p.altitude !== undefined && 
    !isNaN(p.altitude)
  ).length;
}
