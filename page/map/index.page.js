import { log, px } from "@zos/utils";
import { createWidget, widget, align } from '@zos/ui';
import { getDeviceInfo } from "@zos/device";
import { back } from '@zos/router';
import { getText } from '@zos/i18n';
import { MiniMapRenderer } from '../../utils/minimap-renderer.js';

const logger = log.getLogger("hamgis-map-page");

Page({
  data: {
    project: null,         // 当前项目数据
  },
  
  /**
   * 页面初始化
   */
  onInit(params) {
    logger.debug("地图页面初始化");
    
    try {
      // 从路由参数获取项目数据
      if (params) {
        this.data.project = JSON.parse(params);
        logger.debug(`加载项目: ${this.data.project.name}`);
      } else {
        logger.error("未接收到项目数据");
      }
    } catch (e) {
      logger.error(`解析项目数据失败: ${e}`);
    }
  },
  
  /**
   * 构建页面UI - 地图居中显示
   */
  build() {
    logger.debug("构建地图页面UI - 地图居中");
    
    const deviceInfo = getDeviceInfo();
    const { width, height } = deviceInfo;
    const isRoundScreen = deviceInfo.width >= 480;
    
    // 背景
    createWidget(widget.FILL_RECT, {
      x: 0,
      y: 0,
      w: width,
      h: height,
      color: 0x0a0a0a
    });
    
    // 构建返回按钮（极简顶部）
    this.buildSimpleHeader(width, isRoundScreen);
    
    if (!this.data.project) {
      this.buildErrorState(width, height);
      return;
    }
    
    // 构建地图（居中显示）
    this.buildCenteredMap(width, height, isRoundScreen);
  },
  
  /**
   * 极简标题栏 - 只有返回按钮（居中）
   */
  buildSimpleHeader(width, isRoundScreen) {
    const startY = isRoundScreen ? px(20) : px(10);
    
    // 返回按钮 - 居中位置
    createWidget(widget.BUTTON, {
      x: (width - px(80)) / 2,
      y: startY,
      w: px(80),
      h: px(35),
      radius: px(17),
      normal_color: 0x333333,
      press_color: 0x555555,
      text: `← ${getText('back') || '返回'}`,
      text_size: px(16),
      color: 0xffffff,
      click_func: () => {
        try {
          back();
        } catch (e) {
          logger.error(`返回失败: ${e}`);
        }
      }
    });
  },
  
  /**
   * 构建居中地图 - 修复渲染位置问题
   */
  buildCenteredMap(width, height, isRoundScreen) {
    // 获取项目点数据
    const points = this.data.project?.points || [];
    
    if (points.length < 3) {
      // 数据不足，显示提示（居中）
      const msgHeight = px(60);
      createWidget(widget.TEXT, {
        x: 0,
        y: (height - msgHeight) / 2,
        w: width,
        h: msgHeight,
        color: 0x666666,
        text_size: px(16),
        align_h: align.CENTER_H,
        align_v: align.CENTER_V,
        text: getText('insufficientPoints') || '点数不足\n无法显示地图'
      });
      return;
    }
    
    // 计算地图容器尺寸 - 保守的尺寸计算
    const headerHeight = isRoundScreen ? px(70) : px(55);
    const bottomMargin = isRoundScreen ? px(60) : px(40);
    const sideMargin = isRoundScreen ? px(60) : px(30);
    
    // 地图容器尺寸 - 确保在屏幕范围内
    const maxMapWidth = width - sideMargin * 2;
    const maxMapHeight = height - headerHeight - bottomMargin;
    const mapSize = Math.min(maxMapWidth, maxMapHeight, px(300)); // 限制最大尺寸
    
    // 位置 - 严格居中
    const mapX = (width - mapSize) / 2;
    const mapY = headerHeight + (maxMapHeight - mapSize) / 2;
    
    logger.debug(`地图容器: x=${mapX}, y=${mapY}, size=${mapSize}, 屏幕: ${width}x${height}`);
    
    // 地图容器背景 - 先显示背景确认位置
    createWidget(widget.FILL_RECT, {
      x: mapX,
      y: mapY,
      w: mapSize,
      h: mapSize,
      radius: px(10),
      color: 0x1a1a1a
    });
    
    // 创建CANVAS widget用于地图渲染 - 直接传递给渲染器
    try {
      const mapCanvas = createWidget(widget.CANVAS, {
        x: mapX + px(5), // 稍微内缩，避免边界问题
        y: mapY + px(5),
        w: mapSize - px(10),
        h: mapSize - px(10)
      });
      
      // 创建小地图渲染器并渲染 - 传递已创建的canvas
      const renderer = new MiniMapRenderer(mapCanvas, mapSize - px(10), mapSize - px(10));
      renderer.padding = 0.1; // 适当的边距
      renderer.render(points);
      logger.debug(`地图渲染成功，共${points.length}个点`);
      
    } catch (e) {
      logger.error(`地图渲染失败: ${e}`);
      // 显示错误提示
      createWidget(widget.TEXT, {
        x: mapX,
        y: mapY,
        w: mapSize,
        h: mapSize,
        color: 0xff3b30,
        text_size: px(16),
        align_h: align.CENTER_H,
        align_v: align.CENTER_V,
        text: '地图渲染失败\n请返回重试'
      });
    }
    
    // 添加项目信息显示（在地图下方）
    const infoY = mapY + mapSize + px(10);
    if (infoY + px(25) < height - px(10)) {
      createWidget(widget.TEXT, {
        x: 0,
        y: infoY,
        w: width,
        h: px(25),
        color: 0xcccccc,
        text_size: px(12),
        align_h: align.CENTER_H,
        align_v: align.CENTER_V,
        text: `${this.data.project.name} - ${points.length}${getText('individual') || '个点'}`
      });
    }
  },
  
  /**
   * 构建错误状态
   */
  buildErrorState(width, height) {
    const startY = px(120);
    
    createWidget(widget.TEXT, {
      x: 0,
      y: startY,
      w: width,
      h: px(80),
      color: 0xff3b30,
      text_size: px(18),
      align_h: align.CENTER_H,
      align_v: align.CENTER_V,
      text: "无法加载项目数据\n请返回重试"
    });
    
    // 返回按钮
    createWidget(widget.BUTTON, {
      x: (width - px(120)) / 2,
      y: startY + px(100),
      w: px(120),
      h: px(40),
      radius: px(20),
      normal_color: 0x333333,
      press_color: 0x555555,
      text: getText('back') || '返回',
      text_size: px(16),
      color: 0xffffff,
      click_func: () => {
        try {
          back();
        } catch (e) {
          logger.error(`返回失败: ${e}`);
        }
      }
    });
  },
  
  /**
   * 页面销毁
   */
  onDestroy() {
    logger.debug("地图页面销毁");
  }
});