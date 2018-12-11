const request = require("request-promise")
const zlib = require('zlib')
const Sensor = require("./Sensor")
const Spout = require("./Spout")

const ROOT_URL = "https://api.limacharlie.io"
const API_VERSION = "v1"

const HTTP_UNAUTHORIZED = 401
const HTTP_BAD_REQUEST = 400

class Manager {
  constructor(oid, secretApiKey, invId, isInteractive, jwt, onAuthFailure, onError) {
    this._oid = oid
    this._secretApiKey = secretApiKey
    this._jwt = jwt
    this._invId = invId
    this._isInteractive = isInteractive
    if(this._isInteractive && !this._invId) {
      throw new Error("Investigation ID must be set for interactive mode to be eneabled.")
    }
    this._spout = null
    this._lastContinuationToken = null
    // If the onAuthFailure callback is set, the internal renewal of
    // the JWT using the API key is disable. We assume the callback is
    // responsible for updating the JWT and setting it in manager._jwt.
    // The async callback receives no parameters, a reference to
    // this Manager. After callback, the API call will automatically
    // be retried like the normal API Key based behavior.
    this.onAuthFailure = onAuthFailure
    this.onError = onError

    if(this._isInteractive) {
      this.refreshSpout()
    }
  }

  async _refreshJWT() {
    try{
      if(!this._secretApiKey) {
        throw new Error("API key not set.")
      }
      const data = await request(`https://app.limacharlie.io/jwt?oid=${this._oid}&secret=${this._secretApiKey}`, {json: true})
      this._jwt = data.jwt
      return true
    } catch(e) {
      this._jwt = null
      // eslint-disable-next-line no-console
      console.error(`Failed to refresh the JWT: ${e}`)
      return false
    }
  }

  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  _restCall(url, verb, params) {
    if(!params) {
      params = {}
    }
    let req = {
      headers: {
        Authorization: `bearer ${this._jwt}`
      },
      method: verb,
      qsStringifyOptions: {arrayFormat: "repeat"},
      json: true,
    }
    if(verb === "GET") {
      req[ "qs" ] = params
    } else {
      req[ "form" ] = params
    }
    return request(`${ROOT_URL}/${API_VERSION}/${url}`, req)
  }

  async _apiCall(url, verb, params, isNoRetry, isThrowError) {
    if(!this._jwt) {
      await this._refreshJWT()
    }

    try {
      return await this._restCall(url, verb, params)
    } catch(e) {
      let errMessage = null
      if(e.error && e.error.error) {
        errMessage = e.error.error
      } else {
        errMessage = e.toString()
      }
      if(e.statusCode === HTTP_UNAUTHORIZED && !isNoRetry) {
        if(this.onAuthFailure) {
          await this.onAuthFailure()
        } else {
          await this._refreshJWT()
        }
        return this._apiCall(url, verb, params, true)
      } else if(e.statusCode === HTTP_BAD_REQUEST && !isNoRetry) {
        if(errMessage.includes("quota")) {
          await this.sleep(5 * 1000)
          return this._apiCall(url, verb, params, false)
        }
      }

      if(this.onError) {
        this.onError(errMessage)
      }

      if(isThrowError) {
        throw new Error(errMessage)
      }
    }
  }

  async _unzip(data) {
    return new Promise(function(resolve, reject) {
      zlib.unzip(data, (err, buffer) => {
        if(err) {
          return reject(err)
        }
        resolve(buffer.toString())
      })
    })
  }

  refreshSpout() {
    if(!this._isInteractive) {
      return
    }

    // We use a temporary variable so we can do a hot swap and never
    // be without an active spout.
    let tmpSpout = this._spout
    this._spout = new Spout(this, "event", null, null, this._invId, null, null, null)

    if(tmpSpout) {
      // Move over the registrations in the previous spout to the new one.
      this._spout._specificCallbacks = tmpSpout._specificCallbacks

      // Now we can close it down safely.
      tmpSpout.shutdown()
      tmpSpout = null
    }
  }

  testAuth() {
    return this._refreshJWT()
  }

  sensor(sid, invId) {
    let s = new Sensor(this, sid)
    if(invId) {
      s.setInvId(invId)
    } else if(this._invId) {
      s.setInvId(this._invId)
    }
    return s
  }

  async sensors(invId, isNext) {
    let params = {}
    if(isNext) {
      if(!this._lastContinuationToken) {
        return []
      }
      params["continuation_token"] = this._lastContinuationToken
      this._lastContinuationToken = null
    }

    const data = await this._apiCall(`sensors/${this._oid}`, "GET", params)

    if(data.continuation_token) {
      this._lastContinuationToken = data.continuation_token
    }

    let thisInv = invId
    if(!thisInv) {
      thisInv = this._invId
    }

    return data.sensors.map(s => {
      return this.sensor(s.sid, thisInv)
    })
  }

  async getAvailableEvents() {
    return (await this._apiCall("events", "GET")).events
  }

  async getAutoComplete() {
    return await this._apiCall("autocomplete/task", "GET")
  }

  async isInsightEnabled() {
    let insightConfig = await this._apiCall(`insight/${this._oid}`, "GET")
    if("insight_bucket" in insightConfig && insightConfig["insight_bucket"]) {
      return true
    }
    return false
  }

  async getHistoricDetections(params) {
    if(!params) {
      params = {}
    }
    params["is_compressed"] = "true"
    let data = await this._apiCall(`insight/${this._oid}/detections`, "GET", params)
    data.events = await this._unzip(Buffer.from(data.detects, "base64"))
    data.events = JSON.parse(data.events)
    return data.events
  }

  async getObjectInformation(objType, objName, params) {
    if(!params) {
      params = {}
    }
    params["name"] = objName
    let data = await this._apiCall(`insight/${this._oid}/objects/${objType}`, "GET", params)
    return data
  }

  async getObjectBatchInformation(objects, params) {
    if(!params) {
      params = {}
    }
    params["objects"] = JSON.stringify(objects)
    let data = await this._apiCall(`insight/${this._oid}/objects`, "POST", params)
    return data
  }

  async getObjectBaseline() {
    let winBin = "ntdll.dll"
    let macBin = "launchd"
    let objects = await this.getObjectBatchInformation({
      file_name: [
        winBin,
        macBin,
      ]
    })
    return {
      windows:{last_1_days: objects.last_1_days.file_name[winBin], last_7_days: objects.last_7_days.file_name[winBin], last_30_days: objects.last_30_days.file_name[winBin]},
      mac:{last_1_days: objects.last_1_days.file_name[macBin], last_7_days: objects.last_7_days.file_name[macBin], last_30_days: objects.last_30_days.file_name[macBin]},
    }
  }

  async getTrafficBreakdown(start, end) {
    let data = await this._apiCall(`insight/${this._oid}/traffic/breakdown`, "GET", {
      start: start,
      end: end,
    })
    return data
  }

  async getTrafficStats(start, end, sid) {
    let params = {
      start: start,
      end: end,
    }
    if(sid) {
      params["sid"] = sid
    }
    let data = await this._apiCall(`insight/${this._oid}/traffic/stats`, "GET", params)
    return data
  }

  async getDetectBreakdown(start, end) {
    let data = await this._apiCall(`insight/${this._oid}/detections/breakdown`, "GET", {
      start: start,
      end: end,
    })
    return data
  }

  async getDetectStats(start, end, sid) {
    let params = {
      start: start,
      end: end,
    }
    if(sid) {
      params["sid"] = sid
    }
    let data = await this._apiCall(`insight/${this._oid}/detections/stats`, "GET", params)
    return data
  }
}

module.exports = Manager
