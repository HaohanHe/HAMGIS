import { messaging } from '@zos/ble'
import { localStorage } from '@zos/storage'
import { settingsLib } from '@zeppos/zml/base-side'

const logger = console

AppSideService({
  onInit() {
    logger.log('HAMGIS伴生服务初始化')
    
    try {
      // 监听来自设备的消息
      messaging.peerSocket.addListener('message', (payload) => {
        try {
          const message = JSON.parse(Buffer.from(payload).toString('utf-8'))
          logger.log('收到设备消息:', message.type)
          
          switch (message.type) {
            case 'exportMeasurements':
              this.handleExportMeasurements(message.data)
              break
            case 'syncSettings':
              this.handleSyncSettings(message.data)
              break
            default:
              logger.warn('未知消息类型:', message.type)
          }
        } catch (e) {
          logger.error('解析设备消息失败:', e)
        }
      })

      // 监听Settings App的settingsStorage变化
      settingsLib.addListener('change', async ({ key, newValue }) => {
        logger.log('settingsStorage changed:', key, newValue)
        
        try {
          // 处理导出操作
          if (key === 'export_action' && newValue) {
            const exportAction = JSON.parse(newValue)
            await this.handleExport(exportAction)
            // 清除action标记，避免重复触发
            settingsLib.removeItem('export_action')
          }
          
          // 处理查看操作
          if (key === 'view_action' && newValue) {
            const viewAction = JSON.parse(newValue)
            await this.handleView(viewAction)
            // 清除action标记
            settingsLib.removeItem('view_action')
          }
          
          // 处理清除操作
          if (key === 'clear_action' && newValue) {
            const clearAction = JSON.parse(newValue)
            await this.handleClear(clearAction)
            // 清除action标记
            settingsLib.removeItem('clear_action')
          }
          
          // 处理导出格式设置变化
          if (key === 'export_format' && newValue) {
            logger.log('Export format changed to:', newValue)
          }
          
          // 处理自动同步设置变化
          if (key === 'auto_sync' && newValue) {
            logger.log('Auto sync changed to:', newValue)
          }
          
          // 处理显示海拔设置变化
          if (key === 'show_elevation' && newValue) {
            logger.log('Show elevation changed to:', newValue)
          }
        } catch (e) {
          logger.error('处理settingsStorage变化失败:', e)
        }
      })
      
    } catch (e) {
      logger.error('伴生服务初始化失败:', e)
    }
  },

  onRun() {
    logger.log('HAMGIS伴生服务运行')
  },

  onDestroy() {
    logger.log('HAMGIS伴生服务销毁')
  },

  // 处理导出操作
  async handleExport(exportAction) {
    logger.log('开始处理导出:', exportAction.format)
    
    try {
      const measurements = this.getMeasurements()
      
      if (!measurements || measurements.length === 0) {
        logger.warn('没有可导出的数据')
        return
      }
      
      let content = null
      let filename = null
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, -5)
      
      switch (exportAction.format) {
        case 'csv_summary':
          content = this.exportToCSVSummary(measurements)
          filename = `HAMGIS_CSV摘要_${timestamp}.csv`
          break
        case 'csv_detailed':
          content = this.exportToCSVDetailed(measurements)
          filename = `HAMGIS_CSV详细_${timestamp}.csv`
          break
        case 'json':
          content = this.exportToJSON(measurements)
          filename = `HAMGIS_JSON_${timestamp}.json`
          break
        case 'geojson':
          content = this.exportToGeoJSON(measurements)
          filename = `HAMGIS_GeoJSON_${timestamp}.geojson`
          break
        default:
          logger.error('不支持的导出格式:', exportAction.format)
          return
      }
      
      if (content) {
        logger.log('导出成功:', filename, '大小:', content.length, 'bytes')
      }
    } catch (e) {
      logger.error('导出失败:', e)
    }
  },

  // 处理查看操作
  async handleView(viewAction) {
    logger.log('处理查看操作:', viewAction.action)
    
    try {
      if (viewAction.action === 'view_projects') {
        const measurements = this.getMeasurements()
        logger.log('项目列表:', measurements.length, '个项目')
      } else if (viewAction.action === 'view_statistics') {
        const stats = this.calculateStatistics()
        logger.log('统计信息:', stats)
      }
    } catch (e) {
      logger.error('处理查看操作失败:', e)
    }
  },

  // 处理清除操作
  async handleClear(clearAction) {
    logger.log('处理清除操作:', clearAction.action)
    
    try {
      if (clearAction.action === 'clear_all') {
        localStorage.removeItem('hamgis_measurements')
        logger.log('所有数据已清除')
      }
    } catch (e) {
      logger.error('处理清除操作失败:', e)
    }
  },

  // 处理测量数据导出
  handleExportMeasurements(measurements) {
    logger.log('开始处理测量数据导出，记录数:', measurements.length)
    
    if (!messaging.peerSocket.connected) {
      logger.warn('蓝牙连接未建立')
      return
    }
    
    try {
      if (!Array.isArray(measurements)) {
        logger.error('导出数据格式无效')
        return
      }
      
      let existingData = []
      try {
        const stored = localStorage.getItem('hamgis_measurements')
        if (stored) {
          const parsed = JSON.parse(stored)
          if (Array.isArray(parsed)) {
            existingData = parsed
          }
        }
      } catch (e) {
        logger.error('读取现有数据失败:', e)
      }
      
      const mergedData = [...existingData]
      let newRecords = 0
      
      measurements.forEach(newMeasurement => {
        if (!newMeasurement || !newMeasurement.id) {
          return
        }
        
        const exists = existingData.find(existing => existing.id === newMeasurement.id)
        if (!exists) {
          mergedData.push(newMeasurement)
          newRecords++
        }
      })
      
      localStorage.setItem('hamgis_measurements', JSON.stringify(mergedData))
      
      this.sendMessageToDevice({
        type: 'exportComplete',
        success: true,
        totalRecords: mergedData.length,
        newRecords: newRecords
      })
      
      logger.log('测量数据导出完成，总记录数:', mergedData.length, '新增:', newRecords)
      
    } catch (e) {
      logger.error('处理测量数据导出失败:', e)
    }
  },

  // 获取手机端存储的数据
  getMeasurements() {
    try {
      const stored = localStorage.getItem('hamgis_measurements')
      if (stored) {
        const measurements = JSON.parse(stored)
        if (Array.isArray(measurements)) {
          return measurements
        }
      }
      return []
    } catch (e) {
      logger.error('获取测量数据失败:', e)
      return []
    }
  },

  // 导出为CSV摘要格式
  exportToCSVSummary(measurements) {
    try {
      let csv = 'ID,名称,时间,面积(亩),面积(平方米),面积(公顷),周长(米),点数,精度(米),平均海拔(米)\n'
      
      measurements.forEach(m => {
        const date = new Date(m.timestamp).toLocaleString('zh-CN')
        const area = m.area || {}
        const mu = area.mu || (area.squareMeters * 0.0015)
        const sqm = area.squareMeters || 0
        const hectares = area.hectares || (area.squareMeters * 0.0001)
        const perimeter = m.perimeter || 0
        const points = m.points ? m.points.length : 0
        const accuracy = m.accuracy || 5
        const avgAlt = m.elevation && m.elevation.average ? m.elevation.average.toFixed(1) : ''
        
        csv += `"${m.id}","${m.name || ''}","${date}",${mu.toFixed(3)},${sqm.toFixed(1)},${hectares.toFixed(4)},${perimeter.toFixed(1)},${points},${accuracy},${avgAlt}\n`
      })
      
      return csv
    } catch (e) {
      logger.error('导出CSV摘要失败:', e)
      return null
    }
  },

  // 导出为CSV详细格式
  exportToCSVDetailed(measurements) {
    try {
      let csv = '项目ID,项目名称,点序号,纬度,经度,海拔(米),采集时间\n'
      
      measurements.forEach(m => {
        const points = m.points || []
        points.forEach((point, index) => {
          const timeStr = point.timestamp ? new Date(point.timestamp).toLocaleString('zh-CN') : ''
          const altStr = point.altitude !== null ? point.altitude.toFixed(1) : ''
          
          csv += `"${m.id}","${m.name || ''}",${index + 1},${point.lat.toFixed(7)},${point.lon.toFixed(7)},${altStr},"${timeStr}"\n`
        })
      })
      
      return csv
    } catch (e) {
      logger.error('导出CSV详细失败:', e)
      return null
    }
  },

  // 导出为JSON格式
  exportToJSON(measurements) {
    try {
      const exportData = {
        metadata: {
          exportTime: new Date().toISOString(),
          version: '1.0.1',
          totalRecords: measurements.length
        },
        measurements: measurements
      }
      return JSON.stringify(exportData, null, 2)
    } catch (e) {
      logger.error('导出JSON失败:', e)
      return null
    }
  },

  // 导出为GeoJSON格式
  exportToGeoJSON(measurements) {
    try {
      const geojson = {
        type: 'FeatureCollection',
        features: []
      }
      
      measurements.forEach(m => {
        if (!m.points || m.points.length < 3) return
        
        const coordinates = m.points.map(p => [p.lon, p.lat, p.altitude || 0])
        if (coordinates.length > 0) {
          coordinates.push([...coordinates[0]])
        }
        
        geojson.features.push({
          type: 'Feature',
          geometry: {
            type: 'Polygon',
            coordinates: [coordinates]
          },
          properties: {
            id: m.id,
            name: m.name,
            area_mu: m.area ? m.area.mu : 0,
            perimeter_m: m.perimeter || 0
          }
        })
      })
      
      return JSON.stringify(geojson, null, 2)
    } catch (e) {
      logger.error('导出GeoJSON失败:', e)
      return null
    }
  },

  // 计算统计信息
  calculateStatistics() {
    const measurements = this.getMeasurements()
    
    return {
      totalRecords: measurements.length,
      totalArea: measurements.reduce((sum, m) => sum + (m.area ? m.area.squareMeters : 0), 0),
      totalPoints: measurements.reduce((sum, m) => sum + (m.points ? m.points.length : 0), 0)
    }
  },

  // 发送消息到设备
  sendMessageToDevice(message) {
    try {
      if (!messaging.peerSocket.connected) {
        logger.warn('蓝牙连接未建立，无法发送消息')
        return
      }
      
      const messageBuffer = Buffer.from(JSON.stringify(message), 'utf-8')
      messaging.peerSocket.send(messageBuffer.buffer)
      logger.log('发送消息到设备:', message.type)
    } catch (e) {
      logger.error('发送消息到设备失败:', e)
    }
  }
});
