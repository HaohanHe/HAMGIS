/**
 * 小地图渲染器 - 使用CANVAS绘制
 */

import hmUI from '@zos/ui';
import { projectToCanvas, pixelToMeters } from './projection';

/**
 * 小地图绘制类 - 使用传入的CANVAS widget
 */
export class MiniMapRenderer {
  constructor(canvasWidget, width, height) {
    this.canvas = canvasWidget; // 使用传入的canvas widget
    this.width = width;
    this.height = height;
    this.padding = 0.1; // 10%边距
  }
  
  /**
   * 绘制完整地图
   * @param {Array} points 点数组 [{lat, lon}, ...]
   */
  render(points) {
    if (!points || points.length < 3) {
      this.drawEmptyState();
      return;
    }
    
    try {
      // 1. 计算边界和投影
      const { projected, scale, bounds } = projectToCanvas(
        points,
        this.width,
        this.height,
        this.padding
      );
      
      // 2. 绘制多边形边界
      this.drawPolygon(projected);
      
      // 3. 绘制采集点
      this.drawPoints(projected);
      
      // 4. 绘制比例尺
      this.drawScale(scale);
      
      console.log('小地图绘制成功');
    } catch (e) {
      console.error('小地图绘制失败:', e);
      this.drawEmptyState();
    }
  }
  
  /**
   * 绘制多边形边界 - 使用CANVAS的drawPoly方法
   * @param {Array} points 投影后的点数组 [{x, y}, ...]
   */
  drawPolygon(points) {
    if (!points || points.length < 3) return;
    
    try {
      // 使用CANVAS的drawPoly方法绘制多边形
      this.canvas.drawPoly({
        data_array: points,
        color: 0x80caff
      });
    } catch (e) {
      console.warn('绘制多边形失败:', e);
    }
  }
  
  /**
   * 绘制采集点 - 使用CANVAS的drawCircle方法
   * @param {Array} points 投影后的点数组 [{x, y}, ...]
   */
  drawPoints(points) {
    if (!points || points.length === 0) return;
    
    points.forEach((p, i) => {
      // 起点用红色，其他用蓝色
      const color = i === 0 ? 0xff3b30 : 0x80caff;
      const radius = i === 0 ? 6 : 4;
      
      try {
        // 使用CANVAS的drawCircle方法绘制点
        this.canvas.drawCircle({
          center_x: Math.round(p.x),
          center_y: Math.round(p.y),
          radius: radius,
          color: color
        });
      } catch (e) {
        console.warn('绘制点失败:', e);
      }
    });
  }
  
  /**
   * 绘制比例尺 - 使用CANVAS的drawLine和drawText方法
   * @param {number} scale 缩放比例
   */
  drawScale(scale) {
    const scaleLength = 50; // 像素
    const meters = Math.round(pixelToMeters(scaleLength, scale));
    
    const x = 10;
    const y = this.height - 30;
    
    try {
      // 设置画笔
      this.canvas.setPaint({
        color: 0xffffff,
        line_width: 2
      });
      
      // 绘制比例尺线
      this.canvas.drawLine({
        x1: x,
        y1: y,
        x2: x + scaleLength,
        y2: y,
        color: 0xffffff
      });
      
      // 左右端点
      this.canvas.drawLine({
        x1: x,
        y1: y - 5,
        x2: x,
        y2: y + 5,
        color: 0xffffff
      });
      
      this.canvas.drawLine({
        x1: x + scaleLength,
        y1: y - 5,
        x2: x + scaleLength,
        y2: y + 5,
        color: 0xffffff
      });
      
      // 比例尺文字
      this.canvas.drawText({
        x: x,
        y: y + 10,
        text: `${meters}m`,
        text_size: 10,
        color: 0xffffff
      });
    } catch (e) {
      console.warn('绘制比例尺失败:', e);
    }
  }
  
  /**
   * 绘制空状态 - 使用CANVAS的drawText方法
   */
  drawEmptyState() {
    try {
      this.canvas.drawText({
        x: this.width / 2 - 50,
        y: this.height / 2 - 10,
        text: '暂无地图数据',
        text_size: 14,
        color: 0x666666
      });
    } catch (e) {
      console.warn('绘制空状态失败:', e);
    }
  }
}
