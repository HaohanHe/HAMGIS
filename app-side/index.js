import { BaseSideService } from '@zeppos/zml/base-side'

const logger = console

AppSideService(
  BaseSideService({
    onInit() {
      logger.log('Side Service Init')
    },

    onRequest(req, res) {
      logger.log('Received request from device:', req.method)
      
      if (req.method === 'exportData') {
        const dataStr = req.params.data
        this.forwardToAndroid(dataStr, res)
      } else {
        res(null, { status: 'unknown_method' })
      }
    },

    forwardToAndroid(data, res) {
      // Android HTTP Server URL (Localhost on the phone)
      // Note: "127.0.0.1" in Side Service usually refers to the phone's loopback interface
      // because the Side Service runs inside the Zepp App on the phone.
      const url = 'http://127.0.0.1:8888/data'
      
      fetch({
        url: url,
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ postData: data })
      })
      .then((response) => {
        logger.log('Forward Success:', response.status)
        if (response.status === 200) {
           res(null, { status: 'success' })
        } else {
           res(null, { status: 'http_error', code: response.status })
        }
      })
      .catch((error) => {
        logger.error('Forward Error:', error)
        res(null, { status: 'network_error', msg: error.message })
      })
    },

    onRun() {
      logger.log('Side Service Running')
    },

    onDestroy() {
      logger.log('Side Service Destroy')
    }
  })
)
