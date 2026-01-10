/**
 * 坐标投影工具
 * 用于将经纬度坐标转换为屏幕像素坐标
 */

/**
 * 计算坐标边界框
 * @param {Array} points 点数组 [{lat, lon}, ...]
 * @returns {Object} 边界框 {minLat, maxLat, minLon, maxLon}
 */
export function calculateBounds(points) {
  if (!points || points.length === 0) {
    return null;
  }
  
  return {
    minLat: Math.min(...points.map(p => p.lat)),
    maxLat: Math.max(...points.map(p => p.lat)),
    minLon: Math.min(...points.map(p => p.lon)),
    maxLon: Math.max(...points.map(p => p.lon))
  };
}

/**
 * 将经纬度坐标投影到屏幕像素坐标
 * @param {Array} points 点数组 [{lat, lon}, ...]
 * @param {number} canvasWidth 画布宽度
 * @param {number} canvasHeight 画布高度
 * @param {number} padding 边距比例（0-1），默认0.1
 * @returns {Object} {projected: 投影后的点数组, scale: 缩放比例, bounds: 边界框}
 */
export function projectToCanvas(points, canvasWidth, canvasHeight, padding = 0.1) {
  if (!points || points.length === 0) {
    return { projected: [], scale: 1, bounds: null };
  }
  
  // 1. 计算边界框
  const bounds = calculateBounds(points);
  
  // 2. 计算范围
  const latRange = bounds.maxLat - bounds.minLat;
  const lonRange = bounds.maxLon - bounds.minLon;
  
  // 防止除零错误
  if (latRange === 0 || lonRange === 0) {
    // 如果只有一个点或所有点重合，使用固定缩放
    const centerX = canvasWidth / 2;
    const centerY = canvasHeight / 2;
    return {
      projected: points.map(() => ({ x: centerX, y: centerY })),
      scale: 1,
      bounds
    };
  }
  
  // 3. 计算缩放比例（保持宽高比）
  const availableWidth = canvasWidth * (1 - 2 * padding);
  const availableHeight = canvasHeight * (1 - 2 * padding);
  
  const scaleX = availableWidth / lonRange;
  const scaleY = availableHeight / latRange;
  const scale = Math.min(scaleX, scaleY);
  
  // 4. 计算偏移量（居中显示）
  const offsetX = (canvasWidth - lonRange * scale) / 2;
  const offsetY = (canvasHeight - latRange * scale) / 2;
  
  // 5. 投影所有点
  const projected = points.map(p => ({
    x: (p.lon - bounds.minLon) * scale + offsetX,
    // Y轴翻转（屏幕坐标系Y轴向下）
    y: canvasHeight - ((p.lat - bounds.minLat) * scale + offsetY)
  }));
  
  return { projected, scale, bounds };
}

/**
 * 计算实际距离（粗略估算）
 * @param {number} pixelDistance 像素距离
 * @param {number} scale 缩放比例
 * @returns {number} 实际距离（米）
 */
export function pixelToMeters(pixelDistance, scale) {
  // 1度约等于111km
  const degreesPerPixel = pixelDistance / scale;
  return degreesPerPixel * 111000;
}
