import { createWidget, widget, align, text_style, prop } from '@zos/ui'
import { back } from '@zos/router'
import { LocalStorage } from '@zos/storage'
import { onKey, KEY_SHORTCUT, KEY_BACK, KEY_EVENT_CLICK } from '@zos/interaction'
import { getText } from '@zos/i18n'
import { log } from '@zos/utils'

const logger = log.getLogger("hamgis-data-view")

const localStorage = new LocalStorage()

Page({
  build() {
    // 标题
    createWidget(widget.TEXT, {
      x: 0,
      y: 80,
      w: 480,
      h: 60,
      text: getText('measurementData') || '📊 测量数据',
      text_size: 36,
      color: 0xffffff,
      align_h: align.CENTER_H,
      text_style: text_style.WRAP
    })

    // 提示文字
    createWidget(widget.TEXT, {
      x: 40,
      y: 160,
      w: 400,
      h: 200,
      text: getText('dataSavedHint') || '数据已保存在手表中\n\n请在手机端Zepp App中\n打开应用设置\n查看和导出数据',
      text_size: 24,
      color: 0xcccccc,
      align_h: align.CENTER_H,
      text_style: text_style.WRAP
    })

    // 读取数据统计
    try {
      const projectsJson = localStorage.getItem('hamgis_projects')
      const projects = projectsJson ? JSON.parse(projectsJson) : []
      
      const totalCount = projects.length
      let totalArea = 0
      
      projects.forEach(project => {
        if (project.area && project.area.mu) {
          totalArea += project.area.mu
        }
      })

      // 显示统计
      createWidget(widget.TEXT, {
        x: 40,
        y: 380,
        w: 400,
        h: 40,
        text: `测量次数: ${totalCount}`,
        text_size: 28,
        color: 0x00ff00,
        align_h: align.CENTER_H
      })

      createWidget(widget.TEXT, {
        x: 40,
        y: 430,
        w: 400,
        h: 40,
        text: `${getText('area')}: ${totalArea.toFixed(2)} ${getText('mu')}`,
        text_size: 28,
        color: 0x00ff00,
        align_h: align.CENTER_H
      })
    } catch (e) {
      console.log('读取数据失败:', e)
    }

    // 返回按钮
    createWidget(widget.BUTTON, {
      x: 140,
      y: 520,
      w: 200,
      h: 60,
      text: '返回',
      radius: 30,
      normal_color: 0x333333,
      press_color: 0x555555,
      color: 0xffffff,
      text_size: 28,
      click_func: () => {
        push({ url: 'page/measurement/index.page' })
      }
    })

    // 说明文字
    createWidget(widget.TEXT, {
      x: 40,
      y: 600,
      w: 400,
      h: 100,
      text: getText('exportFormatsHint') || '💡 提示:\n手机端可以导出为\nCSV、JSON、GeoJSON格式',
      text_size: 20,
      color: 0x888888,
      align_h: align.CENTER_H,
      text_style: text_style.WRAP
    })
    
    // 注册按键监听
    // 下键(Shortcut/Back): 返回功能 - 全局可用
    onKey({
      callback: (key, keyEvent) => {
        if (keyEvent === KEY_EVENT_CLICK) {
          // 下键：返回首页 - 全局可用
          if (key === KEY_SHORTCUT || key === KEY_BACK) {
            logger.debug(`Shortcut/Back key triggered back: ${key}`);
            // 执行返回操作
            back();
            return true; // 拦截按键事件
          }
        }
        return false;
      }
    });
  }
})
