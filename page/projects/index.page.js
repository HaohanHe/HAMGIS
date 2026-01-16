import { log, px } from "@zos/utils";
import { createWidget, widget, align, prop, event, text_style } from '@zos/ui';
import { getDeviceInfo } from "@zos/device";
import { getText } from '@zos/i18n';
import { localStorage } from '@zos/storage';
import { Vibrator } from '@zos/sensor';
import { push } from '@zos/router';

const logger = log.getLogger("hamgis-projects");
const vibrator = new Vibrator();

Page({
  data: {
    measurements: [],
    scrollList: null,
    detailDialog: null,
    selectedProject: null,
    canvasWidget: null
  },

  // 加载项目列表
  loadProjects() {
    try {
      const stored = localStorage.getItem('hamgis_measurements');
      if (stored) {
        const measurements = JSON.parse(stored);
        if (Array.isArray(measurements)) {
          // 数据迁移：为旧数据添加elevation字段
          this.data.measurements = measurements.map(project => {
            if (project.elevation === undefined) {
              // 计算海拔统计
              const elevation = this.calculateElevationFromPoints(project.points);
              return { ...project, elevation };
            }
            return project;
          });
          
          // 保存迁移后的数据
          localStorage.setItem('hamgis_measurements', JSON.stringify(this.data.measurements));
          
          // 按时间倒序排列
          this.data.measurements.sort((a, b) => b.timestamp - a.timestamp);
        } else {
          this.data.measurements = [];
        }
      } else {
        this.data.measurements = [];
      }
      
      logger.debug(`加载了 ${this.data.measurements.length} 个项目`);
    } catch (e) {
      logger.error(`加载项目失败: ${e}`);
      this.data.measurements = [];
    }
  },
  
  // 从点数据计算海拔统计（用于数据迁移）
  calculateElevationFromPoints(points) {
    if (!points || points.length === 0) {
      return null;
    }
    
    // 检查是否有海拔数据
    const altitudes = points
      .map(p => p.altitude)
      .filter(a => a !== null && a !== undefined && !isNaN(a));
    
    if (altitudes.length === 0) {
      return null;
    }
    
    const sum = altitudes.reduce((a, b) => a + b, 0);
    const max = Math.max(...altitudes);
    const min = Math.min(...altitudes);
    
    return {
      average: Math.round(sum / altitudes.length),
      max: Math.round(max),
      min: Math.round(min),
      range: Math.round(max - min)
    };
  },

  // 删除项目
  deleteProject(index) {
    try {
      const pageInstance = this;
      
      if (index < 0 || index >= pageInstance.data.measurements.length) {
        return;
      }
      
      // 震动反馈（短促两次）
      vibrator.stop();
      vibrator.start();
      setTimeout(() => {
        vibrator.stop();
        setTimeout(() => {
          vibrator.start();
          setTimeout(() => vibrator.stop(), 50);
        }, 50);
      }, 50);
      
      // 从数组中移除
      pageInstance.data.measurements.splice(index, 1);
      
      // 保存到localStorage
      localStorage.setItem('hamgis_measurements', JSON.stringify(pageInstance.data.measurements));
      
      logger.debug(`删除项目成功，剩余 ${pageInstance.data.measurements.length} 个`);
      
      // 重新构建列表
      pageInstance.rebuildList();
    } catch (e) {
      logger.error(`删除项目失败: ${e}`);
    }
  },

  // 显示项目详情
  showProjectDetail(project) {
    try {
      const pageInstance = this;
      pageInstance.data.selectedProject = project;
      
      // 震动反馈
      vibrator.stop();
      vibrator.start();
      setTimeout(() => vibrator.stop(), 50);
      
      logger.debug(`显示项目详情: ${project.name}`);
      
      // 跳转到详情页面
      push({
        url: 'page/project-detail/index.page',
        params: JSON.stringify(project)
      });
    } catch (e) {
      logger.error(`显示项目详情失败: ${e}`);
    }
  },

  // 格式化面积
  formatArea(area) {
    if (!area) return `0.00${getText('mu')}`;
    const mu = area.mu || (area.squareMeters * 0.0015);
    return `${mu.toFixed(2)}${getText('mu')}`;
  },

  // 格式化日期
  formatDate(timestamp) {
    const date = new Date(timestamp);
    const month = (date.getMonth() + 1).toString().padStart(2, '0');
    const day = date.getDate().toString().padStart(2, '0');
    const hours = date.getHours().toString().padStart(2, '0');
    const minutes = date.getMinutes().toString().padStart(2, '0');
    return `${month}/${day} ${hours}:${minutes}`;
  },

  // 重新构建列表
  rebuildList() {
    const pageInstance = this;
    
    // 删除旧列表
    if (pageInstance.data.scrollList) {
      try {
        pageInstance.data.scrollList.clear();
      } catch (e) {
        logger.error(`清除列表失败: ${e}`);
      }
    }
    
    // 重新加载数据
    pageInstance.loadProjects();
    
    // 重新构建UI
    pageInstance.buildList();
  },

  // 构建列表
  buildList() {
    const pageInstance = this;
    const deviceInfo = getDeviceInfo();
    const { width, height } = deviceInfo;
    
    if (pageInstance.data.measurements.length === 0) {
      // 显示空状态
      createWidget(widget.TEXT, {
        x: 0,
        y: height / 2 - px(40),
        w: width,
        h: px(80),
        color: 0x666666,
        text_size: px(24),
        align_h: align.CENTER_H,
        align_v: align.CENTER_V,
        text: "暂无项目\n开始测量创建第一个项目"
      });
      return;
    }
    
    // 创建滚动列表
    const listData = pageInstance.data.measurements.map((project, index) => {
      const points = project.points ? project.points.length : 0;
      const area = pageInstance.formatArea(project.area);
      const date = pageInstance.formatDate(project.timestamp);
      
      return {
        name: project.name || `项目${index + 1}`,
        area: area,
        date: date,
        points: points,
        index: index
      };
    });
    
    pageInstance.data.scrollList = createWidget(widget.SCROLL_LIST, {
      x: 0,
      y: px(80),
      w: width,
      h: height - px(80),
      item_height: px(100),
      item_count: listData.length,
      item_click_func: (list, index) => {
        try {
          const project = pageInstance.data.measurements[index];
          pageInstance.showProjectDetail(project);
        } catch (e) {
          logger.error(`点击项目失败: ${e}`);
        }
      },
      item_config_func: (item, index) => {
        try {
          const data = listData[index];
          
          // 主内容区域背景 (M3 Card Style)
          item.bg = createWidget(widget.FILL_RECT, {
            x: px(10),
            y: px(5),
            w: width - px(20),
            h: px(90),
            color: 0x1c1b1f, // M3 Surface
            radius: px(24)   // Increased radius
          });
          
          // 项目名称
          item.nameText = createWidget(widget.TEXT, {
            x: px(20),
            y: px(10),
            w: width - px(120),
            h: px(25),
            color: 0xffffff,
            text_size: px(20),
            align_h: align.LEFT,
            text_style: text_style.BOLD,
            text: data.name
          });
          
          // 面积显示
          item.areaText = createWidget(widget.TEXT, {
            x: px(20),
            y: px(40),
            w: px(120),
            h: px(20),
            color: 0x80caff, // Blue Accent
            text_size: px(16),
            align_h: align.LEFT,
            text: data.area
          });
          
          // 点数显示
          item.pointsText = createWidget(widget.TEXT, {
            x: px(150),
            y: px(40),
            w: px(80),
            h: px(20),
            color: 0xcccccc,
            text_size: px(14),
            align_h: align.LEFT,
            text: `${data.points}${getText('individual') || '个点'}`
          });
          
          // 日期显示
          item.dateText = createWidget(widget.TEXT, {
            x: px(20),
            y: px(65),
            w: width - px(120),
            h: px(20),
            color: 0x888888,
            text_size: px(12),
            align_h: align.LEFT,
            text: data.date
          });
          
          // 删除按钮（右侧） - M3 Style
          item.deleteBtn = createWidget(widget.BUTTON, {
            x: width - px(90),
            y: px(25),
            w: px(70),
            h: px(50),
            radius: px(25),
            normal_color: 0x2b2d31, // Dark Surface
            press_color: 0x3e4248,
            text: "删除",
            text_size: px(14),
            color: 0xffb4ab, // M3 Error Container Text (Light Red)
            click_func: () => {
              pageInstance.deleteProject(data.index);
            }
          });
        } catch (e) {
          logger.error(`配置列表项失败: ${e}`);
        }
      }
    });
  },

  onInit() {
    logger.debug("项目管理页面初始化");
    this.loadProjects();
  },

  build() {
    logger.debug("构建项目管理页面UI");
    
    const deviceInfo = getDeviceInfo();
    const { width, height } = deviceInfo;
    
    // 背景
    createWidget(widget.FILL_RECT, {
      x: 0,
      y: 0,
      w: width,
      h: height,
      color: 0x000000
    });
    
    // 标题栏
    createWidget(widget.FILL_RECT, {
      x: 0,
      y: 0,
      w: width,
      h: px(80),
      color: 0x1a1a1a
    });
    
    // 标题文字
    createWidget(widget.TEXT, {
      x: 0,
      y: px(15),
      w: width,
      h: px(30),
      color: 0xffffff,
      text_size: px(24),
      align_h: align.CENTER_H,
      align_v: align.CENTER_V,
      text_style: text_style.BOLD,
      text: "项目管理"
    });
    
    // 项目统计
    const totalArea = this.data.measurements.reduce((sum, p) => {
      return sum + (p.area ? p.area.mu : 0);
    }, 0);
    
    const statsText = `共 ${this.data.measurements.length} 个项目 | 总面积 ${totalArea.toFixed(2)}${getText('mu')}`;
    createWidget(widget.TEXT, {
      x: 0,
      y: px(50),
      w: width,
      h: px(25),
      color: 0x888888,
      text_size: px(14),
      align_h: align.CENTER_H,
      align_v: align.CENTER_V,
      text: statsText
    });
    
    // 构建列表
    this.buildList();
  },

  onDestroy() {
    logger.debug("项目管理页面销毁");
    
    // 清理资源
    if (this.data.scrollList) {
      try {
        this.data.scrollList.clear();
      } catch (e) {
        logger.error(`清理列表失败: ${e}`);
      }
    }
  }
});
