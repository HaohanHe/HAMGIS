/**
 * HAMGIS 数据导出管理器
 * 支持多种格式导出: CSV(汇总), CSV(详细), JSON, GeoJSON
 */

import { getText } from '@zos/i18n';
const logger = console

/**
 * 导出管理器类
 */
class ExportManager {
  constructor() {
    this.measurements = []
  }

  /**
   * 设置要导出的测量数据
   * @param {Array} measurements - 测量记录数组
   */
  setMeasurements(measurements) {
    if (!Array.isArray(measurements)) {
      logger.error('ExportManager: 无效的测量数据')
      return false
    }
    this.measurements = measurements
    return true
  }

  /**
   * 生成文件名
   * @param {string} format - 文件格式 (csv_summary, csv_detailed, json, geojson)
   * @returns {string} 文件名
   */
  generateFileName(format) {
    const now = new Date()
    const year = now.getFullYear()
    const month = String(now.getMonth() + 1).padStart(2, '0')
    const day = String(now.getDate()).padStart(2, '0')
    const hour = String(now.getHours()).padStart(2, '0')
    const minute = String(now.getMinutes()).padStart(2, '0')
    const second = String(now.getSeconds()).padStart(2, '0')
    
    const timestamp = `${year}${month}${day}_${hour}${minute}${second}`
    
    const formatNames = {
      'csv_summary': 'CSV项目汇总',
      'csv_detailed': 'CSV详细点位',
      'json': 'JSON完整数据',
      'geojson': 'GeoJSON标准'
    }
    
    const extensions = {
      'csv_summary': 'csv',
      'csv_detailed': 'csv',
      'json': 'json',
      'geojson': 'geojson'
    }
    
    const formatName = formatNames[format] || format
    const ext = extensions[format] || 'txt'
    
    return `HAMGIS_${formatName}_${timestamp}.${ext}`
  }

  /**
   * 导出为CSV格式 - 项目汇总（每个项目一行）
   * @returns {string} CSV内容
   */
  exportToCSVSummary() {
    try {
      logger.log('ExportManager: 开始导出CSV项目汇总')
      
      // CSV表头
      const headers = [
        'ID',
        getText('projectName'),
        getText('measurementTime') || '测量时间',
        `${getText('area')}(${getText('squareMeter')})`,
        `${getText('area')}(${getText('mu')})`,
        `${getText('area')}(${getText('hectare')})`,
        `${getText('perimeter')}(m)`,
        getText('points') || '采集点数',
        `${getText('accuracy')}(m)`,
        `${getText('avgAltitude')}(m)`,
        `${getText('maxAltitude')}(m)`,
        `${getText('minAltitude')}(m)`,
        `${getText('elevationRange') || '海拔高差'}(m)`,
        getText('status') || '状态'
      ]
      
      let csv = headers.join(',') + '\n'
      
      // 遍历每个测量项目
      this.measurements.forEach(measurement => {
        const {
          id = '',
          name = '未命名',
          timestamp = Date.now(),
          area = {},
          perimeter = 0,
          points = [],
          accuracy = 5,
          elevation = {},
          status = 'completed'
        } = measurement
        
        // 格式化时间
        const date = new Date(timestamp)
        const dateStr = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')} ${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`
        
        // 面积数据
        const sqm = area.squareMeters || 0
        const mu = area.mu || (sqm * 0.0015)
        const hectares = area.hectares || (sqm * 0.0001)
        
        // 海拔数据
        const avgAlt = elevation.average !== undefined ? elevation.average.toFixed(1) : ''
        const maxAlt = elevation.max !== undefined ? elevation.max.toFixed(1) : ''
        const minAlt = elevation.min !== undefined ? elevation.min.toFixed(1) : ''
        const rangeAlt = elevation.range !== undefined ? elevation.range.toFixed(1) : ''
        
        // 构建CSV行（处理可能包含逗号的字段）
        const row = [
          `"${id}"`,
          `"${name.replace(/"/g, '""')}"`,  // 转义双引号
          `"${dateStr}"`,
          sqm.toFixed(2),
          mu.toFixed(3),
          hectares.toFixed(4),
          perimeter.toFixed(2),
          points.length,
          accuracy,
          avgAlt,
          maxAlt,
          minAlt,
          rangeAlt,
          `"${status}"`
        ]
        
        csv += row.join(',') + '\n'
      })
      
      logger.log('ExportManager: CSV项目汇总导出成功')
      return csv
      
    } catch (e) {
      logger.error('ExportManager: 导出CSV项目汇总失败:', e)
      return null
    }
  }

  /**
   * 导出为CSV格式 - 详细点位（每个点一行）
   * @returns {string} CSV内容
   */
  exportToCSVDetailed() {
    try {
      logger.log('ExportManager: 开始导出CSV详细点位')
      
      // CSV表头
      const headers = [
        '项目ID',
        '项目名称',
        '点序号',
        '纬度',
        '经度',
        '海拔(米)',
        '采集时间',
        '项目面积(亩)',
        '项目状态'
      ]
      
      let csv = headers.join(',') + '\n'
      
      // 遍历每个测量项目
      this.measurements.forEach(measurement => {
        const {
          id = '',
          name = '未命名',
          points = [],
          area = {},
          status = 'completed'
        } = measurement
        
        const mu = area.mu || (area.squareMeters * 0.0015) || 0
        
        // 遍历每个采集点
        points.forEach((point, index) => {
          const {
            lat = 0,
            lon = 0,
            altitude = null,
            timestamp = null
          } = point
          
          // 格式化时间
          let timeStr = ''
          if (timestamp) {
            const date = new Date(timestamp)
            timeStr = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')} ${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}:${String(date.getSeconds()).padStart(2, '0')}`
          }
          
          // 海拔数据
          const altStr = altitude !== null ? altitude.toFixed(1) : ''
          
          // 构建CSV行
          const row = [
            `"${id}"`,
            `"${name.replace(/"/g, '""')}"`,
            index + 1,
            lat.toFixed(7),
            lon.toFixed(7),
            altStr,
            `"${timeStr}"`,
            mu.toFixed(3),
            `"${status}"`
          ]
          
          csv += row.join(',') + '\n'
        })
      })
      
      logger.log('ExportManager: CSV详细点位导出成功')
      return csv
      
    } catch (e) {
      logger.error('ExportManager: 导出CSV详细点位失败:', e)
      return null
    }
  }

  /**
   * 导出为JSON格式 - 完整数据结构
   * @returns {string} JSON内容
   */
  exportToJSON() {
    try {
      logger.log('ExportManager: 开始导出JSON完整数据')
      
      const exportData = {
        // 导出元数据
        metadata: {
          exportTime: new Date().toISOString(),
          exportTimestamp: Date.now(),
          version: '1.1.0',
          format: 'HAMGIS JSON Export',
          totalRecords: this.measurements.length,
          generator: 'HAMGIS 测亩软件'
        },
        
        // 统计信息
        statistics: this.calculateStatistics(),
        
        // 完整的测量数据
        measurements: this.measurements.map(m => ({
          ...m,
          // 添加导出标记
          _exported: true,
          _exportTime: new Date().toISOString()
        }))
      }
      
      const json = JSON.stringify(exportData, null, 2)
      
      logger.log('ExportManager: JSON完整数据导出成功')
      return json
      
    } catch (e) {
      logger.error('ExportManager: 导出JSON完整数据失败:', e)
      return null
    }
  }

  /**
   * 导出为GeoJSON格式 - GIS标准格式（符合RFC 7946）
   * @returns {string} GeoJSON内容
   */
  exportToGeoJSON() {
    try {
      logger.log('ExportManager: 开始导出GeoJSON标准格式')
      
      // GeoJSON FeatureCollection
      const geojson = {
        type: 'FeatureCollection',
        
        // 元数据（符合GeoJSON规范的扩展字段）
        metadata: {
          generated: new Date().toISOString(),
          generator: 'HAMGIS v1.1.0',
          count: this.measurements.length
        },
        
        // CRS坐标参考系统 - WGS84 (EPSG:4326)
        crs: {
          type: 'name',
          properties: {
            name: 'urn:ogc:def:crs:OGC:1.3:CRS84'
          }
        },
        
        // 特征数组
        features: []
      }
      
      // 遍历每个测量项目，转换为GeoJSON Feature
      this.measurements.forEach(measurement => {
        const {
          id = '',
          name = getText('unnamed') || '未命名',
          timestamp = Date.now(),
          points = [],
          area = {},
          perimeter = 0,
          accuracy = 5,
          elevation = {},
          status = 'completed'
        } = measurement
        
        // 检查点数是否足够构成多边形（至少3个点）
        if (points.length < 3) {
          logger.warn(`ExportManager: 项目 ${name} 点数不足，跳过`)
          return
        }
        
        // 构建坐标数组 [经度, 纬度, 海拔]
        // GeoJSON使用 [lon, lat] 顺序（注意与常规相反）
        const coordinates = points.map(point => {
          const coord = [point.lon, point.lat]
          // 如果有海拔数据，添加为第三维
          if (point.altitude !== null && point.altitude !== undefined) {
            coord.push(point.altitude)
          }
          return coord
        })
        
        // 闭合多边形（首尾点相同）
        if (coordinates.length > 0) {
          const firstPoint = coordinates[0]
          const lastPoint = coordinates[coordinates.length - 1]
          
          // 检查是否已闭合
          if (firstPoint[0] !== lastPoint[0] || firstPoint[1] !== lastPoint[1]) {
            coordinates.push([...firstPoint])
          }
        }
        
        // 构建GeoJSON Feature
        const feature = {
          type: 'Feature',
          
          // 几何对象 - Polygon
          geometry: {
            type: 'Polygon',
            coordinates: [coordinates]  // Polygon需要数组的数组
          },
          
          // 属性信息
          properties: {
            // 基本信息
            id: id,
            name: name,
            timestamp: timestamp,
            date: new Date(timestamp).toISOString(),
            status: status,
            
            // 测量数据
            area_sqm: area.squareMeters || 0,
            area_mu: area.mu || (area.squareMeters * 0.0015) || 0,
            area_hectares: area.hectares || (area.squareMeters * 0.0001) || 0,
            perimeter_m: perimeter,
            point_count: points.length,
            gps_accuracy_m: accuracy,
            
            // 海拔数据
            elevation_avg_m: elevation.average || null,
            elevation_max_m: elevation.max || null,
            elevation_min_m: elevation.min || null,
            elevation_range_m: elevation.range || null,
            
            // 元数据
            _generator: 'HAMGIS',
            _version: '1.1.0'
          }
        }
        
        geojson.features.push(feature)
      })
      
      const json = JSON.stringify(geojson, null, 2)
      
      logger.log('ExportManager: GeoJSON标准格式导出成功')
      return json
      
    } catch (e) {
      logger.error('ExportManager: 导出GeoJSON标准格式失败:', e)
      return null
    }
  }

  /**
   * 计算统计信息
   * @returns {Object} 统计数据
   */
  calculateStatistics() {
    const stats = {
      totalRecords: this.measurements.length,
      totalArea: {
        squareMeters: 0,
        mu: 0,
        hectares: 0
      },
      totalPerimeter: 0,
      totalPoints: 0,
      averageAccuracy: 0,
      elevation: {
        hasData: false,
        averageOfAverages: 0,
        globalMax: null,
        globalMin: null
      },
      dateRange: {
        earliest: null,
        latest: null
      }
    }
    
    if (this.measurements.length === 0) {
      return stats
    }
    
    let totalAccuracy = 0
    let elevationCount = 0
    let elevationSum = 0
    let timestamps = []
    
    this.measurements.forEach(m => {
      // 面积统计
      const area = m.area || {}
      const sqm = area.squareMeters || 0
      stats.totalArea.squareMeters += sqm
      stats.totalArea.mu += (area.mu || sqm * 0.0015)
      stats.totalArea.hectares += (area.hectares || sqm * 0.0001)
      
      // 周长统计
      stats.totalPerimeter += (m.perimeter || 0)
      
      // 点数统计
      stats.totalPoints += (m.points ? m.points.length : 0)
      
      // 精度统计
      totalAccuracy += (m.accuracy || 5)
      
      // 海拔统计
      if (m.elevation && m.elevation.average !== undefined) {
        stats.elevation.hasData = true
        elevationSum += m.elevation.average
        elevationCount++
        
        if (m.elevation.max !== undefined) {
          if (stats.elevation.globalMax === null || m.elevation.max > stats.elevation.globalMax) {
            stats.elevation.globalMax = m.elevation.max
          }
        }
        
        if (m.elevation.min !== undefined) {
          if (stats.elevation.globalMin === null || m.elevation.min < stats.elevation.globalMin) {
            stats.elevation.globalMin = m.elevation.min
          }
        }
      }
      
      // 时间统计
      timestamps.push(m.timestamp)
    })
    
    // 计算平均值
    stats.averageAccuracy = totalAccuracy / this.measurements.length
    
    if (elevationCount > 0) {
      stats.elevation.averageOfAverages = elevationSum / elevationCount
    }
    
    // 时间范围
    timestamps.sort((a, b) => a - b)
    stats.dateRange.earliest = new Date(timestamps[0]).toISOString()
    stats.dateRange.latest = new Date(timestamps[timestamps.length - 1]).toISOString()
    
    return stats
  }

  /**
   * 触发文件下载（浏览器环境）
   * @param {string} content - 文件内容
   * @param {string} filename - 文件名
   * @param {string} mimeType - MIME类型
   */
  triggerDownload(content, filename, mimeType) {
    try {
      // 创建Blob对象
      const blob = new Blob([content], { type: mimeType })
      
      // 创建下载链接
      const url = URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      link.download = filename
      
      // 触发下载
      document.body.appendChild(link)
      link.click()
      
      // 清理
      document.body.removeChild(link)
      URL.revokeObjectURL(url)
      
      logger.log('ExportManager: 文件下载触发成功:', filename)
      return true
      
    } catch (e) {
      logger.error('ExportManager: 触发文件下载失败:', e)
      return false
    }
  }

  /**
   * 导出并下载文件
   * @param {string} format - 导出格式
   * @returns {boolean} 是否成功
   */
  exportAndDownload(format) {
    try {
      let content = null
      let mimeType = 'text/plain'
      
      // 根据格式生成内容
      switch (format) {
        case 'csv_summary':
          content = this.exportToCSVSummary()
          mimeType = 'text/csv;charset=utf-8;'
          break
          
        case 'csv_detailed':
          content = this.exportToCSVDetailed()
          mimeType = 'text/csv;charset=utf-8;'
          break
          
        case 'json':
          content = this.exportToJSON()
          mimeType = 'application/json;charset=utf-8;'
          break
          
        case 'geojson':
          content = this.exportToGeoJSON()
          mimeType = 'application/geo+json;charset=utf-8;'
          break
          
        default:
          logger.error('ExportManager: 不支持的导出格式:', format)
          return false
      }
      
      if (!content) {
        logger.error('ExportManager: 生成导出内容失败')
        return false
      }
      
      // 生成文件名
      const filename = this.generateFileName(format)
      
      // 触发下载
      return this.triggerDownload(content, filename, mimeType)
      
    } catch (e) {
      logger.error('ExportManager: 导出并下载失败:', e)
      return false
    }
  }
}

// 创建全局单例（用于浏览器环境）
const exportManager = new ExportManager()

// 将导出管理器挂载到全局对象
if (typeof window !== 'undefined') {
  window.exportManager = exportManager
  window.ExportManager = ExportManager
}

// 同时支持ES6模块导出（用于测试环境）
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { exportManager, ExportManager }
}
